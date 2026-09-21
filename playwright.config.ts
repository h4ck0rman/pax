import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Only browser specs. The *.test.mjs gate suites run under node --test.
  testMatch: '**/*.spec.ts',
  use: { baseURL: 'http://127.0.0.1:5173', headless: true },
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
