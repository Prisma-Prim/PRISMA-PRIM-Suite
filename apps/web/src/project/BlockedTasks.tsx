import { TaskDiscovery, type TaskDiscoveryProps } from './TaskDiscovery';
/** The native blocked Task discovery entry; all read lifetime/paging policy has one owner. */
export function BlockedTasks(props: TaskDiscoveryProps) {
  return <TaskDiscovery {...props} kind="blocked" />;
}
