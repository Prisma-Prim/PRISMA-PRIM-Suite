import {
  ArrowLeft,
  ClipboardList,
  LayoutTemplate,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { holds } from '../../access/company-grants';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { MissionPlanProjectCreator } from '../../mission-plan/MissionPlanProject';
import { missionPlanAuthority } from '../../mission-plan/mission-plan-authority';
import { ProjectTasks } from '../../project/ProjectTasks';
import {
  ProjectTemplateSelector,
  canInstantiateProjectTemplate,
  canUseProjectTemplate,
  useCopiedTemplatePlan,
  type CopiedTemplatePlanRead,
} from '../../project/ProjectTemplate';
import { useProjectCopy } from '../../project/project-localized.copy';
import { useProjectTemplateCopy } from '../../project/project-template.copy';
import {
  useProjectWorkspace,
  type ProjectWorkspaceProps,
  type ProjectWorkspaceSession,
} from '../../project/use-project-workspace';
import { Select } from '../../presentation/Select';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteField } from '../components/ClarteField';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import { useClarteComponentCopy } from '../components/clarte-components.copy';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { useClarteMissionsCopy } from './clarte-missions.copy';
import { ClarteMissionSpace, ClarteProjectStatus } from './ClarteMissionSpace';
import { missionTabs, type MissionTabContext } from './mission-tabs';
import './clarte-missions.css';

type CreationPanel = 'preparatory' | 'template' | 'mission-plan' | null;
type TemplatePlanSource = {
  key: string;
  read: CopiedTemplatePlanRead;
  retry: () => void;
};

/** The copied Template plan may be read: the plan the current interface shows. */
function readsTemplatePlan(actor: ProjectWorkspaceProps['actor']) {
  return (
    canUseProjectTemplate(actor) &&
    holds(actor.activeCompany, 'company_task_manager', 'task.read')
  );
}

/**
 * Missions and audits in the Clarté interface: the active Company's Project
 * list, its creation panels and the mission space of the opened Project. It
 * renders the same Projects session as the current interface; NestJS decides
 * every read, creation and command.
 */
