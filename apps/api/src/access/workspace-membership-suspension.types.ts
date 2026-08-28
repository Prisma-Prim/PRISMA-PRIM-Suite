export interface SuspendWorkspaceMembershipCommand {
  readonly workspaceMembershipId: unknown;
  readonly idempotencyKey: string | undefined;
}

export interface WorkspaceMembershipSuspensionRecord {
  readonly workspaceMembershipId: string;
  readonly status: 'inactive';
}
