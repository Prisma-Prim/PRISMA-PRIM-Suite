#!/usr/bin/env node

// The merge state of every open pull request, in one read-only command, so
// nobody rebuilds it from several `gh` calls. One GraphQL query through `gh`
// (which also honours GH_TOKEN) reads the open pull requests; `git worktree
// list --porcelain` names the local worktree of each branch. A pure function
// turns each pull request into a row and its next action. Nothing is written.

import { execFile as execFileCallback } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const REQUIRED_CHECK = 'quality';
const CODEX_REVIEWER = 'chatgpt-codex-connector';
const CODEX_STATE_MARKER = 'codex-review-state:v1';
const CODEX_STATE = /<!-- codex-review-state:v1 ([\s\S]*?) -->/u;
const PAGE_SIZE = 100;
const MAXIMUM_OUTPUT = 64 * 1024 * 1024;
const PASSING_CONCLUSIONS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const PENDING_STATUSES = new Set(['PENDING', 'EXPECTED']);

const PULL_REQUESTS_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: ${PAGE_SIZE}, orderBy: { field: CREATED_AT, direction: ASC }) {
      totalCount
      pageInfo { hasNextPage }
      nodes {
        number
        title
        headRefName
        headRefOid
        author { login }
        mergeable
        mergeStateStatus
        autoMergeRequest { enabledAt }
        closingIssuesReferences(first: 10) { nodes { number } }
        commits(last: 1) {
          nodes {
            commit {
              oid
              committedDate
              statusCheckRollup {
                contexts(first: ${PAGE_SIZE}) {
                  totalCount
                  nodes {
                    __typename
                    ... on CheckRun { name status conclusion }
                    ... on StatusContext { context state }
                  }
                }
              }
            }
          }
        }
        reviewThreads(first: ${PAGE_SIZE}) { totalCount nodes { isResolved } }
        comments(first: ${PAGE_SIZE}) { totalCount nodes { author { login } body } }
      }
    }
  }
}`;

const USAGE = `Usage: node scripts/pr-status.mjs [--json]

Prints one row per open pull request of the current directory's repository
(or GH_REPO), from one read-only GitHub GraphQL query through gh and
\`git worktree list --porcelain\`. The command never writes to GitHub.

Columns:
  PR, ISSUE    the pull request and the issues it closes
  BRANCH       its head branch
  AUTHOR       its author
  AGE          time since the head commit's committer date
               (GitHub no longer reports push times)
  QUALITY      the required \`${REQUIRED_CHECK}\` check: success, failure, pending,
               or missing when CI has not started
  FAILED       failed or cancelled checks on the head commit
  PENDING      checks on the head commit still queued or running
  MERGE        clean, blocked, behind, conflict, draft, unstable or unknown
  AUTO-MERGE   armed or no
  CODEX        the Codex review, from its summary comment: done for the head
               commit, stale for an older commit, none, unreadable, or the
               review's status (such as in_progress)
  THREADS      unresolved review threads
  WORKTREE     the local worktree holding the branch, relative to the main
               checkout, or -
  NEXT ACTION  the first that applies:
               resolve the conflict
               diagnose the red CI (\`${REQUIRED_CHECK}\` failed, or a check failed
                 before \`${REQUIRED_CHECK}\` passed)
               answer N threads
               wait for the Codex review (not done for the head commit)
               wait for CI
               arm auto-merge or merge
               nothing to do

--json prints the same rows as JSON, with each title and head commit.
Reads at most ${PAGE_SIZE} open pull requests, and ${PAGE_SIZE} checks, review threads
and comments per pull request; it says so when it stops short.`;

// ---- Response boundary ------------------------------------------------------

function invalid(path, expected) {
  throw new Error(`Unexpected GitHub response: ${path} should be ${expected}.`);
}

function object(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid(path, 'an object');
  return value;
}

function list(value, path) {
  if (!Array.isArray(value)) invalid(path, 'a list');
  return value;
}

function text(value, path) {
  if (typeof value !== 'string') invalid(path, 'text');
  return value;
}

function count(value, path) {
  if (!Number.isInteger(value) || value < 0) invalid(path, 'a count');
  return value;
}

function flag(value, path) {
  if (typeof value !== 'boolean') invalid(path, 'true or false');
  return value;
}

function commitSha(value, path) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value))
    invalid(path, 'a commit SHA');
  return value;
}

function enumValue(value, path) {
  if (typeof value !== 'string' || !/^[A-Z_]+$/u.test(value))
    invalid(path, 'a GitHub enum value');
  return value;
}

function date(value, path) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
    invalid(path, 'a date');
  return value;
}

