import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch:
    /(?:client-document-navigation|client-registration-refresh|commercial-journey|document-content|contract|contract-activity|commercial-intake|company-unassigned-tasks|offer-activity|my-open-projects|operational-foundation|operational-risk|personal-upcoming|company-overdue|personal-attention|project-template|pricing-configuration|service-catalogue|ideas)\.acceptance\.spec\.ts/u,
  outputDir: './test-results/acceptance',
  globalSetup: './e2e/operational-foundation.global-setup.mjs',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://127.0.0.1:4173',
          localStorage: [{ name: 'prisma-prim.interface-locale', value: 'en' }],
        },
      ],
    },
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
