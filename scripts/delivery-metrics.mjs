#!/usr/bin/env node

// Weekly delivery metrics, so a retrospective starts from measured facts.
// Prints a short Markdown report for a UTC date window (default: the last 7
// days). Read-only: it only issues GitHub GraphQL searches and REST GETs
// through `gh`, which also honours GH_TOKEN when nobody is signed in.
//
// Definitions (the report repeats them under "Method"):
// - Review rounds: for a merged pull request with an automated review, the
//   number of distinct non-merge commits authored after the first review,
//   summary comment or inline comment by chatgpt-codex-connector (it posts a
//   summary comment even when it finds nothing). The authored date is used
//   because rebases rewrite committer dates; an amended and force-pushed
//   commit that keeps its author date is therefore missed. The bounded review
//   rule allows one correction commit plus at most one confirmation, so a
//   pull request with more than MAXIMUM_COMMITS_AFTER_REVIEW is flagged.
// - Finding: a review thread opened by chatgpt-codex-connector. Its outcome is
//   `fixed` when a reply from anyone else says "fixed" or "addressed", or when
//   the thread is resolved and a commit authored after the finding touched the
//   commented file; otherwise `follow-up` when a reply or the follow-up part
//   of the pull request body (from a line mentioning follow-up to the next
//   heading) mentions follow-up or names the commented file; otherwise `open`
//   (this includes a finding answered without a fix or a follow-up). Replies
//   and commits count only up to the pull request's merge, so "open" means
//   open at merge; GitHub does not date a thread's resolution, so the resolved
//   flag and the pull request body are read as they stand at report time.
// - CI: the earliest `quality` check run of a pull request event that was not
//   cancelled or skipped, across the commits left in the pull request.
//   Commits dropped by a force-push are not seen. A cancelled workflow run ends
//   its `quality` job as failed, so cancellation is read from the workflow run.
// - To inspect, a short list for the weekly-inspection issue:
//   - Sensitive merges: merged pull requests changing a SENSITIVE_PATHS file.
//   - Resolved review threads on merged pull requests where no reply from
//     anyone but the automated reviewer says "fixed", "not valid", or names a
//     follow-up issue (`#N`), the dispositions issue-execution.md requires.
//   - Follow-ups: the items of a pull request body's Follow-ups entry (a line
//     or heading starting with "Follow-up", its text after the colon and its
//     list), except "none", grouped by the top-level folder (each `apps/<app>`
//     apart) holding most of the pull request's changed files.
//   - CI critical path: over the not-cancelled pull request CI runs (the check
//     suites holding `quality`) of the pull requests counted under CI, the
//     longest job, and the queue from the run's creation to its first job.
//   - `main-red` issues created in the window.

import { execFile as execFileCallback } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const REPOSITORY = 'Prisma-Prim/PRISMA-PRIM-Suite';
const DEFAULT_BRANCH = 'main';
const AUTOMATED_REVIEWER = 'chatgpt-codex-connector';
const WINDOW_DAYS = 7;
const SEARCH_PAGE_SIZE = 10;
const COMMITS_PAGE_SIZE = 100;
const FILES_PAGE_SIZE = 100;
const SHOWN_PER_LIST = 20;
const TITLE_LENGTH = 90;
const REQUIRED_CHECK = 'quality';
const ALWAYS_LISTED_SEVERITIES = ['P0', 'P1', 'P2'];
const UNRATED = 'Unrated';
const MAIN_RED_LABEL = 'main-red';
/** Access, migrations, schema, Activity Log (accountability) and workflows. */
const SENSITIVE_PATHS = [
  'apps/api/src/access/',
  'apps/api/drizzle/',
  'apps/api/src/database/schema/',
  'apps/api/src/accountability/',
  '.github/workflows/',
];

/** One correction commit plus at most one confirmation (issue-execution.md). */
export const MAXIMUM_COMMITS_AFTER_REVIEW = 2;

const USAGE = [
  'Usage: node scripts/delivery-metrics.mjs [--since <date|datetime>] [--until <date|datetime>]',
  'Dates are UTC (YYYY-MM-DD, or YYYY-MM-DDTHH:MM:SSZ); a date-only --until covers that whole day.',
  `Default window: the last ${WINDOW_DAYS} days. Read-only; uses gh (or GH_TOKEN).`,
].join('\n');

class UsageError extends Error {
  constructor(problem) {
    super(`${problem}\n${USAGE}`);
  }
}

// ---- Arguments --------------------------------------------------------------

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z$/u;

