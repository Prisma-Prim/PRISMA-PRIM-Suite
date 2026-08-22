import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import type { ApiResult } from '../api/authenticated-api-client';
import {
  resolveIdempotentDisplayNameCommand,
  type IdempotentDisplayNameCommand,
} from '../api/idempotent-display-name-command';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import { clientWorkspaceCopy as copy } from './client-workspace.copy';

interface ClientAccountView {
  id: string;
  displayName: string;
  relatedToActiveCompany: boolean;
}

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; clients: ClientAccountView[] }
  | { status: 'forbidden' | 'error' };

type CreateState =
  | { status: 'idle' | 'submitting' }
  | { status: 'validation'; message: string }
  | { status: 'forbidden' | 'error' };

type SearchState =
  | { status: 'idle' | 'submitting' }
  | { status: 'ready'; clients: ClientAccountView[] }
  | { status: 'validation' | 'forbidden' | 'error' };

export function ClientWorkspace({
  actor,
  identity,
  onCompanyContextRejected,
  onActivityRecorded,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActivityRecorded: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [listState, setListState] = useState<ListState>({ status: 'loading' });
  const [createState, setCreateState] = useState<CreateState>({
    status: 'idle',
  });
  const [searchState, setSearchState] = useState<SearchState>({
    status: 'idle',
  });
  const [attachingClientId, setAttachingClientId] = useState<
    string | undefined
  >(undefined);
  const retryCommand = useRef<IdempotentDisplayNameCommand | undefined>(
    undefined,
  );
  const pendingList = useRef<AbortController | undefined>(undefined);
  const pendingCreate = useRef<AbortController | undefined>(undefined);
  const pendingSearch = useRef<AbortController | undefined>(undefined);
  const pendingAttach = useRef<AbortController | undefined>(undefined);
  const rejectCompanyContext = useRef(onCompanyContextRejected);
  rejectCompanyContext.current = onCompanyContextRejected;
  const canManageClients = actor.workspacePermissions.includes('client.manage');
  const activeCompany = actor.activeCompany;

  const handleAccessRejection = useCallback(
    async (
      result: ApiResult<unknown>,
      companyContextId: string,
      signal: AbortSignal,
    ): Promise<boolean> => {
      if (signal.aborted) return true;
      const rejection = await handleAuthenticatedAccessRejection({
        result,
        identity,
        companyContextId,
        onCompanyContextRejected: (rejectedCompanyId) =>
          rejectCompanyContext.current(rejectedCompanyId),
      });
      if (signal.aborted) return true;
      if (!rejection) return false;
      setListState({
        status: rejection === 'forbidden' ? 'forbidden' : 'error',
      });
      return true;
    },
    [identity],
  );

  const loadClients = useCallback(
    async (companyContextId: string): Promise<void> => {
      await runLatestAuthenticatedRequest({
        pending: pendingList,
        identity,
        execute: (api, signal) =>
          api.request<ClientAccountView[]>('/clients', {
            companyContextId,
            signal,
          }),
        async onResult(result, signal) {
          if (await handleAccessRejection(result, companyContextId, signal))
            return;
          setListState(
            result.status === 'ok'
              ? { status: 'ready', clients: result.value }
              : { status: 'error' },
          );
        },
        onError: () => setListState({ status: 'error' }),
      });
    },
    [handleAccessRejection, identity],
  );

  useEffect(() => {
    pendingList.current?.abort();
    pendingCreate.current?.abort();
    pendingSearch.current?.abort();
    pendingAttach.current?.abort();
    retryCommand.current = undefined;
    setCreateState({ status: 'idle' });
    setSearchState({ status: 'idle' });
    setAttachingClientId(undefined);

    if (!canManageClients || !activeCompany) return;
    const companyContextId = activeCompany.id;
    setListState({ status: 'loading' });

    void loadClients(companyContextId);
    return () => {
      pendingList.current?.abort();
      pendingCreate.current?.abort();
      pendingSearch.current?.abort();
      pendingAttach.current?.abort();
    };
  }, [
    activeCompany,
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    canManageClients,
    loadClients,
  ]);

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCompany) return;
    const command = resolveIdempotentDisplayNameCommand(
      displayName,
      retryCommand.current,
    );
    if (!command) {
      setCreateState({
        status: 'validation',
        message: copy.displayNameRequired,
      });
      return;
    }

    retryCommand.current = command;
    setCreateState({ status: 'submitting' });
    await runLatestAuthenticatedRequest({
      pending: pendingCreate,
      identity,
      execute: (api, signal) =>
        api.request<ClientAccountView>('/clients', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.idempotencyKey,
          },
          companyContextId: activeCompany.id,
          body: JSON.stringify({ displayName: command.displayName }),
          signal,
        }),
      async onResult(result, signal) {
        if (await handleAccessRejection(result, activeCompany.id, signal)) {
          if (!signal.aborted) setCreateState({ status: 'forbidden' });
          return;
        }
        if (signal.aborted) return;
        if (result.status === 'validation') {
          setCreateState({
            status: 'validation',
            message: result.message ?? copy.displayNameRequired,
          });
          return;
        }
        if (result.status !== 'ok') {
          setCreateState({ status: 'error' });
          return;
        }
        retryCommand.current = undefined;
        setDisplayName('');
        setCreateState({ status: 'idle' });
        void onActivityRecorded();
        await loadClients(activeCompany.id);
      },
      onError: () => setCreateState({ status: 'error' }),
    });
  }

  async function searchClients(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCompany || attachingClientId) return;
    const query = searchQuery.trim();
    if (!query) {
      setSearchState({ status: 'validation' });
      return;
    }
    setSearchState({ status: 'submitting' });
    await runLatestAuthenticatedRequest({
      pending: pendingSearch,
      identity,
      execute: (api, signal) =>
        api.request<ClientAccountView[]>(
          `/clients/search?query=${encodeURIComponent(query)}`,
          { companyContextId: activeCompany.id, signal },
        ),
      async onResult(result, signal) {
        if (await handleAccessRejection(result, activeCompany.id, signal)) {
          if (!signal.aborted) setSearchState({ status: 'forbidden' });
          return;
        }
        if (signal.aborted) return;
        setSearchState(
          result.status === 'ok'
            ? { status: 'ready', clients: result.value }
            : result.status === 'validation'
              ? { status: 'validation' }
              : { status: 'error' },
        );
      },
      onError: () => setSearchState({ status: 'error' }),
    });
  }

  async function attachClient(clientAccountId: string) {
    if (!activeCompany) return;
    setAttachingClientId(clientAccountId);
    await runLatestAuthenticatedRequest({
      pending: pendingAttach,
      identity,
      execute: (api, signal) =>
        api.request<ClientAccountView>(
          `/clients/${encodeURIComponent(clientAccountId)}/active-company-relationship`,
          {
            method: 'PUT',
            companyContextId: activeCompany.id,
            signal,
          },
        ),
      async onResult(result, signal) {
        if (await handleAccessRejection(result, activeCompany.id, signal)) {
          if (!signal.aborted) setSearchState({ status: 'forbidden' });
          return;
        }
        if (signal.aborted) return;
        if (result.status !== 'ok') {
          setSearchState({ status: 'error' });
          return;
        }
        setSearchState((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                clients: current.clients.map((client) =>
                  client.id === result.value.id ? result.value : client,
                ),
              }
            : current,
        );
        void onActivityRecorded();
        await loadClients(activeCompany.id);
      },
      onError: () => setSearchState({ status: 'error' }),
      onSettled: () => setAttachingClientId(undefined),
    });
  }

  if (!canManageClients) {
    return (
      <section className="client-workspace">
        <p role="alert">{copy.permissionDenied}</p>
      </section>
    );
  }
  if (!activeCompany) {
    return (
      <section className="client-workspace">
        <p>{copy.missingCompany}</p>
      </section>
    );
  }

  return (
    <section
      id="clients"
      className="client-workspace"
      aria-labelledby="client-workspace-title"
    >
      <div>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 id="client-workspace-title">{copy.title}</h2>
        <p>{copy.description}</p>
      </div>
      <form onSubmit={(event) => void createClient(event)} noValidate>
        <label htmlFor="client-display-name">{copy.displayNameLabel}</label>
        <div>
          <input
            id="client-display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            aria-invalid={createState.status === 'validation'}
          />
          <button type="submit" disabled={createState.status === 'submitting'}>
            {createState.status === 'submitting' ? copy.creating : copy.create}
          </button>
        </div>
      </form>
      {createState.status === 'validation' && (
        <p role="alert">{createState.message}</p>
      )}
      {createState.status === 'forbidden' && (
        <p role="alert">{copy.permissionDenied}</p>
      )}
      {createState.status === 'error' && (
        <p role="alert">{copy.retryableError}</p>
      )}
      <form onSubmit={(event) => void searchClients(event)} noValidate>
        <label htmlFor="client-search">{copy.searchLabel}</label>
        <div>
          <input
            id="client-search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-invalid={searchState.status === 'validation'}
          />
          <button
            type="submit"
            disabled={
              searchState.status === 'submitting' ||
              attachingClientId !== undefined
            }
          >
            {searchState.status === 'submitting' ? copy.searching : copy.search}
          </button>
        </div>
      </form>
      {searchState.status === 'validation' && (
        <p role="alert">{copy.searchRequired}</p>
      )}
      {searchState.status === 'forbidden' && (
        <p role="alert">{copy.permissionDenied}</p>
      )}
      {searchState.status === 'error' && (
        <p role="alert">{copy.retryableError}</p>
      )}
      {searchState.status === 'ready' && searchState.clients.length === 0 && (
        <p>{copy.noSearchResults}</p>
      )}
      {searchState.status === 'ready' && searchState.clients.length > 0 && (
        <section aria-labelledby="client-search-results-title">
          <h3 id="client-search-results-title">{copy.searchResultsTitle}</h3>
          <ol className="client-search-results">
            {searchState.clients.map((client) => (
              <li key={client.id}>
                <h4>{client.displayName}</h4>
                <p>{copy.clientId(client.id)}</p>
                {client.relatedToActiveCompany ? (
                  <p>{copy.availableInCompany(activeCompany.displayName)}</p>
                ) : (
                  <button
                    type="button"
                    disabled={attachingClientId !== undefined}
                    onClick={() => void attachClient(client.id)}
                  >
                    {copy.addToCompany(activeCompany.displayName)}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      {listState.status === 'loading' && <p role="status">{copy.loading}</p>}
      {listState.status === 'forbidden' && (
        <p role="alert">{copy.permissionDenied}</p>
      )}
      {listState.status === 'error' && (
        <p role="alert">{copy.retryableError}</p>
      )}
      {listState.status === 'ready' && listState.clients.length === 0 && (
        <p>{copy.empty(activeCompany.displayName)}</p>
      )}
      {listState.status === 'ready' && listState.clients.length > 0 && (
        <ol className="client-list">
          {listState.clients.map((client) => (
            <li key={client.id}>
              <h3>{client.displayName}</h3>
              <p>{copy.clientId(client.id)}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
