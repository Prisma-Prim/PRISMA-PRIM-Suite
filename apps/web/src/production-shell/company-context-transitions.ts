import type { TaskEvent } from '../project/task-response';
import type { ResponsibleMember } from '../project/project-responsible-response';
import type { ProjectLifecycleActivityMetadata } from '../project/project-lifecycle-response';
import type { ActorContext } from '../access-types';
import type {
  OpportunityLossReasonCode,
  OpportunityOutcomeStatus,
} from '../commercial-intake/opportunity-outcome';

export interface VisibleCompany {
  id: string;
  displayName: string;
}

interface ReadyCompanyContextState {
  status: 'ready';
  selection: { status: 'idle' } | { status: 'pending'; companyId: string };
  recoveryMessage?: 'stale' | 'selection-failed';
  rejectionCandidate?: { companyId: string };
}

interface CompanyContextRecovery {
  companies: VisibleCompany[];
  rejectionCandidate?: { companyId: string };
}

export type CompanyContextState =
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'error'; recovery?: undefined }
  | {
      status: 'error';
      recovery: CompanyContextRecovery;
    }
  | (ReadyCompanyContextState & { cardinality: 'zero'; companies: [] })
  | (ReadyCompanyContextState & {
      cardinality: 'one';
      companies: [VisibleCompany];
    })
  | (ReadyCompanyContextState & {
      cardinality: 'many';
      companies: [VisibleCompany, VisibleCompany, ...VisibleCompany[]];
    });

