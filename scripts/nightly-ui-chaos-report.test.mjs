import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CHAOS_JOURNEYS,
  bugCiting,
  nightOf,
  nightsInComment,
  parseChaosSummary,
  readChaosSummaries,
  renderWeek,
  reportNightlyUiChaos,
  weekOf,
  withNight,
} from './nightly-ui-chaos-report.mjs';

const sha = 'c0ffee12'.padEnd(40, '0');
const server = 'https://github.com';
const repository = 'owner/repo';

function summary(journey, runs, extra = {}) {
  return {
    schema: 'prisma-prim-journey-verification/v1',
    journey,
    status: runs.at(-1).status,
    chaosSeed: runs[0].chaosSeed,
    stoppedByBudget: false,
    message: null,
    runs: runs.map((run, index) => ({
      run: index + 1,
      replay: `ignored: rebuilt from the journey and seed`,
      failures: [],
      ...run,
    })),
    ...extra,
  };
}
const passingCertification = summary(
  'certification-journey',
  [
    { status: 'passed', chaosSeed: 11 },
    { status: 'passed', chaosSeed: 12 },
  ],
  { stoppedByBudget: true },
);
const failingHome = summary('multi-company-home', [
  { status: 'passed', chaosSeed: 21 },
  {
    status: 'failed',
    chaosSeed: 1376001,
    failures: [
      {
        title: 'multi-company-home.acceptance.spec.ts › uses summaries',
        project: 'operational-acceptance-narrow',
        error: 'Error: expect(locator).not.toContainText(`Primary`) @owner',
      },
    ],
  },
]);

const passingFinancial = summary('financial-action-sequences', [
  {
    status: 'passed',
    chaosSeed: 1422001,
    sequences: ['payment-observation', 'invoice-record'].flatMap((caseId) =>
      ['desktop', 'narrow'].map((width) => ({
        caseId,
        width,
        seed: 1422001,
        steps: 10,
        status: 'passed',
        runs: 2,
        shrinks: 0,
        durationMilliseconds: 1000,
        path: null,
        coverage: { 'locale:fr': 1 },
      })),
    ),
  },
]);
const passingAccess = summary('access-action-sequences', [
  {
    status: 'passed',
    chaosSeed: 1425001,
    sequences: ['workspace-access', 'company-context'].flatMap((caseId) =>
      ['desktop', 'narrow'].map((width) => ({
        caseId,
        width,
        seed: 1425001,
        steps: 10,
        status: 'passed',
        runs: 2,
        shrinks: 0,
        durationMilliseconds: 1000,
        path: null,
        coverage: { 'company:aba': 1 },
      })),
    ),
  },
]);

const passingDocuments = summary('document-action-sequences', [
  {
    status: 'passed',
    chaosSeed: 1427001,
    sequences: ['document-version', 'document-pdf', 'payment-evidence'].flatMap(
      (caseId) =>
        ['desktop', 'narrow'].map((width) => ({
          caseId,
          width,
          seed: 1427001,
          steps: 10,
          status: 'passed',
          runs: 2,
          shrinks: 0,
          durationMilliseconds: 1000,
          path: null,
          coverage: { 'retry-exact-command-with-double-admission': 1 },
        })),
    ),
  },
]);

const passingContract = summary('contract-action-sequences', [
  {
    status: 'passed',
    chaosSeed: 1431001,
    sequences: ['desktop', 'narrow'].map((width) => ({
      caseId: 'contract-signing',
      width,
      seed: 1431001,
      steps: 10,
      status: 'passed',
      runs: 2,
      shrinks: 0,
      durationMilliseconds: 1000,
      path: null,
      coverage: { 'retry-exact-contract-command-with-double-admission': 1 },
    })),
  },
]);

const passingProfitabilityOwners = summary(
  'profitability-owner-action-sequences',
  [
    {
      status: 'passed',
      chaosSeed: 1464001,
      sequences: ['desktop', 'narrow'].map((width) => ({
        caseId: 'profitability-version-owner',
        width,
        seed: 1464001,
        steps: 10,
        status: 'passed',
        runs: 2,
        shrinks: 0,
        durationMilliseconds: 1000,
        path: null,
        coverage: { 'edit-explicit-cost-and-price': 1 },
      })),
    },
  ],
);

