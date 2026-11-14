#!/usr/bin/env node

// Whether one issue is free to start, in one read-only command, so nobody
// rebuilds it from several `gh` calls before a session or a delegation starts.
// One GraphQL query through `gh` (which also honours GH_TOKEN) reads the
// issue, its newest comments, sub-issues, blocking dependencies and open
// closing pull requests. A second query runs only when the body's "Blocked
// by" names issues, to read their states. A pure function turns the facts
// into one verdict and its reasons. Nothing is written.

import { execFile as execFileCallback } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const PAGE_SIZE = 100;
const MAXIMUM_OUTPUT = 64 * 1024 * 1024;

const ISSUE_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      number
      title
      url
      state
      stateReason
      closedAt
      body
      comments(last: ${PAGE_SIZE}) {
        totalCount
        nodes { author { login } createdAt url body }
      }
      subIssues(first: ${PAGE_SIZE}) { totalCount nodes { number state } }
      blockedBy(first: ${PAGE_SIZE}) { totalCount nodes { number state } }
      closedByPullRequestsReferences(first: ${PAGE_SIZE}, includeClosedPrs: false) {
        totalCount
        nodes { number url state isDraft headRefName }
      }
    }
  }
}`;

/** One aliased lookup per number, which may name an issue or a pull request. */
function blockersQuery(numbers) {
  const lookups = numbers.map(
    (number) => `    issue${number}: issueOrPullRequest(number: ${number}) {
      __typename
      ... on Issue { number state }
      ... on PullRequest { number state }
    }`,
  );
  return `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
${lookups.join('\n')}
  }
}`;
}

const USAGE = `Usage: node scripts/issue-readiness.mjs <issue> [--json]

Says whether an issue of the current directory's repository (or GH_REPO) is
free to start, from one read-only GitHub GraphQL query through gh, plus a
second one only when the body's "Blocked by" names issues. The command never
writes to GitHub.

Verdict: ready, or the first of these reasons that applies. Every reason that
applies is listed under it.
  closed             the issue is closed
  claimed            a comment claims it: the first words of its first line
                     say claim, claimed, claiming, claims, reserved,
                     reserves, taking or owns, and not released, completed
                     or delivered; or it is a Codex launch comment, one that
                     starts with the Codex mention and is not a review
                     request. Each claim shows its harness, comment author,
                     date, branch and link.
  pull request open  an open pull request closes it
  delivered          it has sub-issues and all of them are closed
  split              it has sub-issues and some are open: start one of those
  blocked            an open issue or pull request blocks it, as a blocking
                     dependency or in a "Blocked by" line or section of the
                     body ("none" there means no blocker)

Exit codes: 0 ready, 1 not ready, 2 invalid arguments or an unavailable or
malformed GitHub response.

