import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch:
    /(?:commercial-intake|operational-foundation|service-catalogue)\.acceptance\.spec\.ts/u,
  globalSetup: './e2e/operational-foundation.global-setup.mjs',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'operational-acceptance-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'operational-acceptance-narrow',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command:
      'pnpm --filter @prisma-prim/api build && pnpm build --mode local-demo && pnpm preview --host 127.0.0.1 --port 4173',
    env: {
      VITE_ACCESS_IDENTITY_MODE: 'local-demo',
      VITE_DEMO_EXTERNAL_PROVIDER: 'local-demo',
      VITE_DEMO_EXTERNAL_SUBJECT: 'local-demonstration-user',
      VITE_DEMO_DISPLAY_NAME: 'Ada Ionescu',
      VITE_DEMO_EMAIL: 'ada@example.test',
      ACCEPTANCE_API_URL: 'http://127.0.0.1:4174',
    },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