function workflowRun({
  id = 501,
  attempt = 1,
  startedAt = '2026-11-14T02:21:07Z',
  event = 'schedule',
} = {}) {
  return {
    id,
    run_attempt: attempt,
    event,
    head_sha: sha,
    run_started_at: startedAt,
  };
}
const jobs = [
  {
    name: 'chaos (certification-journey)',
    conclusion: 'success',
    started_at: '2026-11-14T02:21:30Z',
    completed_at: '2026-11-14T02:40:00Z',
  },
  {
    name: 'chaos (multi-company-home)',
    conclusion: 'failure',
    started_at: '2026-11-14T02:21:31Z',
    completed_at: '2026-11-14T02:33:31Z',
  },
  {
    name: 'chaos (financial-action-sequences)',
    conclusion: 'success',
    started_at: '2026-11-14T02:21:31Z',
    completed_at: '2026-11-14T02:25:31Z',
  },
  {
    name: 'chaos (access-action-sequences)',
    conclusion: 'success',
    started_at: '2026-11-14T02:21:31Z',
    completed_at: '2026-11-14T02:25:31Z',
  },
  {
    name: 'chaos (document-action-sequences)',
    conclusion: 'success',
    started_at: '2026-11-14T02:21:31Z',
    completed_at: '2026-11-14T02:25:31Z',
  },
  {
    name: 'chaos (contract-action-sequences)',
    conclusion: 'success',
    started_at: '2026-11-14T02:21:31Z',
    completed_at: '2026-11-14T02:25:31Z',
  },
  {
    name: 'chaos (profitability-owner-action-sequences)',
    conclusion: 'success',
    started_at: '2026-11-14T02:21:31Z',
    completed_at: '2026-11-14T02:25:31Z',
  },
  { name: 'report', conclusion: null, started_at: null, completed_at: null },
];
const summaries = () =>
  new Map([
    [
      'certification-journey',
      parseChaosSummary(JSON.stringify(passingCertification)),
    ],
    ['multi-company-home', parseChaosSummary(JSON.stringify(failingHome))],
    [
      'financial-action-sequences',
      parseChaosSummary(JSON.stringify(passingFinancial)),
    ],
    [
      'access-action-sequences',
      parseChaosSummary(JSON.stringify(passingAccess)),
    ],
    [
      'document-action-sequences',
      parseChaosSummary(JSON.stringify(passingDocuments)),
    ],
    [
      'contract-action-sequences',
      parseChaosSummary(JSON.stringify(passingContract)),
    ],
    [
      'profitability-owner-action-sequences',
      parseChaosSummary(JSON.stringify(passingProfitabilityOwners)),
    ],
  ]);

/** An in-memory GitHub REST API that records every write. */
function github({
  comments = [],
  bugs = [],
  inspection = [{ number: 1132 }],
  run = workflowRun(),
} = {}) {
  const calls = [];
  async function api(method, path, body) {
    calls.push({ method, path, body });
    if (method === 'GET' && path === `actions/runs/${run.id}`) return run;
    if (
      method === 'GET' &&
      path ===
        `actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`
    )
      return { jobs };
    if (
      method === 'GET' &&
      path === 'issues?labels=weekly-inspection&state=open&per_page=100'
    )
      return inspection;
    if (
      method === 'GET' &&
      path === 'issues?labels=fuzz-found&state=all&per_page=100'
    )
      return bugs;
    const listed = /^issues\/1132\/comments\?per_page=100&page=(\d+)$/u.exec(
      path,
    );
    if (method === 'GET' && listed) return listed[1] === '1' ? comments : [];
    if (method === 'POST' && path === 'issues/1132/comments') return { id: 77 };
    if (method === 'PATCH' && /^issues\/comments\/\d+$/u.test(path)) return {};
    throw new Error(`unexpected ${method} ${path}`);
  }
  const writes = () => calls.filter((call) => call.method !== 'GET');
  return { api, writes };
}
const quiet = () => {};
const report = (api, extra = {}) =>
  reportNightlyUiChaos({
    ref: 'refs/heads/main',
    runId: 501,
    summaries: summaries(),
    server,
    repository,
    api,
    log: quiet,
    ...extra,
  });

