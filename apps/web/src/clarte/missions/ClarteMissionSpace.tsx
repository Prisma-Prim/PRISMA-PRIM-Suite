import {
  ArrowLeft,
  ArrowRight,
  Building2,
  History,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { useCertificationCopy } from '../../certification/certification.copy';
import { useDossierAnalysisTitle } from '../../dossier-analysis/DossierAnalysisWorkspace';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { ProjectLifecycle } from '../../project/ProjectLifecycle';
import {
  ProjectNextAction,
  canCoordinateNextAction,
} from '../../project/ProjectNextAction';
import { ProjectResponsible } from '../../project/ProjectResponsible';
import { useProjectDocumentsCopy } from '../../project/project-documents.copy';
import { useProjectLifecycleCopy } from '../../project/project-lifecycle-localized.copy';
import {
  isClosedProjectStatus,
  type ProjectStatus,
} from '../../project/project-lifecycle-response';
import { projectStatusTones } from '../../project/project-lifecycle.copy';
import { useProjectCopy } from '../../project/project-localized.copy';
import type { NextActionRecord } from '../../project/project-next-action-response';
import { useProjectTaskCopy } from '../../project/task.copy';
import type {
  ProjectDetailPanel,
  ProjectWorkspaceProps,
  ProjectWorkspaceSession,
  SelectedProject,
} from '../../project/use-project-workspace';
import { useWorkingEvidenceCopy } from '../../working-evidence/working-evidence.copy';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import { useClarteMissionsCopy } from './clarte-missions.copy';
import type { MissionTab, MissionTabContext } from './mission-tabs';

type Panel = 'lifecycle' | 'owner' | 'next-action' | null;

/** The label of each mission space view, from the copy of its owner. */
export function useMissionTabLabels(): Record<ProjectDetailPanel, string> {
  const copy = useClarteMissionsCopy();
  const taskCopy = useProjectTaskCopy();
  const documentsCopy = useProjectDocumentsCopy();
  const evidenceCopy = useWorkingEvidenceCopy();
  const certificationCopy = useCertificationCopy();
  const analysisTitle = useDossierAnalysisTitle();
  return {
    plan: copy.text('tabPlan'),
    applicability: copy.text('tabApplicability'),
    work: copy.text('tabWork'),
    tasks: taskCopy.title,
    documents: documentsCopy.title,
    'working-evidence': evidenceCopy('title'),
    review: copy.text('tabReview'),
    certification: certificationCopy('title'),
    contracts: copy.text('tabContracts'),
    'dossier-analysis': analysisTitle,
  };
}

/** The Clarté status badge of a Project status. */
export function ClarteProjectStatus({ status }: { status: ProjectStatus }) {
  const copy = useProjectLifecycleCopy();
  return (
    <ClarteBadge tone={projectStatusTones[status]}>
      {copy.statusLabels[status]}
    </ClarteBadge>
  );
}

/**
 * The opened Project as a mission space: its header with the Client, status,
 * owner and next action, the lifecycle, owner and next action panels, and
 * the row of views. The panels keep their existing owners mounted while
 * closed, so drafts, reads and commands survive closing them.
 */
export function ClarteMissionSpace({
  props,
  session,
  selected,
  tabs,
  shown,
  context,
  onBack,
}: Readonly<{
  props: ProjectWorkspaceProps;
  session: ProjectWorkspaceSession;
  selected: SelectedProject;
  tabs: readonly MissionTab[];
  shown: ProjectDetailPanel;
  context: MissionTabContext;
  onBack: () => void;
}>) {
  const { actor, identity, onOpenClientDossier } = props;
  const copy = useClarteMissionsCopy();
  const projectCopy = useProjectCopy();
  const labels = useMissionTabLabels();
  const { formatDateTime } = useInterfaceLocale();
  const [panel, setPanel] = useState<Panel>(null);
  const nextActionId = useId();
  const [nextAction, setNextAction] = useState<NextActionRecord | undefined>();
  const { project } = selected;
  const closed = isClosedProjectStatus(project.status);
  const owner = session.responsible;
  const reloadAfterChange = () => session.reloadSelected({ refreshMine: true });

  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    const ids = tabs.map((tab) => tab.id);
    const index = ids.indexOf(shown);
    const next =
      event.key === 'ArrowRight'
        ? ids[(index + 1) % ids.length]
        : event.key === 'ArrowLeft'
          ? ids[(index + ids.length - 1) % ids.length]
          : event.key === 'Home'
            ? ids[0]
            : event.key === 'End'
              ? ids[ids.length - 1]
              : undefined;
    if (!next) return;
    event.preventDefault();
    session.setDetailPanel(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#project-${next}-tab`)
      ?.focus();
  }

  return (
    <article
      className="clarte-mission"
      aria-labelledby="selected-project-title"
    >
      <div className="clarte-mission-trail">
        <ClarteButton variant="quiet" size="small" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {copy.text('backToProjects')}
        </ClarteButton>
        {session.dossierTarget && onOpenClientDossier && (
          <ClarteButton
            variant="quiet"
            size="small"
            onClick={() =>
              session.dossierTarget &&
              onOpenClientDossier(session.dossierTarget)
            }
          >
            <Building2 aria-hidden="true" />
            {projectCopy.openDossier}
          </ClarteButton>
        )}
      </div>
      <header className="clarte-mission-head">
        <div className="clarte-mission-identity">
          <h2
            id="selected-project-title"
            tabIndex={-1}
            ref={session.projectHeading}
          >
            {project.title}
          </h2>
          <div className="clarte-mission-meta">
            <p>
              {projectCopy.clientPrefix} {project.clientDisplayName}
            </p>
            <p>
              {projectCopy.registeredPrefix}{' '}
              <time dateTime={project.createdAt}>
                {formatDateTime(project.createdAt)}
              </time>
            </p>
            {owner !== undefined && (
              <p>
                {copy.text('owner')}:{' '}
                <strong>{owner?.displayLabel ?? copy.text('ownerNone')}</strong>
              </p>
            )}
          </div>
        </div>
        <div className="clarte-mission-commands">
          <ClarteProjectStatus status={project.status} />
          <ClarteButton
            size="small"
            aria-haspopup="dialog"
            onClick={() => setPanel('lifecycle')}
          >
            <RefreshCw aria-hidden="true" />
            {copy.text('lifecycleAction')}
          </ClarteButton>
          <ClarteButton
            size="small"
            aria-haspopup="dialog"
            onClick={() => setPanel('owner')}
          >
            <UserRound aria-hidden="true" />
            {copy.text('ownerAction')}
          </ClarteButton>
        </div>
      </header>
      {project.status === 'preparatory' && (
        <p className="clarte-mission-notice">{projectCopy.warning}</p>
      )}
      {isClosedProjectStatus(project.status) && (
        <p className="clarte-mission-notice" role="status">
          {projectCopy.closedNotice(project.status)}
        </p>
      )}
      <div
        className="clarte-card clarte-mission-next"
        role="group"
        aria-labelledby={nextActionId}
      >
        <div>
          <p className="clarte-mission-kicker" id={nextActionId}>
            <ArrowRight aria-hidden="true" />
            {copy.text('nextActionKicker')}
          </p>
          <p className="clarte-mission-next-text">
            {nextAction === undefined
              ? copy.text('nextActionUnavailable')
              : nextAction.revision === 0
                ? copy.text('nextActionNone')
                : (nextAction.text ?? copy.text('nextActionCleared'))}
          </p>
          {nextAction?.lastChange && (
            <p className="clarte-mission-next-meta">
              {nextAction.lastChange.displayName} —{' '}
              <time dateTime={nextAction.lastChange.occurredAt}>
                {formatDateTime(nextAction.lastChange.occurredAt)}
              </time>
            </p>
          )}
        </div>
        <ClarteButton
          size="small"
          aria-haspopup="dialog"
          onClick={() => setPanel('next-action')}
        >
          {canCoordinateNextAction(actor) && !closed ? (
            copy.text('nextActionChange')
          ) : (
            <>
              <History aria-hidden="true" />
              {copy.text('nextActionHistory')}
            </>
          )}
        </ClarteButton>
      </div>
      <div
        className="clarte-mission-tabs"
        role="tablist"
        aria-label={copy.text('viewsLabel')}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`project-${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={shown === tab.id}
            aria-controls={`project-${tab.id}-panel`}
            tabIndex={shown === tab.id ? 0 : -1}
            onClick={() => session.setDetailPanel(tab.id)}
            onKeyDown={moveTab}
          >
            {labels[tab.id]}
          </button>
        ))}
      </div>
      {tabs.map((tab) =>
        tab.render === undefined ||
        (tab.mount === 'selected' && shown !== tab.id) ? null : (
          <div
            key={tab.id}
            className="clarte-mission-panel"
            id={`project-${tab.id}-panel`}
            role="tabpanel"
            aria-labelledby={`project-${tab.id}-tab`}
            hidden={shown !== tab.id}
          >
            {tab.render(context)}
          </div>
        ),
      )}
      <ClarteSidePanel
        open={panel === 'lifecycle'}
        title={copy.text('lifecyclePanelTitle')}
        description={copy.text('lifecyclePanelDescription')}
        icon={<RefreshCw />}
        onClose={() => setPanel(null)}
      >
        <div className="clarte-mission-owner-panel">
          <ProjectLifecycle
            actor={actor}
            identity={identity}
            projectId={project.id}
            responsible={owner}
            onProjectChanged={reloadAfterChange}
            onShowTasks={() => {
              setPanel(null);
              session.showTasks();
            }}
            onActivityRecorded={props.onActivityRecorded}
          />
        </div>
      </ClarteSidePanel>
      <ClarteSidePanel
        open={panel === 'owner'}
        title={copy.text('ownerPanelTitle')}
        description={copy.text('ownerPanelDescription')}
        icon={<UserRound />}
        onClose={() => setPanel(null)}
      >
        <div className="clarte-mission-owner-panel">
          <ProjectResponsible
            actor={actor}
            identity={identity}
            projectId={project.id}
            projectStatus={project.status}
            onProjectChanged={reloadAfterChange}
            onActivityRecorded={props.onActivityRecorded}
            onResponsibleRead={session.acceptResponsibleRead}
          />
        </div>
      </ClarteSidePanel>
      <ClarteSidePanel
        open={panel === 'next-action'}
        title={copy.text('nextActionKicker')}
        description={copy.text('nextActionPanelDescription')}
        icon={<ArrowRight />}
        onClose={() => setPanel(null)}
      >
        <div className="clarte-mission-owner-panel">
          <ProjectNextAction
            actor={actor}
            identity={identity}
            projectId={project.id}
            originalClientId={project.clientAccountId}
            originalClientGeneration={context.clientIdentityRevision}
            projectStatus={project.status}
            onActorRevalidated={props.onActorRevalidated}
            onCompanyContextRejected={props.onCompanyContextRejected}
            onWorkspaceAccessRejected={props.onWorkspaceAccessRejected}
            onCurrentRead={setNextAction}
          />
        </div>
      </ClarteSidePanel>
    </article>
  );
}
