import { useRequestLifetime } from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { Select } from '../presentation/Select';
import { useProjectTaskCopy } from './task.copy';
import {
  ProjectTaskReadFailure,
  type ProjectTaskReads,
} from './project-task-reads';
import { useTaskPlanningCopy } from './task-planning.copy';
import {
  readTaskPlanningReceipt,
  type PlanningAttempt,
} from './task-planning-response';
import {
  isOpenTaskState,
  validTaskDate,
  type Assignee,
  type TaskView,
} from './task-response';
import './task-planning.css';

type Props = {
  active: boolean;
  captureRecovery: () => () => boolean;
  disabled: boolean;
  projectClosed: boolean;
  taskReads: ProjectTaskReads;
  nativeReadOnly: boolean;
  onProtectionChange: (protectedIntent: boolean) => void;
  onConfirmed: () => void | Promise<void>;
  onReloaded: () => void | Promise<void>;
  onDenied: () => void;
};
type Load =
  | { kind: 'idle' | 'loading' | 'error' }
  | {
      kind: 'ready';
      tasks: TaskView[];
      availability: PlanningAvailability;
      clientIdentityRevision: number;
    };
type PlanningAvailability =
  | { kind: 'mutable'; members: Assignee[] }
  | { kind: 'closed' | 'historical' | 'membersUnavailable' };
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
type ReadMode = 'open' | 'reload' | 'confirmed';

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
  const { identity, scope, clientIdentityRevision, capture } = props.taskReads;
  const ownerScope = String(
    useRequestLifetime(identity, JSON.stringify(scope)),
  );
  const reads = useScopedOperationGroup(
    JSON.stringify([ownerScope, props.active, clientIdentityRevision]),
  );
  const writes = useScopedOperationGroup(ownerScope);
  const reloadCurrent = useRef(reload);
  const requestedReadMode = useRef<ReadMode | null>(null);
  const callbacks = useRef({
    onReloaded: props.onReloaded,
    onConfirmed: props.onConfirmed,
  });
  useLayoutEffect(() => {
    reloadCurrent.current = reload;
    callbacks.current = {
      onReloaded: props.onReloaded,
      onConfirmed: props.onConfirmed,
    };
  });
  const protectedIntent =
    mutation.kind === 'pending' ||
    mutation.kind === 'uncertain' ||
    mutation.kind === 'settling';
  const staleRead =
    load.kind === 'ready' &&
    load.clientIdentityRevision !== clientIdentityRevision;
  const canEdit =
    !props.disabled &&
    !props.projectClosed &&
    !props.nativeReadOnly &&
    !staleRead &&
    load.kind === 'ready' &&
    load.availability.kind === 'mutable' &&
    mutation.kind === 'idle';
  useLayoutEffect(() => {
    setExpanded(false);
    setLoad({ kind: 'idle' });
    setSelected([]);
    setMutation({ kind: 'idle' });
    setFeedback(null);
    requestedReadMode.current = null;
    props.onProtectionChange(false);
  }, [ownerScope]);
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

  async function reload(mode: ReadMode) {
    requestedReadMode.current = mode;
    if (!props.active) return;
    const operation = reads.beginLatest();
    if (!operation) return;
    const { signal } = operation;
    const read = capture({
      signal,
      recoveryCurrent: props.captureRecovery(),
    });
    setLoad({ kind: 'loading' });
    try {
      const listing = await read.listing();
      if (!listing) return;
      let availability: PlanningAvailability;
      if (props.projectClosed) availability = { kind: 'closed' };
      else if (listing.mutable) {
        const members = await read.eligibleMembers();
        if (!read.current()) return;
        availability =
          members === null
            ? { kind: 'membersUnavailable' }
            : { kind: 'mutable', members };
      } else {
        const reason = await read.readOnlyReason();
        if (!reason) return;
        availability = { kind: reason };
      }
      if (!read.current()) return;
      setLoad({
        kind: 'ready',
        tasks: listing.tasks,
        availability,
        clientIdentityRevision: read.revision,
      });
      if (mode === 'open') {
        // A Client identity refresh keeps only selections with the exact Task version.
        setSelected((selected) =>
          selected.filter(({ task }) =>
            listing.tasks.some(
              (current) =>
                current.id === task.id && current.version === task.version,
            ),
          ),
        );
      } else {
        setSelected([]);
        if (mode === 'reload') {
          setMutation({ kind: 'idle' });
          setFeedback(null);
        }
      }
      if (
        read.current() &&
        (mode !== 'open' ||
          availability.kind === 'closed' ||
          availability.kind === 'historical')
      )
        await callbacks.current.onReloaded();
    } catch (error) {
      if (read.current()) {
        if (error instanceof ProjectTaskReadFailure && error.kind === 'denied')
          props.onDenied();
        else setLoad({ kind: 'error' });
      }
    } finally {
      if (read.current()) {
        requestedReadMode.current = null;
        if (mode === 'confirmed') setMutation({ kind: 'idle' });
      }
      operation.release();
    }
  }
  useEffect(() => {
    const mode = requestedReadMode.current;
    if (
      props.active &&
      !reads.isPending() &&
      ((mode && (expanded || mode === 'confirmed')) ||
        (expanded && staleRead && mutation.kind === 'idle'))
    )
      void reload(mode ?? 'open');
  }, [props.active, clientIdentityRevision]);
  async function run(attempt: PlanningAttempt) {
    if (writes.isPending()) return;
    const operation = writes.beginLatest();
    if (!operation) return;
    const { signal } = operation;
    const recoveryCurrent = props.captureRecovery();
    setMutation({ kind: 'pending', attempt });
    props.onProtectionChange(true);
    setFeedback(null);
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      const result = await api.request(attempt.path, {
        companyContextId: scope.companyId,
        signal,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': attempt.key,
        },
        body: JSON.stringify(attempt.body),
      });
      if (signal.aborted) return;
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
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        if (recoveryCurrent()) {
          if (result.status === 'unauthorized')
            await identity.rejectSession().catch(() => undefined);
          if (!signal.aborted) props.onDenied();
        }
        if (!signal.aborted) {
          setFeedback('rejected');
          setMutation({ kind: 'blocked' });
        }
        return;
      }
      if (result.status !== 'ok') {
        throw new Error('Unconfirmed planning.');
      }
      readTaskPlanningReceipt(result.value, scope, attempt);
      if (signal.aborted) return;
      setFeedback('saved');
      setMutation({ kind: 'settling' });
      setLoad({ kind: 'loading' });
      setSelected([]);
      // A valid historical receipt confirms the write. Failures of subsequent fresh reads cannot undo that fact.
      void Promise.resolve()
        .then(() => {
          if (!signal.aborted) return callbacks.current.onConfirmed();
        })
        .catch(() => undefined);
      await reloadCurrent.current('confirmed');
    } catch {
      if (!signal.aborted) {
        setFeedback('uncertain');
        setMutation({ kind: 'uncertain', attempt });
      }
    } finally {
      operation.release();
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
      path: `/projects/${encodeURIComponent(scope.projectId)}/tasks/planning`,
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
          if (!expanded && !reads.isPending()) {
            const mode = requestedReadMode.current;
            if (
              mode ||
              load.kind === 'idle' ||
              (staleRead && mutation.kind === 'idle')
            )
              void reload(mode ?? 'open');
          }
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
            {(props.projectClosed ||
              load.availability.kind === 'closed' ||
              load.availability.kind === 'historical') && (
              <p>
                {props.projectClosed || load.availability.kind === 'closed'
                  ? taskCopy.closedReadOnly
                  : taskCopy.immutable}
              </p>
            )}
            {load.availability.kind === 'membersUnavailable' && (
              <p role="alert">{taskCopy.membersError}</p>
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
