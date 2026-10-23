import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { isClosedProjectStatus } from './project-lifecycle-response';
import {
  isClientChoice,
  isProject,
  type ClientChoice,
  type ProjectDirectoryView,
  type ProjectView,
} from './project-directory';

type Rows =
  | { kind: 'loading' | 'error' }
  | {
      kind: 'ready';
      projects: ProjectView[];
      identityRevision: number;
      refreshFailedUnder?: number;
    };
/** Retaining Client choices does not make an old directory response current. */
type DirectoryState = { view: ProjectDirectoryView } & (
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; clients: ClientChoice[]; rows: Rows }
);
type ReadReason = 'reset' | 'switch' | 'refresh' | 'identity' | 'recovery';

/** Own only the directory read; detail, mutable work and commands stay mounted. */
export function useProjectDirectory(input: {
  identity: BrowserIdentity;
  companyId: string | undefined;
  authorized: boolean;
  clientIdentityRevision: number;
  onDenied: () => void;
}) {
  const { identity, companyId, authorized, clientIdentityRevision } = input;
  const [load, setLoad] = useState<DirectoryState>({
    kind: 'loading',
    view: 'all',
  });
  const current = useRef(load);
  current.current = load;
  const onDenied = useRef(input.onDenied);
  onDenied.current = input.onDenied;
  const revision = useRef(clientIdentityRevision);
  revision.current = clientIdentityRevision;
  const request = useRef<AbortController | null>(null);
  const readRevision = useRef<number | undefined>(undefined);
  const reads = useRef(0);
  const confirmations = useRef(
    new Map<
      string,
      { project: ProjectView; listReadsAtConfirmation: number }
    >(),
  );

  function commit(next: DirectoryState) {
    current.current = next;
    setLoad(next);
  }
  function deny(view = current.current.view) {
    request.current?.abort();
    commit({ kind: 'denied', view });
    onDenied.current();
  }
  function withConfirmations(projects: ProjectView[], listRead: number) {
    const loaded = new Set(projects.map((project) => project.id));
    const missing: ProjectView[] = [];
    for (const [id, confirmation] of confirmations.current) {
      if (listRead > confirmation.listReadsAtConfirmation)
        confirmations.current.delete(id);
      else if (!loaded.has(id)) missing.push(confirmation.project);
    }
    return missing.length === 0 ? projects : [...projects, ...missing];
  }
  function readList(options: {
    view?: ProjectDirectoryView;
    reason: ReadReason;
  }) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const before = current.current;
    const view = options.view ?? before.view;
    const startedUnder = revision.current;
    readRevision.current = startedUnder;
    const listRead = ++reads.current;
    if (!authorized || !companyId) {
      deny(view);
      return;
    }
    const retainedClients =
      options.reason !== 'reset' && before.kind === 'ready'
        ? before.clients
        : undefined;
    const readClients =
      options.reason === 'reset' ||
      options.reason === 'identity' ||
      retainedClients === undefined;
    // Preserve All's existing identity-refresh behavior; exact dossier filtering
    // still withholds identities read under an older Client revision.
    const preserveRows =
      view === 'all' &&
      options.reason === 'identity' &&
      before.kind === 'ready';
    commit(
      retainedClients === undefined || options.reason === 'recovery'
        ? { kind: 'loading', view }
        : {
            kind: 'ready',
            view,
            clients: retainedClients,
            rows: preserveRows ? before.rows : { kind: 'loading' },
          },
    );
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (controller.signal.aborted) return;
        const [projects, clients] = await Promise.all([
          api.request<unknown>(
            view === 'mine_open' ? '/projects?view=mine_open' : '/projects',
            { companyContextId: companyId, signal: controller.signal },
          ),
          readClients
            ? api.request<unknown>('/clients', {
                companyContextId: companyId,
                signal: controller.signal,
              })
            : undefined,
        ]);
        if (controller.signal.aborted) return;
        if (
          projects.status === 'unauthorized' ||
          clients?.status === 'unauthorized'
        ) {
          await identity.rejectSession();
          return;
        }
        if (
          projects.status === 'forbidden' ||
          clients?.status === 'forbidden'
        ) {
          deny();
          return;
        }
        const choices = readClients
          ? clients?.status === 'ok' &&
            Array.isArray(clients.value) &&
            clients.value.every(isClientChoice)
            ? clients.value
            : undefined
          : retainedClients;
        if (
          projects.status !== 'ok' ||
          !Array.isArray(projects.value) ||
          !projects.value.every(isProject) ||
          choices === undefined
        )
          throw new Error('Project directory unavailable.');
        if (
          view === 'mine_open' &&
          projects.value.some(
            (project) =>
              project.companyId !== companyId ||
              isClosedProjectStatus(project.status),
          )
        )
          throw new Error('Invalid Project directory scope.');
        commit({
          kind: 'ready',
          view,
          clients: choices,
          rows: {
            kind: 'ready',
            projects:
              view === 'all'
                ? withConfirmations(projects.value, listRead)
                : projects.value,
            identityRevision: startedUnder,
          },
        });
      } catch {
        if (controller.signal.aborted) return;
        const latest = current.current;
        if (
          preserveRows &&
          latest.kind === 'ready' &&
          latest.rows.kind === 'ready'
        ) {
          commit({
            ...latest,
            rows: { ...latest.rows, refreshFailedUnder: startedUnder },
          });
        } else if (
          retainedClients !== undefined &&
          options.reason !== 'recovery'
        ) {
          commit({
            kind: 'ready',
            view,
            clients: retainedClients,
            rows: { kind: 'error' },
          });
        } else commit({ kind: 'error', view });
      }
    })();
  }
  useEffect(() => {
    if (
      readRevision.current === undefined ||
      readRevision.current === clientIdentityRevision
    )
      return;
    if (current.current.kind === 'denied' || current.current.kind === 'error')
      return;
    readList({ reason: 'identity' });
  }, [clientIdentityRevision]);

  function reset() {
    confirmations.current.clear();
    readList({ view: 'all', reason: 'reset' });
  }
  function changeView(view: ProjectDirectoryView) {
    if (view === current.current.view) return;
    readList({ view, reason: 'switch' });
  }
  function refreshRow(input: { project: ProjectView; startedUnder: number }) {
    const { project, startedUnder } = input;
    if (revision.current !== startedUnder) return;
    const confirmation = confirmations.current.get(project.id);
    if (confirmation)
      confirmations.current.set(project.id, { ...confirmation, project });
    const state = current.current;
    if (state.kind === 'ready' && state.rows.kind === 'ready')
      commit({
        ...state,
        rows: {
          ...state.rows,
          projects: state.rows.projects.map((row) =>
            row.id === project.id ? project : row,
          ),
        },
      });
  }
  function confirmRegistration(project: ProjectView) {
    if (current.current.view === 'mine_open') {
      // An unassigned create response is never evidence of current self membership.
      readList({ reason: 'refresh' });
      return;
    }
    confirmations.current.set(project.id, {
      project,
      listReadsAtConfirmation: reads.current,
    });
    const state = current.current;
    if (state.kind === 'ready' && state.rows.kind === 'ready')
      commit({
        ...state,
        rows: {
          ...state.rows,
          projects: [
            ...state.rows.projects.filter((row) => row.id !== project.id),
            project,
          ],
        },
      });
  }
  function refreshMineAfterChange() {
    if (
      current.current.view === 'mine_open' &&
      current.current.kind === 'ready'
    )
      readList({ reason: 'refresh' });
  }
  return {
    load,
    reset,
    changeView,
    deny,
    refreshRow,
    confirmRegistration,
    refreshMineAfterChange,
    cancel: () => request.current?.abort(),
    refresh: () => readList({ reason: 'refresh' }),
    revalidateProjectRead: () => readList({ reason: 'recovery' }),
  };
}
