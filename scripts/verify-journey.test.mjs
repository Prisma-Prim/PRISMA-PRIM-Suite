import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { plan as localBrowserPlan } from './verify-local-browser.mjs';
import { chaosRunSeed } from './ui-chaos.mjs';
import {
  journeyTestMatch,
  listChaosJourneys,
  listJourneys,
  parseJourneyArguments,
  planJourneyVerification,
  renderJourneyConfig,
  runJourneyVerification,
} from './verify-journey.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const script = fileURLToPath(new URL('./verify-journey.mjs', import.meta.url));
const startedAt = new Date('2026-11-08T10:11:12.345Z');

async function temporary(t, prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function cli(args, environment = {}) {
  const env = { ...process.env, ...environment };
  for (const [key, value] of Object.entries(environment))
    if (value === undefined) delete env[key];
  const child = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  const lines = child.stdout.trim().split('\n');
  return { ...child, final: JSON.parse(lines.at(-1)) };
}

test('parses one journey with single-run defaults', () => {
  assert.deepEqual(parseJourneyArguments(['ideas']), {
    action: 'run',
    journey: 'ideas',
    repeat: 1,
    cpuLoad: null,
    chaos: null,
    budgetMinutes: null,
    output: null,
  });
});

test('parses every flag in its separate and inline forms', () => {
  const expected = {
    action: 'run',
    journey: 'ideas',
    repeat: 3,
    cpuLoad: 'auto',
    chaos: 1234,
    budgetMinutes: 15,
    output: 'evidence',
  };
  assert.deepEqual(
    parseJourneyArguments([
      '--repeat',
      '3',
      'ideas',
      '--cpu-load',
      '--chaos',
      '1234',
      '--budget-minutes',
      '15',
      '--output',
      'evidence',
    ]),
    expected,
  );
  assert.deepEqual(
    parseJourneyArguments([
      'ideas',
      '--repeat=3',
      '--cpu-load=2',
      '--chaos=random',
      '--budget-minutes=15',
      '--output=evidence',
    ]),
    { ...expected, cpuLoad: 2, chaos: 'random' },
  );
  assert.equal(parseJourneyArguments(['--list']).action, 'list');
  assert.equal(parseJourneyArguments(['--help']).action, 'help');
});

test('refuses missing, extra and malformed arguments as usage errors', () => {
  for (const argv of [
    [],
    ['ideas', 'contract'],
    ['ideas', '--repeat'],
    ['ideas', '--repeat', '0'],
    ['ideas', '--repeat', '1.5'],
    ['ideas', '--repeat', '101'],
    ['ideas', '--repeat=x'],
    ['ideas', '--cpu-load=0'],
    ['ideas', '--cpu-load=two'],
    ['ideas', '--output'],
    ['ideas', '--chaos'],
    ['ideas', '--chaos', '0'],
    ['ideas', '--chaos', 'seed'],
    ['ideas', '--chaos=2147483648'],
    ['ideas', '--budget-minutes', '0'],
    ['ideas', '--budget-minutes=601'],
    ['ideas', '--fast'],
    ['--list', 'ideas'],
  ])
    assert.throws(
      () => parseJourneyArguments(argv),
      { name: 'JourneyUsageError' },
      JSON.stringify(argv),
    );
});

test('names each acceptance spec as one journey', async (t) => {
  const fixture = await temporary(t, 'verify-journey-list-');
  await mkdir(join(fixture, 'apps/web/e2e'), { recursive: true });
  for (const name of [
    'b-journey.acceptance.spec.ts',
    'a.acceptance.spec.ts',
    'a.acceptance.fixture.ts',
    'mocked.spec.ts',
  ])
    await writeFile(join(fixture, 'apps/web/e2e', name), '');
  assert.deepEqual(await listJourneys(fixture), ['a', 'b-journey']);

  const journeys = await listJourneys(root);
  assert.ok(journeys.includes('ideas'));
  assert.ok(journeys.includes('operational-foundation'));
});

test('selects exactly one spec file, never a suffix-sharing neighbour', () => {
  const match = journeyTestMatch('contract');
  assert.ok(match.test('/repo/apps/web/e2e/contract.acceptance.spec.ts'));
  assert.ok(
    match.test('C:\\repo\\apps\\web\\e2e\\contract.acceptance.spec.ts'),
  );
  assert.ok(
    !match.test('/repo/apps/web/e2e/model-contract.acceptance.spec.ts'),
  );
  assert.ok(!match.test('/repo/apps/web/e2e/contractXacceptance.spec.ts'));
});

test('plans the shared acceptance prebuild once and one fresh run per repetition', () => {
  const output = join(tmpdir(), 'journey-evidence');
  const plan = planJourneyVerification({
    root,
    journeys: ['contract', 'ideas'],
    journey: 'ideas',
    repeat: 2,
    cpuLoad: 'auto',
    output,
    parallelism: 4,
    playwrightCli: '/playwright/cli.js',
    startedAt,
  });
  const local = localBrowserPlan(root, output, 'acceptance');
  assert.deepEqual(
    plan.builds.map(({ command, args, cwd }) => ({ command, args, cwd })),
    local.builds,
  );
  assert.deepEqual(plan.environment, local.environment);
  assert.deepEqual(plan.clean, [
    ...local.cleanDirectories,
    ...local.cleanFiles,
  ]);
  assert.equal(plan.cpuLoadThreads, 4);
  assert.equal(plan.evidenceDirectory, output);
  assert.equal(plan.summaryFile, join(output, 'summary.json'));
  assert.equal(plan.runs.length, 2);
  assert.deepEqual(plan.runs[1], {
    run: 2,
    chaosSeed: null,
    replay: null,
    directory: join(output, 'run-2'),
    config: join(output, 'run-2', 'playwright.config.mjs'),
    results: join(output, 'run-2', 'results'),
    report: join(output, 'run-2', 'report.json'),
    log: join(output, 'run-2', 'playwright.log'),
    command: process.execPath,
    args: [
      '/playwright/cli.js',
      'test',
      '--config',
      join(output, 'run-2', 'playwright.config.mjs'),
    ],
    cwd: join(root, 'apps/web'),
  });

  const defaults = planJourneyVerification({
    root,
    journeys: ['ideas'],
    journey: 'ideas',
    repeat: 1,
    cpuLoad: 2,
    output: null,
    evidenceRoot: join(
      dirname(root),
      '.prisma-agent-evidence',
      'synthetic-journeys',
    ),
    parallelism: 4,
    playwrightCli: '/playwright/cli.js',
    startedAt,
  });
  assert.equal(defaults.cpuLoadThreads, 2);
  assert.equal(
    dirname(defaults.evidenceDirectory),
    join(dirname(root), '.prisma-agent-evidence', 'synthetic-journeys'),
  );
  assert.match(
    basename(defaults.evidenceDirectory),
    /^ideas-20261108T101112Z-[a-f\d-]{36}$/u,
  );

  const relative = planJourneyVerification({
    root,
    journeys: ['ideas'],
    journey: 'ideas',
    repeat: 1,
    cpuLoad: null,
    output: 'relative-evidence',
    parallelism: 4,
    playwrightCli: '/playwright/cli.js',
    startedAt,
  });
  assert.equal(relative.cpuLoadThreads, 0);
  assert.equal(relative.evidenceDirectory, resolve('relative-evidence'));
});

test('the public journey runner rejects source-tree evidence output before any build', async () => {
  const output = join(root, 'apps/web/test-results/SYNTHETIC_PRIVATE_OUTPUT');
  const environment = { ...process.env };
  delete environment.TEST_DATABASE_URL;
  const result = spawnSync(
    process.execPath,
    [script, 'ideas', '--output', output],
    { cwd: root, env: environment, encoding: 'utf8' },
  );
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout + result.stderr, /outside.*worktree/iu);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /SYNTHETIC_PRIVATE_OUTPUT/u,
  );
  await assert.rejects(access(output));
});

