import { test, expect } from '@playwright/test';

test('protocol intelligence shows chains and ingest', async ({ page }) => {
  await page.goto('/protocol/intelligence');
  await expect(page.locator('text=Protocol Intelligence Overview')).toBeVisible();
  await expect(page.locator('text=GhostChain')).toBeVisible();
  await expect(page.locator('text=Ingest Configuration')).toBeVisible();
  await expect(page.locator('text=0x5FbD')).toBeVisible();
});
