import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  codexReviewState,
  main,
  nextAction,
  renderTable,
} from './pr-status.mjs';

// A GraphQL response in the shape `gh api graphql` returned for this query on
// 2026-11-14, with fictional pull requests: one per next action.
const RESPONSE = readFileSync(
  new URL('./fixtures/pr-status/open-pull-requests.json', import.meta.url),
  'utf8',
);
const WORKTREES = readFileSync(
  new URL('./fixtures/pr-status/worktrees.txt', import.meta.url),
  'utf8',
);
const NOW = new Date('2026-11-14T12:00:00Z');

function fakeCommands({ graphql = RESPONSE, worktrees = WORKTREES } = {}) {
  const calls = [];
  const execFile = async (file, args) => {
    calls.push([file, ...args]);
    if (file === 'gh') {
      if (graphql instanceof Error) throw graphql;
      return { stdout: graphql, stderr: '' };
    }
    if (file === 'git') return { stdout: worktrees, stderr: '' };
    throw new Error(`Unexpected command ${file}`);
  };
  return { calls, execFile };
}

async function run(argv, commands = fakeCommands()) {
  let stdout = '';
  let stderr = '';
  const code = await main({
    argv,
    execFile: commands.execFile,
    stdout: { write: (text) => (stdout += text) },
    stderr: { write: (text) => (stderr += text) },
    now: () => NOW,
  });
  return { code, stdout, stderr, calls: commands.calls };
}

const TABLE = [
  'PR    ISSUE  BRANCH                      AUTHOR           AGE  QUALITY  FAILED  PENDING  MERGE     AUTO-MERGE  CODEX        THREADS  WORKTREE                  NEXT ACTION',
  '#911  #901   feat/901-ledger-export      sample-agent     27h  missing  0       0        conflict  no          done         0        -                         resolve the conflict',
  '#912  #902   fix/902-import-header       sample-agent     1h   failure  2       0        blocked   no          done         0        /elsewhere/import-header  diagnose the red CI',
  '#913  #903   docs/903-report-columns     sample-reviewer  45m  success  0       0        blocked   no          done         2        -                         answer 2 threads',
  '#914  #904   feat/904-queue-order        sample-agent     20m  success  0       0        behind    no          done         0        .worktrees/queue-order    arm auto-merge or merge',
  '#915  #905   fix/905-upload-retry        sample-agent     2m   pending  0       2        blocked   no          in_progress  0        -                         wait for the Codex review',
  '#916  #906   refactor/906-audit-message  sample-agent     3h   success  0       0        clean     no          stale        0        -                         wait for the Codex review',
  '#917  #907   feat/907-totals-row         sample-agent     30m  pending  0       4        blocked   armed       done         0        .worktrees/totals-row     wait for CI',
  '#918  #908   feat/908-export-label       sample-agent     2d   success  0       0        clean     armed       done         0        -                         nothing to do',
  '#919  -      docs/909-onboarding-note    ghost            0m   success  0       0        draft     no          none         0        -                         wait for the Codex review',
];