export interface OrdinaryActivityLogEvent {
  id: string;
  action:
    | 'workspace_invitation.issued'
    | 'workspace_invitation.revoked'
    | 'workspace_invitation.accepted'
    | 'internal_user.provisioned'
    | 'workspace_membership.suspended'
    | 'workspace_sessions.revoked'
    | 'workspace_sessions.revocation_retry_required'
    | 'project.created'
    | 'company_ideas_reader_assignment.granted'
    | 'company_ideas_reader_assignment.revoked'
    | 'company_ideas_recorder_assignment.granted'
    | 'company_ideas_recorder_assignment.revoked'
    | 'company_ideas_reviewer_assignment.granted'
    | 'company_ideas_reviewer_assignment.revoked'
    | 'company_task_manager_assignment.granted'
    | 'company_task_manager_assignment.revoked'
    | 'company_project_assignment.granted'
    | 'company_project_assignment.revoked'
    | 'company_commercial_intake_assignment.granted'
    | 'company_commercial_intake_assignment.revoked'
    | 'company_service_catalogue_assignment.granted'
    | 'company_service_catalogue_assignment.revoked'
    | 'company_pricing_configuration_assignment.granted'
    | 'company_pricing_configuration_assignment.revoked'
    | 'company_pricing_user_assignment.granted'
    | 'company_pricing_user_assignment.revoked'
    | 'company_offer_preparer_assignment.granted'
    | 'company_offer_model_editor_assignment.granted'
    | 'company_mission_plan_configuration_assignment.granted'
    | 'company_mission_plan_configuration_assignment.revoked'
    | 'company_mission_plan_user_assignment.granted'
    | 'company_mission_plan_user_assignment.revoked'
    | 'company_contract_model_editor_assignment.granted'
    | 'company_offer_model_editor_assignment.revoked'
    | 'company_contract_model_editor_assignment.revoked'
    | 'company_offer_model_approver_assignment.granted'
    | 'company_contract_model_approver_assignment.granted'
    | 'company_offer_model_approver_assignment.revoked'
    | 'company_contract_model_approver_assignment.revoked'
    | 'company_offer_approver_assignment.granted'
    | 'company_offer_preparer_assignment.revoked'
    | 'company_offer_approver_assignment.revoked'
    | 'company_pricing_adjustment_assignment.granted'
    | 'company_pricing_adjustment_assignment.revoked'
    | 'company_commercial_activity_reader_assignment.granted'
    | 'company_commercial_activity_reader_assignment.revoked'
    | 'company_opportunity_manager_assignment.granted'
    | 'company_opportunity_manager_assignment.revoked'
    | 'company_sales_stage_configuration_assignment.granted'
    | 'company_sales_stage_configuration_assignment.revoked'
    | 'company_operational_risk_reader_assignment.granted'
    | 'company_operational_risk_reader_assignment.revoked'
    | 'company_operational_risk_recorder_assignment.granted'
    | 'company_operational_risk_recorder_assignment.revoked'
    | 'company_project_template_configuration_assignment.granted'
    | 'company_project_template_configuration_assignment.revoked'
    | 'company_project_template_user_assignment.granted'
    | 'company_project_template_user_assignment.revoked'
    | 'company_project_stage_advancer_assignment.granted'
    | 'company_project_stage_advancer_assignment.revoked'
    | 'company_project_approver_assignment.granted'
    | 'company_project_approver_assignment.revoked'
    | 'company.registered'
    | 'company_context_assignment.granted'
    | 'company_context_assignment.revoked'
    | 'company_director_client_assignment.granted'
    | 'company_director_client_assignment.revoked'
    | 'company_document_project_organizer_assignment.granted'
    | 'company_document_project_organizer_assignment.revoked'
    | 'company_document_registrar_assignment.granted'
    | 'company_document_registrar_assignment.revoked'
    | 'company_contract_signature_declarer_assignment.granted'
    | 'company_contract_signature_declarer_assignment.revoked'
    | 'company_received_contract_access_assignment.granted'
    | 'company_received_contract_access_assignment.revoked'
    | 'company_mission_deliverable_access_assignment.granted'
    | 'company_mission_deliverable_access_assignment.revoked'
    | 'company_mission_result_reviewer_assignment.granted'
    | 'company_mission_applicability_coordinator_assignment.granted'
    | 'company_project_next_action_coordinator_assignment.granted'
    | 'company_project_next_action_coordinator_assignment.revoked'
    | 'company_mission_applicability_approver_assignment.granted'
    | 'company_mission_result_reviewer_assignment.revoked'
    | 'company_mission_applicability_coordinator_assignment.revoked'
    | 'company_mission_applicability_approver_assignment.revoked'
    | 'company_task_result_recorder_assignment.granted'
    | 'company_task_result_recorder_assignment.revoked'
    | 'company_document_content_reader_assignment.granted'
    | 'company_document_content_reader_assignment.revoked'
    | 'company_document_content_uploader_assignment.granted'
    | 'company_document_content_uploader_assignment.revoked'
    | 'company_document_approver_assignment.granted'
    | 'company_document_approver_assignment.revoked'
    | 'client.created'
    | 'client_company_relationship.established'
    | 'client.corrected'
    | 'client_legal_entity.registered'
    | 'client_legal_entity.corrected';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target:
    | {
        type: 'project';
        projectId: string;
        projectTitle: string;
        companyId: string;
      }
    | { type: 'workspace_invitation'; invitationId: string }
    | {
        type: 'internal_user';
        internalUserId: string;
        displayName: string;
      }
    | {
        type: 'workspace_membership';
        workspaceMembershipId: string;
        internalUserId: string;
        displayName: string;
      }
    | { type: 'company'; companyId: string; displayName: string }
    | {
        type: 'company_role_assignment';
        assignmentId: string;
        companyId: string;
        companyDisplayName: string;
        workspaceMembershipId: string;
        internalUserId: string;
        internalUserDisplayName: string;
      }
    | {
        type: 'client_account';
        clientAccountId: string;
        displayName: string;
        companyId?: string;
        companyDisplayName?: string;
      }
    | {
        type: 'client_company_relationship';
        relationshipId: string;
        clientAccountId: string;
        clientDisplayName: string;
        companyId: string;
        companyDisplayName: string;
      };
}

/** A Task event as the Activity Log lists it, without its change metadata. */
export interface TaskActivityLogEvent {
  id: string;
  action: TaskEvent['action'];
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: TaskEvent['target'];
}

