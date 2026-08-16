import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateCodexReviewGate } from './validate-codex-review-gate.mjs';

const headSha = 'e7473e1cd2ff5d6f6d37e7ba45c9dcf25c15cce7';

function snapshot(overrides = {}) {
  return {
    headSha,
    codexReviews: [],
    codexComments: [],
    codexThreads: [],
    ...overrides,
  };
}

test('blocks while Codex has not produced a terminal signal for the current head', () => {
  const result = evaluateCodexReviewGate(snapshot());

  assert.deepEqual(result, {
    state: 'pending',
    summary: 'Codex has not completed a review for the current PR head.',
  });
});

test('accepts a no-findings terminal comment tied to the exact head', () => {
  const result = evaluateCodexReviewGate(
    snapshot({
      codexComments: [
        {
          body: `Codex Review: Didn't find any major issues.\n\n**Reviewed commit:** \`${headSha}\``,
        },
      ],
    }),
  );

  assert.deepEqual(result, {
    state: 'ready',
    summary:
      'Codex completed the current-head review and no blocking threads remain.',
  });
});

test('invalidates a terminal signal after the PR head changes', () => {
  const result = evaluateCodexReviewGate(
    snapshot({
      codexComments: [
        {
          body: "Codex Review: Didn't find any major issues.\n\n**Reviewed commit:** `56c22cfa8bd36872b9b189c161296dacad984c84`",
        },
      ],
    }),
  );

  assert.equal(result.state, 'pending');
});

test('accepts a Codex review submitted against the exact head as terminal', () => {
  const result = evaluateCodexReviewGate(
    snapshot({ codexReviews: [{ commitId: headSha }] }),
  );

  assert.equal(result.state, 'ready');
});

test('blocks unresolved non-outdated Codex review threads', () => {
  const result = evaluateCodexReviewGate(
    snapshot({
      codexReviews: [{ commitId: headSha }],
      codexThreads: [{ isResolved: false, isOutdated: false }],
    }),
  );

  assert.deepEqual(result, {
    state: 'blocked',
    summary: '1 current Codex review thread remains unresolved.',
  });
});

test('ignores resolved and outdated review threads', () => {
  const result = evaluateCodexReviewGate(
    snapshot({
      codexReviews: [{ commitId: headSha }],
      codexThreads: [
        { isResolved: true, isOutdated: false },
        { isResolved: false, isOutdated: true },
      ],
    }),
  );

  assert.equal(result.state, 'ready');
});
