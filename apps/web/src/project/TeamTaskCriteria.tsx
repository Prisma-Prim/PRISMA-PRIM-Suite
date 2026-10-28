import { useId, useRef, useState } from 'react';
import { Select } from '../presentation/Select';
import { useProjectTaskCopy } from './task.copy';
import { useTeamTasksCopy } from './team-tasks.copy';
import {
  defaultTeamTaskFilters,
  teamResponsibilities,
  teamTaskStates,
  validTaskDate,
  validTeamName,
  type TeamTaskFilters,
} from './team-tasks-response';

/** Literal drafts live independently of the applied page, including hidden name drafts. */
export function TeamTaskCriteria({
  pending,
  onApply,
}: {
  pending: boolean;
  onApply: (filters: TeamTaskFilters) => void;
}) {
  const copy = useTeamTasksCopy(),
    native = useProjectTaskCopy(),
    prefix = useId();
  const [draft, setDraft] = useState({
    ...defaultTeamTaskFilters,
    assigneeName: '',
    dueFrom: '',
    dueThrough: '',
  });
  const [errors, setErrors] = useState({ name: false, date: false });
  const from = useRef<HTMLInputElement>(null),
    through = useRef<HTMLInputElement>(null);
  return (
    <form
      className="team-task-criteria"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const errors = {
          name:
            draft.responsibility === 'name' &&
            !validTeamName(draft.assigneeName),
          date: !!(
            from.current?.validity.badInput ||
            through.current?.validity.badInput ||
            [draft.dueFrom, draft.dueThrough].some(
              (v) => v !== '' && !validTaskDate(v),
            ) ||
            (draft.dueFrom &&
              draft.dueThrough &&
              draft.dueFrom > draft.dueThrough)
          ),
        };
        setErrors(errors);
        if (errors.name || errors.date) return;
        onApply({
          ...draft,
          assigneeName:
            draft.responsibility === 'name' ? draft.assigneeName.trim() : null,
          dueFrom: draft.dueFrom || null,
          dueThrough: draft.dueThrough || null,
        });
      }}
    >
      <div>
        <label htmlFor={prefix + '-state'}>{copy('state')}</label>
        <Select
          id={prefix + '-state'}
          value={draft.state}
          options={teamTaskStates.map((state) => ({
            value: state,
            label:
              state === 'all' || state === 'open'
                ? copy(state)
                : native.states[state],
          }))}
          onValueChange={(value) => {
            const state = teamTaskStates.find((s) => s === value);
            if (state) setDraft((d) => ({ ...d, state }));
          }}
        />
      </div>
      <div>
        <label htmlFor={prefix + '-responsibility'}>
          {copy('responsibility')}
        </label>
        <Select
          id={prefix + '-responsibility'}
          value={draft.responsibility}
          options={teamResponsibilities.map((value) => ({
            value,
            label: copy(value),
          }))}
          onValueChange={(value) => {
            const responsibility = teamResponsibilities.find(
              (r) => r === value,
            );
            if (responsibility) setDraft((d) => ({ ...d, responsibility }));
          }}
        />
      </div>
      <div hidden={draft.responsibility !== 'name'}>
        <label htmlFor={prefix + '-name'}>{copy('assigneeName')}</label>
        <input
          type="text"
          id={prefix + '-name'}
          value={draft.assigneeName}
          aria-invalid={errors.name}
          aria-describedby={errors.name ? prefix + '-name-error' : undefined}
          onChange={(e) =>
            setDraft((d) => ({ ...d, assigneeName: e.target.value }))
          }
        />
        {errors.name && (
          <p id={prefix + '-name-error'} role="alert">
            {copy('invalidName')}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={prefix + '-from'}>{copy('dueFrom')}</label>
        <input
          ref={from}
          id={prefix + '-from'}
          type="date"
          min="0001-01-01"
          max="9999-12-31"
          value={draft.dueFrom}
          aria-invalid={errors.date}
          aria-describedby={errors.date ? prefix + '-date-error' : undefined}
          onChange={(e) => setDraft((d) => ({ ...d, dueFrom: e.target.value }))}
        />
      </div>
      <div>
        <label htmlFor={prefix + '-through'}>{copy('dueThrough')}</label>
        <input
          ref={through}
          id={prefix + '-through'}
          type="date"
          min="0001-01-01"
          max="9999-12-31"
          value={draft.dueThrough}
          aria-invalid={errors.date}
          aria-describedby={errors.date ? prefix + '-date-error' : undefined}
          onChange={(e) =>
            setDraft((d) => ({ ...d, dueThrough: e.target.value }))
          }
        />
      </div>
      {errors.date && (
        <p id={prefix + '-date-error'} role="alert">
          {copy('invalidDate')}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {copy('apply')}
      </button>
    </form>
  );
}