test('refuses an unknown journey and names the known ones', () => {
  assert.throws(
    () =>
      planJourneyVerification({
        root,
        journeys: ['contract', 'ideas'],
        journey: 'idea',
        repeat: 1,
        cpuLoad: null,
        output: null,
        parallelism: 1,
        playwrightCli: '/playwright/cli.js',
        startedAt,
      }),
    {
      name: 'JourneyUsageError',
      message: /Unknown journey "idea"[\s\S]*contract, ideas/u,
    },
  );
});

test('names the journeys that opt into UI chaos and refuses chaos on any other', async (t) => {
  const fixture = await temporary(t, 'verify-journey-chaos-');
  await mkdir(join(fixture, 'apps/web/e2e'), { recursive: true });
  await writeFile(
    join(fixture, 'apps/web/e2e/a.acceptance.spec.ts'),
    "import { expect, test } from './ui-chaos.fixture';\n",
  );
  await writeFile(
    join(fixture, 'apps/web/e2e/b.acceptance.spec.ts'),
    "import { expect, test } from '@playwright/test';\n",
  );
  assert.deepEqual(await listChaosJourneys(fixture), ['a']);
  assert.deepEqual(await listChaosJourneys(root), [
    'certification-journey',
    'multi-company-home',
  ]);

  const options = {
    root,
    journeys: ['contract', 'ideas'],
    repeat: 2,
    cpuLoad: null,
    output: join(tmpdir(), 'journey-evidence'),
    parallelism: 1,
    playwrightCli: '/playwright/cli.js',
    startedAt,
  };
  assert.throws(
    () =>
      planJourneyVerification({
        ...options,
        journey: 'contract',
        chaosSeed: 5,
        chaosJourneys: ['ideas'],
      }),
    {
      name: 'JourneyUsageError',
      message:
        /"contract" has not opted into UI chaos\. Chaos journeys: ideas/u,
    },
  );
  const plan = planJourneyVerification({
    ...options,
    journey: 'ideas',
    chaosSeed: 5,
    chaosJourneys: ['ideas'],
  });
  assert.equal(plan.chaosSeed, 5);
  assert.deepEqual(
    plan.runs.map(({ chaosSeed, replay }) => [chaosSeed, replay]),
    [
      [5, 'pnpm verify:journey ideas --chaos 5'],
      [
        chaosRunSeed(5, 2),
        `pnpm verify:journey ideas --chaos ${chaosRunSeed(5, 2)}`,
      ],
    ],
  );
});

