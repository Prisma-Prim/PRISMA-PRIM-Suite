import {
  COMPANY_IDEAS_READER_BUNDLE_LABEL,
  COMPANY_IDEAS_RECORDER_BUNDLE_LABEL,
  COMPANY_IDEAS_REVIEWER_BUNDLE_LABEL,
} from '../access/company-permissions.js';
import type { ProjectTemplateVersionCreatedActivityEvent } from '../project-template/project-template-version.types.js';
import type { ProjectStageChangedActivityEvent } from '../project-template/project-stage.types.js';
import type { TaskEvent } from '../task/task.types.js';
import type { ProjectResponsibleChangedActivityEvent } from '../project/project-responsibility.types.js';
import type { ProjectLifecycleChangedActivityEvent } from '../project/project-lifecycle.types.js';
import type { ActorContext } from '../access/access.types.js';
import type { ClientContact } from '../client/client.types.js';
import type {
  ClientLegalEntityFieldChanges,
  ClientLegalEntityValues,
} from '../client/client-legal-entity.types.js';
import type {
  COMPANY_TASK_MANAGER_BUNDLE_LABEL,
  COMPANY_PROJECT_ACCESS_BUNDLE_LABEL,
  COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL,
  COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL,
  COMPANY_DOCUMENT_APPROVER_BUNDLE_LABEL,
  COMPANY_DOCUMENT_CONTENT_READER_BUNDLE_LABEL,
  COMPANY_MISSION_DELIVERABLE_ACCESS_BUNDLE_LABEL,
  COMPANY_TASK_RESULT_RECORDER_BUNDLE_LABEL,
  COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE_LABEL,
  COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE_LABEL,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL,
  COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL,
  COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL,
  COMPANY_PRICING_CONFIGURATION_BUNDLE_LABEL,
  COMPANY_PRICING_USER_BUNDLE_LABEL,
  COMPANY_OFFER_PREPARER_BUNDLE_LABEL,
  COMPANY_CONTRACT_PREPARER_BUNDLE_LABEL,
  COMPANY_CONTRACT_EARLY_PREPARATION_BUNDLE_LABEL,
  COMPANY_CONTRACT_APPROVER_BUNDLE_LABEL,
  COMPANY_OFFER_APPROVER_BUNDLE_LABEL,
  COMPANY_PRICING_ADJUSTMENT_BUNDLE_LABEL,
  COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL,
  COMPANY_OPPORTUNITY_MANAGER_BUNDLE_LABEL,
  COMPANY_PROJECT_APPROVER_BUNDLE_LABEL,
  COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE_LABEL,
  COMPANY_PROFITABILITY_DIRECTOR_BUNDLE_LABEL,
  COMPANY_OPERATIONAL_RISK_READER_BUNDLE_LABEL,
  COMPANY_OPERATIONAL_RISK_RECORDER_BUNDLE_LABEL,
  COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE_LABEL,
  COMPANY_PROJECT_TEMPLATE_USER_BUNDLE_LABEL,
  COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE_LABEL,
  COMPANY_PROJECT_TEMPLATE_CONFIGURATION_BUNDLE_LABEL,
} from '../access/company-permissions.js';
import type { CommercialActivityRecord } from './commercial-activity-projection.js';
import type { OfferActivityProjection } from './offer-activity-projection.js';
import type { ContractActivityProjection } from './contract-activity-projection.js';

export const INTERNAL_USER_PROVISIONED_ACTION =
  'internal_user.provisioned' as const;
export const WORKSPACE_MEMBERSHIP_SUSPENDED_ACTION =
  'workspace_membership.suspended' as const;
export const COMPANY_REGISTERED_ACTION = 'company.registered' as const;
export const COMPANY_CONTEXT_ASSIGNMENT_GRANTED_ACTION =
  'company_context_assignment.granted' as const;
export const COMPANY_CONTEXT_ASSIGNMENT_REVOKED_ACTION =
  'company_context_assignment.revoked' as const;
export const COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_GRANTED_ACTION =
  'company_director_client_assignment.granted' as const;
export const COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_REVOKED_ACTION =
  'company_director_client_assignment.revoked' as const;
export const CLIENT_CREATED_ACTION = 'client.created' as const;
export const CLIENT_COMPANY_RELATIONSHIP_ESTABLISHED_ACTION =
  'client_company_relationship.established' as const;
export const CLIENT_CORRECTED_ACTION = 'client.corrected' as const;
export const CLIENT_LEGAL_ENTITY_REGISTERED_ACTION =
  'client_legal_entity.registered' as const;