function parseMoment(value, option, { endOfDay }) {
  const isDate = DATE_ONLY.test(value);
  if (!isDate && !DATE_TIME.test(value)) {
    throw new UsageError(
      `Invalid ${option} "${value}": use YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ.`,
    );
  }
  const suffix = isDate ? (endOfDay ? 'T23:59:59Z' : 'T00:00:00Z') : '';
  const moment = new Date(`${value}${suffix}`);
  if (
    Number.isNaN(moment.getTime()) ||
    moment.toISOString().slice(0, 10) !== value.slice(0, 10)
  ) {
    throw new UsageError(`Invalid ${option} "${value}": not a calendar date.`);
  }
  return moment;
}

export function parseArguments(argv, now = new Date()) {
  const given = {};
  const remaining = [...argv];
  while (remaining.length > 0) {
    const argument = remaining.shift();
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument !== '--since' && argument !== '--until') {
      throw new UsageError(`Unknown argument "${argument}".`);
    }
    const value = remaining.shift();
    if (value === undefined) {
      throw new UsageError(`${argument} needs a value.`);
    }
    given[argument] = value;
  }

  const until =
    given['--until'] === undefined
      ? now
      : parseMoment(given['--until'], '--until', { endOfDay: true });
  const since =
    given['--since'] === undefined
      ? new Date(until.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
      : parseMoment(given['--since'], '--since', { endOfDay: false });
  if (since.getTime() >= until.getTime()) {
    throw new UsageError('--since must be before --until.');
  }
  return { help: false, since, until };
}

const instant = (date) => date.toISOString().replace(/\.\d{3}Z$/u, 'Z');

// ---- GitHub access ----------------------------------------------------------

// GITHUB_TOKEN allows 1,000 GraphQL points an hour. Each pull request costs
// about 7 points (connections resolved, over 100); most of it is one
// checkRuns connection per check suite, hence at most 5 suites per commit
// (2026-11 weeks had at most 3).
const SEARCH_QUERY = `query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: ${SEARCH_PAGE_SIZE}, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number title body url merged mergedAt closedAt
        mergeCommit { oid }
        files(first: ${FILES_PAGE_SIZE}) { totalCount nodes { path } }
        commits(first: 100) {
          nodes {
            commit {
              oid
              authoredDate
              parents { totalCount }
              checkSuites(first: 5) {
                nodes {
                  conclusion
                  workflowRun { event createdAt }
                  checkRuns(first: 50) {
                    nodes { name conclusion status startedAt completedAt }
                  }
                }
              }
            }
          }
        }
        comments(first: 50) { nodes { author { login } createdAt } }
        reviews(first: 50) { nodes { author { login } submittedAt } }
        reviewThreads(first: 100) {
          nodes {
            isResolved
            path
            comments(first: 30) { nodes { createdAt body url author { login } } }
          }
        }
      }
    }
  }
}`;

const ISSUE_SEARCH_QUERY = `query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on Issue { number title url createdAt closed } }
  }
}`;

function createGithubClient(execFile) {
  async function request(args) {
    try {
      const { stdout } = await execFile('gh', args);
      return JSON.parse(stdout);
    } catch (failure) {
      if (failure?.code === 'ENOENT') {
        throw new Error(
          'GitHub CLI (gh) was not found. Install it and sign in, or set GH_TOKEN for gh.',
          { cause: failure },
        );
      }
      const detail = (
        failure?.stderr ||
        failure?.message ||
        'unexpected response'
      )
        .toString()
        .trim();
      throw new Error(`Could not read from GitHub (gh ${args[0]}): ${detail}`, {
        cause: failure,
      });
    }
  }

  async function search(query, q) {
    const nodes = [];
    let after = null;
    do {
      const data = await request([
        'api',
        'graphql',
        '-f',
        `query=${query}`,
        '-f',
        `q=${q}`,
        ...(after === null ? [] : ['-f', `after=${after}`]),
      ]);
      const found = data?.data?.search;
      if (!found) throw new Error('Unexpected GitHub search response.');
      nodes.push(...found.nodes.filter((node) => node?.number));
      after = found.pageInfo.hasNextPage ? found.pageInfo.endCursor : null;
    } while (after !== null);
    return nodes;
  }

  return {
    async searchPullRequests(qualifiers) {
      const nodes = await search(
        SEARCH_QUERY,
        `repo:${REPOSITORY} is:pr ${qualifiers}`,
      );
      return nodes.map(normalizePullRequest);
    },

    async searchIssues(qualifiers) {
      return search(
        ISSUE_SEARCH_QUERY,
        `repo:${REPOSITORY} is:issue ${qualifiers}`,
      );
    },

    /** Every changed file, for a pull request past GraphQL's first page. */
    async pullRequestFiles(number) {
      const files = [];
      for (let page = 1; ; page += 1) {
        const batch = await request([
          'api',
          `repos/${REPOSITORY}/pulls/${number}/files?per_page=${FILES_PAGE_SIZE}&page=${page}`,
        ]);
        files.push(...batch.map((file) => file.filename));
        if (batch.length < FILES_PAGE_SIZE) return files;
      }
    },

    async listBranchCommits({ since, until }) {
      const commits = [];
      for (let page = 1; ; page += 1) {
        const batch = await request([
          'api',
          `repos/${REPOSITORY}/commits?sha=${DEFAULT_BRANCH}&since=${instant(since)}&until=${instant(until)}&per_page=${COMMITS_PAGE_SIZE}&page=${page}`,
        ]);
        commits.push(...batch);
        if (batch.length < COMMITS_PAGE_SIZE) return commits;
      }
    },

    async commitFiles(oid) {
      const commit = await request([
        'api',
        `repos/${REPOSITORY}/commits/${oid}`,
      ]);
      return (commit.files ?? []).map((file) => file.filename);
    },
  };
}

