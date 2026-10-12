import { ContractPanel } from '../contract/ContractPanel';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { selectedWorkspaceId } from '../access/workspace-selection';
import { formatApplicationDateTime } from '../presentation/date-time';
import { Select } from '../presentation/Select';
import { ProfitabilityEstimatePanel } from '../profitability-estimate/ProfitabilityEstimatePanel';
import { PricingSnapshotPanel } from '../pricing-configuration/PricingSnapshotPanel';
import { OfferPanel } from '../offer/OfferPanel';
import {
  OpportunityResponsible,
  type ResponsibleCandidate,
  type ResponsibleEdit,
  type ResponsibleEditor,
} from './OpportunityResponsible';
import {
  OpportunityOutcome,
  OpportunityOutcomeHistory,
  type OlderOutcomeHistory,
  type OutcomeEditor,
} from './OpportunityOutcome';
import { commercialIntakeCopy as copy } from './commercial-intake.copy';
import {
  EMPTY_OUTCOME_DRAFT,
  isOpportunityOutcomeStatus,
  isOutcomeTransition,
  isOutcomeHistoryPage,
  outcomeCommandBody,
  type OpportunityOutcomeStatus,
  type OutcomeEdit,
  type OutcomeHistoryPage,
} from './opportunity-outcome';
import { RequestClientAssociation } from './RequestClientAssociation';
import './commercial-intake.css';

type ResponsibleActor = { workspaceMembershipId: string; displayName: string };

type RequestListClientProjection =
  | { clientDisplayName: string; clientDossierId?: string }
  | { clientDisplayName?: undefined; clientDossierId?: undefined };

type RequestListItem = {
  id: string;
  subject: string | null;
  capturedAt: string;
  initialOpportunity: {
    title: string;
    nextAction: string;
    status: OpportunityOutcomeStatus;
    responsibleActor: ResponsibleActor;
  };
} & RequestListClientProjection;

type ClientRequest = {
  id: string;
  companyId: string;
  sourceKind: 'MANUAL_TEXT';
  sourceLabel: string | null;
  reportedReceivedAt: string | null;
  subject: string | null;
  originalText: string;
  capturedByWorkspaceMembershipId: string;
  capturedAt: string;
  version: 1 | 2;
  clientAssociationStatus: 'absent' | 'hidden' | 'visible';
  clientReference?: {
    originalClientId: string;
    currentClientId?: string;
    displayName: string;
  };
  initialOpportunity: {
    id: string;
    title: string;
    scope: string | null;
    nextAction: string;
    status: OpportunityOutcomeStatus;
    statusEnteredAt: string;
    outcomeHistory: OutcomeHistoryPage;
    responsibleWorkspaceMembershipId: string;
    responsibleActor: ResponsibleActor;
    createdAt: string;
    version: number;
  };
};

/** Only a projection read under the current Client authority and identity is visible. */
type SelectedRequest = {
  request: ClientRequest;
  clientProjectionRevision: number;
};

/** One dossier identity restricting the loaded rows, as the shell requested. */
type ClientRestriction = { clientDossierId: string; displayName: string };

/** One Request detail the shell requested; `requestId` numbers each request. */
type RequestedRequest = { clientRequestId: string; requestId: number };

// What the one shared in-flight controller serves: an ordinary detail read, or
// a capture, next-action, responsible-actor or outcome status command until
// the reads that follow its outcome end.
type InFlight =
  'none' | 'read' | 'capture' | 'next-action' | 'responsible' | 'outcome';
type AssociationProtection = 'idle' | 'loading' | 'uncertain';

type NextActionUpdateResult = {
  receipt: {
    opportunityId: string;
    nextAction: string;
    version: number;
    outcome: 'updated' | 'unchanged';
  };
  request: ClientRequest;
};

// The next-action edit is either closed, being typed, in flight, waiting for
// an explicit retry after an uncertain outcome, or blocked until a reload.
type NextActionEdit =
  | { kind: 'idle' }
  | { kind: 'editing'; draft: string }
  | { kind: 'saving'; draft: string }
  | { kind: 'uncertain'; draft: string }
  | { kind: 'conflict' };

type NextActionRetry = {
  opportunityId: string;
  expectedVersion: number;
  nextAction: string;
  key: string;
};

type ResponsibleChangeResult = {
  receipt: {
    opportunityId: string;
    workspaceMembershipId: string;
    version: number;
    outcome: 'updated' | 'unchanged';
  };
  request: ClientRequest;
};

type ResponsibleRetry = {
  opportunityId: string;
  expectedVersion: number;
  workspaceMembershipId: string;
  key: string;
};

type OutcomeChangeResult = {
  receipt: {
    opportunityId: string;
    previousStatus: OpportunityOutcomeStatus;
    status: OpportunityOutcomeStatus;
    version: number;
  };
  request: ClientRequest;
};

// An explicit retry resends exactly this body with its key.
type OutcomeRetry = {
  opportunityId: string;
  body: string;
  key: string;
};

type RequestPage = { items: RequestListItem[]; nextCursor?: string };

type LoadState =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      companyId: string;
      clientProjectionRevision: number;
      items: RequestListItem[];
      nextCursor?: string;
      olderPage: 'idle' | 'loading' | 'error';
    }
  | { kind: 'denied' }
  | { kind: 'error' };

type FormState = {
  originalText: string;
  sourceLabel: string;
  reportedReceivedAt: string;
  subject: string;
  clientAccountId: string;
  opportunityTitle: string;
  opportunityScope: string;
  nextAction: string;
};

type ClientChoice = {
  id: string;
  displayName: string;
  relatedToActiveCompany: boolean;
};
type ClientSearchState =
  | { kind: 'idle' | 'loading' | 'validation' | 'denied' | 'error' }
  | { kind: 'ready'; clients: ClientChoice[] };

type HttpResult = { status: number; body: unknown } | { status: 'network' };

const listPageSize = 25;

const emptyForm: FormState = {
  originalText: '',
  sourceLabel: '',
  reportedReceivedAt: '',
  subject: '',
  clientAccountId: '',
  opportunityTitle: '',
  opportunityScope: '',
  nextAction: '',
};

