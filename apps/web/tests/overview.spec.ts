import { test, expect } from '@playwright/test';

test('overview shows seeded metrics', async ({ page }) => {
  await page.goto('/compliance/overview');
  await expect(page.locator('text=Compliance Overview')).toBeVisible();
  const badges = page.locator('.badge');
  await expect(badges.first()).toBeVisible();
  const decisionsText = await page.locator('text=Decisions:').textContent();
  expect(decisionsText || '').not.toContain('Decisions: 0');
});
