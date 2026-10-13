import type { ActorContext } from '../access/access.types.js';

/**
 * The actor half of the Project owner's read rule: `project.read` in the
 * active Company together with Client read (Workspace Client management or
 * Company `client.read`). Each Project is then readable only while its
 * original Client stays active or superseded with an active relationship to
 * that Company; the caller's query enforces that per-Project boundary.
 * Another module may authorize a read of a Project target through this
 * predicate; it gains no Project behaviour from it.
 */
export function canReadProjectTargets(
  actor: Pick<ActorContext, 'activeCompany' | 'workspacePermissions'>,
): boolean {
  const company = actor.activeCompany;
  return (
    company?.projectPermissions?.includes('project.read') === true &&
    (actor.workspacePermissions.includes('client.manage') ||
      company.clientPermissions.includes('client.read'))
  );
}
