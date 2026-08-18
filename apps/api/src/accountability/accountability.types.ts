import type { ActorContext } from '../access/access.types.js';
import type { COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL } from '../access/company-permissions.js';

export const INTERNAL_USER_PROVISIONED_ACTION =
  'internal_user.provisioned' as const;
export const COMPANY_REGISTERED_ACTION = 'company.registered' as const;
export const COMPANY_CONTEXT_ASSIGNMENT_GRANTED_ACTION =
  'company_context_assignment.granted' as const;
export const COMPANY_CONTEXT_ASSIGNMENT_REVOKED_ACTION =
  'company_context_assignment.revoked' as const;

export type CanonicalActivityEvent =
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
        | typeof COMPANY_CONTEXT_ASSIGNMENT_GRANTED_ACTION
        | typeof COMPANY_CONTEXT_ASSIGNMENT_REVOKED_ACTION;
      target: {
        type: 'company_role_assignment';
        assignmentId: string;
        companyId: string;
        workspaceMembershipId: string;
        internalUserId: string;
      };
      metadata: { bundle: typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL };
      transitionId: string;
    };

export interface ActivityLogEvent {
  id: string;
  action:
    | typeof INTERNAL_USER_PROVISIONED_ACTION
    | typeof COMPANY_REGISTERED_ACTION
    | typeof COMPANY_CONTEXT_ASSIGNMENT_GRANTED_ACTION
    | typeof COMPANY_CONTEXT_ASSIGNMENT_REVOKED_ACTION;
  occurredAt: string;
  actor: {
    internalUserId: string;
    displayName: string;
  };
  target:
    | {
        type: 'internal_user';
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
      };
  metadata:
    | { identityProvider: string }
    | { bundle: typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL }
    | Record<string, never>;
}

export interface ActivityLogPage {
  events: ActivityLogEvent[];
}
