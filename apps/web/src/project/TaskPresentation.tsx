import type { FormEvent } from 'react';
import {
  readTaskPriority,
  taskPriorities,
  type Assignee,
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
      <label>
        {copy.assignee}
        <select
          value={draft.assigneeMembershipId}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...draft,
              assigneeMembershipId: event.target.value,
            })
          }
        >
          <option value="">{copy.unassigned}</option>
          {unavailableMember && current.assignee && (
            <option value={current.assignee.workspaceMembershipId} disabled>
              {current.assignee.displayLabel}
            </option>
          )}
          {members?.map((member) => (
            <option
              key={member.workspaceMembershipId}
              value={member.workspaceMembershipId}
            >
              {member.displayLabel}
            </option>
          ))}
        </select>
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
      <label>
        {copy.priority}
        <select
          value={draft.priority}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...draft,
              priority: readTaskPriority(event.target.value),
            })
          }
        >
          {taskPriorities.map((priority) => (
            <option key={priority} value={priority}>
              {copy.priorities[priority]}
            </option>
          ))}
        </select>
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
            <strong>
              {event.action === 'task.created'
                ? copy.created
                : event.action === 'task.updated'
                  ? copy.updated
                  : event.action === 'task.completed'
                    ? copy.completed
                    : copy.reopened}
            </strong>
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
          </li>
        ))}
      </ol>
    </section>
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