export function ClarteMissions({
  configuration,
  ...props
}: ProjectWorkspaceProps &
  Readonly<{
    /** Template and Mission Plan configuration, shown under the list. */
    configuration?: ReactNode;
  }>) {
  const { actor, identity, onActivityRecorded } = props;
  const clientIdentityRevision = props.clientIdentityRevision ?? 0;
  const templateEnabled = readsTemplatePlan(actor);
  const planAvailable =
    templateEnabled || missionPlanAuthority(actor, 'copy') !== null;
  const session = useProjectWorkspace(props, {
    landingPanel: planAvailable ? 'plan' : 'tasks',
  });
  const { selected } = session;
  const screen = useRef<HTMLElement>(null);
  const [planSource, setPlanSource] = useState<TemplatePlanSource | null>(null);
  const planKey = selected
    ? `${selected.project.id}:${session.templateAuthority}`
    : undefined;
  const templatePlan: CopiedTemplatePlanRead | undefined = !templateEnabled
    ? undefined
    : planSource !== null && planSource.key === planKey
      ? planSource.read
      : { kind: 'loading' };
  const projectsLabel = useProjectCopy().title;
  const context: MissionTabContext | undefined = selected
    ? {
        actor,
        identity,
        project: selected.project,
        clientIdentityRevision,
        templatePlan,
        retryTemplatePlan: () => planSource?.retry(),
        openTask: session.openPlanTask,
        reloadProject: () => session.reloadSelected(),
        onActivityRecorded,
        onOpenDocument: props.onOpenDocument,
        onOpenContract: props.onOpenContract,
        onActorRevalidated: props.onActorRevalidated,
        onCompanyContextRejected: props.onCompanyContextRejected,
        onWorkspaceAccessRejected: props.onWorkspaceAccessRejected,
      }
    : undefined;
  const tabs = context
    ? missionTabs.filter((tab) => tab.available(context))
    : [];
  const shown = tabs.some((tab) => tab.id === session.detailPanel)
    ? session.detailPanel
    : 'tasks';
  // A directory intent (a Client dossier's or Today's Project list) shows the
  // list over the opened Project, as the current interface shows both. The
  // Project stays mounted with its drafts until the member returns to it or
  // another opens; each intent applies once.
  const navigation = props.navigation;
  const [directory, setDirectory] = useState<{
    requestId: number | undefined;
    over: string | null;
  }>(() => ({
    requestId:
      navigation?.kind === 'directory' ? navigation.requestId : undefined,
    over: null,
  }));
  if (
    navigation?.kind === 'directory' &&
    navigation.requestId !== directory.requestId
  )
    setDirectory({
      requestId: navigation.requestId,
      over: selected?.project.id ?? null,
    });
  else if (selected === null && directory.over !== null)
    setDirectory({ ...directory, over: null });
  const listOver = selected !== null && directory.over === selected.project.id;
  return (
    <section
      id="projects"
      ref={screen}
      tabIndex={-1}
      className="clarte-missions"
      aria-label={projectsLabel}
    >
      <ProjectList
        props={props}
        session={session}
        hidden={selected !== null && !listOver}
        configuration={configuration}
        returnTo={
          listOver && selected
            ? {
                title: selected.project.title,
                onReturn: () => {
                  setDirectory({ ...directory, over: null });
                  window.requestAnimationFrame(() =>
                    session.projectHeading.current?.focus(),
                  );
                },
              }
            : undefined
        }
      />
      {selected && templateEnabled && planKey && (
        <TemplatePlanReader
          key={planKey}
          sourceKey={planKey}
          actor={actor}
          identity={identity}
          projectId={selected.project.id}
          onRead={setPlanSource}
        />
      )}
      {/* A failed refresh of the opened Project is announced above it. */}
      {selected && !listOver && <FeedbackAlert session={session} />}
      {selected && context && (
        <ClarteMissionSpace
          key={selected.project.id}
          hidden={listOver}
          props={props}
          session={session}
          selected={selected}
          tabs={tabs}
          shown={shown}
          context={context}
          onBack={() => {
            session.closeProject();
            // The list takes the place of the closed Project; focus its screen.
            window.requestAnimationFrame(() => screen.current?.focus());
          }}
        />
      )}
      <div
        className="clarte-mission-panel"
        id="project-tasks-panel"
        role="tabpanel"
        aria-labelledby="project-tasks-tab"
        hidden={!selected || listOver || shown !== 'tasks'}
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

/** Reads the opened Project's copied Template plan and hands it up. */
function TemplatePlanReader({
  sourceKey,
  actor,
  identity,
  projectId,
  onRead,
}: Readonly<{
  sourceKey: string;
  actor: ProjectWorkspaceProps['actor'];
  identity: ProjectWorkspaceProps['identity'];
  projectId: string;
  onRead: (source: TemplatePlanSource) => void;
}>) {
  const { load, retry } = useCopiedTemplatePlan({
    actor,
    identity,
    projectId,
  });
  const latestRetry = useRef(retry);
  latestRetry.current = retry;
  useEffect(() => {
    onRead({ key: sourceKey, read: load, retry: () => latestRetry.current() });
  }, [load, sourceKey, onRead]);
  return null;
}

function ProjectList({
  props,
  session,
  hidden,
  configuration,
  returnTo,
}: Readonly<{
  props: ProjectWorkspaceProps;
  session: ProjectWorkspaceSession;
  hidden: boolean;
  configuration: ReactNode;
  /** The opened Project the list was shown over, and the way back to it. */
  returnTo?: Readonly<{ title: string; onReturn: () => void }>;
}>) {
  const { actor } = props;
  const copy = useProjectCopy();
  const clarte = useClarteMissionsCopy();
  const { formatDateTime } = useInterfaceLocale();
  const [panel, setPanel] = useState<CreationPanel>(null);
  const { load, pending, filter } = session;
  const selectedId = session.selected?.project.id;
  // A confirmed creation opens its Project's mission space and ends the panel.
  useEffect(() => {
    if (selectedId !== undefined) setPanel(null);
  }, [selectedId]);
  const canUseTemplates =
    session.canCreate &&
    canInstantiateProjectTemplate(actor) &&
    !session.templateDenied;
  const canUseMissionPlans =
    load.kind !== 'denied' && missionPlanAuthority(actor, 'create') !== null;
  const retryLabel = load.view === 'mine_open' ? copy.retryView : copy.retry;
  const retry = (
    <ClarteButton
      variant="quiet"
      size="small"
      disabled={pending}
      onClick={session.retryDirectory}
    >
      <RefreshCw aria-hidden="true" />
      {retryLabel}
    </ClarteButton>
  );
  return (
    <div className="clarte-missions-list" hidden={hidden}>
      {/* The screen itself is the Projects region; the card only groups it. */}
      {returnTo && (
        <div className="clarte-mission-trail">
          <ClarteButton
            variant="quiet"
            size="small"
            onClick={returnTo.onReturn}
          >
            <ArrowLeft aria-hidden="true" />
            {clarte.returnToProject(returnTo.title)}
          </ClarteButton>
        </div>
      )}
      <div className="clarte-card clarte-missions-card">
        <h2 className="clarte-visually-hidden">{copy.title}</h2>
        <div className="clarte-card-head">
          {session.authorized ? (
            <div
              className="clarte-segmented"
              role="group"
              aria-label={copy.viewLabel}
            >
              {(['all', 'mine_open'] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={load.view === view}
                  disabled={load.kind === 'denied'}
                  onClick={() => session.directory.changeView(view)}
                >
                  {view === 'all' ? copy.allProjects : copy.myOpenProjects}
                </button>
              ))}
              {load.kind === 'ready' &&
                load.view === 'all' &&
                session.directoryProjects.length > 0 && (
                  <label className="clarte-segmented-toggle">
                    <input
                      type="checkbox"
                      className="clarte-visually-hidden"
                      checked={session.includeClosed}
                      disabled={pending}
                      onChange={(event) =>
                        session.setIncludeClosed(event.target.checked)
                      }
                    />
                    {copy.includeClosed}
                  </label>
                )}
            </div>
          ) : (
            <span />
          )}
          <div className="clarte-card-actions">
            {session.canCreate && load.kind === 'ready' && (
              <ClarteButton
                size="small"
                aria-haspopup="dialog"
                onClick={() => {
                  // The preparatory form never carries a template choice.
                  session.setTemplateSelection(null);
                  setPanel('preparatory');
                }}
              >
                <Plus aria-hidden="true" />
                {clarte.text('newPreparatory')}
              </ClarteButton>
            )}
            {canUseTemplates && load.kind === 'ready' && (
              <ClarteButton
                size="small"
                className="clarte-missions-accent"
                aria-haspopup="dialog"
                onClick={() => setPanel('template')}
              >
                <LayoutTemplate aria-hidden="true" />
                {clarte.text('fromTemplate')}
              </ClarteButton>
            )}
            {canUseMissionPlans && (
              <ClarteButton
                size="small"
                className="clarte-missions-accent"
                aria-haspopup="dialog"
                onClick={() => setPanel('mission-plan')}
              >
                <ClipboardList aria-hidden="true" />
                {clarte.text('fromMissionPlan')}
              </ClarteButton>
            )}
          </div>
        </div>
        <div className="clarte-missions-toolbar">
          {load.kind === 'ready' && session.directoryProjects.length > 0 && (
            <div className="clarte-missions-search">
              <ClarteField label={copy.searchLabel} labelHidden>
                {(control) => (
                  <input
                    {...control}
                    className="clarte-input"
                    type="search"
                    value={
                      filter.kind === 'client'
                        ? filter.displayName
                        : filter.query
                    }
                    placeholder={copy.searchPlaceholder}
                    disabled={pending}
                    onChange={(event) =>
                      session.setFilter({
                        kind: 'text',
                        query: event.target.value,
                      })
                    }
                  />
                )}
              </ClarteField>
            </div>
          )}
          <div className="clarte-missions-retry">{retry}</div>
        </div>
        {session.feedback && panel === null && (
          <FeedbackAlert session={session} />
        )}
        {load.kind === 'loading' && <ClarteLoadingState label={copy.loading} />}
        {load.kind === 'denied' && <ClarteErrorState title={copy.denied} />}
        {load.kind === 'error' && <ClarteErrorState title={copy.error} />}
        {load.kind === 'ready' && (
          <>
            {load.rows.kind === 'loading' && (
              <ClarteLoadingState label={copy.loading} />
            )}
            {load.rows.kind === 'error' && (
              <ClarteErrorState title={copy.viewUnavailable} />
            )}
            {session.readyRows && session.directoryProjects.length === 0 && (
              <ClarteEmptyState
                title={load.view === 'mine_open' ? copy.mineEmpty : copy.empty}
              />
            )}
            {load.view === 'all' &&
              !session.includeClosed &&
              session.directoryProjects.length > 0 &&
              session.projectsInStatusView.length === 0 && (
                <ClarteEmptyState title={copy.noOpen} />
              )}
            {session.refreshFailed ? (
              <ClarteErrorState title={copy.error} />
            ) : session.restrictionAwaitsRead ? (
              <ClarteLoadingState label={copy.loading} />
            ) : (
              session.projectsInStatusView.length > 0 &&
              session.filteredProjects.length === 0 && (
                <ClarteEmptyState title={copy.noMatches} />
              )
            )}
            {session.filteredProjects.length > 0 && (
              <div className="clarte-table-wrap">
                <table className="clarte-table clarte-missions-table">
                  <caption className="clarte-visually-hidden">
                    {copy.title}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{clarte.text('columnProject')}</th>
                      <th scope="col">{clarte.text('columnClient')}</th>
                      <th scope="col">{clarte.text('columnStatus')}</th>
                      <th scope="col">{clarte.text('columnRegistered')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.filteredProjects.map((project) => (
                      <tr key={project.id}>
                        <th scope="row">
                          <button
                            type="button"
                            className="clarte-missions-open"
                            disabled={pending}
                            onClick={() => session.openProject(project.id)}
                          >
                            <span className="clarte-missions-title">
                              {project.title}
                            </span>{' '}
                            {/* Same-titled Projects stay distinct when read button by button. */}
                            <span className="clarte-visually-hidden">
                              {copy.clientPrefix} {project.clientDisplayName}
                            </span>
                          </button>
                        </th>
                        <td data-label={clarte.text('columnClient')}>
                          {project.clientDisplayName}
                        </td>
                        <td data-label={clarte.text('columnStatus')}>
                          <ClarteProjectStatus status={project.status} />
                        </td>
                        <td data-label={clarte.text('columnRegistered')}>
                          <time dateTime={project.createdAt}>
                            {formatDateTime(project.createdAt)}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
      {load.kind === 'ready' &&
        (panel === 'preparatory' || panel === 'template') && (
          <RegistrationPanel
            props={props}
            session={session}
            kind={panel}
            onClose={() => setPanel(null)}
          />
        )}
      {canUseMissionPlans && (
        <ClarteSidePanel
          open={panel === 'mission-plan'}
          title={clarte.text('missionPlanPanelTitle')}
          description={clarte.text('missionPlanPanelDescription')}
          icon={<ClipboardList />}
          onClose={() => setPanel(null)}
        >
          <div className="clarte-mission-owner-panel">
            <MissionPlanProjectCreator
              actor={actor}
              identity={props.identity}
              clients={load.kind === 'ready' ? load.clients : null}
              onActivityRecorded={props.onActivityRecorded}
              onActorRevalidated={props.onActorRevalidated}
              onCompanyContextRejected={props.onCompanyContextRejected}
              onWorkspaceAccessRejected={props.onWorkspaceAccessRejected}
              onCreated={session.acceptMissionPlanProject}
            />
          </div>
        </ClarteSidePanel>
      )}
      {configuration}
    </div>
  );
}

function FeedbackAlert({ session }: { session: ProjectWorkspaceSession }) {
  const copy = useProjectCopy();
  const templateCopy = useProjectTemplateCopy();
  const { feedback } = session;
  if (!feedback) return null;
  return (
    <p className="clarte-missions-alert" role="alert">
      {typeof feedback === 'string'
        ? copy[feedback]
        : templateCopy(feedback.message)}
    </p>
  );
}

/** A preparatory Project, or one created from a chosen Project Template. */
function RegistrationPanel({
  props,
  session,
  kind,
  onClose,
}: Readonly<{
  props: ProjectWorkspaceProps;
  session: ProjectWorkspaceSession;
  kind: 'preparatory' | 'template';
  onClose: () => void;
}>) {
  const copy = useProjectCopy();
  const clarte = useClarteMissionsCopy();
  const componentCopy = useClarteComponentCopy();
  const templateCopy = useProjectTemplateCopy();
  const formId = useId();
  const { load, pending } = session;
  const clients = load.kind === 'ready' ? load.clients : [];
  const fromTemplate = kind === 'template';
  const awaitsTemplate = fromTemplate && session.templateSelection === null;
  return (
    <ClarteSidePanel
      title={clarte.text(
        fromTemplate ? 'templatePanelTitle' : 'preparatoryPanelTitle',
      )}
      description={clarte.text(
        fromTemplate
          ? 'templatePanelDescription'
          : 'preparatoryPanelDescription',
      )}
      icon={fromTemplate ? <LayoutTemplate /> : <Plus />}
      dismissible={!pending}
      onClose={onClose}
      footer={
        <>
          <ClarteButton disabled={pending} onClick={onClose}>
            {componentCopy.cancel}
          </ClarteButton>
          <ClarteButton
            variant="primary"
            type="submit"
            form={formId}
            disabled={pending || clients.length === 0 || awaitsTemplate}
          >
            {fromTemplate
              ? templateCopy('create')
              : clarte.text('createPreparatory')}
          </ClarteButton>
        </>
      }
    >
      <form
        id={formId}
        className="clarte-missions-form"
        onSubmit={(event: FormEvent) => {
          if (awaitsTemplate) {
            event.preventDefault();
            return;
          }
          session.submit(event);
        }}
      >
        {fromTemplate && !session.templateDenied && (
          <div className="clarte-mission-owner-panel">
            <ProjectTemplateSelector
              key={session.templateAuthority}
              actor={props.actor}
              identity={props.identity}
              catalogueRevision={props.catalogueRevision}
              selection={session.templateSelection}
              onSelection={session.setTemplateSelection}
              disabled={pending}
            />
          </div>
        )}
        {awaitsTemplate && !session.templateDenied && (
          <p className="clarte-field-hint">
            {clarte.text('chooseTemplateFirst')}
          </p>
        )}
        <ClarteField label={copy.projectTitle}>
          {(control) => (
            <input
              {...control}
              className="clarte-input"
              value={session.title}
              maxLength={200}
              disabled={pending}
              onChange={(event) => session.setTitle(event.target.value)}
            />
          )}
        </ClarteField>
        <ClarteField label={copy.client}>
          {(control) => (
            <Select
              id={control.id}
              describedBy={control['aria-describedby']}
              invalid={control['aria-invalid']}
              value={session.clientAccountId}
              disabled={pending}
              placeholder={copy.selectClient}
              options={clients.map((client) => ({
                value: client.id,
                label: client.displayName,
              }))}
              onValueChange={session.setClientAccountId}
            />
          )}
        </ClarteField>
        {clients.length === 0 && (
          <p className="clarte-field-hint">{copy.noClients}</p>
        )}
        {!fromTemplate && (
          <p className="clarte-mission-notice">{copy.warning}</p>
        )}
        <FeedbackAlert session={session} />
      </form>
    </ClarteSidePanel>
  );
}
