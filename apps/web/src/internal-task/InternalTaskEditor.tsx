import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { Select } from '../presentation/Select';
import { useInternalTaskCopy } from './internal-task.copy';
import {
  calendarDate,
  InternalTaskResponseError,
  literal,
  priority,
  readReceipt,
  status,
  type Member,
  type Priority,
  type Receipt,
  type Scope,
  type Status,
  type Task,
} from './internal-task-response';
import type { Request, Mutation, Command } from './internal-task-request';
import { TaskValues } from './InternalTaskValues';
interface EditorProps {
  identity: BrowserIdentity;
  scope: Scope;
  task?: Task;
  review?: number;
  ready?: boolean;
  members: Member[];
  request: Request;
  capture: () => () => boolean;
  captureRecovery: () => () => boolean;
  onConfirmed: (receipt: Receipt) => Promise<void>;
  onReload?: () => Promise<boolean>;
}
export function TaskEditor(props: EditorProps) {
  const copy = useInternalTaskCopy(),
    id = useId();
  const [title, setTitle] = useState(props.task?.title ?? ''),
    [description, setDescription] = useState(props.task?.description ?? ''),
    [assignee, setAssignee] = useState(
      props.task?.assignee?.membershipId ?? '',
    ),
    [dueDate, setDate] = useState(props.task?.dueDate ?? ''),
    [chosenPriority, setPriority] = useState<Priority>(
      props.task?.priority ?? 'normal',
    ),
    [destination, setDestination] = useState<Status>(
      freshDestination(props.task),
    ),
    [reason, setReason] = useState(''),
    [observedVersion, setObservedVersion] = useState(props.task?.version ?? 1),
    [mutation, setMutation] = useState<Mutation>({ kind: 'idle' });
  const pending = useRef(false),
    captureTarget = useAuthorityLifetime(
      props.task?.id ?? 'create',
      props.identity,
    ),
    lastReview = useRef(props.review),
    confirmed = useRef(props.onConfirmed);
  confirmed.current = props.onConfirmed;
  useEffect(() => {
    if (lastReview.current === props.review) return;
    lastReview.current = props.review;
    setTitle(props.task?.title ?? '');
    setDescription(props.task?.description ?? '');
    setAssignee(props.task?.assignee?.membershipId ?? '');
    setDate(props.task?.dueDate ?? '');
    setPriority(props.task?.priority ?? 'normal');
    setDestination(freshDestination(props.task));
    setReason('');
    setObservedVersion(props.task?.version ?? 1);
    setMutation({ kind: 'idle' });
  }, [props.review, props.task]);
  const stale = !!props.task && observedVersion !== props.task.version,
    locked =
      mutation.kind === 'pending' ||
      mutation.kind === 'uncertain' ||
      mutation.kind === 'conflict' ||
      stale ||
      props.ready === false,
    closed =
      props.task?.status === 'done' || props.task?.status === 'cancelled';
  function command(body: unknown) {
    const scopeLive = props.capture(),
      targetLive = captureTarget();
    return {
      path: props.task
        ? '/company-internal-tasks/' + props.task.id + '/changes'
        : '/company-internal-tasks',
      body: JSON.stringify(body),
      key: crypto.randomUUID(),
      live: () => scopeLive() && targetLive(),
      recoveryLive: props.captureRecovery(),
    };
  }
  async function send(attempt: Command) {
    if (pending.current || !attempt.live()) return;
    pending.current = true;
    setMutation({ kind: 'pending', command: attempt });
    try {
      const result = await props.request(attempt.path, {
        method: 'POST',
        body: attempt.body,
        key: attempt.key,
        live: attempt.live,
        recoveryLive: attempt.recoveryLive,
      });
      if (!attempt.live() || !result) return;
      if (result.status === 'ok') {
        let saved: Receipt;
        try {
          saved = readReceipt(result.value, props.scope, props.task?.id);
        } catch (error) {
          setMutation({
            kind: 'uncertain',
            command: attempt,
            message:
              error instanceof InternalTaskResponseError
                ? error.kind
                : 'malformed',
          });
          return;
        }
        setMutation({ kind: 'confirmed', command: attempt, receipt: saved });
        setObservedVersion(saved.task.version);
        setDestination((current) =>
          current === saved.task.status
            ? freshDestination(saved.task)
            : current,
        );
        await confirmed.current(saved);
        if (!attempt.live()) return;
        return;
      }
      if (result.status === 'conflict') {
        setMutation({ kind: 'conflict' });
        return;
      }
      if (result.status === 'validation') {
        setMutation({ kind: 'invalid' });
        return;
      }
      if (result.status === 'forbidden' || result.status === 'unauthorized')
        return;
      setMutation({ kind: 'uncertain', command: attempt });
    } finally {
      pending.current = false;
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked || closed) return;
    try {
      const body = {
        title: literal(title, 200),
        description: literal(description, 2000, true),
        assigneeMembershipId: assignee || null,
        dueDate: calendarDate(dueDate || null),
        priority: chosenPriority,
      };
      void send(
        command(
          props.task
            ? { kind: 'EDIT', expectedVersion: observedVersion, ...body }
            : body,
        ),
      );
    } catch {
      setMutation({ kind: 'invalid' });
    }
  }
  function move(event: FormEvent) {
    event.preventDefault();
    if (locked || !props.task) return;
    try {
      void send(
        command({
          kind: 'MOVE',
          expectedVersion: observedVersion,
          status: closed ? 'todo' : destination,
          ...(!closed &&
          (destination === 'blocked' || destination === 'cancelled')
            ? { reason: literal(reason, 500) }
            : {}),
        }),
      );
    } catch {
      setMutation({ kind: 'invalid' });
    }
  }
  const options = [
    { value: '', label: copy('unassigned') },
    ...props.members.map((member) => ({
      value: member.membershipId,
      label: member.displayLabel,
    })),
  ];
  if (
    props.task?.assignee &&
    !options.some(
      (option) => option.value === props.task?.assignee?.membershipId,
    )
  )
    options.push({
      value: props.task.assignee.membershipId,
      label: props.task.assignee.displayLabel,
    });
  return (
    <div className="internal-task-editor">
      <h3>{copy(props.task ? 'save' : 'create')}</h3>
      {closed && <p>{copy('closed')}</p>}
      {stale &&
        mutation.kind !== 'pending' &&
        mutation.kind !== 'uncertain' && <p role="alert">{copy('conflict')}</p>}
      <form onSubmit={submit} aria-label={copy(props.task ? 'save' : 'create')}>
        <fieldset disabled={locked || closed}>
          <label htmlFor={id + '-title'}>{copy('taskTitle')}</label>
          <input
            id={id + '-title'}
            value={title}
            required
            onChange={(event) => setTitle(event.target.value)}
          />
          <label htmlFor={id + '-description'}>{copy('description')}</label>
          <textarea
            id={id + '-description'}
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <label htmlFor={id + '-assignee'}>{copy('assignee')}</label>
          <Select
            id={id + '-assignee'}
            value={assignee}
            options={options}
            onValueChange={setAssignee}
            disabled={locked || closed}
          />
          <label htmlFor={id + '-date'}>{copy('date')}</label>
          <input
            id={id + '-date'}
            type="date"
            value={dueDate}
            onChange={(event) => setDate(event.target.value)}
          />
          <label htmlFor={id + '-priority'}>{copy('priority')}</label>
          <Select
            id={id + '-priority'}
            value={chosenPriority}
            options={['normal', 'important', 'critical'].map((value) => ({
              value,
              label: copy(priority(value)),
            }))}
            onValueChange={(value) => setPriority(priority(value))}
            disabled={locked || closed}
          />
          <button type="submit">{copy(props.task ? 'save' : 'create')}</button>
        </fieldset>
      </form>
      {props.task && (
        <form onSubmit={move} aria-label={copy('move')}>
          <fieldset disabled={locked}>
            {!closed && (
              <>
                <label htmlFor={id + '-status'}>{copy('status')}</label>
                <Select
                  id={id + '-status'}
                  value={destination}
                  options={[
                    'todo',
                    'in_progress',
                    'blocked',
                    'done',
                    'cancelled',
                  ].map((value) => ({
                    value,
                    label: copy(status(value)),
                    disabled: value === props.task?.status,
                  }))}
                  onValueChange={(value) => setDestination(status(value))}
                  disabled={locked}
                />
                {(destination === 'blocked' || destination === 'cancelled') && (
                  <>
                    <label htmlFor={id + '-reason'}>{copy('reason')}</label>
                    <textarea
                      id={id + '-reason'}
                      value={reason}
                      required
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </>
                )}
              </>
            )}
            <button type="submit">{copy(closed ? 'reopen' : 'move')}</button>
          </fieldset>
        </form>
      )}
      <div
        role={
          mutation.kind === 'invalid' || mutation.kind === 'conflict'
            ? 'alert'
            : 'status'
        }
        aria-live="polite"
      >
        {mutation.kind === 'pending' && copy('pending')}
        {mutation.kind === 'invalid' && copy('invalid')}
        {mutation.kind === 'conflict' && copy('conflict')}
        {mutation.kind === 'uncertain' && (
          <>
            <p>{copy('uncertain')}</p>
            {mutation.message && <p>{copy(mutation.message)}</p>}
            <button type="button" onClick={() => void send(mutation.command)}>
              {copy('retry')}
            </button>
          </>
        )}
        {mutation.kind === 'confirmed' && (
          <>
            <p>{copy(mutation.receipt.changed ? 'confirmed' : 'unchanged')}</p>
            <TaskValues task={mutation.receipt.task} />
          </>
        )}
      </div>
      {props.onReload && (
        <button
          type="button"
          disabled={
            mutation.kind === 'pending' || mutation.kind === 'uncertain'
          }
          onClick={() => void props.onReload?.()}
        >
          {copy('reload')}
        </button>
      )}
    </div>
  );
}
function freshDestination(task: Pick<Task, 'status'> | undefined): Status {
  return task?.status === 'in_progress' ? 'todo' : 'in_progress';
}
