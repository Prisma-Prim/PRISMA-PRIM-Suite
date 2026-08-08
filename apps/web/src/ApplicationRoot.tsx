import { lazy, Suspense } from 'react';
import { App } from './App';

const PrismaCertUiBaseline = lazy(async () => {
  const module = await import('./ui-baseline/PrismaCertUiBaseline');

  return { default: module.PrismaCertUiBaseline };
});

interface ApplicationRootProps {
  pathname: string;
}

export function ApplicationRoot({ pathname }: ApplicationRootProps) {
  const isUiBaseline =
    pathname === '/ui-baseline' || pathname.startsWith('/ui-baseline/');

  if (isUiBaseline) {
    return (
      <Suspense fallback={<p role="status">Loading UI baseline…</p>}>
        <PrismaCertUiBaseline />
      </Suspense>
    );
  }

  return <App />;
}
