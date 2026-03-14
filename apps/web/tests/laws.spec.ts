import { test, expect } from '@playwright/test';

test('laws page renders law timeline', async ({ page }) => {
  await page.goto('/compliance/laws');
  await expect(page.locator('text=Laws & Versions')).toBeVisible();
  await expect(page.locator('text=No laws ingested.')).toHaveCount(0);
});
