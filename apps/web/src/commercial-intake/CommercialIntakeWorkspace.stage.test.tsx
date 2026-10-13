import {
  act,
  fireEvent,
  render as renderInLocale,
  screen,
  within,
} from '@testing-library/react';
import { render } from '../test/render-with-interface-locale';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  type InterfaceLocale,
} from '../localization/interface-locale';
import {
  assertMessageCoverage,
  resolveMessage,
} from '../localization/messages';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { changeValue, selectOptionLabels } from '../test/select-option';
import {
  buildClientRequest,
  buildSalesStage,
  buildStageHistoryEntry,
  requestListItemFor,
} from '../test/commercial-intake-responses';
import { CommercialIntakeWorkspace } from './CommercialIntakeWorkspace';
import { commercialIntakeCopy as copy } from './commercial-intake.copy';
import {
  salesStageMessages,
  type SalesStageMessageKey,
} from './sales-stage.copy';
import type { SalesStage, StageHistoryEntry } from './sales-stage';

// The tests render in English; one case below renders every other locale.
function stage(key: SalesStageMessageKey, locale: InterfaceLocale = 'en') {
  return resolveMessage(salesStageMessages, locale, key);
}

const ion = {
  workspaceMembershipId: 'membership-ion',
  displayName: 'Ion Popa',
};

const v3Permissions: NonNullable<
  NonNullable<ActorContext['activeCompany']>['commercialIntakePermissions']
> = [
  'commercial.request.read',
  'commercial.request.create',
  'commercial.opportunity.read',
  'commercial.opportunity.create',
  'commercial.opportunity.next_action.update',
  'commercial.request.client.associate',
];

function actorWith({
  intake,
  configuration = false,
}: {
  intake: 'v3' | 'v4';
  configuration?: boolean;
}): ActorContext {
  return {
    internalUserId: 'user-ion',
    workspaceMembershipId: ion.workspaceMembershipId,
    workspaceId: 'workspace-1',
    workspaceName: 'PRISMA Workspace',
    displayName: ion.displayName,
    email: 'ion@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      id: 'company-1',
      displayName: 'PRISMA-PRIM',
      clientPermissions: [],
      commercialIntakePermissions:
        intake === 'v4'
          ? [...v3Permissions, 'commercial.opportunity.stage.set']
          : v3Permissions,
      commercialIntakePermissionAssignmentId: 'intake-assignment',
      commercialIntakePermissionSetVersion: intake,
      ...(configuration
        ? {
            salesStageConfigurationPermissions: [
              'commercial.sales_stage.configure',
            ],
            salesStageConfigurationPermissionAssignmentId:
              'configuration-assignment',
            salesStageConfigurationPermissionSetVersion: 'v1',
          }
        : {}),
    },
  };
}
const seller = actorWith({ intake: 'v4' });
const legacySeller = actorWith({ intake: 'v3' });
const configurator = actorWith({ intake: 'v4', configuration: true });

const qualification = buildSalesStage();
// A tenant label in the Company's own working language, shown as entered.
const negotiation = buildSalesStage({
  id: 'stage-negotiation',
  label: 'Negociere finală',
  position: 2,
});

function stageList(stages: SalesStage[] = [], revision = stages.length) {
  return { revision, stages };
}

function requestDetail({
  entries = [],
  nextCursor,
  version = entries[0]?.version ?? 1,
}: {
  entries?: StageHistoryEntry[];
  nextCursor?: string;
  version?: number;
} = {}) {
  return buildClientRequest({
    id: 'request-1',
    subject: 'Solicitare audit request-1',
    capturedByWorkspaceMembershipId: ion.workspaceMembershipId,
    capturedAt: '2026-09-26T08:00:00.000Z',
    initialOpportunity: {
      id: 'opportunity-request-1',
      title: 'Prepare request-1',
      responsibleActor: ion,
      stageHistory: {
        entries,
        ...(nextCursor === undefined ? {} : { nextCursor }),
      },
      version,
    },
  });
}
const assignedEntry = buildStageHistoryEntry({
  actor: {
    workspaceMembershipId: ion.workspaceMembershipId,
    displayLabel: 'Ion · 2B',
  },
});
const assignedDetail = requestDetail({ entries: [assignedEntry] });
function listPage(detail = requestDetail()) {
  return { items: [requestListItemFor(detail)] };
}

