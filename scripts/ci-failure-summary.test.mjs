import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  MAXIMUM_LISTED_FAILURES,
  appendFailureSummary,
  renderFailureSummary,
} from './ci-failure-summary.mjs';
import PlaywrightStepSummaryReporter from './playwright-step-summary-reporter.mjs';
import VitestStepSummaryReporter from './vitest-step-summary-reporter.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

async function readSource(relativePath) {
  return (
    await readFile(path.join(repositoryRoot, relativePath), 'utf8')
  ).replaceAll('\r\n', '\n');
}

/** Runs one reporter with GITHUB_STEP_SUMMARY pointing at a fresh file. */
async function withStepSummary(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ci-failure-summary-'));
  const summaryFile = path.join(directory, 'summary.md');
  await writeFile(summaryFile, '## Earlier step output\n');
  const previous = process.env.GITHUB_STEP_SUMMARY;
  process.env.GITHUB_STEP_SUMMARY = summaryFile;
  try {
    await run();
    return await readFile(summaryFile, 'utf8');
  } finally {
    if (previous === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previous;
    await rm(directory, { recursive: true, force: true });
  }
}

function failures(count) {
  return Array.from({ length: count }, (_, index) => ({
    location: `src/file-${index}.test.ts`,
    title: `fails ${index}`,
    message: `Error: reason ${index}`,
  }));
}

test('renders nothing when no test failed', () => {
  assert.equal(renderFailureSummary({ runner: 'Vitest', failures: [] }), '');
});

test('lists the file, the test and the first error line of each failure', () => {
  const markdown = renderFailureSummary({
    runner: 'Vitest',
    failures: [
      {
        location: 'src/production-shell/ActivityLog.test.tsx',
        title: 'ActivityLog > renders every action',
        message:
          'AssertionError: expected 164 to be 154\n\n- Expected\n+ Received',
      },
    ],
  });
  assert.match(markdown, /^### Failing tests: Vitest \(1\)\n/u);
  assert.ok(!markdown.startsWith('\n'));
  assert.ok(
    markdown.includes('`src/production-shell/ActivityLog.test.tsx`'),
    markdown,
  );
  assert.ok(markdown.includes('`ActivityLog > renders every action`'));
  assert.ok(markdown.includes('`AssertionError: expected 164 to be 154`'));
  assert.ok(!markdown.includes('Received'), 'only the first error line');
});

test('caps the list and says how many failures were left out', () => {
  const markdown = renderFailureSummary({
    runner: 'Playwright',
    failures: failures(MAXIMUM_LISTED_FAILURES + 5),
  });
  assert.match(
    markdown,
    new RegExp(
      `Failing tests: Playwright \\(${MAXIMUM_LISTED_FAILURES + 5}\\)`,
    ),
  );
  assert.equal(
    markdown.match(/^- `src\/file-/gmu)?.length,
    MAXIMUM_LISTED_FAILURES,
  );
  assert.match(markdown, /and 5 more/u);
  assert.ok(markdown.includes(`fails ${MAXIMUM_LISTED_FAILURES - 1}`));
  assert.ok(!markdown.includes(`fails ${MAXIMUM_LISTED_FAILURES}\``));
});

test('keeps hostile or oversized test text from breaking the Markdown', () => {
  const markdown = renderFailureSummary({
    runner: 'Playwright',
    failures: [
      {
        location: 'e2e/a`b.spec.ts:3',
        title: 'line one\nline two `code` <img src=x>',
        message: `\u001b[31mError: ${'x'.repeat(2000)}\u001b[39m`,
      },
    ],
    note: 'Traces are uploaded.',
  });
  assert.ok(!markdown.includes('\u001b'), 'ANSI colour codes are removed');
  assert.ok(!markdown.includes('line one\n'), 'a title stays on one line');
  assert.ok(markdown.length < 1500, 'long messages are truncated');
  assert.ok(markdown.includes('Traces are uploaded.'));
  for (const line of markdown.split('\n'))
    assert.equal(
      (line.match(/`/gu) ?? []).length % 2,
      0,
      `unbalanced code span: ${line}`,
    );
});

test('appends to the step summary only when GitHub provides one', () => {
  const written = [];
  const append = (file, text) => written.push({ file, text });
  const input = { runner: 'Vitest', failures: failures(1) };

  appendFailureSummary(input, { env: {}, append });
  appendFailureSummary(
    { runner: 'Vitest', failures: [] },
    { env: { GITHUB_STEP_SUMMARY: '/tmp/summary.md' }, append },
  );
  assert.deepEqual(written, []);

  appendFailureSummary(input, {
    env: { GITHUB_STEP_SUMMARY: '/tmp/summary.md' },
    append,
  });
  assert.equal(written.length, 1);
  assert.equal(written[0].file, '/tmp/summary.md');
  assert.match(written[0].text, /Failing tests: Vitest \(1\)/u);
});

test('a summary that cannot be written never fails the test run', () => {
  assert.doesNotThrow(() =>
    appendFailureSummary(
      { runner: 'Vitest', failures: failures(1) },
      {
        env: { GITHUB_STEP_SUMMARY: '/nowhere/summary.md' },
        append: () => {
          throw new Error('read-only file system');
        },
      },
    ),
  );
});

function vitestTest(fullName, state, message) {
  return {
    fullName,
    result: () => ({
      state,
      errors: state === 'failed' ? [{ message }] : undefined,
    }),
  };
}

/** A suite as Vitest reports it: hook failures live on the nested suite. */
function vitestSuite(fullName, errors = []) {
  return { fullName, errors: () => errors };
}

function vitestModule({
  id,
  state = 'passed',
  errors = [],
  tests = [],
  suites = [],
}) {
  return {
    relativeModuleId: id,
    state: () => state,
    errors: () => errors,
    children: {
      *allTests(filter) {
        for (const candidate of tests)
          if (filter === undefined || candidate.result().state === filter)
            yield candidate;
      },
      *allSuites() {
        yield* suites;
      },
    },
  };
}

test('the Vitest reporter lists failed tests, broken files and unhandled errors', async () => {
  const summary = await withStepSummary(() =>
    new VitestStepSummaryReporter().onTestRunEnd(
      [
        vitestModule({
          id: 'src/a.test.ts',
          state: 'failed',
          tests: [
            vitestTest('suite > passes', 'passed'),
            vitestTest('suite > breaks', 'failed', 'AssertionError: nope'),
          ],
        }),
        vitestModule({
          id: 'src/b.test.ts',
          state: 'failed',
          errors: [{ message: 'SyntaxError: Unexpected token' }],
        }),
      ],
      [{ message: 'Error: socket hang up' }],
    ),
  );
  assert.ok(
    summary.startsWith('## Earlier step output\n'),
    'appends, never replaces',
  );
  assert.match(summary, /Failing tests: Vitest \(3\)/u);
  assert.ok(summary.includes('`src/a.test.ts`'));
  assert.ok(summary.includes('`suite > breaks`'));
  assert.ok(!summary.includes('suite > passes'));
  assert.ok(summary.includes('`SyntaxError: Unexpected token`'));
  assert.ok(summary.includes('`Error: socket hang up`'));
});

test('the Vitest reporter names a failing afterAll hook of a nested suite', async () => {
  const summary = await withStepSummary(() =>
    new VitestStepSummaryReporter().onTestRunEnd(
      [
        // Every test passes; only the teardown of one suite fails.
        vitestModule({
          id: 'src/teardown.test.ts',
          state: 'failed',
          tests: [vitestTest('teardown only > passes', 'passed')],
          suites: [
            vitestSuite('teardown only', [
              { message: 'Error: afterAll teardown exploded\n    at hook' },
            ]),
          ],
        }),
        // A failing test and a failing teardown in the same file: both count.
        vitestModule({
          id: 'src/both.test.ts',
          state: 'failed',
          tests: [vitestTest('outer > inner > also fails', 'failed', 'nope')],
          suites: [
            vitestSuite('outer', []),
            vitestSuite('outer > inner', [
              { message: 'Error: inner afterAll exploded' },
            ]),
          ],
        }),
      ],
      [],
    ),
  );
  assert.match(summary, /Failing tests: Vitest \(3\)/u);
  assert.ok(summary.includes('`src/teardown.test.ts`'), summary);
  assert.ok(summary.includes('Suite hook or setup failed: teardown only'));
  assert.ok(summary.includes('`Error: afterAll teardown exploded`'));
  assert.ok(summary.includes('`outer > inner > also fails`'));
  assert.ok(summary.includes('Suite hook or setup failed: outer > inner'));
  assert.ok(summary.includes('`Error: inner afterAll exploded`'));
  assert.ok(
    !summary.includes('outer`'),
    'a suite without errors is not listed',
  );
  assert.ok(!summary.includes('File failed without a failing test'));
  assert.ok(!summary.includes('No error message recorded'));
});

test('the Vitest reporter writes nothing when every test passed', async () => {
  const summary = await withStepSummary(() =>
    new VitestStepSummaryReporter().onTestRunEnd(
      [
        vitestModule({
          id: 'src/a.test.ts',
          tests: [vitestTest('suite > passes', 'passed')],
        }),
      ],
      [],
    ),
  );
  assert.equal(summary, '## Earlier step output\n');
});

test('the Vitest reporter survives an unexpected runner payload', () => {
  assert.doesNotThrow(() =>
    new VitestStepSummaryReporter().onTestRunEnd([{}], undefined),
  );
});

function playwrightTest({
  project = 'desktop',
  file = '/repo/apps/web/e2e/clients.spec.ts',
  line = 12,
  titles = ['Clients', 'creates a Client'],
  outcome = 'unexpected',
  message = 'Error: expect(locator).toBeVisible() failed\n\nTimeout: 5000ms',
} = {}) {
  return {
    outcome: () => outcome,
    titlePath: () => ['', project, path.basename(file), ...titles],
    location: { file, line, column: 5 },
    results: [{ error: { message } }],
  };
}

test('the Playwright reporter lists unexpected failures with project and position', async () => {
  const reporter = new PlaywrightStepSummaryReporter();
  const summary = await withStepSummary(async () => {
    reporter.onBegin(
      {
        rootDir: '/repo/apps/web/e2e',
        configFile: '/repo/apps/web/playwright.config.ts',
      },
      {
        allTests: () => [
          playwrightTest({ outcome: 'expected', titles: ['passes'] }),
          playwrightTest(),
          playwrightTest({ outcome: 'skipped', titles: ['skipped'] }),
          playwrightTest({ outcome: 'flaky', titles: ['flaky'] }),
        ],
      },
    );
    reporter.onError({ message: 'Error: global setup failed' });
    await reporter.onEnd();
  });
  assert.ok(summary.startsWith('## Earlier step output\n'));
  assert.match(summary, /Failing tests: Playwright \(2\)/u);
  assert.ok(summary.includes('`[desktop] e2e/clients.spec.ts:12`'), summary);
  assert.ok(summary.includes('`Clients > creates a Client`'));
  assert.ok(summary.includes('`Error: expect(locator).toBeVisible() failed`'));
  assert.ok(summary.includes('`Error: global setup failed`'));
  assert.ok(!summary.includes('Timeout: 5000ms'));
  assert.ok(!summary.includes('passes'));
  assert.ok(!summary.includes('skipped'));
  assert.ok(!summary.includes('flaky'));
  assert.match(summary, /trace/iu, 'points at the retained traces');
});

test('the Playwright reporter leaves the stdio reporters in charge and writes nothing on success', async () => {
  const reporter = new PlaywrightStepSummaryReporter();
  assert.equal(reporter.printsToStdio(), false);
  const summary = await withStepSummary(async () => {
    reporter.onBegin(
      { rootDir: '/repo/apps/web/e2e' },
      { allTests: () => [playwrightTest({ outcome: 'expected' })] },
    );
    await reporter.onEnd();
  });
  assert.equal(summary, '## Earlier step output\n');
});

test('the CI reporter set keeps dot, adds GitHub annotations and the summary, and stays quiet locally', async () => {
  const { ciReporter, defaultReporter } =
    await import('../apps/web/playwright.reporters.ts');

  assert.deepEqual(defaultReporter({}), [['list']]);
  assert.deepEqual(defaultReporter({ CI: 'true' }), [['dot']]);

  assert.deepEqual(ciReporter({}), [['list']]);
  const inCi = ciReporter({ CI: 'true' });
  assert.deepEqual(
    inCi.slice(0, 2),
    [['dot'], ['github']],
    'dot stays first so stdout keeps its failure details',
  );
  assert.equal(inCi.length, 3);
  const summaryReporter = inCi[2][0];
  assert.ok(path.isAbsolute(summaryReporter));
  assert.equal(
    path.resolve(summaryReporter),
    path.join(
      repositoryRoot,
      'scripts',
      'playwright-step-summary-reporter.mjs',
    ),
  );

  // The acceptance-proof check reads each CI run's results from this file.
  const resultsFile = '/runner/temp/ci-test-results/acceptance-1.json';
  assert.deepEqual(
    ciReporter({ CI: 'true', CI_TEST_RESULTS_FILE: resultsFile }).slice(3),
    [['json', { outputFile: resultsFile }]],
  );
  assert.deepEqual(ciReporter({ CI_TEST_RESULTS_FILE: resultsFile }), [
    ['list'],
  ]);
});

test('both Playwright suites report through the CI reporter set and the probe stays plain', async () => {
  for (const config of [
    'apps/web/playwright.config.ts',
    'apps/web/playwright.acceptance.config.ts',
  ]) {
    const source = await readSource(config);
    assert.match(source, /^ {2}reporter: ciReporter\(\),$/mu, config);
    assert.match(source, /from '\.\/playwright\.reporters'/u, config);
  }
  const probe = await readSource('apps/web/playwright.evidence.config.ts');
  assert.match(
    probe,
    /^ {2}reporter: defaultReporter\(\),$/mu,
    'the deliberate probe failure must not become a CI annotation or summary',
  );
});

test('the mocked browser suite keeps traces and screenshots of failures without retries', async () => {
  const source = await readSource('apps/web/playwright.config.ts');
  assert.match(source, /trace: 'retain-on-failure'/u);
  assert.match(source, /screenshot: 'only-on-failure'/u);
  assert.doesNotMatch(source, /on-first-retry/u);
  assert.doesNotMatch(source, /retries:\s*[1-9]/u);
});

// Outside GitHub Actions the list must be empty, never `undefined`: an
// explicit `undefined` replaces Vitest's default list and crashes its start-up.
// The JSON results feed the acceptance-proof check, only when CI names a file.
test('both Vitest suites keep the built-in GitHub reporter and add the summary and the CI results in GitHub Actions only', async () => {
  for (const config of [
    'apps/web/vite.config.ts',
    'apps/api/vitest.config.ts',
  ]) {
    const source = await readSource(config);
    assert.match(
      source,
      /reporters:\s*process\.env\.GITHUB_ACTIONS === 'true'\s*\?\s*\[\s*'default',\s*'github-actions',\s*stepSummaryReporter,\s*\.\.\.\(resultsFile \? \['json'\] : \[\]\),?\s*\]\s*:\s*\[\],/u,
      config,
    );
    assert.match(
      source,
      /^const resultsFile = process\.env\.CI_TEST_RESULTS_FILE;$/mu,
      config,
    );
    assert.match(
      source,
      /outputFile: resultsFile \? \{ json: resultsFile \} : undefined,/u,
      config,
    );
    assert.match(source, /scripts\/vitest-step-summary-reporter\.mjs/u, config);
  }
});
