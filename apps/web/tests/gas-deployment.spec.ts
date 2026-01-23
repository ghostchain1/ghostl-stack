import { test, expect } from '@playwright/test';

test('deployment detail shows attempts', async ({ page }) => {
  await page.goto('/observability/gas/deployments/00000000-0000-0000-0000-000000000001');
  await expect(page.locator('text=Deployment')).toBeVisible();
  await expect(page.locator('text=Attempts')).toBeVisible();
  await expect(page.locator('text=CHAIN_OK')).toBeVisible();
});
