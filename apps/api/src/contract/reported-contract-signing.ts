import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import { exactRecord, text } from '../contract-model/contract-model.content.js';
import { readContractWarningCodes } from './contract-decision.js';

/** A human statement, never verified signature or mandate evidence. */
export function readReportedContractSigning(value: unknown) {
  const input = exactRecord(value, [
    'expectedContractRevision',
    'documentId',
    'documentVersionId',
    'representationId',
    'providerSignatory',
    'clientSignatory',
    'concordanceBasis',
    'acceptanceBasis',
    'acknowledgedWarningCodes',
  ]);
  return {
    expectedContractRevision: revision(input.expectedContractRevision),
    documentId: requireUuid(input.documentId),
    documentVersionId: requireUuid(input.documentVersionId),
    representationId: requireUuid(input.representationId),
    providerSignatory: readReportedSignatory(input.providerSignatory),
    clientSignatory: readReportedSignatory(input.clientSignatory),
    concordanceBasis: text(input.concordanceBasis, 2000),
    acceptanceBasis: text(input.acceptanceBasis, 2000),
    acknowledgedWarningCodes: readContractWarningCodes(
      input.acknowledgedWarningCodes,
      true,
    ),
  };
}
export function readReportedSignatory(value: unknown) {
  const input = exactRecord(value, ['label', 'signedOn', 'mandate']);
  const mandate = exactRecord(input.mandate, ['kind'], ['basis']);
  const known =
    mandate.kind === 'UNKNOWN'
      ? (exactRecord(input.mandate, ['kind']), { kind: 'UNKNOWN' as const })
      : mandate.kind === 'DECLARED_UNVERIFIED'
        ? {
            kind: 'DECLARED_UNVERIFIED' as const,
            basis: text(mandate.basis, 2000),
          }
        : undefined;
  if (!known)
    throw new BadRequestException({
      code: 'INVALID_SIGNING_DECLARATION',
      field: 'mandate',
    });
  return {
    label: text(input.label, 200),
    signedOn: reportedSigningDate(input.signedOn),
    mandate: known,
  };
}
function reportedSigningDate(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== 'string' ||
    !/^(?!0000)\d{4}-\d{2}-\d{2}$/u.test(value) ||
    !Number.isFinite(Date.parse(value + 'T00:00:00.000Z')) ||
    new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) !== value
  )
    throw new BadRequestException({
      code: 'INVALID_SIGNING_DECLARATION',
      field: 'signedOn',
    });
  return value;
}
export function requireReportedSigningDates(
  command: ReturnType<typeof readReportedContractSigning>,
  recordedAt: Date,
) {
  for (const signatory of [command.providerSignatory, command.clientSignatory])
    if (
      signatory.signedOn !== null &&
      signatory.signedOn > recordedAt.toISOString().slice(0, 10)
    )
      throw new BadRequestException({
        code: 'INVALID_SIGNING_DECLARATION',
        field: 'signedOn',
      });
}

function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new BadRequestException({
      code: 'INVALID_SIGNING_DECLARATION',
      field: 'expectedContractRevision',
    });
  return value;
}
