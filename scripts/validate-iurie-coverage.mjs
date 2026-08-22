#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CURRENT_SOURCE_COMMENT_COUNT,
  CURRENT_SOURCE_SNAPSHOT_PATH,
  HISTORICAL_SOURCE_SNAPSHOT_PATH,
  validateIurieEvidenceSnapshots,
} from './validate-iurie-evidence-snapshots.mjs';
import {
  canonicalRecordsHash,
  duplicates,
  normalizeLineEndings,
} from './validation-helpers.mjs';

const QUESTION_BANK_PATH = 'docs/product/iurie-business-question-bank-ro.md';
const COVERAGE_MATRIX_PATH = 'docs/product/iurie-business-answer-coverage.md';
const EXPECTED_QUESTION_COUNT = 278;
const EXPECTED_QUESTION_BANK_CONTENT_SHA256 =
  '0bc9216d41ac27b5613c2a2c997accfa2216fc68447c5753fcd0230a42cb5d8e';
const EXPECTED_COMPLETE_QUESTION_BANK_SHA256 =
  '7e58e52c75cc96a27273be2208479b119077f74ca86eb3c7eb66d69f17fc9da3';
const EXPECTED_ROW_CITATION_MAP_SHA256 =
  '5b7f4b08937bdcb43166f575e6bee9f14967bd30b1a000c8f4ddbcc9696fe72b';
const EXPECTED_OFFICIAL_ROW_AUDIT_SHA256 =
  '712f6157d1d805995908961490a805d9e5c90f90a5f9cf2d360cd6def29b93f8';
const EXPECTED_LEDGER_CONTENT_SHA256 =
  'f30af29fdcaeaaf510a6e831bc05707127cf0e56afaff47c111cf99b77e1c492';
const EXPECTED_MATRIX_PREAMBLE_SHA256 =
  '8101c72cf40118d8aebb4f1adea8a1eb50030b1b07d62cb332675c99bb16fb93';
const EXPECTED_COMPLETE_MATRIX_SHA256 =
  '955f7fadb2f8518ec8eb637494e975028fcfa3f9f6d3e9f621d094f6e6933a01';
const EXPECTED_PRIOR_AUDIT_BASELINE =
  '1e5965f13f7d889ddab1751a2266479c04d1b3d8';
const EXPECTED_HISTORICAL_IMPLEMENTATION_BASELINE =
  'f292bb0d784678537c955895d3027e8026cd2fad';
const EXPECTED_MATRIX_AUTHORITY_DECLARATIONS = [
  '**Authority boundary:** This file maps evidence. It does not turn agent interpretation, examples, narrow reformulations or weak confirmations into approved product behaviour.',
  'The resulting states are evidence classifications only. They do not approve business rules, Product readiness, enforcement behavior or implementation scope.',
  'No row promotion in this audit approves Product readiness, permissions, enforcement, legal classification or implementation scope.',
  'Implementation issues must cite the updated canonical PRD, not this matrix or a raw interview comment as their sole behavioural authority.',
];

