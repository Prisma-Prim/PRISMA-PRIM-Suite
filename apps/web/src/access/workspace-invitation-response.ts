import { workspaceInvitationsCopy } from './workspace-invitations.copy';

export type InvitationStatus = keyof typeof workspaceInvitationsCopy.statuses;
export interface WorkspaceInvitation {
  id: string;
  email: string;
  status: InvitationStatus;
  deliveryStatus: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  consumedAt: string | null;
  nextCheckAt: string;
}
export interface InvitationPage {
  invitations: WorkspaceInvitation[];
  nextCursor: string | null;
}

export function invitationResponse(value: unknown): WorkspaceInvitation {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    typeof value.email !== 'string' ||
    !status(value.status) ||
    !status(value.deliveryStatus) ||
    !date(value.expiresAt) ||
    !date(value.createdAt) ||
    !(value.revokedAt === null || date(value.revokedAt)) ||
    !(
      value.consumedAt === undefined ||
      value.consumedAt === null ||
      date(value.consumedAt)
    ) ||
    !date(value.nextCheckAt)
  )
    throw new Error('Invalid invitation response.');
  return {
    id: value.id,
    email: value.email,
    status: value.status,
    deliveryStatus: value.deliveryStatus,
    expiresAt: value.expiresAt,
    createdAt: value.createdAt,
    revokedAt: value.revokedAt,
    consumedAt: value.consumedAt ?? null,
    nextCheckAt: value.nextCheckAt,
  };
}
export function invitationPageResponse(value: unknown): InvitationPage {
  if (
    !record(value) ||
    !Array.isArray(value.invitations) ||
    !(value.nextCursor === null || typeof value.nextCursor === 'string')
  )
    throw new Error('Invalid invitation page.');
  return {
    invitations: value.invitations.map(invitationResponse),
    nextCursor: value.nextCursor,
  };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function status(value: unknown): value is InvitationStatus {
  return (
    typeof value === 'string' &&
    Object.hasOwn(workspaceInvitationsCopy.statuses, value)
  );
}
function date(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
