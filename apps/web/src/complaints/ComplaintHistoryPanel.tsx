import { useInterfaceLocale } from '../localization/interface-locale';
import type {
  ComplaintHistory,
  ComplaintHistoryEntry,
} from './complaints-response';
import { useComplaintCopy } from './complaints.copy';
import { IntakeFacts, Pagination } from './ComplaintIntakeViews';

export function ComplaintHistoryPanel({
  history,
  canCorrect,
  disabled,
  onReload,
  onPageChange,
  onCorrect,
}: {
  history:
    | { status: 'loading' | 'error' | 'denied' }
    | { status: 'ready'; value: ComplaintHistory };
  canCorrect: boolean;
  disabled: boolean;
  onReload: () => void;
  onPageChange: (offset: number) => void;
  onCorrect: (
    entry: Extract<ComplaintHistoryEntry, { kind: 'action' | 'response' }>,
  ) => void;
}) {
  const copy = useComplaintCopy();
  const { formatDate, formatDateTime, formatNumber } = useInterfaceLocale();
  return (
    <section className="complaint-card" aria-label={copy('history')}>
      <h3>{copy('history')}</h3>
      {history.status === 'loading' ? (
        <p role="status">{copy('loading')}</p>
      ) : null}
      {history.status === 'error' ? (
        <div role="alert">
          <p>{copy('error')}</p>
          <button
            type="button"
            className="complaint-button complaint-button--secondary"
            disabled={disabled}
            onClick={onReload}
          >
            {copy('reload')}
          </button>
        </div>
      ) : null}
      {history.status === 'ready' ? (
        <>
          <ol className="complaint-history">
            {history.value.entries.map((entry) => (
              <li className="complaint-history-entry" key={entry.id}>
                <h4>
                  {copy(
                    entry.kind === 'intake'
                      ? 'originalIntake'
                      : entry.kind === 'intake_correction' ||
                          entry.kind === 'correction'
                        ? 'recordCorrection'
                        : entry.kind,
                  )}
                </h4>
                {'intake' in entry ? (
                  <IntakeFacts intake={entry.intake} />
                ) : (
                  <>
                    <p className="complaint-literal">{entry.text}</p>
                    <p>
                      {copy('declaredDate')}:{' '}
                      {entry.declaredDate === null
                        ? copy('unknownDate')
                        : formatDate(entry.declaredDate)}
                    </p>
                  </>
                )}
                {'reason' in entry && entry.reason !== null ? (
                  <p className="complaint-literal">
                    {copy('correctionReason')}: {entry.reason}
                  </p>
                ) : null}
                {entry.kind === 'correction' ? (
                  <div className="complaint-original-reference">
                    <h5>
                      {copy('correctedOriginal')}: {copy(entry.originalKind)}
                    </h5>
                    <blockquote className="complaint-literal">
                      {entry.original.text}
                    </blockquote>
                    <p>
                      {copy('declaredDate')}:{' '}
                      {entry.original.declaredDate === null
                        ? copy('unknownDate')
                        : formatDate(entry.original.declaredDate)}
                    </p>
                    <p className="complaint-muted">
                      {entry.original.actor.displayLabel} ·{' '}
                      {formatDateTime(entry.original.recordedAt)} ·{' '}
                      {copy('revision')}:{' '}
                      {formatNumber(entry.original.revision)}
                    </p>
                  </div>
                ) : null}
                <p className="complaint-muted">
                  {copy('recordedBy')}: {entry.actor.displayLabel} ·{' '}
                  {copy('recordedAt')}: {formatDateTime(entry.recordedAt)} ·{' '}
                  {copy('revision')}: {formatNumber(entry.revision)}
                </p>
                {entry.kind === 'action' || entry.kind === 'response' ? (
                  <>
                    {entry.corrected ? (
                      <p className="complaint-note">{copy('corrected')}</p>
                    ) : null}
                    {canCorrect ? (
                      <button
                        type="button"
                        className="complaint-button complaint-button--secondary"
                        disabled={disabled}
                        onClick={() => onCorrect(entry)}
                      >
                        {copy('recordCorrection')}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </li>
            ))}
          </ol>
          <Pagination
            offset={history.value.offset}
            total={history.value.total}
            disabled={disabled}
            onChange={onPageChange}
          />
        </>
      ) : null}
    </section>
  );
}
