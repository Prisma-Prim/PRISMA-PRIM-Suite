import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { useSessionRevocations } from './use-session-revocations';
import { useSessionRevocationCopy } from './workspace-session-revocation.copy';

export function WorkspaceSessionRevocations(
  props: Readonly<{
    actor: ActorContext;
    identity: BrowserIdentity;
    onWorkspaceAccessRejected: () => Promise<void> | void;
    onActivityRecorded: () => Promise<void> | void;
  }>,
) {
  const copy = useSessionRevocationCopy();
  const { allowed: canManage, state, load } = useSessionRevocations(props);
  if (!canManage) return null;
  return (
    <section
      aria-label={copy.title}
      className="session-revocations session-revocations--prisme"
    >
      <h3>{copy.title}</h3>
      <p>{copy.description}</p>
      <button
        type="button"
        className="company-access-secondary-action"
        disabled={state.kind === 'loading'}
        onClick={() => void load()}
      >
        {copy.refresh}
      </button>
      {state.kind === 'loading' && <p role="status">{copy.pending}</p>}
      {state.kind === 'error' && <p role="alert">{copy.error}</p>}
      {state.kind === 'ready' && (
        <>
          {state.page.records.length === 0 && <p>{copy.empty}</p>}
          <ul className="session-revocation-list">
            {state.page.records.map((row) => (
              <li key={row.workspaceMembershipId} data-status={row.status}>
                <strong>{row.displayName}</strong>
                <p>{copy.status[row.status]}</p>
                {(row.status === 'pending' ||
                  row.status === 'retry_required') && (
                  <button
                    type="button"
                    className="company-access-primary-action"
                    onClick={() =>
                      void load(undefined, row.workspaceMembershipId)
                    }
                  >
                    {copy.retry}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {state.page.nextCursor && (
            <button
              type="button"
              className="company-access-secondary-action"
              onClick={() => {
                if (state.page.nextCursor) void load(state.page.nextCursor);
              }}
            >
              {copy.more}
            </button>
          )}
        </>
      )}
    </section>
  );
}
