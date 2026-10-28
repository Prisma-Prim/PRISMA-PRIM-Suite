import { ProjectPdfBundle } from './ProjectPdfBundle';
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
  projectTemplateAuthority,
} from './ProjectTemplate';
import { useProjectTemplateCopy } from './project-template.copy';
import type { TemplateSelection } from './project-template-response';
import { ProjectDocuments } from './ProjectDocuments';
import { ProjectLifecycle, ProjectStatusLabel } from './ProjectLifecycle';
import { ProjectContracts } from '../contract/ProjectContracts';
import { ProjectResponsible } from './ProjectResponsible';
import { ProjectTasks, type RequestedTask } from './ProjectTasks';
import {
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { useProjectCopy } from './project-localized.copy';
import { useProjectDocumentsCopy } from './project-documents.copy';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { useInterfaceLocale } from '../localization/interface-locale';
import { Select } from '../presentation/Select';
import { useProjectTaskCopy } from './task.copy';
import { isClosedProjectStatus } from './project-lifecycle-response';
import type { ResponsibleMember } from './project-responsible-response';
import { isProject, type ProjectView } from './project-directory';
import { useProjectDirectory } from './use-project-directory';
import type { ProjectNavigationRequest } from './use-project-navigation';
import './project.css';

type DetailPanel = 'tasks' | 'documents';
/** Either the free-text search or one exact dossier identity is active. */
type ProjectFilter =
  | { kind: 'text'; query: string }
  | { kind: 'client'; clientDossierId: string; displayName: string };

function projectFilterText(value: string) {
  // Fold Romanian spelling only; removing every combining mark would conflate й/и.
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[ăâ]/gu, 'a')
    .replace(/î/gu, 'i')
    .replace(/[șş]/gu, 's')
    .replace(/[țţ]/gu, 't');
}
/**
 * The opened Project, the Client identity revision it was read under and, when
 * a requested open targeted one of its Tasks, that Task.
 */
type SelectedProject = {
  project: ProjectView;
  identityRevision: number;
  requestedTask?: RequestedTask;
  requestedProjectFocusId?: number;
};
type Registration = {
  title: string;
  clientAccountId: string;
  key: string;
  source:
    | { kind: 'manual' }
    | { kind: 'template'; templateKey: string; templateVersion: number };
};
type TemplateCreationFeedback =
  | 'denied'
  | 'creationMissing'
  | 'creationUnavailable'
  | 'creationUncertain'
  | 'creationConflict'
  | 'creationValidation';
type Feedback =
  | 'error'
  | 'validation'
  | 'conflict'
  | { kind: 'template'; message: TemplateCreationFeedback }
  | null;
/** A detail read, optionally requested with a Task target, or a registration. */
type ProjectRequest =
  | {
      kind: 'open';
      projectId: string;
      requestedTask?: RequestedTask & { projectId: string };
      sourceSignal?: AbortSignal;
      requestedProjectFocusId?: number;
    }
  | { kind: 'register'; command: Registration };
