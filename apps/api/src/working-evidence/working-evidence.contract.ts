import { HttpException } from '@nestjs/common';

export function refuse(
  code:
    | 'invalid_request'
    | 'conflict'
    | 'new_use_unavailable'
    | 'not_found'
    | 'content_unavailable',
): never {
  throw new HttpException(
    { code },
    {
      invalid_request: 400,
      conflict: 409,
      new_use_unavailable: 409,
      not_found: 404,
      content_unavailable: 503,
    }[code],
  );
}
export function object(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((k) => !(k in value))
  )
    return refuse('invalid_request');
  return Object.fromEntries(Object.entries(value));
}
export function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    return refuse('invalid_request');
  return value;
}
export function literal(value: unknown, max: number): string {
  if (typeof value !== 'string') return refuse('invalid_request');
  const text = value.trim();
  if (
    !text ||
    text.length > max ||
    /\0|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
      text,
    )
  )
    return refuse('invalid_request');
  return text;
}
export function nullable(value: unknown, max: number): string | null {
  return value === null ? null : literal(value, max);
}
export function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    return refuse('invalid_request');
  return value;
}
export function support(value: unknown) {
  const v = object(value, [
    'documentId',
    'versionId',
    'representationId',
    'locator',
    'supportNote',
  ]);
  return {
    documentId: uuid(v.documentId),
    versionId: uuid(v.versionId),
    representationId: uuid(v.representationId),
    locator: nullable(v.locator, 500),
    supportNote: literal(v.supportNote, 2000),
  };
}
export function values(value: unknown) {
  const v = object(value, [
    'title',
    'declaredContext',
    'process',
    'statement',
    'observationNote',
    'supports',
  ]);
  if (
    !Array.isArray(v.supports) ||
    v.supports.length < 1 ||
    v.supports.length > 3
  )
    return refuse('invalid_request');
  const supports = v.supports.map(support);
  if (
    new Set(
      supports.map((x) =>
        [x.documentId, x.versionId, x.representationId].join('/'),
      ),
    ).size !== supports.length
  )
    return refuse('invalid_request');
  return {
    title: literal(v.title, 200),
    declaredContext: nullable(v.declaredContext, 2000),
    process: literal(v.process, 200),
    statement: literal(v.statement, 2000),
    observationNote: nullable(v.observationNote, 2000),
    supports,
  };
}
export function command(value: unknown, action: 'RECORD' | 'CORRECT') {
  if (Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8') > 262144)
    return refuse('invalid_request');
  const v = object(
    value,
    action === 'RECORD'
      ? ['format', 'commandId', 'expectedRevision', 'values']
      : ['format', 'commandId', 'expectedRevision', 'reason', 'values'],
  );
  if (v.format !== 'WORKING_EVIDENCE_CASE_COMMAND/1')
    return refuse('invalid_request');
  const common = {
    format: 'WORKING_EVIDENCE_CASE_COMMAND/1',
    commandId: uuid(v.commandId),
    values: values(v.values),
  };
  return action === 'RECORD'
    ? {
        ...common,
        action,
        expectedRevision: integer(v.expectedRevision, 0, 0),
        reason: null,
      }
    : {
        ...common,
        action,
        expectedRevision: integer(v.expectedRevision, 1, 2147483646),
        reason: literal(v.reason, 2000),
      };
}
export type CaseCommand = ReturnType<typeof command>;
export function readIntent(value: unknown) {
  return persisted(() => {
    const v = object(value, [
      'format',
      'companyId',
      'action',
      'target',
      'expectedRevision',
      'reason',
      'values',
    ]);
    if (
      v.format !== 'WORKING_EVIDENCE_CASE_INTENT/1' ||
      (v.action !== 'RECORD' && v.action !== 'CORRECT')
    )
      return refuse('content_unavailable');
    const parsed = command(
      {
        format: 'WORKING_EVIDENCE_CASE_COMMAND/1',
        commandId: '00000000-0000-0000-0000-000000000000',
        expectedRevision: v.expectedRevision,
        values: v.values,
        ...(v.action === 'CORRECT' ? { reason: v.reason } : {}),
      },
      v.action,
    );
    if (v.action === 'RECORD' && v.reason !== null)
      return refuse('content_unavailable');
    return {
      format: 'WORKING_EVIDENCE_CASE_INTENT/1',
      companyId: uuid(v.companyId),
      action: parsed.action,
      target: uuid(v.target),
      expectedRevision: parsed.expectedRevision,
      reason: parsed.reason,
      values: parsed.values,
    };
  });
}
export function readReceipt(value: unknown) {
  return persisted(() => {
    const v = object(value, [
      'format',
      'commandId',
      'caseId',
      'revisionId',
      'revisionNumber',
      'action',
      'recordedAt',
    ]);
    if (
      v.format !== 'WORKING_EVIDENCE_CASE_RECEIPT/1' ||
      (v.action !== 'RECORD' && v.action !== 'CORRECT') ||
      typeof v.recordedAt !== 'string' ||
      !Number.isFinite(Date.parse(v.recordedAt)) ||
      (typeof v.recordedAt === 'string' &&
        Number.isFinite(Date.parse(v.recordedAt)) &&
        new Date(v.recordedAt).toISOString() !== v.recordedAt)
    )
      return refuse('content_unavailable');
    return {
      format: 'WORKING_EVIDENCE_CASE_RECEIPT/1',
      commandId: uuid(v.commandId),
      caseId: uuid(v.caseId),
      revisionId: uuid(v.revisionId),
      revisionNumber: integer(v.revisionNumber, 1, 2147483647),
      action: v.action,
      recordedAt: v.recordedAt,
    };
  });
}
export function readSupportView(value: unknown) {
  return persisted(() => {
    const v = object(value, [
      'evidenceId',
      'documentId',
      'versionId',
      'versionNumber',
      'representationId',
      'sourceTitle',
      'sourcePurpose',
      'filename',
      'mediaType',
      'sizeBytes',
      'sha256',
      'locator',
      'supportNote',
    ]);
    if (
      v.mediaType !== 'application/pdf' ||
      typeof v.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(v.sha256)
    )
      return refuse('content_unavailable');
    return {
      evidenceId: uuid(v.evidenceId),
      documentId: uuid(v.documentId),
      versionId: uuid(v.versionId),
      versionNumber: integer(v.versionNumber, 1, 50),
      representationId: uuid(v.representationId),
      sourceTitle: literal(v.sourceTitle, 200),
      sourcePurpose: literal(v.sourcePurpose, 2000),
      filename: literal(v.filename, 120),
      mediaType: 'application/pdf',
      sizeBytes: integer(v.sizeBytes, 1, 5242880),
      sha256: v.sha256,
      locator: nullable(v.locator, 500),
      supportNote: literal(v.supportNote, 2000),
    };
  });
}
export type SupportView = ReturnType<typeof readSupportView>;
export function noQuery(value: unknown): void {
  object(value, []);
}
export function cursorQuery(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return refuse('invalid_request');
  const keys = Object.keys(value);
  if (!keys.length) return null;
  const v = object(value, ['cursor']);
  if (typeof v.cursor !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(v.cursor))
    return refuse('invalid_request');
  return v.cursor;
}

function persisted<T>(read: () => T): T {
  try {
    return read();
  } catch {
    return refuse('content_unavailable');
  }
}
