import { useContext, useEffect, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import { companyAuthorityWithoutProjectTemplate } from './project-authority';
import type { BrowserIdentity } from '../access-composition';
import {
  conflictCode,
  createAuthenticatedApiClient,
} from '../api/authenticated-api-client';
import {
  readDocument,
  type WorkingDocument,
} from '../documents/document-response';
import { useProjectDocumentsCopy } from './project-documents.copy';
import {
  isClosedProjectStatus,
  type ProjectStatus,
} from './project-lifecycle-response';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import './project-documents.css';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string;
  projectStatus: ProjectStatus;
  onProjectChanged?: () => void | Promise<void>;
  onActivityRecorded?: () => void | Promise<void>;
  /** Opens a displayed linked Document by its stable id; this panel never reads it. */
  onOpenDocument?: (documentId: string) => void;
};
type Association = { document: WorkingDocument; revision: number };
type Listing = { mutable: boolean; documents: Association[] };
type Load =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; listing: Listing };
type Command = {
  documentId: string;
  projectId: string;
  action: 'link' | 'unlink';
  expectedRevision: number;
  key: string;
};
type Mutation =
  | { kind: 'idle' | 'blocked' }
  | { kind: 'pending' | 'uncertain'; command: Command };
// The local query exists only while the selector is open, so closing it removes the query with it.
type Selector = { load: Load; query: string };
type Feedback = 'closedRefusal' | 'conflict' | 'uncertain' | 'confirmed';

