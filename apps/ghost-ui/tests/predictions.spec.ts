import { test, expect } from '@playwright/test';

test('predictions page renders prediction cards', async ({ page }) => {
  await page.goto('/compliance/predictions');
  await expect(page.locator('text=AI Predictions')).toBeVisible();
  await expect(page.locator('text=No predictions yet.')).toHaveCount(0);
});
