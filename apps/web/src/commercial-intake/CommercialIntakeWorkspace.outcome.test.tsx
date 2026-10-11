import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { changeValue, selectOptionLabels } from '../test/select-option';
import { CommercialIntakeWorkspace } from './CommercialIntakeWorkspace';
import { commercialIntakeCopy as copy } from './commercial-intake.copy';

const ada = {
  workspaceMembershipId: 'membership-ada',
  displayName: 'Ada Ionescu',
};

const intakePermissions: NonNullable<
  ActorContext['activeCompany']
>['commercialIntakePermissions'] = [
  'commercial.request.read',
  'commercial.request.create',
  'commercial.opportunity.read',
  'commercial.opportunity.create',
  'commercial.opportunity.next_action.update',
];

function actorWith(manager: 'v1' | 'v2' | null): ActorContext {
  return {
    internalUserId: 'user-ada',
    workspaceMembershipId: ada.workspaceMembershipId,
    workspaceId: 'workspace-1',
    workspaceName: 'PRISMA Workspace',
    displayName: ada.displayName,
    email: 'ada@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      id: 'company-1',
      displayName: 'PRISMA-PRIM',
      clientPermissions: [],
      commercialIntakePermissions: intakePermissions,
      commercialIntakePermissionAssignmentId: 'intake-assignment',
      commercialIntakePermissionSetVersion: 'v2',
      ...(manager === 'v2'
        ? {
            opportunityManagerPermissions: [
              'commercial.opportunity.assign',
              'commercial.opportunity.outcome.change',
            ],
            opportunityManagerPermissionAssignmentId: 'manager-assignment',
            opportunityManagerPermissionSetVersion: 'v2',
          }
        : manager === 'v1'
          ? {
              opportunityManagerPermissions: ['commercial.opportunity.assign'],
              opportunityManagerPermissionAssignmentId: 'manager-assignment',
              opportunityManagerPermissionSetVersion: 'v1',
            }
          : {}),
    },
  };
}
const manager = actorWith('v2');
const legacyManager = actorWith('v1');
const reader = actorWith(null);

const lostEntry = {
  previousStatus: 'OPEN',
  newStatus: 'LOST',
  lossReasonCode: 'COMPETITOR',
  reason: null,
  note: 'They chose a local auditor.',
  version: 3,
  actor: { workspaceMembershipId: 'membership-ada', displayLabel: 'Ada · 1A' },
  changedAt: '2026-10-02T09:00:00.000Z',
};
const holdEntry = {
  previousStatus: 'OPEN',
  newStatus: 'ON_HOLD',
  lossReasonCode: null,
  reason: 'Budget review until March',
  note: null,
  version: 2,
  actor: { workspaceMembershipId: 'membership-ada', displayLabel: 'Ada · 1A' },
  changedAt: '2026-10-01T09:00:00.000Z',
};

function requestDetail({
  status = 'OPEN',
  statusEnteredAt = '2026-09-26T08:00:00.000Z',
  entries = [],
  nextCursor,
  version = 1,
}: {
  status?: string;
  statusEnteredAt?: string;
  entries?: unknown[];
  nextCursor?: string;
  version?: number;
} = {}) {
  return {
    id: 'request-1',
    companyId: 'company-1',
    sourceKind: 'MANUAL_TEXT',
    sourceLabel: null,
    reportedReceivedAt: null,
    subject: 'Solicitare audit request-1',
    originalText: 'Exact source of request-1.',
    capturedByWorkspaceMembershipId: ada.workspaceMembershipId,
    capturedAt: '2026-09-26T08:00:00.000Z',
    version: 1,
    clientAssociationStatus: 'absent',
    initialOpportunity: {
      id: 'opportunity-request-1',
      title: 'Prepare request-1',
      scope: null,
      nextAction: 'Arrange a qualification call',
      status,
      statusEnteredAt,
      outcomeHistory: {
        entries,
        ...(nextCursor === undefined ? {} : { nextCursor }),
      },
      responsibleWorkspaceMembershipId: ada.workspaceMembershipId,
      responsibleActor: ada,
      createdAt: '2026-09-26T08:00:00.000Z',
      version,
    },
  };
}
function listPage(status = 'OPEN') {
  return {
    items: [
      {
        id: 'request-1',
        subject: 'Solicitare audit request-1',
        capturedAt: '2026-09-26T08:00:00.000Z',
        initialOpportunity: {
          title: 'Prepare request-1',
          nextAction: 'Arrange a qualification call',
          status,
          responsibleActor: ada,
        },
      },
    ],
  };
}
const lostDetail = requestDetail({
  status: 'LOST',
  statusEnteredAt: lostEntry.changedAt,
  entries: [{ ...lostEntry, version: 2 }],
  version: 2,
});
const lostResult = {
  receipt: {
    opportunityId: 'opportunity-request-1',
    previousStatus: 'OPEN',
    status: 'LOST',
    version: 2,
  },
  request: lostDetail,
};

