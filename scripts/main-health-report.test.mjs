import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { mainHealth, reportMainHealth } from './main-health-report.mjs';

const sha = 'a1b2c3d4'.padEnd(40, '0');
const second = 'f'.repeat(40);
const pushRun = {
  event: 'push',
  ref: 'refs/heads/main',
  sha,
  workflow: 'Main health',
  server: 'https://github.com',
  repository: 'owner/repo',
  runId: '77',
  commits: [sha],
};
const nightlyRun = { ...pushRun, event: 'schedule' };
const red = { checks: { result: 'failure' }, ci: { result: 'skipped' } };
const green = { checks: { result: 'success' }, ci: { result: 'skipped' } };
const nightlyRed = { checks: { result: 'skipped' }, ci: { result: 'failure' } };
const nightlyGreen = {
  checks: { result: 'skipped' },
  ci: { result: 'success' },
};
const fullMarker = '<!-- main-red: complete CI failure -->';

/** An in-memory GitHub REST API that records every call. */
function github({
  issues = [],
  jobs = [
    {
      name: 'checks',
      conclusion: 'failure',
      html_url: 'https://github.com/owner/repo/actions/runs/77/job/1',
    },
    { name: 'report', conclusion: null, html_url: 'unused' },
  ],
  pulls = {
    [sha]: [{ number: 41, merged_at: '2026-11-07', base: { ref: 'main' } }],
  },
  failing = [],
} = {}) {
  const calls = [];
  async function api(method, path, body) {
    calls.push({ method, path, body });
    if (failing.some((prefix) => path.startsWith(prefix)))
      throw new Error('HTTP 502');
    if (
      method === 'GET' &&
      path === 'issues?labels=main-red&state=open&per_page=100'
    )
      return structuredClone(issues);
    if (
      method === 'GET' &&
      path === 'actions/runs/77/jobs?filter=latest&per_page=100'
    )
      return { total_count: jobs.length, jobs };
    if (method === 'GET' && /^commits\/[0-9a-f]{40}\/pulls$/u.test(path))
      return pulls[path.split('/')[1]] ?? [];
    if (method === 'POST' && path === 'labels') return { name: body.name };
    if (method === 'POST' && path === 'issues') return { number: 900, ...body };
    if (method === 'POST' && /^issues\/\d+\/comments$/u.test(path)) return {};
    if (method === 'PATCH' && /^issues\/\d+$/u.test(path)) return {};
    throw new Error(`unexpected ${method} ${path}`);
  }
  const writes = () => calls.filter((call) => call.method !== 'GET');
  return { api, calls, writes };
}

const quiet = () => {};

test('a failed job makes the run red; only executed successes make it green', () => {
  assert.equal(mainHealth(red), 'red');
  assert.equal(mainHealth(nightlyRed), 'red');
  assert.equal(
    mainHealth({ checks: { result: 'failure' }, ci: { result: 'cancelled' } }),
    'red',
  );
  assert.equal(mainHealth(green), 'green');
  assert.equal(mainHealth(nightlyGreen), 'green');
  // A cancelled or unexecuted run proves nothing either way.
  assert.equal(
    mainHealth({ checks: { result: 'cancelled' }, ci: { result: 'skipped' } }),
    'none',
  );
  assert.equal(
    mainHealth({ checks: { result: 'skipped' }, ci: { result: 'skipped' } }),
    'none',
  );
  assert.equal(mainHealth({}), 'none');
  assert.throws(() => mainHealth(null));
  assert.throws(() => mainHealth([]));
});