// ---- Normalization ----------------------------------------------------------

const isAutomated = (login) =>
  login?.replace(/\[bot\]$/iu, '').toLowerCase() === AUTOMATED_REVIEWER;

function normalizePullRequest(node) {
  const commits = node.commits.nodes.map(({ commit }) => commit);
  const threads = node.reviewThreads.nodes.map((thread) => ({
    path: thread.path,
    resolved: thread.isResolved,
    comments: thread.comments.nodes.map((comment) => ({
      author: comment.author?.login ?? null,
      createdAt: comment.createdAt,
      body: comment.body ?? '',
      url: comment.url,
    })),
  }));
  const automatedMoments = [
    ...node.comments.nodes
      .filter((comment) => isAutomated(comment.author?.login))
      .map((comment) => comment.createdAt),
    ...node.reviews.nodes
      .filter((review) => isAutomated(review.author?.login))
      .map((review) => review.submittedAt),
    ...threads.flatMap((thread) =>
      thread.comments
        .filter((comment) => isAutomated(comment.author))
        .map((comment) => comment.createdAt),
    ),
  ].filter(Boolean);
  // One check suite per workflow run; a CI run is one holding `quality`.
  const ciSuites = commits
    .flatMap((commit) => commit.checkSuites.nodes)
    .filter(
      (suite) =>
        suite.workflowRun?.event === 'pull_request' &&
        suite.checkRuns.nodes.some((run) => run.name === REQUIRED_CHECK),
    );

  return {
    number: node.number,
    title: node.title,
    body: node.body ?? '',
    url: node.url,
    merged: node.merged,
    mergedAt: node.mergedAt,
    mergeCommit: node.mergeCommit?.oid ?? null,
    files: node.files.nodes.map((file) => file.path),
    fileCount: node.files.totalCount,
    commits: commits.map((commit) => ({
      oid: commit.oid,
      authoredDate: commit.authoredDate,
      isMerge: commit.parents.totalCount > 1,
    })),
    firstAutomatedReview: automatedMoments.sort()[0] ?? null,
    threads,
    qualityRuns: ciSuites.flatMap((suite) =>
      suite.checkRuns.nodes
        .filter((run) => run.name === REQUIRED_CHECK)
        .map((run) => ({
          ...run,
          // A cancelled workflow run still ends its quality job as failed.
          conclusion:
            suite.conclusion === 'CANCELLED' ? 'CANCELLED' : run.conclusion,
        })),
    ),
    ciRuns: ciSuites.map((suite) => ({
      conclusion: suite.conclusion,
      createdAt: suite.workflowRun.createdAt,
      jobs: suite.checkRuns.nodes.filter(
        (run) =>
          run.status === 'COMPLETED' &&
          run.conclusion !== 'SKIPPED' &&
          run.startedAt &&
          run.completedAt,
      ),
    })),
  };
}

// ---- Metrics ----------------------------------------------------------------

