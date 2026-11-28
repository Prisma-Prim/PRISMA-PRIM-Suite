import { WorkingEvidenceWorkspace } from '../working-evidence/WorkingEvidenceWorkspace';
import { useWorkingEvidenceCopy } from '../working-evidence/working-evidence.copy';
import { CertificationWorkspace } from '../certification/CertificationWorkspace';
import {
  DossierAnalysisWorkspace,
  useDossierAnalysisTitle,
} from '../dossier-analysis/DossierAnalysisWorkspace';
import { useCertificationCopy } from '../certification/certification.copy';
import { ProjectPdfBundle } from './ProjectPdfBundle';
import { ProjectNextAction } from './ProjectNextAction';
import { MissionPlanCurrentWork } from '../mission-plan/MissionPlanCurrentWork';
import {
  MissionPlanProjectCreator,
  MissionPlanProjectCopy,
} from '../mission-plan/MissionPlanProject';
import { ProjectStage } from './ProjectStage';
import {
  ProjectTemplateSelector,
  ProjectTemplatePlan,
  canUseProjectTemplate,
  canInstantiateProjectTemplate,
} from './ProjectTemplate';
import { useProjectTemplateCopy } from './project-template.copy';
import { ProjectDocuments } from './ProjectDocuments';
import { ProjectLifecycle, ProjectStatusLabel } from './ProjectLifecycle';
import { ProjectContracts } from '../contract/ProjectContracts';
import { ProjectResponsible } from './ProjectResponsible';
import { ProjectTasks } from './ProjectTasks';
import type { KeyboardEvent } from 'react';
import { holds } from '../access/company-grants';
import { useProjectCopy } from './project-localized.copy';
import { useProjectDocumentsCopy } from './project-documents.copy';
import { useInterfaceLocale } from '../localization/interface-locale';
import { Select } from '../presentation/Select';
import { useProjectTaskCopy } from './task.copy';
import { isClosedProjectStatus } from './project-lifecycle-response';
import {
  useProjectWorkspace,
  type ProjectDetailPanel,
  type ProjectWorkspaceProps,
} from './use-project-workspace';
import './project.css';

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
  const {
    actor,
    identity,
    onActivityRecorded = () => undefined,
    clientIdentityRevision = 0,
    onOpenClientDossier,
    onOpenDocument,
    onOpenContract,
    catalogueRevision = 0,
    onActorRevalidated,
    onCompanyContextRejected,
    onWorkspaceAccessRejected,
  } = props;
  const copy = useProjectCopy();
  const evidenceCopy = useWorkingEvidenceCopy();
  const certificationCopy = useCertificationCopy();
  const analysisTitle = useDossierAnalysisTitle();
  const documentsCopy = useProjectDocumentsCopy();
  const templateCopy = useProjectTemplateCopy();
  const taskCopy = useProjectTaskCopy();
  const session = useProjectWorkspace(props);
  const {
    authorized,
    evidenceAuthority,
    certificationReader,
    analysisReader,
    templateAuthority,
    templateSelection,
    detailPanel,
    setDetailPanel,
    selected,
    includeClosed,
    filter,
    title,
    clientAccountId,
    feedback,
    pending,
    load,
    directory,
    directoryProjects,
    readyRows,
    projectsInStatusView,
    filteredProjects,
    refreshFailed,
    restrictionAwaitsRead,
    dossierTarget,
  } = session;
  function moveDetailTab(
    event: KeyboardEvent<HTMLButtonElement>,
    panel: ProjectDetailPanel,
  ) {
    const panels: ProjectDetailPanel[] = ['tasks', 'documents'];
    if (evidenceAuthority) panels.push('working-evidence');
    if (certificationReader) panels.push('certification');
    if (analysisReader) panels.push('dossier-analysis');
    const index = panels.indexOf(panel);
    const next =
      event.key === 'ArrowRight'
        ? panels[(index + 1) % panels.length]
        : event.key === 'ArrowLeft'
          ? panels[(index + panels.length - 1) % panels.length]
          : event.key === 'Home'
            ? panels[0]
            : event.key === 'End'
              ? panels[panels.length - 1]
              : undefined;
    if (!next) return;
    event.preventDefault();
    setDetailPanel(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#project-${next}-tab`)
      ?.focus();
  }
  return (
    <section
      id="projects"
      tabIndex={-1}
      className="project-workspace project-workspace--prisme"
      aria-labelledby="project-title"
    >
      <header className="project-workspace-heading">
        <p className="prisme-eyebrow">{copy.eyebrow}</p>
        <h2 id="project-title">{copy.title}</h2>
        <p>
          {copy.companyPrefix} {actor.activeCompany?.displayName}
        </p>
      </header>
      {load.kind === 'loading' && <p role="status">{copy.loading}</p>}
      {load.kind === 'denied' && <p role="alert">{copy.denied}</p>}
      {load.kind === 'error' && <p role="alert">{copy.error}</p>}
      <button type="button" disabled={pending} onClick={session.retryDirectory}>
        {load.view === 'mine_open' ? copy.retryView : copy.retry}
      </button>
      {authorized && (
        <div className="project-view-control">
          <label htmlFor="project-directory-view">{copy.viewLabel}</label>
          <Select
            id="project-directory-view"
            value={load.view}
            disabled={load.kind === 'denied'}
            options={[
              { value: 'all', label: copy.allProjects },
              { value: 'mine_open', label: copy.myOpenProjects },
            ]}
            onValueChange={(value) => {
              if (value === 'all' || value === 'mine_open')
                directory.changeView(value);
            }}
          />
        </div>
      )}
      {load.kind === 'ready' && (
        <>
          {load.rows.kind === 'loading' && <p role="status">{copy.loading}</p>}
          {load.rows.kind === 'error' && (
            <p role="alert">{copy.viewUnavailable}</p>
          )}
          {readyRows && directoryProjects.length === 0 && (
            <p>{load.view === 'mine_open' ? copy.mineEmpty : copy.empty}</p>
          )}
          {directoryProjects.length > 0 && (
            <>
              {load.view === 'all' && (
                <label className="project-closed-filter">
                  <input
                    type="checkbox"
                    checked={includeClosed}
                    disabled={pending}
                    onChange={(event) =>
                      session.setIncludeClosed(event.target.checked)
                    }
                  />
                  {copy.includeClosed}
                </label>
              )}
              <label className="project-search">
                {copy.searchLabel}
                <input
                  type="search"
                  value={
                    filter.kind === 'client' ? filter.displayName : filter.query
                  }
                  placeholder={copy.searchPlaceholder}
                  onChange={(event) =>
                    session.setFilter({
                      kind: 'text',
                      query: event.target.value,
                    })
                  }
                  disabled={pending}
                />
              </label>
            </>
          )}
          {load.view === 'all' &&
            !includeClosed &&
            directoryProjects.length > 0 &&
            projectsInStatusView.length === 0 && <p>{copy.noOpen}</p>}
          {refreshFailed ? (
            <p role="alert">{copy.error}</p>
          ) : restrictionAwaitsRead ? (
            <p role="status">{copy.loading}</p>
          ) : (
            projectsInStatusView.length > 0 &&
            filteredProjects.length === 0 && (
              <p className="project-no-matches">{copy.noMatches}</p>
            )
          )}
          <ul className="project-list" aria-label={copy.title}>
            {filteredProjects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => session.openProject(project.id)}
                >
                  <span>{project.title}</span>{' '}
                  <span className="project-list-client">
                    {copy.clientPrefix} {project.clientDisplayName}
                  </span>
                </button>
                <p className="project-list-status">
                  <ProjectStatusLabel status={project.status} />
                </p>
                <ProjectRegistrationTime registeredAt={project.createdAt} />
              </li>
            ))}
          </ul>
          {session.canCreate && (
            <form className="project-registration" onSubmit={session.submit}>
              <p className="project-warning">{copy.warning}</p>
              <label>
                {copy.projectTitle}
                <input
                  value={title}
                  maxLength={200}
                  onChange={(event) => session.setTitle(event.target.value)}
                  disabled={pending}
                />
              </label>
              <div className="project-client-field">
                <label htmlFor="project-client">{copy.client}</label>
                <Select
                  id="project-client"
                  value={clientAccountId}
                  disabled={pending}
                  placeholder={copy.selectClient}
                  options={load.clients.map((client) => ({
                    value: client.id,
                    label: client.displayName,
                  }))}
                  onValueChange={session.setClientAccountId}
                />
              </div>
              {canInstantiateProjectTemplate(actor) &&
                !session.templateDenied && (
                  <ProjectTemplateSelector
                    key={templateAuthority}
                    actor={actor}
                    identity={identity}
                    catalogueRevision={catalogueRevision}
                    selection={templateSelection}
                    onSelection={session.setTemplateSelection}
                    disabled={pending}
                  />
                )}
              {load.clients.length === 0 && <p>{copy.noClients}</p>}
              <button
                type="submit"
                disabled={pending || load.clients.length === 0}
              >
                {templateSelection ? templateCopy('create') : copy.create}
              </button>
            </form>
          )}
        </>
      )}
      {load.kind !== 'denied' && (
        <MissionPlanProjectCreator
          actor={actor}
          identity={identity}
          clients={load.kind === 'ready' ? load.clients : null}
          onActivityRecorded={onActivityRecorded}
          onActorRevalidated={onActorRevalidated}
          onCompanyContextRejected={onCompanyContextRejected}
          onWorkspaceAccessRejected={onWorkspaceAccessRejected}
          onCreated={session.acceptMissionPlanProject}
        />
      )}
      {feedback && (
        <p role="alert">
          {typeof feedback === 'string'
            ? copy[feedback]
            : templateCopy(feedback.message)}
        </p>
      )}
      {selected && (
        <article
          className="project-detail-card"
          aria-labelledby="selected-project-title"
        >
          <div className="project-detail-overview">
            <p className="project-detail-status">
              <ProjectStatusLabel status={selected.project.status} />
            </p>
            <h3
              id="selected-project-title"
              tabIndex={-1}
              ref={session.projectHeading}
            >
              {selected.project.title}
            </h3>
            <p className="project-detail-client">
              {copy.clientPrefix} {selected.project.clientDisplayName}
            </p>
            <ProjectRegistrationTime
              registeredAt={selected.project.createdAt}
            />
            {selected.project.status === 'preparatory' && (
              <p className="project-warning">{copy.warning}</p>
            )}
            {isClosedProjectStatus(selected.project.status) && (
              <p className="project-closed-notice" role="status">
                {copy.closedNotice(selected.project.status)}
              </p>
            )}
            {dossierTarget && onOpenClientDossier && (
              <ClientDossierButton
                clientDossierId={dossierTarget}
                onOpen={onOpenClientDossier}
              />
            )}
          </div>
          <ProjectLifecycle
            actor={actor}
            identity={identity}
            projectId={selected.project.id}
            responsible={session.responsible}
            onProjectChanged={() =>
              session.reloadSelected({ refreshMine: true })
            }
            onShowTasks={session.showTasks}
            onActivityRecorded={onActivityRecorded}
          />
          <ProjectContracts
            actor={actor}
            identity={identity}
            projectId={selected.project.id}
            onOpenContract={onOpenContract}
          />
          <ProjectNextAction
            actor={actor}
            identity={identity}
            projectId={selected.project.id}
            originalClientId={selected.project.clientAccountId}
            originalClientGeneration={clientIdentityRevision}
            projectStatus={selected.project.status}
            onActorRevalidated={onActorRevalidated}
            onCompanyContextRejected={onCompanyContextRejected}
            onWorkspaceAccessRejected={onWorkspaceAccessRejected}
          />
          <ProjectResponsible
            actor={actor}
            identity={identity}
            projectId={selected.project.id}
            projectStatus={selected.project.status}
            onProjectChanged={() =>
              session.reloadSelected({ refreshMine: true })
            }
            onActivityRecorded={onActivityRecorded}
            onResponsibleRead={session.acceptResponsibleRead}
          />
          <div className="project-detail-tabs" role="tablist">
            <button
              id="project-tasks-tab"
              type="button"
              role="tab"
              aria-selected={detailPanel === 'tasks'}
              aria-controls="project-tasks-panel"
              tabIndex={detailPanel === 'tasks' ? 0 : -1}
              onClick={() => setDetailPanel('tasks')}
              onKeyDown={(event) => moveDetailTab(event, 'tasks')}
            >
              {taskCopy.title}
            </button>
            <button
              id="project-documents-tab"
              type="button"
              role="tab"
              aria-selected={detailPanel === 'documents'}
              aria-controls="project-documents-panel"
              tabIndex={detailPanel === 'documents' ? 0 : -1}
              onClick={() => setDetailPanel('documents')}
              onKeyDown={(event) => moveDetailTab(event, 'documents')}
            >
              {documentsCopy.title}
            </button>
            {evidenceAuthority && (
              <button
                id="project-working-evidence-tab"
                type="button"
                role="tab"
                aria-selected={detailPanel === 'working-evidence'}
                aria-controls="project-working-evidence-panel"
                tabIndex={detailPanel === 'working-evidence' ? 0 : -1}
                onClick={() => setDetailPanel('working-evidence')}
                onKeyDown={(event) => moveDetailTab(event, 'working-evidence')}
              >
                {evidenceCopy('title')}
              </button>
            )}
            {certificationReader && (
              <button
                id="project-certification-tab"
                type="button"
                role="tab"
                aria-selected={detailPanel === 'certification'}
                aria-controls="project-certification-panel"
                tabIndex={detailPanel === 'certification' ? 0 : -1}
                onClick={() => setDetailPanel('certification')}
                onKeyDown={(event) => moveDetailTab(event, 'certification')}
              >
                {certificationCopy('title')}
              </button>
            )}
            {analysisReader && (
              <button
                id="project-dossier-analysis-tab"
                type="button"
                role="tab"
                aria-selected={detailPanel === 'dossier-analysis'}
                aria-controls="project-dossier-analysis-panel"
                tabIndex={detailPanel === 'dossier-analysis' ? 0 : -1}
                onClick={() => setDetailPanel('dossier-analysis')}
                onKeyDown={(event) => moveDetailTab(event, 'dossier-analysis')}
              >
                {analysisTitle}
              </button>
            )}
          </div>
          <MissionPlanProjectCopy
            actor={actor}
            identity={identity}
            projectId={selected.project.id}
            onActorRevalidated={onActorRevalidated}
            onCompanyContextRejected={onCompanyContextRejected}
            onWorkspaceAccessRejected={onWorkspaceAccessRejected}
            onOpenTask={session.openPlanTask}
          />
          <MissionPlanCurrentWork
            actor={actor}
            identity={identity}
            projectId={selected.project.id}
            clientAccountId={selected.project.clientAccountId}
            onActorRevalidated={onActorRevalidated}
            onCompanyContextRejected={onCompanyContextRejected}
            onWorkspaceAccessRejected={onWorkspaceAccessRejected}
            onOpenTask={session.openPlanTask}
          />
          {canUseProjectTemplate(actor) &&
            holds(actor.activeCompany, 'company_task_manager', 'task.read') && (
              <ProjectTemplatePlan
                originalClientGeneration={clientIdentityRevision}
                onActorRevalidated={onActorRevalidated}
                onCompanyContextRejected={onCompanyContextRejected}
                onWorkspaceAccessRejected={onWorkspaceAccessRejected}
                onActivityRecorded={onActivityRecorded}
                key={`${selected.project.id}:${templateAuthority}`}
                actor={actor}
                identity={identity}
                projectId={selected.project.id}
                onOpenTask={session.openPlanTask}
              />
            )}
          {canUseProjectTemplate(actor) &&
            holds(actor.activeCompany, 'company_task_manager', 'task.read') && (
              <ProjectStage
                actor={actor}
                identity={identity}
                projectId={selected.project.id}
                onActivityRecorded={onActivityRecorded}
              />
            )}
          <div
            className="project-detail-panel"
            id="project-working-evidence-panel"
            role="tabpanel"
            aria-labelledby="project-working-evidence-tab"
            hidden={detailPanel !== 'working-evidence'}
          >
            <WorkingEvidenceWorkspace
              actor={actor}
              identity={identity}
              projectId={selected.project.id}
              projectStatus={selected.project.status}
              onActorRevalidated={onActorRevalidated}
              onCompanyContextRejected={onCompanyContextRejected}
              onWorkspaceAccessRejected={onWorkspaceAccessRejected}
              onActivityRecorded={onActivityRecorded}
            />
          </div>
          {certificationReader && (
            <div
              className="project-detail-panel"
              id="project-certification-panel"
              role="tabpanel"
              aria-labelledby="project-certification-tab"
              hidden={detailPanel !== 'certification'}
            >
              <CertificationWorkspace
                actor={actor}
                identity={identity}
                projectId={selected.project.id}
                onActorRevalidated={onActorRevalidated}
                onCompanyContextRejected={onCompanyContextRejected}
                onWorkspaceAccessRejected={onWorkspaceAccessRejected}
              />
            </div>
          )}
          {analysisReader && detailPanel === 'dossier-analysis' && (
            <div
              className="project-detail-panel"
              id="project-dossier-analysis-panel"
              role="tabpanel"
              aria-labelledby="project-dossier-analysis-tab"
            >
              <DossierAnalysisWorkspace
                actor={actor}
                identity={identity}
                projectId={selected.project.id}
                authorityGeneration={String(clientIdentityRevision)}
                onActorRevalidated={onActorRevalidated}
                onCompanyContextRejected={onCompanyContextRejected}
                onWorkspaceAccessRejected={onWorkspaceAccessRejected}
              />
            </div>
          )}
          <div
            className="project-detail-panel"
            id="project-documents-panel"
            role="tabpanel"
            aria-labelledby="project-documents-tab"
            hidden={detailPanel !== 'documents'}
          >
            <ProjectDocuments
              actor={actor}
              identity={identity}
              projectId={selected.project.id}
              projectStatus={selected.project.status}
              onProjectChanged={() => session.reloadSelected()}
              onActivityRecorded={onActivityRecorded}
              onOpenDocument={onOpenDocument}
            />
            <ProjectPdfBundle
              actor={actor}
              identity={identity}
              projectId={selected.project.id}
              originalClientId={selected.project.clientAccountId}
            />
          </div>
        </article>
      )}
      <div
        className="project-detail-panel"
        id="project-tasks-panel"
        role="tabpanel"
        aria-labelledby="project-tasks-tab"
        hidden={!selected || detailPanel !== 'tasks'}
        tabIndex={-1}
      >
        <ProjectTasks
          actor={actor}
          identity={identity}
          clientIdentityRevision={clientIdentityRevision}
          projectId={selected?.project.id ?? null}
          projectStatus={selected?.project.status ?? null}
          onProjectChanged={
            selected ? () => session.reloadSelected() : undefined
          }
          onActivityRecorded={onActivityRecorded}
          requestedTask={selected?.requestedTask}
        />
      </div>
    </section>
  );
}
function ProjectRegistrationTime({ registeredAt }: { registeredAt: string }) {
  const copy = useProjectCopy();
  const { formatDateTime } = useInterfaceLocale();
  return (
    <p className="project-registered">
      {copy.registeredPrefix}{' '}
      <time dateTime={registeredAt}>{formatDateTime(registeredAt)}</time>
    </p>
  );
}
function ClientDossierButton({
  clientDossierId,
  onOpen,
}: {
  clientDossierId: string;
  onOpen: (clientDossierId: string) => void;
}) {
  const copy = useProjectCopy();
  return (
    <button type="button" onClick={() => onOpen(clientDossierId)}>
      {copy.openDossier}
    </button>
  );
}
