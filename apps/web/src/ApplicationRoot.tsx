import { App } from './App';
import { DesignLabApp } from './design-lab/DesignLabApp';

interface ApplicationRootProps {
  pathname: string;
}

export function ApplicationRoot({ pathname }: ApplicationRootProps) {
  const isDesignLab =
    pathname === '/design-lab' || pathname.startsWith('/design-lab/');

  if (isDesignLab) {
    return <DesignLabApp pathname={pathname} />;
  }

  return <App />;
}
