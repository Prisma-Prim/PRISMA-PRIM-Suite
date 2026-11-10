import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  fuzzVerdict,
  parseFuzzReport,
  readFuzzReports,
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
  testFile: 'src/internal-task/internal-task.fuzz.rest.test.ts',
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
const invoiceReport = {
  ...report,
  testFile: 'src/invoice-record/invoice-record.fuzz.rest.test.ts',
  seed: 1211,
  path: '40~3:1~',
  invariant: 'single-active-entry',
  rule: 'At most one RECORDED entry names a given financial Document.',
  detail: "the auditor's inventory holds two RECORDED entries of A1",
  sequence: ['create(ana source#0 replaces=none values=0)'],
};
const paymentReport = {
  ...report,
  testFile: 'src/payment/payment.fuzz.rest.test.ts',
  seed: 1218,
  path: '40~2:0~B',
  invariant: 'independent-author',
  rule: 'A draft author never confirms the same Payment.',
  detail: 'bogdan confirmed Payment p1, whose CREATE he authored',
  sequence: ['create(bogdan source#0 replaces=none values=0)'],
};
const contractReport = {
  ...report,
  testFile: 'src/contract/contract.fuzz.rest.test.ts',
  seed: 1245,
  path: '40~1:0~',
  invariant: 'one-contract',
  rule: 'An Opportunity has at most one Contract.',
  detail: 'Opportunity o1 accepted a second Contract',
  sequence: ['create(ana offer #0)'],
};
const certificationReport = {
  ...report,
  testFile: 'src/certification/certification.fuzz.rest.test.ts',
  seed: 1247,
  path: '40~1:0~',
  invariant: 'step-order',
  rule: 'A step is refused until its predecessors hold.',
  detail: 'Case c1 accepted a dossier review before the recommendation',
  sequence: ['early(#0)'],
};
const documentsReport = {
  ...report,
  testFile: 'src/documents/documents.fuzz.rest.test.ts',
  seed: 1241,
  path: '40~1:0~',
  invariant: 'single-project',
  rule: 'A Document is linked to at most one Project of its own Company.',
  detail: 'Document d1 of Company A is stored on a Project of Company B',
  sequence: ['link(ana fit document#0 project=foreign)'],
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
  // The path and test file reach a shell command: anything but the printed
  // shape and the fuzzed files is refused.
  assert.equal(
    parseFuzzReport(JSON.stringify({ ...report, path: "1~0~A'; rm -rf ~" })),
    null,
  );
  for (const testFile of [
    undefined,
    'src/internal-task/internal-task.rest.test.ts',
    'src/internal-task/internal-task.fuzz.rest.test.ts; rm -rf ~',
  ])
    assert.equal(
      parseFuzzReport(JSON.stringify({ ...report, testFile })),
      null,
    );
  assert.equal(
    replayCommand(report),
    "FUZZ_SEED=546315018 FUZZ_PATH='30~0:1:0~ARB:F' pnpm --filter @prisma-prim/api exec vitest run src/internal-task/internal-task.fuzz.rest.test.ts",
  );
  assert.equal(
    replayCommand(invoiceReport),
    "FUZZ_SEED=1211 FUZZ_PATH='40~3:1~' pnpm --filter @prisma-prim/api exec vitest run src/invoice-record/invoice-record.fuzz.rest.test.ts",
  );
  assert.deepEqual(
    parseFuzzReport(JSON.stringify(paymentReport)),
    paymentReport,
  );
  assert.equal(
    replayCommand(paymentReport),
    "FUZZ_SEED=1218 FUZZ_PATH='40~2:0~B' pnpm --filter @prisma-prim/api exec vitest run src/payment/payment.fuzz.rest.test.ts",
  );
  assert.deepEqual(
    parseFuzzReport(JSON.stringify(documentsReport)),
    documentsReport,
  );
  assert.equal(
    replayCommand(documentsReport),
    "FUZZ_SEED=1241 FUZZ_PATH='40~1:0~' pnpm --filter @prisma-prim/api exec vitest run src/documents/documents.fuzz.rest.test.ts",
  );
  assert.deepEqual(
    parseFuzzReport(JSON.stringify(contractReport)),
    contractReport,
  );
  assert.equal(
    replayCommand(contractReport),
    "FUZZ_SEED=1245 FUZZ_PATH='40~1:0~' pnpm --filter @prisma-prim/api exec vitest run src/contract/contract.fuzz.rest.test.ts",
  );
  assert.deepEqual(
    parseFuzzReport(JSON.stringify(certificationReport)),
    certificationReport,
  );
  assert.equal(
    replayCommand(certificationReport),
    "FUZZ_SEED=1247 FUZZ_PATH='40~1:0~' pnpm --filter @prisma-prim/api exec vitest run src/certification/certification.fuzz.rest.test.ts",
  );
});