const ALLOWED_SEMANTIC_COVERAGE = new Set([
  'Full',
  'Partial',
  'Not covered',
  'Not mapped',
]);
const ALLOWED_EVIDENCE_AUTHORITIES = new Set([
  'Direct or faithfully paraphrased Iurie response',
  'Agent-framed proposition explicitly accepted by Iurie',
  'Interpretation requiring normalization',
  'Delegated to interviewer/agents',
]);
const SUMMARY_LABELS = {
  official: 'Official questions in the bank',
  full: 'Fully covered semantically',
  partial: 'Partially covered semantically',
  notCovered: 'Official ID attached but question not covered',
  notMapped: 'Not atomically mapped by official ID',
  comments: 'Source comments inspected',
};
const PRIOR_PUBLISHED_SEMANTIC_IDS = {
  Full: new Set([
    'S00-Q01',
    'S00-Q02',
    'S00-Q08',
    'S00-Q10',
    'S00-Q11',
    'S00-Q13',
    'S00-Q14',
    'S00-Q15',
    'S01-Q10',
    'S01-Q12',
    'S02-Q08',
    'S02-Q09',
    'S02-Q20',
    'S02-Q21',
    'S03-Q01',
    'S03-Q04',
    'S03-Q06',
    'S03-Q08',
    'S03-Q09',
    'S06-Q12',
    'S06-Q13',
    'S06-Q55',
    'S07-Q17',
    'S08-Q01',
    'S08-Q02',
    'S08-Q11',
    'S09-Q01',
    'S09-Q10',
    'S09-Q11',
    'S09-Q13',
    'S10-Q02',
    'S10-Q03',
    'S10-Q09',
    'S10-Q10',
    'S11-Q02',
    'S11-Q03',
  ]),
  Partial: new Set([
    'S00-Q03',
    'S00-Q04',
    'S00-Q05',
    'S00-Q06',
    'S00-Q07',
    'S00-Q09',
    'S01-Q01',
    'S01-Q04',
    'S01-Q05',
    'S01-Q06',
    'S01-Q08',
    'S01-Q09',
    'S01-Q11',
    'S01-Q13',
    'S01-Q14',
    'S01-Q15',
    'S01-Q16',
    'S02-Q01',
    'S02-Q02',
    'S02-Q07',
    'S02-Q10',
    'S02-Q11',
    'S02-Q12',
    'S02-Q14',
    'S02-Q15',
    'S02-Q16',
    'S02-Q18',
    'S02-Q22',
    'S03-Q02',
    'S03-Q03',
    'S03-Q05',
    'S03-Q07',
    'S03-Q10',
    'S03-Q11',
    'S03-Q12',
    'S03-Q14',
    'S03-Q15',
    'S03-Q16',
    'S04-Q01',
    'S04-Q08',
    'S04-Q09',
    'S04-Q10',
    'S04-Q11',
    'S04-Q12',
    'S04-Q13',
    'S04-Q14',
    'S04-Q15',
    'S04-Q16',
    'S04-Q20',
    'S04-Q23',
    'S04-Q25',
    'S04-Q27',
    'S04-Q28',
    'S04-Q30',
    'S04-Q31',
    'S04-Q32',
    'S04-Q33',
    'S04-Q38',
    'S04-Q40',
    'S04-Q41',
    'S04-Q42',
    'S05-Q10',
    'S05-Q12',
    'S05-Q17',
    'S05-Q19',
    'S06-Q01',
    'S06-Q02',
    'S06-Q06',
    'S06-Q21',
    'S06-Q29',
    'S06-Q32',
    'S06-Q33',
    'S06-Q34',
    'S06-Q36',
    'S06-Q40',
    'S06-Q42',
    'S06-Q44',
    'S06-Q46',
    'S06-Q50',
    'S06-Q52',
    'S06-Q54',
    'S07-Q01',
    'S07-Q06',
    'S07-Q12',
    'S07-Q13',
    'S07-Q16',
    'S07-Q19',
    'S07-Q21',
    'S07-Q23',
    'S07-Q24',
    'S07-Q25',
    'S08-Q03',
    'S08-Q06',
    'S08-Q13',
    'S08-Q14',
    'S09-Q02',
    'S09-Q03',
    'S09-Q07',
    'S09-Q08',
    'S09-Q09',
    'S09-Q12',
    'S09-Q14',
    'S09-Q15',
    'S10-Q04',
    'S10-Q06',
    'S10-Q08',
    'S10-Q12',
    'S10-Q13',
    'S10-Q15',
    'S11-Q01',
    'S11-Q04',
    'S11-Q05',
    'S11-Q09',
    'S11-Q11',
    'S11-Q13',
    'S11-Q15',
    'S11-Q16',
    'S11-Q18',
  ]),
  'Not covered': new Set(['S02-Q13']),
};
const TRANSITION_LABELS = ['Not mapped to Partial'];
const OFFICIAL_MATRIX_HEADER = [
  'Question',
  'Priority',
  'Official wording',
  'Source-declared status',
  'Evidence authority',
  'Semantic coverage',
  'Audit rationale',
  'Provenance',
  'Question actually asked',
  'Iurie answer excerpt',
];
const OFFICIAL_MATRIX_SEPARATOR = Array(10).fill('---');
const LEDGER_HEADER = [
  'Source order',
  'Provenance',
  'Session/topic',
  'Independent item range',
  'Source status notation',
];
const LEDGER_SEPARATOR = ['---:', '---', '---', '---', '---'];

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;

  const cells = [];
  let cell = '';
  let escaped = false;
  for (const character of trimmed.slice(1, -1)) {
    if (character === '|' && !escaped) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
    escaped = character === '\\' && !escaped;
    if (character !== '\\') escaped = false;
  }
  cells.push(cell.trim());
  return cells;
}

