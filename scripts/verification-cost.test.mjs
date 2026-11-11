import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  mkdir,
  copyFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { main } from './verification-cost.mjs';

const fixtures = fileURLToPath(
  new URL('./fixtures/verification-cost/', import.meta.url),
);
const sessionId = '11111111-2222-4333-8444-555555555555';
const sessionFile = join(fixtures, 'claude-code', `${sessionId}.jsonl`);
const sessionDirectory = join(fixtures, 'claude-code', sessionId);
const codexRollout = join(
  fixtures,
  'codex',
  'rollout-2026-11-10T10-00-00-synthetic.jsonl',
);
const fixtureTable = join(fixtures, 'price-tables', 'fixture-a.json');
const fixtureLedger = join(fixtures, 'ledger.jsonl');
const NOW = new Date('2026-11-11T12:00:00Z');

async function run(argv) {
  let stdout = '';
  let stderr = '';
  const code = await main(argv, {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    now: () => NOW,
  });
  return { code, stdout, stderr };
}

async function record(argv) {
  const result = await run(['record', '--price-table', fixtureTable, ...argv]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trimEnd().split('\n').length, 1);
  return JSON.parse(result.stdout);
}

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'verification-cost-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function jsonl(entries) {
  return entries.map((entry) => `${JSON.stringify(entry)}\n`).join('');
}

function assistant(id, model, usage, timestamp) {
  return {
    type: 'assistant',
    sessionId: 'synthetic-session',
    timestamp,
    message: { id, model, role: 'assistant', content: [], usage },
  };
}

// Criterion 1: Claude Code transcripts, subagents included.
test('builds the record of a Claude Code session and its subagents', async () => {
  const built = await record([
    '--run-type',
    'pull-request-proof',
    '--harness',
    'claude-code-local',
    '--issue',
    '1278',
    '--pull-request',
    '1300',
    '--claude-code',
    sessionFile,
    '--claude-code',
    sessionDirectory,
    '--result',
    'pass',
    '--findings',
    'P1=1,P2=2',
    '--notes',
    'synthetic run',
  ]);

  assert.deepEqual(built, {
    schemaVersion: 1,
    runId: sessionId,
    date: '2026-11-10',
    runType: 'pull-request-proof',
    issue: 1278,
    pullRequest: 1300,
    harness: 'claude-code-local',
    figuresSource: 'claude-code-transcript',
    time: {
      start: '2026-11-10T09:00:00.000Z',
      end: '2026-11-10T09:05:00.000Z',
      durationSeconds: 300,
    },
    // Streamed parts repeat one message id and count once; the synthetic
    // notice Claude Code writes itself carries no usage.
    tokens: {
      input: 3035,
      output: 640,
      cacheCreation: 1400,
      cacheRead: 101500,
    },
    models: [
      {
        model: 'claude-haiku-5-5',
        tokens: {
          input: 3000,
          output: 410,
          cacheCreation: 0,
          cacheRead: 100000,
        },
        // 2,000 in + 400 out at the base tier, then one 101,000-token
        // prompt at the long-context tier.
        estimatedPriceUsd: 0.005925,
      },
      {
        model: 'claude-opus-5-5',
        tokens: {
          input: 15,
          output: 150,
          cacheCreation: 1300,
          cacheRead: 1000,
        },
        // 200 tokens written to the 5-minute cache, 1,100 to the 1-hour one.
        estimatedPriceUsd: 0.01306,
      },
      {
        model: 'claude-sonnet-5-5',
        tokens: { input: 20, output: 80, cacheCreation: 100, cacheRead: 500 },
        estimatedPriceUsd: 0.00114,
      },
    ],
    price: { estimatedUsd: 0.020125, priceTable: 'fixture-a' },
    outcome: {
      result: 'pass',
      findings: { P0: 0, P1: 1, P2: 2, P3: 0 },
      notes: 'synthetic run',
    },
  });
});

