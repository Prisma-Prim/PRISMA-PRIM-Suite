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
export function DocumentWorkspace({
  actor,
  identity,
  onActivityRecorded = () => undefined,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActivityRecorded?: () => void | Promise<void>;
}) {
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const [state, setState] = useState<Load>({ status: 'loading' });
  const [filterQuery, setFilterQuery] = useState('');
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
  const pending = useRef<AbortController | undefined>(undefined);
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
  useEffect(() => {
    setDetail(undefined);
    setFilterQuery('');
    setClientId('');
    setTitle('');
    setPurpose('');
    setUrl('');
    setMutation('idle');
    setEditing(false);
    setCorrection('idle');
    retry.current = undefined;
    correctionRetry.current = undefined;
    const request = new AbortController();
    pending.current?.abort();
    pending.current = request;
    if (!companyId || !canRead) {
      setState({ status: 'denied' });
      return () => pending.current?.abort();
    }
    setState({ status: 'loading' });
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
          setState({ status: 'denied' });
          return;
        }
        if (documents.status !== 'ok' || clients.status !== 'ok')
          throw new Error('Load failed');
        setState({
          status: 'ready',
          documents: readDocuments(documents.value),
          clients: readClients(clients.value),
        });
      } catch {
        if (!request.signal.aborted) setState({ status: 'error' });
      }
    })();
    return () => pending.current?.abort();
  }, [
    identity,
    companyId,
    canRead,
    canCorrect,
    actor.workspaceId,
    actor.workspaceMembershipId,
    revision,
  ]);
  async function open(id: string) {
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
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
        setState({ status: 'denied' });
        setMutation('idle');
        return;
      }
      if (result.status !== 'ok') throw new Error('Read failed');
      setDetail(readDocument(result.value));
      setEditing(false);
      setCorrection('idle');
      correctionRetry.current = undefined;
      setMutation('idle');
    } catch {
      if (!request.signal.aborted) setMutation('error');
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
      setState((current) =>
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
        setState({ status: 'denied' });
        setMutation('idle');
        return;
      }
      if (result.status !== 'ok') throw new Error('Registration failed');
      const saved = readDocument(result.value);
      retry.current = undefined;
      setDetail(saved);
      setMutation('idle');
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              documents: [
                saved,
                ...current.documents.filter(
                  (document) => document.id !== saved.id,
                ),
              ],
            }
          : current,
      );
      await onActivityRecorded();
    } catch {
      if (!request.signal.aborted) setMutation('error');
    }
  }
  const normalizedFilterQuery = filterQuery.trim().toLowerCase();
  const filteredDocuments =
    state.status === 'ready'
      ? state.documents.filter(
          (document) =>
            normalizedFilterQuery.length === 0 ||
            document.title.toLowerCase().includes(normalizedFilterQuery) ||
            document.clientDisplayName
              .toLowerCase()
              .includes(normalizedFilterQuery),
        )
      : [];
  return (
    <section
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
                value={filterQuery}
                placeholder={copy.filterPlaceholder}
                onChange={(event) => setFilterQuery(event.target.value)}
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
