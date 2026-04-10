import { expect, test } from "@playwright/test";

test("renders the first article summary by default on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");

  await expect(page.getByText("Articles")).toBeVisible();
  await expect(page.getByText("Summary view")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Jump to original" }),
  ).toBeVisible();
  await expect(
    page.getByText("Rust 1.80 expands async ergonomics"),
  ).toBeVisible();
});

test("persists selection in the URL after navigation and refresh", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");

  await page
    .getByRole("link", {
      name: /^Designing Reader-First Interfaces for Knowledge Work/,
    })
    .click();

  await expect(page).toHaveURL(/articleId=article-002/);
  await expect(
    page.getByText("Reader-first layouts reduce cognitive load"),
  ).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/articleId=article-002/);
  await expect(
    page.getByText("Reader-first layouts reduce cognitive load"),
  ).toBeVisible();
});

test("shows stale article fallback while keeping the list visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/?articleId=missing-id");

  await expect(page.getByText("Articles")).toBeVisible();
  await expect(page.getByText("Article unavailable")).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: /^Rust 1.80 Stabilizes Safer Async Building Blocks/,
    }),
  ).toBeVisible();
});
