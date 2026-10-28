import { useLayoutEffect, useRef } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import { useOperationalRiskCopy } from './operational-risk.copy';
import type { OperationalRiskJournalStatement as Statement } from './operational-risk.types';

export function OperationalRiskJournalStatement({
  value,
  revision,
  canCorrect,
  disabled,
  editing,
  onCorrect,
}: {
  value: Statement;
  revision: number;
  canCorrect: boolean;
  disabled: boolean;
  editing: boolean;
  onCorrect: () => void;
}) {
  const copy = useOperationalRiskCopy();
  const { formatDate, formatDateTime } = useInterfaceLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (!editing) heading.current?.focus();
  }, [value.originalEntry.id, value.currentEntry.id, editing]);
  const current = value.currentEntry;
  const original = value.originalEntry;
  const historical = value.revision < revision;
  function facts(entry: Statement['currentEntry']) {
    return (
      <>
        <p className="risk-literal">{entry.narrative}</p>
        <p>
          {copy('occurredOn')}:{' '}
          {entry.occurredOn === null
            ? copy('unknown')
            : formatDate(`${entry.occurredOn}T00:00:00.000Z`)}
        </p>
      </>
    );
  }
  return (
    <section
      className="risk-panel risk-journal-statement"
      aria-label={copy('currentStatement')}
    >
      <h3 ref={heading} tabIndex={-1}>
        {copy('currentStatement')}
      </h3>
      <p>
        {copy(original.kind)} · {copy('revision')} {value.revision}
      </p>
      {historical && <p role="status">{copy('historicalStatement')}</p>}
      <h4>{copy('originalStatement')}</h4>
      <p>
        {copy('originalStatement')}: <code>{original.id}</code> ·{' '}
        {copy('revision')} {original.revision}
      </p>
      <p>
        {copy('originalAttribution')}:{' '}
        <strong>{original.actor.displayName}</strong> ·{' '}
        {formatDateTime(original.recordedAt)}
      </p>
      {facts(original)}
      <h4>{copy('currentStatement')}</h4>
      {facts(current)}
      {current.kind === 'journal-corrected' ? (
        <>
          <p>
            {copy('correctionAttribution')}:{' '}
            <strong>{current.actor.displayName}</strong> ·{' '}
            {formatDateTime(current.recordedAt)}
          </p>
          <p className="risk-literal">
            {copy('reason')}: {current.reason}
          </p>
          <p>
            {copy('journalPredecessor')}: <code>{current.predecessorId}</code>
          </p>
        </>
      ) : (
        <p>{copy('noJournalCorrection')}</p>
      )}
      {canCorrect && (
        <button
          className="risk-primary"
          type="button"
          disabled={disabled || historical}
          onClick={onCorrect}
        >
          {copy('correctStatement')}
        </button>
      )}
    </section>
  );
}
