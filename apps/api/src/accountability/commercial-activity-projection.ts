import type { ActiveCompanyContext } from '../access/access.types.js';
import {
  canReadCommercialTarget,
  type CommercialTargetKind,
} from '../commercial-intake/commercial-intake.read-predicate.js';
import {
  isOpportunityLossReasonCode,
  isOpportunityOutcomeStatus,
  isOutcomeTransition,
  type OpportunityLossReasonCode,
  type OpportunityOutcomeStatus,
} from '../commercial-intake/opportunity-outcome.js';
import type { CommercialActivityEvent } from './accountability.types.js';

/**
 * The only commercial actions this projection may return, with the commercial
 * target whose current read authority each one requires. An action absent from
 * this map, or malformed persisted metadata, fails closed. Each action is
 * recorded by its owning slice; accepting it here adds no producer for it.
 */
const COMMERCIAL_ACTIVITY_TARGETS = {
  'client_request.created': 'client_request',
  'client_request.client_associated': 'client_request',
  'opportunity.created': 'opportunity',
  'opportunity.next_action.updated': 'opportunity',
  'opportunity.responsible.changed': 'opportunity',
  'opportunity.outcome.changed': 'opportunity',
} as const satisfies Record<string, CommercialTargetKind>;

export type CommercialActivityAction = keyof typeof COMMERCIAL_ACTIVITY_TARGETS;

// Listed explicitly so an unmapped action cannot reach the projection.
const COMMERCIAL_ACTIVITY_ACTIONS: readonly CommercialActivityAction[] = [
  'client_request.created',
  'client_request.client_associated',
  'opportunity.created',
  'opportunity.next_action.updated',
  'opportunity.responsible.changed',
  'opportunity.outcome.changed',
];

/** A responsible actor as the change event captured it. */
export interface RecordedOpportunityResponsible {
  workspaceMembershipId: string;
  displayLabel: string;
}

/** An outcome status transition as its event recorded it, without the version. */
export type RecordedOpportunityOutcomeChange =
  | {
      previousStatus: OpportunityOutcomeStatus;
      newStatus: Exclude<OpportunityOutcomeStatus, 'LOST'>;
    }
  | {
      previousStatus: OpportunityOutcomeStatus;
      newStatus: 'LOST';
      lossReasonCode: OpportunityLossReasonCode;
    };

/**
 * The validated action of one persisted commercial event and the only metadata
 * its projection returns: nothing, the previous and new responsible actor of a
 * responsible-actor change, or the previous and new status of an outcome
 * status change with a loss's reason code; never the version.
 */
export type CommercialActivityRecord =
  | {
      action: Exclude<
        CommercialActivityAction,
        'opportunity.responsible.changed' | 'opportunity.outcome.changed'
      >;
      metadata: Record<string, never>;
    }
  | {
      action: 'opportunity.responsible.changed';
      metadata: {
        before: RecordedOpportunityResponsible;
        after: RecordedOpportunityResponsible;
      };
    }
  | {
      action: 'opportunity.outcome.changed';
      metadata: RecordedOpportunityOutcomeChange;
    };

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
 * The exact persisted version each action may carry. Both creation events are
 * recorded by commercial intake and constrained by
 * `commercial_intake_events_action_metadata_check` to exactly
 * `{"requestVersion": 1}` and `{"opportunityVersion": 1}`. The next-action
 * update carries its resulting Opportunity version only, starting at 2 after
 * the first increment. A responsible-actor change carries its resulting
 * version plus exactly the previous and new responsible actor. An outcome
 * status change carries its resulting version, the previous and new status of
 * one section 23.2 transition and, for a loss only, its reason code. Every
 * shape is closed: exactly the named fields, nothing else.
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
  'opportunity.responsible.changed': {
    versionField: 'opportunityVersion',
    version: 'resulting',
  },
  'opportunity.outcome.changed': {
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
export function readCommercialActivity(
  row: unknown,
): CommercialActivityRecord | undefined {
  if (!isPlainObject(row)) return undefined;
  const action = COMMERCIAL_ACTIVITY_ACTIONS.find(
    (candidate) => candidate === row.action,
  );
  if (!action || !isPlainObject(row.metadata)) return undefined;
  const { metadata } = row;
  if (action === 'opportunity.outcome.changed') {
    const change = recordedOutcomeChange(metadata);
    return change ? { action, metadata: change } : undefined;
  }
  if (action !== 'opportunity.responsible.changed')
    return recordsVersionOnly(action, metadata)
      ? { action, metadata: {} }
      : undefined;
  const fields = Object.keys(metadata).sort();
  if (
    fields.join(',') !== 'after,before,opportunityVersion' ||
    !isVersion(action, metadata.opportunityVersion)
  )
    return undefined;
  const before = recordedResponsible(metadata.before);
  const after = recordedResponsible(metadata.after);
  if (
    !before ||
    !after ||
    before.workspaceMembershipId === after.workspaceMembershipId
  )
    return undefined;
  return { action, metadata: { before, after } };
}

/** The validated action alone; see `readCommercialActivity`. */
export function readCommercialActivityAction(
  row: unknown,
): CommercialActivityAction | undefined {
  return readCommercialActivity(row)?.action;
}

function recordsVersionOnly(
  action: CommercialActivityAction,
  metadata: Record<string, unknown>,
): boolean {
  const contract = COMMERCIAL_ACTIVITY_METADATA[action];
  const fields = Object.keys(metadata);
  return (
    fields.length === 1 &&
    fields[0] === contract.versionField &&
    isVersion(action, metadata[contract.versionField])
  );
}

function isVersion(action: CommercialActivityAction, version: unknown) {
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    return false;
  const contract = COMMERCIAL_ACTIVITY_METADATA[action];
  return contract.version === 'resulting'
    ? version >= 2
    : version === contract.version;
}

function recordedOutcomeChange(
  metadata: Record<string, unknown>,
): RecordedOpportunityOutcomeChange | undefined {
  const { previousStatus, newStatus, lossReasonCode } = metadata;
  if (
    !isVersion('opportunity.outcome.changed', metadata.opportunityVersion) ||
    !isOpportunityOutcomeStatus(previousStatus) ||
    !isOpportunityOutcomeStatus(newStatus) ||
    !isOutcomeTransition(previousStatus, newStatus)
  )
    return undefined;
  const fields = Object.keys(metadata).sort().join(',');
  if (newStatus === 'LOST')
    return fields ===
      'lossReasonCode,newStatus,opportunityVersion,previousStatus' &&
      isOpportunityLossReasonCode(lossReasonCode)
      ? { previousStatus, newStatus, lossReasonCode }
      : undefined;
  return fields === 'newStatus,opportunityVersion,previousStatus'
    ? { previousStatus, newStatus }
    : undefined;
}

function recordedResponsible(
  value: unknown,
): RecordedOpportunityResponsible | undefined {
  if (!isPlainObject(value)) return undefined;
  const fields = Object.keys(value).sort();
  const { workspaceMembershipId, displayLabel } = value;
  if (
    fields.join(',') !== 'displayLabel,workspaceMembershipId' ||
    typeof workspaceMembershipId !== 'string' ||
    workspaceMembershipId.trim().length === 0 ||
    typeof displayLabel !== 'string' ||
    displayLabel.trim().length === 0
  )
    return undefined;
  return { workspaceMembershipId, displayLabel };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
