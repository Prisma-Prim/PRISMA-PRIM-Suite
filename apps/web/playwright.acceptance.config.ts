import { defineConfig, devices } from '@playwright/test';
import { ciReporter } from './playwright.reporters';

export default defineConfig({
  testDir: './e2e',
  // Every `<name>.acceptance.spec.ts` is an acceptance spec; there is no list to
  // maintain. The mocked browser projects ignore the same suffix.
  testMatch: /\.acceptance\.spec\.ts$/u,
  outputDir: './test-results/acceptance',
  globalSetup: './e2e/operational-foundation.global-setup.mjs',
  fullyParallel: false,
  workers: 1,
  reporter: ciReporter(),
  use: {
    baseURL: 'http://127.0.0.1:4173',
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    // A final screenshot per journey and width, passing or failing: the
    // acceptance-proof check needs desktop and narrow screenshots of the
    // journey a pull request cites as visual proof.
    screenshot: 'on',
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
    // The command builds the API and the web application before it serves:
    // CI took up to 64 s, over Playwright's 60 s default (#1317). Same budget
    // as the local startup plan in scripts/verify-local-browser.mjs.
    timeout: 180_000,
  },
});
