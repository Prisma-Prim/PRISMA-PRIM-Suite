import type { TaskEvent } from '../task/task.types.js';
import type { ProjectResponsibleChangedActivityEvent } from '../project/project-responsibility.types.js';
import type { ActorContext } from '../access/access.types.js';
import type { ClientContact } from '../client/client.types.js';
import type {
  COMPANY_TASK_MANAGER_BUNDLE_LABEL,
  COMPANY_PROJECT_ACCESS_BUNDLE_LABEL,
  COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL,
  COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL,
  COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE_LABEL,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL,
  COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL,
  COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL,
  COMPANY_PRICING_CONFIGURATION_BUNDLE_LABEL,
  COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL,
} from '../access/company-permissions.js';
import type { CommercialActivityAction } from './commercial-activity-projection.js';

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
        | 'company_commercial_activity_reader_assignment.granted'
        | 'company_commercial_activity_reader_assignment.revoked';
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
          | typeof COMPANY_PROJECT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL
          | typeof COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL
          | typeof COMPANY_PRICING_CONFIGURATION_BUNDLE_LABEL
          | typeof COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL;
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
    | 'company_commercial_activity_reader_assignment.granted'
    | 'company_commercial_activity_reader_assignment.revoked'
    | typeof CLIENT_CREATED_ACTION
    | typeof CLIENT_COMPANY_RELATIONSHIP_ESTABLISHED_ACTION
    | typeof CLIENT_CORRECTED_ACTION;
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
          | typeof COMPANY_PROJECT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL
          | typeof COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL
          | typeof COMPANY_PRICING_CONFIGURATION_BUNDLE_LABEL
          | typeof COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL;
      }
    | { changes: ClientCorrectionChanges }
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
 * label, the server time and a target reference only.
 */
export interface CommercialActivityEvent {
  id: string;
  action: CommercialActivityAction;
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
      };
  metadata: Record<string, never>;
}

export type ActivityLogEvent =
  | TaskEvent
  | DocumentProjectActivityEvent
  | OrdinaryActivityLogEvent
  | ClientUnionActivityEvent
  | CommercialActivityEvent
  | DocumentRegisteredActivityEvent
  | DocumentCorrectedActivityEvent
  | ProjectCreatedActivityEvent
  | ProjectResponsibleChangedActivityEvent;

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
