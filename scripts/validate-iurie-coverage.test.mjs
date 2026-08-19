import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateIurieCoverage } from './validate-iurie-coverage.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const fixture = {
  questionBank: await readFile(
    resolve(repositoryRoot, 'docs/product/iurie-business-question-bank-ro.md'),
    'utf8',
  ),
  coverageMatrix: await readFile(
    resolve(repositoryRoot, 'docs/product/iurie-business-answer-coverage.md'),
    'utf8',
  ),
  sourceSnapshot: await readFile(
    resolve(
      repositoryRoot,
      'docs/product/evidence/iurie-business-interview-issue-81-comments.jsonl',
    ),
    'utf8',
  ),
};

function errorsFor(overrides = {}) {
  return validateIurieCoverage({ ...fixture, ...overrides }).errors.join('\n');
}

function matrixRow(contents, questionId) {
  return contents
    .split('\n')
    .find((line) => line.startsWith(`| ${questionId} |`));
}

function ledgerRow(contents, sourceOrder) {
  return contents
    .split('\n')
    .find((line) => line.startsWith(`| ${sourceOrder} |`));
}

test('accepts the real fixed-boundary coverage inventory', () => {
  assert.deepEqual(validateIurieCoverage(fixture).errors, []);
});

test('rejects a missing official question', () => {
  const row = matrixRow(fixture.coverageMatrix, 'S00-Q01');
  const coverageMatrix = fixture.coverageMatrix.replace(`${row}\n`, '');
  assert.match(
    errorsFor({ coverageMatrix }),
    /expected 278 official rows, found 277[\s\S]*missing official question S00-Q01/u,
  );
});

test('rejects a duplicate official question', () => {
  const row = matrixRow(fixture.coverageMatrix, 'S00-Q01');
  const coverageMatrix = fixture.coverageMatrix.replace(row, `${row}\n${row}`);
  assert.match(
    errorsFor({ coverageMatrix }),
    /duplicate official question S00-Q01/u,
  );
});

test('rejects an unknown source comment citation', () => {
  const coverageMatrix = fixture.coverageMatrix.replace(
    /#issuecomment-\d+/u,
    '#issuecomment-9999999999',
  );
  assert.match(
    errorsFor({ coverageMatrix }),
    /cites unknown source comment .*issuecomment-9999999999/u,
  );
});

test('rejects a duplicate session number without equating it to source order', () => {
  const records = fixture.sourceSnapshot
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
  const secondComment = records.find(
    ({ record_type: type, ordinal }) => type === 'comment' && ordinal === 2,
  );
  secondComment.body = secondComment.body.replace('Sesiunea 2', 'Sesiunea 1');
  const sourceSnapshot = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  assert.match(errorsFor({ sourceSnapshot }), /duplicate session number 1/u);
});

test('rejects a comment missing its body with an actionable diagnostic', () => {
  const records = fixture.sourceSnapshot
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
  const comment = records.find(
    ({ record_type: type, ordinal }) => type === 'comment' && ordinal === 1,
  );
  delete comment.body;
  const sourceSnapshot = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;

  assert.match(
    errorsFor({ sourceSnapshot }),
    /source ordinal 1 is missing author or body provenance/u,
  );
});

test('rejects substantive drift in pinned comment content', () => {
  const records = fixture.sourceSnapshot
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
  const comment = records.find(
    ({ record_type: type, ordinal }) => type === 'comment' && ordinal === 1,
  );
  comment.body +=
    '\nSubstantive drift that preserves IDs and session structure.';
  const sourceSnapshot = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;

  assert.match(
    errorsFor({ sourceSnapshot }),
    /pinned 104-comment author\/body content does not match the audited boundary/u,
  );
});

test('rejects a displayed summary total that differs from the rows', () => {
  const coverageMatrix = fixture.coverageMatrix.replace(
    /\| Fully covered semantically\s+\|\s+\d+\s+\|/u,
    '| Fully covered semantically                    |   999 |',
  );
  assert.match(
    errorsFor({ coverageMatrix }),
    /summary "Fully covered semantically" is 999, derived value is \d+/u,
  );
});

test('rejects an invalid provenance and status combination', () => {
  const row = matrixRow(fixture.coverageMatrix, 'S00-Q12');
  const invalidRow = row.replace(
    '| — | — | Not mapped |',
    '| Resolved | — | Not mapped |',
  );
  const coverageMatrix = fixture.coverageMatrix.replace(row, invalidRow);
  assert.match(
    errorsFor({ coverageMatrix }),
    /S00-Q12 is Not mapped but has source status/u,
  );
});

