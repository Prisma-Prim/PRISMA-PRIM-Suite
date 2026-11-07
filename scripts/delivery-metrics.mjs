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
const OPEN_FINDINGS_SHOWN = 20;
const TITLE_LENGTH = 90;
const REQUIRED_CHECK = 'quality';
const ALWAYS_LISTED_SEVERITIES = ['P0', 'P1', 'P2'];
const UNRATED = 'Unrated';

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

const SEARCH_QUERY = `query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: ${SEARCH_PAGE_SIZE}, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number title body url merged mergedAt closedAt
        mergeCommit { oid }
        commits(first: 100) {
          nodes {
            commit {
              oid
              authoredDate
              parents { totalCount }
              checkSuites(first: 10) {
                nodes {
                  conclusion
                  workflowRun { event }
                  checkRuns(first: 5, filterBy: { checkName: "${REQUIRED_CHECK}" }) {
                    nodes { conclusion status startedAt }
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

  return {
    async searchPullRequests(qualifiers) {
      const q = `repo:${REPOSITORY} is:pr ${qualifiers}`;
      const nodes = [];
      let after = null;
      do {
        const data = await request([
          'api',
          'graphql',
          '-f',
          `query=${SEARCH_QUERY}`,
          '-f',
          `q=${q}`,
          ...(after === null ? [] : ['-f', `after=${after}`]),
        ]);
        const search = data?.data?.search;
        if (!search) throw new Error('Unexpected GitHub search response.');
        nodes.push(...search.nodes.filter((node) => node?.number));
        after = search.pageInfo.hasNextPage ? search.pageInfo.endCursor : null;
      } while (after !== null);
      return nodes.map(normalizePullRequest);
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

  return {
    number: node.number,
    title: node.title,
    body: node.body ?? '',
    url: node.url,
    merged: node.merged,
    mergedAt: node.mergedAt,
    mergeCommit: node.mergeCommit?.oid ?? null,
    commits: commits.map((commit) => ({
      oid: commit.oid,
      authoredDate: commit.authoredDate,
      isMerge: commit.parents.totalCount > 1,
    })),
    firstAutomatedReview: automatedMoments.sort()[0] ?? null,
    threads,
    qualityRuns: commits.flatMap((commit) =>
      commit.checkSuites.nodes
        .filter((suite) => suite.workflowRun?.event === 'pull_request')
        .flatMap((suite) =>
          suite.checkRuns.nodes.map((run) => ({
            ...run,
            // A cancelled workflow run still ends its quality job as failed.
            conclusion:
              suite.conclusion === 'CANCELLED' ? 'CANCELLED' : run.conclusion,
          })),
        ),
    ),
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

export async function collectMetrics(github, { since, until }) {
  const range = `${instant(since)}..${instant(until)}`;
  const [merged, closed, branchCommits] = await Promise.all([
    github.searchPullRequests(`is:merged merged:${range}`),
    github.searchPullRequests(`is:closed is:unmerged closed:${range}`),
    github.listBranchCommits({ since, until }),
  ]);
  return {
    since,
    until,
    merged,
    closed,
    reverts: findReverts(merged, branchCommits),
    rounds: summarizeReviewRounds(merged),
    findings: await summarizeFindings(merged, github.commitFiles),
    quality: summarizeQuality([...merged, ...closed]),
  };
}

// ---- Report -----------------------------------------------------------------

const oneLine = (text) => {
  const flat = text.replaceAll(/\s+/gu, ' ').trim();
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
      for (const finding of open.slice(0, OPEN_FINDINGS_SHOWN)) {
        lines.push(
          `- ${finding.severity} ${link(`#${finding.pullRequest.number}`, finding.url)}: ${oneLine(finding.title)} (\`${finding.path}\`)`,
        );
      }
      if (open.length > OPEN_FINDINGS_SHOWN) {
        lines.push(`- …and ${open.length - OPEN_FINDINGS_SHOWN} more.`);
      }
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
    '## Method',
    '',
    `- Review rounds: non-merge commits authored after the first review, summary or inline comment by ${AUTOMATED_REVIEWER}. The bounded rule is one correction commit plus at most one confirmation.`,
    '- Finding outcome: fixed when a reply says "fixed" or "addressed", or the thread is resolved and a later commit touched its file; follow-up when a reply or the pull request body follow-up part mentions follow-up or names its file; otherwise open (including a finding answered without either).',
    `- CI: the first non-cancelled \`${REQUIRED_CHECK}\` run of a pull request event, over pull requests merged or closed in the window; cancelled runs are counted apart and never as failures.`,
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
