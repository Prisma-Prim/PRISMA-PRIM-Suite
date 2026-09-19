import { lazy, Suspense, type ReactNode } from 'react';
import { App } from './App';
import { WorkspaceInvitationEntry } from './access/WorkspaceInvitationEntry';
import {
  ClerkAccessComposition,
  deterministicBrowserIdentity,
  type BrowserIdentity,
} from './access-composition';
import { PublicWelcome } from './welcome/PublicWelcome';

const PrismaCertUiBaseline = lazy(async () => {
  const module = await import('./ui-baseline/PrismaCertUiBaseline');
  return { default: module.PrismaCertUiBaseline };
});

interface ApplicationRootProps {
  pathname: string;
  identity?: BrowserIdentity;
}

function getPublicSignedOutView(pathname: string): ReactNode | undefined {
  return pathname === '/' ? <PublicWelcome /> : undefined;
}

function withPublicWelcome(
  identity: BrowserIdentity,
  pathname: string,
): BrowserIdentity {
  const signedOutView = getPublicSignedOutView(pathname);
  if (!signedOutView || !identity.loaded || identity.signedIn) return identity;
  return { ...identity, signedOutView };
}

export function ApplicationRoot({ pathname, identity }: ApplicationRootProps) {
  const isUiBaseline =
    pathname === '/ui-baseline' || pathname.startsWith('/ui-baseline/');
  if (isUiBaseline)
    return (
      <Suspense fallback={<p role="status">Loading UI baseline…</p>}>
        <PrismaCertUiBaseline />
      </Suspense>
    );
  if (identity)
    return pathname === '/accept-invitation' ? (
      <WorkspaceInvitationEntry identity={identity} />
    ) : (
      <App identity={withPublicWelcome(identity, pathname)} />
    );

  const localDemoValues =
    import.meta.env.MODE === 'local-demo'
      ? {
          'x-test-external-provider': import.meta.env
            .VITE_DEMO_EXTERNAL_PROVIDER,
          'x-test-external-subject': import.meta.env.VITE_DEMO_EXTERNAL_SUBJECT,
          'x-test-display-name': import.meta.env.VITE_DEMO_DISPLAY_NAME,
          'x-test-email': import.meta.env.VITE_DEMO_EMAIL,
        }
      : undefined;
  if (
    localDemoValues &&
    import.meta.env.VITE_ACCESS_IDENTITY_MODE === 'local-demo'
  ) {
    if (Object.values(localDemoValues).some((value) => !value?.trim()))
      throw new Error('Local demonstration identity is incomplete.');
    const localIdentity = deterministicBrowserIdentity(localDemoValues);
    return pathname === '/accept-invitation' ? (
      <WorkspaceInvitationEntry identity={localIdentity} />
    ) : (
      <App identity={withPublicWelcome(localIdentity, pathname)} />
    );
  }
  if (pathname === '/accept-invitation') return <WorkspaceInvitationEntry />;
  return (
    <ClerkAccessComposition signedOutView={getPublicSignedOutView(pathname)}>
      {(clerkIdentity) => <App identity={clerkIdentity} />}
    </ClerkAccessComposition>
  );
}
