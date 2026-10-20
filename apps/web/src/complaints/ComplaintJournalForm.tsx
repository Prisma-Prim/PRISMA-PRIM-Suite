import type { FormEvent } from 'react';
import type { ComplaintHistoryEntry } from './complaints-response';
import { useComplaintCopy } from './complaints.copy';

export function ComplaintJournalForm({
  editor,
  journalText,
  journalDate,
  reason,
  invalid,
  disabled,
  onSubmit,
  onTextChange,
  onDateChange,
  onReasonChange,
}: {
  editor:
    | { kind: 'journal'; entryKind: 'action' | 'response' }
    | {
        kind: 'journal-correction';
        original: Extract<
          ComplaintHistoryEntry,
          { kind: 'action' | 'response' }
        >;
      };
  journalText: string;
  journalDate: string;
  reason: string;
  invalid: boolean;
  disabled: boolean;
  onSubmit: (event: FormEvent) => void;
  onTextChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onReasonChange: (value: string) => void;
}) {
  const copy = useComplaintCopy();
  return (
    <form className="complaint-form" onSubmit={onSubmit} noValidate>
      <h4>
        {editor.kind === 'journal'
          ? copy(editor.entryKind)
          : copy('recordCorrection')}
      </h4>
      {editor.kind === 'journal-correction' ? (
        <blockquote className="complaint-literal">
          {editor.original.text}
        </blockquote>
      ) : null}
      <label htmlFor="complaint-journal-text">
        {copy('journalText')}
        <textarea
          id="complaint-journal-text"
          aria-invalid={invalid && !journalText.trim()}
          aria-describedby={invalid ? 'complaint-feedback' : undefined}
          value={journalText}
          maxLength={5000}
          required
          disabled={disabled}
          onChange={(event) => onTextChange(event.target.value)}
        />
      </label>
      <div className="complaint-field">
        <label htmlFor="complaint-journal-date">{copy('declaredDate')}</label>
        <input
          id="complaint-journal-date"
          type="text"
          inputMode="numeric"
          placeholder="YYYY-MM-DD"
          value={journalDate}
          maxLength={10}
          disabled={disabled}
          aria-describedby="complaint-journal-date-hint"
          onChange={(event) => onDateChange(event.target.value)}
        />
        <span id="complaint-journal-date-hint" className="complaint-muted">
          {copy('dateHint')}
        </span>
      </div>
      {editor.kind === 'journal-correction' ? (
        <label htmlFor="complaint-journal-reason">
          {copy('correctionReason')}
          <textarea
            id="complaint-journal-reason"
            aria-invalid={invalid && !reason.trim()}
            aria-describedby={invalid ? 'complaint-feedback' : undefined}
            value={reason}
            maxLength={1000}
            required
            disabled={disabled}
            onChange={(event) => onReasonChange(event.target.value)}
          />
        </label>
      ) : null}
      <button type="submit" className="complaint-button" disabled={disabled}>
        {editor.kind === 'journal'
          ? copy('recordEntry')
          : copy('recordCorrection')}
      </button>
    </form>
  );
}
