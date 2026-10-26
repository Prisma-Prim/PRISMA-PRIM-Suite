import { isOpportunityOutcomeStatus } from './opportunity-outcome';
import { isOpportunitySalesStage } from './sales-stage';

/** Only the inline overview's facts; economic/detail contracts stay with their owners. */
export function parseClientCommercialPage(
  value: unknown,
  clientDossierId: string,
) {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 25
  )
    throw new Error('Invalid Client commercial page.');
  const ids = new Set<string>();
  const items = value.items.map((item: unknown) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      !item.id ||
      item.clientDossierId !== clientDossierId ||
      !(item.subject === null || typeof item.subject === 'string') ||
      !isRecord(item.initialOpportunity)
    )
      throw new Error('Invalid Client commercial affair.');
    const opportunity = item.initialOpportunity;
    if (
      typeof opportunity.title !== 'string' ||
      typeof opportunity.nextAction !== 'string' ||
      !isOpportunityOutcomeStatus(opportunity.status) ||
      !isOpportunitySalesStage(opportunity.salesStage) ||
      !isRecord(opportunity.responsibleActor) ||
      typeof opportunity.responsibleActor.displayName !== 'string' ||
      ids.has(item.id)
    )
      throw new Error('Invalid Client commercial facts.');
    ids.add(item.id);
    return {
      id: item.id,
      title: item.subject ?? opportunity.title,
      nextAction: opportunity.nextAction,
      status: opportunity.status,
      responsibleDisplayName: opportunity.responsibleActor.displayName,
      salesStage: opportunity.salesStage,
    };
  });
  if (
    value.nextCursor !== undefined &&
    (typeof value.nextCursor !== 'string' ||
      !value.nextCursor ||
      items.length !== 25)
  )
    throw new Error('Invalid Client commercial continuation.');
  return {
    items,
    ...(typeof value.nextCursor === 'string'
      ? { nextCursor: value.nextCursor }
      : {}),
  };
}
export type ClientCommercialPage = ReturnType<typeof parseClientCommercialPage>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
