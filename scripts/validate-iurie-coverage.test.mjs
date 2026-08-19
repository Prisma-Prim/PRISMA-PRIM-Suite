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