test('wraps the canonical acceptance config with full evidence and a preview-only server', async () => {
  const plan = planJourneyVerification({
    root,
    journeys: ['contract'],
    journey: 'contract',
    repeat: 1,
    cpuLoad: null,
    output: join(tmpdir(), 'journey-evidence'),
    parallelism: 1,
    playwrightCli: '/playwright/cli.js',
    startedAt,
  });
  const text = renderJourneyConfig(plan, plan.runs[0]);
  // The wrapper refuses to start when the canonical server stops being
  // exactly "the prebuild steps, then preview", so the prebuild cannot drift.
  const canonicalCommand =
    'pnpm --filter @prisma-prim/api build && pnpm build --mode local-demo && pnpm preview --host 127.0.0.1 --port 4173';
  assert.ok(text.includes(JSON.stringify(canonicalCommand)));
  assert.ok(
    (
      await readFile(
        join(root, 'apps/web/playwright.acceptance.config.ts'),
        'utf8',
      )
    ).includes(canonicalCommand),
  );
  assert.ok(
    text.includes(
      `command: ${JSON.stringify('pnpm preview --host 127.0.0.1 --port 4173')}`,
    ),
  );
  assert.ok(text.includes(journeyTestMatch('contract').toString()));
  assert.ok(text.includes("trace: 'on'"));
  assert.ok(text.includes("screenshot: 'on'"));
  assert.ok(text.includes(JSON.stringify(plan.runs[0].results)));
  assert.ok(text.includes(JSON.stringify(plan.runs[0].report)));
  assert.ok(text.includes('timeout: 180000'));
});