test('a summary is read only for a nightly journey with a seed on every run', () => {
  const parsed = parseChaosSummary(JSON.stringify(failingHome));
  assert.deepEqual(parsed, {
    journey: 'multi-company-home',
    status: 'failed',
    stoppedByBudget: false,
    runs: 2,
    passed: 1,
    message: null,
    failures: [
      {
        run: 2,
        seed: 1376001,
        project: 'operational-acceptance-narrow',
        title: 'multi-company-home.acceptance.spec.ts › uses summaries',
        error: 'Error: expect(locator).not.toContainText(`Primary`) @owner',
      },
    ],
  });
  for (const broken of [
    'not json',
    'null',
    JSON.stringify({ ...failingHome, journey: 'ideas' }),
    JSON.stringify({ ...failingHome, chaosSeed: null }),
    JSON.stringify({ ...failingHome, status: 'green' }),
    JSON.stringify({
      ...failingHome,
      runs: [{ run: 1, status: 'passed', chaosSeed: 0, failures: [] }],
    }),
    JSON.stringify({
      ...failingHome,
      runs: [
        { run: 1, status: 'failed', chaosSeed: 5, failures: [{ title: 1 }] },
      ],
    }),
  ])
    assert.equal(parseChaosSummary(broken), null, broken);
});

test("each journey's downloaded summary is found by journey", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ui-chaos-summaries-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [folder, content] of [
    [
      'nightly-ui-chaos-summary-certification-journey',
      JSON.stringify(passingCertification),
    ],
    [
      'nightly-ui-chaos-summary-multi-company-home',
      JSON.stringify(failingHome),
    ],
    [
      'nightly-ui-chaos-summary-financial-action-sequences',
      JSON.stringify(passingFinancial),
    ],
    [
      'nightly-ui-chaos-summary-access-action-sequences',
      JSON.stringify(passingAccess),
    ],
    [
      'nightly-ui-chaos-summary-document-action-sequences',
      JSON.stringify(passingDocuments),
    ],
    [
      'nightly-ui-chaos-summary-contract-action-sequences',
      JSON.stringify(passingContract),
    ],
    [
      'nightly-ui-chaos-summary-profitability-owner-action-sequences',
      JSON.stringify(passingProfitabilityOwners),
    ],
    ['nightly-ui-chaos-summary-broken', '{'],
  ]) {
    await mkdir(join(directory, folder), { recursive: true });
    await writeFile(join(directory, folder, 'summary.json'), content);
  }
  const found = readChaosSummaries(directory);
  assert.deepEqual([...found.keys()].sort(), [...CHAOS_JOURNEYS].sort());
  assert.equal(readChaosSummaries(join(directory, 'missing')).size, 0);
});

test('a night keeps each journey job runtime, runs and failures', () => {
  const night = nightOf({ run: workflowRun(), jobs, summaries: summaries() });
  assert.equal(night.runId, 501);
  assert.equal(night.startedAt, '2026-11-14T02:21:07Z');
  assert.deepEqual(
    night.journeys.map(
      ({ journey, conclusion, jobMinutes, runs, passed, stoppedByBudget }) => [
        journey,
        conclusion,
        jobMinutes,
        runs,
        passed,
        stoppedByBudget,
      ],
    ),
    [
      ['certification-journey', 'success', 18.5, 2, 2, true],
      ['multi-company-home', 'failure', 12, 2, 1, false],
      ['financial-action-sequences', 'success', 4, 1, 1, false],
      ['access-action-sequences', 'success', 4, 1, 1, false],
      ['document-action-sequences', 'success', 4, 1, 1, false],
      ['contract-action-sequences', 'success', 4, 1, 1, false],
      ['profitability-owner-action-sequences', 'success', 4, 1, 1, false],
    ],
  );
  assert.equal(weekOf('2026-11-14T02:21:07Z'), '2026-11-09');
  assert.equal(weekOf('2026-11-16T00:00:00Z'), '2026-11-16');
  assert.equal(weekOf('2026-11-15T23:59:59Z'), '2026-11-09');
});

