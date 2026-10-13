import type { ActiveCompanyContext } from '../access/access.types.js';
import {
  OFFER_QUALITY_CODES,
  type OfferQualityRuleSetVersion,
} from '../offer/offer-quality.js';
import { canReadOfferTarget } from '../offer/offer.read-predicate.js';

/**
 * The Offer family of the commercial Activity projection (section 25.1). Each
 * action is recorded by the Offer module under section 18.10; accepting it
 * here adds no producer. An action absent from this list, or persisted
 * metadata outside its recorded shape, fails closed.
 */
const OFFER_ACTIVITY_ACTIONS = [
  'offer.created',
  'offer_version.created',
  'offer_version.approved',
  'offer_version.rejected',
  'offer_version.transmission_recorded',
  'offer_version.client_response_recorded',
] as const;

export type OfferActivityAction = (typeof OFFER_ACTIVITY_ACTIONS)[number];

export type OfferClientResponseOutcome = 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

/** The Offer, named by its immutable illustrative reference, and its owner. */
interface OfferTargetReference {
  illustrativeReference: number;
  opportunityId: string;
  clientRequestId: string;
  companyId: string;
}

/**
 * The exact Offer Version an event concerns, superseded or not. An Offer
 * creation concerns version 1, recorded with it in the same command.
 */
type OfferVersionTarget = {
  type: 'offer_version';
  offerVersionId: string;
  versionNumber: number;
} & OfferTargetReference;

/**
 * The only content an Offer event projects (section 25.2): the target
 * reference, a Client response's outcome and the simulated marker of a
 * transmission or response. Never an amount, condition, scope, reason, note,
 * date, party identity, Snapshot content or warning.
 */
export type OfferActivityProjection =
  | {
      action:
        | 'offer.created'
        | 'offer_version.created'
        | 'offer_version.approved'
        | 'offer_version.rejected';
      target: OfferVersionTarget;
      metadata: Record<string, never>;
    }
  | {
      action: 'offer_version.transmission_recorded';
      target: OfferVersionTarget;
      metadata: { channel: 'SIMULATED' };
    }
  | {
      action: 'offer_version.client_response_recorded';
      target: OfferVersionTarget;
      metadata: {
        outcome: OfferClientResponseOutcome;
        evidenceKind: 'SIMULATED';
      };
    };

/**
 * The Offer actions one actor may currently see: the opt-in reader bundle and
 * the complete Offer read prerequisite, or none at all.
 */
export function eligibleOfferActivityActions(
  company: ActiveCompanyContext | undefined,
): readonly OfferActivityAction[] {
  const permissions = company?.commercialActivityPermissions ?? [];
  return permissions.includes('commercial.activity.read') &&
    canReadOfferTarget(company)
    ? OFFER_ACTIVITY_ACTIONS
    : [];
}

/**
 * One persisted Offer event joined to its current Offer, owning Opportunity
 * and the Offer Version it concerns: the event's own version, or version 1
 * for an Offer creation. Rows are an external boundary: anything other than
 * exactly the section 18.10 shape of a known action, consistent with the
 * resolved target, is omitted.
 */
