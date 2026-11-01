import { useInterfaceLocale } from '../localization/interface-locale';
import { useInternalTaskCopy } from './internal-task.copy';
import type { Task } from './internal-task-response';
export function TaskDate({ value }: { value: string | null }) {
  const { formatDate } = useInterfaceLocale();
  return value ? <time dateTime={value}>{formatDate(value)}</time> : <>—</>;
}
export function TaskTime({ value }: { value: string }) {
  const { formatDateTime } = useInterfaceLocale();
  return <time dateTime={value}>{formatDateTime(value)}</time>;
}
export function TaskValues({ task }: { task: Task }) {
  const copy = useInternalTaskCopy();
  return (
    <dl className="internal-task-values">
      <dt>{copy('taskTitle')}</dt>
      <dd>{task.title}</dd>
      <dt>{copy('description')}</dt>
      <dd>
        <pre>{task.description ?? '—'}</pre>
      </dd>
      <dt>{copy('assignee')}</dt>
      <dd>{task.assignee?.displayLabel ?? copy('unassigned')}</dd>
      <dt>{copy('date')}</dt>
      <dd>
        <TaskDate value={task.dueDate} />
      </dd>
      <dt>{copy('priority')}</dt>
      <dd>{copy(task.priority)}</dd>
      <dt>{copy('status')}</dt>
      <dd>{copy(task.status)}</dd>
      <dt>{copy('version')}</dt>
      <dd>{task.version}</dd>
      <dt>{copy('created')}</dt>
      <dd>
        {task.createdByMembershipId} · <TaskTime value={task.createdAt} />
      </dd>
      <dt>{copy('updated')}</dt>
      <dd>
        <TaskTime value={task.updatedAt} />
      </dd>
      {task.reason && (
        <>
          <dt>{copy('reason')}</dt>
          <dd>
            <pre>{task.reason.text}</pre>
            {task.reason.actorMembershipId} ·{' '}
            <TaskTime value={task.reason.recordedAt} />
          </dd>
        </>
      )}
      {task.completion && (
        <>
          <dt>{copy('completion')}</dt>
          <dd>
            {task.completion.actorMembershipId} ·{' '}
            <TaskTime value={task.completion.recordedAt} />
          </dd>
        </>
      )}
    </dl>
  );
}