test('the first night of a week opens its comment with runtime, failure, seed, replay and triage', async () => {
  const { api, writes } = github();
  await report(api);
  const [post] = writes();
  assert.equal(post.method, 'POST');
  assert.equal(post.path, 'issues/1132/comments');
  const body = post.body.body;
  assert.ok(
    body.includes('[run-501]: https://github.com/owner/repo/actions/runs/501'),
  );
  assert.ok(
    body.includes(
      `[commit-${sha}]: https://github.com/owner/repo/commit/${sha}`,
    ),
  );
  assert.ok(
    body.startsWith(
      '<!-- nightly-ui-chaos week=2026-11-09 -->\n## Nightly UI chaos, week of 2026-11-09',
    ),
  );
  assert.ok(
    body.includes(
      '| 2026-11-14 02:21 | [nightly][run-501] | [`c0ffee1`][commit-' +
        sha +
        '] | certification-journey | 2 of 2 (budget) | passed | 18.5 min |',
    ),
  );
  assert.ok(
    body.includes('| multi-company-home | 1 of 2 | failed | 12.0 min |'),
  );
  assert.ok(
    body.includes(
      '**Failures:** 1 in this comment, 0 filed as a real bug, 1 not filed (a false alarm once triaged).',
    ),
  );
  assert.ok(
    body.includes(
      'Seed `1376001`; replay `pnpm verify:journey multi-company-home --chaos 1376001`. Triage: not filed.',
    ),
  );
  // Run text never mentions anyone nor closes its code span.
  assert.ok(
    body.includes(
      "`Error: expect(locator).not.toContainText('Primary') (at)owner`",
    ),
  );
  assert.ok(!body.includes('@owner'));
  assert.deepEqual(
    nightsInComment(body, '2026-11-09').map((night) => night.runId),
    [501],
  );
});

test('a later night and a rerun of the same night update the one comment of the week', async () => {
  const first = github();
  await report(first.api);
  const existing = { id: 42, body: first.writes()[0].body.body, html_url: 'u' };

  const later = github({
    comments: [{ id: 41, body: 'Delivery metrics' }, existing],
    run: workflowRun({ id: 502, startedAt: '2026-11-15T02:20:00Z' }),
  });
  await reportNightlyUiChaos({
    ref: 'refs/heads/main',
    runId: 502,
    summaries: new Map([
      [
        'certification-journey',
        parseChaosSummary(JSON.stringify(passingCertification)),
      ],
    ]),
    server,
    repository,
    api: later.api,
    log: quiet,
  });
  const [patch] = later.writes();
  assert.equal(patch.method, 'PATCH');
  assert.equal(patch.path, 'issues/comments/42');
  const nights = nightsInComment(patch.body.body, '2026-11-09');
  assert.deepEqual(
    nights.map((night) => night.runId),
    [501, 502],
  );
  // The multi-company-home job of the later night left no summary.
  assert.ok(
    patch.body.body.includes(
      '**Could not run:** 2026-11-15 multi-company-home (failed without a summary); 2026-11-15 financial-action-sequences (success without a summary); 2026-11-15 access-action-sequences (success without a summary); 2026-11-15 document-action-sequences (success without a summary); 2026-11-15 contract-action-sequences (success without a summary); 2026-11-15 profitability-owner-action-sequences (success without a summary).',
    ),
  );

  const rerun = github({
    comments: [{ ...existing, body: patch.body.body }],
    run: workflowRun({
      id: 502,
      attempt: 2,
      startedAt: '2026-11-15T03:00:00Z',
    }),
  });
  await reportNightlyUiChaos({
    ref: 'refs/heads/main',
    runId: 502,
    summaries: summaries(),
    server,
    repository,
    api: rerun.api,
    log: quiet,
  });
  const replaced = nightsInComment(rerun.writes()[0].body.body, '2026-11-09');
  assert.deepEqual(
    replaced.map((night) => [night.runId, night.attempt]),
    [
      [501, 1],
      [502, 2],
    ],
  );
});

