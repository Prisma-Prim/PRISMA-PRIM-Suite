import type {
  DealDetail,
  DealStageView,
  DealSummary,
  OfferFact,
} from '../clarte/deals/deal-response';
import type { ClientRequest } from '../commercial-intake/CommercialIntakeWorkspace';

/**
 * Typed builders for the `GET /deals` responses web unit tests and
 * Playwright specs mock, derived from the Request detail they describe so the
 * list, the deal page and the Request stage agree. Only types are
 * imported: Playwright specs load this module without the screens.
 */
export function dealSummaryFor(
  request: ClientRequest,
  overrides: Partial<DealSummary> = {},
): DealSummary {
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

/** The stages of a deal that holds only its Request. */
export function requestOnlyStages(request: ClientRequest): DealStageView[] {
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

type CostingFacts = Extract<
  DealStageView,
  { stage: 'costing'; pricingSnapshot: unknown }
>;

/**
 * The stages of a deal with Costing and Offer records, by the stage rule:
 * the furthest stage holding a record is current, earlier ones are done.
 */
export function commercialStages(
  request: ClientRequest,
  records: Readonly<{
    pricingSnapshot?: CostingFacts['pricingSnapshot'];
    profitabilityEstimate?: CostingFacts['profitabilityEstimate'];
    offer?: OfferFact | null;
  }>,
): DealStageView[] {
  const pricingSnapshot = records.pricingSnapshot ?? {
    readable: true,
    value: null,
  };
  const profitabilityEstimate = records.profitabilityEstimate ?? {
    readable: true,
    value: null,
  };
  const offer = records.offer ?? null;
  const costed =
    (pricingSnapshot.readable && pricingSnapshot.value !== null) ||
    (profitabilityEstimate.readable && profitabilityEstimate.value !== null);
  const current = offer ? 'offer' : costed ? 'costing' : 'request';
  return [
    {
      stage: 'request',
      marker: current === 'request' ? 'current' : 'done',
      capturedAt: request.capturedAt,
      clientAssociationStatus: request.clientAssociationStatus,
    },
    {
      stage: 'costing',
      marker:
        current === 'costing'
          ? 'current'
          : current === 'request'
            ? 'upcoming'
            : costed
              ? 'done'
              : 'not_applicable',
      pricingSnapshot,
      profitabilityEstimate,
    },
    {
      stage: 'offer',
      marker: current === 'offer' ? 'current' : 'upcoming',
      offer,
    },
    { stage: 'contract', marker: 'upcoming', agreements: [] },
    { stage: 'delivery', marker: 'not_available' },
    { stage: 'closure', marker: 'not_available' },
    { stage: 'collection', marker: 'not_applicable', link: 'not_linked' },
  ];
}

/** The deal of a Request at the stage its Costing and Offer records give. */
export function commercialDealFor(
  request: ClientRequest,
  records: Parameters<typeof commercialStages>[1],
): DealDetail {
  const stages = commercialStages(request, records);
  const current = stages.find((view) => view.marker === 'current');
  return {
    ...dealSummaryFor(request, {
      thread: {
        kind: 'in_progress',
        currentStage: current?.stage ?? 'request',
      },
    }),
    opportunityVersion: request.initialOpportunity.version,
    stages,
  };
}

export function dealDetailFor(
  request: ClientRequest,
  overrides: Partial<DealDetail> = {},
): DealDetail {
  return {
    ...dealSummaryFor(request),
    opportunityVersion: request.initialOpportunity.version,
    stages: requestOnlyStages(request),
    ...overrides,
  };
}
