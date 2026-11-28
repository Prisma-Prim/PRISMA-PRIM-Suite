import { ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { BrowserIdentity } from '../../access-composition';
import type { ActorContext } from '../../access-types';
import { useRequestLifetime } from '../../api/use-actor-requests';
import { useInterfaceLocale } from '../../localization/interface-locale';
import {
  assignedTasksAuthority,
  useAssignedTasks,
} from '../../project/MyTasks';
import {
  taskDiscoveryAuthority,
  useTaskDiscovery,
  type TaskDiscoveryKind,
} from '../../project/TaskDiscovery';
import { TeamTaskCriteria } from '../../project/TeamTaskCriteria';
import {
  teamTaskAuthority,
  useTeamTasks,
  type TeamTasksProps,
} from '../../project/TeamTasks';
import { useBlockedTasksCopy } from '../../project/blocked-tasks.copy';
import { useMyTasksCopy } from '../../project/my-tasks-localized.copy';
import { useProjectTaskCopy } from '../../project/task.copy';
import { useTeamTasksCopy } from '../../project/team-tasks.copy';
import { useUnassignedTasksCopy } from '../../project/unassigned-tasks.copy';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { browserDate } from '../today/today-dates';
import { ClarteTaskPanel, type ClarteTaskPanelTarget } from './ClarteTaskPanel';
import {
  ClarteTaskRow,
  type ClarteTaskItem,
  type OpenTaskInProject,
} from './ClarteTaskRow';
import { useClarteTasksCopy } from './clarte-tasks.copy';
import './clarte-tasks.css';

/** What every Clarté Tasks view receives from App, with the same gates and keys as the current one. */
export type ClarteTaskViewProps = Readonly<{
  actor: ActorContext;
  identity: BrowserIdentity;
  onOpenTask?: OpenTaskInProject;
  onActivityRecorded?: () => void | Promise<void>;
}>;

/**
 * The side panel a view opens on one of its Tasks. The view keeps which
 * Task is open; the panel owns its reads and commands.
 */
function useTaskPanel(
  props: ClarteTaskViewProps,
  onTasksChanged: () => void,
  openInProject: OpenTaskInProject | undefined = props.onOpenTask,
) {
  const [target, setTarget] = useState<ClarteTaskPanelTarget | null>(null);
  return {
    select: (task: ClarteTaskItem) =>
      setTarget({
        projectId: task.projectId,
        taskId: task.id,
        title: task.title,
        projectTitle: task.project.title,
        clientDisplayName: task.project.clientDisplayName,
      }),
    panel: target && (
      <ClarteTaskPanel
        actor={props.actor}
        identity={props.identity}
        target={target}
        onClose={() => setTarget(null)}
        onOpenTask={openInProject}
        onActivityRecorded={props.onActivityRecorded}
        onTasksChanged={onTasksChanged}
      />
    ),
  };
}

function TaskList({
  label,
  tasks,
  showAssignee,
  onSelect,
  onOpenInProject,
}: Readonly<{
  label: string;
  tasks: readonly ClarteTaskItem[];
  showAssignee: boolean;
  onSelect: (task: ClarteTaskItem) => void;
  onOpenInProject?: (task: ClarteTaskItem) => void;
}>) {
  return (
    <ol className="clarte-task-list" aria-label={label}>
      {tasks.map((task) => (
        <ClarteTaskRow
          key={task.id}
          task={task}
          showAssignee={showAssignee}
          onSelect={onSelect}
          onOpenInProject={onOpenInProject}
        />
      ))}
    </ol>
  );
}

/**
 * A view's actions. The frame states the view's description above; the
 * current interface's notes, which send the reader to the Project to act,
 * do not apply where the side panel acts.
 */
function Toolbar({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="clarte-tasks-toolbar">
      <div className="clarte-tasks-toolbar-actions">{children}</div>
    </div>
  );
}

/**
 * Tasks › My Tasks (#1542): the actor's open Tasks in due-date order,
 * grouped by due date. A Task opens in its side panel or in its Project.
 */
export function ClarteMyTasks(props: ClarteTaskViewProps) {
  return <MyTasksView key={assignedTasksAuthority(props.actor)} {...props} />;
}

type DueGroup =
  'pastDueGroup' | 'todayGroup' | 'weekGroup' | 'laterGroup' | 'undatedGroup';
const dueGroups: readonly DueGroup[] = [
  'pastDueGroup',
  'todayGroup',
  'weekGroup',
  'laterGroup',
  'undatedGroup',
];
/** The calendar day `days` after `date`, as exact YYYY-MM-DD text. */
function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}
/**
 * Groups follow the server's due-date order; the browser's day only names
 * them: past due, today, the next six days, later and undated.
 */
export function dueGroup(dueDate: string | null, today: string): DueGroup {
  if (dueDate === null) return 'undatedGroup';
  if (dueDate < today) return 'pastDueGroup';
  if (dueDate === today) return 'todayGroup';
  return dueDate < addDays(today, 7) ? 'weekGroup' : 'laterGroup';
}

