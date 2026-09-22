import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/browser',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /\.acceptance\.spec\.ts/u,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'narrow',
      testIgnore: /\.acceptance\.spec\.ts/u,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command:
      'pnpm build --mode local-demo && pnpm preview --host 127.0.0.1 --port 4173',
    env: {
      VITE_ACCESS_IDENTITY_MODE: 'local-demo',
      VITE_DEMO_EXTERNAL_PROVIDER: 'local-demo',
      VITE_DEMO_EXTERNAL_SUBJECT: 'local-demonstration-user',
      VITE_DEMO_DISPLAY_NAME: 'Ada Ionescu',
      VITE_DEMO_EMAIL: 'ada@example.test',
    },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
