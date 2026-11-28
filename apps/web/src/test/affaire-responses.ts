import type {
  AffaireDetail,
  AffaireStageView,
  AffaireSummary,
} from '../clarte/affaires/affaire-response';
import type { ClientRequest } from '../commercial-intake/CommercialIntakeWorkspace';

/**
 * Typed builders for the `GET /affaires` responses web unit tests and
 * Playwright specs mock, derived from the Request detail they describe so the
 * list, the affaire page and the Request stage agree. Only types are
 * imported: Playwright specs load this module without the screens.
 */
export function affaireSummaryFor(
  request: ClientRequest,
  overrides: Partial<AffaireSummary> = {},
): AffaireSummary {
  const opportunity = request.initialOpportunity;
  return {
    opportunityId: opportunity.id,
    clientRequestId: request.id,
    title: opportunity.title,
    subject: request.subject,
    client: request.clientReference
      ? {
          displayName: request.clientReference.displayName,
          ...(request.clientReference.currentClientId
            ? { clientDossierId: request.clientReference.currentClientId }
            : {}),
        }
      : null,
    status: opportunity.status,
    owner: opportunity.responsibleActor,
    nextAction: opportunity.nextAction,
    salesStage: opportunity.salesStage,
    followUpOn: { readable: false },
    lastChangedAt: opportunity.createdAt,
    thread: { kind: 'in_progress', currentStage: 'request' },
    ...overrides,
  };
}

/** The stages of an affaire that holds only its Request. */
export function requestOnlyStages(request: ClientRequest): AffaireStageView[] {
  return [
    {
      stage: 'request',
      marker: 'current',
      capturedAt: request.capturedAt,
      clientAssociationStatus: request.clientAssociationStatus,
    },
    {
      stage: 'costing',
      marker: 'upcoming',
      pricingSnapshot: { readable: true, value: null },
      profitabilityEstimate: { readable: true, value: null },
    },
    { stage: 'offer', marker: 'upcoming', offer: null },
    { stage: 'contract', marker: 'upcoming', agreements: [] },
    { stage: 'delivery', marker: 'not_available' },
    { stage: 'closure', marker: 'not_available' },
    { stage: 'collection', marker: 'not_applicable', link: 'not_linked' },
  ];
}

export function affaireDetailFor(
  request: ClientRequest,
  overrides: Partial<AffaireDetail> = {},
): AffaireDetail {
  return {
    ...affaireSummaryFor(request),
    opportunityVersion: request.initialOpportunity.version,
    stages: requestOnlyStages(request),
    ...overrides,
  };
}
