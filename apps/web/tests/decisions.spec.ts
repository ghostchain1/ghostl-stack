import { test, expect } from '@playwright/test';

test('decisions page renders rows', async ({ page }) => {
  await page.goto('/compliance/decisions');
  await expect(page.locator('text=Decisions')).toBeVisible();
  await expect(page.locator('text=No decisions found.')).toHaveCount(0);
  await expect(page.locator('table tbody tr').first()).toBeVisible();
});
