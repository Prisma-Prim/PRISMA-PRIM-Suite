import assert from 'node:assert/strict';
import test from 'node:test';

import { main, parseArguments } from './delivery-metrics.mjs';

const NOW = new Date('2026-11-07T12:00:00Z');
const REPOSITORY = 'Prisma-Prim/PRISMA-PRIM-Suite';

// ---- GraphQL-shaped fixtures ------------------------------------------------

function codexBody(severity, title) {
  return `**<sub><sub>![${severity} Badge](https://img.shields.io/badge/${severity}-orange?style=flat)</sub></sub>  ${title}**\n\nDetails of the finding.\n\n<!-- codex-code-review-finding:v1 -->`;
}

function comment(author, createdAt, body) {
  return {
    createdAt,
    body,
    url: `https://github.com/${REPOSITORY}/pull/0#discussion_r${createdAt}`,
    author: { login: author },
  };
}

function thread({ path, resolved = false, comments }) {
  return {
    isResolved: resolved,
    path,
    comments: { nodes: comments },
  };
}

// One check suite per workflow run. A CI run holds its `quality` job last;
// `jobs` are its other jobs, and `quality: false` makes another workflow.
function commit(oid, authoredDate, { parents = 1, runs = [] } = {}) {
  return {
    commit: {
      oid,
      authoredDate,
      parents: { totalCount: parents },
      checkSuites: {
        nodes: runs.map(
          ({
            conclusion,
            startedAt,
            event = 'pull_request',
            createdAt = startedAt,
            jobs = [],
            quality = true,
          }) => ({
            // The workflow run's conclusion; a cancelled run fails its quality job.
            conclusion,
            workflowRun: { event, createdAt },
            checkRuns: {
              nodes: [
                ...jobs.map((job) => ({
                  status: 'COMPLETED',
                  conclusion: 'SUCCESS',
                  ...job,
                })),
                ...(quality
                  ? [
                      {
                        name: 'quality',
                        conclusion:
                          conclusion === 'CANCELLED' ? 'FAILURE' : conclusion,
                        status: 'COMPLETED',
                        startedAt,
                        completedAt: startedAt,
                      },
                    ]
                  : []),
              ],
            },
          }),
        ),
      },
    },
  };
}

const mergeCommitOf = (number) => `a${String(number).padStart(39, '0')}`;

function pullRequest({
  number,
  title,
  body = '',
  merged = true,
  at = '2026-11-03T12:00:00Z',
  commits = [],
  comments = [],
  reviews = [],
  threads = [],
  files = [],
}) {
  return {
    number,
    title,
    body,
    url: `https://github.com/${REPOSITORY}/pull/${number}`,
    merged,
    mergedAt: merged ? at : null,
    closedAt: at,
    mergeCommit: merged ? { oid: mergeCommitOf(number) } : null,
    author: { login: 'Dan-Popescu' },
    commits: { nodes: commits },
    comments: { nodes: comments },
    reviews: { nodes: reviews },
    reviewThreads: { nodes: threads },
    // GraphQL returns at most the first 100 changed files.
    files: {
      totalCount: files.length,
      nodes: files.slice(0, 100).map((path) => ({ path })),
    },
  };
}

function issue(
  number,
  { title = 'main is red since abc1234', closed = false },
) {
  return {
    number,
    title,
    url: `https://github.com/${REPOSITORY}/issues/${number}`,
    createdAt: '2026-11-04T02:30:00Z',
    closed,
  };
}

const codexReview = (submittedAt) => ({
  author: { login: 'chatgpt-codex-connector' },
  submittedAt,
});

// ---- A week of delivery -----------------------------------------------------