test('a red push with no open issue opens one labelled main-red with the run facts', async () => {
  const fake = github();
  await reportMainHealth({
    results: red,
    run: pushRun,
    api: fake.api,
    log: quiet,
  });
  const writes = fake.writes();
  assert.deepEqual(
    writes.map(({ method, path }) => `${method} ${path}`),
    ['POST labels', 'POST issues'],
  );
  assert.equal(writes[0].body.name, 'main-red');
  const issue = writes[1].body;
  assert.deepEqual(issue.labels, ['main-red']);
  assert.equal(issue.title, 'main is red since a1b2c3d');
  for (const fact of [
    'Main health (fast checks after a push)',
    '[checks](https://github.com/owner/repo/actions/runs/77/job/1)',
    `[\`a1b2c3d\`](https://github.com/owner/repo/commit/${sha})`,
    'https://github.com/owner/repo/actions/runs/77',
    '#41',
  ])
    assert.ok(issue.body.includes(fact), `missing ${fact}`);
  // The still-running report job is not a failure.
  assert.match(
    issue.body,
    /\nFailed jobs: \[checks\]\(https:\/\/github\.com\/owner\/repo\/actions\/runs\/77\/job\/1\)\n/,
  );
  assert.ok(!issue.body.includes(fullMarker));
});

test('the label may already exist: a refused label creation still opens the issue', async () => {
  const fake = github({ failing: ['labels'] });
  await reportMainHealth({
    results: red,
    run: pushRun,
    api: fake.api,
    log: quiet,
  });
  assert.deepEqual(
    fake.writes().map(({ method, path }) => `${method} ${path}`),
    ['POST labels', 'POST issues'],
  );
});

test('a red run comments on the oldest open main-red issue and never opens a duplicate', async () => {
  const fake = github({
    issues: [
      { number: 12, body: 'later duplicate' },
      { number: 8, body: 'first report' },
      { number: 5, body: 'a pull request', pull_request: {} },
    ],
  });
  await reportMainHealth({
    results: red,
    run: pushRun,
    api: fake.api,
    log: quiet,
  });
  const writes = fake.writes();
  assert.deepEqual(
    writes.map(({ method, path }) => `${method} ${path}`),
    ['POST issues/8/comments'],
  );
  assert.ok(writes[0].body.body.includes('#41'));
});

