import { createHash } from 'node:crypto';

import {
  canonicalRecordsHash,
  duplicates,
  normalizeLineEndings,
} from './validation-helpers.mjs';

export const HISTORICAL_SOURCE_SNAPSHOT_PATH =
  'docs/product/evidence/iurie-business-interview-issue-81-comments.jsonl';
export const CURRENT_SOURCE_SNAPSHOT_PATH =
  'docs/product/evidence/iurie-business-interview-issue-81-comments-109-112-through-2026-08-23.jsonl';
export const BASE_SOURCE_SNAPSHOT_PATH =
  'docs/product/evidence/iurie-business-interview-issue-81-comments-through-2026-08-21.jsonl';
export const CURRENT_SOURCE_COMMENT_COUNT = 112;

const SOURCE_ISSUE_URL =
  'https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81';
const EXPECTED_SESSION_NUMBERS = new Set(
  Array.from({ length: 104 }, (_, index) => index + 1).filter(
    (number) => number !== 69 && number !== 91,
  ),
);
const ATOMIC_PATTERNS = [
  /^###\s+(?:Întrebarea\s+)?(\d+)(?:\.|\s|$)/gimu,
  /^\s*-\s+\*\*(\d+)\s+[—-]/gimu,
  /^\*\*Întrebarea\s+(\d+)\*\*/gimu,
  /^##\s+(\d+)\s+[—-]/gimu,
];

const HISTORICAL_EXPECTATION = {
  path: HISTORICAL_SOURCE_SNAPSHOT_PATH,
  commentCount: 104,
  metadataFields: new Map([
    ['source_issue_number', 81],
    ['source_issue_url', SOURCE_ISSUE_URL],
    ['source_issue_updated_at', '2026-08-18T20:40:09Z'],
    ['source_comment_count', 104],
    ['repository_baseline_sha', 'f1e0033184bb8bbcb7bb0177b4c9a8f5955f6e97'],
  ]),
  metadataHash:
    'a74f1aa964d722ff77c57be1ba0d6a1e993de506486ae8018dfe539d99d0e816',
  inventoryHash:
    '430627c8a7aa50fe01b499c02be880f5bcc972a123d65868425d0f53cbbae818',
  commentContentHash:
    'c009d766d0d3ca03a5e0a002c67114950f4aa5549463e6f56c7bbdc6af54ba69',
  completeCommentRecordsHash:
    '96e05ed08f74690a34043bc4a1acf92a238f480f190421e25bf5cfbb6c190bc8',
  sessionNumbers: EXPECTED_SESSION_NUMBERS,
  nonSessionCommentIds: new Set([5307483085, 5308212347]),
  requiredAtomicItems: new Set([525]),
  recoveredRange: { first: 526, last: 765 },
  recoveredItemComments: new Map(),
};

const BASE_EXPECTATION = {
  path: BASE_SOURCE_SNAPSHOT_PATH,
  commentCount: 108,
  metadataFields: new Map([
    ['source_issue_number', 81],
    ['source_issue_url', SOURCE_ISSUE_URL],
    ['source_issue_updated_at', '2026-08-21T17:45:07Z'],
    ['source_comment_count', 108],
    ['repository_baseline_sha', '1e5965f13f7d889ddab1751a2266479c04d1b3d8'],
    ['predecessor_snapshot', HISTORICAL_SOURCE_SNAPSHOT_PATH],
    ['predecessor_source_issue_updated_at', '2026-08-18T20:40:09Z'],
    ['predecessor_comment_count', 104],
  ]),
  metadataHash:
    '6db350e21ad231f3d0ca5d57c0f3343c2f4a934f7a7fbc76f7fffd5a3a598982',
  inventoryHash:
    '909c7cea6588f38aaec3c8c9003108cba365f6d5b7c497f762d125242417ccda',
  commentContentHash:
    '2a7f607374532a46a0bcbc66e4cc33a2527af8f4ab299aee90a3dba8ba9c3ed1',
  completeCommentRecordsHash:
    '19d119916c5c7ca0ddda1dede7fac46ec6d90ec4ea0adda7537cd0e1fbd73d5a',
  sessionNumbers: EXPECTED_SESSION_NUMBERS,
  nonSessionCommentIds: new Set([
    5307483085, 5308212347, 5366189353, 5373284576, 5373291180, 5373293702,
  ]),
  requiredAtomicItems: new Set([525]),
  recoveredRange: { first: 526, last: 765 },
  recoveredItemComments: new Map([
    [702, 5373284576],
    [703, 5373284576],
    [704, 5373284576],
    [705, 5373291180],
    [706, 5373293702],
  ]),
};

