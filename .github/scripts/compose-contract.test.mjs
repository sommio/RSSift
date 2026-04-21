import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const composeText = readFileSync(join(repoRoot, "compose.yaml"), "utf8");
const envExample = readFileSync(join(repoRoot, ".env.example"), "utf8");
const webDockerfile = readFileSync(
  join(repoRoot, "apps", "web", "Dockerfile"),
  "utf8",
);
const apiDockerfile = readFileSync(
  join(repoRoot, "apps", "api", "Dockerfile"),
  "utf8",
);

function getServiceBlock(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = composeText.match(
    new RegExp(
      String.raw`^  ${escaped}:\n([\s\S]*?)(?=^  [a-z0-9-]+:\n|^volumes:\n|\Z)`,
      "m",
    ),
  );

  assert.ok(match, `Missing service block for ${name}`);

  return match[0];
}

test("compose root entry keeps the required service topology and app-local Dockerfiles", () => {
  for (const service of ["postgres", "api-migrate", "api", "web", "caddy"]) {
    assert.match(composeText, new RegExp(`^  ${service}:$`, "m"));
  }

  assert.match(
    composeText,
    /dockerfile:\s+\.\/apps\/web\/Dockerfile/,
    "Web must build from the app-local Dockerfile",
  );
  assert.match(
    composeText,
    /dockerfile:\s+\.\/apps\/api\/Dockerfile/,
    "API must build from the app-local Dockerfile",
  );
  assert.match(
    composeText,
    /context:\s+\./,
    "Compose must build both app images from the repo root context",
  );
});

test("only caddy publishes host ports", () => {
  const caddyBlock = getServiceBlock("caddy");

  assert.match(caddyBlock, /^\s{4}ports:\n/m);

  for (const service of ["postgres", "api-migrate", "api", "web"]) {
    assert.doesNotMatch(
      getServiceBlock(service),
      /^\s{4}ports:\n/m,
      `${service} must not publish host ports`,
    );
  }
});

test("postgres stays on a named volume and a pinned distro tag", () => {
  const postgresBlock = getServiceBlock("postgres");

  assert.match(postgresBlock, /image:\s+postgres:18\.3-bookworm/);
  assert.match(postgresBlock, /-\s+postgres-data:\/var\/lib\/postgresql/);
  assert.doesNotMatch(
    postgresBlock,
    /^\s{4}ports:\n/m,
    "Postgres must not expose a host port by default",
  );
  assert.match(postgresBlock, /^\s{4}healthcheck:\n/m);
});

test("api service keeps the migration gate and a read-only OPML bind mount", () => {
  const migrateBlock = getServiceBlock("api-migrate");
  const apiBlock = getServiceBlock("api");

  assert.match(
    migrateBlock,
    /postgres:\n\s+condition:\s+service_healthy/,
    "api-migrate must wait for postgres health",
  );
  assert.match(
    apiBlock,
    /api-migrate:\n\s+condition:\s+service_completed_successfully/,
  );
  assert.match(apiBlock, /postgres:\n\s+condition:\s+service_healthy/);
  assert.match(apiBlock, /^\s{4}healthcheck:\n/m);
  assert.match(apiBlock, /type:\s+bind/);
  assert.match(apiBlock, /source:\s+\$\{FEED_OPML_HOST_PATH\}/);
  assert.match(apiBlock, /target:\s+\/run\/rssift\/feeds\.opml/);
  assert.match(apiBlock, /read_only:\s+true/);
});

test("web and caddy keep the health-gated startup chain", () => {
  const webBlock = getServiceBlock("web");
  const caddyBlock = getServiceBlock("caddy");

  assert.match(webBlock, /api:\n\s+condition:\s+service_healthy/);
  assert.match(webBlock, /^\s{4}healthcheck:\n/m);
  assert.match(caddyBlock, /web:\n\s+condition:\s+service_healthy/);
  assert.match(caddyBlock, /image:\s+caddy:2\.11\.2-alpine/);
  assert.match(caddyBlock, /-\s+caddy-data:\/data/);
  assert.match(caddyBlock, /-\s+caddy-config:\/config/);
});

test("dockerfiles keep exact node patch tags instead of floating tags", () => {
  for (const [name, contents] of [
    ["apps/web/Dockerfile", webDockerfile],
    ["apps/api/Dockerfile", apiDockerfile],
  ]) {
    assert.match(
      contents,
      /FROM node:24\.14\.1-bookworm-slim AS builder/,
      `${name} builder stage must pin the exact Node tag`,
    );
    assert.match(
      contents,
      /FROM node:24\.14\.1-bookworm-slim AS runner/,
      `${name} runner stage must pin the exact Node tag`,
    );
    assert.doesNotMatch(contents, /FROM node:latest/);
  }
});

test("root env example documents the operator-owned compose inputs", () => {
  for (const variable of [
    "CADDY_SITE_ADDRESS",
    "HTTP_PORT",
    "HTTPS_PORT",
    "POSTGRES_DB",
    "POSTGRES_PASSWORD",
    "POSTGRES_USER",
    "FEED_OPML_HOST_PATH",
    "INGEST_ON_BOOT",
  ]) {
    assert.match(envExample, new RegExp(`^${variable}=`, "m"));
  }
});
