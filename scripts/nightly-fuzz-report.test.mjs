import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fuzzVerdict,
  parseFuzzReport,
  replayCommand,
  reportNightlyFuzz,
} from './nightly-fuzz-report.mjs';

const sha = 'c0ffee12'.padEnd(40, '0');
const run = {
  ref: 'refs/heads/main',
  sha,
  server: 'https://github.com',
  repository: 'owner/repo',
  runId: '88',
};
const report = {
  seed: 546315018,
  path: '30~0:1:0~ARB:F',
  invariant: 'company-isolation',
  rule: 'A request reads no record of another Company.',
  detail: "the auditor's list in Company B shows Task t1 of Company A",
  sequence: ['create(ana title=0 normal)', 'list(bogdan)'],
  runs: 1,
  shrinks: 2,
  replay: 'ignored: the script rebuilds it from the seed and path',
};
const failedMarker = '<!-- nightly-fuzz: failed -->';
const passedMarker = '<!-- nightly-fuzz: passed -->';

/** An in-memory GitHub REST API that records every call. */
function github({ issues = [], comments = {} } = {}) {
  const calls = [];
  async function api(method, path, body) {
    calls.push({ method, path, body });
    if (
      method === 'GET' &&
      path === 'issues?labels=fuzz-found&state=open&per_page=100'
    )
      return structuredClone(issues);
    const listed = /^issues\/(\d+)\/comments\?per_page=100&page=1$/u.exec(path);
    if (method === 'GET' && listed) return comments[listed[1]] ?? [];
    if (method === 'POST' && path === 'labels') return { name: body.name };
    if (method === 'POST' && path === 'issues') return { number: 901, ...body };
    if (method === 'POST' && /^issues\/\d+\/comments$/u.test(path)) return {};
    throw new Error(`unexpected ${method} ${path}`);
  }
  const writes = () => calls.filter((call) => call.method !== 'GET');
  return { api, writes };
}

const quiet = () => {};

test('only a finished fuzz job gives a verdict', () => {
  assert.equal(fuzzVerdict('failure'), 'failed');
  assert.equal(fuzzVerdict('success'), 'passed');
  for (const result of ['cancelled', 'skipped', undefined, ''])
    assert.equal(fuzzVerdict(result), 'none');
});

test('a malformed or foreign report is no counterexample', () => {
  assert.deepEqual(parseFuzzReport(JSON.stringify(report)), report);
  assert.equal(parseFuzzReport('not json'), null);
  assert.equal(parseFuzzReport('null'), null);
  assert.equal(parseFuzzReport(JSON.stringify({ ...report, seed: '1' })), null);
  assert.equal(
    parseFuzzReport(JSON.stringify({ ...report, sequence: [1] })),
    null,
  );
  // The path reaches a shell command: anything but the printed shape is refused.
  assert.equal(
    parseFuzzReport(JSON.stringify({ ...report, path: "1~0~A'; rm -rf ~" })),
    null,
  );
  assert.equal(
    replayCommand(report),
    "FUZZ_SEED=546315018 FUZZ_PATH='30~0:1:0~ARB:F' pnpm --filter @prisma-prim/api exec vitest run src/internal-task/internal-task.fuzz.rest.test.ts",
  );
});

test('a failing night with no open issue opens one labelled fuzz-found with the seed, sequence, invariant and run', async () => {
  const fake = github();
  await reportNightlyFuzz({
    result: 'failure',
    report,
    run,
    api: fake.api,
    log: quiet,
  });
  const writes = fake.writes();
  assert.deepEqual(
    writes.map(({ method, path }) => `${method} ${path}`),
    ['POST labels', 'POST issues'],
  );
  assert.equal(writes[0].body.name, 'fuzz-found');
  const issue = writes[1].body;
  assert.deepEqual(issue.labels, ['fuzz-found']);
  assert.equal(issue.title, 'Nightly fuzz broke company-isolation at c0ffee1');
  for (const fact of [
    '`company-isolation`',
    report.detail,
    '`546315018`',
    '1. `create(ana title=0 normal)`',
    '2. `list(bogdan)`',
    replayCommand(report),
    'https://github.com/owner/repo/actions/runs/88',
    `https://github.com/owner/repo/commit/${sha}`,
    failedMarker,
  ])
    assert.ok(issue.body.includes(fact), fact);
});

test('a failing night without a report still opens the issue and says so', async () => {
  const fake = github();
  await reportNightlyFuzz({
    result: 'failure',
    report: null,
    run,
    api: fake.api,
    log: quiet,
  });
  const issue = fake.writes()[1].body;
  assert.equal(issue.title, 'Nightly fuzz failed at c0ffee1');
  assert.match(issue.body, /without a counterexample report/u);
});

test('a failing night with an open issue comments on the oldest one only', async () => {
  const fake = github({
    issues: [
      { number: 12, body: failedMarker },
      { number: 9, body: failedMarker },
    ],
  });
  await reportNightlyFuzz({
    result: 'failure',
    report,
    run,
    api: fake.api,
    log: quiet,
  });
  const writes = fake.writes();
  assert.deepEqual(
    writes.map(({ method, path }) => `${method} ${path}`),
    ['POST issues/9/comments'],
  );
  assert.ok(writes[0].body.body.includes(replayCommand(report)));
});

test('the first passing night after a failure comments once and never closes the issue', async () => {
  const fake = github({
    issues: [{ number: 9, body: failedMarker }],
    comments: { 9: [{ body: `report\n${failedMarker}` }] },
  });
  await reportNightlyFuzz({
    result: 'success',
    run,
    api: fake.api,
    log: quiet,
  });
  const writes = fake.writes();
  assert.deepEqual(
    writes.map(({ method, path }) => `${method} ${path}`),
    ['POST issues/9/comments'],
  );
  assert.match(writes[0].body.body, /A later nightly fuzz passed/u);
  assert.ok(writes[0].body.body.includes(passedMarker));

  const again = github({
    issues: [{ number: 9, body: failedMarker }],
    comments: {
      9: [{ body: failedMarker }, { body: `passed\n${passedMarker}` }],
    },
  });
  await reportNightlyFuzz({
    result: 'success',
    run,
    api: again.api,
    log: quiet,
  });
  assert.deepEqual(again.writes(), []);
});

test('cancelled runs and other branches report nothing', async () => {
  for (const [result, ref] of [
    ['cancelled', 'refs/heads/main'],
    ['failure', 'refs/heads/feature'],
  ]) {
    const fake = github({ issues: [{ number: 9, body: failedMarker }] });
    await reportNightlyFuzz({
      result,
      report,
      run: { ...run, ref },
      api: fake.api,
      log: quiet,
    });
    assert.deepEqual(fake.writes(), []);
  }
});

test('report text cannot mention anyone or close its code block', async () => {
  const fake = github();
  await reportNightlyFuzz({
    result: 'failure',
    report: {
      ...report,
      detail: 'got 403 for ana@example.test ``` (at)team',
      sequence: ['create(@someone)'],
    },
    run,
    api: fake.api,
    log: quiet,
  });
  const { body } = fake.writes()[1].body;
  assert.doesNotMatch(body.replace(replayCommand(report), ''), /@/u);
  assert.equal(body.match(/```/gu).length, 4);
});