test("each failing module's downloaded artifact gives one report", async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nightly-fuzz-reports-'));
  try {
    for (const [name, value] of [
      ['nightly-fuzz-report-invoice-record', JSON.stringify(invoiceReport)],
      ['nightly-fuzz-report-payment', JSON.stringify(paymentReport)],
      [
        'nightly-fuzz-report-certification',
        JSON.stringify(certificationReport),
      ],
      ['nightly-fuzz-report-contract', JSON.stringify(contractReport)],
      ['nightly-fuzz-report-documents', JSON.stringify(documentsReport)],
      ['nightly-fuzz-report-internal-task', JSON.stringify(report)],
      ['nightly-fuzz-report-broken', 'not json'],
    ]) {
      await mkdir(join(directory, name));
      await writeFile(join(directory, name, 'fuzz-report.json'), value);
    }
    assert.deepEqual(readFuzzReports(directory), [
      certificationReport,
      contractReport,
      documentsReport,
      report,
      invoiceReport,
      paymentReport,
    ]);
    assert.deepEqual(readFuzzReports(join(directory, 'missing')), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a failing night with no open issue opens one labelled fuzz-found with the seed, sequence, invariant and run', async () => {
  const fake = github();
  await reportNightlyFuzz({
    result: 'failure',
    reports: [report],
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
    '`src/internal-task/internal-task.fuzz.rest.test.ts`',
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

test('a night where two modules fail reports both in the one issue', async () => {
  const fake = github();
  await reportNightlyFuzz({
    result: 'failure',
    reports: [report, invoiceReport],
    run,
    api: fake.api,
    log: quiet,
  });
  const writes = fake.writes();
  assert.deepEqual(
    writes.map(({ method, path }) => `${method} ${path}`),
    ['POST labels', 'POST issues'],
  );
  const issue = writes[1].body;
  assert.equal(
    issue.title,
    'Nightly fuzz broke company-isolation, single-active-entry at c0ffee1',
  );
  for (const fact of [
    replayCommand(report),
    replayCommand(invoiceReport),
    invoiceReport.detail,
    '1. `create(ana source#0 replaces=none values=0)`',
  ])
    assert.ok(issue.body.includes(fact), fact);
  assert.equal(issue.body.match(/<!-- nightly-fuzz: failed -->/gu).length, 1);
});

test('a failing night without a report still opens the issue and says so', async () => {
  const fake = github();
  await reportNightlyFuzz({
    result: 'failure',
    reports: [],
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
    reports: [report],
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
      reports: [report],
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
    reports: [
      {
        ...report,
        detail: 'got 403 for ana@example.test ``` (at)team',
        sequence: ['create(@someone)'],
      },
    ],
    run,
    api: fake.api,
    log: quiet,
  });
  const { body } = fake.writes()[1].body;
  assert.doesNotMatch(body.replace(replayCommand(report), ''), /@/u);
  assert.equal(body.match(/```/gu).length, 4);
});