const mergedPullRequests = [
  // Two commits after the first automated review (the bounded rule) and one
  // merge commit that must not count. One finding per outcome.
  pullRequest({
    number: 101,
    title: 'feat: alpha',
    files: [
      'apps/api/src/access/company-grants.ts',
      'apps/api/src/access/company-grants.test.ts',
      // The web app's access folder is not the Access module.
      'apps/web/src/access/AccessPanel.tsx',
    ],
    commits: [
      commit('c1', '2026-10-31T09:00:00Z', {
        runs: [
          { conclusion: 'CANCELLED', startedAt: '2026-10-31T09:05:00Z' },
          { conclusion: 'FAILURE', startedAt: '2026-10-31T09:10:00Z' },
        ],
      }),
      commit('c2', '2026-10-31T11:00:00Z', {
        runs: [{ conclusion: 'SUCCESS', startedAt: '2026-10-31T11:05:00Z' }],
      }),
      commit('c3', '2026-10-31T12:00:00Z'),
      commit('c4', '2026-10-31T13:00:00Z', { parents: 2 }),
    ],
    reviews: [codexReview('2026-10-31T10:00:00Z')],
    threads: [
      // Resolved, and the later commit c2 touched the commented file.
      thread({
        path: 'src/a.ts',
        resolved: true,
        comments: [
          comment(
            'chatgpt-codex-connector[bot]',
            '2026-10-31T10:00:00Z',
            codexBody('P1', 'Keep the tenancy check'),
          ),
        ],
      }),
      // Unresolved, but a reply says it was fixed.
      thread({
        path: 'src/b.ts',
        comments: [
          comment(
            'chatgpt-codex-connector[bot]',
            '2026-10-31T10:00:01Z',
            codexBody('P2', 'Escape the label'),
          ),
          comment('Dan-Popescu', '2026-10-31T11:30:00Z', 'Fixed in c3.'),
        ],
      }),
      // A reply records it as a follow-up.
      thread({
        path: 'docs/x.md',
        comments: [
          comment(
            'chatgpt-codex-connector[bot]',
            '2026-10-31T10:00:02Z',
            codexBody('P2', 'Wording drifts from the ADR'),
          ),
          comment(
            'Dan-Popescu',
            '2026-10-31T11:31:00Z',
            'Recorded as a follow-up in #120.',
          ),
        ],
      }),
      // Nothing answers it.
      thread({
        path: 'src/z.ts',
        comments: [
          comment(
            'chatgpt-codex-connector[bot]',
            '2026-10-31T10:00:03Z',
            codexBody('P0', 'Data loss on retry'),
          ),
        ],
      }),
      // A human thread is not a reviewer finding.
      thread({
        path: 'src/a.ts',
        comments: [comment('Dan-Popescu', '2026-10-31T10:30:00Z', 'Why?')],
      }),
    ],
  }),
  // Three commits after the first automated review: above the bounded rule.
  // The finding's follow-up is recorded in the pull request body.
  pullRequest({
    number: 102,
    title: 'fix: beta',
    files: [
      'apps/api/drizzle/0099_beta.sql',
      'apps/api/drizzle/meta/_journal.json',
      'apps/api/src/database/schema/core.ts',
      'apps/api/src/client/client.ts',
    ],
    body: '## Scope\n\n- Follow-ups:\n  - `src/c.ts` still logs the raw id.\n\n## Tests added\n\nnone',
    at: '2026-11-04T12:00:00Z',
    commits: [
      commit('d1', '2026-11-04T08:00:00Z', {
        runs: [{ conclusion: 'SUCCESS', startedAt: '2026-11-04T08:05:00Z' }],
      }),
      commit('d2', '2026-11-04T09:30:00Z'),
      commit('d3', '2026-11-04T10:30:00Z'),
      commit('d4', '2026-11-04T11:30:00Z'),
    ],
    reviews: [codexReview('2026-11-04T09:00:00Z')],
    threads: [
      thread({
        path: 'src/c.ts',
        comments: [
          comment(
            'chatgpt-codex-connector[bot]',
            '2026-11-04T09:00:00Z',
            codexBody('P2', 'Log the opaque id only'),
          ),
        ],
      }),
    ],
  }),
  // No automated review: no review rounds, still counted in CI.
  pullRequest({
    number: 103,
    title: 'docs: gamma',
    // Near misses: neither file is under a sensitive folder.
    files: [
      'docs/agents/environment-friction.md',
      'apps/api/src/accessibility-notes.md',
    ],
    at: '2026-11-05T12:00:00Z',
    commits: [
      commit('e1', '2026-11-05T08:00:00Z', {
        runs: [
          // A merge-queue run is not a pull request run.
          {
            conclusion: 'FAILURE',
            startedAt: '2026-11-05T07:00:00Z',
            event: 'merge_group',
          },
          { conclusion: 'SUCCESS', startedAt: '2026-11-05T08:05:00Z' },
        ],
      }),
    ],
  }),
  // A merged revert of #101 by merge commit. The automated review found
  // nothing, so it left only its summary comment.
  pullRequest({
    number: 104,
    title: 'Revert "feat: alpha" (#104)',
    files: ['apps/api/src/accountability/activity-log.controller.ts'],
    body: `This reverts commit ${mergeCommitOf(101)}.`,
    at: '2026-11-06T12:00:00Z',
    commits: [commit('f1', '2026-11-06T11:00:00Z')],
    comments: [
      {
        author: { login: 'chatgpt-codex-connector' },
        createdAt: '2026-11-06T10:00:00Z',
      },
    ],
  }),
  // Not titled Revert, but its body says what it reverts.
  pullRequest({
    number: 105,
    title: 'chore: back out the beta change',
    files: ['.github/workflows/ci.yml', 'scripts/ci-change-scope.mjs'],
    body: 'Reverts #102 because it broke the import.',
    at: '2026-11-06T13:00:00Z',
    commits: [commit('g1', '2026-11-06T12:30:00Z')],
    comments: [
      {
        author: { login: 'chatgpt-codex-connector' },
        createdAt: '2026-11-06T13:30:00Z',
      },
    ],
  }),
];

const closedPullRequests = [
  pullRequest({
    number: 106,
    title: 'ci: throwaway proof',
    // Closed without merge: never a sensitive merge.
    files: ['.github/workflows/main-health.yml'],
    merged: false,
    at: '2026-11-05T18:00:00Z',
    commits: [
      commit('h1', '2026-11-05T17:00:00Z', {
        runs: [{ conclusion: 'SUCCESS', startedAt: '2026-11-05T17:05:00Z' }],
      }),
    ],
  }),
];