function MyTasksView(props: ClarteTaskViewProps) {
  const copy = useMyTasksCopy();
  const text = useClarteTasksCopy();
  const { formatNumber } = useInterfaceLocale();
  const { load, read } = useAssignedTasks(props);
  const panel = useTaskPanel(props, read);
  const today = browserDate();
  const groupId = useId();
  return (
    <section
      id="my-tasks"
      tabIndex={-1}
      className="clarte-tasks"
      aria-label={copy.title}
    >
      <Toolbar>
        <ClarteButton onClick={read}>
          <RotateCw aria-hidden="true" />
          {copy.refresh}
        </ClarteButton>
      </Toolbar>
      {load.kind === 'loading' && <ClarteLoadingState label={copy.loading} />}
      {load.kind === 'denied' && <ClarteErrorState title={copy.denied} />}
      {load.kind === 'error' && (
        <ClarteErrorState
          title={copy.error}
          action={<ClarteButton onClick={read}>{copy.retry}</ClarteButton>}
        />
      )}
      {load.kind === 'ready' && load.tasks.length === 0 && (
        <ClarteCard>
          <ClarteEmptyState title={copy.empty} />
        </ClarteCard>
      )}
      {load.kind === 'ready' &&
        dueGroups.map((group) => {
          const tasks = load.tasks.filter(
            (task) => dueGroup(task.dueDate, today) === group,
          );
          if (tasks.length === 0) return null;
          const headingId = `${groupId}-${group}`;
          return (
            <section
              key={group}
              className="clarte-task-group"
              data-group={group}
              aria-labelledby={headingId}
            >
              <h2 id={headingId} className="clarte-task-group-head">
                {text(group)}
                <span>{formatNumber(tasks.length)}</span>
              </h2>
              <div className="clarte-card clarte-task-card">
                <TaskList
                  label={`${copy.listLabel} · ${text(group)}`}
                  tasks={tasks}
                  showAssignee={false}
                  onSelect={panel.select}
                  onOpenInProject={
                    props.onOpenTask &&
                    ((task) =>
                      props.onOpenTask?.({
                        projectId: task.projectId,
                        taskId: task.id,
                      }))
                  }
                />
              </div>
            </section>
          );
        })}
      {panel.panel}
    </section>
  );
}

/** Tasks › Unassigned Tasks (#1542): open Tasks without a responsible member. */
export function ClarteUnassignedTasks(props: ClarteTaskViewProps) {
  return (
    <DiscoveryView
      key={taskDiscoveryAuthority('unassigned', props.actor)}
      {...props}
      kind="unassigned"
    />
  );
}

/** Tasks › Blocked Tasks (#1542): blocked Tasks with their reason, owner and due date. */
export function ClarteBlockedTasks(props: ClarteTaskViewProps) {
  return (
    <DiscoveryView
      key={taskDiscoveryAuthority('blocked', props.actor)}
      {...props}
      kind="blocked"
    />
  );
}

function DiscoveryView(
  props: ClarteTaskViewProps & { kind: TaskDiscoveryKind },
) {
  const unassignedMessage = useUnassignedTasksCopy();
  const blockedMessage = useBlockedTasksCopy();
  const message = props.kind === 'blocked' ? blockedMessage : unassignedMessage;
  const { load, offset, read } = useTaskDiscovery(props);
  const panel = useTaskPanel(props, () => read(offset));
  return (
    <section
      id={`${props.kind}-tasks`}
      tabIndex={-1}
      className="clarte-tasks"
      aria-label={message('title')}
    >
      <Toolbar>
        <ClarteButton onClick={() => read(0)}>
          <RotateCw aria-hidden="true" />
          {message('refresh')}
        </ClarteButton>
      </Toolbar>
      {load.kind === 'loading' && (
        <ClarteLoadingState label={message('loading')} />
      )}
      {load.kind === 'denied' && <ClarteErrorState title={message('denied')} />}
      {(load.kind === 'error' || load.kind === 'malformed') && (
        <ClarteErrorState
          title={message(load.kind)}
          action={
            <ClarteButton onClick={() => read(offset)}>
              {message('retry')}
            </ClarteButton>
          }
        />
      )}
      {load.kind === 'ready' &&
        (load.page.tasks.length === 0 ? (
          <ClarteCard>
            <div role="status">
              <ClarteEmptyState
                title={message(offset === 0 ? 'empty' : 'outOfRange')}
              />
            </div>
          </ClarteCard>
        ) : (
          <div className="clarte-card clarte-task-card">
            <TaskList
              label={message('list')}
              tasks={load.page.tasks}
              showAssignee={props.kind === 'blocked'}
              onSelect={panel.select}
              onOpenInProject={
                props.onOpenTask &&
                ((task) =>
                  props.onOpenTask?.({
                    projectId: task.projectId,
                    taskId: task.id,
                  }))
              }
            />
          </div>
        ))}
      <Pagination
        previous={message('previous')}
        next={message('next')}
        previousDisabled={
          offset === 0 || load.kind === 'loading' || load.kind === 'denied'
        }
        nextDisabled={
          load.kind !== 'ready' ||
          !load.page.hasNextPage ||
          offset > Number.MAX_SAFE_INTEGER - 25
        }
        onPrevious={() => read(Math.max(0, offset - 25))}
        onNext={() => read(offset + 25)}
      />
      {panel.panel}
    </section>
  );
}

