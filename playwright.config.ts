import { defineConfig } from '@playwright/test';

export const SESSION_STATE = '.auth/session.json';

export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:5173', headless: true },
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    // Mints a session once, then shares it with every signed-in spec.
    { name: 'setup', testMatch: /auth\.setup\.ts$/ },
    // Specs that must run without a session.
    { name: 'anonymous', testMatch: /\.anon\.spec\.ts$/ },
    {
      name: 'signed-in',
      testMatch: /\.spec\.ts$/,
      testIgnore: /\.anon\.spec\.ts$/,
      dependencies: ['setup'],
      use: { storageState: SESSION_STATE },
    },
  ],
});
