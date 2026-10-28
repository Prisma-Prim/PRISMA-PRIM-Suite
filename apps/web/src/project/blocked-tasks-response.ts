import {
  readTaskDiscoveryPage,
  type TaskDiscoveryRow,
} from './task-discovery-response';
import type { TaskView } from './task-response';
export type BlockedTask = Extract<TaskView, { status: 'blocked' }> & {
  project: TaskDiscoveryRow['project'];
};
export function readBlockedTasks(
  value: unknown,
  scope: { companyId: string; offset: number },
) {
  const page = readTaskDiscoveryPage(value, scope);
  return {
    ...page,
    tasks: page.tasks.map((task): BlockedTask => {
      if (task.status !== 'blocked')
        throw new Error('Nonblocked Task in blocked discovery.');
      return task;
    }),
  };
}
export type BlockedTasksPage = ReturnType<typeof readBlockedTasks>;
