import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3201';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'retain-on-failure'
  }
});
