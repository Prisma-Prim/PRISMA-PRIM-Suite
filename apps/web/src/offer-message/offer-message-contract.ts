import type { ActorContext } from '../access-types';
import type { CommercialPdfTarget } from '../commercial-pdf/commercial-pdf-response';
import {
  isIllustrativeOffer,
  isModelOffer,
  type OfferReadView,
} from '../offer/offer-response';

export type OfferMessageTarget = Extract<
  CommercialPdfTarget,
  { kind: 'offer' }
>;

export function offerMessageReadCapture(actor: ActorContext): string | null {
  const company = actor.activeCompany;
  const value =
    company && 'offerMessageReadCapture' in company
      ? company.offerMessageReadCapture
      : undefined;
  return typeof value === 'string' &&
    /^offer-message-read\.v1\.[0-9a-f]{64}$/u.test(value)
    ? value
    : null;
}

export function supportedOfferMessageTarget({
  actor,
  opportunityId,
  offer,
}: {
  actor: ActorContext;
  opportunityId: string;
  offer: OfferReadView;
}): OfferMessageTarget | null {
  const company = actor.activeCompany;
  if (
    !company ||
    (!isModelOffer(offer) && !isIllustrativeOffer(offer)) ||
    !/^[0-9a-f]{64}$/u.test(offer.version.representation.sha256)
  )
    return null;
  const common = {
    kind: 'offer',
    workspaceId: actor.workspaceId,
    companyId: company.id,
    opportunityId,
    rootId: offer.id,
    reference: offer.illustrativeReference,
    versionId: offer.version.id,
    versionNumber: offer.version.versionNumber,
    sourceRendererVersion: 1,
  } satisfies Partial<OfferMessageTarget>;
  if (
    isModelOffer(offer) &&
    offer.companyId === company.id &&
    offer.opportunityId === opportunityId &&
    offer.version.eligibility === 'NON_OFFICIAL_REHEARSAL' &&
    offer.version.modelSource.code === 'INTEGRATED_MANAGEMENT_CONSULTING_RO' &&
    offer.version.modelSource.language === 'ro' &&
    offer.version.representation.rendererCode ===
      'OFFER_COMPANY_CONSULTING_RO' &&
    offer.version.representation.rendererVersion === 1
  )
    return {
      ...common,
      provenance: 'COMPANY_MODEL_ESTIMATE',
      language: 'ro',
      createdAt: offer.version.financialDeclaration.declaredAt,
      sourceRendererCode: 'OFFER_COMPANY_CONSULTING_RO',
      sourceHtmlSha256: offer.version.representation.sha256,
    };
  // The server owns complete unadjusted-snapshot qualification. This is the
  // displayed candidate supported by the existing native PDF selection.
  if (
    isIllustrativeOffer(offer) &&
    offer.version.representation.templateCode === 'OFFER_ILLUSTRATIVE' &&
    offer.version.representation.templateVersion === 1 &&
    offer.version.createdAt !== null
  )
    return {
      ...common,
      provenance: 'ILLUSTRATIVE',
      language: 'en',
      createdAt: offer.version.createdAt,
      sourceRendererCode: 'OFFER_ILLUSTRATIVE',
      sourceHtmlSha256: offer.version.representation.sha256,
    };
  return null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exact(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    record(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => key in value)
  );
}
function nullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}
function readParty(value: unknown) {
  if (!record(value)) return null;
  const keys = ['kind', 'legalName', 'taxId', 'legalAddress'];
  if (value.kind === 'ADDITIONAL') keys.push('additionalLegalEntityId');
  if (
    !exact(value, keys) ||
    typeof value.legalName !== 'string' ||
    !nullableText(value.taxId) ||
    !nullableText(value.legalAddress)
  )
    return null;
  const common = {
    legalName: value.legalName,
    taxId: value.taxId,
    legalAddress: value.legalAddress,
  };
  if (value.kind === 'PRIMARY')
    return { ...common, kind: 'PRIMARY' } satisfies {
      kind: 'PRIMARY';
      legalName: string;
      taxId: string | null;
      legalAddress: string | null;
    };
  if (
    value.kind === 'ADDITIONAL' &&
    typeof value.additionalLegalEntityId === 'string'
  )
    return {
      ...common,
      kind: 'ADDITIONAL',
      additionalLegalEntityId: value.additionalLegalEntityId,
    } satisfies {
      kind: 'ADDITIONAL';
      legalName: string;
      taxId: string | null;
      legalAddress: string | null;
      additionalLegalEntityId: string;
    };
  return null;
}

export function readOfferMessageObservation({
  value,
  target,
  readCapture,
  workspaceMembershipId,
}: {
  value: unknown;
  target: OfferMessageTarget;
  readCapture: string;
  workspaceMembershipId: string;
}) {
  if (
    !exact(value, ['format', 'readCapture', 'source', 'party', 'actor']) ||
    value.format !== 'offer-message-preparation.v1' ||
    value.readCapture !== readCapture ||
    !record(value.source) ||
    Object.keys(value.source).length !== Object.keys(target).length ||
    !exact(value.actor, ['workspaceMembershipId', 'displayName']) ||
    value.actor.workspaceMembershipId !== workspaceMembershipId ||
    typeof value.actor.displayName !== 'string'
  )
    return null;
  const source = value.source;
  if (
    Object.entries(target).some(([key, expected]) => source[key] !== expected)
  )
    return null;
  const party = readParty(value.party);
  if (!party) return null;
  return {
    source: target,
    readCapture,
    party,
    actor: { workspaceMembershipId, displayName: value.actor.displayName },
  };
}

export type OfferMessageObservation = NonNullable<
  ReturnType<typeof readOfferMessageObservation>
>;
