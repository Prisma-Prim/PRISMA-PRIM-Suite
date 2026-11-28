import {
  OfferMessagePreparation,
  type OfferMessageTarget,
} from '../offer-message/offer-message-preparation';
import { OpportunityFollowUpPanel } from '../opportunity-follow-up/OpportunityFollowUpPanel';
import { OpportunityFollowUpDiscovery } from '../opportunity-follow-up/OpportunityFollowUpDiscovery';
import { opportunityFollowUpAuthority } from '../access/opportunity-follow-up-authority';
import { useFollowUpCopy } from '../opportunity-follow-up/follow-up.copy';
import { useCommercialPdfDownload } from '../commercial-pdf/CommercialPdfDownload';
import { ContractPanel } from '../contract/ContractPanel';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { grantOf, holds } from '../access/company-grants';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import {
  useScopedOperationGroup,
  type ScopedOperationGroup,
} from '../api/use-scoped-operation';
import { selectedWorkspaceId } from '../access/workspace-selection';
import { useInterfaceLocale } from '../localization/interface-locale';
import { useCommercialRequestCopy } from './commercial-request.copy';
import {
  useOpportunityOutcomeCopy,
  type OutcomeFeedbackMessageKey,
} from './opportunity-outcome.copy';
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
import {
  EMPTY_OUTCOME_DRAFT,
  isOpportunityOutcomeStatus,
  isOutcomeTransition,
  isConsistentOutcomeSnapshot,
  isOpportunityVersion,
  isOutcomeHistoryPage,
  outcomeCommandBody,
  type OpportunityOutcomeStatus,
  type OutcomeEdit,
  type OutcomeHistoryPage,
} from './opportunity-outcome';
import { RequestClientAssociation } from './RequestClientAssociation';
import {
  OpportunityStage,
  OpportunityStageHistory,
  type OlderStageHistory,
  type StageEditor,
} from './OpportunityStage';
import { SalesStageSettings } from './SalesStageSettings';
import { useSalesStageCopy } from './sales-stage.copy';
import {
  isConsistentStageSnapshot,
  isOpportunitySalesStage,
  isSalesStageList,
  isStageHistoryPage,
  NO_STAGE_SELECTION,
  type OpportunitySalesStage,
  type StageEdit,
  type StageHistoryPage,
} from './sales-stage';
import './commercial-intake.css';

type ResponsibleActor = { workspaceMembershipId: string; displayName: string };

type RequestListClientProjection =
  | { clientDisplayName: string; clientDossierId?: string }
  | { clientDisplayName?: undefined; clientDossierId?: undefined };

export type RequestListItem = {
  id: string;
  subject: string | null;
  capturedAt: string;
  initialOpportunity: {
    title: string;
    nextAction: string;
    status: OpportunityOutcomeStatus;
    salesStage: OpportunitySalesStage | null;
    responsibleActor: ResponsibleActor;
  };
} & RequestListClientProjection;

export type ClientRequest = {
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
    salesStage: OpportunitySalesStage | null;
    stageHistory: StageHistoryPage;
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

type RequestListView = 'all' | 'mine_open';

/**
 * The exact version a requested Request detail opens with selected, superseded
 * or not: an Offer Version, or a Contract Version of the named agreement.
 */
export type RequestedVersion =
  | { type: 'offer_version'; offerVersionId: string }
  | {
      type: 'contract_version';
      contractId: string;
      contractVersionId: string;
      kind: 'CONTRACT' | 'PRECONTRACT' | 'ADDENDUM';
    };

/**
 * One Request detail the shell requested, optionally with the exact version
 * to select in it; `requestId` numbers each request.
 */
type RequestedRequest = {
  clientRequestId: string;
  version?: RequestedVersion;
  /** Inline dossier navigation focuses its exact detail; ordinary navigation keeps section focus. */
  focusTarget?: 'request-detail';
  /** A dossier-scoped caller retires only its queued or pending navigation read. */
  sourceSignal?: AbortSignal;
  requestId: number;
};

/**
 * How the Clarté Today quick action (#1532) embeds the capture: only the
 * form, with the same validation, idempotent retry, access recovery and
 * Activity refresh. It reads no list and offers no Sales Stage settings.
 */
export type RequestCapturePresentation = {
  /** After a confirmed capture, instead of opening its detail here. */
  onCaptured: (request: { id: string; opportunityTitle: string }) => void;
  /**
   * While true, a capture is pending or uncertain: closing the form would
   * discard its retry, as leaving the Requests section would not.
   */
  onProtectedChange: (active: boolean) => void;
};

/** The version a requested Request detail opens with selected. */
type RequestedDetailVersion = {
  clientRequestId: string;
  version: RequestedVersion;
  requestId: number;
};

// The foreground business operation, including its post-confirmation refresh.
type InFlight =
  | 'none'
  | 'read'
  | 'capture'
  | 'next-action'
  | 'responsible'
  | 'outcome'
  | 'stage';
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
  /** The status shown when the command was built: the receipt starts here. */
  previousStatus: OpportunityOutcomeStatus;
};

type StageChangeResult = {
  receipt: {
    opportunityId: string;
    salesStageId: string | null;
    version: number;
    outcome: 'updated' | 'unchanged';
  };
  request: ClientRequest;
};