test('a failure whose seed a fuzz-found issue cites is shown as a real bug', async () => {
  const { api, writes } = github({
    bugs: [
      {
        number: 1400,
        title: 'Stale Projects after a Company switch',
        body: 'Found by the nightly UI chaos, seed `1376001`.',
      },
      {
        number: 1401,
        title: 'Another',
        body: 'Unrelated #13760010 and 1376001x',
      },
    ],
  });
  await report(api);
  const body = writes()[0].body.body;
  assert.ok(body.includes('Triage: real bug #1400.'));
  assert.ok(body.includes('1 filed as a real bug, 0 not filed'));
  assert.equal(
    bugCiting([{ number: 3, title: 'x', body: 'replay with --chaos 77' }], 77),
    3,
  );
  assert.equal(
    bugCiting([{ number: 3, title: 'x', body: 'issue #77' }], 77),
    null,
  );
});

test('an unreadable comment of the week stays as it is and the night goes to a new one', async () => {
  const broken = {
    id: 42,
    html_url: 'https://github.com/owner/repo/issues/1132#issuecomment-42',
    body: '<!-- nightly-ui-chaos week=2026-11-09 -->\nedited by hand <!-- nightly-ui-chaos-data {oops} -->',
  };
  const { api, writes } = github({ comments: [broken] });
  await report(api);
  const [post] = writes();
  assert.equal(post.method, 'POST');
  assert.ok(
    post.body.body.includes(
      'The earlier comment of this week has unreadable data and stays as it is: [comment](https://github.com/owner/repo/issues/1132#issuecomment-42).',
    ),
  );
  assert.equal(nightsInComment(broken.body, '2026-11-09'), null);
  assert.deepEqual(nightsInComment('Delivery metrics', '2026-11-09'), []);
});

test('only main reports, and only to an open weekly-inspection issue', async () => {
  const branch = github();
  await report(branch.api, { ref: 'refs/heads/test/1376-ui-chaos-nightly' });
  assert.deepEqual(branch.writes(), []);

  const none = github({ inspection: [] });
  await assert.rejects(report(none.api), /No open weekly-inspection issue/u);
  assert.deepEqual(none.writes(), []);
});

test('the data block survives any run text', () => {
  const night = nightOf({ run: workflowRun(), jobs, summaries: summaries() });
  night.journeys[1].failures[0].error = 'a --> b <!-- c';
  const body = renderWeek({
    week: '2026-11-09',
    nights: withNight([], night),
    bugs: new Map(),
    server,
    repository,
  });
  assert.deepEqual(nightsInComment(body, '2026-11-09'), [night]);
});

test('keeps financial sequence coverage, reductions and exact replay in the weekly inspection', () => {
  const raw = summary('financial-action-sequences', [
    {
      status: 'failed',
      chaosSeed: 1422001,
      failures: [
        {
          title: 'Generated Payment action sequences',
          project: 'operational-acceptance-narrow',
          error: 'A conserved amount changed.',
        },
      ],
      sequences: [
        {
          caseId: 'payment-observation',
          width: 'narrow',
          seed: 1422001,
          steps: 10,
          status: 'failed',
          runs: 1,
          shrinks: 3,
          durationMilliseconds: 1500,
          path: '0:2:1',
          coverage: { 'locale:fr': 2 },
          replay: 'untrusted command',
        },
      ],
    },
  ]);
  const parsed = parseChaosSummary(JSON.stringify(raw));
  assert.ok(parsed);
  assert.equal(parsed.sequences[0].shrinks, 3);
  const night = nightOf({
    run: workflowRun(),
    jobs: [
      {
        name: 'chaos (financial-action-sequences)',
        conclusion: 'failure',
        started_at: '2026-11-14T02:21:00Z',
        completed_at: '2026-11-14T02:25:00Z',
      },
    ],
    summaries: new Map([['financial-action-sequences', parsed]]),
  });
  const body = renderWeek({
    week: '2026-11-09',
    nights: [night],
    bugs: new Map(),
    server,
    repository,
  });
  assert.ok(body.includes('payment-observation / narrow'));
  assert.ok(body.includes('locale:fr=2'));
  assert.ok(
    body.includes(
      "UI_SEQUENCE_REPLAY='payment-observation@narrow~10~0:2:1' pnpm verify:journey financial-action-sequences --chaos 1422001",
    ),
  );
  assert.ok(!body.includes('untrusted command'));
  assert.deepEqual(nightsInComment(body, '2026-11-09'), [night]);
});

