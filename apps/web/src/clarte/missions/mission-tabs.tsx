import type { ReactNode } from 'react';
import type { BrowserIdentity } from '../../access-composition';
import type { ActorContext } from '../../access-types';
import { holds } from '../../access/company-grants';
import { CertificationWorkspace } from '../../certification/CertificationWorkspace';
import { certificationAuthority } from '../../certification/certification-access';
import { ProjectContracts } from '../../contract/ProjectContracts';
import { holdsContractRead } from '../../contract/contract-grants';
import { DossierAnalysisWorkspace } from '../../dossier-analysis/DossierAnalysisWorkspace';
import { dossierAnalysisAuthority } from '../../dossier-analysis/analysis-access';
import { MissionPlanCurrentWork } from '../../mission-plan/MissionPlanCurrentWork';
import { missionPlanAuthority } from '../../mission-plan/mission-plan-authority';
import { MissionApplicability } from '../../project/MissionApplicability';
import { MissionReadiness } from '../../project/MissionReadiness';
import { MissionResultReview } from '../../project/MissionResultReview';
import { ProjectDocuments } from '../../project/ProjectDocuments';
import { ProjectPdfBundle } from '../../project/ProjectPdfBundle';
import { ProjectStage } from '../../project/ProjectStage';
import type { CopiedTemplatePlanRead } from '../../project/ProjectTemplate';
import type { ProjectView } from '../../project/project-directory';
import {
  pilotTemplateKey,
  type CopiedPilotTemplatePlan,
} from '../../project/project-template-response';
import type { ProjectDetailPanel } from '../../project/use-project-workspace';
import { WorkingEvidenceWorkspace } from '../../working-evidence/WorkingEvidenceWorkspace';
import { workingEvidenceAuthority } from '../../working-evidence/working-evidence-access';
import { ClarteEmptyState } from '../components/ClarteState';
import { ClarteMissionPlan } from './ClarteMissionPlan';
import { useClarteMissionsCopy } from './clarte-missions.copy';

