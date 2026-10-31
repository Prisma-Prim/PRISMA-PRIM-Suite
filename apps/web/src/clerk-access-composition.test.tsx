import { useEffect, type ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ClerkAccessComposition,
  type BrowserIdentity,
} from './access-composition';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
} from './localization/interface-locale';

const provider = vi.hoisted(() => ({ signOut: vi.fn(async () => {}) }));
const providerMount = vi.hoisted(() => vi.fn());
const providerLocalization = vi.hoisted(() => {
  let current: unknown;
  return {
    receive: (resource: unknown) => {
      current = resource;
    },
    read: () => current,
  };
});
vi.mock('@clerk/react', () => ({
  ClerkProvider: ({
    children,
    localization,
  }: {
    children: ReactNode;
    localization?: unknown;
  }) => {
    useEffect(() => {
      providerMount();
    }, []);
    providerLocalization.receive(localization);
    return children;
  },
  RedirectToSignIn: () => null,
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: async () => 'verified-token',
  }),
  useClerk: () => provider,
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  provider.signOut.mockClear();
  providerMount.mockClear();
  sessionStorage.clear();
  localStorage.removeItem(interfaceLocaleStorageKey);
  window.history.replaceState(null, '', '/');
});

it('passes Romanian embedded authentication copy when the saved interface choice is invalid', () => {
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
  localStorage.setItem(interfaceLocaleStorageKey, 'unsupported');
  document.documentElement.lang = 'fr';

  render(
    <InterfaceLocaleProvider>
      <ClerkAccessComposition>{() => null}</ClerkAccessComposition>
    </InterfaceLocaleProvider>,
  );

  expect(providerLocalization.read()).toMatchObject({
    locale: 'ro-RO',
    signIn: { start: { title: expect.any(String) } },
  });
});

function LocaleChoices() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      <button onClick={() => changeLocale('ru')}>Use Russian</button>
      <button onClick={() => changeLocale('fr')}>Use French</button>
      <button onClick={() => changeLocale('en')}>Use English</button>
      <button onClick={() => changeLocale('ro')}>Use Romanian</button>
    </>
  );
}

it('updates provider copy through all four choices while retaining mounted literal work, focus and navigation', () => {
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const continuation = { invitationId: 'synthetic-intent', key: 'same-key' };
  window.history.replaceState(
    continuation,
    '',
    '/accept-invitation?mode=signin#unchanged-step',
  );
  const originalUrl = window.location.href;
  render(
    <InterfaceLocaleProvider>
      <LocaleChoices />
      <ClerkAccessComposition>
        {() => <input aria-label="Literal work" defaultValue="" />}
      </ClerkAccessComposition>
    </InterfaceLocaleProvider>,
  );
  const input = screen.getByRole('textbox', { name: 'Literal work' });
  const literal = 'Șir literal Русский {keep} <literal>';
  fireEvent.change(input, { target: { value: literal } });
  input.focus();

  for (const choice of [
    { label: 'Use Russian', tag: 'ru-RU' },
    { label: 'Use French', tag: 'fr-FR' },
    { label: 'Use English', tag: 'en-US' },
    { label: 'Use Romanian', tag: 'ro-RO' },
  ]) {
    fireEvent.click(screen.getByRole('button', { name: choice.label }));
    expect(providerLocalization.read()).toMatchObject({ locale: choice.tag });
    expect(screen.getByRole('textbox', { name: 'Literal work' })).toBe(input);
    expect(input).toHaveValue(literal);
    expect(input).toHaveFocus();
    expect(window.location.href).toBe(originalUrl);
    expect(window.history.state).toEqual(continuation);
  }
  expect(providerMount).toHaveBeenCalledTimes(1);
  expect(provider.signOut).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

const actions: Array<'rejectSession' | 'signOut'> = [
  'rejectSession',
  'signOut',
];
for (const action of actions) {
  it(`executes Clerk ${action} even when optional Workspace cleanup fails`, async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });
    let identity: BrowserIdentity | undefined;
    render(
      <ClerkAccessComposition>
        {(value) => {
          identity = value;
          return null;
        }}
      </ClerkAccessComposition>,
    );
    if (!identity) throw new Error('Identity did not render.');
    const currentIdentity = identity;
    await act(async () => {
      await currentIdentity[action]();
    });
    expect(provider.signOut).toHaveBeenCalledTimes(1);
  });
}
