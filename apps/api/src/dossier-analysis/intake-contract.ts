import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';

export const INTAKE_LIMITS = {
  items: 25,
  fileBytes: 5 * 1024 * 1024,
  batchBytes: 20 * 1024 * 1024,
};
const languages = ['ro', 'ru', 'fr', 'en'] as const;
const invalidReasons = [
  'unsupported_type',
  'too_large',
  'empty_file',
  'invalid_name',
  'unreadable_file',
] as const;
const failureCodes = [
  'invalid_file',
  'size_limit',
  'stale_target',
  'unavailable',
] as const;
const stages = [
  'queued',
  'registered',
  'linked',
  'pdf_stored',
  'source_stored',
  'complete',
  'duplicate',
  'skipped',
] as const;

function object(value: unknown, allowed: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid intake data.');
  const row = Object.fromEntries(Object.entries(value));
  if (Object.keys(row).some((key) => !allowed.includes(key)))
    throw new BadRequestException('Invalid intake fields.');
  return row;
}
function text(value: unknown, maximum: number) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > maximum
  )
    throw new BadRequestException('Invalid intake text.');
  return value;
}
function integer(value: unknown, maximum: number, minimum = 0) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new BadRequestException('Invalid intake number.');
  return value;
}
function choice<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] {
  const selected = allowed.find((item) => item === value);
  if (selected === undefined)
    throw new BadRequestException('Invalid intake state.');
  return selected;
}

export function intakeFile(value: unknown) {
  const row = object(value, [
    'fileName',
    'kind',
    'language',
    'size',
    'sha256',
    'title',
    'purpose',
    'reason',
  ]);
  const fileName = text(row.fileName, 255);
  if (/[\p{Cc}\p{Cf}/\\]/u.test(fileName))
    throw new BadRequestException('Invalid intake filename.');
  if (row.kind === 'invalid') {
    if (['language', 'sha256', 'title', 'purpose'].some((key) => key in row))
      throw new BadRequestException('Invalid excluded file metadata.');
    return {
      kind: 'invalid' as const,
      fileName,
      size: integer(row.size, Number.MAX_SAFE_INTEGER),
      reason: choice(row.reason, invalidReasons),
    };
  }
  const kind = choice(row.kind, ['pdf', 'docx'] as const);
  if (
    row.reason !== undefined ||
    fileName.length > 120 ||
    !fileName.toLowerCase().endsWith(`.${kind}`) ||
    typeof row.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(row.sha256)
  )
    throw new BadRequestException('Invalid original identity.');
  return {
    kind,
    fileName,
    language: choice(row.language, languages),
    size: integer(row.size, INTAKE_LIMITS.fileBytes, 1),
    sha256: row.sha256,
    title: text(row.title, 200),
    purpose: text(row.purpose, 2000),
  };
}
export type IntakeFile = Exclude<
  ReturnType<typeof intakeFile>,
  { kind: 'invalid' }
>;
export function intakeAdmission(value: unknown) {
  const row = object(value, ['format', 'expectedClientId', 'items']);
  if (
    row.format !== 'DOCUMENT_INTAKE/1' ||
    !Array.isArray(row.items) ||
    row.items.length < 1 ||
    row.items.length > INTAKE_LIMITS.items
  )
    throw new BadRequestException('Choose a bounded intake batch.');
  const raw: unknown[] = row.items;
  const items = raw.map(intakeFile);
  if (
    items.reduce(
      (size, item) => size + (item.kind === 'invalid' ? 0 : item.size),
      0,
    ) > INTAKE_LIMITS.batchBytes
  )
    throw new BadRequestException('The batch exceeds 20 MiB.');
  return { expectedClientId: requireUuid(row.expectedClientId), items };
}
export function intakeRevision(value: unknown) {
  return integer(
    object(value, ['expectedRevision']).expectedRevision,
    2147483646,
    1,
  );
}
export function intakePhaseCommand(value: unknown) {
  const row = object(value, ['expectedRevision', 'action']);
  return {
    expectedRevision: integer(row.expectedRevision, 2147483646, 1),
    action: choice(row.action, ['start', 'pause', 'stop'] as const),
  };
}
export function intakeBefore(value: unknown) {
  const row = object(value, ['before']);
  return row.before === undefined ? undefined : requireUuid(row.before);
}
export function intakeUploadRevision(value: unknown) {
  const row = object(value, ['expectedRevision']);
  if (
    typeof row.expectedRevision !== 'string' ||
    !/^[1-9]\d{0,9}$/u.test(row.expectedRevision)
  )
    throw new BadRequestException('Invalid intake revision.');
  return integer(Number(row.expectedRevision), 2147483646, 1);
}

