import { test, expect } from '@playwright/test';

test('gas chain view renders L1 details', async ({ page }) => {
  await page.goto('/observability/gas/l1');
  await expect(page.locator('text=GhostChain')).toBeVisible();
  await expect(page.locator('text=Deployment health')).toBeVisible();
  const rows = page.locator('a.table-row');
  await expect(rows.first()).toBeVisible();
});
