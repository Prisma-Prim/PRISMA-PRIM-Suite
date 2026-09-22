import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { CommercialIntakeWorkspace } from './CommercialIntakeWorkspace';
import { commercialIntakeCopy } from './commercial-intake.copy';

const actor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Iurie',
  email: 'iurie@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-1',
    displayName: 'PRISMA-PRIM',
    clientPermissions: ['client.read'],
    commercialIntakePermissions: [
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
    ],
  },
};

const createdRequest = {
  id: 'request-1',
  companyId: 'company-1',
  sourceKind: 'MANUAL_TEXT',
  sourceLabel: 'Manual entry from a phone request',
  reportedReceivedAt: '2026-09-20T09:30:00.000Z',
  subject: 'Quality process preparation',
  originalText:
    'Please help us prepare our internal quality processes before our planned review.',
  capturedByWorkspaceMembershipId: 'membership-1',
  capturedAt: '2026-09-20T10:00:00.000Z',
  version: 1,
  initialOpportunity: {
    id: 'opportunity-1',
    title: 'Prepare quality process review',
    scope: 'Initial discussion to identify the requested work',
    nextAction: 'Arrange a qualification call',
    status: 'OPEN',
    responsibleWorkspaceMembershipId: 'membership-1',
    createdAt: '2026-09-20T10:00:00.000Z',
    version: 1,
  },
};

type WorkspaceProps = {
  onActivityRecorded?: () => Promise<void> | void;
  onCompanyContextRejected?: (companyContextId: string) => void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
};

function workspaceElement(current: ActorContext, props: WorkspaceProps) {
  return (
    <CommercialIntakeWorkspace
      actor={current}
      identity={deterministicBrowserIdentity()}
      onActivityRecorded={props.onActivityRecorded}
      onCompanyContextRejected={props.onCompanyContextRejected ?? vi.fn()}
      onWorkspaceAccessRejected={props.onWorkspaceAccessRejected}
      onActorRevalidated={props.onActorRevalidated}
    />
  );
}

function renderWorkspace(props: WorkspaceProps = {}) {
  const view = render(workspaceElement(actor, props));
  return {
    selectCompany: (nextActor: ActorContext) =>
      view.rerender(workspaceElement(nextActor, props)),
  };
}

function actorForCompany(id: string, displayName: string): ActorContext {
  return {
    ...actor,
    activeCompany: {
      id,
      displayName,
      clientPermissions: ['client.read'],
      commercialIntakePermissions: [
        'commercial.request.read',
        'commercial.request.create',
        'commercial.opportunity.read',
        'commercial.opportunity.create',
      ],
    },
  };
}

function listItem(index: number) {
  return {
    id: `request-${index}`,
    subject: `Client Request ${index}`,
    capturedAt: `2026-09-20T10:00:00.000Z`,
    initialOpportunity: {
      title: `Opportunity ${index}`,
      nextAction: 'Arrange a qualification call',
      responsibleActor: {
        workspaceMembershipId: 'membership-1',
        displayName: 'Iurie',
      },
    },
  };
}

const newestPage = Array.from({ length: 25 }, (_, index) => listItem(index));
const olderPage = [listItem(25), listItem(26), listItem(27)];

function requestButton(index: number) {
  return new RegExp(`^Client Request ${index}(?!\\d)`, 'u');
}

function visibleRequests(): number {
  return within(
    screen.getByRole('list', { name: 'Client Requests' }),
  ).queryAllByRole('listitem').length;
}

const filterableItems = [
  {
    id: 'request-quality',
    subject: 'Quality process preparation',
    capturedAt: '2026-09-20T10:00:00.000Z',
    initialOpportunity: {
      title: 'Prepare quality process review',
      nextAction: 'Arrange a qualification call',
      responsibleActor: {
        workspaceMembershipId: 'membership-1',
        displayName: 'Iurie',
      },
    },
  },
  {
    id: 'request-audit',
    subject: 'Annual audit support',
    capturedAt: '2026-09-19T10:00:00.000Z',
    initialOpportunity: {
      title: 'Plan the annual audit',
      nextAction: 'Confirm the audit window',
      responsibleActor: {
        workspaceMembershipId: 'membership-2',
        displayName: 'Ada Ionescu',
      },
    },
  },
  {
    id: 'request-training',
    subject: null,
    capturedAt: '2026-09-18T10:00:00.000Z',
    initialOpportunity: {
      title: 'Operator training programme',
      nextAction: 'Propose training dates',
      responsibleActor: {
        workspaceMembershipId: 'membership-3',
        displayName: 'Mihai Rusu',
      },
    },
  },
];