test('a time window keeps only the usage and timestamps inside it', async () => {
  const built = await record([
    '--run-type',
    'verify-journey',
    '--harness',
    'claude-code-local',
    '--claude-code',
    sessionFile,
    '--run-id',
    'synthetic-window',
    '--from',
    '2026-11-10T09:00:00Z',
    '--to',
    '2026-11-10T09:02:00Z',
  ]);

  assert.deepEqual(built.time, {
    start: '2026-11-10T09:00:00.000Z',
    end: '2026-11-10T09:02:00.000Z',
    durationSeconds: 120,
  });
  assert.deepEqual(built.tokens, {
    input: 15,
    output: 150,
    cacheCreation: 1300,
    cacheRead: 1000,
  });
  assert.deepEqual(
    built.models.map(({ model }) => model),
    ['claude-opus-5-5'],
  );
});

// Criterion 1: Codex local history.
test('builds the record of a Codex rollout from its cumulative token counts', async () => {
  const built = await record([
    '--run-type',
    'journey-audit',
    '--harness',
    'codex-local',
    '--codex',
    codexRollout,
  ]);

  assert.deepEqual(built, {
    schemaVersion: 1,
    runId: '00000000-0000-4000-8000-000000000301',
    date: '2026-11-10',
    runType: 'journey-audit',
    issue: 'not reported',
    pullRequest: 'not reported',
    harness: 'codex-local',
    figuresSource: 'codex-rollout',
    time: {
      start: '2026-11-10T10:00:00.000Z',
      end: '2026-11-10T10:02:00.000Z',
      durationSeconds: 120,
    },
    // A repeated total adds nothing; cached input is a part of input.
    tokens: { input: 1800, output: 250, cacheCreation: 0, cacheRead: 1200 },
    models: [
      {
        model: 'gpt-synthetic-a',
        tokens: { input: 800, output: 100, cacheCreation: 0, cacheRead: 200 },
        estimatedPriceUsd: 'not reported',
      },
      {
        model: 'gpt-synthetic-b',
        tokens: { input: 1000, output: 150, cacheCreation: 0, cacheRead: 1000 },
        estimatedPriceUsd: 'not reported',
      },
    ],
    price: { estimatedUsd: 'not reported', priceTable: 'fixture-a' },
    outcome: { result: 'not reported', findings: 'not reported', notes: '' },
  });
});

// Criterion 2: missing figures.
test('writes the figures a cloud session cannot report as not reported', async () => {
  const built = await record([
    '--run-type',
    'journey-audit',
    '--harness',
    'codex-cloud',
    '--run-id',
    'synthetic-cloud-task',
    '--issue',
    '1277',
    '--model',
    'gpt-synthetic-a',
    '--input',
    '500',
    '--duration-seconds',
    '900',
    '--findings',
    'none',
  ]);

  assert.deepEqual(built, {
    schemaVersion: 1,
    runId: 'synthetic-cloud-task',
    date: '2026-11-11',
    runType: 'journey-audit',
    issue: 1277,
    pullRequest: 'not reported',
    harness: 'codex-cloud',
    figuresSource: 'self-reported',
    time: {
      start: 'not reported',
      end: 'not reported',
      durationSeconds: 900,
    },
    tokens: {
      input: 500,
      output: 'not reported',
      cacheCreation: 'not reported',
      cacheRead: 'not reported',
    },
    models: [
      {
        model: 'gpt-synthetic-a',
        tokens: {
          input: 500,
          output: 'not reported',
          cacheCreation: 'not reported',
          cacheRead: 'not reported',
        },
        estimatedPriceUsd: 'not reported',
      },
    ],
    price: { estimatedUsd: 'not reported', priceTable: 'fixture-a' },
    outcome: {
      result: 'not reported',
      findings: { P0: 0, P1: 0, P2: 0, P3: 0 },
      notes: '',
    },
  });
});

test('prices self-reported Claude figures only when the cache duration is known', async () => {
  const figures = [
    '--run-type',
    'pull-request-proof',
    '--harness',
    'claude-code-local',
    '--run-id',
    'synthetic-self-reported',
    '--model',
    'claude-opus-5-5',
    '--input',
    '1000',
    '--output',
    '100',
    '--cache-creation',
    '1000',
    '--cache-read',
    '10000',
    '--start',
    '2026-11-09T08:00:00Z',
    '--end',
    '2026-11-09T08:30:00Z',
  ];

  const unknownDuration = await record(figures);
  assert.equal(unknownDuration.price.estimatedUsd, 'not reported');
  assert.equal(unknownDuration.date, '2026-11-09');
  assert.equal(unknownDuration.time.durationSeconds, 1800);

  const known = await record([...figures, '--cache-write-ttl', '1h']);
  // 1,000 x 4 + 100 x 20 + 1,000 x 8 + 10,000 x 0.2 = 16,000 per million.
  assert.equal(known.price.estimatedUsd, 0.016);
});