export interface ClientUnionActivityLogEvent {
  action: 'client.union_confirmed' | 'client.union_reversed';
  projectionReference: string;
  companyId: string;
  actor: { kind: 'authorized_resolver' };
  target: {
    type: 'client_union_operation';
    projectionReference: string;
    companyId: string;
  };
}

export interface DocumentRegisteredActivityLogEvent {
  id: string;
  action: 'document.registered';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'document';
    documentId: string;
    documentTitle: string;
    companyId: string;
  };
}
export interface DocumentCorrectedActivityLogEvent {
  id: string;
  action: 'document.corrected';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'document';
    documentId: string;
    companyId: string;
  };
}
/** One committed Version command with its minimal, validated metadata. */
export type DocumentVersionActivityLogEvent =
  | DocumentVersionActivityLogEventBase<
      'document.version.drafted',
      { versionNumber: number; sourceVersionNumber: number }
    >
  | DocumentVersionActivityLogEventBase<
      'document.version.designated_official',
      { versionNumber: number; supersededVersionNumber: number | null }
    >
  | DocumentVersionActivityLogEventBase<
      'document.representation.added',
      {
        versionNumber: number;
        form: 'editable' | 'rendered' | 'signed' | 'other';
        appendedAfterDesignation: boolean;
      }
    >
  | DocumentVersionActivityLogEventBase<
      'document.representation.removed',
      {
        versionNumber: number;
        form: 'editable' | 'rendered' | 'signed' | 'other';
        appendedAfterDesignation: false;
      }
    >;
interface DocumentVersionActivityLogEventBase<Action extends string, Metadata> {
  id: string;
  action: Action;
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'document';
    documentId: string;
    documentTitle: string;
    companyId: string;
  };
  metadata: Metadata;
}
export interface DocumentProjectActivityLogEvent {
  id: string;
  action: 'document.project.linked' | 'document.project.unlinked';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'document_project';
    documentId: string;
    documentTitle: string;
    projectId: string;
    projectTitle: string;
    companyId: string;
  };
}
/**
 * The authorized Company projection of a recorded commercial event. It never
 * carries request text, source label, subject, next action or Opportunity
 * scope.
 */
export interface CommercialActivityLogEvent {
  id: string;
  action:
    | 'client_request.created'
    | 'client_request.client_associated'
    | 'opportunity.created'
    | 'opportunity.next_action.updated';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target:
    | { type: 'client_request'; clientRequestId: string; companyId: string }
    | {
        type: 'opportunity';
        opportunityId: string;
        /** The containing Request, present only for a current Request reader. */
        clientRequestId?: string;
        companyId: string;
      };
}

/**
 * A changed Opportunity responsible actor: the previous and new member, each
 * only a membership identifier and the label captured at the change.
 */
export interface OpportunityResponsibleChangedActivityLogEvent {
  id: string;
  action: 'opportunity.responsible.changed';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'opportunity';
    opportunityId: string;
    /** The containing Request, present only for a current Request reader. */
    clientRequestId?: string;
    companyId: string;
  };
  metadata: { before: ResponsibleMember; after: ResponsibleMember };
}

/**
 * A changed Opportunity outcome status: the previous and new status and, for
 * a loss, its reason code. It never carries the reason or note text.
 */
export interface OpportunityOutcomeChangedActivityLogEvent {
  id: string;
  action: 'opportunity.outcome.changed';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: OpportunityResponsibleChangedActivityLogEvent['target'];
  metadata:
    | {
        previousStatus: OpportunityOutcomeStatus;
        newStatus: Exclude<OpportunityOutcomeStatus, 'LOST'>;
      }
    | {
        previousStatus: OpportunityOutcomeStatus;
        newStatus: 'LOST';
        lossReasonCode: OpportunityLossReasonCode;
      };
}

/** The Offer an event concerns and the Request detail that shows it. */
interface OfferActivityTargetReference {
  /** The Offer's immutable illustrative reference. */
  illustrativeReference: number;
  opportunityId: string;
  clientRequestId: string;
  companyId: string;
}