--json prints the issue, the verdict, the reasons and the warnings as JSON.
Reads the newest ${PAGE_SIZE} comments and the first ${PAGE_SIZE} sub-issues, blockers and
closing pull requests; it says so when it stops short.`;

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

function optional(value, path, parse) {
  return value === null ? null : parse(value, path);
}

function connection(value, path, parse) {
  const page = object(value, path);
  return {
    nodes: list(page.nodes, `${path}.nodes`).map((node, index) =>
      parse(node, `${path}.nodes[${index}]`),
    ),
    totalCount: count(page.totalCount, `${path}.totalCount`),
  };
}

function numbered(node, path) {
  object(node, path);
  return {
    number: count(node.number, `${path}.number`),
    state: enumValue(node.state, `${path}.state`),
  };
}

function comment(node, path) {
  object(node, path);
  const author = optional(node.author, `${path}.author`, object);
  return {
    author:
      author === null ? 'ghost' : text(author.login, `${path}.author.login`),
    createdAt: date(node.createdAt, `${path}.createdAt`),
    url: text(node.url, `${path}.url`),
    body: text(node.body, `${path}.body`),
  };
}

function pullRequest(node, path) {
  return {
    ...numbered(node, path),
    url: text(node.url, `${path}.url`),
    draft: flag(node.isDraft, `${path}.isDraft`),
    branch: text(node.headRefName, `${path}.headRefName`),
  };
}

function parseGraphQL(json) {
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
  return object(object(response.data, 'data').repository, 'repository');
}

/** Validates the GraphQL response of ISSUE_QUERY. */
function parseIssue(json) {
  const node = object(parseGraphQL(json).issue, 'issue');
  const pages = {
    comments: connection(node.comments, 'issue.comments', comment),
    'sub-issues': connection(node.subIssues, 'issue.subIssues', numbered),
    'blocking dependencies': connection(
      node.blockedBy,
      'issue.blockedBy',
      numbered,
    ),
    'closing pull requests': connection(
      node.closedByPullRequestsReferences,
      'issue.closedByPullRequestsReferences',
      pullRequest,
    ),
  };
  const warnings = Object.entries(pages)
    .filter(([, page]) => page.totalCount > page.nodes.length)
    .map(([name, page]) =>
      name === 'comments'
        ? `Only the newest ${page.nodes.length} of ${page.totalCount} comments were read; an older claim may be missing.`
        : `Only the first ${page.nodes.length} of ${page.totalCount} ${name} were read.`,
    );
  return {
    issue: {
      number: count(node.number, 'issue.number'),
      title: text(node.title, 'issue.title'),
      url: text(node.url, 'issue.url'),
      state: enumValue(node.state, 'issue.state'),
      stateReason: optional(node.stateReason, 'issue.stateReason', enumValue),
      closedAt: optional(node.closedAt, 'issue.closedAt', date),
      body: text(node.body, 'issue.body'),
      comments: pages.comments.nodes,
      subIssues: pages['sub-issues'].nodes,
      blockedBy: pages['blocking dependencies'].nodes,
      pullRequests: pages['closing pull requests'].nodes,
    },
    warnings,
  };
}

/** Validates the response of blockersQuery(numbers): one state per number. */
function parseBlockerStates(json, numbers) {
  const repository = parseGraphQL(json);
  return numbers.map((number) => {
    const path = `repository.issue${number}`;
    const blocker = numbered(repository[`issue${number}`], path);
    if (blocker.number !== number) invalid(`${path}.number`, String(number));
    return blocker;
  });
}

// ---- Facts ------------------------------------------------------------------

// Claim wording varies by harness. These words come from the claim comments
// on this repository's issues; the tests list each wording with its source.
// Only the lead of a comment counts, the first words of its first line
// outside a quote, so a later mention ("no competing claim") is no claim.
const CLAIM_WORD =
  /\b(?:claim|claims|claimed|claiming|reserved|reserves|taking|owns)\b/iu;
const CLAIM_LEAD_WORDS = 8;
// A lead that ends a claim ("Claim released:", "Completed claim:",
// "DELIVERED / claim released") is no new claim.
const ENDING_WORD = /\b(?:releas|complet|deliver)/iu;
const ENDING_LEAD_WORDS = 4;
const CODEX_LAUNCH = /^@codex\b(?!\s+review\b)/iu;
// Longer names first: at the same position, the longer name wins.
const HARNESSES = [
  'Codex Cloud',
  'Claude Code',
  'ChatGPT Work',
  'Codex',
  'Claude',
];
const NAMED_BRANCH = /\bbranch:?\s+(?:`([^`\s]+)`|([\w.]*[-/][\w./-]*))/iu;
const BRANCH_AFTER_ON =
  /\bon\s+(?:`([a-z][\w-]*\/[^`\s]+)`|([a-z][\w-]*\/[\w./-]+))/u;

function leadLine(body) {
  const line =
    body
      .split(/\r?\n/u)
      .map((candidate) => candidate.trim())
      .find((candidate) => candidate !== '' && !candidate.startsWith('>')) ??
    '';
  return line.replace(/^[#*_\-\s]+/u, '');
}

function leadWords(line, words) {
  return line.split(/\s+/u).slice(0, words).join(' ');
}

function harnessIn(line) {
  const lower = line.toLowerCase();
  let found = null;
  for (const name of HARNESSES) {
    const index = lower.indexOf(name.toLowerCase());
    if (index !== -1 && (found === null || index < found.index))
      found = { name, index };
  }
  return found?.name ?? null;
}

function branchIn(body) {
  const paragraph = body.split(/\r?\n\s*\r?\n/u)[0];
  const matches = [NAMED_BRANCH, BRANCH_AFTER_ON]
    .map((pattern) => paragraph.match(pattern))
    .filter((match) => match !== null)
    .sort((left, right) => left.index - right.index);
  if (matches.length === 0) return null;
  const [, quoted, bare] = matches[0];
  return quoted ?? bare.replace(/[./]+$/u, '');
}

/** The claim a comment makes, or null when it makes none. */
export function claimOf({ author, createdAt, url, body }) {
  const lead = leadLine(body);
  let harness;
  if (CODEX_LAUNCH.test(lead)) harness = 'Codex launch comment';
  else if (
    !CLAIM_WORD.test(leadWords(lead, CLAIM_LEAD_WORDS)) ||
    ENDING_WORD.test(leadWords(lead, ENDING_LEAD_WORDS))
  )
    return null;
  else harness = harnessIn(lead);
  return { harness, author, createdAt, branch: branchIn(body), url };
}

const BLOCKED_BY_LINE =
  /^\s*(?:[-*]\s+)?(?:\*\*|__)?blocked by(?:\*\*|__)?\s*:(?:\*\*|__)?(.*)$/iu;
const BLOCKED_BY_HEADING = /^\s{0,3}#{1,6}\s+blocked by\s*:?\s*$/iu;
const HEADING = /^\s{0,3}#{1,6}\s/u;
const FENCE = /^\s{0,3}(?:```|~~~)/u;
const NO_BLOCKER = /^\s*(?:none|nothing|n\/a)\b/iu;
const REFERENCE = /(?<![\w/&])#(\d+)\b/gu;