test('a usage the price table cannot price leaves the price not reported', async (t) => {
  const directory = await temporaryDirectory(t);
  const usage = {
    input_tokens: 10,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    output_tokens: 10,
  };
  const transcript = join(directory, 'synthetic.jsonl');
  await writeFile(
    transcript,
    jsonl([
      assistant('msg_1', 'claude-opus-5-5', usage, '2026-11-10T09:00:00Z'),
      assistant(
        'msg_2',
        'claude-opus-5-5',
        { ...usage, speed: 'fast' },
        '2026-11-10T09:00:01Z',
      ),
      assistant('msg_3', 'claude-unpriced', usage, '2026-11-10T09:00:02Z'),
    ]),
  );

  const built = await record([
    '--run-type',
    'pull-request-proof',
    '--harness',
    'claude-code-local',
    '--claude-code',
    transcript,
  ]);

  assert.deepEqual(
    built.models.map(({ model, estimatedPriceUsd }) => [
      model,
      estimatedPriceUsd,
    ]),
    [
      // Fast mode has its own prices, which the table does not hold.
      ['claude-opus-5-5', 'not reported'],
      ['claude-unpriced', 'not reported'],
    ],
  );
  assert.equal(built.price.estimatedUsd, 'not reported');
  assert.deepEqual(built.tokens, {
    input: 30,
    output: 30,
    cacheCreation: 0,
    cacheRead: 0,
  });
});

test('an older Codex rollout without cache writes reports them as not reported', async (t) => {
  const directory = await temporaryDirectory(t);
  const rollout = join(directory, 'rollout-synthetic.jsonl');
  const total = {
    input_tokens: 900,
    cached_input_tokens: 400,
    output_tokens: 50,
    reasoning_output_tokens: 10,
    total_tokens: 950,
  };
  await writeFile(
    rollout,
    jsonl([
      {
        timestamp: '2026-11-10T10:00:00Z',
        type: 'session_meta',
        payload: { id: 'synthetic-thread' },
      },
      {
        timestamp: '2026-11-10T10:00:01Z',
        type: 'turn_context',
        payload: { model: 'gpt-synthetic-a' },
      },
      {
        timestamp: '2026-11-10T10:00:30Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { total_token_usage: total, last_token_usage: total },
        },
      },
    ]),
  );

  const built = await record([
    '--run-type',
    'journey-audit',
    '--harness',
    'codex-local',
    '--codex',
    rollout,
  ]);

  assert.deepEqual(built.tokens, {
    input: 500,
    output: 50,
    cacheCreation: 'not reported',
    cacheRead: 400,
  });
});

// Criterion 2: refusals.
for (const [flag, value] of [
  ['--run-type', 'nightly-guess'],
  ['--harness', 'cursor-local'],
]) {
  test(`refuses a record with an unknown ${flag.slice(2)}`, async () => {
    const options = {
      '--run-type': 'pull-request-proof',
      '--harness': 'codex-cloud',
      [flag]: value,
    };
    const result = await run([
      'record',
      '--price-table',
      fixtureTable,
      '--run-id',
      'synthetic-refused',
      ...Object.entries(options).flat(),
    ]);

    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, new RegExp(`${flag.slice(2)}.*${value}`));
  });
}

test('refuses a harness source that the harness cannot produce', async () => {
  const result = await run([
    'record',
    '--price-table',
    fixtureTable,
    '--run-type',
    'journey-audit',
    '--harness',
    'codex-cloud',
    '--claude-code',
    sessionFile,
  ]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /codex-cloud/);
});

// Criterion 3: the committed ledger, checked by every CI run of the scripts.
test('the committed ledger and price tables are valid', async () => {
  const result = await run(['check']);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Ledger valid: \d+ records?/);
});

