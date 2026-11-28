import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { grantOf } from '../access/company-grants';
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
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
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import {
  useScopedOperation,
  useScopedOperationGroup,
} from '../api/use-scoped-operation';
import {
  optionalProperty,
  resolveRetryCommand,
  type RetryCommand,
} from './client-command';
import {
  normalizedContacts,
  type ClientContactDraft,
  type ClientContactDraftResult,
} from './ClientContactEditor';
import {
  clientRegistrationValidationIssue,
  type ClientRegistrationValidationIssue,
} from './client-registration.copy';
import {
  readClientAccountList,
  readClientAccountView,
  type ClientAccountView,
} from './client-account-response';

export type ClientListState =
  | { status: 'loading' }
  | { status: 'ready'; clients: ClientAccountView[] }
  | { status: 'forbidden' | 'error' };

export type ClientRegistrationState =
  | { status: 'idle' | 'submitting' | 'success' }
  | {
      status: 'validation';
      issue: ClientRegistrationValidationIssue;
      field?: 'displayName' | 'contacts';
    }
  | { status: 'forbidden' | 'error' | 'possibleDuplicate' };

export type ClientSearchState =
  | { status: 'idle' | 'submitting' }
  | { status: 'ready'; clients: ClientAccountView[] }
  | { status: 'validation' | 'forbidden' | 'error' };

/** The fields of one Client registration draft, as the member typed them. */
export type ClientRegistrationDraft = Readonly<{
  displayName: string;
  taxId: string;
  address: string;
  telephone: string;
  generalEmail: string;
  contacts: ClientContactDraft[];
  businessActivity: string;
}>;

/** A Client the dossier links hand to App's navigation intents. */
export type ClientLinkTarget = { id: string; displayName: string };

/**
 * What App composes for the Clients section, in either interface: the actor
 * and its access callbacks, and the cross-links and embedded overviews of
 * the other owners.
 */
export type ClientWorkspaceProps = {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
  onActivityRecorded: () => Promise<void>;
  onOpenProjects?: (client: ClientLinkTarget) => void;
  onOpenDocuments?: (client: ClientLinkTarget) => void;
  onOpenRequests?: (client: ClientLinkTarget) => void;
  renderCommercialWork?: (clientDossierId: string) => ReactNode;
  renderMissionWork?: (clientDossierId: string) => ReactNode;
  renderDocumentWork?: (clientDossierId: string) => ReactNode;
  /** Reported when a union or reversal changes the current Client identities. */
  onClientIdentityChanged?: () => void;
  requestedClientDossierRequest?: {
    clientDossierId: string;
    requestId: number;
  };
};

const emptyRegistrationDraft: ClientRegistrationDraft = {
  displayName: '',
  taxId: '',
  address: '',
  telephone: '',
  generalEmail: '',
  contacts: [],
  businessActivity: '',
};

/**
 * The Clients directory owner shared by both interfaces: the Company's list,
 * the Workspace search and attachment, the registration draft with its retry
 * key, the selected dossier and the union outcome. Each interface renders it;
 * neither decides authority, which the server and the grants below keep.
 */