/**
 * The exact Offer Version an event concerns, superseded or not; an Offer
 * creation concerns version 1.
 */
export type OfferVersionActivityTarget = {
  type: 'offer_version';
  offerVersionId: string;
  versionNumber: number;
} & OfferActivityTargetReference;

/**
 * A recorded Offer event: its target reference, a Client response's outcome
 * and the simulated marker of a transmission or response. It never carries an
 * amount, condition, scope, reason, note, date, party identity, Snapshot
 * content or warning.
 */
export type OfferActivityLogEvent = {
  id: string;
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
} & (
  | {
      action:
        | 'offer.created'
        | 'offer_version.created'
        | 'offer_version.approved'
        | 'offer_version.rejected';
      target: OfferVersionActivityTarget;
      metadata: Record<string, never>;
    }
  | {
      action: 'offer_version.transmission_recorded';
      target: OfferVersionActivityTarget;
      metadata: { channel: 'SIMULATED' };
    }
  | {
      action: 'offer_version.client_response_recorded';
      target: OfferVersionActivityTarget;
      metadata: {
        outcome: 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
        evidenceKind: 'SIMULATED';
      };
    }
);
/**
 * A changed Opportunity Sales Stage: the previous and new stage labels as the
 * change captured them, or null for none. Never the version or identifiers.
 */
export interface OpportunityStageChangedActivityLogEvent {
  id: string;
  action: 'opportunity.stage.changed';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: OpportunityResponsibleChangedActivityLogEvent['target'];
  metadata: { previousLabel: string | null; newLabel: string | null };
}

/**
 * A Sales Stage configuration operation, targeting the stage in the Company's
 * Sales Stage settings: the operation and the label, never the revision.
 */
export interface SalesStageConfiguredActivityLogEvent {
  id: string;
  action: 'sales_stage.configured';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: { type: 'sales_stage'; salesStageId: string; companyId: string };
  metadata: { operation: 'CREATED'; label: string };
}

/**
 * The exact Contract Version an event concerns, superseded or not, named by
 * its Contract's kind and immutable illustrative reference, with the
 * Opportunity and Request that own it. A Contract creation concerns version
 * 1 and a Project link the executed version.
 */
export interface ContractVersionActivityTarget {
  type: 'contract_version';
  contractId: string;
  contractVersionId: string;
  kind: 'CONTRACT' | 'PRECONTRACT' | 'ADDENDUM';
  illustrativeReference: number;
  versionNumber: number;
  opportunityId: string;
  clientRequestId: string;
  companyId: string;
}

/**
 * A recorded Contract event: its target reference, the simulated marker of a
 * signature and, for a Project link, whether the Project was created and the
 * Project's reference. It never carries an amount, condition, scope, reason,
 * note, signatory label, date, party identity, Snapshot content or warning.
 */
export type ContractActivityLogEvent = {
  id: string;
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: ContractVersionActivityTarget;
} & (
  | {
      action:
        | 'contract.created'
        | 'contract_version.created'
        | 'contract_version.approved'
        | 'contract_version.rejected';
      metadata: Record<string, never>;
    }
  | {
      action: 'contract_version.signing_declared';
      metadata: {
        evidenceKind: 'DECLARED_RECEIVED_PDF';
        provenance: 'COMPANY_MODEL_OFFER';
      };
    }
  | {
      action: 'contract_version.signature_recorded';
      metadata: { evidenceKind: 'SIMULATED' };
    }
  | {
      action: 'contract_project.linked';
      metadata: {
        created: boolean;
        project: { projectId: string; projectTitle: string };
      };
    }
);

/** Before and after keep only a membership identifier and its captured label. */
export interface ProjectResponsibleChangedActivityLogEvent {
  id: string;
  action: 'project.responsible.changed';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'project';
    projectId: string;
    projectTitle: string;
    companyId: string;
  };
  metadata: {
    revision: number;
    before: ResponsibleMember | null;
    after: ResponsibleMember | null;
  };
}

