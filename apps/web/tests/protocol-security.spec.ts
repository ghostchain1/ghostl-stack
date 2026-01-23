import { test, expect } from '@playwright/test';

test('protocol security shows signal feed', async ({ page }) => {
  await page.goto('/protocol/security');
  await expect(page.locator('text=Security Signals')).toBeVisible();
  await expect(page.locator('text=SANCTIONS')).toBeVisible();
});
