import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import {
  exactRecord,
  modelInteger,
  text,
} from '../contract-model/contract-model.content.js';

export function readModelContractCase(value: unknown) {
  const input = exactRecord(
    value,
    [
      'documentDate',
      'clientDetails',
      'sourceConcordanceDeclaration',
      'sourceConcordanceBasis',
    ],
    ['termStartsOn', 'termEndsOn', 'specialConditions'],
  );
  if (input.sourceConcordanceDeclaration !== true) throw invalid();
  const result = {
    documentDate: calendarDate(input.documentDate),
    clientDetails: text(input.clientDetails, 4_000),
    termStartsOn: optionalDate(input.termStartsOn),
    termEndsOn: optionalDate(input.termEndsOn),
    specialConditions:
      input.specialConditions == null
        ? null
        : text(input.specialConditions, 4_000),
    sourceConcordanceDeclaration: true,
    sourceConcordanceBasis: text(input.sourceConcordanceBasis, 2_000),
  } satisfies { sourceConcordanceDeclaration: true } & Record<string, unknown>;
  if (
    result.termStartsOn &&
    result.termEndsOn &&
    result.termEndsOn < result.termStartsOn
  )
    throw invalid();
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 16 * 1_024)
    throw invalid();
  return result;
}
export function readModelContractPreparation(
  value: unknown,
  successor: boolean,
) {
  const input = exactRecord(
    value,
    [
      'sourceOfferVersionId',
      'modelVersionId',
      'modelVersionNumber',
      'modelApprovalDecisionId',
      'documentDate',
      'clientDetails',
      'sourceConcordanceDeclaration',
      'sourceConcordanceBasis',
      ...(successor ? ['expectedContractRevision'] : []),
    ],
    ['termStartsOn', 'termEndsOn', 'specialConditions'],
  );
  return {
    sourceOfferVersionId: requireUuid(input.sourceOfferVersionId),
    modelVersionId: requireUuid(input.modelVersionId),
    modelVersionNumber: modelInteger(input.modelVersionNumber, 1),
    modelApprovalDecisionId: requireUuid(input.modelApprovalDecisionId),
    expectedContractRevision: successor
      ? modelInteger(input.expectedContractRevision, 1)
      : null,
    caseDetails: readModelContractCase({
      documentDate: input.documentDate,
      clientDetails: input.clientDetails,
      termStartsOn: input.termStartsOn,
      termEndsOn: input.termEndsOn,
      specialConditions: input.specialConditions,
      sourceConcordanceDeclaration: input.sourceConcordanceDeclaration,
      sourceConcordanceBasis: input.sourceConcordanceBasis,
    }),
  };
}
function optionalDate(value: unknown) {
  return value == null ? null : calendarDate(value);
}
export function calendarDate(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    value.startsWith('0000') ||
    !Number.isFinite(Date.parse(value + 'T00:00:00.000Z')) ||
    new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) !== value
  )
    throw invalid();
  return value;
}
function invalid() {
  return new BadRequestException({
    code: 'CONTRACT_MODEL_CASE_INVALID',
    message:
      'Complete the Contract case details and explicit concordance declaration.',
  });
}