test('the check fails on a malformed ledger line and names it', async (t) => {
  const directory = await temporaryDirectory(t);
  await mkdir(join(directory, 'price-tables'));
  await copyFile(
    fixtureTable,
    join(directory, 'price-tables', 'fixture-a.json'),
  );
  const [first] = (await readFile(fixtureLedger, 'utf8')).split('\n');
  const valid = JSON.parse(first);
  const lines = [
    first,
    '{"schemaVersion": 1,',
    JSON.stringify({ ...valid, runId: 'synthetic-extra', prompt: 'text' }),
    JSON.stringify({ ...valid, runId: 'synthetic-harness', harness: 'other' }),
    JSON.stringify({
      ...valid,
      runId: 'synthetic-total',
      tokens: { ...valid.tokens, input: valid.tokens.input + 1 },
    }),
    JSON.stringify({
      ...valid,
      runId: 'synthetic-table',
      price: { ...valid.price, priceTable: 'missing-table' },
    }),
    first,
  ];
  const ledger = join(directory, 'ledger.jsonl');
  await writeFile(ledger, `${lines.join('\n')}\n`);

  const result = await run(['check', '--ledger', ledger]);

  assert.equal(result.code, 1);
  for (const expected of [
    /line 2: .*JSON/,
    /line 3: .*prompt/,
    /line 4: .*harness/,
    /line 5: .*tokens\.input/,
    /line 6: .*missing-table/,
    /line 7: .*runId/,
  ]) {
    assert.match(result.stderr, expected);
  }
  assert.doesNotMatch(result.stderr, /line 1:/);
});

// Criterion 4: the summary.
test('the summary aggregates by run type, harness, model and month', async () => {
  const result = await run(['summary', '--ledger', fixtureLedger, '--json']);
  assert.equal(result.code, 0, result.stderr);
  const summary = JSON.parse(result.stdout);

  assert.equal(summary.runs, 3);
  const byRunType = Object.fromEntries(
    summary.byRunType.map((group) => [group.key, group]),
  );
  assert.deepEqual(byRunType['pull-request-proof'], {
    key: 'pull-request-proof',
    runs: 2,
    durationSeconds: { total: 600, average: 600, reported: 1 },
    tokens: {
      input: { total: 1500, average: 750, reported: 2 },
      output: { total: 200, average: 200, reported: 1 },
      cacheCreation: { total: 300, average: 300, reported: 1 },
      cacheRead: { total: 4000, average: 4000, reported: 1 },
    },
    estimatedPriceUsd: { total: 0.5, average: 0.5, reported: 1 },
    findings: { total: 2, average: 1, reported: 2 },
    costPerFindingUsd: 0.25,
  });

  const byHarness = Object.fromEntries(
    summary.byHarness.map((group) => [group.key, group]),
  );
  assert.equal(byHarness['claude-code-local'].runs, 2);
  assert.deepEqual(byHarness['claude-code-local'].estimatedPriceUsd, {
    total: 2,
    average: 1,
    reported: 2,
  });
  assert.equal(byHarness['claude-code-local'].costPerFindingUsd, 0.4);
  assert.deepEqual(byHarness['codex-cloud'].durationSeconds, {
    total: null,
    average: null,
    reported: 0,
  });
  // No finding caught: no cost per finding.
  assert.equal(byHarness['codex-cloud'].costPerFindingUsd, null);

  const byModel = Object.fromEntries(
    summary.byModel.map((group) => [group.key, group]),
  );
  assert.deepEqual(byModel['claude-opus-5-5'].tokens.input, {
    total: 2500,
    average: 1250,
    reported: 2,
  });
  assert.deepEqual(byModel['claude-opus-5-5'].estimatedPriceUsd, {
    total: 1.7,
    average: 0.85,
    reported: 2,
  });
  assert.equal(byModel['claude-opus-5-5'].costPerFindingUsd, 0.34);
  assert.equal(byModel['claude-haiku-5-5'].costPerFindingUsd, 0.1);

  assert.deepEqual(
    summary.byMonth.map(({ key, runs }) => [key, runs]),
    [
      ['2026-10', 1],
      ['2026-11', 2],
    ],
  );
});

