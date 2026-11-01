import { useId, useLayoutEffect, useRef } from 'react';
import type { FollowUpCommand, FollowUpCurrent } from './follow-up-contract';
import { useFollowUpCopy } from './follow-up.copy';

export type FollowUpDraft = { date: string; reason: string };
export type FollowUpAttempt = {
  draft: FollowUpDraft;
  command: FollowUpCommand;
  body: string;
  key: string;
  observed: FollowUpCurrent;
};
export type FollowUpEdit =
  | { kind: 'idle' }
  | { kind: 'editing'; draft: FollowUpDraft; invalid: boolean }
  | { kind: 'sending' | 'uncertain' | 'conflict'; attempt: FollowUpAttempt };

/** The panel owns every intent; this view only edits its literal fields. */
export function FollowUpEditor({
  edit,
  disabled,
  onChange,
  onSave,
  onRetry,
  onCancel,
}: {
  edit: Exclude<FollowUpEdit, { kind: 'idle' }>;
  disabled: boolean;
  onChange: (draft: FollowUpDraft) => void;
  onSave: (draft: FollowUpDraft) => void;
  onRetry: (attempt: FollowUpAttempt) => void;
  onCancel: () => void;
}) {
  const copy = useFollowUpCopy();
  const id = useId();
  const dateInput = useRef<HTMLInputElement>(null);
  const draft = edit.kind === 'editing' ? edit.draft : edit.attempt.draft;
  const locked = edit.kind !== 'editing';
  const invalid = edit.kind === 'editing' && edit.invalid;
  useLayoutEffect(() => {
    if (edit.kind === 'editing') dateInput.current?.focus();
  }, [edit.kind]);
  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        if (edit.kind === 'editing') onSave(draft);
        else if (edit.kind === 'uncertain') onRetry(edit.attempt);
      }}
    >
      <label htmlFor={`${id}-date`}>{copy('date')}</label>
      <input
        id={`${id}-date`}
        ref={dateInput}
        type="text"
        value={draft.date}
        aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ''}`}
        aria-invalid={invalid}
        disabled={locked}
        onChange={(event) => onChange({ ...draft, date: event.target.value })}
      />
      <p id={`${id}-hint`}>{copy('dateHint')}</p>
      <button
        type="button"
        className="commercial-intake-secondary-action"
        disabled={locked || draft.date === ''}
        onClick={() => onChange({ ...draft, date: '' })}
      >
        {copy('clear')}
      </button>
      <label htmlFor={`${id}-reason`}>{copy('reason')}</label>
      <textarea
        id={`${id}-reason`}
        value={draft.reason}
        maxLength={500}
        aria-describedby={`${id}-reason-hint${invalid ? ` ${id}-error` : ''}`}
        aria-invalid={invalid}
        disabled={locked}
        onChange={(event) => onChange({ ...draft, reason: event.target.value })}
      />
      <p id={`${id}-reason-hint`}>{copy('reasonHint')}</p>
      {invalid ? (
        <p role="alert" id={`${id}-error`}>
          {copy('validation')}
        </p>
      ) : null}
      {edit.kind === 'sending' ? <p role="status">{copy('saving')}</p> : null}
      {edit.kind === 'uncertain' ? (
        <p role="alert">{copy('uncertain')}</p>
      ) : null}
      <div className="opportunity-follow-up-actions">
        {edit.kind !== 'conflict' ? (
          <button
            type="submit"
            className="commercial-intake-primary-action"
            disabled={disabled}
          >
            {copy(edit.kind === 'uncertain' ? 'retry' : 'save')}
          </button>
        ) : null}
        <button
          type="button"
          className="commercial-intake-secondary-action"
          disabled={edit.kind === 'sending'}
          onClick={onCancel}
        >
          {copy('cancel')}
        </button>
      </div>
    </form>
  );
}
