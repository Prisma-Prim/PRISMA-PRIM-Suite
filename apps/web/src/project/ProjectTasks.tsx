import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import {
  readAssignees,
  readTask,
  readTaskDetail,
  readTaskHistory,
  readTaskList,
  validTaskDate,
  type Assignee,
  type TaskEvent,
  type TaskView,
} from './task-response';
import { taskCopy as copy } from './task.copy';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import './task.css';
import {
  TaskFieldsForm,
  TaskHistory,
  formatTime,
  type Draft,
} from './TaskPresentation';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string | null;
  onActivityRecorded?: () => void | Promise<void>;
};
type Listing = ReturnType<typeof readTaskList>;
type Load =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; listing: Listing };
type Detail =
  | { kind: 'loading' | 'error' | 'missing' }
  | { kind: 'ready'; task: TaskView; mutable: boolean; events: TaskEvent[] };
type Command = { key: string } & (
  | {
      action: 'create';
      taskId: null;
      body: {
        title: string;
        assigneeMembershipId: string | null;
        dueDate: string | null;
      };
    }
  | {
      action: 'edit';
      taskId: string;
      body: {
        expectedVersion: number;
        title?: string;
        assigneeMembershipId?: string | null;
        dueDate?: string | null;
      };
    }
  | {
      action: 'complete' | 'reopen';
      taskId: string;
      body: { expectedVersion: number };
    }
);
type Mutation =
  | { kind: 'idle' | 'blocked' }
  | { kind: 'pending' | 'uncertain'; command: Command };
type TaskFilter = 'all' | TaskView['status'];
// Responsible members are matched by membership identity so homonymous members stay distinct.
type AssigneeFilter =
  | { kind: 'all' }
  | { kind: 'unassigned' }
  | { kind: 'member'; workspaceMembershipId: string };
// Bounds hold the raw control text; an empty bound is open and never a date.
type DateFilter =
  | { kind: 'all' }
  | { kind: 'undated' }
  | { kind: 'range'; from: string; through: string };
type ResolvedDateFilter =
  | { kind: 'all' }
  | { kind: 'undated' }
  | { kind: 'unusable' }
  | { kind: 'range'; from: string | null; through: string | null };
