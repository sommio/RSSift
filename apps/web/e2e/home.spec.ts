import { expect, test, type Page } from "@playwright/test";

function scrollViewport(testId: string, page: Page) {
  return page.getByTestId(testId).locator('[data-slot="scroll-area-viewport"]');
}

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
    page.getByRole("heading", {
      level: 1,
      name: "Rust 1.80 带来更安全的异步基础能力",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Summary" }),
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
  await expect(page.getByText("Summary pending")).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/articleId=article-002/);
  await expect(page.getByText("Summary pending")).toBeVisible();
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
      name: /^Rust 1.80 带来更安全的异步基础能力/,
    }),
  ).toBeVisible();
});

test("keeps independent pane scroll roots on desktop overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 240 });
  await page.goto("/");

  const listViewport = scrollViewport("article-list-scroll-area", page);
  const detailViewport = scrollViewport("article-detail-scroll-area", page);
  const listScrollbar = page
    .getByTestId("article-list-scroll-area")
    .locator('[data-slot="scroll-area-scrollbar"]');
  const detailScrollbar = page
    .getByTestId("article-detail-scroll-area")
    .locator('[data-slot="scroll-area-scrollbar"]');
  const listThumb = page
    .getByTestId("article-list-scroll-area")
    .locator('[data-slot="scroll-area-thumb"]');
  const detailThumb = page
    .getByTestId("article-detail-scroll-area")
    .locator('[data-slot="scroll-area-thumb"]');
  const listHeader = page.getByText("Articles");
  const detailHeader = page.getByText("Summary view");

  await expect(listViewport).toBeVisible();
  await expect(detailViewport).toBeVisible();
  await expect(listScrollbar).toHaveCount(1);
  await expect(detailScrollbar).toHaveCount(1);

  const pageMetrics = await page.evaluate(() => ({
    clientHeight: document.scrollingElement?.clientHeight ?? 0,
    scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
  }));
  expect(pageMetrics.scrollHeight).toBeLessThanOrEqual(
    pageMetrics.clientHeight + 1,
  );

  await expect
    .poll(() =>
      listViewport.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      detailViewport.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    )
    .toBe(true);

  const listHeaderBefore = await listHeader.boundingBox();
  const detailHeaderBefore = await detailHeader.boundingBox();

  const listScrollTop = await listViewport.evaluate((element) => {
    element.scrollTop = 120;
    return element.scrollTop;
  });
  const detailScrollAfterList = await detailViewport.evaluate(
    (element) => element.scrollTop,
  );

  expect(listScrollTop).toBeGreaterThan(0);
  expect(detailScrollAfterList).toBe(0);
  await expect(listThumb).toBeVisible();

  const detailScrollTop = await detailViewport.evaluate((element) => {
    element.scrollTop = 160;
    return element.scrollTop;
  });
  const listScrollAfterDetail = await listViewport.evaluate(
    (element) => element.scrollTop,
  );

  expect(detailScrollTop).toBeGreaterThan(0);
  expect(listScrollAfterDetail).toBe(listScrollTop);
  await expect(detailThumb).toBeVisible();

  const listHeaderAfter = await listHeader.boundingBox();
  const detailHeaderAfter = await detailHeader.boundingBox();

  expect(listHeaderBefore?.y).toBe(listHeaderAfter?.y);
  expect(detailHeaderBefore?.y).toBe(detailHeaderAfter?.y);
});

test("preserves the detail scroll root for pending and unavailable states", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 420 });

  await page.goto("/?articleId=article-002");
  await expect(page.getByText("Summary pending")).toBeVisible();
  await expect(
    scrollViewport("article-detail-scroll-area", page),
  ).toBeVisible();

  await page.goto("/?articleId=missing-id");
  await expect(page.getByText("Article unavailable")).toBeVisible();
  await expect(
    scrollViewport("article-detail-scroll-area", page),
  ).toBeVisible();
});
