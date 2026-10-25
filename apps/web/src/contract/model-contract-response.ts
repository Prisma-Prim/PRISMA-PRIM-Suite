import {
  exactRecord,
  modelInteger,
  text,
} from '../contract-model/contract-model-content';
import {
  readModelContractOfferSource,
  readSelectedContractModel,
  type SelectedContractModel,
} from './model-contract-source-response';
import type { ModelOfferView } from '../offer/model-offer-response';
import {
  readModelContractDecision,
  readModelContractQuality,
} from './model-contract-quality-response';

/** Additive HTTP fields are tolerated; all content used by this journey is proved here. */
export function readModelContract(value: unknown) {
  const root = record(value),
    v = record(root.version),
    generation = record(v.modelGeneration),
    rep = record(v.representation);
  if (
    root.kind !== 'CONTRACT' ||
    root.origin !== 'COMPANY_MODEL_OFFER' ||
    root.provisional !== true ||
    root.eligibility !== 'NON_OFFICIAL_REHEARSAL' ||
    v.provenance !== 'COMPANY_MODEL_OFFER' ||
    v.provisional !== true ||
    v.executionState !== 'NOT_EXECUTED' ||
    v.signature !== null ||
    v.pricingSnapshot !== null ||
    v.pricingSnapshotId !== null ||
    v.qualityRuleSet !== 'CONTRACT_QUALITY_COMPANY_MODEL' ||
    v.qualityRuleSetVersion !== 1 ||
    rep.rendererCode !== 'COMPANY_CONSULTING_CONTRACT_RO' ||
    rep.rendererVersion !== 1
  )
    invalid();
  const id = uuid(root.id),
    companyId = uuid(root.companyId),
    opportunityId = uuid(root.opportunityId),
    versionId = uuid(v.id),
    sourceOfferId = uuid(root.sourceOfferId),
    sourceOfferVersionId = uuid(root.sourceOfferVersionId);
  const versionNumber = modelInteger(v.versionNumber, 1),
    revision = modelInteger(root.revision, 1),
    createdContractRevision = modelInteger(v.createdContractRevision, 1);
  const predecessorVersionId =
      v.predecessorVersionId === null ? null : uuid(v.predecessorVersionId),
    supersededByVersionId =
      v.supersededByVersionId === null ? null : uuid(v.supersededByVersionId);
  const supersededAt = v.supersededAt === null ? null : instant(v.supersededAt);
  if (
    (versionNumber === 1) !== (predecessorVersionId === null) ||
    (supersededByVersionId === null) !== (supersededAt === null) ||
    revision < createdContractRevision
  )
    invalid();
  const offerSource = readModelContractOfferSource(generation.offerSource),
    modelSource = readSelectedContractModel(generation.modelSource),
    caseDetails = readModelContractCase(generation.caseDetails),
    recipient = readRecipient(v.recipient);
  const financials = record(generation.financials);
  if (
    Object.entries(offerSource.financials).some(
      ([key, value]) => financials[key] !== value,
    ) ||
    offerSource.companyId !== companyId ||
    offerSource.opportunityId !== opportunityId ||
    offerSource.offerId !== sourceOfferId ||
    offerSource.offerVersionId !== v.sourceOfferVersionId ||
    offerSource.originalClientAccountId !== root.originalClientAccountId ||
    offerSource.clientRequestId !== root.clientRequestId ||
    offerSource.scopeNote !== v.scopeNote ||
    offerSource.commercialConditions !== v.commercialConditions ||
    caseDetails.termStartsOn !== v.termStartsOn ||
    caseDetails.termEndsOn !== v.termEndsOn ||
    caseDetails.specialConditions !== v.specialConditions ||
    recipient.kind !== offerSource.recipient.kind ||
    (recipient.kind === 'ADDITIONAL' &&
      (offerSource.recipient.kind !== 'ADDITIONAL' ||
        recipient.additionalLegalEntityId !==
          offerSource.recipient.additionalLegalEntityId))
  )
    invalid();
  const source = record(root.sourceOffer);
  if (
    source.id !== sourceOfferId ||
    source.versionId !== offerSource.offerVersionId ||
    source.versionNumber !== offerSource.offerVersionNumber ||
    source.illustrativeReference !== offerSource.illustrativeReference
  )
    invalid();
  if (
    !Array.isArray(root.addenda) ||
    root.addenda.length ||
    !Array.isArray(root.linkedProjects) ||
    root.linkedProjects.length
  )
    invalid();
  const representation = {
    rendererCode: 'COMPANY_CONSULTING_CONTRACT_RO' as const,
    rendererVersion: 1 as const,
    html: text(rep.html, 512 * 1024),
    sha256: digest(rep.sha256),
  };
  const decision =
    v.decision === null
      ? null
      : readModelContractDecision(v.decision, {
          versionId,
          createdRevision: createdContractRevision,
          checksum: representation.sha256,
        });
  const decisionState = decision
    ? decision.kind === 'APPROVE'
      ? ('APPROVED' as const)
      : ('REJECTED' as const)
    : ('PENDING' as const);
  if (
    v.decisionState !== decisionState ||
    revision < createdContractRevision + (decision ? 1 : 0) ||
    (supersededByVersionId === null &&
      revision !== createdContractRevision + (decision ? 1 : 0))
  )
    invalid();
  return {
    id,
    companyId,
    opportunityId,
    sourceOfferId,
    sourceOfferVersionId,
    illustrativeReference: modelInteger(root.illustrativeReference, 1),
    revision,
    kind: 'CONTRACT' as const,
    origin: 'COMPANY_MODEL_OFFER' as const,
    provisional: true as const,
    eligibility: 'NON_OFFICIAL_REHEARSAL' as const,
    version: {
      id: versionId,
      sourceOfferVersionId: offerSource.offerVersionId,
      versionNumber,
      createdContractRevision,
      predecessorVersionId,
      supersededByVersionId,
      supersededAt,
      differences: readDifferences(v.differences, versionNumber),
      representation,
      modelGeneration: {
        modelSource,
        offerSource,
        caseDetails,
        financials: offerSource.financials,
      },
      recipient,
      issuingCompanyLabel: text(v.issuingCompanyLabel, 300),
      scopeNote: offerSource.scopeNote,
      commercialConditions: offerSource.commercialConditions,
      ...{
        termStartsOn: caseDetails.termStartsOn,
        termEndsOn: caseDetails.termEndsOn,
        specialConditions: caseDetails.specialConditions,
      },
      decision,
      decisionState,
      executionState: 'NOT_EXECUTED' as const,
      latestQualityRun:
        v.latestQualityRun === null
          ? null
          : readModelContractQuality(v.latestQualityRun, versionId),
      createdAt: instant(v.createdAt),
      createdByWorkspaceMembershipId: uuid(v.createdByWorkspaceMembershipId),
    },
  };
}
export type ModelContractView = ReturnType<typeof readModelContract>;

