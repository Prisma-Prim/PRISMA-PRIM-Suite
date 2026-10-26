import {
  exactRecord,
  modelInteger,
  readOfferModelContent,
  text,
} from '../offer-model/offer-model-content';
import {
  offerClientResponseState,
  offerDecisionState,
  type OfferDecisionState,
  readOfferClientResponse,
  readOfferDecision,
  readOfferDifferences,
  readOfferQualityRun,
  readOfferTransmission,
  type OfferTransmissionState,
  type OfferView,
} from './offer-response';

export function readSelectedOfferModel(value: unknown) {
  const input = exactRecord(value, [
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
    input.kind !== 'APPROVED_COMPANY_OFFER_MODEL' ||
    input.code !== 'INTEGRATED_MANAGEMENT_CONSULTING_RO' ||
    input.language !== 'ro'
  )
    invalid();
  const approvedBy = exactRecord(input.approvedBy, [
    'workspaceMembershipId',
    'internalUserId',
  ]);
  return {
    kind: 'APPROVED_COMPANY_OFFER_MODEL' as const,
    modelId: uuid(input.modelId),
    code: 'INTEGRATED_MANAGEMENT_CONSULTING_RO' as const,
    language: 'ro' as const,
    versionId: uuid(input.versionId),
    versionNumber: modelInteger(input.versionNumber, 1),
    approvalDecisionId: uuid(input.approvalDecisionId),
    approvedAt: instant(input.approvedAt),
    approvedBy: {
      workspaceMembershipId: uuid(approvedBy.workspaceMembershipId),
      internalUserId: uuid(approvedBy.internalUserId),
    },
    content: readOfferModelContent(input.content),
  };
}
export type SelectedOfferModel = ReturnType<typeof readSelectedOfferModel>;

export function readModelOfferFinancialDeclaration(value: unknown) {
  const input = exactRecord(value, [
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
  if (
    input.kind !== 'NET_PLUS_DECLARED_TAX' ||
    input.netAmountConfirmed !== true
  )
    invalid();
  const declaredBy = exactRecord(input.declaredBy, [
    'workspaceMembershipId',
    'internalUserId',
  ]);
  const netAmount = amount(input.netAmount);
  const taxAmount = amount(input.taxAmount);
  const grossAmount = amount(input.grossAmount);
  if (
    grossAmount !== declaredGross(netAmount, taxAmount) ||
    BigInt(netAmount.replace('.', '')) <= 0n
  )
    invalid();
  return {
    kind: 'NET_PLUS_DECLARED_TAX' as const,
    netAmountConfirmed: true as const,
    netAmount,
    taxAmount,
    grossAmount,
    currency: currency(input.currency),
    taxLabel: text(input.taxLabel, 200),
    basis: text(input.basis, 2_000),
    declaredBy: {
      workspaceMembershipId: uuid(declaredBy.workspaceMembershipId),
      internalUserId: uuid(declaredBy.internalUserId),
    },
    declaredAt: instant(input.declaredAt),
  };
}
export function declaredGross(net: string, tax: string) {
  const sum =
    BigInt(amount(net).replace('.', '')) + BigInt(amount(tax).replace('.', ''));
  return `${sum / 100n}.${String(sum % 100n).padStart(2, '0')}`;
}

type Content = Omit<
  OfferView['version'],
  | 'provenance'
  | 'pricingSnapshotId'
  | 'pricingSnapshot'
  | 'representation'
  | 'qualityRuleSet'
  | 'transmissionState'
  | 'transmission'
  | 'clientResponseState'
  | 'clientResponse'
  | 'decision'
  | 'decisionState'
>;
export type ModelOfferView = Omit<OfferView, 'version'> & {
  companyId: string;
  opportunityId: string;
  version: Content & {
    provenance: 'COMPANY_MODEL_ESTIMATE';
    eligibility: 'NON_OFFICIAL_REHEARSAL';
    qualityRuleSet: 'OFFER_QUALITY_COMPANY_MODEL';
    qualityRuleSetVersion: 1;
    modelSource: SelectedOfferModel;
    financialDeclaration: ReturnType<typeof readModelOfferFinancialDeclaration>;
    priceSource: {
      kind: 'DIRECTOR_APPROVED_ESTIMATE';
      estimateId: string;
      estimateVersionId: string;
      estimateVersionNumber: number;
      approvalDecisionId: string;
      approvedAt: string;
      amount: string;
      currency: string;
    };
    representation: {
      rendererCode: 'OFFER_COMPANY_CONSULTING_RO';
      rendererVersion: 1;
      html: string;
      sha256: string;
    };
  } & OfferDecisionState &
    OfferTransmissionState;
};

/** An HTTP reader proves the complete content the UI uses; never reused for stored receipts. */
export function readModelOffer(value: unknown): ModelOfferView {
  const root = record(value);
  const version = record(root.version);
  const recipient = record(version.recipient);
  const price = record(version.priceSource);
  const rep = record(version.representation);
  if (
    version.provenance !== 'COMPANY_MODEL_ESTIMATE' ||
    version.provisional !== true ||
    root.provisional !== true ||
    version.eligibility !== 'NON_OFFICIAL_REHEARSAL' ||
    version.qualityRuleSet !== 'OFFER_QUALITY_COMPANY_MODEL' ||
    version.qualityRuleSetVersion !== 1 ||
    (recipient.kind !== 'PRIMARY' && recipient.kind !== 'ADDITIONAL') ||
    typeof recipient.legalName !== 'string' ||
    typeof version.issuingCompanyLabel !== 'string' ||
    typeof version.validityElapsed !== 'boolean' ||
    price.kind !== 'DIRECTOR_APPROVED_ESTIMATE' ||
    rep.rendererCode !== 'OFFER_COMPANY_CONSULTING_RO' ||
    rep.rendererVersion !== 1 ||
    typeof rep.html !== 'string' ||
    !rep.html ||
    typeof rep.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(rep.sha256) ||
    [
      'pricingSnapshot',
      'pricingSnapshotId',
      'templateCode',
      'templateVersion',
      'taxTreatment',
    ].some((key) => Object.hasOwn(version, key)) ||
    Object.hasOwn(price, 'taxTreatment')
  )
    invalid();
  const id = uuid(version.id);
  const revision = modelInteger(root.revision, 1);
  const versionNumber = modelInteger(version.versionNumber, 1);
  const predecessorVersionId = nullable(version.predecessorVersionId);
  const supersededByVersionId = nullable(version.supersededByVersionId);
  const supersededAt = nullable(version.supersededAt);
  if (
    (versionNumber === 1) !== (predecessorVersionId === null) ||
    (supersededByVersionId === null) !== (supersededAt === null)
  )
    invalid();
  if (predecessorVersionId !== null) uuid(predecessorVersionId);
  if (supersededByVersionId !== null) uuid(supersededByVersionId);
  if (supersededAt !== null) instant(supersededAt);
  const additionalLegalEntityId = nullable(
    recipient.additionalLegalEntityId ?? null,
  );
  if ((recipient.kind === 'ADDITIONAL') !== (additionalLegalEntityId !== null))
    invalid();
  const validUntil = instant(version.validUntil);
  const binding = {
    offerVersionId: id,
    ruleSet: 'OFFER_QUALITY_COMPANY_MODEL',
    ruleSetVersion: 1,
  } satisfies {
    offerVersionId: string;
    ruleSet: 'OFFER_QUALITY_COMPANY_MODEL';
    ruleSetVersion: 1;
  };
  const decision =
    version.decision === null
      ? null
      : readOfferDecision(version.decision, binding);
  if (
    version.decisionState !== (decision?.state ?? 'PENDING') ||
    (decision && decision.offerRevision > revision) ||
    (decision?.state === 'APPROVED' &&
      decision.representationSha256 !== rep.sha256)
  )
    invalid();
  const latestQualityRun =
    version.latestQualityRun === null
      ? null
      : readOfferQualityRun(version.latestQualityRun, binding);
  let workflow: OfferTransmissionState;
  if (
    version.transmissionState === 'NOT_TRANSMITTED' &&
    version.clientResponseState === 'NONE' &&
    version.transmission === null &&
    version.clientResponse === null
  )
    workflow = {
      transmissionState: 'NOT_TRANSMITTED',
      transmission: null,
      clientResponseState: 'NONE',
      clientResponse: null,
    };
  else if (version.transmissionState === 'TRANSMITTED') {
    const transmission = readOfferTransmission(
      version.transmission,
      binding,
      decision,
    );
    const response =
      version.clientResponse === null
        ? null
        : readOfferClientResponse({
            value: version.clientResponse,
            offerVersionId: id,
            transmission,
            validUntil,
          });
    if (
      transmission.offerRevision > revision ||
      Date.parse(transmission.transmittedAt) >= Date.parse(validUntil) ||
      version.clientResponseState !== (response?.outcome ?? 'PENDING') ||
      (response && response.offerRevision > revision)
    )
      invalid();
    workflow = {
      transmissionState: 'TRANSMITTED',
      transmission,
      ...offerClientResponseState(response),
    };
  } else invalid();
  const financialDeclaration = readModelOfferFinancialDeclaration(
    version.financialDeclaration,
  );
  const priceSource = {
    kind: 'DIRECTOR_APPROVED_ESTIMATE' as const,
    estimateId: uuid(price.estimateId),
    estimateVersionId: uuid(price.estimateVersionId),
    estimateVersionNumber: modelInteger(price.estimateVersionNumber, 1),
    approvalDecisionId: uuid(price.approvalDecisionId),
    approvedAt: instant(price.approvedAt),
    amount: amount(price.amount),
    currency: currency(price.currency),
  };
  if (
    priceSource.amount !== financialDeclaration.netAmount ||
    priceSource.currency !== financialDeclaration.currency ||
    financialDeclaration.declaredAt !== instant(version.createdAt) ||
    financialDeclaration.declaredBy.workspaceMembershipId !==
      uuid(version.createdByWorkspaceMembershipId)
  )
    invalid();
  return {
    id: uuid(root.id),
    companyId: uuid(root.companyId),
    opportunityId: uuid(root.opportunityId),
    illustrativeReference: modelInteger(root.illustrativeReference, 1),
    revision,
    version: {
      id,
      versionNumber,
      predecessorVersionId,
      supersededByVersionId,
      supersededAt,
      differences: readOfferDifferences(version.differences, versionNumber),
      recipient: {
        kind: recipient.kind,
        legalName: recipient.legalName,
        taxId: nullable(recipient.taxId),
        legalAddress: nullable(recipient.legalAddress),
        additionalLegalEntityId,
      },
      issuingCompanyLabel: version.issuingCompanyLabel,
      validityDays: modelInteger(version.validityDays, 1),
      validityElapsed: version.validityElapsed,
      validUntil,
      scopeNote: nullable(version.scopeNote),
      commercialConditions: nullable(version.commercialConditions),
      provenance: 'COMPANY_MODEL_ESTIMATE',
      provisional: true,
      eligibility: 'NON_OFFICIAL_REHEARSAL',
      qualityRuleSet: 'OFFER_QUALITY_COMPANY_MODEL',
      qualityRuleSetVersion: 1,
      modelSource: readSelectedOfferModel(version.modelSource),
      financialDeclaration,
      priceSource,
      representation: {
        rendererCode: rep.rendererCode,
        rendererVersion: 1,
        html: rep.html,
        sha256: rep.sha256,
      },
      latestQualityRun,
      ...offerDecisionState(decision),
      ...workflow,
    },
  };
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
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    invalid();
  return value;
}
function amount(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9]+\.[0-9]{2}$/u.test(value))
    invalid();
  return value;
}
function currency(value: unknown) {
  if (
    typeof value !== 'string' ||
    !Intl.supportedValuesOf('currency').includes(value)
  )
    invalid();
  return value;
}
function invalid(): never {
  throw new Error('Invalid generated Offer response.');
}
