#!/usr/bin/env node

// Answers "where is the MVP?" from the repository: reads the official
// 71-capability grid (docs/product/mvp-capability-grid.csv), asks GitHub for
// the state of every listed delivery issue, and prints the delivered count.
// Read-only: it never writes to GitHub.

import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const DEFAULT_REPOSITORY = 'Prisma-Prim/PRISMA-PRIM-Suite';
const GRID_PATH = fileURLToPath(
  new URL('../docs/product/mvp-capability-grid.csv', import.meta.url),
);
const HEADER = [
  'id',
  'module',
  'group',
  'capability',
  'delivery_issues',
  'status_rule',
];
const GROUPS = ['operational base', 'commerce', 'finalization'];
const RULE_CLOSED_COMPLETED = 'closed-completed';
const RULE_UNMAPPED = 'unmapped';
const USAGE = 'Usage: node scripts/mvp-progress.mjs';

function parseCsvRecords(text) {
  const records = [];
  let fields = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let quoteLine = 1;

  const endRecord = () => {
    fields.push(field);
    if (fields.length > 1 || fields[0] !== '') {
      records.push({ line: recordLine, fields });
    }
    fields = [];
    field = '';
  };

  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        if (character === '\n') line += 1;
        field += character;
      }
    } else if (character === '"' && field === '') {
      quoted = true;
      quoteLine = line;
    } else if (character === ',') {
      fields.push(field);
      field = '';
    } else if (character === '\n') {
      endRecord();
      line += 1;
      recordLine = line;
    } else if (character !== '\r') {
      field += character;
    }
  }
  if (quoted) {
    throw new Error(`Unterminated quoted field starting at line ${quoteLine}`);
  }
  endRecord();
  return records;
}

function parseIssueList(value) {
  if (value === '') return [];
  if (!/^[1-9]\d*(?:;[1-9]\d*)*$/u.test(value)) return null;
  const issues = value.split(';').map(Number);
  return new Set(issues).size === issues.length ? issues : null;
}

export function parseGrid(text) {
  const [headerRecord, ...records] = parseCsvRecords(text);
  if (headerRecord?.fields.join(',') !== HEADER.join(',')) {
    throw new Error(
      `The MVP capability grid has an unexpected header (expected ${HEADER.join(',')})`,
    );
  }

  const errors = [];
  const rows = [];
  const seenIds = new Set();
  for (const { line, fields } of records) {
    if (fields.length !== HEADER.length) {
      errors.push(
        `line ${line}: expected ${HEADER.length} columns, found ${fields.length}`,
      );
      continue;
    }
    const [id, module, group, capability, deliveryIssues, statusRule] = fields;
    const issues = parseIssueList(deliveryIssues);
    const rowErrors = [];

    if (id === '' || module === '' || capability === '') {
      rowErrors.push('id, module and capability must not be empty');
    }
    if (seenIds.has(id)) rowErrors.push(`duplicate id ${id}`);
    if (!GROUPS.includes(group)) rowErrors.push(`unknown group "${group}"`);
    if (issues === null) {
      rowErrors.push(
        `invalid delivery issues "${deliveryIssues}" (use distinct positive numbers separated by ;)`,
      );
    }
    if (statusRule === RULE_CLOSED_COMPLETED) {
      if (issues?.length === 0) {
        rowErrors.push(
          `status rule ${RULE_CLOSED_COMPLETED} needs at least one delivery issue (use ${RULE_UNMAPPED} when none is evidenced)`,
        );
      }
    } else if (statusRule === RULE_UNMAPPED) {
      if (issues === null || issues.length > 0) {
        rowErrors.push(
          `status rule ${RULE_UNMAPPED} requires no issue numbers`,
        );
      }
    } else {
      rowErrors.push(`unknown status rule "${statusRule}"`);
    }

    seenIds.add(id);
    if (rowErrors.length > 0) {
      errors.push(...rowErrors.map((message) => `line ${line}: ${message}`));
    } else {
      rows.push({
        id,
        module,
        group,
        capability,
        issues,
        statusRule,
      });
    }
  }

  if (errors.length > 0) {
    throw new Error(
      [
        'The MVP capability grid is invalid:',
        ...errors.map((e) => `  ${e}`),
      ].join('\n'),
    );
  }
  return rows;
}

function blockerReason(issueState) {
  if (!issueState) return 'not found or not an issue';
  if (issueState.state === 'OPEN') return 'open';
  const reason = (issueState.stateReason ?? 'unspecified')
    .toLowerCase()
    .replaceAll('_', ' ');
  return `closed as ${reason}`;
}

function isClosedCompleted(issueState) {
  return (
    issueState?.state === 'CLOSED' && issueState.stateReason === 'COMPLETED'
  );
}

export function evaluateGrid(rows, issueStates) {
  const evaluated = rows.map((row) => {
    if (row.statusRule === RULE_UNMAPPED) {
      return { ...row, status: 'unmapped', blockers: [] };
    }
    const blockers = row.issues
      .filter((issue) => !isClosedCompleted(issueStates.get(issue)))
      .map((issue) => ({
        issue,
        reason: blockerReason(issueStates.get(issue)),
      }));
    return {
      ...row,
      status: blockers.length === 0 ? 'delivered' : 'pending',
      blockers,
    };
  });

  const groups = GROUPS.map((group) => {
    const inGroup = evaluated.filter((row) => row.group === group);
    return {
      group,
      delivered: inGroup.filter((row) => row.status === 'delivered').length,
      total: inGroup.length,
    };
  });
  return {
    rows: evaluated,
    groups,
    delivered: evaluated.filter((row) => row.status === 'delivered').length,
    total: evaluated.length,
  };
}

