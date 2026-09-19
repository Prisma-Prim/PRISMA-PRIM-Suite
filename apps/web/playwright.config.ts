import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? '4173');
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('PLAYWRIGHT_PORT must be an integer between 1024 and 65535.');
}
const baseURL = 'http://127.0.0.1:' + port;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Keep Windows browser journeys sequential to avoid rendering contention.
  workers: process.platform === 'win32' ? 1 : undefined,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'narrow',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command:
      'pnpm build --mode local-demo && pnpm preview --host 127.0.0.1 --strictPort --port ' +
      port,
    env: {
      VITE_ACCESS_IDENTITY_MODE: 'local-demo',
      VITE_DEMO_EXTERNAL_PROVIDER: 'local-demo',
      VITE_DEMO_EXTERNAL_SUBJECT: 'local-demonstration-user',
      VITE_DEMO_DISPLAY_NAME: 'Ada Ionescu',
      VITE_DEMO_EMAIL: 'ada@example.test',
    },
    url: baseURL,
    reuseExistingServer: false,
  },
});
