import { readModelOffer, type ModelOfferView } from './model-offer-response';
export type OfferSnapshotSummary = {
  id: string;
  currency: string;
  total: string;
  committedAt: string;
};

export type OfferView = {
  id: string;
  illustrativeReference: number;
  revision: number;
  version: {
    id: string;
    qualityRuleSet: 'OFFER_QUALITY_ILLUSTRATIVE';
    qualityRuleSetVersion: OfferQualityRunView['ruleSetVersion'];
    latestQualityRun: OfferQualityRunView | null;
    versionNumber: number;
    predecessorVersionId: string | null;
    supersededByVersionId: string | null;
    supersededAt: string | null;
    differences: OfferDifferenceView[];
    pricingSnapshotId: string;
    pricingSnapshot: OfferSnapshotSummary;
    recipient: {
      kind: 'PRIMARY' | 'ADDITIONAL';
      legalName: string;
      taxId: string | null;
      legalAddress: string | null;
      additionalLegalEntityId: string | null;
    };
    issuingCompanyLabel: string;
    validityDays: number;
    validityElapsed: boolean;
    validUntil: string;
    scopeNote: string | null;
    commercialConditions: string | null;
    decisionState: 'PENDING' | 'APPROVED' | 'REJECTED';
    decision: OfferDecisionView | null;
    provenance: 'ILLUSTRATIVE';
    provisional: true;
    representation: {
      templateCode: 'OFFER_ILLUSTRATIVE';
      templateVersion: OfferBindingVersion;
      html: string;
      sha256: string;
    };
  } & OfferTransmissionState;
};

export type InternalOfferPriceSource = {
  kind: 'DIRECTOR_APPROVED_ESTIMATE';
  estimateId: string;
  estimateVersionId: string;
  estimateVersionNumber: number;
  approvalDecisionId: string;
  approvedAt: string;
  amount: string;
  currency: string;
  taxTreatment: 'UNSPECIFIED';
};
type InternalVersionContent = Pick<
  OfferView['version'],
  | 'id'
  | 'versionNumber'
  | 'predecessorVersionId'
  | 'supersededByVersionId'
  | 'supersededAt'
  | 'differences'
  | 'recipient'
  | 'issuingCompanyLabel'
  | 'validityDays'
  | 'validityElapsed'
  | 'validUntil'
  | 'scopeNote'
  | 'commercialConditions'
>;
export type InternalOfferView = Omit<OfferView, 'version'> & {
  companyId: string;
  opportunityId: string;
  version: InternalVersionContent & {
    provenance: 'APPROVED_ESTIMATE_INTERNAL_DRAFT';
    provisional: true;
    priceSource: InternalOfferPriceSource;
    latestQualityRun: null;
    transmissionState: 'NOT_TRANSMITTED';
    transmission: null;
    clientResponseState: 'NONE';
    clientResponse: null;
  } & (
      | { decisionState: 'PENDING'; decision: null }
      | {
          decisionState: 'REJECTED';
          decision: Extract<OfferDecisionView, { state: 'REJECTED' }>;
        }
    );
};
export type OfferReadView = OfferView | InternalOfferView | ModelOfferView;
export function isModelOffer(offer: OfferReadView): offer is ModelOfferView {
  return offer.version.provenance === 'COMPANY_MODEL_ESTIMATE';
}
export type ExecutableOfferView = OfferView | ModelOfferView;
export function isExecutableOffer(
  offer: OfferReadView,
): offer is ExecutableOfferView {
  return (
    offer.version.provenance === 'ILLUSTRATIVE' ||
    offer.version.provenance === 'COMPANY_MODEL_ESTIMATE'
  );
}
export function isIllustrativeOffer(offer: OfferReadView): offer is OfferView {
  return offer.version.provenance === 'ILLUSTRATIVE';
}

export type OfferTransmissionView = {
  id: string;
  offerVersionId: string;
  offerRevision: number;
  actorWorkspaceMembershipId: string;
  transmittedAt: string;
  channel: 'SIMULATED';
  note: string | null;
  qualityRun: OfferQualityRunView;
  acknowledgedWarningCodes: Array<keyof typeof offerQualityLabels>;
  representationSha256: string;
};
export type OfferClientResponseState =
  | { clientResponseState: 'PENDING'; clientResponse: null }
  | {
      [Outcome in OfferClientResponseView['outcome']]: {
        clientResponseState: Outcome;
        clientResponse: Extract<OfferClientResponseView, { outcome: Outcome }>;
      };
    }[OfferClientResponseView['outcome']];
export type OfferTransmissionState =
  | {
      transmissionState: 'NOT_TRANSMITTED';
      clientResponseState: 'NONE';
      transmission: null;
      clientResponse: null;
    }
  | ({
      transmissionState: 'TRANSMITTED';
      transmission: OfferTransmissionView;
    } & OfferClientResponseState);