const mainCommits = [
  {
    sha: 'merge-104',
    html_url: `https://github.com/${REPOSITORY}/commit/merge-104`,
    commit: {
      message: `Revert "feat: alpha" (#104)\n\nThis reverts commit ${mergeCommitOf(101)}.`,
    },
  },
  {
    sha: 'direct-1',
    html_url: `https://github.com/${REPOSITORY}/commit/direct-1`,
    commit: { message: 'Revert "hotfix: pin the base image"' },
  },
  {
    sha: 'direct-2',
    html_url: `https://github.com/${REPOSITORY}/commit/direct-2`,
    commit: { message: 'Revert "fix: beta (#102)"' },
  },
  {
    sha: 'merge-103',
    html_url: `https://github.com/${REPOSITORY}/commit/merge-103`,
    commit: { message: 'docs: gamma (#103)' },
  },
];

// ---- Stubbed gh -------------------------------------------------------------

function fieldsOf(args) {
  const fields = {};
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === '-f' || args[index] === '-F') {
      const [name, ...value] = args[index + 1].split('=');
      fields[name] = value.join('=');
    }
  }
  return fields;
}

function stubGh({
  merged = mergedPullRequests,
  closed = closedPullRequests,
  commits = mainCommits,
  files = { c2: ['src/a.ts', 'README.md'] },
  issues = [],
  pullRequestFiles = {},
  pageSize = 100,
} = {}) {
  const calls = [];
  const execFile = async (file, args) => {
    calls.push({ file, args });
    assert.equal(file, 'gh');
    const [command, target] = args;
    assert.equal(command, 'api');

    if (target === 'graphql') {
      const { query, q, after } = fieldsOf(args);
      assert.doesNotMatch(query, /mutation/u);
      const list = q.includes('is:issue')
        ? issues
        : q.includes('is:unmerged')
          ? closed
          : merged;
      const start = after ? Number(after.replace('cursor-', '')) : 0;
      const page = list.slice(start, start + pageSize);
      const end = start + page.length;
      return {
        stdout: JSON.stringify({
          data: {
            search: {
              pageInfo: {
                hasNextPage: end < list.length,
                endCursor: `cursor-${end}`,
              },
              nodes: page,
            },
          },
        }),
      };
    }

    const commitFiles = /^repos\/[^/]+\/[^/]+\/commits\/([^/?]+)$/u.exec(
      target,
    );
    if (commitFiles) {
      return {
        stdout: JSON.stringify({
          files: (files[commitFiles[1]] ?? []).map((filename) => ({
            filename,
          })),
        }),
      };
    }
    if (/^repos\/[^/]+\/[^/]+\/commits\?/u.test(target)) {
      return { stdout: JSON.stringify(commits) };
    }
    const changedFiles =
      /^repos\/[^/]+\/[^/]+\/pulls\/(\d+)\/files\?per_page=100&page=(\d+)$/u.exec(
        target,
      );
    if (changedFiles) {
      const all = pullRequestFiles[changedFiles[1]] ?? [];
      const start = (Number(changedFiles[2]) - 1) * 100;
      return {
        stdout: JSON.stringify(
          all.slice(start, start + 100).map((filename) => ({ filename })),
        ),
      };
    }
    throw new Error(`Unexpected gh call: ${args.join(' ')}`);
  };
  return { execFile, calls };
}

async function run(argv, github = stubGh()) {
  let out = '';
  let err = '';
  const code = await main({
    argv,
    execFile: github.execFile,
    stdout: { write: (text) => (out += text) },
    stderr: { write: (text) => (err += text) },
    now: () => NOW,
  });
  return { code, out, err, calls: github.calls };
}

function section(report, heading) {
  const start = report.indexOf(`## ${heading}`);
  assert.notEqual(start, -1, `report has a "${heading}" section`);
  const next = report.indexOf('\n## ', start + 1);
  return report.slice(start, next === -1 ? undefined : next);
}

/** A `###` part of the "To inspect" section. */
function inspected(report, heading) {
  const part = section(report, 'To inspect');
  const start = part.indexOf(`\n### ${heading}\n`);
  assert.notEqual(start, -1, `"To inspect" has a "${heading}" part`);
  const next = part.indexOf('\n### ', start + 1);
  return part.slice(start, next === -1 ? undefined : next);
}

// ---- Tests ------------------------------------------------------------------

