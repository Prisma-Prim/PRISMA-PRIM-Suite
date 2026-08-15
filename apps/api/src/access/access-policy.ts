import { ForbiddenException } from '@nestjs/common';
import type { ActorContext, WorkspacePermission } from './access.types.js';

export function requireWorkspacePermission(
  actor: ActorContext,
  permission: WorkspacePermission,
): void {
  if (!actor.workspacePermissions.includes(permission)) {
    throw new ForbiddenException();
  }
}
