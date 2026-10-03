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
    latestQualityRun: OfferQualityRunView | null;
    versionNumber: 1;
    pricingSnapshotId: string;
    pricingSnapshot: OfferSnapshotSummary;
    recipient: {
      kind: 'PRIMARY' | 'ADDITIONAL';
      legalName: string;
      taxId: string | null;
      legalAddress: string | null;
    };
    issuingCompanyLabel: string;
    validityDays: number;
    validUntil: string;
    scopeNote: string | null;
    commercialConditions: string | null;
    decisionState: 'PENDING' | 'APPROVED' | 'REJECTED';
    decision: OfferDecisionView | null;
    transmissionState: 'NOT_TRANSMITTED';
    clientResponseState: 'NONE';
    provenance: 'ILLUSTRATIVE';
    provisional: true;
    representation: {
      templateCode: 'OFFER_ILLUSTRATIVE';
      templateVersion: 1;
      html: string;
      sha256: string;
    };
  };
};

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
    version.versionNumber !== 1 ||
    typeof version.id !== 'string' ||
    typeof version.pricingSnapshotId !== 'string' ||
    (recipient.kind !== 'PRIMARY' && recipient.kind !== 'ADDITIONAL') ||
    typeof recipient.legalName !== 'string' ||
    typeof version.issuingCompanyLabel !== 'string' ||
    !positiveInteger(version.validityDays) ||
    typeof version.validUntil !== 'string' ||
    (version.decisionState !== 'PENDING' &&
      version.decisionState !== 'APPROVED' &&
      version.decisionState !== 'REJECTED') ||
    version.transmissionState !== 'NOT_TRANSMITTED' ||
    version.clientResponseState !== 'NONE' ||
    version.provenance !== 'ILLUSTRATIVE' ||
    version.provisional !== true
  )
    invalid();
  const decision =
    version.decision === null ||
    (version.decision === undefined && version.decisionState === 'PENDING')
      ? null
      : readOfferDecision(version.decision, version.id);
  if (
    version.decisionState !== (decision?.state ?? 'PENDING') ||
    (decision && decision.offerRevision > root.revision)
  )
    invalid();
  const representation = readRepresentation(version.representation);
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
      latestQualityRun:
        version.latestQualityRun === null
          ? null
          : readOfferQualityRun(version.latestQualityRun, version.id),
      versionNumber: 1,
      pricingSnapshotId: version.pricingSnapshotId,
      pricingSnapshot: readSnapshot(version.pricingSnapshot),
      recipient: {
        kind: recipient.kind,
        legalName: recipient.legalName,
        taxId: optionalText(recipient.taxId),
        legalAddress: optionalText(recipient.legalAddress),
      },
      issuingCompanyLabel: version.issuingCompanyLabel,
      validityDays: version.validityDays,
      validUntil: version.validUntil,
      scopeNote: optionalText(version.scopeNote),
      commercialConditions: optionalText(version.commercialConditions),
      decisionState: version.decisionState,
      decision,
      transmissionState: 'NOT_TRANSMITTED',
      clientResponseState: 'NONE',
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      representation,
    },
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
export type OfferQualityRunView = {
  id: string;
  offerVersionId: string;
  ruleSet: 'OFFER_QUALITY_ILLUSTRATIVE';
  ruleSetVersion: 1;
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
    run.ruleSetVersion !== 1 ||
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
    ruleSetVersion: 1,
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
    representation.templateVersion !== 1 ||
    typeof representation.html !== 'string' ||
    representation.html.length === 0 ||
    typeof representation.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(representation.sha256)
  )
    invalid();
  return {
    templateCode: 'OFFER_ILLUSTRATIVE',
    templateVersion: 1,
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
