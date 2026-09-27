import type { ActiveCompanyContext } from '../access/access.types.js';
import {
  canReadCommercialTarget,
  type CommercialTargetKind,
} from '../commercial-intake/commercial-intake.read-predicate.js';
import type { CommercialActivityEvent } from './accountability.types.js';

/**
 * The only commercial actions this projection may return, with the commercial
 * target whose current read authority each one requires. An action absent from
 * this map, or malformed persisted metadata, fails closed. The next-action
 * update is owned by its own slice; accepting it here adds no producer for it.
 */
const COMMERCIAL_ACTIVITY_TARGETS = {
  'client_request.created': 'client_request',
  'client_request.client_associated': 'client_request',
  'opportunity.created': 'opportunity',
  'opportunity.next_action.updated': 'opportunity',
} as const satisfies Record<string, CommercialTargetKind>;

export type CommercialActivityAction = keyof typeof COMMERCIAL_ACTIVITY_TARGETS;

// Listed explicitly so an unmapped action cannot reach the projection.
const COMMERCIAL_ACTIVITY_ACTIONS: readonly CommercialActivityAction[] = [
  'client_request.created',
  'client_request.client_associated',
  'opportunity.created',
  'opportunity.next_action.updated',
];

export function commercialActivityTargetOf(
  action: CommercialActivityAction,
): CommercialTargetKind {
  return COMMERCIAL_ACTIVITY_TARGETS[action];
}

/**
 * The target reference one projected event discloses. An Opportunity event
 * also names its containing Request, derived read-only, only for an actor who
 * can currently read Requests. The recorded Request is that Request: the
 * event's composite foreign key keeps it in the event's Workspace and Company,
 * which the projection query already requires to be the active Company.
 */
export function commercialActivityTarget(
  company: ActiveCompanyContext,
  action: CommercialActivityAction,
  recorded: {
    companyId: string;
    clientRequestId: string;
    opportunityId: string;
  },
): CommercialActivityEvent['target'] {
  if (commercialActivityTargetOf(action) === 'client_request')
    return {
      type: 'client_request',
      clientRequestId: recorded.clientRequestId,
      companyId: recorded.companyId,
    };
  return {
    type: 'opportunity',
    opportunityId: recorded.opportunityId,
    ...(canReadCommercialTarget(company, 'client_request')
      ? { clientRequestId: recorded.clientRequestId }
      : {}),
    companyId: recorded.companyId,
  };
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
 * The exact persisted metadata each action may carry. Both creation events are
 * recorded by commercial intake and constrained by
 * `commercial_intake_events_action_metadata_check` to exactly
 * `{"requestVersion": 1}` and `{"opportunityVersion": 1}`. The next-action
 * update carries its resulting Opportunity version only, starting at 2 after
 * the first increment. Every shape is closed: exactly the named field, nothing
 * else.
 */
const COMMERCIAL_ACTIVITY_METADATA = {
  'client_request.created': { versionField: 'requestVersion', version: 1 },
  'client_request.client_associated': {
    versionField: 'requestVersion',
    version: 2,
  },
  'opportunity.created': { versionField: 'opportunityVersion', version: 1 },
  'opportunity.next_action.updated': {
    versionField: 'opportunityVersion',
    version: 'resulting',
  },
} as const satisfies Record<
  CommercialActivityAction,
  { versionField: string; version: 1 | 2 | 'resulting' }
>;

/**
 * Persisted commercial event rows are an external boundary. An unrecognized
 * action, or metadata that is not exactly the shape its action records, is
 * omitted rather than projected.
 */
export function readCommercialActivityAction(
  row: unknown,
): CommercialActivityAction | undefined {
  if (!isPlainObject(row)) return undefined;
  const action = COMMERCIAL_ACTIVITY_ACTIONS.find(
    (candidate) => candidate === row.action,
  );
  if (!action) return undefined;
  return recordsMetadata(action, row.metadata) ? action : undefined;
}

function recordsMetadata(
  action: CommercialActivityAction,
  metadata: unknown,
): boolean {
  if (!isPlainObject(metadata)) return false;
  const contract = COMMERCIAL_ACTIVITY_METADATA[action];
  const fields = Object.keys(metadata);
  if (fields.length !== 1 || fields[0] !== contract.versionField) return false;
  const version = metadata[contract.versionField];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    return false;
  return contract.version === 'resulting'
    ? version >= 2
    : version === contract.version;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
