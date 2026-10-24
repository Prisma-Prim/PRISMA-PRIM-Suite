import { InternalServerErrorException } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { offerVersions } from '../database/schema/index.js';
import {
  exactRecord,
  readOfferModelContent,
} from '../offer-model/offer-model.content.js';
import {
  modelOfferFinancials,
  readModelOfferFinancialDeclaration,
} from './model-offer-financials.js';
import {
  MODEL_OFFER_RENDERER,
  type ModelOfferRepresentation,
  renderModelOfferRepresentation,
  type ApprovedOfferModelSource,
} from './model-offer-representation.js';
import {
  storedApprovedEstimatePrice,
  storedRecipient,
} from './offer-stored-content.js';

type VersionRow = typeof offerVersions.$inferSelect;

/** Decode the entire immutable format, including exact renderer bytes. No live sources. */
export function storedModelOfferSnapshot(
  row: VersionRow,
  illustrativeReference: number,
) {
  try {
    return readStoredSnapshot(row, illustrativeReference);
  } catch {
    throw new InternalServerErrorException({
      code: 'OFFER_STORED_CONTENT_INVALID',
      message: 'The stored generated Offer is invalid.',
    });
  }
}
function readStoredSnapshot(row: VersionRow, illustrativeReference: number) {
  if (row.provenance !== 'COMPANY_MODEL_ESTIMATE') throw invalid();
  const snapshot = exactRecord(row.modelGenerationSnapshot, [
    'modelSource',
    'financialDeclaration',
    'representation',
  ]);
  const source = exactRecord(snapshot.modelSource, [
    'kind',
    'modelId',
    'code',
    'language',
    'versionId',
    'versionNumber',
    'approvalDecisionId',
    'approvedAt',
    'approvedBy',
    'content',
  ]);
  const approver = exactRecord(source.approvedBy, [
    'workspaceMembershipId',
    'internalUserId',
  ]);
  if (
    source.kind !== 'APPROVED_COMPANY_OFFER_MODEL' ||
    source.code !== 'INTEGRATED_MANAGEMENT_CONSULTING_RO' ||
    source.language !== 'ro' ||
    source.modelId !== row.modelSourceId ||
    source.versionId !== row.modelSourceVersionId ||
    source.versionNumber !== row.modelSourceVersionNumber ||
    source.approvalDecisionId !== row.modelSourceDecisionId ||
    row.modelSourceDecisionOutcome !== 'APPROVE' ||
    typeof source.versionNumber !== 'number' ||
    !Number.isSafeInteger(source.versionNumber) ||
    source.versionNumber < 1
  )
    throw invalid();
  const modelSource = {
    kind: source.kind,
    modelId: uuid(source.modelId),
    code: source.code,
    language: source.language,
    versionId: uuid(source.versionId),
    versionNumber: source.versionNumber,
    approvalDecisionId: uuid(source.approvalDecisionId),
    approvedAt: instant(source.approvedAt),
    approvedBy: {
      workspaceMembershipId: uuid(approver.workspaceMembershipId),
      internalUserId: uuid(approver.internalUserId),
    },
    content: readOfferModelContent(source.content),
  } satisfies ApprovedOfferModelSource;
  // Unlike the legacy internal draft, this variant declares its own tax meaning.
  const priceSource = storedApprovedEstimatePrice(row);
  const financial = exactRecord(snapshot.financialDeclaration, [
    'kind',
    'netAmountConfirmed',
    'taxAmount',
    'taxLabel',
    'basis',
    'netAmount',
    'grossAmount',
    'currency',
    'declaredBy',
    'declaredAt',
  ]);
  const declaration = readModelOfferFinancialDeclaration({
    kind: financial.kind,
    netAmountConfirmed: financial.netAmountConfirmed,
    taxAmount: financial.taxAmount,
    taxLabel: financial.taxLabel,
    basis: financial.basis,
  });
  const financialDeclaration = modelOfferFinancials({
    netAmount: priceSource.amount,
    currency: priceSource.currency,
    declaration,
    actorWorkspaceMembershipId: row.createdByWorkspaceMembershipId,
    actorInternalUserId: row.createdByInternalUserId,
    declaredAt: row.createdAt.toISOString(),
  });
  const expectedRepresentation = renderModelOfferRepresentation({
    modelSource,
    priceSource,
    financialDeclaration,
    illustrativeReference,
    versionNumber: row.versionNumber,
    recipient: storedRecipient(row),
    createdAt: row.createdAt.toISOString(),
    validUntil: row.validUntil.toISOString(),
    scopeNote: row.scopeNote,
    commercialConditions: row.commercialConditions,
  });
  const saved = exactRecord(snapshot.representation, [
    'rendererCode',
    'rendererVersion',
    'html',
    'sha256',
  ]);
  if (
    saved.rendererCode !== MODEL_OFFER_RENDERER ||
    saved.rendererVersion !== 1 ||
    typeof saved.html !== 'string' ||
    typeof saved.sha256 !== 'string'
  )
    throw invalid();
  const representation = {
    rendererCode: saved.rendererCode,
    rendererVersion: 1,
    html: saved.html,
    sha256: saved.sha256,
  } satisfies ModelOfferRepresentation;
  if (
    !isDeepStrictEqual(source, modelSource) ||
    !isDeepStrictEqual(financial, financialDeclaration) ||
    !isDeepStrictEqual(saved, expectedRepresentation)
  )
    throw invalid();
  // Return the stored exact bytes after proving their complete frozen binding.
  return { modelSource, financialDeclaration, representation, priceSource };
}

function uuid(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      value,
    )
  )
    throw invalid();
  return value;
}
function instant(value: unknown) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw invalid();
  return value;
}
function invalid() {
  return new Error('The stored generated Offer is invalid.');
}
