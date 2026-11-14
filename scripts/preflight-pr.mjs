import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  closedIssueNumbers,
  preflightAcceptanceProof,
} from './verify-acceptance-proof.mjs';

const usage = [
  'Usage: node scripts/preflight-pr.mjs --body FILE --repo OWNER/NAME [--base REF]',
  '       node scripts/preflight-pr.mjs --pr NUMBER --repo OWNER/NAME [--body FILE]',
  '       node scripts/preflight-pr.mjs --body FILE --context FILE',
].join('\n');

class InputError extends Error {}

function repositoryName(value) {
  if (
    typeof value !== 'string' ||
    !/^[a-z\d_.-]+\/[a-z\d_.-]+$/iu.test(value) ||
    value.split('/').some((part) => part === '.' || part === '..')
  )
    throw new InputError('A repository in owner/name form is required.');
  return value;
}

function validateContext(value) {
  const object = (item) =>
    item !== null && typeof item === 'object' && !Array.isArray(item);
  const strings = (items) =>
    Array.isArray(items) && items.every((item) => typeof item === 'string');
  const positive = (number) => Number.isSafeInteger(number) && number > 0;
  if (!object(value)) throw new InputError('Context must be an object.');
  repositoryName(value.repository);
  if (!Number.isSafeInteger(value.pullRequest) || value.pullRequest < 0)
    throw new InputError(
      'Context needs a non-negative pullRequest number (0 before creation).',
    );
  if (!Array.isArray(value.issues))
    throw new InputError('Context needs issue facts.');
  const seen = new Set();
  for (const issue of value.issues) {
    if (
      !object(issue) ||
      !positive(issue.number) ||
      (typeof issue.body !== 'string' && issue.body !== null) ||
      (issue.pullRequest !== undefined &&
        typeof issue.pullRequest !== 'boolean')
    )
      throw new InputError('Context contains malformed issue facts.');
    if (seen.has(issue.number))
      throw new InputError('Context contains duplicate issue facts.');
    seen.add(issue.number);
  }
  if (!strings(value.changedFiles))
    throw new InputError('Context needs the changed-file list.');
  const comments = value.comments ?? [];
  if (
    !Array.isArray(comments) ||
    comments.some(
      (comment) =>
        !object(comment) ||
        ![comment.author, comment.body, comment.url].every(
          (field) => typeof field === 'string',
        ),
    )
  )
    throw new InputError('Context contains malformed comment facts.');
  const approvers = value.approvers ?? null;
  if (approvers !== null && !strings(approvers))
    throw new InputError('Context contains malformed approver facts.');
  return {
    repository: value.repository,
    pullRequest: value.pullRequest,
    issues: value.issues,
    changedFiles: value.changedFiles,
    comments,
    approvers,
  };
}

async function inputFile(file, label) {
  try {
    return await readFile(file, 'utf8');
  } catch {
    throw new InputError(`Cannot read the ${label} file.`);
  }
}