/** Non-merge commits authored after `moment` and no later than the merge. */
function commitsAfter(pullRequest, moment) {
  return pullRequest.commits.filter(
    (commit) =>
      !commit.isMerge &&
      commit.authoredDate > moment &&
      commit.authoredDate <= pullRequest.mergedAt,
  );
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizeReviewRounds(merged) {
  const reviewed = merged
    .filter((pullRequest) => pullRequest.firstAutomatedReview !== null)
    .map((pullRequest) => ({
      pullRequest,
      commitsAfterReview: commitsAfter(
        pullRequest,
        pullRequest.firstAutomatedReview,
      ).length,
    }));
  const counts = reviewed.map(({ commitsAfterReview }) => commitsAfterReview);
  return {
    reviewed,
    median: reviewed.length === 0 ? null : median(counts),
    max: reviewed.length === 0 ? null : Math.max(...counts),
    aboveRule: reviewed.filter(
      ({ commitsAfterReview }) =>
        commitsAfterReview > MAXIMUM_COMMITS_AFTER_REVIEW,
    ),
  };
}

function severityOf(body) {
  return /!\[(P\d) Badge\]/u.exec(body)?.[1] ?? UNRATED;
}

function titleOf(body) {
  const text = body
    .replaceAll(/<[^>]*>/gu, '')
    .replaceAll(/!\[[^\]]*\]\([^)]*\)/gu, '');
  const firstLine = text
    .split('\n')
    .map((line) => line.replaceAll('*', '').trim())
    .find((line) => line !== '');
  return firstLine ?? '(untitled)';
}

const FIXED_REPLY = /\b(?:fixed|addressed)\b/iu;
const FOLLOW_UP = /follow[- ]?ups?\b/iu;

