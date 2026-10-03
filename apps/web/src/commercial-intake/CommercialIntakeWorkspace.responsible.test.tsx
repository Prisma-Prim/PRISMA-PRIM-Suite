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
const ion = {
  workspaceMembershipId: 'membership-ion',
  displayName: 'Ion Popa',
};
const adaCandidate = {
  workspaceMembershipId: ada.workspaceMembershipId,
  displayLabel: 'Ada Ionescu · 1A',
};
const ionCandidate = {
  workspaceMembershipId: ion.workspaceMembershipId,
  displayLabel: 'Ion Popa · 2B',
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

function actorWith(
  manager: {
    assignmentId: string;
  } | null,
): ActorContext {
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
      ...(manager
        ? {
            opportunityManagerPermissions: ['commercial.opportunity.assign'],
            opportunityManagerPermissionAssignmentId: manager.assignmentId,
            opportunityManagerPermissionSetVersion: 'v1',
          }
        : {}),
    },
  };
}
const manager = actorWith({ assignmentId: 'manager-assignment-1' });
const reader = actorWith(null);
const associationManager: ActorContext = {
  ...manager,
  activeCompany: {
    id: 'company-1',
    displayName: 'PRISMA-PRIM',
    clientPermissions: ['client.read'],
    commercialIntakePermissions: [
      ...intakePermissions,
      'commercial.request.client.associate',
    ],
    commercialIntakePermissionAssignmentId: 'intake-assignment',
    commercialIntakePermissionSetVersion: 'v3',
    opportunityManagerPermissions: ['commercial.opportunity.assign'],
    opportunityManagerPermissionAssignmentId: 'manager-assignment-1',
    opportunityManagerPermissionSetVersion: 'v1',
  },
};

function requestDetail(
  id: string,
  responsible: { workspaceMembershipId: string; displayName: string } = ada,
  version = 1,
) {
  return {
    id,
    companyId: 'company-1',
    sourceKind: 'MANUAL_TEXT',
    sourceLabel: null,
    reportedReceivedAt: null,
    subject: `Solicitare audit ${id}`,
    originalText: `Exact source of ${id}.`,
    capturedByWorkspaceMembershipId: ada.workspaceMembershipId,
    capturedAt: '2026-09-26T08:00:00.000Z',
    version: 1,
    clientAssociationStatus: 'absent',
    initialOpportunity: {
      id: `opportunity-${id}`,
      title: `Prepare ${id}`,
      scope: null,
      nextAction: 'Arrange a qualification call',
      status: 'OPEN',
      responsibleWorkspaceMembershipId: responsible.workspaceMembershipId,
      responsibleActor: responsible,
      createdAt: '2026-09-26T08:00:00.000Z',
      version,
    },
  };
}
function listPage(
  responsible: { workspaceMembershipId: string; displayName: string } = ada,
) {
  return {
    items: [
      {
        id: 'request-1',
        subject: 'Solicitare audit request-1',
        capturedAt: '2026-09-26T08:00:00.000Z',
        initialOpportunity: {
          title: 'Prepare request-1',
          nextAction: 'Arrange a qualification call',
          responsibleActor: responsible,
        },
      },
    ],
  };
}
function changeResult(
  responsible: { workspaceMembershipId: string; displayName: string },
  version: number,
  outcome: 'updated' | 'unchanged' = 'updated',
) {
  return {
    receipt: {
      opportunityId: 'opportunity-request-1',
      workspaceMembershipId: responsible.workspaceMembershipId,
      version,
      outcome,
    },
    request: requestDetail('request-1', responsible, version),
  };
}

const listPath = 'GET /api/commercial-intake/requests?limit=25';
const detailPath = (id: string) => `GET /api/commercial-intake/requests/${id}`;
const membersPath =
  'GET /api/commercial-intake/opportunities/opportunity-request-1/eligible-responsible-actors';
const changePath =
  'POST /api/commercial-intake/opportunities/opportunity-request-1/responsible';

