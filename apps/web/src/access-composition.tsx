import {
  ClerkProvider,
  RedirectToSignIn,
  useAuth,
  useClerk,
} from '@clerk/react';
import { useMemo, type ReactNode } from 'react';
import { clearWorkspaceSelection } from './access/workspace-selection';
import { clerkAuthenticationLocalization } from './access/clerk-authentication-localization';
import { useAppCopy } from './app.copy';
import { useInterfaceLocale } from './localization/interface-locale';

export interface BrowserIdentity {
  loaded: boolean;
  signedIn: boolean;
  getToken(): Promise<string | null>;
  rejectSession(): Promise<void>;
  signOut(): Promise<void>;
  signedOutView: ReactNode;
  requestHeaders?: Record<string, string>;
}

export function ClerkAccessComposition({
  children,
  signedOutView,
}: {
  children(identity: BrowserIdentity): ReactNode;
  signedOutView?: ReactNode;
}) {
  const { locale } = useInterfaceLocale();
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey)
    throw new Error('VITE_CLERK_PUBLISHABLE_KEY is required.');
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl={window.location.href}
      localization={clerkAuthenticationLocalization(locale)}
    >
      <ClerkIdentity signedOutView={signedOutView}>{children}</ClerkIdentity>
    </ClerkProvider>
  );
}

function ClerkIdentity({
  children,
  signedOutView,
}: {
  children(identity: BrowserIdentity): ReactNode;
  signedOutView?: ReactNode;
}) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const clerk = useClerk();
  const identity = useMemo<BrowserIdentity>(
    () => ({
      loaded: isLoaded,
      signedIn: Boolean(isSignedIn),
      getToken,
      rejectSession: () => {
        clearWorkspaceSelection();
        return clerk.signOut();
      },
      signOut: () => {
        clearWorkspaceSelection();
        return clerk.signOut();
      },
      signedOutView: signedOutView ?? <RedirectToSignIn />,
    }),
    [clerk, getToken, isLoaded, isSignedIn, signedOutView],
  );
  return children(identity);
}

export function deterministicBrowserIdentity(
  requestHeaders?: Record<string, string>,
): BrowserIdentity {
  const signedIn =
    sessionStorage.getItem('deterministic-auth-state') !== 'signed-out';
  return {
    loaded: true,
    signedIn,
    getToken: async () => null,
    rejectSession: async () => {
      clearWorkspaceSelection();
      sessionStorage.setItem('deterministic-auth-state', 'signed-out');
    },
    signOut: async () => {
      clearWorkspaceSelection();
      sessionStorage.setItem('deterministic-auth-state', 'signed-out');
      window.location.reload();
    },
    signedOutView: <DeterministicSignedOutView />,
    requestHeaders,
  };
}

function DeterministicSignedOutView() {
  const copy = useAppCopy();
  return (
    <main className="production-access-state">
      <p role="alert">{copy.signInRequired}</p>
    </main>
  );
}
