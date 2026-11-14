import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CHAOS_JOURNEYS } from './nightly-ui-chaos-report.mjs';
import { listChaosJourneys } from './verify-journey.mjs';

async function readWorkflow() {
  return (
    await readFile(
      new URL('../.github/workflows/nightly-ui-chaos.yml', import.meta.url),
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

test('the nightly UI chaos starts after the nightly fuzz or by hand, and never on a pull request', async () => {
  const workflow = await readWorkflow();
  // The nightly fuzz starts at 01:30 UTC (nightly-fuzz.yml).
  assert.match(
    workflow,
    /\non:\n {2}schedule:\n {4}- cron: '20 2 \* \* \*'\n {2}workflow_dispatch:\n\n/,
  );
  // Nothing it finds can gate a pull request or a merge.
  assert.doesNotMatch(
    workflow,
    /^ {2}(?:push|pull_request|pull_request_target|merge_group|workflow_run|workflow_call):/m,
  );
  const jobs = jobsIn(workflow);
  assert.deepEqual(Object.keys(jobs), ['chaos', 'report']);
  for (const [name, job] of Object.entries(jobs))
    assert.deepEqual(
      [...job.matchAll(/^ {4}runs-on: (.+)$/gm)].map((match) => match[1]),
      ['ubuntu-24.04'],
      name,
    );
  assert.doesNotMatch(workflow, /^concurrency:/m);
  assert.doesNotMatch(workflow, /cancel-in-progress: true/);
});

test('each journey that opts into chaos is its own matrix job, none cancelling another', async () => {
  const { chaos } = jobsIn(await readWorkflow());
  assert.match(chaos, /\n {4}strategy:\n(?: {6}#.*\n)* {6}fail-fast: false\n/);
  const journeys = [...chaos.matchAll(/^ {10}- ([a-z-]+)$/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(journeys, CHAOS_JOURNEYS);
  assert.deepEqual(
    journeys,
    await listChaosJourneys(fileURLToPath(new URL('..', import.meta.url))),
  );
  assert.match(chaos, /^ {4}name: chaos \(\$\{\{ matrix\.journey \}\}\)$/m);
});

test('the chaos job replays its journey with a random seed on PostgreSQL within a budget and a timeout', async () => {
  const { chaos } = jobsIn(await readWorkflow());
  assert.match(chaos, /^ {4}timeout-minutes: 40$/m);
  for (const [variable, database] of [
    ['DATABASE_URL', 'prisma_prim_dev'],
    ['TEST_DATABASE_URL', 'prisma_prim_test'],
    ['POSTGRES_ADMIN_URL', 'postgres'],
  ])
    assert.ok(
      chaos.includes(
        `${variable}: postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/${database}\n`,
      ),
    );
  assert.doesNotMatch(
    stepBody(chaos, 'Set up repository verification'),
    /postgres: 'false'|chromium: 'false'/,
  );
  assert.match(
    stepBody(chaos, 'Verify supported agent environment'),
    /run: pnpm agent:doctor:web-postgres\n/,
  );
  const step = stepBody(chaos, 'Replay the journey under seeded UI chaos');
  // The matrix value reaches the shell as data, never as script text.
  assert.match(step, /\n {10}JOURNEY: \$\{\{ matrix\.journey \}\}\n/);
  assert.match(
    step.trimEnd(),
    /\n {8}run: pnpm verify:journey "\$JOURNEY" --chaos random --repeat [1-9][0-9]* --budget-minutes 15 --output "\$CHAOS_EVIDENCE"$/,
  );
  const summary = stepBody(chaos, 'Upload the chaos summary');
  assert.match(summary, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.match(
    summary,
    /\n {10}name: nightly-ui-chaos-summary-\$\{\{ matrix\.journey \}\}\n/,
  );
  assert.match(
    stepBody(chaos, 'Upload the failure evidence'),
    /if: \$\{\{ failure\(\) \}\}/,
  );
});

test('only the report job writes, after every finished night, one at a time', async () => {
  const workflow = await readWorkflow();
  assert.match(workflow, /\npermissions:\n {2}contents: read\n\n/);
  const { chaos, report } = jobsIn(workflow);
  assert.doesNotMatch(chaos, /issues: write|permissions:/);
  assert.match(
    report,
    /\n {4}permissions:\n {6}contents: read\n {6}actions: read\n {6}issues: write\n/,
  );
  assert.match(report, /^ {4}needs: chaos$/m);
  assert.match(report, /^ {4}if: \$\{\{ !cancelled\(\) \}\}$/m);
  assert.match(
    report,
    /\n {4}concurrency:\n {6}group: nightly-ui-chaos-report\n {6}cancel-in-progress: false\n/,
  );
  const download = stepBody(report, 'Download the chaos summaries');
  assert.match(download, /\n {10}pattern: nightly-ui-chaos-summary-\*\n/);
  assert.match(
    download,
    /\n {10}path: \$\{\{ runner\.temp \}\}\/ui-chaos-summaries\n/,
  );
  const step = stepBody(report, 'Add the night to the weekly inspection');
  assert.match(
    step,
    /\n {10}CHAOS_SUMMARIES: \$\{\{ runner\.temp \}\}\/ui-chaos-summaries\n/,
  );
  assert.match(
    step.trimEnd(),
    /\n {8}run: node scripts\/nightly-ui-chaos-report\.mjs$/,
  );
});
