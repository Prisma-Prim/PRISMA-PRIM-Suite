import assert from 'node:assert/strict';
import test from 'node:test';
import {
  browserSequenceReplayCommand,
  readBrowserSequenceOptions,
} from './browser-sequences.mjs';

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