/** The lines from one that mentions follow-up to the next unrelated heading. */
function followUpText(body) {
  const collected = [];
  let inside = false;
  for (const line of body.replaceAll('\r\n', '\n').split('\n')) {
    if (FOLLOW_UP.test(line)) inside = true;
    else if (/^#{1,6}\s/u.test(line)) inside = false;
    if (inside) collected.push(line);
  }
  return collected.join('\n');
}

// Evidence is limited to what existed when the pull request merged: replies and
// commits up to `mergedAt`. GitHub does not date a thread's resolution, so the
// resolved flag (and the pull request body) is read as it stands at report time.
async function classifyFinding(pullRequest, thread, filesOf) {
  const [finding, ...replies] = thread.comments;
  const answers = replies.filter(
    (reply) =>
      !isAutomated(reply.author) && reply.createdAt <= pullRequest.mergedAt,
  );
  if (answers.some((reply) => FIXED_REPLY.test(reply.body))) return 'fixed';

  if (thread.resolved) {
    for (const commit of commitsAfter(pullRequest, finding.createdAt)) {
      if ((await filesOf(commit.oid)).includes(thread.path)) return 'fixed';
    }
  }

  const recordedInBody = followUpText(pullRequest.body).includes(thread.path);
  if (answers.some((reply) => FOLLOW_UP.test(reply.body)) || recordedInBody) {
    return 'follow-up';
  }
  return 'open';
}

async function summarizeFindings(merged, commitFiles) {
  const cache = new Map();
  const filesOf = (oid) => {
    if (!cache.has(oid)) cache.set(oid, commitFiles(oid));
    return cache.get(oid);
  };

  const findings = [];
  for (const pullRequest of merged) {
    for (const thread of pullRequest.threads) {
      const [first] = thread.comments;
      if (!first || !isAutomated(first.author)) continue;
      findings.push({
        pullRequest,
        path: thread.path,
        severity: severityOf(first.body),
        title: titleOf(first.body),
        url: first.url,
        outcome: await classifyFinding(pullRequest, thread, filesOf),
      });
    }
  }

  const bySeverity = new Map(
    ALWAYS_LISTED_SEVERITIES.map((severity) => [severity, []]),
  );
  for (const finding of findings) {
    bySeverity.set(finding.severity, [
      ...(bySeverity.get(finding.severity) ?? []),
      finding,
    ]);
  }
  return {
    findings,
    pullRequestCount: new Set(findings.map((f) => f.pullRequest.number)).size,
    bySeverity: [...bySeverity.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  };
}

function summarizeQuality(pullRequests) {
  const summary = { considered: 0, passed: 0, cancelled: 0 };
  for (const pullRequest of pullRequests) {
    const runs = pullRequest.qualityRuns
      .filter((run) => run.status === 'COMPLETED')
      .sort((left, right) =>
        (left.startedAt ?? '').localeCompare(right.startedAt ?? ''),
      );
    summary.cancelled += runs.filter(
      (run) => run.conclusion === 'CANCELLED',
    ).length;
    const first = runs.find(
      (run) => !['CANCELLED', 'SKIPPED'].includes(run.conclusion),
    );
    if (first) {
      summary.considered += 1;
      if (first.conclusion === 'SUCCESS') summary.passed += 1;
    }
  }
  return summary;
}

const REVERT_TITLE = /^revert\b/iu;

const pullRequestNumbers = (text, excluding) =>
  [...text.matchAll(/#(\d+)/gu)]
    .map((match) => Number(match[1]))
    .filter((number) => number !== excluding);

function findReverts(merged, branchCommits) {
  const mergedByNumber = new Map(merged.map((pr) => [pr.number, pr]));
  const mergedByCommit = [...mergedByNumber.values()].filter(
    (pr) => pr.mergeCommit !== null,
  );

  const revertedBy = (title, body, own) => {
    const numbers = new Set(
      REVERT_TITLE.test(title) ? pullRequestNumbers(title, own) : [],
    );
    // Third person only: "revert #12" in a how-to-revert note is advice, not a
    // revert. The target need not have merged in the window.
    for (const match of body.matchAll(
      /\breverts\s+(?:PR\s+|pull request\s+)?#(\d+)/giu,
    )) {
      if (Number(match[1]) !== own) numbers.add(Number(match[1]));
    }
    for (const match of body.matchAll(
      /\breverts commit ([0-9a-f]{7,40})\b/giu,
    )) {
      const target = mergedByCommit.find((pr) =>
        pr.mergeCommit.startsWith(match[1]),
      );
      if (target) numbers.add(target.number);
    }
    return [...numbers].map((number) => ({
      number,
      inWindow: mergedByNumber.has(number),
    }));
  };

  const reverts = [];
  for (const pullRequest of merged) {
    const reverted = revertedBy(
      pullRequest.title,
      pullRequest.body,
      pullRequest.number,
    );
    // `inWindow` only annotates a target in the report; it never decides
    // whether this pull request is a revert.
    if (REVERT_TITLE.test(pullRequest.title) || reverted.length > 0) {
      reverts.push({
        label: `#${pullRequest.number}`,
        url: pullRequest.url,
        title: pullRequest.title,
        reverted,
      });
    }
  }
  for (const entry of branchCommits) {
    const [subject, ...rest] = entry.commit.message.split('\n');
    const ownNumber = Number(/\(#(\d+)\)\s*$/u.exec(subject)?.[1]);
    if (mergedByNumber.has(ownNumber) || !REVERT_TITLE.test(subject)) continue;
    reverts.push({
      label: entry.sha.slice(0, 10),
      url: entry.html_url,
      title: subject,
      reverted: revertedBy(subject, rest.join('\n'), ownNumber),
    });
  }
  return reverts;
}

// ---- To inspect -------------------------------------------------------------

function sensitiveMerges(merged) {
  return merged
    .map((pullRequest) => ({
      pullRequest,
      paths: SENSITIVE_PATHS.filter((prefix) =>
        pullRequest.files.some((file) => file.startsWith(prefix)),
      ),
    }))
    .filter(({ paths }) => paths.length > 0);
}

/** A disposition issue-execution.md accepts: fixed, follow-up #N, not valid. */
const answersThread = (body) =>
  /\bfixed\b/iu.test(body) ||
  /\bnot valid\b/iu.test(body) ||
  (FOLLOW_UP.test(body) && /#\d+|\/issues\/\d+/u.test(body));

function unansweredThreads(merged) {
  return merged.flatMap((pullRequest) =>
    pullRequest.threads
      .filter(
        (thread) =>
          thread.resolved &&
          thread.comments.length > 0 &&
          !thread.comments
            .slice(1)
            .some(
              (reply) =>
                !isAutomated(reply.author) && answersThread(reply.body),
            ),
      )
      .map((thread) => ({ pullRequest, thread })),
  );
}

const FOLLOW_UP_ENTRY =
  /^(?<indent>\s*)(?:(?<heading>#{1,6})\s+|[-*+]\s+)?follow[- ]?ups?\b[^:]*?(?::(?<text>.*))?$/iu;
const LIST_ITEM = /^(?<indent>\s*)[-*+]\s+(?<text>.*)$/u;
const HEADING = /^\s*#{1,6}\s/u;
const indentOf = (line) => line.length - line.trimStart().length;

/**
 * The items of each Follow-ups entry in a pull request body: its text after
 * the colon, then its list (nested under a list entry, up to the next heading
 * under a heading entry), except "none".
 */
function followUpItems(body) {
  const lines = body.replaceAll('\r\n', '\n').replaceAll('**', '').split('\n');
  const items = [];
  for (let index = 0; index < lines.length; index += 1) {
    const entry = FOLLOW_UP_ENTRY.exec(lines[index]);
    if (entry === null) continue;
    const { indent, heading, text } = entry.groups;
    // A line without a colon ("Follow-up work will...") is a sentence.
    if (heading === undefined && text === undefined) continue;
    const entryItems = text?.trim() ? [text.trim()] : [];
    let itemIndent = null;
    let next = index + 1;
    for (; next < lines.length; next += 1) {
      const line = lines[next];
      if (line.trim() === '') continue;
      if (HEADING.test(line)) break;
      if (!heading && indentOf(line) <= indent.length) break;
      const item = LIST_ITEM.exec(line);
      if (
        item &&
        (itemIndent === null || item.groups.indent.length <= itemIndent)
      ) {
        itemIndent = item.groups.indent.length;
        entryItems.push(item.groups.text.trim());
      } else if (entryItems.length > 0) {
        entryItems.push(`${entryItems.pop()} ${line.trim()}`);
      } else {
        entryItems.push(line.trim());
      }
    }
    items.push(...entryItems);
    index = next - 1;
  }
  return items.filter((item) => !/^(?:none|n\/a)\b/iu.test(item));
}

/** The top-level folder, with each `apps/<app>` apart. */
function folderOf(path) {
  const parts = path.split('/');
  if (parts.length === 1) return '(root)';
  return parts[0] === 'apps' && parts.length > 2
    ? `apps/${parts[1]}`
    : parts[0];
}

function mainFolder(files) {
  const counts = new Map();
  for (const folder of files.map(folderOf)) {
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  const [main] = [...counts].sort(
    ([left, leftCount], [right, rightCount]) =>
      rightCount - leftCount || left.localeCompare(right),
  );
  return main?.[0] ?? '(no files)';
}

function followUpsByFolder(merged) {
  const groups = new Map();
  for (const pullRequest of [...merged].sort((a, b) => a.number - b.number)) {
    const items = followUpItems(pullRequest.body);
    if (items.length === 0) continue;
    const folder = mainFolder(pullRequest.files);
    groups.set(folder, [
      ...(groups.get(folder) ?? []),
      ...items.map((text) => ({ pullRequest, text })),
    ]);
  }
  return [...groups].sort(
    ([left, leftItems], [right, rightItems]) =>
      rightItems.length - leftItems.length || left.localeCompare(right),
  );
}

const secondsBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / 1000;
const spread = (values) =>
  values.length === 0
    ? null
    : { median: median(values), max: Math.max(...values) };

function summarizeCriticalPath(pullRequests) {
  const runs = pullRequests
    .flatMap((pullRequest) => pullRequest.ciRuns)
    .filter(
      (run) =>
        run.jobs.length > 0 &&
        ![null, 'CANCELLED', 'SKIPPED', 'STALE'].includes(run.conclusion),
    );
  return {
    runs: runs.length,
    longestJob: spread(
      runs.map((run) =>
        Math.max(
          ...run.jobs.map((job) =>
            secondsBetween(job.startedAt, job.completedAt),
          ),
        ),
      ),
    ),
    queue: spread(
      runs.map((run) =>
        Math.max(
          0,
          secondsBetween(
            run.createdAt,
            run.jobs.map((job) => job.startedAt).sort()[0],
          ),
        ),
      ),
    ),
  };
}

export async function collectMetrics(github, { since, until }) {
  const range = `${instant(since)}..${instant(until)}`;
  const [found, closed, branchCommits, mainRed] = await Promise.all([
    github.searchPullRequests(`is:merged merged:${range}`),
    github.searchPullRequests(`is:closed is:unmerged closed:${range}`),
    github.listBranchCommits({ since, until }),
    github.searchIssues(`label:${MAIN_RED_LABEL} created:${range}`),
  ]);
  const merged = await Promise.all(
    found.map(async (pullRequest) =>
      pullRequest.files.length < pullRequest.fileCount
        ? {
            ...pullRequest,
            files: await github.pullRequestFiles(pullRequest.number),
          }
        : pullRequest,
    ),
  );
  return {
    since,
    until,
    merged,
    closed,
    reverts: findReverts(merged, branchCommits),
    rounds: summarizeReviewRounds(merged),
    findings: await summarizeFindings(merged, github.commitFiles),
    quality: summarizeQuality([...merged, ...closed]),
    inspect: {
      sensitive: sensitiveMerges(merged),
      unanswered: unansweredThreads(merged),
      followUps: followUpsByFolder(merged),
      criticalPath: summarizeCriticalPath([...merged, ...closed]),
      mainRed: [...mainRed].sort((left, right) => left.number - right.number),
    },
  };
}

// ---- Report -----------------------------------------------------------------

// The report is posted as an issue comment, where an @name notifies someone
// and `@codex` starts a Codex task. A zero-width space after the @ keeps the
// text readable and inert; e-mail addresses are left alone.
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const oneLine = (text) => {
  const flat = text
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .replaceAll(/(^|[^\w`])@(?=\w)/gu, `$1@${ZERO_WIDTH_SPACE}`);
  return flat.length > TITLE_LENGTH
    ? `${flat.slice(0, TITLE_LENGTH - 1)}…`
    : flat;
};
const link = (label, url) => `[${label}](${url})`;
const pullRequestLink = (pullRequest) =>
  `${link(`#${pullRequest.number}`, pullRequest.url)} ${oneLine(pullRequest.title)}`;
const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const figure = (value) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);
const minutes = (seconds) => `${(seconds / 60).toFixed(1)} min`;

/** Up to SHOWN_PER_LIST rendered entries, or "none". */
function listed(entries, render, prefix = '') {
  if (entries.length === 0) return [`${prefix}- none`];
  return [
    ...entries.slice(0, SHOWN_PER_LIST).map(render),
    ...(entries.length > SHOWN_PER_LIST
      ? [`${prefix}- …and ${entries.length - SHOWN_PER_LIST} more.`]
      : []),
  ];
}

function renderInspection({
  sensitive,
  unanswered,
  followUps,
  criticalPath,
  mainRed,
}) {
  const lines = [
    '## To inspect',
    '',
    '### Sensitive merges',
    '',
    ...listed(
      sensitive,
      ({ pullRequest, paths }) =>
        `- ${pullRequestLink(pullRequest)} (${paths.map((path) => `\`${path}\``).join(', ')})`,
    ),
    '',
    '### Review threads resolved without an answer',
    '',
    ...listed(unanswered, ({ pullRequest, thread }) => {
      const [first] = thread.comments;
      return `- ${link(`#${pullRequest.number}`, first.url)} \`${thread.path}\`: ${oneLine(titleOf(first.body))}`;
    }),
    '',
    '### Follow-ups recorded in pull request bodies',
    '',
  ];
  if (followUps.length === 0) lines.push('- none');
  for (const [folder, items] of followUps) {
    lines.push(
      `- \`${folder}\` (${items.length})`,
      ...listed(
        items,
        ({ pullRequest, text }) =>
          `  - ${link(`#${pullRequest.number}`, pullRequest.url)}: ${oneLine(text)}`,
        '  ',
      ),
    );
  }

  lines.push('', '### CI critical path', '');
  if (criticalPath.runs === 0) {
    lines.push('- no completed CI run.');
  } else {
    const { longestJob, queue } = criticalPath;
    lines.push(
      `- ${plural(criticalPath.runs, 'CI run')} of pull requests merged or closed in the window, cancelled runs excluded.`,
      `- Longest job: median ${minutes(longestJob.median)}, max ${minutes(longestJob.max)}.`,
      `- Queue before the first job: median ${minutes(queue.median)}, max ${minutes(queue.max)}.`,
    );
  }

  lines.push(
    '',
    `### \`${MAIN_RED_LABEL}\` issues opened`,
    '',
    ...listed(
      mainRed,
      (issue) =>
        `- ${link(`#${issue.number}`, issue.url)} ${oneLine(issue.title)} (${issue.closed ? 'closed' : 'open'})`,
    ),
  );
  return lines;
}

export function renderReport(metrics) {
  const { merged, closed, reverts, rounds, findings, quality } = metrics;
  const lines = [
    '# Delivery metrics',
    '',
    `${REPOSITORY}, from ${instant(metrics.since)} to ${instant(metrics.until)} (UTC).`,
    '',
    '## Pull requests',
    '',
    `- Merged: ${merged.length}`,
    `- Closed without merge: ${closed.length}`,
    ...closed.map((pullRequest) => `  - ${pullRequestLink(pullRequest)}`),
    '',
    '## Reverts',
    '',
  ];

  if (reverts.length === 0) lines.push('- none');
  for (const revert of reverts) {
    const targets = revert.reverted.map(
      ({ number, inWindow }) =>
        `#${number}${inWindow ? ' (merged in the window)' : ''}`,
    );
    lines.push(
      `- ${link(revert.label, revert.url)} ${oneLine(revert.title)}${
        targets.length > 0 ? `: reverts ${targets.join(', ')}` : ''
      }`,
    );
  }

  lines.push('', '## Review rounds', '');
  if (rounds.reviewed.length === 0) {
    lines.push('- no merged pull request had an automated review.');
  } else {
    const corrected = rounds.reviewed.filter(
      ({ commitsAfterReview }) => commitsAfterReview > 0,
    );
    const untouched = rounds.reviewed.length - corrected.length;
    const byPullRequest =
      corrected.length === 0
        ? 'every one had 0'
        : `${corrected
            .map(
              ({ pullRequest, commitsAfterReview }) =>
                `#${pullRequest.number} ${commitsAfterReview}`,
            )
            .join(
              ', ',
            )}${untouched > 0 ? `; the other ${untouched} had 0` : ''}`;
    lines.push(
      `- ${rounds.reviewed.length} of ${plural(merged.length, 'merged pull request')} had an automated review; commits after the first review: median ${figure(rounds.median)}, max ${rounds.max}.`,
      `- Commits after the first review, by pull request: ${byPullRequest}.`,
      `- Above the bounded rule (more than ${MAXIMUM_COMMITS_AFTER_REVIEW}):${rounds.aboveRule.length === 0 ? ' none' : ''}`,
      ...rounds.aboveRule.map(
        ({ pullRequest, commitsAfterReview }) =>
          `  - ${pullRequestLink(pullRequest)}: ${plural(commitsAfterReview, 'commit')}`,
      ),
    );
  }

  lines.push('', '## Automated reviewer findings', '');
  if (findings.findings.length === 0) {
    lines.push('- none');
  } else {
    lines.push(
      `${plural(findings.findings.length, 'finding')} in ${plural(findings.pullRequestCount, 'pull request')} (${AUTOMATED_REVIEWER} inline comments on merged pull requests).`,
      '',
      '| Severity | Total | Fixed | Follow-up | Open |',
      '| --- | ---: | ---: | ---: | ---: |',
    );
    for (const [severity, entries] of findings.bySeverity) {
      const count = (outcome) =>
        entries.filter((finding) => finding.outcome === outcome).length;
      lines.push(
        `| ${severity} | ${entries.length} | ${count('fixed')} | ${count('follow-up')} | ${count('open')} |`,
      );
    }
    lines.push(
      '',
      "Outcomes use replies and commits up to each pull request's merge. The resolved flag and the pull request body are read as of this report (GitHub does not date them).",
    );
    const open = findings.findings.filter(({ outcome }) => outcome === 'open');
    if (open.length > 0) {
      lines.push('', 'Open at merge:');
      lines.push(
        ...listed(
          open,
          (finding) =>
            `- ${finding.severity} ${link(`#${finding.pullRequest.number}`, finding.url)}: ${oneLine(finding.title)} (\`${finding.path}\`)`,
        ),
      );
    }
  }

  const rate =
    quality.considered === 0
      ? 'n/a'
      : `${quality.passed}/${quality.considered} (${((quality.passed / quality.considered) * 100).toFixed(1)}%)`;
  lines.push(
    '',
    '## CI',
    '',
    `- \`${REQUIRED_CHECK}\` first-run pass rate: ${rate}`,
    `- Cancelled \`${REQUIRED_CHECK}\` runs: ${quality.cancelled}`,
    '',
    ...renderInspection(metrics.inspect),
    '',
    '## Method',
    '',
    `- Review rounds: non-merge commits authored after the first review, summary or inline comment by ${AUTOMATED_REVIEWER}. The bounded rule is one correction commit plus at most one confirmation.`,
    '- Finding outcome: fixed when a reply says "fixed" or "addressed", or the thread is resolved and a later commit touched its file; follow-up when a reply or the pull request body follow-up part mentions follow-up or names its file; otherwise open (including a finding answered without either).',
    `- CI: the first non-cancelled \`${REQUIRED_CHECK}\` run of a pull request event, over pull requests merged or closed in the window; cancelled runs are counted apart and never as failures.`,
    `- To inspect: sensitive merges change a file under ${SENSITIVE_PATHS.map((path) => `\`${path}\``).join(', ')}. A resolved thread counts when no reply says "fixed", "not valid" or names a follow-up \`#N\`. Follow-ups are grouped by the top-level folder (each \`apps/<app>\` apart) holding most of the pull request's files. The CI critical path covers the CI runs counted above: the longest job, and the queue from the run's creation to its first job.`,
    '',
  );
  return lines.join('\n');
}

export async function main({
  argv = process.argv.slice(2),
  execFile = promisify(execFileCallback),
  stdout = process.stdout,
  stderr = process.stderr,
  now = () => new Date(),
} = {}) {
  let options;
  try {
    options = parseArguments(argv, now());
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    stderr.write(`${error.message}\n`);
    return 2;
  }
  if (options.help) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }

  try {
    const metrics = await collectMetrics(createGithubClient(execFile), options);
    stdout.write(renderReport(metrics));
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main();
}