const listPath = 'GET /api/commercial-intake/requests?limit=25';
const detailPath = 'GET /api/commercial-intake/requests/request-1';
const outcomePath =
  'POST /api/commercial-intake/opportunities/opportunity-request-1/outcome';
const historyPath = (cursor: string) =>
  `GET /api/commercial-intake/opportunities/opportunity-request-1/outcome-history?cursor=${cursor}`;

type Responder = () => Promise<Response>;
function reply(value: unknown, status = 200): Responder {
  return () => Promise.resolve(Response.json(value, { status }));
}
function networkFailure(): Responder {
  return () => Promise.reject(new TypeError('Failed to fetch'));
}

/** Answers each `METHOD path` from its own queue. */
function stubRoutes(routes: Record<string, Responder[]>) {
  const unexpected: string[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${input.toString()}`;
      const next = routes[key]?.shift();
      if (!next) {
        unexpected.push(key);
        return new Response(null, { status: 599 });
      }
      return next();
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return {
    unexpected,
    calls: (key: string) =>
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          `${init?.method ?? 'GET'} ${input.toString()}` === key,
      ),
  };
}

function renderWorkspace(
  initialActor: ActorContext,
  onActivityRecorded: () => void = () => undefined,
) {
  const identity = deterministicBrowserIdentity();
  let currentActor = initialActor;
  const element = () => (
    <CommercialIntakeWorkspace
      actor={currentActor}
      identity={identity}
      onCompanyContextRejected={() => undefined}
      onActivityRecorded={onActivityRecorded}
    />
  );
  const view = render(element());
  return {
    selectActor(next: ActorContext) {
      currentActor = next;
      view.rerender(element());
    },
  };
}

async function openRequest() {
  const open = await screen.findByRole('button', {
    name: /^Solicitare audit request-1/u,
  });
  await act(async () => {
    fireEvent.click(open);
  });
  return screen.findByRole('article', { name: 'Solicitare audit request-1' });
}
function transitionSelect(): HTMLElement {
  return screen.getByRole('combobox', { name: copy.outcomeTransition });
}
function keyOf(init: RequestInit | undefined): string | undefined {
  const headers = init?.headers;
  if (!headers || headers instanceof Headers || Array.isArray(headers))
    return undefined;
  return headers['idempotency-key'];
}
function bodyOf(init: RequestInit | undefined): unknown {
  return typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
}

describe('CommercialIntakeWorkspace outcome status', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the status, the time it was entered and the history to a reader without a change control', async () => {
    const transport = stubRoutes({
      [listPath]: [reply(listPage('LOST'))],
      [detailPath]: [
        reply(
          requestDetail({
            status: 'LOST',
            statusEnteredAt: lostEntry.changedAt,
            entries: [lostEntry, holdEntry],
            version: 3,
          }),
        ),
      ],
    });
    renderWorkspace(reader);
    expect(
      await screen.findByText(
        `${copy.status}: ${copy.opportunityStatusLabels.LOST}`,
      ),
    ).toBeVisible();
    const detail = await openRequest();
    expect(within(detail).getByText(/^Status: Lost · Since/u)).toBeVisible();
    const history = within(detail).getByRole('list', {
      name: copy.outcomeHistory,
    });
    const [lost, held] = within(history).getAllByRole('listitem');
    expect(lost).toHaveTextContent('Open → Lost');
    expect(lost).toHaveTextContent('Ada · 1A');
    expect(lost).toHaveTextContent('Loss reason: Competitor');
    expect(lost).toHaveTextContent('Note: They chose a local auditor.');
    expect(held).toHaveTextContent('Open → On hold');
    expect(held).toHaveTextContent('Reason: Budget review until March');
    expect(
      within(detail).queryByRole('button', { name: copy.changeOutcome }),
    ).not.toBeInTheDocument();
    expect(transport.unexpected).toEqual([]);
  });

  it('offers no change control to a legacy v1 manager', async () => {
    stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath]: [reply(requestDetail())],
    });
    renderWorkspace(legacyManager);
    const detail = await openRequest();
    expect(
      within(detail).getByRole('button', { name: copy.changeResponsible }),
    ).toBeVisible();
    expect(
      within(detail).queryByRole('button', { name: copy.changeOutcome }),
    ).not.toBeInTheDocument();
  });

  it('offers only the permitted transitions, asks exactly their fields and records a loss', async () => {
    const recorded = vi.fn();
    const transport = stubRoutes({
      [listPath]: [reply(listPage()), reply(listPage('LOST'))],
      [detailPath]: [reply(requestDetail())],
      [outcomePath]: [reply(lostResult)],
    });
    renderWorkspace(manager, recorded);
    const detail = await openRequest();
    fireEvent.click(
      within(detail).getByRole('button', { name: copy.changeOutcome }),
    );
    expect(selectOptionLabels(transitionSelect())).toEqual([
      copy.outcomeSelectTransition,
      'Put on hold',
      'Mark as won',
      'Mark as lost',
      'Disqualify',
      'Archive',
    ]);
    changeValue(transitionSelect(), 'hold');
    expect(screen.getByLabelText(copy.outcomeReason)).toBeVisible();
    expect(
      screen.queryByRole('combobox', { name: copy.outcomeLossReason }),
    ).not.toBeInTheDocument();
    changeValue(transitionSelect(), 'win');
    expect(screen.queryByLabelText(copy.outcomeReason)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(copy.outcomeNote)).not.toBeInTheDocument();
    changeValue(transitionSelect(), 'lose');
    expect(screen.queryByLabelText(copy.outcomeReason)).not.toBeInTheDocument();
    changeValue(
      screen.getByRole('combobox', { name: copy.outcomeLossReason }),
      'COMPETITOR',
    );
    fireEvent.change(screen.getByLabelText(copy.outcomeNote), {
      target: { value: ' They chose a local auditor. ' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.saveOutcome }));

    expect(await screen.findByText(copy.outcomeChanged)).toBeVisible();
    const [call] = transport.calls(outcomePath);
    expect(bodyOf(call?.[1])).toEqual({
      expectedVersion: 1,
      status: 'LOST',
      lossReasonCode: 'COMPETITOR',
      note: ' They chose a local auditor. ',
    });
    expect(keyOf(call?.[1])).toEqual(expect.any(String));
    const article = screen.getByRole('article', {
      name: 'Solicitare audit request-1',
    });
    expect(within(article).getByText(/^Status: Lost · Since/u)).toBeVisible();
    expect(
      within(article).getByRole('list', { name: copy.outcomeHistory }),
    ).toHaveTextContent('Open → Lost');
    expect(recorded).toHaveBeenCalledTimes(1);
    expect(transport.unexpected).toEqual([]);
  });

  it('keeps the draft on local and server validation and offers Reopen from a closed status', async () => {
    const transport = stubRoutes({
      [listPath]: [reply(listPage('LOST'))],
      [detailPath]: [reply(lostDetail)],
      [outcomePath]: [
        reply({ code: 'VALIDATION_ERROR', field: 'reason' }, 400),
      ],
    });
    renderWorkspace(manager);
    const detail = await openRequest();
    fireEvent.click(
      within(detail).getByRole('button', { name: copy.changeOutcome }),
    );
    expect(selectOptionLabels(transitionSelect())).toEqual([
      copy.outcomeSelectTransition,
      'Reopen',
    ]);
    changeValue(transitionSelect(), 'reopen');
    fireEvent.change(screen.getByLabelText(copy.outcomeReason), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.saveOutcome }));
    expect(await screen.findByText(copy.outcomeValidation)).toBeVisible();
    expect(transport.calls(outcomePath)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(copy.outcomeReason), {
      target: { value: 'Client came back' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.saveOutcome }));
    expect(await screen.findByText(copy.outcomeValidation)).toBeVisible();
    expect(bodyOf(transport.calls(outcomePath)[0]?.[1])).toEqual({
      expectedVersion: 2,
      status: 'OPEN',
      reason: 'Client came back',
    });
    expect(screen.getByLabelText(copy.outcomeReason)).toHaveValue(
      'Client came back',
    );
    expect(screen.getByLabelText(copy.outcomeReason)).toBeEnabled();
  });

  it('keeps payload, version and key for an explicit retry after an uncertain outcome', async () => {
    const transport = stubRoutes({
      [listPath]: [reply(listPage()), reply(listPage('LOST'))],
      [detailPath]: [reply(requestDetail())],
      [outcomePath]: [networkFailure(), reply(lostResult)],
    });
    renderWorkspace(manager);
    const detail = await openRequest();
    fireEvent.click(
      within(detail).getByRole('button', { name: copy.changeOutcome }),
    );
    changeValue(transitionSelect(), 'lose');
    changeValue(
      screen.getByRole('combobox', { name: copy.outcomeLossReason }),
      'UNKNOWN',
    );
    fireEvent.click(screen.getByRole('button', { name: copy.saveOutcome }));
    expect(await screen.findByText(copy.outcomeUncertain)).toBeVisible();
    expect(screen.getByLabelText(copy.outcomeNote)).toBeDisabled();
    expect(transitionSelect()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: copy.retryOutcome }));
    expect(await screen.findByText(copy.outcomeChanged)).toBeVisible();
    const [first, retried] = transport.calls(outcomePath);
    expect(bodyOf(first?.[1])).toEqual({
      expectedVersion: 1,
      status: 'LOST',
      lossReasonCode: 'UNKNOWN',
    });
    expect(retried?.[1]?.body).toEqual(first?.[1]?.body);
    expect(keyOf(retried?.[1])).toEqual(keyOf(first?.[1]));
  });

  it.each<[string, Record<string, unknown>]>([
    ['the same status', { previousStatus: 'LOST', status: 'LOST' }],
    ['a pair outside the table', { previousStatus: 'WON', status: 'LOST' }],
    ['the initial version', { version: 1 }],
    ['an extra receipt field', { extra: true }],
  ])(
    'keeps the command for an explicit retry when a success carries %s',
    async (_case, receiptOverrides) => {
      const malformed = {
        ...lostResult,
        receipt: { ...lostResult.receipt, ...receiptOverrides },
      };
      const transport = stubRoutes({
        [listPath]: [reply(listPage()), reply(listPage('LOST'))],
        [detailPath]: [reply(requestDetail())],
        [outcomePath]: [reply(malformed), reply(lostResult)],
      });
      renderWorkspace(manager);
      const detail = await openRequest();
      fireEvent.click(
        within(detail).getByRole('button', { name: copy.changeOutcome }),
      );
      changeValue(transitionSelect(), 'lose');
      changeValue(
        screen.getByRole('combobox', { name: copy.outcomeLossReason }),
        'UNKNOWN',
      );
      fireEvent.click(screen.getByRole('button', { name: copy.saveOutcome }));
      expect(await screen.findByText(copy.outcomeUncertain)).toBeVisible();
      expect(screen.queryByText(copy.outcomeChanged)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: copy.retryOutcome }));
      expect(await screen.findByText(copy.outcomeChanged)).toBeVisible();
      const [first, retried] = transport.calls(outcomePath);
      expect(retried?.[1]?.body).toEqual(first?.[1]?.body);
      expect(keyOf(retried?.[1])).toEqual(keyOf(first?.[1]));
    },
  );

  it('requires an explicit reload after a conflict', async () => {
    const transport = stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath]: [
        reply(requestDetail()),
        reply(requestDetail({ status: 'WON', version: 2 })),
      ],
      [outcomePath]: [reply({ code: 'STALE_VERSION' }, 409)],
    });
    renderWorkspace(manager);
    const detail = await openRequest();
    fireEvent.click(
      within(detail).getByRole('button', { name: copy.changeOutcome }),
    );
    changeValue(transitionSelect(), 'win');
    fireEvent.click(screen.getByRole('button', { name: copy.saveOutcome }));
    expect(await screen.findByText(copy.outcomeConflict)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: copy.changeOutcome }),
    ).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copy.reloadRequest }));
    });
    expect(await screen.findByText(/^Status: Won · Since/u)).toBeVisible();
    expect(
      screen.getByRole('button', { name: copy.changeOutcome }),
    ).toBeEnabled();
    expect(transport.calls(detailPath)).toHaveLength(2);
  });

  it('clears the draft when outcome authority is lost and shares the one-open-editor rule', async () => {
    stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath]: [reply(requestDetail())],
    });
    const workspace = renderWorkspace(manager);
    const detail = await openRequest();
    fireEvent.click(
      within(detail).getByRole('button', { name: copy.editNextAction }),
    );
    expect(
      within(detail).getByRole('button', { name: copy.changeOutcome }),
    ).toBeDisabled();
    fireEvent.click(
      within(detail).getByRole('button', { name: copy.cancelNextAction }),
    );
    fireEvent.click(
      within(detail).getByRole('button', { name: copy.changeOutcome }),
    );
    expect(
      within(detail).getByRole('button', { name: copy.editNextAction }),
    ).toBeDisabled();
    expect(
      within(detail).getByRole('button', { name: copy.changeResponsible }),
    ).toBeDisabled();
    changeValue(transitionSelect(), 'hold');
    fireEvent.change(screen.getByLabelText(copy.outcomeReason), {
      target: { value: 'Draft reason' },
    });

    act(() => workspace.selectActor(legacyManager));
    expect(await screen.findByText(copy.outcomeDenied)).toBeVisible();
    expect(screen.queryByLabelText(copy.outcomeReason)).not.toBeInTheDocument();
    expect(
      within(detail).getByRole('button', { name: copy.editNextAction }),
    ).toBeEnabled();
    act(() => workspace.selectActor(manager));
    fireEvent.click(
      within(detail).getByRole('button', { name: copy.changeOutcome }),
    );
    expect(transitionSelect()).toHaveTextContent(copy.outcomeSelectTransition);
  });

  it('reads each older history page from its opaque cursor', async () => {
    const transport = stubRoutes({
      [listPath]: [reply(listPage('LOST'))],
      [detailPath]: [
        reply(
          requestDetail({
            status: 'LOST',
            statusEnteredAt: lostEntry.changedAt,
            entries: [lostEntry],
            nextCursor: 'opaque-1',
            version: 3,
          }),
        ),
      ],
      [historyPath('opaque-1')]: [reply({ entries: [holdEntry] })],
    });
    renderWorkspace(reader);
    const detail = await openRequest();
    await act(async () => {
      fireEvent.click(
        within(detail).getByRole('button', { name: copy.outcomeHistoryOlder }),
      );
    });
    const history = within(detail).getByRole('list', {
      name: copy.outcomeHistory,
    });
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);
    expect(history).toHaveTextContent('Reason: Budget review until March');
    expect(
      within(detail).queryByRole('button', { name: copy.outcomeHistoryOlder }),
    ).not.toBeInTheDocument();
    expect(transport.unexpected).toEqual([]);
  });
});
