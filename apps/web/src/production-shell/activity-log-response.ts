import { readStageActivityMetadata } from '../project/project-stage-response';
import { readOptionalResponsibleMember } from '../project/project-responsible-response';
import { readLifecycleActivityMetadata } from '../project/project-lifecycle-response';
import {
  isOpportunityOutcomeStatus,
  isOutcomeTransition,
  OPPORTUNITY_LOSS_REASON_CODES,
} from '../commercial-intake/opportunity-outcome';
import { isValidStageLabel } from '../commercial-intake/sales-stage';
import type {
  ActivityLogEvent,
  ClientUnionActivityLogEvent,
  ContractActivityLogEvent,
  ContractVersionActivityTarget,
  DocumentVersionActivityLogEvent,
  OfferActivityLogEvent,
  OfferVersionActivityTarget,
  OpportunityOutcomeChangedActivityLogEvent,
  OpportunityResponsibleChangedActivityLogEvent,
  OpportunityStageChangedActivityLogEvent,
  OrdinaryActivityLogEvent,
  ProjectResponsibleChangedActivityLogEvent,
} from './company-context-transitions';

type ActivityAction = ActivityLogEvent['action'];

/**
 * The only target each delivered action may carry. A newly declared action
 * fails type checking here until its target is stated deliberately.
 */
