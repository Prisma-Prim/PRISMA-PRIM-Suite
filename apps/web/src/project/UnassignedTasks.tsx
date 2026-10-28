import { TaskDiscovery, type TaskDiscoveryProps } from './TaskDiscovery';
/** The native unassigned Task discovery entry; all read lifetime/paging policy has one owner. */
export function UnassignedTasks(props: TaskDiscoveryProps) {
  return <TaskDiscovery {...props} kind="unassigned" />;
}