// An explicit retry resends exactly this stage, observed version and key.
type StageRetry = {
  opportunityId: string;
  expectedVersion: number;
  salesStageId: string | null;
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
  requestCapture,
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
  /**
   * The capture alone, for the Clarté Today quick action (#1532). Absent,
   * the workspace renders the current interface's Requests section.
   */
  requestCapture?: RequestCapturePresentation;
}) {
  const followUpCopy = useFollowUpCopy();
  const copy = useCommercialRequestCopy();
  const formId = useId();
  const outcomeCopy = useOpportunityOutcomeCopy();
  const stageCopy = useSalesStageCopy();
  const stageDeniedMessage = stageCopy('stageDenied');
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [listView, setListView] = useState<RequestListView>('all');
  const listViewScope = useRef<RequestListView>('all');
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
  const [feedback, setFeedback] = useState<
    | string
    | { outcomeMessage: OutcomeFeedbackMessageKey }
    | {
        requestMessage:
          | 'validation'
          | 'unavailableClient'
          | 'error'
          | 'clientAssociationSuccess'
          | 'nextActionSaved'
          | 'nextActionUnchanged'
          | 'nextActionValidation'
          | 'nextActionConflict'
          | 'nextActionMissing'
          | 'nextActionDenied'
          | 'nextActionUncertain'
          | 'responsibleMembersError'
          | 'responsibleChanged'
          | 'responsibleUnchanged'
          | 'responsibleConflict'
          | 'responsibleUnavailable'
          | 'responsibleDenied'
          | 'responsibleUncertain';
      }
  >('');
  const [inFlight, setInFlight] = useState<InFlight>('none');
  const [associationProtection, setAssociationProtection] =
    useState<AssociationProtection>('idle');
  const pending = inFlight !== 'none' || associationProtection !== 'idle';
  // A capture that ended without a confirmed result keeps its payload and key
  // for an exact retry until a later attempt settles it.
  const [captureUncertain, setCaptureUncertain] = useState(false);
  // The latest requested Request not opened yet.
  const [requestToOpen, setRequestToOpen] = useState<RequestedRequest>();
  // The version the latest opened request selects in its Request detail.
  const [requestedVersion, setRequestedVersion] =
    useState<RequestedDetailVersion>();
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
  const [stageEdit, setStageEdit] = useState<StageEdit>({ kind: 'idle' });
  // The Company's Sales Stage settings view replaces the capture form and the
  // list while it is open.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [followUpProtection, setFollowUpProtection] = useState({
    generation: 0,
    active: false,
  });
  const retry = useRef<
    { payload: string; key: string; hasClient: boolean } | undefined
  >(undefined);
  const nextActionRetry = useRef<NextActionRetry | undefined>(undefined);
  const responsibleRetry = useRef<ResponsibleRetry | undefined>(undefined);
  const outcomeRetry = useRef<OutcomeRetry | undefined>(undefined);
  const stageRetry = useRef<StageRetry | undefined>(undefined);
  const identityRevision = useRef(clientIdentityRevision);
  useLayoutEffect(() => {
    identityRevision.current = clientIdentityRevision;
  });
  const nextActionEditOpen =
    nextActionEdit.kind === 'editing' ||
    nextActionEdit.kind === 'saving' ||
    nextActionEdit.kind === 'uncertain';
  const responsibleEditOpen =
    responsibleEdit.kind !== 'idle' && responsibleEdit.kind !== 'conflict';
  const outcomeEditOpen =
    outcomeEdit.kind !== 'idle' && outcomeEdit.kind !== 'conflict';
  const stageEditOpen =
    stageEdit.kind !== 'idle' && stageEdit.kind !== 'conflict';
  const followUpAuthority = opportunityFollowUpAuthority(actor);
  const followUpSignature = JSON.stringify([
    followUpAuthority?.key,
    selected?.request.id,
    selected ? followUpOutcomeObservation(selected.request) : null,
  ]);
  const followUpOwner = useRequestLifetime(identity, followUpSignature);
  const followUpGeneration = useRef(followUpOwner);
  useLayoutEffect(() => {
    followUpGeneration.current = followUpOwner;
  });
  const followUpProtected =
    Boolean(followUpAuthority) &&
    followUpProtection.generation === followUpOwner &&
    followUpProtection.active;
  // At most one Opportunity editor is open; any one is protected work.
  const opportunityEditInProgress = useRef(false);
  const associationInProgress = useRef(false);
  useLayoutEffect(() => {
    opportunityEditInProgress.current =
      nextActionEditOpen ||
      responsibleEditOpen ||
      outcomeEditOpen ||
      stageEditOpen ||
      followUpProtected;
    associationInProgress.current = associationProtection !== 'idle';
  });
  const protectedWork =
    associationProtection !== 'idle'
      ? 'client-association'
      : nextActionEditOpen || inFlight === 'next-action'
        ? 'next-action-edit'
        : responsibleEditOpen || inFlight === 'responsible'
          ? 'responsible-edit'
          : outcomeEditOpen || inFlight === 'outcome'
            ? 'outcome-edit'
            : stageEditOpen || inFlight === 'stage'
              ? 'stage-edit'
              : followUpProtected
                ? 'follow-up-edit'
                : inFlight === 'capture' || captureUncertain
                  ? 'capture'
                  : undefined;
  const listDenied = useRef(false);
  const rejectCompany = useRef(onCompanyContextRejected);
  const acceptActor = useRef(onActorRevalidated);
  const rejectWorkspace = useRef(onWorkspaceAccessRejected);
  useLayoutEffect(() => {
    listDenied.current = load.kind === 'denied';
    rejectCompany.current = onCompanyContextRejected;
    acceptActor.current = onActorRevalidated;
    rejectWorkspace.current = onWorkspaceAccessRejected;
  });
  const company = actor.activeCompany;
  const companyId = company?.id;
  const clientGrant = grantOf(company, 'company_director_client_access');
  const intakeGrant = grantOf(company, 'company_commercial_intake');
  const managerGrant = grantOf(company, 'company_opportunity_manager');
  const canSearchClients =
    actor.workspacePermissions.includes('client.manage') ||
    holds(company, 'company_director_client_access', 'client.read');
  const canEditNextAction = holds(
    company,
    'company_commercial_intake',
    'commercial.opportunity.next_action.update',
  );
  const canAssociateClient =
    canSearchClients &&
    holds(
      company,
      'company_commercial_intake',
      'commercial.request.client.associate',
    );
  // Association drafts belong to this captured Client read authority.
  // A replacement grant remains readable, but retires selection, retry and
  // pending replies without discarding this Request or its Opportunity edits.
  const clientAssociationAuthority = JSON.stringify([
    actor.workspaceId,
    actor.internalUserId,
    actor.workspaceMembershipId,
    companyId,
    clientAuthorityRevision,
    clientGrant?.assignmentId,
    clientGrant?.permissionSetVersion,
    intakeGrant?.assignmentId,
    intakeGrant?.permissionSetVersion,
    canSearchClients,
    canAssociateClient,
  ]);
  const clientReadAuthority = JSON.stringify([
    actor.workspaceId,
    actor.internalUserId,
    actor.workspaceMembershipId,
    companyId,
    clientAuthorityRevision,
    clientGrant?.assignmentId,
    clientGrant?.permissionSetVersion,
    canSearchClients,
  ]);
  // Loaded projections and reads also belong to the observed authority and
  // current Client identity. A monotonically increasing revision prevents an
  // old response becoming current again after access is lost and regranted.
  const projectionAuthority = JSON.stringify([
    clientReadAuthority,
    clientIdentityRevision,
  ]);
  const clientProjectionRevision = useRequestLifetime(
    identity,
    projectionAuthority,
  );
  const clientProjection = useRef({ revision: clientProjectionRevision });
  useLayoutEffect(() => {
    clientProjection.current = { revision: clientProjectionRevision };
  });
  const clientSearch: ClientSearchState =
    canSearchClients && searchProjectionRevision === clientProjectionRevision
      ? clientSearchState
      : { kind: 'idle' };

  // Reassignment needs the manager bundle and both Intake reads; the server
  // also requires live Company context.
  const intakeReads =
    holds(company, 'company_commercial_intake', 'commercial.request.read') &&
    holds(company, 'company_commercial_intake', 'commercial.opportunity.read');
  const canChangeResponsible =
    holds(
      company,
      'company_opportunity_manager',
      'commercial.opportunity.assign',
    ) && intakeReads;
  // The captured manager assignment the editor belongs to, like a remount key.
  const responsibleAuthority = JSON.stringify([
    actor.workspaceMembershipId,
    companyId,
    managerGrant?.assignmentId,
    managerGrant?.permissionSetVersion,
    canChangeResponsible,
  ]);
  // The outcome status change needs captured manager v2 and both Intake
  // reads; the server also requires live Company context.
  const canChangeOutcome =
    holds(
      company,
      'company_opportunity_manager',
      'commercial.opportunity.outcome.change',
    ) && intakeReads;
  const outcomeAuthority = JSON.stringify([
    actor.workspaceMembershipId,
    companyId,
    managerGrant?.assignmentId,
    managerGrant?.permissionSetVersion,
    canChangeOutcome,
  ]);
  // The Sales Stage assignment needs captured Commercial Intake v4, which
  // carries both reads; the server also requires live Company context.
  const canSetStage =
    holds(
      company,
      'company_commercial_intake',
      'commercial.opportunity.stage.set',
    ) && intakeReads;
  const stageAuthority = JSON.stringify([
    actor.workspaceMembershipId,
    companyId,
    intakeGrant?.assignmentId,
    intakeGrant?.permissionSetVersion,
    canSetStage,
  ]);
  // Configuring stages needs the opt-in configuration bundle and both reads.
  const canConfigureStages =
    holds(
      company,
      'company_sales_stage_configuration',
      'commercial.sales_stage.configure',
    ) && intakeReads;
  const stageReadAuthority = JSON.stringify([
    actor.active,
    actor.workspaceId,
    actor.internalUserId,
    actor.workspaceMembershipId,
    companyId,
    intakeGrant,
  ]);
  const stageConfigurationAuthority = JSON.stringify([
    stageReadAuthority,
    grantOf(company, 'company_sales_stage_configuration'),
    canConfigureStages,
  ]);

  const sessionLifetime = useRequestLifetime(
    identity,
    JSON.stringify([
      identity.loaded,
      identity.signedIn,
      actor.active,
      actor.workspaceId,
      actor.internalUserId,
      actor.workspaceMembershipId,
      companyId,
    ]),
  );
  const intakeScope = JSON.stringify([sessionLifetime, intakeGrant]);
  const projectedScope = JSON.stringify([
    intakeScope,
    clientProjectionRevision,
  ]);
  const listReads = useScopedOperationGroup(projectedScope);
  const projectionReads = useScopedOperationGroup(
    JSON.stringify([projectedScope, selected?.request.id]),
  );
  const clientSearches = useScopedOperationGroup(projectedScope);
  const detailReads = useScopedOperationGroup(intakeScope);
  const responsibleMembers = useScopedOperationGroup(
    JSON.stringify([intakeScope, responsibleAuthority, selected?.request.id]),
  );
  const stageChoices = useScopedOperationGroup(
    JSON.stringify([intakeScope, stageAuthority, selected?.request.id]),
  );
  const historyScope = JSON.stringify([
    intakeScope,
    selected?.request.id,
    selected?.request.initialOpportunity.version,
  ]);
  const outcomeHistoryReads = useScopedOperationGroup(historyScope);
  const stageHistoryReads = useScopedOperationGroup(historyScope);
  const captures = useScopedOperationGroup(intakeScope);
  const clientCaptures = useScopedOperationGroup(projectedScope);
  const nextActionWrites = useScopedOperationGroup(
    JSON.stringify([intakeScope, canEditNextAction]),
  );
  const responsibleWrites = useScopedOperationGroup(
    JSON.stringify([intakeScope, responsibleAuthority]),
  );
  const outcomeWrites = useScopedOperationGroup(
    JSON.stringify([intakeScope, outcomeAuthority]),
  );
  const stageWrites = useScopedOperationGroup(
    JSON.stringify([intakeScope, stageAuthority]),
  );
  const actorObservation = useActorObservation(actor);
  const recoveries = useScopedOperationGroup(
    JSON.stringify([sessionLifetime, actorObservation]),
  );
  const requestRecoveries = useRef(
    new WeakMap<AbortSignal, ScopedOperationGroup>(),
  );

  function writePending(): boolean {
    return (
      captures.isPending() ||
      clientCaptures.isPending() ||
      nextActionWrites.isPending() ||
      responsibleWrites.isPending() ||
      outcomeWrites.isPending() ||
      stageWrites.isPending()
    );
  }

  const retireWrites = useCallback((): void => {
    captures.retire();
    clientCaptures.retire();
    nextActionWrites.retire();
    responsibleWrites.retire();
    outcomeWrites.retire();
    stageWrites.retire();
  }, [
    captures,
    clientCaptures,
    nextActionWrites,
    responsibleWrites,
    outcomeWrites,
    stageWrites,
  ]);

  const intakeObservation = {
    recoveries,
    companyId,
    intakeReads,
    listReads,
    retireWrites,
    detailReads,
    responsibleMembers,
    stageChoices,
  };
  const accessObservation = useRef(intakeObservation);
  useLayoutEffect(() => {
    accessObservation.current = intakeObservation;
  });

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
        signal.throwIfAborted();
        if (!requestRecoveries.current.has(signal))
          requestRecoveries.current.set(
            signal,
            accessObservation.current.recoveries,
          );
        const token = identity.requestHeaders
          ? null
          : await identity.getToken();
        signal.throwIfAborted();
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
        signal.throwIfAborted();
        let responseBody: unknown;
        try {
          responseBody = await response.json();
        } catch {
          responseBody = undefined;
        }
        signal.throwIfAborted();
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
        | 'outcome-update'
        | 'stage-update'
        | 'sales-stage-configuration' = 'intake',
    ): Promise<'ok' | 'retained' | 'rejected'> => {
      if (signal.aborted) return 'rejected';
      if (result.status === 401) {
        await identity.rejectSession();
        return 'rejected';
      }
      if (result.status !== 403) return 'ok';
      const recovery = requestRecoveries.current.get(signal)?.begin();
      const current = () =>
        Boolean(recovery && !signal.aborted && !recovery.signal.aborted);
      const retire = () => recovery?.retire();
      signal.addEventListener('abort', retire, { once: true });
      let retainAuthorizedIntake = false;
      try {
        if (recovery)
          await handleAuthenticatedAccessRejection({
            result: { status: 'forbidden' },
            identity,
            companyContextId,
            onCompanyContextRejected: (rejectedCompanyId) =>
              rejectCompany.current(rejectedCompanyId),
            onActorRevalidated: (revalidatedActor) => {
              const revalidated = revalidatedActor.activeCompany;
              retainAuthorizedIntake =
                resource !== 'intake' &&
                revalidated?.id === companyContextId &&
                holds(
                  revalidated,
                  'company_commercial_intake',
                  'commercial.request.read',
                ) &&
                holds(
                  revalidated,
                  'company_commercial_intake',
                  'commercial.opportunity.read',
                );
              return acceptActor.current(revalidatedActor);
            },
            onWorkspaceAccessRejected: () => rejectWorkspace.current(),
            signal: recovery.signal,
            isCurrent: current,
          });
      } finally {
        signal.removeEventListener('abort', retire);
        recovery?.release();
        // A newer Actor may retire only recovery while this narrow operation
        // and the independent Intake draft still have their original authority.
        if (!current() && !signal.aborted) {
          const committed = accessObservation.current;
          retainAuthorizedIntake =
            resource !== 'intake' &&
            committed.companyId === companyContextId &&
            committed.intakeReads;
        }
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
          setStageEdit({ kind: 'idle' });
          setSettingsOpen(false);
          setInFlight('none');
          setCaptureUncertain(false);
          setRequestToOpen(undefined);
          retry.current = undefined;
          nextActionRetry.current = undefined;
          responsibleRetry.current = undefined;
          outcomeRetry.current = undefined;
          stageRetry.current = undefined;
          const committed = accessObservation.current;
          committed.listReads.retire();
          committed.retireWrites();
          committed.detailReads.retire();
          committed.responsibleMembers.retire();
          committed.stageChoices.retire();
        }
      }
      return retainAuthorizedIntake && !signal.aborted
        ? 'retained'
        : 'rejected';
    },
    [identity],
  );

  // The capture alone shows no list, so it never reads one.
  const capturesOnly = requestCapture !== undefined;
  const loadRequests = useCallback(
    async (companyContextId: string, cursor?: string): Promise<void> => {
      if (capturesOnly) return;
      const operation = listReads.beginLatest();
      if (!operation) return;
      // An authority or identity change retires the old page, including late
      // older-page responses; only its own revalidated read publishes.
      const startedUnderRevision = clientProjection.current.revision;
      const startedUnderView = listViewScope.current;
      const superseded = () =>
        operation.signal.aborted ||
        clientProjection.current.revision !== startedUnderRevision ||
        listViewScope.current !== startedUnderView;
      setLoad((current) => startedPage({ current, companyContextId, cursor }));
      try {
        const result = await request({
          path: `/commercial-intake/requests?limit=${listPageSize}${
            cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
          }${startedUnderView === 'mine_open' ? '&view=mine_open' : ''}`,
          companyContextId,
          signal: operation.signal,
        });
        if (superseded()) return;
        if (
          (await handleAccess(result, companyContextId, operation.signal)) !==
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
      } finally {
        operation.release();
      }
    },
    [handleAccess, request, listReads, capturesOnly],
  );

  // Confirmation refreshes the current projection, independent of its old reader.
  const refreshRequests = useRef(loadRequests);
  useLayoutEffect(() => {
    refreshRequests.current = loadRequests;
  });

  function changeListView(value: string): void {
    if (value !== 'all' && value !== 'mine_open') return;
    if (value === listViewScope.current) return;
    // A view change retires only list reads/pages. Detail, drafts, commands
    // and their exact retry identity keep their existing owners.
    listViewScope.current = value;
    setListView(value);
    if (companyId) void loadRequests(companyId);
  }

  useEffect(() => {
    retireWrites();
    detailReads.retire();
    clientSearches.retire();
    responsibleMembers.retire();
    retry.current = undefined;
    nextActionRetry.current = undefined;
    responsibleRetry.current = undefined;
    outcomeRetry.current = undefined;
    stageRetry.current = undefined;
    stageChoices.retire();
    setSelected(undefined);
    setNextActionEdit({ kind: 'idle' });
    setAssociationProtection('idle');
    setResponsibleEdit({ kind: 'idle' });
    setOutcomeEdit({ kind: 'idle' });
    setStageEdit({ kind: 'idle' });
    setSettingsOpen(false);
    setFeedback('');
    setClientQuery('');
    setClientSearch({ kind: 'idle' });
    setInFlight('none');
    setCaptureUncertain(false);
    setRequestToOpen(undefined);
    setFilter('');
    setRestriction(undefined);
    listViewScope.current = 'all';
    setListView('all');
    if (!companyId || !intakeReads) {
      setLoad({ kind: 'denied' });
      return;
    }
    void loadRequests(companyId);
    return () => {
      listReads.retire();
      retireWrites();
      detailReads.retire();
      clientSearches.retire();
      responsibleMembers.retire();
      stageChoices.retire();
    };
  }, [sessionLifetime]);

  const readIntakeCapture = useRef({ sessionLifetime, intakeScope });
  useEffect(() => {
    const previous = readIntakeCapture.current;
    readIntakeCapture.current = { sessionLifetime, intakeScope };
    if (
      previous.sessionLifetime !== sessionLifetime ||
      previous.intakeScope === intakeScope
    )
      return;
    retry.current = undefined;
    nextActionRetry.current = undefined;
    responsibleRetry.current = undefined;
    outcomeRetry.current = undefined;
    stageRetry.current = undefined;
    setNextActionEdit({ kind: 'idle' });
    setResponsibleEdit({ kind: 'idle' });
    setOutcomeEdit({ kind: 'idle' });
    setStageEdit({ kind: 'idle' });
    setInFlight('none');
    setCaptureUncertain(false);
    if (
      inFlight !== 'none' ||
      nextActionEditOpen ||
      responsibleEditOpen ||
      outcomeEditOpen ||
      stageEditOpen ||
      captureUncertain
    )
      setFeedback('');
    if (
      companyId &&
      intakeReads &&
      (load.kind === 'loading' ||
        (load.kind === 'ready' && load.olderPage === 'loading'))
    )
      void loadRequests(companyId);
  }, [sessionLifetime, intakeScope, companyId, intakeReads, loadRequests]);

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
    if (detailReads.isPending()) {
      detailReads.retire();
      setInFlight('none');
    }
    setSelected(undefined);
    setNextActionEdit({ kind: 'idle' });
    nextActionRetry.current = undefined;
    setResponsibleEdit({ kind: 'idle' });
    responsibleRetry.current = undefined;
    setOutcomeEdit({ kind: 'idle' });
    outcomeRetry.current = undefined;
    stageChoices.retire();
    setStageEdit({ kind: 'idle' });
    stageRetry.current = undefined;
  }, [clientRestriction]);

  // The shell owns the requested Request. A new one supersedes any older or
  // held request; opening it aborts a detail read still in flight.
  useEffect(() => {
    setRequestToOpen(requestedRequest);
    const source = requestedRequest?.sourceSignal;
    if (!source) return;
    const retire = () =>
      setRequestToOpen((current) =>
        current?.requestId === requestedRequest.requestId ? undefined : current,
      );
    if (source.aborted) retire();
    else source.addEventListener('abort', retire, { once: true });
    return () => source.removeEventListener('abort', retire);
  }, [requestedRequest]);

  // It opens exactly like choosing its row from the list, once no protected
  // capture or next-action edit remains, so their drafts, payloads and keys
  // are kept.
  useEffect(() => {
    if (!requestToOpen || protectedWork) return;
    setRequestToOpen(undefined);
    if (requestToOpen.sourceSignal?.aborted) return;
    setSelected(undefined);
    const { clientRequestId, version, requestId } = requestToOpen;
    setRequestedVersion(
      version === undefined
        ? undefined
        : { clientRequestId, version, requestId },
    );
    void selectRequest(clientRequestId, false, requestToOpen.sourceSignal);
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
    clientSearches.retire();
    setClientQuery('');
    setClientSearch({ kind: 'idle' });
    setForm((current) => ({ ...current, clientAccountId: '' }));
    if (retry.current?.hasClient) {
      retry.current = undefined;
      if (inFlight === 'capture') {
        clientCaptures.retire();
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
    const operation = projectionReads.beginLatest();
    if (!operation) return;
    const startedUnderProjection = clientProjectionRevision;
    const superseded = () =>
      operation.signal.aborted ||
      clientProjection.current.revision !== startedUnderProjection;
    void (async () => {
      try {
        const result = await request({
          path: `/commercial-intake/requests/${encodeURIComponent(selectedRequestId)}`,
          companyContextId: companyId,
          signal: operation.signal,
        });
        if (superseded()) return;
        if ((await handleAccess(result, companyId, operation.signal)) !== 'ok')
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
      } finally {
        operation.release();
      }
    })();
    return () => operation.retire();
  }, [
    companyId,
    selectedRequestId,
    selectedProjectionRevision,
    clientProjectionRevision,
    clientIdentityRevision,
    projectionReads,
    handleAccess,
    request,
  ]);

  // Losing only update authority keeps the read-only detail and any pending
  // conflict reload, but retires the draft, the pending command and any
  // in-flight save, so a later regrant can neither restore nor replay them.
  useEffect(() => {
    if (canEditNextAction) return;
    nextActionRetry.current = undefined;
    nextActionWrites.retire();
    setInFlight((current) => (current === 'next-action' ? 'none' : current));
    if (nextActionEdit.kind === 'idle' || nextActionEdit.kind === 'conflict')
      return;
    setNextActionEdit({ kind: 'idle' });
    setFeedback({ requestMessage: 'nextActionDenied' });
  }, [canEditNextAction, nextActionEdit.kind]);

  // Losing reassignment authority keeps the read-only detail, but retires the
  // editor, its eligible members, the pending command and any in-flight save,
  // so a later regrant can neither restore nor replay them.
  useEffect(() => {
    if (canChangeResponsible) return;
    responsibleRetry.current = undefined;
    responsibleMembers.retire();
    responsibleWrites.retire();
    setInFlight((current) => (current === 'responsible' ? 'none' : current));
    if (responsibleEdit.kind === 'idle') return;
    setResponsibleEdit({ kind: 'idle' });
    if (responsibleEdit.kind !== 'conflict')
      setFeedback({ requestMessage: 'responsibleDenied' });
  }, [canChangeResponsible, responsibleEdit.kind]);

  // Losing outcome authority keeps the read-only detail, but retires the
  // draft, the pending command and any in-flight save, so a later regrant can
  // neither restore nor replay them.
  useEffect(() => {
    if (canChangeOutcome) return;
    outcomeRetry.current = undefined;
    outcomeWrites.retire();
    setInFlight((current) => (current === 'outcome' ? 'none' : current));
    if (outcomeEdit.kind === 'idle') return;
    setOutcomeEdit({ kind: 'idle' });
    if (outcomeEdit.kind !== 'conflict')
      setFeedback({ outcomeMessage: 'outcomeDenied' });
  }, [canChangeOutcome, outcomeEdit.kind]);

  // Losing the Sales Stage assignment keeps the read-only detail, but retires
  // the editor, its stage list, the pending command and any in-flight save, so
  // a later regrant can neither restore nor replay them.
  useEffect(() => {
    if (canSetStage) return;
    stageRetry.current = undefined;
    stageChoices.retire();
    stageWrites.retire();
    setInFlight((current) => (current === 'stage' ? 'none' : current));
    if (stageEdit.kind === 'idle') return;
    setStageEdit({ kind: 'idle' });
    if (stageEdit.kind !== 'conflict') setFeedback(stageDeniedMessage);
  }, [canSetStage, stageEdit.kind, stageDeniedMessage]);

  // Another captured Commercial Intake assignment is a new authority: like a
  // remount keyed on it, it retires every Sales Stage draft and command.
  const readStageAuthority = useRef(stageAuthority);
  useEffect(() => {
    if (readStageAuthority.current === stageAuthority) return;
    readStageAuthority.current = stageAuthority;
    stageRetry.current = undefined;
    stageChoices.retire();
    stageWrites.retire();
    setInFlight((current) => (current === 'stage' ? 'none' : current));
    setStageEdit({ kind: 'idle' });
  }, [stageAuthority]);

  // Another captured manager assignment is a new authority: like a remount
  // keyed on it, it retires every outcome draft and command.
  const readOutcomeAuthority = useRef(outcomeAuthority);
  useEffect(() => {
    if (readOutcomeAuthority.current === outcomeAuthority) return;
    readOutcomeAuthority.current = outcomeAuthority;
    outcomeRetry.current = undefined;
    outcomeWrites.retire();
    setInFlight((current) => (current === 'outcome' ? 'none' : current));
    setOutcomeEdit({ kind: 'idle' });
  }, [outcomeAuthority]);

  // Another captured manager assignment is a new authority: like a remount
  // keyed on it, it retires every responsible-actor draft and command.
  const readResponsibleAuthority = useRef(responsibleAuthority);
  useEffect(() => {
    if (readResponsibleAuthority.current === responsibleAuthority) return;
    readResponsibleAuthority.current = responsibleAuthority;
    responsibleRetry.current = undefined;
    responsibleMembers.retire();
    responsibleWrites.retire();
    setInFlight((current) => (current === 'responsible' ? 'none' : current));
    setResponsibleEdit({ kind: 'idle' });
  }, [responsibleAuthority]);

  async function refreshRecordedActivity(): Promise<void> {
    try {
      await onActivityRecorded();
    } catch {
      // A failed UI refresh cannot unconfirm the server's committed receipt.
    }
  }

  // The embedded capture reports the same hold the Requests section applies.
  const captureCallbacks = useRef(requestCapture);
  useLayoutEffect(() => {
    captureCallbacks.current = requestCapture;
  });
  const captureProtected = inFlight === 'capture' || captureUncertain;
  useEffect(() => {
    captureCallbacks.current?.onProtectedChange(captureProtected);
  }, [captureProtected]);

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
    const operation = clientSearches.beginLatest();
    if (!operation) return;
    const startedUnderProjection = clientProjection.current.revision;
    const superseded = () =>
      operation.signal.aborted ||
      clientProjection.current.revision !== startedUnderProjection;
    setSearchProjectionRevision(startedUnderProjection);
    setClientSearch({ kind: 'loading' });
    try {
      const result = await request({
        path: `/clients/search?query=${encodeURIComponent(query)}`,
        companyContextId: companyId,
        signal: operation.signal,
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
          operation.signal,
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
    } finally {
      operation.release();
    }
  }

  async function selectRequest(
    id: string,
    preserveConflict = false,
    sourceSignal?: AbortSignal,
  ): Promise<void> {
    if (!companyId || sourceSignal?.aborted) return;
    if (writePending()) return;
    const operation = detailReads.beginLatest();
    if (!operation) return;
    const retire = () => {
      if (operation.signal.aborted) return;
      operation.retire();
      setInFlight('none');
    };
    sourceSignal?.addEventListener('abort', retire, { once: true });
    const startedUnderProjection = clientProjection.current.revision;
    setInFlight('read');
    setFeedback('');
    setSettingsOpen(false);
    if (!preserveConflict) {
      setNextActionEdit({ kind: 'idle' });
      nextActionRetry.current = undefined;
      setResponsibleEdit({ kind: 'idle' });
      responsibleRetry.current = undefined;
      setOutcomeEdit({ kind: 'idle' });
      outcomeRetry.current = undefined;
      setStageEdit({ kind: 'idle' });
      stageRetry.current = undefined;
      responsibleMembers.retire();
      stageChoices.retire();
    }
    try {
      const result = await request({
        path: `/commercial-intake/requests/${encodeURIComponent(id)}`,
        companyContextId: companyId,
        signal: operation.signal,
      });
      if (operation.signal.aborted) return;
      if ((await handleAccess(result, companyId, operation.signal)) !== 'ok')
        return;
      if (operation.signal.aborted) return;
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
        setStageEdit({ kind: 'idle' });
        stageRetry.current = undefined;
      } else setFeedback({ requestMessage: 'error' });
    } catch {
      if (!operation.signal.aborted) setFeedback({ requestMessage: 'error' });
    } finally {
      sourceSignal?.removeEventListener('abort', retire);
      if (!operation.signal.aborted) setInFlight('none');
      operation.release();
    }
  }

  function closeDetail(): void {
    retireWrites();
    detailReads.retire();
    setRequestedVersion(undefined);
    responsibleMembers.retire();
    stageChoices.retire();
    setSelected(undefined);
    setNextActionEdit({ kind: 'idle' });
    setAssociationProtection('idle');
    nextActionRetry.current = undefined;
    setResponsibleEdit({ kind: 'idle' });
    responsibleRetry.current = undefined;
    setOutcomeEdit({ kind: 'idle' });
    outcomeRetry.current = undefined;
    setStageEdit({ kind: 'idle' });
    stageRetry.current = undefined;
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
    setStageEdit({ kind: 'idle' });
    stageRetry.current = undefined;
    setSelected(undefined);
    setFeedback({ requestMessage: 'nextActionMissing' });
    await refreshRequests.current(companyContextId);
  }

  async function openResponsibleEditor(): Promise<void> {
    if (!companyId || !selected || pending || writePending()) return;
    const opportunity = selected.request.initialOpportunity;
    const operation = responsibleMembers.beginLatest();
    if (!operation) return;
    responsibleRetry.current = undefined;
    setResponsibleEdit({ kind: 'loading' });
    setFeedback('');
    try {
      const result = await request({
        path: `/commercial-intake/opportunities/${encodeURIComponent(opportunity.id)}/eligible-responsible-actors`,
        companyContextId: companyId,
        signal: operation.signal,
      });
      if (operation.signal.aborted) return;
      const access = await handleAccess(
        result,
        companyId,
        operation.signal,
        'responsible-update',
      );
      if (operation.signal.aborted) return;
      if (access === 'retained') {
        setResponsibleEdit({ kind: 'idle' });
        setFeedback({ requestMessage: 'responsibleDenied' });
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
      setFeedback({ requestMessage: 'responsibleMembersError' });
    } catch {
      if (!operation.signal.aborted) {
        setResponsibleEdit({ kind: 'load-error' });
        setFeedback({ requestMessage: 'responsibleMembersError' });
      }
    } finally {
      operation.release();
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
    if (!companyId || !selected || pending || writePending()) return;
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
    const operation = responsibleWrites.beginLatest();
    if (!operation) return;
    detailReads.retire();
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
        signal: operation.signal,
        method: 'POST',
        body: JSON.stringify({ expectedVersion, workspaceMembershipId }),
        idempotencyKey: key,
      });
      if (operation.signal.aborted) return;
      const access = await handleAccess(
        result,
        companyId,
        operation.signal,
        'responsible-update',
      );
      if (operation.signal.aborted) return;
      if (access === 'retained') {
        // Reassignment authority was lost while read authority remains: the
        // editor and pending command are dropped, the read-only detail stays.
        setResponsibleEdit({ kind: 'idle' });
        responsibleRetry.current = undefined;
        setFeedback({ requestMessage: 'responsibleDenied' });
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
        setFeedback({ requestMessage: 'responsibleConflict' });
        return;
      }
      if (result.status === 400) {
        setResponsibleEdit({ kind: 'unavailable' });
        responsibleRetry.current = undefined;
        setFeedback({ requestMessage: 'responsibleUnavailable' });
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
            ? { requestMessage: 'responsibleChanged' }
            : { requestMessage: 'responsibleUnchanged' },
        );
        if (receipt.outcome === 'updated') await refreshRecordedActivity();
        if (!operation.signal.aborted) await refreshRequests.current(companyId);
        return;
      }
      setResponsibleEdit({
        kind: 'uncertain',
        members,
        selection: workspaceMembershipId,
      });
      setFeedback({ requestMessage: 'responsibleUncertain' });
    } catch {
      if (!operation.signal.aborted) {
        setResponsibleEdit({
          kind: 'uncertain',
          members,
          selection: workspaceMembershipId,
        });
        setFeedback({ requestMessage: 'responsibleUncertain' });
      }
    } finally {
      if (!operation.signal.aborted) setInFlight('none');
      operation.release();
    }
  }

  async function saveOutcome(): Promise<void> {
    if (!companyId || !selected || pending || writePending()) return;
    if (outcomeEdit.kind !== 'editing' && outcomeEdit.kind !== 'uncertain')
      return;
    const { draft } = outcomeEdit;
    // An uncertain outcome resends exactly its payload, observed version and
    // key; a new draft builds its body from the shown version.
    const preservedRetry =
      outcomeEdit.kind === 'uncertain' ? outcomeRetry.current : undefined;
    const opportunityId =
      preservedRetry?.opportunityId ?? selected.request.initialOpportunity.id;
    const previousStatus =
      preservedRetry?.previousStatus ??
      selected.request.initialOpportunity.status;
    let command: string;
    if (preservedRetry) command = preservedRetry.body;
    else {
      const body = outcomeCommandBody(
        draft,
        selected.request.initialOpportunity.version,
      );
      if (!body) {
        setFeedback({ outcomeMessage: 'outcomeValidation' });
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
    outcomeRetry.current = {
      opportunityId,
      body: command,
      key,
      previousStatus,
    };
    const operation = outcomeWrites.beginLatest();
    if (!operation) return;
    detailReads.retire();
    const startedUnderProjection = clientProjection.current.revision;
    setOutcomeEdit({ kind: 'saving', draft });
    setInFlight('outcome');
    setFeedback('');
    try {
      const result = await request({
        path: `/commercial-intake/opportunities/${encodeURIComponent(opportunityId)}/outcome`,
        companyContextId: companyId,
        signal: operation.signal,
        method: 'POST',
        body: command,
        idempotencyKey: key,
      });
      if (operation.signal.aborted) return;
      const access = await handleAccess(
        result,
        companyId,
        operation.signal,
        'outcome-update',
      );
      if (operation.signal.aborted) return;
      if (access === 'retained') {
        // Outcome authority was lost while read authority remains: the draft
        // and pending command are dropped, the read-only detail stays.
        setOutcomeEdit({ kind: 'idle' });
        outcomeRetry.current = undefined;
        setFeedback({ outcomeMessage: 'outcomeDenied' });
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
        setFeedback({ outcomeMessage: 'outcomeConflict' });
        return;
      }
      if (result.status === 400) {
        setOutcomeEdit({ kind: 'editing', draft });
        outcomeRetry.current = undefined;
        setFeedback({ outcomeMessage: 'outcomeValidation' });
        return;
      }
      if (
        result.status === 200 &&
        isOutcomeChangeResult(result.body, {
          opportunityId,
          command,
          previousStatus,
        })
      ) {
        applyOpportunityResponse({
          request: result.body.request,
          responseRevision: startedUnderProjection,
        });
        setOutcomeEdit({ kind: 'idle' });
        outcomeRetry.current = undefined;
        setFeedback({ outcomeMessage: 'outcomeChanged' });
        await refreshRecordedActivity();
        if (!operation.signal.aborted) await refreshRequests.current(companyId);
        return;
      }
      setOutcomeEdit({ kind: 'uncertain', draft });
      setFeedback({ outcomeMessage: 'outcomeUncertain' });
    } catch {
      if (!operation.signal.aborted) {
        setOutcomeEdit({ kind: 'uncertain', draft });
        setFeedback({ outcomeMessage: 'outcomeUncertain' });
      }
    } finally {
      if (!operation.signal.aborted) setInFlight('none');
      operation.release();
    }
  }

  // One older page of the shown Opportunity's outcome history. Only Commercial
  // Intake read is needed; a lost read authority clears the scoped content.
  const loadOlderOutcomeHistory: OlderOutcomeHistory = async (cursor) => {
    if (!companyId || !selected) return undefined;
    const operation = outcomeHistoryReads.beginLatest();
    if (!operation) return undefined;
    try {
      const result = await request({
        path: `/commercial-intake/opportunities/${encodeURIComponent(selected.request.initialOpportunity.id)}/outcome-history?cursor=${encodeURIComponent(cursor)}`,
        companyContextId: companyId,
        signal: operation.signal,
      });
      if ((await handleAccess(result, companyId, operation.signal)) !== 'ok')
        return undefined;
      return !operation.signal.aborted &&
        result.status === 200 &&
        isOutcomeHistoryPage(result.body, isDisplayableTimestamp)
        ? result.body
        : undefined;
    } catch {
      return undefined;
    } finally {
      operation.release();
    }
  };

  async function openStageEditor(): Promise<void> {
    if (!companyId || !selected || pending || writePending()) return;
    const current = selected.request.initialOpportunity.salesStage;
    const operation = stageChoices.beginLatest();
    if (!operation) return;
    stageRetry.current = undefined;
    setStageEdit({ kind: 'loading' });
    setFeedback('');
    try {
      const result = await request({
        path: '/sales-stages',
        companyContextId: companyId,
        signal: operation.signal,
      });
      if (operation.signal.aborted) return;
      if ((await handleAccess(result, companyId, operation.signal)) !== 'ok')
        return;
      if (operation.signal.aborted) return;
      if (result.status === 200 && isSalesStageList(result.body)) {
        // Only ACTIVE stages are offered, in their configured order.
        const stages = result.body.stages.filter(
          (stage) => stage.state === 'ACTIVE',
        );
        setStageEdit({
          kind: 'choosing',
          stages,
          selection:
            current && stages.some((stage) => stage.id === current.id)
              ? current.id
              : NO_STAGE_SELECTION,
        });
        return;
      }
      setStageEdit({ kind: 'load-error' });
      setFeedback(stageCopy('stageListError'));
    } catch {
      if (!operation.signal.aborted) {
        setStageEdit({ kind: 'load-error' });
        setFeedback(stageCopy('stageListError'));
      }
    } finally {
      operation.release();
    }
  }

  async function saveStage(): Promise<void> {
    if (!companyId || !selected || pending || writePending()) return;
    if (stageEdit.kind !== 'choosing' && stageEdit.kind !== 'uncertain') return;
    const { stages } = stageEdit;
    const preservedRetry =
      stageEdit.kind === 'uncertain' ? stageRetry.current : undefined;
    const salesStageId =
      preservedRetry === undefined
        ? stageEdit.selection === NO_STAGE_SELECTION
          ? null
          : stageEdit.selection
        : preservedRetry.salesStageId;
    const opportunityId =
      preservedRetry?.opportunityId ?? selected.request.initialOpportunity.id;
    const expectedVersion =
      preservedRetry?.expectedVersion ??
      selected.request.initialOpportunity.version;
    const previous = stageRetry.current;
    // An explicit retry reuses the key only for the exact same stage and
    // observed version, so the server can replay the original receipt.
    const key =
      previous &&
      previous.opportunityId === opportunityId &&
      previous.expectedVersion === expectedVersion &&
      previous.salesStageId === salesStageId
        ? previous.key
        : crypto.randomUUID();
    stageRetry.current = { opportunityId, expectedVersion, salesStageId, key };
    const selection = salesStageId ?? NO_STAGE_SELECTION;
    const operation = stageWrites.beginLatest();
    if (!operation) return;
    detailReads.retire();
    const startedUnderProjection = clientProjection.current.revision;
    setStageEdit({ kind: 'saving', stages, selection });
    setInFlight('stage');
    setFeedback('');
    try {
      const result = await request({
        path: `/commercial-intake/opportunities/${encodeURIComponent(opportunityId)}/stage`,
        companyContextId: companyId,
        signal: operation.signal,
        method: 'POST',
        body: JSON.stringify({ expectedVersion, salesStageId }),
        idempotencyKey: key,
      });
      if (operation.signal.aborted) return;
      const access = await handleAccess(
        result,
        companyId,
        operation.signal,
        'stage-update',
      );
      if (operation.signal.aborted) return;
      if (access === 'retained') {
        // Assignment authority was lost while read authority remains: the
        // editor and pending command are dropped, the read-only detail stays.
        setStageEdit({ kind: 'idle' });
        stageRetry.current = undefined;
        setFeedback(stageCopy('stageDenied'));
        return;
      }
      if (access === 'rejected') return;
      if (result.status === 404) {
        await closeMissingOpportunity(companyId);
        return;
      }
      if (
        result.status === 400 ||
        (result.status === 409 &&
          isRecord(result.body) &&
          result.body.code === 'SALES_STAGE_UNAVAILABLE')
      ) {
        setStageEdit({ kind: 'unavailable' });
        stageRetry.current = undefined;
        setFeedback(stageCopy('stageUnavailable'));
        return;
      }
      if (result.status === 409) {
        setStageEdit({ kind: 'conflict' });
        stageRetry.current = undefined;
        setFeedback(stageCopy('stageConflict'));
        return;
      }
      if (
        result.status === 200 &&
        isStageChangeResult(result.body, {
          opportunityId,
          expectedVersion,
          salesStageId,
        })
      ) {
        const { receipt, request: updated } = result.body;
        applyOpportunityResponse({
          request: updated,
          responseRevision: startedUnderProjection,
        });
        setStageEdit({ kind: 'idle' });
        stageRetry.current = undefined;
        setFeedback(
          receipt.outcome === 'updated'
            ? stageCopy('stageChanged')
            : stageCopy('stageUnchanged'),
        );
        if (receipt.outcome === 'updated') await refreshRecordedActivity();
        if (!operation.signal.aborted) await refreshRequests.current(companyId);
        return;
      }
      setStageEdit({ kind: 'uncertain', stages, selection });
      setFeedback(stageCopy('stageUncertain'));
    } catch {
      if (!operation.signal.aborted) {
        setStageEdit({ kind: 'uncertain', stages, selection });
        setFeedback(stageCopy('stageUncertain'));
      }
    } finally {
      if (!operation.signal.aborted) setInFlight('none');
      operation.release();
    }
  }

  // One older page of the shown Opportunity's Sales Stage history. Only
  // Commercial Intake read is needed; a lost read clears the scoped content.
  const loadOlderStageHistory: OlderStageHistory = async (cursor) => {
    if (!companyId || !selected) return undefined;
    const operation = stageHistoryReads.beginLatest();
    if (!operation) return undefined;
    try {
      const result = await request({
        path: `/commercial-intake/opportunities/${encodeURIComponent(selected.request.initialOpportunity.id)}/stage-history?cursor=${encodeURIComponent(cursor)}`,
        companyContextId: companyId,
        signal: operation.signal,
      });
      if ((await handleAccess(result, companyId, operation.signal)) !== 'ok')
        return undefined;
      return !operation.signal.aborted &&
        result.status === 200 &&
        isStageHistoryPage(result.body, isDisplayableTimestamp)
        ? result.body
        : undefined;
    } catch {
      return undefined;
    } finally {
      operation.release();
    }
  };

  async function saveNextAction(): Promise<void> {
    if (!companyId || !selected || pending || writePending()) return;
    if (
      nextActionEdit.kind !== 'editing' &&
      nextActionEdit.kind !== 'uncertain'
    )
      return;
    const preservedRetry =
      nextActionEdit.kind === 'uncertain' ? nextActionRetry.current : undefined;
    const draft = preservedRetry?.nextAction ?? nextActionEdit.draft;
    if (!draft.trim() || draft.length > 500) {
      setFeedback({ requestMessage: 'nextActionValidation' });
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
    const operation = nextActionWrites.beginLatest();
    if (!operation) return;
    detailReads.retire();
    const startedUnderProjection = clientProjection.current.revision;
    setNextActionEdit({ kind: 'saving', draft });
    setInFlight('next-action');
    setFeedback('');
    try {
      const result = await request({
        path: `/commercial-intake/opportunities/${encodeURIComponent(opportunityId)}/next-action`,
        companyContextId: companyId,
        signal: operation.signal,
        method: 'POST',
        body: JSON.stringify({ expectedVersion, nextAction: draft }),
        idempotencyKey: key,
      });
      if (operation.signal.aborted) return;
      const access = await handleAccess(
        result,
        companyId,
        operation.signal,
        'next-action-update',
      );
      if (operation.signal.aborted) return;
      if (access === 'retained') {
        // Update authority was lost while read authority remains: the draft
        // and pending command are dropped, the read-only detail stays.
        setNextActionEdit({ kind: 'idle' });
        nextActionRetry.current = undefined;
        setFeedback({ requestMessage: 'nextActionDenied' });
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
        setFeedback({ requestMessage: 'nextActionConflict' });
        return;
      }
      if (result.status === 400) {
        setNextActionEdit({ kind: 'editing', draft });
        setFeedback({ requestMessage: 'nextActionValidation' });
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
            ? { requestMessage: 'nextActionSaved' }
            : { requestMessage: 'nextActionUnchanged' },
        );
        if (receipt.outcome === 'updated') await refreshRecordedActivity();
        if (!operation.signal.aborted) await refreshRequests.current(companyId);
        return;
      }
      setNextActionEdit({ kind: 'uncertain', draft });
      setFeedback({ requestMessage: 'nextActionUncertain' });
    } catch {
      if (!operation.signal.aborted) {
        setNextActionEdit({ kind: 'uncertain', draft });
        setFeedback({ requestMessage: 'nextActionUncertain' });
      }
    } finally {
      if (!operation.signal.aborted) setInFlight('none');
      operation.release();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!companyId || pending || writePending()) return;
    if (
      !form.originalText.trim() ||
      !form.opportunityTitle.trim() ||
      !form.nextAction.trim()
    ) {
      setFeedback({ requestMessage: 'validation' });
      return;
    }
    const reportedReceivedAt = form.reportedReceivedAt
      ? localDateTimeToIso(form.reportedReceivedAt)
      : undefined;
    if (form.reportedReceivedAt && !reportedReceivedAt) {
      setFeedback({ requestMessage: 'validation' });
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
    const operation = (
      form.clientAccountId ? clientCaptures : captures
    ).beginLatest();
    if (!operation) return;
    detailReads.retire();
    const startedUnderProjection = clientProjection.current.revision;
    setInFlight('capture');
    setCaptureUncertain(false);
    setFeedback('');
    try {
      const result = await request({
        path: '/commercial-intake/requests',
        companyContextId: companyId,
        signal: operation.signal,
        method: 'POST',
        body: payload,
        idempotencyKey,
      });
      if (operation.signal.aborted) return;
      if ((await handleAccess(result, companyId, operation.signal)) !== 'ok')
        return;
      if (isUnavailableClient(result)) {
        setFeedback({ requestMessage: 'unavailableClient' });
        return;
      }
      // Invalid fields are rejected without persistence, so the capture is
      // settled rather than uncertain; the entered values stay for correction.
      if (result.status === 400) {
        setFeedback({ requestMessage: 'error' });
        return;
      }
      if (
        (result.status === 200 || result.status === 201) &&
        isClientRequest(result.body) &&
        captureCallbacks.current
      ) {
        const captured = {
          id: result.body.id,
          opportunityTitle: result.body.initialOpportunity.title,
        };
        setForm(emptyForm);
        retry.current = undefined;
        await refreshRecordedActivity();
        if (!operation.signal.aborted)
          captureCallbacks.current?.onCaptured(captured);
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
        await refreshRecordedActivity();
        if (!operation.signal.aborted) await refreshRequests.current(companyId);
        return;
      }
      setFeedback({ requestMessage: 'error' });
      setCaptureUncertain(true);
    } catch {
      if (!operation.signal.aborted) {
        setFeedback({ requestMessage: 'error' });
        setCaptureUncertain(true);
      }
    } finally {
      if (!operation.signal.aborted) setInFlight('none');
      operation.release();
    }
  }

  // One capture form, rendered by the Requests section or alone.
  const captureForm = (
    <form
      className="commercial-intake-form"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <label>
        {copy.originalText}
        <textarea
          value={form.originalText}
          onChange={(event) => updateField('originalText', event.target.value)}
          required
          maxLength={20000}
        />
      </label>
      <label>
        {copy.sourceLabel}
        <input
          value={form.sourceLabel}
          onChange={(event) => updateField('sourceLabel', event.target.value)}
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
          <label htmlFor={`${formId}-client-search`}>{copy.clientSearch}</label>
          <input
            id={`${formId}-client-search`}
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
                <label htmlFor={`${formId}-client`}>
                  {copy.existingClient}
                </label>
                <Select
                  id={`${formId}-client`}
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
          onChange={(event) => updateField('nextAction', event.target.value)}
          required
          maxLength={500}
        />
      </label>
      <button type="submit" disabled={pending}>
        {copy.capture}
      </button>
    </form>
  );
  const captureFeedback = feedback ? (
    <p role="alert">
      {typeof feedback === 'string'
        ? feedback
        : 'outcomeMessage' in feedback
          ? outcomeCopy[feedback.outcomeMessage]
          : copy[feedback.requestMessage]}
    </p>
  ) : null;
  if (requestCapture)
    return (
      <div className="commercial-intake-workspace commercial-intake-capture">
        {load.kind === 'denied' || !intakeReads ? (
          <p role="alert">{copy.denied}</p>
        ) : (
          <>
            <aside
              className="commercial-intake-source"
              aria-label={copy.manualSourceInformation}
            >
              <strong>{copy.manualSource}</strong>
              <p>{copy.manualSourceDetail}</p>
            </aside>
            {captureFeedback}
            {captureForm}
          </>
        )}
      </div>
    );

  // The section is its own navigation destination, because the
  // shell's layout wrapper generates no box that could receive focus.
  if (load.kind === 'denied' || !intakeReads) {
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
      {!clientRestriction ? (
        <OpportunityFollowUpDiscovery
          actor={actor}
          identity={identity}
          clientProjectionAuthority={projectionAuthority}
          disabled={pending || Boolean(protectedWork)}
          onCompanyContextRejected={onCompanyContextRejected}
          onActorRevalidated={onActorRevalidated}
          onWorkspaceAccessRejected={onWorkspaceAccessRejected}
          onOpenRequest={(id) => {
            setRequestedVersion(undefined);
            void selectRequest(id);
          }}
        />
      ) : null}
      <div className="commercial-intake-view">
        <label htmlFor="commercial-intake-view">{copy.viewLabel}</label>
        <Select
          id="commercial-intake-view"
          value={listView}
          options={[
            { value: 'all', label: copy.allRequestsView },
            { value: 'mine_open', label: copy.myOpenCasesView },
          ]}
          describedBy="commercial-intake-view-help"
          onValueChange={changeListView}
        />
        <small id="commercial-intake-view-help">{copy.myOpenCasesHelp}</small>
      </div>
      <aside
        className="commercial-intake-source"
        aria-label={copy.manualSourceInformation}
      >
        <strong>{copy.manualSource}</strong>
        <p>{copy.manualSourceDetail}</p>
      </aside>
      {feedback ? (
        <p role="alert">
          {typeof feedback === 'string'
            ? feedback
            : 'outcomeMessage' in feedback
              ? outcomeCopy[feedback.outcomeMessage]
              : copy[feedback.requestMessage]}
        </p>
      ) : null}
      {requestToOpen && protectedWork ? (
        <p role="status" className="commercial-intake-held-request">
          {protectedWork === 'capture'
            ? copy.requestedAfterCapture
            : protectedWork === 'client-association'
              ? copy.requestedAfterClientAssociation
              : protectedWork === 'responsible-edit'
                ? copy.requestedAfterResponsibleEdit
                : protectedWork === 'outcome-edit'
                  ? outcomeCopy.requestedAfterOutcomeEdit
                  : protectedWork === 'stage-edit'
                    ? stageCopy('requestedAfterStageEdit')
                    : protectedWork === 'follow-up-edit'
                      ? followUpCopy('requestedAfterFollowUpEdit')
                      : copy.requestedAfterNextActionEdit}
        </p>
      ) : null}
      {selected && visibleRequest ? (
        <RequestDetail
          onOpenProject={onOpenProject}
          actor={actor}
          identity={identity}
          request={visibleRequest}
          requestedFocusId={
            requestedRequest?.focusTarget === 'request-detail' &&
            requestedRequest.clientRequestId === visibleRequest.id &&
            requestedRequest.version === undefined
              ? requestedRequest.requestId
              : undefined
          }
          requestedVersion={
            requestedVersion?.clientRequestId === visibleRequest.id
              ? requestedVersion
              : undefined
          }
          clientAuthority={clientReadAuthority}
          onBack={closeDetail}
          pending={pending || followUpProtected}
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
                    followUpProtected ||
                    nextActionEdit.kind !== 'idle' ||
                    outcomeEdit.kind !== 'idle' ||
                    stageEdit.kind !== 'idle',
                  onOpen: () => void openResponsibleEditor(),
                  onSelect: (workspaceMembershipId) =>
                    setResponsibleEdit((current) =>
                      current.kind === 'choosing'
                        ? { ...current, selection: workspaceMembershipId }
                        : current,
                    ),
                  onSave: () => void saveResponsible(),
                  onCancel: () => {
                    responsibleMembers.retire();
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
                    followUpProtected ||
                    responsibleEdit.kind !== 'idle' ||
                    outcomeEdit.kind !== 'idle' ||
                    stageEdit.kind !== 'idle',
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
                    followUpProtected ||
                    nextActionEdit.kind !== 'idle' ||
                    responsibleEdit.kind !== 'idle' ||
                    stageEdit.kind !== 'idle',
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
          stage={
            canSetStage
              ? {
                  edit: stageEdit,
                  blocked:
                    followUpProtected ||
                    nextActionEdit.kind !== 'idle' ||
                    responsibleEdit.kind !== 'idle' ||
                    outcomeEdit.kind !== 'idle',
                  onOpen: () => void openStageEditor(),
                  onSelect: (selection) =>
                    setStageEdit((current) =>
                      current.kind === 'choosing'
                        ? { ...current, selection }
                        : current,
                    ),
                  onSave: () => void saveStage(),
                  onCancel: () => {
                    stageChoices.retire();
                    setStageEdit({ kind: 'idle' });
                    stageRetry.current = undefined;
                    setFeedback('');
                  },
                  onReloadList: () => void openStageEditor(),
                  onReloadRequest: () =>
                    void selectRequest(selected.request.id, true),
                }
              : undefined
          }
          loadOlderStageHistory={loadOlderStageHistory}
          followUp={
            <OpportunityFollowUpPanel
              actor={actor}
              identity={identity}
              requestId={visibleRequest.id}
              opportunityId={visibleRequest.initialOpportunity.id}
              nativeVersion={visibleRequest.initialOpportunity.version}
              nativeStatus={visibleRequest.initialOpportunity.status}
              nativeOutcomeObservation={followUpOutcomeObservation(
                visibleRequest,
              )}
              editorAvailable={
                !pending &&
                !nextActionEditOpen &&
                !responsibleEditOpen &&
                !outcomeEditOpen &&
                !stageEditOpen
              }
              onProtectedChange={(active) => {
                if (followUpGeneration.current !== followUpOwner) return;
                setFollowUpProtection({ generation: followUpOwner, active });
              }}
              onCompanyContextRejected={onCompanyContextRejected}
              onActorRevalidated={onActorRevalidated}
              onWorkspaceAccessRejected={onWorkspaceAccessRejected}
            />
          }
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
                  followUpProtected ||
                  nextActionEditOpen ||
                  responsibleEditOpen ||
                  outcomeEditOpen ||
                  stageEditOpen
                }
                request={request}
                handleAccess={handleAccess}
                onProtectionChange={setAssociationProtection}
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
                  setFeedback({ requestMessage: 'clientAssociationSuccess' });
                  await refreshRecordedActivity();
                  return true;
                }}
              />
            ) : undefined
          }
          onCompanyContextRejected={onCompanyContextRejected}
          onActorRevalidated={onActorRevalidated}
          onWorkspaceAccessRejected={onWorkspaceAccessRejected}
        />
      ) : settingsOpen && companyId ? (
        <SalesStageSettings
          key={companyId}
          identity={identity}
          authority={{
            read: stageReadAuthority,
            configure: stageConfigurationAuthority,
          }}
          companyId={companyId}
          canConfigure={canConfigureStages}
          request={request}
          handleAccess={handleAccess}
          onBack={() => setSettingsOpen(false)}
          onConfigured={onActivityRecorded}
        />
      ) : (
        <>
          <button
            type="button"
            className="commercial-intake-secondary-action"
            onClick={() => {
              setFeedback('');
              setSettingsOpen(true);
            }}
            disabled={pending}
          >
            {stageCopy('openSalesStageSettings')}
          </button>
          {captureForm}
          <RequestList
            load={visibleLoad}
            view={listView}
            pending={pending}
            filter={filter}
            onFilter={setFilter}
            restriction={visibleRestriction}
            onClearRestriction={() => setRestriction(undefined)}
            onSelect={(id) => {
              // Choosing a row is newer than a Request held behind a capture.
              setRequestToOpen(undefined);
              setRequestedVersion(undefined);
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
  view,
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
  view: RequestListView;
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
  const { formatDateTime } = useInterfaceLocale();
  const filterField = useRef<HTMLInputElement>(null);
  const copy = useCommercialRequestCopy();
  const stageCopy = useSalesStageCopy();
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
  if (load.items.length === 0)
    return (
      <p>
        {view === 'mine_open'
          ? copy.myOpenCasesEmpty(companyName)
          : copy.empty(companyName)}
      </p>
    );
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
                {stageCopy('salesStage')}:{' '}
                {item.initialOpportunity.salesStage?.label ??
                  stageCopy('stageNone')}
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
                  {formatDateTime(item.capturedAt)}
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
  requestedVersion,
  requestedFocusId,
  onBack,
  pending,
  onOpenClientDossier,
  responsible,
  nextAction,
  outcome,
  loadOlderOutcomeHistory,
  stage,
  loadOlderStageHistory,
  clientAssociation,
  followUp,
  onCompanyContextRejected,
  onActorRevalidated,
  onWorkspaceAccessRejected,
}: {
  actor: ActorContext;
  onOpenProject?: (projectId: string) => void;
  identity: BrowserIdentity;
  request: ClientRequest;
  /** Opens the Offer or Contract with this exact version selected. */
  requestedVersion: RequestedDetailVersion | undefined;
  requestedFocusId?: number;
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
  /** Offered only with the Sales Stage assignment permission and the reads. */
  stage: StageEditor | undefined;
  loadOlderStageHistory: OlderStageHistory;
  clientAssociation: ReactNode;
  followUp: ReactNode;
  clientAuthority: string;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}) {
  const copy = useCommercialRequestCopy();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (requestedFocusId === undefined || heading.current?.closest('[hidden]'))
      return;
    heading.current?.focus();
  }, [requestedFocusId]);
  const stageCopy = useSalesStageCopy();
  const { formatDateTime } = useInterfaceLocale();
  // The Offer panel remounts when the captured Offer Preparer assignment or
  // version, or the Offer permissions of either Offer bundle, change.
  const offerPreparer = grantOf(actor.activeCompany, 'company_offer_preparer');
  const offerPermissions = [
    ...(offerPreparer?.permissions ?? []),
    ...(grantOf(actor.activeCompany, 'company_offer_approver')?.permissions ??
      []),
  ];
  // Each panel receives only the version it owns, numbered by its request.
  const requestedOffer =
    requestedVersion?.version.type === 'offer_version'
      ? {
          requestId: requestedVersion.requestId,
          offerVersionId: requestedVersion.version.offerVersionId,
        }
      : undefined;
  const requestedContract =
    requestedVersion?.version.type === 'contract_version'
      ? {
          requestId: requestedVersion.requestId,
          version: requestedVersion.version,
        }
      : undefined;
  // RequestDetail survives request changes. A monotonic navigation identity
  // prevents an old A draft from reviving after A → B → A.
  const messageNavigation = JSON.stringify([
    request.id,
    request.initialOpportunity.id,
    requestedOffer?.requestId,
    requestedOffer?.offerVersionId,
  ]);
  const messageOwner = useRef({
    navigation: messageNavigation,
    generation: 0,
    open: 0,
  });
  if (messageOwner.current.navigation !== messageNavigation) {
    messageOwner.current = {
      ...messageOwner.current,
      navigation: messageNavigation,
      generation: messageOwner.current.generation + 1,
    };
  }
  const [messageTarget, setMessageTarget] = useState<{
    source: OfferMessageTarget;
    generation: number;
    navigationGeneration: number;
  } | null>(null);
  const prepareMessage = (source: OfferMessageTarget) => {
    messageOwner.current.open += 1;
    setMessageTarget({
      source,
      generation: messageOwner.current.open,
      navigationGeneration: messageOwner.current.generation,
    });
  };
  const retireMessage = () => {
    setMessageTarget(null);
  };
  const pdfProps = {
    actor,
    identity,
    opportunityId: request.initialOpportunity.id,
    onCompanyContextRejected,
    onActorRevalidated,
    onWorkspaceAccessRejected,
  };
  const offerPdf = useCommercialPdfDownload({
    ...pdfProps,
    kind: 'offer',
    navigation: requestedOffer?.requestId,
  });
  const contractPdf = useCommercialPdfDownload({
    ...pdfProps,
    kind: 'contract',
    navigation: requestedContract?.requestId,
  });
  return (
    <article
      className="commercial-intake-detail"
      aria-labelledby="commercial-intake-detail-title"
    >
      <button type="button" onClick={onBack} disabled={pending}>
        {copy.back}
      </button>
      <p>{copy.detail}</p>
      <h3 id="commercial-intake-detail-title" tabIndex={-1} ref={heading}>
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
              {formatDateTime(request.capturedAt)}
            </time>
            <small>{copy.capturedAtHelp}</small>
          </dd>
        </div>
        {request.reportedReceivedAt ? (
          <div>
            <dt>{copy.reportedReceivedAt}</dt>
            <dd>
              <time dateTime={request.reportedReceivedAt}>
                {formatDateTime(request.reportedReceivedAt)}
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
            {formatDateTime(request.initialOpportunity.statusEnteredAt)}
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
          {stageCopy('salesStage')}:{' '}
          {request.initialOpportunity.salesStage?.label ??
            stageCopy('stageNone')}
        </p>
        {stage ? <OpportunityStage editor={stage} pending={pending} /> : null}
        <OpportunityStageHistory
          key={`stage:${request.initialOpportunity.id}:${request.initialOpportunity.version}`}
          page={request.initialOpportunity.stageHistory}
          loadOlder={loadOlderStageHistory}
        />
        <p>
          {copy.opportunityVersion}: {request.initialOpportunity.version}
        </p>
        {nextAction ? (
          <NextActionEditForm editor={nextAction} pending={pending} />
        ) : null}
        {followUp}
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
        key={`${clientAuthority}:${request.initialOpportunity.id}:${JSON.stringify([grantOf(actor.activeCompany, 'company_pricing_user') ?? null, grantOf(actor.activeCompany, 'company_pricing_adjustment') ?? null])}`}
        actor={actor}
        identity={identity}
        opportunityId={request.initialOpportunity.id}
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
      <OfferMessagePreparation
        actor={actor}
        identity={identity}
        target={
          messageTarget?.navigationGeneration ===
          messageOwner.current.generation
            ? messageTarget
            : null
        }
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
      {offerPdf.controls}
      <OfferPanel
        key={`offer:${requestedOffer?.requestId ?? 'head'}:${clientAuthority}:${actor.internalUserId}:${actor.workspaceId}:${actor.workspaceMembershipId}:${request.id}:${request.initialOpportunity.id}:${offerPreparer?.assignmentId ?? 'no-assignment'}:${offerPreparer?.permissionSetVersion ?? 'no-version'}:${offerPermissions.join(',')}:${request.clientReference?.currentClientId ?? 'no-client'}`}
        pdf={offerPdf.callbacks}
        onPrepareMessage={prepareMessage}
        onMessageNavigate={retireMessage}
        actor={actor}
        identity={identity}
        opportunityId={request.initialOpportunity.id}
        requestedVersionId={requestedOffer?.offerVersionId}
        currentClientId={request.clientReference?.currentClientId}
        clientDisplayName={request.clientReference?.displayName}
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
      {contractPdf.controls}
      <ContractPanel
        pdf={contractPdf.callbacks}
        currentClientId={request.clientReference?.currentClientId}
        onOpenProject={onOpenProject}
        opportunityTitle={request.initialOpportunity.title}
        key={
          (requestedContract?.requestId ?? 'head') +
          ':' +
          clientAuthority +
          ':' +
          request.id +
          ':' +
          request.initialOpportunity.id
        }
        requestedVersion={requestedContract?.version}
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
  const copy = useCommercialRequestCopy();
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
    isOpportunitySalesStage(value.initialOpportunity.salesStage) &&
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
    isOpportunityVersion(value.version, 1) &&
    isConsistentOutcomeSnapshot({
      status: value.status,
      statusEnteredAt: value.statusEnteredAt,
      createdAt: value.createdAt,
      version: value.version,
      outcomeHistory: value.outcomeHistory,
    }) &&
    isOpportunitySalesStage(value.salesStage) &&
    isStageHistoryPage(value.stageHistory, isDisplayableTimestamp) &&
    isConsistentStageSnapshot({
      salesStage: value.salesStage,
      version: value.version,
      stageHistory: value.stageHistory,
    })
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
  sent: {
    opportunityId: string;
    command: string;
    previousStatus: OpportunityOutcomeStatus;
  },
): value is OutcomeChangeResult {
  const { opportunityId, previousStatus } = sent;
  const submitted = submittedOutcome(sent.command);
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
    isOpportunityVersion(receipt.version, 2) &&
    receipt.opportunityId === opportunityId &&
    submitted !== undefined &&
    receipt.previousStatus === previousStatus &&
    receipt.status === submitted.status &&
    receipt.version === submitted.expectedVersion + 1 &&
    isClientRequest(value.request) &&
    value.request.initialOpportunity.id === opportunityId
  );
}

/** The status and observed version of the exact command body sent. */
function submittedOutcome(
  command: string,
): { status: OpportunityOutcomeStatus; expectedVersion: number } | undefined {
  let body: unknown;
  try {
    body = JSON.parse(command);
  } catch {
    return undefined;
  }
  return isRecord(body) &&
    isOpportunityOutcomeStatus(body.status) &&
    typeof body.expectedVersion === 'number' &&
    Number.isSafeInteger(body.expectedVersion)
    ? { status: body.status, expectedVersion: body.expectedVersion }
    : undefined;
}

const STAGE_RECEIPT_FIELDS = [
  'opportunityId',
  'salesStageId',
  'version',
  'outcome',
] as const;

/**
 * The result of the exact stage command sent: the receipt names the command's
 * Opportunity and stage, and its version is the observed one for a no-op or
 * one more for a change. Anything else keeps the command for an explicit
 * retry instead of settling it.
 */
function isStageChangeResult(
  value: unknown,
  sent: {
    opportunityId: string;
    expectedVersion: number;
    salesStageId: string | null;
  },
): value is StageChangeResult {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    !isRecord(value.receipt)
  )
    return false;
  const receipt = value.receipt;
  return (
    Object.keys(receipt).length === STAGE_RECEIPT_FIELDS.length &&
    STAGE_RECEIPT_FIELDS.every((field) => Object.hasOwn(receipt, field)) &&
    receipt.opportunityId === sent.opportunityId &&
    receipt.salesStageId === sent.salesStageId &&
    ((receipt.outcome === 'updated' &&
      receipt.version === sent.expectedVersion + 1) ||
      (receipt.outcome === 'unchanged' &&
        receipt.version === sent.expectedVersion)) &&
    isClientRequest(value.request) &&
    value.request.initialOpportunity.id === sent.opportunityId
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

function followUpOutcomeObservation(request: ClientRequest): string {
  const opportunity = request.initialOpportunity;
  return JSON.stringify([
    opportunity.status,
    opportunity.statusEnteredAt,
    opportunity.outcomeHistory.entries[0]?.version ?? null,
  ]);
}
