import { taskCopy } from './project/task.copy';
import { MyTasks, canReadTasks } from './project/MyTasks';
import { projectDocumentsCopy } from './project/project-documents.copy';
import { ProjectWorkspace } from './project/ProjectWorkspace';
import { projectCopy } from './project/project.copy';
import {
  ApplicationContentSurface,
  ApplicationShell,
  type ApplicationSection,
} from './production-shell/ApplicationShell';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  DocumentWorkspace,
  type RequestedDocument,
} from './documents/DocumentWorkspace';
import { documentsCopy } from './documents/documents.copy';
import { prismeCopy } from './production-shell/prisme/prisme.copy';
import type { BrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
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
import { ServiceCatalogueWorkspace } from './commercial-catalogue/ServiceCatalogueWorkspace';
import { PricingConfigurationWorkspace } from './pricing-configuration/PricingConfigurationWorkspace';
import { TariffVersionPanel } from './pricing-configuration/TariffVersionPanel';
import { commercialIntakeCopy } from './commercial-intake/commercial-intake.copy';
import { OperationalHome } from './operational-home/OperationalHome';
import {
  useProductionShellContext,
  type ActivityLogEvent,
  type ActivityLogState,
  type ProjectResponsibleChangedActivityLogEvent,
} from './production-shell/useProductionShellContext';

export function App({ identity }: { identity: BrowserIdentity }) {
  const [clientAuthorityGeneration, setClientAuthorityGeneration] = useState(0);
  const [projectClientFilter, setProjectClientFilter] = useState<{
    navigationContext: string;
    clientDossierId: string;
    displayName: string;
  }>();
  const [clientIdentityGeneration, setClientIdentityGeneration] = useState(0);
  const [documentClientFilter, setDocumentClientFilter] = useState<{
    navigationContext: string;
    clientDossierId: string;
    displayName: string;
  }>();
  const [requestClientFilter, setRequestClientFilter] = useState<{
    navigationContext: string;
    clientDossierId: string;
    displayName: string;
  }>();
  const [requestedClientDossier, setRequestedClientDossier] = useState<{
    companyId: string;
    clientDossierId: string;
    requestId: number;
  }>();
  const [requestedRequest, setRequestedRequest] = useState<{
    requestsMount: string;
    clientRequestId: string;
    requestId: number;
  }>();
  const [requestedDocument, setRequestedDocument] = useState<
    RequestedDocument & { documentsContext: string }
  >();
  /** Request ids only increase, so no retired request id is ever reissued. */
  const documentRequests = useRef(0);
  const [requestedProject, setRequestedProject] = useState<{
    context: string;
    projectId: string;
    taskId?: string;
    requestId: number;
  }>();
  const navigateToSection = useCallback(
    (section: 'clients' | 'projects' | 'documents' | 'requests') => {
      const nextUrl = new URL(window.location.href);
      nextUrl.hash = section;
      window.history.pushState(window.history.state, '', nextUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.requestAnimationFrame(() => {
        const destination = document.getElementById(section);
        destination?.scrollIntoView({ block: 'start' });
        destination?.focus();
      });
    },
    [],
  );
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

  // One authorized navigation intent belongs to exactly one Company, session,
  // Client authority and Client identity generation. Any change retires it
  // instead of masking it, so a dossier identity that a union or reversal
  // superseded can never keep restricting the Projects or Documents a member
  // sees.
  const navigationContext =
    access.status === 'active'
      ? `${access.sessionGeneration}:${clientAuthorityGeneration}:${clientIdentityGeneration}:${access.actor.activeCompany?.id ?? 'no-company'}`
      : 'inactive';
  useEffect(() => {
    setProjectClientFilter(undefined);
    setDocumentClientFilter(undefined);
  }, [navigationContext]);
  // A Requests restriction also belongs to the Commercial Intake assignment
  // and the Company Client read it was requested under.
  const requestNavigationContext =
    access.status === 'active'
      ? `${navigationContext}:${requestNavigationAuthority(access.actor)}`
      : 'inactive';
  useEffect(() => {
    setRequestClientFilter(undefined);
  }, [requestNavigationContext]);
  // The Requests workspace is mounted once per session, active Company and
  // Commercial Intake assignment, and only while the shell offers it. A
  // requested Request belongs to exactly one mount: any change, including the
  // loss of the section, retires it, so a remounted workspace never replays it.
  const requestsMount =
    access.status === 'active' && canAccessCommercialIntake(access.actor)
      ? requestsMountOf(access.sessionGeneration, access.actor)
      : undefined;
  useEffect(() => {
    setRequestedRequest(undefined);
  }, [requestsMount]);
  // A requested Document belongs to the context that keys the Documents owner:
  // session, Client authority and active Company. Any change retires it. A
  // Client union or reversal does not, because the Document id is stable.
  const documentsContext =
    access.status === 'active'
      ? `${access.sessionGeneration}:${clientAuthorityGeneration}:${access.actor.activeCompany?.id ?? 'no-company'}`
      : 'inactive';
  useEffect(() => {
    setRequestedDocument(undefined);
  }, [documentsContext]);
  // A requested Project open belongs to the context that keys the Projects
  // owner. A session, Client authority or Company change, or the loss of the
  // Projects section, retires it for good; a Client identity change does not,
  // because the Project id is stable.
  const projectRequestContext =
    access.status === 'active' && canAccessProjectsSection(access.actor)
      ? `${access.sessionGeneration}:${clientAuthorityGeneration}:${access.actor.activeCompany?.id ?? 'no-company'}`
      : 'unavailable';
  useEffect(() => {
    setRequestedProject(undefined);
  }, [projectRequestContext]);

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

  const canReadCompanyClients =
    access.actor.activeCompany?.clientPermissions?.includes('client.read') ===
    true;
  const canAccessClients =
    access.actor.workspacePermissions.includes('client.manage') ||
    canReadCompanyClients;
  const activeCompanyId = access.actor.activeCompany?.id;
  const canAccessProjects = canAccessProjectsSection(access.actor);
  const canReadDocuments =
    access.actor.activeCompany?.documentPermissions?.includes(
      'document.read',
    ) === true;
  const canAccessCommercial = requestsMount !== undefined;
  const cataloguePermissions =
    access.actor.activeCompany?.serviceCataloguePermissions ?? [];
  const canAccessCatalogue =
    activeCompanyId !== undefined &&
    cataloguePermissions.includes('service.definition.read') &&
    cataloguePermissions.includes('service.definition.create') &&
    cataloguePermissions.includes('commercial.offering.read') &&
    cataloguePermissions.includes('commercial.offering.manage');
  const pricingConfigurationPermissions =
    access.actor.activeCompany?.pricingConfigurationPermissions ?? [];
  const pricingUserPermissions =
    access.actor.activeCompany?.pricingUserPermissions ?? [];
  // Configuration v1 and Pricing User v1 each carry configuration read. The
  // screen offers publication only through Configuration management.
  const canReadPricingConfiguration =
    activeCompanyId !== undefined &&
    (pricingConfigurationPermissions.includes(
      'commercial.pricing.configuration.read',
    ) ||
      pricingUserPermissions.includes('commercial.pricing.configuration.read'));
  const requestedClientDossierRequest =
    requestedClientDossier === undefined
      ? undefined
      : requestedClientDossier.companyId === activeCompanyId
        ? requestedClientDossier
        : undefined;

  // The shell owns one authorized navigation intent for both mounted modules.
  const openClientDossier = activeCompanyId
    ? (clientDossierId: string) => {
        setRequestedClientDossier((current) => ({
          companyId: activeCompanyId,
          clientDossierId,
          requestId: (current?.requestId ?? 0) + 1,
        }));
        navigateToSection('clients');
      }
    : undefined;
  // The shell owns one requested Request for the Requests workspace it offers.
  const openRequest = canAccessCommercial
    ? (clientRequestId: string) => {
        setRequestedRequest((current) => ({
          requestsMount,
          clientRequestId,
          requestId: (current?.requestId ?? 0) + 1,
        }));
        navigateToSection('requests');
      }
    : undefined;
  // Offered only where the shell offers the Documents section, whose own detail
  // read decides what is shown.
  const openDocument =
    access.actor.activeCompany && canAccessClients
      ? (documentId: string) => {
          documentRequests.current += 1;
          setRequestedDocument({
            documentsContext,
            documentId,
            requestId: documentRequests.current,
          });
          navigateToSection('documents');
        }
      : undefined;
  // A retired request is never passed on, not even in the render that retires
  // it before the effect above clears it.
  const currentRequestedDocument =
    requestedDocument?.documentsContext === documentsContext
      ? requestedDocument
      : undefined;
  // The Projects owner reads the requested Project itself, then its optional
  // Task; no Project or Task identity reaches the URL or history state.
  const openProject = canAccessProjects
    ? (target: { projectId: string; taskId?: string }) => {
        setRequestedProject((current) => ({
          context: projectRequestContext,
          projectId: target.projectId,
          taskId: target.taskId,
          requestId: (current?.requestId ?? 0) + 1,
        }));
        navigateToSection('projects');
      }
    : undefined;

  // The Company summary appears only for an active Company where App's
  // existing predicates grant at least one of the Client directory, Project
  // list and Task reads. Any session, Company, Client authority, assignment or
  // version change remounts it, dropping its late replies and closing its panel.
  const activeCompany = access.actor.activeCompany;
  const operationalHome =
    activeCompany &&
    (canAccessClients || canAccessProjects || canReadTasks(access.actor)) ? (
      <OperationalHome
        key={`operational-home:${access.sessionGeneration}:${clientAuthorityGeneration}:${operationalHomeAuthority(access.actor)}`}
        company={{
          id: activeCompany.id,
          displayName: activeCompany.displayName,
        }}
        identity={identity}
        availableSummaries={{
          active_clients: canAccessClients,
          open_projects: canAccessProjects,
          overdue_tasks: canReadTasks(access.actor),
        }}
        onRevalidateAuthority={() => selectCompany(activeCompany.id)}
        onOpenClients={() => navigateToSection('clients')}
        onOpenProjects={() => {
          setProjectClientFilter(undefined);
          navigateToSection('projects');
        }}
        onOpenTask={openProject}
      />
    ) : null;

  const sections: ApplicationSection[] = [];
  if (canAccessCommercial && access.actor.activeCompany)
    sections.push({
      id: 'requests',
      ...prismeCopy.sections.requests,
      content: (
        <CommercialIntakeWorkspace
          key={`commercial-intake:${requestsMount}`}
          actor={access.actor}
          identity={identity}
          onCompanyContextRejected={rejectCompanyContext}
          onActorRevalidated={acceptRevalidatedActor}
          onWorkspaceAccessRejected={rejectWorkspaceAccess}
          onActivityRecorded={refreshActivityLog}
          clientRestriction={
            requestClientFilter?.navigationContext === requestNavigationContext
              ? requestClientFilter
              : undefined
          }
          clientIdentityRevision={clientIdentityGeneration}
          onOpenClientDossier={
            canReadCompanyClients ? openClientDossier : undefined
          }
          requestedRequest={
            requestedRequest?.requestsMount === requestsMount
              ? requestedRequest
              : undefined
          }
        />
      ),
    });
  if (canAccessCatalogue && access.actor.activeCompany)
    sections.push({
      id: 'catalogue',
      ...prismeCopy.sections.catalogue,
      content: (
        <ServiceCatalogueWorkspace
          key={`service-catalogue:${access.sessionGeneration}:${access.actor.activeCompany.id}:${access.actor.activeCompany.serviceCataloguePermissionAssignmentId ?? 'no-assignment'}:${access.actor.activeCompany.serviceCataloguePermissionSetVersion ?? 'no-version'}`}
          actor={access.actor}
          identity={identity}
          onCompanyContextRejected={rejectCompanyContext}
          onActorRevalidated={acceptRevalidatedActor}
          onWorkspaceAccessRejected={rejectWorkspaceAccess}
        />
      ),
    });
  // Any change of session, membership, Company, captured assignment or
  // permission of either bundle remounts both pricing panels, clearing drafts
  // and dropping late replies.
  if (canReadPricingConfiguration && access.actor.activeCompany)
    sections.push({
      id: 'pricing',
      ...prismeCopy.sections.pricing,
      content: (
        <Fragment
          key={`pricing-configuration:${access.sessionGeneration}:${access.actor.workspaceMembershipId}:${access.actor.activeCompany.id}:${access.actor.activeCompany.pricingConfigurationPermissionAssignmentId ?? 'no-assignment'}:${access.actor.activeCompany.pricingConfigurationPermissionSetVersion ?? 'no-version'}:${pricingConfigurationPermissions.join(',')}:${access.actor.activeCompany.pricingUserPermissionAssignmentId ?? 'no-pricing-user-assignment'}:${access.actor.activeCompany.pricingUserPermissionSetVersion ?? 'no-pricing-user-version'}:${pricingUserPermissions.join(',')}`}
        >
          <PricingConfigurationWorkspace
            actor={access.actor}
            identity={identity}
            onCompanyContextRejected={rejectCompanyContext}
            onActorRevalidated={acceptRevalidatedActor}
            onWorkspaceAccessRejected={rejectWorkspaceAccess}
          />
          <TariffVersionPanel
            actor={access.actor}
            identity={identity}
            onCompanyContextRejected={rejectCompanyContext}
            onActorRevalidated={acceptRevalidatedActor}
            onWorkspaceAccessRejected={rejectWorkspaceAccess}
          />
        </Fragment>
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
          clientFilter={
            documentClientFilter?.navigationContext === navigationContext
              ? documentClientFilter
              : undefined
          }
          clientIdentityRevision={clientIdentityGeneration}
          onOpenClientDossier={openClientDossier}
          requestedDocument={currentRequestedDocument}
          onOpenProject={
            openProject && ((projectId) => openProject({ projectId }))
          }
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
                    navigationContext,
                    clientDossierId: client.id,
                    displayName: client.displayName,
                  });
                  navigateToSection('projects');
                }
              : undefined
          }
          onOpenDocuments={
            canReadDocuments && activeCompanyId
              ? (client) => {
                  setDocumentClientFilter({
                    navigationContext,
                    clientDossierId: client.id,
                    displayName: client.displayName,
                  });
                  navigateToSection('documents');
                }
              : undefined
          }
          onOpenRequests={
            canAccessCommercial && canReadCompanyClients
              ? (client) => {
                  setRequestClientFilter({
                    navigationContext: requestNavigationContext,
                    clientDossierId: client.id,
                    displayName: client.displayName,
                  });
                  navigateToSection('requests');
                }
              : undefined
          }
          onClientIdentityChanged={() =>
            setClientIdentityGeneration((generation) => generation + 1)
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
            projectClientFilter?.navigationContext === navigationContext
              ? projectClientFilter
              : undefined
          }
          clientIdentityRevision={clientIdentityGeneration}
          onOpenClientDossier={openClientDossier}
          onOpenDocument={openDocument}
          requestedProject={
            requestedProject?.context === projectRequestContext
              ? requestedProject
              : undefined
          }
        />
      ),
    });
  if (canReadTasks(access.actor))
    sections.push({
      id: 'my-tasks',
      ...prismeCopy.sections.myTasks,
      content: (
        <MyTasks
          key={`my-tasks:${access.sessionGeneration}:${clientAuthorityGeneration}:${activeCompanyId ?? 'no-company'}`}
          actor={access.actor}
          identity={identity}
          onOpenTask={openProject}
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
    content: (
      <ActivityLog
        state={access.activityLog}
        activeCompanyId={activeCompanyId}
        onOpenRequest={openRequest}
      />
    ),
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
      overviewSummary={operationalHome}
    >
      <ApplicationContentSurface>
        <p className="eyebrow">{access.actor.workspaceName}</p>
        <h1>Welcome to PRISMA-PRIM Suite</h1>
        <p className="production-home-introduction">
          This workspace is ready to host your organization&apos;s workflows as
          they become available.
        </p>
        {operationalHome}
      </ApplicationContentSurface>
    </ApplicationShell>
  );
}
/** Every authority the Company summary was read under. */
function operationalHomeAuthority(actor: ActorContext): string {
  return JSON.stringify([
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.workspacePermissions,
    actor.activeCompany,
  ]);
}
/** The Projects section needs an active Company with Project and Client read. */
function canAccessProjectsSection(actor: ActorContext): boolean {
  const company = actor.activeCompany;
  return (
    company?.projectPermissions?.includes('project.read') === true &&
    (actor.workspacePermissions.includes('client.manage') ||
      company.clientPermissions?.includes('client.read') === true)
  );
}
/**
 * The Requests authority a dossier restriction was requested under: the
 * Commercial Intake assignment the workspace is mounted for and Company Client
 * read, without which rows carry no dossier identity to compare.
 */
function requestNavigationAuthority(actor: ActorContext): string {
  const company = actor.activeCompany;
  return [
    company?.commercialIntakePermissionAssignmentId ?? 'no-assignment',
    company?.commercialIntakePermissionSetVersion ?? 'no-version',
    company?.clientPermissions?.includes('client.read') === true
      ? 'client-read'
      : 'no-client-read',
  ].join(':');
}

/** The delivered Requests section predicate in the active Company. */
function canAccessCommercialIntake(actor: ActorContext): boolean {
  const permissions = actor.activeCompany?.commercialIntakePermissions ?? [];
  return (
    actor.activeCompany !== undefined &&
    permissions.includes('commercial.request.read') &&
    permissions.includes('commercial.request.create') &&
    permissions.includes('commercial.opportunity.read') &&
    permissions.includes('commercial.opportunity.create')
  );
}

function requestsMountOf(sessionGeneration: number, actor: ActorContext) {
  const company = actor.activeCompany;
  return [
    sessionGeneration,
    company?.id ?? 'no-company',
    company?.commercialIntakePermissionAssignmentId ?? 'no-assignment',
    company?.commercialIntakePermissionSetVersion ?? 'no-version',
  ].join(':');
}

/**
 * The Request a commercial event may open inside the active Company: its own
 * Request, or the containing Request the server derived for an Opportunity
 * event only while the actor can read Requests. Other targets open nothing.
 */
function requestOpenedBy(
  event: ActivityLogEvent,
  activeCompanyId: string | undefined,
): string | undefined {
  const { target } = event;
  if (target.type !== 'client_request' && target.type !== 'opportunity')
    return undefined;
  return target.companyId === activeCompanyId
    ? target.clientRequestId
    : undefined;
}

function ActivityLog({
  state,
  activeCompanyId,
  onOpenRequest,
}: {
  state: ActivityLogState;
  activeCompanyId: string | undefined;
  /** Present only while the shell offers the Requests section. */
  onOpenRequest: ((clientRequestId: string) => void) | undefined;
}) {
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
          {state.events.map((event) => {
            const entry =
              'projectionReference' in event
                ? event.projectionReference
                : event.id;
            const openedRequest = onOpenRequest
              ? requestOpenedBy(event, activeCompanyId)
              : undefined;
            const targetId = `activity-log-target-${entry}`;
            return (
              <li key={entry}>
                <div>
                  <strong>{activityDescription(event)}</strong>
                  <span id={openedRequest ? targetId : undefined}>
                    Target: {activityTargetDescription(event)}
                  </span>
                  {openedRequest && onOpenRequest ? (
                    <button
                      type="button"
                      className="activity-log-open-request"
                      aria-describedby={targetId}
                      onClick={() => onOpenRequest(openedRequest)}
                    >
                      {commercialIntakeCopy.activityOpenRequest}
                    </button>
                  ) : null}
                </div>
                {'occurredAt' in event && (
                  <time dateTime={event.occurredAt}>
                    {formatApplicationDateTime(event.occurredAt)}
                  </time>
                )}
              </li>
            );
          })}
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
    'project.responsible.changed': projectCopy.responsible.activityAction,
    ...taskCopy.activityActionLabels,
    'company.registered': 'registered a Company',
    ...companyContextAccessCopy.activityActionLabels,
    ...workspaceMembershipSuspensionCopy.activityActionLabels,
    ...clientWorkspaceCopy.activityActionLabels,
    ...clientUnionCopy.actionLabels,
    ...commercialIntakeCopy.activityActionLabels,
    ...workspaceInvitationsCopy.activityActionLabels,
  };
  const actorName =
    'kind' in event.actor ? clientUnionCopy.resolver : event.actor.displayName;
  const description = `${actorName} ${actionLabels[event.action]}`;
  return event.action === 'opportunity.responsible.changed'
    ? `${description} ${commercialIntakeCopy.activityResponsibleChange(
        event.metadata.before.displayLabel,
        event.metadata.after.displayLabel,
      )}`
    : description;
}