function github(repository, route, list = false) {
  const result = spawnSync(
    'gh',
    [
      'api',
      '--method',
      'GET',
      '--paginate',
      '--slurp',
      `repos/${repository}/${route}`,
    ],
    {
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.error || result.status !== 0)
    throw new InputError(
      `Cannot read ${route} through gh. Check authentication and repository access.`,
    );
  let pages;
  try {
    pages = JSON.parse(result.stdout);
  } catch {
    throw new InputError(`GitHub returned unreadable facts for ${route}.`);
  }
  if (
    !Array.isArray(pages) ||
    !pages.length ||
    (list ? !pages.every(Array.isArray) : pages.length !== 1)
  )
    throw new InputError(`GitHub returned incomplete facts for ${route}.`);
  return list ? pages.flat() : pages[0];
}

function localChangedFiles(base) {
  let cwd;
  function git(args) {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 15_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.error || result.status !== 0)
      throw new InputError(
        'Cannot establish changed files. Use a valid local --base ref or read an existing --pr.',
      );
    return result.stdout;
  }
  cwd = git(['rev-parse', '--show-toplevel']).replace(/\r?\n$/u, '');
  const revision = git([
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${base}^{commit}`,
  ]).trim();
  const ancestor = git(['merge-base', revision, 'HEAD']).trim();
  const split = (value) => (value === '' ? [] : value.slice(0, -1).split('\0'));
  const diff = [
    '-c',
    'diff.relative=false',
    'diff',
    '--name-only',
    '--no-renames',
    '-z',
  ];
  return [
    ...new Set([
      ...split(git([...diff, ancestor, '--'])),
      ...split(git([...diff, '--cached', ancestor, '--'])),
      ...split(git(['ls-files', '--others', '--exclude-standard', '-z'])),
    ]),
  ];
}

async function liveInputs(options) {
  const repository = repositoryName(
    options.get('--repo') ?? process.env.GITHUB_REPOSITORY,
  );
  const numberText = options.get('--pr');
  if (
    numberText !== undefined &&
    (!/^[1-9][0-9]*$/u.test(numberText) ||
      !Number.isSafeInteger(Number(numberText)))
  )
    throw new InputError('--pr needs a positive integer.');
  const number = numberText === undefined ? 0 : Number(numberText);
  if (number && options.has('--base'))
    throw new InputError('--base applies only before PR creation.');
  if (!number && !options.has('--body')) throw new InputError(usage);
  const current = number ? github(repository, `pulls/${number}`) : null;
  if (
    number &&
    (current?.number !== number ||
      (typeof current.body !== 'string' && current.body !== null))
  )
    throw new InputError('GitHub returned incomplete pull-request facts.');
  const body = options.has('--body')
    ? await inputFile(options.get('--body'), 'body')
    : (current?.body ?? '');
  const changedFiles = number
    ? github(repository, `pulls/${number}/files`, true).flatMap((file) => {
        if (
          typeof file.filename !== 'string' ||
          (file.previous_filename !== undefined &&
            typeof file.previous_filename !== 'string')
        )
          throw new InputError(
            'GitHub returned incomplete changed-file facts.',
          );
        return [file.filename, file.previous_filename].filter(
          (name) => name !== undefined,
        );
      })
    : localChangedFiles(options.get('--base') ?? 'origin/main');
  const issues = closedIssueNumbers(body, repository).map((issueNumber) => {
    const issue = github(repository, `issues/${issueNumber}`);
    if (
      issue?.number !== issueNumber ||
      (typeof issue.body !== 'string' && issue.body !== null)
    )
      throw new InputError('GitHub returned incomplete issue facts.');
    return {
      number: issueNumber,
      body: issue.body ?? '',
      pullRequest: Boolean(issue.pull_request),
    };
  });
  const comments = number
    ? github(repository, `issues/${number}/comments`, true).map((comment) => ({
        id: comment.id,
        author: comment.user?.login ?? '',
        body: comment.body ?? '',
        url: comment.html_url ?? '',
      }))
    : [];
  const approvers =
    process.env.PROOF_EXCEPTION_APPROVERS?.split(/[\s,]+/u).filter(Boolean) ??
    null;
  return {
    body,
    context: validateContext({
      repository,
      pullRequest: number,
      issues,
      changedFiles,
      comments,
      approvers,
    }),
  };
}

async function offlineInputs(options) {
  if (
    !options.has('--body') ||
    ['--repo', '--pr', '--base'].some((flag) => options.has(flag))
  )
    throw new InputError(
      'Use --body with --context, without live GitHub options.',
    );
  let parsed;
  try {
    parsed = JSON.parse(await inputFile(options.get('--context'), 'context'));
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError('Context is not valid JSON.');
  }
  return {
    body: await inputFile(options.get('--body'), 'body'),
    context: validateContext(parsed),
  };
}

async function main(argv) {
  if (argv.length === 1 && argv[0] === '--help') {
    console.log(usage);
    return 0;
  }
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !['--body', '--context', '--repo', '--pr', '--base'].includes(flag) ||
      !value ||
      value.startsWith('--') ||
      options.has(flag)
    )
      throw new InputError(usage);
    options.set(flag, value);
  }
  const offline = options.has('--context');
  const { body, context } = await (offline
    ? offlineInputs(options)
    : liveInputs(options));
  const issues = closedIssueNumbers(body, context.repository).map(
    (number) =>
      context.issues.find((issue) => issue.number === number) ?? {
        number,
        body: null,
      },
  );
  const verdict = preflightAcceptanceProof({
    ...context,
    issues,
    pullRequest: { number: context.pullRequest, body },
  });
  if (!verdict.passed) {
    console.error(verdict.failures.join('\n'));
    return 1;
  }
  console.log(
    offline
      ? 'Source: supplied context; GitHub freshness was not checked.'
      : 'Source: GitHub; local changed files are included before PR creation.',
  );
  const outcome = verdict.exception ? 'passed by approved exception' : 'passed';
  console.log(
    `PR description preflight ${outcome}. Tests and screenshots have not been verified; the required CI quality check still applies.`,
  );
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(
      error instanceof InputError
        ? error.message
        : 'PR description preflight could not read its required inputs.',
    );
    process.exitCode = 2;
  }
}
