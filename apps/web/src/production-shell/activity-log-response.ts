import { readOptionalResponsibleMember } from '../project/project-responsible-response';
import type {
  ActivityLogEvent,
  ClientUnionActivityLogEvent,
  OpportunityResponsibleChangedActivityLogEvent,
  OrdinaryActivityLogEvent,
  ProjectResponsibleChangedActivityLogEvent,
} from './company-context-transitions';

type ActivityAction = ActivityLogEvent['action'];

/**
 * The only target each delivered action may carry. A newly declared action
 * fails type checking here until its target is stated deliberately.
 */
const targetTypes = {
  'workspace_invitation.issued': 'workspace_invitation',
  'workspace_invitation.revoked': 'workspace_invitation',
  'workspace_invitation.accepted': 'workspace_invitation',
  'internal_user.provisioned': 'internal_user',
  'workspace_membership.suspended': 'workspace_membership',
  'workspace_sessions.revoked': 'workspace_membership',
  'workspace_sessions.revocation_retry_required': 'workspace_membership',
  'company.registered': 'company',
  'company_task_manager_assignment.granted': 'company_role_assignment',
  'company_task_manager_assignment.revoked': 'company_role_assignment',
  'company_project_assignment.granted': 'company_role_assignment',
  'company_project_assignment.revoked': 'company_role_assignment',
  'company_commercial_intake_assignment.granted': 'company_role_assignment',
  'company_commercial_intake_assignment.revoked': 'company_role_assignment',
  'company_service_catalogue_assignment.granted': 'company_role_assignment',
  'company_service_catalogue_assignment.revoked': 'company_role_assignment',
  'company_pricing_configuration_assignment.granted': 'company_role_assignment',
  'company_pricing_configuration_assignment.revoked': 'company_role_assignment',
  'company_pricing_user_assignment.granted': 'company_role_assignment',
  'company_pricing_user_assignment.revoked': 'company_role_assignment',
  'company_commercial_activity_reader_assignment.granted':
    'company_role_assignment',
  'company_commercial_activity_reader_assignment.revoked':
    'company_role_assignment',
  'company_opportunity_manager_assignment.granted': 'company_role_assignment',
  'company_opportunity_manager_assignment.revoked': 'company_role_assignment',
  'company_context_assignment.granted': 'company_role_assignment',
  'company_context_assignment.revoked': 'company_role_assignment',
  'company_director_client_assignment.granted': 'company_role_assignment',
  'company_director_client_assignment.revoked': 'company_role_assignment',
  'company_document_project_organizer_assignment.granted':
    'company_role_assignment',
  'company_document_project_organizer_assignment.revoked':
    'company_role_assignment',
  'company_document_registrar_assignment.granted': 'company_role_assignment',
  'company_document_registrar_assignment.revoked': 'company_role_assignment',
  'company_document_approver_assignment.granted': 'company_role_assignment',
  'company_document_approver_assignment.revoked': 'company_role_assignment',
  'client.created': 'client_account',
  'client.corrected': 'client_account',
  'client_legal_entity.registered': 'client_account',
  'client_legal_entity.corrected': 'client_account',
  'client_company_relationship.established': 'client_company_relationship',
  'project.created': 'project',
  'project.responsible.changed': 'project',
  'task.created': 'task',
  'task.updated': 'task',
  'task.status.changed': 'task',
  'task.completed': 'task',
  'task.cancelled': 'task',
  'task.reopened': 'task',
  'document.registered': 'document',
  'document.corrected': 'document',
  'document.version.drafted': 'document',
  'document.version.designated_official': 'document',
  'document.project.linked': 'document_project',
  'document.project.unlinked': 'document_project',
  'client.union_confirmed': 'client_union_operation',
  'client.union_reversed': 'client_union_operation',
  'client_request.created': 'client_request',
  'opportunity.created': 'opportunity',
  'opportunity.next_action.updated': 'opportunity',
  'opportunity.responsible.changed': 'opportunity',
} as const satisfies Record<ActivityAction, ActivityLogEvent['target']['type']>;

/**
 * Proves one successful `/activity-log` response. Every event must pair a
 * delivered action with that action's target and carry each identifier the
 * shell lists or opens. Anything else rejects the whole page, so a target from
 * an unproved payload is never listed or opened.
 */
