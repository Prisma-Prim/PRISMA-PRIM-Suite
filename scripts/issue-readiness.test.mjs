import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { bodyBlockers, claimOf, main } from './issue-readiness.mjs';

// GraphQL responses in the shape `gh api graphql` returned for these queries
// on 2026-11-14, with fictional issues 901 to 909. Each holds the issue
// query's response and, when the body names blockers, the blockers query's.
const RESPONSES = JSON.parse(
  readFileSync(
    new URL('./fixtures/issue-readiness/responses.json', import.meta.url),
    'utf8',
  ),
);

function fakeGitHub(responses = RESPONSES) {
  const calls = [];
  let current = null;
  const execFile = async (file, args) => {
    calls.push([file, ...args]);
    if (file !== 'gh') throw new Error(`Unexpected command ${file}`);
    const number = args.find((argument) => argument.startsWith('number='));
    if (number !== undefined) current = responses[number.slice(7)];
    const response = number === undefined ? current.blockers : current.issue;
    if (response instanceof Error) throw response;
    return {
      stdout:
        typeof response === 'string' ? response : JSON.stringify(response),
      stderr: '',
    };
  };
  return { calls, execFile };
}

async function run(argv, github = fakeGitHub()) {
  let stdout = '';
  let stderr = '';
  const code = await main({
    argv,
    execFile: github.execFile,
    stdout: { write: (text) => (stdout += text) },
    stderr: { write: (text) => (stderr += text) },
  });
  return { code, stdout, stderr, calls: github.calls };
}

const queries = (calls) =>
  calls.map((call) =>
    call.find((argument) => argument.startsWith('query=')).slice(6),
  );

const COMMENT = 'https://github.com/example-org/sample-repo/issues';