test('the summary prints one table per dimension', async () => {
  const result = await run(['summary', '--ledger', fixtureLedger]);
  assert.equal(result.code, 0, result.stderr);

  for (const heading of ['run type', 'harness', 'model', 'month']) {
    assert.match(result.stdout, new RegExp(`^## By ${heading}$`, 'm'));
  }
  assert.match(
    result.stdout,
    /^\| pull-request-proof \| 2 \| 10\.0 \/ 10\.0 \(1 of 2\) \| 1,500 \/ 750 \|/m,
  );
  assert.match(result.stdout, /\| \$0\.25 \|$/m);
});

// Criterion 5: recorded prices are history.
test('a new price table never rewrites a recorded price', async (t) => {
  const directory = await temporaryDirectory(t);
  await mkdir(join(directory, 'price-tables'));
  await copyFile(
    fixtureTable,
    join(directory, 'price-tables', 'fixture-a.json'),
  );
  const ledger = join(directory, 'ledger.jsonl');
  await writeFile(ledger, '');
  const recordRun = (runId, table) =>
    run([
      'record',
      '--run-type',
      'pull-request-proof',
      '--harness',
      'claude-code-local',
      '--claude-code',
      sessionFile,
      '--claude-code',
      sessionDirectory,
      '--run-id',
      runId,
      '--price-table',
      table,
      '--ledger',
      ledger,
      '--append',
    ]);

  assert.equal((await recordRun('synthetic-first', fixtureTable)).code, 0);
  const before = await readFile(ledger, 'utf8');

  const doubled = JSON.parse(await readFile(fixtureTable, 'utf8'));
  doubled.version = 'fixture-b';
  for (const prices of Object.values(doubled.models)) {
    for (const key of ['input', 'output', 'cacheWrite5m', 'cacheWrite1h']) {
      if (typeof prices[key] === 'number') prices[key] *= 2;
    }
    if (typeof prices.cacheRead === 'number') prices.cacheRead *= 2;
    if (prices.longContext) {
      for (const key of Object.keys(prices.longContext)) {
        if (key !== 'abovePromptTokens') prices.longContext[key] *= 2;
      }
    }
  }
  const tableB = join(directory, 'price-tables', 'fixture-b.json');
  await writeFile(tableB, `${JSON.stringify(doubled, null, 2)}\n`);
  assert.equal((await recordRun('synthetic-second', tableB)).code, 0);

  const after = await readFile(ledger, 'utf8');
  assert.ok(after.startsWith(before), 'the first line is left untouched');
  const [first, second] = after.trimEnd().split('\n').map(JSON.parse);
  assert.deepEqual(first.price, {
    estimatedUsd: 0.020125,
    priceTable: 'fixture-a',
  });
  assert.deepEqual(second.price, {
    estimatedUsd: 0.04025,
    priceTable: 'fixture-b',
  });

  const summary = JSON.parse(
    (await run(['summary', '--ledger', ledger, '--json'])).stdout,
  );
  // The summary adds the recorded prices; it never prices again.
  assert.equal(summary.byRunType[0].estimatedPriceUsd.total, 0.060375);
});

test('appending refuses a price table missing from the ledger tables', async (t) => {
  const directory = await temporaryDirectory(t);
  await mkdir(join(directory, 'price-tables'));
  const ledger = join(directory, 'ledger.jsonl');
  await writeFile(ledger, '');

  const result = await run([
    'record',
    '--run-type',
    'pull-request-proof',
    '--harness',
    'claude-code-local',
    '--claude-code',
    sessionFile,
    '--price-table',
    fixtureTable,
    '--ledger',
    ledger,
    '--append',
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /fixture-a/);
  assert.equal(await readFile(ledger, 'utf8'), '');
});

// Criterion 6: the delivery report and the pull request ask for the record.
test('issue execution and the pull request template ask for the cost record', async () => {
  const read = async (path) =>
    (await readFile(new URL(`../${path}`, import.meta.url), 'utf8')).replaceAll(
      '\r\n',
      '\n',
    );
  const execution = await read('docs/agents/issue-execution.md');
  const template = await read('.github/pull_request_template.md');

  assert.ok(
    /\[cost record\]\(verification-cost\.md\)/.test(execution),
    'the final report asks for the cost record',
  );
  assert.ok(
    /^- Cost record:/m.test(template),
    'the template has a Cost record line',
  );
});
