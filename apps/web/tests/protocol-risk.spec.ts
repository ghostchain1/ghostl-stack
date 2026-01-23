import { test, expect } from '@playwright/test';

test('protocol risk shows jurisdictions and signals', async ({ page }) => {
  await page.goto('/protocol/risk');
  await expect(page.locator('text=Jurisdiction Risk Profile')).toBeVisible();
  await expect(page.locator('text=GLOBAL')).toBeVisible();
  await expect(page.locator('text=Legal Signals')).toBeVisible();
});