function parseQuestionBank(contents, errors) {
  const completeQuestionBankHash = createHash('sha256')
    .update(contents)
    .digest('hex');
  if (completeQuestionBankHash !== EXPECTED_COMPLETE_QUESTION_BANK_SHA256) {
    errors.push(
      `${QUESTION_BANK_PATH}: pinned complete question-bank artifact does not match the reviewed source`,
    );
  }
  const questions = [];
  for (const [index, line] of contents.split('\n').entries()) {
    const match = line.match(
      /^\d+\.\s+\*\*(S\d{2}-Q\d{2}) · (P[012])\*\*\s+—\s+(.+)$/u,
    );
    if (!match) {
      if (/^\d+\.\s+\*\*/u.test(line)) {
        errors.push(
          `${QUESTION_BANK_PATH}:${index + 1}: malformed official-question entry`,
        );
      }
      continue;
    }
    questions.push({
      id: match[1],
      priority: match[2],
      wording: match[3],
      line: index + 1,
    });
  }

  if (questions.length !== EXPECTED_QUESTION_COUNT) {
    errors.push(
      `${QUESTION_BANK_PATH}: expected ${EXPECTED_QUESTION_COUNT} official questions, found ${questions.length}`,
    );
  }
  for (const id of duplicates(questions.map(({ id }) => id))) {
    errors.push(`${QUESTION_BANK_PATH}: duplicate official question ${id}`);
  }
  const questionBankHash = canonicalRecordsHash(
    questions.map(({ id, priority, wording }) => [id, priority, wording]),
  );
  if (questionBankHash !== EXPECTED_QUESTION_BANK_CONTENT_SHA256) {
    errors.push(
      `${QUESTION_BANK_PATH}: pinned official question-bank content does not match the audited baseline`,
    );
  }
  return questions;
}

