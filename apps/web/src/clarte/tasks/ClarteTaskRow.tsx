import {
  ArrowUpRight,
  Circle,
  CircleCheck,
  CircleX,
  Clock,
  Lock,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { useMyTasksCopy } from '../../project/my-tasks-localized.copy';
import { TaskDeclarationFacts } from '../../project/TaskPresentation';
import { useProjectTaskCopy } from '../../project/task.copy';
import type { TaskState, TaskView } from '../../project/task-response';
import { ClarteBadge, type ClarteTone } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { browserDate } from '../today/today-dates';
import { dueTone } from './task-due';

/** A Task row of a Tasks view, with the Project and Client labels its read carries. */
export type ClarteTaskItem = TaskView & {
  project: { title: string; clientDisplayName: string };
};
/** Opens a Task in its Project, as the current interface's row does. */
export type OpenTaskInProject = (target: {
  projectId: string;
  taskId: string;
}) => void;

const stateTone = {
  todo: 'info',
  in_progress: 'accent',
  blocked: 'danger',
  done: 'success',
  cancelled: 'neutral',
} as const satisfies Record<TaskState, ClarteTone>;

const stateMark = {
  todo: Circle,
  in_progress: Circle,
  blocked: Lock,
  done: CircleCheck,
  cancelled: CircleX,
} as const satisfies Record<TaskState, typeof Circle>;

/**
 * One Task of a Tasks view (#1542): its title opens the Task's side panel,
 * its facts are the ones the view's read returned, and Open opens it in its
 * Project. A blocked or cancelled Task shows its declaration.
 */
export function ClarteTaskRow({
  task,
  showAssignee,
  disabled,
  onSelect,
  onOpenInProject,
}: Readonly<{
  task: ClarteTaskItem;
  showAssignee: boolean;
  disabled?: boolean;
  onSelect: (task: ClarteTaskItem, opener: HTMLElement) => void;
  onOpenInProject?: (task: ClarteTaskItem) => void;
}>) {
  const copy = useMyTasksCopy();
  const native = useProjectTaskCopy();
  const { formatDate } = useInterfaceLocale();
  return (
    <li className="clarte-task-row" data-state={task.status}>
      <ClarteTaskMark state={task.status} />
      <div className="clarte-task-main">
        <h3 className="clarte-task-title">
          <button
            type="button"
            disabled={disabled}
            onClick={(event) => onSelect(task, event.currentTarget)}
          >
            {task.title}
          </button>
        </h3>
        <p className="clarte-task-meta">
          <span className="clarte-task-place">
            <span>{task.project.title}</span>
            <span>{task.project.clientDisplayName}</span>
          </span>
          {task.priority !== 'normal' && (
            <span className="clarte-task-priority">
              {copy.priorities[task.priority]}
            </span>
          )}
        </p>
        {(task.status === 'blocked' || task.status === 'cancelled') && (
          <div className="clarte-task-declaration">
            <TaskDeclarationFacts
              kind={task.status}
              declaration={
                task.status === 'blocked' ? task.blockage : task.cancellation
              }
            />
          </div>
        )}
        {task.status === 'done' && (
          <p className="clarte-task-completion">
            {task.completion.actor.displayName} ·{' '}
            <time dateTime={task.completion.occurredAt}>
              {formatDate(task.completion.occurredAt)}
            </time>
          </p>
        )}
      </div>
      <div className="clarte-task-side">
        {task.assignee && (
          <span className="clarte-task-avatar" aria-hidden="true">
            {initials(task.assignee.displayLabel)}
          </span>
        )}
        <dl className="clarte-task-facts">
          {showAssignee && (
            <TaskFact label={native.assignee}>
              {task.assignee?.displayLabel ?? native.unassigned}
            </TaskFact>
          )}
          <TaskFact label={copy.dueDate}>
            <ClarteDueDate value={task.dueDate} />
          </TaskFact>
          <TaskFact label={native.status}>
            <ClarteBadge tone={stateTone[task.status]}>
              {native.states[task.status]}
            </ClarteBadge>
          </TaskFact>
        </dl>
      </div>
      {onOpenInProject && (
        <ClarteButton
          variant="quiet"
          size="small"
          className="clarte-task-project"
          aria-label={copy.openTask({
            task: task.title,
            project: task.project.title,
            client: task.project.clientDisplayName,
          })}
          onClick={() => onOpenInProject(task)}
        >
          {copy.open}
          <ArrowUpRight aria-hidden="true" />
        </ClarteButton>
      )}
    </li>
  );
}

/**
 * A due date as a chip coloured beside the browser's own day. A day within
 * a week is named relatively in the interface language; the exact date
 * stays its machine value and title.
 */
export function ClarteDueDate({ value }: Readonly<{ value: string | null }>) {
  const copy = useMyTasksCopy();
  const { locale, formatDate } = useInterfaceLocale();
  const today = browserDate();
  return (
    <span className="clarte-task-due" data-tone={dueTone(value, today)}>
      <Clock aria-hidden="true" />
      {value === null ? (
        copy.noDate
      ) : (
        <time dateTime={value} title={formatDate(value)}>
          {nearDay(value, today, locale) ?? formatDate(value)}
        </time>
      )}
    </span>
  );
}

/** The relative name of a day at most six days away, such as today or tomorrow. */
function nearDay(value: string, today: string, locale: string): string | null {
  const days = Math.round(
    (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  if (!Number.isFinite(days) || Math.abs(days) > 6) return null;
  const text = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
    days,
    'day',
  );
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** Up to two initials of a member's label, for the decorative avatar. */
function initials(label: string): string {
  return label
    .split(/\s+/u)
    .filter((word) => /\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toLocaleUpperCase() ?? '')
    .join('');
}

/** The decorative mark of a Task's state at the start of its row. */
export function ClarteTaskMark({ state }: Readonly<{ state: TaskState }>) {
  const Mark = stateMark[state];
  return (
    <span className="clarte-task-mark" aria-hidden="true">
      <Mark />
    </span>
  );
}

function TaskFact({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export { stateTone as clarteTaskStateTone };
