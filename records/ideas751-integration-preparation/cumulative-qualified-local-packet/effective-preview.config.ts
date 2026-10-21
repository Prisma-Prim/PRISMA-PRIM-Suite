import { defineConfig } from '@playwright/test';
import canonical from './playwright.acceptance.config';

export default defineConfig({
  ...canonical,
  webServer: {
    ...canonical.webServer,
    command: 'python3 /workspace/work/complaints-runtime737/ideas751-integration-preparation/cumulative-browser-preparation/verify-browser-builds.py && pnpm preview --host 127.0.0.1 --port 4173',
    timeout: 180_000,
  },
});