function percentage(delivered, total) {
  return total === 0 ? '0.0%' : `${((delivered / total) * 100).toFixed(1)}%`;
}

export function formatReport(
  evaluation,
  { generatedAt = new Date(), repository = DEFAULT_REPOSITORY } = {},
) {
  const timestamp = generatedAt.toISOString().replace(/\.\d{3}Z$/u, 'Z');
  const labelWidth = Math.max(
    'Overall'.length,
    ...evaluation.groups.map(({ group }) => group.length),
  );
  const line = (label, delivered, total, suffix = '') =>
    `${label.padEnd(labelWidth)}  ${String(delivered).padStart(9)}  ${String(total).padStart(5)}${suffix}`;

  const unmapped = evaluation.rows.filter((row) => row.status === 'unmapped');
  const pending = evaluation.rows.filter((row) => row.status === 'pending');
  const idWidth = Math.max(2, ...evaluation.rows.map((row) => row.id.length));
  const rowLine = (row, detail) =>
    `  ${row.id.padEnd(idWidth)}  ${row.capability} (${row.module})${detail}`;

  return [
    `MVP progress: ${evaluation.delivered}/${evaluation.total} capabilities delivered (${percentage(evaluation.delivered, evaluation.total)})`,
    `Grid: docs/product/mvp-capability-grid.csv. Issue states read from ${repository} at ${timestamp}.`,
    '',
    `${'Group'.padEnd(labelWidth)}  ${'Delivered'.padStart(9)}  ${'Total'.padStart(5)}`,
    ...evaluation.groups.map(({ group, delivered, total }) =>
      line(group, delivered, total),
    ),
    line(
      'Overall',
      evaluation.delivered,
      evaluation.total,
      `  ${percentage(evaluation.delivered, evaluation.total)}`,
    ),
    '',
    `Unmapped rows (${unmapped.length}): no delivery issue is evidenced, so they stay pending until the owner decides`,
    ...(unmapped.length > 0
      ? unmapped.map((row) => rowLine(row, ''))
      : ['  none']),
    '',
    `Pending rows (${pending.length}): mapped, but not every listed issue is closed as completed`,
    ...(pending.length > 0
      ? pending.map((row) =>
          rowLine(
            row,
            ` - waiting on ${row.blockers
              .map(({ issue, reason }) => `#${issue} ${reason}`)
              .join(', ')}`,
          ),
        )
      : ['  none']),
    '',
  ].join('\n');
}

function statesQuery(numbers, repository) {
  const [owner, name] = repository.split('/');
  const aliases = numbers
    .map(
      (number) =>
        `i${number}:issueOrPullRequest(number:${number}){__typename ...on Issue{state stateReason}}`,
    )
    .join(' ');
  return `query{repository(owner:"${owner}",name:"${name}"){${aliases}}}`;
}

function parseRepositoryData(stdout) {
  try {
    const repositoryData = JSON.parse(stdout).data?.repository;
    return repositoryData !== null && typeof repositoryData === 'object'
      ? repositoryData
      : null;
  } catch {
    return null;
  }
}

// gh exits non-zero when one number does not exist but still prints the data it
// resolved, so a failure keeps whatever it wrote to stdout.
async function runGraphql(execFile, query) {
  try {
    const { stdout } = await execFile('gh', [
      'api',
      'graphql',
      '-f',
      `query=${query}`,
    ]);
    return { stdout, failure: null };
  } catch (failure) {
    return {
      stdout: typeof failure.stdout === 'string' ? failure.stdout : '',
      failure,
    };
  }
}

// `gh` also honours GH_TOKEN, so a token in the environment is enough when
// nobody is signed in. A number that is a pull request or does not exist is
// left out of the result and therefore keeps its capability pending.
export async function lookupIssueStatesWithGh(
  numbers,
  {
    repository = DEFAULT_REPOSITORY,
    execFile = promisify(execFileCallback),
  } = {},
) {
  const { stdout, failure } = await runGraphql(
    execFile,
    statesQuery(numbers, repository),
  );

  if (failure?.code === 'ENOENT') {
    throw new Error(
      'GitHub CLI (gh) was not found. Install it and sign in, or set GH_TOKEN for gh.',
    );
  }
  const repositoryData = parseRepositoryData(stdout);
  if (repositoryData === null) {
    const detail = (
      failure?.stderr ||
      failure?.message ||
      'unexpected response'
    )
      .toString()
      .trim();
    throw new Error(`Could not read issue states from GitHub: ${detail}`);
  }

  const states = new Map();
  for (const number of numbers) {
    const issue = repositoryData[`i${number}`];
    if (issue?.__typename === 'Issue') {
      states.set(number, {
        state: issue.state,
        stateReason: issue.stateReason ?? null,
      });
    }
  }
  return states;
}

export async function main({
  argv = process.argv.slice(2),
  readGrid = () => readFile(GRID_PATH, 'utf8'),
  lookupIssueStates = lookupIssueStatesWithGh,
  stdout = process.stdout,
  stderr = process.stderr,
  now = () => new Date(),
} = {}) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (argv.length > 0) {
    stderr.write(`${USAGE}\n`);
    return 2;
  }

  try {
    const rows = parseGrid(await readGrid());
    const numbers = [...new Set(rows.flatMap((row) => row.issues))].sort(
      (left, right) => left - right,
    );
    const issueStates =
      numbers.length > 0 ? await lookupIssueStates(numbers) : new Map();
    stdout.write(
      formatReport(evaluateGrid(rows, issueStates), { generatedAt: now() }),
    );
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