test('a manual replay reports only the selected job and retains old two-journey comments', () => {
  const night = nightOf({
    run: workflowRun({ event: 'workflow_dispatch' }),
    jobs: jobs.filter(
      (entry) => entry.name === 'chaos (financial-action-sequences)',
    ),
    summaries: new Map([
      [
        'financial-action-sequences',
        parseChaosSummary(JSON.stringify(passingFinancial)),
      ],
    ]),
  });
  assert.deepEqual(
    night.journeys.map((entry) => entry.journey),
    ['financial-action-sequences'],
  );
  const historical = nightOf({
    run: workflowRun(),
    jobs,
    summaries: summaries(),
  });
  historical.journeys = historical.journeys.filter(
    (entry) => entry.journey !== 'financial-action-sequences',
  );
  const body = renderWeek({
    week: '2026-11-09',
    nights: [historical],
    bugs: new Map(),
    server,
    repository,
  });
  assert.deepEqual(nightsInComment(body, '2026-11-09'), [historical]);
});

function financialWeekSample(day, repetitions) {
  const raw = summary(
    'financial-action-sequences',
    Array.from({ length: repetitions }, (_, index) => {
      const seed = 1422001 + day * 100 + index;
      return {
        status: 'passed',
        chaosSeed: seed,
        sequences: ['payment-observation', 'invoice-record'].flatMap((caseId) =>
          ['desktop', 'narrow'].map((width) => ({
            caseId,
            width,
            seed,
            steps: 10,
            status: 'passed',
            runs: 2,
            shrinks: 0,
            durationMilliseconds: 1000,
            path: null,
            coverage: {
              'locale:fr': 2,
              'open-recorded-observation': 1,
              'return-to-inventory': 1,
              'start-literal-draft': 1,
              'submit-and-lose-committed-reply': 1,
              'retry-identically-with-double-click': 1,
            },
          })),
        ),
      };
    }),
  );
  return raw;
}

test('the financial-only repetition week remains bounded within one GitHub comment', (t) => {
  for (const repetitions of [6, 20]) {
    const nights = Array.from({ length: 7 }, (_, day) => {
      const raw = financialWeekSample(day, repetitions);
      return nightOf({
        run: workflowRun({
          id: 501 + day,
          startedAt: `2026-11-${String(9 + day).padStart(2, '0')}T02:20:00Z`,
        }),
        jobs: jobs.filter(
          (job) =>
            ![
              'chaos (access-action-sequences)',
              'chaos (document-action-sequences)',
              'chaos (contract-action-sequences)',
              'chaos (profitability-owner-action-sequences)',
            ].includes(job.name),
        ),
        summaries: new Map([
          ...[...summaries()].filter(
            ([journey]) =>
              ![
                'access-action-sequences',
                'document-action-sequences',
                'contract-action-sequences',
                'profitability-owner-action-sequences',
              ].includes(journey),
          ),
          [
            'financial-action-sequences',
            parseChaosSummary(JSON.stringify(raw)),
          ],
        ]),
      });
    });
    const body = renderWeek({
      week: '2026-11-09',
      nights,
      bugs: new Map([[1376001, 1400]]),
      server,
      repository,
    });
    assert.ok(
      body.length <= 65536,
      `${repetitions} repetitions per night produced ${body.length} characters`,
    );
    t.diagnostic(
      `${repetitions} repetitions per night: ${body.length} characters`,
    );
    const retained = nightsInComment(body, '2026-11-09');
    assert.ok(retained);
    assert.equal(retained.length, 7);
    assert.equal(
      retained
        .flatMap((night) => night.journeys)
        .flatMap((entry) => entry.failures).length,
      7,
    );
    assert.ok(body.includes('7 filed as a real bug, 0 not filed'));
    assert.ok(body.includes(String(1422001 + 600 + repetitions - 1)));
    assert.equal(
      retained
        .flatMap((night) => night.journeys)
        .filter((entry) => entry.journey === 'financial-action-sequences')
        .flatMap((entry) => entry.sequences ?? [])
        .reduce((total, sequence) => total + sequence.runs, 0),
      7 * repetitions * 4 * 2,
    );
  }
});

