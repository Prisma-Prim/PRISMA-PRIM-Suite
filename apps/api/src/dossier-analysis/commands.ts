import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid analysis command.');
  return Object.fromEntries(Object.entries(value));
}
function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new BadRequestException('Invalid analysis command.');
}
export function parseSource(value: unknown): {
  documentId: string;
  documentVersionId: string;
  representationId: string;
  language: 'ro' | 'ru' | 'fr' | 'en';
  caseId: string | null;
  attachmentId: string | null;
} {
  const input = object(value);
  keys(input, [
    'documentId',
    'documentVersionId',
    'representationId',
    'language',
    'caseId',
    'attachmentId',
  ]);
  if (
    input.language !== 'ro' &&
    input.language !== 'ru' &&
    input.language !== 'fr' &&
    input.language !== 'en'
  )
    throw new BadRequestException('Invalid analysis language.');
  if ((input.caseId === undefined) !== (input.attachmentId === undefined))
    throw new BadRequestException('Invalid source association.');
  return {
    documentId: requireUuid(input.documentId),
    documentVersionId: requireUuid(input.documentVersionId),
    representationId: requireUuid(input.representationId),
    language: input.language,
    caseId: input.caseId === undefined ? null : requireUuid(input.caseId),
    attachmentId:
      input.attachmentId === undefined ? null : requireUuid(input.attachmentId),
  };
}
export function parseReview(value: unknown):
  | { expectedRevision: number; decision: 'correct'; replacementValue: string }
  | {
      expectedRevision: number;
      decision: 'confirm' | 'reject';
      replacementValue: null;
    } {
  const input = object(value);
  keys(input, ['expectedRevision', 'decision', 'replacementValue']);
  if (
    typeof input.expectedRevision !== 'number' ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.expectedRevision >= 2147483647
  )
    throw new BadRequestException('Invalid analysis revision.');
  if (input.decision === 'correct') {
    if (
      typeof input.replacementValue !== 'string' ||
      input.replacementValue !== input.replacementValue.trim() ||
      input.replacementValue.length < 1 ||
      input.replacementValue.length > 2000
    )
      throw new BadRequestException('Invalid correction.');
    return {
      expectedRevision: input.expectedRevision,
      decision: input.decision,
      replacementValue: input.replacementValue,
    };
  }
  if (
    (input.decision !== 'confirm' && input.decision !== 'reject') ||
    input.replacementValue !== undefined
  )
    throw new BadRequestException('Invalid analysis decision.');
  return {
    expectedRevision: input.expectedRevision,
    decision: input.decision,
    replacementValue: null,
  };
}

export function parseDocxSource(value: unknown): {
  documentId: string;
  documentVersionId: string;
  fileName: string;
  language: 'ro' | 'ru' | 'fr' | 'en';
  caseId: string | null;
  attachmentId: string | null;
} {
  const input = object(value);
  keys(input, [
    'documentId',
    'documentVersionId',
    'fileName',
    'language',
    'caseId',
    'attachmentId',
  ]);
  if (
    typeof input.fileName !== 'string' ||
    input.fileName !== input.fileName.trim() ||
    input.fileName.length < 6 ||
    input.fileName.length > 120 ||
    !/\.docx$/iu.test(input.fileName) ||
    /[\p{Cc}\p{Cf}/\\]/u.test(input.fileName)
  )
    throw new BadRequestException('Choose a safe DOCX filename.');
  if (
    input.language !== 'ro' &&
    input.language !== 'ru' &&
    input.language !== 'fr' &&
    input.language !== 'en'
  )
    throw new BadRequestException('Invalid analysis language.');
  if ((input.caseId === undefined) !== (input.attachmentId === undefined))
    throw new BadRequestException('Invalid source association.');
  return {
    documentId: requireUuid(input.documentId),
    documentVersionId: requireUuid(input.documentVersionId),
    fileName: input.fileName,
    language: input.language,
    caseId: input.caseId === undefined ? null : requireUuid(input.caseId),
    attachmentId:
      input.attachmentId === undefined ? null : requireUuid(input.attachmentId),
  };
}