const emptyDraft: Draft = { title: '', assigneeMembershipId: '', dueDate: '' };
const everyAssignee: AssigneeFilter = { kind: 'all' };
const everyDate: DateFilter = { kind: 'all' };
const memberValuePrefix = 'member:';
function assigneeFilterValue(filter: AssigneeFilter): string {
  return filter.kind === 'member'
    ? `${memberValuePrefix}${filter.workspaceMembershipId}`
    : filter.kind;
}
function matchesAssignee(task: TaskView, filter: AssigneeFilter): boolean {
  switch (filter.kind) {
    case 'all':
      return true;
    case 'unassigned':
      return task.assignee === null;
    case 'member':
      return (
        task.assignee?.workspaceMembershipId === filter.workspaceMembershipId
      );
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}
function resolveDateFilter(filter: DateFilter): ResolvedDateFilter {
  if (filter.kind !== 'range') return filter;
  const from = filter.from === '' ? null : filter.from;
  const through = filter.through === '' ? null : filter.through;
  if (
    (from !== null && !validTaskDate(from)) ||
    (through !== null && !validTaskDate(through)) ||
    (from !== null && through !== null && from > through)
  )
    return { kind: 'unusable' };
  return { kind: 'range', from, through };
}
function matchesDate(task: TaskView, filter: ResolvedDateFilter): boolean {
  switch (filter.kind) {
    case 'all':
      return true;
    // An unusable range is reported to the reader instead of hiding rows behind one bound.
    case 'unusable':
      return true;
    case 'undated':
      return task.dueDate === null;
    // Exact YYYY-MM-DD values compare as text, so the inclusive bounds stay free of any timezone.
    case 'range':
      return (
        task.dueDate !== null &&
        (filter.from === null || task.dueDate >= filter.from) &&
        (filter.through === null || task.dueDate <= filter.through)
      );
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}

export function ProjectTasks(props: Props) {
  const { actor } = props;
  const authority = JSON.stringify([
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.active,
    actor.workspacePermissions,
    actor.activeCompany,
  ]);
  return <TaskProjects key={authority} {...props} />;
}
function TaskProjects(props: Props) {
  const [projects, setProjects] = useState<string[]>([]);
  useEffect(() => {
    setProjects(props.projectId ? [props.projectId] : []);
  }, [props.identity]);
  useEffect(() => {
    if (props.projectId) {
      const id = props.projectId;
      setProjects((current) =>
        current.includes(id) ? current : [...current, id],
      );
    }
  }, [props.projectId]);
  return projects.map((projectId) => (
    <div key={projectId} hidden={props.projectId !== projectId}>
      <TaskProject {...props} projectId={projectId} />
    </div>
  ));
}
class ReadFailure extends Error {
  constructor(readonly kind: 'denied' | 'error' | 'missing') {
    super(kind);
  }
}
function TaskProject({
  actor,
  identity,
  projectId,
  onActivityRecorded,
}: Props & { projectId: string }) {
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [members, setMembers] = useState<Assignee[] | null>(null);
  const [mutation, setMutation] = useState<Mutation>({ kind: 'idle' });
  const [feedback, setFeedback] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [assigneeFilter, setAssigneeFilter] =
    useState<AssigneeFilter>(everyAssignee);
  const [dateFilter, setDateFilter] = useState<DateFilter>(everyDate);
  const dateRangeErrorId = useId();
  const drafts = useRef(
    new Map<string, { version: number | null; draft: Draft }>(),
  );
  const request = useRef<AbortController | null>(null);
  const mutationRequest = useRef<AbortController | null>(null);
  const companyId = actor.activeCompany?.id ?? '';
  const scope = { companyId, projectId };
  const canRead =
    actor.active &&
    actor.activeCompany?.taskPermissionSetVersion === 'v1' &&
    !!actor.activeCompany.taskPermissionAssignmentId &&
    actor.activeCompany.taskPermissions?.includes('task.read') &&
    actor.activeCompany.projectPermissions?.includes('project.read') &&
    (actor.workspacePermissions.includes('client.manage') ||
      actor.activeCompany.clientPermissions?.includes('client.read'));
  const canManage =
    canRead && actor.activeCompany?.taskPermissions?.includes('task.manage');
  const busy = mutation.kind === 'pending';
  const current = detail?.kind === 'ready' ? detail : null;
  const mutable =
    current?.mutable ?? (load.kind === 'ready' && load.listing.mutable);
  const editable =
    canManage && mutable && mutation.kind === 'idle' && members !== null;
  const normalizedTaskSearch = taskSearch.trim().toLowerCase();
  const dateSelection = resolveDateFilter(dateFilter);
  const unusableRange = dateSelection.kind === 'unusable';
  const visibleTasks =
    load.kind === 'ready'
      ? load.listing.tasks.filter(
          (task) =>
            (taskFilter === 'all' || task.status === taskFilter) &&
            matchesAssignee(task, assigneeFilter) &&
            matchesDate(task, dateSelection) &&
            task.title.toLowerCase().includes(normalizedTaskSearch),
        )
      : [];
  // Options come only from the loaded rows the reader already sees, never from the eligible-member query.
  const assigneeOptions = new Map<string, Assignee>();
  if (load.kind === 'ready')
    for (const task of load.listing.tasks)
      if (
        task.assignee &&
        !assigneeOptions.has(task.assignee.workspaceMembershipId)
      )
        assigneeOptions.set(task.assignee.workspaceMembershipId, task.assignee);
  function selectAssigneeFilter(value: string) {
    if (value === 'all') setAssigneeFilter(everyAssignee);
    else if (value === 'unassigned') setAssigneeFilter({ kind: 'unassigned' });
    else if (value.startsWith(memberValuePrefix)) {
      const workspaceMembershipId = value.slice(memberValuePrefix.length);
      if (assigneeOptions.has(workspaceMembershipId))
        setAssigneeFilter({ kind: 'member', workspaceMembershipId });
    }
  }
  function selectDateFilter(value: string) {
    if (value === 'all') setDateFilter(everyDate);
    else if (value === 'undated') setDateFilter({ kind: 'undated' });
    // Leaving the range discards its bounds, so a reopened range never reuses a hidden selection.
    else if (value === 'range')
      setDateFilter({ kind: 'range', from: '', through: '' });
  }

  async function resultValue(
    result: ApiResult<unknown>,
    notFound: 'denied' | 'missing' = 'denied',
  ): Promise<unknown> {
    if (result.status === 'unauthorized') {
      await identity.rejectSession();
      throw new ReadFailure('denied');
    }
    if (result.status === 'forbidden') throw new ReadFailure('denied');
    if (result.status === 'notFound') throw new ReadFailure(notFound);
    if (result.status !== 'ok') throw new ReadFailure('error');
    return result.value;
  }
  function deny() {
    setLoad({ kind: 'denied' });
    setDetail(null);
    setMembers(null);
    setDraft(emptyDraft);
    setFeedback('');
    setMutation({ kind: 'blocked' });
  }
  async function refresh(taskId: string | null, controller: AbortController) {
    const api = await createAuthenticatedApiClient(identity);
    if (controller.signal.aborted) return;
    const options = { companyContextId: companyId, signal: controller.signal };
    const listingResult = await api.request<unknown>(
      `/projects/${encodeURIComponent(projectId)}/tasks`,
      options,
    );
    if (controller.signal.aborted) return;
    const listing = readTaskList(await resultValue(listingResult), scope);
    let nextDetail: Detail | null = null;
    if (taskId) {
      const [taskResult, historyResult] = await Promise.all([
        api.request<unknown>(`/tasks/${encodeURIComponent(taskId)}`, options),
        api.request<unknown>(
          `/tasks/${encodeURIComponent(taskId)}/history`,
          options,
        ),
      ]);
      if (controller.signal.aborted) return;
      try {
        const task = readTaskDetail(
          await resultValue(taskResult, 'missing'),
          scope,
          taskId,
        );
        const events = readTaskHistory(
          await resultValue(historyResult, 'missing'),
          scope,
          taskId,
        );
        nextDetail = { kind: 'ready', ...task, events };
      } catch (error: unknown) {
        if (!(error instanceof ReadFailure) || error.kind !== 'missing')
          throw error;
        nextDetail = { kind: 'missing' };
      }
    }
    if (controller.signal.aborted) return;
    setLoad({ kind: 'ready', listing });
    // A member the authoritative listing no longer references cannot stay selected.
    setAssigneeFilter((previous) =>
      previous.kind === 'member' &&
      !listing.tasks.some(
        (task) =>
          task.assignee?.workspaceMembershipId ===
          previous.workspaceMembershipId,
      )
        ? everyAssignee
        : previous,
    );
    setDetail(nextDetail);
    const saved = drafts.current.get(taskId ?? 'create');
    const task = nextDetail?.kind === 'ready' ? nextDetail.task : null;
    setDraft(
      saved && saved.version === (task?.version ?? null)
        ? saved.draft
        : task
          ? {
              title: task.title,
              assigneeMembershipId: task.assignee?.workspaceMembershipId ?? '',
              dueDate: task.dueDate ?? '',
            }
          : emptyDraft,
    );
    setMembers(null);
    if (
      canManage &&
      listing.mutable &&
      (!nextDetail || (nextDetail.kind === 'ready' && nextDetail.mutable))
    ) {
      try {
        const result = await api.request<unknown>(
          `/projects/${encodeURIComponent(projectId)}/eligible-task-assignees`,
          options,
        );
        if (controller.signal.aborted) return;
        setMembers(readAssignees(await resultValue(result)));
      } catch (error: unknown) {
        if (error instanceof ReadFailure && error.kind === 'denied')
          throw error;
        if (!controller.signal.aborted) setFeedback(copy.membersError);
      }
    }
  }
  async function open(
    taskId: string | null,
    options: { reload?: boolean } = {},
  ) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSelected(taskId);
    setDetail(taskId ? { kind: 'loading' } : null);
    setDraft(emptyDraft);
    setMembers(null);
    if (mutation.kind !== 'uncertain') setFeedback('');
    if (options.reload) {
      drafts.current.delete(taskId ?? 'create');
      setMutation((previous) =>
        previous.kind === 'blocked' ? { kind: 'idle' } : previous,
      );
    }
    if (!canRead || !companyId) {
      deny();
      return;
    }
    setLoad({ kind: 'loading' });
    try {
      await refresh(taskId, controller);
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      if (error instanceof ReadFailure && error.kind === 'denied') deny();
      else {
        setLoad({ kind: 'error' });
        setDetail(taskId ? { kind: 'error' } : null);
      }
    }
  }
  useEffect(() => {
    drafts.current.clear();
    setMutation({ kind: 'idle' });
    void open(null);
    return () => {
      request.current?.abort();
      mutationRequest.current?.abort();
    };
  }, [identity]);

  async function run(command: Command) {
    request.current?.abort();
    mutationRequest.current?.abort();
    const controller = new AbortController();
    mutationRequest.current = controller;
    setMutation({ kind: 'pending', command });
    setFeedback('');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const path =
        command.action === 'create'
          ? `/projects/${encodeURIComponent(projectId)}/tasks`
          : `/tasks/${encodeURIComponent(command.taskId)}${command.action === 'edit' ? '' : `/${command.action}`}`;
      const result = await api.request<unknown>(path, {
        companyContextId: companyId,
        signal: controller.signal,
        method: command.action === 'edit' ? 'PATCH' : 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.key,
        },
        body: JSON.stringify(command.body),
      });
      if (controller.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        deny();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        deny();
        return;
      }
      if (result.status === 'conflict' || result.status === 'validation') {
        setFeedback(
          result.status === 'conflict' ? copy.conflict : copy.rejected,
        );
        setMutation({ kind: 'blocked' });
        return;
      }
      if (result.status !== 'ok') throw new Error('Unconfirmed Task command');
      const receipt = readTask(result.value, scope);
      if (command.taskId !== null && receipt.id !== command.taskId)
        throw new Error('Invalid Task receipt');
      drafts.current.delete(command.taskId ?? 'create');
      setFeedback(copy.confirmed);
      setMutation({ kind: 'blocked' });
      setSelected(receipt.id);
      setDetail({ kind: 'loading' });
      setLoad({ kind: 'loading' });
      // A replay receipt is historical. Only fresh detail and history authorize subsequent changes.
      try {
        await refresh(receipt.id, controller);
        if (!controller.signal.aborted) setMutation({ kind: 'idle' });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        if (error instanceof ReadFailure && error.kind === 'denied') deny();
        else {
          setLoad({ kind: 'error' });
          setDetail({ kind: 'error' });
        }
      }
      if (!controller.signal.aborted) {
        try {
          await onActivityRecorded?.();
        } catch {
          /* A failed Activity Log refresh does not undo a confirmed Task command. */
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        setFeedback(copy.uncertain);
        setMutation({ kind: 'uncertain', command });
      }
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    const title = draft.title.trim();
    if (
      !title ||
      title.length > 200 ||
      (draft.dueDate && !validTaskDate(draft.dueDate))
    ) {
      setFeedback(copy.validation);
      return;
    }
    const body = {
      title,
      assigneeMembershipId: draft.assigneeMembershipId || null,
      dueDate: draft.dueDate || null,
    };
    if (selected && current?.task.status === 'todo')
      void run({
        key: crypto.randomUUID(),
        action: 'edit',
        taskId: selected,
        body: {
          expectedVersion: current.task.version,
          ...(body.title !== current.task.title ? { title: body.title } : {}),
          ...(body.assigneeMembershipId !==
          (current.task.assignee?.workspaceMembershipId ?? null)
            ? { assigneeMembershipId: body.assigneeMembershipId }
            : {}),
          ...(body.dueDate !== current.task.dueDate
            ? { dueDate: body.dueDate }
            : {}),
        },
      });
    else if (!selected)
      void run({
        key: crypto.randomUUID(),
        action: 'create',
        taskId: null,
        body,
      });
  }
  function updateDraft(next: Draft) {
    drafts.current.set(selected ?? 'create', {
      version: current?.task.version ?? null,
      draft: next,
    });
    setDraft(next);
  }
  return (
    <section
      aria-label={copy.title}
      className={`project-tasks${isPrisme ? ' project-tasks--prisme' : ''}`}
    >
      <header className="task-header">
        <div>
          <h4>{copy.title}</h4>
          <p>{copy.warning}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void open(selected, { reload: true })}
        >
          {selected ? copy.reloadDetail : copy.reload}
        </button>
      </header>
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
          {!mutable && <p className="task-notice">{copy.immutable}</p>}
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
                    <label>
                      <span>{copy.statusFilterLabel}</span>
                      <select
                        value={taskFilter}
                        onChange={(event) => {
                          const nextFilter = event.target.value;
                          if (
                            nextFilter === 'all' ||
                            nextFilter === 'todo' ||
                            nextFilter === 'done'
                          )
                            setTaskFilter(nextFilter);
                        }}
                      >
                        <option value="all">{copy.all}</option>
                        <option value="todo">{copy.todo}</option>
                        <option value="done">{copy.completedFilter}</option>
                      </select>
                    </label>
                    <label>
                      <span>{copy.assigneeFilterLabel}</span>
                      <select
                        value={assigneeFilterValue(assigneeFilter)}
                        onChange={(event) =>
                          selectAssigneeFilter(event.target.value)
                        }
                      >
                        <option value="all">{copy.all}</option>
                        <option value="unassigned">{copy.unassigned}</option>
                        {[...assigneeOptions.values()].map((member) => (
                          <option
                            key={member.workspaceMembershipId}
                            value={`${memberValuePrefix}${member.workspaceMembershipId}`}
                          >
                            {member.displayLabel}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{copy.dateFilterLabel}</span>
                      <select
                        value={dateFilter.kind}
                        onChange={(event) =>
                          selectDateFilter(event.target.value)
                        }
                      >
                        <option value="all">{copy.allDates}</option>
                        <option value="undated">{copy.withoutDate}</option>
                        <option value="range">{copy.dateRange}</option>
                      </select>
                    </label>
                    {dateFilter.kind === 'range' && (
                      <>
                        <label>
                          <span>{copy.dateFrom}</span>
                          <input
                            type="date"
                            min="0001-01-01"
                            max="9999-12-31"
                            value={dateFilter.from}
                            aria-invalid={unusableRange || undefined}
                            aria-describedby={
                              unusableRange ? dateRangeErrorId : undefined
                            }
                            onChange={(event) =>
                              setDateFilter({
                                ...dateFilter,
                                from: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>{copy.dateThrough}</span>
                          <input
                            type="date"
                            min="0001-01-01"
                            max="9999-12-31"
                            value={dateFilter.through}
                            aria-invalid={unusableRange || undefined}
                            aria-describedby={
                              unusableRange ? dateRangeErrorId : undefined
                            }
                            onChange={(event) =>
                              setDateFilter({
                                ...dateFilter,
                                through: event.target.value,
                              })
                            }
                          />
                        </label>
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
                      {task.status === 'todo' ? copy.todo : copy.done}
                    </span>
                    <span>
                      {task.assignee?.displayLabel ?? copy.unassigned} ·{' '}
                      {task.dueDate ?? copy.noDate}
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
                  <h5>{current.task.title}</h5>
                  <p className="task-status">
                    {current.task.status === 'todo' ? copy.todo : copy.done}
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
                      <dd>{current.task.dueDate ?? copy.noDate}</dd>
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
                        {formatTime(current.task.completion.occurredAt)}
                      </time>
                    </p>
                  )}
                </>
              )}
              {canManage &&
                mutable &&
                (!selected || current?.task.status === 'todo') && (
                  <TaskFieldsForm
                    draft={draft}
                    members={members}
                    current={current?.task ?? null}
                    disabled={!editable}
                    editing={selected !== null}
                    onChange={updateDraft}
                    onSubmit={save}
                  />
                )}
              {current && canManage && mutable && (
                <button
                  type="button"
                  disabled={mutation.kind !== 'idle'}
                  onClick={() =>
                    void run({
                      key: crypto.randomUUID(),
                      taskId: current.task.id,
                      action:
                        current.task.status === 'todo' ? 'complete' : 'reopen',
                      body: { expectedVersion: current.task.version },
                    })
                  }
                >
                  {current.task.status === 'todo' ? copy.complete : copy.reopen}
                </button>
              )}
              {current && <TaskHistory events={current.events} />}
            </div>
          </div>
        </>
      )}
      {feedback && <p role="status">{feedback}</p>}
      {mutation.kind === 'uncertain' && (
        <button type="button" onClick={() => void run(mutation.command)}>
          {copy.retry}
        </button>
      )}
    </section>
  );
}
