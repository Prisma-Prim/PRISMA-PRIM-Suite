import { defineConfig } from '@playwright/test';
import acceptance from './playwright.acceptance.config';

// Prove failure capture without a second API/database setup or product journey.
export default defineConfig({
  ...acceptance,
  testMatch: /client-registration-evidence\.probe\.ts/u,
  outputDir: './test-results/acceptance-evidence-probe',
  globalSetup: undefined,
  webServer: undefined,
  projects: [{ name: 'capture-proof' }],
  retries: 0,
});