function connection(value, path) {
  const page = object(value, path);
  const nodes = list(page.nodes, `${path}.nodes`);
  return {
    nodes,
    totalCount:
      page.totalCount === undefined
        ? nodes.length
        : count(page.totalCount, `${path}.totalCount`),
  };
}

function optional(value, path, parse) {
  return value === null ? null : parse(value, path);
}

function author(value, path) {
  return optional(value, path, (node) => ({
    login: text(object(node, path).login, `${path}.login`),
  }));
}

function check(node, path) {
  object(node, path);
  if (node.__typename === 'CheckRun') {
    const status = enumValue(node.status, `${path}.status`);
    const conclusion =
      node.conclusion === null
        ? null
        : enumValue(node.conclusion, `${path}.conclusion`);
    return {
      name: text(node.name, `${path}.name`),
      state:
        status !== 'COMPLETED'
          ? 'pending'
          : PASSING_CONCLUSIONS.has(conclusion)
            ? 'success'
            : 'failure',
    };
  }
  if (node.__typename === 'StatusContext') {
    const state = enumValue(node.state, `${path}.state`);
    return {
      name: text(node.context, `${path}.context`),
      state:
        state === 'SUCCESS'
          ? 'success'
          : PENDING_STATUSES.has(state)
            ? 'pending'
            : 'failure',
    };
  }
  return invalid(`${path}.__typename`, 'CheckRun or StatusContext');
}

function pullRequest(node, path) {
  object(node, path);
  const number = count(node.number, `${path}.number`);
  const commits = connection(node.commits, `${path}.commits`).nodes;
  if (commits.length !== 1) invalid(`${path}.commits.nodes`, 'one commit');
  const commitPath = `${path}.commits.nodes[0].commit`;
  const commit = object(
    object(commits[0], `${path}.commits.nodes[0]`).commit,
    commitPath,
  );
  const rollup = optional(
    commit.statusCheckRollup,
    `${commitPath}.statusCheckRollup`,
    object,
  );
  const contextsPath = `${commitPath}.statusCheckRollup.contexts`;
  const contexts =
    rollup === null
      ? { nodes: [], totalCount: 0 }
      : connection(rollup.contexts, contextsPath);
  const threads = connection(node.reviewThreads, `${path}.reviewThreads`);
  const comments = connection(node.comments, `${path}.comments`);
  const warnings = [];
  for (const [name, page] of [
    ['checks', contexts],
    ['review threads', threads],
    ['comments', comments],
  ])
    if (page.totalCount > page.nodes.length)
      warnings.push(
        `#${number}: only the first ${PAGE_SIZE} of ${page.totalCount} ${name} were read.`,
      );
  return {
    pullRequest: {
      number,
      title: text(node.title, `${path}.title`),
      branch: text(node.headRefName, `${path}.headRefName`),
      author: author(node.author, `${path}.author`)?.login ?? 'ghost',
      headCommit: commitSha(node.headRefOid, `${path}.headRefOid`),
      headCommittedAt: date(
        commit.committedDate,
        `${commitPath}.committedDate`,
      ),
      mergeable: enumValue(node.mergeable, `${path}.mergeable`),
      mergeStateStatus: enumValue(
        node.mergeStateStatus,
        `${path}.mergeStateStatus`,
      ),
      autoMerge:
        optional(node.autoMergeRequest, `${path}.autoMergeRequest`, object) !==
        null,
      closingIssues: connection(
        node.closingIssuesReferences,
        `${path}.closingIssuesReferences`,
      ).nodes.map((issue, index) => {
        const issuePath = `${path}.closingIssuesReferences.nodes[${index}]`;
        return count(object(issue, issuePath).number, `${issuePath}.number`);
      }),
      checks: contexts.nodes.map((context, index) =>
        check(context, `${contextsPath}.nodes[${index}]`),
      ),
      unresolvedThreads: threads.nodes.filter((thread, index) => {
        const threadPath = `${path}.reviewThreads.nodes[${index}]`;
        return !flag(
          object(thread, threadPath).isResolved,
          `${threadPath}.isResolved`,
        );
      }).length,
      comments: comments.nodes.map((comment, index) => {
        const commentPath = `${path}.comments.nodes[${index}]`;
        object(comment, commentPath);
        return {
          author: author(comment.author, `${commentPath}.author`),
          body: text(comment.body, `${commentPath}.body`),
        };
      }),
    },
    warnings,
  };
}

