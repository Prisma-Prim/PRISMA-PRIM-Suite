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
      metadata: { version: number; initial: TaskFields };
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