async function runFixture(
  t,
  {
    repeat = 1,
    cpuLoad = null,
    chaosSeed = null,
    budgetMinutes = null,
    runMinutes = 0,
    outcomes,
  },
) {
  // A fake clock that each Playwright run advances by runMinutes.
  let clock = 0;
  const fixture = await temporary(t, 'verify-journey-run-');
  await mkdir(join(fixture, 'apps/web/e2e'), { recursive: true });
  await mkdir(join(fixture, 'apps/web/dist'), { recursive: true });
  await writeFile(join(fixture, 'apps/web/dist/stale.js'), '');
  const output = join(fixture, 'evidence');
  const plan = planJourneyVerification({
    root: fixture,
    journeys: ['ideas'],
    journey: 'ideas',
    repeat,
    cpuLoad,
    chaosSeed,
    chaosJourneys: ['ideas'],
    budgetMinutes,
    output,
    parallelism: 3,
    playwrightCli: '/playwright/cli.js',
    startedAt,
  });
  const events = [];
  const seeds = [];
  const execute = async (step, { log }) => {
    await writeFile(log, 'log\n');
    if (step.command !== process.execPath) {
      events.push(`build ${step.args.join(' ')}`);
      return outcomes.build ?? { exitCode: 0, signal: null };
    }
    const run = plan.runs.find((candidate) => candidate.log === log);
    events.push(`run ${run.run}`);
    seeds.push(step.env.UI_CHAOS_SEED);
    clock += runMinutes * 60_000;
    const outcome = outcomes.runs[run.run - 1];
    const evidence = join(run.results, 'ideas-desktop');
    await mkdir(evidence, { recursive: true });
    await writeFile(join(evidence, 'validation.png'), 'png');
    await writeFile(join(evidence, 'trace.zip'), 'zip');
    if (outcome.report)
      await writeFile(run.report, JSON.stringify(outcome.report));
    return { exitCode: outcome.exitCode, signal: null };
  };
  const startCpuLoad = (threads) => {
    events.push(`load ${threads}`);
    return async () => events.push('unload');
  };
  const summary = await runJourneyVerification(plan, {
    execute,
    startCpuLoad,
    report: () => {},
    now: () => clock,
  });
  return { fixture, plan, events, seeds, summary };
}

function playwrightReport({
  expected = 0,
  unexpected = 0,
  failures = [],
  errors = [],
}) {
  return {
    stats: { expected, unexpected, flaky: 0, skipped: 0 },
    errors: errors.map((message) => ({ message })),
    suites: [
      {
        title: 'ideas.acceptance.spec.ts',
        specs: [],
        suites: [
          {
            title: 'Ideas',
            suites: [],
            specs: failures.map((title) => ({
              title,
              tests: [
                {
                  projectName: 'operational-acceptance-narrow',
                  status: 'unexpected',
                  results: [
                    {
                      errors: [
                        {
                          message:
                            '\n\u001b[31mError: Timed out waiting for the idea\u001b[39m\n\n  at ideas.acceptance.spec.ts:12',
                        },
                      ],
                    },
                  ],
                },
              ],
            })),
          },
        ],
      },
    ],
  };
}

test('passes every repetition under load and returns its evidence paths', async (t) => {
  const { fixture, plan, events, summary } = await runFixture(t, {
    repeat: 2,
    cpuLoad: 'auto',
    outcomes: {
      runs: [
        { exitCode: 0, report: playwrightReport({ expected: 2 }) },
        { exitCode: 0, report: playwrightReport({ expected: 2 }) },
      ],
    },
  });
  assert.deepEqual(events, [
    'build --filter @prisma-prim/api build',
    'build build --mode local-demo',
    'load 3',
    'run 1',
    'run 2',
    'unload',
  ]);
  await assert.rejects(access(join(fixture, 'apps/web/dist/stale.js')));
  assert.equal(summary.status, 'passed');
  assert.equal(summary.exitCode, 0);
  assert.equal(summary.runs.length, 2);
  assert.deepEqual(summary.runs[0].tests, {
    passed: 2,
    failed: 0,
    flaky: 0,
    skipped: 0,
  });
  assert.deepEqual(summary.runs[1].screenshots, [
    join(plan.runs[1].results, 'ideas-desktop', 'validation.png'),
  ]);
  assert.deepEqual(summary.runs[1].traces, [
    join(plan.runs[1].results, 'ideas-desktop', 'trace.zip'),
  ]);
  assert.deepEqual(
    JSON.parse(await readFile(plan.summaryFile, 'utf8')),
    summary,
  );
});