test('a larger multi-family week keeps every actual case in bounded linked comments', async () => {
  const comments = [];
  for (let day = 0; day < 7; day++) {
    const run = workflowRun({
      id: 501 + day,
      startedAt: `2026-11-${String(9 + day).padStart(2, '0')}T02:20:00Z`,
    });
    const target = github({
      comments: comments.map((comment) => ({ ...comment })),
      run,
    });
    await reportNightlyUiChaos({
      ref: 'refs/heads/main',
      runId: run.id,
      server,
      repository,
      api: target.api,
      log: quiet,
      summaries: new Map([
        ...summaries(),
        [
          'financial-action-sequences',
          parseChaosSummary(JSON.stringify(financialWeekSample(day, 20))),
        ],
      ]),
    });
    for (const write of target.writes()) {
      assert.ok(
        write.body.body.length <= 65536,
        'Every emitted body stays within the provider limit.',
      );
      if (write.method === 'POST')
        comments.push({ id: 1000 + comments.length, body: write.body.body });
      else {
        const id = Number(write.path.split('/').at(-1));
        const existing = comments.find((comment) => comment.id === id);
        assert.ok(existing, 'A rerender must update an existing owned part.');
        existing.body = write.body.body;
      }
    }
  }
  assert.ok(
    comments.length > 1,
    'The prepared multi-family week needs a continuation.',
  );
  const retained = comments.flatMap(
    (comment) => nightsInComment(comment.body, '2026-11-09') ?? [],
  );
  assert.deepEqual(
    retained.map((night) => night.runId).sort(),
    [501, 502, 503, 504, 505, 506, 507],
  );
  for (const night of retained) {
    const access = night.journeys.find(
      (journey) => journey.journey === 'access-action-sequences',
    );
    assert.ok(access);
    assert.deepEqual(
      access.sequences
        .map((sequence) => sequence.caseId + '@' + sequence.width)
        .sort(),
      [
        'company-context@desktop',
        'company-context@narrow',
        'workspace-access@desktop',
        'workspace-access@narrow',
      ],
    );
    const contract = night.journeys.find(
      (journey) => journey.journey === 'contract-action-sequences',
    );
    assert.ok(contract);
    assert.deepEqual(
      contract.sequences
        .map((sequence) => sequence.caseId + '@' + sequence.width)
        .sort(),
      ['contract-signing@desktop', 'contract-signing@narrow'],
    );
    const documents = night.journeys.find(
      (journey) => journey.journey === 'document-action-sequences',
    );
    assert.ok(documents);
    assert.deepEqual(
      documents.sequences
        .map((sequence) => sequence.caseId + '@' + sequence.width)
        .sort(),
      [
        'document-pdf@desktop',
        'document-pdf@narrow',
        'document-version@desktop',
        'document-version@narrow',
        'payment-evidence@desktop',
        'payment-evidence@narrow',
      ],
    );
  }
  assert.equal(
    retained
      .flatMap((night) => night.journeys)
      .filter((entry) => entry.journey === 'financial-action-sequences')
      .flatMap((entry) => entry.sequences)
      .reduce((total, sequence) => total + sequence.runs, 0),
    7 * 20 * 4 * 2,
  );
});