const INCREMENT_EXPECTATION = {
  path: CURRENT_SOURCE_SNAPSHOT_PATH,
  metadataRecordType: 'snapshot_increment',
  firstOrdinal: 109,
  commentCount: 4,
  metadataFields: new Map([
    ['source_issue_number', 81],
    ['source_issue_url', SOURCE_ISSUE_URL],
    ['source_comment_count_at_boundary', 112],
    ['increment_comment_count', 4],
    ['predecessor_snapshot', BASE_SOURCE_SNAPSHOT_PATH],
    ['first_increment_ordinal', 109],
    ['last_increment_ordinal', 112],
    ['snapshot_date', '2026-08-23'],
  ]),
  metadataHash:
    '7ff0821965f298ed05aed0b2d5d909f40b1c036700fcb68e696c4fd4e3d40d44',
  inventoryHash:
    'be516d7b786deff4a3b1961a16d30dbf62b3545a2960887a2dd832de03749022',
  commentContentHash:
    '268eb543fa80058757db05bb1fb05000cc1cd9f04ad38b871098ff21e0d6b098',
  completeCommentRecordsHash:
    'd72f7953d31857f7a24ed3fefc80676975a85e29828e63c3da496d74dd4a3458',
  sessionNumbers: new Set(),
  nonSessionCommentIds: new Set([
    5381410354, 5381434101, 5382131725, 5384426877,
  ]),
  requiredAtomicItems: new Set(),
  recoveredRange: { first: 526, last: 765 },
  recoveredItemComments: new Map(),
};

function parseJsonl(contents, expectation, errors) {
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
        errors.push(`${expectation.path}:${index + 1}: expected a JSON object`);
      } else {
        records.push(record);
      }
    } catch {
      errors.push(`${expectation.path}:${index + 1}: invalid JSON`);
    }
  }
  return records;
}

