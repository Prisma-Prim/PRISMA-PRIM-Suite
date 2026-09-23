import {
  type FormEvent,
  useCallback,
  useContext,
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
import { ClientUnionPanel } from './ClientUnionPanel';
import { clientUnionCopy } from './client-union.copy';
import { ClientDuplicateReviewPanel } from './ClientDuplicateReviewPanel';
import {
  optionalProperty,
  resolveRetryCommand,
  type RetryCommand,
} from './client-command';
import {
  ClientContactEditor,
  normalizedContacts,
  type ClientContactDraft,
} from './ClientContactEditor';
import { clientWorkspaceCopy as copy } from './client-workspace.copy';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { ClientDirectory, type ClientAccountView } from './ClientDirectory';
import { ClientDirectoryFeedback } from './ClientDirectoryFeedback';
import './client-directory.css';

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; clients: ClientAccountView[] }
  | { status: 'forbidden' | 'error' };

type CreateState =
  | { status: 'idle' | 'submitting' | 'success' }
  | {
      status: 'validation';
      message: string;
      field?: 'displayName' | 'contacts';
    }
  | { status: 'forbidden' | 'error' | 'possibleDuplicate' };

type SearchState =
  | { status: 'idle' | 'submitting' }
  | { status: 'ready'; clients: ClientAccountView[] }
  | { status: 'validation' | 'forbidden' | 'error' };

