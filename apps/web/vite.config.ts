import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

const stepSummaryReporter = fileURLToPath(
  new URL('../../scripts/vitest-step-summary-reporter.mjs', import.meta.url),
);

export default defineConfig(({ mode }) => {
  const acceptanceApiUrl = process.env.ACCEPTANCE_API_URL;
  return {
    envPrefix:
      mode === 'production' ? ['VITE_API_URL', 'VITE_CLERK_'] : 'VITE_',
    plugins: [react()],
    preview: acceptanceApiUrl
      ? {
          proxy: {
            '/api': {
              target: acceptanceApiUrl,
            },
          },
        }
      : undefined,
    test: {
      environment: 'jsdom',
      // GitHub Actions: Vitest's built-in annotations and job summary, now
      // explicit, plus the names of the failing tests. Elsewhere an empty list
      // keeps Vitest's own default selection (never `undefined`: that crashes).
      reporters:
        process.env.GITHUB_ACTIONS === 'true'
          ? ['default', 'github-actions', stepSummaryReporter]
          : [],
      exclude: [...configDefaults.exclude, 'e2e/**'],
      setupFiles: ['./src/test/setup.ts'],
      // App-level jsdom renders time out at 5 s when every core runs a
      // worker (#571). Half the cores keeps the same wall time locally and
      // is a no-op on 2-vCPU CI runners, where Vitest already uses one.
      maxWorkers: '50%',
      // Full App renders under a second concurrent suite still approach 5 s;
      // 15 s keeps them stable while a genuine hang still fails.
      testTimeout: 15_000,
    },
  };
});