/** Confirm a creation only when its complete returned copy belongs to the owned intent. */
export function readPreparedModelContract(
  value: unknown,
  expected: {
    companyId: string;
    workspaceId: string;
    opportunityId: string;
    membershipId: string;
    prior: ModelContractView | null;
    offer: ModelOfferView;
    model: SelectedContractModel;
    caseDetails: ReturnType<typeof readModelContractCase>;
  },
) {
  const next = readModelContract(value),
    v = next.version,
    copy = v.modelGeneration,
    offer = expected.offer.version;
  const model = offer.modelSource;
  const expectedOfferModel = {
    modelId: model.modelId,
    versionId: model.versionId,
    versionNumber: model.versionNumber,
    approvalDecisionId: model.approvalDecisionId,
    approvedAt: model.approvedAt,
    approvedBy: model.approvedBy,
    issuer: model.content.issuer,
    serviceTitle: model.content.serviceTitle,
    frameworks: model.content.frameworks,
  };
  const financials = offer.financialDeclaration;
  if (
    next.companyId !== expected.companyId ||
    next.opportunityId !== expected.opportunityId ||
    copy.offerSource.workspaceId !== expected.workspaceId ||
    (expected.prior && next.id !== expected.prior.id) ||
    v.createdByWorkspaceMembershipId !== expected.membershipId ||
    v.sourceOfferVersionId !== offer.id ||
    copy.offerSource.offerId !== expected.offer.id ||
    copy.offerSource.offerVersionNumber !== offer.versionNumber ||
    copy.offerSource.illustrativeReference !==
      expected.offer.illustrativeReference ||
    copy.offerSource.scopeNote !== offer.scopeNote ||
    copy.offerSource.commercialConditions !== offer.commercialConditions ||
    copy.offerSource.recipient.kind !== offer.recipient.kind ||
    copy.offerSource.recipient.legalName !== offer.recipient.legalName ||
    copy.offerSource.recipient.taxId !== offer.recipient.taxId ||
    copy.offerSource.recipient.legalAddress !== offer.recipient.legalAddress ||
    (copy.offerSource.recipient.kind === 'ADDITIONAL' &&
      copy.offerSource.recipient.additionalLegalEntityId !==
        offer.recipient.additionalLegalEntityId) ||
    copy.offerSource.representationSha256 !== offer.representation.sha256 ||
    JSON.stringify(copy.modelSource) !== JSON.stringify(expected.model) ||
    JSON.stringify(copy.offerSource.model) !==
      JSON.stringify(expectedOfferModel) ||
    JSON.stringify(copy.offerSource.priceSource) !==
      JSON.stringify(offer.priceSource) ||
    (
      ['netAmount', 'taxAmount', 'grossAmount', 'taxLabel', 'currency'] as const
    ).some((key) => copy.financials[key] !== financials[key]) ||
    JSON.stringify(copy.caseDetails) !== JSON.stringify(expected.caseDetails) ||
    v.decisionState !== 'PENDING' ||
    v.supersededByVersionId !== null ||
    next.revision !== (expected.prior ? expected.prior.revision + 1 : 1) ||
    v.versionNumber !==
      (expected.prior ? expected.prior.version.versionNumber + 1 : 1) ||
    v.predecessorVersionId !== (expected.prior?.version.id ?? null)
  )
    invalid();
  return next;
}
export function readModelContractCase(value: unknown) {
  const row = exactRecord(value, [
    'documentDate',
    'clientDetails',
    'termStartsOn',
    'termEndsOn',
    'specialConditions',
    'sourceConcordanceDeclaration',
    'sourceConcordanceBasis',
  ]);
  if (row.sourceConcordanceDeclaration !== true) invalid();
  const result = {
    documentDate: calendarDate(row.documentDate),
    clientDetails: text(row.clientDetails, 4000),
    termStartsOn:
      row.termStartsOn === null ? null : calendarDate(row.termStartsOn),
    termEndsOn: row.termEndsOn === null ? null : calendarDate(row.termEndsOn),
    specialConditions:
      row.specialConditions === null ? null : text(row.specialConditions, 4000),
    sourceConcordanceDeclaration: true as const,
    sourceConcordanceBasis: text(row.sourceConcordanceBasis, 2000),
  };
  if (
    result.termStartsOn &&
    result.termEndsOn &&
    result.termEndsOn < result.termStartsOn
  )
    invalid();
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 16 * 1024)
    invalid();
  return result;
}
function readRecipient(value: unknown) {
  const r = record(value),
    identity = {
      legalName: text(r.legalName, 200),
      taxId: r.taxId === null ? null : text(r.taxId, 500),
      legalAddress: r.legalAddress === null ? null : text(r.legalAddress, 2000),
    };
  if (
    r.kind === 'PRIMARY' &&
    (r.additionalLegalEntityId === undefined ||
      r.additionalLegalEntityId === null)
  )
    return { ...identity, kind: 'PRIMARY' as const };
  if (r.kind === 'ADDITIONAL')
    return {
      ...identity,
      kind: 'ADDITIONAL' as const,
      additionalLegalEntityId: uuid(r.additionalLegalEntityId),
    };
  return invalid();
}
const differenceFields = [
  'sourceOfferVersionId',
  'modelVersionId',
  'modelApprovalDecisionId',
  'recipientLegalName',
  'recipientTaxId',
  'recipientLegalAddress',
  'documentDate',
  'clientDetails',
  'termStartsOn',
  'termEndsOn',
  'specialConditions',
  'sourceConcordanceBasis',
  'scopeNote',
  'commercialConditions',
  'netAmount',
  'taxAmount',
  'grossAmount',
  'taxLabel',
  'currency',
];
function readDifferences(value: unknown, versionNumber: number) {
  if (
    !Array.isArray(value) ||
    value.length > differenceFields.length ||
    (versionNumber === 1 && value.length)
  )
    invalid();
  const seen = new Set<string>();
  return value.map((entry: unknown) => {
    const row = exactRecord(entry, ['field', 'before', 'after']);
    if (
      typeof row.field !== 'string' ||
      !differenceFields.includes(row.field) ||
      seen.has(row.field) ||
      row.before === row.after
    )
      invalid();
    seen.add(row.field);
    return {
      field: row.field,
      before: nullable(row.before),
      after: nullable(row.after),
    };
  });
}
export function readModelContractHistory(value: unknown) {
  const row = record(value);
  if (!Array.isArray(row.items) || row.items.length > 50) invalid();
  const seen = new Set<string>();
  let previous = Infinity;
  const items = row.items.map((item: unknown) => {
    const r = record(item),
      id = uuid(r.id),
      versionNumber = modelInteger(r.versionNumber, 1);
    if (
      r.provenance !== 'COMPANY_MODEL_OFFER' ||
      seen.has(id) ||
      versionNumber >= previous
    )
      invalid();
    seen.add(id);
    previous = versionNumber;
    return { id, versionNumber };
  });
  const nextCursor = row.nextCursor === null ? null : uuid(row.nextCursor);
  if (nextCursor !== null && nextCursor !== items.at(-1)?.id) invalid();
  return { items, nextCursor };
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid();
  return Object.fromEntries(Object.entries(value));
}
function nullable(value: unknown) {
  if (value !== null && typeof value !== 'string') invalid();
  return value;
}
function uuid(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  )
    invalid();
  return value;
}
function instant(value: unknown) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid();
  return value;
}
function digest(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) invalid();
  return value;
}
function calendarDate(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    value.startsWith('0000') ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    invalid();
  return value;
}
function invalid(): never {
  throw new Error('Invalid corresponding Contract response.');
}
