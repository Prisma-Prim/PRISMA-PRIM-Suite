import {
  ApplicationContentSurface,
  ApplicationShell,
} from './production-shell/ApplicationShell';
import { useEffect, useState } from 'react';
import type { BrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { CompanyRegistration } from './company/CompanyRegistration';
import { formatApplicationDateTime } from './presentation/date-time';

interface ActivityLogEvent {
  id: string;
  action: 'internal_user.provisioned' | 'company.registered';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target:
    | {
        type: 'internal_user';
        internalUserId: string;
        displayName: string;
      }
    | { type: 'company'; companyId: string; displayName: string };
  metadata: { identityProvider: string } | Record<string, never>;
}

type ActivityLogState =
  | { status: 'loading' }
  | { status: 'ready'; events: ActivityLogEvent[] }
  | { status: 'error' };

type AccessState =
  | { status: 'checking' }
  | { status: 'active'; actor: ActorContext; activityLog: ActivityLogState }
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
      .then(async (token) => {
        const headers =
          identity.requestHeaders ??
          (token ? { Authorization: `Bearer ${token}` } : undefined);
        const response = await fetch(
          `${import.meta.env.VITE_API_URL ?? '/api'}/access/current-actor`,
          {
            credentials: 'include',
            headers,
            signal: controller.signal,
          },
        );
        if (response.status === 401) {
          await identity.rejectSession();
          return setAccess({ status: 'signed-out' });
        }
        if (response.status === 403) return setAccess({ status: 'forbidden' });
        if (!response.ok) return setAccess({ status: 'error' });
        const actor = (await response.json()) as ActorContext;
        setAccess({
          status: 'active',
          actor,
          activityLog: { status: 'loading' },
        });

        try {
          const activityResponse = await fetch(
            `${import.meta.env.VITE_API_URL ?? '/api'}/activity-log`,
            {
              credentials: 'include',
              headers,
              signal: controller.signal,
            },
          );
          if (activityResponse.status === 401) {
            await identity.rejectSession();
            return setAccess({ status: 'signed-out' });
          }
          if (activityResponse.status === 403)
            return setAccess({ status: 'forbidden' });
          if (!activityResponse.ok) {
            return setAccess({
              status: 'active',
              actor,
              activityLog: { status: 'error' },
            });
          }
          const activityLog = (await activityResponse.json()) as {
            events: ActivityLogEvent[];
          };
          return setAccess({
            status: 'active',
            actor,
            activityLog: { status: 'ready', events: activityLog.events },
          });
        } catch (error: unknown) {
          if (error instanceof DOMException && error.name === 'AbortError')
            throw error;
          return setAccess({
            status: 'active',
            actor,
            activityLog: { status: 'error' },
          });
        }
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
      <CompanyRegistration actor={access.actor} identity={identity} />
      <ActivityLog state={access.activityLog} />
    </ApplicationShell>
  );
}

function ActivityLog({ state }: { state: ActivityLogState }) {
  return (
    <section className="activity-log" aria-labelledby="activity-log-title">
      <div className="activity-log-heading">
        <p className="eyebrow">Accountability</p>
        <h2 id="activity-log-title">Activity Log</h2>
      </div>
      {state.status === 'loading' && <p role="status">Loading activity…</p>}
      {state.status === 'error' && (
        <p role="alert">
          We could not load the Activity Log. Please try again.
        </p>
      )}
      {state.status === 'ready' && state.events.length === 0 && (
        <p>No activity has been recorded in this workspace yet.</p>
      )}
      {state.status === 'ready' && state.events.length > 0 && (
        <ol className="activity-log-list">
          {state.events.map((event) => (
            <li key={event.id}>
              <div>
                <strong>{activityDescription(event)}</strong>
                <span>Target: {event.target.displayName}</span>
              </div>
              <time dateTime={event.occurredAt}>
                {formatApplicationDateTime(event.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function activityDescription(event: ActivityLogEvent): string {
  const actionLabels: Record<ActivityLogEvent['action'], string> = {
    'internal_user.provisioned': 'was provisioned',
    'company.registered': 'registered a Company',
  };
  return `${event.actor.displayName} ${actionLabels[event.action]}`;
}
