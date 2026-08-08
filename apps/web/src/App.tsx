import {
  ApplicationContentSurface,
  ApplicationShell,
} from './production-shell/ApplicationShell';

export function App() {
  return (
    <ApplicationShell
      activeHref="/"
      navigationItems={[{ href: '/', label: 'Home' }]}
      userArea={<span>Internal workspace</span>}
    >
      <ApplicationContentSurface>
        <p className="eyebrow">Workspace home</p>
        <h1>Welcome to PRISMA-PRIM Suite</h1>
        <p>
          This workspace is ready to host your organization&apos;s workflows as
          they become available.
        </p>
      </ApplicationContentSurface>
    </ApplicationShell>
  );
}
