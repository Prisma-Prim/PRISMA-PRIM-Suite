import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import {
  optionalAttribution,
  requireIndependenceAttestation,
} from './certification-attribution.js';
import { calendarDate, inputObject } from './certification.validation.js';
import type { CertificateText } from './certification-decision.js';
import type { CertificationActorReference } from './certification.types.js';
import type { ExchangeRecordVersion } from './certification-exchanges.js';
import { findingCommand } from './certification-findings.js';

export function certificateRevisionCommand(value: unknown) {
  const command = findingCommand(value, (payload) =>
    inputObject(payload, [
      'revisedOn',
      'attachmentId',
      'revisionMarked',
      'independenceAttested',
      'onBehalf',
    ]),
  );
  return {
    expectedRevision: command.expectedRevision,
    value: certificateRevisionValue({
      ...command.payload,
      reason: command.reason,
    }),
  };
}

/** A correction never receives authority to replace the issuance identity. */
export function certificateRevisionValue(value: unknown) {
  const body = inputObject(value, [
    'reason',
    'revisedOn',
    'attachmentId',
    'revisionMarked',
    'independenceAttested',
    'onBehalf',
  ]);
  if (
    typeof body.reason !== 'string' ||
    !body.reason.trim() ||
    body.reason.length > 2000 ||
    !calendarDate(body.revisedOn) ||
    typeof body.revisionMarked !== 'boolean'
  )
    throw new BadRequestException({
      code: 'INVALID_CERTIFICATION_INPUT',
      message: 'Invalid certification input.',
    });
  return {
    reason: body.reason.trim(),
    revisedOn: body.revisedOn,
    attachmentId: requireUuid(body.attachmentId),
    revisionMarked: body.revisionMarked,
    independenceAttested: requireIndependenceAttestation(
      body.independenceAttested,
    ),
    onBehalf: optionalAttribution(body.onBehalf),
  };
}

export type CertificateRevision = ReturnType<
  typeof certificateRevisionValue
> & {
  id: string;
  index: number;
  caseRevision: number;
  texts: CertificateText[];
  decisionVersionId: string;
  certificateDataVersionId: string;
  recordedBy: CertificationActorReference;
  recordedAt: string;
  transmission: ExchangeRecordVersion | null;
};
