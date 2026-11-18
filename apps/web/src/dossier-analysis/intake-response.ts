import { uuid } from '../knowledge-evidence/knowledge-response';

function record(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid intake response.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown, maximum: number) {
  if (typeof value !== 'string' || !value || value.length > maximum)
    throw new Error('Invalid intake text.');
  return value;
}
function id(value: unknown) {
  if (!uuid(value)) throw new Error('Invalid intake identity.');
  return value;
}
function integer(value: unknown, maximum: number, minimum = 0) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new Error('Invalid intake number.');
  return value;
}
function choice<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] {
  const matched = allowed.find((item) => item === value);
  if (matched === undefined) throw new Error('Invalid intake state.');
  return matched;
}
export type AdmissionFile =
  | {
      kind: 'pdf' | 'docx';
      fileName: string;
      language: 'ro' | 'ru' | 'fr' | 'en';
      size: number;
      sha256: string;
      title: string;
      purpose: string;
    }
  | {
      kind: 'invalid';
      fileName: string;
      size: number;
      reason:
        | 'unsupported_type'
        | 'too_large'
        | 'empty_file'
        | 'invalid_name'
        | 'unreadable_file';
    };
function file(value: unknown): AdmissionFile {
  const row = record(value),
    fileName = text(row.fileName, 255),
    size = integer(row.size, Number.MAX_SAFE_INTEGER);
  if (row.kind === 'invalid')
    return {
      kind: 'invalid',
      fileName,
      size,
      reason: choice(row.reason, [
        'unsupported_type',
        'too_large',
        'empty_file',
        'invalid_name',
        'unreadable_file',
      ] as const),
    };
  if (
    typeof row.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(row.sha256) ||
    size < 1 ||
    size > 5 * 1024 * 1024
  )
    throw new Error('Invalid original identity.');
  const kind = choice(row.kind, ['pdf', 'docx'] as const);
  if (!fileName.toLowerCase().endsWith(`.${kind}`))
    throw new Error('Invalid original type.');
  return {
    kind,
    fileName,
    size,
    sha256: row.sha256,
    language: choice(row.language, ['ro', 'ru', 'fr', 'en'] as const),
    title: text(row.title, 200),
    purpose: text(row.purpose, 2000),
  };
}
function progress(value: unknown) {
  const row = record(value);
  const stage = choice(row.stage, [
    'queued',
    'registered',
    'linked',
    'pdf_stored',
    'source_stored',
    'complete',
    'duplicate',
    'skipped',
  ] as const);
  let documentId: string | null = null;
  let duplicateBatchId: string | null = null;
  if (
    stage === 'registered' ||
    stage === 'linked' ||
    stage === 'pdf_stored' ||
    stage === 'source_stored' ||
    stage === 'complete'
  ) {
    const target = record(row.target);
    documentId = id(target.documentId);
    id(target.versionId);
    if (stage === 'pdf_stored') id(row.representationId);
    if (stage === 'source_stored' || stage === 'complete') {
      id(row.sourceId);
      if (row.representationId !== null) id(row.representationId);
    }
  }
  if (stage === 'duplicate') {
    const duplicate = record(row.duplicateOf);
    const kind = choice(duplicate.kind, ['item', 'source', 'batch'] as const);
    id(duplicate.id);
    if (kind === 'batch') {
      duplicateBatchId = id(duplicate.id);
      id(duplicate.itemId);
    }
  }
  if (stage === 'skipped') {
    choice(row.reason, ['duplicate', 'failed'] as const);
    if (row.retained !== null) {
      const retained = record(row.retained);
      if (retained.target !== undefined)
        documentId = id(record(retained.target).documentId);
    }
  }
  return { stage, documentId, duplicateBatchId };
}
function item(value: unknown) {
  const row = record(value),
    parsed = file(row.file),
    itemId = id(row.id);
  if (row.kind === 'invalid' && parsed.kind === 'invalid')
    return { kind: 'invalid' as const, id: itemId, file: parsed };
  if (row.kind !== 'file' || parsed.kind === 'invalid')
    throw new Error('Invalid intake item.');
  const last = record(row.lastAttempt),
    outcome = choice(last.outcome, [
      'none',
      'pending',
      'complete',
      'failed',
    ] as const);
  if (outcome !== 'none') {
    id(last.id);
    if (!Number.isFinite(Date.parse(text(last.at, 40))))
      throw new Error('Invalid attempt.');
  }
  const failure =
    outcome === 'failed'
      ? choice(last.code, [
          'invalid_file',
          'size_limit',
          'stale_target',
          'unavailable',
        ] as const)
      : null;
  return {
    kind: 'file' as const,
    id: itemId,
    file: parsed,
    progress: progress(row.progress),
    attempts: integer(row.attempts, 100),
    failures: integer(row.failureCount, 100),
    outcome,
    failure,
  };
}
export function intakeBatch(value: unknown) {
  const row = record(value);
  if (
    row.format !== 'DOCUMENT_INTAKE_VIEW/1' ||
    !Array.isArray(row.items) ||
    row.items.length < 1 ||
    row.items.length > 25
  )
    throw new Error('Invalid intake batch.');
  const raw: unknown[] = row.items,
    items = raw.map(item);
  if (new Set(items.map((i) => i.id)).size !== items.length)
    throw new Error('Repeated intake item.');
  return {
    id: id(row.id),
    projectId: id(row.projectId),
    companyId: id(row.companyId),
    clientId: id(row.clientId),
    revision: integer(row.revision, 2147483647, 1),
    phase: choice(row.phase, [
      'paused',
      'active',
      'stopped',
      'completed',
    ] as const),
    createdAt: text(row.createdAt, 40),
    items,
  };
}
export type IntakeBatch = ReturnType<typeof intakeBatch>;
export function intakePage(value: unknown) {
  const row = record(value);
  if (!Array.isArray(row.items) || row.items.length > 5)
    throw new Error('Invalid intake page.');
  const raw: unknown[] = row.items;
  return {
    items: raw.map(intakeBatch),
    nextBefore: row.nextBefore === null ? null : id(row.nextBefore),
  };
}
export function intakeProject(value: unknown) {
  const row = record(value);
  return {
    id: id(row.id),
    clientId: id(row.clientAccountId),
    title: text(row.title, 200),
    client: text(row.clientDisplayName, 200),
  };
}