/** What every view of the opened Project receives from the mission space. */
export type MissionTabContext = Readonly<{
  actor: ActorContext;
  identity: BrowserIdentity;
  project: ProjectView;
  clientIdentityRevision: number;
  /** The plan copied from a Project Template, while the actor may read it. */
  templatePlan: CopiedTemplatePlanRead | undefined;
  retryTemplatePlan: () => void;
  /** Opens one of the Project's Tasks in the Tasks view. */
  openTask: (taskId: string) => void;
  /** Re-reads the Project after one of its sections changed it. */
  reloadProject: () => Promise<void>;
  onActivityRecorded?: () => void | Promise<void>;
  onOpenDocument?: (documentId: string) => void;
  onOpenContract?: (clientRequestId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => void | Promise<void>;
  onCompanyContextRejected?: (companyId: string) => void;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
}>;

/**
 * One view of the mission space. `mount` keeps today's lifetimes: `hidden`
 * views stay mounted while the Project is open, `selected` ones mount only
 * while chosen, and `screen` is Tasks, which the Missions screen keeps mounted
 * across Projects so their drafts survive.
 */
export type MissionTab = Readonly<{
  id: ProjectDetailPanel;
  mount: 'hidden' | 'selected' | 'screen';
  available: (context: MissionTabContext) => boolean;
  render?: (context: MissionTabContext) => ReactNode;
}>;

/** The copied plan, when it is the pilot plan its mission views need. */
export function pilotPlanOf(
  read: CopiedTemplatePlanRead | undefined,
): CopiedPilotTemplatePlan | undefined {
  return read?.kind === 'ready' &&
    read.template?.templateKey === pilotTemplateKey
    ? read.template
    : undefined;
}

const recovery = (context: MissionTabContext) => ({
  onActorRevalidated: context.onActorRevalidated,
  onCompanyContextRejected: context.onCompanyContextRejected,
  onWorkspaceAccessRejected: context.onWorkspaceAccessRejected,
});

/**
 * The mission space's views, in display order: the one table later slices
 * change. A view no slice replaced yet renders its current component; to
 * migrate one, replace only its `render` (see ../README.md).
 */
export const missionTabs = [
  {
    id: 'plan',
    mount: 'hidden',
    available: (context) =>
      context.templatePlan !== undefined ||
      missionPlanAuthority(context.actor, 'copy') !== null,
    render: (context) => <ClarteMissionPlan {...context} />,
  },
  {
    id: 'applicability',
    mount: 'hidden',
    available: (context) => pilotPlanOf(context.templatePlan) !== undefined,
    render: (context) => {
      const plan = pilotPlanOf(context.templatePlan);
      return (
        plan && (
          <MissionApplicability
            actor={context.actor}
            identity={context.identity}
            projectId={context.project.id}
            plan={plan}
            onOpenTask={context.openTask}
            originalClientGeneration={context.clientIdentityRevision}
            onActivityRecorded={context.onActivityRecorded}
            {...recovery(context)}
          />
        )
      );
    },
  },
  {
    id: 'work',
    mount: 'hidden',
    available: (context) =>
      context.templatePlan !== undefined ||
      missionPlanAuthority(context.actor, 'copy') !== null,
    render: (context) => <CurrentWork {...context} />,
  },
  { id: 'tasks', mount: 'screen', available: () => true },
  {
    id: 'documents',
    mount: 'hidden',
    available: () => true,
    render: (context) => (
      <>
        <ProjectDocuments
          actor={context.actor}
          identity={context.identity}
          projectId={context.project.id}
          projectStatus={context.project.status}
          onProjectChanged={context.reloadProject}
          onActivityRecorded={context.onActivityRecorded}
          onOpenDocument={context.onOpenDocument}
        />
        <ProjectPdfBundle
          actor={context.actor}
          identity={context.identity}
          projectId={context.project.id}
          originalClientId={context.project.clientAccountId}
        />
      </>
    ),
  },
  {
    id: 'working-evidence',
    mount: 'hidden',
    available: (context) => Boolean(workingEvidenceAuthority(context.actor)),
    render: (context) => (
      <WorkingEvidenceWorkspace
        actor={context.actor}
        identity={context.identity}
        projectId={context.project.id}
        projectStatus={context.project.status}
        onActivityRecorded={context.onActivityRecorded}
        {...recovery(context)}
      />
    ),
  },
  {
    id: 'review',
    mount: 'hidden',
    available: (context) => pilotPlanOf(context.templatePlan) !== undefined,
    render: (context) => {
      const plan = pilotPlanOf(context.templatePlan);
      return (
        plan && (
          <MissionResultReview
            actor={context.actor}
            identity={context.identity}
            projectId={context.project.id}
            plan={plan}
            onOpenTask={context.openTask}
          />
        )
      );
    },
  },
  {
    id: 'certification',
    mount: 'hidden',
    available: (context) => certificationAuthority(context.actor).read,
    render: (context) => (
      <CertificationWorkspace
        actor={context.actor}
        identity={context.identity}
        projectId={context.project.id}
        projectTitle={context.project.title}
        {...recovery(context)}
      />
    ),
  },
  {
    id: 'contracts',
    mount: 'hidden',
    available: (context) => canReadProjectContracts(context.actor),
    render: (context) => <Contracts {...context} />,
  },
  {
    id: 'dossier-analysis',
    mount: 'selected',
    available: (context) => Boolean(dossierAnalysisAuthority(context.actor)),
    render: (context) => (
      <DossierAnalysisWorkspace
        actor={context.actor}
        identity={context.identity}
        projectId={context.project.id}
        authorityGeneration={String(context.clientIdentityRevision)}
        {...recovery(context)}
      />
    ),
  },
] as const satisfies readonly MissionTab[];

/**
 * The current work of the opened Project through its current components:
 * Mission Plan work, pilot readiness and the copied Template stage. Each
 * shows nothing for a Project without it; the empty state then stands in.
 */
function CurrentWork(context: MissionTabContext) {
  const copy = useClarteMissionsCopy();
  const plan = pilotPlanOf(context.templatePlan);
  return (
    <div className="clarte-mission-work">
      <MissionPlanCurrentWork
        actor={context.actor}
        identity={context.identity}
        projectId={context.project.id}
        clientAccountId={context.project.clientAccountId}
        onOpenTask={context.openTask}
        {...recovery(context)}
      />
      {plan && (
        <MissionReadiness
          actor={context.actor}
          identity={context.identity}
          projectId={context.project.id}
          plan={plan}
          onOpenTask={context.openTask}
        />
      )}
      {context.templatePlan !== undefined && (
        <ProjectStage
          actor={context.actor}
          identity={context.identity}
          projectId={context.project.id}
          onActivityRecorded={context.onActivityRecorded}
        />
      )}
      <div className="clarte-mission-work-empty">
        <ClarteEmptyState title={copy.text('workEmpty')} />
      </div>
    </div>
  );
}

/**
 * The Contracts linked to the opened Project, each opening its Request.
 * ProjectContracts shows nothing when none is linked; the empty state then
 * stands in.
 */
function Contracts(context: MissionTabContext) {
  const copy = useClarteMissionsCopy();
  return (
    <div className="clarte-mission-work">
      <ProjectContracts
        actor={context.actor}
        identity={context.identity}
        projectId={context.project.id}
        onOpenContract={context.onOpenContract}
      />
      <div className="clarte-mission-work-empty">
        <ClarteEmptyState title={copy.text('contractsEmpty')} />
      </div>
    </div>
  );
}

/** The read ProjectContracts makes before it lists a Project's Contracts. */
function canReadProjectContracts(actor: ActorContext) {
  const company = actor.activeCompany;
  return (
    holdsContractRead(company) &&
    holds(
      company,
      'company_commercial_intake',
      'commercial.opportunity.read',
    ) &&
    holds(company, 'company_project_access', 'project.read') &&
    (holds(company, 'company_director_client_access', 'client.read') ||
      actor.workspacePermissions.includes('client.manage'))
  );
}