export function activityLogPageResponse(value: unknown): {
  events: ActivityLogEvent[];
} {
  if (!isRecord(value) || !Array.isArray(value.events)) invalid();
  return { events: value.events.map(activityLogEvent) };
}

function activityLogEvent(value: unknown): ActivityLogEvent {
  if (!isRecord(value) || !isRecord(value.target)) invalid();
  const { action, target } = value;
  if (!isActivityAction(action) || target.type !== targetTypes[action])
    invalid();
  switch (action) {
    case 'client.union_confirmed':
    case 'client.union_reversed':
      return clientUnionEvent(value, action, target);
    case 'project.responsible.changed':
      return {
        ...recorded(value),
        action,
        target: {
          type: 'project',
          projectId: identifier(target.projectId),
          projectTitle: text(target.projectTitle),
          companyId: identifier(target.companyId),
        },
        metadata: responsibleChange(value.metadata),
      };
    case 'task.created':
    case 'task.updated':
    case 'task.status.changed':
    case 'task.completed':
    case 'task.cancelled':
    case 'task.reopened':
      return {
        ...recorded(value),
        action,
        target: {
          type: 'task',
          taskId: identifier(target.taskId),
          taskTitle: text(target.taskTitle),
          companyId: identifier(target.companyId),
        },
      };
    case 'document.registered':
    case 'document.version.drafted':
    case 'document.version.designated_official':
      return {
        ...recorded(value),
        action,
        target: {
          type: 'document',
          documentId: identifier(target.documentId),
          documentTitle: text(target.documentTitle),
          companyId: identifier(target.companyId),
        },
      };
    case 'document.corrected':
      return {
        ...recorded(value),
        action,
        target: {
          type: 'document',
          documentId: identifier(target.documentId),
          companyId: identifier(target.companyId),
        },
      };
    case 'document.project.linked':
    case 'document.project.unlinked':
      return {
        ...recorded(value),
        action,
        target: {
          type: 'document_project',
          documentId: identifier(target.documentId),
          documentTitle: text(target.documentTitle),
          projectId: identifier(target.projectId),
          projectTitle: text(target.projectTitle),
          companyId: identifier(target.companyId),
        },
      };
    case 'client_request.created':
      return {
        ...recorded(value),
        action,
        target: {
          type: 'client_request',
          clientRequestId: identifier(target.clientRequestId),
          companyId: identifier(target.companyId),
        },
      };
    case 'opportunity.created':
    case 'opportunity.next_action.updated':
      return {
        ...recorded(value),
        action,
        target: opportunityTarget(target),
      };
    case 'opportunity.responsible.changed':
      return {
        ...recorded(value),
        action,
        target: opportunityTarget(target),
        metadata: opportunityResponsibleChange(value.metadata),
      };
    default:
      return {
        ...recorded(value),
        action,
        target: ordinaryTarget(targetTypes[action], target),
      };
  }
}