function responsibleChange({
  before,
  after,
}: ProjectResponsibleChangedActivityLogEvent['metadata']): string {
  const copy = projectCopy.responsible;
  return `${copy.activityFrom} ${before?.displayLabel ?? copy.none} ${copy.activityTo} ${after?.displayLabel ?? copy.none}`;
}

function activityTargetDescription(event: ActivityLogEvent): string {
  switch (event.target.type) {
    case 'document_project':
      return `${documentsCopy.activityTarget}: ${event.target.documentTitle} — ${projectCopy.activityTarget}: ${event.target.projectTitle}`;
    case 'document':
      return `${documentsCopy.activityTarget}: ${event.action === 'document.corrected' ? event.target.documentId : event.target.documentTitle}`;
    case 'project':
      return event.action === 'project.responsible.changed'
        ? `${projectCopy.activityTarget}: ${event.target.projectTitle} — ${responsibleChange(event.metadata)}`
        : `${projectCopy.activityTarget}: ${event.target.projectTitle}`;
    case 'task':
      return `${taskCopy.activityTarget}: ${event.target.taskTitle}`;
    case 'workspace_invitation':
      return event.target.invitationId;
    case 'client_union_operation':
      return clientUnionCopy.title;
    case 'client_request':
      return `${commercialIntakeCopy.activityRequestTarget}: ${event.target.clientRequestId}`;
    case 'opportunity':
      return `${commercialIntakeCopy.activityOpportunityTarget}: ${event.target.opportunityId}`;
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