export type IntakeTarget = { documentId: string; versionId: string };
type Duplicate =
  | { kind: 'item' | 'source'; id: string }
  | { kind: 'batch'; id: string; itemId: string };
export type IntakeCheckpoint =
  | { stage: 'queued' }
  | { stage: 'registered' | 'linked'; target: IntakeTarget }
  | { stage: 'pdf_stored'; target: IntakeTarget; representationId: string }
  | {
      stage: 'source_stored';
      target: IntakeTarget;
      sourceId: string;
      representationId: string | null;
    };
export type IntakeProgress =
  | IntakeCheckpoint
  | {
      stage: 'complete';
      target: IntakeTarget;
      sourceId: string;
      representationId: string | null;
    }
  | { stage: 'duplicate'; duplicateOf: Duplicate }
  | {
      stage: 'skipped';
      reason: 'duplicate' | 'failed';
      duplicateOf: Duplicate | null;
      retained: IntakeCheckpoint | null;
    };
export type IntakeAttempt =
  | { outcome: 'none' }
  | { outcome: 'pending' | 'complete'; id: string; at: string }
  | {
      outcome: 'failed';
      id: string;
      at: string;
      code: (typeof failureCodes)[number];
    };
export type IntakeItem =
  | {
      kind: 'invalid';
      id: string;
      file: Extract<ReturnType<typeof intakeFile>, { kind: 'invalid' }>;
    }
  | {
      kind: 'file';
      id: string;
      file: IntakeFile;
      keys: { register: string; link: string; upload: string; select: string };
      progress: IntakeProgress;
      attempts: number;
      failureCount: number;
      lastAttempt: IntakeAttempt;
    };
export type IntakeManifest = {
  format: 'DOCUMENT_INTAKE_STATE/1';
  items: IntakeItem[];
};

function target(value: unknown): IntakeTarget {
  const row = object(value, ['documentId', 'versionId']);
  return {
    documentId: requireUuid(row.documentId),
    versionId: requireUuid(row.versionId),
  };
}
function duplicate(value: unknown): Duplicate {
  const row = object(value, ['kind', 'id', 'itemId']);
  if (row.kind === 'batch') {
    if (Object.keys(row).length !== 3)
      throw new BadRequestException('Invalid earlier batch identity.');
    return {
      kind: 'batch',
      id: requireUuid(row.id),
      itemId: requireUuid(row.itemId),
    };
  }
  if (Object.keys(row).length !== 2)
    throw new BadRequestException('Invalid duplicate identity.');
  return {
    kind: choice(row.kind, ['item', 'source'] as const),
    id: requireUuid(row.id),
  };
}
function progress(value: unknown): IntakeProgress {
  const row = object(value, [
    'stage',
    'target',
    'sourceId',
    'representationId',
    'duplicateOf',
    'reason',
    'retained',
  ]);
  const stage = choice(row.stage, stages);
  switch (stage) {
    case 'queued':
      if (Object.keys(row).length !== 1)
        throw new BadRequestException('Invalid queued checkpoint.');
      return { stage };
    case 'registered':
    case 'linked':
      if (Object.keys(row).length !== 2)
        throw new BadRequestException('Invalid registration checkpoint.');
      return { stage, target: target(row.target) };
    case 'pdf_stored':
      if (Object.keys(row).length !== 3)
        throw new BadRequestException('Invalid PDF checkpoint.');
      return {
        stage,
        target: target(row.target),
        representationId: requireUuid(row.representationId),
      };
    case 'source_stored':
    case 'complete':
      if (Object.keys(row).length !== 4)
        throw new BadRequestException('Invalid source checkpoint.');
      return {
        stage,
        target: target(row.target),
        sourceId: requireUuid(row.sourceId),
        representationId:
          row.representationId === null
            ? null
            : requireUuid(row.representationId),
      };
    case 'duplicate':
      if (Object.keys(row).length !== 2)
        throw new BadRequestException('Invalid duplicate checkpoint.');
      return { stage, duplicateOf: duplicate(row.duplicateOf) };
    case 'skipped': {
      if (Object.keys(row).length !== 4)
        throw new BadRequestException('Invalid skipped checkpoint.');
      let retained: IntakeCheckpoint | null = null;
      if (row.retained !== null) {
        const prior = object(row.retained, [
          'stage',
          'target',
          'sourceId',
          'representationId',
        ]);
        if (
          ![
            'queued',
            'registered',
            'linked',
            'pdf_stored',
            'source_stored',
          ].includes(String(prior.stage))
        )
          throw new BadRequestException('Invalid retained checkpoint.');
        const parsed = progress(prior);
        if (
          parsed.stage === 'complete' ||
          parsed.stage === 'duplicate' ||
          parsed.stage === 'skipped'
        )
          throw new BadRequestException('Invalid retained checkpoint.');
        retained = parsed;
      }
      return {
        stage,
        reason: choice(row.reason, ['duplicate', 'failed'] as const),
        duplicateOf:
          row.duplicateOf === null ? null : duplicate(row.duplicateOf),
        retained,
      };
    }
  }
}

