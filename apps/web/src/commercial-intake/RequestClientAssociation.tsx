import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { Select } from '../presentation/Select';
import { commercialIntakeCopy as copy } from './commercial-intake.copy';

type HttpResult = { status: number; body: unknown } | { status: 'network' };

export type CommercialIntakeRequest = (input: {
  path: string;
  companyContextId: string;
  signal: AbortSignal;
  method?: 'GET' | 'POST';
  body?: string;
  idempotencyKey?: string;
}) => Promise<HttpResult>;

export type CommercialIntakeAccessHandler = (
  result: HttpResult,
  companyContextId: string,
  signal: AbortSignal,
  resource: 'client-search' | 'client-association',
) => Promise<'ok' | 'retained' | 'rejected'>;

type ClientChoice = {
  id: string;
  displayName: string;
  relatedToActiveCompany: boolean;
};

type SearchState =
  | { kind: 'idle' | 'loading' | 'validation' | 'denied' | 'error' }
  | { kind: 'ready'; clients: ClientChoice[] };

type AssociationState =
  | 'idle'
  | 'validation'
  | 'loading'
  | 'success'
  | 'unavailable'
  | 'stale'
  | 'already-associated'
  | 'denied'
  | 'uncertain'
  | 'error';

type Retry = { payload: string; key: string; identityRevision: number };

