import { defineConfig } from '@playwright/test';
import original from './playwright.acceptance.config';

if (!original.webServer || Array.isArray(original.webServer))
  throw new Error('Expected one registered acceptance web server.');

// Local only: verify fresh, matching API/web builds before serving them.
export default defineConfig({
  ...original,
  webServer: {
    ...original.webServer,
    timeout: 180_000,
    command:
      'python3 /workspace/work/ideas-runtime733/verify-browser-builds.py && pnpm preview --host 127.0.0.1 --port 4173',
  },
});
