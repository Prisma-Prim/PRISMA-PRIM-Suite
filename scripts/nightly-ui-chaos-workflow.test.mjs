import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, chmod, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    /\non:\n {2}schedule:\n {4}- cron: '20 2 \* \* \*'\n {2}workflow_dispatch:\n {4}inputs:\n/,
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
  const selection = /\|\| '(\[[^']+\])'\) \}\}/u.exec(chaos);
  assert.ok(
    selection,
    'The nightly default matrix must declare its actual journeys.',
  );
  const journeys = JSON.parse(selection[1]);
  assert.deepEqual(journeys, CHAOS_JOURNEYS);
  assert.deepEqual(
    [...journeys].sort(),
    await listChaosJourneys(fileURLToPath(new URL('..', import.meta.url))),
  );
  assert.ok(chaos.includes(`format('["{0}"]', inputs.journey)`));
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
    /pnpm verify:journey "\$JOURNEY" --chaos "\$CHAOS_SEED" --repeat [1-9][0-9]* --budget-minutes 15 --output "\$CHAOS_EVIDENCE"/,
  );
  assert.ok(step.includes("CHAOS_SEED: ${{ inputs.seed || 'random' }}"));
  const script = step.split('run: |\n')[1];
  assert.ok(script);
  assert.doesNotMatch(
    script,
    /\$\{\{/u,
    'Dispatch inputs reach the shell only through quoted environment values.',
  );
  assert.ok(step.includes("UI_SEQUENCE_BUDGET_MS: '120000'"));
  const summary = stepBody(chaos, 'Upload the chaos summary');
  assert.match(summary, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.match(
    summary,
    /\n {10}name: nightly-ui-chaos-summary-attempt-\$\{\{ github\.run_attempt \}\}-\$\{\{ matrix\.journey \}\}\n/,
  );
  const failure = stepBody(chaos, 'Upload the failure evidence');
  assert.match(failure, /if: \$\{\{ failure\(\) \}\}/);
  assert.match(
    failure,
    /\n {10}name: nightly-ui-chaos-evidence-attempt-\$\{\{ github\.run_attempt \}\}-\$\{\{ matrix\.journey \}\}\n/,
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
  assert.match(
    download,
    /\n {10}pattern: nightly-ui-chaos-summary-attempt-\$\{\{ github\.run_attempt \}\}-\*\n/,
  );
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

test(
  'the dispatch shell runs an exact replay once, keeps exploration bounded and refuses the wrong journey',
  { skip: process.platform === 'win32' },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'nightly-sequence-shell-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const shim = join(directory, 'pnpm');
    await writeFile(
      shim,
      `#!${process.execPath}\nconsole.log(JSON.stringify({ args: process.argv.slice(2), replay: process.env.UI_SEQUENCE_REPLAY ?? null }));\n`,
    );
    await chmod(shim, 0o700);
    const { chaos } = jobsIn(await readWorkflow());
    const step = stepBody(chaos, 'Replay the journey under seeded UI chaos');
    const script = step.split('run: |\n')[1];
    const env = {
      ...process.env,
      PATH: directory + ':' + process.env.PATH,
      JOURNEY: 'financial-action-sequences',
      CHAOS_SEED: '1422001',
      CHAOS_EVIDENCE: join(directory, 'private evidence'),
      SEQUENCE_REPLAY: 'payment-observation@narrow~10~0:2:1',
    };
    delete env.UI_SEQUENCE_REPLAY;
    const replay = spawnSync('bash', ['-e', '-c', script], {
      env,
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
    });
    assert.equal(replay.status, 0, replay.stderr);
    assert.deepEqual(JSON.parse(replay.stdout), {
      args: [
        'verify:journey',
        env.JOURNEY,
        '--chaos',
        env.CHAOS_SEED,
        '--output',
        env.CHAOS_EVIDENCE,
      ],
      replay: env.SEQUENCE_REPLAY,
    });
    const contextReplay = spawnSync('bash', ['-e', '-c', script], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: {
        ...env,
        JOURNEY: 'access-action-sequences',
        SEQUENCE_REPLAY: 'company-context@desktop~10~0:1',
      },
      encoding: 'utf8',
    });
    assert.equal(contextReplay.status, 0, contextReplay.stderr);
    assert.deepEqual(JSON.parse(contextReplay.stdout), {
      args: [
        'verify:journey',
        'access-action-sequences',
        '--chaos',
        env.CHAOS_SEED,
        '--output',
        env.CHAOS_EVIDENCE,
      ],
      replay: 'company-context@desktop~10~0:1',
    });
    const exploration = spawnSync('bash', ['-e', '-c', script], {
      env: { ...env, SEQUENCE_REPLAY: '', CHAOS_SEED: 'random' },
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
    });
    assert.equal(exploration.status, 0, exploration.stderr);
    assert.deepEqual(JSON.parse(exploration.stdout), {
      args: [
        'verify:journey',
        env.JOURNEY,
        '--chaos',
        'random',
        '--repeat',
        '20',
        '--budget-minutes',
        '15',
        '--output',
        env.CHAOS_EVIDENCE,
      ],
      replay: null,
    });
    const wrongJourney = spawnSync('bash', ['-e', '-c', script], {
      env: { ...env, JOURNEY: 'certification-journey' },
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
    });
    assert.equal(wrongJourney.status, 2);
    assert.match(wrongJourney.stderr, /no generated browser sequence case/u);
    assert.equal(wrongJourney.stdout, '');
  },
);