export const CLIENT_LEGAL_ENTITY_CORRECTED_ACTION =
  'client_legal_entity.corrected' as const;

/**
 * Client events recorded in, and projected only to, the acting Company that
 * changed the shared dossier.
 */
export const COMPANY_SCOPED_CLIENT_ACTIONS = [
  CLIENT_CORRECTED_ACTION,
  CLIENT_LEGAL_ENTITY_REGISTERED_ACTION,
  CLIENT_LEGAL_ENTITY_CORRECTED_ACTION,
] as const;

export type ClientCorrectionChanges = Record<
  string,
  { before: unknown; after: unknown }
>;

interface FieldChange<Value> {
  before: Value;
  after: Value;
}

/** The typed change set of one stored `client.corrected` event. */
export interface ClientCorrectionFieldChanges {
  displayName?: FieldChange<string>;
  taxId?: FieldChange<string | null>;
  address?: FieldChange<string | null>;
  telephone?: FieldChange<string | null>;
  generalEmail?: FieldChange<string | null>;
  businessActivity?: FieldChange<string | null>;
  contacts?: FieldChange<ClientContact[]>;
}

export interface ClientCorrectionHistoryPage {
  corrections: {
    id: string;
    occurredAt: string;
    actor: { displayName: string };
    changes: ClientCorrectionFieldChanges;
  }[];
  nextCursor: string | null;
}

export type ClientCorrectionHistoryRead =
  | { kind: 'page'; page: ClientCorrectionHistoryPage }
  | { kind: 'invalid-cursor' };

