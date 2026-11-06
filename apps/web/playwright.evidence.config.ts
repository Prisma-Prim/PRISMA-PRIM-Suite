import { defineConfig } from '@playwright/test';
import acceptance from './playwright.acceptance.config';
import { defaultReporter } from './playwright.reporters';

// Prove failure capture without a second API/database setup or product journey.
export default defineConfig({
  ...acceptance,
  // The probe fails on purpose: no CI annotation or job summary for it.
  reporter: defaultReporter(),
  testMatch: /client-registration-evidence\.probe\.ts/u,
  outputDir: './test-results/acceptance-evidence-probe',
  globalSetup: undefined,
  webServer: undefined,
  projects: [{ name: 'capture-proof' }],
  retries: 0,
});
