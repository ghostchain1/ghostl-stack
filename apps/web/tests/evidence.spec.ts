import { test, expect } from '@playwright/test';

test('evidence page renders bundle', async ({ page }) => {
  await page.goto('/compliance/evidence');
  await expect(page.locator('text=Evidence Bundle')).toBeVisible();
  await expect(page.locator('text=Select an evidence bundle')).toHaveCount(0);
});
