import { useInterfaceLocale } from '../localization/interface-locale';
import type { AttentionRule, AttentionTask } from './operational-home-response';
import { useOperationalHomeCopy } from './operational-home-localized.copy';

/** Shared literal Task facts and every rule label for the preview and full read. */
export function AttentionTaskList({
  tasks,
  onOpenTask,
  headingLevel = 4,
}: {
  tasks: AttentionTask[];
  onOpenTask?: (task: { projectId: string; taskId: string }) => void;
  headingLevel?: 4 | 5;
}) {
  const copy = useOperationalHomeCopy();
  const { formatDate, formatNumber } = useInterfaceLocale();
  const Heading = headingLevel === 4 ? 'h4' : 'h5';
  function ruleLabel(rule: AttentionRule, dueInDays: number | null): string {
    switch (rule) {
      case 'overdue': {
        if (dueInDays === null || dueInDays >= 0)
          throw new Error('Invalid overdue attention label.');
        const days = -dueInDays;
        return copy.attention.overdueBy({
          days,
          count: formatNumber(days),
        });
      }
      case 'critical':
        return copy.attention.critical;
      case 'blocked':
        return copy.attention.blocked;
      case 'due_soon':
        if (dueInDays === null || dueInDays < 0 || dueInDays > 7)
          throw new Error('Invalid due-soon attention label.');
        return dueInDays === 0
          ? copy.attention.dueToday
          : copy.attention.dueIn({
              days: dueInDays,
              count: formatNumber(dueInDays),
            });
      default: {
        const exhaustive: never = rule;
        return exhaustive;
      }
    }
  }
  return (
    <ul
      className="operational-home-attention-list"
      aria-label={copy.attention.listLabel}
    >
      {tasks.map((task) => (
        <li key={task.id}>
          <div className="operational-home-attention-main">
            <Heading>{task.title}</Heading>
            <p className="operational-home-attention-rules">
              {task.rules.map((rule) => (
                <span key={rule}>{ruleLabel(rule, task.dueInDays)}</span>
              ))}
            </p>
          </div>
          <dl>
            <div>
              <dt>{copy.attention.state}</dt>
              <dd>{copy.states[task.status]}</dd>
            </div>
            <div>
              <dt>{copy.attention.dueDate}</dt>
              <dd>
                {task.dueDate ? (
                  <time dateTime={task.dueDate}>
                    {formatDate(task.dueDate)}
                  </time>
                ) : (
                  copy.attention.noDate
                )}
              </dd>
            </div>
            <div>
              <dt>{copy.attention.project}</dt>
              <dd>{task.project.title}</dd>
            </div>
            <div>
              <dt>{copy.attention.client}</dt>
              <dd>{task.project.clientDisplayName}</dd>
            </div>
          </dl>
          {onOpenTask && (
            <button
              type="button"
              aria-label={copy.attention.openTask({
                task: task.title,
                project: task.project.title,
                client: task.project.clientDisplayName,
              })}
              onClick={() =>
                onOpenTask({
                  projectId: task.project.id,
                  taskId: task.id,
                })
              }
            >
              {copy.attention.open}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
