import { useEffect, useId, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { TaskResults } from './TaskResults';
import type { ProjectStatus } from './project-lifecycle-response';
import { isOpenTaskState, taskMoves, taskStates } from './task-response';
import { useProjectTaskCopy } from './task.copy';
import { useInterfaceLocale } from '../localization/interface-locale';
import { Select } from '../presentation/Select';
import './task.css';
import { TaskPlanning } from './TaskPlanning';
import {
  TaskCalendarDate,
  TaskDeclarationFacts,
  TaskFieldsForm,
  TaskHistory,
  TaskReasonForm,
  formatTime,
} from './TaskPresentation';
import {
  assigneeFilterValue,
  boundText,
  everyDate,
  memberValuePrefix,
  projectTaskOwnerAuthority,
  readDateBound,
  useProjectTaskOwner,
  type DateBound,
  type RequestedTask,
} from './use-project-task-owner';

export type { RequestedTask } from './use-project-task-owner';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string | null;
  projectStatus: ProjectStatus | null;
  clientIdentityRevision?: number;
  onProjectChanged?: () => void | Promise<void>;
  onActivityRecorded?: () => void | Promise<void>;
  /** Opens this Task of the selected Project as choosing its row would; each new request id once. */
  requestedTask?: RequestedTask;
};
export function ProjectTasks(props: Props) {
  return (
    <TaskProjects key={projectTaskOwnerAuthority(props.actor)} {...props} />
  );
}
function TaskProjects(props: Props) {
  const [projects, setProjects] = useState<string[]>([]);
  const [statuses, setStatuses] = useState(new Map<string, ProjectStatus>());
  /** A request present when these Tasks mount was made under an earlier authority and never replays. */
  const retiredTaskRequest = useRef(props.requestedTask?.requestId);
  const requestedTask =
    props.requestedTask?.requestId === retiredTaskRequest.current
      ? undefined
      : props.requestedTask;
  useEffect(() => {
    setProjects(props.projectId ? [props.projectId] : []);
    setStatuses(new Map());
  }, [props.identity]);
  useEffect(() => {
    if (props.projectId) {
      const id = props.projectId;
      setProjects((current) =>
        current.includes(id) ? current : [...current, id],
      );
    }
  }, [props.projectId]);
  useEffect(() => {
    const projectId = props.projectId;
    const projectStatus = props.projectStatus;
    if (!projectId || !projectStatus) return;
    setStatuses((current) => {
      const next = new Map(current);
      next.set(projectId, projectStatus);
      return next;
    });
  }, [props.projectId, props.projectStatus]);
  return projects.map((projectId) => (
    <div key={projectId} hidden={props.projectId !== projectId}>
      <TaskProject
        {...props}
        projectId={projectId}
        active={props.projectId === projectId}
        projectStatus={statuses.get(projectId) ?? null}
        requestedTask={
          props.projectId === projectId ? requestedTask : undefined
        }
      />
    </div>
  ));
}
// A rejected day leaves the control empty, so its value can stay unchanged and produce no change event.
// Leaving the control always reports it, and the reader keeps the entry visible meanwhile.
function DateBoundField({
  label,
  bound,
  unusable,
  describedBy,
  onBound,
}: {
  label: string;
  bound: DateBound;
  unusable: boolean;
  describedBy: string;
  onBound: (bound: DateBound) => void;
}) {
  function read(event: { currentTarget: HTMLInputElement }) {
    onBound(readDateBound(event.currentTarget));
  }
  return (
    <label>
      <span>{label}</span>
      <input
        type="date"
        min="0001-01-01"
        max="9999-12-31"
        value={boundText(bound)}
        aria-invalid={unusable || undefined}
        aria-describedby={unusable ? describedBy : undefined}
        onChange={read}
        onBlur={read}
      />
    </label>
  );
}
function TaskProject(props: Props & { projectId: string; active: boolean }) {
  const {
    actor,
    identity,
    projectId,
    projectStatus,
    onProjectChanged,
    onActivityRecorded,
  } = props;
  const copy = useProjectTaskCopy();
  const { locale } = useInterfaceLocale();
  const dateRangeErrorId = useId();
  const {
    load,
    readOnlyRevision,
    selected,
    detail,
    current,
    draft,
    members,
    mutation,
    reasonDraft,
    setReasonDraft,
    feedback,
    taskSearch,
    setTaskSearch,
    taskFilter,
    setTaskFilter,
    assigneeFilter,
    assigneeOptions,
    selectAssigneeFilter,
    dateFilter,
    setDateFilter,
    selectDateFilter,
    unusableRange,
    visibleTasks,
    taskHeading,
    taskReads,
    canManage,
    projectClosed,
    busy,
    planningProtected,
    mutable,
    editable,
    captureActiveRecovery,
    setPlanningProtected,
    deny,
    open,
    refreshNativeAfterPlanning,
    run,
    save,
    choose,
    declare,
    updateDraft,
  } = useProjectTaskOwner(props);
  const { active, clientIdentityRevision = 0 } = props;
  return (
    <section
      aria-label={copy.title}
      className="project-tasks project-tasks--prisme"
    >
      <header className="task-header">
        <div>
          <h4>{copy.title}</h4>
          <p>{copy.warning}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void Promise.all([
              open(selected, { reload: true }),
              onProjectChanged?.(),
            ])
          }
        >
          {selected ? copy.reloadDetail : copy.reload}
        </button>
      </header>
      {canManage && load.kind !== 'denied' && (
        <TaskPlanning
          active={active}
          captureRecovery={captureActiveRecovery}
          disabled={
            mutation.kind === 'pending' || mutation.kind === 'uncertain'
          }
          projectClosed={projectClosed}
          taskReads={taskReads}
          nativeReadOnly={readOnlyRevision === clientIdentityRevision}
          onProtectionChange={setPlanningProtected}
          onDenied={deny}
          onReloaded={(mode) =>
            Promise.all([
              mode === 'confirmed' ? undefined : refreshNativeAfterPlanning(),
              onProjectChanged?.(),
            ]).then(() => undefined)
          }
          onConfirmed={async () => {
            await Promise.all([
              refreshNativeAfterPlanning(),
              onActivityRecorded?.(),
            ]);
          }}
        />
      )}
      {load.kind !== 'ready' && (
        <p role={load.kind === 'loading' ? 'status' : 'alert'}>
          {load.kind === 'loading'
            ? copy.loading
            : load.kind === 'denied'
              ? copy.denied
              : copy.error}
        </p>
      )}
      {load.kind === 'ready' && (
        <>
          {!mutable && (
            <p className="task-notice">
              {projectClosed ? copy.closedReadOnly : copy.immutable}
            </p>
          )}
          <div className="task-layout">
            <nav aria-label={copy.title}>
              {load.listing.tasks.length === 0 && <p>{copy.empty}</p>}
              {load.listing.tasks.length > 0 && (
                <>
                  <div className="task-filters">
                    <label>
                      <span>{copy.searchLabel}</span>
                      <input
                        type="search"
                        value={taskSearch}
                        onChange={(event) => setTaskSearch(event.target.value)}
                      />
                    </label>
                    <label htmlFor={`${dateRangeErrorId}-status-filter`}>
                      <span>{copy.statusFilterLabel}</span>
                      <Select
                        id={`${dateRangeErrorId}-status-filter`}
                        value={taskFilter}
                        options={[
                          { value: 'all', label: copy.all },
                          ...taskStates.map((state) => ({
                            value: state,
                            label: copy.states[state],
                          })),
                        ]}
                        onValueChange={(nextFilter) => {
                          if (nextFilter === 'all') setTaskFilter(nextFilter);
                          const state = taskStates.find(
                            (candidate) => candidate === nextFilter,
                          );
                          if (state) setTaskFilter(state);
                        }}
                      />
                    </label>
                    <label htmlFor={`${dateRangeErrorId}-assignee-filter`}>
                      <span>{copy.assigneeFilterLabel}</span>
                      <Select
                        id={`${dateRangeErrorId}-assignee-filter`}
                        value={assigneeFilterValue(assigneeFilter)}
                        options={[
                          { value: 'all', label: copy.allAssignees },
                          { value: 'unassigned', label: copy.unassigned },
                          ...[...assigneeOptions.values()].map((member) => ({
                            value: `${memberValuePrefix}${member.workspaceMembershipId}`,
                            label: member.displayLabel,
                          })),
                        ]}
                        onValueChange={(value) => selectAssigneeFilter(value)}
                      />
                    </label>
                    <label htmlFor={`${dateRangeErrorId}-date-filter`}>
                      <span>{copy.dateFilterLabel}</span>
                      <Select
                        id={`${dateRangeErrorId}-date-filter`}
                        value={dateFilter.kind}
                        options={[
                          { value: 'all', label: copy.allDates },
                          { value: 'undated', label: copy.withoutDate },
                          { value: 'range', label: copy.dateRange },
                        ]}
                        onValueChange={selectDateFilter}
                      />
                    </label>
                    {dateFilter.kind === 'range' && (
                      <>
                        <DateBoundField
                          label={copy.dateFrom}
                          bound={dateFilter.from}
                          unusable={unusableRange}
                          describedBy={dateRangeErrorId}
                          onBound={(from) =>
                            setDateFilter({ ...dateFilter, from })
                          }
                        />
                        <DateBoundField
                          label={copy.dateThrough}
                          bound={dateFilter.through}
                          unusable={unusableRange}
                          describedBy={dateRangeErrorId}
                          onBound={(through) =>
                            setDateFilter({ ...dateFilter, through })
                          }
                        />
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setDateFilter(everyDate)}
                    >
                      {copy.resetDateFilter}
                    </button>
                  </div>
                  {unusableRange && (
                    <p
                      className="task-date-error"
                      id={dateRangeErrorId}
                      role="alert"
                    >
                      {copy.dateRangeInvalid}
                    </p>
                  )}
                </>
              )}
              {load.listing.tasks.length > 0 && visibleTasks.length === 0 && (
                <p className="task-no-match">{copy.noMatch}</p>
              )}
              <ul className="task-list">
                {visibleTasks.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      disabled={busy}
                      aria-current={selected === task.id ? 'true' : undefined}
                      onClick={() => void open(task.id)}
                    >
                      {task.title}
                    </button>
                    <span className="task-status">
                      {copy.states[task.status]}
                    </span>
                    <span className="task-priority">
                      {copy.priority}: {copy.priorities[task.priority]}
                    </span>
                    <span>
                      {task.assignee?.displayLabel ?? copy.unassigned} ·{' '}
                      <TaskCalendarDate value={task.dueDate} />
                    </span>
                  </li>
                ))}
              </ul>
              {selected && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void open(null)}
                >
                  {canManage && mutable ? copy.newTask : copy.list}
                </button>
              )}
            </nav>
            <div className="task-panel">
              {detail?.kind === 'loading' && (
                <p role="status">{copy.loading}</p>
              )}
              {detail?.kind === 'error' && <p role="alert">{copy.error}</p>}
              {detail?.kind === 'missing' && <p role="alert">{copy.missing}</p>}
              {current && (
                <>
                  <h5 ref={taskHeading} tabIndex={-1}>
                    {current.task.title}
                  </h5>
                  <dl className="task-description">
                    <dt>{copy.description}</dt>
                    <dd>{current.task.description ?? copy.noDescription}</dd>
                  </dl>
                  <p className="task-status">
                    {copy.states[current.task.status]}
                  </p>
                  <dl className="task-facts">
                    <div>
                      <dt>{copy.assignee}</dt>
                      <dd>
                        {current.task.assignee?.displayLabel ?? copy.unassigned}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.dueDate}</dt>
                      <dd>
                        <TaskCalendarDate value={current.task.dueDate} />
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.priority}</dt>
                      <dd>{copy.priorities[current.task.priority]}</dd>
                    </div>
                    <div>
                      <dt>{copy.createdBy}</dt>
                      <dd>{current.task.createdBy.displayName}</dd>
                    </div>
                  </dl>
                  {current.task.status === 'done' && (
                    <p>
                      {copy.completion}{' '}
                      {current.task.completion.actor.displayName} {copy.at}{' '}
                      <time dateTime={current.task.completion.occurredAt}>
                        {formatTime(current.task.completion.occurredAt, locale)}
                      </time>
                    </p>
                  )}
                  {current.task.status === 'blocked' && (
                    <TaskDeclarationFacts
                      kind="blocked"
                      declaration={current.task.blockage}
                    />
                  )}
                  {current.task.status === 'cancelled' && (
                    <TaskDeclarationFacts
                      kind="cancelled"
                      declaration={current.task.cancellation}
                    />
                  )}
                </>
              )}
              {canManage &&
                mutable &&
                (!selected ||
                  (current && isOpenTaskState(current.task.status))) && (
                  <TaskFieldsForm
                    draft={draft}
                    descriptionInvalid={feedback === 'descriptionValidation'}
                    members={members}
                    current={current?.task ?? null}
                    disabled={!editable}
                    editing={selected !== null}
                    onChange={updateDraft}
                    onSubmit={save}
                  />
                )}
              {current && canManage && mutable && reasonDraft && (
                <TaskReasonForm
                  draft={reasonDraft}
                  onChange={(next) =>
                    setReasonDraft((previous) =>
                      previous ? { ...previous, ...next } : null,
                    )
                  }
                  onSubmit={declare}
                  onDismiss={() => setReasonDraft(null)}
                />
              )}
              {current && canManage && mutable && !reasonDraft && (
                <div
                  className="task-actions"
                  role="group"
                  aria-label={copy.actions}
                >
                  {taskMoves(current.task.status).map((move) => (
                    <button
                      key={move}
                      type="button"
                      disabled={mutation.kind !== 'idle' || planningProtected}
                      onClick={() => choose(current.task, move)}
                    >
                      {copy.moves[move]}
                    </button>
                  ))}
                </div>
              )}
              {current && <TaskHistory events={current.events} />}
            </div>
          </div>
        </>
      )}
      {feedback && <p role="status">{copy[feedback]}</p>}
      {selected && load.kind !== 'denied' && detail?.kind !== 'missing' && (
        <TaskResults
          active={active}
          actor={actor}
          identity={identity}
          taskId={selected}
          projectId={projectId}
          observedProjectStatus={projectStatus}
          observedTaskVersion={
            detail?.kind === 'ready' ? detail.task.version : undefined
          }
        />
      )}
      {mutation.kind === 'uncertain' && (
        <button type="button" onClick={() => void run(mutation.command)}>
          {copy.retry}
        </button>
      )}
    </section>
  );
}
