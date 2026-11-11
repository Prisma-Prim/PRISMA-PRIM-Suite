import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const nodeTestResultsSchema = 'prisma-prim-node-test-results/v1';

/**
 * `node:test` reporter that records each test's file, title path and outcome
 * in the JSON file named by CI_TEST_RESULTS_FILE, so the acceptance-proof
 * check can tell which script tests passed in a CI run. It prints nothing: the
 * spec reporter configured beside it keeps the log, and without the variable
 * it records nothing.
 */
export default async function* nodeTestResultsReporter(source) {
  const outputFile = process.env.CI_TEST_RESULTS_FILE;
  // Per file, the title of the test currently open at each nesting level.
  // Events of one file arrive in definition order; files may interleave.
  const openTitles = new Map();
  const tests = [];
  for await (const { type, data } of source) {
    if (!outputFile || typeof data?.file !== 'string') continue;
    if (type === 'test:start') {
      const titles = openTitles.get(data.file) ?? [];
      titles.length = data.nesting;
      titles[data.nesting] = data.name;
      openTitles.set(data.file, titles);
    } else if (
      (type === 'test:pass' || type === 'test:fail') &&
      data.details?.type !== 'suite'
    ) {
      const ancestors = (openTitles.get(data.file) ?? []).slice(
        0,
        data.nesting,
      );
      tests.push({
        file: data.file,
        titlePath: [...ancestors, data.name],
        status:
          data.skip !== undefined || data.todo !== undefined
            ? 'skipped'
            : type === 'test:fail'
              ? 'failed'
              : 'passed',
      });
    }
  }
  if (outputFile) {
    mkdirSync(path.dirname(outputFile), { recursive: true });
    writeFileSync(
      outputFile,
      `${JSON.stringify({ schema: nodeTestResultsSchema, tests }, null, 2)}\n`,
    );
  }
  // Node runs a reporter as a generator of output; this one adds none.
  yield '';
}
