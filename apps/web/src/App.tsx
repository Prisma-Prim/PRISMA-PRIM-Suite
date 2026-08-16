import {
  ApplicationContentSurface,
  ApplicationShell,
} from './production-shell/ApplicationShell';
import type { BrowserIdentity } from './access-composition';
import { CompanyContextAccess } from './access/CompanyContextAccess';
import { CompanyContextSelector } from './company/CompanyContextSelector';
import { CompanyRegistration } from './company/CompanyRegistration';
import { formatApplicationDateTime } from './presentation/date-time';
import {
  useProductionShellContext,
  type ActivityLogEvent,
  type ActivityLogState,
} from './production-shell/useProductionShellContext';

export function App({ identity }: { identity: BrowserIdentity }) {
  const {
    shellContext: access,
    selectCompany,
    rejectCompanyContext,
    includeCompany,
  } = useProductionShellContext(identity);

  if (!identity.loaded)
    return (
      <main className="production-access-state">
        <p role="status">Verifying your access…</p>
      </main>
    );
  if (!identity.signedIn) return <>{identity.signedOutView}</>;
  if (access.status === 'signed-out') return <>{identity.signedOutView}</>;

  if (access.status !== 'active') {
    const messages: Record<'checking' | 'forbidden' | 'error', string> = {
      checking: 'Verifying your access…',
      forbidden: 'Your access to this workspace is inactive.',
      error: 'We could not verify your access. Please try again.',
    };
    return (
      <main className="production-access-state">
        <p role={access.status === 'checking' ? 'status' : 'alert'}>
          {messages[access.status]}
        </p>
      </main>
    );
  }

  return (
    <ApplicationShell
      activeHref="/"
      navigationItems={[{ href: '/', label: 'Home' }]}
      userArea={
        <span>
          <strong>{access.actor.displayName}</strong>
          <small>{access.actor.email}</small>
          <button type="button" onClick={() => void identity.signOut()}>
            Sign out
          </button>
        </span>
      }
    >
      <ApplicationContentSurface>
        <p className="eyebrow">{access.actor.workspaceName}</p>
        <h1>Welcome to PRISMA-PRIM Suite</h1>
        <p>
          This workspace is ready to host your organization&apos;s workflows as
          they become available.
        </p>
      </ApplicationContentSurface>
      <CompanyContextSelector
        actor={access.actor}
        state={access.companyContext}
        onSelect={selectCompany}
      />
      {access.actor.workspacePermissions.includes(
        'company.assignment.manage',
      ) && <CompanyContextAccess actor={access.actor} identity={identity} />}
      {access.actor.workspacePermissions.includes('company.manage') && (
        <CompanyRegistration
          key={`${access.sessionGeneration}:${access.actor.activeCompany?.id ?? 'no-company'}`}
          actor={access.actor}
          identity={identity}
          onCompanyContextRejected={rejectCompanyContext}
          onCompanyRegistered={includeCompany}
        />
      )}
      <ActivityLog state={access.activityLog} />
    </ApplicationShell>
  );
}

function ActivityLog({ state }: { state: ActivityLogState }) {
  return (
    <section className="activity-log" aria-labelledby="activity-log-title">
      <div className="activity-log-heading">
        <p className="eyebrow">Accountability</p>
        <h2 id="activity-log-title">Activity Log</h2>
      </div>
      {state.status === 'loading' && <p role="status">Loading activity…</p>}
      {state.status === 'error' && (
        <p role="alert">
          We could not load the Activity Log. Please try again.
        </p>
      )}
      {state.status === 'ready' && state.events.length === 0 && (
        <p>No activity has been recorded in this workspace yet.</p>
      )}
      {state.status === 'ready' && state.events.length > 0 && (
        <ol className="activity-log-list">
          {state.events.map((event) => (
            <li key={event.id}>
              <div>
                <strong>{activityDescription(event)}</strong>
                <span>Target: {activityTargetDescription(event)}</span>
              </div>
              <time dateTime={event.occurredAt}>
                {formatApplicationDateTime(event.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function activityDescription(event: ActivityLogEvent): string {
  const actionLabels: Record<ActivityLogEvent['action'], string> = {
    'internal_user.provisioned': 'was provisioned',
    'company.registered': 'registered a Company',
    'company_context_assignment.granted': 'granted Company Context Access',
    'company_context_assignment.revoked': 'revoked Company Context Access',
  };
  return `${event.actor.displayName} ${actionLabels[event.action]}`;
}

function activityTargetDescription(event: ActivityLogEvent): string {
  return event.target.type === 'company_role_assignment'
    ? `${event.target.internalUserDisplayName} — ${event.target.companyDisplayName}`
    : event.target.displayName;
}
