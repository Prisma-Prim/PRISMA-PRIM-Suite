import type { ActorContext } from '../access/access.types.js';

export const INTERNAL_USER_PROVISIONED_ACTION =
  'internal_user.provisioned' as const;

export interface CanonicalActivityEvent {
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

export interface ActivityLogEvent {
  id: string;
  action: typeof INTERNAL_USER_PROVISIONED_ACTION;
  occurredAt: string;
  actor: {
    internalUserId: string;
    displayName: string;
  };
  target: {
    type: 'internal_user';
    internalUserId: string;
    displayName: string;
  };
  metadata: {
    identityProvider: string;
  };
}

export interface ActivityLogPage {
  events: ActivityLogEvent[];
}