export function offerClientResponseState(
  response: OfferClientResponseView | null,
): OfferClientResponseState {
  if (!response)
    return { clientResponseState: 'PENDING', clientResponse: null };
  switch (response.outcome) {
    case 'ACCEPTED':
      return { clientResponseState: 'ACCEPTED', clientResponse: response };
    case 'REJECTED':
      return { clientResponseState: 'REJECTED', clientResponse: response };
    case 'EXPIRED':
      return { clientResponseState: 'EXPIRED', clientResponse: response };
    default: {
      const exhaustive: never = response;
      return exhaustive;
    }
  }
}

export function readOfferDetail(
  value: unknown,
  expected?: { companyId: string; opportunityId: string; offerId: string },
): OfferReadView | null {
  const detail = record(value);
  if (expected) {
    const offer = record(detail.offer);
    if (
      offer.id !== expected.offerId ||
      offer.companyId !== expected.companyId ||
      offer.opportunityId !== expected.opportunityId
    )
      throw new Error('Mismatched requested Offer.');
  }
  return detail.offer === null ? null : readOffer(detail.offer);
}

export function readOffer(value: unknown): OfferReadView {
  const root = record(value);
  if (record(root.version).provenance === 'APPROVED_ESTIMATE_INTERNAL_DRAFT')
    return readInternalOffer(root);
  if (record(root.version).provenance === 'COMPANY_MODEL_ESTIMATE')
    return readModelOffer(root);
  return readIllustrativeOffer(value);
}

function readIllustrativeOffer(value: unknown): OfferView {
  const root = record(value);
  const version = record(root.version);
  const recipient = record(version.recipient);
  if (
    typeof root.id !== 'string' ||
    !positiveInteger(root.illustrativeReference) ||
    !positiveInteger(root.revision) ||
    !positiveInteger(version.versionNumber) ||
    typeof version.id !== 'string' ||
    typeof version.pricingSnapshotId !== 'string' ||
    (recipient.kind !== 'PRIMARY' && recipient.kind !== 'ADDITIONAL') ||
    typeof recipient.legalName !== 'string' ||
    typeof version.issuingCompanyLabel !== 'string' ||
    !positiveInteger(version.validityDays) ||
    typeof version.validityElapsed !== 'boolean' ||
    typeof version.validUntil !== 'string' ||
    !Number.isFinite(Date.parse(version.validUntil)) ||
    (version.decisionState !== 'PENDING' &&
      version.decisionState !== 'APPROVED' &&
      version.decisionState !== 'REJECTED') ||
    version.provenance !== 'ILLUSTRATIVE' ||
    version.provisional !== true
  )
    invalid();
  const representation = readRepresentation(version.representation);
  if (
    version.qualityRuleSet !== 'OFFER_QUALITY_ILLUSTRATIVE' ||
    version.qualityRuleSetVersion !== representation.templateVersion
  )
    invalid();
  const binding: OfferQualityRunBinding = {
    offerVersionId: version.id,
    ruleSetVersion: representation.templateVersion,
  };
  const decision =
    version.decision === null ||
    (version.decision === undefined && version.decisionState === 'PENDING')
      ? null
      : readOfferDecision(version.decision, binding);
  const predecessorVersionId = optionalText(
    version.predecessorVersionId ??
      (version.versionNumber === 1 ? null : undefined),
  );
  const supersededByVersionId = optionalText(
    version.supersededByVersionId ?? null,
  );
  const supersededAt = optionalText(version.supersededAt ?? null);
  if (
    (version.versionNumber === 1) !== (predecessorVersionId === null) ||
    (supersededByVersionId === null) !== (supersededAt === null) ||
    (supersededAt !== null && !Number.isFinite(Date.parse(supersededAt)))
  )
    invalid();
  if (
    version.decisionState !== (decision?.state ?? 'PENDING') ||
    (decision && decision.offerRevision > root.revision)
  )
    invalid();
  const latestQualityRun =
    version.latestQualityRun === null
      ? null
      : readOfferQualityRun(version.latestQualityRun, binding);
  let transmissionState: OfferTransmissionState;
  if (
    version.transmissionState === 'NOT_TRANSMITTED' &&
    version.clientResponseState === 'NONE' &&
    (version.transmission === null || version.transmission === undefined) &&
    (version.clientResponse === null || version.clientResponse === undefined)
  )
    transmissionState = {
      transmissionState: 'NOT_TRANSMITTED',
      clientResponseState: 'NONE',
      transmission: null,
      clientResponse: null,
    };
  else if (
    version.transmissionState === 'TRANSMITTED' &&
    ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'].includes(
      String(version.clientResponseState),
    )
  ) {
    const transmission = readOfferTransmission(
      version.transmission,
      binding,
      decision,
    );
    if (
      transmission.offerRevision > root.revision ||
      Date.parse(transmission.transmittedAt) >= Date.parse(version.validUntil)
    )
      invalid();
    const clientResponse =
      version.clientResponse === null || version.clientResponse === undefined
        ? null
        : readOfferClientResponse({
            value: version.clientResponse,
            offerVersionId: version.id,
            transmission,
            validUntil: version.validUntil,
          });
    if (
      version.clientResponseState !== (clientResponse?.outcome ?? 'PENDING') ||
      (clientResponse && clientResponse.offerRevision > root.revision)
    )
      invalid();
    transmissionState = {
      transmissionState: 'TRANSMITTED',
      transmission,
      ...offerClientResponseState(clientResponse),
    };
  } else invalid();
  if (
    decision?.state === 'APPROVED' &&
    decision.representationSha256 !== representation.sha256
  )
    invalid();
  return {
    id: root.id,
    illustrativeReference: root.illustrativeReference,
    revision: root.revision,
    version: {
      id: version.id,
      qualityRuleSet: 'OFFER_QUALITY_ILLUSTRATIVE',
      qualityRuleSetVersion: binding.ruleSetVersion,
      latestQualityRun,
      versionNumber: version.versionNumber,
      predecessorVersionId,
      supersededByVersionId,
      supersededAt,
      differences: readOfferDifferences(
        version.differences,
        version.versionNumber,
      ),
      pricingSnapshotId: version.pricingSnapshotId,
      pricingSnapshot: readSnapshot(version.pricingSnapshot),
      recipient: {
        kind: recipient.kind,
        legalName: recipient.legalName,
        taxId: optionalText(recipient.taxId),
        legalAddress: optionalText(recipient.legalAddress),
        additionalLegalEntityId: optionalText(
          recipient.additionalLegalEntityId ?? null,
        ),
      },
      issuingCompanyLabel: version.issuingCompanyLabel,
      validityDays: version.validityDays,
      validityElapsed: version.validityElapsed,
      validUntil: version.validUntil,
      scopeNote: optionalText(version.scopeNote),
      commercialConditions: optionalText(version.commercialConditions),
      decisionState: version.decisionState,
      decision,
      ...transmissionState,
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      representation,
    },
  };
}