function parseMatrix(contents, errors) {
  const rows = [];
  const ledger = [];
  let section = '';
  let matrixHeaderCount = 0;
  let matrixSeparatorCount = 0;
  let ledgerHeaderCount = 0;
  let ledgerSeparatorCount = 0;

  for (const [index, line] of contents.split('\n').entries()) {
    if (line.startsWith('## 3. ')) section = 'matrix';
    if (line.startsWith('## 4. ')) section = 'ledger';
    if (line.startsWith('## 4.1 ')) section = '';
    if (line.startsWith('## 5. ')) section = '';

    const cells = splitMarkdownRow(line);
    if (!cells) continue;
    if (section === 'matrix') {
      const identifier = cells[0] ?? '';
      if (identifier === 'Question') {
        matrixHeaderCount += 1;
        if (JSON.stringify(cells) !== JSON.stringify(OFFICIAL_MATRIX_HEADER)) {
          errors.push(
            `${COVERAGE_MATRIX_PATH}:${index + 1}: official-matrix header differs from the pinned audit schema`,
          );
        }
        continue;
      }
      if (/^:?-+:?$/u.test(identifier)) {
        matrixSeparatorCount += 1;
        if (
          JSON.stringify(cells) !== JSON.stringify(OFFICIAL_MATRIX_SEPARATOR)
        ) {
          errors.push(
            `${COVERAGE_MATRIX_PATH}:${index + 1}: official-matrix delimiter differs from the pinned audit schema`,
          );
        }
        continue;
      }
      if (cells.length !== 10) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}:${index + 1}: expected 10 official-matrix columns, found ${cells.length}`,
        );
        continue;
      }
      if (!/^S\d{2}-Q\d{2}$/u.test(identifier)) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}:${index + 1}: invalid official question identifier ${JSON.stringify(identifier)}`,
        );
        continue;
      }
      rows.push({
        id: identifier,
        priority: cells[1],
        wording: cells[2],
        sourceStatus: cells[3],
        authority: cells[4],
        semantic: cells[5],
        rationale: cells[6],
        provenance: cells[7],
        asked: cells[8],
        answer: cells[9],
        line: index + 1,
      });
    }
    if (section === 'ledger') {
      const sourceOrder = cells[0] ?? '';
      if (sourceOrder === 'Source order') {
        ledgerHeaderCount += 1;
        if (JSON.stringify(cells) !== JSON.stringify(LEDGER_HEADER)) {
          errors.push(
            `${COVERAGE_MATRIX_PATH}:${index + 1}: supplemental-ledger header differs from the pinned audit schema`,
          );
        }
        continue;
      }
      if (/^:?-+:?$/u.test(sourceOrder)) {
        ledgerSeparatorCount += 1;
        if (JSON.stringify(cells) !== JSON.stringify(LEDGER_SEPARATOR)) {
          errors.push(
            `${COVERAGE_MATRIX_PATH}:${index + 1}: supplemental-ledger delimiter differs from the pinned audit schema`,
          );
        }
        continue;
      }
      if (cells.length !== 5) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}:${index + 1}: expected 5 supplemental-ledger columns, found ${cells.length}`,
        );
        continue;
      }
      if (!/^\d+$/u.test(sourceOrder)) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}:${index + 1}: invalid supplemental-ledger source order ${JSON.stringify(sourceOrder)}`,
        );
        continue;
      }
      ledger.push({
        order: Number(sourceOrder),
        provenance: cells[1],
        sessionTopic: cells[2],
        itemRange: cells[3],
        sourceStatus: cells[4],
        line: index + 1,
      });
    }
  }
  for (const [label, count] of [
    ['official-matrix header', matrixHeaderCount],
    ['official-matrix delimiter', matrixSeparatorCount],
    ['supplemental-ledger header', ledgerHeaderCount],
    ['supplemental-ledger delimiter', ledgerSeparatorCount],
  ]) {
    if (count !== 1) {
      errors.push(`${COVERAGE_MATRIX_PATH}: expected exactly one ${label}`);
    }
  }
  return { rows, ledger };
}

function citedUrls(contents) {
  return [
    ...contents.matchAll(
      /\]\((https:\/\/github\.com\/Prisma-Prim\/PRISMA-PRIM-Suite\/issues\/81#issuecomment-\d+)\)/gu,
    ),
  ].map((match) => match[1]);
}

function priorPublishedSemanticState(questions, errors) {
  const questionIds = new Set(questions.map(({ id }) => id));
  const baseline = new Map(questions.map(({ id }) => [id, 'Not mapped']));
  const assigned = new Set();

  for (const [semantic, ids] of Object.entries(PRIOR_PUBLISHED_SEMANTIC_IDS)) {
    for (const id of ids) {
      if (!questionIds.has(id)) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}: pinned prior audit contains unknown official question ${id}`,
        );
      }
      if (assigned.has(id)) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}: pinned prior audit assigns ${id} more than once`,
        );
      }
      assigned.add(id);
      baseline.set(id, semantic);
    }
  }

  return baseline;
}