test('rejects source-declared status drift in an audited row', () => {
  const row = matrixRow(fixture.coverageMatrix, 'S00-Q01');
  const changedRow = row.replace(
    '| Resolved |',
    '| Contradicted and rejected |',
  );
  const coverageMatrix = fixture.coverageMatrix.replace(row, changedRow);

  assert.match(
    errorsFor({ coverageMatrix }),
    /pinned complete official-row audit content does not match the reviewed matrix/u,
  );
});

test('rejects an unknown ID in a published transition list', () => {
  const coverageMatrix = fixture.coverageMatrix.replace(
    'Not mapped to Full (21): S02-Q20,',
    'Not mapped to Full (21): S99-Q99,',
  );
  assert.match(
    errorsFor({ coverageMatrix }),
    /Not mapped to Full contains unknown official question S99-Q99/u,
  );
});

test('rejects blank mapped question and answer evidence', () => {
  const row = matrixRow(fixture.coverageMatrix, 'S00-Q01');
  const cells = row.split('|');
  const blankQuestion = [...cells];
  blankQuestion[9] = '';
  const blankAnswer = [...cells];
  blankAnswer[10] = '';

  assert.match(
    errorsFor({
      coverageMatrix: fixture.coverageMatrix.replace(
        row,
        blankQuestion.join('|'),
      ),
    }),
    /S00-Q01 is Full but has no question actually asked/u,
  );
  assert.match(
    errorsFor({
      coverageMatrix: fixture.coverageMatrix.replace(
        row,
        blankAnswer.join('|'),
      ),
    }),
    /S00-Q01 is Full but has no answer excerpt/u,
  );
});

test('rejects an unsupported extra published transition', () => {
  const coverageMatrix = fixture.coverageMatrix.replace(
    'State-changing official IDs:',
    'State-changing official IDs:\n\n- Full to Not covered (1): S00-Q01.',
  );
  assert.match(
    errorsFor({ coverageMatrix }),
    /unsupported published transition Full to Not covered/u,
  );
});

test('rejects status swaps that preserve aggregate totals', () => {
  const fullRow = matrixRow(fixture.coverageMatrix, 'S02-Q20');
  const partialRow = matrixRow(fixture.coverageMatrix, 'S02-Q01');
  const coverageMatrix = fixture.coverageMatrix
    .replace(fullRow, fullRow.replace('| Full |', '| Partial |'))
    .replace(partialRow, partialRow.replace('| Partial |', '| Full |'));

  assert.match(
    errorsFor({ coverageMatrix }),
    /Not mapped to Full differs from the pinned baseline/u,
  );
  assert.match(
    errorsFor({ coverageMatrix }),
    /Not mapped to Partial differs from the pinned baseline/u,
  );
});

test('rejects coordinated drift in the official question bank and matrix', () => {
  const questionBank = fixture.questionBank.replace(
    'S00-Q12 · P0',
    'S99-Q99 · P0',
  );
  const row = matrixRow(fixture.coverageMatrix, 'S00-Q12');
  const coverageMatrix = fixture.coverageMatrix.replace(
    row,
    row.replace('| S00-Q12 |', '| S99-Q99 |'),
  );

  assert.match(
    errorsFor({ questionBank, coverageMatrix }),
    /pinned official question-bank content does not match the audited baseline/u,
  );
});

test('rejects a valid but unrelated citation substituted into a row', () => {
  const sourceRow = matrixRow(fixture.coverageMatrix, 'S00-Q01');
  const unrelatedUrl = sourceRow.match(
    /https:\/\/github\.com\/Prisma-Prim\/PRISMA-PRIM-Suite\/issues\/81#issuecomment-\d+/u,
  )[0];
  const targetRow = matrixRow(fixture.coverageMatrix, 'S02-Q20');
  const changedTargetRow = targetRow.replace(
    /https:\/\/github\.com\/Prisma-Prim\/PRISMA-PRIM-Suite\/issues\/81#issuecomment-\d+/u,
    unrelatedUrl,
  );
  const coverageMatrix = fixture.coverageMatrix.replace(
    targetRow,
    changedTargetRow,
  );

  assert.match(
    errorsFor({ coverageMatrix }),
    /pinned official-row citation map does not match the audited provenance/u,
  );
});

test('rejects drift in supplemental-ledger descriptions', () => {
  const row = ledgerRow(fixture.coverageMatrix, 1);
  const cells = row.split('|');
  cells[3] = ' Incorrect topic ';
  cells[4] = ' 999–1000 ';
  cells[5] = ' Not confirmed ';
  const coverageMatrix = fixture.coverageMatrix.replace(row, cells.join('|'));

  assert.match(
    errorsFor({ coverageMatrix }),
    /pinned supplemental-ledger descriptive content does not match the audited inventory/u,
  );
});
