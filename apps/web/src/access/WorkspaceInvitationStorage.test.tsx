import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApplicationRoot } from '../ApplicationRoot';
import type { BrowserIdentity } from '../access-composition';

const invitationId = 'aaaaaaaa-0000-4000-8000-000000000163';
const workspaceId = '00000000-0000-4000-8000-000000001630';
const actor = {
  internalUserId: '00000000-0000-4000-8000-000000001631',
  workspaceMembershipId: '00000000-0000-4000-8000-000000001632',
  workspaceId,
  workspaceName: 'Invited Workspace',
  displayName: 'Recipient',
  email: 'recipient@example.test',
  active: true,
  workspacePermissions: [],
};
const identity: BrowserIdentity = {
  loaded: true,
  signedIn: true,
  getToken: async () => 'verified-token',
  signOut: async () => {},
  rejectSession: async () => {},
  signedOutView: null,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

it('enters the intended server-authorized shell when storage fills after admission commits', async () => {
  window.history.replaceState(
    null,
    '',
    '/accept-invitation?invitation=' +
      invitationId +
      '&__clerk_ticket=opaque_ticket',
  );
  const requestedWorkspaces: Array<string | null> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith('/invitations/accept')) {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
          throw new DOMException('Full', 'QuotaExceededError');
        });
        return Response.json({
          ...actor,
          invitationId,
          acceptedAt: '2026-09-18T12:00:00.000Z',
        });
      }
      requestedWorkspaces.push(
        new Headers(options.headers).get('x-workspace-context-id'),
      );
      if (url.endsWith('/current-actor')) return Response.json(actor);
      if (url.endsWith('/companies')) return Response.json([]);
      return Response.json({ events: [] });
    }),
  );
  render(<ApplicationRoot pathname="/accept-invitation" identity={identity} />);
  fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
  expect(
    await screen.findByRole('heading', {
      name: 'Welcome to PRISMA-PRIM Suite',
    }),
  ).toBeVisible();
  expect(requestedWorkspaces.length).toBeGreaterThanOrEqual(3);
  expect(requestedWorkspaces.every((value) => value === workspaceId)).toBe(
    true,
  );
  expect(
    screen.getByText('No Company is assigned to you.', { exact: false }),
  ).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'Clients' }),
  ).not.toBeInTheDocument();
});

it('replays the captured intent after storage becomes unreadable and the page is restored', async () => {
  window.history.replaceState(
    null,
    '',
    '/accept-invitation?invitation=' +
      invitationId +
      '&__clerk_ticket=opaque_ticket',
  );
  const keys: Array<string | null> = [];
  const tickets: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith('/invitations/accept')) {
        keys.push(new Headers(options.headers).get('Idempotency-Key'));
        tickets.push(String(options.body));
        return new Response(null, { status: 503 });
      }
      throw new Error('Unexpected request');
    }),
  );
  const first = render(
    <ApplicationRoot pathname="/accept-invitation" identity={identity} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be confirmed',
  );
  first.unmount();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('Unavailable', 'SecurityError');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Unavailable', 'SecurityError');
  });
  render(<ApplicationRoot pathname="/accept-invitation" identity={identity} />);
  fireEvent.click(screen.getByRole('button', { name: 'Retry acceptance' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be confirmed',
  );
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  expect(tickets[1]).toBe(tickets[0]);
  expect(tickets[0]).toContain('opaque_ticket');
});
