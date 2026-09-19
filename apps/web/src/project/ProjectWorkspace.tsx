import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { projectCopy as copy } from './project.copy';
import './project.css';

type ProjectView = {
  id: string;
  companyId: string;
  clientAccountId: string;
  clientDisplayName: string;
  title: string;
  status: 'preparatory';
  createdAt: string;
};
type ClientChoice = { id: string; displayName: string };
type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' | 'denied' }
  | { kind: 'ready'; projects: ProjectView[]; clients: ClientChoice[] };
export function ProjectWorkspace({
  actor,
  identity,
  onActivityRecorded = () => undefined,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActivityRecorded?: () => void | Promise<void>;
}) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [generation, setGeneration] = useState(0);
  const [selected, setSelected] = useState<ProjectView | null>(null);
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
      if (command) {
        const project = result.value;
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
  return (
    <section className="project-workspace" aria-labelledby="project-title">
      <h2 id="project-title">{copy.title}</h2>
      <p>
        {copy.companyPrefix} {actor.activeCompany?.displayName}
      </p>
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
          <ul>
            {load.projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void run(`/projects/${encodeURIComponent(project.id)}`)
                  }
                >
                  {project.title}
                </button>
              </li>
            ))}
          </ul>
          {actor.activeCompany?.projectPermissions?.includes(
            'project.create',
          ) && (
            <form onSubmit={submit}>
              <label>
                {copy.projectTitle}
                <input
                  value={title}
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={pending}
                />
              </label>
              <label>
                {copy.client}
                <select
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
              </label>
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
        <article aria-labelledby="selected-project-title">
          <h3 id="selected-project-title">{selected.title}</h3>
          <p>{copy.status}</p>
          <p>
            {copy.clientPrefix} {selected.clientDisplayName}
          </p>
          <p>{selected.id}</p>
        </article>
      )}
    </section>
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
    value.status === 'preparatory'
  );
}
function messageFor(result: ApiResult<unknown>) {
  return result.status === 'validation'
    ? copy.validation
    : result.status === 'conflict'
      ? copy.conflict
      : copy.error;
}