/** Validates the GraphQL response of PULL_REQUESTS_QUERY. */
function parseOpenPullRequests(json) {
  let response;
  try {
    response = JSON.parse(json);
  } catch {
    throw new Error('Unexpected GitHub response: not JSON.');
  }
  object(response, 'response');
  if (Array.isArray(response.errors) && response.errors.length > 0)
    throw new Error(
      `GitHub GraphQL error: ${response.errors
        .map((error) => error?.message ?? 'unknown error')
        .join('; ')}`,
    );
  const repository = object(
    object(response.data, 'data').repository,
    'repository',
  );
  const page = object(repository.pullRequests, 'pullRequests');
  const totalCount = count(page.totalCount, 'pullRequests.totalCount');
  const hasNextPage = flag(
    object(page.pageInfo, 'pullRequests.pageInfo').hasNextPage,
    'pullRequests.pageInfo.hasNextPage',
  );
  const parsed = list(page.nodes, 'pullRequests.nodes').map((node, index) =>
    pullRequest(node, `pullRequests.nodes[${index}]`),
  );
  return {
    pullRequests: parsed.map((entry) => entry.pullRequest),
    warnings: [
      ...(hasNextPage
        ? [
            `Only the first ${PAGE_SIZE} of ${totalCount} open pull requests were read.`,
          ]
        : []),
      ...parsed.flatMap((entry) => entry.warnings),
    ],
  };
}

/** Maps each checked-out branch to its worktree, relative to the main one. */
function parseWorktrees(porcelain) {
  const worktrees = new Map();
  let main = null;
  let current = null;
  for (const line of porcelain.split(/\r?\n/u)) {
    if (line.startsWith('worktree ')) {
      current = line.slice('worktree '.length);
      main ??= current;
    } else if (line.startsWith('branch refs/heads/') && current !== null) {
      const relative =
        current === main
          ? '.'
          : current.startsWith(`${main}/`)
            ? current.slice(main.length + 1)
            : current;
      worktrees.set(line.slice('branch refs/heads/'.length), relative);
    }
  }
  return worktrees;
}

// ---- Rows -------------------------------------------------------------------

const isCodex = (comment) =>
  comment.author?.login.replace(/\[bot\]$/iu, '').toLowerCase() ===
  CODEX_REVIEWER;

/**
 * The Codex code review state for the head commit, from the latest summary
 * comment by the Codex connector: done, stale (an older commit), none,
 * unreadable, or the review's own status while it is not completed.
 */
export function codexReviewState(comments, headCommit) {
  const summary = comments
    .filter(
      (comment) =>
        isCodex(comment) && comment.body.includes(CODEX_STATE_MARKER),
    )
    .at(-1);
  if (summary === undefined) return 'none';
  let review;
  try {
    review = JSON.parse(summary.body.match(CODEX_STATE)?.[1] ?? '').code_review;
  } catch {
    return 'unreadable';
  }
  if (review === null || typeof review !== 'object') return 'unreadable';
  const { status, commit_sha: commit } = review;
  if (status === null || status === undefined) return 'none';
  if (status === 'completed') return commit === headCommit ? 'done' : 'stale';
  return typeof status === 'string' && /^[a-z_]+$/u.test(status)
    ? status
    : 'unreadable';
}

function qualityState(checks) {
  const quality = checks
    .filter((check) => check.name === REQUIRED_CHECK)
    .at(-1);
  return quality?.state ?? 'missing';
}

/** The one next action for a row's merge facts, first match wins. */
export function nextAction({
  mergeState,
  quality,
  failedChecks,
  unresolvedThreads,
  codexReview,
  autoMerge,
}) {
  if (mergeState === 'conflict') return 'resolve the conflict';
  if (quality === 'failure' || (quality !== 'success' && failedChecks > 0))
    return 'diagnose the red CI';
  if (unresolvedThreads > 0)
    return `answer ${unresolvedThreads} thread${unresolvedThreads === 1 ? '' : 's'}`;
  if (codexReview !== 'done') return 'wait for the Codex review';
  if (quality !== 'success') return 'wait for CI';
  if (!autoMerge) return 'arm auto-merge or merge';
  return 'nothing to do';
}

function age(since, now) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(since)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** One row for a validated open pull request. */
function pullRequestRow(pullRequest, { now, worktrees }) {
  const facts = {
    mergeState:
      pullRequest.mergeable === 'CONFLICTING' ||
      pullRequest.mergeStateStatus === 'DIRTY'
        ? 'conflict'
        : pullRequest.mergeStateStatus.toLowerCase(),
    quality: qualityState(pullRequest.checks),
    failedChecks: pullRequest.checks.filter(
      (check) => check.state === 'failure',
    ).length,
    pendingChecks: pullRequest.checks.filter(
      (check) => check.state === 'pending',
    ).length,
    unresolvedThreads: pullRequest.unresolvedThreads,
    codexReview: codexReviewState(pullRequest.comments, pullRequest.headCommit),
    autoMerge: pullRequest.autoMerge,
  };
  return {
    number: pullRequest.number,
    title: pullRequest.title,
    closingIssues: pullRequest.closingIssues,
    branch: pullRequest.branch,
    author: pullRequest.author,
    headCommit: pullRequest.headCommit,
    headCommittedAt: pullRequest.headCommittedAt,
    age: age(pullRequest.headCommittedAt, now),
    ...facts,
    worktree: worktrees.get(pullRequest.branch) ?? null,
    nextAction: nextAction(facts),
  };
}

