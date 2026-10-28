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
import { TaskResults } from './TaskResults';
import { projectTaskCompanyAuthority } from './project-authority';
import {
  conflictCode,
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import {
  isClosedProjectStatus,
  type ProjectStatus,
} from './project-lifecycle-response';
import {
  isOpenTaskState,
  readAssignees,
  readTask,
  readTaskDetail,
  readTaskHistory,
  readTaskList,
  taskMoves,
  taskStates,
  validTaskDate,
  validTaskReason,
  type Assignee,
  type TaskEvent,
  type TaskMove,
  type TaskPriority,
  type TaskState,
  type TaskView,
} from './task-response';
import { useProjectTaskCopy } from './task.copy';
import { useInterfaceLocale } from '../localization/interface-locale';
import { ApplicationPresentation } from '../production-shell/application-presentation';
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
  type Draft,
  type ReasonDraft,
} from './TaskPresentation';

/** A requested open of one Task of the selected Project. */
export type RequestedTask = {
  taskId: string;
  requestId: number;
  focus?: 'task';
  /** Optional originating Client-preview lifetime; never a mutation signal. */
  sourceSignal?: AbortSignal;
};
type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string | null;
  projectStatus: ProjectStatus | null;
  onProjectChanged?: () => void | Promise<void>;
  onActivityRecorded?: () => void | Promise<void>;
  /** Opens this Task of the selected Project as choosing its row would; each new request id once. */
  requestedTask?: RequestedTask;
};
type Listing = ReturnType<typeof readTaskList>;
type Load =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; listing: Listing };
type Detail =
  | { kind: 'loading' | 'error' | 'missing' }
  | {
      kind: 'ready';
      task: TaskView;
      mutable: boolean;
      events: TaskEvent[];
      requestedOpenId?: number;
    };
type Command = { key: string } & (
  | {
      action: 'create';
      taskId: null;
      body: {
        title: string;
        assigneeMembershipId: string | null;
        dueDate: string | null;
        priority: TaskPriority;
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
        priority?: TaskPriority;
      };
    }
  | {
      action: 'complete' | 'reopen';
      taskId: string;
      body: { expectedVersion: number };
    }
  | {
      action: 'status';
      taskId: string;
      body:
        | { expectedVersion: number; status: 'todo' | 'in_progress' }
        | { expectedVersion: number; status: 'blocked'; reason: string };
    }
  | {
      action: 'cancel';
      taskId: string;
      body: { expectedVersion: number; reason: string };
    }
);
type Mutation =
  | { kind: 'idle' | 'blocked' }
  | { kind: 'pending' | 'uncertain'; command: Command };
type TaskFeedback =
  | 'membersError'
  | 'closedRefusal'
  | 'conflict'
  | 'rejected'
  | 'confirmed'
  | 'uncertain'
  | 'validation';
type TaskFilter = 'all' | TaskState;

function taskFilterText(value: string) {
  // Fold Romanian spelling only; other distinctions such as й/и remain intact.
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[ăâ]/gu, 'a')
    .replace(/î/gu, 'i')
    .replace(/[șş]/gu, 's')
    .replace(/[țţ]/gu, 't');
}

// Responsible members are matched by membership identity so homonymous members stay distinct.
type AssigneeFilter =
  | { kind: 'all' }
  | { kind: 'unassigned' }
  | { kind: 'member'; workspaceMembershipId: string };
// A calendar control clears an impossible day such as 30 February, so a cleared bound alone cannot
// tell an open bound from a rejected one. Each bound keeps that distinction explicitly.
type DateBound =
  { kind: 'open' } | { kind: 'date'; value: string } | { kind: 'invalid' };
type DateFilter =
  | { kind: 'all' }
  | { kind: 'undated' }
  | { kind: 'range'; from: DateBound; through: DateBound };
type ResolvedDateFilter =
  | { kind: 'all' }
  | { kind: 'undated' }
  | { kind: 'unusable' }
  | { kind: 'range'; from: string | null; through: string | null };
