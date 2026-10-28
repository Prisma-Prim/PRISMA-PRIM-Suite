import { useInterfaceLocale } from '../localization/interface-locale';
import { useOperationalRiskCopy } from './operational-risk.copy';
import { OperationalRiskFactsView } from './OperationalRiskFactsView';
import type {
  OperationalRiskEntry,
  OperationalRiskPage,
} from './operational-risk.types';

type History =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      value: OperationalRiskPage<OperationalRiskEntry>;
      more: 'idle' | 'loading' | 'error';
    };

export function OperationalRiskHistory({
  history,
  busy,
  canSelect,
  currentEntryId,
  onView,
  onOlder,
}: {
  history: History;
  busy: boolean;
  canSelect: boolean;
  currentEntryId: string | undefined;
  onView: (root: string) => void;
  onOlder: () => void;
}) {
  const copy = useOperationalRiskCopy();
  const { formatDate, formatDateTime } = useInterfaceLocale();
  return (
    <>
      <h4>{copy('history')}</h4>
      {history.kind === 'loading' ? (
        <p role="status">{copy('loading')}</p>
      ) : history.kind === 'error' ? (
        <p role="alert">{copy('loadError')}</p>
      ) : (
        <>
          <ol className="risk-history">
            {history.value.items.map((entry) => (
              <li key={entry.id}>
                <div className="risk-detail-heading">
                  <strong>{copy(entry.kind)}</strong>
                  <span>
                    {copy('revision')} {entry.revision}
                  </span>
                </div>
                <p>
                  {copy('author')}: <strong>{entry.actor.displayName}</strong> ·{' '}
                  {formatDateTime(entry.recordedAt)}
                </p>
                {entry.kind === 'intake-recorded' ||
                entry.kind === 'intake-corrected' ? (
                  <>
                    <OperationalRiskFactsView facts={entry.facts} />
                    {entry.kind === 'intake-corrected' && (
                      <>
                        <p className="risk-literal">
                          {copy('reason')}: {entry.reason}
                        </p>
                        <p>
                          {copy('predecessor')}:{' '}
                          <code>{entry.predecessorId}</code>
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <p className="risk-literal">{entry.narrative}</p>
                    <p>
                      {copy('occurredOn')}:{' '}
                      {entry.occurredOn === null
                        ? copy('unknown')
                        : formatDate(`${entry.occurredOn}T00:00:00.000Z`)}
                    </p>
                    {entry.kind === 'journal-corrected' && (
                      <>
                        <p className="risk-literal">
                          {copy('reason')}: {entry.reason}
                        </p>
                        <p>
                          {copy('journalPredecessor')}:{' '}
                          <code>{entry.predecessorId}</code>
                        </p>
                        <p>
                          {copy(
                            currentEntryId === entry.id
                              ? 'currentStatement'
                              : 'historicalStatement',
                          )}
                        </p>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={busy || !canSelect}
                      onClick={() =>
                        onView(
                          entry.kind === 'journal-corrected'
                            ? entry.originalEntryId
                            : entry.id,
                        )
                      }
                    >
                      {copy('viewStatement')}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ol>
          {history.more === 'error' && <p role="alert">{copy('loadError')}</p>}
          {history.value.next_cursor && (
            <button
              type="button"
              disabled={busy || history.more === 'loading'}
              onClick={onOlder}
            >
              {copy(history.more === 'loading' ? 'loading' : 'more')}
            </button>
          )}
        </>
      )}
    </>
  );
}
