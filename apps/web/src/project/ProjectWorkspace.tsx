import { ProjectDocuments } from './ProjectDocuments';
import { ProjectLifecycle, ProjectStatusLabel } from './ProjectLifecycle';
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
import { projectDocumentsCopy } from './project-documents.copy';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { useInterfaceLocale } from '../localization/interface-locale';
import { Select } from '../presentation/Select';
import { taskCopy } from './task.copy';
import {
  isClosedProjectStatus,
  isProjectStatus,
  type ProjectStatus,
} from './project-lifecycle-response';
import type { ResponsibleMember } from './project-responsible-response';
import './project.css';

type ProjectView = {
  id: string;
  companyId: string;
  clientAccountId: string;
  clientDossierId?: string;
  clientDisplayName: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
};
type ClientChoice = { id: string; displayName: string };
type DetailPanel = 'tasks' | 'documents';
type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' | 'denied' }
  | {
      kind: 'ready';
      projects: ProjectView[];
      clients: ClientChoice[];
      /**
       * The Client identity revision the rows' derived dossier identities were
       * read under. Only rows read under the current revision are compared
       * with a dossier restriction.
       */
      identityRevision: number;
      /** The refresh started under this revision failed; the rows were kept. */
      refreshFailedUnder?: number;
    };
/** Either the free-text search or one exact dossier identity is active. */
type ProjectFilter =
  | { kind: 'text'; query: string }
  | { kind: 'client'; clientDossierId: string; displayName: string };
/**
 * The opened Project, the Client identity revision it was read under and, when
 * a requested open targeted one of its Tasks, that Task.
 */
type SelectedProject = {
  project: ProjectView;
  identityRevision: number;
  requestedTask?: RequestedTask;
};
type Registration = { title: string; clientAccountId: string; key: string };
type Feedback = 'error' | 'validation' | 'conflict' | null;
/** A detail read, optionally requested with a Task target, or a registration. */
type ProjectRequest =
  | {
      kind: 'open';
      requestedTask?: RequestedTask & { projectId: string };
    }
  | { kind: 'register'; command: Registration };
