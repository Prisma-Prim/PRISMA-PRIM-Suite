import type { ActorContext } from '../access/access.types.js';

export const INTERNAL_USER_PROVISIONED_ACTION =
  'internal_user.provisioned' as const;
export const COMPANY_REGISTERED_ACTION = 'company.registered' as const;

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
    };

export interface ActivityLogEvent {
  id: string;
  action:
    typeof INTERNAL_USER_PROVISIONED_ACTION | typeof COMPANY_REGISTERED_ACTION;
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
      };
  metadata: { identityProvider: string } | Record<string, never>;
}

export interface ActivityLogPage {
  events: ActivityLogEvent[];
}