export type CanonicalActivityEvent =
  | {
      actor: ActorContext;
      action:
        | 'workspace_invitation.issued'
        | 'workspace_invitation.revoked'
        | 'workspace_invitation.accepted';
      target: { type: 'workspace_invitation'; invitationId: string };
      metadata: Record<string, never>;
    }
  | {
      actor: ActorContext;
      action:
        | typeof WORKSPACE_MEMBERSHIP_SUSPENDED_ACTION
        | 'workspace_sessions.revoked'
        | 'workspace_sessions.revocation_retry_required';
      target: {
        type: 'workspace_membership';
        workspaceMembershipId: string;
        internalUserId: string;
      };
      metadata: Record<string, never>;
      transitionId: string;
    }
  | {
      actor: ActorContext;
      action: typeof INTERNAL_USER_PROVISIONED_ACTION;
      target: {
        type: 'internal_user';
        internalUserId: string;
      };
      metadata: {
        identityProvider: string;
      };
    }
  | {
      actor: ActorContext;
      action: typeof COMPANY_REGISTERED_ACTION;
      target: {
        type: 'company';
        companyId: string;
      };
      metadata: Record<string, never>;
    }
  | {
      actor: ActorContext;
      action:
        | 'company_task_manager_assignment.granted'
        | 'company_task_manager_assignment.revoked'
        | 'company_document_project_organizer_assignment.granted'
        | 'company_document_project_organizer_assignment.revoked'
        | 'company_document_registrar_assignment.granted'
        | 'company_document_registrar_assignment.revoked'
        | 'company_document_approver_assignment.granted'
        | 'company_document_approver_assignment.revoked'
        | 'company_document_content_reader_assignment.granted'
        | 'company_mission_deliverable_access_assignment.granted'
        | 'company_task_result_recorder_assignment.granted'
        | 'company_document_content_reader_assignment.revoked'
        | 'company_mission_deliverable_access_assignment.revoked'
        | 'company_task_result_recorder_assignment.revoked'
        | 'company_document_content_uploader_assignment.granted'
        | 'company_document_content_uploader_assignment.revoked'
        | 'company_project_assignment.granted'
        | 'company_project_assignment.revoked'
        | typeof COMPANY_CONTEXT_ASSIGNMENT_GRANTED_ACTION
        | typeof COMPANY_CONTEXT_ASSIGNMENT_REVOKED_ACTION
        | typeof COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_GRANTED_ACTION
        | typeof COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_REVOKED_ACTION
        | 'company_commercial_intake_assignment.granted'
        | 'company_commercial_intake_assignment.revoked'
        | 'company_service_catalogue_assignment.granted'
        | 'company_service_catalogue_assignment.revoked'
        | 'company_pricing_configuration_assignment.granted'
        | 'company_pricing_configuration_assignment.revoked'
        | 'company_pricing_user_assignment.granted'
        | 'company_pricing_user_assignment.revoked'
        | 'company_offer_preparer_assignment.granted'
        | 'company_contract_preparer_assignment.granted'
        | 'company_contract_early_preparation_assignment.granted'
        | 'company_contract_approver_assignment.granted'
        | 'company_offer_approver_assignment.granted'
        | 'company_offer_preparer_assignment.revoked'
        | 'company_contract_preparer_assignment.revoked'
        | 'company_contract_early_preparation_assignment.revoked'
        | 'company_contract_approver_assignment.revoked'
        | 'company_offer_approver_assignment.revoked'
        | 'company_pricing_adjustment_assignment.granted'
        | 'company_pricing_adjustment_assignment.revoked'
        | 'company_commercial_activity_reader_assignment.granted'
        | 'company_commercial_activity_reader_assignment.revoked'
        | 'company_opportunity_manager_assignment.granted'
        | 'company_opportunity_manager_assignment.revoked'
        | 'company_ideas_reader_assignment.granted'
        | 'company_ideas_reader_assignment.revoked'
        | 'company_ideas_recorder_assignment.granted'
        | 'company_ideas_recorder_assignment.revoked'
        | 'company_ideas_reviewer_assignment.granted'
        | 'company_ideas_reviewer_assignment.revoked'
        | 'company_profitability_contributor_assignment.granted'
        | 'company_profitability_contributor_assignment.revoked'
        | 'company_profitability_director_assignment.granted'
        | 'company_operational_risk_reader_assignment.granted'
        | 'company_operational_risk_recorder_assignment.granted'
        | 'company_profitability_director_assignment.revoked'
        | 'company_operational_risk_reader_assignment.revoked'
        | 'company_operational_risk_recorder_assignment.revoked'
        | 'company_project_approver_assignment.granted'
        | 'company_project_approver_assignment.revoked'
        | 'company_sales_stage_configuration_assignment.granted'
        | 'company_sales_stage_configuration_assignment.revoked'
        | 'company_project_template_user_assignment.granted'
        | 'company_project_template_user_assignment.revoked'
        | 'company_project_stage_advancer_assignment.granted'
        | 'company_project_template_configuration_assignment.granted'
        | 'company_project_template_configuration_assignment.revoked'
        | 'company_project_stage_advancer_assignment.revoked';
      target: {
        type: 'company_role_assignment';
        assignmentId: string;
        companyId: string;
        workspaceMembershipId: string;
        internalUserId: string;
      };
      metadata: {
        bundle:
          | typeof COMPANY_TASK_MANAGER_BUNDLE_LABEL
          | typeof COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE_LABEL
          | typeof COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL
          | typeof COMPANY_DOCUMENT_APPROVER_BUNDLE_LABEL
          | typeof COMPANY_DOCUMENT_CONTENT_READER_BUNDLE_LABEL
          | typeof COMPANY_MISSION_DELIVERABLE_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_TASK_RESULT_RECORDER_BUNDLE_LABEL
          | typeof COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE_LABEL
          | typeof COMPANY_PROJECT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL
          | typeof COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL
          | typeof COMPANY_PRICING_CONFIGURATION_BUNDLE_LABEL
          | typeof COMPANY_PRICING_USER_BUNDLE_LABEL
          | typeof COMPANY_OFFER_PREPARER_BUNDLE_LABEL
          | typeof COMPANY_CONTRACT_PREPARER_BUNDLE_LABEL
          | typeof COMPANY_CONTRACT_EARLY_PREPARATION_BUNDLE_LABEL
          | typeof COMPANY_CONTRACT_APPROVER_BUNDLE_LABEL
          | typeof COMPANY_OFFER_APPROVER_BUNDLE_LABEL
          | typeof COMPANY_PRICING_ADJUSTMENT_BUNDLE_LABEL
          | typeof COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL
          | typeof COMPANY_OPPORTUNITY_MANAGER_BUNDLE_LABEL
          | typeof COMPANY_IDEAS_READER_BUNDLE_LABEL
          | typeof COMPANY_IDEAS_RECORDER_BUNDLE_LABEL
          | typeof COMPANY_IDEAS_REVIEWER_BUNDLE_LABEL
          | typeof COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE_LABEL
          | typeof COMPANY_PROFITABILITY_DIRECTOR_BUNDLE_LABEL
          | typeof COMPANY_OPERATIONAL_RISK_READER_BUNDLE_LABEL
          | typeof COMPANY_OPERATIONAL_RISK_RECORDER_BUNDLE_LABEL
          | typeof COMPANY_PROJECT_APPROVER_BUNDLE_LABEL
          | typeof COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE_LABEL
          | typeof COMPANY_PROJECT_TEMPLATE_USER_BUNDLE_LABEL
          | typeof COMPANY_PROJECT_TEMPLATE_CONFIGURATION_BUNDLE_LABEL
          | typeof COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE_LABEL;
      };
      transitionId: string;
    }
  | {
      actor: ActorContext;
      action: typeof CLIENT_CORRECTED_ACTION;
      target: {
        type: 'client_account';
        clientAccountId: string;
        companyId: string;
      };
      metadata: { changes: ClientCorrectionChanges };
      transitionId: string;
    }
  | {
      actor: ActorContext;
      action: typeof CLIENT_LEGAL_ENTITY_REGISTERED_ACTION;
      target: {
        type: 'client_account';
        clientAccountId: string;
        companyId: string;
      };
      metadata: { legalEntityId: string; values: ClientLegalEntityValues };
      transitionId: string;
    }
  | {
      actor: ActorContext;
      action: typeof CLIENT_LEGAL_ENTITY_CORRECTED_ACTION;
      target: {
        type: 'client_account';
        clientAccountId: string;
        companyId: string;
      };
      metadata: {
        legalEntityId: string;
        changes: ClientLegalEntityFieldChanges;
      };
      transitionId: string;
    }
  | {
      actor: ActorContext;
      action: typeof CLIENT_CREATED_ACTION;
      target: {
        type: 'client_account';
        clientAccountId: string;
      };
      metadata: Record<string, never>;
    }
  | {
      actor: ActorContext;
      action: typeof CLIENT_COMPANY_RELATIONSHIP_ESTABLISHED_ACTION;
      target: {
        type: 'client_company_relationship';
        relationshipId: string;
        clientAccountId: string;
        companyId: string;
      };
      metadata: Record<string, never>;
    };

