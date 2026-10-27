import type { ActorContext } from '../access/access.types.js';

/** All manual and composed Project intents share the native receipt namespace. */
export function projectCreationLock(actor: ActorContext, key: string) {
  return [
    'project.create',
    actor.workspaceId,
    actor.workspaceMembershipId,
    key,
  ];
}
