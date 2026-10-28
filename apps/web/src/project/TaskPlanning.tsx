import {
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { Select } from '../presentation/Select';
import { isProject } from './project-directory';
import { isClosedProjectStatus } from './project-lifecycle-response';
import { useProjectTaskCopy } from './task.copy';
import { useTaskPlanningCopy } from './task-planning.copy';
import {
  readTaskPlanningReceipt,
  type PlanningAttempt,
} from './task-planning-response';
import {
  isOpenTaskState,
  readAssignees,
  readTaskList,
  validTaskDate,
  type Assignee,
  type TaskView,
} from './task-response';
import './task-planning.css';

type Props = {
  identity: BrowserIdentity;
  companyId: string;
  projectId: string;
  disabled: boolean;
  projectClosed: boolean;
  onProtectionChange: (protectedIntent: boolean) => void;
  onConfirmed: () => void | Promise<void>;
  onReloaded: () => void | Promise<void>;
  onDenied: () => void;
};
type Load =
  | { kind: 'idle' | 'loading' | 'error' }
  | { kind: 'ready'; tasks: TaskView[]; availability: PlanningAvailability };
type PlanningAvailability =
  { kind: 'mutable'; members: Assignee[] } | { kind: 'closed' | 'historical' };
type Selected = {
  task: TaskView;
  assigneeMembershipId: string;
  dueDate: string;
};
type Mutation =
  | { kind: 'idle' | 'blocked' | 'settling' }
  | { kind: 'pending' | 'uncertain'; attempt: PlanningAttempt };
type Feedback =
  'saved' | 'uncertain' | 'conflict' | 'validation' | 'rejected' | 'missing';

/** The native Project/Task authority key owns this consumer; each identity change also permanently retires its I/O. */
export function TaskPlanning(props: Props) {
  const copy = useTaskPlanningCopy(),
    taskCopy = useProjectTaskCopy();
  const [expanded, setExpanded] = useState(false),
    [load, setLoad] = useState<Load>({ kind: 'idle' }),
    [selected, setSelected] = useState<Selected[]>([]),
    [mutation, setMutation] = useState<Mutation>({ kind: 'idle' }),
    [feedback, setFeedback] = useState<Feedback | null>(null);
  const id = useId(),
    heading = useRef<HTMLHeadingElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const readRequest = useRef<AbortController | null>(null),
    commandRequest = useRef<AbortController | null>(null);
  const lifetime = useMemo(
    () => ({ retired: false }),
    [props.identity, props.companyId, props.projectId],
  );
  const currentLifetime = useRef(lifetime);
  currentLifetime.current = lifetime;
  const scope = { companyId: props.companyId, projectId: props.projectId };
  const protectedIntent =
    mutation.kind === 'pending' ||
    mutation.kind === 'uncertain' ||
    mutation.kind === 'settling';
  const canEdit =
    !props.disabled &&
    !props.projectClosed &&
    load.kind === 'ready' &&
    load.availability.kind === 'mutable' &&
    mutation.kind === 'idle';
  function live(controller: AbortController) {
    return (
      !controller.signal.aborted &&
      !lifetime.retired &&
      currentLifetime.current === lifetime
    );
  }
  useLayoutEffect(() => {
    lifetime.retired = false;
    setExpanded(false);
    setLoad({ kind: 'idle' });
    setSelected([]);
    setMutation({ kind: 'idle' });
    setFeedback(null);
    props.onProtectionChange(false);
    return () => {
      lifetime.retired = true;
      readRequest.current?.abort();
      commandRequest.current?.abort();
    };
  }, [lifetime]);
  useEffect(() => {
    props.onProtectionChange(protectedIntent);
  }, [protectedIntent, props.onProtectionChange]);
  useEffect(
    () => () => props.onProtectionChange(false),
    [props.onProtectionChange],
  );
  useEffect(() => {
    if (expanded && document.activeElement === trigger.current)
      heading.current?.focus();
  }, [expanded]);

  async function value(
    result: ApiResult<unknown>,
    controller: AbortController,
  ): Promise<unknown> {
    if (result.status === 'unauthorized') {
      if (live(controller)) await props.identity.rejectSession();
      if (live(controller)) props.onDenied();
      throw new Error('Planning authority unavailable.');
    }
    if (result.status === 'forbidden' || result.status === 'notFound') {
      if (live(controller)) props.onDenied();
      throw new Error('Planning authority unavailable.');
    }
    if (result.status !== 'ok') throw new Error('Planning read failed.');
    return result.value;
  }
  async function reload(mode: 'open' | 'reload' | 'confirmed') {
    readRequest.current?.abort();
    const controller = new AbortController();
    readRequest.current = controller;
    setLoad({ kind: 'loading' });
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!live(controller)) return;
      const options = {
        companyContextId: props.companyId,
        signal: controller.signal,
      };
      const listingResult = await api.request<unknown>(
        `/projects/${encodeURIComponent(props.projectId)}/tasks`,
        options,
      );
      if (!live(controller)) return;
      const listing = readTaskList(
        await value(listingResult, controller),
        scope,
      );
      if (!live(controller)) return;
      let availability: PlanningAvailability;
      if (props.projectClosed) availability = { kind: 'closed' };
      else if (listing.mutable) {
        const result = await api.request<unknown>(
          `/projects/${encodeURIComponent(props.projectId)}/eligible-task-assignees`,
          options,
        );
        if (!live(controller)) return;
        availability = {
          kind: 'mutable',
          members: readAssignees(await value(result, controller)),
        };
      } else {
        // Native mutable=false combines Client and Project state. Resolve the lifecycle after that read;
        // closed Projects cannot reopen, so a current open Project identifies the historical-Client restriction.
        const result = await api.request<unknown>(
          `/projects/${encodeURIComponent(props.projectId)}`,
          options,
        );
        if (!live(controller)) return;
        const project = await value(result, controller);
        if (
          !isProject(project) ||
          project.id !== props.projectId ||
          project.companyId !== props.companyId
        )
          throw new Error('Invalid current planning Project.');
        availability = {
          kind: isClosedProjectStatus(project.status) ? 'closed' : 'historical',
        };
      }
      if (!live(controller)) return;
      setLoad({ kind: 'ready', tasks: listing.tasks, availability });
      if (mode !== 'open') {
        setSelected([]);
        if (mode === 'reload') {
          setMutation({ kind: 'idle' });
          setFeedback(null);
        }
      }
      if (
        live(controller) &&
        (mode !== 'open' || availability.kind !== 'mutable')
      )
        await props.onReloaded();
    } catch {
      if (live(controller)) setLoad({ kind: 'error' });
    }
  }
  async function run(attempt: PlanningAttempt) {
    commandRequest.current?.abort();
    const controller = new AbortController();
    commandRequest.current = controller;
    setMutation({ kind: 'pending', attempt });
    props.onProtectionChange(true);
    setFeedback(null);
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!live(controller)) return;
      const result = await api.request<unknown>(attempt.path, {
        companyContextId: props.companyId,
        signal: controller.signal,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': attempt.key,
        },
        body: JSON.stringify(attempt.body),
      });
      if (!live(controller)) return;
      if (result.status === 'conflict' || result.status === 'validation') {
        setFeedback(result.status === 'conflict' ? 'conflict' : 'rejected');
        setMutation({ kind: 'blocked' });
        return;
      }
      if (result.status === 'notFound') {
        setFeedback('missing');
        setMutation({ kind: 'blocked' });
        return;
      }
      if (result.status !== 'ok') {
        if (result.status === 'unauthorized' || result.status === 'forbidden')
          await value(result, controller);
        throw new Error('Unconfirmed planning.');
      }
      readTaskPlanningReceipt(result.value, scope, attempt);
      if (!live(controller)) return;
      setFeedback('saved');
      setMutation({ kind: 'settling' });
      // A valid historical receipt confirms the write. Failures of subsequent fresh reads cannot undo that fact.
      await Promise.allSettled([
        reload('confirmed'),
        Promise.resolve().then(() => {
          if (live(controller)) return props.onConfirmed();
        }),
      ]);
      if (live(controller)) setMutation({ kind: 'idle' });
    } catch {
      if (live(controller)) {
        setFeedback('uncertain');
        setMutation({ kind: 'uncertain', attempt });
      }
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    if (
      selected.length < 1 ||
      selected.length > 50 ||
      selected.some((row) => row.dueDate && !validTaskDate(row.dueDate))
    ) {
      setFeedback('validation');
      return;
    }
    void run({
      path: `/projects/${encodeURIComponent(props.projectId)}/tasks/planning`,
      key: crypto.randomUUID(),
      body: {
        tasks: selected.map((row) => ({
          taskId: row.task.id,
          expectedVersion: row.task.version,
          assigneeMembershipId: row.assigneeMembershipId || null,
          dueDate: row.dueDate || null,
        })),
      },
    });
  }
  function choose(task: TaskView, checked: boolean) {
    if (!canEdit) return;
    setSelected((rows) =>
      checked
        ? rows.length < 50
          ? [
              ...rows,
              {
                task,
                assigneeMembershipId:
                  task.assignee?.workspaceMembershipId ?? '',
                dueDate: task.dueDate ?? '',
              },
            ]
          : rows
        : rows.filter((row) => row.task.id !== task.id),
    );
  }
  const openTasks =
    load.kind === 'ready'
      ? load.tasks.filter((task) => isOpenTaskState(task.status))
      : [];
  const members =
    load.kind === 'ready' && load.availability.kind === 'mutable'
      ? load.availability.members
      : [];
  return (
    <div className="task-planning">
      <button
        ref={trigger}
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        disabled={props.disabled && !expanded}
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded && load.kind === 'idle') void reload('open');
        }}
      >
        {copy(expanded ? 'close' : 'open')}
      </button>
      <section id={id} aria-label={copy('title')} hidden={!expanded}>
        <h5 ref={heading} tabIndex={-1}>
          {copy('title')}
        </h5>
        <p>{copy('guidance')}</p>
        <button
          type="button"
          disabled={protectedIntent || props.disabled}
          onClick={() => void reload('reload')}
        >
          {copy('reload')}
        </button>
        {(load.kind === 'idle' || load.kind === 'loading') && (
          <p role="status">{copy('loading')}</p>
        )}
        {load.kind === 'error' && <p role="alert">{copy('error')}</p>}
        {load.kind === 'ready' && (
          <>
            {(props.projectClosed || load.availability.kind !== 'mutable') && (
              <p>
                {props.projectClosed || load.availability.kind === 'closed'
                  ? taskCopy.closedReadOnly
                  : taskCopy.immutable}
              </p>
            )}
            {openTasks.length === 0 && <p>{copy('empty')}</p>}
            {load.availability.kind === 'mutable' && members.length === 0 && (
              <p>{taskCopy.noMembers}</p>
            )}
            {openTasks.length > 0 && (
              <form onSubmit={submit}>
                <p>
                  {selected.length} / 50 · {copy('limit')}
                </p>
                {openTasks.map((task) => {
                  const row = selected.find((row) => row.task.id === task.id);
                  const existing = row?.task.assignee;
                  const historical =
                    existing &&
                    !members.some(
                      (member) =>
                        member.workspaceMembershipId ===
                        existing.workspaceMembershipId,
                    )
                      ? existing
                      : null;
                  const change = (
                    fields: Partial<
                      Pick<Selected, 'assigneeMembershipId' | 'dueDate'>
                    >,
                  ) =>
                    setSelected((rows) =>
                      rows.map((row) =>
                        row.task.id === task.id ? { ...row, ...fields } : row,
                      ),
                    );
                  return (
                    <fieldset
                      key={task.id}
                      className="task-planning-row"
                      disabled={!canEdit}
                    >
                      <legend>
                        <label className="task-planning-choice">
                          <input
                            type="checkbox"
                            checked={!!row}
                            disabled={
                              !canEdit || (!row && selected.length >= 50)
                            }
                            onChange={(event) =>
                              choose(task, event.target.checked)
                            }
                          />
                          {task.title}
                        </label>
                      </legend>
                      <p>
                        {taskCopy.states[task.status]} · {taskCopy.version}{' '}
                        {row?.task.version ?? task.version}
                      </p>
                      {row && (
                        <div className="task-planning-fields">
                          <label>
                            <span>
                              {taskCopy.assignee}
                              <span className="task-planning-scope">
                                {' '}
                                — {task.title}
                              </span>
                            </span>
                            <Select
                              id={`${id}-${task.id}-assignee`}
                              value={row.assigneeMembershipId}
                              disabled={!canEdit}
                              options={[
                                { value: '', label: taskCopy.unassigned },
                                ...(historical
                                  ? [
                                      {
                                        value: historical.workspaceMembershipId,
                                        label: `${historical.displayLabel} · ${taskCopy.memberUnavailable}`,
                                      },
                                    ]
                                  : []),
                                ...members.map((member) => ({
                                  value: member.workspaceMembershipId,
                                  label: member.displayLabel,
                                })),
                              ]}
                              onValueChange={(assigneeMembershipId) =>
                                change({ assigneeMembershipId })
                              }
                            />
                          </label>
                          <label>
                            <span>{taskCopy.dueDate}</span>
                            <input
                              type="date"
                              aria-label={`${taskCopy.dueDate} — ${task.title}`}
                              min="0001-01-01"
                              max="9999-12-31"
                              value={row.dueDate}
                              onChange={(event) =>
                                change({ dueDate: event.target.value })
                              }
                            />
                          </label>
                        </div>
                      )}
                    </fieldset>
                  );
                })}
                <button
                  type="submit"
                  disabled={!canEdit || selected.length === 0}
                >
                  {copy('save')}
                </button>
              </form>
            )}
          </>
        )}
        {feedback && <p role="status">{copy(feedback)}</p>}
        {mutation.kind === 'uncertain' && (
          <button
            type="button"
            disabled={props.disabled}
            onClick={() => void run(mutation.attempt)}
          >
            {copy('retry')}
          </button>
        )}
      </section>
    </div>
  );
}