export const offerDifferenceFields = [
  'modelVersionId',
  'modelVersionNumber',
  'modelApprovalDecisionId',
  'taxAmount',
  'taxLabel',
  'declarationBasis',
  'grossAmount',
  'priceSourceKind',
  'estimateVersionId',
  'estimateVersionNumber',
  'approvalDecisionId',
  'amount',
  'recipientKind',
  'recipientAdditionalLegalEntityId',
  'recipientLegalName',
  'recipientTaxId',
  'recipientLegalAddress',
  'pricingSnapshotId',
  'currency',
  'total',
  'validityDays',
  'validUntil',
  'scopeNote',
  'commercialConditions',
] as const;
export type OfferDifferenceView = {
  field: (typeof offerDifferenceFields)[number];
  previous: string | number | null;
  current: string | number | null;
  changed: boolean;
};
export function readOfferDifferences(
  value: unknown,
  versionNumber: number,
): OfferDifferenceView[] {
  if (value === undefined && versionNumber === 1) return [];
  if (!Array.isArray(value)) invalid();
  return value.map((entry: unknown) => {
    const item = record(entry);
    const field = offerDifferenceFields.find((field) => field === item.field);
    const previous = item.previous;
    const current = item.current;
    if (
      !field ||
      (previous !== null &&
        typeof previous !== 'string' &&
        typeof previous !== 'number') ||
      (current !== null &&
        typeof current !== 'string' &&
        typeof current !== 'number') ||
      typeof item.changed !== 'boolean' ||
      item.changed !== (previous !== current)
    )
      invalid();
    if (
      field === 'priceSourceKind' &&
      [previous, current].some(
        (kind) =>
          kind !== null &&
          kind !== 'DIRECTOR_APPROVED_ESTIMATE' &&
          kind !== 'ILLUSTRATIVE_SNAPSHOT',
      )
    )
      invalid();
    return { field, previous, current, changed: item.changed };
  });
}

export type OfferVersionPage = {
  versions: Array<{
    id: string;
    versionNumber: number;
    createdAt: string;
    supersededByVersionId: string | null;
  }>;
  nextCursor: string | null;
};
export function readOfferVersionPage(value: unknown): OfferVersionPage {
  const page = record(value);
  if (!Array.isArray(page.versions)) invalid();
  return {
    versions: page.versions.map((entry: unknown) => {
      const version = record(entry);
      if (
        typeof version.id !== 'string' ||
        !positiveInteger(version.versionNumber) ||
        typeof version.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(version.createdAt))
      )
        invalid();
      return {
        id: version.id,
        versionNumber: version.versionNumber,
        createdAt: version.createdAt,
        supersededByVersionId: optionalText(version.supersededByVersionId),
      };
    }),
    nextCursor: optionalText(page.nextCursor),
  };
}

export type OfferDecisionView = {
  id: string;
  offerVersionId: string;
  offerRevision: number;
  actorWorkspaceMembershipId: string;
  decidedAt: string;
} & (
  | {
      state: 'APPROVED';
      qualityRun: OfferQualityRunView;
      acknowledgedWarningCodes: Array<keyof typeof offerQualityLabels>;
      representationSha256: string;
    }
  | { state: 'REJECTED'; reason: string }
);

export type OfferDecisionState =
  | { decisionState: 'PENDING'; decision: null }
  | {
      decisionState: 'APPROVED';
      decision: Extract<OfferDecisionView, { state: 'APPROVED' }>;
    }
  | {
      decisionState: 'REJECTED';
      decision: Extract<OfferDecisionView, { state: 'REJECTED' }>;
    };