const listPath = 'GET /api/commercial-intake/requests?limit=25';
const detailPath = 'GET /api/commercial-intake/requests/request-1';
const stagesPath = 'GET /api/sales-stages';
const createPath = 'POST /api/sales-stages';
const setPath =
  'POST /api/commercial-intake/opportunities/opportunity-request-1/stage';
const historyPath = (cursor: string) =>
  `GET /api/commercial-intake/opportunities/opportunity-request-1/stage-history?cursor=${cursor}`;

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
async function openSettings() {
  await act(async () => {
    fireEvent.click(
      await screen.findByRole('button', {
        name: stage('openSalesStageSettings'),
      }),
    );
  });
  return screen.findByRole('region', { name: stage('salesStageSettings') });
}
function stageSelect(): HTMLElement {
  return screen.getByRole('combobox', { name: stage('stageChoice') });
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

describe('Sales Stage settings', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the ordered stages read-only to a Commercial Intake reader without the configuration bundle', async () => {
    const transport = stubRoutes({
      [listPath]: [reply(listPage())],
      [stagesPath]: [reply(stageList([qualification, negotiation]))],
    });
    renderWorkspace(seller);
    const settings = await openSettings();
    const list = await within(settings).findByRole('list', {
      name: stage('salesStageList'),
    });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['QualificationActive', 'Negociere finalăActive']);
    expect(
      within(settings).getByText(stage('salesStageReadOnly')),
    ).toBeVisible();
    expect(
      within(settings).queryByLabelText(stage('salesStageLabel')),
    ).not.toBeInTheDocument();
    fireEvent.click(within(settings).getByRole('button', { name: copy.back }));
    expect(
      await screen.findByRole('button', {
        name: stage('openSalesStageSettings'),
      }),
    ).toBeVisible();
    expect(transport.unexpected).toEqual([]);
  });

  it('lets a configuration holder create the first stage of an empty Company at revision 0', async () => {
    const recorded = vi.fn();
    const transport = stubRoutes({
      [listPath]: [reply(listPage())],
      [stagesPath]: [reply(stageList())],
      [createPath]: [
        reply(
          {
            receipt: {
              operation: 'CREATED',
              salesStageId: qualification.id,
              label: qualification.label,
              position: 1,
              revision: 1,
            },
            configuration: stageList([qualification]),
          },
          201,
        ),
      ],
    });
    renderWorkspace(configurator, recorded);
    const settings = await openSettings();
    expect(
      await within(settings).findByText(stage('salesStagesEmpty')),
    ).toBeVisible();
    fireEvent.change(
      within(settings).getByLabelText(stage('salesStageLabel')),
      {
        target: { value: 'Qualification' },
      },
    );
    await act(async () => {
      fireEvent.click(
        within(settings).getByRole('button', {
          name: stage('createSalesStage'),
        }),
      );
    });
    expect(await screen.findByText(stage('salesStageCreated'))).toBeVisible();
    expect(bodyOf(transport.calls(createPath)[0]?.[1])).toEqual({
      expectedRevision: 0,
      label: 'Qualification',
    });
    expect(
      within(
        within(settings).getByRole('list', { name: stage('salesStageList') }),
      ).getByText('Qualification'),
    ).toBeVisible();
    expect(
      within(settings).getByLabelText(stage('salesStageLabel')),
    ).toHaveValue('');
    expect(recorded).toHaveBeenCalledTimes(1);
    expect(transport.unexpected).toEqual([]);
  });

  it('keeps a taken label for correction, refuses blank labels locally and retries an uncertain create with its key', async () => {
    const transport = stubRoutes({
      [listPath]: [reply(listPage())],
      [stagesPath]: [reply(stageList([qualification]))],
      [createPath]: [
        reply({ code: 'SALES_STAGE_LABEL_TAKEN', field: 'label' }, 400),
        networkFailure(),
        reply(
          {
            receipt: {
              operation: 'CREATED',
              salesStageId: negotiation.id,
              label: negotiation.label,
              position: 2,
              revision: 2,
            },
            configuration: stageList([qualification, negotiation]),
          },
          201,
        ),
      ],
    });
    renderWorkspace(configurator);
    const settings = await openSettings();
    const field = await within(settings).findByLabelText(
      stage('salesStageLabel'),
    );
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.click(
      within(settings).getByRole('button', { name: stage('createSalesStage') }),
    );
    expect(
      within(settings).getByText(stage('salesStageLabelValidation')),
    ).toBeVisible();
    expect(transport.calls(createPath)).toHaveLength(0);

    fireEvent.change(field, { target: { value: 'QUALIFICATION' } });
    await act(async () => {
      fireEvent.click(
        within(settings).getByRole('button', {
          name: stage('createSalesStage'),
        }),
      );
    });
    expect(
      await within(settings).findByText(stage('salesStageLabelTaken')),
    ).toBeVisible();
    expect(field).toHaveValue('QUALIFICATION');
    expect(field).toBeEnabled();

    fireEvent.change(field, { target: { value: 'Negociere finală' } });
    await act(async () => {
      fireEvent.click(
        within(settings).getByRole('button', {
          name: stage('createSalesStage'),
        }),
      );
    });
    expect(await screen.findByText(stage('salesStageUncertain'))).toBeVisible();
    expect(field).toBeDisabled();
    await act(async () => {
      fireEvent.click(
        within(settings).getByRole('button', {
          name: stage('retrySalesStage'),
        }),
      );
    });
    expect(await screen.findByText(stage('salesStageCreated'))).toBeVisible();
    const [, uncertain, retried] = transport.calls(createPath);
    expect(bodyOf(uncertain?.[1])).toEqual({
      expectedRevision: 1,
      label: 'Negociere finală',
    });
    expect(retried?.[1]?.body).toEqual(uncertain?.[1]?.body);
    expect(keyOf(retried?.[1])).toEqual(keyOf(uncertain?.[1]));
  });

  it('requires an explicit reload after a stale revision and states the 30-stage limit', async () => {
    const full = Array.from({ length: 30 }, (_, index) =>
      buildSalesStage({
        id: `stage-${index + 1}`,
        label: `Stage ${index + 1}`,
        position: index + 1,
      }),
    );
    const transport = stubRoutes({
      [listPath]: [reply(listPage())],
      [stagesPath]: [reply(stageList()), reply(stageList(full))],
      [createPath]: [reply({ code: 'STALE_CONFIGURATION' }, 409)],
    });
    renderWorkspace(configurator);
    const settings = await openSettings();
    fireEvent.change(
      await within(settings).findByLabelText(stage('salesStageLabel')),
      { target: { value: 'Qualification' } },
    );
    await act(async () => {
      fireEvent.click(
        within(settings).getByRole('button', {
          name: stage('createSalesStage'),
        }),
      );
    });
    expect(await screen.findByText(stage('salesStageConflict'))).toBeVisible();
    expect(
      within(settings).queryByLabelText(stage('salesStageLabel')),
    ).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(
        within(settings).getByRole('button', {
          name: stage('salesStagesReload'),
        }),
      );
    });
    expect(await within(settings).findByText('Stage 30')).toBeVisible();
    expect(within(settings).getByText(stage('salesStageLimit'))).toBeVisible();
    expect(
      within(settings).queryByLabelText(stage('salesStageLabel')),
    ).not.toBeInTheDocument();
    expect(transport.calls(stagesPath)).toHaveLength(2);
  });
});

