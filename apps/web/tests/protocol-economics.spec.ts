import { test, expect } from '@playwright/test';

test('protocol economics shows gas tokens', async ({ page }) => {
  await page.goto('/protocol/economics');
  await expect(page.locator('text=Gas Tokens')).toBeVisible();
  await expect(page.locator('text=Validator Compliance')).toBeVisible();
  await expect(page.locator('text=GST')).toBeVisible();
  await expect(page.locator('text=0x5FbD')).toBeVisible();
});