export function ProjectWorkspace({
  actor,
  identity,
  onActivityRecorded = () => undefined,
  clientFilter,
  clientIdentityRevision = 0,
  onOpenClientDossier,
  onOpenDocument,
  requestedProject,
  projectOpenRequestId = 0,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActivityRecorded?: () => void | Promise<void>;
  clientFilter?: { clientDossierId: string; displayName: string };
  /** Increases when Client identities change, so derived targets are re-read. */
  clientIdentityRevision?: number;
  onOpenClientDossier?: (clientDossierId: string) => void;
  /** Passed unchanged to the opened Project's linked Documents. */
  onOpenDocument?: (documentId: string) => void;
  /**
   * Opens this Project as choosing its row would, then its optional Task as
   * choosing that Task's row would; each new request id once.
   */
  requestedProject?: { projectId: string; taskId?: string; requestId: number };
  /** Increases whenever another section asks to open Projects. */
  projectOpenRequestId?: number;
}) {
  const copy = useProjectCopy();
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const [detailPanel, setDetailPanel] = useState<DetailPanel>('tasks');
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
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
  /** The detail re-read after a confirmed lifecycle change; never a write. */
  const detailRefresh = useRef<AbortController | null>(null);
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
  const latestProjectRequest = useRef(requestedProject);
  latestProjectRequest.current = requestedProject;
  const listRequest = useRef<AbortController | null>(null);
  const identityRevision = useRef(clientIdentityRevision);
  identityRevision.current = clientIdentityRevision;
  const loadKind = useRef(load.kind);
  loadKind.current = load.kind;
  /** The Client identity revision of the latest list read started. */
  const listReadRevision = useRef<number | undefined>(undefined);
  const startedListReads = useRef(0);
  /**
   * Confirmed registrations missing from a list read that started before they
   * were confirmed. A list read started afterwards is authoritative for them.
   */
  const confirmedRegistrations = useRef(
    new Map<
      string,
      { project: ProjectView; listReadsAtConfirmation: number }
    >(),
  );
  const retry = useRef<Registration | null>(null);
  const companyId = actor.activeCompany?.id;
  const authorized =
    actor.activeCompany?.projectPermissions?.includes('project.read') &&
    (actor.workspacePermissions.includes('client.manage') ||
      actor.activeCompany.clientPermissions?.includes('client.read'));
  useEffect(() => {
    setIncludeClosed(false);
  }, [projectOpenRequestId]);
  /**
   * Access denial retires the loaded rows and the opened Project, whose
   * current detail read stops with it. A list read, detail read or
   * registration still in flight is cancelled so it cannot repopulate them,
   * and the pending state settles so the member can reload. The registration
   * draft and its request key stay until that reload retires them.
   */
  function deny() {
    listRequest.current?.abort();
    request.current?.abort();
    setPending(false);
    setLoad({ kind: 'denied' });
    setSelected(null);
  }
  function withConfirmedRegistrations(
    projects: ProjectView[],
    listRead: number,
  ): ProjectView[] {
    const loaded = new Set(projects.map((project) => project.id));
    const missing: ProjectView[] = [];
    for (const [id, confirmation] of confirmedRegistrations.current) {
      if (listRead > confirmation.listReadsAtConfirmation)
        confirmedRegistrations.current.delete(id);
      else if (!loaded.has(id)) missing.push(confirmation.project);
    }
    return missing.length === 0 ? projects : [...projects, ...missing];
  }
  /**
   * Reads the rows and Client choices under the current Client identity
   * revision, superseding any list read still in flight. A failed refresh
   * keeps the loaded rows; only a failed first read reports the load error.
   */
  function readList() {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    const startedUnder = clientIdentityRevision;
    listReadRevision.current = startedUnder;
    startedListReads.current += 1;
    const listRead = startedListReads.current;
    if (!authorized || !companyId) {
      setLoad({ kind: 'denied' });
      return;
    }
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (controller.signal.aborted) return;
        const [projects, clients] = await Promise.all([
          api.request<unknown>('/projects', {
            companyContextId: companyId,
            signal: controller.signal,
          }),
          api.request<unknown>('/clients', {
            companyContextId: companyId,
            signal: controller.signal,
          }),
        ]);
        if (controller.signal.aborted) return;
        if (
          projects.status === 'unauthorized' ||
          clients.status === 'unauthorized'
        ) {
          await identity.rejectSession();
          return;
        }
        if (projects.status === 'forbidden' || clients.status === 'forbidden') {
          deny();
          return;
        }
        if (
          projects.status !== 'ok' ||
          clients.status !== 'ok' ||
          !Array.isArray(projects.value) ||
          !projects.value.every(isProject) ||
          !Array.isArray(clients.value) ||
          !clients.value.every(isClient)
        )
          throw new Error('Load failed');
        const rows = withConfirmedRegistrations(projects.value, listRead);
        setLoad({
          kind: 'ready',
          projects: rows,
          clients: clients.value,
          identityRevision: startedUnder,
        });
      } catch {
        if (controller.signal.aborted) return;
        setLoad((current) =>
          current.kind === 'ready'
            ? { ...current, refreshFailedUnder: startedUnder }
            : { kind: 'error' },
        );
      }
    })();
  }
  /**
   * A detail read replaces its loaded row only when no Client identity change
   * happened since it started; an older read cannot vouch for the row's
   * derived dossier identity.
   */
  function refreshRow(project: ProjectView, startedUnder: number) {
    if (identityRevision.current !== startedUnder) return;
    const confirmation = confirmedRegistrations.current.get(project.id);
    if (confirmation)
      confirmedRegistrations.current.set(project.id, {
        ...confirmation,
        project,
      });
    setLoad((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            projects: current.projects.map((row) =>
              row.id === project.id ? project : row,
            ),
          }
        : current,
    );
  }
  // A different Company, member, authority or reload retires everything this
  // module presents, including the drafts, commands and requested opens
  // started under it.
  useEffect(() => {
    request.current?.abort();
    detailRefresh.current?.abort();
    setSelected(null);
    setResponsibleRead(null);
    setFilter({ kind: 'text', query: '' });
    setFeedback(null);
    setPending(false);
    setTitle('');
    setClientAccountId('');
    retry.current = null;
    confirmedRegistrations.current.clear();
    consumedProjectRequest.current = latestProjectRequest.current?.requestId;
    setLoad({ kind: 'loading' });
    readList();
    return () => {
      request.current?.abort();
      listRequest.current?.abort();
      detailRefresh.current?.abort();
    };
  }, [
    actor.workspaceId,
    actor.workspaceMembershipId,
    companyId,
    authorized,
    generation,
    identity,
  ]);
  // A confirmed Client union or reversal moves the derived dossier identity
  // of the loaded rows. They are re-read once, by their single owner, and a
  // list read still in flight under the previous identity is superseded
  // rather than raced. The opened Project, drafts and retryable commands are
  // untouched. A denied or failed list waits for the member's reload, which
  // reads under the current identity.
  useEffect(() => {
    if (listReadRevision.current === clientIdentityRevision) return;
    if (loadKind.current === 'denied' || loadKind.current === 'error') return;
    readList();
  }, [clientIdentityRevision]);
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
          result.value.id !== staleProjectId
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

  useEffect(() => {
    if (!clientFilter) {
      // The shell retired the navigation intent, so a dossier identity that a
      // union or reversal superseded stops restricting the loaded rows.
      setFilter((current) =>
        current.kind === 'client' ? { kind: 'text', query: '' } : current,
      );
      return;
    }
    setFilter({
      kind: 'client',
      clientDossierId: clientFilter.clientDossierId,
      displayName: clientFilter.displayName,
    });
  }, [clientFilter]);
  // A requested open is the same detail read as choosing that Project's row,
  // and supersedes an open still reading. It waits for a pending registration
  // to settle rather than abort it; a denied owner reads nothing.
  useEffect(() => {
    if (
      !requestedProject ||
      requestedProject.requestId === consumedProjectRequest.current
    )
      return;
    if (load.kind === 'denied') {
      consumedProjectRequest.current = requestedProject.requestId;
      return;
    }
    if (pending && registering.current) return;
    consumedProjectRequest.current = requestedProject.requestId;
    const { projectId, taskId, requestId } = requestedProject;
    void run(`/projects/${encodeURIComponent(projectId)}`, {
      kind: 'open',
      requestedTask:
        taskId === undefined ? undefined : { projectId, taskId, requestId },
    });
  }, [requestedProject, load.kind, pending]);

  /**
   * Re-reads the opened Project after a confirmed lifecycle change or an
   * explicit reload, so its header status and list row follow the section.
   * The opened Project and every draft below it stay in place.
   */
  async function reloadDetail(projectId: string) {
    detailRefresh.current?.abort();
    const controller = new AbortController();
    detailRefresh.current = controller;
    const startedUnder = identityRevision.current;
    if (!companyId) return;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(
        `/projects/${encodeURIComponent(projectId)}`,
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
        result.value.id !== projectId
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
    }
  }
  async function run(
    path: string,
    projectRequest: ProjectRequest = { kind: 'open' },
  ) {
    const command =
      projectRequest.kind === 'register' ? projectRequest.command : undefined;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    registering.current = command !== undefined;
    const startedUnder = identityRevision.current;
    setPending(true);
    setSelected(null);
    setFeedback(null);
    try {
      const api = await createAuthenticatedApiClient(identity);
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
        deny();
        return;
      }
      if (result.status !== 'ok' || !isProject(result.value)) {
        setFeedback(messageFor(result));
        return;
      }
      setDetailPanel('tasks');
      if (projectRequest.kind === 'open') {
        // A requested Task opens only after its own Project read succeeds.
        const target = projectRequest.requestedTask;
        setSelected({
          project: result.value,
          identityRevision: startedUnder,
          requestedTask:
            target?.projectId === result.value.id
              ? { taskId: target.taskId, requestId: target.requestId }
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
      confirmedRegistrations.current.set(project.id, {
        project,
        listReadsAtConfirmation: startedListReads.current,
      });
      setLoad((current) =>
        current.kind === 'ready'
          ? {
              ...current,
              projects: [
                ...current.projects.filter((row) => row.id !== project.id),
                project,
              ],
            }
          : current,
      );
      retry.current = null;
      setTitle('');
      setClientAccountId('');
      await onActivityRecorded();
    } catch {
      if (!controller.signal.aborted) setFeedback('error');
    } finally {
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
    const command =
      retry.current?.title === normalized &&
      retry.current.clientAccountId === clientAccountId
        ? retry.current
        : { title: normalized, clientAccountId, key: crypto.randomUUID() };
    retry.current = command;
    void run('/projects', { kind: 'register', command });
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
  const rowsAwaitRead =
    load.kind === 'ready' && load.identityRevision !== clientIdentityRevision;
  const refreshFailed =
    rowsAwaitRead && load.refreshFailedUnder === clientIdentityRevision;
  const restrictionAwaitsRead = rowsAwaitRead && filter.kind === 'client';
  const normalizedQuery =
    filter.kind === 'text' ? filter.query.trim().toLowerCase() : '';
  const projectsInStatusView =
    load.kind === 'ready'
      ? load.projects.filter(
          (project) => includeClosed || !isClosedProjectStatus(project.status),
        )
      : [];
  const filteredProjects =
    load.kind === 'ready' && !restrictionAwaitsRead
      ? projectsInStatusView.filter((project) =>
          filter.kind === 'client'
            ? project.clientDossierId === filter.clientDossierId
            : normalizedQuery.length === 0 ||
              project.title.toLowerCase().includes(normalizedQuery) ||
              project.clientDisplayName.toLowerCase().includes(normalizedQuery),
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
        onClick={() => setGeneration((value) => value + 1)}
      >
        {copy.retry}
      </button>
      {load.kind === 'ready' && (
        <>
          {load.projects.length === 0 && <p>{copy.empty}</p>}
          {load.projects.length > 0 && (
            <>
              <label className="project-closed-filter">
                <input
                  type="checkbox"
                  checked={includeClosed}
                  disabled={pending}
                  onChange={(event) => setIncludeClosed(event.target.checked)}
                />
                {copy.includeClosed}
              </label>
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
          {!includeClosed &&
            load.projects.length > 0 &&
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
                    void run(`/projects/${encodeURIComponent(project.id)}`)
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
              {load.clients.length === 0 && <p>{copy.noClients}</p>}
              <button
                type="submit"
                disabled={pending || load.clients.length === 0}
              >
                {copy.create}
              </button>
            </form>
          )}
        </>
      )}
      {feedback && <p role="alert">{copy[feedback]}</p>}
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
              <h3 id="selected-project-title">{selected.project.title}</h3>
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
              <h3 id="selected-project-title">{selected.project.title}</h3>
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
            onProjectChanged={() => reloadDetail(selected.project.id)}
            onShowTasks={() => {
              setDetailPanel('tasks');
              window.requestAnimationFrame(() =>
                document.getElementById('project-tasks-panel')?.focus(),
              );
            }}
            onActivityRecorded={onActivityRecorded}
          />
          <ProjectResponsible
            actor={actor}
            identity={identity}
            projectId={selected.project.id}
            projectStatus={selected.project.status}
            onProjectChanged={() => reloadDetail(selected.project.id)}
            onActivityRecorded={onActivityRecorded}
            onResponsibleRead={(projectId, responsible) =>
              setResponsibleRead(
                responsible === undefined ? null : { projectId, responsible },
              )
            }
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
                {projectDocumentsCopy.title}
              </button>
            </div>
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
              onProjectChanged={() => reloadDetail(selected.project.id)}
              onActivityRecorded={onActivityRecorded}
              onOpenDocument={onOpenDocument}
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
          projectId={selected?.project.id ?? null}
          projectStatus={selected?.project.status ?? null}
          onProjectChanged={
            selected ? () => reloadDetail(selected.project.id) : undefined
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isClient(value: unknown): value is ClientChoice {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.displayName === 'string'
  );
}
function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = new Date(value);
  return (
    Number.isFinite(timestamp.valueOf()) && timestamp.toISOString() === value
  );
}
function isProject(value: unknown): value is ProjectView {
  return (
    isRecord(value) &&
    ['id', 'companyId', 'clientAccountId', 'clientDisplayName', 'title'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    isTimestamp(value.createdAt) &&
    isProjectStatus(value.status) &&
    (value.clientDossierId === undefined ||
      typeof value.clientDossierId === 'string')
  );
}
function messageFor(result: ApiResult<unknown>): Exclude<Feedback, null> {
  return result.status === 'validation'
    ? 'validation'
    : result.status === 'conflict'
      ? 'conflict'
      : 'error';
}
