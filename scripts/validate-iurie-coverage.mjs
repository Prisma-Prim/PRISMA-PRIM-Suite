#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUESTION_BANK_PATH = 'docs/product/iurie-business-question-bank-ro.md';
const COVERAGE_MATRIX_PATH = 'docs/product/iurie-business-answer-coverage.md';
const SOURCE_SNAPSHOT_PATH =
  'docs/product/evidence/iurie-business-interview-issue-81-comments.jsonl';

const EXPECTED_QUESTION_COUNT = 278;
const EXPECTED_COMMENT_COUNT = 104;
const EXPECTED_SESSION_COUNT = 102;
const EXPECTED_NON_SESSION_COMMENT_IDS = new Set([5307483085, 5308212347]);
const EXPECTED_INVENTORY_SHA256 =
  '430627c8a7aa50fe01b499c02be880f5bcc972a123d65868425d0f53cbbae818';
const EXPECTED_COMMENT_CONTENT_SHA256 =
  'c009d766d0d3ca03a5e0a002c67114950f4aa5549463e6f56c7bbdc6af54ba69';
const EXPECTED_COMPLETE_COMMENT_RECORDS_SHA256 =
  '96e05ed08f74690a34043bc4a1acf92a238f480f190421e25bf5cfbb6c190bc8';
const EXPECTED_SNAPSHOT_METADATA_SHA256 =
  'a74f1aa964d722ff77c57be1ba0d6a1e993de506486ae8018dfe539d99d0e816';
const EXPECTED_QUESTION_BANK_CONTENT_SHA256 =
  '0bc9216d41ac27b5613c2a2c997accfa2216fc68447c5753fcd0230a42cb5d8e';
const EXPECTED_ROW_CITATION_MAP_SHA256 =
  '3e8621e281b23c405ceec581254c5c5e2826f58f3513d5f0a205812bc7b89875';
const EXPECTED_OFFICIAL_ROW_AUDIT_SHA256 =
  'df4c57afd76547be01375c33978875d1d7521841685873fbe876951ae9f0c825';
const EXPECTED_LEDGER_CONTENT_SHA256 =
  'd278f7b28ff77b8b22dfb8a7e9fa6c30a7b606adbc86c93c93732348a0a68020';
const SOURCE_ISSUE_URL =
  'https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81';
const EXPECTED_SNAPSHOT_BOUNDARY = '2026-08-18T20:40:09Z';
const EXPECTED_SNAPSHOT_BASELINE = 'f1e0033184bb8bbcb7bb0177b4c9a8f5955f6e97';
const EXPECTED_IMPLEMENTATION_BASELINE =
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
const BASELINE_SEMANTIC_IDS = {
  Full: new Set([
    'S00-Q01',
    'S00-Q02',
    'S00-Q03',
    'S00-Q10',
    'S00-Q11',
    'S00-Q13',
    'S00-Q14',
    'S00-Q15',
    'S01-Q10',
    'S01-Q12',
    'S02-Q08',
    'S02-Q09',
    'S02-Q21',
    'S03-Q01',
    'S03-Q04',
    'S03-Q06',
    'S03-Q08',
    'S03-Q09',
  ]),
  Partial: new Set([
    'S00-Q04',
    'S00-Q05',
    'S00-Q06',
    'S00-Q07',
    'S00-Q08',
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
    'S02-Q02',
    'S02-Q07',
    'S02-Q10',
    'S02-Q11',
    'S02-Q12',
    'S02-Q15',
    'S02-Q16',
    'S03-Q05',
    'S03-Q07',
    'S03-Q10',
    'S03-Q11',
    'S03-Q12',
  ]),
  'Not covered': new Set(['S02-Q13', 'S04-Q01']),
};
const TRANSITION_LABELS = [
  'Not mapped to Full',
  'Not mapped to Partial',
  'Not covered to Partial',
  'Partial to Full',
  'Full to Partial',
];

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

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function canonicalRecordsHash(records) {
  const contents = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  return createHash('sha256').update(contents).digest('hex');
}

