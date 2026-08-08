import {
  ApplicationContentSurface,
  ApplicationShell,
} from './production-shell/ApplicationShell';
import { useEffect, useState } from 'react';

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

export function App() {
  const [access, setAccess] = useState<AccessState>({ status: 'checking' });

  useEffect(() => {
    const controller = new AbortController();
    const localDemoHeaders =
      import.meta.env.MODE === 'local-demo' &&
      import.meta.env.VITE_ACCESS_IDENTITY_MODE === 'local-demo'
        ? {
            'x-test-external-provider': import.meta.env
              .VITE_DEMO_EXTERNAL_PROVIDER,
            'x-test-external-subject': import.meta.env
              .VITE_DEMO_EXTERNAL_SUBJECT,
            'x-test-display-name': import.meta.env.VITE_DEMO_DISPLAY_NAME,
            'x-test-email': import.meta.env.VITE_DEMO_EMAIL,
          }
        : undefined;

    void fetch(
      `${import.meta.env.VITE_API_URL ?? '/api'}/access/current-actor`,
      {
        credentials: 'include',
        headers: localDemoHeaders,
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (response.status === 401) return setAccess({ status: 'signed-out' });
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
  }, []);

  if (access.status !== 'active') {
    const messages: Record<Exclude<AccessState['status'], 'active'>, string> = {
      checking: 'Verifying your access…',
      'signed-out': 'Sign in is required to access this workspace.',
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
