import {
  ApplicationContentSurface,
  ApplicationShell,
} from './production-shell/ApplicationShell';
import { useState } from 'react';
import type { BrowserIdentity } from './access-composition';
import { CompanyContextAccess } from './access/CompanyContextAccess';
import { companyContextAccessCopy } from './access/company-context-access.copy';
import { workspaceMembershipSuspensionCopy } from './access/workspace-membership-suspension.copy';
import { CompanyContextSelector } from './company/CompanyContextSelector';
import { CompanyRegistration } from './company/CompanyRegistration';
import { ClientWorkspace } from './client/ClientWorkspace';
import { clientWorkspaceCopy } from './client/client-workspace.copy';
import { formatApplicationDateTime } from './presentation/date-time';
import { clientUnionCopy } from './client/client-union.copy';
import {
  useProductionShellContext,
  type ActivityLogEvent,
  type ActivityLogState,
} from './production-shell/useProductionShellContext';

export function App({ identity }: { identity: BrowserIdentity }) {
  const [clientAuthorityGeneration, setClientAuthorityGeneration] = useState(0);
  const {
    shellContext: access,
    selectCompany,
    rejectCompanyContext,
    rejectCompanyContextAndRefreshActivity,
    rejectWorkspaceAccess,
    acceptRevalidatedActor,
    includeCompany,
    refreshActivityLog,
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

  const canAccessClients =
    access.actor.workspacePermissions.includes('client.manage') ||
    access.actor.activeCompany?.clientPermissions?.includes('client.read') ===
      true;

  return (
    <ApplicationShell
      activeHref="/"
      navigationItems={[
        { href: '/', label: 'Home' },
        ...(canAccessClients
          ? [{ href: '#clients', label: clientWorkspaceCopy.navigationLabel }]
          : []),
      ]}
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
      {canAccessClients && (
        <ClientWorkspace
          key={`client:${access.sessionGeneration}:${clientAuthorityGeneration}:${access.actor.activeCompany?.id ?? 'no-company'}:${access.actor.activeCompany?.clientPermissionAssignmentId ?? 'no-assignment'}:${access.actor.activeCompany?.clientPermissionSetVersion ?? 'no-version'}`}
          actor={access.actor}
          identity={identity}
          onCompanyContextRejected={rejectCompanyContext}
          onActorRevalidated={acceptRevalidatedActor}
          onWorkspaceAccessRejected={rejectWorkspaceAccess}
          onActivityRecorded={refreshActivityLog}
        />
      )}
      {access.actor.workspacePermissions.includes(
        'company.assignment.manage',
      ) && (
        <CompanyContextAccess
          actor={access.actor}
          identity={identity}
          onActorRevalidated={acceptRevalidatedActor}
          onCompanyContextRejected={rejectCompanyContextAndRefreshActivity}
          onWorkspaceAccessRejected={rejectWorkspaceAccess}
          onActivityRecorded={refreshActivityLog}
          onClientAuthorityChanged={() =>
            setClientAuthorityGeneration((generation) => generation + 1)
          }
        />
      )}
      {access.actor.workspacePermissions.includes('company.manage') && (
        <CompanyRegistration
          key={`company-registration:${access.sessionGeneration}:${access.actor.activeCompany?.id ?? 'no-company'}`}
          actor={access.actor}
          identity={identity}
          onCompanyContextRejected={rejectCompanyContext}
          onActorRevalidated={acceptRevalidatedActor}
          onWorkspaceAccessRejected={rejectWorkspaceAccess}
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
            <li
              key={
                'projectionReference' in event
                  ? event.projectionReference
                  : event.id
              }
            >
              <div>
                <strong>{activityDescription(event)}</strong>
                <span>Target: {activityTargetDescription(event)}</span>
              </div>
              {'occurredAt' in event && (
                <time dateTime={event.occurredAt}>
                  {formatApplicationDateTime(event.occurredAt)}
                </time>
              )}
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
    ...companyContextAccessCopy.activityActionLabels,
    ...workspaceMembershipSuspensionCopy.activityActionLabels,
    ...clientWorkspaceCopy.activityActionLabels,
    ...clientUnionCopy.actionLabels,
  };
  const actorName =
    'kind' in event.actor ? clientUnionCopy.resolver : event.actor.displayName;
  return `${actorName} ${actionLabels[event.action]}`;
}

function activityTargetDescription(event: ActivityLogEvent): string {
  switch (event.target.type) {
    case 'client_union_operation':
      return clientUnionCopy.title;
    case 'company_role_assignment':
      return `${event.target.internalUserDisplayName} — ${event.target.companyDisplayName}`;
    case 'client_company_relationship':
      return `${event.target.clientDisplayName} — ${event.target.companyDisplayName}`;
    case 'internal_user':
    case 'workspace_membership':
    case 'company':
      return event.target.displayName;
    case 'client_account':
      return event.target.companyDisplayName
        ? `${event.target.displayName} — ${event.target.companyDisplayName}`
        : event.target.displayName;
    default: {
      const exhaustive: never = event.target;
      return exhaustive;
    }
  }
}
