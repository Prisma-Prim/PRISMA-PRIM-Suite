import { useId, useLayoutEffect, useRef, type FormEvent } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import { Select } from '../presentation/Select';
import { useOperationalRiskCopy } from './operational-risk.copy';
import {
  factFields,
  type Editor,
  type FactsDraft,
} from './operational-risk.editor';

const factLimits = {
  process: 300,
  cause: 2000,
  effect: 2000,
  plannedMeasure: 2000,
  existingMeasures: 2000,
  sourceDescription: 300,
  plannedDate: 10,
} satisfies Record<keyof FactsDraft, number>;

/** Presentation only: the scoped workspace owns the draft and frozen command. */
export function OperationalRiskEditor({
  editor,
  companyName,
  busy,
  status,
  onChange,
  onSubmit,
  onContinue,
  onCancel,
}: {
  editor: Editor;
  companyName: string;
  busy: boolean;
  status: 'editable' | 'invalid' | 'conflict' | 'reviewed';
  onChange: (editor: Editor) => void;
  onSubmit: (event: FormEvent) => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const copy = useOperationalRiskCopy();
  const { formatDateTime } = useInterfaceLocale();
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    form.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }, [editor.kind]);
  const error = status === 'invalid' ? `${id}-error` : undefined;
  const blocked = status === 'conflict' || status === 'reviewed';
  const label =
    editor.kind === 'record'
      ? 'newIntake'
      : editor.kind === 'correct'
        ? 'correct'
        : editor.kind === 'journal-correct'
          ? 'correctStatement'
          : 'history';
  function change(next: Editor) {
    if (!busy) onChange(next);
  }
  function facts(value: Extract<Editor, { kind: 'record' | 'correct' }>) {
    return factFields.map((name) => {
      const required =
        name === 'process' ||
        name === 'cause' ||
        name === 'effect' ||
        name === 'plannedMeasure';
      const control = {
        id: `${id}-${name}`,
        required,
        maxLength: factLimits[name],
        value: value.facts[name],
        disabled: busy,
        'aria-describedby': error,
        'aria-invalid': status === 'invalid' ? true : undefined,
        onChange: (event: { target: { value: string } }) =>
          change({
            ...value,
            facts: { ...value.facts, [name]: event.target.value },
          }),
      };
      return (
        <div className="risk-field" key={name}>
          <label htmlFor={control.id}>
            {copy(name)}
            {required && (
              <span className="risk-required"> · {copy('required')}</span>
            )}
          </label>
          {name === 'plannedDate' ? (
            <input {...control} type="date" />
          ) : (
            <textarea {...control} />
          )}
        </div>
      );
    });
  }
  return (
    <form
      ref={form}
      className="risk-panel risk-editor"
      onSubmit={onSubmit}
      noValidate
      aria-describedby={error}
    >
      <h3>{copy(label)}</h3>
      {editor.kind === 'journal-correct' && (
        <div className="risk-editor-context">
          <p>
            <strong>{companyName}</strong> · {copy(editor.originalEntry.kind)}
          </p>
          <p>
            {copy('originalStatement')}: <code>{editor.originalEntry.id}</code>{' '}
            · {copy('revision')} {editor.originalEntry.revision}
          </p>
          <p>
            {copy('originalAttribution')}:{' '}
            {editor.originalEntry.actor.displayName} ·{' '}
            {formatDateTime(editor.originalEntry.recordedAt)}
          </p>
        </div>
      )}
      {status === 'invalid' && (
        <p id={error} role="alert">
          {copy('invalid')}
        </p>
      )}
      {editor.kind === 'journal' || editor.kind === 'journal-correct' ? (
        <>
          {editor.kind === 'journal' && (
            <div className="risk-field">
              <label htmlFor={`${id}-kind`}>{copy('kind')}</label>
              <Select
                id={`${id}-kind`}
                value={editor.entryKind}
                disabled={busy}
                options={[
                  { value: 'observation', label: copy('observation') },
                  { value: 'reassessment', label: copy('reassessment') },
                ]}
                onValueChange={(value) => {
                  if (value === 'observation' || value === 'reassessment')
                    change({ ...editor, entryKind: value });
                }}
              />
            </div>
          )}
          <div className="risk-field">
            <label htmlFor={`${id}-narrative`}>{copy('narrative')}</label>
            <textarea
              id={`${id}-narrative`}
              required
              maxLength={5000}
              disabled={busy}
              value={editor.narrative}
              aria-describedby={error}
              aria-invalid={status === 'invalid' ? true : undefined}
              onChange={(event) =>
                change({ ...editor, narrative: event.target.value })
              }
            />
          </div>
          <div className="risk-field">
            <label htmlFor={`${id}-occurredOn`}>{copy('occurredOn')}</label>
            <input
              type="date"
              id={`${id}-occurredOn`}
              disabled={busy}
              value={editor.occurredOn}
              aria-describedby={error}
              onChange={(event) =>
                change({ ...editor, occurredOn: event.target.value })
              }
            />
          </div>
        </>
      ) : (
        facts(editor)
      )}
      {(editor.kind === 'correct' || editor.kind === 'journal-correct') && (
        <div className="risk-field">
          <label htmlFor={`${id}-reason`}>{copy('reason')}</label>
          <textarea
            id={`${id}-reason`}
            required
            maxLength={2000}
            disabled={busy}
            value={editor.reason}
            aria-describedby={error}
            aria-invalid={status === 'invalid' ? true : undefined}
            onChange={(event) =>
              change({ ...editor, reason: event.target.value })
            }
          />
        </div>
      )}
      {status === 'reviewed' && (
        <div className="risk-command-state" role="status">
          <p>{copy('reviewDraft')}</p>
          <button className="risk-primary" type="button" onClick={onContinue}>
            {copy('continueReviewed')}
          </button>
        </div>
      )}
      <div className="risk-actions">
        <button
          className="risk-primary"
          type="submit"
          disabled={busy || blocked}
        >
          {copy('save')}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          {copy('cancel')}
        </button>
      </div>
    </form>
  );
}