export function intakeManifest(value: unknown): IntakeManifest {
  const row = object(value, ['format', 'items']);
  if (
    row.format !== 'DOCUMENT_INTAKE_STATE/1' ||
    !Array.isArray(row.items) ||
    row.items.length < 1 ||
    row.items.length > INTAKE_LIMITS.items
  )
    throw new BadRequestException('Invalid stored intake.');
  const raw: unknown[] = row.items;
  const items: IntakeItem[] = raw.map((value) => {
    const item = object(value, [
      'kind',
      'id',
      'file',
      'keys',
      'progress',
      'attempts',
      'failureCount',
      'lastAttempt',
    ]);
    const id = requireUuid(item.id),
      file = intakeFile(item.file);
    if (item.kind === 'invalid') {
      if (file.kind !== 'invalid' || Object.keys(item).length !== 3)
        throw new BadRequestException('Invalid excluded item.');
      return { kind: 'invalid', id, file };
    }
    if (
      item.kind !== 'file' ||
      file.kind === 'invalid' ||
      Object.keys(item).length !== 8
    )
      throw new BadRequestException('Invalid file checkpoint.');
    const keys = object(item.keys, ['register', 'link', 'upload', 'select']);
    const last = object(item.lastAttempt, ['outcome', 'id', 'at', 'code']);
    const outcome = choice(last.outcome, [
      'none',
      'pending',
      'complete',
      'failed',
    ] as const);
    let lastAttempt: IntakeAttempt;
    if (outcome === 'none') {
      if (Object.keys(last).length !== 1)
        throw new BadRequestException('Invalid intake attempt.');
      lastAttempt = { outcome };
    } else {
      const at = text(last.at, 40),
        attemptId = requireUuid(last.id);
      if (
        !Number.isFinite(Date.parse(at)) ||
        Object.keys(last).length !== (outcome === 'failed' ? 4 : 3)
      )
        throw new BadRequestException('Invalid intake attempt.');
      lastAttempt =
        outcome === 'failed'
          ? {
              outcome,
              id: attemptId,
              at,
              code: choice(last.code, failureCodes),
            }
          : { outcome, id: attemptId, at };
    }
    const parsed = progress(item.progress);
    const effective = parsed.stage === 'skipped' ? parsed.retained : parsed;
    if (
      effective &&
      ((effective.stage === 'pdf_stored' && file.kind !== 'pdf') ||
        ((effective.stage === 'source_stored' ||
          effective.stage === 'complete') &&
          (file.kind === 'pdf') !== (effective.representationId !== null)))
    )
      throw new BadRequestException('Invalid original checkpoint.');
    return {
      kind: 'file',
      id,
      file,
      keys: {
        register: requireUuid(keys.register),
        link: requireUuid(keys.link),
        upload: requireUuid(keys.upload),
        select: requireUuid(keys.select),
      },
      progress: parsed,
      attempts: integer(item.attempts, 100),
      failureCount: integer(item.failureCount, 100),
      lastAttempt,
    };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new BadRequestException('Duplicate intake item.');
  return { format: 'DOCUMENT_INTAKE_STATE/1', items };
}
