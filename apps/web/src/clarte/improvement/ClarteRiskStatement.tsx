import { useLayoutEffect, useRef } from 'react';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { useOperationalRiskCopy } from '../../operational-risk/operational-risk.copy';
import type { OperationalRiskJournalStatement as Statement } from '../../operational-risk/operational-risk.types';
import { ClarteButton } from '../components/ClarteButton';
import { useFactLabel } from './risk-fact-label';

/**
 * One log statement in Clarté: the original note beside its current text,
 * with who corrected it, when and why. Focus moves to it when it is read.
 */
export function ClarteRiskStatement({
  value,
  revision,
  canCorrect,
  disabled,
  editing,
  onCorrect,
}: Readonly<{
  value: Statement;
  revision: number;
  canCorrect: boolean;
  disabled: boolean;
  editing: boolean;
  onCorrect: () => void;
}>) {
  const copy = useOperationalRiskCopy();
  const label = useFactLabel();
  const { formatDate, formatDateTime } = useInterfaceLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (!editing) heading.current?.focus();
  }, [value.originalEntry.id, value.currentEntry.id, editing]);
  const current = value.currentEntry;
  const original = value.originalEntry;
  const historical = value.revision < revision;
  const occurred = (occurredOn: string | null) => (
    <p className="clarte-improvement-meta">
      {label('occurredOn')}:{' '}
      {occurredOn === null
        ? copy('unknown')
        : formatDate(`${occurredOn}T00:00:00.000Z`)}
    </p>
  );
  return (
    <section
      aria-label={copy('currentStatement')}
      className="clarte-improvement-section clarte-improvement-statement"
    >
      <h3 ref={heading} tabIndex={-1}>
        {copy('currentStatement')}
      </h3>
      <p className="clarte-improvement-meta">
        {copy(original.kind)} · {copy('revision')} {value.revision}
      </p>
      {historical && (
        <p role="status" className="clarte-improvement-notice">
          {copy('historicalStatement')}
        </p>
      )}
      <div className="clarte-improvement-compare">
        <div>
          <h4>{copy('originalStatement')}</h4>
          <p className="clarte-improvement-literal">{original.narrative}</p>
          {occurred(original.occurredOn)}
          <dl className="clarte-improvement-facts">
            <div>
              <dt>{copy('originalAttribution')}</dt>
              <dd>
                <strong>{original.actor.displayName}</strong> ·{' '}
                {formatDateTime(original.recordedAt)}
              </dd>
            </div>
            <div>
              <dt>{copy('originalStatement')}</dt>
              <dd>
                <code>{original.id}</code> · {copy('revision')}{' '}
                {original.revision}
              </dd>
            </div>
          </dl>
        </div>
        <div>
          <h4>{copy('currentStatement')}</h4>
          <p className="clarte-improvement-literal">{current.narrative}</p>
          {occurred(current.occurredOn)}
          {current.kind === 'journal-corrected' ? (
            <dl className="clarte-improvement-facts">
              <div>
                <dt>{copy('correctionAttribution')}</dt>
                <dd>
                  <strong>{current.actor.displayName}</strong> ·{' '}
                  {formatDateTime(current.recordedAt)}
                </dd>
              </div>
              <div>
                <dt>{copy('reason')}</dt>
                <dd className="clarte-improvement-literal">{current.reason}</dd>
              </div>
              <div>
                <dt>{copy('journalPredecessor')}</dt>
                <dd>
                  <code>{current.predecessorId}</code>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="clarte-improvement-quiet">
              {copy('noJournalCorrection')}
            </p>
          )}
        </div>
      </div>
      {canCorrect && (
        <div className="clarte-improvement-actions">
          <ClarteButton
            variant="primary"
            disabled={disabled || historical}
            onClick={onCorrect}
          >
            {copy('correctStatement')}
          </ClarteButton>
        </div>
      )}
    </section>
  );
}
