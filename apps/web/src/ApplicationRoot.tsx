import { lazy, Suspense } from 'react';
import { App } from './App';
import { DesignLabApp } from './design-lab/DesignLabApp';

const PrismaCertUiBaseline = lazy(async () => {
  const module = await import('./ui-baseline/PrismaCertUiBaseline');

  return { default: module.PrismaCertUiBaseline };
});

interface ApplicationRootProps {
  pathname: string;
}

export function ApplicationRoot({ pathname }: ApplicationRootProps) {
  const isDesignLab =
    pathname === '/design-lab' || pathname.startsWith('/design-lab/');
  const isUiBaseline =
    pathname === '/ui-baseline' || pathname.startsWith('/ui-baseline/');

  if (isDesignLab) {
    return <DesignLabApp pathname={pathname} />;
  }

  if (isUiBaseline) {
    return (
      <Suspense fallback={<p role="status">Loading UI baseline…</p>}>
        <PrismaCertUiBaseline />
      </Suspense>
    );
  }

  return <App />;
}
