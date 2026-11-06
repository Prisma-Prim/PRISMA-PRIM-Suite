import type { ReporterDescription } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const stepSummaryReporter = fileURLToPath(
  new URL(
    '../../scripts/playwright-step-summary-reporter.mjs',
    import.meta.url,
  ),
);

/** Playwright's own default: terse `dot` in CI, `list` for people. */
export function defaultReporter(
  env: NodeJS.ProcessEnv = process.env,
): ReporterDescription[] {
  return [[env.CI ? 'dot' : 'list']];
}

/**
 * The default reporter plus, in CI only, one GitHub annotation per failed test
 * and a short failing-test list in the job summary. `dot` stays first so the
 * log keeps its failure details.
 */
export function ciReporter(
  env: NodeJS.ProcessEnv = process.env,
): ReporterDescription[] {
  return env.CI
    ? [['dot'], ['github'], [stepSummaryReporter]]
    : defaultReporter(env);
}
