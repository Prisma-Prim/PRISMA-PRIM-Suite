import { tasks } from '../database/schema/index.js';
import type { TaskView, TaskActor, TaskDeclaration } from './task.types.js';
type TaskRow = typeof tasks.$inferSelect;

export function nativeTaskView(row: TaskRow): TaskView {
  if (
    (row.assigneeMembershipId === null) !==
    (row.assigneeDisplayLabel === null)
  )
    throw new Error('Invalid stored Task assignment.');
  const common = {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId,
    clientAccountId: row.clientAccountId,
    title: row.title,
    assignee:
      row.assigneeMembershipId !== null && row.assigneeDisplayLabel !== null
        ? {
            workspaceMembershipId: row.assigneeMembershipId,
            displayLabel: row.assigneeDisplayLabel,
          }
        : null,
    dueDate: row.dueDate,
    priority: row.priority,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: {
      internalUserId: row.createdByInternalUserId,
      workspaceMembershipId: row.createdByMembershipId,
      displayName: row.createdByDisplayName,
    },
  };
  switch (row.status) {
    case 'todo':
    case 'in_progress':
      return { ...common, status: row.status, completion: null };
    case 'blocked':
      return {
        ...common,
        status: row.status,
        completion: null,
        blockage: storedDeclaration(
          row.blockageReason,
          storedAttribution({
            internalUserId: row.blockedByInternalUserId,
            workspaceMembershipId: row.blockedByMembershipId,
            displayName: row.blockedByDisplayName,
            occurredAt: row.blockedAt,
          }),
        ),
      };
    case 'done':
      return {
        ...common,
        status: row.status,
        completion: storedAttribution({
          internalUserId: row.completedByInternalUserId,
          workspaceMembershipId: row.completedByMembershipId,
          displayName: row.completedByDisplayName,
          occurredAt: row.completedAt,
        }),
      };
    case 'cancelled':
      return {
        ...common,
        status: row.status,
        completion: null,
        cancellation: storedDeclaration(
          row.cancellationReason,
          storedAttribution({
            internalUserId: row.cancelledByInternalUserId,
            workspaceMembershipId: row.cancelledByMembershipId,
            displayName: row.cancelledByDisplayName,
            occurredAt: row.cancelledAt,
          }),
        ),
      };
    default: {
      const exhaustive: never = row.status;
      throw new Error(`Invalid stored Task state: ${String(exhaustive)}.`);
    }
  }
}
function storedAttribution(columns: {
  internalUserId: string | null;
  workspaceMembershipId: string | null;
  displayName: string | null;
  occurredAt: Date | null;
}): { actor: TaskActor; occurredAt: string } {
  const { internalUserId, workspaceMembershipId, displayName, occurredAt } =
    columns;
  if (
    internalUserId === null ||
    workspaceMembershipId === null ||
    displayName === null ||
    occurredAt === null
  )
    throw new Error('Invalid stored Task declaration.');
  return {
    actor: { internalUserId, workspaceMembershipId, displayName },
    occurredAt: occurredAt.toISOString(),
  };
}
function storedDeclaration(
  reason: string | null,
  attribution: { actor: TaskActor; occurredAt: string },
): TaskDeclaration {
  if (reason === null) throw new Error('Invalid stored Task declaration.');
  return { reason, ...attribution };
}
