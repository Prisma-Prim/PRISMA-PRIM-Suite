import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import {
  DISCREPANCY_VERDICTS,
  type CorrectingReference,
  type DiscrepancyVerdict,
  type ManualStatedValue,
} from './certification-consistency.js';
import { inputObject } from './certification.validation.js';

const MAX_REVISION = 2147483646;

export interface ManualDiscrepancyInput {
  expectedRevision: number;
  verdict: DiscrepancyVerdict;
  subject: string;
  left: ManualStatedValue;
  right: ManualStatedValue;
  note: string | null;
}

export type ResolutionInput = {
  expectedRevision: number;
  discrepancyId: string;
  reason: string;
} & (
  | {
      resolution: 'accepted';
      correctedBy: null;
      /** Adds a Re-verification Item linked to the accepted Discrepancy. */
      reverify: boolean;
    }
  | {
      resolution: 'corrected';
      correctedBy: CorrectingReference;
      reverify: false;
    }
);

/** A manual Discrepancy: two stated values, each on an exact attached PDF. */
export function manualDiscrepancyCommand(
  value: unknown,
): ManualDiscrepancyInput {
  const body = inputObject(value, [
    'expectedRevision',
    'verdict',
    'subject',
    'left',
    'right',
    'note',
  ]);
  const verdict = DISCREPANCY_VERDICTS.find((entry) => entry === body.verdict);
  if (verdict === undefined) return invalid();
  return {
    expectedRevision: revision(body.expectedRevision),
    verdict,
    subject: text(body.subject, 200),
    left: stated(body.left),
    right: stated(body.right),
    note: optionalText(body.note, 2000),
  };
}

/**
 * A resolution: an acceptance with its reason, or the correction of a manual
 * Discrepancy naming the attached Document Version or record version.
 */
export function resolutionCommand(value: unknown): ResolutionInput {
  const body = inputObject(value, [
    'expectedRevision',
    'discrepancyId',
    'resolution',
    'reason',
    'correctedBy',
    'reverify',
  ]);
  const base = {
    expectedRevision: revision(body.expectedRevision),
    discrepancyId: discrepancyIdentity(body.discrepancyId),
    reason: text(body.reason, 2000),
  };
  const reverify = body.reverify ?? false;
  if (typeof reverify !== 'boolean') return invalid();
  if (body.resolution === 'accepted') {
    if (body.correctedBy !== undefined && body.correctedBy !== null)
      return invalid();
    return { ...base, resolution: 'accepted', correctedBy: null, reverify };
  }
  if (body.resolution !== 'corrected' || reverify) return invalid();
  const reference = inputObject(body.correctedBy, [
    'attachmentId',
    'stepVersionId',
  ]);
  const hasAttachment = reference.attachmentId !== undefined;
  if (hasAttachment === (reference.stepVersionId !== undefined))
    return invalid();
  return {
    ...base,
    resolution: 'corrected',
    reverify: false,
    correctedBy: hasAttachment
      ? {
          kind: 'attachment',
          attachmentId: requireUuid(reference.attachmentId),
        }
      : { kind: 'step', versionId: requireUuid(reference.stepVersionId) },
  };
}

function discrepancyIdentity(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^(R\d{2}:[0-9a-f]{32}|manual:[0-9a-f-]{36})$/u.test(value)
  )
    return invalid();
  if (value.startsWith('manual:')) requireUuid(value.slice('manual:'.length));
  return value;
}

function stated(value: unknown): ManualStatedValue {
  const body = inputObject(value, ['value', 'attachmentId', 'location']);
  return {
    value: text(body.value, 1000),
    attachmentId: requireUuid(body.attachmentId),
    location: optionalText(body.location, 200),
  };
}

function revision(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_REVISION
  )
    return invalid();
  return value;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    return invalid();
  return value;
}

function optionalText(value: unknown, limit: number): string | null {
  return value === undefined || value === null ? null : text(value, limit);
}

function invalid(): never {
  throw new BadRequestException({
    code: 'INVALID_CERTIFICATION_INPUT',
    message: 'Invalid certification input.',
  });
}