function parseQuestionBank(contents, errors) {
  const questions = [];
  for (const [index, line] of contents.split('\n').entries()) {
    const match = line.match(
      /^\d+\.\s+\*\*(S\d{2}-Q\d{2}) · (P[012])\*\*\s+—\s+(.+)$/u,
    );
    if (!match) continue;
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

function parseSnapshot(contents, errors) {
  const records = [];
  for (const [index, line] of contents.split('\n').entries()) {
    if (line.trim() === '') continue;
    try {
      const record = JSON.parse(line);
      if (
        record === null ||
        typeof record !== 'object' ||
        Array.isArray(record)
      ) {
        errors.push(
          `${SOURCE_SNAPSHOT_PATH}:${index + 1}: expected a JSON object`,
        );
      } else {
        records.push(record);
      }
    } catch {
      errors.push(`${SOURCE_SNAPSHOT_PATH}:${index + 1}: invalid JSON`);
    }
  }

  const metadata = records.filter(
    ({ record_type: type }) => type === 'snapshot',
  );
  const comments = records.filter(
    ({ record_type: type }) => type === 'comment',
  );
  const unknown = records.filter(
    ({ record_type: type }) => type !== 'snapshot' && type !== 'comment',
  );

  if (metadata.length !== 1 || records[0]?.record_type !== 'snapshot') {
    errors.push(
      `${SOURCE_SNAPSHOT_PATH}: expected one snapshot record before all comment records`,
    );
  }
  if (unknown.length > 0) {
    errors.push(
      `${SOURCE_SNAPSHOT_PATH}: found ${unknown.length} unknown record type(s)`,
    );
  }

  const snapshot = metadata[0];
  const metadataHash = canonicalRecordsHash([
    Object.entries(snapshot ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  ]);
  if (metadataHash !== EXPECTED_SNAPSHOT_METADATA_SHA256) {
    errors.push(
      `${SOURCE_SNAPSHOT_PATH}: pinned complete snapshot metadata does not match the evidence-only authority boundary`,
    );
  }
  const expectedMetadata = [
    ['source_issue_number', 81],
    ['source_issue_url', SOURCE_ISSUE_URL],
    ['source_issue_updated_at', EXPECTED_SNAPSHOT_BOUNDARY],
    ['source_comment_count', EXPECTED_COMMENT_COUNT],
    ['repository_baseline_sha', EXPECTED_SNAPSHOT_BASELINE],
  ];
  for (const [field, expected] of expectedMetadata) {
    if (snapshot?.[field] !== expected) {
      errors.push(
        `${SOURCE_SNAPSHOT_PATH}: snapshot ${field} must be ${JSON.stringify(expected)}`,
      );
    }
  }

  if (comments.length !== EXPECTED_COMMENT_COUNT) {
    errors.push(
      `${SOURCE_SNAPSHOT_PATH}: expected ${EXPECTED_COMMENT_COUNT} comment records, found ${comments.length}`,
    );
  }

  for (const [index, comment] of comments.entries()) {
    const expectedOrdinal = index + 1;
    if (comment.ordinal !== expectedOrdinal) {
      errors.push(
        `${SOURCE_SNAPSHOT_PATH}: expected source ordinal ${expectedOrdinal}, found ${JSON.stringify(comment.ordinal)}`,
      );
    }
    const canonicalUrl = `${SOURCE_ISSUE_URL}#issuecomment-${comment.comment_id}`;
    if (
      !Number.isSafeInteger(comment.comment_id) ||
      comment.url !== canonicalUrl
    ) {
      errors.push(
        `${SOURCE_SNAPSHOT_PATH}: source ordinal ${expectedOrdinal} has an invalid comment ID or canonical URL`,
      );
    }
    if (
      typeof comment.author_login !== 'string' ||
      comment.author_login.length === 0 ||
      typeof comment.body !== 'string' ||
      comment.body.length === 0
    ) {
      errors.push(
        `${SOURCE_SNAPSHOT_PATH}: source ordinal ${expectedOrdinal} is missing author or body provenance`,
      );
    }
  }

  for (const id of duplicates(comments.map(({ comment_id: id }) => id))) {
    errors.push(`${SOURCE_SNAPSHOT_PATH}: duplicate comment ID ${id}`);
  }
  for (const url of duplicates(comments.map(({ url }) => url))) {
    errors.push(`${SOURCE_SNAPSHOT_PATH}: duplicate canonical URL ${url}`);
  }

  const inventory = `${comments
    .map(({ ordinal, comment_id: id, url }) => `${ordinal}:${id}:${url}`)
    .join('\n')}\n`;
  const inventoryHash = createHash('sha256').update(inventory).digest('hex');
  if (inventoryHash !== EXPECTED_INVENTORY_SHA256) {
    errors.push(
      `${SOURCE_SNAPSHOT_PATH}: pinned 104-comment ID/URL inventory does not match the audited boundary`,
    );
  }

  const commentContent = `${comments
    .map(({ ordinal, comment_id, url, author_login, body }) =>
      JSON.stringify([ordinal, comment_id, url, author_login, body]),
    )
    .join('\n')}\n`;
  const commentContentHash = createHash('sha256')
    .update(commentContent)
    .digest('hex');
  if (commentContentHash !== EXPECTED_COMMENT_CONTENT_SHA256) {
    errors.push(
      `${SOURCE_SNAPSHOT_PATH}: pinned 104-comment author/body content does not match the audited boundary`,
    );
  }
  const completeCommentRecordsHash = canonicalRecordsHash(
    comments.map((comment) =>
      Object.entries(comment).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
  if (completeCommentRecordsHash !== EXPECTED_COMPLETE_COMMENT_RECORDS_SHA256) {
    errors.push(
      `${SOURCE_SNAPSHOT_PATH}: pinned complete comment-record schema and content do not match the verbatim evidence boundary`,
    );
  }

  const sessionEntries = [];
  const nonSessionComments = [];
  for (const comment of comments) {
    const body = typeof comment.body === 'string' ? comment.body : '';
    const match = body.match(
      /^\s*#{1,3}\s+(?:Sesiunea|Sesiune|Session)\s+(\d+)\b/imu,
    );
    if (match) {
      sessionEntries.push({ number: Number(match[1]), comment });
    } else {
      nonSessionComments.push(comment);
    }
  }

  if (sessionEntries.length !== EXPECTED_SESSION_COUNT) {
    errors.push(
      `${SOURCE_SNAPSHOT_PATH}: expected ${EXPECTED_SESSION_COUNT} numbered sessions, found ${sessionEntries.length}`,
    );
  }
  for (const number of duplicates(sessionEntries.map(({ number }) => number))) {
    errors.push(`${SOURCE_SNAPSHOT_PATH}: duplicate session number ${number}`);
  }

  const expectedSessions = Array.from(
    { length: 104 },
    (_, index) => index + 1,
  ).filter((number) => number !== 69 && number !== 91);
  const actualSessions = new Set(sessionEntries.map(({ number }) => number));
  for (const number of expectedSessions) {
    if (!actualSessions.has(number)) {
      errors.push(`${SOURCE_SNAPSHOT_PATH}: missing session number ${number}`);
    }
  }
  for (const number of actualSessions) {
    if (!expectedSessions.includes(number)) {
      errors.push(
        `${SOURCE_SNAPSHOT_PATH}: unexpected session number ${number}`,
      );
    }
  }

  const nonSessionIds = new Set(
    nonSessionComments.map(({ comment_id: id }) => id),
  );
  if (
    nonSessionIds.size !== EXPECTED_NON_SESSION_COMMENT_IDS.size ||
    [...EXPECTED_NON_SESSION_COMMENT_IDS].some((id) => !nonSessionIds.has(id))
  ) {
    errors.push(
      `${SOURCE_SNAPSHOT_PATH}: expected non-session comments 5307483085 and 5308212347`,
    );
  }

  const atomicItems = [];
  const atomicPatterns = [
    /^###\s+(?:Întrebarea\s+)?(\d+)(?:\.|\s|$)/gimu,
    /^\s*-\s+\*\*(\d+)\s+[—-]/gimu,
    /^\*\*Întrebarea\s+(\d+)\*\*/gimu,
  ];
  for (const comment of comments) {
    const body = typeof comment.body === 'string' ? comment.body : '';
    for (const pattern of atomicPatterns) {
      for (const match of body.matchAll(pattern)) {
        atomicItems.push(Number(match[1]));
      }
    }
  }
  if (!atomicItems.includes(525)) {
    errors.push(`${SOURCE_SNAPSHOT_PATH}: atomic item frontier 525 is missing`);
  }
  const unsupportedItems = atomicItems.filter(
    (number) => number >= 526 && number <= 765,
  );
  if (unsupportedItems.length > 0) {
    errors.push(
      `${SOURCE_SNAPSHOT_PATH}: found claimed atomic item(s) 526–765: ${[
        ...new Set(unsupportedItems),
      ].join(', ')}`,
    );
  }

  return { comments, sessionEntries, nonSessionComments };
}

function parseMatrix(contents, errors) {
  const rows = [];
  const ledger = [];
  let section = '';

  for (const [index, line] of contents.split('\n').entries()) {
    if (line.startsWith('## 3. ')) section = 'matrix';
    if (line.startsWith('## 4. ')) section = 'ledger';
    if (line.startsWith('## 5. ')) section = '';

    const cells = splitMarkdownRow(line);
    if (!cells) continue;
    if (section === 'matrix') {
      const identifier = cells[0] ?? '';
      if (identifier === 'Question' || /^:?-+:?$/u.test(identifier)) {
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
    if (section === 'ledger' && /^\d+$/u.test(cells[0] ?? '')) {
      if (cells.length !== 5) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}:${index + 1}: expected 5 supplemental-ledger columns, found ${cells.length}`,
        );
        continue;
      }
      ledger.push({
        order: Number(cells[0]),
        provenance: cells[1],
        sessionTopic: cells[2],
        itemRange: cells[3],
        sourceStatus: cells[4],
        line: index + 1,
      });
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

function semanticBaseline(questions, errors) {
  const questionIds = new Set(questions.map(({ id }) => id));
  const baseline = new Map(questions.map(({ id }) => [id, 'Not mapped']));
  const assigned = new Set();

  for (const [semantic, ids] of Object.entries(BASELINE_SEMANTIC_IDS)) {
    for (const id of ids) {
      if (!questionIds.has(id)) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}: pinned baseline contains unknown official question ${id}`,
        );
      }
      if (assigned.has(id)) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}: pinned baseline assigns ${id} more than once`,
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
  const baseline = semanticBaseline(questions, errors);
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
        `${COVERAGE_MATRIX_PATH}:${entry.line}: ${label} differs from the pinned baseline; missing [${missing.join(', ')}], unexpected [${unexpected.join(', ')}]`,
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
    /contain (\d+) state-changing official IDs in total\./u,
  );
  if (Number(declaredChangedIds?.[1]) !== expectedChangedIds) {
    errors.push(
      `${COVERAGE_MATRIX_PATH}: declared state-changing ID total is ${JSON.stringify(declaredChangedIds?.[1])}, derived value is ${expectedChangedIds}`,
    );
  }
}

function validateMatrix({ contents, questions, comments }, errors) {
  for (const declaration of EXPECTED_MATRIX_AUTHORITY_DECLARATIONS) {
    const occurrences = contents.split(declaration).length - 1;
    if (occurrences !== 1) {
      errors.push(
        `${COVERAGE_MATRIX_PATH}: expected exactly one pinned evidence-only authority declaration ${JSON.stringify(declaration)}`,
      );
    }
  }
  const implementationBaseline = contents.match(
    /^\*\*Implementation\/diff baseline:\*\* `([0-9a-f]{40})`/mu,
  );
  if (implementationBaseline?.[1] !== EXPECTED_IMPLEMENTATION_BASELINE) {
    errors.push(
      `${COVERAGE_MATRIX_PATH}: published implementation/diff baseline must be ${EXPECTED_IMPLEMENTATION_BASELINE}`,
    );
  }
  const fullBaselineOccurrences =
    contents.split(EXPECTED_IMPLEMENTATION_BASELINE).length - 1;
  const shortBaseline = `${EXPECTED_IMPLEMENTATION_BASELINE.slice(0, 7)}…`;
  if (
    fullBaselineOccurrences !== 2 ||
    !contents.includes(`GitHub baseline \`${shortBaseline}\``)
  ) {
    errors.push(
      `${COVERAGE_MATRIX_PATH}: all published semantic-delta baseline references must identify ${EXPECTED_IMPLEMENTATION_BASELINE}`,
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

  if (ledger.length !== EXPECTED_COMMENT_COUNT) {
    errors.push(
      `${COVERAGE_MATRIX_PATH}: expected ${EXPECTED_COMMENT_COUNT} supplemental-ledger rows, found ${ledger.length}`,
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
  sourceSnapshot,
}) {
  const errors = [];
  const questions = parseQuestionBank(questionBank, errors);
  const source = parseSnapshot(sourceSnapshot, errors);
  const summary = validateMatrix(
    { contents: coverageMatrix, questions, comments: source.comments },
    errors,
  );
  return {
    errors,
    summary,
    source: {
      comments: source.comments.length,
      sessions: source.sessionEntries.length,
      nonSessionComments: source.nonSessionComments.length,
    },
  };
}

export async function validateIurieCoverageFiles(repositoryRoot) {
  const root = resolve(repositoryRoot);
  const [questionBank, coverageMatrix, sourceSnapshot] = await Promise.all([
    readFile(resolve(root, QUESTION_BANK_PATH), 'utf8'),
    readFile(resolve(root, COVERAGE_MATRIX_PATH), 'utf8'),
    readFile(resolve(root, SOURCE_SNAPSHOT_PATH), 'utf8'),
  ]);
  return validateIurieCoverage({
    questionBank,
    coverageMatrix,
    sourceSnapshot,
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
