import type { ReactNode } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ClerkAccessComposition,
  type BrowserIdentity,
} from './access-composition';

const provider = vi.hoisted(() => ({ signOut: vi.fn(async () => {}) }));
vi.mock('@clerk/react', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
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
  provider.signOut.mockClear();
  sessionStorage.clear();
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