function parsePublishedTransitions(contents, errors) {
  const transitions = new Map();
  let inDeltaSection = false;

  for (const [index, line] of contents.split('\n').entries()) {
    if (line.startsWith('## 2.1 ')) {
      inDeltaSection = true;
      continue;
    }
    if (inDeltaSection && line.startsWith('## 3. ')) break;
    if (!inDeltaSection) continue;

    const match = line.match(
      /^- ((?:Full|Partial|Not covered|Not mapped) to (?:Full|Partial|Not covered|Not mapped)) \((\d+)\): (.+)\.$/u,
    );
    if (!match) continue;

    const [, label, displayedCount, list] = match;
    if (!TRANSITION_LABELS.includes(label)) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}:${index + 1}: unsupported published transition ${label}`,
      );
      continue;
    }
    if (transitions.has(label)) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}:${index + 1}: duplicate transition list ${label}`,
      );
      continue;
    }
    const ids = list.split(',').map((id) => id.trim());
    if (Number(displayedCount) !== ids.length) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}:${index + 1}: ${label} declares ${displayedCount} IDs but lists ${ids.length}`,
      );
    }
    for (const id of duplicates(ids)) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}:${index + 1}: ${label} repeats ${id}`,
      );
    }
    transitions.set(label, { ids: new Set(ids), line: index + 1 });
  }

  for (const label of TRANSITION_LABELS) {
    if (!transitions.has(label)) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}: missing published transition list ${label}`,
      );
    }
  }
  return transitions;
}

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value));
}

function validateSemanticDelta({ contents, questions, rows }, errors) {
  const baseline = priorPublishedSemanticState(questions, errors);
  const current = new Map(rows.map(({ id, semantic }) => [id, semantic]));
  const derived = new Map(TRANSITION_LABELS.map((label) => [label, new Set()]));

  for (const question of questions) {
    const before = baseline.get(question.id);
    const after = current.get(question.id);
    if (!after || before === after) continue;
    const label = `${before} to ${after}`;
    const transition = derived.get(label);
    if (!transition) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}: unsupported semantic transition ${question.id}: ${before} to ${after}`,
      );
      continue;
    }
    transition.add(question.id);
  }

  const published = parsePublishedTransitions(contents, errors);
  const officialIds = new Set(questions.map(({ id }) => id));
  const publishedOwners = new Map();

  for (const label of TRANSITION_LABELS) {
    const entry = published.get(label);
    if (!entry) continue;
    for (const id of entry.ids) {
      if (!officialIds.has(id)) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}:${entry.line}: ${label} contains unknown official question ${id}`,
        );
      }
      const priorOwner = publishedOwners.get(id);
      if (priorOwner) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}:${entry.line}: ${id} appears in both ${priorOwner} and ${label}`,
        );
      }
      publishedOwners.set(id, label);
    }

    const missing = setDifference(derived.get(label), entry.ids);
    const unexpected = setDifference(entry.ids, derived.get(label));
    if (missing.length > 0 || unexpected.length > 0) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}:${entry.line}: ${label} differs from the pinned prior audit; missing [${missing.join(', ')}], unexpected [${unexpected.join(', ')}]`,
      );
    }
  }

  const baselineCounts = Object.fromEntries(
    [...ALLOWED_SEMANTIC_COVERAGE].map((semantic) => [
      semantic,
      [...baseline.values()].filter((value) => value === semantic).length,
    ]),
  );
  const currentCounts = Object.fromEntries(
    [...ALLOWED_SEMANTIC_COVERAGE].map((semantic) => [
      semantic,
      [...current.values()].filter((value) => value === semantic).length,
    ]),
  );
  const deltaRows = new Map();
  let inDeltaSection = false;
  for (const [index, line] of contents.split('\n').entries()) {
    if (line.startsWith('## 2.1 ')) {
      inDeltaSection = true;
      continue;
    }
    if (inDeltaSection && line.startsWith('## 3. ')) break;
    if (!inDeltaSection) continue;
    const cells = splitMarkdownRow(line);
    if (
      cells?.length === 4 &&
      [...ALLOWED_SEMANTIC_COVERAGE, 'Total official rows'].includes(cells[0])
    ) {
      deltaRows.set(cells[0], { cells, line: index + 1 });
    }
  }

  const expectedRows = new Map(
    [...ALLOWED_SEMANTIC_COVERAGE].map((semantic) => [
      semantic,
      [
        baselineCounts[semantic],
        currentCounts[semantic],
        currentCounts[semantic] - baselineCounts[semantic],
      ],
    ]),
  );
  expectedRows.set('Total official rows', [
    questions.length,
    rows.length,
    rows.length - questions.length,
  ]);

  for (const [label, expected] of expectedRows) {
    const entry = deltaRows.get(label);
    if (!entry) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}: missing semantic delta row ${label}`,
      );
      continue;
    }
    const actual = entry.cells.slice(1).map((value) => Number(value));
    if (
      actual.some((value) => !Number.isInteger(value)) ||
      actual.some((value, index) => value !== expected[index])
    ) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}:${entry.line}: ${label} delta row is [${entry.cells.slice(1).join(', ')}], derived value is [${expected.join(', ')}]`,
      );
    }
  }

  const expectedChangedIds = [...derived.values()].reduce(
    (count, ids) => count + ids.size,
    0,
  );
  const declaredChangedIds = contents.match(
    /contains? (\d+) state-changing official IDs in total\./u,
  );
  if (Number(declaredChangedIds?.[1]) !== expectedChangedIds) {
    errors.push(
      `${COVERAGE_MATRIX_PATH}: declared state-changing ID total is ${JSON.stringify(declaredChangedIds?.[1])}, derived value is ${expectedChangedIds}`,
    );
  }
}

function validateMatrix({ contents, questions, comments }, errors) {
  const completeMatrixHash = createHash('sha256')
    .update(contents)
    .digest('hex');
  if (completeMatrixHash !== EXPECTED_COMPLETE_MATRIX_SHA256) {
    errors.push(
      `${COVERAGE_MATRIX_PATH}: pinned complete matrix content does not match the reviewed evidence audit`,
    );
  }
  const preamble = contents.split('\n## 3. ')[0]?.trimEnd() ?? '';
  if (canonicalRecordsHash([preamble]) !== EXPECTED_MATRIX_PREAMBLE_SHA256) {
    errors.push(
      `${COVERAGE_MATRIX_PATH}: pinned coverage-summary and authority preamble does not match the reviewed audit`,
    );
  }
  for (const declaration of EXPECTED_MATRIX_AUTHORITY_DECLARATIONS) {
    const occurrences = contents.split(declaration).length - 1;
    if (occurrences !== 1) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}: expected exactly one pinned evidence-only authority declaration ${JSON.stringify(declaration)}`,
      );
    }
  }
  const priorAuditBaseline = contents.match(
    /^\*\*Prior published audit baseline:\*\* `([0-9a-f]{40})`/mu,
  );
  if (priorAuditBaseline?.[1] !== EXPECTED_PRIOR_AUDIT_BASELINE) {
    errors.push(
      `${COVERAGE_MATRIX_PATH}: prior published audit baseline must be ${EXPECTED_PRIOR_AUDIT_BASELINE}`,
    );
  }
  const historicalImplementationBaseline = contents.match(
    /^\*\*Historical implementation baseline:\*\* `([0-9a-f]{40})`/mu,
  );
  if (
    historicalImplementationBaseline?.[1] !==
    EXPECTED_HISTORICAL_IMPLEMENTATION_BASELINE
  ) {
    errors.push(
      `${COVERAGE_MATRIX_PATH}: historical implementation baseline must be ${EXPECTED_HISTORICAL_IMPLEMENTATION_BASELINE}`,
    );
  }

  const { rows, ledger } = parseMatrix(contents, errors);
  const bankById = new Map(
    questions.map((question) => [question.id, question]),
  );
  const commentUrls = new Set(comments.map(({ url }) => url));

  if (rows.length !== EXPECTED_QUESTION_COUNT) {
    errors.push(
      `${COVERAGE_MATRIX_PATH}: expected ${EXPECTED_QUESTION_COUNT} official rows, found ${rows.length}`,
    );
  }
  for (const id of duplicates(rows.map(({ id }) => id))) {
    errors.push(`${COVERAGE_MATRIX_PATH}: duplicate official question ${id}`);
  }
  const rowIds = new Set(rows.map(({ id }) => id));
  for (const question of questions) {
    if (!rowIds.has(question.id)) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}: missing official question ${question.id}`,
      );
    }
  }

  for (const row of rows) {
    const bank = bankById.get(row.id);
    if (!bank) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}:${row.line}: unknown official question ${row.id}`,
      );
    } else {
      if (row.priority !== bank.priority) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}:${row.line}: ${row.id} priority differs from the official bank`,
        );
      }
      if (row.wording !== bank.wording) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}:${row.line}: ${row.id} wording differs from the official bank`,
        );
      }
    }

    if (!ALLOWED_SEMANTIC_COVERAGE.has(row.semantic)) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}:${row.line}: ${row.id} has invalid semantic coverage ${JSON.stringify(row.semantic)}`,
      );
      continue;
    }

    const urls = citedUrls(row.provenance);
    for (const url of urls) {
      if (!commentUrls.has(url)) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}:${row.line}: ${row.id} cites unknown source comment ${url}`,
        );
      }
    }

    if (row.semantic === 'Not mapped') {
      const mappedFields = [
        ['source status', row.sourceStatus],
        ['evidence authority', row.authority],
        ['provenance', row.provenance],
        ['question actually asked', row.asked],
        ['answer excerpt', row.answer],
      ].filter(([, value]) => value !== '—');
      for (const [field] of mappedFields) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}:${row.line}: ${row.id} is Not mapped but has ${field}`,
        );
      }
    } else {
      if (row.sourceStatus === '' || row.sourceStatus === '—') {
        errors.push(
          `${COVERAGE_MATRIX_PATH}:${row.line}: ${row.id} is ${row.semantic} but has no source-declared status`,
        );
      }
      if (!ALLOWED_EVIDENCE_AUTHORITIES.has(row.authority)) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}:${row.line}: ${row.id} has invalid evidence authority ${JSON.stringify(row.authority)}`,
        );
      }
      if (urls.length === 0) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}:${row.line}: ${row.id} is ${row.semantic} but has no source-comment citation`,
        );
      }
      for (const [field, value] of [
        ['question actually asked', row.asked],
        ['answer excerpt', row.answer],
      ]) {
        if (value === '' || value === '—') {
          errors.push(
            `${COVERAGE_MATRIX_PATH}:${row.line}: ${row.id} is ${row.semantic} but has no ${field}`,
          );
        }
      }
    }
  }

  const citationMapHash = canonicalRecordsHash(
    rows
      .map((row) => [row.id, [...new Set(citedUrls(row.provenance))].sort()])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  if (citationMapHash !== EXPECTED_ROW_CITATION_MAP_SHA256) {
    errors.push(
      `${COVERAGE_MATRIX_PATH}: pinned official-row citation map does not match the audited provenance`,
    );
  }
  const officialRowAuditHash = canonicalRecordsHash(
    rows
      .map((row) => [
        row.id,
        row.priority,
        row.wording,
        row.sourceStatus,
        row.authority,
        row.semantic,
        row.rationale,
        row.provenance,
        row.asked,
        row.answer,
      ])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  if (officialRowAuditHash !== EXPECTED_OFFICIAL_ROW_AUDIT_SHA256) {
    errors.push(
      `${COVERAGE_MATRIX_PATH}: pinned complete official-row audit content does not match the reviewed matrix`,
    );
  }

  validateSemanticDelta({ contents, questions, rows }, errors);

  if (ledger.length !== CURRENT_SOURCE_COMMENT_COUNT) {
    errors.push(
      `${COVERAGE_MATRIX_PATH}: expected ${CURRENT_SOURCE_COMMENT_COUNT} supplemental-ledger rows, found ${ledger.length}`,
    );
  }
  for (const [index, entry] of ledger.entries()) {
    const expectedOrder = index + 1;
    if (entry.order !== expectedOrder) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}:${entry.line}: expected source order ${expectedOrder}, found ${entry.order}`,
      );
    }
    const urls = citedUrls(entry.provenance);
    const expectedUrl = comments[index]?.url;
    if (urls.length !== 1 || urls[0] !== expectedUrl) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}:${entry.line}: source order ${entry.order} must pin ${expectedUrl ?? 'a known comment'}`,
      );
    }
  }
  const ledgerHash = canonicalRecordsHash(
    ledger.map((entry, index) => [
      entry.order,
      comments[index]?.url,
      entry.sessionTopic,
      entry.itemRange,
      entry.sourceStatus,
    ]),
  );
  if (ledgerHash !== EXPECTED_LEDGER_CONTENT_SHA256) {
    errors.push(
      `${COVERAGE_MATRIX_PATH}: pinned supplemental-ledger descriptive content does not match the audited inventory`,
    );
  }

  const summary = new Map();
  for (const line of contents.split('\n')) {
    const cells = splitMarkdownRow(line);
    if (cells?.length !== 2 || !/^\d+$/u.test(cells[1])) continue;
    summary.set(cells[0], Number(cells[1]));
  }
  const derived = {
    official: rows.length,
    full: rows.filter(({ semantic }) => semantic === 'Full').length,
    partial: rows.filter(({ semantic }) => semantic === 'Partial').length,
    notCovered: rows.filter(({ semantic }) => semantic === 'Not covered')
      .length,
    notMapped: rows.filter(({ semantic }) => semantic === 'Not mapped').length,
    comments: comments.length,
  };
  for (const [key, label] of Object.entries(SUMMARY_LABELS)) {
    const displayed = summary.get(label);
    if (displayed !== derived[key]) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}: summary ${JSON.stringify(label)} is ${JSON.stringify(displayed)}, derived value is ${derived[key]}`,
      );
    }
  }

  return derived;
}

