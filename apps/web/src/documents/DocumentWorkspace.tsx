import { useContext, useEffect, useRef, useState, type FormEvent } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import {
  readClients,
  readDocument,
  readDocumentCorrectionReceipt,
  readDocuments,
  type WorkingDocument,
} from './document-response';
import { documentsCopy as copy } from './documents.copy';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import './documents.css';
type Load =
  | { status: 'loading' | 'error' | 'denied' }
  | {
      status: 'ready';
      documents: WorkingDocument[];
      clients: Array<{ id: string; displayName: string }>;
    };
/** Either the existing free-text filter or one exact dossier identity is active. */
type DocumentFilter =
  | { kind: 'text'; query: string }
  | { kind: 'client'; clientDossierId: string; displayName: string };
export function DocumentWorkspace({
  actor,
  identity,
  onActivityRecorded = () => undefined,
  clientFilter,
  clientIdentityRevision = 0,
  onOpenClientDossier,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActivityRecorded?: () => void | Promise<void>;
  clientFilter?: { clientDossierId: string; displayName: string };
  /** Increases when Client identities change, so derived targets are re-read. */
  clientIdentityRevision?: number;
  onOpenClientDossier?: (clientDossierId: string) => void;
}) {
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const [state, setState] = useState<Load>({ status: 'loading' });
  const [filter, setFilter] = useState<DocumentFilter>({
    kind: 'text',
    query: '',
  });
  const [detail, setDetail] = useState<WorkingDocument>();
  const [revision, setRevision] = useState(0);
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [url, setUrl] = useState('');
  const [mutation, setMutation] = useState<'idle' | 'pending' | 'error'>(
    'idle',
  );
  const [editing, setEditing] = useState(false);
  const [correction, setCorrection] = useState<
    | 'idle'
    | 'pending'
    | 'saved'
    | 'unchanged'
    | 'uncertain'
    | 'conflict'
    | 'denied'
  >('idle');
  /**
   * The opened Document still owes a derived refresh for one Client identity
   * revision. Only a detail read that started under that revision settles it.
   */
  const [staleDossier, setStaleDossier] = useState<{
    documentId: string;
    revision: number;
  }>();
  const correctionActive =
    editing || correction === 'pending' || correction === 'uncertain';
  const correctionInProgress = useRef(correctionActive);
  correctionInProgress.current = correctionActive;
  /**
   * A dossier restriction arrived while a protected correction was open; the
   * detail it would have retired is reconciled once that correction ends.
   */
  const restrictionAwaitsCorrection = useRef(false);
  const openedDocument = useRef<WorkingDocument | undefined>(undefined);
  openedDocument.current = detail;
  const listReady = useRef(false);
  listReady.current = state.status === 'ready';
  const identityRevision = useRef(clientIdentityRevision);
  identityRevision.current = clientIdentityRevision;
  const pending = useRef<AbortController | undefined>(undefined);
  /** The ordinary detail read in flight, if any; never a mutation. */
  const detailRead = useRef<AbortController | undefined>(undefined);
  const listRequest = useRef<AbortController | undefined>(undefined);
  const dossierRefresh = useRef<AbortController | undefined>(undefined);
  const startedListWrites = useRef(0);
  const publishedListWrite = useRef(0);
  /**
   * Confirmed registrations missing from a list read that started before the
   * POST completed. The first list started after confirmation retires the
   * overlay and owns the row's current derived Client projection.
   */
  const confirmedRegistrations = useRef(
    new Map<
      string,
      { document: WorkingDocument; listSequenceAtConfirmation: number }
    >(),
  );
  const knownClientIdentityRevision = useRef(clientIdentityRevision);
  const retry = useRef<{ payload: string; key: string } | undefined>(undefined);
  const correctionRetry = useRef<
    { documentId: string; payload: string; key: string } | undefined
  >(undefined);
  const companyId = actor.activeCompany?.id;
  const canRead =
    actor.activeCompany?.documentPermissions?.includes('document.read') ===
    true;
  const canRegister =
    actor.activeCompany?.documentPermissions?.includes('document.register') ===
    true;
  const canCorrect =
    actor.activeCompany?.documentPermissions?.includes('document.correct') ===
      true &&
    actor.activeCompany.documentPermissions.includes('document.reference.read');
  /**
   * Reserves the ordering slot of a publication that happens after an await.
   * The loaded rows have one owner and one monotonic order, so a delayed older
   * response can never overwrite the rows published by a newer one.
   */
  function reserveListWrite(): number {
    startedListWrites.current += 1;
    return startedListWrites.current;
  }
  function publishList(sequence: number, next: (current: Load) => Load): void {
    if (sequence < publishedListWrite.current) return;
    publishedListWrite.current = sequence;
    setState(next);
  }
  function includeConfirmedRegistrations(
    documents: WorkingDocument[],
    listSequence?: number,
  ): WorkingDocument[] {
    const loadedIds = new Set(documents.map((document) => document.id));
    const missingConfirmed: WorkingDocument[] = [];
    for (const [documentId, confirmation] of confirmedRegistrations.current) {
      if (
        listSequence !== undefined &&
        listSequence > confirmation.listSequenceAtConfirmation
      ) {
        confirmedRegistrations.current.delete(documentId);
      } else if (!loadedIds.has(documentId)) {
        missingConfirmed.push(confirmation.document);
      }
    }
    return missingConfirmed.length === 0
      ? documents
      : [...missingConfirmed, ...documents];
  }
  /**
   * A detail read that lands settles the derived-refresh debt only when no
   * Client identity change happened after it started; otherwise the Document
   * it published may carry a superseded dossier target and stays owed.
   */
  function settleDetailRead(
    documentId: string,
    startedUnderRevision: number,
  ): void {
    setStaleDossier((current) => {
      const revision = identityRevision.current;
      if (revision === startedUnderRevision) return undefined;
      return current?.documentId === documentId && current.revision === revision
        ? current
        : { documentId, revision };
    });
  }
  // A different Company, member or Document authority retires the presentation
  // owned by this module, including the drafts started under it and the rows
  // loaded under it, which the load below replaces.
  useEffect(() => {
    publishList(reserveListWrite(), () => ({ status: 'loading' }));
    setDetail(undefined);
    setFilter({ kind: 'text', query: '' });
    setClientId('');
    setTitle('');
    setPurpose('');
    setUrl('');
    setMutation('idle');
    setEditing(false);
    setCorrection('idle');
    setStaleDossier(undefined);
    restrictionAwaitsCorrection.current = false;
    retry.current = undefined;
    correctionRetry.current = undefined;
    confirmedRegistrations.current.clear();
    pending.current?.abort();
    return () => pending.current?.abort();
  }, [
    companyId,
    canRead,
    canCorrect,
    actor.workspaceId,
    actor.workspaceMembershipId,
  ]);
  // A confirmed Client union or reversal moves the derived dossier target of
  // already loaded rows. They are re-read here, by their single owner, instead
  // of through a competing request: an initial or retried read that is still
  // in flight is superseded rather than raced. Drafts and retryable commands
  // are untouched, because only the loaded rows are republished.
  useEffect(() => {
    const request = new AbortController();
    listRequest.current?.abort();
    listRequest.current = request;
    const sequence = reserveListWrite();
    if (!companyId || !canRead) {
      publishList(sequence, () => ({ status: 'denied' }));
      return () => request.abort();
    }
    if (!listReady.current)
      publishList(sequence, () => ({ status: 'loading' }));
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (request.signal.aborted) return;
        const [documents, clients] = await Promise.all([
          api.request<unknown>('/documents', {
            companyContextId: companyId,
            signal: request.signal,
          }),
          api.request<unknown>('/clients', {
            companyContextId: companyId,
            signal: request.signal,
          }),
        ]);
        if (request.signal.aborted) return;
        if (
          documents.status === 'unauthorized' ||
          clients.status === 'unauthorized'
        ) {
          await identity.rejectSession();
          return;
        }
        if (
          documents.status === 'forbidden' ||
          clients.status === 'forbidden'
        ) {
          publishList(sequence, () => ({ status: 'denied' }));
          return;
        }
        if (documents.status !== 'ok' || clients.status !== 'ok')
          throw new Error('Load failed');
        // Read the payload here: a rejected response must fail closed on this
        // request instead of throwing inside a later React update.
        const loadedDocuments = readDocuments(documents.value);
        const loadedClients = readClients(clients.value);
        publishList(sequence, () => ({
          status: 'ready',
          documents: includeConfirmedRegistrations(loadedDocuments, sequence),
          clients: loadedClients,
        }));
      } catch {
        if (request.signal.aborted) return;
        // A failed refresh keeps the loaded rows, their open detail and their
        // drafts usable; only a failed first read offers the retry.
        if (listReady.current) setMutation('error');
        else publishList(sequence, () => ({ status: 'error' }));
      }
    })();
    return () => request.abort();
  }, [
    identity,
    companyId,
    canRead,
    canCorrect,
    actor.workspaceId,
    actor.workspaceMembershipId,
    revision,
    clientIdentityRevision,
  ]);
  useEffect(() => {
    if (knownClientIdentityRevision.current === clientIdentityRevision) return;
    knownClientIdentityRevision.current = clientIdentityRevision;
    const opened = openedDocument.current;
    setStaleDossier(
      opened
        ? { documentId: opened.id, revision: clientIdentityRevision }
        : undefined,
    );
  }, [clientIdentityRevision]);
  // The opened Document owes the same derived refresh. An open correction
  // draft and its retryable command keep the exact Document they started from,
  // so the catch-up read waits for that correction to end instead of being
  // skipped and forgotten.
  useEffect(() => {
    if (staleDossier === undefined || correctionActive) return;
    const { documentId, revision } = staleDossier;
    if (!companyId || !canRead || detail?.id !== documentId) {
      setStaleDossier(undefined);
      return;
    }
    const request = new AbortController();
    dossierRefresh.current?.abort();
    dossierRefresh.current = request;
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (request.signal.aborted) return;
        const reopened = await api.request<unknown>(
          `/documents/${encodeURIComponent(documentId)}`,
          { companyContextId: companyId, signal: request.signal },
        );
        if (request.signal.aborted) return;
        if (reopened.status === 'unauthorized') {
          await identity.rejectSession();
          return;
        }
        if (reopened.status === 'forbidden' || reopened.status === 'notFound') {
          publishList(reserveListWrite(), () => ({ status: 'denied' }));
          setStaleDossier(undefined);
          return;
        }
        if (reopened.status !== 'ok') throw new Error('Refresh failed');
        const reloaded = readDocument(reopened.value);
        setDetail((current) =>
          current?.id === reloaded.id ? reloaded : current,
        );
        settleDetailRead(reloaded.id, revision);
      } catch {
        if (!request.signal.aborted) setMutation('error');
      }
    })();
    return () => request.abort();
  }, [
    staleDossier,
    correctionActive,
    detail?.id,
    companyId,
    canRead,
    identity,
  ]);
  /**
   * Retires the visible detail behind a newly applied dossier restriction,
   * with any ordinary detail read still in flight that would republish it.
   */
  function retireDetailBehindRestriction(): void {
    const read = detailRead.current;
    if (read && !read.signal.aborted) {
      read.abort();
      setMutation('idle');
    }
    setDetail(undefined);
  }
  useEffect(() => {
    if (!clientFilter) {
      // The shell retired the navigation intent, so a dossier identity that a
      // union or reversal superseded stops restricting the loaded rows.
      restrictionAwaitsCorrection.current = false;
      setFilter((current) =>
        current.kind === 'client' ? { kind: 'text', query: '' } : current,
      );
      return;
    }
    setFilter({ kind: 'client', ...clientFilter });
    // Show the restricted references, but never discard an open correction
    // draft or a retryable correction command owned by this module.
    if (correctionInProgress.current) {
      restrictionAwaitsCorrection.current = true;
      return;
    }
    retireDetailBehindRestriction();
  }, [clientFilter]);
  // Only a restriction that arrived during the correction is reconciled when
  // it ends; a correction ending under an unchanged restriction keeps its
  // Document and outcome visible.
  useEffect(() => {
    if (correctionActive || !restrictionAwaitsCorrection.current) return;
    restrictionAwaitsCorrection.current = false;
    retireDetailBehindRestriction();
  }, [correctionActive]);
  async function open(id: string) {
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    detailRead.current = request;
    const startedUnderRevision = identityRevision.current;
    setDetail(undefined);
    setMutation('pending');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const result = await api.request<unknown>(
        `/documents/${encodeURIComponent(id)}`,
        { companyContextId: companyId, signal: request.signal },
      );
      if (request.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        publishList(reserveListWrite(), () => ({ status: 'denied' }));
        setMutation('idle');
        return;
      }
      if (result.status !== 'ok') throw new Error('Read failed');
      const opened = readDocument(result.value);
      setDetail(opened);
      settleDetailRead(opened.id, startedUnderRevision);
      setEditing(false);
      setCorrection('idle');
      correctionRetry.current = undefined;
      setMutation('idle');
    } catch {
      if (!request.signal.aborted) setMutation('error');
    } finally {
      if (detailRead.current === request) detailRead.current = undefined;
    }
  }
  function beginCorrection() {
    if (
      !detail ||
      !canCorrect ||
      detail.correction !== 'allowed' ||
      detail.version.representation.access !== 'granted'
    )
      return;
    setTitle(detail.title);
    setPurpose(detail.purpose);
    setUrl(detail.version.representation.url);
    setEditing(true);
    setCorrection('idle');
    correctionRetry.current = undefined;
  }
  async function submitCorrection(event: FormEvent, retryStored = false) {
    event.preventDefault();
    if (!companyId || !detail || correction === 'pending') return;
    const previous = correctionRetry.current;
    const command = retryStored
      ? previous?.documentId === detail.id && correction === 'uncertain'
        ? previous
        : undefined
      : (() => {
          const payload = JSON.stringify({
            expectedRevision: detail.workingRevision,
            title,
            purpose,
            url,
          });
          return previous?.documentId === detail.id &&
            previous.payload === payload
            ? previous
            : { documentId: detail.id, payload, key: crypto.randomUUID() };
        })();
    if (!command) return;
    correctionRetry.current = command;
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    setCorrection('pending');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const result = await api.request<unknown>(
        `/documents/${encodeURIComponent(detail.id)}`,
        {
          method: 'PATCH',
          companyContextId: companyId,
          signal: request.signal,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          body: command.payload,
        },
      );
      if (request.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        setCorrection('denied');
        setEditing(false);
        correctionRetry.current = undefined;
        return;
      }
      if (result.status === 'conflict') {
        setCorrection('conflict');
        setEditing(false);
        correctionRetry.current = undefined;
        return;
      }
      if (result.status !== 'ok') {
        setCorrection('uncertain');
        return;
      }
      const receipt = readDocumentCorrectionReceipt(result.value);
      if (receipt.documentId !== detail.id)
        throw new Error('Unexpected correction receipt');
      const sequence = reserveListWrite();
      const startedUnderRevision = identityRevision.current;
      const [documentResult, documentsResult] = await Promise.all([
        api.request<unknown>(`/documents/${encodeURIComponent(detail.id)}`, {
          companyContextId: companyId,
          signal: request.signal,
        }),
        api.request<unknown>('/documents', {
          companyContextId: companyId,
          signal: request.signal,
        }),
      ]);
      if (request.signal.aborted) return;
      if (documentResult.status !== 'ok' || documentsResult.status !== 'ok')
        throw new Error('Reload failed');
      const saved = readDocument(documentResult.value);
      const documents = readDocuments(documentsResult.value);
      setDetail(saved);
      settleDetailRead(saved.id, startedUnderRevision);
      publishList(sequence, (current) =>
        current.status === 'ready' ? { ...current, documents } : current,
      );
      setEditing(false);
      setCorrection(receipt.outcome === 'corrected' ? 'saved' : 'unchanged');
      correctionRetry.current = undefined;
      if (receipt.outcome === 'corrected') await onActivityRecorded();
    } catch {
      if (!request.signal.aborted) setCorrection('uncertain');
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!companyId || mutation === 'pending') return;
    const payload = JSON.stringify({ clientId, title, purpose, url });
    const command =
      retry.current?.payload === payload
        ? retry.current
        : { payload, key: crypto.randomUUID() };
    retry.current = command;
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    setMutation('pending');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const result = await api.request<unknown>('/documents', {
        method: 'POST',
        companyContextId: companyId,
        signal: request.signal,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.key,
        },
        body: payload,
      });
      if (request.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden') {
        publishList(reserveListWrite(), () => ({ status: 'denied' }));
        setMutation('idle');
        return;
      }
      if (result.status !== 'ok') throw new Error('Registration failed');
      const saved = readDocument(result.value);
      retry.current = undefined;
      setDetail(saved);
      setMutation('idle');
      // A confirmed row must survive a list read that began before the POST,
      // without making that read stale: it may carry newer Client projections
      // for every existing row. A list started after confirmation retires this
      // overlay and becomes authoritative for the new row as well.
      confirmedRegistrations.current.set(saved.id, {
        document: saved,
        listSequenceAtConfirmation: startedListWrites.current,
      });
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              documents: includeConfirmedRegistrations(current.documents),
            }
          : current,
      );
      await onActivityRecorded();
    } catch {
      if (!request.signal.aborted) setMutation('error');
    }
  }
  const normalizedFilterQuery =
    filter.kind === 'text' ? filter.query.trim().toLowerCase() : '';
  const filteredDocuments =
    state.status === 'ready'
      ? state.documents.filter((document) =>
          filter.kind === 'client'
            ? document.clientDossierId === filter.clientDossierId
            : normalizedFilterQuery.length === 0 ||
              document.title.toLowerCase().includes(normalizedFilterQuery) ||
              document.clientDisplayName
                .toLowerCase()
                .includes(normalizedFilterQuery),
        )
      : [];
  return (
    <section
      id="documents"
      tabIndex={-1}
      className={`working-documents${isPrisme ? ' working-documents--prisme' : ''}`}
      aria-label={copy.title}
    >
      {isPrisme ? (
        <header className="working-documents-heading">
          <p className="prisme-eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p>{actor.activeCompany?.displayName}</p>
        </header>
      ) : (
        <>
          <h2>{copy.title}</h2>
          <p>{actor.activeCompany?.displayName}</p>
        </>
      )}
      <p className={isPrisme ? 'working-documents-warning' : undefined}>
        {copy.warning}
      </p>
      {state.status === 'loading' && <p role="status">{copy.loading}</p>}
      {state.status === 'denied' && <p role="alert">{copy.denied}</p>}
      {state.status === 'error' && (
        <>
          <p role="alert">{copy.error}</p>
          <button onClick={() => setRevision((value) => value + 1)}>
            {copy.retry}
          </button>
        </>
      )}
      {state.status === 'ready' && (
        <>
          {state.documents.length > 0 && (
            <label className={isPrisme ? 'working-document-filter' : undefined}>
              {copy.filterLabel}
              <input
                type="search"
                value={
                  filter.kind === 'client' ? filter.displayName : filter.query
                }
                placeholder={copy.filterPlaceholder}
                onChange={(event) =>
                  setFilter({ kind: 'text', query: event.target.value })
                }
              />
            </label>
          )}
          {detail ? (
            <article
              className={isPrisme ? 'working-document-detail' : undefined}
            >
              {editing ? (
                <form
                  className={
                    isPrisme ? 'working-document-correction' : undefined
                  }
                  onSubmit={(event) => void submitCorrection(event)}
                >
                  <label>
                    {copy.titleLabel}
                    <input
                      required
                      maxLength={200}
                      disabled={
                        correction === 'pending' || correction === 'uncertain'
                      }
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>
                  <label>
                    {copy.purpose}
                    <textarea
                      required
                      maxLength={2000}
                      disabled={
                        correction === 'pending' || correction === 'uncertain'
                      }
                      value={purpose}
                      onChange={(event) => setPurpose(event.target.value)}
                    />
                  </label>
                  <label>
                    {copy.url}
                    <input
                      required
                      type="url"
                      disabled={
                        correction === 'pending' || correction === 'uncertain'
                      }
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                    />
                  </label>
                  <button
                    className={isPrisme ? 'prisme-primary-action' : undefined}
                    disabled={
                      correction === 'pending' || correction === 'uncertain'
                    }
                  >
                    {copy.save}
                  </button>
                  <button
                    type="button"
                    disabled={correction === 'pending'}
                    onClick={() => {
                      setEditing(false);
                      setCorrection('idle');
                      correctionRetry.current = undefined;
                    }}
                  >
                    {copy.cancel}
                  </button>
                </form>
              ) : (
                <>
                  <h3>{detail.title}</h3>
                  <p>{copy.draft}</p>
                  <p>{detail.clientDisplayName}</p>
                  {detail.clientDossierId && onOpenClientDossier && (
                    <ClientDossierButton
                      clientDossierId={detail.clientDossierId}
                      onOpen={onOpenClientDossier}
                    />
                  )}
                  <p>{detail.purpose}</p>
                </>
              )}
              {!editing &&
              detail.version.representation.access === 'granted' ? (
                <a
                  href={detail.version.representation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {copy.open}
                </a>
              ) : !editing ? (
                <p>{copy.referenceDenied}</p>
              ) : null}
              {!editing &&
                canCorrect &&
                correction !== 'conflict' &&
                detail.correction === 'allowed' &&
                detail.version.representation.access === 'granted' && (
                  <button
                    className={isPrisme ? 'prisme-primary-action' : undefined}
                    onClick={beginCorrection}
                  >
                    {copy.edit}
                  </button>
                )}
              {!editing && (
                <button onClick={() => setDetail(undefined)}>
                  {copy.back}
                </button>
              )}
              {correction === 'pending' && <p role="status">{copy.saving}</p>}
              {correction === 'saved' && <p role="status">{copy.saved}</p>}
              {correction === 'unchanged' && (
                <p role="status">{copy.unchanged}</p>
              )}
              {correction === 'denied' && (
                <p role="alert">{copy.correctionDenied}</p>
              )}
              {correction === 'conflict' && (
                <>
                  <p role="alert">{copy.conflict}</p>
                  <button onClick={() => void open(detail.id)}>
                    {copy.reload}
                  </button>
                </>
              )}
              {correction === 'uncertain' && (
                <>
                  <p role="alert">{copy.uncertain}</p>
                  <button
                    onClick={(event) => void submitCorrection(event, true)}
                  >
                    {copy.retryCorrection}
                  </button>
                </>
              )}
            </article>
          ) : (
            <>
              {state.documents.length > 0 && filteredDocuments.length === 0 && (
                <p role="status">{copy.noMatches}</p>
              )}
              <ul className={isPrisme ? 'working-document-list' : undefined}>
                {filteredDocuments.map((document) => (
                  <li key={document.id}>
                    <button
                      onClick={() => void open(document.id)}
                      disabled={mutation === 'pending'}
                    >
                      {document.title}
                    </button>{' '}
                    — {document.clientDisplayName}
                  </li>
                ))}
              </ul>
              {state.documents.length === 0 && <p>{copy.empty}</p>}
              {canRegister && (
                <form
                  className={
                    isPrisme ? 'working-document-registration' : undefined
                  }
                  onSubmit={(event) => void submit(event)}
                >
                  <label htmlFor="document-client">{copy.client}</label>
                  <select
                    id="document-client"
                    required
                    value={clientId}
                    onChange={(event) => setClientId(event.target.value)}
                  >
                    <option value="">{copy.selectClient}</option>
                    {state.clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.displayName}
                      </option>
                    ))}
                  </select>
                  <label>
                    {copy.titleLabel}
                    <input
                      required
                      maxLength={200}
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>
                  <label>
                    {copy.purpose}
                    <textarea
                      required
                      maxLength={2000}
                      value={purpose}
                      onChange={(event) => setPurpose(event.target.value)}
                    />
                  </label>
                  <label>
                    {copy.url}
                    <input
                      required
                      type="url"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                    />
                  </label>
                  <button
                    className={isPrisme ? 'prisme-primary-action' : undefined}
                    disabled={mutation === 'pending'}
                  >
                    {copy.register}
                  </button>
                </form>
              )}
            </>
          )}
          {mutation === 'error' && <p role="alert">{copy.error}</p>}
        </>
      )}
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
