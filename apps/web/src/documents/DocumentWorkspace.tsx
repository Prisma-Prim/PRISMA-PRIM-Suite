import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import {
  readClients,
  readDocument,
  readDocuments,
  type WorkingDocument,
} from './document-response';
import { documentsCopy as copy } from './documents.copy';
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
  const [state, setState] = useState<Load>({ status: 'loading' });
  const [detail, setDetail] = useState<WorkingDocument>();
  const [revision, setRevision] = useState(0);
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [url, setUrl] = useState('');
  const [mutation, setMutation] = useState<'idle' | 'pending' | 'error'>(
    'idle',
  );
  const pending = useRef<AbortController | undefined>(undefined);
  const retry = useRef<{ payload: string; key: string } | undefined>(undefined);
  const companyId = actor.activeCompany?.id;
  const canRead =
    actor.activeCompany?.documentPermissions?.includes('document.read') ===
    true;
  const canRegister =
    actor.activeCompany?.documentPermissions?.includes('document.register') ===
    true;
  useEffect(() => {
    setDetail(undefined);
    setClientId('');
    setTitle('');
    setPurpose('');
    setUrl('');
    setMutation('idle');
    retry.current = undefined;
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
      setMutation('idle');
    } catch {
      if (!request.signal.aborted) setMutation('error');
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
  return (
    <section className="working-documents" aria-label={copy.title}>
      <h2>{copy.title}</h2>
      <p>{actor.activeCompany?.displayName}</p>
      <p>{copy.warning}</p>
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
          {detail ? (
            <article>
              <h3>{detail.title}</h3>
              <p>{copy.draft}</p>
              <p>{detail.clientDisplayName}</p>
              <p>{detail.purpose}</p>
              {detail.version.representation.access === 'granted' ? (
                <a
                  href={detail.version.representation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {copy.open}
                </a>
              ) : (
                <p>{copy.referenceDenied}</p>
              )}
              <button onClick={() => setDetail(undefined)}>{copy.back}</button>
            </article>
          ) : (
            <>
              <ul>
                {state.documents.map((document) => (
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
                <form onSubmit={(event) => void submit(event)}>
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
                  <button disabled={mutation === 'pending'}>
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
