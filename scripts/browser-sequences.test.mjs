import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  browserSequenceReplayCommand,
  readBrowserSequenceOptions,
} from './browser-sequences.mjs';

test('validates a replay against its actual journey before invoking any harness', () => {
  const script = fileURLToPath(
    new URL('./browser-sequences.mjs', import.meta.url),
  );
  const selection = 'workspace-access@desktop~10~0:1';
  const check = (journey) =>
    spawnSync(process.execPath, [script, 'validate-replay', journey], {
      env: {
        ...process.env,
        UI_CHAOS_SEED: '1422001',
        UI_SEQUENCE_REPLAY: selection,
      },
      encoding: 'utf8',
    });
  const actual = check('access-action-sequences');
  assert.equal(actual.status, 0, actual.stderr);
  assert.equal(actual.stdout, '');
  const wrong = check('financial-action-sequences');
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /Unknown sequence case/u);
  assert.equal(wrong.stdout, '');
  const ungenerated = check('certification-journey');
  assert.equal(ungenerated.status, 2);
  assert.match(ungenerated.stderr, /no generated browser sequence case/u);
  assert.equal(ungenerated.stdout, '');
  assert.equal(
    browserSequenceReplayCommand({
      caseId: 'workspace-access',
      width: 'desktop',
      seed: 1422001,
      steps: 10,
      path: '0:1',
    }),
    "UI_SEQUENCE_REPLAY='workspace-access@desktop~10~0:1' pnpm verify:journey access-action-sequences --chaos 1422001",
  );
});

test('refuses a replay for an unknown adapter before running a browser', () => {
  assert.throws(
    () =>
      readBrowserSequenceOptions({
        journey: 'financial-action-sequences',
        environment: {
          UI_CHAOS_SEED: '1422001',
          UI_SEQUENCE_REPLAY: 'invented@desktop~8~0:1',
        },
      }),
    /Unknown sequence case.*payment-observation.*invoice-record/u,
  );
});

test('validates each Document replay only against its own journey', () => {
  const script = fileURLToPath(
    new URL('./browser-sequences.mjs', import.meta.url),
  );
  for (const selection of [
    'document-version@desktop~10~0:1',
    'document-pdf@narrow~10~0:1',
    'payment-evidence@desktop~10~0:1',
    'payment-evidence@narrow~10~0:1',
  ]) {
    const command = (journey) =>
      spawnSync(process.execPath, [script, 'validate-replay', journey], {
        env: {
          ...process.env,
          UI_CHAOS_SEED: '1427001',
          UI_SEQUENCE_REPLAY: selection,
        },
        encoding: 'utf8',
      });
    const own = command('document-action-sequences');
    assert.equal(own.status, 0, own.stderr);
    assert.equal(own.stdout, '');
    const access = command('access-action-sequences');
    assert.equal(access.status, 2);
    assert.match(access.stderr, /Unknown sequence case/u);
  }
});

test('replays the retained case, width, sequence bound and reduction path with its original seed', () => {
  const options = readBrowserSequenceOptions({
    journey: 'financial-action-sequences',
    environment: {
      UI_CHAOS_SEED: '1422001',
      UI_SEQUENCE_REPLAY: 'payment-observation@narrow~8~2:1:0',
    },
  });
  assert.equal(options.seed, 1422001);
  assert.equal(options.steps, 8);
  assert.equal(options.runs, 1);
  assert.deepEqual(options.replay, {
    caseId: 'payment-observation',
    width: 'narrow',
    path: '2:1:0',
  });
});

test('refuses an extra viewport selector rather than silently replaying a different case', () => {
  assert.throws(
    () =>
      readBrowserSequenceOptions({
        journey: 'financial-action-sequences',
        environment: {
          UI_CHAOS_SEED: '1422001',
          UI_SEQUENCE_REPLAY: 'payment-observation@desktop@surprise~8~2:1:0',
        },
      }),
    /UI_SEQUENCE_REPLAY must/u,
  );
});

test('prints the exact command that selects the failing adapter and viewport', () => {
  assert.equal(
    browserSequenceReplayCommand({
      caseId: 'payment-observation',
      width: 'narrow',
      seed: 1422001,
      steps: 8,
      path: '2:1:0',
    }),
    "UI_SEQUENCE_REPLAY='payment-observation@narrow~8~2:1:0' pnpm verify:journey financial-action-sequences --chaos 1422001",
  );
});

test('keeps bounded generated coverage and rebuilds exact replay without publishing raw trials', async () => {
  const { parseBrowserSequenceEvidence } =
    await import('./browser-sequences.mjs');
  const evidence = parseBrowserSequenceEvidence({
    schema: 'prisma-prim-browser-sequences/v1',
    caseId: 'payment-observation',
    journey: 'financial-action-sequences',
    width: 'narrow',
    seed: 1422001,
    steps: 10,
    status: 'failed',
    runs: 1,
    shrinks: 3,
    durationMilliseconds: 4500,
    path: '0:2:1',
    coverage: { 'locale:fr': 2 },
    replay: 'untrusted command',
    trials: [{ private: 'raw trace' }],
  });
  assert.deepEqual(evidence, {
    caseId: 'payment-observation',
    width: 'narrow',
    seed: 1422001,
    steps: 10,
    status: 'failed',
    runs: 1,
    shrinks: 3,
    durationMilliseconds: 4500,
    path: '0:2:1',
    coverage: { 'locale:fr': 2 },
    replay:
      "UI_SEQUENCE_REPLAY='payment-observation@narrow~10~0:2:1' pnpm verify:journey financial-action-sequences --chaos 1422001",
  });
});