export function RequestClientAssociation({
  identity,
  companyId,
  requestId,
  expectedVersion,
  clientIdentityRevision = 0,
  request,
  handleAccess,
  onAssociated,
}: {
  identity: BrowserIdentity;
  companyId: string;
  requestId: string;
  expectedVersion: number;
  clientIdentityRevision?: number;
  request: CommercialIntakeRequest;
  handleAccess: CommercialIntakeAccessHandler;
  onAssociated: (
    value: unknown,
    identityRevision: number,
  ) => Promise<boolean> | boolean;
}) {
  const [query, setQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });
  const [association, setAssociation] = useState<AssociationState>('idle');
  const searchRequest = useRef<AbortController | undefined>(undefined);
  const associationRequest = useRef<AbortController | undefined>(undefined);
  const retry = useRef<Retry | undefined>(undefined);

  useEffect(() => {
    setQuery('');
    setSelectedClientId('');
    setSearch({ kind: 'idle' });
    setAssociation('idle');
    retry.current = undefined;
    return () => {
      searchRequest.current?.abort();
      associationRequest.current?.abort();
      retry.current = undefined;
    };
  }, [companyId, identity, requestId, clientIdentityRevision]);

  async function searchClients(): Promise<void> {
    const trimmed = query.trim();
    setSelectedClientId('');
    if (!trimmed) {
      setSearch({ kind: 'validation' });
      return;
    }
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearch({ kind: 'loading' });
    try {
      const result = await request({
        path: `/clients/search?query=${encodeURIComponent(trimmed)}`,
        companyContextId: companyId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const access = await handleAccess(
        result,
        companyId,
        controller.signal,
        'client-search',
      );
      if (controller.signal.aborted || access === 'rejected') return;
      if (access === 'retained') {
        setSearch({ kind: 'denied' });
        return;
      }
      setSearch(
        result.status === 200 && isClientChoices(result.body)
          ? {
              kind: 'ready',
              clients: result.body.filter(
                (client) => client.relatedToActiveCompany,
              ),
            }
          : { kind: 'error' },
      );
    } catch {
      if (!controller.signal.aborted) setSearch({ kind: 'error' });
    }
  }

  async function associate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedClientId && !retry.current) {
      setAssociation('validation');
      return;
    }
    const command =
      retry.current ??
      ({
        payload: JSON.stringify({
          expectedVersion,
          clientAccountId: selectedClientId,
        }),
        key: crypto.randomUUID(),
        identityRevision: clientIdentityRevision,
      } satisfies Retry);
    retry.current = command;
    associationRequest.current?.abort();
    const controller = new AbortController();
    associationRequest.current = controller;
    setAssociation('loading');
    try {
      const result = await request({
        path: `/commercial-intake/requests/${encodeURIComponent(requestId)}/client-association`,
        companyContextId: companyId,
        signal: controller.signal,
        method: 'POST',
        body: command.payload,
        idempotencyKey: command.key,
      });
      if (controller.signal.aborted) return;
      const access = await handleAccess(
        result,
        companyId,
        controller.signal,
        'client-association',
      );
      if (controller.signal.aborted || access === 'rejected') return;
      if (access === 'retained') {
        retry.current = undefined;
        setAssociation('denied');
        return;
      }
      if (
        result.status === 200 &&
        isAssociationResult(result.body, {
          companyId,
          requestId,
          version: expectedVersion + 1,
        })
      ) {
        const accepted = await onAssociated(
          result.body.request,
          command.identityRevision,
        );
        if (controller.signal.aborted) return;
        if (!accepted) {
          retry.current = undefined;
          setAssociation('error');
          return;
        }
        retry.current = undefined;
        setAssociation('success');
        return;
      }
      if (result.status === 'network') {
        setAssociation('uncertain');
        return;
      }
      const code = errorCode(result.body);
      if (result.status === 404 && code === 'CLIENT_REFERENCE_UNAVAILABLE') {
        retry.current = undefined;
        setAssociation('unavailable');
        return;
      }
      if (result.status === 409 && code === 'STALE_VERSION') {
        retry.current = undefined;
        setAssociation('stale');
        return;
      }
      if (result.status === 409 && code === 'CLIENT_ALREADY_ASSOCIATED') {
        retry.current = undefined;
        setAssociation('already-associated');
        return;
      }
      if (result.status === 400 || result.status === 404) {
        retry.current = undefined;
        setAssociation('error');
        return;
      }
      if (result.status >= 500) {
        setAssociation('uncertain');
        return;
      }
      retry.current = undefined;
      setAssociation('error');
    } catch {
      if (!controller.signal.aborted) setAssociation('uncertain');
    }
  }

  const waiting = association === 'loading';
  const uncertain = association === 'uncertain';
  return (
    <section
      className="commercial-intake-client-association"
      aria-labelledby="commercial-intake-client-association-title"
    >
      <h4 id="commercial-intake-client-association-title">
        {copy.associateClient}
      </h4>
      <div className="commercial-intake-field">
        <label htmlFor="commercial-intake-association-client-search">
          {copy.clientSearch}
        </label>
        <input
          id="commercial-intake-association-client-search"
          value={query}
          maxLength={200}
          disabled={waiting || uncertain}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedClientId('');
            setSearch({ kind: 'idle' });
            setAssociation('idle');
          }}
        />
        <button
          type="button"
          disabled={search.kind === 'loading' || waiting || uncertain}
          onClick={() => void searchClients()}
        >
          {copy.searchClients}
        </button>
        {search.kind === 'ready' ? (
          search.clients.length > 0 ? (
            <>
              <label htmlFor="commercial-intake-association-client">
                {copy.existingClient}
              </label>
              <Select
                id="commercial-intake-association-client"
                value={selectedClientId}
                options={search.clients.map((client) => ({
                  value: client.id,
                  label: client.displayName,
                }))}
                placeholder={copy.noClient}
                disabled={waiting || uncertain}
                onValueChange={(value) => {
                  setSelectedClientId(value);
                  setAssociation('idle');
                }}
              />
            </>
          ) : (
            <p>{copy.clientSearchEmpty}</p>
          )
        ) : search.kind === 'validation' ? (
          <p role="alert">{copy.clientSearchValidation}</p>
        ) : search.kind === 'denied' ? (
          <p role="alert">{copy.clientSearchDenied}</p>
        ) : search.kind === 'error' ? (
          <p role="alert">{copy.clientSearchError}</p>
        ) : search.kind === 'loading' ? (
          <p role="status">{copy.clientSearchLoading}</p>
        ) : null}
      </div>
      <form onSubmit={(event) => void associate(event)}>
        <button type="submit" disabled={waiting}>
          {uncertain
            ? copy.retryClientAssociation
            : copy.confirmClientAssociation}
        </button>
      </form>
      {association === 'validation' ? (
        <p role="alert">{copy.clientAssociationValidation}</p>
      ) : association === 'loading' ? (
        <p role="status">{copy.clientAssociationLoading}</p>
      ) : association === 'success' ? (
        <p role="status">{copy.clientAssociationSuccess}</p>
      ) : association === 'unavailable' ? (
        <p role="alert">{copy.unavailableClient}</p>
      ) : association === 'stale' ? (
        <p role="alert">{copy.clientAssociationStale}</p>
      ) : association === 'already-associated' ? (
        <p role="alert">{copy.clientAlreadyAssociated}</p>
      ) : association === 'denied' ? (
        <p role="alert">{copy.clientAssociationDenied}</p>
      ) : association === 'uncertain' ? (
        <p role="alert">{copy.clientAssociationUncertain}</p>
      ) : association === 'error' ? (
        <p role="alert">{copy.clientAssociationError}</p>
      ) : null}
    </section>
  );
}

function isClientChoices(value: unknown): value is ClientChoice[] {
  return (
    Array.isArray(value) &&
    value.every(
      (client) =>
        isRecord(client) &&
        typeof client.id === 'string' &&
        typeof client.displayName === 'string' &&
        typeof client.relatedToActiveCompany === 'boolean',
    )
  );
}

function isAssociationResult(
  value: unknown,
  expected: { companyId: string; requestId: string; version: number },
): value is { receipt: Record<string, unknown>; request: unknown } {
  return (
    isRecord(value) &&
    isRecord(value.receipt) &&
    value.receipt.requestId === expected.requestId &&
    value.receipt.version === expected.version &&
    value.receipt.outcome === 'associated' &&
    isRecord(value.request) &&
    value.request.id === expected.requestId &&
    value.request.companyId === expected.companyId &&
    value.request.version === expected.version
  );
}

function errorCode(value: unknown): string | undefined {
  return isRecord(value) && typeof value.code === 'string'
    ? value.code
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