const targetTypes = {
  'company_offer_model_editor_assignment.granted': 'company_role_assignment',
  'company_contract_model_editor_assignment.granted': 'company_role_assignment',
  'company_offer_model_editor_assignment.revoked': 'company_role_assignment',
  'company_contract_model_editor_assignment.revoked': 'company_role_assignment',
  'company_offer_model_approver_assignment.granted': 'company_role_assignment',
  'company_contract_model_approver_assignment.granted':
    'company_role_assignment',
  'company_offer_model_approver_assignment.revoked': 'company_role_assignment',
  'company_contract_model_approver_assignment.revoked':
    'company_role_assignment',
  'company_ideas_reader_assignment.granted': 'company_role_assignment',
  'company_ideas_reader_assignment.revoked': 'company_role_assignment',
  'company_ideas_recorder_assignment.granted': 'company_role_assignment',
  'company_ideas_recorder_assignment.revoked': 'company_role_assignment',
  'company_ideas_reviewer_assignment.granted': 'company_role_assignment',
  'company_ideas_reviewer_assignment.revoked': 'company_role_assignment',

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
  'company_mission_result_reviewer_assignment.granted':
    'company_role_assignment',
  'company_mission_result_reviewer_assignment.revoked':
    'company_role_assignment',
  'company_task_result_recorder_assignment.granted': 'company_role_assignment',
  'company_task_result_recorder_assignment.revoked': 'company_role_assignment',
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
  'company_offer_preparer_assignment.granted': 'company_role_assignment',
  'company_offer_approver_assignment.granted': 'company_role_assignment',
  'company_offer_approver_assignment.revoked': 'company_role_assignment',
  'company_offer_preparer_assignment.revoked': 'company_role_assignment',
  'company_pricing_adjustment_assignment.granted': 'company_role_assignment',
  'company_pricing_adjustment_assignment.revoked': 'company_role_assignment',
  'company_commercial_activity_reader_assignment.granted':
    'company_role_assignment',
  'company_commercial_activity_reader_assignment.revoked':
    'company_role_assignment',
  'company_opportunity_manager_assignment.granted': 'company_role_assignment',
  'company_opportunity_manager_assignment.revoked': 'company_role_assignment',
  'company_sales_stage_configuration_assignment.granted':
    'company_role_assignment',
  'company_sales_stage_configuration_assignment.revoked':
    'company_role_assignment',
  'company_operational_risk_reader_assignment.granted':
    'company_role_assignment',
  'company_operational_risk_reader_assignment.revoked':
    'company_role_assignment',
  'company_operational_risk_recorder_assignment.granted':
    'company_role_assignment',
  'company_operational_risk_recorder_assignment.revoked':
    'company_role_assignment',
  'company_project_template_user_assignment.granted': 'company_role_assignment',
  'company_project_template_user_assignment.revoked': 'company_role_assignment',
  'company_project_stage_advancer_assignment.granted':
    'company_role_assignment',
  'company_project_stage_advancer_assignment.revoked':
    'company_role_assignment',
  'company_project_approver_assignment.granted': 'company_role_assignment',
  'company_project_approver_assignment.revoked': 'company_role_assignment',
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
  'company_received_contract_access_assignment.granted':
    'company_role_assignment',
  'company_received_contract_access_assignment.revoked':
    'company_role_assignment',
  'company_mission_deliverable_access_assignment.granted':
    'company_role_assignment',
  'company_mission_deliverable_access_assignment.revoked':
    'company_role_assignment',
  'company_document_content_reader_assignment.granted':
    'company_role_assignment',
  'company_document_content_reader_assignment.revoked':
    'company_role_assignment',
  'company_document_content_uploader_assignment.granted':
    'company_role_assignment',
  'company_document_content_uploader_assignment.revoked':
    'company_role_assignment',
  'company_document_approver_assignment.granted': 'company_role_assignment',
  'company_document_approver_assignment.revoked': 'company_role_assignment',
  'client.created': 'client_account',
  'client.corrected': 'client_account',
  'client_legal_entity.registered': 'client_account',
  'client_legal_entity.corrected': 'client_account',
  'client_company_relationship.established': 'client_company_relationship',
  'project.created': 'project',
  'project.responsible.changed': 'project',
  'project.lifecycle.changed': 'project',
  'project.stage.changed': 'project',
  'mission_plan.version.published': 'mission_plan_version',
  'company_mission_plan_configuration_assignment.granted':
    'company_role_assignment',
  'company_mission_plan_configuration_assignment.revoked':
    'company_role_assignment',
  'company_mission_plan_user_assignment.granted': 'company_role_assignment',
  'company_mission_plan_user_assignment.revoked': 'company_role_assignment',
  'project.template.version.created': 'project_template_version',
  'company_project_template_configuration_assignment.granted':
    'company_role_assignment',
  'company_project_template_configuration_assignment.revoked':
    'company_role_assignment',
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
  'document.representation.added': 'document',
  'document.representation.removed': 'document',
  'document.project.linked': 'document_project',
  'document.project.unlinked': 'document_project',
  'client.union_confirmed': 'client_union_operation',
  'client.union_reversed': 'client_union_operation',
  'client_request.created': 'client_request',
  'client_request.client_associated': 'client_request',
  'opportunity.created': 'opportunity',
  'opportunity.next_action.updated': 'opportunity',
  'opportunity.responsible.changed': 'opportunity',
  'opportunity.outcome.changed': 'opportunity',
  'offer.created': 'offer_version',
  'offer_version.created': 'offer_version',
  'offer_version.approved': 'offer_version',
  'offer_version.rejected': 'offer_version',
  'offer_version.transmission_recorded': 'offer_version',
  'offer_version.client_response_recorded': 'offer_version',
  'opportunity.stage.changed': 'opportunity',
  'sales_stage.configured': 'sales_stage',
  'contract.created': 'contract_version',
  'contract_version.created': 'contract_version',
  'contract_version.approved': 'contract_version',
  'contract_version.rejected': 'contract_version',
  'contract_version.signing_declared': 'contract_version',
  'company_contract_signature_declarer_assignment.granted':
    'company_role_assignment',
  'company_contract_signature_declarer_assignment.revoked':
    'company_role_assignment',
  'contract_version.signature_recorded': 'contract_version',
  'contract_project.linked': 'contract_version',
} as const satisfies Record<ActivityAction, ActivityLogEvent['target']['type']>;

/**
 * Proves one successful `/activity-log` response. Every event must pair a
 * delivered action with that action's target and carry each identifier the
 * shell lists or opens. Anything else rejects the whole page, so a target from
 * an unproved payload is never listed or opened. A lifecycle event whose
 * metadata is not exactly one transition is omitted, as it has no label.
 */
export function activityLogPageResponse(value: unknown): {
  events: ActivityLogEvent[];
} {
  if (!isRecord(value) || !Array.isArray(value.events)) invalid();
  return {
    events: value.events.flatMap((event: unknown) => {
      const proved = activityLogEvent(event);
      return proved ? [proved] : [];
    }),
  };
}