export function offerDecisionState(
  decision: OfferDecisionView | null,
): OfferDecisionState {
  if (!decision) return { decisionState: 'PENDING', decision: null };
  switch (decision.state) {
    case 'APPROVED':
      return { decisionState: 'APPROVED', decision };
    case 'REJECTED':
      return { decisionState: 'REJECTED', decision };
    default: {
      const exhaustive: never = decision;
      return exhaustive;
    }
  }
}

export function readOfferDecision(
  value: unknown,
  binding: OfferQualityRunBinding | { offerVersionId: string },
): OfferDecisionView {
  const { offerVersionId } = binding;
  const row = record(value);
  if (
    typeof row.id !== 'string' ||
    row.offerVersionId !== offerVersionId ||
    !positiveInteger(row.offerRevision) ||
    row.offerRevision < 2 ||
    typeof row.actorWorkspaceMembershipId !== 'string' ||
    typeof row.decidedAt !== 'string' ||
    !Number.isFinite(Date.parse(row.decidedAt))
  )
    invalid();
  const base = {
    id: row.id,
    offerVersionId,
    offerRevision: row.offerRevision,
    actorWorkspaceMembershipId: row.actorWorkspaceMembershipId,
    decidedAt: row.decidedAt,
  };
  if (
    row.state === 'REJECTED' &&
    typeof row.reason === 'string' &&
    row.reason.trim().length > 0 &&
    row.reason.length <= 500
  )
    return { ...base, state: 'REJECTED', reason: row.reason };
  if (
    !('ruleSetVersion' in binding) ||
    row.state !== 'APPROVED' ||
    !Array.isArray(row.acknowledgedWarningCodes) ||
    typeof row.representationSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(row.representationSha256)
  )
    invalid();
  const acknowledgedWarningCodes: Array<keyof typeof offerQualityLabels> = [];
  for (const item of row.acknowledgedWarningCodes) {
    if (!isQualityCode(item) || acknowledgedWarningCodes.includes(item))
      invalid();
    acknowledgedWarningCodes.push(item);
  }
  const qualityRun = readOfferQualityRun(row.qualityRun, binding);
  const warnings = qualityRun.results
    .filter((result) => result.status === 'WARNING')
    .map((result) => result.code);
  if (
    qualityRun.actorWorkspaceMembershipId !== row.actorWorkspaceMembershipId ||
    qualityRun.evaluatedAt !== row.decidedAt ||
    qualityRun.results.some((result) => result.status === 'ERROR') ||
    warnings.length !== acknowledgedWarningCodes.length ||
    !warnings.every((code) => acknowledgedWarningCodes.includes(code))
  )
    invalid();
  return {
    ...base,
    state: 'APPROVED',
    qualityRun,
    acknowledgedWarningCodes,
    representationSha256: row.representationSha256,
  };
}

export function readOfferTransmission(
  value: unknown,
  binding: OfferQualityRunBinding,
  approval: OfferDecisionView | null,
): OfferTransmissionView {
  const { offerVersionId } = binding;
  const row = record(value);
  if (
    approval?.state !== 'APPROVED' ||
    typeof row.id !== 'string' ||
    row.offerVersionId !== offerVersionId ||
    !positiveInteger(row.offerRevision) ||
    row.offerRevision <= approval.offerRevision ||
    typeof row.actorWorkspaceMembershipId !== 'string' ||
    typeof row.transmittedAt !== 'string' ||
    !Number.isFinite(Date.parse(row.transmittedAt)) ||
    Date.parse(row.transmittedAt) < Date.parse(approval.decidedAt) ||
    row.channel !== 'SIMULATED' ||
    (row.note !== null &&
      (typeof row.note !== 'string' ||
        row.note.length > 500 ||
        row.note.includes('\0'))) ||
    row.representationSha256 !== approval.representationSha256 ||
    !Array.isArray(row.acknowledgedWarningCodes)
  )
    invalid();
  const acknowledgedWarningCodes: Array<keyof typeof offerQualityLabels> = [];
  for (const code of row.acknowledgedWarningCodes) {
    if (!isQualityCode(code) || acknowledgedWarningCodes.includes(code))
      invalid();
    acknowledgedWarningCodes.push(code);
  }
  const qualityRun = readOfferQualityRun(row.qualityRun, binding);
  const newWarnings = qualityRun.results
    .filter(
      (result) =>
        result.status === 'WARNING' &&
        !approval.acknowledgedWarningCodes.includes(result.code),
    )
    .map((result) => result.code);
  if (
    qualityRun.actorWorkspaceMembershipId !== row.actorWorkspaceMembershipId ||
    qualityRun.evaluatedAt !== row.transmittedAt ||
    qualityRun.results.some((result) => result.status === 'ERROR') ||
    newWarnings.length !== acknowledgedWarningCodes.length ||
    !newWarnings.every((code) => acknowledgedWarningCodes.includes(code))
  )
    invalid();
  return {
    id: row.id,
    offerVersionId,
    offerRevision: row.offerRevision,
    actorWorkspaceMembershipId: row.actorWorkspaceMembershipId,
    transmittedAt: row.transmittedAt,
    channel: 'SIMULATED',
    note: row.note,
    qualityRun,
    acknowledgedWarningCodes,
    representationSha256: approval.representationSha256,
  };
}