function Pagination({
  previous,
  next,
  previousDisabled,
  nextDisabled,
  onPrevious,
  onNext,
}: Readonly<{
  previous: string;
  next: string;
  previousDisabled: boolean;
  nextDisabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
}>) {
  return (
    <div className="clarte-tasks-pagination">
      <ClarteButton
        size="small"
        disabled={previousDisabled}
        onClick={onPrevious}
      >
        <ChevronLeft aria-hidden="true" />
        {previous}
      </ClarteButton>
      <ClarteButton size="small" disabled={nextDisabled} onClick={onNext}>
        {next}
        <ChevronRight aria-hidden="true" />
      </ClarteButton>
    </div>
  );
}

type ClarteTeamTasksProps = ClarteTaskViewProps &
  Pick<
    TeamTasksProps,
    | 'onActorRevalidated'
    | 'onCompanyContextRejected'
    | 'onWorkspaceAccessRejected'
  >;

/**
 * Tasks › Team Tasks (#1542): the Company's accessible Tasks under the
 * existing criteria (state, responsibility, name, due dates), 25 per page.
 */
export function ClarteTeamTasks(props: ClarteTeamTasksProps) {
  const owner = useRequestLifetime(
    props.identity,
    teamTaskAuthority(props.actor),
  );
  return <TeamTasksView key={owner} {...props} />;
}

function TeamTasksView(props: ClarteTeamTasksProps) {
  const copy = useTeamTasksCopy();
  const native = useProjectTaskCopy();
  const text = useClarteTasksCopy();
  const { load, applied, busy, read, openTask } = useTeamTasks(props);
  const filters = applied.filters;
  const panel = useTaskPanel(
    props,
    () => read(filters, applied.offset),
    props.onOpenTask && openTask,
  );
  return (
    <section
      id="team-tasks"
      tabIndex={-1}
      className="clarte-tasks"
      aria-label={copy('title')}
    >
      <Toolbar>
        <ClarteButton disabled={busy} onClick={() => read(filters, 0)}>
          <RotateCw aria-hidden="true" />
          {copy('refresh')}
        </ClarteButton>
      </Toolbar>
      <ClarteCard title={text('filtersHeading')}>
        <div className="clarte-task-criteria">
          <TeamTaskCriteria pending={busy} onApply={(next) => read(next, 0)} />
        </div>
        <p className="clarte-task-applied" aria-label={copy('applied')}>
          <strong>{copy('applied')}: </strong>
          {filters.state === 'open' || filters.state === 'all'
            ? copy(filters.state)
            : native.states[filters.state]}{' '}
          · {copy(filters.responsibility)}
          {filters.assigneeName !== null && <> · {filters.assigneeName}</>}
          {filters.dueFrom !== null && (
            <>
              {' '}
              · {copy('dueFrom')}: {filters.dueFrom}
            </>
          )}
          {filters.dueThrough !== null && (
            <>
              {' '}
              · {copy('dueThrough')}: {filters.dueThrough}
            </>
          )}
        </p>
      </ClarteCard>
      {load.kind === 'loading' && (
        <ClarteLoadingState label={copy('loading')} />
      )}
      {load.kind === 'denied' && <ClarteErrorState title={copy('denied')} />}
      {(load.kind === 'error' || load.kind === 'malformed') && (
        <ClarteErrorState
          title={copy(load.kind)}
          action={
            <ClarteButton onClick={() => read(filters, applied.offset)}>
              {copy('retry')}
            </ClarteButton>
          }
        />
      )}
      {load.kind === 'ready' &&
        (load.page.tasks.length === 0 ? (
          <ClarteCard>
            <div role="status">
              <ClarteEmptyState
                title={copy(applied.offset === 0 ? 'empty' : 'outOfRange')}
              />
            </div>
          </ClarteCard>
        ) : (
          <div className="clarte-card clarte-task-card">
            <TaskList
              label={copy('list')}
              tasks={load.page.tasks}
              showAssignee
              onSelect={panel.select}
              onOpenInProject={
                props.onOpenTask &&
                ((task) =>
                  openTask({ projectId: task.projectId, taskId: task.id }))
              }
            />
          </div>
        ))}
      <Pagination
        previous={copy('previous')}
        next={copy('next')}
        previousDisabled={busy || applied.offset === 0}
        nextDisabled={
          load.kind !== 'ready' ||
          !load.page.hasNextPage ||
          applied.offset > Number.MAX_SAFE_INTEGER - 25
        }
        onPrevious={() => read(filters, Math.max(0, applied.offset - 25))}
        onNext={() => read(filters, applied.offset + 25)}
      />
      {panel.panel}
    </section>
  );
}
