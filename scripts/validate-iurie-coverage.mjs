#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUESTION_BANK_PATH =
  'docs/product/iurie-business-question-bank-ro.md';
const COVERAGE_MATRIX_PATH =
  'docs/product/iurie-business-answer-coverage.md';
const SOURCE_SNAPSHOT_PATH =
  'docs/product/evidence/iurie-business-interview-issue-81-comments.jsonl';

const EXPECTED_QUESTION_COUNT = 278;
const EXPECTED_COMMENT_COUNT = 104;
const EXPECTED_SESSION_COUNT = 102;
const EXPECTED_NON_SESSION_COMMENT_IDS = new Set([5307483085, 5308212347]);
const EXPECTED_INVENTORY_SHA256 =
  '430627c8a7aa50fe01b499c02be880f5bcc972a123d65868425d0f53cbbae818';
const SOURCE_ISSUE_URL =
  'https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81';
const EXPECTED_SNAPSHOT_BOUNDARY = '2026-08-18T20:40:09Z';
const EXPECTED_SNAPSHOT_BASELINE =
  'f1e0033184bb8bbcb7bb0177b4c9a8f5955f6e97';

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
  return questions;
}

function parseSnapshot(contents, errors) {
  const records = [];
  for (const [index, line] of contents.split('\n').entries()) {
    if (line.trim() === '') continue;
    try {
      const record = JSON.parse(line);
      if (record === null || typeof record !== 'object' || Array.isArray(record)) {
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

  const metadata = records.filter(({ record_type: type }) => type === 'snapshot');
  const comments = records.filter(({ record_type: type }) => type === 'comment');
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
    if (!Number.isSafeInteger(comment.comment_id) || comment.url !== canonicalUrl) {
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

  const sessionEntries = [];
  const nonSessionComments = [];
  for (const comment of comments) {
    const match = comment.body.match(
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

  const expectedSessions = Array.from({ length: 104 }, (_, index) => index + 1)
    .filter((number) => number !== 69 && number !== 91);
  const actualSessions = new Set(sessionEntries.map(({ number }) => number));
  for (const number of expectedSessions) {
    if (!actualSessions.has(number)) {
      errors.push(`${SOURCE_SNAPSHOT_PATH}: missing session number ${number}`);
    }
  }
  for (const number of actualSessions) {
    if (!expectedSessions.includes(number)) {
      errors.push(`${SOURCE_SNAPSHOT_PATH}: unexpected session number ${number}`);
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
    for (const pattern of atomicPatterns) {
      for (const match of comment.body.matchAll(pattern)) {
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
    if (section === 'matrix' && /^S\d{2}-Q\d{2}$/u.test(cells[0] ?? '')) {
      if (cells.length !== 10) {
        errors.push(
          `${COVERAGE_MATRIX_PATH}:${index + 1}: expected 10 official-matrix columns, found ${cells.length}`,
        );
        continue;
      }
      rows.push({
        id: cells[0],
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
      ledger.push({ order: Number(cells[0]), provenance: cells[1], line: index + 1 });
    }
  }
  return { rows, ledger };
}

function citedUrls(contents) {
  return [...contents.matchAll(/\]\((https:\/\/github\.com\/Prisma-Prim\/PRISMA-PRIM-Suite\/issues\/81#issuecomment-\d+)\)/gu)].map(
    (match) => match[1],
  );
}

function validateMatrix({ contents, questions, comments }, errors) {
  const { rows, ledger } = parseMatrix(contents, errors);
  const bankById = new Map(questions.map((question) => [question.id, question]));
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
      errors.push(`${COVERAGE_MATRIX_PATH}: missing official question ${question.id}`);
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
      if (row.sourceStatus === '—') {
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
        if (value === '—') {
          errors.push(
            `${COVERAGE_MATRIX_PATH}:${row.line}: ${row.id} is ${row.semantic} but has no ${field}`,
          );
        }
      }
    }
  }

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
    notCovered: rows.filter(({ semantic }) => semantic === 'Not covered').length,
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
  const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
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