export const modelOfferQualityCodes = [
  'MODEL_APPROVAL_COHERENT',
  'ECONOMIC_SOURCE_COHERENT',
  'DECLARED_TOTALS_COHERENT',
  'REPRESENTATION_COHERENT',
  'VALIDITY_OPEN',
  'RECIPIENT_AVAILABLE',
  'RECIPIENT_IDENTITY_CURRENT',
  'RECIPIENT_TAX_ID_RECORDED',
  'CURRENCY_UNCHANGED',
  'NON_OFFICIAL_MARKER_PRESENT',
  'DECLARED_TAX_UNVERIFIED',
  'NON_OFFICIAL_OFFER',
  'ILLUSTRATIVE_MODEL',
] as const;
const legacyOfferQualityCodes = [
  'PRICING_SNAPSHOT_COHERENT',
  'CURRENCY_UNCHANGED',
  'VALIDITY_OPEN',
  'RECIPIENT_AVAILABLE',
  'RECIPIENT_IDENTITY_CURRENT',
  'RECIPIENT_TAX_ID_RECORDED',
  'PRICING_CLIENT_CONTEXT_COHERENT',
  'PROVISIONAL_MARKER_PRESENT',
] as const;
export const offerQualityLabels = {
  MODEL_APPROVAL_COHERENT: 'Model approval coherent',
  ECONOMIC_SOURCE_COHERENT: 'Economic source coherent',
  DECLARED_TOTALS_COHERENT: 'Declared totals coherent',
  REPRESENTATION_COHERENT: 'Representation coherent',
  NON_OFFICIAL_MARKER_PRESENT: 'Non-official marker present',
  DECLARED_TAX_UNVERIFIED: 'Declared tax unverified',
  NON_OFFICIAL_OFFER: 'Non-official Offer',
  ILLUSTRATIVE_MODEL: 'Illustrative model',

  PRICING_SNAPSHOT_COHERENT: 'Pricing Snapshot coherent',
  CURRENCY_UNCHANGED: 'Currency unchanged',
  VALIDITY_OPEN: 'Validity open',
  RECIPIENT_AVAILABLE: 'Recipient available',
  RECIPIENT_IDENTITY_CURRENT: 'Recipient identity current',
  RECIPIENT_TAX_ID_RECORDED: 'Recipient tax ID recorded',
  PRICING_CLIENT_CONTEXT_COHERENT: 'Pricing Client context coherent',
  PROVISIONAL_MARKER_PRESENT: 'Provisional marker present',
} as const;
/** Template and rule set versions are bound together; unknown values fail closed. */
type OfferBindingVersion = 1 | 2;
function isOfferBindingVersion(value: unknown): value is OfferBindingVersion {
  return value === 1 || value === 2;
}

type OfferQualityRunFacts = {
  id: string;
  offerVersionId: string;
  actorWorkspaceMembershipId: string;
  evaluatedAt: string;
  results: Array<{
    code: keyof typeof offerQualityLabels;
    status: 'PASS' | 'WARNING' | 'ERROR';
  }>;
};

export type OfferQualityRunView = OfferQualityRunFacts &
  (
    | {
        ruleSet: 'OFFER_QUALITY_ILLUSTRATIVE';
        ruleSetVersion: OfferBindingVersion;
      }
    | { ruleSet: 'OFFER_QUALITY_COMPANY_MODEL'; ruleSetVersion: 1 }
  );

/**
 * The exact Offer Version a run must belong to and the rule set version bound
 * to that version's Template. A run that names any other value is invalid.
 */
export type OfferQualityRunBinding = {
  ruleSet?: 'OFFER_QUALITY_ILLUSTRATIVE' | 'OFFER_QUALITY_COMPANY_MODEL';
  offerVersionId: string;
  ruleSetVersion: OfferBindingVersion;
};

