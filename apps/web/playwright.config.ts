import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/browser',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Functional journeys do not need continuous decorative rendering.
    // The dedicated motion suite explicitly exercises active animation.
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'on-first-retry',
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
