import { expect, test } from '@playwright/test';

test('renders the minimal template landing page', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Strict monorepo template' }),
  ).toBeVisible();
  await expect(page.getByText('NestJS API template')).toBeVisible();
});
