import { useState, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApplicationRoot } from '../ApplicationRoot';
import { interfaceLocaleStorageKey } from '../localization/interface-locale';

const auth = vi.hoisted(() => ({
  signedIn: false,
  codeMounted: false,
  codeLabelled: false,
}));
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
  const [codeGeneration, setCodeGeneration] = useState<number | undefined>(
    auth.codeMounted ? 0 : undefined,
  );
  const target = new URL(forceRedirectUrl, window.location.href);
  new URL('http://clerk-dummy' + target.hash.substring(1));
  return (
    <form>
      <label htmlFor="provider-email">Provider email</label>
      <input
        id="provider-email"
        type="text"
        inputMode="email"
        required
        pattern="^.*@[a-zA-Z0-9\-]+\.[a-zA-Z0-9\-\.]+$"
        aria-describedby="sdk-help sdk-feedback"
      />
      <span id="sdk-help">Provider-owned hint</span>
      <span id="sdk-feedback">Provider-owned feedback</span>
      <button type="button" onClick={() => setCodeGeneration(0)}>
        Show synthetic provider code
      </button>
      <button
        type="button"
        onClick={() => setCodeGeneration((value) => (value ?? 0) + 1)}
      >
        Replace synthetic provider code
      </button>
      <button type="button" onClick={() => setCodeGeneration(undefined)}>
        Remove synthetic provider code
      </button>
      {codeGeneration !== undefined && (
        <input
          key={codeGeneration}
          autoComplete="one-time-code"
          aria-label="Enter verification code"
          aria-labelledby={
            auth.codeLabelled ? 'sdk-initial-code-label' : undefined
          }
          aria-describedby="sdk-help"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
        />
      )}
      {auth.codeLabelled && (
        <span id="sdk-initial-code-label">Provider-owned code label</span>
      )}
      <a href={forceRedirectUrl}>Complete authentication</a>
    </form>
  );
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
  auth.codeMounted = false;
  auth.codeLabelled = false;
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

it('names a late provider code control reactively without changing its work, constraints or SDK ownership', async () => {
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
  const captured = { invitationId, key, attempted: false };
  window.history.replaceState(
    captured,
    '',
    '/accept-invitation?invitation=' + invitationId + '&mode=signin',
  );
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const view = render(<ApplicationRoot pathname="/accept-invitation" />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Show synthetic provider code' }),
  );
  const input = await screen.findByRole('textbox', {
    name: 'Enter verification code',
  });
  const labelIds = (input.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/u)
    .filter(Boolean);
  expect(labelIds).toHaveLength(1);
  const ownedId = labelIds[0];
  if (!ownedId) throw new Error('Missing owned code label');
  const label = document.getElementById(ownedId);
  expect(label).toHaveTextContent('Enter verification code');
  fireEvent.input(input, { target: { value: 'xx{keep}' } });
  const pattern = input.getAttribute('pattern');
  const navigation = window.location.href;
  input.focus();
  for (const choice of [
    { index: 0, name: 'Introduceți codul de verificare' },
    { index: 1, name: 'Введите код подтверждения' },
    { index: 2, name: 'Saisissez le code de vérification' },
    { index: 3, name: 'Enter verification code' },
  ]) {
    const picker = screen.getByRole('combobox');
    picker.focus();
    fireEvent.keyDown(picker, { key: 'Home' });
    for (let i = 0; i < choice.index; i++)
      fireEvent.keyDown(picker, { key: 'ArrowDown' });
    fireEvent.keyDown(picker, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: choice.name })).toBe(input);
    expect(input).toHaveValue('xx{keep}');
    expect(picker).toHaveFocus();
    expect(document.getElementById(ownedId)).toBe(label);
    expect(input).toHaveAttribute('aria-labelledby', ownedId);
    expect(input).toHaveAttribute('aria-label', 'Enter verification code');
    expect(input).toHaveAttribute('aria-describedby', 'sdk-help');
    expect(input).toHaveAttribute('pattern', pattern);
    expect(input).toHaveAttribute('required');
    expect(input).toHaveAttribute('maxlength', '6');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(window.location.href).toBe(navigation);
    expect(window.history.state).toEqual(captured);
  }
  const sdkLabel = document.createElement('span');
  sdkLabel.id = 'sdk-code-label';
  sdkLabel.textContent = 'Provider code name';
  input.after(sdkLabel);
  input.setAttribute('aria-labelledby', 'sdk-code-label');
  await waitFor(() =>
    expect(input).toHaveAccessibleName(
      'Enter verification code Provider code name',
    ),
  );
  input.setAttribute(
    'aria-labelledby',
    input.getAttribute('aria-labelledby') + ' sdk-later',
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Replace synthetic provider code' }),
  );
  const replacement = await screen.findByRole('textbox', {
    name: 'Enter verification code',
  });
  expect(replacement).not.toBe(input);
  expect(input).toHaveAttribute('aria-labelledby', 'sdk-code-label sdk-later');
  expect(replacement).toHaveAttribute('aria-labelledby', ownedId);
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove synthetic provider code' }),
  );
  await waitFor(() =>
    expect(replacement).not.toHaveAttribute('aria-labelledby'),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Show synthetic provider code' }),
  );
  const remounted = await screen.findByRole('textbox', {
    name: 'Enter verification code',
  });
  remounted.setAttribute('aria-labelledby', ownedId + ' sdk-on-unmount');
  view.unmount();
  expect(remounted).toHaveAttribute('aria-labelledby', 'sdk-on-unmount');
  expect(document.getElementById(ownedId)).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it('preserves an existing provider code label and leaves controls outside the invitation owner untouched', async () => {
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
  auth.codeMounted = true;
  auth.codeLabelled = true;
  window.history.replaceState(
    { invitationId, key, attempted: false },
    '',
    '/accept-invitation?invitation=' + invitationId + '&mode=signin',
  );
  const outside = document.createElement('input');
  outside.autocomplete = 'one-time-code';
  outside.setAttribute('aria-label', 'Outside provider code');
  document.body.append(outside);
  try {
    const view = render(<ApplicationRoot pathname="/accept-invitation" />);
    const input = await screen.findByRole('textbox', {
      name: 'Enter verification code Provider-owned code label',
    });
    expect(input).toHaveAttribute('aria-label', 'Enter verification code');
    expect(input.getAttribute('aria-labelledby')?.split(/\s+/u)).toContain(
      'sdk-initial-code-label',
    );
    input.focus();
    input.setAttribute('aria-labelledby', 'sdk-initial-code-label');
    await waitFor(() =>
      expect(input).toHaveAccessibleName(
        'Enter verification code Provider-owned code label',
      ),
    );
    expect(input).toHaveFocus();
    const picker = screen.getByRole('combobox');
    picker.focus();
    fireEvent.keyDown(picker, { key: 'Home' });
    fireEvent.keyDown(picker, { key: 'ArrowDown' });
    fireEvent.keyDown(picker, { key: 'Enter' });
    expect(
      screen.getByRole('textbox', {
        name: 'Введите код подтверждения Provider-owned code label',
      }),
    ).toBe(input);
    expect(picker).toHaveFocus();
    expect(outside).not.toHaveAttribute('aria-labelledby');
    view.unmount();
    expect(input).toHaveAttribute('aria-labelledby', 'sdk-initial-code-label');
    outside.setAttribute('autocomplete', 'off');
    outside.setAttribute('autocomplete', 'one-time-code');
    await Promise.resolve();
    expect(outside).not.toHaveAttribute('aria-labelledby');
  } finally {
    outside.remove();
  }
});