describe('Opportunity Sales Stage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the stage, its history and the list column without a change control to a v3 holder', async () => {
    const transport = stubRoutes({
      [listPath]: [reply(listPage(assignedDetail))],
      [detailPath]: [reply(assignedDetail)],
    });
    renderWorkspace(legacySeller);
    expect(
      await screen.findByText(`${stage('salesStage')}: Qualification`),
    ).toBeVisible();
    const detail = await openRequest();
    expect(
      within(detail).getByText(`${stage('salesStage')}: Qualification`),
    ).toBeVisible();
    const history = within(detail).getByRole('list', {
      name: stage('stageHistory'),
    });
    expect(within(history).getByRole('listitem')).toHaveTextContent(
      'No Sales Stage → Qualification',
    );
    expect(within(history).getByRole('listitem')).toHaveTextContent('Ion · 2B');
    expect(
      within(detail).queryByRole('button', { name: stage('changeStage') }),
    ).not.toBeInTheDocument();
    expect(transport.unexpected).toEqual([]);
  });

  it('explains that a configuration holder must create a stage first when none is configured', async () => {
    stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath]: [reply(requestDetail())],
      [stagesPath]: [reply(stageList())],
    });
    renderWorkspace(seller);
    const detail = await openRequest();
    expect(
      within(detail).getByText(`${stage('salesStage')}: ${stage('stageNone')}`),
    ).toBeVisible();
    expect(within(detail).getByText(stage('stageHistoryEmpty'))).toBeVisible();
    await act(async () => {
      fireEvent.click(
        within(detail).getByRole('button', { name: stage('changeStage') }),
      );
    });
    expect(await screen.findByText(stage('stageNoneConfigured'))).toBeVisible();
    expect(
      screen.queryByRole('button', { name: stage('saveStage') }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: stage('cancelStage') }));
    expect(
      within(detail).getByRole('button', { name: stage('changeStage') }),
    ).toBeEnabled();
  });

  it('assigns an ACTIVE stage in order, then clears it, each shown with its history', async () => {
    const recorded = vi.fn();
    const clearedEntry = buildStageHistoryEntry({
      previousStage: { salesStageId: qualification.id, label: 'Qualification' },
      newStage: null,
      version: 3,
      changedAt: '2026-09-22T09:00:00.000Z',
    });
    const clearedDetail = requestDetail({
      entries: [clearedEntry, assignedEntry],
    });
    const transport = stubRoutes({
      [listPath]: [
        reply(listPage()),
        reply(listPage(assignedDetail)),
        reply(listPage(clearedDetail)),
      ],
      [detailPath]: [reply(requestDetail())],
      [stagesPath]: [
        reply(stageList([qualification, negotiation])),
        reply(stageList([qualification, negotiation])),
      ],
      [setPath]: [
        reply({
          receipt: {
            opportunityId: 'opportunity-request-1',
            salesStageId: qualification.id,
            version: 2,
            outcome: 'updated',
          },
          request: assignedDetail,
        }),
        reply({
          receipt: {
            opportunityId: 'opportunity-request-1',
            salesStageId: null,
            version: 3,
            outcome: 'updated',
          },
          request: clearedDetail,
        }),
      ],
    });
    renderWorkspace(seller, recorded);
    const detail = await openRequest();
    await act(async () => {
      fireEvent.click(
        within(detail).getByRole('button', { name: stage('changeStage') }),
      );
    });
    expect(selectOptionLabels(stageSelect())).toEqual([
      stage('stageNone'),
      'Qualification',
      'Negociere finală',
    ]);
    changeValue(stageSelect(), qualification.id);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: stage('saveStage') }));
    });
    expect(await screen.findByText(stage('stageChanged'))).toBeVisible();
    expect(bodyOf(transport.calls(setPath)[0]?.[1])).toEqual({
      expectedVersion: 1,
      salesStageId: qualification.id,
    });
    expect(
      within(detail).getByText(`${stage('salesStage')}: Qualification`),
    ).toBeVisible();

    await act(async () => {
      fireEvent.click(
        within(detail).getByRole('button', { name: stage('changeStage') }),
      );
    });
    expect(stageSelect()).toHaveTextContent('Qualification');
    changeValue(stageSelect(), 'none');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: stage('saveStage') }));
    });
    expect(await screen.findByText(stage('stageChanged'))).toBeVisible();
    expect(bodyOf(transport.calls(setPath)[1]?.[1])).toEqual({
      expectedVersion: 2,
      salesStageId: null,
    });
    expect(
      within(detail).getByText(`${stage('salesStage')}: ${stage('stageNone')}`),
    ).toBeVisible();
    expect(
      within(within(detail).getByRole('list', { name: stage('stageHistory') }))
        .getAllByRole('listitem')
        .map((item) => item.querySelector('strong')?.textContent),
    ).toEqual([
      'Qualification → No Sales Stage',
      'No Sales Stage → Qualification',
    ]);
    expect(recorded).toHaveBeenCalledTimes(2);
    expect(transport.unexpected).toEqual([]);
  });

  it('reloads the list for an unavailable stage, the Request after a conflict, and retries an uncertain change with its key', async () => {
    const transport = stubRoutes({
      [listPath]: [reply(listPage()), reply(listPage(assignedDetail))],
      [detailPath]: [reply(requestDetail()), reply(requestDetail())],
      [stagesPath]: [
        reply(stageList([qualification, negotiation])),
        reply(stageList([qualification])),
        reply(stageList([qualification])),
      ],
      [setPath]: [
        reply({ code: 'SALES_STAGE_UNAVAILABLE' }, 409),
        reply({ code: 'STALE_VERSION' }, 409),
        networkFailure(),
        reply({
          receipt: {
            opportunityId: 'opportunity-request-1',
            salesStageId: qualification.id,
            version: 2,
            outcome: 'updated',
          },
          request: assignedDetail,
        }),
      ],
    });
    renderWorkspace(seller);
    const detail = await openRequest();
    await act(async () => {
      fireEvent.click(
        within(detail).getByRole('button', { name: stage('changeStage') }),
      );
    });
    changeValue(stageSelect(), negotiation.id);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: stage('saveStage') }));
    });
    expect(await screen.findByText(stage('stageUnavailable'))).toBeVisible();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: stage('stageReloadList') }),
      );
    });
    expect(selectOptionLabels(stageSelect())).toEqual([
      stage('stageNone'),
      'Qualification',
    ]);
    changeValue(stageSelect(), qualification.id);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: stage('saveStage') }));
    });
    expect(await screen.findByText(stage('stageConflict'))).toBeVisible();
    expect(
      screen.queryByRole('button', { name: stage('changeStage') }),
    ).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copy.reloadRequest }));
    });
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: stage('changeStage') }),
      );
    });
    changeValue(stageSelect(), qualification.id);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: stage('saveStage') }));
    });
    expect(await screen.findByText(stage('stageUncertain'))).toBeVisible();
    expect(stageSelect()).toBeDisabled();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: stage('retryStage') }),
      );
    });
    expect(await screen.findByText(stage('stageChanged'))).toBeVisible();
    const calls = transport.calls(setPath);
    expect(calls).toHaveLength(4);
    expect(calls[3]?.[1]?.body).toEqual(calls[2]?.[1]?.body);
    expect(keyOf(calls[3]?.[1])).toEqual(keyOf(calls[2]?.[1]));
    expect(keyOf(calls[2]?.[1])).not.toEqual(keyOf(calls[1]?.[1]));
  });

  it('shares the one-open-editor rule and clears the editor when the v4 assignment is lost', async () => {
    stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath]: [reply(requestDetail())],
      [stagesPath]: [reply(stageList([qualification]))],
    });
    const workspace = renderWorkspace(seller);
    const detail = await openRequest();
    fireEvent.click(
      within(detail).getByRole('button', { name: copy.editNextAction }),
    );
    expect(
      within(detail).getByRole('button', { name: stage('changeStage') }),
    ).toBeDisabled();
    fireEvent.click(
      within(detail).getByRole('button', { name: copy.cancelNextAction }),
    );
    await act(async () => {
      fireEvent.click(
        within(detail).getByRole('button', { name: stage('changeStage') }),
      );
    });
    expect(
      within(detail).getByRole('button', { name: copy.editNextAction }),
    ).toBeDisabled();
    changeValue(stageSelect(), qualification.id);

    act(() => workspace.selectActor(legacySeller));
    expect(await screen.findByText(stage('stageDenied'))).toBeVisible();
    expect(
      screen.queryByRole('combobox', { name: stage('stageChoice') }),
    ).not.toBeInTheDocument();
    expect(
      within(detail).getByRole('button', { name: copy.editNextAction }),
    ).toBeEnabled();
  });

  it('reads each older stage history page from its opaque cursor', async () => {
    const reassigned = buildStageHistoryEntry({
      previousStage: { salesStageId: qualification.id, label: 'Qualification' },
      newStage: { salesStageId: negotiation.id, label: 'Negociere finală' },
      version: 3,
      changedAt: '2026-09-22T09:00:00.000Z',
    });
    const transport = stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath]: [
        reply(
          requestDetail({
            entries: [reassigned],
            nextCursor: 'opaque-1',
          }),
        ),
      ],
      [historyPath('opaque-1')]: [reply({ entries: [assignedEntry] })],
    });
    renderWorkspace(legacySeller);
    const detail = await openRequest();
    await act(async () => {
      fireEvent.click(
        within(detail).getByRole('button', {
          name: stage('stageHistoryOlder'),
        }),
      );
    });
    const history = within(detail).getByRole('list', {
      name: stage('stageHistory'),
    });
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);
    expect(
      within(detail).queryByRole('button', {
        name: stage('stageHistoryOlder'),
      }),
    ).not.toBeInTheDocument();
    expect(transport.unexpected).toEqual([]);
  });

  it('rejects a detail whose stage disagrees with its newest history entry', async () => {
    stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath]: [
        reply({
          ...assignedDetail,
          initialOpportunity: {
            ...assignedDetail.initialOpportunity,
            salesStage: {
              id: negotiation.id,
              label: negotiation.label,
              state: 'ACTIVE',
            },
          },
        }),
      ],
    });
    renderWorkspace(seller);
    const open = await screen.findByRole('button', {
      name: /^Solicitare audit request-1/u,
    });
    await act(async () => {
      fireEvent.click(open);
    });
    expect(await screen.findByText(copy.error)).toBeVisible();
    expect(
      screen.queryByRole('article', { name: 'Solicitare audit request-1' }),
    ).not.toBeInTheDocument();
  });
});

