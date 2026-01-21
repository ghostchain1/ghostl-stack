import { test, expect } from '@playwright/test';

test('controls page lists controls', async ({ page }) => {
  await page.goto('/compliance/controls');
  await expect(page.locator('text=Required Controls')).toBeVisible();
  await expect(page.locator('text=No controls defined.')).toHaveCount(0);
  await expect(page.locator('ul li').first()).toBeVisible();
});
