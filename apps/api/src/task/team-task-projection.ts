import { ServiceUnavailableException } from '@nestjs/common';
import { readTaskView } from './task.validation.js';
/** Validate complete native stored facts; collection corruption is never a trusted prefix or input error. */
export function readTeamTaskProjection(
  value: unknown,
  project: { id: string; title: string; clientDisplayName: string },
) {
  try {
    const task = readTaskView(value);
    const uuid = (value: string) => {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        )
      )
        throw new Error('Invalid identifier');
    };
    const text = (value: string) => {
      if (
        !value.trim() ||
        value.includes('\0') ||
        /[\uD800-\uDFFF]/u.test(value)
      )
        throw new Error('Invalid label');
    };
    const time = (value: string) => {
      if (!Number.isFinite(Date.parse(value)))
        throw new Error('Invalid timestamp');
    };
    for (const id of [
      task.id,
      task.companyId,
      task.projectId,
      task.clientAccountId,
      project.id,
    ])
      uuid(id);
    if (task.projectId !== project.id)
      throw new Error('Invalid Project binding');
    for (const label of [task.title, project.title, project.clientDisplayName])
      text(label);
    time(task.createdAt);
    time(task.updatedAt);
    const actors = [task.createdBy];
    if (task.assignee) {
      uuid(task.assignee.workspaceMembershipId);
      text(task.assignee.displayLabel);
    }
    if (task.status === 'done') {
      actors.push(task.completion.actor);
      time(task.completion.occurredAt);
    }
    if (task.status === 'blocked' || task.status === 'cancelled') {
      const declaration =
        task.status === 'blocked' ? task.blockage : task.cancellation;
      actors.push(declaration.actor);
      time(declaration.occurredAt);
      text(declaration.reason);
    }
    for (const actor of actors) {
      uuid(actor.internalUserId);
      uuid(actor.workspaceMembershipId);
      text(actor.displayName);
    }
    return { ...task, project };
  } catch {
    throw new ServiceUnavailableException('Native Task facts are unavailable.');
  }
}
