import type { ActorContext } from '../access/access.types.js';
import type {
  COMPANY_PROJECT_ACCESS_BUNDLE_LABEL,
  COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL,
  COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL,
} from '../access/company-permissions.js';

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
        | 'company_document_registrar_assignment.granted'
        | 'company_document_registrar_assignment.revoked'
        | 'company_project_assignment.granted'
        | 'company_project_assignment.revoked'
        | typeof COMPANY_CONTEXT_ASSIGNMENT_GRANTED_ACTION
        | typeof COMPANY_CONTEXT_ASSIGNMENT_REVOKED_ACTION
        | typeof COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_GRANTED_ACTION
        | typeof COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_REVOKED_ACTION;
      target: {
        type: 'company_role_assignment';
        assignmentId: string;
        companyId: string;
        workspaceMembershipId: string;
        internalUserId: string;
      };
      metadata: {
        bundle:
          | typeof COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL
          | typeof COMPANY_PROJECT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL;
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
    | 'company_document_registrar_assignment.granted'
    | 'company_document_registrar_assignment.revoked'
    | 'company_project_assignment.granted'
    | 'company_project_assignment.revoked'
    | typeof COMPANY_CONTEXT_ASSIGNMENT_GRANTED_ACTION
    | typeof COMPANY_CONTEXT_ASSIGNMENT_REVOKED_ACTION
    | typeof COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_GRANTED_ACTION
    | typeof COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_REVOKED_ACTION
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
          | typeof COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL
          | typeof COMPANY_PROJECT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL
          | typeof COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL;
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
  target: { type: 'document'; documentId: string; companyId: string };
  metadata: Record<string, never>;
}
export type ActivityLogEvent =
  | OrdinaryActivityLogEvent
  | ClientUnionActivityEvent
  | DocumentRegisteredActivityEvent
  | ProjectCreatedActivityEvent;

export interface ProjectCreatedActivityEvent {
  id: string;
  action: 'project.created';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: { type: 'project'; projectId: string; companyId: string };
  metadata: Record<string, never>;
}
