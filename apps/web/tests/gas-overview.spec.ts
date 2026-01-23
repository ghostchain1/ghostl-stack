import { test, expect } from '@playwright/test';

test('gas overview shows chains and deployments', async ({ page }) => {
  await page.goto('/observability/gas');
  await expect(page.locator('text=Chain AI Dashboard')).toBeVisible();
  await expect(page.locator('text=GhostChain')).toBeVisible();
  const deployments = page.locator('a.table-row');
  await expect(deployments.first()).toBeVisible();
});
