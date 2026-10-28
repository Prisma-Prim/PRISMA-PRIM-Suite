import { StrictMode, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import type { ApiResult } from '../api/authenticated-api-client';
import { syntheticActor } from '../offer-model/offer-model.fixture';
import {
  ModelAccessLifetime,
  useModelAccessRejection,
} from './ModelAccessLifetime';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!settle) throw new Error('Deferred was not initialized.');
      settle(value);
    },
  };
}

function identity(): BrowserIdentity {
  return {
    loaded: true,
    signedIn: true,
    getToken: async () => null,
    rejectSession: vi.fn(async () => undefined),
    signOut: async () => undefined,
    signedOutView: null,
    requestHeaders: { 'x-synthetic-proof': 'true' },
  };
}

const authority = {
  companyId: '10000000-0000-4000-8000-000000000847',
  key: 'captured-editor-v1',
};

function Child({
  retained,
}: {
  retained?: (reject: (result: ApiResult<unknown>) => void) => void;
}) {
  const reject = useModelAccessRejection();
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const pending = new AbortController();
    void fetch('/owned-operation', { signal: pending.signal }).catch(
      () => undefined,
    );
    retained?.(reject);
    return () => pending.abort();
  }, [retained, reject]);
  return (
    <>
      <p>Protected model content</p>
      <button onClick={() => reject({ status: 'forbidden' })}>
        History forbidden
      </button>
      <button onClick={() => reject({ status: 'unauthorized' })}>
        Root unauthorized
      </button>
      <button onClick={() => setConfirmed(true)}>Confirm command</button>
      <button onClick={() => reject({ status: 'error' })}>Refresh error</button>
      {confirmed && <p>Protected local state</p>}
    </>
  );
}

type ShellProps = {
  actor: ActorContext;
  identity: BrowserIdentity;
  authority: typeof authority;
  onActorRevalidated?: (actor: ActorContext) => void | Promise<void>;
  onCompanyContextRejected?: (id: string) => void;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
  retained?: (reject: (result: ApiResult<unknown>) => void) => void;
};
function Shell({ retained, ...props }: ShellProps) {
  return (
    <section>
      <h2>Company model configuration</h2>
      <ModelAccessLifetime
        {...props}
        denied={(retry) => (
          <>
            <p role="alert">Model access denied</p>
            <button onClick={retry}>Refresh model</button>
          </>
        )}
      >
        <Child retained={retained} />
      </ModelAccessLifetime>
    </section>
  );
}

function network() {
  const recovery = deferred<Response>();
  const protectedSignals: (AbortSignal | null | undefined)[] = [];
  const recoverySignals: (AbortSignal | null | undefined)[] = [];
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (input.toString() === '/owned-operation') {
      protectedSignals.push(init?.signal);
      return new Promise<Response>(() => undefined);
    }
    if (input.toString() === '/api/access/current-actor') {
      recoverySignals.push(init?.signal);
      return recovery.promise;
    }
    throw new Error(`Unexpected request: ${input.toString()}`);
  });
  vi.stubGlobal('fetch', fetch);
  return { recovery, fetch, protectedSignals, recoverySignals };
}

it('retires protected work while independently recovering after history disappears', async () => {
  const io = network();
  const published = vi.fn();
  render(
    <Shell
      actor={syntheticActor}
      identity={identity()}
      authority={authority}
      onActorRevalidated={published}
    />,
  );
  fireEvent.click(screen.getByText('History forbidden'));
  await waitFor(() => expect(io.recoverySignals).toHaveLength(1));
  expect(screen.queryByText('Protected model content')).toBeNull();
  expect(screen.getByRole('alert').textContent).toBe('Model access denied');
  expect(io.protectedSignals[0]?.aborted).toBe(true);
  expect(io.recoverySignals[0]?.aborted).toBe(false);
  await act(async () => {
    io.recovery.resolve(Response.json(syntheticActor));
  });
  expect(published).toHaveBeenCalledExactlyOnceWith(syntheticActor);
});

