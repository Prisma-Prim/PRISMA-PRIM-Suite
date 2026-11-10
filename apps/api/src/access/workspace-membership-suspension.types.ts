import type { WorkspaceId, WorkspaceMembershipId } from './access.types.js';

export interface SuspendWorkspaceMembershipCommand {
  readonly workspaceMembershipId: unknown;
  readonly idempotencyKey: string | undefined;
}

export interface WorkspaceMembershipSuspensionRecord {
  readonly workspaceMembershipId: WorkspaceMembershipId;
  readonly status: 'inactive';
}

export interface WorkspaceMembershipSuspensionTarget {
  readonly workspaceId: WorkspaceId;
  readonly workspaceMembershipId: WorkspaceMembershipId;
}
