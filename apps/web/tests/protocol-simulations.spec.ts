import { test, expect } from '@playwright/test';

test('protocol simulations list seeded run', async ({ page }) => {
  await page.goto('/protocol/simulations');
  await expect(page.locator('text=Protocol Simulations')).toBeVisible();
  await expect(page.locator('text=completed')).toBeVisible();
});
