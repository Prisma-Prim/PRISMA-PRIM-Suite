import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import {
  optionalAttribution,
  requireIndependenceAttestation,
} from './certification-attribution.js';
import { calendarDate, inputObject } from './certification.validation.js';
import {
  OPINION_SKIP_REASONS,
  type CertificateDraftValue,
  type ClientOpinionValue,
  type CertificateDraftApprovalValue,
} from './certification-release.js';

export function certificateDraft(value: unknown): CertificateDraftValue {
  const body = inputObject(value, [
    'attachmentId',
    'number',
    'decisionVersionId',
    'certificateDataVersionId',
    'draftedOn',
  ]);
  return {
    attachmentId: requireUuid(body.attachmentId),
    number: text(body.number, 64),
    decisionVersionId: requireUuid(body.decisionVersionId),
    certificateDataVersionId: requireUuid(body.certificateDataVersionId),
    draftedOn: date(body.draftedOn),
  };
}
export function clientOpinion(value: unknown): ClientOpinionValue {
  const body = inputObject(value, [
    'draftVersionId',
    'businessDate',
    'outcome',
    'exchangeRecordId',
    'requestedChange',
    'skipReason',
    'note',
  ]);
  const base = {
    draftVersionId: requireUuid(body.draftVersionId),
    businessDate: date(body.businessDate),
  };
  switch (body.outcome) {
    case 'agreed':
      if (
        body.skipReason !== undefined ||
        body.note !== undefined ||
        body.requestedChange !== undefined
      )
        return invalid();
      return {
        ...base,
        outcome: 'agreed',
        exchangeRecordId: requireUuid(body.exchangeRecordId),
      };
    case 'changes_requested':
      if (body.skipReason !== undefined || body.note !== undefined)
        return invalid();
      return {
        ...base,
        outcome: 'changes_requested',
        exchangeRecordId: requireUuid(body.exchangeRecordId),
        requestedChange: text(body.requestedChange, 2000),
      };
    case 'skipped': {
      if (
        body.exchangeRecordId !== undefined ||
        body.requestedChange !== undefined
      )
        return invalid();
      const skipReason = OPINION_SKIP_REASONS.find(
        (known) => known === body.skipReason,
      );
      if (!skipReason) return invalid();
      const note =
        body.note === undefined || body.note === null
          ? null
          : text(body.note, 2000);
      if (skipReason === 'other' && note === null) return invalid();
      return { ...base, outcome: 'skipped', skipReason, note };
    }
    default:
      return invalid();
  }
}
export function certificateDraftApproval(
  value: unknown,
): CertificateDraftApprovalValue {
  const body = inputObject(value, [
    'draftVersionId',
    'approvedOn',
    'textsConfirmed',
    'numberConfirmed',
    'validityConfirmed',
    'independenceAttested',
    'onBehalf',
  ]);
  if (
    body.textsConfirmed !== true ||
    body.numberConfirmed !== true ||
    body.validityConfirmed !== true
  )
    return invalid();
  return {
    draftVersionId: requireUuid(body.draftVersionId),
    approvedOn: date(body.approvedOn),
    textsConfirmed: true,
    numberConfirmed: true,
    validityConfirmed: true,
    independenceAttested: requireIndependenceAttestation(
      body.independenceAttested,
    ),
    onBehalf: optionalAttribution(body.onBehalf),
  };
}
function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    return invalid();
  return value.trim();
}
function date(value: unknown): string {
  if (!calendarDate(value)) return invalid();
  return value;
}
function invalid(): never {
  throw new BadRequestException({
    code: 'INVALID_CERTIFICATION_INPUT',
    message: 'Invalid certification input.',
  });
}
