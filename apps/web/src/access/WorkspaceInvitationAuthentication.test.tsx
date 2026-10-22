import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApplicationRoot } from '../ApplicationRoot';
import { interfaceLocaleStorageKey } from '../localization/interface-locale';

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
    <ProviderAuthentication forceRedirectUrl={forceRedirectUrl} />
  ),
  SignUp: ({ forceRedirectUrl }: { forceRedirectUrl: string }) => (
    <ProviderAuthentication forceRedirectUrl={forceRedirectUrl} />
  ),
}));

function ProviderAuthentication({
  forceRedirectUrl,
}: {
  forceRedirectUrl: string;
}) {
  // Real Clerk UI 1.41.1 composes hash routes against this synthetic origin.
  // Keep this external-boundary contract aligned with the captured #792 failure.
  const target = new URL(forceRedirectUrl, window.location.href);
  new URL('http://clerk-dummy' + target.hash.substring(1));
  return <a href={forceRedirectUrl}>Complete authentication</a>;
}
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
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
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

it('renders embedded authentication with a hash-route-compatible exact continuation', () => {
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
  const captured = { invitationId, key, attempted: true };
  window.history.replaceState(
    captured,
    '',
    '/accept-invitation?invitation=' + invitationId + '&mode=signin',
  );
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);

  render(<ApplicationRoot pathname="/accept-invitation" />);

  const destination = screen
    .getByRole('link', { name: 'Complete authentication' })
    .getAttribute('href');
  if (!destination) throw new Error('Missing authentication continuation');
  const target = new URL(destination, window.location.origin);
  expect(target.origin).toBe(window.location.origin);
  expect(target.pathname).toBe('/accept-invitation');
  expect(target.hash).toMatch(/^#\/\?/u);
  const value = new URLSearchParams(target.hash.slice(3)).get(
    'invitation-intent',
  );
  expect(value).toBe(JSON.stringify(captured));
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['legacy', 'hash-route'])(
  'recovers the exact %s continuation without session storage',
  (format) => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
    const captured = {
      invitationId,
      key,
      attempted: true,
      ticket: 'opaque_ticket',
    };
    const fragment = new URLSearchParams({
      'invitation-intent': JSON.stringify(captured),
    }).toString();
    window.history.replaceState(
      null,
      '',
      '/accept-invitation?invitation=' +
        invitationId +
        '&mode=signin' +
        (format === 'legacy' ? '#' : '#/?') +
        fragment,
    );
    const originalGetItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      itemKey,
    ) {
      if (this === window.sessionStorage)
        throw new DOMException('Unavailable', 'SecurityError');
      return originalGetItem.call(this, itemKey);
    });
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      itemKey,
      value,
    ) {
      if (this === window.sessionStorage)
        throw new DOMException('Full', 'QuotaExceededError');
      originalSetItem.call(this, itemKey, value);
    });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    render(<ApplicationRoot pathname="/accept-invitation" />);

    const destination = screen
      .getByRole('link', { name: 'Complete authentication' })
      .getAttribute('href');
    if (!destination) throw new Error('Missing authentication continuation');
    const target = new URL(destination, window.location.origin);
    expect(
      new URLSearchParams(target.hash.slice(3)).get('invitation-intent'),
    ).toBe(JSON.stringify(captured));
    expect(target.searchParams.has('__clerk_ticket')).toBe(false);
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('opaque_ticket');
    expect(fetch).not.toHaveBeenCalled();
  },
);
for (const entry of ['Sign in', 'Create your invited account']) {
  it(`retains the captured intent through ${entry} and the provider return without session storage`, async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
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
    const originalGetItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      itemKey,
    ) {
      if (this === window.sessionStorage)
        throw new DOMException('Unavailable', 'SecurityError');
      return originalGetItem.call(this, itemKey);
    });
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      itemKey,
      value,
    ) {
      if (this === window.sessionStorage)
        throw new DOMException('Full', 'QuotaExceededError');
      originalSetItem.call(this, itemKey, value);
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

it.each([
  ['ro', 'Conectați-vă', 'Creați contul invitat'],
  ['ru', 'Войти', 'Создать приглашённую учётную запись'],
  ['fr', 'Se connecter', 'Créer votre compte invité'],
  ['en', 'Sign in', 'Create your invited account'],
] as const)(
  'localizes the invitation-owned authentication choices in %s',
  (locale, signIn, signUp) => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
    localStorage.setItem(interfaceLocaleStorageKey, locale);
    window.history.replaceState(
      null,
      '',
      '/accept-invitation?invitation=' +
        invitationId +
        '&__clerk_ticket=opaque_ticket',
    );

    render(<ApplicationRoot pathname="/accept-invitation" />);

    expect(screen.getByRole('link', { name: signIn })).toBeVisible();
    expect(screen.getByRole('link', { name: signUp })).toBeVisible();
  },
);

for (const format of ['legacy', 'hash-route']) {
  for (const continuation of [
    '{invalid-json',
    'x'.repeat(100_001),
    JSON.stringify({ invitationId, key: 'not-a-key', attempted: true }),
    JSON.stringify({
      invitationId: 'aaaaaaaa-0000-4000-8000-000000000999',
      key,
      attempted: true,
    }),
  ]) {
    it(`denies malformed or foreign ${format} authentication continuation without admission`, async () => {
      vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
      auth.signedIn = true;
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      window.history.replaceState(
        null,
        '',
        '/accept-invitation?invitation=' +
          invitationId +
          (format === 'legacy' ? '#' : '#/?') +
          new URLSearchParams({ 'invitation-intent': continuation }).toString(),
      );
      render(<ApplicationRoot pathname="/accept-invitation" />);
      expect(screen.getByRole('alert')).toHaveTextContent('cannot be accepted');
      expect(fetch).not.toHaveBeenCalled();
    });
  }
}
