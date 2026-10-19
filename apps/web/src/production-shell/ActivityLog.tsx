import { formatMessage } from '../localization/messages';
import type { RequestedVersion } from '../commercial-intake/CommercialIntakeWorkspace';
import type {
  ActivityLogEvent,
  ActivityLogState,
} from './company-context-transitions';
import { useActivityLogDisplay } from './activity-log-display';

/** Presentation of the existing proved page; no read, command or intent state. */
export function ActivityLog({
  state,
  activeCompanyId,
  onOpenRequest,
}: {
  state: ActivityLogState;
  activeCompanyId: string | undefined;
  /** Present only while the shell offers the Requests section. */
  onOpenRequest:
    ((clientRequestId: string, version?: RequestedVersion) => void) | undefined;
}) {
  const display = useActivityLogDisplay();
  return (
    <section
      className="activity-log"
      id="activity"
      tabIndex={-1}
      aria-labelledby="activity-log-title"
    >
      <div className="activity-log-heading">
        <p className="eyebrow">{display.message('eyebrow')}</p>
        <h2 id="activity-log-title">{display.message('title')}</h2>
      </div>
      {state.status === 'loading' && (
        <p role="status">{display.message('loading')}</p>
      )}
      {state.status === 'error' && (
        <p role="alert">{display.message('error')}</p>
      )}
      {state.status === 'ready' && state.events.length === 0 && (
        <p>{display.message('empty')}</p>
      )}
      {state.status === 'ready' && state.events.length > 0 && (
        <ActivityLogEntries
          events={state.events}
          activeCompanyId={activeCompanyId}
          onOpenRequest={onOpenRequest}
          idPrefix="activity-log"
        />
      )}
    </section>
  );
}

/** Shared narration and target actions for already-admitted Activity events. */
export function ActivityLogEntries({
  events,
  activeCompanyId,
  onOpenRequest,
  idPrefix,
}: {
  events: ActivityLogEvent[];
  activeCompanyId: string | undefined;
  onOpenRequest:
    ((clientRequestId: string, version?: RequestedVersion) => void) | undefined;
  idPrefix: string;
}) {
  const display = useActivityLogDisplay();
  return (
    <ol className="activity-log-list">
      {events.map((event) => {
        const entry =
          'projectionReference' in event ? event.projectionReference : event.id;
        const openedRequest = onOpenRequest
          ? display.openIntent({ event, activeCompanyId })
          : undefined;
        const targetId = `${idPrefix}-target-${entry}`;
        return (
          <li key={entry}>
            <div>
              <strong>{display.describe(event)}</strong>
              <span id={openedRequest ? targetId : undefined}>
                {formatMessage(display.message('target'), {
                  value: display.targetDescription(event),
                })}
              </span>
              {openedRequest && onOpenRequest ? (
                <button
                  type="button"
                  className="activity-log-open-request"
                  aria-describedby={targetId}
                  onClick={() =>
                    onOpenRequest(
                      openedRequest.clientRequestId,
                      openedRequest.version,
                    )
                  }
                >
                  {openedRequest.label}
                </button>
              ) : null}
            </div>
            {'occurredAt' in event && (
              <time dateTime={event.occurredAt}>
                {display.formatDateTime(event.occurredAt)}
              </time>
            )}
          </li>
        );
      })}
    </ol>
  );
}