test('the report counts merged pull requests and those closed without merge', async () => {
  const { code, out } = await run(['--since', '2026-10-31']);

  assert.equal(code, 0);
  const pullRequests = section(out, 'Pull requests');
  assert.match(pullRequests, /Merged: 5/u);
  assert.match(pullRequests, /Closed without merge: 1/u);
  assert.match(
    pullRequests,
    /\[#106\]\(https:\/\/github\.com\/Prisma-Prim\/PRISMA-PRIM-Suite\/pull\/106\)/u,
  );
});

test('the window defaults to the last 7 days and --since/--until override it', async () => {
  const defaults = await run([]);
  const search = defaults.calls
    .map(({ args }) => fieldsOf(args).q)
    .filter(Boolean);
  assert.ok(
    search.every((q) =>
      q.includes('2026-10-31T12:00:00Z..2026-11-07T12:00:00Z'),
    ),
    `default window is the last 7 days: ${search.join(' | ')}`,
  );
  assert.match(defaults.out, /2026-10-31T12:00:00Z/u);

  const explicit = await run([
    '--since',
    '2026-11-01',
    '--until',
    '2026-11-03',
  ]);
  const explicitSearch = explicit.calls
    .map(({ args }) => fieldsOf(args).q)
    .filter(Boolean);
  // A date-only --until covers that whole UTC day.
  assert.ok(
    explicitSearch.every((q) =>
      q.includes('2026-11-01T00:00:00Z..2026-11-03T23:59:59Z'),
    ),
    explicitSearch.join(' | '),
  );
});

test('reverts list revert pull requests, revert commits and what they revert', async () => {
  const { out } = await run(['--since', '2026-10-31']);
  const reverts = section(out, 'Reverts');

  assert.match(reverts, /\[#104\].*reverts #101 \(merged in the window\)/u);
  assert.match(reverts, /\[#105\].*reverts #102 \(merged in the window\)/u);
  assert.match(reverts, /direct-1.*Revert "hotfix: pin the base image"/u);
  assert.match(reverts, /direct-2.*reverts #102 \(merged in the window\)/u);
  // The squash commit of #104 is the same revert, not a second one.
  assert.doesNotMatch(reverts, /merge-104/u);
  assert.doesNotMatch(reverts, /#103/u);
});

test('review rounds count non-merge commits after the first automated review and flag the bounded rule', async () => {
  const { out } = await run(['--since', '2026-10-31']);
  const rounds = section(out, 'Review rounds');

  // #101: c2 and c3 (the merge commit c4 is ignored) = 2; #102: d2, d3, d4 = 3;
  // #104: f1 after its summary comment, with no inline finding = 1.
  // #105: reviewed after its only commit = 0.
  assert.match(rounds, /4 of 5 merged pull requests had an automated review/u);
  assert.match(rounds, /median 1\.5, max 3/u);
  assert.match(
    rounds,
    /by pull request: #101 2, #102 3, #104 1; the other 1 had 0\./u,
  );
  assert.match(rounds, /\[#102\][^\n]*: 3 commits/u);
  assert.doesNotMatch(rounds, /\[#101\][^\n]*: \d+ commits/u);
});

test('findings are counted by severity and classified by outcome', async () => {
  const { out } = await run(['--since', '2026-10-31']);
  const findings = section(out, 'Automated reviewer findings');

  assert.match(findings, /5 findings in 2 pull requests/u);
  // Severity | Total | Fixed | Follow-up | Open
  assert.match(findings, /\| P0 \| 1 \| 0 \| 0 \| 1 \|/u);
  assert.match(findings, /\| P1 \| 1 \| 1 \| 0 \| 0 \|/u);
  assert.match(findings, /\| P2 \| 3 \| 1 \| 2 \| 0 \|/u);
  assert.match(findings, /\[#101\][^\n]*Data loss on retry/u);
});

test('a resolved thread is fixed only when a later commit touched its file', async () => {
  const github = stubGh({ files: { c2: ['README.md'], c3: [] } });
  const { out } = await run(['--since', '2026-10-31'], github);
  const findings = section(out, 'Automated reviewer findings');

  // P1 is resolved but nothing touched src/a.ts afterwards: it stays open.
  assert.match(findings, /\| P1 \| 1 \| 0 \| 0 \| 1 \|/u);
});

test('CI reports the first-run pass rate of quality and the cancelled runs', async () => {
  const { out } = await run(['--since', '2026-10-31']);
  const ci = section(out, 'CI');

  // #101 failed first; #102, #103 and #106 passed; #104 and #105 have no run.
  assert.match(ci, /first-run pass rate: 3\/4 \(75\.0%\)/u);
  assert.match(ci, /Cancelled `quality` runs: 1/u);
});

test('an empty window still prints every section', async () => {
  const { code, out } = await run(
    ['--since', '2026-11-01'],
    stubGh({ merged: [], closed: [], commits: [] }),
  );

  assert.equal(code, 0);
  assert.match(section(out, 'Pull requests'), /Merged: 0/u);
  assert.match(section(out, 'Reverts'), /none/u);
  assert.match(
    section(out, 'Review rounds'),
    /no merged pull request had an automated review/u,
  );
  assert.match(section(out, 'Automated reviewer findings'), /none/u);
  assert.match(section(out, 'CI'), /first-run pass rate: n\/a/u);
  for (const part of [
    'Sensitive merges',
    'Review threads resolved without an answer',
    'Follow-ups recorded in pull request bodies',
    '`main-red` issues opened',
  ]) {
    assert.match(inspected(out, part), /\n- none\n/u, part);
  }
  assert.match(inspected(out, 'CI critical path'), /- no completed CI run\./u);
});

test('search results are read page by page', async () => {
  const { out, calls } = await run(
    ['--since', '2026-10-31'],
    stubGh({ pageSize: 2 }),
  );

  assert.match(section(out, 'Pull requests'), /Merged: 5/u);
  const mergedPages = calls.filter(({ args }) =>
    fieldsOf(args).q?.includes('is:merged'),
  );
  assert.equal(mergedPages.length, 3);
});

test('the script only reads from GitHub', async () => {
  const { calls } = await run(['--since', '2026-10-31']);

  assert.ok(calls.length > 0);
  for (const { args } of calls) {
    assert.ok(
      !args.some((argument) =>
        ['-X', '--method', '--input'].includes(argument),
      ),
      `read-only call: ${args.join(' ')}`,
    );
  }
});

test('commit file lists are fetched once per commit and only when needed', async () => {
  const { calls } = await run(['--since', '2026-10-31']);
  const fileCalls = calls.filter(({ args }) =>
    /\/commits\/[^/?]+$/u.test(args[1]),
  );

  // Only the resolved thread on #101 needs the commits after it (c2, c3).
  assert.deepEqual(
    fileCalls.map(({ args }) => args[1].split('/').pop()).sort(),
    ['c2'],
  );
});

test('a revert is counted even when its target merged before the window', async () => {
  const merged = [
    pullRequest({
      number: 201,
      title: 'fix: roll back broken setting',
      body: 'Reverts #100 because it broke the import.',
      at: '2026-11-04T12:00:00Z',
      commits: [commit('r1', '2026-11-04T11:00:00Z')],
    }),
    // Advice on how to undo a change is not a revert.
    pullRequest({
      number: 202,
      title: 'feat: new setting',
      body: 'How to revert: revert #202, or revert #150 first.',
      at: '2026-11-04T13:00:00Z',
      commits: [commit('r2', '2026-11-04T12:30:00Z')],
    }),
  ];
  const { out } = await run(
    ['--since', '2026-11-01'],
    stubGh({ merged, closed: [], commits: [] }),
  );
  const reverts = section(out, 'Reverts');

  // #100 is only annotated, and not as merged in the window.
  assert.match(reverts, /\[#201\][^\n]*: reverts #100$/mu);
  assert.doesNotMatch(reverts, /#202/u);
});

test('finding outcomes use only the evidence that existed at merge', async () => {
  const finding = (path, { resolved = false, replies = [] } = {}) =>
    thread({
      path,
      resolved,
      comments: [
        comment(
          'chatgpt-codex-connector[bot]',
          '2026-11-04T09:00:00Z',
          codexBody('P2', `Finding in ${path}`),
        ),
        ...replies,
      ],
    });
  const merged = [
    pullRequest({
      number: 301,
      title: 'fix: delta',
      at: '2026-11-04T12:00:00Z',
      commits: [
        commit('k1', '2026-11-04T08:00:00Z'),
        // Authored after the merge: it cannot have fixed anything at merge.
        commit('k2', '2026-11-04T13:00:00Z'),
      ],
      reviews: [codexReview('2026-11-04T09:00:00Z')],
      threads: [
        // A fix claimed only after the merge.
        finding('src/a.ts', {
          replies: [
            comment('Dan-Popescu', '2026-11-05T09:00:00Z', 'Fixed in k1.'),
          ],
        }),
        // A follow-up recorded only after the merge.
        finding('src/b.ts', {
          replies: [
            comment(
              'Dan-Popescu',
              '2026-11-05T09:00:00Z',
              'Recorded as a follow-up.',
            ),
          ],
        }),
        // The same fix reply, but before the merge: the control.
        finding('src/c.ts', {
          replies: [
            comment('Dan-Popescu', '2026-11-04T11:00:00Z', 'Fixed in k1.'),
          ],
        }),
        // Resolved, and touched by a commit that postdates the merge.
        finding('src/d.ts', { resolved: true }),
      ],
    }),
  ];
  const { out } = await run(
    ['--since', '2026-11-01'],
    stubGh({
      merged,
      closed: [],
      commits: [],
      files: { k2: ['src/d.ts'] },
    }),
  );
  const findings = section(out, 'Automated reviewer findings');

  assert.match(findings, /\| P2 \| 4 \| 1 \| 0 \| 3 \|/u);
  for (const path of ['a', 'b', 'd']) {
    assert.match(findings, new RegExp(`\\(\`src/${path}\\.ts\`\\)`, 'u'));
  }
  assert.doesNotMatch(findings, /src\/c\.ts/u);
  // GitHub dates neither resolution nor the body, and the report says so.
  assert.match(findings, /read as of this report/u);
  // The post-merge commit is not a review round either.
  assert.match(section(out, 'Review rounds'), /every one had 0/u);
});

test('arguments are validated', async () => {
  assert.throws(
    () => parseArguments(['--since', 'last week'], NOW),
    /--since/u,
  );
  assert.throws(() => parseArguments(['--bogus'], NOW), /Usage/u);
  assert.throws(
    () =>
      parseArguments(['--since', '2026-11-05', '--until', '2026-11-01'], NOW),
    /before/u,
  );

  const rejected = await run(['--since', 'nonsense']);
  assert.equal(rejected.code, 2);
  assert.match(rejected.err, /Usage: node scripts\/delivery-metrics\.mjs/u);

  const help = await run(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.out, /Usage: node scripts\/delivery-metrics\.mjs/u);
  assert.equal(help.calls.length, 0);
});

test('a missing GitHub CLI is reported without a stack trace', async () => {
  const failure = Object.assign(new Error('spawn gh ENOENT'), {
    code: 'ENOENT',
  });
  const { code, err } = await run([], {
    execFile: async () => {
      throw failure;
    },
    calls: [],
  });

  assert.equal(code, 1);
  assert.match(err, /GitHub CLI \(gh\) was not found/u);
});

// ---- To inspect -------------------------------------------------------------

test('to inspect lists sensitive merges, a resolved unanswered thread and a recorded follow-up', async () => {
  const { out } = await run(['--since', '2026-10-31']);

  const sensitive = inspected(out, 'Sensitive merges');
  assert.match(
    sensitive,
    /^- \[#101\]\(https:\/\/github\.com\/Prisma-Prim\/PRISMA-PRIM-Suite\/pull\/101\) feat: alpha \(`apps\/api\/src\/access\/`\)$/mu,
  );
  assert.match(
    sensitive,
    /^- \[#102\][^\n]* \(`apps\/api\/drizzle\/`, `apps\/api\/src\/database\/schema\/`\)$/mu,
  );
  assert.match(
    sensitive,
    /^- \[#104\][^\n]* \(`apps\/api\/src\/accountability\/`\)$/mu,
  );
  assert.match(sensitive, /^- \[#105\][^\n]* \(`\.github\/workflows\/`\)$/mu);
  // Near misses, and a pull request closed without merge.
  assert.doesNotMatch(sensitive, /#103|#106/u);

  // #101's resolved thread on src/a.ts has no reply at all.
  assert.match(
    inspected(out, 'Review threads resolved without an answer'),
    /\n- \[#101\]\([^)]+\) `src\/a\.ts`: Keep the tenancy check\n/u,
  );
  assert.match(
    inspected(out, 'Follow-ups recorded in pull request bodies'),
    /\n- `apps\/api` \(1\)\n {2}- \[#102\]\([^)]+\): `src\/c\.ts` still logs the raw id\.\n/u,
  );
  assert.match(section(out, 'Method'), /To inspect/u);
});

test('a merged pull request with more than 100 changed files is read in full', async () => {
  const files = [
    ...Array.from({ length: 120 }, (_, page) => `docs/notes/page-${page}.md`),
    '.github/workflows/weekly-inspection.yml',
  ];
  const merged = [
    pullRequest({
      number: 401,
      title: 'docs: many pages',
      at: '2026-11-04T12:00:00Z',
      files,
    }),
    pullRequest({
      number: 402,
      title: 'docs: one page',
      at: '2026-11-04T13:00:00Z',
      files: ['docs/one.md'],
    }),
  ];
  const { out, calls } = await run(
    ['--since', '2026-11-01'],
    stubGh({
      merged,
      closed: [],
      commits: [],
      pullRequestFiles: { 401: files },
    }),
  );

  // The workflow file is only in the REST pages, past GraphQL's first 100.
  assert.match(
    inspected(out, 'Sensitive merges'),
    /\n- \[#401\][^\n]* \(`\.github\/workflows\/`\)\n/u,
  );
  assert.deepEqual(
    calls
      .map(({ args }) => args[1])
      .filter((target) => /\/pulls\//u.test(target)),
    [
      `repos/${REPOSITORY}/pulls/401/files?per_page=100&page=1`,
      `repos/${REPOSITORY}/pulls/401/files?per_page=100&page=2`,
    ],
  );
});

test('a resolved review thread counts unless a reply says fixed, names a follow-up issue or says not valid', async () => {
  const reviewThread = (
    path,
    replies,
    { opener = 'chatgpt-codex-connector[bot]', resolved = true } = {},
  ) =>
    thread({
      path,
      resolved,
      comments: [
        comment(
          opener,
          '2026-11-04T09:00:00Z',
          codexBody('P2', `Finding in ${path}`),
        ),
        ...replies.map((body, index) =>
          comment('Dan-Popescu', `2026-11-04T10:0${index}:00Z`, body),
        ),
      ],
    });
  const merged = [
    pullRequest({
      number: 501,
      title: 'feat: epsilon',
      at: '2026-11-04T12:00:00Z',
      threads: [
        reviewThread('src/fixed.ts', ['Fixed in abc1234.']),
        reviewThread('src/numbered.ts', [
          'Follow-up #530: the cache needs its own ticket.',
        ]),
        reviewThread('src/invalid.ts', [
          'Not valid: the guard already rejects it.',
        ]),
        // Answered, but neither fixed, a numbered follow-up nor not valid.
        reviewThread('src/vague.ts', ['Recorded as a follow-up.']),
        reviewThread('src/thanks.ts', ['Thanks, good point.']),
        reviewThread('src/silent.ts', []),
        // The reviewer's own reply is not an answer.
        thread({
          path: 'src/echo.ts',
          resolved: true,
          comments: [
            comment(
              'chatgpt-codex-connector[bot]',
              '2026-11-04T09:00:00Z',
              codexBody('P1', 'Finding in src/echo.ts'),
            ),
            comment(
              'chatgpt-codex-connector[bot]',
              '2026-11-04T09:30:00Z',
              'Fixed upstream?',
            ),
          ],
        }),
        // A human thread follows the same rule.
        reviewThread('src/question.ts', [], { opener: 'Dan-Popescu' }),
        // An unresolved thread is not a resolved one.
        reviewThread('src/open.ts', [], { resolved: false }),
      ],
    }),
  ];
  const { out } = await run(
    ['--since', '2026-11-01'],
    stubGh({ merged, closed: [], commits: [] }),
  );
  const unanswered = inspected(
    out,
    'Review threads resolved without an answer',
  );

  for (const path of ['vague', 'thanks', 'silent', 'echo', 'question']) {
    assert.match(
      unanswered,
      new RegExp(`\\n- \\[#501\\]\\([^)]+\\) \`src/${path}\\.ts\`: `, 'u'),
      path,
    );
  }
  for (const path of ['fixed', 'numbered', 'invalid', 'open']) {
    assert.doesNotMatch(unanswered, new RegExp(`src/${path}\\.ts`, 'u'), path);
  }
});

test('follow-ups recorded in pull request bodies are grouped by top-level folder', async () => {
  const merged = [
    pullRequest({
      number: 601,
      title: 'fix: zeta',
      at: '2026-11-04T12:00:00Z',
      // The Delivered line mentions follow-up but is not a Follow-ups entry.
      body: '## Scope\n\n- Delivered: answer each thread: fixed, follow-up `#N`, or not valid.\n- Follow-ups: #1106 moves the queries behind Access.\n\n## Tests added\n\nnone',
      files: [
        'apps/api/src/access/a.ts',
        'apps/api/src/access/b.ts',
        'docs/x.md',
      ],
    }),
    pullRequest({
      number: 602,
      title: 'fix: eta',
      at: '2026-11-04T13:00:00Z',
      body: '## Scope\r\n\r\n- Follow-ups (not created as issues):\r\n  - **Migrate** the six callers\r\n    to `request<unknown>`.\r\n  - Replace the local helpers.\r\n- Excluded: settings.\r\n',
      files: ['apps/api/src/client/c.ts'],
    }),
    pullRequest({
      number: 603,
      title: 'test: theta',
      at: '2026-11-04T14:00:00Z',
      body: '- Follow-up issues created: none (candidates below).\n\n## Follow-ups\n\n- The sibling effect has the same shape.\n\n## Risks\n\n- none',
      files: ['apps/web/src/a.tsx', 'apps/web/src/b.tsx', 'apps/api/src/c.ts'],
    }),
    pullRequest({
      number: 604,
      title: 'docs: iota',
      at: '2026-11-04T15:00:00Z',
      body: '- Follow-ups: none.',
      files: ['docs/y.md'],
    }),
    pullRequest({
      number: 605,
      title: 'chore: kappa',
      at: '2026-11-04T16:00:00Z',
      body: '- **Follow-ups:** the doctor still probes pnpm twice.',
      files: [
        'scripts/agent-doctor.mjs',
        'scripts/agent-doctor.test.mjs',
        'package.json',
      ],
    }),
  ];
  const { out } = await run(
    ['--since', '2026-11-01'],
    stubGh({ merged, closed: [], commits: [] }),
  );
  const pull = (number) =>
    `[#${number}](https://github.com/${REPOSITORY}/pull/${number})`;

  assert.equal(
    inspected(out, 'Follow-ups recorded in pull request bodies').trim(),
    [
      '### Follow-ups recorded in pull request bodies',
      '',
      '- `apps/api` (3)',
      `  - ${pull(601)}: #1106 moves the queries behind Access.`,
      `  - ${pull(602)}: Migrate the six callers to \`request<unknown>\`.`,
      `  - ${pull(602)}: Replace the local helpers.`,
      '- `apps/web` (1)',
      `  - ${pull(603)}: The sibling effect has the same shape.`,
      '- `scripts` (1)',
      `  - ${pull(605)}: the doctor still probes pnpm twice.`,
    ].join('\n'),
  );
});

test('the CI critical path reports the longest job and the queue before the first job', async () => {
  const job = (name, startedAt, completedAt, conclusion = 'SUCCESS') => ({
    name,
    startedAt: `2026-11-04T${startedAt}Z`,
    completedAt: `2026-11-04T${completedAt}Z`,
    conclusion,
  });
  const ciRun = (createdAt, jobs, extra = {}) => ({
    conclusion: 'SUCCESS',
    createdAt: `2026-11-04T${createdAt}Z`,
    // The quality job starts once every other job is done.
    startedAt: jobs
      .map(({ completedAt }) => completedAt)
      .sort()
      .at(-1),
    jobs,
    ...extra,
  });
  const merged = [
    pullRequest({
      number: 701,
      title: 'feat: lambda',
      at: '2026-11-04T18:00:00Z',
      commits: [
        commit('m1', '2026-11-04T09:00:00Z', {
          runs: [
            // Queue 1 min, longest job 30 min.
            ciRun('10:00:00', [
              job('scope', '10:01:00', '10:01:30'),
              job('acceptance', '10:02:00', '10:32:00'),
            ]),
            // Another pull request workflow is not CI.
            ciRun('10:00:00', [job('label', '10:00:00', '10:45:00')], {
              quality: false,
            }),
            // A merge queue run is not a pull request run.
            ciRun('10:00:00', [job('acceptance', '10:30:00', '12:00:00')], {
              event: 'merge_group',
            }),
          ],
        }),
        commit('m2', '2026-11-04T10:50:00Z', {
          runs: [
            // Queue 3 min, longest job 10 min.
            ciRun('11:00:00', [
              job('scope', '11:03:00', '11:04:00'),
              job('api', '11:04:00', '11:14:00'),
            ]),
          ],
        }),
        commit('m3', '2026-11-04T12:50:00Z', {
          runs: [
            // A cancelled run's jobs were cut short or never queued fairly.
            ciRun(
              '13:00:00',
              [
                job('scope', '13:20:00', '13:21:00'),
                job('acceptance', '13:21:00', '14:21:00'),
              ],
              { conclusion: 'CANCELLED' },
            ),
          ],
        }),
      ],
    }),
  ];
  const closed = [
    pullRequest({
      number: 702,
      title: 'feat: mu',
      merged: false,
      at: '2026-11-04T18:00:00Z',
      commits: [
        commit('n1', '2026-11-04T11:50:00Z', {
          runs: [
            // Queue 0.5 min (the skipped job is ignored), longest job 20 min.
            ciRun('12:00:00', [
              job('flaky_guard', '12:00:10', '12:00:09', 'SKIPPED'),
              job('scope', '12:00:30', '12:01:00'),
              job('api', '12:01:00', '12:21:00'),
            ]),
          ],
        }),
      ],
    }),
  ];
  const { out } = await run(
    ['--since', '2026-11-01'],
    stubGh({ merged, closed, commits: [] }),
  );
  const criticalPath = inspected(out, 'CI critical path');

  assert.match(
    criticalPath,
    /- 3 CI runs of pull requests merged or closed in the window/u,
  );
  assert.match(
    criticalPath,
    /- Longest job: median 20\.0 min, max 30\.0 min\./u,
  );
  assert.match(
    criticalPath,
    /- Queue before the first job: median 1\.0 min, max 3\.0 min\./u,
  );
});

test('main-red issues opened in the window are listed', async () => {
  const github = stubGh({
    issues: [
      issue(1130, {}),
      issue(1131, { title: 'main is red since def5678', closed: true }),
    ],
  });
  const { out, calls } = await run(['--since', '2026-10-31'], github);
  const red = inspected(out, '`main-red` issues opened');

  assert.match(
    red,
    /\n- \[#1130\]\(https:\/\/github\.com\/Prisma-Prim\/PRISMA-PRIM-Suite\/issues\/1130\) main is red since abc1234 \(open\)\n/u,
  );
  assert.match(red, /\n- \[#1131\][^\n]* def5678 \(closed\)\n/u);
  assert.deepEqual(
    calls
      .map(({ args }) => fieldsOf(args).q)
      .filter((q) => q?.includes('is:issue')),
    [
      `repo:${REPOSITORY} is:issue label:main-red created:2026-10-31T00:00:00Z..2026-11-07T12:00:00Z`,
    ],
  );
});

test('the posted report mentions nobody: an @name in a title or follow-up stays inert', async () => {
  const merged = [
    pullRequest({
      number: 801,
      title: 'ci: ask @codex to review workflows',
      at: '2026-11-04T12:00:00Z',
      body: '- Follow-ups: @Dan-Popescu decides; mail ops@example.com.',
      files: ['.github/workflows/ci.yml'],
    }),
  ];
  const { out } = await run(
    ['--since', '2026-11-01'],
    stubGh({ merged, closed: [], commits: [] }),
  );

  // A comment saying @codex would start a Codex task on the issue.
  assert.doesNotMatch(out, /(?:^|[^\w])@(?:codex|Dan-Popescu)/mu);
  const inert = `@${String.fromCodePoint(0x200b)}`;
  assert.ok(
    inspected(out, 'Sensitive merges').includes(`ask ${inert}codex to review`),
  );
  assert.ok(
    inspected(out, 'Follow-ups recorded in pull request bodies').includes(
      `${inert}Dan-Popescu decides; mail ops@example.com.`,
    ),
  );
});
