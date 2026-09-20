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
  } = {},
) {
  render(
    <CommercialIntakeWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
      onActivityRecorded={props.onActivityRecorded}
      onCompanyContextRejected={props.onCompanyContextRejected ?? vi.fn()}
      onWorkspaceAccessRejected={props.onWorkspaceAccessRejected}
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
              { id: 'client-1', displayName: 'Synthetic Client' },
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
        Response.json([{ id: 'client-1', displayName: 'Synthetic Client' }]),
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
});
