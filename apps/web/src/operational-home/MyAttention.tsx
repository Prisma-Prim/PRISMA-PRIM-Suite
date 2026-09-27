import { useId } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import type {
  AttentionRule,
  MyAttention as AttentionView,
} from './operational-home-response';
import { useOperationalHomeCopy } from './operational-home-localized.copy';

type Props = {
  attention: AttentionView;
  company: { id: string; displayName: string };
  today: string;
  onOpenTask?: (task: { projectId: string; taskId: string }) => void;
  onOpenMyTasks: () => void;
};

/** The bounded queue already composed into the one operational-home read. */
export function MyAttention({
  attention,
  company,
  today,
  onOpenTask,
  onOpenMyTasks,
}: Props) {
  const copy = useOperationalHomeCopy();
  const { formatDate, formatNumber } = useInterfaceLocale();
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
  const titleId = useId();
  return (
    <section className="operational-home-attention" aria-labelledby={titleId}>
      <header className="operational-home-attention-heading">
        <h3 id={titleId}>{copy.attention.title}</h3>
        <button type="button" onClick={onOpenMyTasks}>
          {copy.attention.seeAll}
        </button>
      </header>
      {attention.tasks.length === 0 ? (
        <p className="operational-home-attention-note">
          {copy.attention.empty({
            company: company.displayName,
            today: formatDate(today),
          })}
        </p>
      ) : (
        <>
          <p className="operational-home-attention-note">
            {copy.attention.truncated({
              shown: formatNumber(attention.tasks.length),
              total: formatNumber(attention.matchingCount),
            })}
          </p>
          <ul
            className="operational-home-attention-list"
            aria-label={copy.attention.listLabel}
          >
            {attention.tasks.map((task) => (
              <li key={task.id}>
                <div className="operational-home-attention-main">
                  <h4>{task.title}</h4>
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
        </>
      )}
    </section>
  );
}
