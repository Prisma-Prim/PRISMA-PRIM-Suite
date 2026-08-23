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
  sourceSnapshots: {
    historical: await readFile(
      resolve(
        repositoryRoot,
        'docs/product/evidence/iurie-business-interview-issue-81-comments.jsonl',
      ),
      'utf8',
    ),
    current: await readFile(
      resolve(
        repositoryRoot,
        'docs/product/evidence/iurie-business-interview-issue-81-comments-109-112-through-2026-08-23.jsonl',
      ),
      'utf8',
    ),
    base: await readFile(
      resolve(
        repositoryRoot,
        'docs/product/evidence/iurie-business-interview-issue-81-comments-through-2026-08-21.jsonl',
      ),
      'utf8',
    ),
  },
};

function errorsFor(overrides = {}) {
  const {
    historicalSnapshot,
    baseSnapshot,
    currentSnapshot,
    ...fixtureOverrides
  } = overrides;
  const sourceSnapshots = {
    historical:
      historicalSnapshot === undefined
        ? fixture.sourceSnapshots.historical
        : historicalSnapshot,
    base:
      baseSnapshot === undefined ? fixture.sourceSnapshots.base : baseSnapshot,
    current:
      currentSnapshot === undefined
        ? fixture.sourceSnapshots.current
        : currentSnapshot,
  };
  return validateIurieCoverage({
    ...fixture,
    ...fixtureOverrides,
    sourceSnapshots,
  }).errors.join('\n');
}