type Responder = () => Promise<Response>;
function reply(value: unknown, status = 200): Responder {
  return () => Promise.resolve(Response.json(value, { status }));
}
function failure(status: number): Responder {
  return () => Promise.resolve(new Response(null, { status }));
}
function networkFailure(): Responder {
  return () => Promise.reject(new TypeError('Failed to fetch'));
}
function deferred() {
  let resolve: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((settle) => {
    resolve = settle;
  });
  return {
    responder: (): Promise<Response> => promise,
    async settle(value: unknown, status = 200) {
      await act(async () => {
        resolve(Response.json(value, { status }));
        await new Promise((done) => setTimeout(done, 0));
      });
    },
  };
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

type WorkspaceProps = {
  onActivityRecorded?: () => void;
  onActorRevalidated?: (actor: ActorContext) => void;
  requestedRequest?: { clientRequestId: string; requestId: number };
  clientRestriction?: { clientDossierId: string; displayName: string };
};

function renderWorkspace(
  initialActor: ActorContext,
  initial: WorkspaceProps = {},
) {
  const identity = deterministicBrowserIdentity();
  let currentActor = initialActor;
  let props = initial;
  const element = () => (
    <CommercialIntakeWorkspace
      actor={currentActor}
      identity={identity}
      onCompanyContextRejected={() => undefined}
      {...props}
    />
  );
  const view = render(element());
  return {
    selectActor(next: ActorContext) {
      currentActor = next;
      view.rerender(element());
    },
    update(next: WorkspaceProps) {
      props = { ...props, ...next };
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
function responsibleSelect(): HTMLElement {
  return screen.getByRole('combobox', { name: copy.responsibleChoice });
}
function keyOf(init: RequestInit | undefined): string | undefined {
  const headers = init?.headers;
  if (!headers || headers instanceof Headers || Array.isArray(headers))
    return undefined;
  return headers['idempotency-key'];
}

describe('CommercialIntakeWorkspace responsible actor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each<'next-action' | 'responsible'>(['next-action', 'responsible'])(
    'protects a saving and uncertain %s command from Client association, then preserves its confirmed result',
    async (editor) => {
      const save = deferred();
      const nextActionPath =
        'POST /api/commercial-intake/opportunities/opportunity-request-1/next-action';
      const associationPath =
        'POST /api/commercial-intake/requests/request-1/client-association';
      const client = {
        id: 'client-1',
        displayName: 'Existing Client',
        relatedToActiveCompany: true,
      };
      const updated =
        editor === 'responsible'
          ? requestDetail('request-1', ion, 2)
          : {
              ...requestDetail('request-1', ada, 2),
              initialOpportunity: {
                ...requestDetail('request-1', ada, 2).initialOpportunity,
                nextAction: 'Send the confirmed documents',
              },
            };
      const receipt =
        editor === 'responsible'
          ? changeResult(ion, 2).receipt
          : {
              opportunityId: 'opportunity-request-1',
              nextAction: 'Send the confirmed documents',
              version: 2,
              outcome: 'updated',
            };
      const associated = {
        ...updated,
        version: 2,
        clientAssociationStatus: 'visible',
        clientReference: {
          originalClientId: client.id,
          currentClientId: client.id,
          displayName: client.displayName,
        },
      };
      const commandPath =
        editor === 'responsible' ? changePath : nextActionPath;
      const transport = stubRoutes({
        [listPath]: [
          reply(listPage()),
          reply(listPage(editor === 'responsible' ? ion : ada)),
        ],
        [detailPath('request-1')]: [reply(requestDetail('request-1'))],
        [membersPath]: [reply({ members: [adaCandidate, ionCandidate] })],
        ['GET /api/clients/search?query=Existing']: [reply([client])],
        [commandPath]: [save.responder, reply({ receipt, request: updated })],
        [associationPath]: [
          reply({
            receipt: {
              requestId: 'request-1',
              version: 2,
              outcome: 'associated',
            },
            request: associated,
          }),
        ],
      });
      renderWorkspace(associationManager);
      await openRequest();
      fireEvent.change(screen.getByLabelText(copy.clientSearch), {
        target: { value: 'Existing' },
      });
      fireEvent.click(screen.getByRole('button', { name: copy.searchClients }));
      changeValue(
        await screen.findByRole('combobox', { name: copy.existingClient }),
        client.id,
      );
      if (editor === 'responsible') {
        fireEvent.click(
          screen.getByRole('button', { name: copy.changeResponsible }),
        );
        changeValue(
          await screen.findByRole('combobox', { name: copy.responsibleChoice }),
          ion.workspaceMembershipId,
        );
      } else {
        fireEvent.click(
          screen.getByRole('button', { name: copy.editNextAction }),
        );
        fireEvent.change(screen.getByLabelText(copy.nextAction), {
          target: { value: 'Send the confirmed documents' },
        });
      }
      expect(
        screen.getByRole('button', { name: copy.confirmClientAssociation }),
      ).toBeDisabled();
      expect(screen.getByLabelText(copy.clientSearch)).toBeDisabled();
      expect(
        screen.getByRole('combobox', { name: copy.existingClient }),
      ).toBeDisabled();
      fireEvent.click(
        screen.getByRole('button', {
          name:
            editor === 'responsible'
              ? copy.saveResponsible
              : copy.saveNextAction,
        }),
      );
      expect(
        screen.getByRole('button', { name: copy.confirmClientAssociation }),
      ).toBeDisabled();
      fireEvent.click(
        screen.getByRole('button', { name: copy.confirmClientAssociation }),
      );
      expect(transport.calls(associationPath)).toHaveLength(0);
      await save.settle({}, 503);
      expect(
        await screen.findByText(
          editor === 'responsible'
            ? copy.responsibleUncertain
            : copy.nextActionUncertain,
        ),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: copy.confirmClientAssociation }),
      ).toBeDisabled();
      fireEvent.click(
        screen.getByRole('button', { name: copy.confirmClientAssociation }),
      );
      expect(transport.calls(associationPath)).toHaveLength(0);
      fireEvent.click(
        screen.getByRole('button', {
          name:
            editor === 'responsible'
              ? copy.retryResponsible
              : copy.retryNextAction,
        }),
      );
      expect(
        await screen.findByText(
          editor === 'responsible'
            ? copy.responsibleChanged
            : copy.nextActionSaved,
        ),
      ).toBeVisible();
      const [first, retried] = transport.calls(commandPath);
      expect(transport.calls(commandPath)).toHaveLength(2);
      expect(keyOf(first?.[1])).toEqual(expect.any(String));
      expect(first?.[1]?.body).toEqual(retried?.[1]?.body);
      expect(keyOf(first?.[1])).toEqual(keyOf(retried?.[1]));
      expect(
        screen.getByRole('button', { name: copy.confirmClientAssociation }),
      ).toBeEnabled();
      fireEvent.click(
        screen.getByRole('button', { name: copy.confirmClientAssociation }),
      );
      expect(
        await screen.findByText(copy.clientAssociationSuccess),
      ).toBeVisible();
      expect(screen.getByText(`${copy.opportunityVersion}: 2`)).toBeVisible();
      expect(
        screen.getByText(
          editor === 'responsible'
            ? `${copy.responsible}: ${ion.displayName}`
            : `${copy.nextAction}: Send the confirmed documents`,
        ),
      ).toBeVisible();
      expect(screen.getByText(client.displayName)).toBeVisible();
      expect(transport.calls(associationPath)).toHaveLength(1);
      expect(transport.unexpected).toEqual([]);
    },
  );

  it('protects a saving and uncertain Client association from both Opportunity editors and keeps its exact retry', async () => {
    const save = deferred();
    const associationPath =
      'POST /api/commercial-intake/requests/request-1/client-association';
    const client = {
      id: 'client-1',
      displayName: 'Existing Client',
      relatedToActiveCompany: true,
    };
    const associated = {
      ...requestDetail('request-1'),
      version: 2,
      clientAssociationStatus: 'visible',
      clientReference: {
        originalClientId: client.id,
        currentClientId: client.id,
        displayName: client.displayName,
      },
    };
    const transport = stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath('request-1')]: [reply(requestDetail('request-1'))],
      ['GET /api/clients/search?query=Existing']: [reply([client])],
      [associationPath]: [
        save.responder,
        reply({
          receipt: {
            requestId: 'request-1',
            version: 2,
            outcome: 'associated',
          },
          request: associated,
        }),
      ],
    });
    renderWorkspace(associationManager);
    await openRequest();
    fireEvent.change(screen.getByLabelText(copy.clientSearch), {
      target: { value: 'Existing' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.searchClients }));
    changeValue(
      await screen.findByRole('combobox', { name: copy.existingClient }),
      client.id,
    );
    fireEvent.click(
      screen.getByRole('button', { name: copy.confirmClientAssociation }),
    );
    for (const name of [copy.editNextAction, copy.changeResponsible]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name }));
    }
    expect(transport.calls(membersPath)).toHaveLength(0);
    expect(screen.queryByLabelText(copy.nextAction)).not.toBeInTheDocument();
    await save.settle({}, 503);
    expect(
      await screen.findByText(copy.clientAssociationUncertain),
    ).toBeVisible();
    for (const name of [copy.editNextAction, copy.changeResponsible]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name }));
    }
    expect(transport.calls(membersPath)).toHaveLength(0);
    expect(screen.queryByLabelText(copy.nextAction)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: copy.retryClientAssociation }),
    );
    expect(
      await screen.findByText(copy.clientAssociationSuccess),
    ).toBeVisible();
    const [first, retried] = transport.calls(associationPath);
    expect(transport.calls(associationPath)).toHaveLength(2);
    expect(keyOf(first?.[1])).toEqual(expect.any(String));
    expect(first?.[1]?.body).toBe(
      JSON.stringify({ expectedVersion: 1, clientAccountId: client.id }),
    );
    expect(first?.[1]?.body).toEqual(retried?.[1]?.body);
    expect(keyOf(first?.[1])).toEqual(keyOf(retried?.[1]));
    expect(screen.getByText(client.displayName)).toBeVisible();
    expect(screen.getByText(`${copy.opportunityVersion}: 1`)).toBeVisible();
    expect(
      screen.getByRole('button', { name: copy.editNextAction }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: copy.changeResponsible }),
    ).toBeEnabled();
    expect(transport.unexpected).toEqual([]);
  });

  it('offers the change only with the manager bundle, and reads no member before it is opened', async () => {
    const transport = stubRoutes({
      [listPath]: [reply(listPage()), reply(listPage())],
      [detailPath('request-1')]: [
        reply(requestDetail('request-1')),
        reply(requestDetail('request-1')),
      ],
    });
    const view = renderWorkspace(reader);
    const detail = await openRequest();
    expect(
      within(detail).getByText(`${copy.responsible}: ${ada.displayName}`),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: copy.changeResponsible }),
    ).not.toBeInTheDocument();

    view.selectActor(manager);
    expect(
      await screen.findByRole('button', { name: copy.changeResponsible }),
    ).toBeEnabled();
    expect(transport.calls(membersPath)).toEqual([]);
    expect(transport.unexpected).toEqual([]);
  });

  it('changes the responsible actor at the observed version, then refreshes the detail and the list', async () => {
    const members = deferred();
    const activityRecorded = vi.fn();
    const transport = stubRoutes({
      [listPath]: [reply(listPage()), reply(listPage(ion))],
      [detailPath('request-1')]: [reply(requestDetail('request-1'))],
      [membersPath]: [members.responder],
      [changePath]: [reply(changeResult(ion, 2))],
    });
    renderWorkspace(manager, { onActivityRecorded: activityRecorded });
    await openRequest();
    fireEvent.click(
      screen.getByRole('button', { name: copy.changeResponsible }),
    );
    expect(
      screen.getByText(copy.responsibleMembersLoading, {
        selector: '[role="status"]',
      }),
    ).toBeVisible();
    await members.settle({ members: [adaCandidate, ionCandidate] });

    // The recorded member is preselected; only labels are offered.
    expect(responsibleSelect()).toHaveValue(ada.workspaceMembershipId);
    expect(selectOptionLabels(responsibleSelect())).toEqual([
      adaCandidate.displayLabel,
      ionCandidate.displayLabel,
    ]);
    changeValue(responsibleSelect(), ion.workspaceMembershipId);
    fireEvent.click(screen.getByRole('button', { name: copy.saveResponsible }));

    expect(await screen.findByText(copy.responsibleChanged)).toHaveAttribute(
      'role',
      'alert',
    );
    expect(
      screen.getByText(`${copy.responsible}: ${ion.displayName}`),
    ).toBeVisible();
    expect(screen.getByText(`${copy.opportunityVersion}: 2`)).toBeVisible();
    expect(
      screen.queryByLabelText(copy.responsibleChoice),
    ).not.toBeInTheDocument();
    const [command] = transport.calls(changePath);
    expect(command?.[1]).toMatchObject({
      body: JSON.stringify({
        expectedVersion: 1,
        workspaceMembershipId: ion.workspaceMembershipId,
      }),
      headers: expect.objectContaining({
        'content-type': 'application/json',
        'x-company-context-id': 'company-1',
      }),
    });
    expect(keyOf(command?.[1])).toEqual(expect.any(String));
    expect(activityRecorded).toHaveBeenCalledOnce();
    expect(transport.calls(listPath)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: copy.back }));
    expect(
      within(screen.getByRole('list', { name: copy.list })).getByText(
        `${copy.responsible}: ${ion.displayName}`,
      ),
    ).toBeVisible();
    expect(transport.unexpected).toEqual([]);
  });

  it('confirms an already responsible member without recording activity', async () => {
    const activityRecorded = vi.fn();
    stubRoutes({
      [listPath]: [reply(listPage()), reply(listPage())],
      [detailPath('request-1')]: [reply(requestDetail('request-1'))],
      [membersPath]: [reply({ members: [adaCandidate, ionCandidate] })],
      [changePath]: [reply(changeResult(ada, 1, 'unchanged'))],
    });
    renderWorkspace(manager, { onActivityRecorded: activityRecorded });
    await openRequest();
    fireEvent.click(
      screen.getByRole('button', { name: copy.changeResponsible }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: copy.saveResponsible }),
    );

    expect(await screen.findByText(copy.responsibleUnchanged)).toHaveAttribute(
      'role',
      'alert',
    );
    expect(activityRecorded).not.toHaveBeenCalled();
  });

  it('states when no other member is eligible and when the recorded one no longer is', async () => {
    stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath('request-1')]: [reply(requestDetail('request-1'))],
      [membersPath]: [
        reply({ members: [adaCandidate] }),
        reply({ members: [ionCandidate] }),
      ],
    });
    renderWorkspace(manager);
    await openRequest();
    fireEvent.click(
      screen.getByRole('button', { name: copy.changeResponsible }),
    );
    expect(
      await screen.findByText(copy.responsibleNoOtherMember),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: copy.saveResponsible }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: copy.cancelResponsible }),
    );

    fireEvent.click(
      screen.getByRole('button', { name: copy.changeResponsible }),
    );
    expect(
      await screen.findByText(
        copy.responsibleCurrentIneligible(ada.displayName),
      ),
    ).toBeVisible();
    expect(responsibleSelect()).toHaveValue('');
    expect(
      screen.getByRole('button', { name: copy.saveResponsible }),
    ).toBeDisabled();
    changeValue(responsibleSelect(), ion.workspaceMembershipId);
    expect(
      screen.getByRole('button', { name: copy.saveResponsible }),
    ).toBeEnabled();
  });

  it('requires an explicit Request reload after a conflict, until a valid detail reloads', async () => {
    const transport = stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath('request-1')]: [
        reply(requestDetail('request-1')),
        failure(500),
        reply(requestDetail('request-1', ada, 2)),
      ],
      [membersPath]: [reply({ members: [adaCandidate, ionCandidate] })],
      [changePath]: [reply({ code: 'STALE_VERSION' }, 409)],
    });
    renderWorkspace(manager);
    await openRequest();
    fireEvent.click(
      screen.getByRole('button', { name: copy.changeResponsible }),
    );
    changeValue(
      await screen.findByLabelText(copy.responsibleChoice),
      ion.workspaceMembershipId,
    );
    fireEvent.click(screen.getByRole('button', { name: copy.saveResponsible }));

    expect(await screen.findByText(copy.responsibleConflict)).toHaveAttribute(
      'role',
      'alert',
    );
    expect(
      screen.getByRole('button', { name: copy.editNextAction }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: copy.reloadRequest }));
    expect(await screen.findByText(copy.error)).toHaveAttribute(
      'role',
      'alert',
    );
    fireEvent.click(screen.getByRole('button', { name: copy.reloadRequest }));

    expect(
      await screen.findByText(`${copy.opportunityVersion}: 2`),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: copy.changeResponsible }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: copy.editNextAction }),
    ).toBeEnabled();
    expect(transport.unexpected).toEqual([]);
  });

  it('asks for a fresh list after an unavailable member or a failed list', async () => {
    const transport = stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath('request-1')]: [reply(requestDetail('request-1'))],
      [membersPath]: [
        failure(500),
        reply({ members: [adaCandidate, ionCandidate] }),
        reply({ members: [adaCandidate] }),
      ],
      [changePath]: [reply({ code: 'RESPONSIBLE_ACTOR_UNAVAILABLE' }, 400)],
    });
    renderWorkspace(manager);
    await openRequest();
    fireEvent.click(
      screen.getByRole('button', { name: copy.changeResponsible }),
    );
    expect(
      await screen.findByText(copy.responsibleMembersError),
    ).toHaveAttribute('role', 'alert');
    fireEvent.click(
      screen.getByRole('button', { name: copy.responsibleReloadList }),
    );
    changeValue(
      await screen.findByLabelText(copy.responsibleChoice),
      ion.workspaceMembershipId,
    );
    fireEvent.click(screen.getByRole('button', { name: copy.saveResponsible }));

    expect(
      await screen.findByText(copy.responsibleUnavailable),
    ).toHaveAttribute('role', 'alert');
    fireEvent.click(
      screen.getByRole('button', { name: copy.responsibleReloadList }),
    );
    expect(
      await screen.findByText(copy.responsibleNoOtherMember),
    ).toBeVisible();
    expect(transport.calls(membersPath)).toHaveLength(3);
  });

  it('keeps the member, observed version and key for an explicit retry after an uncertain outcome', async () => {
    const transport = stubRoutes({
      [listPath]: [reply(listPage()), reply(listPage(ion))],
      [detailPath('request-1')]: [reply(requestDetail('request-1'))],
      [membersPath]: [reply({ members: [adaCandidate, ionCandidate] })],
      [changePath]: [networkFailure(), reply(changeResult(ion, 2))],
    });
    renderWorkspace(manager);
    await openRequest();
    fireEvent.click(
      screen.getByRole('button', { name: copy.changeResponsible }),
    );
    changeValue(
      await screen.findByLabelText(copy.responsibleChoice),
      ion.workspaceMembershipId,
    );
    fireEvent.click(screen.getByRole('button', { name: copy.saveResponsible }));

    expect(await screen.findByText(copy.responsibleUncertain)).toHaveAttribute(
      'role',
      'alert',
    );
    expect(responsibleSelect()).toBeDisabled();
    expect(responsibleSelect()).toHaveValue(ion.workspaceMembershipId);
    fireEvent.click(
      screen.getByRole('button', { name: copy.retryResponsible }),
    );

    expect(await screen.findByText(copy.responsibleChanged)).toHaveAttribute(
      'role',
      'alert',
    );
    const [first, retry] = transport.calls(changePath);
    expect(retry?.[1]?.body).toBe(first?.[1]?.body);
    expect(keyOf(retry?.[1])).toBeDefined();
    expect(keyOf(retry?.[1])).toBe(keyOf(first?.[1]));
  });

  it('drops the editor but keeps the read-only detail when only reassignment authority is lost', async () => {
    const actorRevalidated = vi.fn();
    const transport = stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath('request-1')]: [reply(requestDetail('request-1'))],
      [membersPath]: [reply({ members: [adaCandidate, ionCandidate] })],
      [changePath]: [failure(403)],
      'GET /api/access/current-actor': [reply(reader)],
    });
    renderWorkspace(manager, { onActorRevalidated: actorRevalidated });
    await openRequest();
    fireEvent.click(
      screen.getByRole('button', { name: copy.changeResponsible }),
    );
    changeValue(
      await screen.findByLabelText(copy.responsibleChoice),
      ion.workspaceMembershipId,
    );
    fireEvent.click(screen.getByRole('button', { name: copy.saveResponsible }));

    expect(await screen.findByText(copy.responsibleDenied)).toHaveAttribute(
      'role',
      'alert',
    );
    expect(actorRevalidated).toHaveBeenCalledWith(reader);
    expect(
      screen.queryByLabelText(copy.responsibleChoice),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Exact source of request-1.')).toBeVisible();
    expect(
      screen.getByText(`${copy.responsible}: ${ada.displayName}`),
    ).toBeVisible();
    expect(transport.unexpected).toEqual([]);
  });

  it('follows the next-action missing flow when the Opportunity is gone', async () => {
    stubRoutes({
      [listPath]: [reply(listPage()), reply({ items: [] })],
      [detailPath('request-1')]: [reply(requestDetail('request-1'))],
      [membersPath]: [reply({ members: [adaCandidate, ionCandidate] })],
      [changePath]: [failure(404)],
    });
    renderWorkspace(manager);
    await openRequest();
    fireEvent.click(
      screen.getByRole('button', { name: copy.changeResponsible }),
    );
    changeValue(
      await screen.findByLabelText(copy.responsibleChoice),
      ion.workspaceMembershipId,
    );
    fireEvent.click(screen.getByRole('button', { name: copy.saveResponsible }));

    expect(await screen.findByText(copy.nextActionMissing)).toHaveAttribute(
      'role',
      'alert',
    );
    expect(await screen.findByText(copy.empty('PRISMA-PRIM'))).toBeVisible();
  });

  it('keeps at most one Opportunity editor open', async () => {
    stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath('request-1')]: [reply(requestDetail('request-1'))],
      [membersPath]: [reply({ members: [adaCandidate, ionCandidate] })],
    });
    renderWorkspace(manager);
    await openRequest();
    fireEvent.click(
      screen.getByRole('button', { name: copy.changeResponsible }),
    );
    await screen.findByLabelText(copy.responsibleChoice);
    expect(
      screen.getByRole('button', { name: copy.editNextAction }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: copy.cancelResponsible }),
    );

    fireEvent.click(screen.getByRole('button', { name: copy.editNextAction }));
    expect(screen.getByLabelText(copy.nextAction)).toBeVisible();
    expect(
      screen.getByRole('button', { name: copy.changeResponsible }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: copy.cancelNextAction }),
    );
    expect(
      screen.getByRole('button', { name: copy.changeResponsible }),
    ).toBeEnabled();
  });

  it('retires an open editor when reassignment authority is lost and never restores it', async () => {
    const transport = stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath('request-1')]: [reply(requestDetail('request-1'))],
      [membersPath]: [reply({ members: [adaCandidate, ionCandidate] })],
    });
    const view = renderWorkspace(manager);
    await openRequest();
    fireEvent.click(
      screen.getByRole('button', { name: copy.changeResponsible }),
    );
    changeValue(
      await screen.findByLabelText(copy.responsibleChoice),
      ion.workspaceMembershipId,
    );

    view.selectActor(reader);
    expect(screen.getByText(copy.responsibleDenied)).toHaveAttribute(
      'role',
      'alert',
    );
    expect(
      screen.queryByLabelText(copy.responsibleChoice),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Exact source of request-1.')).toBeVisible();

    view.selectActor(manager);
    expect(
      screen.queryByLabelText(copy.responsibleChoice),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: copy.changeResponsible }),
    ).toBeEnabled();
    expect(transport.calls(membersPath)).toHaveLength(1);
  });

  it('retires an open editor silently when another manager assignment is captured', async () => {
    stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath('request-1')]: [reply(requestDetail('request-1'))],
      [membersPath]: [reply({ members: [adaCandidate, ionCandidate] })],
    });
    const view = renderWorkspace(manager);
    await openRequest();
    fireEvent.click(
      screen.getByRole('button', { name: copy.changeResponsible }),
    );
    await screen.findByLabelText(copy.responsibleChoice);

    view.selectActor(actorWith({ assignmentId: 'manager-assignment-2' }));
    expect(
      screen.queryByLabelText(copy.responsibleChoice),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: copy.changeResponsible }),
    ).toBeEnabled();
    expect(screen.queryByText(copy.responsibleDenied)).not.toBeInTheDocument();
  });

  it('ignores an eligible list that arrives after Back', async () => {
    const members = deferred();
    stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath('request-1')]: [reply(requestDetail('request-1'))],
      [membersPath]: [members.responder],
    });
    renderWorkspace(manager);
    await openRequest();
    fireEvent.click(
      screen.getByRole('button', { name: copy.changeResponsible }),
    );
    fireEvent.click(screen.getByRole('button', { name: copy.back }));
    await members.settle({ members: [adaCandidate, ionCandidate] });

    expect(
      screen.queryByLabelText(copy.responsibleChoice),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: copy.list })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('holds a requested Request behind an open responsible editor and keeps it through a new Client restriction', async () => {
    const transport = stubRoutes({
      [listPath]: [reply(listPage())],
      [detailPath('request-1')]: [reply(requestDetail('request-1'))],
      [detailPath('request-2')]: [reply(requestDetail('request-2'))],
      [membersPath]: [reply({ members: [adaCandidate, ionCandidate] })],
    });
    const view = renderWorkspace(manager);
    await openRequest();
    fireEvent.click(
      screen.getByRole('button', { name: copy.changeResponsible }),
    );
    changeValue(
      await screen.findByLabelText(copy.responsibleChoice),
      ion.workspaceMembershipId,
    );

    view.update({
      requestedRequest: { clientRequestId: 'request-2', requestId: 1 },
      clientRestriction: {
        clientDossierId: 'client-1',
        displayName: 'Synthetic Client',
      },
    });
    expect(
      screen.getByText(copy.requestedAfterResponsibleEdit, {
        selector: '[role="status"]',
      }),
    ).toBeVisible();
    expect(responsibleSelect()).toHaveValue(ion.workspaceMembershipId);
    expect(transport.calls(detailPath('request-2'))).toEqual([]);

    fireEvent.click(
      screen.getByRole('button', { name: copy.cancelResponsible }),
    );
    expect(
      await screen.findByRole('article', {
        name: 'Solicitare audit request-2',
      }),
    ).toBeVisible();
    expect(transport.calls(detailPath('request-2'))).toHaveLength(1);
  });
});
