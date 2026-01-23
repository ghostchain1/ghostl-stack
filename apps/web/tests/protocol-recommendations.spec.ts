import { test, expect } from '@playwright/test';

test('protocol recommendations list seeded data', async ({ page }) => {
  await page.goto('/protocol/recommendations');
  await expect(page.locator('text=Recommendations')).toBeVisible();
  await expect(page.locator('text=FEE_TUNING')).toBeVisible();
});