test('refuses empty successful generated proof and malformed coverage or replay metadata', async () => {
  const { parseBrowserSequenceEvidence } =
    await import('./browser-sequences.mjs');
  const valid = {
    schema: 'prisma-prim-browser-sequences/v1',
    caseId: 'invoice-record',
    journey: 'financial-action-sequences',
    width: 'desktop',
    seed: 1422001,
    steps: 10,
    status: 'passed',
    runs: 2,
    shrinks: 0,
    durationMilliseconds: 100,
    path: null,
    coverage: { 'start-literal-invoice': 1 },
  };
  assert.equal(parseBrowserSequenceEvidence({ ...valid, coverage: {} }), null);
  assert.equal(parseBrowserSequenceEvidence({ ...valid, runs: 0 }), null);
  assert.equal(
    parseBrowserSequenceEvidence({ ...valid, path: '0;echo injected' }),
    null,
  );
  assert.equal(
    parseBrowserSequenceEvidence({ ...valid, caseId: 'unimplemented' }),
    null,
  );
  assert.equal(
    parseBrowserSequenceEvidence({ ...valid, coverage: { write: -1 } }),
    null,
  );
  assert.equal(
    parseBrowserSequenceEvidence({ ...valid, coverage: { '@owner': 1 } }),
    null,
  );
  assert.equal(
    parseBrowserSequenceEvidence({ ...valid, durationMilliseconds: -1 }),
    null,
  );
  assert.equal(
    parseBrowserSequenceEvidence({
      ...valid,
      status: 'interrupted',
      coverage: {},
      runs: 0,
    }).status,
    'interrupted',
  );
});

test('validates each native Contract replay against its own journey', () => {
  for (const width of ['desktop', 'narrow']) {
    const selection = `contract-signing@${width}~6~0:2`;
    const environment = { UI_CHAOS_SEED: '57', UI_SEQUENCE_REPLAY: selection };
    assert.deepEqual(
      readBrowserSequenceOptions({
        journey: 'contract-action-sequences',
        environment,
      }).replay,
      { caseId: 'contract-signing', width, path: '0:2' },
    );
    for (const journey of [
      'financial-action-sequences',
      'access-action-sequences',
      'document-action-sequences',
    ])
      assert.throws(
        () => readBrowserSequenceOptions({ journey, environment }),
        /Unknown sequence case/u,
      );
    assert.equal(
      browserSequenceReplayCommand({
        caseId: 'contract-signing',
        width,
        seed: 57,
        steps: 6,
        path: '0:2',
      }),
      `UI_SEQUENCE_REPLAY='${selection}' pnpm verify:journey contract-action-sequences --chaos 57`,
    );
  }
});

test('selects the native mission result replay only in its registered journey', () => {
  const command = browserSequenceReplayCommand({
    caseId: 'mission-task-result',
    width: 'narrow',
    seed: 1461001,
    steps: 10,
    path: '0:1',
  });
  assert.equal(
    command,
    "UI_SEQUENCE_REPLAY='mission-task-result@narrow~10~0:1' pnpm verify:journey mission-result-action-sequences --chaos 1461001",
  );
  const environment = {
    UI_CHAOS_SEED: '1461001',
    UI_SEQUENCE_REPLAY: 'mission-task-result@narrow~10~0:1',
  };
  assert.equal(
    readBrowserSequenceOptions({
      journey: 'mission-result-action-sequences',
      environment,
    }).replay.caseId,
    'mission-task-result',
  );
  assert.throws(
    () =>
      readBrowserSequenceOptions({
        journey: 'financial-action-sequences',
        environment,
      }),
    /Unknown sequence case/u,
  );
});

test('selects the native Offer version replay only in its registered journey', () => {
  const command = browserSequenceReplayCommand({
    caseId: 'offer-version-owner',
    width: 'narrow',
    seed: 1462001,
    steps: 10,
    path: '0:1',
  });
  assert.equal(
    command,
    "UI_SEQUENCE_REPLAY='offer-version-owner@narrow~10~0:1' pnpm verify:journey offer-owner-action-sequences --chaos 1462001",
  );
  const environment = {
    UI_CHAOS_SEED: '1462001',
    UI_SEQUENCE_REPLAY: 'offer-version-owner@narrow~10~0:1',
  };
  assert.equal(
    readBrowserSequenceOptions({
      journey: 'offer-owner-action-sequences',
      environment,
    }).replay.caseId,
    'offer-version-owner',
  );
  assert.throws(
    () =>
      readBrowserSequenceOptions({
        journey: 'financial-action-sequences',
        environment,
      }),
    /Unknown sequence case/u,
  );
});

test('selects the native pricing replay only in its registered journey', () => {
  const command = browserSequenceReplayCommand({
    caseId: 'pricing-snapshot-owner',
    width: 'narrow',
    seed: 1463001,
    steps: 10,
    path: '0:1',
  });
  assert.equal(
    command,
    "UI_SEQUENCE_REPLAY='pricing-snapshot-owner@narrow~10~0:1' pnpm verify:journey pricing-owner-action-sequences --chaos 1463001",
  );
  const environment = {
    UI_CHAOS_SEED: '1463001',
    UI_SEQUENCE_REPLAY: 'pricing-snapshot-owner@narrow~10~0:1',
  };
  assert.equal(
    readBrowserSequenceOptions({
      journey: 'pricing-owner-action-sequences',
      environment,
    }).replay.caseId,
    'pricing-snapshot-owner',
  );
  assert.throws(
    () =>
      readBrowserSequenceOptions({
        journey: 'financial-action-sequences',
        environment,
      }),
    /Unknown sequence case/u,
  );
});