it('dispatches only the latest callbacks without starting another request', async () => {
  const io = network();
  const session = identity();
  const oldHandler = vi.fn();
  const currentHandler = vi.fn();
  const props = { actor: syntheticActor, identity: session, authority };
  const view = render(<Shell {...props} onActorRevalidated={oldHandler} />);
  fireEvent.click(screen.getByText('History forbidden'));
  await waitFor(() => expect(io.recoverySignals).toHaveLength(1));
  view.rerender(<Shell {...props} onActorRevalidated={currentHandler} />);
  await act(async () => {
    io.recovery.resolve(Response.json(syntheticActor));
  });
  expect(oldHandler).not.toHaveBeenCalled();
  expect(currentHandler).toHaveBeenCalledExactlyOnceWith(syntheticActor);
  expect(io.recoverySignals).toHaveLength(1);
});

it('retires stale actor publication even when captured model authority is unchanged', async () => {
  const io = network();
  const session = identity();
  const published = vi.fn();
  const props = { identity: session, authority, onActorRevalidated: published };
  const view = render(<Shell {...props} actor={syntheticActor} />);
  fireEvent.click(screen.getByText('History forbidden'));
  await waitFor(() => expect(io.recoverySignals).toHaveLength(1));
  view.rerender(
    <Shell
      {...props}
      actor={{ ...syntheticActor, displayName: 'New snapshot' }}
    />,
  );
  expect(io.recoverySignals[0]?.aborted).toBe(true);
  // The network double deliberately ignores abort; publication still stops.
  await act(async () => {
    io.recovery.resolve(Response.json(syntheticActor));
  });
  expect(published).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toBe('Model access denied');
});

it.each(['company', 'authority', 'session'])(
  'retires the complete owner when %s changes',
  async (change) => {
    const io = network();
    const session = identity();
    const published = vi.fn();
    const props = {
      actor: syntheticActor,
      identity: session,
      authority,
      onActorRevalidated: published,
    };
    const view = render(<Shell {...props} />);
    fireEvent.click(screen.getByText('History forbidden'));
    await waitFor(() => expect(io.recoverySignals).toHaveLength(1));
    view.rerender(
      <Shell
        {...props}
        identity={change === 'session' ? identity() : session}
        authority={
          change === 'company'
            ? { ...authority, companyId: 'a-different-company' }
            : change === 'authority'
              ? { ...authority, key: 'captured-approver-v1' }
              : authority
        }
      />,
    );
    expect(io.recoverySignals[0]?.aborted).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Protected model content')).toBeTruthy();
    await act(async () => {
      io.recovery.resolve(Response.json(syntheticActor));
    });
    expect(published).not.toHaveBeenCalled();
  },
);

it('retry retires recovery before mounting a fresh reader and ignores retained child calls', async () => {
  const io = network();
  const published = vi.fn();
  const retained: ((result: ApiResult<unknown>) => void)[] = [];
  render(
    <Shell
      actor={syntheticActor}
      identity={identity()}
      authority={authority}
      onActorRevalidated={published}
      retained={(reject) => retained.push(reject)}
    />,
  );
  fireEvent.click(screen.getByText('History forbidden'));
  await waitFor(() => expect(io.recoverySignals).toHaveLength(1));
  fireEvent.click(screen.getByText('Refresh model'));
  expect(io.recoverySignals[0]?.aborted).toBe(true);
  expect(io.protectedSignals).toHaveLength(2);
  act(() => retained[0]?.({ status: 'forbidden' }));
  expect(screen.queryByRole('alert')).toBeNull();
  await act(async () => {
    io.recovery.resolve(Response.json(syntheticActor));
  });
  expect(published).not.toHaveBeenCalled();
});

it('rejects the active session once for unauthorized and does not recover actors', async () => {
  const io = network();
  const session = identity();
  render(
    <Shell actor={syntheticActor} identity={session} authority={authority} />,
  );
  fireEvent.click(screen.getByText('Root unauthorized'));
  await waitFor(() => expect(session.rejectSession).toHaveBeenCalledTimes(1));
  expect(io.recoverySignals).toHaveLength(0);
});