/** A lifecycle transition: its resulting revision and from/to statuses only. */
export interface ProjectLifecycleChangedActivityLogEvent {
  id: string;
  action: 'project.lifecycle.changed';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'project';
    projectId: string;
    projectTitle: string;
    companyId: string;
  };
  metadata: ProjectLifecycleActivityMetadata;
}

/**
 * One entry of a proved `/activity-log` page (see `activityLogPageResponse`).
 * The shell lists these entries and presents no metadata except the proved
 * before and after of a Project or Opportunity responsible change, an
 * Opportunity outcome change, an Offer event's response outcome and
 * simulated marker, and a Contract event's simulated marker or linked Project.
 */
export interface ProjectTemplateVersionCreatedActivityEvent {
  id: string;
  action: 'project.template.version.created';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'project_template_version';
    versionId: string;
    companyId: string;
  };
  metadata: { templateKey: string; version: number; sourceVersion: number };
}
interface MissionPlanPublicationEvent {
  id: string;
  action: 'mission_plan.version.published';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'mission_plan_version';
    companyId: string;
    planId: string;
    versionId: string;
  };
  metadata: { versionNumber: number; activityCount: number };
}

export type ActivityLogEvent =
  | MissionPlanPublicationEvent
  | ProjectTemplateVersionCreatedActivityEvent
  | TaskActivityLogEvent
  | ProjectResponsibleChangedActivityLogEvent
  | OpportunityResponsibleChangedActivityLogEvent
  | OpportunityOutcomeChangedActivityLogEvent
  | OpportunityStageChangedActivityLogEvent
  | SalesStageConfiguredActivityLogEvent
  | ProjectLifecycleChangedActivityLogEvent
  | ProjectStageChangedActivityEvent
  | DocumentProjectActivityLogEvent
  | OrdinaryActivityLogEvent
  | ClientUnionActivityLogEvent
  | CommercialActivityLogEvent
  | OfferActivityLogEvent
  | ContractActivityLogEvent
  | DocumentRegisteredActivityLogEvent
  | DocumentCorrectedActivityLogEvent
  | DocumentVersionActivityLogEvent;

export type ActivityLogState =
  | { status: 'loading' }
  | { status: 'ready'; events: ActivityLogEvent[] }
  | { status: 'error' };

export type ProductionShellContext =
  | { status: 'checking' }
  | {
      status: 'active';
      actor: ActorContext;
      activityLog: ActivityLogState;
      companyContext: CompanyContextState;
      sessionGeneration: number;
    }
  | { status: 'signed-out' }
  | { status: 'forbidden' }
  | { status: 'error' };

export interface CompanyContextOrigin {
  activeCompanyId: string | undefined;
  internalUserId: string;
  workspaceId: string;
  workspaceMembershipId: string;
  sessionGeneration: number;
}

export type LoadedCompanyContext =
  | Exclude<CompanyContextState, { status: 'ready' }>
  | {
      status: 'ready';
      companies: VisibleCompany[];
      recoveryMessage?: 'stale' | 'selection-failed';
    };

export type CompanyContextTransition =
  | { type: 'identity-changed' }
  | { type: 'session-signed-out' }
  | { type: 'access-forbidden' }
  | { type: 'access-failed' }
  | {
      type: 'session-activated';
      actor: ActorContext;
      companyContext: LoadedCompanyContext;
      sessionGeneration: number;
    }
  | {
      type: 'selection-started';
      origin: CompanyContextOrigin;
      companyId: string;
    }
  | {
      type: 'selection-confirmed';
      origin: CompanyContextOrigin;
      companyId: string;
      actor: ActorContext;
    }
  | {
      type: 'actor-revalidated';
      origin: CompanyContextOrigin;
      actor: ActorContext;
    }
  | {
      type: 'selection-denied';
      origin: CompanyContextOrigin;
      companyId: string;
    }
  | {
      type: 'selection-failed';
      origin: CompanyContextOrigin;
      companyId: string;
    }
  | {
      type: 'company-rejected';
      origin: CompanyContextOrigin;
      companyId: string;
      activityLog: 'preserve' | 'loading' | 'error';
    }
  | {
      type: 'company-included';
      origin: CompanyContextOrigin;
      company: VisibleCompany;
    }
  | {
      type: 'activity-resolved';
      origin: CompanyContextOrigin;
      activityLog: ActivityLogState;
    };

