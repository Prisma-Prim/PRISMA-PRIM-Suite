import { ProjectDocuments } from './ProjectDocuments';
import { ProjectTasks } from './ProjectTasks';
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
import { projectCopy as copy } from './project.copy';
import { projectDocumentsCopy } from './project-documents.copy';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { taskCopy } from './task.copy';
import './project.css';

type ProjectView = {
  id: string;
  companyId: string;
  clientAccountId: string;
  clientDossierId?: string;
  clientDisplayName: string;
  title: string;
  status: 'preparatory';
  createdAt: string;
};
type ClientChoice = { id: string; displayName: string };
type DetailPanel = 'tasks' | 'documents';
type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' | 'denied' }
  | { kind: 'ready'; projects: ProjectView[]; clients: ClientChoice[] };
export function ProjectWorkspace({
  actor,
  identity,
  onActivityRecorded = () => undefined,
  clientFilter,
  onOpenClientDossier,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActivityRecorded?: () => void | Promise<void>;
  clientFilter?: { clientDossierId: string; displayName: string };
  onOpenClientDossier?: (clientDossierId: string) => void;
}) {
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const [detailPanel, setDetailPanel] = useState<DetailPanel>('tasks');
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [generation, setGeneration] = useState(0);
  const [selected, setSelected] = useState<ProjectView | null>(null);
  const [query, setQuery] = useState('');
  const [filteredClientDossierId, setFilteredClientDossierId] = useState<
    string | undefined
  >();
  const [title, setTitle] = useState('');
  const [clientAccountId, setClientAccountId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  const retry = useRef<{
    title: string;
    clientAccountId: string;
    key: string;
  } | null>(null);
  const companyId = actor.activeCompany?.id;
  const authorized =
    actor.activeCompany?.projectPermissions?.includes('project.read') &&
    (actor.workspacePermissions.includes('client.manage') ||
      actor.activeCompany.clientPermissions?.includes('client.read'));
  useEffect(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSelected(null);
    setQuery('');
    setFeedback('');
    setPending(false);
    setTitle('');
    setClientAccountId('');
    retry.current = null;
    if (!authorized || !companyId) {
      setLoad({ kind: 'denied' });
      return;
    }
    setLoad({ kind: 'loading' });
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
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
          setLoad({ kind: 'denied' });
          return;
        }
        if (
          projects.status !== 'ok' ||
          clients.status !== 'ok' ||
          !Array.isArray(projects.value) ||
          !projects.value.every(isProject) ||
          !Array.isArray(clients.value) ||
          !clients.value.every(isClient)
        ) {
          setLoad({ kind: 'error' });
          return;
        }
        setLoad({
          kind: 'ready',
          projects: projects.value,
          clients: clients.value,
        });
      } catch {
        if (!controller.signal.aborted) setLoad({ kind: 'error' });
      }
    })();
    return () => request.current?.abort();
  }, [
    actor.workspaceId,
    actor.workspaceMembershipId,
    companyId,
    authorized,
    generation,
    identity,
  ]);

  useEffect(() => {
    if (!clientFilter) return;
    setQuery(clientFilter.displayName);
    setFilteredClientDossierId(clientFilter.clientDossierId);
  }, [clientFilter]);

  async function run(
    path: string,
    command?: { title: string; clientAccountId: string; key: string },
  ) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setSelected(null);
    setFeedback('');
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
        setLoad({ kind: 'denied' });
        return;
      }
      if (result.status !== 'ok' || !isProject(result.value)) {
        setFeedback(messageFor(result));
        return;
      }
      setSelected(result.value);
      setDetailPanel('tasks');
      const project = result.value;
      setLoad((current) =>
        current.kind === 'ready'
          ? {
              ...current,
              projects: command
                ? [
                    ...current.projects.filter((row) => row.id !== project.id),
                    project,
                  ]
                : current.projects.map((row) =>
                    row.id === project.id ? project : row,
                  ),
            }
          : current,
      );
      if (command) {
        retry.current = null;
        setTitle('');
        setClientAccountId('');
        await onActivityRecorded();
      }
    } catch {
      if (!controller.signal.aborted) setFeedback(copy.error);
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = title.trim();
    if (!normalized || normalized.length > 200 || !clientAccountId) {
      setFeedback(copy.validation);
      return;
    }
    const command =
      retry.current?.title === normalized &&
      retry.current.clientAccountId === clientAccountId
        ? retry.current
        : { title: normalized, clientAccountId, key: crypto.randomUUID() };
    retry.current = command;
    void run('/projects', command);
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
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProjects =
    load.kind === 'ready'
      ? load.projects.filter((project) =>
          filteredClientDossierId
            ? project.clientDossierId === filteredClientDossierId
            : normalizedQuery.length === 0 ||
              project.title.toLowerCase().includes(normalizedQuery) ||
              project.clientDisplayName.toLowerCase().includes(normalizedQuery),
        )
      : [];
  return (
    <section
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
      <p className="project-warning">{copy.warning}</p>
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
            <label className="project-search">
              {copy.searchLabel}
              <input
                type="search"
                value={query}
                placeholder={copy.searchPlaceholder}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setFilteredClientDossierId(undefined);
                }}
                disabled={pending}
              />
            </label>
          )}
          {load.projects.length > 0 && filteredProjects.length === 0 && (
            <p className="project-no-matches">{copy.noMatches}</p>
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
                  <select
                    id="project-client"
                    value={clientAccountId}
                    onChange={(event) => setClientAccountId(event.target.value)}
                    disabled={pending}
                  >
                    <option value="">{copy.selectClient}</option>
                    {load.clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <label htmlFor="project-client">{copy.client}</label>
                  <select
                    id="project-client"
                    value={clientAccountId}
                    onChange={(event) => setClientAccountId(event.target.value)}
                    disabled={pending}
                  >
                    <option value="">{copy.selectClient}</option>
                    {load.clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.displayName}
                      </option>
                    ))}
                  </select>
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
      {feedback && <p role="alert">{feedback}</p>}
      {selected && (
        <article
          className={isPrisme ? 'project-detail-card' : undefined}
          aria-labelledby="selected-project-title"
        >
          {isPrisme ? (
            <div className="project-detail-overview">
              <p className="prisme-eyebrow">{copy.status}</p>
              <h3 id="selected-project-title">{selected.title}</h3>
              <p>
                {copy.clientPrefix} {selected.clientDisplayName}
              </p>
              {selected.clientDossierId && onOpenClientDossier && (
                <ClientDossierButton
                  clientDossierId={selected.clientDossierId}
                  onOpen={onOpenClientDossier}
                />
              )}
            </div>
          ) : (
            <>
              <h3 id="selected-project-title">{selected.title}</h3>
              <p>{copy.status}</p>
              <p>
                {copy.clientPrefix} {selected.clientDisplayName}
              </p>
              {selected.clientDossierId && onOpenClientDossier && (
                <ClientDossierButton
                  clientDossierId={selected.clientDossierId}
                  onOpen={onOpenClientDossier}
                />
              )}
            </>
          )}
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
              projectId={selected.id}
              onActivityRecorded={onActivityRecorded}
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
      >
        <ProjectTasks
          actor={actor}
          identity={identity}
          projectId={selected?.id ?? null}
          onActivityRecorded={onActivityRecorded}
        />
      </div>
    </section>
  );
}
function ClientDossierButton({
  clientDossierId,
  onOpen,
}: {
  clientDossierId: string;
  onOpen: (clientDossierId: string) => void;
}) {
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
function isProject(value: unknown): value is ProjectView {
  return (
    isRecord(value) &&
    [
      'id',
      'companyId',
      'clientAccountId',
      'clientDisplayName',
      'title',
      'createdAt',
    ].every((key) => typeof value[key] === 'string') &&
    value.status === 'preparatory' &&
    (value.clientDossierId === undefined ||
      typeof value.clientDossierId === 'string')
  );
}
function messageFor(result: ApiResult<unknown>) {
  return result.status === 'validation'
    ? copy.validation
    : result.status === 'conflict'
      ? copy.conflict
      : copy.error;
}
