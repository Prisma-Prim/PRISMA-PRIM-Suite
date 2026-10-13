import type {
  ClientRequest,
  RequestListItem,
} from '../commercial-intake/CommercialIntakeWorkspace';
import type { OutcomeHistoryEntry } from '../commercial-intake/opportunity-outcome';
import type {
  SalesStage,
  StageHistoryEntry,
} from '../commercial-intake/sales-stage';

/**
 * Typed builders for the Commercial Intake responses web unit tests and
 * Playwright specs mock. Each builder returns a response the workspace parser
 * accepts and takes overrides, so a new response field needs one edit here.
 * Only types are imported: Playwright specs load this module without the
 * workspace component.
 */

type InitialOpportunityResponse = ClientRequest['initialOpportunity'];
type ListOpportunityResponse = RequestListItem['initialOpportunity'];

type InitialOpportunityOverrides = Partial<InitialOpportunityResponse>;

type ClientRequestOverrides = Partial<
  Omit<ClientRequest, 'initialOpportunity'>
> & { initialOpportunity?: InitialOpportunityOverrides };

// Distributes over the list item's Client projection union so a Client display
// name and its dossier identity stay one consistent override.
type ListItemOverridesOf<Item> = Item extends RequestListItem
  ? Partial<Pick<Item, 'id' | 'subject' | 'capturedAt'>> &
      Omit<Item, 'id' | 'subject' | 'capturedAt' | 'initialOpportunity'> & {
        initialOpportunity?: Partial<ListOpportunityResponse>;
      }
  : never;

type RequestListItemOverrides = ListItemOverridesOf<RequestListItem>;

const DEFAULT_INSTANT = '2026-09-20T10:00:00.000Z';

const defaultResponsibleActor = {
  workspaceMembershipId: 'membership-1',
  displayName: 'Iurie',
};

/**
 * One recorded outcome transition: by default the Opportunity was put on hold
 * by its responsible member, the first change after its creation.
 */
export function buildOutcomeHistoryEntry(
  overrides: Partial<OutcomeHistoryEntry> = {},
): OutcomeHistoryEntry {
  return {
    previousStatus: 'OPEN',
    newStatus: 'ON_HOLD',
    lossReasonCode: null,
    reason: 'Awaiting the client budget',
    note: null,
    version: 2,
    actor: {
      workspaceMembershipId: defaultResponsibleActor.workspaceMembershipId,
      displayLabel: defaultResponsibleActor.displayName,
    },
    changedAt: '2026-09-21T10:00:00.000Z',
    ...overrides,
  };
}

/** One configured Sales Stage: by default the first ACTIVE stage. */
export function buildSalesStage(
  overrides: Partial<SalesStage> = {},
): SalesStage {
  return {
    id: 'stage-qualification',
    label: 'Qualification',
    position: 1,
    state: 'ACTIVE',
    ...overrides,
  };
}

/**
 * One recorded Sales Stage assignment: by default the responsible member
 * assigned the first stage to an Opportunity without one.
 */
export function buildStageHistoryEntry(
  overrides: Partial<StageHistoryEntry> = {},
): StageHistoryEntry {
  return {
    previousStage: null,
    newStage: { salesStageId: 'stage-qualification', label: 'Qualification' },
    version: 2,
    actor: {
      workspaceMembershipId: defaultResponsibleActor.workspaceMembershipId,
      displayLabel: defaultResponsibleActor.displayName,
    },
    changedAt: '2026-09-21T11:00:00.000Z',
    ...overrides,
  };
}

/**
 * The initial Opportunity of a Request detail. Without history it is OPEN
 * since its creation at version 1, without a Sales Stage; with history its
 * status, entry time, stage and version follow the newest entries unless
 * overridden. The responsible membership follows the responsible actor.
 */
export function buildInitialOpportunity(
  overrides: InitialOpportunityOverrides = {},
): InitialOpportunityResponse {
  const outcomeHistory = overrides.outcomeHistory ?? { entries: [] };
  const stageHistory = overrides.stageHistory ?? { entries: [] };
  const [newest] = outcomeHistory.entries;
  const [newestStage] = stageHistory.entries;
  const createdAt = overrides.createdAt ?? DEFAULT_INSTANT;
  const responsibleActor =
    overrides.responsibleActor ?? defaultResponsibleActor;
  const assigned = newestStage?.newStage;
  return {
    id: 'opportunity-1',
    title: 'Prepare quality process review',
    scope: null,
    nextAction: 'Arrange a qualification call',
    status: newest?.newStatus ?? 'OPEN',
    statusEnteredAt: newest?.changedAt ?? createdAt,
    responsibleWorkspaceMembershipId: responsibleActor.workspaceMembershipId,
    version: Math.max(newest?.version ?? 1, newestStage?.version ?? 1),
    ...overrides,
    salesStage:
      overrides.salesStage ??
      (assigned
        ? { id: assigned.salesStageId, label: assigned.label, state: 'ACTIVE' }
        : null),
    outcomeHistory,
    stageHistory,
    responsibleActor,
    createdAt,
  };
}

/**
 * A Request detail captured as manual text without a Client association; its
 * initial Opportunity was created when the Request was captured.
 */
export function buildClientRequest({
  initialOpportunity,
  ...overrides
}: ClientRequestOverrides = {}): ClientRequest {
  const capturedAt = overrides.capturedAt ?? DEFAULT_INSTANT;
  return {
    id: 'request-1',
    companyId: 'company-1',
    sourceKind: 'MANUAL_TEXT',
    sourceLabel: null,
    reportedReceivedAt: null,
    subject: 'Quality process preparation',
    originalText: 'Synthetic captured evidence',
    capturedByWorkspaceMembershipId:
      defaultResponsibleActor.workspaceMembershipId,
    version: 1,
    clientAssociationStatus: 'absent',
    ...overrides,
    capturedAt,
    initialOpportunity: buildInitialOpportunity({
      createdAt: capturedAt,
      ...initialOpportunity,
    }),
  };
}

/** A Request list row without a Client projection. */
export function buildRequestListItem({
  initialOpportunity,
  ...overrides
}: RequestListItemOverrides = {}): RequestListItem {
  return {
    id: 'request-1',
    subject: 'Quality process preparation',
    capturedAt: DEFAULT_INSTANT,
    ...overrides,
    initialOpportunity: {
      title: 'Prepare quality process review',
      nextAction: 'Arrange a qualification call',
      status: 'OPEN',
      responsibleActor: defaultResponsibleActor,
      ...initialOpportunity,
      salesStage: initialOpportunity?.salesStage ?? null,
    },
  };
}

/**
 * The list row the API returns for a Request detail, without its Client
 * projection unless overridden.
 */
export function requestListItemFor(
  request: ClientRequest,
  overrides: RequestListItemOverrides = {},
): RequestListItem {
  const { initialOpportunity, ...item } = overrides;
  return buildRequestListItem({
    id: request.id,
    subject: request.subject,
    capturedAt: request.capturedAt,
    ...item,
    initialOpportunity: {
      title: request.initialOpportunity.title,
      nextAction: request.initialOpportunity.nextAction,
      status: request.initialOpportunity.status,
      salesStage: request.initialOpportunity.salesStage,
      responsibleActor: request.initialOpportunity.responsibleActor,
      ...initialOpportunity,
    },
  });
}