export interface OrdinaryActivityLogEvent {
  id: string;
  action:
    | 'workspace_invitation.issued'
    | 'workspace_invitation.revoked'
    | 'workspace_invitation.accepted'
    | typeof INTERNAL_USER_PROVISIONED_ACTION
    | typeof WORKSPACE_MEMBERSHIP_SUSPENDED_ACTION
    | 'workspace_sessions.revoked'
    | 'workspace_sessions.revocation_retry_required'
    | typeof COMPANY_REGISTERED_ACTION
    | 'company_task_manager_assignment.granted'
    | 'company_task_manager_assignment.revoked'
    | 'company_document_project_organizer_assignment.granted'
    | 'company_document_project_organizer_assignment.revoked'
    | 'company_document_registrar_assignment.granted'
    | 'company_document_registrar_assignment.revoked'
    | 'company_document_approver_assignment.granted'
    | 'company_document_approver_assignment.revoked'
    | 'company_document_content_reader_assignment.granted'
    | 'company_mission_deliverable_access_assignment.granted'
    | 'company_task_result_recorder_assignment.granted'
    | 'company_document_content_reader_assignment.revoked'
    | 'company_mission_deliverable_access_assignment.revoked'
    | 'company_task_result_recorder_assignment.revoked'
    | 'company_document_content_uploader_assignment.granted'
    | 'company_document_content_uploader_assignment.revoked'
    | 'company_project_assignment.granted'
    | 'company_project_assignment.revoked'
    | typeof COMPANY_CONTEXT_ASSIGNMENT_GRANTED_ACTION
    | typeof COMPANY_CONTEXT_ASSIGNMENT_REVOKED_ACTION
    | typeof COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_GRANTED_ACTION
    | typeof COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_REVOKED_ACTION
    | 'company_commercial_intake_assignment.granted'
    | 'company_commercial_intake_assignment.revoked'
    | 'company_service_catalogue_assignment.granted'
    | 'company_service_catalogue_assignment.revoked'
    | 'company_pricing_configuration_assignment.granted'
    | 'company_pricing_configuration_assignment.revoked'
    | 'company_pricing_user_assignment.granted'
    | 'company_pricing_user_assignment.revoked'
    | 'company_offer_preparer_assignment.granted'
    | 'company_contract_preparer_assignment.granted'
    | 'company_contract_early_preparation_assignment.granted'
    | 'company_contract_approver_assignment.granted'
    | 'company_offer_approver_assignment.granted'
    | 'company_offer_preparer_assignment.revoked'
    | 'company_contract_preparer_assignment.revoked'
    | 'company_contract_early_preparation_assignment.revoked'
    | 'company_contract_approver_assignment.revoked'
    | 'company_offer_approver_assignment.revoked'
    | 'company_pricing_adjustment_assignment.granted'
    | 'company_pricing_adjustment_assignment.revoked'
    | 'company_commercial_activity_reader_assignment.granted'
    | 'company_commercial_activity_reader_assignment.revoked'
    | 'company_opportunity_manager_assignment.granted'
    | 'company_opportunity_manager_assignment.revoked'
    | 'company_ideas_reader_assignment.granted'
    | 'company_ideas_reader_assignment.revoked'
    | 'company_ideas_recorder_assignment.granted'
    | 'company_ideas_recorder_assignment.revoked'
    | 'company_ideas_reviewer_assignment.granted'
    | 'company_ideas_reviewer_assignment.revoked'
    | 'company_profitability_contributor_assignment.granted'
    | 'company_profitability_contributor_assignment.revoked'
    | 'company_profitability_director_assignment.granted'
    | 'company_operational_risk_reader_assignment.granted'
    | 'company_operational_risk_recorder_assignment.granted'
    | 'company_profitability_director_assignment.revoked'
    | 'company_operational_risk_reader_assignment.revoked'
    | 'company_operational_risk_recorder_assignment.revoked'
    | 'company_project_approver_assignment.granted'
    | 'company_project_approver_assignment.revoked'
    | 'company_sales_stage_configuration_assignment.granted'
    | 'company_sales_stage_configuration_assignment.revoked'
    | 'company_project_template_user_assignment.granted'
    | 'company_project_template_user_assignment.revoked'
    | 'company_project_stage_advancer_assignment.granted'
    | 'company_project_template_configuration_assignment.granted'
    | 'company_project_template_configuration_assignment.revoked'
    | 'company_project_stage_advancer_assignment.revoked'
    | typeof CLIENT_CREATED_ACTION
    | typeof CLIENT_COMPANY_RELATIONSHIP_ESTABLISHED_ACTION
    | typeof CLIENT_CORRECTED_ACTION
    | typeof CLIENT_LEGAL_ENTITY_REGISTERED_ACTION
    | typeof CLIENT_LEGAL_ENTITY_CORRECTED_ACTION;
  occurredAt: string;
  actor: {
    internalUserId: string;
    displayName: string;
  };
  target:
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
    | {
        type: 'company';
        companyId: string;
        displayName: string;
      }
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
  metadata:
    | { identityProvider: string }
    | {
        bundle:
          | typeof COMPANY_TASK_MANAGER_BUNDLE_LABEL
          | typeof COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE_LABEL
          | typeof COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL
          | typeof COMPANY_DOCUMENT_APPROVER_BUNDLE_LABEL
          | typeof COMPANY_DOCUMENT_CONTENT_READER_BUNDLE_LABEL
          | typeof COMPANY_MISSION_DELIVERABLE_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_TASK_RESULT_RECORDER_BUNDLE_LABEL
          | typeof COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE_LABEL
          | typeof COMPANY_PROJECT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL
          | typeof COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL
          | typeof COMPANY_PRICING_CONFIGURATION_BUNDLE_LABEL
          | typeof COMPANY_PRICING_USER_BUNDLE_LABEL
          | typeof COMPANY_OFFER_PREPARER_BUNDLE_LABEL
          | typeof COMPANY_CONTRACT_PREPARER_BUNDLE_LABEL
          | typeof COMPANY_CONTRACT_EARLY_PREPARATION_BUNDLE_LABEL
          | typeof COMPANY_CONTRACT_APPROVER_BUNDLE_LABEL
          | typeof COMPANY_OFFER_APPROVER_BUNDLE_LABEL
          | typeof COMPANY_PRICING_ADJUSTMENT_BUNDLE_LABEL
          | typeof COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL
          | typeof COMPANY_OPPORTUNITY_MANAGER_BUNDLE_LABEL
          | typeof COMPANY_IDEAS_READER_BUNDLE_LABEL
          | typeof COMPANY_IDEAS_RECORDER_BUNDLE_LABEL
          | typeof COMPANY_IDEAS_REVIEWER_BUNDLE_LABEL
          | typeof COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE_LABEL
          | typeof COMPANY_PROFITABILITY_DIRECTOR_BUNDLE_LABEL
          | typeof COMPANY_OPERATIONAL_RISK_READER_BUNDLE_LABEL
          | typeof COMPANY_OPERATIONAL_RISK_RECORDER_BUNDLE_LABEL
          | typeof COMPANY_PROJECT_APPROVER_BUNDLE_LABEL
          | typeof COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE_LABEL
          | typeof COMPANY_PROJECT_TEMPLATE_USER_BUNDLE_LABEL
          | typeof COMPANY_PROJECT_TEMPLATE_CONFIGURATION_BUNDLE_LABEL
          | typeof COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE_LABEL;
      }
    | { changes: ClientCorrectionChanges }
    | { legalEntityId: string; values: ClientLegalEntityValues }
    | { legalEntityId: string; changes: ClientLegalEntityFieldChanges }
    | Record<string, never>;
}

