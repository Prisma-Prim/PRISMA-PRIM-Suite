import { taskCopy } from './project/task.copy';
import { projectDocumentsCopy } from './project/project-documents.copy';
import { ProjectWorkspace } from './project/ProjectWorkspace';
import { projectCopy } from './project/project.copy';
import {
  ApplicationContentSurface,
  ApplicationShell,
  type ApplicationSection,
} from './production-shell/ApplicationShell';
import { useCallback, useState } from 'react';
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
import { CommercialIntakeWorkspace } from './commercial-intake/CommercialIntakeWorkspace';
import { commercialIntakeCopy } from './commercial-intake/commercial-intake.copy';
import {
  useProductionShellContext,
  type ActivityLogEvent,
  type ActivityLogState,
} from './production-shell/useProductionShellContext';

export function App({ identity }: { identity: BrowserIdentity }) {
  const [clientAuthorityGeneration, setClientAuthorityGeneration] = useState(0);
  const [projectClientFilter, setProjectClientFilter] = useState<{
    companyId: string;
    clientDossierId: string;
    displayName: string;
  }>();
  const [requestedClientDossier, setRequestedClientDossier] = useState<{
    companyId: string;
    clientDossierId: string;
    requestId: number;
  }>();
  const navigateToSection = useCallback((section: 'clients' | 'projects') => {
    const nextUrl = new URL(window.location.href);
    nextUrl.hash = section;
    window.history.pushState(window.history.state, '', nextUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.requestAnimationFrame(() => {
      const destination = document.getElementById(section);
      destination?.scrollIntoView({ block: 'start' });
      destination?.focus();
    });
  }, []);
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
  const canAccessProjects =
    activeCompanyId !== undefined &&
    access.actor.activeCompany?.projectPermissions?.includes('project.read') ===
      true &&
    canAccessClients;
  const commercialPermissions =
    access.actor.activeCompany?.commercialIntakePermissions ?? [];
  const canAccessCommercial =
    activeCompanyId !== undefined &&
    commercialPermissions.includes('commercial.request.read') &&
    commercialPermissions.includes('commercial.request.create') &&
    commercialPermissions.includes('commercial.opportunity.read') &&
    commercialPermissions.includes('commercial.opportunity.create');
  const requestedClientDossierRequest =
    requestedClientDossier === undefined
      ? undefined
      : requestedClientDossier.companyId === activeCompanyId
        ? requestedClientDossier
        : undefined;

  const sections: ApplicationSection[] = [];
  if (canAccessCommercial && access.actor.activeCompany)
    sections.push({
      id: 'requests',
      ...prismeCopy.sections.requests,
      content: (
        <CommercialIntakeWorkspace
          key={`commercial-intake:${access.sessionGeneration}:${access.actor.activeCompany.id}:${access.actor.activeCompany.commercialIntakePermissionAssignmentId ?? 'no-assignment'}:${access.actor.activeCompany.commercialIntakePermissionSetVersion ?? 'no-version'}`}
          actor={access.actor}
          identity={identity}
          onCompanyContextRejected={rejectCompanyContext}
          onActorRevalidated={acceptRevalidatedActor}
          onWorkspaceAccessRejected={rejectWorkspaceAccess}
          onActivityRecorded={refreshActivityLog}
        />
      ),
    });
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
          requestedClientDossierRequest={requestedClientDossierRequest}
          onOpenProjects={
            canAccessProjects && activeCompanyId
              ? (client) => {
                  setProjectClientFilter({
                    companyId: activeCompanyId,
                    clientDossierId: client.id,
                    displayName: client.displayName,
                  });
                  navigateToSection('projects');
                }
              : undefined
          }
        />
      ),
    });
  if (canAccessProjects && access.actor.activeCompany)
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
          onOpenClientDossier={(clientDossierId) => {
            setRequestedClientDossier((current) => ({
              companyId: activeCompanyId,
              clientDossierId,
              requestId: (current?.requestId ?? 0) + 1,
            }));
            navigateToSection('clients');
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
    'client_request.created': 'captured a Client Request',
    'opportunity.created': 'created an initial Opportunity',
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
      return `${documentsCopy.activityTarget}: ${event.target.documentTitle} — ${projectCopy.activityTarget}: ${event.target.projectTitle}`;
    case 'document':
      return `${documentsCopy.activityTarget}: ${event.action === 'document.corrected' ? event.target.documentId : event.target.documentTitle}`;
    case 'project':
      return `${projectCopy.activityTarget}: ${event.target.projectTitle}`;
    case 'client_request':
      return commercialIntakeCopy.title;
    case 'opportunity':
      return commercialIntakeCopy.initialOpportunity;
    case 'task':
      return `${taskCopy.activityTarget}: ${event.target.taskTitle}`;
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
