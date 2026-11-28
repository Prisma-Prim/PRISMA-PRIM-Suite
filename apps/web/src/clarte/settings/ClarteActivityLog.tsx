import { formatMessage } from '../../localization/messages';
import type { RequestedVersion } from '../../commercial-intake/CommercialIntakeWorkspace';
import { useActivityLogDisplay } from '../../production-shell/activity-log-display';
import type { ActivityLogState } from '../../production-shell/company-context-transitions';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';

/**
 * The Activity Log in the Settings console (EX-031, EX-032): who did what, on
 * which target and when, narrated in the interface language, with the
 * Request, Offer Version or agreement version a row can open. App reads the
 * log; this screen only presents what App admitted.
 */
export function ClarteActivityLog({
  state,
  activeCompanyId,
  onOpenRequest,
}: Readonly<{
  state: ActivityLogState;
  activeCompanyId: string | undefined;
  /** Present only while the frame offers the Requests section. */
  onOpenRequest:
    ((clientRequestId: string, version?: RequestedVersion) => void) | undefined;
}>) {
  const display = useActivityLogDisplay();
  if (state.status === 'loading')
    return <ClarteLoadingState label={display.message('loading')} />;
  if (state.status === 'error')
    return <ClarteErrorState title={display.message('error')} />;
  if (state.events.length === 0)
    return <ClarteEmptyState title={display.message('empty')} />;
  return (
    <ClarteCard>
      <ol className="clarte-activity-list">
        {state.events.map((event) => {
          const entry =
            'projectionReference' in event
              ? event.projectionReference
              : event.id;
          const opened = onOpenRequest
            ? display.openIntent({ event, activeCompanyId })
            : undefined;
          const targetId = `clarte-activity-target-${entry}`;
          return (
            <li key={entry}>
              {'occurredAt' in event ? (
                <time dateTime={event.occurredAt}>
                  {display.formatDateTime(event.occurredAt)}
                </time>
              ) : (
                <span aria-hidden="true" />
              )}
              <div className="clarte-activity-text">
                <strong>{display.describe(event)}</strong>
                <span id={targetId}>
                  {formatMessage(display.message('target'), {
                    value: display.targetDescription(event),
                  })}
                </span>
              </div>
              {opened && onOpenRequest ? (
                <ClarteButton
                  size="small"
                  aria-describedby={targetId}
                  onClick={() =>
                    onOpenRequest(opened.clientRequestId, opened.version)
                  }
                >
                  {opened.label}
                </ClarteButton>
              ) : null}
            </li>
          );
        })}
      </ol>
    </ClarteCard>
  );
}
