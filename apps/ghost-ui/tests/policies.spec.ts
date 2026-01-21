import { test, expect } from '@playwright/test';

test('policies page renders active bundle', async ({ page }) => {
  await page.goto('/compliance/policies');
  await expect(page.locator('text=Active policy bundle')).toBeVisible();
  await expect(page.locator('text=Rules:')).toBeVisible();
  await expect(page.locator('ul li').first()).toBeVisible();
});