const COLUMNS = [
  ['PR', (row) => `#${row.number}`],
  [
    'ISSUE',
    (row) =>
      row.closingIssues.length === 0
        ? '-'
        : row.closingIssues.map((issue) => `#${issue}`).join(','),
  ],
  ['BRANCH', (row) => row.branch],
  ['AUTHOR', (row) => row.author],
  ['AGE', (row) => row.age],
  ['QUALITY', (row) => row.quality],
  ['FAILED', (row) => String(row.failedChecks)],
  ['PENDING', (row) => String(row.pendingChecks)],
  ['MERGE', (row) => row.mergeState],
  ['AUTO-MERGE', (row) => (row.autoMerge ? 'armed' : 'no')],
  ['CODEX', (row) => row.codexReview],
  ['THREADS', (row) => String(row.unresolvedThreads)],
  ['WORKTREE', (row) => row.worktree ?? '-'],
  ['NEXT ACTION', (row) => row.nextAction],
];

/** The text table of the rows, one line per pull request. */
export function renderTable(rows) {
  if (rows.length === 0) return 'No open pull requests.';
  const lines = [
    COLUMNS.map(([header]) => header),
    ...rows.map((row) => COLUMNS.map(([, cell]) => cell(row))),
  ];
  const widths = COLUMNS.map((_, column) =>
    Math.max(...lines.map((line) => line[column].length)),
  );
  return lines
    .map((line) =>
      line
        .map((cell, column) =>
          column === line.length - 1 ? cell : cell.padEnd(widths[column]),
        )
        .join('  '),
    )
    .join('\n');
}

// ---- Commands ---------------------------------------------------------------

function failureDetail(failure) {
  return (failure?.stderr || failure?.message || 'unexpected failure')
    .toString()
    .trim();
}

async function readOpenPullRequests(execFile) {
  try {
    const { stdout } = await execFile(
      'gh',
      [
        'api',
        'graphql',
        '-F',
        'owner={owner}',
        '-F',
        'name={repo}',
        '-f',
        `query=${PULL_REQUESTS_QUERY}`,
      ],
      { maxBuffer: MAXIMUM_OUTPUT },
    );
    return stdout;
  } catch (failure) {
    if (failure?.code === 'ENOENT')
      throw new Error(
        'GitHub CLI (gh) was not found. Install it and sign in, or set GH_TOKEN for gh.',
        { cause: failure },
      );
    throw new Error(`Could not read from GitHub: ${failureDetail(failure)}`, {
      cause: failure,
    });
  }
}

async function readWorktrees(execFile) {
  try {
    const { stdout } = await execFile(
      'git',
      ['worktree', 'list', '--porcelain'],
      { maxBuffer: MAXIMUM_OUTPUT },
    );
    return stdout;
  } catch (failure) {
    throw new Error(`Could not list git worktrees: ${failureDetail(failure)}`, {
      cause: failure,
    });
  }
}

export async function main({
  argv = process.argv.slice(2),
  execFile = promisify(execFileCallback),
  stdout = process.stdout,
  stderr = process.stderr,
  now = () => new Date(),
} = {}) {
  let json = false;
  for (const argument of argv) {
    if (argument === '--help' || argument === '-h') {
      stdout.write(`${USAGE}\n`);
      return 0;
    }
    if (argument !== '--json') {
      stderr.write(`Unknown argument "${argument}".\n${USAGE}\n`);
      return 2;
    }
    json = true;
  }

  let report;
  try {
    const [response, porcelain] = await Promise.all([
      readOpenPullRequests(execFile),
      readWorktrees(execFile),
    ]);
    const { pullRequests, warnings } = parseOpenPullRequests(response);
    const worktrees = parseWorktrees(porcelain);
    const moment = now();
    report = {
      generatedAt: moment.toISOString(),
      pullRequests: pullRequests
        .map((pullRequest) =>
          pullRequestRow(pullRequest, { now: moment, worktrees }),
        )
        .sort((left, right) => left.number - right.number),
      warnings,
    };
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }

  if (json) {
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    stdout.write(`${renderTable(report.pullRequests)}\n`);
    for (const warning of report.warnings) stderr.write(`${warning}\n`);
  }
  return 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main();
}
