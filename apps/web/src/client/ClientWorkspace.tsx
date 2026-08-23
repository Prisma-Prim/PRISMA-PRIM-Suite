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
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import { ClientDossierPanel } from './ClientDossierPanel';
import {
  optionalProperty,
  resolveRetryCommand,
  type RetryCommand,
} from './client-command';
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
  | {
      status: 'validation';
      message: string;
      field?: 'displayName' | 'contactName';
    }
  | { status: 'forbidden' | 'error' };

type SearchState =
  | { status: 'idle' | 'submitting' }
  | { status: 'ready'; clients: ClientAccountView[] }
  | { status: 'validation' | 'forbidden' | 'error' };

export function ClientWorkspace({
  actor,
  identity,
  onCompanyContextRejected,
  onActorRevalidated = () => undefined,
  onActivityRecorded,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onActivityRecorded: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [telephone, setTelephone] = useState('');
  const [generalEmail, setGeneralEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactTelephone, setContactTelephone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [businessActivity, setBusinessActivity] = useState('');
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
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(
    undefined,
  );
  const retryCommand = useRef<RetryCommand | undefined>(undefined);
  const pendingList = useRef<AbortController | undefined>(undefined);
  const pendingCreate = useRef<AbortController | undefined>(undefined);
  const pendingSearch = useRef<AbortController | undefined>(undefined);
  const pendingAttach = useRef<AbortController | undefined>(undefined);
  const rejectCompanyContext = useRef(onCompanyContextRejected);
  rejectCompanyContext.current = onCompanyContextRejected;
  const acceptRevalidatedActor = useRef(onActorRevalidated);
  acceptRevalidatedActor.current = onActorRevalidated;
  const activeCompany = actor.activeCompany;
  const clientPermissions = activeCompany?.clientPermissions ?? [];
  const canReadClients =
    actor.workspacePermissions.includes('client.manage') ||
    clientPermissions.includes('client.read');
  const canCreateClients =
    actor.workspacePermissions.includes('client.manage') ||
    clientPermissions.includes('client.create');
  const canUpdateClients = clientPermissions.includes('client.update');
  const canAttachClients = actor.workspacePermissions.includes('client.manage');

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
        onActorRevalidated: (revalidatedActor) =>
          acceptRevalidatedActor.current(revalidatedActor),
        signal,
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
    setSelectedClientId(undefined);

    if (!canReadClients || !activeCompany) return;
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
    canReadClients,
    loadClients,
  ]);

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCompany || !canCreateClients) return;
    const normalizedDisplayName = displayName.trim();
    if (!normalizedDisplayName) {
      setCreateState({
        status: 'validation',
        message: copy.displayNameRequired,
        field: 'displayName',
      });
      return;
    }

    const contactAttempted = Boolean(
      contactName.trim() || contactTelephone.trim() || contactEmail.trim(),
    );
    if (contactAttempted && !contactName.trim()) {
      setCreateState({
        status: 'validation',
        message: copy.contactNameRequired,
        field: 'contactName',
      });
      return;
    }

    const contact = contactAttempted
      ? {
          name: contactName.trim(),
          ...optionalProperty('telephone', contactTelephone),
          ...optionalProperty('email', contactEmail),
        }
      : undefined;
    const serializedBody = JSON.stringify({
      displayName: normalizedDisplayName,
      ...optionalProperty('taxId', taxId),
      ...optionalProperty('address', address),
      ...optionalProperty('telephone', telephone),
      ...optionalProperty('generalEmail', generalEmail),
      ...(contact ? { contacts: [contact] } : {}),
      ...optionalProperty('businessActivity', businessActivity),
    });
    const command = resolveRetryCommand(serializedBody, retryCommand.current);

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
          body: command.serializedBody,
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
        setTaxId('');
        setAddress('');
        setTelephone('');
        setGeneralEmail('');
        setContactName('');
        setContactTelephone('');
        setContactEmail('');
        setBusinessActivity('');
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
    if (!activeCompany || !canAttachClients) return;
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

  if (!canReadClients) {
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
      {canCreateClients && (
        <form onSubmit={(event) => void createClient(event)} noValidate>
          <label htmlFor="client-display-name">{copy.displayNameLabel}</label>
          <div>
            <input
              id="client-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              aria-invalid={
                createState.status === 'validation' &&
                createState.field === 'displayName'
              }
              aria-describedby={
                createState.status === 'validation' &&
                createState.field === 'displayName'
                  ? 'client-create-validation'
                  : undefined
              }
            />
          </div>
          <div className="client-dossier-fields">
            <label htmlFor="client-tax-id">{copy.taxIdLabel}</label>
            <input
              id="client-tax-id"
              value={taxId}
              onChange={(event) => setTaxId(event.target.value)}
            />
            <label htmlFor="client-address">{copy.addressLabel}</label>
            <input
              id="client-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
            <label htmlFor="client-telephone">{copy.telephoneLabel}</label>
            <input
              id="client-telephone"
              value={telephone}
              onChange={(event) => setTelephone(event.target.value)}
            />
            <label htmlFor="client-general-email">
              {copy.generalEmailLabel}
            </label>
            <input
              id="client-general-email"
              type="email"
              value={generalEmail}
              onChange={(event) => setGeneralEmail(event.target.value)}
            />
            <label htmlFor="client-business-activity">
              {copy.businessActivityLabel}
            </label>
            <input
              id="client-business-activity"
              value={businessActivity}
              onChange={(event) => setBusinessActivity(event.target.value)}
            />
            <label htmlFor="client-contact-name">{copy.contactNameLabel}</label>
            <input
              id="client-contact-name"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              aria-invalid={
                createState.status === 'validation' &&
                createState.field === 'contactName'
              }
              aria-describedby={
                createState.status === 'validation' &&
                createState.field === 'contactName'
                  ? 'client-create-validation'
                  : undefined
              }
            />
            <label htmlFor="client-contact-telephone">
              {copy.contactTelephoneLabel}
            </label>
            <input
              id="client-contact-telephone"
              value={contactTelephone}
              onChange={(event) => setContactTelephone(event.target.value)}
            />
            <label htmlFor="client-contact-email">
              {copy.contactEmailLabel}
            </label>
            <input
              id="client-contact-email"
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
            />
          </div>
          <button type="submit" disabled={createState.status === 'submitting'}>
            {createState.status === 'submitting' ? copy.creating : copy.create}
          </button>
        </form>
      )}
      {createState.status === 'validation' && (
        <p id="client-create-validation" role="alert">
          {createState.message}
        </p>
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
                ) : canAttachClients ? (
                  <button
                    type="button"
                    disabled={attachingClientId !== undefined}
                    onClick={() => void attachClient(client.id)}
                  >
                    {copy.addToCompany(activeCompany.displayName)}
                  </button>
                ) : (
                  <p>{copy.notAvailableInCompany}</p>
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
              <button
                type="button"
                onClick={() => setSelectedClientId(client.id)}
              >
                {copy.openDossier}
              </button>
            </li>
          ))}
        </ol>
      )}
      <ClientDossierPanel
        clientAccountId={selectedClientId}
        companyContextId={activeCompany.id}
        canUpdate={canUpdateClients}
        identity={identity}
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onActivityRecorded={onActivityRecorded}
        onClientsChanged={() => loadClients(activeCompany.id)}
      />
    </section>
  );
}