export interface ActivityLogPage {
  events: ActivityLogEvent[];
}

export interface ClientUnionActivityEvent {
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

export interface DocumentRegisteredActivityEvent {
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
  metadata: Record<string, never>;
}
export interface DocumentCorrectedActivityEvent {
  id: string;
  action: 'document.corrected';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'document';
    documentId: string;
    companyId: string;
  };
  metadata: Record<string, never>;
}
/**
 * One committed Version command, projected from the Document-owned command
 * table. Metadata carries Version numbers only, never a title, purpose, URL
 * or Project identity.
 */
export type DocumentVersionActivityEvent =
  | DocumentVersionActivityEventBase<
      'document.version.drafted',
      { versionNumber: number; sourceVersionNumber: number }
    >
  | DocumentVersionActivityEventBase<
      'document.version.designated_official',
      { versionNumber: number; supersededVersionNumber: number | null }
    >
  | DocumentVersionActivityEventBase<
      'document.representation.added',
      {
        versionNumber: number;
        form: 'editable' | 'rendered' | 'signed' | 'other';
        appendedAfterDesignation: boolean;
      }
    >
  | DocumentVersionActivityEventBase<
      'document.representation.removed',
      {
        versionNumber: number;
        form: 'editable' | 'rendered' | 'signed' | 'other';
        appendedAfterDesignation: false;
      }
    >;