export function ProjectDocuments(props: Props) {
  const authority = JSON.stringify([
    props.projectId,
    props.actor.workspaceId,
    props.actor.workspaceMembershipId,
    companyAuthorityWithoutProjectTemplate(props.actor.activeCompany),
    props.actor.workspacePermissions,
  ]);
  return <ProjectDocumentSession key={authority} {...props} />;
}
function ProjectDocumentSession({
  actor,
  identity,
  projectId,
  projectStatus,
  onProjectChanged,
  onActivityRecorded,
  onOpenDocument,
}: Props) {
  const copy = useProjectDocumentsCopy();
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [selector, setSelector] = useState<Selector | null>(null);
  const [mutation, setMutation] = useState<Mutation>({ kind: 'idle' });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [generation, setGeneration] = useState(0);
  const pending = useRef<AbortController | null>(null);
  // Only the selector's own read is tracked here, so closing it never touches a command request.
  const selectorRequest = useRef<AbortController | null>(null);
  const companyId = actor.activeCompany?.id;
  const canRead =
    actor.activeCompany?.documentPermissions?.includes('document.read') &&
    actor.activeCompany.projectPermissions?.includes('project.read') &&
    (actor.workspacePermissions.includes('client.manage') ||
      actor.activeCompany.clientPermissions?.includes('client.read'));
  const canManage = actor.activeCompany?.documentPermissions?.includes(
    'document.project.manage',
  );
  const canOpen = actor.activeCompany?.documentPermissions?.includes(
    'document.reference.read',
  );
  const projectClosed = isClosedProjectStatus(projectStatus);
  const busy = mutation.kind === 'pending';
  const enabled = mutation.kind === 'idle';

  async function fetchListing(
    eligible: boolean,
    controller: AbortController,
  ): Promise<Load> {
    const api = await createAuthenticatedApiClient(identity);
    if (controller.signal.aborted) return { kind: 'loading' };
    const result = await api.request<unknown>(
      `/projects/${encodeURIComponent(projectId)}/${eligible ? 'eligible-documents' : 'documents'}`,
      { companyContextId: companyId, signal: controller.signal },
    );
    if (controller.signal.aborted) return { kind: 'loading' };
    if (result.status === 'unauthorized') {
      await identity.rejectSession();
      return { kind: 'denied' };
    }
    if (result.status === 'forbidden' || result.status === 'notFound')
      return { kind: 'denied' };
    if (result.status !== 'ok') return { kind: 'error' };
    return { kind: 'ready', listing: readListing(result.value) };
  }
  useEffect(() => {
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    setSelector(null);
    setMutation({ kind: 'idle' });
    if (!canRead || !companyId) {
      setLoad({ kind: 'denied' });
      return () => controller.abort();
    }
    setLoad({ kind: 'loading' });
    void fetchListing(false, controller)
      .then((result) => {
        if (!controller.signal.aborted) setLoad(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ kind: 'error' });
      });
    return () => pending.current?.abort();
    // Actor and Project changes remount the session; identity changes invalidate requests here.
  }, [identity, generation]);

  async function choose() {
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    selectorRequest.current = controller;
    setSelector({ load: { kind: 'loading' }, query: '' });
    try {
      const result = await fetchListing(true, controller);
      if (!controller.signal.aborted) {
        if (result.kind === 'denied') {
          setLoad(result);
          setSelector(null);
          setMutation({ kind: 'blocked' });
        } else setSelector({ load: result, query: '' });
      }
    } catch {
      if (!controller.signal.aborted)
        setSelector({ load: { kind: 'error' }, query: '' });
    }
  }
  function closeSelector() {
    // A closed selector must not be reopened by its own late reply; the command keeps its request.
    selectorRequest.current?.abort();
    selectorRequest.current = null;
    setSelector(null);
  }
  async function run(command: Command) {
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    setMutation({ kind: 'pending', command });
    setFeedback(null);
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(
        `/documents/${encodeURIComponent(command.documentId)}/project-association`,
        {
          companyContextId: companyId,
          signal: controller.signal,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          body: JSON.stringify({
            projectId: command.projectId,
            action: command.action,
            expectedRevision: command.expectedRevision,
          }),
        },
      );
      if (controller.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        setLoad({ kind: 'denied' });
        setSelector(null);
        setMutation({ kind: 'blocked' });
        return;
      }
      if (result.status === 'conflict' || result.status === 'validation') {
        if (
          result.status === 'conflict' &&
          conflictCode(result) === 'project_closed'
        ) {
          setFeedback('closedRefusal');
          setMutation({ kind: 'blocked' });
          return;
        }
        setFeedback('conflict');
        setMutation({ kind: 'blocked' });
        return;
      }
      if (result.status !== 'ok' || !isReceipt(result.value, command)) {
        setFeedback('uncertain');
        setMutation({ kind: 'uncertain', command });
        return;
      }
      setFeedback('confirmed');
      setSelector(null);
      setMutation({ kind: 'blocked' });
      setLoad({ kind: 'loading' });
      // A confirmed command is historical. Only a fresh query describes the current link.
      try {
        const refreshed = await fetchListing(false, controller);
        if (!controller.signal.aborted) {
          setLoad(refreshed);
          if (refreshed.kind === 'ready') setMutation({ kind: 'idle' });
        }
      } catch {
        if (!controller.signal.aborted) setLoad({ kind: 'error' });
      }
      if (!controller.signal.aborted) {
        try {
          await onActivityRecorded?.();
        } catch {
          /* Relationship confirmation remains valid if Activity Log refresh fails. */
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        setFeedback('uncertain');
        setMutation({ kind: 'uncertain', command });
      }
    }
  }
  function change(row: Association, action: Command['action']) {
    void run({
      documentId: row.document.id,
      projectId,
      action,
      expectedRevision: row.revision,
      key: crypto.randomUUID(),
    });
  }
  // The query narrows the already authorized eligible rows only; linked rows stay complete.
  const query = selector ? selector.query.trim().toLowerCase() : '';
  function matchesQuery(row: Association) {
    return (
      row.document.title.toLowerCase().includes(query) ||
      row.document.purpose.toLowerCase().includes(query)
    );
  }
  function renderState(state: Load, eligible: boolean) {
    if (state.kind !== 'ready')
      return (
        <p role={state.kind === 'loading' ? 'status' : 'alert'}>
          {state.kind === 'loading'
            ? copy.loading
            : state.kind === 'denied'
              ? copy.denied
              : copy.error}
        </p>
      );
    const rows = eligible
      ? state.listing.documents.filter(matchesQuery)
      : state.listing.documents;
    return (
      <>
        {!state.listing.mutable && (
          <p>{projectClosed ? copy.closedReadOnly : copy.immutable}</p>
        )}
        {state.listing.documents.length === 0 && (
          <p>{eligible ? copy.noEligible : copy.empty}</p>
        )}
        {state.listing.documents.length > 0 && rows.length === 0 && (
          <p>{copy.noMatch}</p>
        )}
        <ul className={isPrisme ? 'project-document-list' : undefined}>
          {rows.map((row) => (
            <li key={row.document.id}>
              <h5>{row.document.title}</h5>
              <p>{row.document.purpose}</p>
              {!eligible &&
                (canOpen &&
                row.document.version.representation.access === 'granted' ? (
                  <a
                    href={row.document.version.representation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {copy.open}
                  </a>
                ) : (
                  <p>{copy.referenceDenied}</p>
                ))}
              {!eligible && onOpenDocument && (
                <button
                  type="button"
                  onClick={() => onOpenDocument(row.document.id)}
                >
                  {copy.openDocument}
                </button>
              )}
              {canManage && !projectClosed && state.listing.mutable && (
                <button
                  type="button"
                  disabled={!enabled}
                  onClick={() => change(row, eligible ? 'link' : 'unlink')}
                >
                  {eligible ? copy.attach : copy.remove} {row.document.title}
                </button>
              )}
            </li>
          ))}
        </ul>
      </>
    );
  }
  return (
    <section
      aria-label={copy.title}
      className={`project-documents${isPrisme ? ' project-documents--prisme' : ''}`}
    >
      <h4>{copy.title}</h4>
      <p>{copy.warning}</p>
      {renderState(load, false)}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setFeedback(null);
          setGeneration((value) => value + 1);
          void onProjectChanged?.();
        }}
      >
        {copy.reload}
      </button>
      {canManage &&
        !projectClosed &&
        load.kind === 'ready' &&
        load.listing.mutable && (
          <button
            type="button"
            disabled={!enabled}
            onClick={() => void choose()}
          >
            {copy.choose}
          </button>
        )}
      {selector && (
        <div
          aria-label={copy.choose}
          className={isPrisme ? 'project-document-selector' : undefined}
        >
          {selector.load.kind === 'ready' &&
            selector.load.listing.documents.length > 0 && (
              <label
                className={isPrisme ? 'project-document-search' : undefined}
              >
                {copy.searchLabel}
                <input
                  type="search"
                  value={selector.query}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSelector((current) =>
                      current ? { ...current, query: next } : current,
                    );
                  }}
                />
              </label>
            )}
          {renderState(selector.load, true)}
          <button type="button" disabled={busy} onClick={closeSelector}>
            {copy.close}
          </button>
        </div>
      )}
      {feedback && <p role="status">{copy[feedback]}</p>}
      {mutation.kind === 'uncertain' && (
        <button type="button" onClick={() => void run(mutation.command)}>
          {copy.retry}
        </button>
      )}
    </section>
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function readListing(value: unknown): Listing {
  if (
    !isRecord(value) ||
    typeof value.mutable !== 'boolean' ||
    !Array.isArray(value.documents)
  )
    throw new Error('Invalid associations');
  return {
    mutable: value.mutable,
    documents: value.documents.map((row: unknown) => {
      if (
        !isRecord(row) ||
        typeof row.revision !== 'number' ||
        !Number.isSafeInteger(row.revision) ||
        row.revision < 0
      )
        throw new Error('Invalid association revision');
      return { document: readDocument(row.document), revision: row.revision };
    }),
  };
}
function isReceipt(value: unknown, command: Command): boolean {
  return (
    isRecord(value) &&
    value.documentId === command.documentId &&
    value.projectId === command.projectId &&
    value.action === command.action &&
    value.revision === command.expectedRevision + 1
  );
}
