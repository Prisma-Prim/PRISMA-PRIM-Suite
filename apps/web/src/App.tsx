import { IdeasWorkspace } from './ideas/IdeasWorkspace';
import { ideasAuthority, ideasContextKey } from './ideas/ideas-contract';
import { useIdeasCopy } from './ideas/ideas.copy';
import {
  OperationalRiskWorkspace,
  canReadOperationalRisks,
} from './operational-risk/OperationalRiskWorkspace';
import { ActivityLog } from './production-shell/ActivityLog';
import {
  ProjectTemplateConfiguration,
  canReadProjectTemplateCatalogue,
} from './project/ProjectTemplateConfiguration';
import { useAppCopy } from './app.copy';
import { OfferModelWorkspace } from './offer-model/OfferModelWorkspace';
import { offerModelAuthority } from './offer-model/offer-model-authority';
import { useOfferModelCopy } from './offer-model/offer-model.copy';
import { ContractModelWorkspace } from './contract-model/ContractModelWorkspace';
import { contractModelAuthority } from './contract-model/contract-model-authority';
import { useContractModelCopy } from './contract-model/contract-model.copy';
import { MyTasks, canReadTasks } from './project/MyTasks';
import { UnassignedTasks } from './project/UnassignedTasks';
import { useUnassignedTasksCopy } from './project/unassigned-tasks.copy';
import { ProjectWorkspace } from './project/ProjectWorkspace';
import {
  useProjectNavigation,
  type ProjectOpenTarget,
} from './project/use-project-navigation';
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
import { usePrismeCopy } from './production-shell/prisme/prisme.copy';
import type { BrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { CompanyContextAccess } from './access/CompanyContextAccess';
import { WorkspaceInvitations } from './access/WorkspaceInvitations';
import { CompanyContextSelector } from './company/CompanyContextSelector';
import { CompanyRegistration } from './company/CompanyRegistration';
import { ClientWorkspace } from './client/ClientWorkspace';
import { ClientCommercialOverview } from './commercial-intake/ClientCommercialOverview';
import { ClientMissionOverview } from './project/ClientMissionOverview';
import {
  CommercialIntakeWorkspace,
  type RequestedVersion,
} from './commercial-intake/CommercialIntakeWorkspace';
import { ServiceCatalogueWorkspace } from './commercial-catalogue/ServiceCatalogueWorkspace';
import { PricingConfigurationWorkspace } from './pricing-configuration/PricingConfigurationWorkspace';
import { TariffVersionPanel } from './pricing-configuration/TariffVersionPanel';
import { ProfitabilityDecisionQueue } from './profitability-estimate/ProfitabilityDecisionQueue';
import { OperationalHome } from './operational-home/OperationalHome';
import { useProductionShellContext } from './production-shell/useProductionShellContext';

export function App({ identity }: { identity: BrowserIdentity }) {
  const copy = useAppCopy();
  const modelCopy = useOfferModelCopy();
  const contractModelCopy = useContractModelCopy();
  const ideasCopy = useIdeasCopy();
  const prismeCopy = usePrismeCopy();
  const unassignedCopy = useUnassignedTasksCopy();
  const [clientAuthorityGeneration, setClientAuthorityGeneration] = useState(0);
  const [templateCatalogueRevision, setTemplateCatalogueRevision] = useState(0);
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
    /** The exact version to select in the Request detail, if any. */
    version?: RequestedVersion;
    focusTarget?: 'request-detail';
    sourceSignal?: AbortSignal;
    requestId: number;
  }>();
  const [requestedDocument, setRequestedDocument] = useState<
    RequestedDocument & { documentsContext: string }
  >();
  /** Request ids only increase, so no retired request id is ever reissued. */
  const documentRequests = useRef(0);
  const navigateToSection = useCallback(
    (
      section:
        | 'clients'
        | 'projects'
        | 'documents'
        | 'requests'
        | 'my-tasks'
        | 'activity',
    ) => {
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

  // An exact dossier restriction belongs to exactly one Company, session,
  // Client authority and Client identity generation. Any change retires it
  // instead of masking it, so a dossier identity that a union or reversal
  // superseded can never keep restricting the Documents a member sees.
  // Projects owns its corresponding restriction and identity retirement.
  const navigationContext =
    access.status === 'active'
      ? `${access.sessionGeneration}:${clientAuthorityGeneration}:${clientIdentityGeneration}:${access.actor.activeCompany?.id ?? 'no-company'}`
      : 'inactive';
  useEffect(() => {
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
  // Projects section, retires it for good. Ordinary targets keep their stable
  // Project id across Client identity changes; inline Client openings also
  // carry their originating region's independent source signal.
  const projectRequestContext =
    access.status === 'active' && canAccessProjectsSection(access.actor)
      ? `${access.sessionGeneration}:${clientAuthorityGeneration}:${access.actor.activeCompany?.id ?? 'no-company'}`
      : 'unavailable';
  const projectNavigation = useProjectNavigation(projectRequestContext);

  if (!identity.loaded)
    return (
      <main className="production-access-state">
        <p role="status">{copy.checkingAccess}</p>
      </main>
    );
  if (!identity.signedIn) return <>{identity.signedOutView}</>;
  if (access.status === 'signed-out') return <>{identity.signedOutView}</>;

  if (access.status !== 'active') {
    const messages: Record<'checking' | 'forbidden' | 'error', string> = {
      checking: copy.checkingAccess,
      forbidden: copy.inactiveAccess,
      error: copy.accessError,
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
    ? (
        clientRequestId: string,
        version?: RequestedVersion,
        navigation?: {
          focusTarget: 'request-detail';
          sourceSignal: AbortSignal;
        },
      ) => {
        setRequestedRequest((current) => ({
          requestsMount,
          clientRequestId,
          version,
          focusTarget: navigation?.focusTarget,
          sourceSignal: navigation?.sourceSignal,
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
    ? (target: ProjectOpenTarget) => {
        projectNavigation.navigate({ kind: 'project', ...target });
        navigateToSection('projects');
      }
    : undefined;

  // The Company summary appears only for an active Company where App's
  // existing predicates grant at least one of the Client directory, Project
  // list and Task reads. Any session, Company, Client authority, assignment or
  // version change remounts it, dropping its late replies and closing its panel.
  const activeCompany = access.actor.activeCompany;
  const operationalSummary =
    activeCompany &&
    (canAccessClients || canAccessProjects || canReadTasks(access.actor)) ? (
      <OperationalHome
        workspaceMembershipId={access.actor.workspaceMembershipId}
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
          projectNavigation.navigate({ kind: 'directory' });
          navigateToSection('projects');
        }}
        onOpenMyTasks={() => navigateToSection('my-tasks')}
        onOpenTask={openProject}
        onOpenOverdueTask={
          openProject
            ? (target) => openProject({ ...target, focus: 'task' })
            : undefined
        }
        activity={{
          state: access.activityLog,
          activeCompanyId: activeCompany.id,
          onRefresh: refreshActivityLog,
          onOpenActivity: () => navigateToSection('activity'),
          onOpenRequest: openRequest,
        }}
      />
    ) : null;
  const operationalHome = (
    <>
      {operationalSummary}
      <ProfitabilityDecisionQueue
        key={`profitability-queue:${access.sessionGeneration}`}
        actor={access.actor}
        identity={identity}
        onActorRevalidated={acceptRevalidatedActor}
        onCompanyContextRejected={rejectCompanyContext}
        onWorkspaceAccessRejected={rejectWorkspaceAccess}
      />
    </>
  );

  const sections: ApplicationSection[] = [];
  if (ideasAuthority(access.actor).read)
    sections.push({
      id: 'ideas',
      label: ideasCopy('label'),
      description: ideasCopy('introduction'),
      content: (
        <IdeasWorkspace
          key={`ideas:${access.sessionGeneration}:${ideasContextKey(access.actor)}`}
          actor={access.actor}
          identity={identity}
          onActorRevalidated={acceptRevalidatedActor}
          onCompanyContextRejected={rejectCompanyContext}
          onWorkspaceAccessRejected={rejectWorkspaceAccess}
        />
      ),
    });
  if (canReadOperationalRisks(access.actor) && access.actor.activeCompany)
    sections.push({
      id: 'operational-risks',
      ...prismeCopy.sections.risks,
      content: (
        <OperationalRiskWorkspace
          key={`operational-risks:${access.sessionGeneration}:${access.actor.workspaceMembershipId}:${access.actor.activeCompany.id}:${access.actor.activeCompany.operationalRiskReaderAssignmentId ?? 'none'}:${access.actor.activeCompany.operationalRiskReaderPermissionSetVersion ?? 'none'}:${access.actor.activeCompany.operationalRiskRecorderAssignmentId ?? 'none'}:${access.actor.activeCompany.operationalRiskRecorderPermissionSetVersion ?? 'none'}:${access.actor.activeCompany.operationalRiskPermissions?.join(',') ?? 'none'}`}
          actor={access.actor}
          identity={identity}
          onActorRevalidated={acceptRevalidatedActor}
          onCompanyContextRejected={rejectCompanyContext}
          onWorkspaceAccessRejected={rejectWorkspaceAccess}
        />
      ),
    });
  if (canAccessCommercial && access.actor.activeCompany)
    sections.push({
      id: 'requests',
      ...prismeCopy.sections.requests,
      content: (
        <CommercialIntakeWorkspace
          onOpenProject={
            openProject && ((projectId) => openProject({ projectId }))
          }
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
          clientAuthorityRevision={clientAuthorityGeneration}
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
  if (offerModelAuthority(access.actor))
    sections.push({
      id: 'offer-models',
      label: modelCopy('title'),
      description: modelCopy('description'),
      content: (
        <OfferModelWorkspace
          key={`offer-model:${access.sessionGeneration}`}
          actor={access.actor}
          identity={identity}
          onActorRevalidated={acceptRevalidatedActor}
          onCompanyContextRejected={rejectCompanyContext}
          onWorkspaceAccessRejected={rejectWorkspaceAccess}
        />
      ),
    });
  if (contractModelAuthority(access.actor))
    sections.push({
      id: 'contract-models',
      label: contractModelCopy('title'),
      description: contractModelCopy('description'),
      content: (
        <ContractModelWorkspace
          key={`contract-model:${access.sessionGeneration}`}
          actor={access.actor}
          identity={identity}
          onActorRevalidated={acceptRevalidatedActor}
          onCompanyContextRejected={rejectCompanyContext}
          onWorkspaceAccessRejected={rejectWorkspaceAccess}
        />
      ),
    });
  if (access.actor.activeCompany && canAccessClients)
    sections.push({
      id: 'documents',
      ...prismeCopy.sections.documents,
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
          onCompanyContextRejected={rejectCompanyContext}
          onActorRevalidated={acceptRevalidatedActor}
          onWorkspaceAccessRejected={rejectWorkspaceAccess}
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
          renderCommercialWork={
            canReadCompanyClients && openRequest
              ? (clientDossierId) => (
                  <ClientCommercialOverview
                    actor={access.actor}
                    identity={identity}
                    clientDossierId={clientDossierId}
                    clientIdentityRevision={clientIdentityGeneration}
                    onOpenRequest={(clientRequestId, sourceSignal) =>
                      openRequest(clientRequestId, undefined, {
                        focusTarget: 'request-detail',
                        sourceSignal,
                      })
                    }
                    onCompanyContextRejected={rejectCompanyContext}
                    onActorRevalidated={acceptRevalidatedActor}
                    onWorkspaceAccessRejected={rejectWorkspaceAccess}
                  />
                )
              : undefined
          }
          onOpenProjects={
            canAccessProjects && activeCompanyId
              ? (client) => {
                  projectNavigation.navigate({
                    kind: 'directory',
                    client: {
                      clientDossierId: client.id,
                      displayName: client.displayName,
                    },
                  });
                  navigateToSection('projects');
                }
              : undefined
          }
          renderMissionWork={
            canReadCompanyClients && openProject
              ? (clientDossierId) => (
                  <ClientMissionOverview
                    actor={access.actor}
                    identity={identity}
                    clientDossierId={clientDossierId}
                    clientIdentityRevision={clientIdentityGeneration}
                    onOpenProject={(target, sourceSignal) =>
                      openProject({ ...target, sourceSignal })
                    }
                    onCompanyContextRejected={rejectCompanyContext}
                    onActorRevalidated={acceptRevalidatedActor}
                    onWorkspaceAccessRejected={rejectWorkspaceAccess}
                  />
                )
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
  if (
    (canAccessProjects || canReadProjectTemplateCatalogue(access.actor)) &&
    access.actor.activeCompany
  )
    sections.push({
      id: 'projects',
      ...prismeCopy.sections.projects,
      content: (
        <>
          {canAccessProjects && (
            <ProjectWorkspace
              catalogueRevision={templateCatalogueRevision}
              onOpenContract={openRequest}
              key={`project:${access.sessionGeneration}:${clientAuthorityGeneration}:${access.actor.activeCompany.id}`}
              actor={access.actor}
              identity={identity}
              onActivityRecorded={refreshActivityLog}
              clientIdentityRevision={clientIdentityGeneration}
              onOpenClientDossier={openClientDossier}
              onOpenDocument={openDocument}
              navigation={projectNavigation.request}
            />
          )}
          {canReadProjectTemplateCatalogue(access.actor) && (
            <div
              id={canAccessProjects ? undefined : 'projects'}
              tabIndex={canAccessProjects ? undefined : -1}
            >
              <ProjectTemplateConfiguration
                key={`template-configuration:${access.sessionGeneration}`}
                actor={access.actor}
                identity={identity}
                onCatalogueChanged={() =>
                  setTemplateCatalogueRevision((value) => value + 1)
                }
                onActivityRecorded={refreshActivityLog}
                onActorRevalidated={acceptRevalidatedActor}
                onCompanyContextRejected={rejectCompanyContext}
                onWorkspaceAccessRejected={rejectWorkspaceAccess}
              />
            </div>
          )}
        </>
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
  if (canReadTasks(access.actor))
    sections.push({
      id: 'unassigned-tasks',
      label: unassignedCopy('title'),
      description: unassignedCopy('description'),
      mountWhenSelected: true,
      content: (
        <UnassignedTasks
          key={`unassigned-tasks:${access.sessionGeneration}:${clientAuthorityGeneration}:${activeCompanyId ?? 'no-company'}`}
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
            {copy.signOut}
          </button>
        </span>
      }
      overviewSummary={operationalHome}
    >
      <ApplicationContentSurface>
        <p className="eyebrow">{access.actor.workspaceName}</p>
        <h1>{copy.homeTitle}</h1>
        <p className="production-home-introduction">{copy.homeIntroduction}</p>
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
