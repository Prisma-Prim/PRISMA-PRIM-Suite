import { CalendarDays } from 'lucide-react';
import { useId } from 'react';
import type { BrowserIdentity } from '../../access-composition';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { MyAttention } from '../../operational-home/MyAttention';
import type { MyAttention as AttentionView } from '../../operational-home/operational-home-response';
import { UpcomingDeadlines } from '../../operational-home/UpcomingDeadlines';
import type {
  UpcomingDeadlinesPage,
  UpcomingTask,
} from '../../operational-home/upcoming-deadlines-response';
import { useMyTasksCopy } from '../../project/my-tasks-localized.copy';
import { ClarteButton } from '../components/ClarteButton';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { useClarteTodayCopy } from './clarte-today.copy';
import { longDate, weekdayParts } from './today-dates';
import type { FirstPage } from './use-first-page';

type TaskTarget = { projectId: string; taskId: string };
type Company = { id: string; displayName: string };

/**
 * "To do" (#1532): the Tasks needing the actor's attention, from the one
 * Company summary read, with the existing full attention list and My Tasks,
 * then the existing full list of the actor's upcoming deadlines.
 */
export function TodayToDo({
  attention,
  today,
  deadlines,
  company,
  workspaceMembershipId,
  identity,
  onOpenTask,
  onOpenMyTasks,
}: Readonly<{
  attention: AttentionView | undefined;
  today: string | undefined;
  /** The actor's deadlines are offered with the Company's Task read. */
  deadlines: boolean;
  company: Company;
  workspaceMembershipId: string;
  identity: BrowserIdentity;
  onOpenTask?: (task: TaskTarget) => void;
  onOpenMyTasks: () => void;
}>) {
  const copy = useClarteTodayCopy();
  const titleId = useId();
  if (attention === undefined && !deadlines) return null;
  return (
    <section
      className="clarte-today-section clarte-today-todo"
      aria-labelledby={titleId}
    >
      <header className="clarte-today-section-head">
        <h2 id={titleId}>{copy.message('todoTitle')}</h2>
        <p>{copy.message('todoLead')}</p>
      </header>
      <div className="clarte-today-todo-body">
        {attention !== undefined && today !== undefined && (
          <MyAttention
            attention={attention}
            identity={identity}
            workspaceMembershipId={workspaceMembershipId}
            company={company}
            today={today}
            onOpenTask={onOpenTask}
            onOpenMyTasks={onOpenMyTasks}
          />
        )}
        {deadlines && (
          <UpcomingDeadlines
            company={company}
            workspaceMembershipId={workspaceMembershipId}
            identity={identity}
            onOpenTask={onOpenTask}
          />
        )}
      </div>
    </section>
  );
}

/**
 * "This week": the first page of the actor's open Tasks due from the
 * server's today through seven days ahead, grouped by due day in the
 * server's order. The total is the server's; the full list is in "To do".
 */
export function TodayWeek({
  load,
  onRetry,
  onOpenTask,
}: Readonly<{
  load: FirstPage<UpcomingDeadlinesPage>;
  onRetry: () => void;
  onOpenTask?: (task: TaskTarget) => void;
}>) {
  const copy = useClarteTodayCopy();
  const taskCopy = useMyTasksCopy();
  const { locale, formatNumber } = useInterfaceLocale();
  const titleId = useId();
  if (load.kind === 'idle') return null;
  let body;
  switch (load.kind) {
    case 'loading':
      body = <ClarteLoadingState label={copy.message('weekLoading')} />;
      break;
    case 'denied':
      body = <ClarteEmptyState title={copy.message('weekDenied')} />;
      break;
    case 'error':
      body = (
        <ClarteErrorState
          title={copy.message('weekError')}
          action={
            <ClarteButton size="small" onClick={onRetry}>
              {copy.message('retry')}
            </ClarteButton>
          }
        />
      );
      break;
    case 'ready': {
      const { page } = load;
      const days = groupByDay(page.tasks);
      body = (
        <>
          <p className="clarte-today-card-note">
            {copy.weekRange({
              today: longDate(locale, page.today),
              through: longDate(locale, page.throughDate),
            })}
          </p>
          {days.length === 0 ? (
            <ClarteEmptyState title={copy.message('weekEmpty')} />
          ) : (
            <ol className="clarte-today-week">
              {days.map(([day, tasks]) => {
                const parts = weekdayParts(locale, day);
                return (
                  <li
                    key={day}
                    className="clarte-today-week-day"
                    data-today={day === page.today || undefined}
                  >
                    <time dateTime={day} className="clarte-today-week-date">
                      <small>{parts.weekday}</small>
                      <strong>{parts.day}</strong>
                      <span className="clarte-visually-hidden">
                        {longDate(locale, day)}
                      </span>
                    </time>
                    <ul>
                      {tasks.map((task) => (
                        <li key={task.id}>
                          {onOpenTask ? (
                            <button
                              type="button"
                              className="clarte-today-week-task"
                              aria-label={taskCopy.openTask({
                                task: task.title,
                                project: task.project.title,
                                client: task.project.clientDisplayName,
                              })}
                              onClick={() =>
                                onOpenTask({
                                  projectId: task.projectId,
                                  taskId: task.id,
                                })
                              }
                            >
                              <strong>{task.title}</strong>
                              <small>{task.project.clientDisplayName}</small>
                            </button>
                          ) : (
                            <span className="clarte-today-week-task">
                              <strong>{task.title}</strong>
                              <small>{task.project.clientDisplayName}</small>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ol>
          )}
          {page.total > page.tasks.length && (
            <p className="clarte-today-card-note">
              {copy.weekShown({
                shown: formatNumber(page.tasks.length),
                total: formatNumber(page.total),
              })}
            </p>
          )}
        </>
      );
      break;
    }
    default: {
      const exhaustive: never = load;
      return exhaustive;
    }
  }
  return (
    <section className="clarte-today-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="clarte-today-card-title">
        <CalendarDays aria-hidden="true" />
        {copy.message('weekTitle')}
      </h2>
      {body}
    </section>
  );
}

/** Consecutive days in the server's due-date order, each with its Tasks. */
function groupByDay(
  tasks: readonly UpcomingTask[],
): [string, UpcomingTask[]][] {
  const days: [string, UpcomingTask[]][] = [];
  for (const task of tasks) {
    const last = days.at(-1);
    if (last && last[0] === task.dueDate) last[1].push(task);
    else days.push([task.dueDate, [task]]);
  }
  return days;
}
