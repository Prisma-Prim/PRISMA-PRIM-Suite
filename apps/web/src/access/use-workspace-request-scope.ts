import { useCallback, useLayoutEffect, useRef } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';

/** Workspace work and full-Actor recovery consume different committed scopes. */
export function useWorkspaceRequestScope({
  actor,
  identity,
  permission,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  permission: 'company.assignment.manage' | 'member.invite';
}) {
  const allowed =
    identity.loaded &&
    identity.signedIn &&
    actor.active &&
    actor.workspacePermissions.includes(permission);
  const lifetime = useRequestLifetime(
    identity,
    JSON.stringify([
      actor.internalUserId,
      actor.workspaceId,
      actor.workspaceMembershipId,
      identity.loaded,
      identity.signedIn,
      actor.active,
      permission,
      allowed,
    ]),
  );
  const scope = String(lifetime);
  const observation = useActorObservation(actor);
  const recovery = useScopedOperationGroup(
    JSON.stringify([lifetime, observation]),
  );
  const committed = useRef({ scope, recovery });
  useLayoutEffect(() => {
    committed.current = { scope, recovery };
  });
  const captureRecovery = useCallback(() => {
    const current = committed.current;
    return current.scope === scope ? current.recovery.isLive : () => false;
  }, [scope]);
  return { allowed, scope, captureRecovery };
}
