import { test, expect } from '@playwright/test';

test('connection status shows service and chain rows', async ({ page }) => {
  await page.goto('/connection-status');
  await expect(page.locator('text=Connection Status')).toBeVisible();
  await expect(page.locator('text=Services')).toBeVisible();
  await expect(page.locator('text=Chains')).toBeVisible();
  await expect(page.locator('text=Ghost API')).toBeVisible();
  await expect(page.locator('text=L1')).toBeVisible();
});