describe('Sales Stage localization', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('translates every Sales Stage message in the four interface locales', () => {
    expect(() =>
      assertMessageCoverage('salesStage', salesStageMessages),
    ).not.toThrow();
  });

  it.each<InterfaceLocale>(['ro', 'ru', 'fr'])(
    'shows the settings and the stage editor in %s while stage labels stay as entered',
    async (locale) => {
      localStorage.setItem(interfaceLocaleStorageKey, locale);
      stubRoutes({
        [listPath]: [reply(listPage(assignedDetail))],
        [stagesPath]: [
          reply(stageList([qualification, negotiation])),
          reply(stageList([qualification, negotiation])),
        ],
        [detailPath]: [reply(assignedDetail)],
      });
      renderInLocale(
        <InterfaceLocaleProvider>
          <CommercialIntakeWorkspace
            actor={configurator}
            identity={deterministicBrowserIdentity()}
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      expect(
        await screen.findByText(
          `${stage('salesStage', locale)}: Qualification`,
        ),
      ).toBeVisible();
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', {
            name: stage('openSalesStageSettings', locale),
          }),
        );
      });
      const settings = await screen.findByRole('region', {
        name: stage('salesStageSettings', locale),
      });
      const list = await within(settings).findByRole('list', {
        name: stage('salesStageList', locale),
      });
      expect(within(list).getByText('Negociere finală')).toBeVisible();
      expect(
        within(list).getAllByText(stage('stateActive', locale)),
      ).toHaveLength(2);
      expect(
        within(settings).getByLabelText(stage('salesStageLabel', locale)),
      ).toBeVisible();
      expect(
        within(settings).getByRole('button', {
          name: stage('createSalesStage', locale),
        }),
      ).toBeVisible();
      fireEvent.click(
        within(settings).getByRole('button', { name: copy.back }),
      );

      const open = await screen.findByRole('button', {
        name: /^Solicitare audit request-1/u,
      });
      await act(async () => {
        fireEvent.click(open);
      });
      const detail = await screen.findByRole('article', {
        name: 'Solicitare audit request-1',
      });
      expect(
        within(
          within(detail).getByRole('list', {
            name: stage('stageHistory', locale),
          }),
        ).getByRole('listitem'),
      ).toHaveTextContent(`${stage('stageNone', locale)} → Qualification`);
      await act(async () => {
        fireEvent.click(
          within(detail).getByRole('button', {
            name: stage('changeStage', locale),
          }),
        );
      });
      expect(
        selectOptionLabels(
          screen.getByRole('combobox', { name: stage('stageChoice', locale) }),
        ),
      ).toEqual([
        stage('stageNone', locale),
        'Qualification',
        'Negociere finală',
      ]);
      expect(
        screen.getByRole('button', { name: stage('saveStage', locale) }),
      ).toBeVisible();
    },
  );
});