function activityLogEvent(value: unknown): ActivityLogEvent | undefined {
  if (!isRecord(value) || !isRecord(value.target)) invalid();
  const { action, target } = value;
  if (!isActivityAction(action) || target.type !== targetTypes[action])
    invalid();
  switch (action) {
    case 'project.stage.changed': {
      const metadata = readStageActivityMetadata(value.metadata);
      if (!metadata) return undefined;
      return {
        ...recorded(value),
        action,
        target: {
          type: 'project',
          projectId: identifier(target.projectId),
          projectTitle: text(target.projectTitle),
          companyId: identifier(target.companyId),
        },
        metadata,
      };
    }
    case 'project.lifecycle.changed': {
      const metadata = readLifecycleActivityMetadata(value.metadata);
      if (!metadata) return undefined;
      return {
        ...recorded(value),
        action,
        target: {
          type: 'project',
          projectId: identifier(target.projectId),
          projectTitle: text(target.projectTitle),
          companyId: identifier(target.companyId),
        },
        metadata,
      };
    }
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
    case 'mission_plan.version.published': {
      const m = value.metadata;
      if (!isRecord(m) || Object.keys(m).length !== 2) invalid();
      const versionNumber = positiveInteger(m.versionNumber),
        activityCount = positiveInteger(m.activityCount);
      if (activityCount > 50) invalid();
      return {
        ...recorded(value),
        action,
        target: {
          type: 'mission_plan_version',
          companyId: identifier(target.companyId),
          planId: identifier(target.planId),
          versionId: identifier(target.versionId),
        },
        metadata: { versionNumber, activityCount },
      };
    }
    case 'project.template.version.created': {
      const metadata = value.metadata;
      if (
        !isRecord(metadata) ||
        Object.keys(metadata).length !== 3 ||
        metadata.templateKey !== 'CONSULTING_PREPARATION_ILLUSTRATIVE'
      )
        invalid();
      const version = positiveInteger(metadata.version);
      const sourceVersion = positiveInteger(metadata.sourceVersion);
      if (version !== sourceVersion + 1) invalid();
      return {
        ...recorded(value),
        action,
        target: {
          type: 'project_template_version',
          versionId: identifier(target.versionId),
          companyId: identifier(target.companyId),
        },
        metadata: { templateKey: metadata.templateKey, version, sourceVersion },
      };
    }
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
    case 'document.version.drafted':
    case 'document.version.designated_official':
    case 'document.representation.added':
    case 'document.representation.removed':
      return documentVersionEvent(value, action, target);
    case 'document.registered':
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
    case 'client_request.client_associated':
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
    case 'opportunity.outcome.changed':
      return {
        ...recorded(value),
        action,
        target: opportunityTarget(target),
        metadata: opportunityOutcomeChange(value.metadata),
      };
    case 'offer.created':
    case 'offer_version.created':
    case 'offer_version.approved':
    case 'offer_version.rejected':
    case 'offer_version.transmission_recorded':
    case 'offer_version.client_response_recorded':
      return offerEvent(value, action, target);
    case 'opportunity.stage.changed':
      return {
        ...recorded(value),
        action,
        target: opportunityTarget(target),
        metadata: opportunityStageChange(value.metadata),
      };
    case 'sales_stage.configured':
      return {
        ...recorded(value),
        action,
        target: {
          type: 'sales_stage',
          salesStageId: identifier(target.salesStageId),
          companyId: identifier(target.companyId),
        },
        metadata: {
          operation: 'CREATED',
          label: salesStageCreated(value.metadata),
        },
      };
    case 'contract.created':
    case 'contract_version.created':
    case 'contract_version.approved':
    case 'contract_version.rejected':
    case 'contract_version.signing_declared':
    case 'contract_version.signature_recorded':
    case 'contract_project.linked':
      return contractEvent(value, action, target);
    default:
      return {
        ...recorded(value),
        action,
        target: ordinaryTarget(targetTypes[action], target),
      };
  }
}

/**
 * An Offer event names its Offer by illustrative reference and the exact
 * version it concerns, version 1 for the Offer's creation. Its metadata is
 * exactly empty, the
 * simulated channel of a transmission, or the outcome and simulated evidence
 * of a Client response; any other shape rejects the page.
 */
