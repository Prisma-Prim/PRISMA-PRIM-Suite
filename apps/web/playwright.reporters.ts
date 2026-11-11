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
 * log keeps its failure details. When CI names CI_TEST_RESULTS_FILE, the JSON
 * results there feed the acceptance-proof check
 * (scripts/verify-acceptance-proof.mjs).
 */
export function ciReporter(
  env: NodeJS.ProcessEnv = process.env,
): ReporterDescription[] {
  if (!env.CI) return defaultReporter(env);
  const reporters: ReporterDescription[] = [
    ['dot'],
    ['github'],
    [stepSummaryReporter],
  ];
  if (env.CI_TEST_RESULTS_FILE)
    reporters.push(['json', { outputFile: env.CI_TEST_RESULTS_FILE }]);
  return reporters;
}