export function transitionCompanyContext(
  current: ProductionShellContext,
  transition: CompanyContextTransition,
): ProductionShellContext {
  switch (transition.type) {
    case 'identity-changed':
      return { status: 'checking' };
    case 'session-signed-out':
      return { status: 'signed-out' };
    case 'access-forbidden':
      return { status: 'forbidden' };
    case 'access-failed':
      return { status: 'error' };
    case 'session-activated':
      return {
        status: 'active',
        actor: transition.actor,
        companyContext: normalizeLoadedCompanyContext(
          transition.companyContext,
        ),
        activityLog: { status: 'loading' },
        sessionGeneration: transition.sessionGeneration,
      };
    case 'selection-started': {
      if (
        !matchesReadyOrigin(current, transition.origin) ||
        !current.companyContext.companies.some(
          ({ id }) => id === transition.companyId,
        )
      )
        return current;
      return {
        ...current,
        companyContext: {
          ...current.companyContext,
          selection: { status: 'pending', companyId: transition.companyId },
        },
      };
    }
    case 'selection-confirmed': {
      if (
        !matchesPendingSelection(
          current,
          transition.origin,
          transition.companyId,
        ) ||
        !current.companyContext.companies.some(
          ({ id }) => id === transition.companyId,
        )
      )
        return current;
      return {
        ...current,
        actor: transition.actor,
        companyContext: readyCompanyContext(current.companyContext.companies),
        activityLog: { status: 'loading' },
      };
    }
    case 'actor-revalidated': {
      if (
        !matchesOrigin(current, transition.origin) ||
        !actorMatchesOrigin(transition.actor, transition.origin)
      )
        return current;
      return {
        ...current,
        actor: transition.actor,
        activityLog: { status: 'loading' },
      };
    }
    case 'selection-denied': {
      if (
        !matchesPendingSelection(
          current,
          transition.origin,
          transition.companyId,
        ) ||
        !current.companyContext.companies.some(
          ({ id }) => id === transition.companyId,
        )
      )
        return current;
      const companies = withoutCompany(
        current.companyContext.companies,
        transition.companyId,
      );
      const recovery = companyContextRecovery(
        current.companyContext,
        companies,
        transition.origin.activeCompanyId,
      );
      return {
        ...current,
        actor: withoutActiveCompany(current.actor),
        companyContext: readyCompanyContext(
          companies,
          'selection-failed',
          { status: 'idle' },
          recovery.rejectionCandidate,
        ),
      };
    }
    case 'selection-failed': {
      if (
        !matchesPendingSelection(
          current,
          transition.origin,
          transition.companyId,
        ) ||
        !current.companyContext.companies.some(
          ({ id }) => id === transition.companyId,
        )
      )
        return current;
      if (
        transition.origin.activeCompanyId !== undefined &&
        current.actor.activeCompany === undefined &&
        current.companyContext.recoveryMessage === 'stale'
      )
        return {
          ...current,
          companyContext: readyCompanyContext(
            current.companyContext.companies,
            'stale',
          ),
        };
      return {
        ...current,
        companyContext: {
          status: 'error',
          recovery: companyContextRecovery(
            current.companyContext,
            current.companyContext.companies,
          ),
        },
      };
    }
    case 'company-rejected': {
      if (!matchesCompanyRejectionOrigin(current, transition)) return current;
      const recoverableCompanies = recoveryCompanies(current.companyContext);
      if (recoverableCompanies === undefined) return current;
      return {
        ...current,
        actor: withoutActiveCompany(current.actor),
        companyContext: readyCompanyContext(
          withoutCompany(recoverableCompanies, transition.companyId),
          'stale',
          selectionAfterRejection(current.companyContext, transition.companyId),
        ),
        activityLog:
          transition.activityLog === 'error'
            ? { status: 'error' }
            : transition.activityLog === 'loading'
              ? { status: 'loading' }
              : current.activityLog,
      };
    }
    case 'company-included': {
      if (!matchesReadyOrigin(current, transition.origin)) return current;
      const companies = [
        ...current.companyContext.companies.filter(
          ({ id }) => id !== transition.company.id,
        ),
        transition.company,
      ].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      );
      const recovery = companyContextRecovery(
        current.companyContext,
        companies,
      );
      return {
        ...current,
        companyContext: readyCompanyContext(
          companies,
          current.companyContext.recoveryMessage,
          current.companyContext.selection,
          recovery.rejectionCandidate,
        ),
      };
    }
    case 'activity-resolved':
      if (!matchesOrigin(current, transition.origin)) return current;
      return { ...current, activityLog: transition.activityLog };
  }
}