test('stops at the first failed repetition and names the failing test', async (t) => {
  const { events, summary } = await runFixture(t, {
    repeat: 3,
    outcomes: {
      runs: [
        { exitCode: 0, report: playwrightReport({ expected: 2 }) },
        {
          exitCode: 1,
          report: playwrightReport({
            expected: 1,
            unexpected: 1,
            failures: ['records a deferred idea'],
          }),
        },
        { exitCode: 0, report: playwrightReport({ expected: 2 }) },
      ],
    },
  });
  assert.deepEqual(events.slice(-2), ['run 1', 'run 2']);
  assert.equal(summary.status, 'failed');
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.runs.length, 2);
  assert.deepEqual(summary.runs[1].failures, [
    {
      title: 'ideas.acceptance.spec.ts › Ideas › records a deferred idea',
      project: 'operational-acceptance-narrow',
      error: 'Error: Timed out waiting for the idea',
    },
  ]);
});

test('hands each chaos repetition its own seed and replay command, never a stale one', async (t) => {
  process.env.UI_CHAOS_SEED = '999';
  t.after(() => delete process.env.UI_CHAOS_SEED);
  const failing = playwrightReport({
    expected: 1,
    unexpected: 1,
    failures: ['records a deferred idea'],
  });
  const chaos = await runFixture(t, {
    repeat: 3,
    chaosSeed: 1234,
    outcomes: {
      runs: [
        { exitCode: 0, report: playwrightReport({ expected: 2 }) },
        { exitCode: 1, report: failing },
      ],
    },
  });
  const second = chaosRunSeed(1234, 2);
  assert.deepEqual(chaos.seeds, ['1234', String(second)]);
  assert.equal(chaos.summary.chaosSeed, 1234);
  assert.equal(chaos.summary.status, 'failed');
  assert.deepEqual(
    chaos.summary.runs.map(({ chaosSeed, replay }) => ({ chaosSeed, replay })),
    [
      {
        chaosSeed: 1234,
        replay: 'pnpm verify:journey ideas --chaos 1234',
      },
      {
        chaosSeed: second,
        replay: `pnpm verify:journey ideas --chaos ${second}`,
      },
    ],
  );
  const config = await readFile(chaos.plan.runs[1].config, 'utf8');
  assert.ok(config.includes('expect: { ...base.expect, timeout: 20000 }'));

  // Without --chaos, a seed left in the shell never reaches the journey.
  const plain = await runFixture(t, {
    outcomes: {
      runs: [{ exitCode: 0, report: playwrightReport({ expected: 2 }) }],
    },
  });
  assert.deepEqual(plain.seeds, [undefined]);
  assert.equal(plain.summary.runs[0].chaosSeed, null);
  assert.ok(
    !(await readFile(plain.plan.runs[0].config, 'utf8')).includes('expect:'),
  );
});

test('a time budget never starts a repetition it expects to overrun', async (t) => {
  // Each run lasts 6 minutes on the fake clock; the budget is 15 minutes:
  // after two runs, a third would end at 18.
  const passing = { exitCode: 0, report: playwrightReport({ expected: 2 }) };
  const { events, summary } = await runFixture(t, {
    repeat: 10,
    chaosSeed: 7,
    budgetMinutes: 15,
    runMinutes: 6,
    outcomes: { runs: Array.from({ length: 10 }, () => passing) },
  });
  assert.deepEqual(
    events.filter((event) => event.startsWith('run')),
    ['run 1', 'run 2'],
  );
  assert.equal(summary.status, 'passed');
  assert.equal(summary.exitCode, 0);
  assert.equal(summary.stoppedByBudget, true);
  assert.equal(summary.budgetMinutes, 15);
  assert.deepEqual(
    summary.runs.map((run) => run.durationMilliseconds),
    [360_000, 360_000],
  );
});

