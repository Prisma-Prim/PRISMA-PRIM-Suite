import { useId } from 'react';
import type { RequestedVersion } from '../commercial-intake/CommercialIntakeWorkspace';
import { ActivityLogEntries } from '../production-shell/ActivityLog';
import type { ActivityLogState } from '../production-shell/company-context-transitions';
import { useRecentChangesCopy } from './recent-changes.copy';

export type RecentChangesProps = {
  /** The shell's current guarded Activity page, never a second read/cache. */
  state: ActivityLogState;
  activeCompanyId: string;
  onRefresh: () => Promise<void>;
  onOpenActivity: () => void;
  onOpenRequest:
    ((clientRequestId: string, version?: RequestedVersion) => void) | undefined;
};

export function RecentChanges({
  state,
  activeCompanyId,
  onRefresh,
  onOpenActivity,
  onOpenRequest,
}: RecentChangesProps) {
  const message = useRecentChangesCopy();
  const titleId = useId();
  const entries =
    state.status === 'ready'
      ? state.events.filter((event) => 'occurredAt' in event).slice(0, 5)
      : [];
  return (
    <section className="operational-home-recent" aria-labelledby={titleId}>
      <div className="activity-log-heading">
        <h2 id={titleId}>{message('title')}</h2>
        <p>{message('definition')}</p>
      </div>
      {state.status === 'loading' && <p role="status">{message('loading')}</p>}
      {state.status === 'error' && <p role="alert">{message('error')}</p>}
      {state.status === 'ready' && entries.length === 0 && (
        <p>{message('empty')}</p>
      )}
      {state.status === 'ready' && entries.length > 0 && (
        <ActivityLogEntries
          events={entries}
          activeCompanyId={activeCompanyId}
          onOpenRequest={onOpenRequest}
          idPrefix={titleId}
        />
      )}
      <div className="operational-home-recent-actions">
        <button
          type="button"
          disabled={state.status === 'loading'}
          onClick={() => void onRefresh()}
        >
          {message(state.status === 'error' ? 'retry' : 'refresh')}
        </button>
        <button type="button" onClick={onOpenActivity}>
          {message('openActivity')}
        </button>
      </div>
    </section>
  );
}
