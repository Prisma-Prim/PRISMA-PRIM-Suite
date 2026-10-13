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
import { SALES_STAGE_LABEL_MAXIMUM_LENGTH } from '../sales-stage/sales-stage.definition.js';
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
  'opportunity.stage.changed': 'opportunity',
  'sales_stage.configured': 'sales_stage',
} as const satisfies Record<string, CommercialTargetKind>;

export type CommercialActivityAction = keyof typeof COMMERCIAL_ACTIVITY_TARGETS;

/** The actions recorded against a Request or an Opportunity. */
export type CommercialIntakeActivityAction = Exclude<
  CommercialActivityAction,
  'sales_stage.configured'
>;

// Listed explicitly so an unmapped action cannot reach the projection.
const COMMERCIAL_ACTIVITY_ACTIONS: readonly CommercialActivityAction[] = [
  'client_request.created',
  'client_request.client_associated',
  'opportunity.created',
  'opportunity.next_action.updated',
  'opportunity.responsible.changed',
  'opportunity.outcome.changed',
  'opportunity.stage.changed',
  'sales_stage.configured',
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

/** A Sales Stage as a change event captured it, or none. */
export type RecordedSalesStage = {
  salesStageId: string;
  label: string;
} | null;

/**
 * The validated action of one persisted commercial event and the only metadata
 * its projection returns: nothing, the previous and new responsible actor of a
 * responsible-actor change, the previous and new status of an outcome status
 * change with a loss's reason code, the previous and new stage labels of a
 * Sales Stage change, or the operation and label of a Sales Stage
 * configuration; never a version, a revision or a stage identifier.
 */
export type CommercialActivityRecord =
  | {
      action: Exclude<
        CommercialActivityAction,
        | 'opportunity.responsible.changed'
        | 'opportunity.outcome.changed'
        | 'opportunity.stage.changed'
        | 'sales_stage.configured'
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
    }
  | {
      action: 'opportunity.stage.changed';
      metadata: { previousLabel: string | null; newLabel: string | null };
    }
  | {
      action: 'sales_stage.configured';
      metadata: { operation: 'CREATED'; label: string };
    };

export function commercialActivityTargetOf(
  action: CommercialActivityAction,
): CommercialTargetKind {
  return COMMERCIAL_ACTIVITY_TARGETS[action];
}

/**
 * The target reference one projected Request or Opportunity event discloses.
 * An Opportunity event also names its containing Request, derived read-only,
 * only for an actor who can currently read Requests. The recorded Request is
 * that Request: the event's composite foreign key keeps it in the event's
 * Workspace and Company, which the projection query already requires to be
 * the active Company.
 */
export function commercialActivityTarget(
  company: ActiveCompanyContext,
  action: CommercialIntakeActivityAction,
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
 * The exact persisted version each Request or Opportunity action may carry.
 * Both creation events are recorded by commercial intake and constrained by
 * `commercial_intake_events_action_metadata_check` to exactly
 * `{"requestVersion": 1}` and `{"opportunityVersion": 1}`. The next-action
 * update carries its resulting Opportunity version only, starting at 2 after
 * the first increment. A responsible-actor change carries its resulting
 * version plus exactly the previous and new responsible actor. An outcome
 * status change carries its resulting version, the previous and new status of
 * one section 23.2 transition and, for a loss only, its reason code. A Sales
 * Stage change carries its resulting version and exactly the previous and new
 * stage, each an identifier and a captured label, or null. Every shape is
 * closed: exactly the named fields, nothing else.
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
  'opportunity.stage.changed': {
    versionField: 'opportunityVersion',
    version: 'resulting',
  },
} as const satisfies Record<
  CommercialIntakeActivityAction,
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
  switch (action) {
    case 'sales_stage.configured': {
      const label = recordedConfiguration(metadata);
      return label === undefined
        ? undefined
        : { action, metadata: { operation: 'CREATED', label } };
    }
    case 'opportunity.stage.changed': {
      const change = recordedStageChange(metadata);
      return change ? { action, metadata: change } : undefined;
    }
    case 'opportunity.outcome.changed': {
      const change = recordedOutcomeChange(metadata);
      return change ? { action, metadata: change } : undefined;
    }
    case 'opportunity.responsible.changed': {
      const change = recordedResponsibleChange(metadata);
      return change ? { action, metadata: change } : undefined;
    }
    case 'client_request.created':
    case 'client_request.client_associated':
    case 'opportunity.created':
    case 'opportunity.next_action.updated':
      return recordsVersionOnly(action, metadata)
        ? { action, metadata: {} }
        : undefined;
    default:
      return assertNeverAction(action);
  }
}

/** The validated action alone; see `readCommercialActivity`. */
export function readCommercialActivityAction(
  row: unknown,
): CommercialActivityAction | undefined {
  return readCommercialActivity(row)?.action;
}

function recordsVersionOnly(
  action: CommercialIntakeActivityAction,
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

function isVersion(action: CommercialIntakeActivityAction, version: unknown) {
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    return false;
  const contract = COMMERCIAL_ACTIVITY_METADATA[action];
  return contract.version === 'resulting'
    ? version >= 2
    : version === contract.version;
}

function recordedResponsibleChange(metadata: Record<string, unknown>):
  | {
      before: RecordedOpportunityResponsible;
      after: RecordedOpportunityResponsible;
    }
  | undefined {
  const fields = Object.keys(metadata).sort();
  if (
    fields.join(',') !== 'after,before,opportunityVersion' ||
    !isVersion('opportunity.responsible.changed', metadata.opportunityVersion)
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
  return { before, after };
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

// Exactly the resulting version and two different recorded stages; only their
// captured labels are projected.
function recordedStageChange(
  metadata: Record<string, unknown>,
): { previousLabel: string | null; newLabel: string | null } | undefined {
  if (
    Object.keys(metadata).sort().join(',') !==
      'newStage,opportunityVersion,previousStage' ||
    !isVersion('opportunity.stage.changed', metadata.opportunityVersion)
  )
    return undefined;
  const previous = recordedSalesStage(metadata.previousStage);
  const next = recordedSalesStage(metadata.newStage);
  if (
    previous === undefined ||
    next === undefined ||
    previous?.salesStageId === next?.salesStageId
  )
    return undefined;
  return {
    previousLabel: previous?.label ?? null,
    newLabel: next?.label ?? null,
  };
}

function recordedSalesStage(value: unknown): RecordedSalesStage | undefined {
  if (value === null) return null;
  if (!isPlainObject(value)) return undefined;
  const { salesStageId, label } = value;
  if (
    Object.keys(value).sort().join(',') !== 'label,salesStageId' ||
    typeof salesStageId !== 'string' ||
    salesStageId.trim().length === 0 ||
    !isStageLabel(label)
  )
    return undefined;
  return { salesStageId, label };
}

// A Create records exactly its operation, a positive revision and the label;
// the projection returns the operation and the label, never the revision.
function recordedConfiguration(
  metadata: Record<string, unknown>,
): string | undefined {
  const { operation, configurationRevision, label } = metadata;
  if (
    Object.keys(metadata).sort().join(',') !==
      'configurationRevision,label,operation' ||
    operation !== 'CREATED' ||
    typeof configurationRevision !== 'number' ||
    !Number.isInteger(configurationRevision) ||
    configurationRevision < 1 ||
    !isStageLabel(label)
  )
    return undefined;
  return label;
}

function isStageLabel(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= SALES_STAGE_LABEL_MAXIMUM_LENGTH
  );
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

function assertNeverAction(action: never): never {
  throw new Error(`Unhandled commercial Activity action: ${String(action)}`);
}