export function captureCompanyContextOrigin(
  context: ProductionShellContext,
): CompanyContextOrigin | undefined {
  if (context.status !== 'active') return undefined;
  return {
    activeCompanyId: context.actor.activeCompany?.id,
    internalUserId: context.actor.internalUserId,
    workspaceId: context.actor.workspaceId,
    workspaceMembershipId: context.actor.workspaceMembershipId,
    sessionGeneration: context.sessionGeneration,
  };
}

function matchesReadyOrigin(
  context: ProductionShellContext,
  origin: CompanyContextOrigin,
): context is Extract<ProductionShellContext, { status: 'active' }> & {
  companyContext: Extract<CompanyContextState, { status: 'ready' }>;
} {
  return (
    context.status === 'active' &&
    context.companyContext.status === 'ready' &&
    matchesOrigin(context, origin)
  );
}

function matchesPendingSelection(
  context: ProductionShellContext,
  origin: CompanyContextOrigin,
  companyId: string,
): context is Extract<ProductionShellContext, { status: 'active' }> & {
  companyContext: Extract<CompanyContextState, { status: 'ready' }>;
} {
  if (
    context.status !== 'active' ||
    context.companyContext.status !== 'ready' ||
    context.companyContext.selection.status !== 'pending' ||
    context.companyContext.selection.companyId !== companyId ||
    !matchesSessionOrigin(context, origin)
  )
    return false;
  return (
    context.actor.activeCompany?.id === origin.activeCompanyId ||
    (origin.activeCompanyId !== undefined &&
      context.actor.activeCompany === undefined &&
      context.companyContext.recoveryMessage === 'stale')
  );
}

function matchesOrigin(
  context: ProductionShellContext,
  origin: CompanyContextOrigin,
): context is Extract<ProductionShellContext, { status: 'active' }> {
  return (
    context.status === 'active' &&
    context.actor.activeCompany?.id === origin.activeCompanyId &&
    matchesSessionOrigin(context, origin)
  );
}

function matchesCompanyRejectionOrigin(
  context: ProductionShellContext,
  transition: Extract<CompanyContextTransition, { type: 'company-rejected' }>,
): context is Extract<ProductionShellContext, { status: 'active' }> {
  if (
    context.status !== 'active' ||
    !matchesSessionOrigin(context, transition.origin)
  )
    return false;
  const activeCompanyId = context.actor.activeCompany?.id;
  if (activeCompanyId !== undefined)
    return (
      activeCompanyId === transition.companyId &&
      transition.origin.activeCompanyId === activeCompanyId
    );
  const recoverableCompanies = recoveryCompanies(context.companyContext);
  const rejectionCandidate = rejectionCandidateFor(context.companyContext);
  return (
    rejectionCandidate?.companyId === transition.companyId &&
    transition.origin.activeCompanyId === transition.companyId &&
    recoverableCompanies?.some(({ id }) => id === transition.companyId) === true
  );
}

