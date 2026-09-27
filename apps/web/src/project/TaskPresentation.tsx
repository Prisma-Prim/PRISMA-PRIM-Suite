import { useId, type FormEvent } from 'react';
import { Select } from '../presentation/Select';
import {
  readTaskPriority,
  taskPriorities,
  type Assignee,
  type TaskDeclaration,
  type TaskEvent,
  type TaskPriority,
  type TaskView,
} from './task-response';
import { taskCopy as copy } from './task.copy';

export type Draft = {
  title: string;
  assigneeMembershipId: string;
  dueDate: string;
  priority: TaskPriority;
};
export function TaskFieldsForm({
  draft,
  members,
  current,
  disabled,
  editing,
  onChange,
  onSubmit,
}: {
  draft: Draft;
  members: Assignee[] | null;
  current: TaskView | null;
  disabled: boolean;
  editing: boolean;
  onChange: (draft: Draft) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const fieldId = useId();
  const unavailableMember =
    current?.assignee &&
    members &&
    !members.some(
      (member) =>
        member.workspaceMembershipId ===
        current.assignee?.workspaceMembershipId,
    );
  return (
    <form onSubmit={onSubmit}>
      <label>
        {copy.titleLabel}
        <input
          value={draft.title}
          required
          maxLength={200}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, title: event.target.value })
          }
        />
      </label>
      <label htmlFor={fieldId + '-assignee'}>
        {copy.assignee}
        <Select
          id={fieldId + '-assignee'}
          value={draft.assigneeMembershipId}
          disabled={disabled}
          placeholder={copy.unassigned}
          options={[
            ...(unavailableMember && current?.assignee
              ? [
                  {
                    value: current.assignee.workspaceMembershipId,
                    label: current.assignee.displayLabel,
                    disabled: true,
                  },
                ]
              : []),
            ...(members ?? []).map((member) => ({
              value: member.workspaceMembershipId,
              label: member.displayLabel,
            })),
          ]}
          onValueChange={(value) =>
            onChange({
              ...draft,
              assigneeMembershipId: value,
            })
          }
        />
      </label>
      {members?.length === 0 && <p>{copy.noMembers}</p>}
      {unavailableMember && <p>{copy.memberUnavailable}</p>}
      <label>
        {copy.dueDate}
        <input
          type="date"
          min="0001-01-01"
          max="9999-12-31"
          value={draft.dueDate}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, dueDate: event.target.value })
          }
        />
      </label>
      <label htmlFor={fieldId + '-priority'}>
        {copy.priority}
        <Select
          id={fieldId + '-priority'}
          value={draft.priority}
          disabled={disabled}
          options={taskPriorities.map((priority) => ({
            value: priority,
            label: copy.priorities[priority],
          }))}
          onValueChange={(value) =>
            onChange({
              ...draft,
              priority: readTaskPriority(value),
            })
          }
        />
      </label>
      <button type="submit" disabled={disabled}>
        {editing ? copy.save : copy.create}
      </button>
    </form>
  );
}
export function formatTime(value: string) {
  return new Date(value).toLocaleString();
}
export function TaskHistory({ events }: { events: TaskEvent[] }) {
  return (
    <section className="task-history" aria-label={copy.history}>
      <h6>{copy.history}</h6>
      <ol>
        {events.map((event) => (
          <li key={event.id}>
            <strong>{eventLabel(event)}</strong>
            <p>
              {event.actor.displayName} ·{' '}
              <time dateTime={event.occurredAt}>
                {formatTime(event.occurredAt)}
              </time>{' '}
              · {copy.version} {event.metadata.version}
            </p>
            {event.action === 'task.created' && (
              <>
                <p>
                  {event.metadata.initial.title} ·{' '}
                  {event.metadata.initial.assignee?.displayLabel ??
                    copy.unassigned}{' '}
                  · {event.metadata.initial.dueDate ?? copy.noDate}
                </p>
                {/* A creation recorded before priority existed shows no priority line. */}
                {event.metadata.initial.priority && (
                  <p>
                    {copy.priority}:{' '}
                    {copy.priorities[event.metadata.initial.priority]}
                  </p>
                )}
              </>
            )}
            {event.action === 'task.updated' && (
              <dl>
                {event.metadata.changes.title && (
                  <HistoryChange
                    label={copy.titleLabel}
                    {...event.metadata.changes.title}
                  />
                )}
                {event.metadata.changes.assignee && (
                  <HistoryChange
                    label={copy.assignee}
                    before={
                      event.metadata.changes.assignee.before?.displayLabel ??
                      copy.unassigned
                    }
                    after={
                      event.metadata.changes.assignee.after?.displayLabel ??
                      copy.unassigned
                    }
                  />
                )}
                {event.metadata.changes.dueDate && (
                  <HistoryChange
                    label={copy.dueDate}
                    before={
                      event.metadata.changes.dueDate.before ?? copy.noDate
                    }
                    after={event.metadata.changes.dueDate.after ?? copy.noDate}
                  />
                )}
                {event.metadata.changes.priority && (
                  <div>
                    <dt>{copy.priority}</dt>
                    <dd>
                      {copy.priorityChange({
                        before:
                          copy.priorities[
                            event.metadata.changes.priority.before
                          ],
                        after:
                          copy.priorities[
                            event.metadata.changes.priority.after
                          ],
                      })}
                    </dd>
                  </div>
                )}
              </dl>
            )}
            {event.action !== 'task.created' &&
              event.action !== 'task.updated' && (
                <dl>
                  <HistoryChange
                    label={copy.status}
                    before={copy.states[event.metadata.before]}
                    after={copy.states[event.metadata.after]}
                  />
                </dl>
              )}
            {(event.action === 'task.status.changed' ||
              event.action === 'task.cancelled') &&
              event.metadata.reason !== null && (
                <p>
                  {copy.reason}: {event.metadata.reason}
                </p>
              )}
          </li>
        ))}
      </ol>
    </section>
  );
}
function eventLabel(event: TaskEvent): string {
  switch (event.action) {
    case 'task.created':
      return copy.created;
    case 'task.updated':
      return copy.updated;
    case 'task.status.changed':
      return copy.statusChanged;
    case 'task.completed':
      return copy.completed;
    case 'task.cancelled':
      return copy.cancelled;
    case 'task.reopened':
      return copy.reopened;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
/** The current blockage or cancellation of a Task, with its declaring actor and server time. */
export function TaskDeclarationFacts({
  kind,
  declaration,
}: {
  kind: 'blocked' | 'cancelled';
  declaration: TaskDeclaration;
}) {
  return (
    <>
      <p>
        {kind === 'blocked' ? copy.blockedBy : copy.cancelledBy}{' '}
        {declaration.actor.displayName} {copy.at}{' '}
        <time dateTime={declaration.occurredAt}>
          {formatTime(declaration.occurredAt)}
        </time>
      </p>
      <dl className="task-facts task-facts--declaration">
        <div>
          <dt>
            {kind === 'blocked' ? copy.blockageReason : copy.cancellationReason}
          </dt>
          <dd>{declaration.reason}</dd>
        </div>
      </dl>
    </>
  );
}
export type ReasonDraft = {
  kind: 'blocked' | 'cancelled';
  text: string;
  invalid: boolean;
};
/** The explicit reason required to enter `blocked` or `cancelled`, validated like the server. */
export function TaskReasonForm({
  draft,
  onChange,
  onSubmit,
  onDismiss,
}: {
  draft: ReasonDraft;
  onChange: (draft: ReasonDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onDismiss: () => void;
}) {
  const errorId = useId();
  return (
    <form className="task-reason" onSubmit={onSubmit} noValidate>
      <label>
        {draft.kind === 'blocked'
          ? copy.blockageReason
          : copy.cancellationReason}
        <textarea
          value={draft.text}
          required
          rows={3}
          aria-invalid={draft.invalid || undefined}
          aria-describedby={draft.invalid ? errorId : undefined}
          onChange={(event) =>
            onChange({ ...draft, text: event.target.value, invalid: false })
          }
        />
      </label>
      {draft.invalid && (
        <p className="task-reason-error" id={errorId}>
          {copy.reasonValidation}
        </p>
      )}
      <div className="task-actions">
        <button type="submit">
          {draft.kind === 'blocked' ? copy.saveBlockage : copy.saveCancellation}
        </button>
        <button type="button" onClick={onDismiss}>
          {copy.keepState}
        </button>
      </div>
    </form>
  );
}
function HistoryChange({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {copy.before}: {before}
      </dd>
      <dd>
        {copy.after}: {after}
      </dd>
    </div>
  );
}