function validateMetadata(records, expectation, errors) {
  const metadataRecordType = expectation.metadataRecordType ?? 'snapshot';
  const metadataRecords = records.filter(
    ({ record_type: type }) => type === metadataRecordType,
  );
  const unknownRecords = records.filter(
    ({ record_type: type }) =>
      type !== metadataRecordType && type !== 'comment',
  );
  if (
    metadataRecords.length !== 1 ||
    records[0]?.record_type !== metadataRecordType
  ) {
    errors.push(
      `${expectation.path}: expected one snapshot record before all comment records`,
    );
  }
  if (unknownRecords.length > 0) {
    errors.push(
      `${expectation.path}: found ${unknownRecords.length} unknown record type(s)`,
    );
  }

  const metadata = metadataRecords[0];
  const metadataHash = canonicalRecordsHash([
    Object.entries(metadata ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  ]);
  if (metadataHash !== expectation.metadataHash) {
    errors.push(
      `${expectation.path}: pinned complete snapshot metadata does not match the evidence-only authority boundary`,
    );
  }
  for (const [field, expectedValue] of expectation.metadataFields) {
    if (metadata?.[field] !== expectedValue) {
      errors.push(
        `${expectation.path}: snapshot ${field} must be ${JSON.stringify(expectedValue)}`,
      );
    }
  }
}

function validateCommentRecords(comments, expectation, errors) {
  if (comments.length !== expectation.commentCount) {
    errors.push(
      `${expectation.path}: expected ${expectation.commentCount} comment records, found ${comments.length}`,
    );
  }
  for (const [index, comment] of comments.entries()) {
    const expectedOrdinal = (expectation.firstOrdinal ?? 1) + index;
    if (comment.ordinal !== expectedOrdinal) {
      errors.push(
        `${expectation.path}: expected source ordinal ${expectedOrdinal}, found ${JSON.stringify(comment.ordinal)}`,
      );
    }
    const canonicalUrl = `${SOURCE_ISSUE_URL}#issuecomment-${comment.comment_id}`;
    if (
      !Number.isSafeInteger(comment.comment_id) ||
      comment.url !== canonicalUrl
    ) {
      errors.push(
        `${expectation.path}: source ordinal ${expectedOrdinal} has an invalid comment ID or canonical URL`,
      );
    }
    if (
      typeof comment.author_login !== 'string' ||
      comment.author_login.length === 0 ||
      typeof comment.body !== 'string' ||
      comment.body.length === 0
    ) {
      errors.push(
        `${expectation.path}: source ordinal ${expectedOrdinal} is missing author or body provenance`,
      );
    }
  }
  for (const id of duplicates(comments.map(({ comment_id: id }) => id))) {
    errors.push(`${expectation.path}: duplicate comment ID ${id}`);
  }
  for (const url of duplicates(comments.map(({ url }) => url))) {
    errors.push(`${expectation.path}: duplicate canonical URL ${url}`);
  }

  const inventory = `${comments
    .map(({ ordinal, comment_id: id, url }) => `${ordinal}:${id}:${url}`)
    .join('\n')}\n`;
  if (
    createHash('sha256').update(inventory).digest('hex') !==
    expectation.inventoryHash
  ) {
    errors.push(
      `${expectation.path}: pinned ${expectation.commentCount}-comment ID/URL inventory does not match the audited boundary`,
    );
  }
  const commentContent = `${comments
    .map(({ ordinal, comment_id, url, author_login, body }) =>
      JSON.stringify([ordinal, comment_id, url, author_login, body]),
    )
    .join('\n')}\n`;
  if (
    createHash('sha256').update(commentContent).digest('hex') !==
    expectation.commentContentHash
  ) {
    errors.push(
      `${expectation.path}: pinned ${expectation.commentCount}-comment author/body content does not match the audited boundary`,
    );
  }
  const completeRecordsHash = canonicalRecordsHash(
    comments.map((comment) =>
      Object.entries(comment).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
  if (completeRecordsHash !== expectation.completeCommentRecordsHash) {
    errors.push(
      `${expectation.path}: pinned complete comment-record schema and content do not match the verbatim evidence boundary`,
    );
  }
}

function validateSessions(comments, expectation, errors) {
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

  if (sessionEntries.length !== expectation.sessionNumbers.size) {
    errors.push(
      `${expectation.path}: expected ${expectation.sessionNumbers.size} numbered sessions, found ${sessionEntries.length}`,
    );
  }
  for (const number of duplicates(sessionEntries.map(({ number }) => number))) {
    errors.push(`${expectation.path}: duplicate session number ${number}`);
  }
  const actualSessionNumbers = new Set(
    sessionEntries.map(({ number }) => number),
  );
  for (const number of expectation.sessionNumbers) {
    if (!actualSessionNumbers.has(number)) {
      errors.push(`${expectation.path}: missing session number ${number}`);
    }
  }
  for (const number of actualSessionNumbers) {
    if (!expectation.sessionNumbers.has(number)) {
      errors.push(`${expectation.path}: unexpected session number ${number}`);
    }
  }

  const nonSessionIds = new Set(
    nonSessionComments.map(({ comment_id: id }) => id),
  );
  if (
    nonSessionIds.size !== expectation.nonSessionCommentIds.size ||
    [...expectation.nonSessionCommentIds].some((id) => !nonSessionIds.has(id))
  ) {
    errors.push(
      `${expectation.path}: expected non-session comments ${[...expectation.nonSessionCommentIds].join(', ')}`,
    );
  }
  return { sessionEntries, nonSessionComments };
}

function extractAtomicItems(comments) {
  const atomicItems = [];
  for (const comment of comments) {
    const body = typeof comment.body === 'string' ? comment.body : '';
    const itemsInComment = new Set();
    for (const pattern of ATOMIC_PATTERNS) {
      for (const match of body.matchAll(pattern)) {
        itemsInComment.add(Number(match[1]));
      }
    }
    for (const number of itemsInComment) {
      atomicItems.push({ number, commentId: comment.comment_id });
    }
  }
  return atomicItems;
}

function validateAtomicItems(comments, expectation, errors) {
  const atomicItems = extractAtomicItems(comments);
  for (const number of expectation.requiredAtomicItems) {
    if (!atomicItems.some((item) => item.number === number)) {
      errors.push(
        `${expectation.path}: atomic item frontier ${number} is missing`,
      );
    }
  }

  const recoveredByNumber = new Map();
  for (const { number, commentId } of atomicItems) {
    if (
      number < expectation.recoveredRange.first ||
      number > expectation.recoveredRange.last
    ) {
      continue;
    }
    const commentIds = recoveredByNumber.get(number) ?? new Set();
    commentIds.add(commentId);
    recoveredByNumber.set(number, commentIds);
  }
  const missingRecovered = [...expectation.recoveredItemComments.keys()].filter(
    (number) => !recoveredByNumber.has(number),
  );
  const unexpectedRecovered = [...recoveredByNumber.keys()].filter(
    (number) => !expectation.recoveredItemComments.has(number),
  );
  if (missingRecovered.length > 0) {
    errors.push(
      `${expectation.path}: missing recovered atomic item(s): ${missingRecovered.join(', ')}`,
    );
  }
  if (unexpectedRecovered.length > 0) {
    errors.push(
      `${expectation.path}: found unsupported recovered atomic item(s): ${unexpectedRecovered.join(', ')}`,
    );
  }
  for (const [number, expectedCommentId] of expectation.recoveredItemComments) {
    const commentIds = recoveredByNumber.get(number) ?? new Set();
    if (commentIds.size !== 1 || !commentIds.has(expectedCommentId)) {
      errors.push(
        `${expectation.path}: recovered atomic item ${number} must occur only in comment ${expectedCommentId}`,
      );
    }
  }
}

function validateSnapshot(contents, expectation, errors) {
  const records = parseJsonl(contents, expectation, errors);
  validateMetadata(records, expectation, errors);
  const comments = records.filter(
    ({ record_type: type }) => type === 'comment',
  );
  validateCommentRecords(comments, expectation, errors);
  const { sessionEntries, nonSessionComments } = validateSessions(
    comments,
    expectation,
    errors,
  );
  validateAtomicItems(comments, expectation, errors);
  return { comments, sessionEntries, nonSessionComments };
}

function validateRolloverPrefix(historical, current, errors) {
  const historicalComments = historical.comments.map((comment) =>
    JSON.stringify(comment),
  );
  const currentPrefix = current.comments
    .slice(0, historical.comments.length)
    .map((comment) => JSON.stringify(comment));
  if (
    current.comments.length < historical.comments.length ||
    historicalComments.some(
      (comment, index) => comment !== currentPrefix[index],
    )
  ) {
    errors.push(
      `${CURRENT_SOURCE_SNAPSHOT_PATH}: first ${historical.comments.length} comments must exactly reproduce ${HISTORICAL_SOURCE_SNAPSHOT_PATH}`,
    );
  }
}

const EMPTY_SOURCE = {
  comments: [],
  sessionEntries: [],
  nonSessionComments: [],
};

export function validateIurieEvidenceSnapshots(sourceSnapshots) {
  const errors = [];
  if (
    sourceSnapshots === null ||
    typeof sourceSnapshots !== 'object' ||
    typeof sourceSnapshots.historical !== 'string' ||
    typeof sourceSnapshots.base !== 'string' ||
    typeof sourceSnapshots.current !== 'string'
  ) {
    errors.push(
      'Iurie evidence validation requires sourceSnapshots.historical, sourceSnapshots.base and sourceSnapshots.current string contents',
    );
    return {
      errors,
      inputComplete: false,
      historical: EMPTY_SOURCE,
      current: EMPTY_SOURCE,
    };
  }

  const historical = validateSnapshot(
    normalizeLineEndings(sourceSnapshots.historical),
    HISTORICAL_EXPECTATION,
    errors,
  );
  const base = validateSnapshot(
    normalizeLineEndings(sourceSnapshots.base),
    BASE_EXPECTATION,
    errors,
  );
  const increment = validateSnapshot(
    normalizeLineEndings(sourceSnapshots.current),
    INCREMENT_EXPECTATION,
    errors,
  );
  validateRolloverPrefix(historical, base, errors);
  const current = {
    comments: [...base.comments, ...increment.comments],
    sessionEntries: base.sessionEntries,
    nonSessionComments: [
      ...base.nonSessionComments,
      ...increment.nonSessionComments,
    ],
  };
  return { errors, inputComplete: true, historical, current };
}
