import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('accepts the completed bot review summary tied to the exact head', () => {
  const result = evaluateCodexReviewGate(
    snapshot({
      codexComments: [
        {
          body: `<!-- codex-pull-request-review-summary -->

| Review | Status | Commit | Review trigger |
| --- | --- | --- | --- |
| 📝 **Code Review** | ✅ **Completed** today | \`e7473e1\` | New commits |`,
        },
      ],
    }),
  );

  assert.equal(result.state, 'ready');
});

test('rejects running, stale, and unmarked completed review summaries', () => {
  const summary = (status, commit, marker = true) => `${
    marker ? '<!-- codex-pull-request-review-summary -->\n\n' : ''
  }| Review | Status | Commit | Review trigger |
| --- | --- | --- | --- |
| 📝 **Code Review** | ${status} | \`${commit}\` | New commits |`;

  for (const body of [
    summary('🔄 **Running**', 'e7473e1'),
    summary('✅ **Completed** today', '56c22cf'),
    summary('✅ **Completed** today', 'e7473e1', false),
    `<!-- codex-pull-request-review-summary -->

| Review | Status | Commit | Review trigger |
| --- | --- | --- | --- |
| 📝 **Code Review** | ✅ **Completed** today
| \`e7473e1\` | New commits |`,
  ]) {
    const result = evaluateCodexReviewGate(
      snapshot({ codexComments: [{ body }] }),
    );

    assert.equal(result.state, 'pending');
  }
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
    snapshot({ codexReviews: [{ commitId: headSha, state: 'COMMENTED' }] }),
  );

  assert.equal(result.state, 'ready');
});

test('accepts a resolved changes-requested review as a terminal signal', () => {
  const result = evaluateCodexReviewGate(
    snapshot({
      codexReviews: [{ commitId: headSha, state: 'CHANGES_REQUESTED' }],
      codexThreads: [{ isResolved: true, isOutdated: false }],
    }),
  );

  assert.equal(result.state, 'ready');
});

test('does not accept a dismissed current-head review as terminal', () => {
  const result = evaluateCodexReviewGate(
    snapshot({ codexReviews: [{ commitId: headSha, state: 'DISMISSED' }] }),
  );

  assert.equal(result.state, 'pending');
});

test('does not accept a nonterminal current-head Codex comment', () => {
  const result = evaluateCodexReviewGate(
    snapshot({
      codexComments: [
        {
          body: `Codex review is still running.\n\n**Reviewed commit:** \`${headSha}\``,
        },
      ],
    }),
  );

  assert.equal(result.state, 'pending');
});

test('blocks unresolved non-outdated Codex review threads', () => {
  const result = evaluateCodexReviewGate(
    snapshot({
      codexReviews: [{ commitId: headSha, state: 'COMMENTED' }],
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
      codexReviews: [{ commitId: headSha, state: 'COMMENTED' }],
      codexThreads: [
        { isResolved: true, isOutdated: false },
        { isResolved: false, isOutdated: true },
      ],
    }),
  );

  assert.equal(result.state, 'ready');
});

test('trips the circuit breaker after findings on two distinct heads', () => {
  const result = evaluateCodexReviewGate(
    snapshot({
      codexReviews: [
        {
          commitId: '56c22cfa8bd36872b9b189c161296dacad984c84',
          state: 'COMMENTED',
        },
        { commitId: headSha, state: 'COMMENTED' },
      ],
      codexThreads: [
        { isResolved: true, isOutdated: true },
        { isResolved: true, isOutdated: false },
      ],
    }),
  );

  assert.deepEqual(result, {
    state: 'blocked',
    summary:
      'Review budget exhausted: stop editing; diagnose or redesign, close this PR, then publish a fresh focused replacement.',
  });
  assert.ok(result.summary.length <= 140);
});

test('counts repeated reviews of the same head as one finding wave', () => {
  const result = evaluateCodexReviewGate(
    snapshot({
      codexReviews: [
        { commitId: headSha, state: 'COMMENTED' },
        { commitId: headSha, state: 'COMMENTED' },
        {
          commitId: '56c22cfa8bd36872b9b189c161296dacad984c84',
          state: 'DISMISSED',
        },
      ],
    }),
  );

  assert.equal(result.state, 'ready');
});

test('accepts one corrected no-findings head after the first finding wave', () => {
  const result = evaluateCodexReviewGate(
    snapshot({
      codexReviews: [
        {
          commitId: '56c22cfa8bd36872b9b189c161296dacad984c84',
          state: 'COMMENTED',
        },
      ],
      codexComments: [
        {
          body: `Codex Review: Didn't find any major issues.\n\n**Reviewed commit:** \`${headSha}\``,
        },
      ],
      codexThreads: [{ isResolved: true, isOutdated: true }],
    }),
  );

  assert.equal(result.state, 'ready');
});

test('serializes per-PR workflow runs and cancels stale evaluations', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/codex-terminal-review.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflow, /codex-terminal-review-\$\{\{/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /state: 'pending'/);
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/,
  );
});
