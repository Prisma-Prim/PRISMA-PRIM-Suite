import {
  ApplicationContentSurface,
  ApplicationShell,
} from './production-shell/ApplicationShell';
import { useEffect, useState } from 'react';
import type { BrowserIdentity } from './access-composition';

interface CurrentActor {
  displayName: string;
  email: string;
  workspaceName: string;
}

type AccessState =
  | { status: 'checking' }
  | { status: 'active'; actor: CurrentActor }
  | { status: 'signed-out' }
  | { status: 'forbidden' }
  | { status: 'error' };

export function App({ identity }: { identity: BrowserIdentity }) {
  const [access, setAccess] = useState<AccessState>({ status: 'checking' });

  useEffect(() => {
    if (!identity.loaded || !identity.signedIn) return;
    const controller = new AbortController();
    void identity
      .getToken()
      .then((token) =>
        fetch(
          `${import.meta.env.VITE_API_URL ?? '/api'}/access/current-actor`,
          {
            credentials: 'include',
            headers:
              identity.requestHeaders ??
              (token ? { Authorization: `Bearer ${token}` } : undefined),
            signal: controller.signal,
          },
        ),
      )
      .then(async (response) => {
        if (response.status === 401) {
          sessionStorage.setItem('deterministic-auth-state', 'signed-out');
          return setAccess({ status: 'error' });
        }
        if (response.status === 403) return setAccess({ status: 'forbidden' });
        if (!response.ok) return setAccess({ status: 'error' });
        const actor = (await response.json()) as CurrentActor;
        setAccess({ status: 'active', actor });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setAccess({ status: 'error' });
      });

    return () => controller.abort();
  }, [identity]);

  if (!identity.loaded)
    return (
      <main className="production-access-state">
        <p role="status">Verifying your access…</p>
      </main>
    );
  if (!identity.signedIn) return <>{identity.signedOutView}</>;
  if (access.status === 'signed-out') return <>{identity.signedOutView}</>;

  if (access.status !== 'active') {
    const messages: Record<'checking' | 'forbidden' | 'error', string> = {
      checking: 'Verifying your access…',
      forbidden: 'Your access to this workspace is inactive.',
      error: 'We could not verify your access. Please try again.',
    };
    return (
      <main className="production-access-state">
        <p role={access.status === 'checking' ? 'status' : 'alert'}>
          {messages[access.status]}
        </p>
      </main>
    );
  }

  return (
    <ApplicationShell
      activeHref="/"
      navigationItems={[{ href: '/', label: 'Home' }]}
      userArea={
        <span>
          <strong>{access.actor.displayName}</strong>
          <small>{access.actor.email}</small>
          <button type="button" onClick={() => void identity.signOut()}>
            Sign out
          </button>
        </span>
      }
    >
      <ApplicationContentSurface>
        <p className="eyebrow">{access.actor.workspaceName}</p>
        <h1>Welcome to PRISMA-PRIM Suite</h1>
        <p>
          This workspace is ready to host your organization&apos;s workflows as
          they become available.
        </p>
      </ApplicationContentSurface>
    </ApplicationShell>
  );
}