const emptyDraft: Draft = {
  title: '',
  assigneeMembershipId: '',
  dueDate: '',
  priority: 'normal',
};
const everyAssignee: AssigneeFilter = { kind: 'all' };
const everyDate: DateFilter = { kind: 'all' };
const openBound: DateBound = { kind: 'open' };
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
// The control reports a rejected calendar day as bad input with an empty value, so that flag is the
// only evidence it was entered. Every other bound text is proved here, once, at the control.
function readDateBound(input: HTMLInputElement): DateBound {
  if (input.validity.badInput) return { kind: 'invalid' };
  if (input.value === '') return openBound;
  return validTaskDate(input.value)
    ? { kind: 'date', value: input.value }
    : { kind: 'invalid' };
}
function boundText(bound: DateBound): string {
  return bound.kind === 'date' ? bound.value : '';
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
function resolveDateFilter(filter: DateFilter): ResolvedDateFilter {
  if (filter.kind !== 'range') return filter;
  if (filter.from.kind === 'invalid' || filter.through.kind === 'invalid')
    return { kind: 'unusable' };
  const from = filter.from.kind === 'date' ? filter.from.value : null;
  const through = filter.through.kind === 'date' ? filter.through.value : null;
  if (from !== null && through !== null && from > through)
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
    projectTaskCompanyAuthority(actor.activeCompany),
  ]);
  return <TaskProjects key={authority} {...props} />;
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
class ReadFailure extends Error {
  constructor(readonly kind: 'denied' | 'error' | 'missing') {
    super(kind);
  }
}
function TaskProject({
  actor,
  identity,
  projectId,
  projectStatus,
  onProjectChanged,
  onActivityRecorded,
  requestedTask,
  active,
}: Props & { projectId: string; active: boolean }) {
  const copy = useProjectTaskCopy();
  const { locale } = useInterfaceLocale();
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [members, setMembers] = useState<Assignee[] | null>(null);
  const [mutation, setMutation] = useState<Mutation>({ kind: 'idle' });
  const [planningProtected, setPlanningProtected] = useState(false);
  const [reasonDraft, setReasonDraft] = useState<
    (ReasonDraft & { taskId: string; version: number }) | null
  >(null);
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null);
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
  /** The latest requested open already applied. */
  const consumedTaskRequest = useRef<number | undefined>(undefined);
  const readIdentity = useRef(identity);
  const taskHeading = useRef<HTMLHeadingElement>(null);
  const focusedTaskRequest = useRef<number | undefined>(undefined);
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
  const projectClosed =
    projectStatus !== null && isClosedProjectStatus(projectStatus);
  const busy = mutation.kind === 'pending' || planningProtected;
  const current = detail?.kind === 'ready' ? detail : null;
  const mutable =
    !projectClosed &&
    (current?.mutable ?? (load.kind === 'ready' && load.listing.mutable));
  const editable =
    canManage &&
    mutable &&
    mutation.kind === 'idle' &&
    members !== null &&
    !planningProtected;
  const normalizedTaskSearch = taskFilterText(taskSearch.trim());
  const dateSelection = resolveDateFilter(dateFilter);
  const unusableRange = dateSelection.kind === 'unusable';
  const visibleTasks =
    load.kind === 'ready'
      ? load.listing.tasks.filter(
          (task) =>
            (taskFilter === 'all' || task.status === taskFilter) &&
            matchesAssignee(task, assigneeFilter) &&
            matchesDate(task, dateSelection) &&
            taskFilterText(task.title).includes(normalizedTaskSearch),
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
      setDateFilter({ kind: 'range', from: openBound, through: openBound });
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
    setReasonDraft(null);
    setFeedback(null);
    setMutation({ kind: 'blocked' });
  }
  async function refresh(
    taskId: string | null,
    controller: AbortController,
    read: { requestedOpenId?: number; onTargetReady?: () => void } = {},
  ) {
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
        nextDetail = {
          kind: 'ready',
          ...task,
          events,
          requestedOpenId: read.requestedOpenId,
        };
      } catch (error: unknown) {
        if (!(error instanceof ReadFailure) || error.kind !== 'missing')
          throw error;
        nextDetail = { kind: 'missing' };
      }
    }
    if (controller.signal.aborted) return;
    // Stable target facts are resolved here. An auxiliary member lookup stays
    // under this owner's authority and must not prolong the originating preview.
    read.onTargetReady?.();
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
    // A grouped refresh preserves an independent explanation only while its exact native Task is unchanged.
    setReasonDraft((previous) =>
      previous &&
      listing.mutable &&
      !projectClosed &&
      nextDetail?.kind === 'ready' &&
      nextDetail.mutable &&
      previous.taskId === nextDetail.task.id &&
      previous.version === nextDetail.task.version
        ? previous
        : null,
    );
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
              priority: task.priority,
            }
          : emptyDraft,
    );
    setMembers(null);
    if (
      canManage &&
      !projectClosed &&
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
        if (!controller.signal.aborted) setFeedback('membersError');
      }
    }
  }
  async function open(
    taskId: string | null,
    options: {
      reload?: boolean;
      requestedOpenId?: number;
      sourceSignal?: AbortSignal;
      preserveReasonDraft?: boolean;
    } = {},
  ) {
    if (options.sourceSignal?.aborted) return;
    const previousLoad = load;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSelected(taskId);
    setDetail(taskId ? { kind: 'loading' } : null);
    setDraft(emptyDraft);
    if (!options.preserveReasonDraft) setReasonDraft(null);
    setMembers(null);
    if (mutation.kind !== 'uncertain') setFeedback(null);
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
    const retireSourceRead = () => {
      controller.abort();
      if (request.current === controller) {
        request.current = null;
        setSelected(null);
        setDetail(null);
        setLoad(
          previousLoad.kind === 'ready' ? previousLoad : { kind: 'error' },
        );
      }
    };
    options.sourceSignal?.addEventListener('abort', retireSourceRead, {
      once: true,
    });
    const stopSourceRetirement = () =>
      options.sourceSignal?.removeEventListener('abort', retireSourceRead);
    setLoad({ kind: 'loading' });
    try {
      await refresh(taskId, controller, {
        requestedOpenId: options.requestedOpenId,
        onTargetReady: stopSourceRetirement,
      });
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      if (error instanceof ReadFailure && error.kind === 'denied') deny();
      else {
        setLoad({ kind: 'error' });
        setDetail(taskId ? { kind: 'error' } : null);
      }
    } finally {
      stopSourceRetirement();
    }
  }
  useEffect(() => {
    // Effect replay cancels the first requested read before it can finish.
    // A genuinely replaced identity keeps that request consumed permanently.
    if (readIdentity.current === identity && request.current?.signal.aborted)
      consumedTaskRequest.current = undefined;
    readIdentity.current = identity;
    drafts.current.clear();
    setMutation({ kind: 'idle' });
    void open(null);
    return () => {
      request.current?.abort();
      mutationRequest.current?.abort();
    };
  }, [identity]);
  // A requested open is the same open as choosing the Task's row, so it
  // supersedes a read still loading, including the first list read. A pending
  // command is never aborted: the open waits for its outcome and, once
  // confirmed, for the read of its result, so neither overwrites the other.
  const commandSettling =
    planningProtected ||
    mutation.kind === 'pending' ||
    (mutation.kind === 'blocked' && load.kind === 'loading');
  useEffect(() => {
    if (
      !requestedTask ||
      requestedTask.requestId === consumedTaskRequest.current ||
      commandSettling
    )
      return;
    consumedTaskRequest.current = requestedTask.requestId;
    if (requestedTask.sourceSignal?.aborted) return;
    void open(requestedTask.taskId, {
      requestedOpenId: requestedTask.requestId,
      sourceSignal: requestedTask.sourceSignal,
    });
  }, [requestedTask, commandSettling]);
  // The section keeps ordinary Task-opening focus. Only an explicit Task-focus
  // intent moves the final destination after its current-authority read is ready.
  // Reloads/locales never replay it; a newer open or unmount cancels it.
  useEffect(() => {
    if (
      !requestedTask ||
      requestedTask.focus !== 'task' ||
      detail?.kind !== 'ready' ||
      detail.requestedOpenId !== requestedTask.requestId ||
      detail.task.id !== requestedTask.taskId ||
      focusedTaskRequest.current === requestedTask.requestId
    )
      return;
    const frame = window.requestAnimationFrame(() => {
      const heading = taskHeading.current;
      if (!heading?.isConnected) return;
      focusedTaskRequest.current = requestedTask.requestId;
      heading.scrollIntoView?.({ block: 'start' });
      heading.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [detail, requestedTask]);

  async function run(command: Command) {
    request.current?.abort();
    mutationRequest.current?.abort();
    const controller = new AbortController();
    mutationRequest.current = controller;
    setMutation({ kind: 'pending', command });
    setFeedback(null);
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
        if (
          result.status === 'conflict' &&
          conflictCode(result) === 'project_closed'
        ) {
          setFeedback('closedRefusal');
          setMutation({ kind: 'blocked' });
          return;
        }
        setFeedback(result.status === 'conflict' ? 'conflict' : 'rejected');
        setMutation({ kind: 'blocked' });
        return;
      }
      if (result.status !== 'ok') throw new Error('Unconfirmed Task command');
      const receipt = readTask(result.value, scope);
      if (command.taskId !== null && receipt.id !== command.taskId)
        throw new Error('Invalid Task receipt');
      // A confirmed move between open states changes no field, so a draft kept at the move's
      // expected version stays useful at the version the move produced. A later change still
      // discards it on the next read; every other confirmed command consumes the draft.
      const saved = drafts.current.get(command.taskId ?? 'create');
      if (
        command.action === 'status' &&
        saved?.version === command.body.expectedVersion &&
        receipt.version === command.body.expectedVersion + 1
      )
        drafts.current.set(command.taskId, {
          version: receipt.version,
          draft: saved.draft,
        });
      else drafts.current.delete(command.taskId ?? 'create');
      setFeedback('confirmed');
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
        setFeedback('uncertain');
        setMutation({ kind: 'uncertain', command });
      }
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (planningProtected) return;
    const title = draft.title.trim();
    if (
      !title ||
      title.length > 200 ||
      (draft.dueDate && !validTaskDate(draft.dueDate))
    ) {
      setFeedback('validation');
      return;
    }
    const body = {
      title,
      assigneeMembershipId: draft.assigneeMembershipId || null,
      dueDate: draft.dueDate || null,
      priority: draft.priority,
    };
    if (selected && current && isOpenTaskState(current.task.status))
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
          ...(body.priority !== current.task.priority
            ? { priority: body.priority }
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
  function choose(task: TaskView, move: TaskMove) {
    if (planningProtected) return;
    const taskId = task.id;
    const expectedVersion = task.version;
    const key = crypto.randomUUID();
    switch (move) {
      case 'blocked':
      case 'cancelled':
        setReasonDraft({
          kind: move,
          text: '',
          invalid: false,
          taskId,
          version: expectedVersion,
        });
        return;
      case 'todo':
      case 'in_progress':
        void run({
          key,
          action: 'status',
          taskId,
          body: { expectedVersion, status: move },
        });
        return;
      case 'done':
        void run({
          key,
          action: 'complete',
          taskId,
          body: { expectedVersion },
        });
        return;
      case 'reopen':
        void run({ key, action: 'reopen', taskId, body: { expectedVersion } });
        return;
      default: {
        const exhaustive: never = move;
        return exhaustive;
      }
    }
  }
  function declare(event: FormEvent) {
    event.preventDefault();
    if (planningProtected) return;
    if (!current || !reasonDraft || mutation.kind !== 'idle') return;
    if (!validTaskReason(reasonDraft.text)) {
      setReasonDraft({ ...reasonDraft, invalid: true });
      return;
    }
    const reason = reasonDraft.text.trim();
    const taskId = current.task.id;
    const expectedVersion = current.task.version;
    setReasonDraft(null);
    void run(
      reasonDraft.kind === 'blocked'
        ? {
            key: crypto.randomUUID(),
            action: 'status',
            taskId,
            body: { expectedVersion, status: 'blocked', reason },
          }
        : {
            key: crypto.randomUUID(),
            action: 'cancel',
            taskId,
            body: { expectedVersion, reason },
          },
    );
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
          identity={identity}
          companyId={companyId}
          projectId={projectId}
          disabled={
            mutation.kind === 'pending' || mutation.kind === 'uncertain'
          }
          projectClosed={projectClosed}
          onProtectionChange={setPlanningProtected}
          onDenied={deny}
          onReloaded={() =>
            Promise.all([
              open(selected, { preserveReasonDraft: true }),
              onProjectChanged?.(),
            ]).then(() => undefined)
          }
          onConfirmed={() => onActivityRecorded?.()}
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
      {active &&
        selected &&
        load.kind !== 'denied' &&
        detail?.kind !== 'missing' && (
          <TaskResults
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
