import { hasReceivedContractAccess } from '../documents/received-contract-access';
import { hasMissionDeliverableAccess } from '../documents/mission-deliverable-access';
import { useEffect, useState } from 'react';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import type { ActorContext } from '../access-types';
import { holds } from '../access/company-grants';
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
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [selector, setSelector] = useState<Selector | null>(null);
  const [mutation, setMutation] = useState<Mutation>({ kind: 'idle' });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [generation, setGeneration] = useState(0);
  const lifetime = String(useRequestLifetime(identity, String(generation)));
  const listWork = useScopedOperationGroup(lifetime);
  const selectorWork = useScopedOperationGroup(lifetime);
  const commandWork = useScopedOperationGroup(lifetime);
  const actorObservation = useActorObservation(actor);
  const captureRecovery = useAuthorityLifetime(
    String(actorObservation),
    identity,
  );
  const companyId = actor.activeCompany?.id;
  const company = actor.activeCompany;
  const canRead =
    holds(company, 'company_document_registrar', 'document.read') &&
    holds(company, 'company_project_access', 'project.read') &&
    (actor.workspacePermissions.includes('client.manage') ||
      holds(company, 'company_director_client_access', 'client.read'));
  const canManage = holds(
    company,
    'company_document_project_organizer',
    'document.project.manage',
  );
  const canOpen = holds(
    company,
    'company_document_registrar',
    'document.reference.read',
  );
  const projectClosed = isClosedProjectStatus(projectStatus);
  const busy = mutation.kind === 'pending';
  const enabled = mutation.kind === 'idle';

  async function fetchListing(
    eligible: boolean,
    signal: AbortSignal,
    canRejectSession: () => boolean,
  ): Promise<Load> {
    const api = await createAuthenticatedApiClient(identity);
    if (signal.aborted) return { kind: 'loading' };
    const result = await api.request(
      `/projects/${encodeURIComponent(projectId)}/${eligible ? 'eligible-documents' : 'documents'}`,
      { companyContextId: companyId, signal },
    );
    if (signal.aborted) return { kind: 'loading' };
    if (result.status === 'unauthorized') {
      if (canRejectSession()) await identity.rejectSession();
      return { kind: 'denied' };
    }
    if (result.status === 'forbidden' || result.status === 'notFound')
      return { kind: 'denied' };
    if (result.status !== 'ok') return { kind: 'error' };
    const listing = readListing(result.value);
    return {
      kind: 'ready',
      listing: {
        ...listing,
        documents: listing.documents.filter(
          (row) =>
            row.document.type === 'questionnaire' ||
            (row.document.type === 'mission-deliverable'
              ? hasMissionDeliverableAccess(actor.activeCompany)
              : hasReceivedContractAccess(actor.activeCompany)),
        ),
      },
    };
  }
  useEffect(() => {
    setSelector(null);
    setMutation({ kind: 'idle' });
    if (!canRead || !companyId) {
      setLoad({ kind: 'denied' });
      return;
    }
    const request = listWork.beginLatest();
    if (!request) return;
    const { signal } = request;
    const canRejectSession = captureRecovery();
    setLoad({ kind: 'loading' });
    void fetchListing(false, signal, canRejectSession)
      .then((result) => {
        if (!signal.aborted) setLoad(result);
      })
      .catch(() => {
        if (!signal.aborted) setLoad({ kind: 'error' });
      })
      .finally(request.release);
    return request.retire;
    // Actor authority and Project replacement remount this session. Recovery captures the complete Actor separately.
  }, [identity, generation]);

  async function choose() {
    if (commandWork.isPending()) return;
    const request = selectorWork.beginLatest();
    if (!request) return;
    const { signal } = request;
    const canRejectSession = captureRecovery();
    setSelector({ load: { kind: 'loading' }, query: '' });
    try {
      const result = await fetchListing(true, signal, canRejectSession);
      if (signal.aborted) return;
      if (result.kind === 'denied') {
        listWork.retire();
        setLoad(result);
        setSelector(null);
        setMutation({ kind: 'blocked' });
      } else setSelector({ load: result, query: '' });
    } catch {
      if (!signal.aborted) setSelector({ load: { kind: 'error' }, query: '' });
    } finally {
      request.release();
    }
  }
  function closeSelector() {
    selectorWork.retire();
    setSelector(null);
  }
  async function run(command: Command) {
    if (commandWork.isPending()) return;
    const request = commandWork.begin();
    if (!request) return;
    selectorWork.retire();
    setSelector((current) =>
      current?.load.kind === 'loading' ? null : current,
    );
    const { signal } = request;
    const canRejectSession = captureRecovery();
    setMutation({ kind: 'pending', command });
    setFeedback(null);
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      const result = await api.request(
        `/documents/${encodeURIComponent(command.documentId)}/project-association`,
        {
          companyContextId: companyId,
          signal,
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
      if (signal.aborted) return;
      if (
        result.status === 'unauthorized' ||
        result.status === 'forbidden' ||
        result.status === 'notFound'
      ) {
        listWork.retire();
        selectorWork.retire();
        setLoad({ kind: 'denied' });
        setSelector(null);
        setMutation({ kind: 'blocked' });
        if (result.status === 'unauthorized' && canRejectSession())
          await identity.rejectSession();
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
      listWork.retire();
      selectorWork.retire();
      setSelector(null);
      setMutation({ kind: 'blocked' });
      setLoad({ kind: 'loading' });
      // A confirmed command is historical. Only a fresh query describes the current link.
      try {
        const refreshed = await fetchListing(false, signal, canRejectSession);
        if (!signal.aborted) {
          setLoad(refreshed);
          if (refreshed.kind === 'ready') setMutation({ kind: 'idle' });
        }
      } catch {
        if (!signal.aborted) setLoad({ kind: 'error' });
      }
      if (!signal.aborted) {
        try {
          void Promise.resolve(onActivityRecorded?.()).catch(() => undefined);
        } catch {
          /* Relationship confirmation remains valid if Activity Log refresh fails. */
        }
      }
    } catch {
      if (!signal.aborted) {
        setFeedback('uncertain');
        setMutation({ kind: 'uncertain', command });
      }
    } finally {
      request.release();
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
        <ul className="project-document-list">
          {rows.map((row) => (
            <li key={row.document.id}>
              <h5>{row.document.title}</h5>
              <p>{row.document.purpose}</p>
              {!eligible &&
                row.document.type === 'questionnaire' &&
                (canOpen &&
                row.document.version.representation?.access === 'granted' ? (
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
      className="project-documents project-documents--prisme"
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
        <div aria-label={copy.choose} className="project-document-selector">
          {selector.load.kind === 'ready' &&
            selector.load.listing.documents.length > 0 && (
              <label className="project-document-search">
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
      const document = readDocument(row.document);
      if (document.type === 'received-audit-source')
        throw new Error(
          'Received sources cannot belong to an ordinary Project Document list',
        );
      return { document, revision: row.revision };
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