function filterInput(): HTMLElement {
  return screen.getByLabelText(commercialIntakeCopy.filterLabel);
}

function applyFilter(value: string) {
  fireEvent.change(filterInput(), { target: { value } });
}

function idempotencyKeyOf(init: RequestInit | undefined): string | undefined {
  const headers = init?.headers;
  if (
    !headers ||
    headers instanceof Headers ||
    Array.isArray(headers) ||
    typeof headers !== 'object'
  )
    return undefined;
  const key = headers['idempotency-key'];
  return typeof key === 'string' ? key : undefined;
}

function commandBodyOf(init: RequestInit | undefined): string | undefined {
  return typeof init?.body === 'string' ? init.body : undefined;
}

function deferredResponse() {
  let resolve: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function editorActor(): ActorContext {
  return {
    ...actor,
    activeCompany: {
      id: 'company-1',
      displayName: 'PRISMA-PRIM',
      clientPermissions: ['client.read'],
      commercialIntakePermissions: [
        'commercial.request.read',
        'commercial.request.create',
        'commercial.opportunity.read',
        'commercial.opportunity.create',
        'commercial.opportunity.next_action.update',
      ],
      commercialIntakePermissionSetVersion: 'v2',
    },
  };
}

function requestListPage(
  nextAction = createdRequest.initialOpportunity.nextAction,
) {
  return Response.json({
    items: [
      {
        id: createdRequest.id,
        subject: createdRequest.subject,
        capturedAt: createdRequest.capturedAt,
        initialOpportunity: {
          title: createdRequest.initialOpportunity.title,
          nextAction,
          responsibleActor: {
            workspaceMembershipId: 'membership-1',
            displayName: 'Iurie',
          },
        },
      },
    ],
  });
}

function updatedRequest(nextAction: string, version: number) {
  return {
    ...createdRequest,
    initialOpportunity: {
      ...createdRequest.initialOpportunity,
      nextAction,
      version,
    },
  };
}

function updateResult(nextAction: string, version: number) {
  return Response.json({
    receipt: {
      opportunityId: createdRequest.initialOpportunity.id,
      nextAction,
      version,
      outcome: 'updated',
    },
    request: updatedRequest(nextAction, version),
  });
}

async function openDetailForEditing(props: WorkspaceProps = {}) {
  render(workspaceElement(editorActor(), props));
  fireEvent.click(
    await screen.findByRole('button', {
      name: /Quality process preparation/u,
    }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit next action' }),
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Original request text'), {
    target: { value: createdRequest.originalText },
  });
  fireEvent.change(screen.getByLabelText('Opportunity title'), {
    target: { value: createdRequest.initialOpportunity.title },
  });
  fireEvent.change(screen.getByLabelText('Next action'), {
    target: { value: createdRequest.initialOpportunity.nextAction },
  });
}

describe('CommercialIntakeWorkspace', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows an empty active-Company list and explains the immutable manual source', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items: [] })),
    );

    renderWorkspace();

    expect(
      await screen.findByText('No Client Requests for PRISMA-PRIM yet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Company: PRISMA-PRIM')).toBeInTheDocument();
    expect(
      screen.getByText('This intake stores the request as manual text.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'After capture, the original request text, subject, source label, and reported received time cannot be changed.',
      ),
    ).toBeVisible();
  });

  it('creates a Request, records activity, and reopens its persisted detail', async () => {
    const activityRecorded = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ items: [] }))
        .mockResolvedValueOnce(Response.json(createdRequest, { status: 201 }))
        .mockResolvedValueOnce(
          Response.json({
            items: [
              {
                id: createdRequest.id,
                subject: createdRequest.subject,
                capturedAt: createdRequest.capturedAt,
                initialOpportunity: {
                  title: createdRequest.initialOpportunity.title,
                  nextAction: createdRequest.initialOpportunity.nextAction,
                  responsibleActor: {
                    workspaceMembershipId: 'membership-1',
                    displayName: 'Iurie',
                  },
                },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(Response.json(createdRequest)),
    );

    renderWorkspace({ onActivityRecorded: activityRecorded });
    await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Quality process preparation',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Prepare quality process review'),
    ).toBeInTheDocument();
    expect(activityRecorded).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/commercial-intake/requests',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'idempotency-key': expect.any(String),
          'x-company-context-id': 'company-1',
        }),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to Requests' }));
    const requestTitle = await screen.findByText('Quality process preparation');
    const requestButton = requestTitle.closest('button');
    if (!requestButton) throw new Error('Expected a Request button.');
    fireEvent.click(requestButton);
    expect(
      await screen.findByText(createdRequest.originalText),
    ).toBeInTheDocument();
    expect(screen.getByText('Manual entry from a phone request')).toBeVisible();
    const receivedTime = screen
      .getByText('Reported received at')
      .nextElementSibling?.querySelector('time');
    expect(receivedTime).toHaveAttribute(
      'datetime',
      '2026-09-20T09:30:00.000Z',
    );
    expect(receivedTime).toHaveTextContent('2026');
  });

  it('keeps entered fields after correctable validation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items: [] })),
    );
    renderWorkspace();
    await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
    fireEvent.change(screen.getByLabelText('Original request text'), {
      target: { value: 'A real request' },
    });
    fireEvent.change(screen.getByLabelText('Source label'), {
      target: { value: 'Phone note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter the required request and Opportunity fields.',
    );
    expect(screen.getByLabelText('Original request text')).toHaveValue(
      'A real request',
    );
    expect(screen.getByLabelText('Source label')).toHaveValue('Phone note');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([404, 409])(
    'shows one safe Client-unavailable message for an identified %i response',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(Response.json({ items: [] }))
          .mockResolvedValueOnce(
            Response.json([
              {
                id: 'client-1',
                displayName: 'Synthetic Client',
                relatedToActiveCompany: true,
              },
            ]),
          )
          .mockResolvedValueOnce(
            Response.json({ code: 'CLIENT_REFERENCE_UNAVAILABLE' }, { status }),
          ),
      );
      renderWorkspace();
      await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
      fillRequiredFields();
      fireEvent.change(screen.getByLabelText('Search Clients by name'), {
        target: { value: 'Synthetic' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      const client = await screen.findByLabelText('Existing Client');
      fireEvent.change(client, { target: { value: 'client-1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The selected Client is no longer available. Refresh the Client search before trying again.',
      );
      expect(screen.getByLabelText('Existing Client')).toHaveValue('client-1');
    },
  );

  it('clears a selected Client when the search query changes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(
        Response.json([
          {
            id: 'client-1',
            displayName: 'Synthetic Client',
            relatedToActiveCompany: true,
          },
        ]),
      )
      .mockImplementationOnce((_input: unknown, init?: RequestInit) => {
        if (typeof init?.body !== 'string')
          throw new Error('Expected a JSON command body.');
        const command: unknown = JSON.parse(init.body);
        expect(command).not.toHaveProperty('clientAccountId');
        return Promise.resolve(Response.json(createdRequest, { status: 201 }));
      })
      .mockResolvedValueOnce(Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    renderWorkspace();
    await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
    fireEvent.change(screen.getByLabelText('Search Clients by name'), {
      target: { value: 'Synthetic' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    const client = await screen.findByLabelText('Existing Client');
    fireEvent.change(client, { target: { value: 'client-1' } });
    fireEvent.change(screen.getByLabelText('Search Clients by name'), {
      target: { value: '' },
    });
    expect(screen.queryByLabelText('Existing Client')).not.toBeInTheDocument();

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Quality process preparation',
      }),
    ).toBeInTheDocument();
  });

  it('notifies the shell when revoked Workspace access is confirmed', async () => {
    const rejectedWorkspace = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(new Response(null, { status: 403 })),
    );
    renderWorkspace({ onWorkspaceAccessRejected: rejectedWorkspace });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to access Commercial Intake.',
    );
    await waitFor(() => expect(rejectedWorkspace).toHaveBeenCalledOnce());
  });
  it('offers only Clients with an active relationship to the selected Company', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ items: [] }))
        .mockResolvedValueOnce(
          Response.json([
            {
              id: 'related',
              displayName: 'Related Client',
              relatedToActiveCompany: true,
            },
            {
              id: 'unrelated',
              displayName: 'Other Company Client',
              relatedToActiveCompany: false,
            },
          ]),
        ),
    );
    renderWorkspace();
    await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
    fireEvent.change(screen.getByLabelText('Search Clients by name'), {
      target: { value: 'Client' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    expect(
      await screen.findByRole('option', { name: 'Related Client' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('option', { name: 'Other Company Client' }),
    ).not.toBeInTheDocument();
  });

  it.each([undefined, 'true', null])(
    'does not trust an unvalidated Client relationship flag %s',
    async (relationship) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(Response.json({ items: [] }))
          .mockResolvedValueOnce(
            Response.json([
              {
                id: 'unproven',
                displayName: 'Unproven Client',
                relatedToActiveCompany: relationship,
              },
            ]),
          ),
      );
      renderWorkspace();
      await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
      fireEvent.change(screen.getByLabelText('Search Clients by name'), {
        target: { value: 'Client' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      expect(
        await screen.findByText(
          'The Client search could not be loaded. Please try again.',
        ),
      ).toBeVisible();
      expect(
        screen.queryByRole('option', { name: 'Unproven Client' }),
      ).not.toBeInTheDocument();
    },
  );
  it.each(['Company', 'Workspace'])(
    'clears visible Request data after %s access is revoked during Client search',
    async (scope) => {
      const companyRejected = vi.fn();
      const workspaceRejected = vi.fn();
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            Response.json({
              items: [
                {
                  id: 'request-1',
                  subject: 'Private Company request',
                  capturedAt: createdRequest.capturedAt,
                  initialOpportunity: {
                    title: 'Private opportunity',
                    nextAction: 'Private next action',
                    responsibleActor: {
                      workspaceMembershipId: 'membership-1',
                      displayName: 'Iurie',
                    },
                  },
                },
              ],
            }),
          )
          .mockResolvedValueOnce(new Response(null, { status: 403 }))
          .mockResolvedValueOnce(new Response(null, { status: 403 }))
          .mockResolvedValueOnce(
            scope === 'Workspace'
              ? new Response(null, { status: 403 })
              : Response.json({ ...actor, activeCompany: undefined }),
          ),
      );
      renderWorkspace({
        onCompanyContextRejected: companyRejected,
        onWorkspaceAccessRejected: workspaceRejected,
      });
      await screen.findByText('Private Company request');
      fireEvent.change(screen.getByLabelText('Original request text'), {
        target: { value: 'Unsaved Company source' },
      });
      fireEvent.change(screen.getByLabelText('Search Clients by name'), {
        target: { value: 'Client' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'You do not have permission to access Commercial Intake.',
      );
      expect(
        screen.queryByText('Private Company request'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText('Original request text'),
      ).not.toBeInTheDocument();
      if (scope === 'Workspace')
        expect(workspaceRejected).toHaveBeenCalledOnce();
      else expect(companyRejected).toHaveBeenCalledWith('company-1');
    },
  );

  it('retains authorized intake when revalidation confirms only Client search authority was lost', async () => {
    const actorRevalidated = vi.fn();
    const companyRejected = vi.fn();
    const workspaceRejected = vi.fn();
    const clientOnlyRevokedActor = {
      ...actor,
      activeCompany: { ...actor.activeCompany, clientPermissions: [] },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ items: [] }))
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(Response.json(clientOnlyRevokedActor)),
    );
    renderWorkspace({
      onActorRevalidated: actorRevalidated,
      onCompanyContextRejected: companyRejected,
      onWorkspaceAccessRejected: workspaceRejected,
    });
    await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
    fireEvent.change(screen.getByLabelText('Original request text'), {
      target: { value: 'Preserve my request' },
    });
    fireEvent.change(screen.getByLabelText('Search Clients by name'), {
      target: { value: 'Client' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    expect(
      await screen.findByText(
        'Client search is not available. You can capture this Request without a Client.',
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(actorRevalidated).toHaveBeenCalledWith(clientOnlyRevokedActor),
    );
    expect(screen.getByLabelText('Original request text')).toHaveValue(
      'Preserve my request',
    );
    expect(
      screen.getByRole('button', { name: 'Capture Request' }),
    ).toBeVisible();
    expect(companyRejected).not.toHaveBeenCalled();
    expect(workspaceRejected).not.toHaveBeenCalled();
  });
  it('shows the authorized original Client reference without inventing a current dossier', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            items: [
              {
                id: createdRequest.id,
                subject: createdRequest.subject,
                capturedAt: createdRequest.capturedAt,
                initialOpportunity: {
                  title: createdRequest.initialOpportunity.title,
                  nextAction: createdRequest.initialOpportunity.nextAction,
                  responsibleActor: {
                    workspaceMembershipId: 'membership-1',
                    displayName: 'Iurie',
                  },
                },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            ...createdRequest,
            clientReference: {
              originalClientId: 'managed-client',
              displayName: 'Managed Client',
            },
          }),
        ),
    );
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Quality process preparation/u,
      }),
    );
    expect(await screen.findByText('Managed Client')).toBeVisible();
  });

  it('reads the reopened detail with readable source, status, and Client labels', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            items: [
              {
                id: createdRequest.id,
                subject: createdRequest.subject,
                capturedAt: createdRequest.capturedAt,
                initialOpportunity: {
                  title: createdRequest.initialOpportunity.title,
                  nextAction: createdRequest.initialOpportunity.nextAction,
                  responsibleActor: {
                    workspaceMembershipId: 'membership-1',
                    displayName: 'Iurie',
                  },
                },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            ...createdRequest,
            clientReference: {
              originalClientId: 'managed-client',
              displayName: 'Managed Client',
            },
          }),
        ),
    );
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Quality process preparation/u,
      }),
    );
    const detail = await screen.findByRole('article', {
      name: 'Quality process preparation',
    });

    expect(within(detail).getByText('Manual text')).toBeVisible();
    expect(within(detail).getByText('Status: Open')).toBeVisible();
    expect(within(detail).getByText(commercialIntakeCopy.client)).toBeVisible();
    expect(within(detail).getByText('Managed Client')).toBeVisible();
    expect(within(detail).getByText(createdRequest.originalText)).toBeVisible();
    expect(
      within(detail).getByText('Manual entry from a phone request'),
    ).toBeVisible();
    expect(
      within(detail).queryByText(/MANUAL_TEXT|OPEN/u),
    ).not.toBeInTheDocument();
  });

  it('shows the Opportunity version without an edit when the captured bundle lacks the update', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(requestListPage())
        .mockResolvedValueOnce(Response.json(createdRequest)),
    );
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Quality process preparation/u,
      }),
    );
    const detail = await screen.findByRole('article', {
      name: 'Quality process preparation',
    });
    expect(
      within(detail).getByText('Next action: Arrange a qualification call'),
    ).toBeVisible();
    expect(within(detail).getByText('Version: 1')).toBeVisible();
    expect(
      within(detail).queryByRole('button', { name: 'Edit next action' }),
    ).not.toBeInTheDocument();
  });

  it('edits the next action at the observed version and shows the stored result', async () => {
    const activityRecorded = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockResolvedValueOnce(updateResult('Send the qualification summary', 2))
      .mockResolvedValueOnce(requestListPage('Send the qualification summary'));
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing({ onActivityRecorded: activityRecorded });
    const input = screen.getByLabelText('Next action');
    expect(input).toHaveValue('Arrange a qualification call');
    fireEvent.change(input, {
      target: { value: 'Send the qualification summary' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Next action saved.',
    );
    expect(
      screen.getByText('Next action: Send the qualification summary'),
    ).toBeVisible();
    expect(screen.getByText('Version: 2')).toBeVisible();
    expect(screen.getByText(createdRequest.originalText)).toBeVisible();
    expect(screen.queryByLabelText('Next action')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit next action' }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/commercial-intake/opportunities/opportunity-1/next-action',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          nextAction: 'Send the qualification summary',
        }),
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'idempotency-key': expect.any(String),
          'x-company-context-id': 'company-1',
        }),
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(activityRecorded).toHaveBeenCalledOnce();
  });

  it('keeps the entered next action after a correctable validation error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest));
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing();
    fireEvent.change(screen.getByLabelText('Next action'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a next action between 1 and 500 characters.',
    );
    expect(screen.getByLabelText('Next action')).toHaveValue('   ');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows the saving state and blocks a second submit while the update is pending', async () => {
    const deferred = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockReturnValueOnce(deferred.promise)
      .mockResolvedValueOnce(requestListPage('Call back on Monday'));
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing();
    fireEvent.change(screen.getByLabelText('Next action'), {
      target: { value: 'Call back on Monday' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saving next action…',
    );
    expect(
      screen.getByRole('button', { name: 'Save next action' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Next action')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => {
      deferred.resolve(updateResult('Call back on Monday', 2));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(await screen.findByText('Version: 2')).toBeVisible();
  });

  it('requires an explicit reload after a stale-version conflict', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockResolvedValueOnce(
        Response.json({ code: 'STALE_VERSION' }, { status: 409 }),
      )
      .mockResolvedValueOnce(
        Response.json(updatedRequest('Someone else moved first', 2)),
      );
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing();
    fireEvent.change(screen.getByLabelText('Next action'), {
      target: { value: 'My stale edit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Opportunity changed since you loaded it. Reload the Request before editing again.',
    );
    expect(screen.queryByLabelText('Next action')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit next action' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload Request' }));

    expect(await screen.findByText('Version: 2')).toBeVisible();
    expect(
      screen.getByText('Next action: Someone else moved first'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Edit next action' }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/commercial-intake/requests/request-1',
      expect.anything(),
    );
  });

  it('keeps editing blocked when a conflict reload fails, until a valid detail reloads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockResolvedValueOnce(
        Response.json({ code: 'STALE_VERSION' }, { status: 409 }),
      )
      .mockResolvedValueOnce(Response.json({}, { status: 500 }))
      .mockResolvedValueOnce(
        Response.json(updatedRequest('Someone else moved first', 2)),
      );
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing();
    fireEvent.change(screen.getByLabelText('Next action'), {
      target: { value: 'My stale edit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
    await screen.findByRole('button', { name: 'Reload Request' });

    fireEvent.click(screen.getByRole('button', { name: 'Reload Request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Client Request could not be loaded or saved. Please try again.',
    );
    expect(
      screen.getByRole('button', { name: 'Reload Request' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Edit next action' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reload Request' }));

    expect(await screen.findByText('Version: 2')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Edit next action' }),
    ).toBeVisible();
  });

  it('preserves the payload, observed version and key for an explicit retry after an uncertain outcome', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(updateResult('Book the site visit', 2))
      .mockResolvedValueOnce(requestListPage('Book the site visit'));
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing();
    fireEvent.change(screen.getByLabelText('Next action'), {
      target: { value: 'Book the site visit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The next action update did not complete. Retry to confirm the result.',
    );
    expect(screen.getByLabelText('Next action')).toHaveValue(
      'Book the site visit',
    );
    const uncertainInput = screen.getByLabelText('Next action');
    expect(uncertainInput).toBeDisabled();
    fireEvent.change(uncertainInput, {
      target: { value: 'Replace the preserved command' },
    });
    expect(uncertainInput).toHaveValue('Book the site visit');
    fireEvent.click(screen.getByRole('button', { name: 'Retry update' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Next action saved.',
    );
    expect(screen.getByText('Version: 2')).toBeVisible();
    const firstAttempt = fetchMock.mock.calls[2];
    const retry = fetchMock.mock.calls[3];
    expect(retry?.[0]).toBe(firstAttempt?.[0]);
    expect(retry?.[1]).toMatchObject({
      body: JSON.stringify({
        expectedVersion: 1,
        nextAction: 'Book the site visit',
      }),
    });
    expect(idempotencyKeyOf(retry?.[1])).toBeDefined();
    expect(idempotencyKeyOf(retry?.[1])).toBe(
      idempotencyKeyOf(firstAttempt?.[1]),
    );
  });

  it('drops the draft but keeps the read-only detail when only update authority is lost', async () => {
    const actorRevalidated = vi.fn();
    const companyRejected = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(Response.json(actor));
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing({
      onActorRevalidated: actorRevalidated,
      onCompanyContextRejected: companyRejected,
    });
    fireEvent.change(screen.getByLabelText('Next action'), {
      target: { value: 'Denied edit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You no longer have permission to update the next action of this Opportunity.',
    );
    await waitFor(() => expect(actorRevalidated).toHaveBeenCalledWith(actor));
    expect(screen.queryByLabelText('Next action')).not.toBeInTheDocument();
    expect(screen.getByText(createdRequest.originalText)).toBeVisible();
    expect(screen.getByText('Version: 1')).toBeVisible();
    expect(companyRejected).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('returns to the reloaded list when the Opportunity is no longer available', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing();
    fireEvent.change(screen.getByLabelText('Next action'), {
      target: { value: 'Edit of a vanished Opportunity' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Request is no longer available in the active Company. Reload the list.',
    );
    expect(
      await screen.findByText('No Client Requests for PRISMA-PRIM yet.'),
    ).toBeVisible();
    expect(
      screen.queryByText(createdRequest.originalText),
    ).not.toBeInTheDocument();
  });

  it('pages past the newest 25 Requests and reopens an older one', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ items: newestPage, nextCursor: 'cursor-page-2' }),
        )
        .mockResolvedValueOnce(Response.json({ items: olderPage }))
        .mockResolvedValueOnce(
          Response.json({
            ...createdRequest,
            id: 'request-26',
            subject: 'Client Request 26',
          }),
        ),
    );

    renderWorkspace();
    expect(
      await screen.findByRole('button', { name: requestButton(0) }),
    ).toBeVisible();
    expect(visibleRequests()).toBe(25);
    expect(
      screen.queryByRole('button', { name: requestButton(26) }),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/commercial-intake/requests?limit=25',
      expect.anything(),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );
    expect(
      await screen.findByRole('button', { name: requestButton(26) }),
    ).toBeVisible();
    expect(visibleRequests()).toBe(28);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/commercial-intake/requests?limit=25&cursor=cursor-page-2',
      expect.anything(),
    );
    expect(
      screen.queryByRole('button', { name: 'Show older Requests' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: requestButton(26) }));
    expect(
      await screen.findByText(createdRequest.originalText),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/commercial-intake/requests/request-26',
      expect.anything(),
    );
  });

  it('keeps the first page visible when an older page cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ items: newestPage, nextCursor: 'cursor-page-2' }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 500 })),
    );

    renderWorkspace();
    expect(
      await screen.findByRole('button', { name: requestButton(0) }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Older Client Requests could not be loaded. Please try again.',
    );
    expect(visibleRequests()).toBe(25);
    expect(
      screen.getByRole('button', { name: 'Show older Requests' }),
    ).toBeVisible();
  });

  it('never appends an older page captured before the active Company changed', async () => {
    const stalePage = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: newestPage, nextCursor: 'cursor-page-2' }),
      )
      .mockReturnValueOnce(stalePage.promise)
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              ...listItem(99),
              subject: 'Second Company request',
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { selectCompany } = renderWorkspace();
    expect(
      await screen.findByRole('button', { name: requestButton(0) }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );
    selectCompany(actorForCompany('company-2', 'Second Company'));
    expect(await screen.findByText('Second Company request')).toBeVisible();

    await act(async () => {
      stalePage.resolve(Response.json({ items: olderPage }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(visibleRequests()).toBe(1);
    expect(
      screen.queryByRole('button', { name: requestButton(26) }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: requestButton(0) }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/commercial-intake/requests?limit=25',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-company-context-id': 'company-2',
        }),
      }),
    );
  });

  it('clears the loaded pages when access is revoked while loading older Requests', async () => {
    const rejectedWorkspace = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ items: newestPage, nextCursor: 'cursor-page-2' }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(new Response(null, { status: 403 })),
    );

    renderWorkspace({ onWorkspaceAccessRejected: rejectedWorkspace });
    expect(
      await screen.findByRole('button', { name: requestButton(0) }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to access Commercial Intake.',
    );
    expect(
      screen.queryByRole('button', { name: requestButton(0) }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show older Requests' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(rejectedWorkspace).toHaveBeenCalledOnce());
  });

  it('filters the loaded Requests by subject, Opportunity title or responsible actor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items: filterableItems })),
    );

    renderWorkspace();
    expect(await screen.findByText('Annual audit support')).toBeVisible();
    expect(visibleRequests()).toBe(3);

    applyFilter('  QUALITY ');
    expect(visibleRequests()).toBe(1);
    expect(screen.getByText('Quality process preparation')).toBeVisible();

    applyFilter('training');
    expect(visibleRequests()).toBe(1);
    expect(screen.getByText('Operator training programme')).toBeVisible();

    applyFilter('ada');
    expect(visibleRequests()).toBe(1);
    expect(screen.getByText('Annual audit support')).toBeVisible();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reports no matching loaded Requests without reading the unloaded original source', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items: filterableItems })),
    );

    renderWorkspace();
    expect(await screen.findByText('Annual audit support')).toBeVisible();

    applyFilter('internal quality processes');
    expect(visibleRequests()).toBe(0);
    expect(
      screen.getByText(commercialIntakeCopy.filterNoMatch),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No Client Requests for PRISMA-PRIM yet.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(commercialIntakeCopy.filterHelp)).toBeVisible();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('offers no filter for a genuinely empty Company list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items: [] })),
    );

    renderWorkspace();
    expect(
      await screen.findByText('No Client Requests for PRISMA-PRIM yet.'),
    ).toBeVisible();
    expect(
      screen.queryByLabelText(commercialIntakeCopy.filterLabel),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(commercialIntakeCopy.filterNoMatch),
    ).not.toBeInTheDocument();
  });

  it('keeps older Requests reachable from a filter with no current match and filters the new rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ items: newestPage, nextCursor: 'cursor-page-2' }),
        )
        .mockResolvedValueOnce(Response.json({ items: olderPage })),
    );

    renderWorkspace();
    expect(
      await screen.findByRole('button', { name: requestButton(0) }),
    ).toBeVisible();

    applyFilter('Client Request 26');
    expect(visibleRequests()).toBe(0);
    expect(
      screen.getByText(commercialIntakeCopy.filterNoMatch),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );
    expect(
      await screen.findByRole('button', { name: requestButton(26) }),
    ).toBeVisible();
    expect(visibleRequests()).toBe(1);
    expect(
      screen.queryByText(commercialIntakeCopy.filterNoMatch),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/commercial-intake/requests?limit=25&cursor=cursor-page-2',
      expect.anything(),
    );
  });

  it('separates an older-page failure from a filter with no current match', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ items: newestPage, nextCursor: 'cursor-page-2' }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 500 })),
    );

    renderWorkspace();
    expect(
      await screen.findByRole('button', { name: requestButton(0) }),
    ).toBeVisible();
    applyFilter('Client Request 26');
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Older Client Requests could not be loaded. Please try again.',
    );
    expect(
      screen.getByText(commercialIntakeCopy.filterNoMatch),
    ).toBeInTheDocument();
    expect(visibleRequests()).toBe(0);
    expect(
      screen.getByRole('button', { name: 'Show older Requests' }),
    ).toBeVisible();
  });

  it('restores every loaded Request through the clear action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items: filterableItems })),
    );

    renderWorkspace();
    expect(await screen.findByText('Annual audit support')).toBeVisible();
    applyFilter('Annual');
    expect(visibleRequests()).toBe(1);

    fireEvent.click(
      screen.getByRole('button', { name: commercialIntakeCopy.filterClear }),
    );
    expect(visibleRequests()).toBe(3);
    expect(filterInput()).toHaveValue('');
    expect(filterInput()).toHaveFocus();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('preserves the filter while a Request detail is opened and closed', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ items: filterableItems }))
        .mockResolvedValueOnce(Response.json(createdRequest)),
    );

    renderWorkspace();
    expect(await screen.findByText('Annual audit support')).toBeVisible();
    applyFilter('Quality');
    fireEvent.click(
      screen.getByRole('button', { name: /Quality process preparation/u }),
    );
    expect(
      await screen.findByText(createdRequest.originalText),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Requests' }));
    expect(filterInput()).toHaveValue('Quality');
    expect(visibleRequests()).toBe(1);
  });

  it('keeps an unsaved form and the uncertain retry key when the filter changes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: filterableItems }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    renderWorkspace();
    expect(await screen.findByText('Annual audit support')).toBeVisible();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('Source label'), {
      target: { value: 'Phone note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Client Request could not be loaded or saved. Please try again.',
    );

    applyFilter('Annual');
    expect(visibleRequests()).toBe(1);
    expect(screen.getByLabelText('Original request text')).toHaveValue(
      createdRequest.originalText,
    );
    expect(screen.getByLabelText('Source label')).toHaveValue('Phone note');

    fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const firstAttempt = idempotencyKeyOf(fetchMock.mock.calls[1]?.[1]);
    const firstBody = commandBodyOf(fetchMock.mock.calls[1]?.[1]);
    expect(firstAttempt).toEqual(expect.any(String));
    expect(firstBody).toEqual(expect.any(String));
    expect(idempotencyKeyOf(fetchMock.mock.calls[2]?.[1])).toBe(firstAttempt);
    expect(commandBodyOf(fetchMock.mock.calls[2]?.[1])).toBe(firstBody);
  });

  it('clears an obsolete filter and ignores a late page when the active Company changes', async () => {
    const stalePage = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: newestPage, nextCursor: 'cursor-page-2' }),
      )
      .mockReturnValueOnce(stalePage.promise)
      .mockResolvedValueOnce(
        Response.json({
          items: [{ ...listItem(99), subject: 'Second Company request' }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { selectCompany } = renderWorkspace();
    expect(
      await screen.findByRole('button', { name: requestButton(0) }),
    ).toBeVisible();
    applyFilter('Client Request 0');
    expect(visibleRequests()).toBe(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );
    selectCompany(actorForCompany('company-2', 'Second Company'));

    expect(await screen.findByText('Second Company request')).toBeVisible();
    expect(filterInput()).toHaveValue('');

    await act(async () => {
      stalePage.resolve(Response.json({ items: olderPage }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(visibleRequests()).toBe(1);
    expect(
      screen.queryByRole('button', { name: requestButton(26) }),
    ).not.toBeInTheDocument();
  });
});
