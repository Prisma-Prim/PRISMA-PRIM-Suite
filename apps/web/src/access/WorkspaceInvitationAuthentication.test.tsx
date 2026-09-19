import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApplicationRoot } from '../ApplicationRoot';

const auth = vi.hoisted(() => ({ signedIn: false }));
vi.mock('@clerk/react', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  RedirectToSignIn: () => null,
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: auth.signedIn,
    getToken: async () => 'verified-token',
  }),
  useClerk: () => ({
    signOut: async () => {
      auth.signedIn = false;
    },
  }),
  SignIn: ({ forceRedirectUrl }: { forceRedirectUrl: string }) => (
    <a href={forceRedirectUrl}>Complete authentication</a>
  ),
  SignUp: ({ forceRedirectUrl }: { forceRedirectUrl: string }) => (
    <a href={forceRedirectUrl}>Complete authentication</a>
  ),
}));
const invitationId = 'aaaaaaaa-0000-4000-8000-000000000163';
const key = 'bbbbbbbb-0000-4000-8000-000000000163';
const actor = {
  internalUserId: '00000000-0000-4000-8000-000000001631',
  workspaceMembershipId: '00000000-0000-4000-8000-000000001632',
  workspaceId: '00000000-0000-4000-8000-000000001630',
  workspaceName: 'Invited Workspace',
  displayName: 'Recipient',
  email: 'recipient@example.test',
  active: true,
  workspacePermissions: [],
};
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }) satisfies MediaQueryList,
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  auth.signedIn = false;
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
for (const entry of ['Sign in', 'Create your invited account']) {
  it(`retains the captured intent through ${entry} and the provider return without session storage`, async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(key)
      .mockReturnValue('cccccccc-0000-4000-8000-000000000163');
    window.history.replaceState(
      null,
      '',
      '/accept-invitation?invitation=' +
        invitationId +
        '&__clerk_ticket=opaque_ticket',
    );
    const fetch = vi.fn(async (url: string, request: RequestInit) => {
      if (url.endsWith('/invitations/accept')) {
        expect(new Headers(request.headers).get('Idempotency-Key')).toBe(key);
        expect(JSON.parse(String(request.body))).toEqual({
          invitationId,
          ticket: 'opaque_ticket',
        });
        return Response.json({
          ...actor,
          invitationId,
          acceptedAt: '2026-09-18T12:00:00.000Z',
        });
      }
      if (url.endsWith('/current-actor')) return Response.json(actor);
      if (url.endsWith('/companies')) return Response.json([]);
      return Response.json({ events: [] });
    });
    vi.stubGlobal('fetch', fetch);
    let view = render(<ApplicationRoot pathname="/accept-invitation" />);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Unavailable', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    function navigate(linkName: string) {
      const destination = screen
        .getByRole('link', { name: linkName })
        .getAttribute('href');
      if (!destination) throw new Error('Missing authentication continuation');
      view.unmount();
      // A full navigation has a fresh history entry, just like the provider return.
      window.history.replaceState(null, '', destination);
      view = render(<ApplicationRoot pathname="/accept-invitation" />);
    }
    navigate(entry);
    auth.signedIn = true;
    navigate('Complete authentication');
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Hello, Recipient.',
      }),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalled();
    expect(window.location.href).not.toContain('opaque_ticket');
  });
}

for (const continuation of [
  '{invalid-json',
  JSON.stringify({ invitationId, key: 'not-a-key', attempted: true }),
  JSON.stringify({
    invitationId: 'aaaaaaaa-0000-4000-8000-000000000999',
    key,
    attempted: true,
  }),
]) {
  it('denies malformed or foreign authentication continuation without admission', async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
    auth.signedIn = true;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    window.history.replaceState(
      null,
      '',
      '/accept-invitation?invitation=' +
        invitationId +
        '#' +
        new URLSearchParams({ 'invitation-intent': continuation }).toString(),
    );
    render(<ApplicationRoot pathname="/accept-invitation" />);
    expect(screen.getByRole('alert')).toHaveTextContent('cannot be accepted');
    expect(fetch).not.toHaveBeenCalled();
  });
}
