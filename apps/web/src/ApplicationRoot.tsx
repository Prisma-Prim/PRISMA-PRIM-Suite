import { lazy, Suspense } from 'react';
import { App } from './App';
import {
  ClerkAccessComposition,
  deterministicBrowserIdentity,
  type BrowserIdentity,
} from './access-composition';

const PrismaCertUiBaseline = lazy(async () => {
  const module = await import('./ui-baseline/PrismaCertUiBaseline');
  return { default: module.PrismaCertUiBaseline };
});

interface ApplicationRootProps {
  pathname: string;
  identity?: BrowserIdentity;
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
  if (identity) return <App identity={identity} />;

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
    return <App identity={deterministicBrowserIdentity(localDemoValues)} />;
  }
  return (
    <ClerkAccessComposition>
      {(clerkIdentity) => <App identity={clerkIdentity} />}
    </ClerkAccessComposition>
  );
}