interface DocumentVersionActivityEventBase<Action extends string, Metadata> {
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
export interface DocumentProjectActivityEvent {
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
  metadata: Record<string, never>;
}
/**
 * The authorized Company projection of an already recorded commercial event.
 * It carries the canonical action, the responsible Company, the existing actor
 * label, the server time and a target reference, plus the previous and new
 * responsible actor of a responsible-actor change and nothing else.
 */
export type CommercialActivityEvent = CommercialActivityRecord & {
  id: string;
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target:
    | {
        type: 'client_request';
        clientRequestId: string;
        companyId: string;
      }
    | {
        type: 'opportunity';
        opportunityId: string;
        /** The containing Request, present only for a current Request reader. */
        clientRequestId?: string;
        companyId: string;
      }
    | {
        /** One stage of the Company's Sales Stage settings. */
        type: 'sales_stage';
        salesStageId: string;
        companyId: string;
      };
};

/**
 * The authorized Company projection of an already recorded Offer event: the
 * canonical action, the responsible Company, the existing actor label, the
 * server time and the Offer target reference, plus a Client response outcome
 * and the simulated marker of a transmission or response, and nothing else.
 */
export type OfferActivityEvent = OfferActivityProjection & {
  id: string;
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
};

/**
 * The authorized Company projection of an already recorded Contract event:
 * the canonical action, the responsible Company, the existing actor label,
 * the server time and the exact Contract Version target, plus the simulated
 * marker of a signature or a Project link's creation flag and Project
 * reference, and nothing else.
 */
export type ContractActivityEvent = ContractActivityProjection & {
  id: string;
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
};

export type ActivityLogEvent =
  | TaskEvent
  | DocumentProjectActivityEvent
  | OrdinaryActivityLogEvent
  | ClientUnionActivityEvent
  | CommercialActivityEvent
  | OfferActivityEvent
  | ContractActivityEvent
  | DocumentRegisteredActivityEvent
  | DocumentCorrectedActivityEvent
  | DocumentVersionActivityEvent
  | ProjectCreatedActivityEvent
  | ProjectResponsibleChangedActivityEvent
  | ProjectLifecycleChangedActivityEvent
  | ProjectStageChangedActivityEvent
  | ProjectTemplateVersionCreatedActivityEvent;

export interface ProjectCreatedActivityEvent {
  id: string;
  action: 'project.created';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'project';
    projectId: string;
    projectTitle: string;
    companyId: string;
  };
  metadata: Record<string, never>;
}
