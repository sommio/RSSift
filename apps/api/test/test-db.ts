import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Client } from "pg";
import type { PrismaClient as GeneratedPrismaClient } from "../src/generated/prisma/client";

const nodeRequire = createRequire(__filename);
type PrismaClientCtor = new (options: object) => GeneratedPrismaClient;
type DatabaseTarget = "dev" | "test";

function getRequiredEnv(name: "DATABASE_URL" | "TEST_DATABASE_URL") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getTestDatabaseUrl() {
  return getRequiredEnv("TEST_DATABASE_URL");
}

export function getDatabaseUrl(target: DatabaseTarget) {
  return target === "dev"
    ? getRequiredEnv("DATABASE_URL")
    : getTestDatabaseUrl();
}

export async function resetDatabase(target: DatabaseTarget) {
  const client = new Client({
    connectionString: getDatabaseUrl(target),
  });

  await client.connect();

  try {
    await client.query(`DROP SCHEMA IF EXISTS public CASCADE;`);
    await client.query(`CREATE SCHEMA public;`);
  } finally {
    await client.end();
  }
}

export async function applyMigrations(target: DatabaseTarget) {
  const client = new Client({
    connectionString: getDatabaseUrl(target),
  });

  await client.connect();

  try {
    const sql = readFileSync(
      join(
        __dirname,
        "..",
        "prisma",
        "migrations",
        "202604150001_init_feed_ingestion",
        "migration.sql",
      ),
      "utf8",
    );

    await client.query(sql);
  } finally {
    await client.end();
  }
}

export async function resetDevDatabase() {
  await resetDatabase("dev");
}

export async function resetTestDatabase() {
  await resetDatabase("test");
}

export async function applyDevMigrations() {
  await applyMigrations("dev");
}

export async function applyTestMigrations() {
  await applyMigrations("test");
}

export async function prepareDatabase(target: DatabaseTarget) {
  await resetDatabase(target);
  await applyMigrations(target);
}

export async function prepareTestDatabase() {
  await prepareDatabase("test");
}

export async function prepareDevDatabase() {
  await prepareDatabase("dev");
}

export function createTestPrismaClient() {
  const { PrismaClient } = nodeRequire("../src/generated/prisma/client") as {
    PrismaClient: PrismaClientCtor;
  };

  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: getTestDatabaseUrl(),
    }),
    log: ["error", "warn"],
  });
}