function matchesSessionOrigin(
  context: Extract<ProductionShellContext, { status: 'active' }>,
  origin: CompanyContextOrigin,
): boolean {
  return (
    context.actor.internalUserId === origin.internalUserId &&
    context.actor.workspaceId === origin.workspaceId &&
    context.actor.workspaceMembershipId === origin.workspaceMembershipId &&
    context.sessionGeneration === origin.sessionGeneration
  );
}

function actorMatchesOrigin(
  actor: ActorContext,
  origin: CompanyContextOrigin,
): boolean {
  return (
    actor.activeCompany?.id === origin.activeCompanyId &&
    actor.internalUserId === origin.internalUserId &&
    actor.workspaceId === origin.workspaceId &&
    actor.workspaceMembershipId === origin.workspaceMembershipId
  );
}

function normalizeLoadedCompanyContext(
  state: LoadedCompanyContext,
): CompanyContextState {
  return state.status === 'ready'
    ? readyCompanyContext(state.companies, state.recoveryMessage)
    : state;
}

function readyCompanyContext(
  companies: VisibleCompany[],
  recoveryMessage?: 'stale' | 'selection-failed',
  selection: Extract<CompanyContextState, { status: 'ready' }>['selection'] = {
    status: 'idle',
  },
  rejectionCandidate?: { companyId: string },
): Extract<CompanyContextState, { status: 'ready' }> {
  const shared = {
    status: 'ready' as const,
    selection,
    recoveryMessage,
    ...(rejectionCandidate ? { rejectionCandidate } : {}),
  };
  if (companies.length === 0)
    return { ...shared, cardinality: 'zero', companies: [] };
  if (companies.length === 1)
    return { ...shared, cardinality: 'one', companies: [companies[0]!] };
  return {
    ...shared,
    cardinality: 'many',
    companies: [companies[0]!, companies[1]!, ...companies.slice(2)],
  };
}

function withoutCompany(
  companies: VisibleCompany[],
  rejectedCompanyId: string,
): VisibleCompany[] {
  return companies.filter((company) => company.id !== rejectedCompanyId);
}

function recoveryCompanies(
  state: CompanyContextState,
): VisibleCompany[] | undefined {
  if (state.status === 'ready') return state.companies;
  if (state.status === 'error') return state.recovery?.companies;
  return undefined;
}

function rejectionCandidateFor(
  state: CompanyContextState,
): { companyId: string } | undefined {
  if (state.status === 'ready') return state.rejectionCandidate;
  if (state.status === 'error') return state.recovery?.rejectionCandidate;
  return undefined;
}

function companyContextRecovery(
  state: CompanyContextState,
  companies: VisibleCompany[],
  fallbackCompanyId?: string,
): CompanyContextRecovery {
  const candidate =
    rejectionCandidateFor(state) ??
    (fallbackCompanyId ? { companyId: fallbackCompanyId } : undefined);
  const candidateRemainsVisible =
    candidate !== undefined &&
    companies.some(({ id }) => id === candidate.companyId);
  return {
    companies,
    ...(candidateRemainsVisible ? { rejectionCandidate: candidate } : {}),
  };
}

function selectionAfterRejection(
  state: CompanyContextState,
  rejectedCompanyId: string,
): Extract<CompanyContextState, { status: 'ready' }>['selection'] {
  if (
    state.status === 'ready' &&
    (state.selection.status !== 'pending' ||
      state.selection.companyId !== rejectedCompanyId)
  )
    return state.selection;
  return { status: 'idle' };
}

function withoutActiveCompany(actor: ActorContext): ActorContext {
  const workspaceActor = { ...actor };
  delete workspaceActor.activeCompany;
  return workspaceActor;
}

export interface ProjectStageChangedActivityEvent {
  id: string;
  action: 'project.stage.changed';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'project';
    projectId: string;
    projectTitle: string;
    companyId: string;
  };
  metadata: { stageRevision: number; fromStageKey: string; toStageKey: string };
}