export function ProjectWorkspace({
  actor,
  identity,
  onActivityRecorded = () => undefined,
  clientIdentityRevision = 0,
  onOpenClientDossier,
  onOpenDocument,
  onOpenContract,
  navigation,
  catalogueRevision = 0,
  onActorRevalidated,
  onCompanyContextRejected,
  onWorkspaceAccessRejected,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActivityRecorded?: () => void | Promise<void>;
  /** Increases when Client identities change, so derived targets are re-read. */
  clientIdentityRevision?: number;
  onOpenClientDossier?: (clientDossierId: string) => void;
  /** Passed unchanged to the opened Project's linked Documents. */
  onOpenDocument?: (documentId: string) => void;
  onOpenContract?: (clientRequestId: string) => void;
  /**
   * Directory navigation selects All/open-only with its optional dossier.
   * Exact navigation preserves the selected view and filter, reading the
   * Project before its optional Task; each activation is applied once.
   */
  navigation?: ProjectNavigationRequest;
  catalogueRevision?: number;
  onActorRevalidated?: (actor: ActorContext) => void | Promise<void>;
  onCompanyContextRejected?: (companyId: string) => void;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
}) {
  const copy = useProjectCopy();
  const documentsCopy = useProjectDocumentsCopy();
  const templateCopy = useProjectTemplateCopy();
  const planTaskRequestId = useRef(0);
  const taskCopy = useProjectTaskCopy();
  const templateAuthority = projectTemplateAuthority(actor);
  const previousTemplateAuthority = useRef(templateAuthority);
  const [deniedTemplateAuthority, setDeniedTemplateAuthority] = useState<
    string | null
  >(null);
  const [templateSelection, setTemplateSelection] =
    useState<TemplateSelection | null>(null);
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const [detailPanel, setDetailPanel] = useState<DetailPanel>('tasks');
  const [generation, setGeneration] = useState(0);
  const [selected, setSelected] = useState<SelectedProject | null>(null);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [filter, setFilter] = useState<ProjectFilter>({
    kind: 'text',
    query: '',
  });
  const [title, setTitle] = useState('');
  const [clientAccountId, setClientAccountId] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, setPending] = useState(false);
  /** The opened Project's responsible member as its own section last read it. */
  const [responsibleRead, setResponsibleRead] = useState<{
    projectId: string;
    responsible: ResponsibleMember | null;
  } | null>(null);
  const lastResponsibleRead = useRef<{
    projectId: string;
    membershipId: string | null;
  } | null>(null);
  /** The detail re-read after a confirmed lifecycle change; never a write. */
  const detailRefresh = useRef<AbortController | null>(null);
  /** A detail replacement does not retire the Company/session that owns it. */
  const scope = useRef({ retired: false });
  /** The detail read or registration in flight; never a list read. */
  const request = useRef<AbortController | null>(null);
  /**
   * Whether that request is a registration, which no requested open aborts.
   * It describes the request in flight, so it is consulted only while pending.
   */
  const registering = useRef(false);
  /**
   * The latest requested open already consumed. A request present when this
   * owner mounts or resets was made for an earlier state and never replays.
   */
  const consumedProjectRequest = useRef<number | undefined>(undefined);
  // Directory presentation and an exact open waiting on registration have
  // independent lifetimes. A directory intent must not cancel that queued open.
  const latestProjectRequest = useRef<
    Extract<ProjectNavigationRequest, { kind: 'project' }> | undefined
  >(navigation?.kind === 'project' ? navigation : undefined);
  if (navigation?.kind === 'project') latestProjectRequest.current = navigation;
  const appliedNavigation = useRef<number | undefined>(undefined);
  const projectHeading = useRef<HTMLHeadingElement>(null);
  const focusedProjectRequest = useRef<number | undefined>(undefined);
  const identityRevision = useRef(clientIdentityRevision);
  identityRevision.current = clientIdentityRevision;
  const retry = useRef<Registration | null>(null);
  const companyId = actor.activeCompany?.id;
  const authorized =
    actor.activeCompany?.projectPermissions?.includes('project.read') &&
    (actor.workspacePermissions.includes('client.manage') ||
      actor.activeCompany.clientPermissions?.includes('client.read'));
  const directory = useProjectDirectory({
    identity,
    companyId,
    authorized: Boolean(authorized),
    clientIdentityRevision,
    onDenied: () => {
      scope.current.retired = true;
      request.current?.abort();
      detailRefresh.current?.abort();
      setPending(false);
      setSelected(null);
    },
  });
  const load = directory.load;
  function deny() {
    directory.deny();
  }
  function refreshRow(project: ProjectView, startedUnder: number) {
    directory.refreshRow({ project, startedUnder });
  }
  // A different Company, member, authority or reload retires everything this
  // module presents, including the drafts, commands and requested opens
  // started under it.
  useEffect(() => {
    scope.current = { retired: false };
    request.current?.abort();
    detailRefresh.current?.abort();
    setSelected(null);
    setResponsibleRead(null);
    lastResponsibleRead.current = null;
    setFilter({ kind: 'text', query: '' });
    setFeedback(null);
    setPending(false);
    setTitle('');
    setClientAccountId('');
    setTemplateSelection(null);
    setDeniedTemplateAuthority(null);
    retry.current = null;
    consumedProjectRequest.current = latestProjectRequest.current?.requestId;
    directory.reset();
    return () => {
      scope.current.retired = true;
      request.current?.abort();
      directory.cancel();
      detailRefresh.current?.abort();
    };
  }, [
    actor.workspaceId,
    actor.internalUserId,
    actor.workspaceMembershipId,
    companyId,
    authorized,
    generation,
    identity,
  ]);
  // Dedicated Template authority retires its choices and commands without
  // discarding independently authorized manual Project or Task work.
  useEffect(() => {
    if (previousTemplateAuthority.current === templateAuthority) return;
    previousTemplateAuthority.current = templateAuthority;
    setDeniedTemplateAuthority(null);
    setTemplateSelection(null);
    if (retry.current?.source.kind !== 'template') return;
    retry.current = null;
    if (!registering.current) return;
    request.current?.abort();
    setPending(false);
    setFeedback(null);
  }, [templateAuthority]);
  // The opened Project owes one detail read under the current Client identity
  // revision. Until it lands its dossier target is withheld; a failed read
  // leaves it withheld rather than retried.
  const staleProjectId =
    selected && selected.identityRevision !== clientIdentityRevision
      ? selected.project.id
      : undefined;
  useEffect(() => {
    if (!staleProjectId || !companyId) return;
    const controller = new AbortController();
    const startedUnder = clientIdentityRevision;
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (controller.signal.aborted) return;
        const result = await api.request<unknown>(
          `/projects/${encodeURIComponent(staleProjectId)}`,
          { companyContextId: companyId, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (result.status === 'unauthorized') {
          await identity.rejectSession();
          return;
        }
        if (result.status === 'forbidden') {
          deny();
          return;
        }
        if (
          result.status !== 'ok' ||
          !isProject(result.value) ||
          result.value.id !== staleProjectId ||
          result.value.companyId !== companyId
        )
          throw new Error('Refresh failed');
        const project = result.value;
        setSelected((current) =>
          current?.project.id === project.id
            ? { ...current, project, identityRevision: startedUnder }
            : current,
        );
        refreshRow(project, startedUnder);
      } catch {
        if (!controller.signal.aborted) setFeedback('error');
      }
    })();
    return () => controller.abort();
  }, [staleProjectId, clientIdentityRevision, companyId, identity]);

  // Identity refresh retires only the obsolete dossier restriction. Stable
  // exact targets, the selected view and independently authorized work survive.
  useEffect(() => {
    setFilter((current) =>
      current.kind === 'client' ? { kind: 'text', query: '' } : current,
    );
  }, [clientIdentityRevision]);
  useEffect(() => {
    if (!navigation || navigation.requestId === appliedNavigation.current)
      return;
    appliedNavigation.current = navigation.requestId;
    switch (navigation.kind) {
      case 'directory':
        setIncludeClosed(false);
        directory.changeView('all');
        setFilter(
          navigation.client
            ? { kind: 'client', ...navigation.client }
            : { kind: 'text', query: '' },
        );
        break;
      case 'project':
        if (load.view === 'all') setIncludeClosed(false);
        break;
      default: {
        const exhaustive: never = navigation;
        return exhaustive;
      }
    }
  }, [navigation]);
  // A requested open is the same detail read as choosing that Project's row,
  // and supersedes an open still reading. It waits for a pending registration
  // to settle rather than abort it; a denied owner reads nothing.
  useEffect(() => {
    const requestedProject = latestProjectRequest.current;
    if (
      !requestedProject ||
      requestedProject.requestId === consumedProjectRequest.current
    )
      return;
    if (load.kind === 'denied') {
      consumedProjectRequest.current = requestedProject.requestId;
      return;
    }
    if (requestedProject.sourceSignal?.aborted) {
      consumedProjectRequest.current = requestedProject.requestId;
      return;
    }
    if (pending && registering.current) return;
    consumedProjectRequest.current = requestedProject.requestId;
    const { projectId, taskId, requestId, focus, sourceSignal } =
      requestedProject;
    void run({
      kind: 'open',
      projectId,
      sourceSignal,
      requestedProjectFocusId: focus === 'project' ? requestId : undefined,
      requestedTask:
        taskId === undefined
          ? undefined
          : {
              projectId,
              taskId,
              requestId,
              focus: focus === 'task' ? 'task' : undefined,
              sourceSignal,
            },
    });
  }, [navigation, load.kind, pending]);

  useEffect(() => {
    const focusId = selected?.requestedProjectFocusId;
    if (focusId === undefined || focusId === focusedProjectRequest.current)
      return;
    const frame = window.requestAnimationFrame(() => {
      const heading = projectHeading.current;
      if (!heading?.isConnected) return;
      focusedProjectRequest.current = focusId;
      heading.scrollIntoView?.({ block: 'start' });
      heading.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected]);

  /**
   * Re-reads the opened Project after a confirmed lifecycle change or an
   * explicit reload, so its header status and list row follow the section.
   * The opened Project and every draft below it stay in place.
   */
  async function reloadDetail(input: {
    projectId: string;
    refreshMine?: boolean;
  }) {
    const { projectId } = input;
    detailRefresh.current?.abort();
    const controller = new AbortController();
    detailRefresh.current = controller;
    const startedUnder = identityRevision.current;
    if (!companyId) return;
    const startedIn = scope.current;
    let authorityRejected = false;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(
        `/projects/${encodeURIComponent(projectId)}`,
        { companyContextId: companyId, signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (result.status === 'unauthorized') {
        authorityRejected = true;
        startedIn.retired = true;
        await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden') {
        authorityRejected = true;
        deny();
        return;
      }
      if (
        result.status !== 'ok' ||
        !isProject(result.value) ||
        result.value.id !== projectId ||
        result.value.companyId !== companyId
      )
        throw new Error('Refresh failed');
      const project = result.value;
      if (identityRevision.current === startedUnder)
        setSelected((current) =>
          current?.project.id === project.id
            ? { ...current, project, identityRevision: startedUnder }
            : current,
        );
      refreshRow(project, startedUnder);
    } catch {
      if (!controller.signal.aborted) setFeedback('error');
    } finally {
      // A confirmed command still changes current Mine membership if a newer
      // detail read supersedes this one or this read is unavailable. Only the
      // owning scope's retirement or denial suppresses that continuation.
      if (input.refreshMine && !startedIn.retired && !authorityRejected)
        directory.refreshMineAfterChange();
    }
  }
  async function run(projectRequest: ProjectRequest) {
    const path =
      projectRequest.kind === 'open'
        ? `/projects/${encodeURIComponent(projectRequest.projectId)}`
        : projectRequest.command.source.kind === 'template'
          ? '/projects/from-template'
          : '/projects';
    const command =
      projectRequest.kind === 'register' ? projectRequest.command : undefined;
    const sourceSignal =
      projectRequest.kind === 'open' ? projectRequest.sourceSignal : undefined;
    if (sourceSignal?.aborted) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const retireSourceRead = () => {
      controller.abort();
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    };
    sourceSignal?.addEventListener('abort', retireSourceRead, { once: true });
    registering.current = command !== undefined;
    let phase: 'preparing' | 'sent' | 'confirmed' = 'preparing';
    const startedUnder = identityRevision.current;
    setPending(true);
    setSelected(null);
    setFeedback(null);
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      phase = 'sent';
      const result = await api.request<unknown>(path, {
        companyContextId: companyId,
        signal: controller.signal,
        ...(command
          ? {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': command.key,
              },
              body: JSON.stringify({
                title: command.title,
                clientAccountId: command.clientAccountId,
                ...(command.source.kind === 'template'
                  ? {
                      templateKey: command.source.templateKey,
                      templateVersion: command.source.templateVersion,
                    }
                  : {}),
              }),
            }
          : {}),
      });
      if (controller.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden') {
        if (command?.source.kind === 'template') {
          setTemplateSelection(null);
          setDeniedTemplateAuthority(templateAuthority);
          retry.current = null;
          setFeedback({ kind: 'template', message: 'denied' });
          // A Template refusal does not establish loss of independent Project
          // access. Revalidate that server-owned read before restoring rows.
          // Prior Client choices are only hints; creation still checks them.
          directory.revalidateProjectRead();
        } else deny();
        return;
      }
      if (
        result.status !== 'ok' ||
        !isProject(result.value) ||
        (projectRequest.kind === 'open' &&
          (result.value.id !== projectRequest.projectId ||
            result.value.companyId !== companyId))
      ) {
        setFeedback(
          command?.source.kind === 'template'
            ? templateCreationMessage(result)
            : messageFor(result),
        );
        return;
      }
      phase = 'confirmed';
      setDetailPanel('tasks');
      if (projectRequest.kind === 'open') {
        // A requested Task opens only after its own Project read succeeds.
        const target = projectRequest.requestedTask;
        setSelected({
          project: result.value,
          identityRevision: startedUnder,
          requestedProjectFocusId: projectRequest.requestedProjectFocusId,
          requestedTask:
            target?.projectId === result.value.id
              ? {
                  taskId: target.taskId,
                  requestId: target.requestId,
                  focus: target.focus,
                  sourceSignal: target.sourceSignal,
                }
              : undefined,
        });
        refreshRow(result.value, startedUnder);
        return;
      }
      // A registration confirmed after a Client identity change cannot vouch
      // for the dossier target resolved before it. Until a current read
      // replaces it, the Project offers no dossier navigation and matches no
      // dossier restriction.
      const project =
        identityRevision.current === startedUnder
          ? result.value
          : { ...result.value, clientDossierId: undefined };
      setSelected({ project, identityRevision: startedUnder });
      directory.confirmRegistration(project);
      retry.current = null;
      setTitle('');
      setClientAccountId('');
      setTemplateSelection(null);
      await onActivityRecorded();
    } catch {
      if (!controller.signal.aborted)
        setFeedback(
          command?.source.kind === 'template' && phase !== 'confirmed'
            ? {
                kind: 'template',
                message:
                  phase === 'sent'
                    ? 'creationUncertain'
                    : 'creationUnavailable',
              }
            : 'error',
        );
    } finally {
      sourceSignal?.removeEventListener('abort', retireSourceRead);
      if (!controller.signal.aborted) setPending(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = title.trim();
    if (!normalized || normalized.length > 200 || !clientAccountId) {
      setFeedback('validation');
      return;
    }
    const source: Registration['source'] = templateSelection
      ? {
          kind: 'template',
          templateKey: templateSelection.templateKey,
          templateVersion: templateSelection.version,
        }
      : { kind: 'manual' };
    const command =
      retry.current?.title === normalized &&
      retry.current.clientAccountId === clientAccountId &&
      JSON.stringify(retry.current.source) === JSON.stringify(source)
        ? retry.current
        : {
            title: normalized,
            clientAccountId,
            key: crypto.randomUUID(),
            source,
          };
    retry.current = command;
    void run({ kind: 'register', command });
  }
  function moveDetailTab(
    event: KeyboardEvent<HTMLButtonElement>,
    current: DetailPanel,
  ) {
    let next: DetailPanel;
    switch (event.key) {
      case 'ArrowRight':
        next = current === 'tasks' ? 'documents' : 'tasks';
        break;
      case 'ArrowLeft':
        next = current === 'tasks' ? 'documents' : 'tasks';
        break;
      case 'Home':
        next = 'tasks';
        break;
      case 'End':
        next = 'documents';
        break;
      default:
        return;
    }
    event.preventDefault();
    setDetailPanel(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#project-${next}-tab`)
      ?.focus();
  }
  // Derived dossier identities are compared only in rows read under the
  // current Client identity revision. Until such a read lands, a dossier
  // restriction matches none of the kept rows.
  const readyRows =
    load.kind === 'ready' && load.rows.kind === 'ready' ? load.rows : undefined;
  const directoryProjects = readyRows?.projects ?? [];
  const rowsAwaitRead =
    readyRows !== undefined &&
    readyRows.identityRevision !== clientIdentityRevision;
  const refreshFailed =
    rowsAwaitRead && readyRows?.refreshFailedUnder === clientIdentityRevision;
  const restrictionAwaitsRead = rowsAwaitRead && filter.kind === 'client';
  const normalizedQuery =
    filter.kind === 'text' ? projectFilterText(filter.query.trim()) : '';
  const projectsInStatusView = directoryProjects.filter(
    (project) =>
      (load.view === 'all' && includeClosed) ||
      !isClosedProjectStatus(project.status),
  );
  const filteredProjects = !restrictionAwaitsRead
    ? projectsInStatusView.filter((project) =>
        filter.kind === 'client'
          ? project.clientDossierId === filter.clientDossierId
          : normalizedQuery.length === 0 ||
            projectFilterText(project.title).includes(normalizedQuery) ||
            projectFilterText(project.clientDisplayName).includes(
              normalizedQuery,
            ),
      )
    : [];
  const dossierTarget =
    selected?.identityRevision === clientIdentityRevision
      ? selected.project.clientDossierId
      : undefined;
  return (
    <section
      id="projects"
      tabIndex={-1}
      className={`project-workspace${isPrisme ? ' project-workspace--prisme' : ''}`}
      aria-labelledby="project-title"
    >
      {isPrisme ? (
        <header className="project-workspace-heading">
          <p className="prisme-eyebrow">{copy.eyebrow}</p>
          <h2 id="project-title">{copy.title}</h2>
          <p>
            {copy.companyPrefix} {actor.activeCompany?.displayName}
          </p>
        </header>
      ) : (
        <>
          <h2 id="project-title">{copy.title}</h2>
          <p>
            {copy.companyPrefix} {actor.activeCompany?.displayName}
          </p>
        </>
      )}
      {load.kind === 'loading' && <p role="status">{copy.loading}</p>}
      {load.kind === 'denied' && <p role="alert">{copy.denied}</p>}
      {load.kind === 'error' && <p role="alert">{copy.error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (load.view === 'mine_open') {
            // Recovery owns a fresh lifetime; callbacks captured before denial
            // keep their retired scope even after the same-view read succeeds.
            if (load.kind === 'denied') scope.current = { retired: false };
            directory.refresh();
          } else setGeneration((value) => value + 1);
        }}
      >
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
                    onChange={(event) => setIncludeClosed(event.target.checked)}
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
                    setFilter({ kind: 'text', query: event.target.value })
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
          <ul
            className={isPrisme ? 'project-list' : undefined}
            aria-label={copy.title}
          >
            {filteredProjects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void run({ kind: 'open', projectId: project.id })
                  }
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
          {actor.activeCompany?.projectPermissions?.includes(
            'project.create',
          ) && (
            <form
              className={isPrisme ? 'project-registration' : undefined}
              onSubmit={submit}
            >
              <p className="project-warning">{copy.warning}</p>
              <label>
                {copy.projectTitle}
                <input
                  value={title}
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={pending}
                />
              </label>
              {isPrisme ? (
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
                    onValueChange={setClientAccountId}
                  />
                </div>
              ) : (
                <>
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
                    onValueChange={setClientAccountId}
                  />
                </>
              )}
              {canInstantiateProjectTemplate(actor) &&
                deniedTemplateAuthority !== templateAuthority && (
                  <ProjectTemplateSelector
                    key={templateAuthority}
                    actor={actor}
                    identity={identity}
                    catalogueRevision={catalogueRevision}
                    selection={templateSelection}
                    onSelection={setTemplateSelection}
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
          onCreated={(project) => {
            directory.confirmRegistration(project);
            setSelected({
              project,
              identityRevision: identityRevision.current,
            });
            setDetailPanel('tasks');
          }}
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
          className={isPrisme ? 'project-detail-card' : undefined}
          aria-labelledby="selected-project-title"
        >
          {isPrisme ? (
            <div className="project-detail-overview">
              <p className="project-detail-status">
                <ProjectStatusLabel status={selected.project.status} />
              </p>
              <h3
                id="selected-project-title"
                tabIndex={-1}
                ref={projectHeading}
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
          ) : (
            <>
              <h3
                id="selected-project-title"
                tabIndex={-1}
                ref={projectHeading}
              >
                {selected.project.title}
              </h3>
              <p className="project-detail-status">
                <ProjectStatusLabel status={selected.project.status} />
              </p>
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
            </>
          )}
          <ProjectLifecycle
            actor={actor}
            identity={identity}
            projectId={selected.project.id}
            responsible={
              responsibleRead?.projectId === selected.project.id
                ? responsibleRead.responsible
                : undefined
            }
            onProjectChanged={() =>
              reloadDetail({
                projectId: selected.project.id,
                refreshMine: true,
              })
            }
            onShowTasks={() => {
              setDetailPanel('tasks');
              window.requestAnimationFrame(() =>
                document.getElementById('project-tasks-panel')?.focus(),
              );
            }}
            onActivityRecorded={onActivityRecorded}
          />
          <ProjectContracts
            actor={actor}
            identity={identity}
            projectId={selected.project.id}
            onOpenContract={onOpenContract}
          />
          <ProjectResponsible
            actor={actor}
            identity={identity}
            projectId={selected.project.id}
            projectStatus={selected.project.status}
            onProjectChanged={() =>
              reloadDetail({
                projectId: selected.project.id,
                refreshMine: true,
              })
            }
            onActivityRecorded={onActivityRecorded}
            onResponsibleRead={(projectId, responsible) => {
              setResponsibleRead(
                responsible === undefined ? null : { projectId, responsible },
              );
              if (responsible === undefined) return;
              const previous = lastResponsibleRead.current;
              const membershipId = responsible?.workspaceMembershipId ?? null;
              lastResponsibleRead.current = { projectId, membershipId };
              // The authoritative read follows the child's confirmed command or
              // explicit reload. A changed membership can change the Mine subset.
              if (
                previous?.projectId === projectId &&
                previous.membershipId !== membershipId
              )
                directory.refreshMineAfterChange();
            }}
          />
          {isPrisme && (
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
            </div>
          )}
          <MissionPlanProjectCopy
            actor={actor}
            identity={identity}
            projectId={selected.project.id}
            onActorRevalidated={onActorRevalidated}
            onCompanyContextRejected={onCompanyContextRejected}
            onWorkspaceAccessRejected={onWorkspaceAccessRejected}
            onOpenTask={(taskId) => {
              const requestId = --planTaskRequestId.current;
              setDetailPanel('tasks');
              setSelected((current) =>
                current?.project.id === selected.project.id
                  ? {
                      ...current,
                      requestedTask: { taskId, requestId, focus: 'task' },
                    }
                  : current,
              );
            }}
          />
          <MissionPlanCurrentWork
            actor={actor}
            identity={identity}
            projectId={selected.project.id}
            clientAccountId={selected.project.clientAccountId}
            onActorRevalidated={onActorRevalidated}
            onCompanyContextRejected={onCompanyContextRejected}
            onWorkspaceAccessRejected={onWorkspaceAccessRejected}
            onOpenTask={(taskId) => {
              const requestId = --planTaskRequestId.current;
              setDetailPanel('tasks');
              setSelected((current) =>
                current?.project.id === selected.project.id
                  ? {
                      ...current,
                      requestedTask: { taskId, requestId, focus: 'task' },
                    }
                  : current,
              );
            }}
          />
          {canUseProjectTemplate(actor) &&
            actor.activeCompany?.taskPermissions?.includes('task.read') && (
              <ProjectTemplatePlan
                key={`${selected.project.id}:${templateAuthority}`}
                actor={actor}
                identity={identity}
                projectId={selected.project.id}
                onOpenTask={(taskId) => {
                  // Local requests use a separate negative sequence from shell navigation.
                  const requestId = --planTaskRequestId.current;
                  setDetailPanel('tasks');
                  setSelected((current) =>
                    current?.project.id === selected.project.id
                      ? {
                          ...current,
                          requestedTask: { taskId, requestId, focus: 'task' },
                        }
                      : current,
                  );
                }}
              />
            )}
          {canUseProjectTemplate(actor) &&
            actor.activeCompany?.taskPermissions?.includes('task.read') && (
              <ProjectStage
                actor={actor}
                identity={identity}
                projectId={selected.project.id}
                onActivityRecorded={onActivityRecorded}
              />
            )}
          <div
            className="project-detail-panel"
            id="project-documents-panel"
            role={isPrisme ? 'tabpanel' : undefined}
            aria-labelledby={isPrisme ? 'project-documents-tab' : undefined}
            hidden={isPrisme && detailPanel !== 'documents'}
          >
            <ProjectDocuments
              actor={actor}
              identity={identity}
              projectId={selected.project.id}
              projectStatus={selected.project.status}
              onProjectChanged={() =>
                reloadDetail({ projectId: selected.project.id })
              }
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
        role={isPrisme ? 'tabpanel' : undefined}
        aria-labelledby={isPrisme ? 'project-tasks-tab' : undefined}
        hidden={isPrisme && (!selected || detailPanel !== 'tasks')}
        tabIndex={-1}
      >
        <ProjectTasks
          actor={actor}
          identity={identity}
          clientIdentityRevision={clientIdentityRevision}
          projectId={selected?.project.id ?? null}
          projectStatus={selected?.project.status ?? null}
          onProjectChanged={
            selected
              ? () => reloadDetail({ projectId: selected.project.id })
              : undefined
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
function messageFor(result: ApiResult<unknown>): Exclude<Feedback, null> {
  return result.status === 'validation'
    ? 'validation'
    : result.status === 'conflict'
      ? 'conflict'
      : 'error';
}

function templateCreationMessage(
  result: ApiResult<unknown>,
): Extract<Feedback, { kind: 'template' }> {
  return {
    kind: 'template',
    message:
      result.status === 'notFound'
        ? 'creationMissing'
        : result.status === 'validation'
          ? 'creationValidation'
          : result.status === 'conflict'
            ? 'creationConflict'
            : 'creationUncertain',
  };
}
