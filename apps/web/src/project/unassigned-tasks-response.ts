import {
  readTaskDiscoveryPage,
  type TaskDiscoveryRow,
} from './task-discovery-response';
import { type TaskView, type OpenTaskState } from './task-response';
export type UnassignedTask = Extract<TaskView, { status: OpenTaskState }> & {
  assignee: null;
  project: TaskDiscoveryRow['project'];
};
export function readUnassignedTasks(
  value: unknown,
  scope: { companyId: string; offset: number },
) {
  const page = readTaskDiscoveryPage(value, scope);
  return {
    ...page,
    tasks: page.tasks.map((task): UnassignedTask => {
      if (task.assignee !== null)
        throw new Error('Assigned Task in unassigned discovery.');
      switch (task.status) {
        case 'todo':
        case 'in_progress':
        case 'blocked':
          return { ...task, assignee: null };
        case 'done':
        case 'cancelled':
          throw new Error('Closed Task in unassigned discovery.');
        default: {
          const exhaustive: never = task;
          return exhaustive;
        }
      }
    }),
  };
}
export type UnassignedTasksPage = ReturnType<typeof readUnassignedTasks>;