export function readOfferQualityRun(
  value: unknown,
  {
    offerVersionId,
    ruleSetVersion,
    ruleSet = 'OFFER_QUALITY_ILLUSTRATIVE',
  }: OfferQualityRunBinding,
): OfferQualityRunView {
  const run = record(value);
  if (
    typeof run.id !== 'string' ||
    run.offerVersionId !== offerVersionId ||
    run.ruleSet !== ruleSet ||
    (ruleSet === 'OFFER_QUALITY_COMPANY_MODEL' && ruleSetVersion !== 1) ||
    run.ruleSetVersion !== ruleSetVersion ||
    typeof run.actorWorkspaceMembershipId !== 'string' ||
    typeof run.evaluatedAt !== 'string' ||
    !Number.isFinite(Date.parse(run.evaluatedAt)) ||
    !Array.isArray(run.results) ||
    run.results.length !== (ruleSet === 'OFFER_QUALITY_COMPANY_MODEL' ? 13 : 8)
  )
    invalid();
  const expectedCodes =
    ruleSet === 'OFFER_QUALITY_COMPANY_MODEL'
      ? modelOfferQualityCodes
      : legacyOfferQualityCodes;
  const results = run.results.map(
    (value: unknown, index): OfferQualityRunView['results'][number] => {
      const item = record(value);
      const code = item.code;
      if (
        !isQualityCode(code) ||
        code !== expectedCodes[index] ||
        (item.status !== 'PASS' &&
          item.status !== 'WARNING' &&
          item.status !== 'ERROR')
      )
        invalid();
      const severity =
        ruleSet === 'OFFER_QUALITY_COMPANY_MODEL'
          ? [
              'RECIPIENT_IDENTITY_CURRENT',
              'RECIPIENT_TAX_ID_RECORDED',
              'CURRENCY_UNCHANGED',
              'DECLARED_TAX_UNVERIFIED',
              'NON_OFFICIAL_OFFER',
              'ILLUSTRATIVE_MODEL',
            ].includes(code)
            ? 'WARNING'
            : 'ERROR'
          : code === 'PRICING_SNAPSHOT_COHERENT' ||
              code === 'VALIDITY_OPEN' ||
              code === 'RECIPIENT_AVAILABLE' ||
              code === 'PROVISIONAL_MARKER_PRESENT'
            ? 'ERROR'
            : 'WARNING';
      if (
        (item.status !== 'PASS' && item.status !== severity) ||
        (ruleSet === 'OFFER_QUALITY_COMPANY_MODEL' &&
          (code === 'DECLARED_TAX_UNVERIFIED' ||
            code === 'NON_OFFICIAL_OFFER') &&
          item.status !== 'WARNING')
      )
        invalid();
      return { code, status: item.status };
    },
  );
  const facts = {
    id: run.id,
    offerVersionId,
    actorWorkspaceMembershipId: run.actorWorkspaceMembershipId,
    evaluatedAt: run.evaluatedAt,
    results,
  };
  return ruleSet === 'OFFER_QUALITY_COMPANY_MODEL'
    ? { ...facts, ruleSet, ruleSetVersion: 1 }
    : { ...facts, ruleSet, ruleSetVersion };
}

function isQualityCode(
  value: unknown,
): value is keyof typeof offerQualityLabels {
  return typeof value === 'string' && Object.hasOwn(offerQualityLabels, value);
}

function readRepresentation(
  value: unknown,
): OfferView['version']['representation'] {
  const representation = record(value);
  if (
    representation.templateCode !== 'OFFER_ILLUSTRATIVE' ||
    !isOfferBindingVersion(representation.templateVersion) ||
    typeof representation.html !== 'string' ||
    representation.html.length === 0 ||
    typeof representation.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(representation.sha256)
  )
    invalid();
  return {
    templateCode: 'OFFER_ILLUSTRATIVE',
    templateVersion: representation.templateVersion,
    html: representation.html,
    sha256: representation.sha256,
  };
}

export function readOfferSnapshotPage(value: unknown): OfferSnapshotSummary[] {
  const page = record(value);
  if (!Array.isArray(page.items)) invalid();
  return page.items.map(readSnapshot);
}