export function ClientWorkspace({
  actor,
  identity,
  onCompanyContextRejected,
  onActorRevalidated = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
  onActivityRecorded,
  onOpenProjects,
  requestedClientDossierRequest,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
  onActivityRecorded: () => Promise<void>;
  onOpenProjects?: (client: { id: string; displayName: string }) => void;
  requestedClientDossierRequest?: {
    clientDossierId: string;
    requestId: number;
  };
}) {
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const registrationTrigger = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isPrisme && registrationOpen) nameInput.current?.focus();
  }, [isPrisme, registrationOpen]);
  const [displayName, setDisplayName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [telephone, setTelephone] = useState('');
  const [generalEmail, setGeneralEmail] = useState('');
  const [contacts, setContacts] = useState<ClientContactDraft[]>([]);
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
  const [duplicateReviewRefreshKey, setDuplicateReviewRefreshKey] = useState(0);
  const [unionRevision, setUnionRevision] = useState(0);
  const [confirmedUnionClientId, setConfirmedUnionClientId] =
    useState<string>();
  const dossierHeading = useRef<HTMLHeadingElement | null>(null);
  const dossierOpeningTrigger = useRef<Element | null>(null);
  const receiveDossierHeading = useCallback(
    (heading: HTMLHeadingElement | null) => {
      dossierHeading.current = heading;
      if (!heading) return;
      const trigger = dossierOpeningTrigger.current;
      dossierOpeningTrigger.current = null;
      if (
        isPrisme &&
        trigger &&
        document.activeElement === trigger &&
        !heading.closest('[hidden]')
      )
        heading.focus();
    },
    [isPrisme],
  );
  function openDossier(clientId: string) {
    setConfirmedUnionClientId(undefined);
    if (isPrisme && clientId === selectedClientId) {
      dossierHeading.current?.focus();
      return;
    }
    dossierOpeningTrigger.current = isPrisme ? document.activeElement : null;
    setSelectedClientId(clientId);
  }
  const retryCommand = useRef<RetryCommand | undefined>(undefined);
  const pendingList = useRef<AbortController | undefined>(undefined);
  const pendingCreate = useRef<AbortController | undefined>(undefined);
  const pendingSearch = useRef<AbortController | undefined>(undefined);
  const pendingAttach = useRef<AbortController | undefined>(undefined);
  const rejectCompanyContext = useRef(onCompanyContextRejected);
  rejectCompanyContext.current = onCompanyContextRejected;
  const acceptRevalidatedActor = useRef(onActorRevalidated);
  acceptRevalidatedActor.current = onActorRevalidated;
  const rejectWorkspaceAccess = useRef(onWorkspaceAccessRejected);
  rejectWorkspaceAccess.current = onWorkspaceAccessRejected;
  const activeCompany = actor.activeCompany;
  const clientPermissions = activeCompany?.clientPermissions ?? [];
  const canReadClients =
    actor.workspacePermissions.includes('client.manage') ||
    clientPermissions.includes('client.read');
  const canCreateClients =
    actor.workspacePermissions.includes('client.manage') ||
    clientPermissions.includes('client.create');
  const canReadClientDossiers = clientPermissions.includes('client.read');
  const canCreateEnrichedClients = clientPermissions.includes('client.create');
  const canUpdateClients = clientPermissions.includes('client.update');
  const canResolveDuplicateClients = clientPermissions.includes(
    'client.duplicate.resolve',
  );
  const canAttachClients = actor.workspacePermissions.includes('client.manage');
  // Access replaces the actor with an equivalent object when the active Company
  // is re-selected or revalidated. Client work outlives such a refresh; it resets
  // when the session, membership, Company or this Client authority changes.
  const clientAuthority = JSON.stringify({
    workspaceClientManagement: canAttachClients,
    clientPermissions,
    assignmentId: activeCompany?.clientPermissionAssignmentId,
    permissionSetVersion: activeCompany?.clientPermissionSetVersion,
  });

  useEffect(() => {
    if (requestedClientDossierRequest && canReadClientDossiers)
      openDossier(requestedClientDossierRequest.clientDossierId);
  }, [requestedClientDossierRequest, canReadClientDossiers]);

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
        onWorkspaceAccessRejected: () => rejectWorkspaceAccess.current(),
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
    setConfirmedUnionClientId(undefined);
    setDuplicateReviewRefreshKey(0);

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
    activeCompany?.id,
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    clientAuthority,
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

    const normalizedClientContacts = canCreateEnrichedClients
      ? normalizedContacts(contacts)
      : [];
    if (!normalizedClientContacts) {
      setCreateState({
        status: 'validation',
        message: copy.contactsInvalid,
        field: 'contacts',
      });
      return;
    }
    const serializedBody = JSON.stringify({
      displayName: normalizedDisplayName,
      ...(canCreateEnrichedClients
        ? {
            ...optionalProperty('taxId', taxId),
            ...optionalProperty('address', address),
            ...optionalProperty('telephone', telephone),
            ...optionalProperty('generalEmail', generalEmail),
            ...(normalizedClientContacts.length > 0
              ? { contacts: normalizedClientContacts }
              : {}),
            ...optionalProperty('businessActivity', businessActivity),
          }
        : {}),
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
        if (
          result.status === 'conflict' &&
          result.reason === 'possibleDuplicateReviewRequired'
        ) {
          setCreateState({ status: 'possibleDuplicate' });
          setDuplicateReviewRefreshKey((current) => current + 1);
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
        setContacts([]);
        setBusinessActivity('');
        setCreateState({ status: 'success' });
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
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.permissionDenied}
        </ClientDirectoryFeedback>
      </section>
    );
  }
  if (!activeCompany) {
    return (
      <section className="client-workspace">
        <ClientDirectoryFeedback>{copy.missingCompany}</ClientDirectoryFeedback>
      </section>
    );
  }

  return (
    <section
      id="clients"
      tabIndex={-1}
      className="client-workspace"
      aria-labelledby="client-workspace-title"
    >
      <div className="client-directory-heading">
        <div className={isPrisme ? 'client-directory-context' : undefined}>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="client-workspace-title">{copy.title}</h2>
          <p>
            {isPrisme
              ? copy.directoryCompany(activeCompany.displayName)
              : copy.description}
          </p>
        </div>
        {isPrisme && canCreateClients && (
          <button
            ref={registrationTrigger}
            type="button"
            aria-expanded={registrationOpen}
            aria-controls="client-registration"
            onClick={() => {
              setRegistrationOpen((open) => !open);
            }}
          >
            {copy.newClient}
          </button>
        )}
      </div>
      {canCreateClients && (
        <div
          id="client-registration"
          className="client-registration"
          hidden={isPrisme && !registrationOpen}
        >
          {isPrisme && (
            <div className="client-registration-heading">
              <div>
                <h3>{copy.registrationTitle}</h3>
                <p>{copy.registrationHint}</p>
              </div>
              <button
                type="button"
                className="client-secondary-action"
                onClick={() => {
                  setRegistrationOpen(false);
                  registrationTrigger.current?.focus();
                }}
              >
                {copy.closeRegistration}
              </button>
            </div>
          )}
          <form onSubmit={(event) => void createClient(event)} noValidate>
            <label htmlFor="client-display-name">{copy.displayNameLabel}</label>
            <div>
              <input
                id="client-display-name"
                ref={nameInput}
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
            {canCreateEnrichedClients && (
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
                <ClientContactEditor
                  contacts={contacts}
                  idPrefix="client-create-contact"
                  invalid={
                    createState.status === 'validation' &&
                    createState.field === 'contacts'
                  }
                  errorId="client-create-validation"
                  onChange={setContacts}
                />
              </div>
            )}
            <button
              type="submit"
              disabled={createState.status === 'submitting'}
            >
              {createState.status === 'submitting'
                ? copy.creating
                : copy.create}
            </button>
          </form>
        </div>
      )}
      {createState.status === 'submitting' && (
        <ClientDirectoryFeedback role="status" tone="pending">
          {copy.creating}
        </ClientDirectoryFeedback>
      )}
      {createState.status === 'success' && (
        <ClientDirectoryFeedback role="status" tone="success">
          {copy.created}
        </ClientDirectoryFeedback>
      )}
      {createState.status === 'validation' && (
        <ClientDirectoryFeedback
          id="client-create-validation"
          role="alert"
          tone="error"
        >
          {createState.message}
        </ClientDirectoryFeedback>
      )}
      {createState.status === 'forbidden' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.permissionDenied}
        </ClientDirectoryFeedback>
      )}
      {createState.status === 'error' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {isPrisme ? copy.createRetry : copy.retryableError}
        </ClientDirectoryFeedback>
      )}
      {createState.status === 'possibleDuplicate' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.possibleDuplicate}
        </ClientDirectoryFeedback>
      )}
      <form
        className="client-directory-search"
        onSubmit={(event) => void searchClients(event)}
        noValidate
      >
        <label htmlFor="client-search">{copy.searchLabel}</label>
        <div>
          <input
            id="client-search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-invalid={searchState.status === 'validation'}
            aria-describedby={
              searchState.status === 'validation'
                ? 'client-search-validation'
                : isPrisme
                  ? 'client-search-hint'
                  : undefined
            }
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
        {isPrisme && (
          <p id="client-search-hint">
            {canAttachClients
              ? copy.workspaceSearchHint
              : copy.companySearchHint}{' '}
            {copy.searchLimitHint}
          </p>
        )}
      </form>
      {isPrisme && searchState.status !== 'idle' && (
        <button
          className="client-secondary-action client-directory-return"
          type="button"
          disabled={attachingClientId !== undefined}
          onClick={() => {
            pendingSearch.current?.abort();
            setSearchState({ status: 'idle' });
            setSearchQuery('');
          }}
        >
          {copy.showCompanyClients}
        </button>
      )}
      {searchState.status === 'submitting' && (
        <ClientDirectoryFeedback role="status" tone="pending">
          {copy.searching}
        </ClientDirectoryFeedback>
      )}
      {searchState.status === 'validation' && (
        <ClientDirectoryFeedback
          id="client-search-validation"
          role="alert"
          tone="error"
        >
          {copy.searchRequired}
        </ClientDirectoryFeedback>
      )}
      {searchState.status === 'forbidden' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.permissionDenied}
        </ClientDirectoryFeedback>
      )}
      {searchState.status === 'error' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.retryableError}
        </ClientDirectoryFeedback>
      )}
      {searchState.status === 'ready' && searchState.clients.length === 0 && (
        <ClientDirectoryFeedback>
          {copy.noSearchResults}
        </ClientDirectoryFeedback>
      )}
      {searchState.status === 'ready' && searchState.clients.length > 0 && (
        <section aria-labelledby="client-search-results-title">
          <h3 id="client-search-results-title">{copy.searchResultsTitle}</h3>
          {isPrisme ? (
            <ClientDirectory
              clients={searchState.clients}
              companyName={activeCompany.displayName}
              onOpenDossier={canReadClientDossiers ? openDossier : undefined}
              onAttach={
                canAttachClients ? (id) => void attachClient(id) : undefined
              }
              attachingClientId={attachingClientId}
            />
          ) : (
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
          )}
        </section>
      )}
      {(!isPrisme || searchState.status === 'idle') && (
        <>
          {listState.status === 'loading' && (
            <ClientDirectoryFeedback role="status" tone="pending">
              {copy.loading}
            </ClientDirectoryFeedback>
          )}
          {listState.status === 'forbidden' && (
            <ClientDirectoryFeedback role="alert" tone="error">
              {copy.permissionDenied}
            </ClientDirectoryFeedback>
          )}
          {listState.status === 'error' && (
            <ClientDirectoryFeedback role="alert" tone="error">
              {copy.retryableError}
            </ClientDirectoryFeedback>
          )}
          {listState.status === 'ready' && listState.clients.length === 0 && (
            <ClientDirectoryFeedback>
              {copy.empty(activeCompany.displayName)}
            </ClientDirectoryFeedback>
          )}
          {listState.status === 'ready' &&
            listState.clients.length > 0 &&
            (isPrisme ? (
              <ClientDirectory
                clients={listState.clients}
                companyName={activeCompany.displayName}
                onOpenDossier={canReadClientDossiers ? openDossier : undefined}
                attachingClientId={attachingClientId}
              />
            ) : (
              <ol className="client-list">
                {listState.clients.map((client) => (
                  <li key={client.id}>
                    <h3>{client.displayName}</h3>
                    <p>{copy.clientId(client.id)}</p>
                    {canReadClientDossiers && (
                      <button
                        type="button"
                        onClick={() => openDossier(client.id)}
                      >
                        {copy.openDossier}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            ))}
        </>
      )}
      {canResolveDuplicateClients && (
        <ClientDuplicateReviewPanel
          key={`${actor.internalUserId}:${actor.workspaceId}:${actor.workspaceMembershipId}`}
          companyContextId={activeCompany.id}
          identity={identity}
          canAttach={canAttachClients}
          refreshKey={duplicateReviewRefreshKey}
          authorityGeneration={`${activeCompany.clientPermissionAssignmentId ?? 'no-assignment'}:${activeCompany.clientPermissionSetVersion ?? 'no-version'}`}
          onCompanyContextRejected={onCompanyContextRejected}
          onWorkspaceAccessRejected={onWorkspaceAccessRejected}
          onActorRevalidated={onActorRevalidated}
          onActivityRecorded={onActivityRecorded}
          onClientsChanged={() => loadClients(activeCompany.id)}
        />
      )}
      {canReadClientDossiers &&
        confirmedUnionClientId !== undefined &&
        confirmedUnionClientId === selectedClientId && (
          <ClientDirectoryFeedback role="status" tone="success">
            {clientUnionCopy.saved}
          </ClientDirectoryFeedback>
        )}
      {canReadClientDossiers && (
        <ClientDossierPanel
          key={`${selectedClientId ?? ''}:${unionRevision}`}
          clientAccountId={selectedClientId}
          onHeadingReady={receiveDossierHeading}
          onOpenProjects={onOpenProjects}
          companyContextId={activeCompany.id}
          canUpdate={canUpdateClients}
          identity={identity}
          onCompanyContextRejected={onCompanyContextRejected}
          onWorkspaceAccessRejected={onWorkspaceAccessRejected}
          onActorRevalidated={onActorRevalidated}
          onActivityRecorded={onActivityRecorded}
          onClientsChanged={() => loadClients(activeCompany.id)}
          onDuplicateReviewRequired={() =>
            setDuplicateReviewRefreshKey((current) => current + 1)
          }
        />
      )}
      {canReadClientDossiers && (
        <ClientUnionPanel
          key={`${actor.workspaceMembershipId}:${activeCompany.id}:${selectedClientId}`}
          clientId={selectedClientId}
          companyContextId={activeCompany.id}
          identity={identity}
          canResolve={canResolveDuplicateClients}
          onConfirmed={setConfirmedUnionClientId}
          onCompanyContextRejected={onCompanyContextRejected}
          onWorkspaceAccessRejected={onWorkspaceAccessRejected}
          onActorRevalidated={onActorRevalidated}
          onChanged={async (canonicalClientId) => {
            if (canonicalClientId) setSelectedClientId(canonicalClientId);
            else setConfirmedUnionClientId(undefined);
            setUnionRevision((revision) => revision + 1);
            await Promise.all([
              loadClients(activeCompany.id),
              onActivityRecorded(),
            ]);
          }}
        />
      )}
    </section>
  );
}
