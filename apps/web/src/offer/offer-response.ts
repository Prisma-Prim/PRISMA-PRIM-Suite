export type OfferSnapshotSummary = {
  id: string;
  currency: string;
  total: string;
  committedAt: string;
};

export type OfferView = {
  id: string;
  illustrativeReference: number;
  revision: 1;
  version: {
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
    decisionState: 'PENDING';
    transmissionState: 'NOT_TRANSMITTED';
    clientResponseState: 'NONE';
    provenance: 'ILLUSTRATIVE';
    provisional: true;
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
    root.revision !== 1 ||
    version.versionNumber !== 1 ||
    typeof version.pricingSnapshotId !== 'string' ||
    (recipient.kind !== 'PRIMARY' && recipient.kind !== 'ADDITIONAL') ||
    typeof recipient.legalName !== 'string' ||
    typeof version.issuingCompanyLabel !== 'string' ||
    !positiveInteger(version.validityDays) ||
    typeof version.validUntil !== 'string' ||
    version.decisionState !== 'PENDING' ||
    version.transmissionState !== 'NOT_TRANSMITTED' ||
    version.clientResponseState !== 'NONE' ||
    version.provenance !== 'ILLUSTRATIVE' ||
    version.provisional !== true
  )
    invalid();
  return {
    id: root.id,
    illustrativeReference: root.illustrativeReference,
    revision: 1,
    version: {
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
      decisionState: 'PENDING',
      transmissionState: 'NOT_TRANSMITTED',
      clientResponseState: 'NONE',
      provenance: 'ILLUSTRATIVE',
      provisional: true,
    },
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
