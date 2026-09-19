import { useContext, useEffect, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import {
  readDocument,
  type WorkingDocument,
} from '../documents/document-response';
import { projectDocumentsCopy as copy } from './project-documents.copy';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import './project-documents.css';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string;
  onActivityRecorded?: () => void | Promise<void>;
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

export function ProjectDocuments(props: Props) {
  const authority = JSON.stringify([
    props.projectId,
    props.actor.workspaceId,
    props.actor.workspaceMembershipId,
    props.actor.activeCompany,
    props.actor.workspacePermissions,
  ]);
  return <ProjectDocumentSession key={authority} {...props} />;
}
function ProjectDocumentSession({
  actor,
  identity,
  projectId,
  onActivityRecorded,
}: Props) {
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [selector, setSelector] = useState<Load | null>(null);
  const [mutation, setMutation] = useState<Mutation>({ kind: 'idle' });
  const [feedback, setFeedback] = useState('');
  const [generation, setGeneration] = useState(0);
  const pending = useRef<AbortController | null>(null);
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
    setSelector({ kind: 'loading' });
    try {
      const result = await fetchListing(true, controller);
      if (!controller.signal.aborted) {
        if (result.kind === 'denied') {
          setLoad(result);
          setSelector(null);
          setMutation({ kind: 'blocked' });
        } else setSelector(result);
      }
    } catch {
      if (!controller.signal.aborted) setSelector({ kind: 'error' });
    }
  }
  async function run(command: Command) {
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    setMutation({ kind: 'pending', command });
    setFeedback('');
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
        setFeedback(copy.conflict);
        setSelector(null);
        setMutation({ kind: 'blocked' });
        return;
      }
      if (result.status !== 'ok' || !isReceipt(result.value, command)) {
        setFeedback(copy.uncertain);
        setMutation({ kind: 'uncertain', command });
        return;
      }
      setFeedback(copy.confirmed);
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
        setFeedback(copy.uncertain);
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
    return (
      <>
        {!state.listing.mutable && <p>{copy.immutable}</p>}
        {state.listing.documents.length === 0 && (
          <p>{eligible ? copy.noEligible : copy.empty}</p>
        )}
        <ul className={isPrisme ? 'project-document-list' : undefined}>
          {state.listing.documents.map((row) => (
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
              {canManage && state.listing.mutable && (
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
          setFeedback('');
          setGeneration((value) => value + 1);
        }}
      >
        {copy.reload}
      </button>
      {canManage && load.kind === 'ready' && load.listing.mutable && (
        <button type="button" disabled={!enabled} onClick={() => void choose()}>
          {copy.choose}
        </button>
      )}
      {selector && (
        <div
          aria-label={copy.choose}
          className={isPrisme ? 'project-document-selector' : undefined}
        >
          {renderState(selector, true)}
          <button
            type="button"
            disabled={busy}
            onClick={() => setSelector(null)}
          >
            {copy.close}
          </button>
        </div>
      )}
      {feedback && <p role="status">{feedback}</p>}
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