test('prints one row per open pull request from one GraphQL query and the worktree list', async () => {
  const { code, stdout, stderr, calls } = await run([]);

  assert.equal(code, 0, stderr);
  assert.equal(stdout, `${TABLE.join('\n')}\n`);
  assert.equal(stderr, '');
  assert.deepEqual(
    calls.map((call) => call.slice(0, 3)),
    [
      ['gh', 'api', 'graphql'],
      ['git', 'worktree', 'list'],
    ],
  );
  assert.deepEqual(calls[1], ['git', 'worktree', 'list', '--porcelain']);
  const query = calls[0].find((argument) => argument.startsWith('query='));
  assert.match(query, /^query=query\(/u);
  assert.doesNotMatch(query, /\bmutation\b/u);
});

test('--json prints the same rows as data', async () => {
  const text = await run([]);
  const { code, stdout, stderr } = await run(['--json']);

  assert.equal(code, 0, stderr);
  const report = JSON.parse(stdout);
  assert.equal(report.generatedAt, NOW.toISOString());
  assert.deepEqual(report.warnings, []);
  assert.equal(`${renderTable(report.pullRequests)}\n`, text.stdout);
  assert.deepEqual(report.pullRequests[6], {
    number: 917,
    title: 'Show the sample totals row',
    closingIssues: [907],
    branch: 'feat/907-totals-row',
    author: 'sample-agent',
    headCommit: '7777777777777777777777777777777777777777',
    headCommittedAt: '2026-11-14T11:30:00Z',
    age: '30m',
    quality: 'pending',
    failedChecks: 0,
    pendingChecks: 4,
    mergeState: 'blocked',
    autoMerge: true,
    codexReview: 'done',
    unresolvedThreads: 0,
    worktree: '.worktrees/totals-row',
    nextAction: 'wait for CI',
  });
});

const READY = {
  mergeState: 'clean',
  quality: 'success',
  failedChecks: 0,
  pendingChecks: 0,
  unresolvedThreads: 0,
  codexReview: 'done',
  autoMerge: true,
};

for (const [name, change, action] of [
  ['a conflict', { mergeState: 'conflict' }, 'resolve the conflict'],
  [
    'a conflict before red CI',
    { mergeState: 'conflict', quality: 'failure', failedChecks: 1 },
    'resolve the conflict',
  ],
  ['a failed quality check', { quality: 'failure' }, 'diagnose the red CI'],
  [
    'a failed job while quality still runs',
    { quality: 'pending', failedChecks: 1, pendingChecks: 3 },
    'diagnose the red CI',
  ],
  [
    'a failed check outside a passed quality',
    { failedChecks: 1 },
    'nothing to do',
  ],
  ['one unresolved thread', { unresolvedThreads: 1 }, 'answer 1 thread'],
  [
    'unresolved threads before a pending Codex review',
    { unresolvedThreads: 3, codexReview: 'in_progress' },
    'answer 3 threads',
  ],
  [
    'a Codex review in progress',
    { codexReview: 'in_progress' },
    'wait for the Codex review',
  ],
  [
    'a Codex review of an older commit',
    { codexReview: 'stale' },
    'wait for the Codex review',
  ],
  ['no Codex review yet', { codexReview: 'none' }, 'wait for the Codex review'],
  [
    'an unreadable Codex review state',
    { codexReview: 'unreadable' },
    'wait for the Codex review',
  ],
  [
    'pending CI',
    { quality: 'pending', pendingChecks: 2, autoMerge: false },
    'wait for CI',
  ],
  ['CI not started', { quality: 'missing' }, 'wait for CI'],
  ['green without auto-merge', { autoMerge: false }, 'arm auto-merge or merge'],
  ['ready with auto-merge armed', {}, 'nothing to do'],
]) {
  test(`next action for ${name}: ${action}`, () => {
    assert.equal(nextAction({ ...READY, ...change }), action);
  });
}

function codexComment(state, login = 'chatgpt-codex-connector') {
  return {
    author: { login },
    body: `<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 ${state} -->\n\nSummary.`,
  };
}

const HEAD = 'c'.repeat(40);
const reviewOf = (sha, status = 'completed') =>
  JSON.stringify({ code_review: { commit_sha: sha, status } });

test('the Codex review state comes from the latest Codex summary for the head commit', () => {
  assert.equal(codexReviewState([], HEAD), 'none');
  assert.equal(codexReviewState([codexComment(reviewOf(HEAD))], HEAD), 'done');
  assert.equal(
    codexReviewState([codexComment(reviewOf('d'.repeat(40)))], HEAD),
    'stale',
  );
  assert.equal(
    codexReviewState([codexComment(reviewOf(HEAD, 'failed'))], HEAD),
    'failed',
  );
  assert.equal(
    codexReviewState(
      [
        codexComment(reviewOf('d'.repeat(40))),
        codexComment(reviewOf(HEAD, 'queued')),
      ],
      HEAD,
    ),
    'queued',
  );
  assert.equal(
    codexReviewState(
      [
        codexComment(reviewOf('d'.repeat(40))),
        codexComment(reviewOf(HEAD), 'someone-else'),
      ],
      HEAD,
    ),
    'stale',
    'a summary copied by another author is ignored',
  );
  assert.equal(
    codexReviewState([codexComment('{"code_review":')], HEAD),
    'unreadable',
  );
  assert.equal(
    codexReviewState([codexComment(reviewOf(HEAD, 'Done <b>'))], HEAD),
    'unreadable',
  );
});

test('reports GraphQL errors instead of rows', async () => {
  const graphql = JSON.stringify({
    data: null,
    errors: [{ message: 'Field "sample" does not exist' }],
  });
  const { code, stdout, stderr } = await run([], fakeCommands({ graphql }));

  assert.equal(code, 1);
  assert.equal(stdout, '');
  assert.match(stderr, /GitHub GraphQL error: Field "sample" does not exist/u);
});

test('rejects a response whose shape differs from the query', async () => {
  const response = JSON.parse(RESPONSE);
  delete response.data.repository.pullRequests.nodes[2].headRefOid;
  const { code, stdout, stderr } = await run(
    [],
    fakeCommands({ graphql: JSON.stringify(response) }),
  );

  assert.equal(code, 1);
  assert.equal(stdout, '');
  assert.match(
    stderr,
    /Unexpected GitHub response: pullRequests\.nodes\[2\]\.headRefOid should be a commit SHA\./u,
  );
});

test('explains a failed gh call', async () => {
  const missing = Object.assign(new Error('spawn gh ENOENT'), {
    code: 'ENOENT',
  });
  const absent = await run([], fakeCommands({ graphql: missing }));
  assert.equal(absent.code, 1);
  assert.match(absent.stderr, /GitHub CLI \(gh\) was not found/u);

  const denied = Object.assign(new Error('Command failed'), {
    stderr: 'HTTP 401: Bad credentials',
  });
  const refused = await run([], fakeCommands({ graphql: denied }));
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /Could not read from GitHub: HTTP 401/u);
});

