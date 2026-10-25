import { InternalServerErrorException } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { requireUuid } from '../access/access-command-validation.js';
import {
  exactRecord,
  modelInteger,
  readContractModelContent,
  text,
} from '../contract-model/contract-model.content.js';
import { contracts, contractVersions } from '../database/schema/index.js';
import { readModelContractCase } from './model-contract-case.js';
import {
  renderModelContractRepresentation,
  type ApprovedContractModelSource,
  type ModelContractOfferSource,
} from './model-contract-representation.js';

export function storedModelContractSnapshot(
  contract: typeof contracts.$inferSelect,
  version: typeof contractVersions.$inferSelect,
) {
  try {
    return readSnapshot(contract, version);
  } catch {
    throw new InternalServerErrorException({
      code: 'CONTRACT_STORED_CONTENT_INVALID',
      message: 'The stored generated Contract is invalid.',
    });
  }
}
function readSnapshot(
  contract: typeof contracts.$inferSelect,
  version: typeof contractVersions.$inferSelect,
) {
  if (
    contract.origin !== 'COMPANY_MODEL_OFFER' ||
    contract.kind !== 'CONTRACT' ||
    version.provenance !== 'COMPANY_MODEL_OFFER' ||
    version.templateCode !== 'COMPANY_CONSULTING_CONTRACT_RO' ||
    version.templateVersion !== 1 ||
    version.pricingSnapshotId !== null ||
    version.executionState !== 'NOT_EXECUTED'
  )
    throw invalid();
  const snapshot = exactRecord(version.modelGenerationSnapshot, [
    'modelSource',
    'offerSource',
    'caseDetails',
    'financials',
    'representation',
  ]);
  const m = exactRecord(snapshot.modelSource, [
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
  if (
    m.kind !== 'APPROVED_COMPANY_CONTRACT_MODEL' ||
    m.code !== 'INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO' ||
    m.language !== 'ro'
  )
    throw invalid();
  const modelSource = {
    kind: m.kind,
    code: m.code,
    language: m.language,
    modelId: requireUuid(m.modelId),
    versionId: requireUuid(m.versionId),
    versionNumber: modelInteger(m.versionNumber, 1),
    approvalDecisionId: requireUuid(m.approvalDecisionId),
    approvedAt: instant(m.approvedAt),
    approvedBy: actor(m.approvedBy),
    content: readContractModelContent(m.content),
  } satisfies ApprovedContractModelSource;
  const offerSource = readOfferCopy(snapshot.offerSource);
  const caseDetails = readModelContractCase(snapshot.caseDetails);
  const financials = offerSource.financials;
  if (
    modelSource.modelId !== version.modelSourceId ||
    modelSource.versionId !== version.modelSourceVersionId ||
    modelSource.versionNumber !== version.modelSourceVersionNumber ||
    modelSource.approvalDecisionId !== version.modelSourceDecisionId ||
    version.modelSourceDecisionOutcome !== 'APPROVE' ||
    offerSource.workspaceId !== version.workspaceId ||
    offerSource.companyId !== version.companyId ||
    offerSource.opportunityId !== version.opportunityId ||
    offerSource.originalClientAccountId !== contract.originalClientAccountId ||
    offerSource.clientRequestId !== contract.clientRequestId ||
    offerSource.offerId !== contract.sourceOfferId ||
    offerSource.offerVersionId !== version.sourceOfferVersionId ||
    caseDetails.termStartsOn !== version.termStartsOn ||
    caseDetails.termEndsOn !== version.termEndsOn ||
    caseDetails.specialConditions !== version.specialConditions ||
    offerSource.scopeNote !== version.scopeNote ||
    offerSource.commercialConditions !== version.commercialConditions ||
    !isDeepStrictEqual(snapshot.financials, financials)
  )
    throw invalid();
  const recipient = {
    legalName: version.recipientLegalName,
    taxId: version.recipientTaxId,
    legalAddress: version.recipientLegalAddress,
    ...(version.recipientKind === 'PRIMARY' &&
    version.recipientAdditionalLegalEntityId === null
      ? { kind: 'PRIMARY' as const }
      : version.recipientKind === 'ADDITIONAL' &&
          version.recipientAdditionalLegalEntityId
        ? {
            kind: 'ADDITIONAL' as const,
            additionalLegalEntityId: version.recipientAdditionalLegalEntityId,
          }
        : fail()),
  };
  if (
    recipient.kind !== offerSource.recipient.kind ||
    (recipient.kind === 'ADDITIONAL' &&
      (offerSource.recipient.kind !== 'ADDITIONAL' ||
        recipient.additionalLegalEntityId !==
          offerSource.recipient.additionalLegalEntityId))
  )
    throw invalid();
  const representation = renderModelContractRepresentation({
    modelSource,
    offerSource,
    caseDetails,
    recipient,
    illustrativeReference: contract.illustrativeReference,
    versionNumber: version.versionNumber,
    createdAt: version.createdAt.toISOString(),
  });
  const result = {
    modelSource,
    offerSource,
    caseDetails,
    financials,
    representation,
  };
  if (!isDeepStrictEqual(snapshot, result)) throw invalid();
  return result;
}

function readOfferCopy(value: unknown): ModelContractOfferSource {
  const o = exactRecord(value, [
    'workspaceId',
    'companyId',
    'opportunityId',
    'originalClientAccountId',
    'clientRequestId',
    'offerId',
    'offerVersionId',
    'offerVersionNumber',
    'illustrativeReference',
    'representationSha256',
    'recipient',
    'scopeNote',
    'commercialConditions',
    'model',
    'priceSource',
    'financials',
  ]);
  const p = exactRecord(o.priceSource, [
    'kind',
    'estimateId',
    'estimateVersionId',
    'estimateVersionNumber',
    'approvalDecisionId',
    'approvedAt',
    'amount',
    'currency',
  ]);
  if (p.kind !== 'DIRECTOR_APPROVED_ESTIMATE') throw invalid();
  const f = exactRecord(o.financials, [
    'netAmount',
    'taxAmount',
    'grossAmount',
    'taxLabel',
    'currency',
  ]);
  const financials = {
    netAmount: money(f.netAmount),
    taxAmount: money(f.taxAmount),
    grossAmount: money(f.grossAmount),
    taxLabel: text(f.taxLabel, 200),
    currency: currency(f.currency),
  };
  const gross =
    BigInt(financials.netAmount.replace('.', '')) +
    BigInt(financials.taxAmount.replace('.', ''));
  if (
    financials.grossAmount !==
      `${gross / 100n}.${String(gross % 100n).padStart(2, '0')}` ||
    p.amount !== financials.netAmount ||
    p.currency !== financials.currency
  )
    throw invalid();
  const priceSource = {
    kind: p.kind,
    estimateId: requireUuid(p.estimateId),
    estimateVersionId: requireUuid(p.estimateVersionId),
    estimateVersionNumber: modelInteger(p.estimateVersionNumber, 1),
    approvalDecisionId: requireUuid(p.approvalDecisionId),
    approvedAt: instant(p.approvedAt),
    amount: financials.netAmount,
    currency: financials.currency,
  } satisfies ModelContractOfferSource['priceSource'];
  const m = exactRecord(o.model, [
    'modelId',
    'versionId',
    'versionNumber',
    'approvalDecisionId',
    'approvedAt',
    'approvedBy',
    'issuer',
    'serviceTitle',
    'frameworks',
  ]);
  const issuer = exactRecord(m.issuer, [
    'legalName',
    'taxId',
    'legalAddress',
    'contactDetails',
  ]);
  if (
    !Array.isArray(m.frameworks) ||
    m.frameworks.length < 1 ||
    m.frameworks.length > 10
  )
    throw invalid();
  const model = {
    modelId: requireUuid(m.modelId),
    versionId: requireUuid(m.versionId),
    versionNumber: modelInteger(m.versionNumber, 1),
    approvalDecisionId: requireUuid(m.approvalDecisionId),
    approvedAt: instant(m.approvedAt),
    approvedBy: actor(m.approvedBy),
    issuer: {
      legalName: text(issuer.legalName, 300),
      taxId: text(issuer.taxId, 100),
      legalAddress: text(issuer.legalAddress, 1000),
      contactDetails: nullableText(issuer.contactDetails, 1000),
    },
    serviceTitle: text(m.serviceTitle, 300),
    frameworks: m.frameworks.map((value: unknown) => {
      const f = exactRecord(value, ['name', 'edition']);
      return { name: text(f.name, 200), edition: text(f.edition, 100) };
    }),
  };
  const r = exactRecord(
    o.recipient,
    ['kind', 'legalName', 'taxId', 'legalAddress'],
    ['additionalLegalEntityId'],
  );
  const identity = {
    legalName: text(r.legalName, 200),
    taxId: nullableText(r.taxId, 500),
    legalAddress: nullableText(r.legalAddress, 2000),
  };
  const recipient =
    r.kind === 'PRIMARY' && !Object.hasOwn(r, 'additionalLegalEntityId')
      ? { ...identity, kind: 'PRIMARY' as const }
      : r.kind === 'ADDITIONAL'
        ? {
            ...identity,
            kind: 'ADDITIONAL' as const,
            additionalLegalEntityId: requireUuid(r.additionalLegalEntityId),
          }
        : fail();
  return {
    workspaceId: requireUuid(o.workspaceId),
    companyId: requireUuid(o.companyId),
    opportunityId: requireUuid(o.opportunityId),
    originalClientAccountId: requireUuid(o.originalClientAccountId),
    clientRequestId: requireUuid(o.clientRequestId),
    offerId: requireUuid(o.offerId),
    offerVersionId: requireUuid(o.offerVersionId),
    offerVersionNumber: modelInteger(o.offerVersionNumber, 1),
    illustrativeReference: modelInteger(o.illustrativeReference, 1),
    representationSha256: digest(o.representationSha256),
    recipient,
    scopeNote: nullableText(o.scopeNote, 2000),
    commercialConditions: nullableText(o.commercialConditions, 4000),
    model,
    priceSource,
    financials,
  };
}
function actor(value: unknown) {
  const a = exactRecord(value, ['workspaceMembershipId', 'internalUserId']);
  return {
    workspaceMembershipId: requireUuid(a.workspaceMembershipId),
    internalUserId: requireUuid(a.internalUserId),
  };
}
function nullableText(value: unknown, max: number) {
  return value === null ? null : text(value, max);
}
function money(value: unknown) {
  if (typeof value !== 'string' || !/^\d+\.\d{2}$/u.test(value))
    throw invalid();
  return value;
}
function currency(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/u.test(value)) throw invalid();
  return value;
}
function digest(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value))
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
  return new Error('Invalid generated Contract snapshot.');
}
function fail(): never {
  throw invalid();
}
