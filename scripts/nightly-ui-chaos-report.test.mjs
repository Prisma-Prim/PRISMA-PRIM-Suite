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
  { name: 'report', conclusion: null, started_at: null, completed_at: null },
];
const summaries = () =>
  new Map([
    [
      'certification-journey',
      parseChaosSummary(JSON.stringify(passingCertification)),
    ],
    ['multi-company-home', parseChaosSummary(JSON.stringify(failingHome))],
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
    ['nightly-ui-chaos-summary-broken', '{'],
  ]) {
    await mkdir(join(directory, folder), { recursive: true });
    await writeFile(join(directory, folder, 'summary.json'), content);
  }
  const found = readChaosSummaries(directory);
  assert.deepEqual([...found.keys()].sort(), CHAOS_JOURNEYS);
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
    body.startsWith(
      '<!-- nightly-ui-chaos week=2026-11-09 -->\n## Nightly UI chaos, week of 2026-11-09',
    ),
  );
  assert.ok(
    body.includes(
      '| 2026-11-14 02:21 | [nightly](https://github.com/owner/repo/actions/runs/501) | [`c0ffee1`](https://github.com/owner/repo/commit/' +
        sha +
        ') | certification-journey | 2 of 2 (budget) | passed | 18.5 min |',
    ),
  );
  assert.ok(
    body.includes('| multi-company-home | 1 of 2 | failed | 12.0 min |'),
  );
  assert.ok(
    body.includes(
      '**Failures:** 1 this week, 0 filed as a real bug, 1 not filed (a false alarm once triaged).',
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
      '**Could not run:** 2026-11-15 multi-company-home (failed without a summary).',
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
