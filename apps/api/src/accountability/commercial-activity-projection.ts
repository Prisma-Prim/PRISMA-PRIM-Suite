import type { ActiveCompanyContext } from '../access/access.types.js';
import {
  canReadCommercialTarget,
  type CommercialTargetKind,
} from '../commercial-intake/commercial-intake.read-predicate.js';

/**
 * The only commercial actions this projection may return, with the commercial
 * target whose current read authority each one requires. An action absent from
 * this map, or malformed persisted metadata, fails closed. The next-action
 * update is owned by its own slice; accepting it here adds no producer for it.
 */
const COMMERCIAL_ACTIVITY_TARGETS = {
  'client_request.created': 'client_request',
  'opportunity.created': 'opportunity',
  'opportunity.next_action.updated': 'opportunity',
} as const satisfies Record<string, CommercialTargetKind>;

export type CommercialActivityAction = keyof typeof COMMERCIAL_ACTIVITY_TARGETS;

// Listed explicitly so an unmapped action cannot reach the projection.
const COMMERCIAL_ACTIVITY_ACTIONS: readonly CommercialActivityAction[] = [
  'client_request.created',
  'opportunity.created',
  'opportunity.next_action.updated',
];

export function commercialActivityTargetOf(
  action: CommercialActivityAction,
): CommercialTargetKind {
  return COMMERCIAL_ACTIVITY_TARGETS[action];
}

/**
 * The actions one actor may currently see. The opt-in reader bundle is
 * required, and every action additionally requires current read authority for
 * its own commercial target, so partial authority narrows the query instead of
 * widening the page.
 */
export function eligibleCommercialActions(
  company: ActiveCompanyContext | undefined,
): CommercialActivityAction[] {
  const permissions = company?.commercialActivityPermissions ?? [];
  if (!permissions.includes('commercial.activity.read')) return [];
  return COMMERCIAL_ACTIVITY_ACTIONS.filter((action) =>
    canReadCommercialTarget(company, COMMERCIAL_ACTIVITY_TARGETS[action]),
  );
}

/**
 * Persisted commercial event rows are an external boundary. An unrecognized
 * action or malformed metadata is omitted rather than projected.
 */
export function readCommercialActivityAction(
  row: unknown,
): CommercialActivityAction | undefined {
  if (!isPlainObject(row) || !isPlainObject(row.metadata)) return undefined;
  const action = row.action;
  return COMMERCIAL_ACTIVITY_ACTIONS.find((candidate) => candidate === action);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