export async function selectIntakeFiles(
  files: File[],
  language: 'ro' | 'ru' | 'fr' | 'en',
  purpose: string,
) {
  if (files.length < 1 || files.length > 25)
    throw new Error('Choose 1–25 files.');
  const selected: { file: AdmissionFile; original: File | null }[] = [];
  let total = 0;
  for (const original of files) {
    const kind = original.name.toLowerCase().endsWith('.pdf')
      ? 'pdf'
      : original.name.toLowerCase().endsWith('.docx')
        ? 'docx'
        : null;
    const invalidName =
      original.name.length > 120 ||
      original.name !== original.name.trim() ||
      /[\p{Cc}\p{Cf}/\\]/u.test(original.name);
    const reason = invalidName
      ? 'invalid_name'
      : !kind
        ? 'unsupported_type'
        : original.size === 0
          ? 'empty_file'
          : original.size > 5 * 1024 * 1024
            ? 'too_large'
            : null;
    if (reason || !kind) {
      selected.push({
        file: {
          kind: 'invalid',
          fileName:
            original.name
              .replace(/[\p{Cc}\p{Cf}/\\]/gu, '_')
              .trim()
              .slice(0, 255) || 'invalid',
          size: original.size,
          reason: reason ?? 'unsupported_type',
        },
        original: null,
      });
      continue;
    }
    let hash: ArrayBuffer;
    try {
      hash = await crypto.subtle.digest(
        'SHA-256',
        await original.arrayBuffer(),
      );
    } catch {
      selected.push({
        file: {
          kind: 'invalid',
          fileName: original.name,
          size: original.size,
          reason: 'unreadable_file',
        },
        original: null,
      });
      continue;
    }
    total += original.size;
    if (total > 20 * 1024 * 1024) throw new Error('The batch exceeds 20 MiB.');
    selected.push({
      file: {
        kind,
        fileName: original.name,
        language,
        size: original.size,
        sha256: Array.from(new Uint8Array(hash), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join(''),
        title: original.name,
        purpose,
      },
      original,
    });
  }
  return selected;
}
