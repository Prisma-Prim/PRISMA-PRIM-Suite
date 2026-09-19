import { taskCopy } from './project/task.copy';
import { projectDocumentsCopy } from './project/project-documents.copy';
import { ProjectWorkspace } from './project/ProjectWorkspace';
import { projectCopy } from './project/project.copy';
import {
  ApplicationContentSurface,
  ApplicationShell,
  type ApplicationSection,
} from './production-shell/ApplicationShell';
import { useState } from 'react';
import { DocumentWorkspace } from './documents/DocumentWorkspace';
import { documentsCopy } from './documents/documents.copy';
import { prismeCopy } from './production-shell/prisme/prisme.copy';
import type { BrowserIdentity } from './access-composition';
import { CompanyContextAccess } from './access/CompanyContextAccess';
import { WorkspaceInvitations } from './access/WorkspaceInvitations';
import { workspaceInvitationsCopy } from './access/workspace-invitations.copy';
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
  const [projectClientFilter, setProjectClientFilter] = useState<{
    id: string;
    displayName: string;
    companyId: string;
  }>();
  const [requestedClient, setRequestedClient] = useState<{
    id: string;
    companyId: string;
  }>();
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
  const activeCompanyId = access.actor.activeCompany?.id;

  const sections: ApplicationSection[] = [];
  if (access.actor.activeCompany && canAccessClients)
    sections.push({
      id: 'documents',
      label: documentsCopy.title,
      description: documentsCopy.description,
      content: (
        <DocumentWorkspace
          key={`documents:${access.sessionGeneration}:${clientAuthorityGeneration}:${access.actor.activeCompany.id}`}
          actor={access.actor}
          identity={identity}
          onActivityRecorded={refreshActivityLog}
        />
      ),
    });
  if (canAccessClients)
    sections.push({
      id: 'clients',
      ...prismeCopy.sections.clients,
      content: (
        <ClientWorkspace
          key={`client:${access.sessionGeneration}:${clientAuthorityGeneration}:${access.actor.activeCompany?.id ?? 'no-company'}:${access.actor.activeCompany?.clientPermissionAssignmentId ?? 'no-assignment'}:${access.actor.activeCompany?.clientPermissionSetVersion ?? 'no-version'}`}
          actor={access.actor}
          identity={identity}
          onCompanyContextRejected={rejectCompanyContext}
          onActorRevalidated={acceptRevalidatedActor}
          onWorkspaceAccessRejected={rejectWorkspaceAccess}
          onActivityRecorded={refreshActivityLog}
          requestedClientId={
            requestedClient && requestedClient.companyId === activeCompanyId
              ? requestedClient.id
              : undefined
          }
          onOpenProjects={(client) => {
            if (!activeCompanyId) return;
            setProjectClientFilter({
              ...client,
              companyId: activeCompanyId,
            });
            window.location.hash = 'projects';
          }}
        />
      ),
    });
  if (
    access.actor.activeCompany?.projectPermissions?.includes('project.read') &&
    canAccessClients
  )
    sections.push({
      id: 'projects',
      label: projectCopy.title,
      description: projectCopy.navDescription,
      content: (
        <ProjectWorkspace
          key={`project:${access.sessionGeneration}:${clientAuthorityGeneration}:${access.actor.activeCompany.id}`}
          actor={access.actor}
          identity={identity}
          onActivityRecorded={refreshActivityLog}
          clientFilter={
            projectClientFilter?.companyId === activeCompanyId
              ? projectClientFilter
              : undefined
          }
          onOpenClient={(clientAccountId) => {
            if (!activeCompanyId) return;
            setRequestedClient({
              id: clientAccountId,
              companyId: activeCompanyId,
            });
            window.location.hash = 'clients';
          }}
        />
      ),
    });
  if (access.actor.workspacePermissions.includes('company.assignment.manage'))
    sections.push({
      id: 'access',
      ...prismeCopy.sections.access,
      content: (
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
      ),
    });
  if (access.actor.workspacePermissions.includes('company.manage'))
    sections.push({
      id: 'companies',
      ...prismeCopy.sections.companies,
      content: (
        <CompanyRegistration
          key={`company-registration:${access.sessionGeneration}:${access.actor.activeCompany?.id ?? 'no-company'}`}
          actor={access.actor}
          identity={identity}
          onCompanyContextRejected={rejectCompanyContext}
          onActorRevalidated={acceptRevalidatedActor}
          onWorkspaceAccessRejected={rejectWorkspaceAccess}
          onCompanyRegistered={includeCompany}
        />
      ),
    });
  sections.push({
    id: 'activity',
    ...prismeCopy.sections.activity,
    content: <ActivityLog state={access.activityLog} />,
  });
  if (access.actor.workspacePermissions.includes('member.invite'))
    sections.push({
      id: 'invitations',
      ...prismeCopy.sections.invitations,
      content: (
        <WorkspaceInvitations
          key={`invitations:${access.sessionGeneration}`}
          actor={access.actor}
          identity={identity}
          onActivityRecorded={refreshActivityLog}
          onWorkspaceAccessRejected={rejectWorkspaceAccess}
        />
      ),
    });

  return (
    <ApplicationShell
      context={{
        actorName: access.actor.displayName,
        workspaceName: access.actor.workspaceName,
        companyName: access.actor.activeCompany?.displayName,
      }}
      sections={sections}
      companyContext={
        <CompanyContextSelector
          actor={access.actor}
          state={access.companyContext}
          onSelect={selectCompany}
        />
      }
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
    'document.project.linked': projectDocumentsCopy.linked,
    'document.project.unlinked': projectDocumentsCopy.unlinked,
    'document.registered': documentsCopy.activity,
    'document.corrected': documentsCopy.correctionActivity,
    'internal_user.provisioned': 'was provisioned',
    'project.created': projectCopy.activityAction,
    ...taskCopy.activityActionLabels,
    'company.registered': 'registered a Company',
    ...companyContextAccessCopy.activityActionLabels,
    ...workspaceMembershipSuspensionCopy.activityActionLabels,
    ...clientWorkspaceCopy.activityActionLabels,
    ...clientUnionCopy.actionLabels,
    ...workspaceInvitationsCopy.activityActionLabels,
  };
  const actorName =
    'kind' in event.actor ? clientUnionCopy.resolver : event.actor.displayName;
  return `${actorName} ${actionLabels[event.action]}`;
}

function activityTargetDescription(event: ActivityLogEvent): string {
  switch (event.target.type) {
    case 'document_project':
      return `${event.target.documentId} — ${event.target.projectId}`;
    case 'document':
      return event.target.documentId;
    case 'project':
      return event.target.projectId;
    case 'task':
      return event.target.taskId;
    case 'workspace_invitation':
      return event.target.invitationId;
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