test('the merged pull requests are those of every pushed commit', async () => {
  const fake = github({
    pulls: {
      [sha]: [{ number: 41, merged_at: '2026-11-07', base: { ref: 'main' } }],
      [second]: [
        { number: 43, merged_at: '2026-11-07', base: { ref: 'main' } },
        { number: 44, merged_at: null, base: { ref: 'main' } },
        { number: 45, merged_at: '2026-11-07', base: { ref: 'other' } },
      ],
    },
  });
  await reportMainHealth({
    results: red,
    run: { ...pushRun, commits: [second, sha] },
    api: fake.api,
    log: quiet,
  });
  const { body } = fake.writes().at(-1).body;
  assert.match(body, /Merged pull requests: #41, #43\n/);
});

test('unreadable jobs and pull requests still report the failure', async () => {
  const fake = github({ failing: ['actions/', 'commits/'] });
  await reportMainHealth({
    results: red,
    run: pushRun,
    api: fake.api,
    log: quiet,
  });
  const { body } = fake.writes().at(-1).body;
  assert.match(body, /Failed jobs: checks\n/);
  assert.match(body, /Merged pull requests: could not be read\n/);
});

test('a green run comments on and closes the open main-red issues', async () => {
  const fake = github({
    issues: [
      { number: 8, body: 'first report' },
      { number: 12, body: 'duplicate' },
    ],
  });
  await reportMainHealth({
    results: green,
    run: pushRun,
    api: fake.api,
    log: quiet,
  });
  const writes = fake.writes();
  assert.deepEqual(
    writes.map(({ method, path }) => `${method} ${path}`),
    [
      'POST issues/8/comments',
      'PATCH issues/8',
      'POST issues/12/comments',
      'PATCH issues/12',
    ],
  );
  assert.ok(
    writes[0].body.body.includes(
      'https://github.com/owner/repo/actions/runs/77',
    ),
  );
  assert.deepEqual(writes[1].body, {
    state: 'closed',
    state_reason: 'completed',
  });
});

test('a green run without an open main-red issue writes nothing', async () => {
  const fake = github();
  await reportMainHealth({
    results: green,
    run: pushRun,
    api: fake.api,
    log: quiet,
  });
  assert.deepEqual(fake.writes(), []);
});

test('a complete CI failure stays open until a complete CI run passes', async () => {
  // The nightly failure is recorded on the issue it opens…
  const opened = github();
  await reportMainHealth({
    results: nightlyRed,
    run: nightlyRun,
    api: opened.api,
    log: quiet,
  });
  const issue = opened.writes().at(-1).body;
  assert.ok(issue.body.includes(fullMarker));
  assert.ok(issue.body.includes('Main health (nightly complete CI)'));

  // …and on an issue a push failure opened earlier.
  const commented = github({ issues: [{ number: 8, body: 'push failure' }] });
  await reportMainHealth({
    results: nightlyRed,
    run: nightlyRun,
    api: commented.api,
    log: quiet,
  });
  assert.deepEqual(
    commented
      .writes()
      .map(({ method, path, body }) =>
        method === 'PATCH'
          ? `${method} ${path} ${body.body}`
          : `${method} ${path}`,
      ),
    ['POST issues/8/comments', `PATCH issues/8 push failure\n\n${fullMarker}`],
  );

  // The fast checks after a push do not prove the complete CI…
  const full = { number: 8, body: `push failure\n\n${fullMarker}` };
  const pushed = github({ issues: [full] });
  await reportMainHealth({
    results: green,
    run: pushRun,
    api: pushed.api,
    log: quiet,
  });
  assert.deepEqual(pushed.writes(), []);

  // …but they still record a new push failure on that issue.
  const pushedRed = github({ issues: [full] });
  await reportMainHealth({
    results: red,
    run: pushRun,
    api: pushedRed.api,
    log: quiet,
  });
  assert.deepEqual(
    pushedRed.writes().map(({ method, path }) => `${method} ${path}`),
    ['POST issues/8/comments'],
  );

  // A passing nightly complete CI closes it.
  const nightly = github({ issues: [full] });
  await reportMainHealth({
    results: nightlyGreen,
    run: nightlyRun,
    api: nightly.api,
    log: quiet,
  });
  assert.deepEqual(
    nightly.writes().map(({ method, path }) => `${method} ${path}`),
    ['POST issues/8/comments', 'PATCH issues/8'],
  );
});

test('a cancelled run, a non-main ref or another event touches nothing', async () => {
  for (const [results, run] of [
    [{ checks: { result: 'cancelled' }, ci: { result: 'skipped' } }, pushRun],
    [red, { ...pushRun, ref: 'refs/heads/feature' }],
    [red, { ...pushRun, event: 'workflow_dispatch' }],
  ]) {
    const fake = github();
    await reportMainHealth({ results, run, api: fake.api, log: quiet });
    assert.deepEqual(fake.calls, []);
  }
});

test('the command reads the job results from MAIN_RESULTS', () => {
  const script = fileURLToPath(
    new URL('./main-health-report.mjs', import.meta.url),
  );
  const environment = {
    GITHUB_EVENT_NAME: 'schedule',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: sha,
  };
  const cancelled = spawnSync(process.execPath, [script], {
    env: {
      ...environment,
      MAIN_RESULTS: JSON.stringify({
        checks: { result: 'skipped' },
        ci: { result: 'cancelled' },
      }),
    },
    encoding: 'utf8',
  });
  assert.equal(cancelled.status, 0, cancelled.stderr);
  assert.match(cancelled.stdout, /No verdict/u);
  const invalid = spawnSync(process.execPath, [script], {
    env: { ...environment, MAIN_RESULTS: 'not json' },
    encoding: 'utf8',
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /MAIN_RESULTS/u);
});