test('names the limits it did not read past', async () => {
  const response = JSON.parse(RESPONSE);
  const { pullRequests } = response.data.repository;
  pullRequests.pageInfo.hasNextPage = true;
  pullRequests.totalCount = 140;
  pullRequests.nodes[2].reviewThreads.totalCount = 130;
  const graphql = JSON.stringify(response);
  const { code, stdout, stderr } = await run(
    ['--json'],
    fakeCommands({ graphql }),
  );

  assert.equal(code, 0, stderr);
  assert.deepEqual(JSON.parse(stdout).warnings, [
    'Only the first 100 of 140 open pull requests were read.',
    '#913: only the first 100 of 130 review threads were read.',
  ]);
  const text = await run([], fakeCommands({ graphql }));
  assert.match(text.stderr, /^Only the first 100 of 140 open pull requests/mu);
});

test('says when no pull request is open', async () => {
  const graphql = JSON.stringify({
    data: {
      repository: {
        pullRequests: {
          totalCount: 0,
          pageInfo: { hasNextPage: false },
          nodes: [],
        },
      },
    },
  });
  const { code, stdout } = await run([], fakeCommands({ graphql }));

  assert.equal(code, 0);
  assert.equal(stdout, 'No open pull requests.\n');
});

test('--help documents the columns and next actions without calling GitHub', async () => {
  const { code, stdout, calls } = await run(['--help']);

  assert.equal(code, 0);
  assert.deepEqual(calls, []);
  assert.match(stdout, /^Usage: node scripts\/pr-status\.mjs \[--json\]/u);
  for (const term of [
    'NEXT ACTION',
    'resolve the conflict',
    'wait for the Codex review',
    'arm auto-merge or merge',
    'never writes to GitHub',
  ])
    assert.ok(stdout.includes(term), term);
});

test('rejects an unknown argument', async () => {
  const { code, stderr, calls } = await run(['--watch']);

  assert.equal(code, 2);
  assert.deepEqual(calls, []);
  assert.match(stderr, /Unknown argument "--watch"/u);
});