it('ordinary read errors retain protected local state', () => {
  network();
  render(
    <Shell
      actor={syntheticActor}
      identity={identity()}
      authority={authority}
    />,
  );
  fireEvent.click(screen.getByText('Confirm command'));
  fireEvent.click(screen.getByText('Refresh error'));
  expect(screen.getByText('Protected local state')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('unmount aborts recovery and suppresses late publication', async () => {
  const io = network();
  const published = vi.fn();
  const view = render(
    <Shell
      actor={syntheticActor}
      identity={identity()}
      authority={authority}
      onActorRevalidated={published}
    />,
  );
  fireEvent.click(screen.getByText('History forbidden'));
  await waitFor(() => expect(io.recoverySignals).toHaveLength(1));
  view.unmount();
  expect(io.recoverySignals[0]?.aborted).toBe(true);
  await act(async () => {
    io.recovery.resolve(Response.json(syntheticActor));
  });
  expect(published).not.toHaveBeenCalled();
});

it('rechecks liveness between company rejection and complete-actor publication', async () => {
  const io = network();
  const session = identity();
  const published = vi.fn();
  const props = {
    actor: syntheticActor,
    identity: session,
    authority,
    onActorRevalidated: published,
  };
  const view = render(<Shell {...props} />);
  const rejectCompany = vi.fn(() => {
    flushSync(() =>
      view.rerender(
        <Shell
          {...props}
          actor={{ ...syntheticActor, displayName: 'New complete snapshot' }}
        />,
      ),
    );
  });
  view.rerender(<Shell {...props} onCompanyContextRejected={rejectCompany} />);
  fireEvent.click(screen.getByText('History forbidden'));
  await waitFor(() => expect(io.recoverySignals).toHaveLength(1));
  await act(async () => {
    io.recovery.resolve(
      Response.json({ ...syntheticActor, activeCompany: undefined }),
    );
  });
  expect(rejectCompany).toHaveBeenCalledExactlyOnceWith(authority.companyId);
  expect(published).not.toHaveBeenCalled();
});

it('uses the latest workspace-denial handler after selected-context fallback', async () => {
  const io = network();
  const session = identity();
  const oldHandler = vi.fn();
  const currentHandler = vi.fn();
  const props = { actor: syntheticActor, identity: session, authority };
  const view = render(
    <Shell {...props} onWorkspaceAccessRejected={oldHandler} />,
  );
  fireEvent.click(screen.getByText('History forbidden'));
  await waitFor(() => expect(io.recoverySignals).toHaveLength(1));
  view.rerender(
    <Shell {...props} onWorkspaceAccessRejected={currentHandler} />,
  );
  await act(async () => {
    io.recovery.resolve(new Response(null, { status: 403 }));
  });
  expect(io.recoverySignals).toHaveLength(2);
  expect(oldHandler).not.toHaveBeenCalled();
  expect(currentHandler).toHaveBeenCalledTimes(1);
});

it('preserves live protected state and its stable rejection operation for a newer equal-authority actor', () => {
  const io = network();
  const props = { identity: identity(), authority };
  const view = render(<Shell {...props} actor={syntheticActor} />);
  fireEvent.click(screen.getByText('Confirm command'));
  view.rerender(<Shell {...props} actor={{ ...syntheticActor }} />);
  expect(screen.getByText('Protected local state')).toBeVisible();
  expect(io.protectedSignals).toHaveLength(1);
  expect(io.recoverySignals).toHaveLength(0);
});

it('keeps rejection live after StrictMode effect replay and single-flights simultaneous child denials', async () => {
  const io = network();
  const retained: ((result: ApiResult<unknown>) => void)[] = [];
  render(
    <StrictMode>
      <Shell
        actor={syntheticActor}
        identity={identity()}
        authority={authority}
        retained={(reject) => retained.push(reject)}
      />
    </StrictMode>,
  );
  act(() => {
    retained[0]?.({ status: 'forbidden' });
    retained[0]?.({ status: 'forbidden' });
  });
  await waitFor(() => expect(io.recoverySignals).toHaveLength(1));
  expect(io.recoverySignals[0]?.aborted).toBe(false);
  expect(screen.queryByText('Protected model content')).toBeNull();
});
