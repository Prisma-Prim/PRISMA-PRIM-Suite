import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { CommercialIntakeWorkspace } from './CommercialIntakeWorkspace';

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

function renderWorkspace(
  props: {
    onActivityRecorded?: () => Promise<void> | void;
    onCompanyContextRejected?: (companyContextId: string) => void;
    onWorkspaceAccessRejected?: () => Promise<void> | void;
    onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  } = {},
) {
  render(
    <CommercialIntakeWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
      onActivityRecorded={props.onActivityRecorded}
      onCompanyContextRejected={props.onCompanyContextRejected ?? vi.fn()}
      onWorkspaceAccessRejected={props.onWorkspaceAccessRejected}
      onActorRevalidated={props.onActorRevalidated}
    />,
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
});