export function useClientWorkspace({
  actor,
  identity,
  onCompanyContextRejected,
  onActorRevalidated = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
  onActivityRecorded,
  onClientIdentityChanged,
  requestedClientDossierRequest,
}: Pick<
  ClientWorkspaceProps,
  | 'actor'
  | 'identity'
  | 'onCompanyContextRejected'
  | 'onActorRevalidated'
  | 'onWorkspaceAccessRejected'
  | 'onActivityRecorded'
  | 'onClientIdentityChanged'
  | 'requestedClientDossierRequest'
>) {
  const [registrationDraft, setRegistrationDraft] =
    useState<ClientRegistrationDraft>(emptyRegistrationDraft);
  const [searchQuery, setSearchQuery] = useState('');
  const [listState, setListState] = useState<ClientListState>({
    status: 'loading',
  });
  const [createState, setCreateState] = useState<ClientRegistrationState>({
    status: 'idle',
  });
  const [searchState, setSearchState] = useState<ClientSearchState>({
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
        trigger &&
        document.activeElement === trigger &&
        !heading.closest('[hidden]')
      )
        heading.focus();
    },
    [],
  );
  function openDossier(clientId: string) {
    setConfirmedUnionClientId(undefined);
    if (clientId === selectedClientId) {
      dossierHeading.current?.focus();
      return;
    }
    dossierOpeningTrigger.current = document.activeElement;
    setSelectedClientId(clientId);
  }
  /** Leaves the dossier for the directory; only Clarté shows one at a time. */
  function closeDossier() {
    setConfirmedUnionClientId(undefined);
    dossierOpeningTrigger.current = null;
    setSelectedClientId(undefined);
  }
  const retryCommand = useRef<RetryCommand | undefined>(undefined);
  const rejectCompanyContext = useRef(onCompanyContextRejected);
  const acceptRevalidatedActor = useRef(onActorRevalidated);
  const rejectWorkspaceAccess = useRef(onWorkspaceAccessRejected);
  useLayoutEffect(() => {
    rejectCompanyContext.current = onCompanyContextRejected;
    acceptRevalidatedActor.current = onActorRevalidated;
    rejectWorkspaceAccess.current = onWorkspaceAccessRejected;
  });
  const activeCompany = actor.activeCompany;
  const clientGrant = grantOf(activeCompany, 'company_director_client_access');
  const clientPermissions: readonly string[] = clientGrant?.permissions ?? [];
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
  // is re-selected or revalidated. Client work, including child panels, outlives
  // such a refresh; it resets when the session, membership, Company or this
  // Client authority changes.
  const clientAuthority = JSON.stringify({
    workspaceClientManagement: canAttachClients,
    clientPermissions,
    assignmentId: clientGrant?.assignmentId,
    permissionSetVersion: clientGrant?.permissionSetVersion,
  });
  const requestScope = String(
    useRequestLifetime(
      identity,
      JSON.stringify([
        actor.internalUserId,
        actor.workspaceId,
        actor.workspaceMembershipId,
        activeCompany?.id,
        clientAuthority,
      ]),
    ),
  );
  const directoryRead = useScopedOperation(requestScope);
  const searchRead = useScopedOperation(requestScope);
  const actorObservation = useActorObservation(actor);
  const captureRecovery = useAuthorityLifetime(
    String(actorObservation),
    identity,
  );
  const registrationWork = useScopedOperationGroup(requestScope);
  const attachmentWork = useScopedOperationGroup(requestScope);

  useEffect(() => {
    if (requestedClientDossierRequest && canReadClientDossiers)
      openDossier(requestedClientDossierRequest.clientDossierId);
  }, [requestedClientDossierRequest, canReadClientDossiers]);

  const handleAccessRejection = useCallback(
    async (
      result: ApiResult<unknown>,
      companyContextId: string,
      signal: AbortSignal,
      recoveryCurrent: () => boolean,
      ownsDirectory = false,
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
        isCurrent: () => !signal.aborted && recoveryCurrent(),
      });
      if (signal.aborted) return true;
      if (!rejection) return false;
      if (ownsDirectory || recoveryCurrent())
        setListState({
          status: rejection === 'forbidden' ? 'forbidden' : 'error',
        });
      return true;
    },
    [identity],
  );

  const loadClients = useCallback(
    async (companyContextId: string): Promise<void> => {
      const requestSignal = directoryRead.begin();
      if (!requestSignal) return;
      const recoveryCurrent = captureRecovery();
      await runLatestAuthenticatedRequest({
        signal: requestSignal,
        identity,
        execute: (api, signal) =>
          api.request('/clients', {
            companyContextId,
            signal,
          }),
        async onResult(result, signal) {
          if (
            (await handleAccessRejection(
              result,
              companyContextId,
              signal,
              recoveryCurrent,
              true,
            )) ||
            signal.aborted
          )
            return;
          setListState(
            result.status === 'ok'
              ? {
                  status: 'ready',
                  clients: readClientAccountList(result.value),
                }
              : { status: 'error' },
          );
        },
        onError: () => setListState({ status: 'error' }),
      });
    },
    [captureRecovery, directoryRead, handleAccessRejection, identity],
  );

  useEffect(() => {
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
    const draft = registrationDraft;
    const normalizedDisplayName = draft.displayName.trim();
    if (!normalizedDisplayName) {
      setCreateState({
        status: 'validation',
        issue: 'displayNameRequired',
        field: 'displayName',
      });
      return;
    }

    const contactResult: ClientContactDraftResult = canCreateEnrichedClients
      ? normalizedContacts(draft.contacts)
      : { status: 'valid', contacts: [] };
    if (contactResult.status === 'invalid') {
      setCreateState({
        status: 'validation',
        issue: contactResult.issue,
        field: 'contacts',
      });
      return;
    }
    const normalizedClientContacts = contactResult.contacts;
    const serializedBody = JSON.stringify({
      displayName: normalizedDisplayName,
      ...(canCreateEnrichedClients
        ? {
            ...optionalProperty('taxId', draft.taxId),
            ...optionalProperty('address', draft.address),
            ...optionalProperty('telephone', draft.telephone),
            ...optionalProperty('generalEmail', draft.generalEmail),
            ...(normalizedClientContacts.length > 0
              ? { contacts: normalizedClientContacts }
              : {}),
            ...optionalProperty('businessActivity', draft.businessActivity),
          }
        : {}),
    });
    const command = resolveRetryCommand(serializedBody, retryCommand.current);

    if (registrationWork.isPending()) return;
    const operation = registrationWork.beginLatest();
    if (!operation) return;
    const recoveryCurrent = captureRecovery();
    retryCommand.current = command;
    setCreateState({ status: 'submitting' });
    await runLatestAuthenticatedRequest({
      signal: operation.signal,
      identity,
      execute: (api, signal) =>
        api.request('/clients', {
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
        if (
          await handleAccessRejection(
            result,
            activeCompany.id,
            signal,
            recoveryCurrent,
          )
        ) {
          if (!signal.aborted) setCreateState({ status: 'forbidden' });
          return;
        }
        if (signal.aborted) return;
        if (result.status === 'validation') {
          setCreateState({
            status: 'validation',
            issue: clientRegistrationValidationIssue(result.message),
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
        readClientAccountView(result.value);
        retryCommand.current = undefined;
        setRegistrationDraft(emptyRegistrationDraft);
        setCreateState({ status: 'success' });
        operation.release();
        void Promise.resolve()
          .then(() => {
            if (!signal.aborted) return onActivityRecorded();
          })
          .catch(() => undefined);
        void loadClients(activeCompany.id);
      },
      onError: () => setCreateState({ status: 'error' }),
      onSettled: operation.release,
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
    const requestSignal = searchRead.begin();
    if (!requestSignal) return;
    const recoveryCurrent = captureRecovery();
    setSearchState({ status: 'submitting' });
    await runLatestAuthenticatedRequest({
      signal: requestSignal,
      identity,
      execute: (api, signal) =>
        api.request(`/clients/search?query=${encodeURIComponent(query)}`, {
          companyContextId: activeCompany.id,
          signal,
        }),
      async onResult(result, signal) {
        if (
          await handleAccessRejection(
            result,
            activeCompany.id,
            signal,
            recoveryCurrent,
          )
        ) {
          if (!signal.aborted) setSearchState({ status: 'forbidden' });
          return;
        }
        if (signal.aborted) return;
        setSearchState(
          result.status === 'ok'
            ? { status: 'ready', clients: readClientAccountList(result.value) }
            : result.status === 'validation'
              ? { status: 'validation' }
              : { status: 'error' },
        );
      },
      onError: () => setSearchState({ status: 'error' }),
    });
  }

  /** Returns from search results to the Company's own Client list. */
  function clearSearch() {
    searchRead.retire();
    setSearchState({ status: 'idle' });
    setSearchQuery('');
  }

  async function attachClient(clientAccountId: string) {
    if (!activeCompany || !canAttachClients) return;
    if (attachmentWork.isPending()) return;
    const operation = attachmentWork.begin();
    if (!operation) return;
    const recoveryCurrent = captureRecovery();
    setAttachingClientId(clientAccountId);
    await runLatestAuthenticatedRequest({
      signal: operation.signal,
      identity,
      execute: (api, signal) =>
        api.request(
          `/clients/${encodeURIComponent(clientAccountId)}/active-company-relationship`,
          {
            method: 'PUT',
            companyContextId: activeCompany.id,
            signal,
          },
        ),
      async onResult(result, signal) {
        if (
          await handleAccessRejection(
            result,
            activeCompany.id,
            signal,
            recoveryCurrent,
          )
        ) {
          if (!signal.aborted) setSearchState({ status: 'forbidden' });
          return;
        }
        if (signal.aborted) return;
        if (result.status !== 'ok') {
          setSearchState({ status: 'error' });
          return;
        }
        const attachedClient = readClientAccountView(result.value);
        setSearchState((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                clients: current.clients.map((client) =>
                  client.id === attachedClient.id ? attachedClient : client,
                ),
              }
            : current,
        );
        void onActivityRecorded();
        await loadClients(activeCompany.id);
      },
      onError: () => setSearchState({ status: 'error' }),
      onSettled: () => {
        operation.release();
        setAttachingClientId(undefined);
      },
    });
  }

  // Shows the canonical dossier after a union outcome or on request from union
  // history; only the former is a Client identity change.
  async function showUnionOutcome(
    companyContextId: string,
    canonicalClientId?: string,
  ): Promise<void> {
    if (canonicalClientId) setSelectedClientId(canonicalClientId);
    else setConfirmedUnionClientId(undefined);
    setUnionRevision((revision) => revision + 1);
    await Promise.all([loadClients(companyContextId), onActivityRecorded()]);
  }

  return {
    activeCompany,
    clientAuthority,
    captureRecovery,
    access: {
      canReadClients,
      canCreateClients,
      canReadClientDossiers,
      canCreateEnrichedClients,
      canUpdateClients,
      canResolveDuplicateClients,
      canAttachClients,
    },
    list: listState,
    reloadClients: loadClients,
    registration: {
      draft: registrationDraft,
      change: (change: Partial<ClientRegistrationDraft>) =>
        setRegistrationDraft((current) => ({ ...current, ...change })),
      state: createState,
      submit: createClient,
    },
    search: {
      query: searchQuery,
      setQuery: setSearchQuery,
      state: searchState,
      submit: searchClients,
      clear: clearSearch,
    },
    attachment: { attachingClientId, attach: attachClient },
    dossier: {
      selectedClientId,
      open: openDossier,
      close: closeDossier,
      receiveHeading: receiveDossierHeading,
    },
    duplicateReview: {
      refreshKey: duplicateReviewRefreshKey,
      request: () => setDuplicateReviewRefreshKey((current) => current + 1),
    },
    union: {
      revision: unionRevision,
      confirmedClientId: confirmedUnionClientId,
      confirm: setConfirmedUnionClientId,
      showOutcome: showUnionOutcome,
      /** A confirmed union or reversal changed the current identities. */
      changed: async (companyContextId: string, canonicalClientId?: string) => {
        onClientIdentityChanged?.();
        await showUnionOutcome(companyContextId, canonicalClientId);
      },
    },
  };
}

export type ClientWorkspaceOwner = ReturnType<typeof useClientWorkspace>;