function ordinaryTarget(
  type: OrdinaryActivityLogEvent['target']['type'],
  target: Record<string, unknown>,
): OrdinaryActivityLogEvent['target'] {
  switch (type) {
    case 'workspace_invitation':
      return { type, invitationId: identifier(target.invitationId) };
    case 'internal_user':
      return {
        type,
        internalUserId: identifier(target.internalUserId),
        displayName: text(target.displayName),
      };
    case 'workspace_membership':
      return {
        type,
        workspaceMembershipId: identifier(target.workspaceMembershipId),
        internalUserId: identifier(target.internalUserId),
        displayName: text(target.displayName),
      };
    case 'company':
      return {
        type,
        companyId: identifier(target.companyId),
        displayName: text(target.displayName),
      };
    case 'company_role_assignment':
      return {
        type,
        assignmentId: identifier(target.assignmentId),
        companyId: identifier(target.companyId),
        companyDisplayName: text(target.companyDisplayName),
        workspaceMembershipId: identifier(target.workspaceMembershipId),
        internalUserId: identifier(target.internalUserId),
        internalUserDisplayName: text(target.internalUserDisplayName),
      };
    case 'client_account': {
      // A correction keeps the Company that made it; a creation has none.
      const companyId = optional(target.companyId, identifier);
      const companyDisplayName = optional(target.companyDisplayName, text);
      return {
        type,
        clientAccountId: identifier(target.clientAccountId),
        displayName: text(target.displayName),
        ...(companyId === undefined ? {} : { companyId }),
        ...(companyDisplayName === undefined ? {} : { companyDisplayName }),
      };
    }
    case 'client_company_relationship':
      return {
        type,
        relationshipId: identifier(target.relationshipId),
        clientAccountId: identifier(target.clientAccountId),
        clientDisplayName: text(target.clientDisplayName),
        companyId: identifier(target.companyId),
        companyDisplayName: text(target.companyDisplayName),
      };
    case 'project':
      return {
        type,
        projectId: identifier(target.projectId),
        projectTitle: text(target.projectTitle),
        companyId: identifier(target.companyId),
      };
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

/** A redacted union names one operation of one Company, and no person. */
function clientUnionEvent(
  event: Record<string, unknown>,
  action: ClientUnionActivityLogEvent['action'],
  target: Record<string, unknown>,
): ClientUnionActivityLogEvent {
  const projectionReference = identifier(event.projectionReference);
  const companyId = identifier(event.companyId);
  if (
    !isRecord(event.actor) ||
    event.actor.kind !== 'authorized_resolver' ||
    target.projectionReference !== projectionReference ||
    target.companyId !== companyId
  )
    invalid();
  return {
    action,
    projectionReference,
    companyId,
    actor: { kind: 'authorized_resolver' },
    target: { type: 'client_union_operation', projectionReference, companyId },
  };
}

/** An Opportunity and, only for a current Request reader, its Request. */
function opportunityTarget(
  target: Record<string, unknown>,
): OpportunityResponsibleChangedActivityLogEvent['target'] {
  const clientRequestId = optional(target.clientRequestId, identifier);
  return {
    type: 'opportunity',
    opportunityId: identifier(target.opportunityId),
    ...(clientRequestId === undefined ? {} : { clientRequestId }),
    companyId: identifier(target.companyId),
  };
}

/**
 * A material Opportunity responsible-actor change: two different members,
 * each a membership identifier and captured label. An Opportunity always has a
 * responsible actor, so neither side is ever none.
 */
function opportunityResponsibleChange(
  metadata: unknown,
): OpportunityResponsibleChangedActivityLogEvent['metadata'] {
  if (!isRecord(metadata)) invalid();
  const before = readOptionalResponsibleMember(metadata.before);
  const after = readOptionalResponsibleMember(metadata.after);
  if (
    before === null ||
    after === null ||
    before.workspaceMembershipId === after.workspaceMembershipId
  )
    invalid();
  return { before, after };
}

/**
 * A material responsible-member change: its resulting revision and two
 * different sides, each a membership identifier and label or none.
 */
function responsibleChange(
  metadata: unknown,
): ProjectResponsibleChangedActivityLogEvent['metadata'] {
  if (!isRecord(metadata)) invalid();
  const { revision } = metadata;
  if (
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    invalid();
  const before = readOptionalResponsibleMember(metadata.before);
  const after = readOptionalResponsibleMember(metadata.after);
  if (before?.workspaceMembershipId === after?.workspaceMembershipId) invalid();
  return { revision, before, after };
}

/** The identity, time and actor label of every recorded event. */
function recorded(event: Record<string, unknown>) {
  if (!isRecord(event.actor)) invalid();
  return {
    id: identifier(event.id),
    occurredAt: timestamp(event.occurredAt),
    actor: {
      internalUserId: identifier(event.actor.internalUserId),
      displayName: text(event.actor.displayName),
    },
  };
}

function isActivityAction(value: unknown): value is ActivityAction {
  return typeof value === 'string' && Object.hasOwn(targetTypes, value);
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) invalid();
  return value;
}

function text(value: unknown): string {
  if (typeof value !== 'string') invalid();
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    invalid();
  return value;
}

function optional<T>(
  value: unknown,
  read: (value: unknown) => T,
): T | undefined {
  return value === undefined ? undefined : read(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(): never {
  throw new Error('Invalid Activity Log response.');
}
