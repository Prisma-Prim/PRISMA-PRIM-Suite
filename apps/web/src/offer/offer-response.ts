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
    qualityRuleSet: OfferQualityRunView['ruleSet'];
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

export function readOfferDetail(value: unknown): OfferView | null {
  const detail = record(value);
  return detail.offer === null ? null : readOffer(detail.offer);
}

export function readOffer(value: unknown): OfferView {
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
  const decision =
    version.decision === null ||
    (version.decision === undefined && version.decisionState === 'PENDING')
      ? null
      : readOfferDecision(version.decision, version.id);
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
  const representation = readRepresentation(version.representation);
  if (
    version.qualityRuleSet !== 'OFFER_QUALITY_ILLUSTRATIVE' ||
    version.qualityRuleSetVersion !== representation.templateVersion
  )
    invalid();
  const qualityRuleSetVersion = representation.templateVersion;
  const latestQualityRun =
    version.latestQualityRun === null
      ? null
      : readOfferQualityRun(version.latestQualityRun, version.id);
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
      version.id,
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
    (decision?.state === 'APPROVED' &&
      decision.representationSha256 !== representation.sha256) ||
    [
      latestQualityRun,
      decision?.state === 'APPROVED' ? decision.qualityRun : null,
      transmissionState.transmission?.qualityRun ?? null,
    ].some(
      (run) => run !== null && run.ruleSetVersion !== qualityRuleSetVersion,
    )
  )
    invalid();
  return {
    id: root.id,
    illustrativeReference: root.illustrativeReference,
    revision: root.revision,
    version: {
      id: version.id,
      qualityRuleSet: 'OFFER_QUALITY_ILLUSTRATIVE',
      qualityRuleSetVersion,
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
function readOfferDifferences(
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

export function readOfferDecision(
  value: unknown,
  offerVersionId: string,
): OfferDecisionView {
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
  const qualityRun = readOfferQualityRun(row.qualityRun, offerVersionId);
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
  offerVersionId: string,
  approval: OfferDecisionView | null,
): OfferTransmissionView {
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
  const qualityRun = readOfferQualityRun(row.qualityRun, offerVersionId);
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

export const offerQualityLabels = {
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

export type OfferQualityRunView = {
  id: string;
  offerVersionId: string;
  ruleSet: 'OFFER_QUALITY_ILLUSTRATIVE';
  ruleSetVersion: OfferBindingVersion;
  actorWorkspaceMembershipId: string;
  evaluatedAt: string;
  results: Array<{
    code: keyof typeof offerQualityLabels;
    status: 'PASS' | 'WARNING' | 'ERROR';
  }>;
};

export function readOfferQualityRun(
  value: unknown,
  offerVersionId: string,
): OfferQualityRunView {
  const run = record(value);
  if (
    typeof run.id !== 'string' ||
    run.offerVersionId !== offerVersionId ||
    run.ruleSet !== 'OFFER_QUALITY_ILLUSTRATIVE' ||
    !isOfferBindingVersion(run.ruleSetVersion) ||
    typeof run.actorWorkspaceMembershipId !== 'string' ||
    typeof run.evaluatedAt !== 'string' ||
    !Number.isFinite(Date.parse(run.evaluatedAt)) ||
    !Array.isArray(run.results) ||
    run.results.length !== 8
  )
    invalid();
  const expectedCodes = Object.keys(offerQualityLabels);
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
        code === 'PRICING_SNAPSHOT_COHERENT' ||
        code === 'VALIDITY_OPEN' ||
        code === 'RECIPIENT_AVAILABLE' ||
        code === 'PROVISIONAL_MARKER_PRESENT'
          ? 'ERROR'
          : 'WARNING';
      if (item.status !== 'PASS' && item.status !== severity) invalid();
      return { code, status: item.status };
    },
  );
  return {
    id: run.id,
    offerVersionId,
    ruleSet: 'OFFER_QUALITY_ILLUSTRATIVE',
    ruleSetVersion: run.ruleSetVersion,
    actorWorkspaceMembershipId: run.actorWorkspaceMembershipId,
    evaluatedAt: run.evaluatedAt,
    results,
  };
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