export function readOfferActivity(
  row: unknown,
): OfferActivityProjection | undefined {
  if (!isPlainObject(row) || !isPlainObject(row.metadata)) return undefined;
  const { metadata } = row;
  const action = OFFER_ACTIVITY_ACTIONS.find(
    (candidate) => candidate === row.action,
  );
  const reference = targetReference(row);
  if (
    !action ||
    !reference ||
    typeof row.offerId !== 'string' ||
    metadata.offerId !== row.offerId ||
    metadata.provenance !== 'ILLUSTRATIVE'
  )
    return undefined;
  const target = versionTarget(row, reference);
  if (!target) return undefined;
  if (action === 'offer.created')
    return row.offerVersionId === null &&
      target.versionNumber === 1 &&
      hasExactly(metadata, [
        'illustrativeReference',
        'offerId',
        'provenance',
      ]) &&
      metadata.illustrativeReference === reference.illustrativeReference
      ? { action, target, metadata: {} }
      : undefined;
  if (
    row.offerVersionId !== target.offerVersionId ||
    metadata.offerVersionId !== target.offerVersionId ||
    metadata.versionNumber !== target.versionNumber
  )
    return undefined;
  switch (action) {
    case 'offer_version.created':
      return recordsCreatedVersion(metadata, target.versionNumber)
        ? { action, target, metadata: {} }
        : undefined;
    case 'offer_version.approved':
      return hasExactly(metadata, [...VERSION_FIELDS, ...BINDING_FIELDS]) &&
        metadata.outcome === 'APPROVED' &&
        recordsBinding(metadata)
        ? { action, target, metadata: {} }
        : undefined;
    case 'offer_version.rejected':
      return hasExactly(metadata, VERSION_FIELDS) &&
        metadata.outcome === 'REJECTED'
        ? { action, target, metadata: {} }
        : undefined;
    case 'offer_version.transmission_recorded':
      return hasExactly(metadata, [
        ...VERSION_IDENTITY_FIELDS,
        'channel',
        ...BINDING_FIELDS,
      ]) &&
        metadata.channel === 'SIMULATED' &&
        recordsBinding(metadata)
        ? { action, target, metadata: { channel: 'SIMULATED' } }
        : undefined;
    case 'offer_version.client_response_recorded': {
      const { outcome } = metadata;
      return hasExactly(metadata, [...VERSION_FIELDS, 'evidenceKind']) &&
        metadata.evidenceKind === 'SIMULATED' &&
        (outcome === 'ACCEPTED' ||
          outcome === 'REJECTED' ||
          outcome === 'EXPIRED')
        ? { action, target, metadata: { outcome, evidenceKind: 'SIMULATED' } }
        : undefined;
    }
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

const VERSION_IDENTITY_FIELDS = [
  'offerId',
  'offerVersionId',
  'versionNumber',
  'provenance',
] as const;
const VERSION_FIELDS = [...VERSION_IDENTITY_FIELDS, 'outcome'] as const;
const BINDING_FIELDS = ['ruleSetVersion', 'acknowledgedWarningCodes'] as const;

const SNAPSHOT_ID_GRAMMAR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function targetReference(
  row: Record<string, unknown>,
): OfferTargetReference | undefined {
  const { illustrativeReference, opportunityId, clientRequestId, companyId } =
    row;
  return isPositiveInteger(illustrativeReference) &&
    isIdentifier(opportunityId) &&
    isIdentifier(clientRequestId) &&
    isIdentifier(companyId)
    ? { illustrativeReference, opportunityId, clientRequestId, companyId }
    : undefined;
}

/** The Offer Version the query resolved for the event. */
function versionTarget(
  row: Record<string, unknown>,
  reference: OfferTargetReference,
): OfferVersionTarget | undefined {
  const { resolvedOfferVersionId, versionNumber } = row;
  if (
    !isIdentifier(resolvedOfferVersionId) ||
    !isPositiveInteger(versionNumber)
  )
    return undefined;
  return {
    type: 'offer_version',
    offerVersionId: resolvedOfferVersionId,
    versionNumber,
    ...reference,
  };
}

/** Version 1 has no predecessor; a successor names exactly the previous one. */
function recordsCreatedVersion(
  metadata: Record<string, unknown>,
  versionNumber: number,
): boolean {
  const fields = [
    ...VERSION_IDENTITY_FIELDS,
    'pricingSnapshotId',
    'recipientKind',
  ];
  return (
    (versionNumber === 1
      ? hasExactly(metadata, fields)
      : hasExactly(metadata, [...fields, 'predecessorVersionNumber']) &&
        metadata.predecessorVersionNumber === versionNumber - 1) &&
    typeof metadata.pricingSnapshotId === 'string' &&
    SNAPSHOT_ID_GRAMMAR.test(metadata.pricingSnapshotId) &&
    (metadata.recipientKind === 'PRIMARY' ||
      metadata.recipientKind === 'ADDITIONAL')
  );
}

/**
 * A known rule set version and a list of distinct known warning codes, the
 * closed vocabulary the Offer module records; neither is projected.
 */
function recordsBinding(metadata: Record<string, unknown>): boolean {
  const { ruleSetVersion, acknowledgedWarningCodes } = metadata;
  return (
    isRuleSetVersion(ruleSetVersion) &&
    Array.isArray(acknowledgedWarningCodes) &&
    new Set(acknowledgedWarningCodes).size ===
      acknowledgedWarningCodes.length &&
    acknowledgedWarningCodes.every((code) =>
      OFFER_QUALITY_CODES.some((known) => known === code),
    )
  );
}

function isRuleSetVersion(value: unknown): value is OfferQualityRuleSetVersion {
  return value === 1 || value === 2;
}

function hasExactly(
  metadata: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  const recorded = Object.keys(metadata).sort();
  const expected = [...fields].sort();
  return (
    recorded.length === expected.length &&
    recorded.every((field, index) => field === expected[index])
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