export function validateIurieCoverage({
  questionBank,
  coverageMatrix,
  sourceSnapshots,
}) {
  const errors = [];
  const normalizedQuestionBank = normalizeLineEndings(questionBank);
  const normalizedCoverageMatrix = normalizeLineEndings(coverageMatrix);
  const questions = parseQuestionBank(normalizedQuestionBank, errors);
  const snapshotValidation = validateIurieEvidenceSnapshots(sourceSnapshots);
  errors.push(...snapshotValidation.errors);
  const previousSource = snapshotValidation.historical;
  const source = snapshotValidation.current;
  if (!snapshotValidation.inputComplete) {
    return {
      errors,
      summary: null,
      source: {
        comments: 0,
        sessions: 0,
        nonSessionComments: 0,
        previousComments: 0,
      },
    };
  }
  const summary = validateMatrix(
    {
      contents: normalizedCoverageMatrix,
      questions,
      comments: source.comments,
    },
    errors,
  );
  return {
    errors,
    summary,
    source: {
      comments: source.comments.length,
      sessions: source.sessionEntries.length,
      nonSessionComments: source.nonSessionComments.length,
      previousComments: previousSource.comments.length,
    },
  };
}

export async function validateIurieCoverageFiles(repositoryRoot) {
  const root = resolve(repositoryRoot);
  const [questionBank, coverageMatrix, historicalSnapshot, currentSnapshot] =
    await Promise.all([
      readFile(resolve(root, QUESTION_BANK_PATH), 'utf8'),
      readFile(resolve(root, COVERAGE_MATRIX_PATH), 'utf8'),
      readFile(resolve(root, HISTORICAL_SOURCE_SNAPSHOT_PATH), 'utf8'),
      readFile(resolve(root, CURRENT_SOURCE_SNAPSHOT_PATH), 'utf8'),
    ]);
  return validateIurieCoverage({
    questionBank,
    coverageMatrix,
    sourceSnapshots: {
      historical: historicalSnapshot,
      current: currentSnapshot,
    },
  });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(
    fileURLToPath(new URL('../', import.meta.url)),
  );
  const result = await validateIurieCoverageFiles(repositoryRoot);
  if (result.errors.length > 0) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(
      `Iurie coverage is valid: ${result.summary.official} official questions; ` +
        `${result.source.comments} pinned comments; ${result.source.sessions} numbered sessions; ` +
        `${result.source.nonSessionComments} non-session comments; ` +
        `${result.summary.full} Full, ${result.summary.partial} Partial, ` +
        `${result.summary.notCovered} Not covered, ${result.summary.notMapped} Not mapped.`,
    );
  }
}