function readSnapshot(value: unknown): OfferSnapshotSummary {
  const snapshot = record(value);
  if (
    typeof snapshot.id !== 'string' ||
    typeof snapshot.currency !== 'string' ||
    typeof snapshot.total !== 'string' ||
    typeof snapshot.committedAt !== 'string'
  )
    invalid();
  return {
    id: snapshot.id,
    currency: snapshot.currency,
    total: snapshot.total,
    committedAt: snapshot.committedAt,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid();
  return Object.fromEntries(Object.entries(value));
}

function optionalText(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') invalid();
  return value;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function invalid(): never {
  throw new Error('Invalid Offer response.');
}

export type OfferClientResponseView = {
  id: string;
  offerVersionId: string;
  offerRevision: number;
  actorWorkspaceMembershipId: string;
  decidedAt: string;
  evidenceKind: 'SIMULATED';
} & (
  | { outcome: 'ACCEPTED'; receivedAt: string }
  | { outcome: 'REJECTED'; receivedAt: string; reason: string }
  | { outcome: 'EXPIRED' }
);

export function readOfferClientResponse({
  value,
  offerVersionId,
  transmission,
  validUntil,
}: {
  value: unknown;
  offerVersionId: string;
  transmission: OfferTransmissionView;
  validUntil: string;
}): OfferClientResponseView {
  const row = record(value);
  if (
    typeof row.id !== 'string' ||
    row.offerVersionId !== offerVersionId ||
    !positiveInteger(row.offerRevision) ||
    row.offerRevision <= transmission.offerRevision ||
    typeof row.actorWorkspaceMembershipId !== 'string' ||
    typeof row.decidedAt !== 'string' ||
    !Number.isFinite(Date.parse(row.decidedAt)) ||
    Date.parse(row.decidedAt) < Date.parse(transmission.transmittedAt) ||
    row.evidenceKind !== 'SIMULATED'
  )
    invalid();
  const base = {
    id: row.id,
    offerVersionId,
    offerRevision: row.offerRevision,
    actorWorkspaceMembershipId: row.actorWorkspaceMembershipId,
    decidedAt: row.decidedAt,
    evidenceKind: row.evidenceKind,
  } satisfies Pick<
    OfferClientResponseView,
    | 'id'
    | 'offerVersionId'
    | 'offerRevision'
    | 'actorWorkspaceMembershipId'
    | 'decidedAt'
    | 'evidenceKind'
  >;
  if (row.outcome === 'EXPIRED') {
    if (
      row.receivedAt !== undefined ||
      row.reason !== undefined ||
      Date.parse(row.decidedAt) < Date.parse(validUntil)
    )
      invalid();
    return { ...base, outcome: 'EXPIRED' };
  }
  if (
    typeof row.receivedAt !== 'string' ||
    !Number.isFinite(Date.parse(row.receivedAt)) ||
    Date.parse(row.receivedAt) < Date.parse(transmission.transmittedAt) ||
    Date.parse(row.receivedAt) > Date.parse(row.decidedAt) ||
    Date.parse(row.receivedAt) >= Date.parse(validUntil)
  )
    invalid();
  if (row.outcome === 'ACCEPTED' && row.reason === undefined)
    return { ...base, outcome: 'ACCEPTED', receivedAt: row.receivedAt };
  if (
    row.outcome === 'REJECTED' &&
    typeof row.reason === 'string' &&
    row.reason.trim().length > 0 &&
    row.reason.length <= 500 &&
    !row.reason.includes('\0')
  )
    return {
      ...base,
      outcome: 'REJECTED',
      receivedAt: row.receivedAt,
      reason: row.reason,
    };
  return invalid();
}

function readInternalOffer(root: Record<string, unknown>): InternalOfferView {
  const version = record(root.version);
  const recipient = record(version.recipient);
  if (
    typeof root.id !== 'string' ||
    typeof root.companyId !== 'string' ||
    !root.companyId ||
    typeof root.opportunityId !== 'string' ||
    !root.opportunityId ||
    !positiveInteger(root.illustrativeReference) ||
    !positiveInteger(root.revision) ||
    typeof version.id !== 'string' ||
    !positiveInteger(version.versionNumber) ||
    !positiveInteger(version.validityDays) ||
    version.validityDays > 365 ||
    typeof version.validityElapsed !== 'boolean' ||
    typeof version.issuingCompanyLabel !== 'string' ||
    typeof recipient.legalName !== 'string' ||
    (recipient.kind !== 'PRIMARY' && recipient.kind !== 'ADDITIONAL') ||
    version.provisional !== true ||
    version.latestQualityRun !== null ||
    version.transmissionState !== 'NOT_TRANSMITTED' ||
    version.transmission !== null ||
    version.clientResponseState !== 'NONE' ||
    version.clientResponse !== null ||
    [
      'pricingSnapshotId',
      'pricingSnapshot',
      'representation',
      'qualityRuleSet',
      'qualityRuleSetVersion',
      'templateCode',
      'templateVersion',
      'taxTotal',
      'total',
      'executorCost',
      'fiscalCost',
      'results',
      'inputs',
    ].some((key) => Object.hasOwn(version, key))
  )
    invalid();
  const predecessorVersionId = optionalText(version.predecessorVersionId);
  const supersededByVersionId = optionalText(version.supersededByVersionId);
  const supersededAt = optionalText(version.supersededAt);
  const validUntil = validOfferInstant(version.validUntil);
  if (
    (version.versionNumber === 1) !== (predecessorVersionId === null) ||
    (supersededByVersionId === null) !== (supersededAt === null) ||
    (supersededAt !== null && !Number.isFinite(Date.parse(supersededAt)))
  )
    invalid();
  const additionalLegalEntityId = optionalText(
    recipient.additionalLegalEntityId ?? null,
  );
  if ((recipient.kind === 'ADDITIONAL') !== (additionalLegalEntityId !== null))
    invalid();
  const source = record(version.priceSource);
  const sourceFields = [
    'kind',
    'estimateId',
    'estimateVersionId',
    'estimateVersionNumber',
    'approvalDecisionId',
    'approvedAt',
    'amount',
    'currency',
    'taxTreatment',
  ];
  if (
    Object.keys(source).length !== sourceFields.length ||
    Object.keys(source).some((key) => !sourceFields.includes(key)) ||
    source.kind !== 'DIRECTOR_APPROVED_ESTIMATE' ||
    source.taxTreatment !== 'UNSPECIFIED' ||
    !positiveInteger(source.estimateVersionNumber) ||
    typeof source.amount !== 'string' ||
    !/^(0|[1-9][0-9]*)\.[0-9]{2}$/u.test(source.amount) ||
    BigInt(source.amount.replace('.', '')) <= 0n ||
    typeof source.currency !== 'string' ||
    !Intl.supportedValuesOf('currency').includes(source.currency)
  )
    invalid();
  const priceSource: InternalOfferPriceSource = {
    kind: 'DIRECTOR_APPROVED_ESTIMATE',
    estimateId: offerSourceId(source.estimateId),
    estimateVersionId: offerSourceId(source.estimateVersionId),
    estimateVersionNumber: source.estimateVersionNumber,
    approvalDecisionId: offerSourceId(source.approvalDecisionId),
    approvedAt: validOfferInstant(source.approvedAt),
    amount: source.amount,
    currency: source.currency,
    taxTreatment: 'UNSPECIFIED',
  };
  const content = {
    id: version.id,
    versionNumber: version.versionNumber,
    predecessorVersionId,
    supersededByVersionId,
    supersededAt,
    differences: readOfferDifferences(
      version.differences,
      version.versionNumber,
    ),
    recipient: {
      kind: recipient.kind,
      legalName: recipient.legalName,
      taxId: optionalText(recipient.taxId),
      legalAddress: optionalText(recipient.legalAddress),
      additionalLegalEntityId,
    },
    issuingCompanyLabel: version.issuingCompanyLabel,
    validityDays: version.validityDays,
    validityElapsed: version.validityElapsed,
    validUntil,
    scopeNote: optionalText(version.scopeNote),
    commercialConditions: optionalText(version.commercialConditions),
    provenance: 'APPROVED_ESTIMATE_INTERNAL_DRAFT',
    provisional: true,
    priceSource,
    latestQualityRun: null,
    transmissionState: 'NOT_TRANSMITTED',
    transmission: null,
    clientResponseState: 'NONE',
    clientResponse: null,
  } satisfies Omit<InternalOfferView['version'], 'decisionState' | 'decision'>;
  const base = {
    id: root.id,
    companyId: root.companyId,
    opportunityId: root.opportunityId,
    illustrativeReference: root.illustrativeReference,
    revision: root.revision,
  };
  if (version.decisionState === 'PENDING' && version.decision === null)
    return {
      ...base,
      version: { ...content, decisionState: 'PENDING', decision: null },
    };
  if (version.decisionState !== 'REJECTED') invalid();
  const decision = readOfferDecision(version.decision, {
    offerVersionId: version.id,
  });
  if (decision.state !== 'REJECTED' || decision.offerRevision > root.revision)
    invalid();
  return {
    ...base,
    version: { ...content, decisionState: 'REJECTED', decision },
  };
}
function offerSourceId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  )
    invalid();
  return value;
}
function validOfferInstant(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    invalid();
  return value;
}