/**
 * The issue numbers a body names as blockers: on a "Blocked by:" line, or in
 * a "Blocked by" section up to the next heading. Text that starts with
 * "none" names none, whatever it mentions after.
 */
export function bodyBlockers(body) {
  const lines = body.split(/\r?\n/u);
  const texts = [];
  let fenced = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (FENCE.test(lines[index])) fenced = !fenced;
    if (fenced) continue;
    const inline = lines[index].match(BLOCKED_BY_LINE);
    if (inline !== null) texts.push(inline[1]);
    else if (BLOCKED_BY_HEADING.test(lines[index])) {
      const section = [];
      while (index + 1 < lines.length && !HEADING.test(lines[index + 1]))
        section.push(lines[(index += 1)]);
      texts.push(section.join('\n'));
    }
  }
  const numbers = new Set();
  for (const blockers of texts)
    if (!NO_BLOCKER.test(blockers))
      for (const [, number] of blockers.matchAll(REFERENCE))
        numbers.add(Number(number));
  return [...numbers].sort((left, right) => left - right);
}

// ---- Verdict ----------------------------------------------------------------

const lowerCase = (value) => value.toLowerCase().replaceAll('_', ' ');

/**
 * The verdict and its reasons for a validated issue whose blockers carry
 * their states and where each was named: `dependency`, `body` or both.
 * Reasons come in a fixed order (closed, claimed, pull request open,
 * delivered, split, blocked); the first one names the verdict.
 */
export function issueReadiness(issue) {
  const reasons = [];
  if (issue.state === 'CLOSED')
    reasons.push({
      reason: 'closed',
      stateReason:
        issue.stateReason === null ? null : lowerCase(issue.stateReason),
      closedAt: issue.closedAt,
    });
  const claims = issue.comments.map(claimOf).filter((claim) => claim !== null);
  if (claims.length > 0) reasons.push({ reason: 'claimed', claims });
  const pullRequests = issue.pullRequests.filter(
    (pullRequest) => pullRequest.state === 'OPEN',
  );
  if (pullRequests.length > 0)
    reasons.push({
      reason: 'pull request open',
      pullRequests: pullRequests.map(({ number, branch, draft, url }) => ({
        number,
        branch,
        draft,
        url,
      })),
    });
  const subIssues = issue.subIssues.map(({ number }) => number);
  const openSubIssues = issue.subIssues
    .filter((subIssue) => subIssue.state === 'OPEN')
    .map(({ number }) => number);
  if (subIssues.length > 0 && openSubIssues.length === 0)
    reasons.push({ reason: 'delivered', subIssues });
  if (openSubIssues.length > 0)
    reasons.push({ reason: 'split', subIssues, openSubIssues });
  const blockers = issue.blockers.filter((blocker) => blocker.state === 'OPEN');
  if (blockers.length > 0)
    reasons.push({
      reason: 'blocked',
      blockers: blockers.map(({ number, sources }) => ({ number, sources })),
    });
  return { verdict: reasons[0]?.reason ?? 'ready', reasons };
}

const references = (numbers) =>
  numbers.map((number) => `#${number}`).join(', ');

const BLOCKER_SOURCES = {
  dependency: 'blocking dependency',
  body: '"Blocked by" in the body',
};