test('reports a failed prebuild as an environment error without running the journey', async (t) => {
  const { events, plan, summary } = await runFixture(t, {
    outcomes: { build: { exitCode: 2, signal: null }, runs: [] },
  });
  assert.deepEqual(events, ['build --filter @prisma-prim/api build']);
  assert.equal(summary.status, 'error');
  assert.equal(summary.exitCode, 3);
  assert.deepEqual(summary.runs, []);
  assert.ok(summary.message.includes(plan.builds[0].log));
});

test('separates a run that could not start from a journey failure', async (t) => {
  const setup = await runFixture(t, {
    outcomes: {
      runs: [
        {
          exitCode: 1,
          report: playwrightReport({
            errors: [
              '\u001b[31mError: connect ECONNREFUSED\u001b[39m postgresql://user:secret@127.0.0.1:5/x_test',
            ],
          }),
        },
      ],
    },
  });
  assert.equal(setup.summary.status, 'error');
  assert.equal(setup.summary.exitCode, 3);
  assert.equal(
    setup.summary.runs[0].message,
    'Error: connect ECONNREFUSED [redacted PostgreSQL URL]',
  );

  const empty = await runFixture(t, {
    outcomes: { runs: [{ exitCode: 0, report: playwrightReport({}) }] },
  });
  assert.equal(empty.summary.status, 'error');
  assert.equal(empty.summary.runs[0].message, 'No test ran.');

  const missing = await runFixture(t, {
    outcomes: { runs: [{ exitCode: 1 }] },
  });
  assert.equal(missing.summary.status, 'error');
  assert.match(missing.summary.runs[0].message, /exited with code 1/u);
});

test('command line: an unknown journey is a usage error that lists the journeys', () => {
  const child = cli(['no-such-journey']);
  assert.equal(child.status, 2);
  assert.match(child.stderr, /Unknown journey "no-such-journey"/u);
  assert.match(child.stderr, /operational-foundation/u);
  assert.equal(child.final.status, 'usage-error');
  assert.equal(child.final.exitCode, 2);
  assert.ok(child.final.journeys.includes('ideas'));
});

test('command line: a bad flag is a usage error', () => {
  const child = cli(['ideas', '--repeat', '0']);
  assert.equal(child.status, 2);
  assert.match(child.stderr, /--repeat/u);
  assert.equal(child.final.exitCode, 2);
});

test('command line: chaos on a journey without the chaos fixture is a usage error', () => {
  const child = cli(['ideas', '--chaos', 'random']);
  assert.equal(child.status, 2);
  assert.match(child.stderr, /"ideas" has not opted into UI chaos/u);
  assert.match(child.stderr, /certification-journey, multi-company-home/u);
  assert.equal(child.final.status, 'usage-error');
});

test('command line: --list prints one journey name per line', () => {
  const child = spawnSync(process.execPath, [script, '--list'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(child.status, 0);
  const names = child.stdout.trim().split(/\r?\n/u);
  assert.ok(names.includes('ideas'));
  assert.deepEqual(names, [...names].sort());
});

test('command line: refuses to build without a local test database', async (t) => {
  const output = join(await temporary(t, 'verify-journey-cli-'), 'evidence');
  const missing = cli(['ideas', '--output', output], {
    TEST_DATABASE_URL: undefined,
  });
  assert.equal(missing.status, 3);
  assert.match(missing.stderr, /managed-postgres/u);
  assert.equal(missing.final.status, 'error');
  await assert.rejects(access(output));

  const remote = cli(['ideas', '--output', output], {
    TEST_DATABASE_URL: 'postgresql://user:secret@db.example.test:5432/app_test',
  });
  assert.equal(remote.status, 3);
  assert.doesNotMatch(
    remote.stdout + remote.stderr,
    /secret|db\.example\.test/u,
  );
  await assert.rejects(access(output));
});
