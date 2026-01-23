import { test, expect } from '@playwright/test';

test('protocol governance shows policy packs', async ({ page }) => {
  await page.goto('/protocol/governance');
  await expect(page.locator('text=Policy Packs')).toBeVisible();
  await expect(page.locator('text=GLOBAL')).toBeVisible();
  await expect(page.locator('text=v1')).toBeVisible();
});