function reasonLines(reason) {
  switch (reason.reason) {
    case 'closed':
      return [
        `- closed: ${[reason.stateReason, reason.closedAt]
          .filter((part) => part !== null)
          .join(', ')}`,
      ];
    case 'claimed':
      return reason.claims.map(
        (claim) =>
          `- claimed: ${claim.harness ?? 'unnamed harness'} (${claim.author}), ${claim.createdAt}, branch ${claim.branch ?? 'not named'}, ${claim.url}`,
      );
    case 'pull request open':
      return reason.pullRequests.map(
        (pullRequest) =>
          `- pull request open: #${pullRequest.number}${pullRequest.draft ? ' (draft)' : ''}, branch ${pullRequest.branch}, ${pullRequest.url}`,
      );
    case 'delivered':
      return [
        `- delivered: all ${reason.subIssues.length} sub-issues are closed: ${references(reason.subIssues)}`,
      ];
    case 'split':
      return [
        `- split: ${reason.openSubIssues.length} of ${reason.subIssues.length} sub-issues are open: ${references(reason.openSubIssues)}`,
      ];
    case 'blocked':
      return reason.blockers.map(
        (blocker) =>
          `- blocked: #${blocker.number} is open (${blocker.sources
            .map((source) => BLOCKER_SOURCES[source])
            .join('; ')})`,
      );
    default:
      throw new Error(`Unknown reason ${reason.reason}.`);
  }
}

/** The text report: the issue, its verdict, then one line per reason. */
export function renderReport(report) {
  return [
    `#${report.issue.number} ${report.issue.title}`,
    `verdict: ${report.verdict}`,
    ...report.reasons.flatMap(reasonLines),
  ].join('\n');
}

// ---- Commands ---------------------------------------------------------------

function failureDetail(failure) {
  return (failure?.stderr || failure?.message || 'unexpected failure')
    .toString()
    .trim();
}

async function graphql(execFile, query, fields = []) {
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
        ...fields,
        '-f',
        `query=${query}`,
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

/** Reads the issue, then the states of the blockers its body names. */
async function readIssue(execFile, number) {
  const { issue, warnings } = parseIssue(
    await graphql(execFile, ISSUE_QUERY, ['-F', `number=${number}`]),
  );
  if (issue.number !== number) invalid('issue.number', String(number));
  const blockers = new Map(
    issue.blockedBy.map((blocker) => [
      blocker.number,
      { ...blocker, sources: ['dependency'] },
    ]),
  );
  const named = bodyBlockers(issue.body).filter(
    (blocker) => blocker !== number,
  );
  const unknown = named.filter((blocker) => !blockers.has(blocker));
  const states =
    unknown.length === 0
      ? []
      : parseBlockerStates(
          await graphql(execFile, blockersQuery(unknown)),
          unknown,
        );
  for (const blocker of states)
    blockers.set(blocker.number, { ...blocker, sources: [] });
  for (const blocker of named) blockers.get(blocker).sources.push('body');
  return {
    issue: {
      ...issue,
      blockers: [...blockers.values()].sort(
        (left, right) => left.number - right.number,
      ),
    },
    warnings,
  };
}

function issueNumber(argument) {
  const match = /^#?([1-9]\d*)$/u.exec(argument);
  return match === null ? null : Number(match[1]);
}

export async function main({
  argv = process.argv.slice(2),
  execFile = promisify(execFileCallback),
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  let json = false;
  let number = null;
  for (const argument of argv) {
    if (argument === '--help' || argument === '-h') {
      stdout.write(`${USAGE}\n`);
      return 0;
    }
    if (argument === '--json') json = true;
    else if (number === null && issueNumber(argument) !== null)
      number = issueNumber(argument);
    else {
      stderr.write(`Unknown argument "${argument}".\n${USAGE}\n`);
      return 2;
    }
  }
  if (number === null) {
    stderr.write(`Name one issue number.\n${USAGE}\n`);
    return 2;
  }

  let report;
  try {
    const { issue, warnings } = await readIssue(execFile, number);
    report = {
      issue: {
        number: issue.number,
        title: issue.title,
        url: issue.url,
        state: issue.state.toLowerCase(),
      },
      ...issueReadiness(issue),
      warnings,
    };
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 2;
  }

  if (json) stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    stdout.write(`${renderReport(report)}\n`);
    for (const warning of report.warnings) stderr.write(`${warning}\n`);
  }
  return report.verdict === 'ready' ? 0 : 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main();
}