test('ready: an open issue whose blockers are closed, with no claim, pull request or sub-issue, exits 0', async () => {
  const { code, stdout, stderr, calls } = await run(['901']);

  assert.equal(stderr, '');
  assert.equal(stdout, '#901 Show the sample totals row\nverdict: ready\n');
  assert.equal(code, 0);
  assert.deepEqual(
    calls.map((call) => call.slice(0, 3)),
    [
      ['gh', 'api', 'graphql'],
      ['gh', 'api', 'graphql'],
    ],
  );
  assert.ok(calls[0].includes('number=901'));
  const [issueQuery, blockersQuery] = queries(calls);
  assert.match(issueQuery, /^query\(/u);
  assert.match(blockersQuery, /issue880: issueOrPullRequest\(number: 880\)/u);
  for (const query of [issueQuery, blockersQuery])
    assert.doesNotMatch(query, /\bmutation\b/u);
});

for (const [verdict, number, lines] of [
  [
    'closed',
    902,
    [
      '#902 Export the sample ledger as CSV',
      'verdict: closed',
      '- closed: completed, 2026-11-13T09:00:00Z',
    ],
  ],
  [
    'claimed',
    903,
    [
      '#903 Validate the sample import header',
      'verdict: claimed',
      `- claimed: Claude Code (sample-agent), 2026-11-14T10:00:00Z, branch fix/903-import-header, ${COMMENT}/903#issuecomment-9031`,
    ],
  ],
  [
    'pull request open',
    904,
    [
      '#904 Keep the sample queue order',
      'verdict: pull request open',
      '- pull request open: #914 (draft), branch feat/904-queue-order, https://github.com/example-org/sample-repo/pull/914',
    ],
  ],
  [
    'delivered',
    905,
    [
      '#905 Sample report columns, master specification',
      'verdict: delivered',
      '- delivered: all 2 sub-issues are closed: #921, #922',
    ],
  ],
  [
    'split',
    906,
    [
      '#906 Sample audit messages, master specification',
      'verdict: split',
      '- split: 2 of 3 sub-issues are open: #924, #925',
    ],
  ],
  [
    'blocked',
    907,
    [
      '#907 Retry the sample upload',
      'verdict: blocked',
      '- blocked: #883 is open (blocking dependency; "Blocked by" in the body)',
      '- blocked: #884 is open ("Blocked by" in the body)',
    ],
  ],
])
  test(`${verdict}: issue ${number} exits 1 with its reason`, async () => {
    const { code, stdout, stderr } = await run([String(number)]);

    assert.equal(stderr, '');
    assert.equal(stdout, `${lines.join('\n')}\n`);
    assert.equal(code, 1);
  });

test('blocked: the second query reads only the blockers the dependencies did not give', async () => {
  const { calls } = await run(['907']);

  const [, blockersQuery] = queries(calls);
  assert.deepEqual(
    [...blockersQuery.matchAll(/issueOrPullRequest\(number: (\d+)\)/gu)].map(
      ([, number]) => Number(number),
    ),
    [884, 885],
  );
});

test('combined reasons: an open issue lists every reason, and the first names the verdict', async () => {
  const { code, stdout } = await run(['#908']);

  assert.equal(
    stdout,
    [
      '#908 Label the sample export',
      'verdict: claimed',
      `- claimed: Codex launch comment (sample-owner), 2026-11-14T08:00:00Z, branch not named, ${COMMENT}/908#issuecomment-9081`,
      `- claimed: Codex Cloud (sample-agent), 2026-11-14T08:05:00Z, branch feat/908-export-label, ${COMMENT}/908#issuecomment-9082`,
      '- pull request open: #918, branch feat/908-export-label, https://github.com/example-org/sample-repo/pull/918',
      '- blocked: #887 is open (blocking dependency)',
      '',
    ].join('\n'),
  );
  assert.equal(code, 1);
});

test('combined reasons: a closed issue still lists the claim and sub-issues that applied', async () => {
  const { code, stdout } = await run(['909']);

  assert.equal(
    stdout,
    [
      '#909 Revise the sample certificate',
      'verdict: closed',
      '- closed: completed, 2026-11-13T20:00:00Z',
      `- claimed: Codex Cloud (sample-agent), 2026-11-13T18:20:00Z, branch feat/909-certificate-revisions, ${COMMENT}/909#issuecomment-9091`,
      '- delivered: all 2 sub-issues are closed: #926, #927',
      '',
    ].join('\n'),
  );
  assert.equal(code, 1);
});

test('--json prints the verdict and every reason as data, with the same exit code', async () => {
  const { code, stdout } = await run(['908', '--json']);

  assert.equal(code, 1);
  assert.deepEqual(JSON.parse(stdout), {
    issue: {
      number: 908,
      title: 'Label the sample export',
      url: 'https://github.com/example-org/sample-repo/issues/908',
      state: 'open',
    },
    verdict: 'claimed',
    reasons: [
      {
        reason: 'claimed',
        claims: [
          {
            harness: 'Codex launch comment',
            author: 'sample-owner',
            createdAt: '2026-11-14T08:00:00Z',
            branch: null,
            url: `${COMMENT}/908#issuecomment-9081`,
          },
          {
            harness: 'Codex Cloud',
            author: 'sample-agent',
            createdAt: '2026-11-14T08:05:00Z',
            branch: 'feat/908-export-label',
            url: `${COMMENT}/908#issuecomment-9082`,
          },
        ],
      },
      {
        reason: 'pull request open',
        pullRequests: [
          {
            number: 918,
            branch: 'feat/908-export-label',
            draft: false,
            url: 'https://github.com/example-org/sample-repo/pull/918',
          },
        ],
      },
      {
        reason: 'blocked',
        blockers: [{ number: 887, sources: ['dependency'] }],
      },
    ],
    warnings: [],
  });

  const ready = await run(['901', '--json']);
  assert.equal(ready.code, 0);
  assert.deepEqual(JSON.parse(ready.stdout).reasons, []);
  assert.equal(JSON.parse(ready.stdout).verdict, 'ready');
});

// Lead lines of real claim comments on this repository's issues, one per
// wording, with the issue that holds them.
const REAL_CLAIMS = [
  [
    1295,
    'Claimed in Codex Cloud on feat/1295-certificate-revisions after #1294 merged as ee8559b86f7f923c4ca5a202a5fad5292e7e44ac.',
    'Codex Cloud',
    'feat/1295-certificate-revisions',
  ],
  [
    1332,
    'Claimed by a local Claude Code session on branch `refactor/1332-company-grants-list`.',
    'Claude Code',
    'refactor/1332-company-grants-list',
  ],
  [
    1335,
    'Claimed: Claude Code (local harness), branch `test/1335-missing-actor-coverage`.',
    'Claude Code',
    'test/1335-missing-actor-coverage',
  ],
  [
    1287,
    'Claim: Claude Code local session, branch `claude/stoic-kapitsa-db4785`.',
    'Claude Code',
    'claude/stoic-kapitsa-db4785',
  ],
  [
    1056,
    'Session claim — fresh runtime principal `/root/working_evidence_runtime_1056`, issue #1056 only, branch `feat/1056-working-evidence-case`.',
    null,
    'feat/1056-working-evidence-case',
  ],
  [
    1366,
    'Codex Cloud claims #1366 on `feat/1366-pr-description-preflight`.',
    'Codex Cloud',
    'feat/1366-pr-description-preflight',
  ],
  [
    1077,
    'Claude Code (local harness) claims Stage 0 of this issue on branch `chore/1077-eslint-ts-assertion-baseline`.',
    'Claude Code',
    'chore/1077-eslint-ts-assertion-baseline',
  ],
  [
    1368,
    'Scheduled and reserved by the same Codex Cloud session after #1367, on planned branch `feat/1368-parallel-worktree-preparation`; implementation has not started.',
    'Codex Cloud',
    'feat/1368-parallel-worktree-preparation',
  ],
  [
    1220,
    "Taking over #1220 in Codex Cloud at the owner's explicit request in this session, through full merge. Branch: fix/1220-sensitive-access-identifiers.",
    'Codex Cloud',
    'fix/1220-sensitive-access-identifiers',
  ],
  [
    1220,
    'Claimed by Codex local Windows, branch `fix/1220-sensitive-access-identifiers`; owner explicitly selected #1220 for this session.',
    'Codex',
    'fix/1220-sensitive-access-identifiers',
  ],
  [
    221,
    'Taking #221 in ChatGPT Work on branch `agent/issue-221-claim-check`.',
    'ChatGPT Work',
    'agent/issue-221-claim-check',
  ],
  [
    610,
    'Codex Cloud owns #610 on fix/610-contract-draft-marker and coordinates its CI/review through merge.',
    'Codex Cloud',
    'fix/610-contract-draft-marker',
  ],
  [
    1123,
    'Claimed: Claude Code subagent, local Windows, branch mutation-test-gaps-1123.',
    'Claude Code',
    'mutation-test-gaps-1123',
  ],
  [
    340,
    'Claimed by the local Claude Opus 5.5 Extra author in isolated worktree issue-340-request-list-next-action.',
    'Claude',
    null,
  ],
  [
    658,
    '@codex Implement this issue in a fresh Codex Cloud task using the published repository environment profile.',
    'Codex launch comment',
    null,
  ],
  [
    71,
    '> *This was generated by AI during triage.*\n\n@codex Implement this issue completely from the current issue body and Agent Brief.',
    'Codex launch comment',
    null,
  ],
];

const comment = (body) => ({
  author: 'sample-agent',
  createdAt: '2026-11-14T00:00:00Z',
  url: 'https://example.invalid/comment',
  body,
});

for (const [source, body, harness, branch] of REAL_CLAIMS)
  test(`the claim wording of #${source} names ${harness ?? 'no harness'} and branch ${branch ?? 'none'}`, () => {
    assert.deepEqual(claimOf(comment(body)), {
      harness,
      author: 'sample-agent',
      createdAt: '2026-11-14T00:00:00Z',
      branch,
      url: 'https://example.invalid/comment',
    });
  });

// Real comments that mention a claim or the Codex mention but claim nothing.
const REAL_NON_CLAIMS = [
  [
    1220,
    'Claim released: the owner stopped this local session to delegate #1220 to Codex Cloud.',
  ],
  [
    788,
    'Completed claim: this Codex session delivered the focused PRD and seven synthetic replay recipes through merged PR #796.',
  ],
  [364, 'DELIVERED / claim released — cloud-0009 /root bounded-hold slice.'],
  [
    1174,
    'All five stages are merged: #1175 (PR #1183), #1176 (PR #1209), #1177 (PR #1213), #1178 (PR #1296), #1179 (PR #1222).',
  ],
  [
    238,
    "Presentation coordination update: #237 is now merged, #236 closed. I preserve this issue's active ChatGPT Work claim and will not start another implementation of it.",
  ],
  [147, '@codex review'],
];

for (const [source, body] of REAL_NON_CLAIMS)
  test(`the comment of #${source} claims nothing`, () => {
    assert.equal(claimOf(comment(body)), null);
  });

test('blockers come from a "Blocked by" line or section, and "none" names none', () => {
  for (const [body, numbers] of [
    ['Blocked by: #1372', [1372]],
    ['Blocked by: #1175, and the owner decision on the rule below.', [1175]],
    ['**Blocked by:** #12 and #13.', [12, 13]],
    ['- Blocked by: #14', [14]],
    ['Blocked by: none.', []],
    ['Blocked by: none (web only); schedule after #1176.', []],
    ['## Blocked by\n\nNone: #1280 is closed.\n', []],
    [
      '## Blocked by\n\n#1344, #1348, #1345 and #1346, so that the baseline records only what remains.\n\n## Exclusions\n\n#99',
      [1344, 1345, 1346, 1348],
    ],
    ['Parent: #1174.\n\nThe stage after #1177.', []],
    ['```text\nBlocked by: #15\n```', []],
    ['- **blocked**: a `Blocked by: #N` line names an open issue.', []],
    ['Blocked by: PR#16 and the issue #17.', [17]],
  ])
    assert.deepEqual(bodyBlockers(body), numbers, body);
});

test('a GraphQL error, a malformed response or a missing gh exits 2 without a verdict', async () => {
  const graphqlError = await run(
    ['902'],
    fakeGitHub({
      902: {
        issue: {
          data: { repository: { issue: null } },
          errors: [
            {
              message: 'Could not resolve to an Issue with the number of 902.',
            },
          ],
        },
      },
    }),
  );
  assert.equal(graphqlError.code, 2);
  assert.equal(graphqlError.stdout, '');
  assert.match(
    graphqlError.stderr,
    /GitHub GraphQL error: Could not resolve to an Issue/u,
  );

  const response = structuredClone(RESPONSES[903]);
  delete response.issue.data.repository.issue.comments.nodes[0].createdAt;
  const malformed = await run(['903'], fakeGitHub({ 903: response }));
  assert.equal(malformed.code, 2);
  assert.match(
    malformed.stderr,
    /Unexpected GitHub response: issue\.comments\.nodes\[0\]\.createdAt should be a date\./u,
  );

  const blockers = structuredClone(RESPONSES[907]);
  delete blockers.blockers.data.repository.issue885;
  const missingBlocker = await run(['907'], fakeGitHub({ 907: blockers }));
  assert.equal(missingBlocker.code, 2);
  assert.match(
    missingBlocker.stderr,
    /repository\.issue885 should be an object/u,
  );

  const absent = await run(
    ['902'],
    fakeGitHub({
      902: {
        issue: Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' }),
      },
    }),
  );
  assert.equal(absent.code, 2);
  assert.match(absent.stderr, /GitHub CLI \(gh\) was not found/u);

  const denied = await run(
    ['902'],
    fakeGitHub({
      902: {
        issue: Object.assign(new Error('Command failed'), {
          stderr: 'HTTP 401: Bad credentials',
        }),
      },
    }),
  );
  assert.equal(denied.code, 2);
  assert.match(denied.stderr, /Could not read from GitHub: HTTP 401/u);
});

test('names the comments it did not read past', async () => {
  const response = structuredClone(RESPONSES[901]);
  response.issue.data.repository.issue.comments.totalCount = 130;
  const github = fakeGitHub({ 901: response });

  const text = await run(['901'], github);
  assert.equal(text.code, 0);
  assert.equal(
    text.stderr,
    'Only the newest 1 of 130 comments were read; an older claim may be missing.\n',
  );
  const json = await run(['901', '--json'], fakeGitHub({ 901: response }));
  assert.deepEqual(JSON.parse(json.stdout).warnings, [
    'Only the newest 1 of 130 comments were read; an older claim may be missing.',
  ]);
});

test('--help documents the verdicts and exit codes without calling GitHub', async () => {
  const { code, stdout, calls } = await run(['--help']);

  assert.equal(code, 0);
  assert.deepEqual(calls, []);
  assert.match(
    stdout,
    /^Usage: node scripts\/issue-readiness\.mjs <issue> \[--json\]/u,
  );
  for (const term of [
    'never\nwrites to GitHub',
    'closed ',
    'claimed ',
    'pull request open ',
    'delivered ',
    'split ',
    'blocked ',
    'Exit codes: 0 ready, 1 not ready, 2 invalid arguments',
  ])
    assert.ok(stdout.includes(term), term);
});

test('rejects a missing, malformed or second issue number with exit 2', async () => {
  for (const argv of [
    [],
    ['--json'],
    ['abc'],
    ['0'],
    ['901', '902'],
    ['--watch'],
  ]) {
    const { code, stderr, calls } = await run(argv);
    assert.equal(code, 2, argv.join(' '));
    assert.deepEqual(calls, []);
    assert.match(stderr, /Name one issue number|Unknown argument/u);
  }
});
