export interface TaskActor {
  internalUserId: string;
  workspaceMembershipId: string;
  displayName: string;
}
export interface TaskAssignee {
  workspaceMembershipId: string;
  displayLabel: string;
}
export interface TaskFields {
  title: string;
  assignee: TaskAssignee | null;
  dueDate: string | null;
}
export const OPEN_TASK_STATES = ['todo', 'in_progress', 'blocked'] as const;
export type OpenTaskState = (typeof OPEN_TASK_STATES)[number];
export type ClosedTaskState = 'done' | 'cancelled';
export type TaskState = OpenTaskState | ClosedTaskState;
/** A reasoned manual declaration with its server-established actor and time. */
export interface TaskDeclaration {
  reason: string;
  actor: TaskActor;
  occurredAt: string;
}
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
    | { status: 'todo' | 'in_progress'; completion: null }
    | { status: 'blocked'; completion: null; blockage: TaskDeclaration }
    | { status: 'done'; completion: { actor: TaskActor; occurredAt: string } }
    | {
        status: 'cancelled';
        completion: null;
        cancellation: TaskDeclaration;
      }
  );
/** The Project list's own labels for a Task row. */
export interface TaskProjectLabels {
  id: string;
  title: string;
  clientDisplayName: string;
}
/** An open Task assigned to the reader, with the Project list's own labels. */
export type AssignedTaskView = TaskView & { project: TaskProjectLabels };
/**
 * An open Task of the reader's Project list due before the read's today, with
 * the Project list's own labels and its whole calendar days overdue.
 */
export type OverdueTaskView = TaskView & {
  project: TaskProjectLabels;
  daysOverdue: number;
};
/** The Company overdue Tasks at one today: the count and at most the requested rows. */
export interface CompanyOverdueTasks {
  companyId: string;
  total: number;
  tasks: OverdueTaskView[];
}
export type TaskChanges = {
  [K in keyof TaskFields]?: { before: TaskFields[K]; after: TaskFields[K] };
};
/** A move between two different open states; only entering `blocked` carries a reason. */
export type TaskStatusChange =
  | {
      before: OpenTaskState;
      after: Exclude<OpenTaskState, 'blocked'>;
      reason: null;
    }
  | { before: OpenTaskState; after: 'blocked'; reason: string };
export type TaskEventMeaning =
  | {
      action: 'task.created';
      metadata: { version: number; initial: TaskFields };
    }
  | {
      action: 'task.updated';
      metadata: { version: number; changes: TaskChanges };
    }
  | {
      action: 'task.status.changed';
      metadata: { version: number } & TaskStatusChange;
    }
  | {
      action: 'task.completed';
      metadata: { version: number; before: OpenTaskState; after: 'done' };
    }
  | {
      action: 'task.cancelled';
      metadata: {
        version: number;
        before: OpenTaskState;
        after: 'cancelled';
        reason: string;
      };
    }
  | {
      action: 'task.reopened';
      metadata: { version: number; before: ClosedTaskState; after: 'todo' };
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