function offerEvent(
  event: Record<string, unknown>,
  action: OfferActivityLogEvent['action'],
  target: Record<string, unknown>,
): OfferActivityLogEvent {
  const { metadata } = event;
  if (!isRecord(metadata)) invalid();
  const reference = {
    illustrativeReference: positiveInteger(target.illustrativeReference),
    opportunityId: identifier(target.opportunityId),
    clientRequestId: identifier(target.clientRequestId),
    companyId: identifier(target.companyId),
  };
  const version: OfferVersionActivityTarget = {
    type: 'offer_version',
    offerVersionId: identifier(target.offerVersionId),
    versionNumber: positiveInteger(target.versionNumber),
    ...reference,
  };
  switch (action) {
    case 'offer.created':
      if (version.versionNumber !== 1 || Object.keys(metadata).length !== 0)
        invalid();
      return { ...recorded(event), action, target: version, metadata: {} };
    case 'offer_version.created':
    case 'offer_version.approved':
    case 'offer_version.rejected':
      if (Object.keys(metadata).length !== 0) invalid();
      return { ...recorded(event), action, target: version, metadata: {} };
    case 'offer_version.transmission_recorded':
      if (
        Object.keys(metadata).length !== 1 ||
        metadata.channel !== 'SIMULATED'
      )
        invalid();
      return {
        ...recorded(event),
        action,
        target: version,
        metadata: { channel: 'SIMULATED' },
      };
    case 'offer_version.client_response_recorded': {
      const { outcome } = metadata;
      if (
        Object.keys(metadata).length !== 2 ||
        metadata.evidenceKind !== 'SIMULATED' ||
        (outcome !== 'ACCEPTED' &&
          outcome !== 'REJECTED' &&
          outcome !== 'EXPIRED')
      )
        invalid();
      return {
        ...recorded(event),
        action,
        target: version,
        metadata: { outcome, evidenceKind: 'SIMULATED' },
      };
    }
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/**
 * A Contract event names the exact Contract Version it concerns, version 1
 * for a Contract's creation. Its metadata is exactly empty, the simulated
 * evidence of a signature, or a Project link's creation flag and Project
 * reference; any other shape rejects the page.
 */
function contractEvent(
  event: Record<string, unknown>,
  action: ContractActivityLogEvent['action'],
  target: Record<string, unknown>,
): ContractActivityLogEvent {
  const { metadata } = event;
  if (!isRecord(metadata)) invalid();
  const { kind } = target;
  if (kind !== 'CONTRACT' && kind !== 'PRECONTRACT' && kind !== 'ADDENDUM')
    invalid();
  const version: ContractVersionActivityTarget = {
    type: 'contract_version',
    contractId: identifier(target.contractId),
    contractVersionId: identifier(target.contractVersionId),
    kind,
    illustrativeReference: positiveInteger(target.illustrativeReference),
    versionNumber: positiveInteger(target.versionNumber),
    opportunityId: identifier(target.opportunityId),
    clientRequestId: identifier(target.clientRequestId),
    companyId: identifier(target.companyId),
  };
  switch (action) {
    case 'contract.created':
      if (version.versionNumber !== 1 || Object.keys(metadata).length !== 0)
        invalid();
      return { ...recorded(event), action, target: version, metadata: {} };
    case 'contract_version.created':
    case 'contract_version.approved':
    case 'contract_version.rejected':
      if (Object.keys(metadata).length !== 0) invalid();
      return { ...recorded(event), action, target: version, metadata: {} };
    case 'contract_version.signing_declared':
      if (
        kind !== 'CONTRACT' ||
        Object.keys(metadata).length !== 2 ||
        metadata.evidenceKind !== 'DECLARED_RECEIVED_PDF' ||
        metadata.provenance !== 'COMPANY_MODEL_OFFER'
      )
        invalid();
      return {
        ...recorded(event),
        action,
        target: version,
        metadata: {
          evidenceKind: 'DECLARED_RECEIVED_PDF',
          provenance: 'COMPANY_MODEL_OFFER',
        },
      };
    case 'contract_version.signature_recorded':
      if (
        Object.keys(metadata).length !== 1 ||
        metadata.evidenceKind !== 'SIMULATED'
      )
        invalid();
      return {
        ...recorded(event),
        action,
        target: version,
        metadata: { evidenceKind: 'SIMULATED' },
      };
    case 'contract_project.linked': {
      const { created, project } = metadata;
      if (
        Object.keys(metadata).length !== 2 ||
        typeof created !== 'boolean' ||
        !isRecord(project) ||
        Object.keys(project).length !== 2
      )
        invalid();
      return {
        ...recorded(event),
        action,
        target: version,
        metadata: {
          created,
          project: {
            projectId: identifier(project.projectId),
            projectTitle: text(project.projectTitle),
          },
        },
      };
    }
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

function documentVersionEvent(
  event: Record<string, unknown>,
  action: DocumentVersionActivityLogEvent['action'],
  target: Record<string, unknown>,
): DocumentVersionActivityLogEvent {
  if (!isRecord(event.metadata)) invalid();
  const base = {
    ...recorded(event),
    target: {
      type: 'document' as const,
      documentId: identifier(target.documentId),
      documentTitle: text(target.documentTitle),
      companyId: identifier(target.companyId),
    },
  };
  const versionNumber = positiveInteger(event.metadata.versionNumber);
  switch (action) {
    case 'document.version.drafted':
      return {
        ...base,
        action,
        metadata: {
          versionNumber,
          sourceVersionNumber: positiveInteger(
            event.metadata.sourceVersionNumber,
          ),
        },
      };
    case 'document.version.designated_official':
      return {
        ...base,
        action,
        metadata: {
          versionNumber,
          supersededVersionNumber:
            event.metadata.supersededVersionNumber === null
              ? null
              : positiveInteger(event.metadata.supersededVersionNumber),
        },
      };
    case 'document.representation.added': {
      const appendedAfterDesignation = event.metadata.appendedAfterDesignation;
      if (typeof appendedAfterDesignation !== 'boolean') invalid();
      return {
        ...base,
        action,
        metadata: {
          versionNumber,
          form: representationForm(event.metadata.form),
          appendedAfterDesignation,
        },
      };
    }
    case 'document.representation.removed':
      if (event.metadata.appendedAfterDesignation !== false) invalid();
      return {
        ...base,
        action,
        metadata: {
          versionNumber,
          form: representationForm(event.metadata.form),
          appendedAfterDesignation: false,
        },
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
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
 * An outcome status change: exactly one permitted transition and, for a loss
 * only, one known loss reason code. Any other shape rejects the page.
 */
function opportunityOutcomeChange(
  metadata: unknown,
): OpportunityOutcomeChangedActivityLogEvent['metadata'] {
  if (!isRecord(metadata)) invalid();
  const { previousStatus, newStatus, lossReasonCode } = metadata;
  if (
    !isOpportunityOutcomeStatus(previousStatus) ||
    !isOpportunityOutcomeStatus(newStatus) ||
    !isOutcomeTransition(previousStatus, newStatus)
  )
    invalid();
  if (newStatus !== 'LOST') {
    if (Object.keys(metadata).length !== 2) invalid();
    return { previousStatus, newStatus };
  }
  const code = OPPORTUNITY_LOSS_REASON_CODES.find(
    (candidate) => candidate === lossReasonCode,
  );
  if (!code || Object.keys(metadata).length !== 3) invalid();
  return { previousStatus, newStatus, lossReasonCode: code };
}

/**
 * A Sales Stage change: exactly the previous and new captured labels, each a
 * valid label or null, never both null. Any other shape rejects the page.
 */
function opportunityStageChange(
  metadata: unknown,
): OpportunityStageChangedActivityLogEvent['metadata'] {
  if (
    !isRecord(metadata) ||
    Object.keys(metadata).sort().join(',') !== 'newLabel,previousLabel'
  )
    invalid();
  const previousLabel = optionalStageLabel(metadata.previousLabel);
  const newLabel = optionalStageLabel(metadata.newLabel);
  if (previousLabel === null && newLabel === null) invalid();
  return { previousLabel, newLabel };
}

/** A created stage: exactly the CREATED operation and its label. */
function salesStageCreated(metadata: unknown): string {
  if (
    !isRecord(metadata) ||
    Object.keys(metadata).sort().join(',') !== 'label,operation' ||
    metadata.operation !== 'CREATED' ||
    typeof metadata.label !== 'string' ||
    !isValidStageLabel(metadata.label)
  )
    invalid();
  return metadata.label;
}

function optionalStageLabel(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !isValidStageLabel(value)) invalid();
  return value;
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

function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    invalid();
  return value;
}

function representationForm(
  value: unknown,
): 'editable' | 'rendered' | 'signed' | 'other' {
  if (
    value !== 'editable' &&
    value !== 'rendered' &&
    value !== 'signed' &&
    value !== 'other'
  )
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