test('keeps pathless interruption evidence separate from successful aggregates', () => {
  const raw = summary('financial-action-sequences', [
    {
      status: 'interrupted',
      chaosSeed: 1422001,
      sequences: [
        {
          ...passingFinancial.runs[0].sequences[0],
          status: 'interrupted',
          runs: 0,
          coverage: {},
        },
      ],
    },
  ]);
  const parsed = parseChaosSummary(JSON.stringify(raw));
  assert.ok(parsed);
  const night = nightOf({
    run: workflowRun(),
    jobs,
    summaries: new Map([['financial-action-sequences', parsed]]),
  });
  const body = renderWeek({
    week: '2026-11-09',
    nights: [night],
    bugs: new Map(),
    server,
    repository,
  });
  const retained = nightsInComment(body, '2026-11-09');
  assert.ok(retained);
  const financial = retained[0].journeys.find(
    (entry) => entry.journey === 'financial-action-sequences',
  );
  assert.ok(financial);
  assert.equal(financial.sequences[0].status, 'interrupted');
  assert.equal(financial.sequences[0].runs, 0);
  assert.equal(financial.sequences[0].repetitions, undefined);
  assert.ok(body.includes('seeds: `1422001`'));
  assert.ok(body.includes('could not run (interrupted)'));
});

test('an oversized week opens a bounded continuation and reruns update their owning part', async () => {
  const large = structuredClone(failingHome);
  large.runs[1].failures[0].error = 'Native diagnostic evidence '.repeat(900);
  const evidence = () =>
    new Map([
      ...summaries(),
      ['multi-company-home', parseChaosSummary(JSON.stringify(large))],
    ]);
  const first = github();
  await report(first.api, { summaries: evidence() });
  const earlier = {
    id: 42,
    html_url: 'https://github.com/owner/repo/issues/1132#issuecomment-42',
    body: first.writes()[0].body.body,
  };
  assert.ok(earlier.body.length <= 65536);
  const later = github({
    comments: [earlier],
    run: workflowRun({ id: 502, startedAt: '2026-11-15T02:20:00Z' }),
  });
  await report(later.api, { runId: 502, summaries: evidence() });
  const [continuation] = later.writes();
  assert.equal(continuation.method, 'POST');
  assert.ok(continuation.body.body.length <= 65536);
  assert.ok(continuation.body.body.includes(earlier.html_url));
  const current = {
    id: 43,
    html_url: 'https://github.com/owner/repo/issues/1132#issuecomment-43',
    body: continuation.body.body,
  };
  const retained = [earlier, current].flatMap((comment) =>
    nightsInComment(comment.body, '2026-11-09'),
  );
  assert.deepEqual(
    retained.map((night) => night.runId),
    [501, 502],
  );
  assert.equal(
    retained
      .flatMap((night) => night.journeys)
      .flatMap((entry) => entry.failures).length,
    2,
  );
  assert.ok(
    retained[0].journeys[1].failures[0].error.includes(
      'Native diagnostic evidence',
    ),
  );
  const rerun = github({
    comments: [earlier, current],
    run: workflowRun({ id: 501, attempt: 2 }),
    bugs: [{ number: 1400, title: 'A confirmed defect', body: 'seed 1376001' }],
  });
  await report(rerun.api, { summaries: evidence() });
  assert.equal(rerun.writes()[0].method, 'PATCH');
  assert.equal(rerun.writes()[0].path, 'issues/comments/42');
  assert.ok(rerun.writes()[0].body.body.length <= 65536);
  assert.ok(
    rerun
      .writes()
      .some(
        (write) =>
          write.path === 'issues/comments/43' &&
          write.body.body.includes('Triage: real bug #1400.'),
      ),
  );
  assert.ok(rerun.writes().every((write) => write.body.body.length <= 65536));
});

test('an oversized single night fails visibly without changing an earlier report', async () => {
  const first = github();
  await report(first.api);
  const existing = {
    id: 42,
    html_url: 'https://github.com/owner/repo/issues/1132#issuecomment-42',
    body: first.writes()[0].body.body,
  };
  const large = structuredClone(failingHome);
  large.runs[1].failures[0].error = 'Native diagnostic evidence '.repeat(3000);
  const next = github({ comments: [existing] });
  await assert.rejects(
    report(next.api, {
      summaries: new Map([
        ...summaries(),
        ['multi-company-home', parseChaosSummary(JSON.stringify(large))],
      ]),
    }),
    /complete evidence remains in the workflow artifacts/u,
  );
  assert.deepEqual(next.writes(), []);
  assert.equal(nightsInComment(existing.body, '2026-11-09').length, 1);
});
