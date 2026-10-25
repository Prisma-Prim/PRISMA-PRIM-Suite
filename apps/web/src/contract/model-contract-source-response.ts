import {
  exactRecord,
  modelInteger,
  text,
  readContractModelContent,
} from '../contract-model/contract-model-content';

export function readSelectedContractModel(value: unknown) {
  const row = exactRecord(value, [
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
    row.kind !== 'APPROVED_COMPANY_CONTRACT_MODEL' ||
    row.code !== 'INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO' ||
    row.language !== 'ro'
  )
    throw invalid();
  return {
    kind: 'APPROVED_COMPANY_CONTRACT_MODEL' as const,
    code: 'INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO' as const,
    language: 'ro' as const,
    modelId: uuid(row.modelId),
    versionId: uuid(row.versionId),
    versionNumber: modelInteger(row.versionNumber, 1),
    approvalDecisionId: uuid(row.approvalDecisionId),
    approvedAt: instant(row.approvedAt),
    approvedBy: actor(row.approvedBy),
    content: readContractModelContent(row.content),
  };
}
export type SelectedContractModel = ReturnType<
  typeof readSelectedContractModel
>;
export function readModelContractOfferSource(value: unknown) {
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
    estimateId: uuid(p.estimateId),
    estimateVersionId: uuid(p.estimateVersionId),
    estimateVersionNumber: modelInteger(p.estimateVersionNumber, 1),
    approvalDecisionId: uuid(p.approvalDecisionId),
    approvedAt: instant(p.approvedAt),
    amount: financials.netAmount,
    currency: financials.currency,
  };
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
    modelId: uuid(m.modelId),
    versionId: uuid(m.versionId),
    versionNumber: modelInteger(m.versionNumber, 1),
    approvalDecisionId: uuid(m.approvalDecisionId),
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
    taxId: nullableText(r.taxId, 100),
    legalAddress: nullableText(r.legalAddress, 1000),
  };
  const recipient =
    r.kind === 'PRIMARY' && !Object.hasOwn(r, 'additionalLegalEntityId')
      ? { ...identity, kind: 'PRIMARY' as const }
      : r.kind === 'ADDITIONAL'
        ? {
            ...identity,
            kind: 'ADDITIONAL' as const,
            additionalLegalEntityId: uuid(r.additionalLegalEntityId),
          }
        : fail();
  return {
    workspaceId: uuid(o.workspaceId),
    companyId: uuid(o.companyId),
    opportunityId: uuid(o.opportunityId),
    originalClientAccountId: uuid(o.originalClientAccountId),
    clientRequestId: uuid(o.clientRequestId),
    offerId: uuid(o.offerId),
    offerVersionId: uuid(o.offerVersionId),
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
    workspaceMembershipId: uuid(a.workspaceMembershipId),
    internalUserId: uuid(a.internalUserId),
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
function uuid(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  )
    throw invalid();
  return value;
}
function invalid() {
  return new Error('Invalid model Contract source response.');
}
function fail(): never {
  throw invalid();
}
