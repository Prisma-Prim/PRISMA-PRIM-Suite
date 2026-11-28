import {
  useId,
  useLayoutEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { useOperationalRiskCopy } from '../../operational-risk/operational-risk.copy';
import type {
  Editor,
  FactsDraft,
} from '../../operational-risk/operational-risk.editor';
import { ClarteButton } from '../components/ClarteButton';
import {
  ClarteField,
  type ClarteFieldControl,
} from '../components/ClarteField';
import { useClarteImprovementCopy } from './clarte-improvement.copy';

const factLimits = {
  process: 300,
  cause: 2000,
  effect: 2000,
  plannedMeasure: 2000,
  existingMeasures: 2000,
  sourceDescription: 300,
  plannedDate: 10,
} satisfies Record<keyof FactsDraft, number>;
const requiredFacts: ReadonlySet<keyof FactsDraft> = new Set([
  'process',
  'cause',
  'effect',
  'plannedMeasure',
]);
/** The facts as the form lays them out: three wide, then two pairs. */
const factRows: readonly (readonly (keyof FactsDraft)[])[] = [
  ['process'],
  ['cause'],
  ['effect'],
  ['existingMeasures', 'plannedMeasure'],
  ['plannedDate', 'sourceDescription'],
];
type EditorStatus = 'editable' | 'invalid' | 'conflict' | 'reviewed';

/**
 * The Clarté form of a Risk command: recording, fact correction, log note or
 * statement correction. Presentation only: the Risk owner keeps the draft,
 * the frozen command and its retry.
 */
export function ClarteRiskEditor({
  editor,
  companyName,
  busy,
  status,
  onChange,
  onSubmit,
  onContinue,
  onCancel,
}: Readonly<{
  editor: Editor;
  companyName: string;
  busy: boolean;
  status: EditorStatus;
  onChange: (editor: Editor) => void;
  onSubmit: (event: FormEvent) => void;
  onContinue: () => void;
  onCancel: () => void;
}>) {
  const copy = useOperationalRiskCopy();
  const text = useClarteImprovementCopy();
  const { formatDateTime } = useInterfaceLocale();
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    form.current
      ?.querySelector<HTMLElement>('input:not([type="radio"]), textarea')
      ?.focus();
  }, [editor.kind]);
  const errorId = `${id}-error`;
  const invalid = status === 'invalid';
  const blocked = status === 'conflict' || status === 'reviewed';
  const title =
    editor.kind === 'record'
      ? copy('newIntake')
      : editor.kind === 'correct'
        ? copy('correct')
        : editor.kind === 'journal-correct'
          ? copy('correctStatement')
          : text('addNote');
  function change(next: Editor) {
    if (!busy) onChange(next);
  }
  /** The field's own descriptions, plus the refusal while it stands. */
  function control(field: ClarteFieldControl, required: boolean) {
    return {
      ...field,
      'aria-describedby':
        [field['aria-describedby'], invalid ? errorId : undefined]
          .filter(Boolean)
          .join(' ') || undefined,
      'aria-invalid': invalid && required ? true : undefined,
      required,
      disabled: busy,
      className: 'clarte-input',
    };
  }
  function facts(value: Extract<Editor, { kind: 'record' | 'correct' }>) {
    return factRows.map((row) => (
      <div
        key={row.join('-')}
        className={
          row.length > 1 ? 'clarte-improvement-pair' : 'clarte-improvement-one'
        }
      >
        {row.map((name) => {
          const required = requiredFacts.has(name);
          const label = required
            ? `${copy(name)} · ${copy('required')}`
            : copy(name);
          const onFact = (event: { target: { value: string } }) =>
            change({
              ...value,
              facts: { ...value.facts, [name]: event.target.value },
            });
          return (
            <ClarteField key={name} label={label}>
              {(field) =>
                name === 'plannedDate' ? (
                  <input
                    {...control(field, required)}
                    type="date"
                    value={value.facts[name]}
                    onChange={onFact}
                  />
                ) : name === 'process' || name === 'sourceDescription' ? (
                  <input
                    {...control(field, required)}
                    type="text"
                    maxLength={factLimits[name]}
                    value={value.facts[name]}
                    onChange={onFact}
                  />
                ) : (
                  <textarea
                    {...control(field, required)}
                    rows={name === 'cause' || name === 'effect' ? 2 : 3}
                    maxLength={factLimits[name]}
                    value={value.facts[name]}
                    onChange={onFact}
                  />
                )
              }
            </ClarteField>
          );
        })}
      </div>
    ));
  }
  let fields: ReactNode;
  if (editor.kind === 'journal' || editor.kind === 'journal-correct')
    fields = (
      <>
        {editor.kind === 'journal' && (
          <fieldset className="clarte-improvement-choice" disabled={busy}>
            <legend>{copy('kind')}</legend>
            {(['observation', 'reassessment'] as const).map((kind) => (
              <label key={kind}>
                <input
                  type="radio"
                  name={`${id}-kind`}
                  value={kind}
                  checked={editor.entryKind === kind}
                  onChange={() => change({ ...editor, entryKind: kind })}
                />
                <span>{copy(kind)}</span>
              </label>
            ))}
          </fieldset>
        )}
        <ClarteField label={copy('narrative')}>
          {(field) => (
            <textarea
              {...control(field, true)}
              rows={4}
              maxLength={5000}
              value={editor.narrative}
              onChange={(event) =>
                change({ ...editor, narrative: event.target.value })
              }
            />
          )}
        </ClarteField>
        <ClarteField label={copy('occurredOn')}>
          {(field) => (
            <input
              {...control(field, false)}
              type="date"
              className="clarte-input clarte-improvement-date"
              value={editor.occurredOn}
              onChange={(event) =>
                change({ ...editor, occurredOn: event.target.value })
              }
            />
          )}
        </ClarteField>
      </>
    );
  else fields = facts(editor);
  return (
    <form
      ref={form}
      className="clarte-improvement-form clarte-improvement-editor"
      aria-label={title}
      onSubmit={onSubmit}
      noValidate
    >
      {editor.kind !== 'record' && <h3>{title}</h3>}
      {editor.kind === 'journal-correct' && (
        <dl className="clarte-improvement-facts clarte-improvement-context">
          <div>
            <dt>{copy('originalStatement')}</dt>
            <dd>
              {companyName} · {copy(editor.originalEntry.kind)} ·{' '}
              {copy('revision')} {editor.originalEntry.revision}
              <br />
              <code>{editor.originalEntry.id}</code>
            </dd>
          </div>
          <div>
            <dt>{copy('originalAttribution')}</dt>
            <dd>
              {editor.originalEntry.actor.displayName} ·{' '}
              {formatDateTime(editor.originalEntry.recordedAt)}
            </dd>
          </div>
        </dl>
      )}
      {invalid && (
        <p
          id={errorId}
          role="alert"
          className="clarte-improvement-notice clarte-improvement-notice--danger"
        >
          {copy('invalid')}
        </p>
      )}
      {fields}
      {(editor.kind === 'correct' || editor.kind === 'journal-correct') && (
        <ClarteField label={copy('reason')}>
          {(field) => (
            <textarea
              {...control(field, true)}
              rows={2}
              maxLength={2000}
              value={editor.reason}
              onChange={(event) =>
                change({ ...editor, reason: event.target.value })
              }
            />
          )}
        </ClarteField>
      )}
      {status === 'reviewed' && (
        <div role="status" className="clarte-improvement-notice">
          <p>{copy('reviewDraft')}</p>
          <ClarteButton variant="primary" size="small" onClick={onContinue}>
            {copy('continueReviewed')}
          </ClarteButton>
        </div>
      )}
      <div className="clarte-improvement-actions">
        <ClarteButton disabled={busy} onClick={onCancel}>
          {copy('cancel')}
        </ClarteButton>
        <ClarteButton
          type="submit"
          variant="primary"
          disabled={busy || blocked}
        >
          {copy('save')}
        </ClarteButton>
      </div>
    </form>
  );
}
