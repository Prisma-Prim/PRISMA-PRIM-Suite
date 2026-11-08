import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { FUZZ_TEST_FILES } from './nightly-fuzz-report.mjs';

async function readWorkflow() {
  return (
    await readFile(
      new URL('../.github/workflows/nightly-fuzz.yml', import.meta.url),
      'utf8',
    )
  ).replaceAll('\r\n', '\n');
}

function jobsIn(workflow) {
  const jobs = workflow.slice(workflow.indexOf('\njobs:\n'));
  const declarations = [...jobs.matchAll(/^ {2}([a-z_]+):\n/gm)];
  return Object.fromEntries(
    declarations.map((match, index) => [
      match[1],
      jobs.slice(match.index, declarations[index + 1]?.index),
    ]),
  );
}

function stepBody(job, step) {
  const start = job.indexOf(`- name: ${step}\n`);
  assert.notEqual(start, -1, `missing step ${step}`);
  const next = job.indexOf('\n      - name:', start);
  return job.slice(start, next === -1 ? undefined : next);
}

test('the nightly fuzz starts at 03:30 UTC or by hand, and never on a pull request', async () => {
  const workflow = await readWorkflow();
  assert.match(
    workflow,
    /\non:\n {2}schedule:\n {4}- cron: '30 1 \* \* \*'\n {2}workflow_dispatch:\n\n/,
  );
  // Nothing it finds can gate a pull request or a merge.
  assert.doesNotMatch(
    workflow,
    /^ {2}(?:push|pull_request|pull_request_target|merge_group|workflow_run|workflow_call):/m,
  );
  const jobs = jobsIn(workflow);
  assert.deepEqual(Object.keys(jobs), ['fuzz', 'report']);
  for (const [name, job] of Object.entries(jobs))
    assert.deepEqual(
      [...job.matchAll(/^ {4}runs-on: (.+)$/gm)].map((match) => match[1]),
      ['ubuntu-24.04'],
      name,
    );
  // Nothing cancels a run.
  assert.doesNotMatch(workflow, /^concurrency:/m);
  assert.doesNotMatch(workflow, /cancel-in-progress: true/);
});

test('the fuzz job runs every fuzzed API file as its own matrix job, none cancelling another', async () => {
  const { fuzz } = jobsIn(await readWorkflow());
  assert.match(fuzz, /\n {4}strategy:\n(?: {6}#.*\n)* {6}fail-fast: false\n/);
  const legs = [
    ...fuzz.matchAll(/^ {10}- module: ([a-z-]+)\n {12}test: (\S+)$/gm),
  ].map((match) => ({ module: match[1], test: match[2] }));
  assert.deepEqual(
    legs.map((leg) => leg.test),
    FUZZ_TEST_FILES,
  );
  assert.equal(new Set(legs.map((leg) => leg.module)).size, legs.length);
  for (const leg of legs) {
    assert.match(leg.test, /^src\/[a-z-]+\/[a-z-]+\.fuzz\.rest\.test\.ts$/);
    // Each leg, and so its failure artifact, is named after its module.
    assert.equal(leg.module, leg.test.split('/')[1]);
    await access(new URL(`../apps/api/${leg.test}`, import.meta.url));
  }
  assert.match(
    stepBody(fuzz, 'Upload the failure report'),
    /\n {10}name: nightly-fuzz-report-\$\{\{ matrix\.module \}\}\n/,
  );
});

test('the fuzz job runs the API fuzz test on PostgreSQL with a random seed inside its timeout', async () => {
  const { fuzz } = jobsIn(await readWorkflow());
  assert.match(fuzz, /^ {4}timeout-minutes: 30$/m);
  for (const [variable, database] of [
    ['DATABASE_URL', 'prisma_prim_dev'],
    ['TEST_DATABASE_URL', 'prisma_prim_test'],
    ['POSTGRES_ADMIN_URL', 'postgres'],
  ])
    assert.ok(
      fuzz.includes(
        `${variable}: postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/${database}\n`,
      ),
    );
  assert.doesNotMatch(
    stepBody(fuzz, 'Set up repository verification'),
    /postgres: 'false'/,
  );
  assert.match(
    stepBody(fuzz, 'Verify supported agent environment'),
    /run: pnpm agent:doctor:postgres\n/,
  );
  const step = stepBody(fuzz, 'Fuzz the API invariants');
  assert.match(step, /\n {10}FUZZ_SEED: random\n/);
  assert.match(step, /\n {10}FUZZ_RUNS: '[1-9][0-9]*'\n/);
  assert.match(step, /\n {10}FUZZ_STEPS: '[1-9][0-9]*'\n/);
  assert.match(
    step,
    /\n {10}FUZZ_REPORT: \$\{\{ runner\.temp \}\}\/fuzz-report\.json\n/,
  );
  // The matrix value reaches the shell as data, never as script text.
  assert.match(step, /\n {10}FUZZ_TEST_FILE: \$\{\{ matrix\.test \}\}\n/);
  assert.match(
    step.trimEnd(),
    /\n {8}run: pnpm --filter @prisma-prim\/api exec vitest run "\$FUZZ_TEST_FILE"$/,
  );
  assert.match(
    stepBody(fuzz, 'Upload the failure report'),
    /if: \$\{\{ failure\(\) \}\}/,
  );
});

test('only the report job writes issues, after every finished fuzz, one at a time', async () => {
  const workflow = await readWorkflow();
  assert.match(workflow, /\npermissions:\n {2}contents: read\n\n/);
  const { fuzz, report } = jobsIn(workflow);
  assert.doesNotMatch(fuzz, /issues: write|permissions:/);
  assert.match(
    report,
    /\n {4}permissions:\n {6}contents: read\n {6}actions: read\n {6}issues: write\n/,
  );
  assert.match(report, /^ {4}needs: fuzz$/m);
  assert.match(report, /^ {4}if: \$\{\{ !cancelled\(\) \}\}$/m);
  assert.match(
    report,
    /\n {4}concurrency:\n {6}group: fuzz-found-report\n {6}cancel-in-progress: false\n/,
  );
  const download = stepBody(report, 'Download the failure reports');
  assert.match(
    download,
    /\n {8}if: \$\{\{ needs\.fuzz\.result == 'failure' \}\}\n/,
  );
  assert.match(download, /\n {10}pattern: nightly-fuzz-report-\*\n/);
  assert.match(
    download,
    /\n {10}path: \$\{\{ runner\.temp \}\}\/fuzz-reports\n/,
  );
  const step = stepBody(
    report,
    'Open, update or comment on the fuzz-found issue',
  );
  assert.match(step, /\n {10}FUZZ_RESULT: \$\{\{ needs\.fuzz\.result \}\}\n/);
  assert.match(
    step,
    /\n {10}FUZZ_REPORTS: \$\{\{ runner\.temp \}\}\/fuzz-reports\n/,
  );
  assert.match(
    step.trimEnd(),
    /\n {8}run: node scripts\/nightly-fuzz-report\.mjs$/,
  );
});
