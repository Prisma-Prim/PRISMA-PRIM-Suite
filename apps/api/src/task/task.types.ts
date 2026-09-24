export interface TaskActor {
  internalUserId: string;
  workspaceMembershipId: string;
  displayName: string;
}
export interface TaskAssignee {
  workspaceMembershipId: string;
  displayLabel: string;
}
/**
 * Manual Task priority codes (#375). A Task without a chosen priority is
 * `normal`; the priority grants, orders and triggers nothing.
 */
export const TASK_PRIORITIES = ['normal', 'important', 'critical'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const DEFAULT_TASK_PRIORITY = 'normal' satisfies TaskPriority;
export interface TaskFields {
  title: string;
  assignee: TaskAssignee | null;
  dueDate: string | null;
  priority: TaskPriority;
}
/** Creation facts; a creation recorded before priority existed has none, never `normal`. */
export type TaskInitialFields = Omit<TaskFields, 'priority'> & {
  priority?: TaskPriority;
};
export type TaskView = TaskFields & {
  id: string;
  companyId: string;
  projectId: string;
  clientAccountId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: TaskActor;
} & (
    | { status: 'todo'; completion: null }
    | { status: 'done'; completion: { actor: TaskActor; occurredAt: string } }
  );
/** An open Task assigned to the reader, with the Project list's own labels. */
export type AssignedTaskView = TaskView & {
  project: { id: string; title: string; clientDisplayName: string };
};
export type TaskChanges = {
  [K in keyof TaskFields]?: { before: TaskFields[K]; after: TaskFields[K] };
};
export type TaskEventMeaning =
  | {
      action: 'task.created';
      metadata: { version: number; initial: TaskInitialFields };
    }
  | {
      action: 'task.updated';
      metadata: { version: number; changes: TaskChanges };
    }
  | {
      action: 'task.completed';
      metadata: { version: number; before: 'todo'; after: 'done' };
    }
  | {
      action: 'task.reopened';
      metadata: { version: number; before: 'done'; after: 'todo' };
    };
export type TaskEvent = TaskEventMeaning & {
  id: string;
  occurredAt: string;
  actor: TaskActor;
  target: {
    type: 'task';
    taskId: string;
    taskTitle: string;
    companyId: string;
  };
};