function rewriteSnapshot(contents, selectRecord, mutateRecord) {
  const records = contents
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
  const record = records.find(selectRecord);
  assert.ok(record, 'expected a matching snapshot record');
  mutateRecord(record);
  return `${records.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
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

test('accepts the historical snapshot and its 108-comment successor', () => {
  assert.deepEqual(validateIurieCoverage(fixture).errors, []);
});

test('normalizes checkout line endings before validating pinned artifacts', () => {
  const toCrlf = (contents) => contents.replaceAll('\n', '\r\n');
  assert.deepEqual(
    validateIurieCoverage({
      questionBank: toCrlf(fixture.questionBank),
      coverageMatrix: toCrlf(fixture.coverageMatrix),
      sourceSnapshots: {
        historical: toCrlf(fixture.sourceSnapshots.historical),
        base: toCrlf(fixture.sourceSnapshots.base),
        current: toCrlf(fixture.sourceSnapshots.current),
      },
    }).errors,
    [],
  );
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
  const baseSnapshot = rewriteSnapshot(
    fixture.sourceSnapshots.base,
    ({ record_type: type, ordinal }) => type === 'comment' && ordinal === 2,
    (comment) => {
      comment.body = comment.body.replace('Sesiunea 2', 'Sesiunea 1');
    },
  );
  assert.match(errorsFor({ baseSnapshot }), /duplicate session number 1/u);
});

test('rejects a comment missing its body with an actionable diagnostic', () => {
  const baseSnapshot = rewriteSnapshot(
    fixture.sourceSnapshots.base,
    ({ record_type: type, ordinal }) => type === 'comment' && ordinal === 1,
    (comment) => {
      delete comment.body;
    },
  );
  assert.match(
    errorsFor({ baseSnapshot }),
    /source ordinal 1 is missing author or body provenance/u,
  );
});

test('rejects substantive drift in pinned comment content', () => {
  const baseSnapshot = rewriteSnapshot(
    fixture.sourceSnapshots.base,
    ({ record_type: type, ordinal }) => type === 'comment' && ordinal === 1,
    (comment) => {
      comment.body +=
        '\nSubstantive drift that preserves IDs and session structure.';
    },
  );
  assert.match(
    errorsFor({ baseSnapshot }),
    /pinned 108-comment author\/body content does not match the audited boundary/u,
  );
});

test('rejects drift in the reproducible 104-comment predecessor', () => {
  const historicalSnapshot = rewriteSnapshot(
    fixture.sourceSnapshots.historical,
    ({ record_type: type, ordinal }) => type === 'comment' && ordinal === 1,
    (comment) => {
      comment.body += '\nHistorical boundary drift.';
    },
  );
  assert.match(
    errorsFor({ historicalSnapshot }),
    /pinned 104-comment author\/body content does not match the audited boundary/u,
  );
  assert.match(
    errorsFor({ historicalSnapshot }),
    /first 104 comments must exactly reproduce/u,
  );
});

test('rejects a missing recovered atomic item while preserving the gap', () => {
  const baseSnapshot = rewriteSnapshot(
    fixture.sourceSnapshots.base,
    ({ comment_id: id }) => id === 5373284576,
    (comment) => {
      comment.body = comment.body.replace(
        '### 702.',
        '### Recovered item 702.',
      );
    },
  );
  assert.match(
    errorsFor({ baseSnapshot }),
    /missing recovered atomic item\(s\): 702/u,
  );
});

test('rejects one recovered item claimed by two source comments', () => {
  const baseSnapshot = rewriteSnapshot(
    fixture.sourceSnapshots.base,
    ({ comment_id: id }) => id === 5373293702,
    (comment) => {
      comment.body += '\n## 705 — duplicated recovered claim';
    },
  );
  assert.match(
    errorsFor({ baseSnapshot }),
    /recovered atomic item 705 must occur only in comment 5373291180/u,
  );
});

test('rejects fabrication of an atomic item inside a consolidated-only gap', () => {
  const baseSnapshot = rewriteSnapshot(
    fixture.sourceSnapshots.base,
    ({ comment_id: id }) => id === 5366189353,
    (comment) => {
      comment.body += '\n### 526. Fabricated atomic wording';
    },
  );
  assert.match(
    errorsFor({ baseSnapshot }),
    /found unsupported recovered atomic item\(s\): 526/u,
  );
});

test('rejects successor metadata that points to a different predecessor', () => {
  const baseSnapshot = rewriteSnapshot(
    fixture.sourceSnapshots.base,
    ({ record_type: type }) => type === 'snapshot',
    (metadata) => {
      metadata.predecessor_comment_count = 103;
    },
  );
  assert.match(
    errorsFor({ baseSnapshot }),
    /snapshot predecessor_comment_count must be 104/u,
  );
});

test('rejects promotion of the pinned evidence-only snapshot metadata', () => {
  const baseSnapshot = rewriteSnapshot(
    fixture.sourceSnapshots.base,
    ({ record_type: type }) => type === 'snapshot',
    (metadata) => {
      metadata.authority_status = 'canonical approved product authority';
    },
  );
  assert.match(
    errorsFor({ baseSnapshot }),
    /pinned complete snapshot metadata does not match the evidence-only authority boundary/u,
  );
});

test('rejects semantic fields added to a raw comment record', () => {
  const baseSnapshot = rewriteSnapshot(
    fixture.sourceSnapshots.base,
    ({ record_type: type, ordinal }) => type === 'comment' && ordinal === 1,
    (comment) => {
      comment.authority_status = 'canonical approved product rule';
    },
  );
  assert.match(
    errorsFor({ baseSnapshot }),
    /pinned complete comment-record schema and content do not match the verbatim evidence boundary/u,
  );
});

test('fails once when the required snapshot pair is absent', () => {
  const result = validateIurieCoverage({
    questionBank: fixture.questionBank,
    coverageMatrix: fixture.coverageMatrix,
    sourceSnapshots: { historical: fixture.sourceSnapshots.historical },
  });
  assert.deepEqual(result.errors, [
    'Iurie evidence validation requires sourceSnapshots.historical, sourceSnapshots.base and sourceSnapshots.current string contents',
  ]);
});

test('rejects drift in the matrix authority declarations', () => {
  const coverageMatrix = fixture.coverageMatrix.replace(
    'They do not approve business rules',
    'They approve business rules',
  );
  assert.match(
    errorsFor({ coverageMatrix }),
    /expected exactly one pinned evidence-only authority declaration/u,
  );
});

test('rejects contradictory authority prose in the matrix preamble', () => {
  const coverageMatrix = fixture.coverageMatrix.replace(
    '## 3. Official question-bank matrix',
    'This audit is an approved product authority.\n\n## 3. Official question-bank matrix',
  );
  assert.match(
    errorsFor({ coverageMatrix }),
    /pinned coverage-summary and authority preamble does not match the reviewed audit/u,
  );
});

test('rejects contradictory authority prose outside the matrix preamble', () => {
  const coverageMatrix = fixture.coverageMatrix.replace(
    '## 5. Confirmed evidence safe to normalize',
    'This matrix is the sole approved product authority.\n\n## 5. Confirmed evidence safe to normalize',
  );
  assert.match(
    errorsFor({ coverageMatrix }),
    /pinned complete matrix content does not match the reviewed evidence audit/u,
  );
});

test('rejects drift in the official matrix header', () => {
  const coverageMatrix = fixture.coverageMatrix.replace(
    '| Evidence authority |',
    '| Approved product rule |',
  );
  assert.match(
    errorsFor({ coverageMatrix }),
    /official-matrix header differs from the pinned audit schema/u,
  );
});

test('rejects a different prior published audit baseline', () => {
  const coverageMatrix = fixture.coverageMatrix
    .replaceAll(
      '1e5965f13f7d889ddab1751a2266479c04d1b3d8',
      '0000000000000000000000000000000000000000',
    )
    .replaceAll('1e5965f…', '0000000…');
  assert.match(
    errorsFor({ coverageMatrix }),
    /prior published audit baseline must be 1e5965f13f7d889ddab1751a2266479c04d1b3d8/u,
  );
});

test('rejects a fabricated row in the official matrix', () => {
  const row = matrixRow(fixture.coverageMatrix, 'S00-Q01');
  const fabricated = row.replace('| S00-Q01 |', '| TYPO-Q999 |');
  const coverageMatrix = fixture.coverageMatrix.replace(
    row,
    `${fabricated}\n${row}`,
  );
  assert.match(
    errorsFor({ coverageMatrix }),
    /invalid official question identifier "TYPO-Q999"/u,
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
  const row = matrixRow(fixture.coverageMatrix, 'S01-Q03');
  const invalidRow = row.replace(
    '| — | — | Not mapped |',
    '| Resolved | — | Not mapped |',
  );
  const coverageMatrix = fixture.coverageMatrix.replace(row, invalidRow);
  assert.match(
    errorsFor({ coverageMatrix }),
    /S01-Q03 is Not mapped but has source status/u,
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
    /Not mapped to Partial \((\d+)\): S01-Q02,/u,
    'Not mapped to Partial ($1): S99-Q99,',
  );
  assert.match(
    errorsFor({ coverageMatrix }),
    /Not mapped to Partial contains unknown official question S99-Q99/u,
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
  const recoveredRow = matrixRow(fixture.coverageMatrix, 'S09-Q06');
  const fullRow = matrixRow(fixture.coverageMatrix, 'S02-Q20');
  const coverageMatrix = fixture.coverageMatrix
    .replace(recoveredRow, recoveredRow.replace('| Partial |', '| Full |'))
    .replace(fullRow, fullRow.replace('| Full |', '| Partial |'));

  assert.match(
    errorsFor({ coverageMatrix }),
    /Not mapped to Full differs from the pinned prior audit/u,
  );
  assert.match(
    errorsFor({ coverageMatrix }),
    /Not mapped to Partial differs from the pinned prior audit/u,
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

test('rejects a malformed official-question candidate', () => {
  const questionBank = fixture.questionBank.replace(
    '1. **S00-Q01 · P0**',
    '999. **TYPO-Q999 · P0** — Fabricated question?\n1. **S00-Q01 · P0**',
  );
  assert.match(
    errorsFor({ questionBank }),
    /malformed official-question entry/u,
  );
});

test('rejects unrecognized content added to the official question bank', () => {
  const questionBank = `${fixture.questionBank}\n999. S99-Q99 - Fabricated official question`;
  assert.match(
    errorsFor({ questionBank }),
    /pinned complete question-bank artifact does not match the reviewed source/u,
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

test('rejects a malformed supplemental-ledger source order', () => {
  const row = ledgerRow(fixture.coverageMatrix, 1);
  const fabricated = row.replace('| 1 |', '| TYPO |');
  const coverageMatrix = fixture.coverageMatrix.replace(
    row,
    `${fabricated}\n${row}`,
  );
  assert.match(
    errorsFor({ coverageMatrix }),
    /invalid supplemental-ledger source order "TYPO"/u,
  );
});