// Construct each parent variant in its narrowed branch to retain the required
// model scope fields and nested Version discriminant without a type assertion.
export function applyOfferDecision(
  offer: OfferReadView,
  decision: OfferDecisionView,
): OfferReadView {
  if (!isExecutableOffer(offer)) {
    if (decision.state !== 'REJECTED') return offer;
    return {
      ...offer,
      revision: decision.offerRevision,
      version: { ...offer.version, decisionState: 'REJECTED', decision },
    };
  }
  const facts = {
    ...offerDecisionState(decision),
    latestQualityRun:
      decision.state === 'APPROVED'
        ? decision.qualityRun
        : offer.version.latestQualityRun,
  };
  return isModelOffer(offer)
    ? {
        ...offer,
        revision: decision.offerRevision,
        version: { ...offer.version, ...facts },
      }
    : {
        ...offer,
        revision: decision.offerRevision,
        version: { ...offer.version, ...facts },
      };
}
export function applyOfferQuality(
  offer: OfferReadView,
  run: OfferQualityRunView,
): OfferReadView {
  if (!isExecutableOffer(offer)) return offer;
  return isModelOffer(offer)
    ? { ...offer, version: { ...offer.version, latestQualityRun: run } }
    : { ...offer, version: { ...offer.version, latestQualityRun: run } };
}
export function applyOfferTransmission(
  offer: OfferReadView,
  transmission: OfferTransmissionView,
): OfferReadView {
  if (!isExecutableOffer(offer)) return offer;
  const facts = {
    transmissionState: 'TRANSMITTED',
    clientResponseState: 'PENDING',
    clientResponse: null,
    transmission,
    latestQualityRun: transmission.qualityRun,
  } satisfies OfferTransmissionState & {
    latestQualityRun: OfferQualityRunView;
  };
  return isModelOffer(offer)
    ? {
        ...offer,
        revision: transmission.offerRevision,
        version: { ...offer.version, ...facts },
      }
    : {
        ...offer,
        revision: transmission.offerRevision,
        version: { ...offer.version, ...facts },
      };
}
export function applyOfferResponse(
  offer: OfferReadView,
  response: OfferClientResponseView,
): OfferReadView {
  if (
    !isExecutableOffer(offer) ||
    offer.version.transmissionState !== 'TRANSMITTED'
  )
    return offer;
  const facts = {
    transmissionState: 'TRANSMITTED',
    transmission: offer.version.transmission,
    ...offerClientResponseState(response),
  } satisfies OfferTransmissionState;
  return isModelOffer(offer)
    ? {
        ...offer,
        revision: response.offerRevision,
        version: { ...offer.version, ...facts },
      }
    : {
        ...offer,
        revision: response.offerRevision,
        version: { ...offer.version, ...facts },
      };
}