export function CommercialIntakeWorkspace({
  actor,
  identity,
  onCompanyContextRejected,
  onActorRevalidated = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
  onActivityRecorded = () => undefined,
  clientRestriction,
  clientIdentityRevision = 0,
  clientAuthorityRevision = 0,
  onOpenClientDossier,
  requestedRequest,
  onOpenProject,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
  onActivityRecorded?: () => Promise<void> | void;
  /** A new object establishes or replaces the restriction; none clears it. */
  clientRestriction?: ClientRestriction;
  /** Increases when a Client union or reversal changes current identities. */
  clientIdentityRevision?: number;
  /** Increases when App observes a change in Client authority. */
  clientAuthorityRevision?: number;
  onOpenClientDossier?: (clientDossierId: string) => void;
  /**
   * A new object requests that Request's detail again and supersedes an older
   * request; none retires it. It opens once no capture or next-action edit is
   * in progress, and never interrupts one.
   */
  requestedRequest?: RequestedRequest;
  onOpenProject?: (projectId: string) => void;
}) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [selected, setSelected] = useState<SelectedRequest>();
  // Local view state over the already loaded rows, beside the text filter; it
  // never reaches the API.
  const [restriction, setRestriction] = useState<ClientRestriction>();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [clientQuery, setClientQuery] = useState('');
  const [clientSearchState, setClientSearch] = useState<ClientSearchState>({
    kind: 'idle',
  });
  const [searchProjectionRevision, setSearchProjectionRevision] = useState(-1);
  const [feedback, setFeedback] = useState('');
  const [inFlight, setInFlight] = useState<InFlight>('none');
  const [associationProtection, setAssociationProtection] =
    useState<AssociationProtection>('idle');
  // A searched or selected Client not yet associated is an open editor too.
  const [associationDraft, setAssociationDraft] = useState(false);
  const pending = inFlight !== 'none' || associationProtection !== 'idle';
  // A capture that ended without a confirmed result keeps its payload and key
  // for an exact retry until a later attempt settles it.
  const [captureUncertain, setCaptureUncertain] = useState(false);
  // The latest requested Request not opened yet.
  const [requestToOpen, setRequestToOpen] = useState<RequestedRequest>();
  // Local view state over the already loaded rows; it never reaches the API.
  const [filter, setFilter] = useState('');
  const [nextActionEdit, setNextActionEdit] = useState<NextActionEdit>({
    kind: 'idle',
  });
  const [responsibleEdit, setResponsibleEdit] = useState<ResponsibleEdit>({
    kind: 'idle',
  });
  const [outcomeEdit, setOutcomeEdit] = useState<OutcomeEdit>({
    kind: 'idle',
  });
  const listRequest = useRef<AbortController | undefined>(undefined);
  const commandRequest = useRef<AbortController | undefined>(undefined);
  const clientSearchRequest = useRef<AbortController | undefined>(undefined);
  const retry = useRef<
    { payload: string; key: string; hasClient: boolean } | undefined
  >(undefined);
  const nextActionRetry = useRef<NextActionRetry | undefined>(undefined);
  // The next-action save whose response has not arrived yet; commandRequest
  // is shared with capture and detail reads.
  const nextActionCommand = useRef<AbortController | undefined>(undefined);
  const responsibleRetry = useRef<ResponsibleRetry | undefined>(undefined);
  // The responsible-actor save whose response has not arrived yet, and the
  // eligible-member read of an open responsible-actor editor.
  const responsibleCommand = useRef<AbortController | undefined>(undefined);
  const membersRequest = useRef<AbortController | undefined>(undefined);
  const outcomeRetry = useRef<OutcomeRetry | undefined>(undefined);
  // The outcome status save whose response has not arrived yet.
  const outcomeCommand = useRef<AbortController | undefined>(undefined);
  // The ordinary detail read in flight, if any; never a command.
  const detailRead = useRef<AbortController | undefined>(undefined);
  const identityRevision = useRef(clientIdentityRevision);
  identityRevision.current = clientIdentityRevision;
  const nextActionEditOpen =
    nextActionEdit.kind === 'editing' ||
    nextActionEdit.kind === 'saving' ||
    nextActionEdit.kind === 'uncertain';
  const responsibleEditOpen =
    responsibleEdit.kind !== 'idle' && responsibleEdit.kind !== 'conflict';
  const outcomeEditOpen =
    outcomeEdit.kind !== 'idle' && outcomeEdit.kind !== 'conflict';
  // At most one Opportunity editor is open; any one is protected work.
  const opportunityEditInProgress = useRef(false);
  opportunityEditInProgress.current =
    nextActionEditOpen || responsibleEditOpen || outcomeEditOpen;
  // Section 23.7: the outcome editor shares the one-open-editor rule with
  // Client association, so an association draft or command blocks it.
  const associationOpen = associationDraft || associationProtection !== 'idle';
  const associationInProgress = useRef(false);
  associationInProgress.current = associationProtection !== 'idle';
  const protectedWork =
    associationProtection !== 'idle'
      ? 'client-association'
      : nextActionEditOpen || inFlight === 'next-action'
        ? 'next-action-edit'
        : responsibleEditOpen || inFlight === 'responsible'
          ? 'responsible-edit'
          : outcomeEditOpen || inFlight === 'outcome'
            ? 'outcome-edit'
            : inFlight === 'capture' || captureUncertain
              ? 'capture'
              : undefined;
  const listDenied = useRef(false);
  listDenied.current = load.kind === 'denied';
  const rejectCompany = useRef(onCompanyContextRejected);
  const acceptActor = useRef(onActorRevalidated);
  const rejectWorkspace = useRef(onWorkspaceAccessRejected);
  rejectCompany.current = onCompanyContextRejected;
  acceptActor.current = onActorRevalidated;
  rejectWorkspace.current = onWorkspaceAccessRejected;
  const companyId = actor.activeCompany?.id;
  const canSearchClients =
    actor.workspacePermissions.includes('client.manage') ||
    actor.activeCompany?.clientPermissions?.includes('client.read') === true;
  const canEditNextAction =
    actor.activeCompany?.commercialIntakePermissions?.includes(
      'commercial.opportunity.next_action.update',
    ) === true;
  const canAssociateClient =
    canSearchClients &&
    actor.activeCompany?.commercialIntakePermissions?.includes(
      'commercial.request.client.associate',
    ) === true;
  // Association drafts belong to this captured Client read authority.
  // A replacement grant remains readable, but retires selection, retry and
  // pending replies without discarding this Request or its Opportunity edits.
  const clientAssociationAuthority = JSON.stringify([
    actor.workspaceId,
    actor.internalUserId,
    actor.workspaceMembershipId,
    companyId,
    clientAuthorityRevision,
    actor.activeCompany?.clientPermissionAssignmentId,
    actor.activeCompany?.clientPermissionSetVersion,
    actor.activeCompany?.commercialIntakePermissionAssignmentId,
    actor.activeCompany?.commercialIntakePermissionSetVersion,
    canSearchClients,
    canAssociateClient,
  ]);
  const clientReadAuthority = JSON.stringify([
    actor.workspaceId,
    actor.internalUserId,
    actor.workspaceMembershipId,
    companyId,
    clientAuthorityRevision,
    actor.activeCompany?.clientPermissionAssignmentId,
    actor.activeCompany?.clientPermissionSetVersion,
    canSearchClients,
  ]);
  // Loaded projections and reads also belong to the observed authority and
  // current Client identity. A monotonically increasing revision prevents an
  // old response becoming current again after access is lost and regranted.
  const projectionAuthority = JSON.stringify([
    clientReadAuthority,
    clientIdentityRevision,
  ]);
  const clientProjection = useRef({
    authority: projectionAuthority,
    revision: 0,
  });
  if (clientProjection.current.authority !== projectionAuthority)
    clientProjection.current = {
      authority: projectionAuthority,
      revision: clientProjection.current.revision + 1,
    };
  const clientProjectionRevision = clientProjection.current.revision;
  const clientSearch: ClientSearchState =
    canSearchClients && searchProjectionRevision === clientProjectionRevision
      ? clientSearchState
      : { kind: 'idle' };

  // Reassignment needs the manager bundle and both Intake reads; the server
  // also requires live Company context.
  const intakePermissions =
    actor.activeCompany?.commercialIntakePermissions ?? [];
  const canChangeResponsible =
    actor.activeCompany?.opportunityManagerPermissions?.includes(
      'commercial.opportunity.assign',
    ) === true &&
    intakePermissions.includes('commercial.request.read') &&
    intakePermissions.includes('commercial.opportunity.read');
  // The captured manager assignment the editor belongs to, like a remount key.
  const responsibleAuthority = JSON.stringify([
    actor.workspaceMembershipId,
    companyId,
    actor.activeCompany?.opportunityManagerPermissionAssignmentId,
    actor.activeCompany?.opportunityManagerPermissionSetVersion,
    canChangeResponsible,
  ]);
  // The outcome status change needs captured manager v2 and both Intake
  // reads; the server also requires live Company context.
  const canChangeOutcome =
    actor.activeCompany?.opportunityManagerPermissions?.includes(
      'commercial.opportunity.outcome.change',
    ) === true &&
    intakePermissions.includes('commercial.request.read') &&
    intakePermissions.includes('commercial.opportunity.read');
  const outcomeAuthority = JSON.stringify([
    actor.workspaceMembershipId,
    companyId,
    actor.activeCompany?.opportunityManagerPermissionAssignmentId,
    actor.activeCompany?.opportunityManagerPermissionSetVersion,
    canChangeOutcome,
  ]);

  const request = useCallback(
    async ({
      path,
      companyContextId,
      signal,
      method = 'GET',
      body,
      idempotencyKey,
    }: {
      path: string;
      companyContextId: string;
      signal: AbortSignal;
      method?: 'GET' | 'POST';
      body?: string;
      idempotencyKey?: string;
    }): Promise<HttpResult> => {
      try {
        const token = identity.requestHeaders
          ? null
          : await identity.getToken();
        const workspaceId = selectedWorkspaceId();
        const headers = {
          ...(identity.requestHeaders ??
            (token ? { Authorization: `Bearer ${token}` } : {})),
          ...(workspaceId ? { 'x-workspace-context-id': workspaceId } : {}),
          'x-company-context-id': companyContextId,
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        };
        const response = await fetch(
          `${import.meta.env.VITE_API_URL ?? '/api'}${path}`,
          {
            method,
            credentials: 'include',
            headers,
            body,
            signal,
          },
        );
        let responseBody: unknown;
        try {
          responseBody = await response.json();
        } catch {
          responseBody = undefined;
        }
        return { status: response.status, body: responseBody };
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError')
          throw error;
        return { status: 'network' };
      }
    },
    [identity],
  );

  // 'ok' means the result was not an access rejection. 'retained' means the
  // rejection concerned only a narrower authority and the intake read stays
  // valid; 'rejected' means the scoped content was cleared.
  const handleAccess = useCallback(
    async (
      result: HttpResult,
      companyContextId: string,
      signal: AbortSignal,
      resource:
        | 'intake'
        | 'client-search'
        | 'client-association'
        | 'next-action-update'
        | 'responsible-update'
        | 'outcome-update' = 'intake',
    ): Promise<'ok' | 'retained' | 'rejected'> => {
      if (signal.aborted) return 'rejected';
      if (result.status === 401) {
        await identity.rejectSession();
        return 'rejected';
      }
      if (result.status !== 403) return 'ok';
      let retainAuthorizedIntake = false;
      try {
        await handleAuthenticatedAccessRejection({
          result: { status: 'forbidden' },
          identity,
          companyContextId,
          onCompanyContextRejected: (rejectedCompanyId) =>
            rejectCompany.current(rejectedCompanyId),
          onActorRevalidated: (revalidatedActor) => {
            const company = revalidatedActor.activeCompany;
            retainAuthorizedIntake =
              resource !== 'intake' &&
              company?.id === companyContextId &&
              company.commercialIntakePermissions?.includes(
                'commercial.request.read',
              ) === true &&
              company.commercialIntakePermissions.includes(
                'commercial.opportunity.read',
              );
            return acceptActor.current(revalidatedActor);
          },
          onWorkspaceAccessRejected: () => rejectWorkspace.current(),
          signal,
        });
      } finally {
        if (!signal.aborted && !retainAuthorizedIntake) {
          setLoad({ kind: 'denied' });
          setSelected(undefined);
          setForm(emptyForm);
          setFeedback('');
          setFilter('');
          setRestriction(undefined);
          setNextActionEdit({ kind: 'idle' });
          setAssociationProtection('idle');
          setResponsibleEdit({ kind: 'idle' });
          setOutcomeEdit({ kind: 'idle' });
          setInFlight('none');
          setCaptureUncertain(false);
          setRequestToOpen(undefined);
          retry.current = undefined;
          nextActionRetry.current = undefined;
          responsibleRetry.current = undefined;
          outcomeRetry.current = undefined;
          listRequest.current?.abort();
          commandRequest.current?.abort();
          membersRequest.current?.abort();
        }
      }
      return retainAuthorizedIntake && !signal.aborted
        ? 'retained'
        : 'rejected';
    },
    [identity],
  );

  const loadRequests = useCallback(
    async (companyContextId: string, cursor?: string): Promise<void> => {
      listRequest.current?.abort();
      const controller = new AbortController();
      listRequest.current = controller;
      // An authority or identity change retires the old page, including late
      // older-page responses; only its own revalidated read publishes.
      const startedUnderRevision = clientProjection.current.revision;
      const superseded = () =>
        controller.signal.aborted ||
        clientProjection.current.revision !== startedUnderRevision;
      setLoad((current) => startedPage({ current, companyContextId, cursor }));
      try {
        const result = await request({
          path: `/commercial-intake/requests?limit=${listPageSize}${
            cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
          }`,
          companyContextId,
          signal: controller.signal,
        });
        if (superseded()) return;
        if (
          (await handleAccess(result, companyContextId, controller.signal)) !==
          'ok'
        )
          return;
        if (superseded()) return;
        const page =
          result.status === 200 && isRequestList(result.body)
            ? result.body
            : undefined;
        setLoad((current) =>
          appliedPage({
            current,
            companyContextId,
            cursor,
            page,
            clientProjectionRevision: startedUnderRevision,
          }),
        );
      } catch {
        if (!superseded())
          setLoad((current) =>
            appliedPage({
              current,
              companyContextId,
              cursor,
              page: undefined,
              clientProjectionRevision: startedUnderRevision,
            }),
          );
      }
    },
    [handleAccess, request],
  );

  useEffect(() => {
    commandRequest.current?.abort();
    clientSearchRequest.current?.abort();
    membersRequest.current?.abort();
    retry.current = undefined;
    nextActionRetry.current = undefined;
    responsibleRetry.current = undefined;
    outcomeRetry.current = undefined;
    setSelected(undefined);
    setNextActionEdit({ kind: 'idle' });
    setAssociationProtection('idle');
    setResponsibleEdit({ kind: 'idle' });
    setOutcomeEdit({ kind: 'idle' });
    setFeedback('');
    setClientQuery('');
    setClientSearch({ kind: 'idle' });
    setInFlight('none');
    setCaptureUncertain(false);
    setRequestToOpen(undefined);
    setFilter('');
    setRestriction(undefined);
    if (!companyId) {
      setLoad({ kind: 'denied' });
      return;
    }
    void loadRequests(companyId);
    return () => {
      listRequest.current?.abort();
      commandRequest.current?.abort();
      clientSearchRequest.current?.abort();
      membersRequest.current?.abort();
    };
  }, [actor.workspaceId, actor.workspaceMembershipId, companyId, loadRequests]);

  // The shell owns the navigation intent. A newly requested restriction shows
  // its loaded rows instead of a plain detail; a retired one only clears it.
  useEffect(() => {
    setRestriction(clientRestriction);
    if (
      !clientRestriction ||
      opportunityEditInProgress.current ||
      associationInProgress.current
    )
      return;
    // An active editor or uncertain retry stays open until Back.
    const read = detailRead.current;
    if (read && !read.signal.aborted) {
      read.abort();
      setInFlight('none');
    }
    setSelected(undefined);
    setNextActionEdit({ kind: 'idle' });
    nextActionRetry.current = undefined;
    setResponsibleEdit({ kind: 'idle' });
    responsibleRetry.current = undefined;
    setOutcomeEdit({ kind: 'idle' });
    outcomeRetry.current = undefined;
  }, [clientRestriction]);

  // The shell owns the requested Request. A new one supersedes any older or
  // held request; opening it aborts a detail read still in flight.
  useEffect(() => {
    setRequestToOpen(requestedRequest);
  }, [requestedRequest]);

  // It opens exactly like choosing its row from the list, once no protected
  // capture or next-action edit remains, so their drafts, payloads and keys
  // are kept.
  useEffect(() => {
    if (!requestToOpen || protectedWork) return;
    setRequestToOpen(undefined);
    setSelected(undefined);
    void selectRequest(requestToOpen.clientRequestId);
  }, [requestToOpen, protectedWork]);

  // Retire capture-only Client work and reread rows after an authority or
  // identity change. Clientless capture and Opportunity retries remain valid.
  const readProjectionRevision = useRef(clientProjectionRevision);
  const readProjectionCompany = useRef(companyId);
  useEffect(() => {
    if (readProjectionRevision.current === clientProjectionRevision) return;
    readProjectionRevision.current = clientProjectionRevision;
    const companyChanged = readProjectionCompany.current !== companyId;
    readProjectionCompany.current = companyId;
    clientSearchRequest.current?.abort();
    setClientQuery('');
    setClientSearch({ kind: 'idle' });
    setForm((current) => ({ ...current, clientAccountId: '' }));
    if (retry.current?.hasClient) {
      retry.current = undefined;
      if (inFlight === 'capture') {
        commandRequest.current?.abort();
        setInFlight('none');
      }
      setCaptureUncertain(false);
    }
    if (companyId && !companyChanged && !listDenied.current)
      void loadRequests(companyId);
  }, [clientProjectionRevision, companyId, loadRequests]);

  // An opened Request whose Client projection predates the current authority
  // or identity has its association read again. Its Request version, association
  // status and derived reference move together: the shown Opportunity, its
  // observed version, a draft and a retryable command stay exactly as they are.
  const selectedRequestId = selected?.request.id;
  const selectedProjectionRevision = selected?.clientProjectionRevision;
  useEffect(() => {
    if (
      !companyId ||
      selectedRequestId === undefined ||
      selectedProjectionRevision === clientProjectionRevision
    )
      return;
    const controller = new AbortController();
    const startedUnderProjection = clientProjectionRevision;
    const superseded = () =>
      controller.signal.aborted ||
      clientProjection.current.revision !== startedUnderProjection;
    void (async () => {
      try {
        const result = await request({
          path: `/commercial-intake/requests/${encodeURIComponent(selectedRequestId)}`,
          companyContextId: companyId,
          signal: controller.signal,
        });
        if (superseded()) return;
        if ((await handleAccess(result, companyId, controller.signal)) !== 'ok')
          return;
        if (
          superseded() ||
          result.status !== 200 ||
          !isClientRequest(result.body)
        )
          return;
        const { version, clientAssociationStatus, clientReference } =
          result.body;
        setSelected((current) =>
          current?.request.id === selectedRequestId
            ? {
                request: {
                  ...current.request,
                  version,
                  clientAssociationStatus,
                  clientReference,
                },
                clientProjectionRevision: startedUnderProjection,
              }
            : current,
        );
      } catch {
        // The dossier target stays withheld; reopening reads it again.
      }
    })();
    return () => controller.abort();
  }, [
    companyId,
    selectedRequestId,
    selectedProjectionRevision,
    clientProjectionRevision,
    clientIdentityRevision,
    handleAccess,
    request,
  ]);

  // Losing only update authority keeps the read-only detail and any pending
  // conflict reload, but retires the draft, the pending command and any
  // in-flight save, so a later regrant can neither restore nor replay them.
  useEffect(() => {
    if (canEditNextAction) return;
    nextActionRetry.current = undefined;
    const save = nextActionCommand.current;
    nextActionCommand.current = undefined;
    if (save && !save.signal.aborted) {
      save.abort();
      setInFlight('none');
    }
    if (nextActionEdit.kind === 'idle' || nextActionEdit.kind === 'conflict')
      return;
    setNextActionEdit({ kind: 'idle' });
    setFeedback(copy.nextActionDenied);
  }, [canEditNextAction, nextActionEdit.kind]);

  // Losing reassignment authority keeps the read-only detail, but retires the
  // editor, its eligible members, the pending command and any in-flight save,
  // so a later regrant can neither restore nor replay them.
  useEffect(() => {
    if (canChangeResponsible) return;
    responsibleRetry.current = undefined;
    membersRequest.current?.abort();
    const save = responsibleCommand.current;
    responsibleCommand.current = undefined;
    if (save && !save.signal.aborted) {
      save.abort();
      setInFlight('none');
    }
    if (responsibleEdit.kind === 'idle') return;
    setResponsibleEdit({ kind: 'idle' });
    if (responsibleEdit.kind !== 'conflict')
      setFeedback(copy.responsibleDenied);
  }, [canChangeResponsible, responsibleEdit.kind]);

  // Losing outcome authority keeps the read-only detail, but retires the
  // draft, the pending command and any in-flight save, so a later regrant can
  // neither restore nor replay them.
  useEffect(() => {
    if (canChangeOutcome) return;
    outcomeRetry.current = undefined;
    const save = outcomeCommand.current;
    outcomeCommand.current = undefined;
    if (save && !save.signal.aborted) {
      save.abort();
      setInFlight('none');
    }
    if (outcomeEdit.kind === 'idle') return;
    setOutcomeEdit({ kind: 'idle' });
    if (outcomeEdit.kind !== 'conflict') setFeedback(copy.outcomeDenied);
  }, [canChangeOutcome, outcomeEdit.kind]);

  // Another captured manager assignment is a new authority: like a remount
  // keyed on it, it retires every outcome draft and command.
  const readOutcomeAuthority = useRef(outcomeAuthority);
  useEffect(() => {
    if (readOutcomeAuthority.current === outcomeAuthority) return;
    readOutcomeAuthority.current = outcomeAuthority;
    outcomeRetry.current = undefined;
    const save = outcomeCommand.current;
    outcomeCommand.current = undefined;
    if (save && !save.signal.aborted) {
      save.abort();
      setInFlight('none');
    }
    setOutcomeEdit({ kind: 'idle' });
  }, [outcomeAuthority]);

  // Another captured manager assignment is a new authority: like a remount
  // keyed on it, it retires every responsible-actor draft and command.
  const readResponsibleAuthority = useRef(responsibleAuthority);
  useEffect(() => {
    if (readResponsibleAuthority.current === responsibleAuthority) return;
    readResponsibleAuthority.current = responsibleAuthority;
    responsibleRetry.current = undefined;
    membersRequest.current?.abort();
    const save = responsibleCommand.current;
    responsibleCommand.current = undefined;
    if (save && !save.signal.aborted) {
      save.abort();
      setInFlight('none');
    }
    setResponsibleEdit({ kind: 'idle' });
  }, [responsibleAuthority]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function searchClients(): Promise<void> {
    if (!companyId || !canSearchClients) return;
    updateField('clientAccountId', '');
    const query = clientQuery.trim();
    if (!query) {
      setClientSearch({ kind: 'validation' });
      return;
    }
    clientSearchRequest.current?.abort();
    const controller = new AbortController();
    clientSearchRequest.current = controller;
    const startedUnderProjection = clientProjection.current.revision;
    const superseded = () =>
      controller.signal.aborted ||
      clientProjection.current.revision !== startedUnderProjection;
    setSearchProjectionRevision(startedUnderProjection);
    setClientSearch({ kind: 'loading' });
    try {
      const result = await request({
        path: `/clients/search?query=${encodeURIComponent(query)}`,
        companyContextId: companyId,
        signal: controller.signal,
      });
      if (superseded()) return;
      if (result.status === 401) {
        await identity.rejectSession();
        return;
      }
      if (result.status === 403) {
        await handleAccess(
          result,
          companyId,
          controller.signal,
          'client-search',
        );
        if (superseded()) return;
        setClientSearch({ kind: 'denied' });
        return;
      }
      setClientSearch(
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
      if (!superseded()) setClientSearch({ kind: 'error' });
    }
  }

  async function selectRequest(
    id: string,
    preserveConflict = false,
  ): Promise<void> {
    if (!companyId) return;
    commandRequest.current?.abort();
    const controller = new AbortController();
    commandRequest.current = controller;
    detailRead.current = controller;
    const startedUnderProjection = clientProjection.current.revision;
    setInFlight('read');
    setFeedback('');
    if (!preserveConflict) {
      setNextActionEdit({ kind: 'idle' });
      nextActionRetry.current = undefined;
      setResponsibleEdit({ kind: 'idle' });
      responsibleRetry.current = undefined;
      setOutcomeEdit({ kind: 'idle' });
      outcomeRetry.current = undefined;
      membersRequest.current?.abort();
    }
    try {
      const result = await request({
        path: `/commercial-intake/requests/${encodeURIComponent(id)}`,
        companyContextId: companyId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if ((await handleAccess(result, companyId, controller.signal)) !== 'ok')
        return;
      if (controller.signal.aborted) return;
      if (result.status === 200 && isClientRequest(result.body)) {
        setSelected({
          request: result.body,
          clientProjectionRevision: startedUnderProjection,
        });
        setNextActionEdit({ kind: 'idle' });
        nextActionRetry.current = undefined;
        setResponsibleEdit({ kind: 'idle' });
        responsibleRetry.current = undefined;
        setOutcomeEdit({ kind: 'idle' });
        outcomeRetry.current = undefined;
      } else setFeedback(copy.error);
    } catch {
      if (!controller.signal.aborted) setFeedback(copy.error);
    } finally {
      if (!controller.signal.aborted) setInFlight('none');
      if (detailRead.current === controller) detailRead.current = undefined;
    }
  }

  function closeDetail(): void {
    commandRequest.current?.abort();
    membersRequest.current?.abort();
    setSelected(undefined);
    setNextActionEdit({ kind: 'idle' });
    setAssociationProtection('idle');
    nextActionRetry.current = undefined;
    setResponsibleEdit({ kind: 'idle' });
    responsibleRetry.current = undefined;
    setOutcomeEdit({ kind: 'idle' });
    outcomeRetry.current = undefined;
    setInFlight('none');
  }

  // A vanished Opportunity follows the next-action missing flow: the detail
  // closes and the list is read again.
  async function closeMissingOpportunity(companyContextId: string) {
    setNextActionEdit({ kind: 'idle' });
    nextActionRetry.current = undefined;
    setResponsibleEdit({ kind: 'idle' });
    responsibleRetry.current = undefined;
    setOutcomeEdit({ kind: 'idle' });
    outcomeRetry.current = undefined;
    setSelected(undefined);
    setFeedback(copy.nextActionMissing);
    await loadRequests(companyContextId);
  }

  async function openResponsibleEditor(): Promise<void> {
    if (!companyId || !selected || pending) return;
    const opportunity = selected.request.initialOpportunity;
    membersRequest.current?.abort();
    const controller = new AbortController();
    membersRequest.current = controller;
    responsibleRetry.current = undefined;
    setResponsibleEdit({ kind: 'loading' });
    setFeedback('');
    try {
      const result = await request({
        path: `/commercial-intake/opportunities/${encodeURIComponent(opportunity.id)}/eligible-responsible-actors`,
        companyContextId: companyId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const access = await handleAccess(
        result,
        companyId,
        controller.signal,
        'responsible-update',
      );
      if (controller.signal.aborted) return;
      if (access === 'retained') {
        setResponsibleEdit({ kind: 'idle' });
        setFeedback(copy.responsibleDenied);
        return;
      }
      if (access === 'rejected') return;
      if (result.status === 404) {
        await closeMissingOpportunity(companyId);
        return;
      }
      if (result.status === 200 && isResponsibleCandidates(result.body)) {
        const { members } = result.body;
        // The recorded member is preselected only while still eligible.
        const current = opportunity.responsibleWorkspaceMembershipId;
        setResponsibleEdit({
          kind: 'choosing',
          members,
          selection: members.some(
            (member) => member.workspaceMembershipId === current,
          )
            ? current
            : '',
        });
        return;
      }
      setResponsibleEdit({ kind: 'load-error' });
      setFeedback(copy.responsibleMembersError);
    } catch {
      if (!controller.signal.aborted) {
        setResponsibleEdit({ kind: 'load-error' });
        setFeedback(copy.responsibleMembersError);
      }
    } finally {
      if (membersRequest.current === controller)
        membersRequest.current = undefined;
    }
  }

  // A late Opportunity result may settle its own mutation, but cannot replace
  // a Client projection already reread under the current authority.
  function applyOpportunityResponse({
    request: updated,
    responseRevision,
  }: {
    request: ClientRequest;
    responseRevision: number;
  }): void {
    setSelected((current) => {
      if (
        responseRevision !== clientProjection.current.revision &&
        current?.request.id === updated.id &&
        current.clientProjectionRevision === clientProjection.current.revision
      )
        return {
          ...current,
          request: {
            ...updated,
            version: current.request.version,
            clientAssociationStatus: current.request.clientAssociationStatus,
            clientReference: current.request.clientReference,
          },
        };
      return { request: updated, clientProjectionRevision: responseRevision };
    });
  }

  async function saveResponsible(): Promise<void> {
    if (!companyId || !selected || pending) return;
    if (
      responsibleEdit.kind !== 'choosing' &&
      responsibleEdit.kind !== 'uncertain'
    )
      return;
    const { members } = responsibleEdit;
    const preservedRetry =
      responsibleEdit.kind === 'uncertain'
        ? responsibleRetry.current
        : undefined;
    const workspaceMembershipId =
      preservedRetry?.workspaceMembershipId ?? responsibleEdit.selection;
    if (!workspaceMembershipId) return;
    const opportunityId =
      preservedRetry?.opportunityId ?? selected.request.initialOpportunity.id;
    const expectedVersion =
      preservedRetry?.expectedVersion ??
      selected.request.initialOpportunity.version;
    const previous = responsibleRetry.current;
    // An explicit retry reuses the key only for the exact same member and
    // observed version, so the server can replay the original receipt.
    const key =
      previous &&
      previous.opportunityId === opportunityId &&
      previous.expectedVersion === expectedVersion &&
      previous.workspaceMembershipId === workspaceMembershipId
        ? previous.key
        : crypto.randomUUID();
    responsibleRetry.current = {
      opportunityId,
      expectedVersion,
      workspaceMembershipId,
      key,
    };
    commandRequest.current?.abort();
    const controller = new AbortController();
    commandRequest.current = controller;
    responsibleCommand.current = controller;
    const startedUnderProjection = clientProjection.current.revision;
    setResponsibleEdit({
      kind: 'saving',
      members,
      selection: workspaceMembershipId,
    });
    setInFlight('responsible');
    setFeedback('');
    try {
      const result = await request({
        path: `/commercial-intake/opportunities/${encodeURIComponent(opportunityId)}/responsible`,
        companyContextId: companyId,
        signal: controller.signal,
        method: 'POST',
        body: JSON.stringify({ expectedVersion, workspaceMembershipId }),
        idempotencyKey: key,
      });
      if (responsibleCommand.current === controller)
        responsibleCommand.current = undefined;
      if (controller.signal.aborted) return;
      const access = await handleAccess(
        result,
        companyId,
        controller.signal,
        'responsible-update',
      );
      if (controller.signal.aborted) return;
      if (access === 'retained') {
        // Reassignment authority was lost while read authority remains: the
        // editor and pending command are dropped, the read-only detail stays.
        setResponsibleEdit({ kind: 'idle' });
        responsibleRetry.current = undefined;
        setFeedback(copy.responsibleDenied);
        return;
      }
      if (access === 'rejected') return;
      if (result.status === 404) {
        await closeMissingOpportunity(companyId);
        return;
      }
      if (result.status === 409) {
        setResponsibleEdit({ kind: 'conflict' });
        responsibleRetry.current = undefined;
        setFeedback(copy.responsibleConflict);
        return;
      }
      if (result.status === 400) {
        setResponsibleEdit({ kind: 'unavailable' });
        responsibleRetry.current = undefined;
        setFeedback(copy.responsibleUnavailable);
        return;
      }
      if (result.status === 200 && isResponsibleChangeResult(result.body)) {
        const { receipt, request: updated } = result.body;
        applyOpportunityResponse({
          request: updated,
          responseRevision: startedUnderProjection,
        });
        setResponsibleEdit({ kind: 'idle' });
        responsibleRetry.current = undefined;
        setFeedback(
          receipt.outcome === 'updated'
            ? copy.responsibleChanged
            : copy.responsibleUnchanged,
        );
        if (receipt.outcome === 'updated') await onActivityRecorded();
        if (!controller.signal.aborted) await loadRequests(companyId);
        return;
      }
      setResponsibleEdit({
        kind: 'uncertain',
        members,
        selection: workspaceMembershipId,
      });
      setFeedback(copy.responsibleUncertain);
    } catch {
      if (!controller.signal.aborted) {
        setResponsibleEdit({
          kind: 'uncertain',
          members,
          selection: workspaceMembershipId,
        });
        setFeedback(copy.responsibleUncertain);
      }
    } finally {
      if (!controller.signal.aborted) setInFlight('none');
    }
  }

  async function saveOutcome(): Promise<void> {
    if (!companyId || !selected || pending) return;
    if (outcomeEdit.kind !== 'editing' && outcomeEdit.kind !== 'uncertain')
      return;
    const { draft } = outcomeEdit;
    // An uncertain outcome resends exactly its payload, observed version and
    // key; a new draft builds its body from the shown version.
    const preservedRetry =
      outcomeEdit.kind === 'uncertain' ? outcomeRetry.current : undefined;
    const opportunityId =
      preservedRetry?.opportunityId ?? selected.request.initialOpportunity.id;
    let command: string;
    if (preservedRetry) command = preservedRetry.body;
    else {
      const body = outcomeCommandBody(
        draft,
        selected.request.initialOpportunity.version,
      );
      if (!body) {
        setFeedback(copy.outcomeValidation);
        return;
      }
      command = JSON.stringify(body);
    }
    const previous = outcomeRetry.current;
    const key =
      previous &&
      previous.opportunityId === opportunityId &&
      previous.body === command
        ? previous.key
        : crypto.randomUUID();
    outcomeRetry.current = { opportunityId, body: command, key };
    commandRequest.current?.abort();
    const controller = new AbortController();
    commandRequest.current = controller;
    outcomeCommand.current = controller;
    const startedUnderProjection = clientProjection.current.revision;
    setOutcomeEdit({ kind: 'saving', draft });
    setInFlight('outcome');
    setFeedback('');
    try {
      const result = await request({
        path: `/commercial-intake/opportunities/${encodeURIComponent(opportunityId)}/outcome`,
        companyContextId: companyId,
        signal: controller.signal,
        method: 'POST',
        body: command,
        idempotencyKey: key,
      });
      if (outcomeCommand.current === controller)
        outcomeCommand.current = undefined;
      if (controller.signal.aborted) return;
      const access = await handleAccess(
        result,
        companyId,
        controller.signal,
        'outcome-update',
      );
      if (controller.signal.aborted) return;
      if (access === 'retained') {
        // Outcome authority was lost while read authority remains: the draft
        // and pending command are dropped, the read-only detail stays.
        setOutcomeEdit({ kind: 'idle' });
        outcomeRetry.current = undefined;
        setFeedback(copy.outcomeDenied);
        return;
      }
      if (access === 'rejected') return;
      if (result.status === 404) {
        await closeMissingOpportunity(companyId);
        return;
      }
      if (result.status === 409) {
        setOutcomeEdit({ kind: 'conflict' });
        outcomeRetry.current = undefined;
        setFeedback(copy.outcomeConflict);
        return;
      }
      if (result.status === 400) {
        setOutcomeEdit({ kind: 'editing', draft });
        outcomeRetry.current = undefined;
        setFeedback(copy.outcomeValidation);
        return;
      }
      if (
        result.status === 200 &&
        isOutcomeChangeResult(result.body, opportunityId)
      ) {
        applyOpportunityResponse({
          request: result.body.request,
          responseRevision: startedUnderProjection,
        });
        setOutcomeEdit({ kind: 'idle' });
        outcomeRetry.current = undefined;
        setFeedback(copy.outcomeChanged);
        await onActivityRecorded();
        if (!controller.signal.aborted) await loadRequests(companyId);
        return;
      }
      setOutcomeEdit({ kind: 'uncertain', draft });
      setFeedback(copy.outcomeUncertain);
    } catch {
      if (!controller.signal.aborted) {
        setOutcomeEdit({ kind: 'uncertain', draft });
        setFeedback(copy.outcomeUncertain);
      }
    } finally {
      if (!controller.signal.aborted) setInFlight('none');
    }
  }

  // One older page of the shown Opportunity's outcome history. Only Commercial
  // Intake read is needed; a lost read authority clears the scoped content.
  const loadOlderOutcomeHistory: OlderOutcomeHistory = async (cursor) => {
    if (!companyId || !selected) return undefined;
    const controller = new AbortController();
    try {
      const result = await request({
        path: `/commercial-intake/opportunities/${encodeURIComponent(selected.request.initialOpportunity.id)}/outcome-history?cursor=${encodeURIComponent(cursor)}`,
        companyContextId: companyId,
        signal: controller.signal,
      });
      if ((await handleAccess(result, companyId, controller.signal)) !== 'ok')
        return undefined;
      return result.status === 200 &&
        isOutcomeHistoryPage(result.body, isDisplayableTimestamp)
        ? result.body
        : undefined;
    } catch {
      return undefined;
    }
  };

  async function saveNextAction(): Promise<void> {
    if (!companyId || !selected || pending) return;
    if (
      nextActionEdit.kind !== 'editing' &&
      nextActionEdit.kind !== 'uncertain'
    )
      return;
    const preservedRetry =
      nextActionEdit.kind === 'uncertain' ? nextActionRetry.current : undefined;
    const draft = preservedRetry?.nextAction ?? nextActionEdit.draft;
    if (!draft.trim() || draft.length > 500) {
      setFeedback(copy.nextActionValidation);
      return;
    }
    const opportunityId =
      preservedRetry?.opportunityId ?? selected.request.initialOpportunity.id;
    const expectedVersion =
      preservedRetry?.expectedVersion ??
      selected.request.initialOpportunity.version;
    const previous = nextActionRetry.current;
    // An explicit retry reuses the key only for the exact same payload and
    // observed version, so the server can replay the original receipt.
    const key =
      previous &&
      previous.opportunityId === opportunityId &&
      previous.expectedVersion === expectedVersion &&
      previous.nextAction === draft
        ? previous.key
        : crypto.randomUUID();
    nextActionRetry.current = {
      opportunityId,
      expectedVersion,
      nextAction: draft,
      key,
    };
    commandRequest.current?.abort();
    const controller = new AbortController();
    commandRequest.current = controller;
    nextActionCommand.current = controller;
    const startedUnderProjection = clientProjection.current.revision;
    setNextActionEdit({ kind: 'saving', draft });
    setInFlight('next-action');
    setFeedback('');
    try {
      const result = await request({
        path: `/commercial-intake/opportunities/${encodeURIComponent(opportunityId)}/next-action`,
        companyContextId: companyId,
        signal: controller.signal,
        method: 'POST',
        body: JSON.stringify({ expectedVersion, nextAction: draft }),
        idempotencyKey: key,
      });
      if (nextActionCommand.current === controller)
        nextActionCommand.current = undefined;
      if (controller.signal.aborted) return;
      const access = await handleAccess(
        result,
        companyId,
        controller.signal,
        'next-action-update',
      );
      if (controller.signal.aborted) return;
      if (access === 'retained') {
        // Update authority was lost while read authority remains: the draft
        // and pending command are dropped, the read-only detail stays.
        setNextActionEdit({ kind: 'idle' });
        nextActionRetry.current = undefined;
        setFeedback(copy.nextActionDenied);
        return;
      }
      if (access === 'rejected') return;
      if (result.status === 404) {
        await closeMissingOpportunity(companyId);
        return;
      }
      if (result.status === 409) {
        setNextActionEdit({ kind: 'conflict' });
        nextActionRetry.current = undefined;
        setFeedback(copy.nextActionConflict);
        return;
      }
      if (result.status === 400) {
        setNextActionEdit({ kind: 'editing', draft });
        setFeedback(copy.nextActionValidation);
        return;
      }
      if (result.status === 200 && isNextActionUpdateResult(result.body)) {
        const { receipt, request: updated } = result.body;
        applyOpportunityResponse({
          request: updated,
          responseRevision: startedUnderProjection,
        });
        setNextActionEdit({ kind: 'idle' });
        nextActionRetry.current = undefined;
        setFeedback(
          receipt.outcome === 'updated'
            ? copy.nextActionSaved
            : copy.nextActionUnchanged,
        );
        if (receipt.outcome === 'updated') await onActivityRecorded();
        if (!controller.signal.aborted) await loadRequests(companyId);
        return;
      }
      setNextActionEdit({ kind: 'uncertain', draft });
      setFeedback(copy.nextActionUncertain);
    } catch {
      if (!controller.signal.aborted) {
        setNextActionEdit({ kind: 'uncertain', draft });
        setFeedback(copy.nextActionUncertain);
      }
    } finally {
      if (!controller.signal.aborted) setInFlight('none');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!companyId || pending) return;
    if (
      !form.originalText.trim() ||
      !form.opportunityTitle.trim() ||
      !form.nextAction.trim()
    ) {
      setFeedback(copy.validation);
      return;
    }
    const reportedReceivedAt = form.reportedReceivedAt
      ? localDateTimeToIso(form.reportedReceivedAt)
      : undefined;
    if (form.reportedReceivedAt && !reportedReceivedAt) {
      setFeedback(copy.validation);
      return;
    }
    const command = {
      originalText: form.originalText,
      ...(form.sourceLabel ? { sourceLabel: form.sourceLabel } : {}),
      ...(reportedReceivedAt ? { reportedReceivedAt } : {}),
      ...(form.subject ? { subject: form.subject } : {}),
      ...(form.clientAccountId
        ? { clientAccountId: form.clientAccountId }
        : {}),
      opportunity: {
        title: form.opportunityTitle,
        ...(form.opportunityScope ? { scope: form.opportunityScope } : {}),
        nextAction: form.nextAction,
      },
    };
    const payload = JSON.stringify(command);
    const idempotencyKey =
      retry.current?.payload === payload
        ? retry.current.key
        : crypto.randomUUID();
    retry.current = {
      payload,
      key: idempotencyKey,
      hasClient: Boolean(form.clientAccountId),
    };
    commandRequest.current?.abort();
    const controller = new AbortController();
    commandRequest.current = controller;
    const startedUnderProjection = clientProjection.current.revision;
    setInFlight('capture');
    setCaptureUncertain(false);
    setFeedback('');
    try {
      const result = await request({
        path: '/commercial-intake/requests',
        companyContextId: companyId,
        signal: controller.signal,
        method: 'POST',
        body: payload,
        idempotencyKey,
      });
      if (controller.signal.aborted) return;
      if ((await handleAccess(result, companyId, controller.signal)) !== 'ok')
        return;
      if (isUnavailableClient(result)) {
        setFeedback(copy.unavailableClient);
        return;
      }
      // Invalid fields are rejected without persistence, so the capture is
      // settled rather than uncertain; the entered values stay for correction.
      if (result.status === 400) {
        setFeedback(copy.error);
        return;
      }
      if (
        (result.status === 200 || result.status === 201) &&
        isClientRequest(result.body)
      ) {
        setSelected({
          request: result.body,
          clientProjectionRevision: startedUnderProjection,
        });
        setForm(emptyForm);
        retry.current = undefined;
        await onActivityRecorded();
        if (!controller.signal.aborted) await loadRequests(companyId);
        return;
      }
      setFeedback(copy.error);
      setCaptureUncertain(true);
    } catch {
      if (!controller.signal.aborted) {
        setFeedback(copy.error);
        setCaptureUncertain(true);
      }
    } finally {
      if (!controller.signal.aborted) setInFlight('none');
    }
  }

  // The section is its own navigation destination in both frames, because the
  // shell's layout wrapper generates no box that could receive focus.
  if (load.kind === 'denied') {
    return (
      <section
        id="requests"
        tabIndex={-1}
        className="commercial-intake-workspace"
      >
        <p role="alert">{copy.denied}</p>
      </section>
    );
  }
  const companyName = actor.activeCompany?.displayName ?? actor.workspaceName;
  const visibleRequest = selected
    ? canSearchClients &&
      selected.clientProjectionRevision === clientProjectionRevision
      ? selected.request
      : requestWithoutClientProjection(selected.request)
    : undefined;
  const visibleLoad: LoadState =
    load.kind === 'ready' &&
    (!canSearchClients ||
      load.clientProjectionRevision !== clientProjectionRevision)
      ? { ...load, items: load.items.map(itemWithoutClientProjection) }
      : load;
  const visibleRestriction =
    canSearchClients &&
    load.kind === 'ready' &&
    load.clientProjectionRevision === clientProjectionRevision
      ? restriction
      : undefined;
  const dossierTarget = visibleRequest?.clientReference?.currentClientId;
  return (
    <section
      id="requests"
      tabIndex={-1}
      className="commercial-intake-workspace"
      aria-labelledby="commercial-intake-title"
    >
      <header className="commercial-intake-heading">
        <p>{copy.eyebrow}</p>
        <h2 id="commercial-intake-title">{copy.title}</h2>
        <p>
          {copy.companyPrefix} {companyName}
        </p>
      </header>
      <aside
        className="commercial-intake-source"
        aria-label="Manual source information"
      >
        <strong>{copy.manualSource}</strong>
        <p>{copy.manualSourceDetail}</p>
      </aside>
      {feedback ? <p role="alert">{feedback}</p> : null}
      {requestToOpen && protectedWork ? (
        <p role="status" className="commercial-intake-held-request">
          {protectedWork === 'capture'
            ? copy.requestedAfterCapture
            : protectedWork === 'client-association'
              ? copy.requestedAfterClientAssociation
              : protectedWork === 'responsible-edit'
                ? copy.requestedAfterResponsibleEdit
                : protectedWork === 'outcome-edit'
                  ? copy.requestedAfterOutcomeEdit
                  : copy.requestedAfterNextActionEdit}
        </p>
      ) : null}
      {selected && visibleRequest ? (
        <RequestDetail
          onOpenProject={onOpenProject}
          actor={actor}
          identity={identity}
          request={visibleRequest}
          clientAuthority={clientReadAuthority}
          onBack={closeDetail}
          pending={pending}
          onOpenClientDossier={
            dossierTarget && onOpenClientDossier
              ? () => onOpenClientDossier(dossierTarget)
              : undefined
          }
          responsible={
            canChangeResponsible
              ? {
                  edit: responsibleEdit,
                  current: selected.request.initialOpportunity.responsibleActor,
                  blocked:
                    nextActionEdit.kind !== 'idle' ||
                    outcomeEdit.kind !== 'idle',
                  onOpen: () => void openResponsibleEditor(),
                  onSelect: (workspaceMembershipId) =>
                    setResponsibleEdit((current) =>
                      current.kind === 'choosing'
                        ? { ...current, selection: workspaceMembershipId }
                        : current,
                    ),
                  onSave: () => void saveResponsible(),
                  onCancel: () => {
                    membersRequest.current?.abort();
                    setResponsibleEdit({ kind: 'idle' });
                    responsibleRetry.current = undefined;
                    setFeedback('');
                  },
                  onReloadList: () => void openResponsibleEditor(),
                  onReloadRequest: () =>
                    void selectRequest(selected.request.id, true),
                }
              : undefined
          }
          nextAction={
            canEditNextAction
              ? {
                  edit: nextActionEdit,
                  blocked:
                    responsibleEdit.kind !== 'idle' ||
                    outcomeEdit.kind !== 'idle',
                  onEdit: () => {
                    setFeedback('');
                    setNextActionEdit({
                      kind: 'editing',
                      draft: selected.request.initialOpportunity.nextAction,
                    });
                  },
                  onDraftChange: (draft) =>
                    setNextActionEdit((current) =>
                      current.kind === 'editing'
                        ? { ...current, draft }
                        : current,
                    ),
                  onSave: () => void saveNextAction(),
                  onCancel: () => {
                    setNextActionEdit({ kind: 'idle' });
                    nextActionRetry.current = undefined;
                    setFeedback('');
                  },
                  onReload: () => void selectRequest(selected.request.id, true),
                }
              : undefined
          }
          outcome={
            canChangeOutcome
              ? {
                  edit: outcomeEdit,
                  current: selected.request.initialOpportunity.status,
                  blocked:
                    nextActionEdit.kind !== 'idle' ||
                    responsibleEdit.kind !== 'idle' ||
                    associationOpen,
                  onOpen: () => {
                    setFeedback('');
                    outcomeRetry.current = undefined;
                    setOutcomeEdit({
                      kind: 'editing',
                      draft: EMPTY_OUTCOME_DRAFT,
                    });
                  },
                  onDraftChange: (draft) =>
                    setOutcomeEdit((current) =>
                      current.kind === 'editing'
                        ? { ...current, draft }
                        : current,
                    ),
                  onSave: () => void saveOutcome(),
                  onCancel: () => {
                    setOutcomeEdit({ kind: 'idle' });
                    outcomeRetry.current = undefined;
                    setFeedback('');
                  },
                  onReload: () => void selectRequest(selected.request.id, true),
                }
              : undefined
          }
          loadOlderOutcomeHistory={loadOlderOutcomeHistory}
          clientAssociation={
            companyId &&
            canAssociateClient &&
            selected.request.clientAssociationStatus === 'absent' ? (
              <RequestClientAssociation
                key={clientAssociationAuthority}
                identity={identity}
                companyId={companyId}
                requestId={selected.request.id}
                expectedVersion={selected.request.version}
                clientIdentityRevision={clientIdentityRevision}
                blocked={
                  nextActionEditOpen || responsibleEditOpen || outcomeEditOpen
                }
                request={request}
                handleAccess={handleAccess}
                onProtectionChange={setAssociationProtection}
                onDraftChange={setAssociationDraft}
                onAssociated={async (value, startedUnderRevision) => {
                  if (
                    !isClientRequest(value) ||
                    clientProjection.current.revision !==
                      clientProjectionRevision ||
                    startedUnderRevision !== identityRevision.current
                  )
                    return false;
                  setAssociationProtection('idle');
                  setSelected({
                    request: value,
                    clientProjectionRevision,
                  });
                  if (startedUnderRevision === identityRevision.current)
                    setLoad((current) =>
                      current.kind !== 'ready' ||
                      current.clientProjectionRevision !==
                        clientProjectionRevision ||
                      !value.clientReference
                        ? current
                        : {
                            ...current,
                            items: current.items.map((item) =>
                              item.id === value.id && value.clientReference
                                ? listItemWithClientProjection(
                                    item,
                                    value.clientReference,
                                  )
                                : item,
                            ),
                          },
                    );
                  setFeedback(copy.clientAssociationSuccess);
                  await onActivityRecorded();
                  return true;
                }}
              />
            ) : undefined
          }
          onCompanyContextRejected={onCompanyContextRejected}
          onActorRevalidated={onActorRevalidated}
          onWorkspaceAccessRejected={onWorkspaceAccessRejected}
        />
      ) : (
        <>
          <form
            className="commercial-intake-form"
            noValidate
            onSubmit={(event) => void submit(event)}
          >
            <label>
              {copy.originalText}
              <textarea
                value={form.originalText}
                onChange={(event) =>
                  updateField('originalText', event.target.value)
                }
                required
                maxLength={20000}
              />
            </label>
            <label>
              {copy.sourceLabel}
              <input
                value={form.sourceLabel}
                onChange={(event) =>
                  updateField('sourceLabel', event.target.value)
                }
                maxLength={120}
              />
            </label>
            <label>
              {copy.reportedReceivedAt}
              <input
                type="datetime-local"
                value={form.reportedReceivedAt}
                onChange={(event) =>
                  updateField('reportedReceivedAt', event.target.value)
                }
              />
            </label>
            <label>
              {copy.subject}
              <input
                value={form.subject}
                onChange={(event) => updateField('subject', event.target.value)}
                maxLength={200}
              />
            </label>
            {canSearchClients ? (
              <div className="commercial-intake-field">
                <label htmlFor="commercial-intake-client-search">
                  {copy.clientSearch}
                </label>
                <input
                  id="commercial-intake-client-search"
                  value={clientQuery}
                  onChange={(event) => {
                    setClientQuery(event.target.value);
                    setClientSearch({ kind: 'idle' });
                    updateField('clientAccountId', '');
                  }}
                  maxLength={200}
                />
                <button
                  type="button"
                  disabled={clientSearch.kind === 'loading'}
                  onClick={() => void searchClients()}
                >
                  {copy.searchClients}
                </button>
                {clientSearch.kind === 'ready' ? (
                  clientSearch.clients.length > 0 ? (
                    <>
                      <label htmlFor="commercial-intake-client">
                        {copy.existingClient}
                      </label>
                      <Select
                        id="commercial-intake-client"
                        value={form.clientAccountId}
                        placeholder={copy.noClient}
                        options={clientSearch.clients.map((client) => ({
                          value: client.id,
                          label: client.displayName,
                        }))}
                        onValueChange={(value) =>
                          updateField('clientAccountId', value)
                        }
                      />
                    </>
                  ) : (
                    <p>{copy.clientSearchEmpty}</p>
                  )
                ) : clientSearch.kind === 'denied' ? (
                  <p>{copy.clientSearchDenied}</p>
                ) : clientSearch.kind === 'validation' ? (
                  <p>{copy.clientSearchValidation}</p>
                ) : clientSearch.kind === 'error' ? (
                  <p>{copy.clientSearchError}</p>
                ) : null}
                <small>{copy.clientHelp}</small>
              </div>
            ) : (
              <p>{copy.clientSearchDenied}</p>
            )}
            <label>
              {copy.opportunityTitle}
              <input
                value={form.opportunityTitle}
                onChange={(event) =>
                  updateField('opportunityTitle', event.target.value)
                }
                required
                maxLength={160}
              />
            </label>
            <label>
              {copy.opportunityScope}
              <textarea
                value={form.opportunityScope}
                onChange={(event) =>
                  updateField('opportunityScope', event.target.value)
                }
                maxLength={2000}
              />
            </label>
            <label>
              {copy.nextAction}
              <input
                value={form.nextAction}
                onChange={(event) =>
                  updateField('nextAction', event.target.value)
                }
                required
                maxLength={500}
              />
            </label>
            <button type="submit" disabled={pending}>
              {copy.capture}
            </button>
          </form>
          <RequestList
            load={visibleLoad}
            pending={pending}
            filter={filter}
            onFilter={setFilter}
            restriction={visibleRestriction}
            onClearRestriction={() => setRestriction(undefined)}
            onSelect={(id) => {
              // Choosing a row is newer than a Request held behind a capture.
              setRequestToOpen(undefined);
              void selectRequest(id);
            }}
            onReload={() => companyId && void loadRequests(companyId)}
            onLoadOlder={(cursor) =>
              companyId && void loadRequests(companyId, cursor)
            }
            companyName={companyName}
            onOpenClientDossier={onOpenClientDossier}
          />
        </>
      )}
    </section>
  );
}

// Retire only the derived Client identity; evidence and Opportunity state stay.
function requestWithoutClientProjection(request: ClientRequest): ClientRequest {
  return {
    ...request,
    clientAssociationStatus:
      request.clientAssociationStatus === 'visible'
        ? 'hidden'
        : request.clientAssociationStatus,
    clientReference: undefined,
  };
}

function itemWithoutClientProjection(item: RequestListItem): RequestListItem {
  return { ...item, clientDisplayName: undefined, clientDossierId: undefined };
}

function startedPage({
  current,
  companyContextId,
  cursor,
}: {
  current: LoadState;
  companyContextId: string;
  cursor: string | undefined;
}): LoadState {
  if (!cursor) return { kind: 'loading' };
  return sameCompanyPage(current, companyContextId)
    ? { ...current, olderPage: 'loading' }
    : current;
}

function appliedPage({
  current,
  companyContextId,
  cursor,
  page,
  clientProjectionRevision,
}: {
  current: LoadState;
  companyContextId: string;
  cursor: string | undefined;
  page: RequestPage | undefined;
  clientProjectionRevision: number;
}): LoadState {
  if (!cursor)
    return page
      ? readyPage({
          companyId: companyContextId,
          clientProjectionRevision,
          items: page.items,
          nextCursor: page.nextCursor,
        })
      : { kind: 'error' };
  if (
    !sameCompanyPage(current, companyContextId) ||
    current.clientProjectionRevision !== clientProjectionRevision
  )
    return current;
  return page
    ? readyPage({
        companyId: companyContextId,
        clientProjectionRevision,
        items: [...current.items, ...page.items],
        nextCursor: page.nextCursor,
      })
    : { ...current, olderPage: 'error' };
}

function sameCompanyPage(
  current: LoadState,
  companyContextId: string,
): current is Extract<LoadState, { kind: 'ready' }> {
  return current.kind === 'ready' && current.companyId === companyContextId;
}

function readyPage({
  companyId,
  clientProjectionRevision,
  items,
  nextCursor,
}: {
  companyId: string;
  clientProjectionRevision: number;
  items: RequestListItem[];
  nextCursor: string | undefined;
}): LoadState {
  return {
    kind: 'ready',
    companyId,
    clientProjectionRevision,
    items,
    olderPage: 'idle',
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}

function RequestList({
  load,
  pending,
  filter,
  onFilter,
  restriction,
  onClearRestriction,
  onSelect,
  onReload,
  onLoadOlder,
  companyName,
  onOpenClientDossier,
}: {
  load: LoadState;
  pending: boolean;
  filter: string;
  onFilter: (filter: string) => void;
  restriction: ClientRestriction | undefined;
  onClearRestriction: () => void;
  onSelect: (id: string) => void;
  onReload: () => void;
  onLoadOlder: (cursor: string) => void;
  companyName: string;
  onOpenClientDossier?: (clientDossierId: string) => void;
}) {
  const filterField = useRef<HTMLInputElement>(null);
  if (load.kind === 'loading') return <p>{copy.loading}</p>;
  if (load.kind === 'denied') return <p role="alert">{copy.denied}</p>;
  if (load.kind === 'error')
    return (
      <>
        <p role="alert">{copy.error}</p>
        <button type="button" onClick={onReload}>
          {copy.retry}
        </button>
      </>
    );
  if (load.items.length === 0) return <p>{copy.empty(companyName)}</p>;
  const nextCursor = load.nextCursor;
  // Identity equality only: a row without a derived dossier never matches,
  // and a same-named Client is a different dossier.
  const restricted = restriction
    ? load.items.filter(
        (item) => item.clientDossierId === restriction.clientDossierId,
      )
    : load.items;
  const matching = restricted.filter((item) =>
    matchesFilter(item, filter.trim().toLowerCase()),
  );
  return (
    <>
      {restriction ? (
        <div
          className="commercial-intake-restriction"
          role="group"
          aria-labelledby="commercial-intake-restriction-label"
        >
          <p id="commercial-intake-restriction-label">
            <strong>{copy.restrictionLabel(restriction.displayName)}</strong>
          </p>
          <small>{copy.restrictionHelp}</small>
          {/* Clearing removes this button, so keyboard focus moves to the filter. */}
          <button
            type="button"
            onClick={() => {
              onClearRestriction();
              filterField.current?.focus();
            }}
          >
            {copy.restrictionClear}
          </button>
        </div>
      ) : null}
      <div className="commercial-intake-filter">
        <label htmlFor="commercial-intake-filter">{copy.filterLabel}</label>
        <input
          id="commercial-intake-filter"
          ref={filterField}
          type="search"
          value={filter}
          aria-describedby="commercial-intake-filter-help"
          onChange={(event) => onFilter(event.target.value)}
          maxLength={200}
        />
        {filter ? (
          // Clearing removes this button, so keyboard focus returns to the field.
          <button
            type="button"
            onClick={() => {
              onFilter('');
              filterField.current?.focus();
            }}
          >
            {copy.filterClear}
          </button>
        ) : null}
        <small id="commercial-intake-filter-help">{copy.filterHelp}</small>
      </div>
      {restriction && restricted.length === 0 ? (
        <p>{copy.restrictionNoMatch(restriction.displayName)}</p>
      ) : matching.length === 0 ? (
        <p>{copy.filterNoMatch}</p>
      ) : null}
      <ul className="commercial-intake-list" aria-label={copy.list}>
        {matching.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => onSelect(item.id)}
            >
              <strong>{item.subject ?? copy.title}</strong>
              <span>{item.initialOpportunity.title}</span>
              <small>
                {copy.status}:{' '}
                {copy.opportunityStatusLabels[item.initialOpportunity.status]}
              </small>
              <small>
                {copy.nextAction}: {item.initialOpportunity.nextAction}
              </small>
              <small>
                {copy.responsible}:{' '}
                {item.initialOpportunity.responsibleActor.displayName}
              </small>
              <small>
                {copy.capturedAt}:{' '}
                <time dateTime={item.capturedAt}>
                  {formatApplicationDateTime(item.capturedAt)}
                </time>
              </small>
            </button>
            {item.clientDisplayName ? (
              <p>
                {`${copy.client}: ${item.clientDisplayName} `}
                {item.clientDossierId && onOpenClientDossier ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (item.clientDossierId)
                        onOpenClientDossier(item.clientDossierId);
                    }}
                  >
                    {copy.openClientDossier}
                  </button>
                ) : null}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {load.olderPage === 'loading' ? (
        <p role="status">{copy.olderLoading}</p>
      ) : null}
      {load.olderPage === 'error' ? (
        <p role="alert">{copy.olderError}</p>
      ) : null}
      {nextCursor ? (
        <button
          type="button"
          disabled={load.olderPage === 'loading'}
          onClick={() => onLoadOlder(nextCursor)}
        >
          {copy.showOlder}
        </button>
      ) : null}
    </>
  );
}

// The loaded rows carry no original source text. The local filter matches only
// the subject, initial Opportunity title and responsible name; the next action
// shown in each row is deliberately not a filter criterion.
function matchesFilter(
  item: RequestListItem,
  normalizedFilter: string,
): boolean {
  if (!normalizedFilter) return true;
  return [
    item.subject ?? '',
    item.initialOpportunity.title,
    item.initialOpportunity.responsibleActor.displayName,
  ].some((value) => value.toLowerCase().includes(normalizedFilter));
}

type NextActionEditor = {
  edit: NextActionEdit;
  /** The responsible-actor editor is open, so this one cannot start. */
  blocked: boolean;
  onEdit: () => void;
  onDraftChange: (draft: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onReload: () => void;
};

function RequestDetail({
  onOpenProject,
  clientAuthority,
  actor,
  identity,
  request,
  onBack,
  pending,
  onOpenClientDossier,
  responsible,
  nextAction,
  outcome,
  loadOlderOutcomeHistory,
  clientAssociation,
  onCompanyContextRejected,
  onActorRevalidated,
  onWorkspaceAccessRejected,
}: {
  actor: ActorContext;
  onOpenProject?: (projectId: string) => void;
  identity: BrowserIdentity;
  request: ClientRequest;
  onBack: () => void;
  pending: boolean;
  /** Offered only for a current dossier identity, never a name or original id. */
  onOpenClientDossier: (() => void) | undefined;
  /** Offered only with reassignment authority and the Intake reads. */
  responsible: ResponsibleEditor | undefined;
  nextAction: NextActionEditor | undefined;
  /** Offered only with the outcome permission and the Intake reads. */
  outcome: OutcomeEditor | undefined;
  loadOlderOutcomeHistory: OlderOutcomeHistory;
  clientAssociation: ReactNode;
  clientAuthority: string;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}) {
  return (
    <article
      className="commercial-intake-detail"
      aria-labelledby="commercial-intake-detail-title"
    >
      <button type="button" onClick={onBack} disabled={pending}>
        {copy.back}
      </button>
      <p>{copy.detail}</p>
      <h3 id="commercial-intake-detail-title">
        {request.subject ?? copy.title}
      </h3>
      <dl>
        <div>
          <dt>{copy.source}</dt>
          <dd>{copy.sourceKindLabels[request.sourceKind]}</dd>
        </div>
        {request.sourceLabel ? (
          <div>
            <dt>{copy.sourceLabel}</dt>
            <dd>{request.sourceLabel}</dd>
          </div>
        ) : null}
        <div>
          <dt>{copy.capturedAt}</dt>
          <dd>
            <time dateTime={request.capturedAt}>
              {formatApplicationDateTime(request.capturedAt)}
            </time>
            <small>{copy.capturedAtHelp}</small>
          </dd>
        </div>
        {request.reportedReceivedAt ? (
          <div>
            <dt>{copy.reportedReceivedAt}</dt>
            <dd>
              <time dateTime={request.reportedReceivedAt}>
                {formatApplicationDateTime(request.reportedReceivedAt)}
              </time>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>{copy.originalText}</dt>
          <dd>{request.originalText}</dd>
        </div>
        {request.clientReference ? (
          <div>
            <dt>{copy.client}</dt>
            <dd>
              {request.clientReference.displayName}
              {onOpenClientDossier ? (
                <button type="button" onClick={onOpenClientDossier}>
                  {copy.openClientDossier}
                </button>
              ) : null}
            </dd>
          </div>
        ) : request.clientAssociationStatus === 'absent' ? (
          <div>
            <dt>{copy.client}</dt>
            <dd>{copy.noClientAssociated}</dd>
          </div>
        ) : request.clientAssociationStatus === 'hidden' ? (
          <div>
            <dt>{copy.client}</dt>
            <dd>{copy.clientAssociationHidden}</dd>
          </div>
        ) : null}
      </dl>
      {clientAssociation}
      <section>
        <h4>{copy.initialOpportunity}</h4>
        <p>{request.initialOpportunity.title}</p>
        {request.initialOpportunity.scope ? (
          <p>{request.initialOpportunity.scope}</p>
        ) : null}
        <p>
          {copy.nextAction}: {request.initialOpportunity.nextAction}
        </p>
        <p>
          {copy.responsible}:{' '}
          {request.initialOpportunity.responsibleActor.displayName}
        </p>
        {responsible ? (
          <OpportunityResponsible editor={responsible} pending={pending} />
        ) : null}
        <p>
          {copy.status}:{' '}
          {copy.opportunityStatusLabels[request.initialOpportunity.status]}
          {' · '}
          {copy.statusEnteredAt}{' '}
          <time dateTime={request.initialOpportunity.statusEnteredAt}>
            {formatApplicationDateTime(
              request.initialOpportunity.statusEnteredAt,
            )}
          </time>
        </p>
        {outcome ? (
          <OpportunityOutcome editor={outcome} pending={pending} />
        ) : null}
        <OpportunityOutcomeHistory
          key={`${request.initialOpportunity.id}:${request.initialOpportunity.version}`}
          page={request.initialOpportunity.outcomeHistory}
          loadOlder={loadOlderOutcomeHistory}
        />
        <p>
          {copy.opportunityVersion}: {request.initialOpportunity.version}
        </p>
        {nextAction ? (
          <NextActionEditForm editor={nextAction} pending={pending} />
        ) : null}
      </section>
      <ProfitabilityEstimatePanel
        actor={actor}
        identity={identity}
        opportunityId={request.initialOpportunity.id}
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
      <PricingSnapshotPanel
        key={`${clientAuthority}:${request.initialOpportunity.id}:${actor.activeCompany?.pricingUserPermissionAssignmentId ?? 'no-assignment'}:${actor.activeCompany?.pricingUserPermissionSetVersion ?? 'no-version'}:${actor.activeCompany?.pricingUserPermissions?.join(',') ?? ''}:${actor.activeCompany?.pricingAdjustmentPermissionAssignmentId ?? 'no-adjustment-assignment'}:${actor.activeCompany?.pricingAdjustmentPermissionSetVersion ?? 'no-adjustment-version'}:${actor.activeCompany?.pricingAdjustmentPermissions?.join(',') ?? ''}`}
        actor={actor}
        identity={identity}
        opportunityId={request.initialOpportunity.id}
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
      <OfferPanel
        key={`offer:${clientAuthority}:${actor.internalUserId}:${actor.workspaceId}:${actor.workspaceMembershipId}:${request.id}:${request.initialOpportunity.id}:${actor.activeCompany?.offerPermissionAssignmentId ?? 'no-assignment'}:${actor.activeCompany?.offerPermissionSetVersion ?? 'no-version'}:${actor.activeCompany?.offerPermissions?.join(',') ?? ''}:${request.clientReference?.currentClientId ?? 'no-client'}`}
        actor={actor}
        identity={identity}
        opportunityId={request.initialOpportunity.id}
        currentClientId={request.clientReference?.currentClientId}
        clientDisplayName={request.clientReference?.displayName}
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
      <ContractPanel
        currentClientId={request.clientReference?.currentClientId}
        onOpenProject={onOpenProject}
        opportunityTitle={request.initialOpportunity.title}
        key={
          clientAuthority +
          ':' +
          request.id +
          ':' +
          request.initialOpportunity.id
        }
        actor={actor}
        identity={identity}
        opportunityId={request.initialOpportunity.id}
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
    </article>
  );
}

function NextActionEditForm({
  editor,
  pending,
}: {
  editor: NextActionEditor;
  pending: boolean;
}) {
  const { edit } = editor;
  switch (edit.kind) {
    case 'idle':
      return (
        <button
          type="button"
          onClick={editor.onEdit}
          disabled={pending || editor.blocked}
        >
          {copy.editNextAction}
        </button>
      );
    case 'conflict':
      return (
        <button type="button" onClick={editor.onReload} disabled={pending}>
          {copy.reloadRequest}
        </button>
      );
    case 'editing':
    case 'saving':
    case 'uncertain': {
      const saving = edit.kind === 'saving';
      return (
        <form
          className="commercial-intake-next-action"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            editor.onSave();
          }}
        >
          <label>
            {copy.nextAction}
            <input
              value={edit.draft}
              onChange={(event) => editor.onDraftChange(event.target.value)}
              required
              maxLength={500}
              disabled={saving || edit.kind === 'uncertain'}
            />
          </label>
          {saving ? <p role="status">{copy.nextActionSaving}</p> : null}
          <div className="commercial-intake-next-action-actions">
            <button type="submit" disabled={pending}>
              {edit.kind === 'uncertain'
                ? copy.retryNextAction
                : copy.saveNextAction}
            </button>
            <button type="button" onClick={editor.onCancel} disabled={saving}>
              {copy.cancelNextAction}
            </button>
          </div>
        </form>
      );
    }
    default:
      return assertNeverEdit(edit);
  }
}

function assertNeverEdit(edit: never): never {
  throw new Error(`Unexpected next-action edit state: ${JSON.stringify(edit)}`);
}

function isUnavailableClient(result: HttpResult): boolean {
  return (
    (result.status === 404 || result.status === 409) &&
    isRecord(result.body) &&
    result.body.code === 'CLIENT_REFERENCE_UNAVAILABLE'
  );
}

function isRequestList(value: unknown): value is RequestPage {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isRequestListItem) &&
    (value.nextCursor === undefined || typeof value.nextCursor === 'string')
  );
}

function isRequestListItem(value: unknown): value is RequestListItem {
  if (!isRecord(value)) return false;
  const hasValidClientProjection =
    (value.clientDisplayName === undefined &&
      value.clientDossierId === undefined) ||
    (typeof value.clientDisplayName === 'string' &&
      (value.clientDossierId === undefined ||
        typeof value.clientDossierId === 'string'));
  return (
    typeof value.id === 'string' &&
    isNullableString(value.subject) &&
    isDisplayableTimestamp(value.capturedAt) &&
    hasValidClientProjection &&
    isRecord(value.initialOpportunity) &&
    typeof value.initialOpportunity.title === 'string' &&
    typeof value.initialOpportunity.nextAction === 'string' &&
    isOpportunityOutcomeStatus(value.initialOpportunity.status) &&
    isResponsibleActor(value.initialOpportunity.responsibleActor)
  );
}

function listItemWithClientProjection(
  item: RequestListItem,
  reference: NonNullable<ClientRequest['clientReference']>,
): RequestListItem {
  return {
    id: item.id,
    subject: item.subject,
    capturedAt: item.capturedAt,
    initialOpportunity: item.initialOpportunity,
    clientDisplayName: reference.displayName,
    ...(reference.currentClientId
      ? { clientDossierId: reference.currentClientId }
      : {}),
  };
}

// The list and the detail carry the same actor projection, so an unrecognized
// shape fails closed in both instead of inferring an identity in the browser.
function isResponsibleActor(value: unknown): value is ResponsibleActor {
  return (
    isRecord(value) &&
    typeof value.workspaceMembershipId === 'string' &&
    typeof value.displayName === 'string'
  );
}

function isClientRequest(value: unknown): value is ClientRequest {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.companyId === 'string' &&
    value.sourceKind === 'MANUAL_TEXT' &&
    isNullableString(value.sourceLabel) &&
    (value.reportedReceivedAt === null ||
      isDisplayableTimestamp(value.reportedReceivedAt)) &&
    isNullableString(value.subject) &&
    typeof value.originalText === 'string' &&
    typeof value.capturedByWorkspaceMembershipId === 'string' &&
    isDisplayableTimestamp(value.capturedAt) &&
    (value.version === 1 || value.version === 2) &&
    isInitialOpportunity(value.initialOpportunity) &&
    (value.clientAssociationStatus === 'absent' ||
      value.clientAssociationStatus === 'hidden' ||
      value.clientAssociationStatus === 'visible') &&
    !(
      value.clientAssociationStatus === 'absent' &&
      (value.version !== 1 || value.clientReference !== undefined)
    ) &&
    !(
      value.clientAssociationStatus === 'visible' &&
      value.clientReference === undefined
    ) &&
    !(
      value.clientReference !== undefined &&
      value.clientAssociationStatus !== 'visible'
    ) &&
    (value.clientReference === undefined ||
      isClientReference(value.clientReference))
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

function isInitialOpportunity(
  value: unknown,
): value is ClientRequest['initialOpportunity'] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    isNullableString(value.scope) &&
    typeof value.nextAction === 'string' &&
    isOpportunityOutcomeStatus(value.status) &&
    isDisplayableTimestamp(value.statusEnteredAt) &&
    isOutcomeHistoryPage(value.outcomeHistory, isDisplayableTimestamp) &&
    typeof value.responsibleWorkspaceMembershipId === 'string' &&
    isResponsibleActor(value.responsibleActor) &&
    value.responsibleActor.workspaceMembershipId ===
      value.responsibleWorkspaceMembershipId &&
    typeof value.createdAt === 'string' &&
    typeof value.version === 'number' &&
    Number.isInteger(value.version) &&
    value.version >= 1
  );
}

function isNextActionUpdateResult(
  value: unknown,
): value is NextActionUpdateResult {
  if (!isRecord(value) || !isRecord(value.receipt)) return false;
  const receipt = value.receipt;
  return (
    typeof receipt.opportunityId === 'string' &&
    typeof receipt.nextAction === 'string' &&
    typeof receipt.version === 'number' &&
    Number.isInteger(receipt.version) &&
    (receipt.outcome === 'updated' || receipt.outcome === 'unchanged') &&
    isClientRequest(value.request)
  );
}

const OUTCOME_RECEIPT_FIELDS = [
  'opportunityId',
  'previousStatus',
  'status',
  'version',
] as const;

/**
 * A committed outcome change for the requested Opportunity: exactly the
 * receipt fields, one permitted section 23.2 transition, a resulting version
 * above the initial one, and the receipt and returned Request both naming the
 * command's Opportunity. Status and version may differ from the refreshed
 * Request after an exact replay; identities never may. Anything else keeps the
 * command for an explicit retry instead of settling it.
 */
function isOutcomeChangeResult(
  value: unknown,
  opportunityId: string,
): value is OutcomeChangeResult {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    !isRecord(value.receipt)
  )
    return false;
  const receipt = value.receipt;
  return (
    Object.keys(receipt).length === OUTCOME_RECEIPT_FIELDS.length &&
    OUTCOME_RECEIPT_FIELDS.every((field) => Object.hasOwn(receipt, field)) &&
    typeof receipt.opportunityId === 'string' &&
    isOpportunityOutcomeStatus(receipt.previousStatus) &&
    isOpportunityOutcomeStatus(receipt.status) &&
    isOutcomeTransition(receipt.previousStatus, receipt.status) &&
    typeof receipt.version === 'number' &&
    Number.isSafeInteger(receipt.version) &&
    receipt.version >= 2 &&
    receipt.opportunityId === opportunityId &&
    isClientRequest(value.request) &&
    value.request.initialOpportunity.id === opportunityId
  );
}

function isResponsibleCandidates(
  value: unknown,
): value is { members: ResponsibleCandidate[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.members) &&
    value.members.every(
      (member: unknown) =>
        isRecord(member) &&
        typeof member.workspaceMembershipId === 'string' &&
        typeof member.displayLabel === 'string',
    )
  );
}

function isResponsibleChangeResult(
  value: unknown,
): value is ResponsibleChangeResult {
  if (!isRecord(value) || !isRecord(value.receipt)) return false;
  const receipt = value.receipt;
  return (
    typeof receipt.opportunityId === 'string' &&
    typeof receipt.workspaceMembershipId === 'string' &&
    typeof receipt.version === 'number' &&
    Number.isInteger(receipt.version) &&
    (receipt.outcome === 'updated' || receipt.outcome === 'unchanged') &&
    isClientRequest(value.request)
  );
}

function isClientReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.originalClientId === 'string' &&
    (value.currentClientId === undefined ||
      typeof value.currentClientId === 'string') &&
    typeof value.displayName === 'string'
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

// Every timestamp this workspace hands to the shared application formatter is
// proved to be the canonical API instant at this response boundary. A malformed
// or normalized value reaches the existing load or feedback error instead of throwing
// while the list or detail renders.
function isDisplayableTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const instant = new Date(value);
  return !Number.isNaN(instant.getTime()) && instant.toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function localDateTimeToIso(value: string): string | undefined {
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? undefined : instant.toISOString();
}
