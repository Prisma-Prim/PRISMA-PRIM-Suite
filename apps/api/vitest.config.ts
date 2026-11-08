import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const stepSummaryReporter = fileURLToPath(
  new URL('../../scripts/vitest-step-summary-reporter.mjs', import.meta.url),
);

export default defineConfig({
  test: {
    // GitHub Actions: Vitest's built-in annotations and job summary, now
    // explicit, plus the names of the failing tests. Elsewhere an empty list
    // keeps Vitest's own default selection (never `undefined`: that crashes).
    reporters:
      process.env.GITHUB_ACTIONS === 'true'
        ? ['default', 'github-actions', stepSummaryReporter]
        : [],
    // Each PostgreSQL-backed REST file creates and migrates its own database.
    // Measured on a 16-thread host (#571): one worker per core timed out 19
    // of 109 files, while 6 workers passed all of them and finished sooner.
    // 40% gives 6 there and stays 1 on 2-vCPU CI runners.
    maxWorkers: '40%',
    // Closing a REST harness drops its database; under load that can exceed
    // the 10 s default while still finishing. A genuine hang still fails.
    hookTimeout: 30_000,
    // Fails a test that sends a query to a busy pg client (#1231).
    setupFiles: ['./test-support/pg-queued-query-guard.ts'],
  },
});