it('localizes native invalid feedback without changing the field, constraints or continuation', () => {
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
  window.history.replaceState(
    { invitationId, key, attempted: false },
    '',
    '/accept-invitation?invitation=' + invitationId + '&mode=signin',
  );
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const { unmount } = render(<ApplicationRoot pathname="/accept-invitation" />);
  const input = screen.getByRole('textbox', { name: 'Provider email' });
  const literal = 'Șir-literal Русский {keep}';
  fireEvent.input(input, { target: { value: literal } });
  const route = window.location.href;
  const continuation = window.history.state;
  const invalid = new Event('invalid', { cancelable: true });
  fireEvent(input, invalid);

  expect(invalid.defaultPrevented).toBe(true);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Enter a valid email address.',
  );
  const errorId = screen.getByRole('alert').id;
  expect(input).toHaveAttribute(
    'aria-describedby',
    'sdk-help sdk-feedback ' + errorId,
  );
  expect(input).toBeInvalid();

  for (const choice of [
    { index: 0, message: 'Introduceți o adresă de email validă.' },
    { index: 1, message: 'Введите корректный адрес электронной почты.' },
    { index: 2, message: 'Saisissez une adresse e-mail valide.' },
  ]) {
    const picker = screen.getByRole('combobox');
    fireEvent.keyDown(picker, { key: 'Home' });
    for (let index = 0; index < choice.index; index++)
      fireEvent.keyDown(picker, { key: 'ArrowDown' });
    fireEvent.keyDown(picker, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent(choice.message);
    expect(screen.getByRole('alert')).toHaveAttribute('id', errorId);
    expect(screen.getByRole('textbox', { name: 'Provider email' })).toBe(input);
    expect(input).toHaveValue(literal);
    expect(input).toHaveAttribute('required');
    expect(input).toHaveAttribute(
      'aria-describedby',
      'sdk-help sdk-feedback ' + errorId,
    );
    expect(window.location.href).toBe(route);
    expect(window.history.state).toEqual(continuation);
  }
  fireEvent.input(input, { target: { value: 'synthetic@example.test' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(input).toHaveAttribute('aria-describedby', 'sdk-help sdk-feedback');
  expect(input).toBeValid();

  fireEvent.input(input, { target: { value: literal } });
  fireEvent.invalid(input);
  input.setAttribute(
    'aria-describedby',
    input.getAttribute('aria-describedby') + ' sdk-later',
  );
  unmount();
  expect(input).toHaveAttribute(
    'aria-describedby',
    'sdk-help sdk-feedback sdk-later',
  );
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps required validation native and clears only owned feedback when the step changes', () => {
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
  window.history.replaceState(
    { invitationId, key, attempted: false },
    '',
    '/accept-invitation?invitation=' + invitationId + '&mode=signin',
  );
  render(<ApplicationRoot pathname="/accept-invitation" />);
  const input = screen.getByRole('textbox', { name: 'Provider email' });
  fireEvent.invalid(input);
  expect(input).toBeInvalid();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Enter your email address.',
  );
  fireEvent(window, new HashChangeEvent('hashchange'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(input).toHaveAttribute('aria-describedby', 'sdk-help sdk-feedback');
  expect(input).toHaveAttribute('required');
  expect(input).toBeInvalid();
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
