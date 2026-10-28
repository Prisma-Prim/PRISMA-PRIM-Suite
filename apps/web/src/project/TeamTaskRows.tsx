import type { TaskDiscoveryRow } from './task-discovery-response';
import { useMyTasksCopy } from './my-tasks-localized.copy';
import { useProjectTaskCopy } from './task.copy';
import { useTeamTasksCopy } from './team-tasks.copy';
import { TaskDeclarationFacts } from './TaskPresentation';
import { useInterfaceLocale } from '../localization/interface-locale';
export function TeamTaskRows({
  tasks,
  onOpen,
}: {
  tasks: TaskDiscoveryRow[];
  onOpen: (task: TaskDiscoveryRow) => void;
}) {
  const copy = useTeamTasksCopy(),
    native = useProjectTaskCopy(),
    facts = useMyTasksCopy(),
    { formatDate } = useInterfaceLocale();
  return (
    <ol className="task-discovery-list" aria-label={copy('list')}>
      {tasks.map((task) => (
        <li key={task.id}>
          <div className="task-discovery-title">
            <h3>{task.title}</h3>
            <p>{native.states[task.status]}</p>
          </div>
          <dl>
            <div>
              <dt>{facts.project}</dt>
              <dd>{task.project.title}</dd>
            </div>
            <div>
              <dt>{facts.client}</dt>
              <dd>{task.project.clientDisplayName}</dd>
            </div>
            <div>
              <dt>{native.assignee}</dt>
              <dd>{task.assignee?.displayLabel ?? native.unassigned}</dd>
            </div>
            <div>
              <dt>{facts.dueDate}</dt>
              <dd>
                {task.dueDate === null ? (
                  facts.noDate
                ) : (
                  <time dateTime={task.dueDate}>
                    {formatDate(task.dueDate)}
                  </time>
                )}
              </dd>
            </div>
            <div>
              <dt>{facts.priority}</dt>
              <dd>{facts.priorities[task.priority]}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="task-discovery-open"
            aria-label={facts.openTask({
              task: task.title,
              project: task.project.title,
              client: task.project.clientDisplayName,
            })}
            onClick={() => onOpen(task)}
          >
            {facts.open}
          </button>
          {(task.status === 'blocked' || task.status === 'cancelled') && (
            <div className="task-discovery-blockage">
              <TaskDeclarationFacts
                kind={task.status}
                declaration={
                  task.status === 'blocked' ? task.blockage : task.cancellation
                }
              />
            </div>
          )}
          {task.status === 'done' && (
            <p className="team-task-completion">
              {task.completion.actor.displayName} ·{' '}
              <time dateTime={task.completion.occurredAt}>
                {formatDate(task.completion.occurredAt)}
              </time>
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
