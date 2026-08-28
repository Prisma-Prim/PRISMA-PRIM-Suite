import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import type { ApiResult } from '../api/authenticated-api-client';
import { preferenceKey } from './company-context-preference';
import {
  createProductionShellSession,
  type ProductionShellSession,
  type ProductionShellSessionSnapshot,
  type ProductionShellTransport,
} from './production-shell-session';

const baseActor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'Workspace',
  displayName: 'Ada',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: ['company.manage'],
};

const nextActor: ActorContext = {
  ...baseActor,
  internalUserId: 'user-2',
  workspaceMembershipId: 'membership-2',
  workspaceId: 'workspace-2',
  workspaceName: 'Next Workspace',
};

const companies = [
  { id: 'company-a', displayName: 'Company A' },
  { id: 'company-b', displayName: 'Company B' },
];

describe('production shell session', () => {
  beforeEach(() => localStorage.clear());

  it('restores one visible Company and resolves its Activity Log', async () => {
    const transport = transportWith({
      async loadActor({ companyId }) {
        return {
          status: 'ok',
          value: companyId ? selectedActor(companyId) : baseActor,
        };
      },
      async loadCompanies() {
        return { status: 'ok', value: [companies[0]!] };
      },
      async loadActivityLog({ companyId }) {
        return activitySuccess(companyId);
      },
    });
    const rejectSession = vi.fn(async () => undefined);
    const observed = observeSession({ transport, rejectSession });

    await vi.waitFor(() => {
      expect(observed.current().shellContext).toMatchObject({
        status: 'active',
        actor: { activeCompany: { id: 'company-a' } },
        companyContext: {
          status: 'ready',
          cardinality: 'one',
          selection: { status: 'idle' },
        },
        activityLog: {
          status: 'ready',
          events: [{ id: 'activity-company-a' }],
        },
      });
    });

    expect(rejectSession).not.toHaveBeenCalled();
    observed.unsubscribe();
  });

  it('refreshes workspace activity after rejecting an invalid active Company', async () => {
    const loadActivityLog = vi.fn(
      async ({ companyId }: { companyId?: string }) =>
        activitySuccess(companyId),
    );
    const observed = observeSession({
      transport: transportWith({
        async loadActor({ companyId }) {
          return {
            status: 'ok',
            value: companyId ? selectedActor(companyId) : baseActor,
          };
        },
        async loadCompanies() {
          return { status: 'ok', value: [companies[0]!] };
        },
        loadActivityLog,
      }),
    });
    await vi.waitFor(() =>
      expect(observed.current().shellContext).toMatchObject({
        status: 'active',
        actor: { activeCompany: { id: 'company-a' } },
        activityLog: { status: 'ready' },
      }),
    );
    loadActivityLog.mockClear();

    await observed
      .current()
      .rejectCompanyContextAndRefreshActivity('company-a');

    expect(loadActivityLog).toHaveBeenCalledWith({
      companyId: undefined,
      signal: expect.any(AbortSignal),
    });
    const recovered = observed.current().shellContext;
    expect(recovered).toMatchObject({
      status: 'active',
      activityLog: { status: 'ready', events: [] },
    });
    if (recovered.status !== 'active')
      throw new Error('Expected an active production-shell session.');
    expect(recovered.actor.activeCompany).toBeUndefined();
    observed.unsubscribe();
  });

  it.each([
    {
      label: 'empty',
      result: {
        status: 'ok' as const,
        value: [] as { id: string; displayName: string }[],
      },
      expected: { status: 'ready', cardinality: 'zero', companies: [] },
    },
    {
      label: 'forbidden',
      result: { status: 'forbidden' } as const,
      expected: { status: 'forbidden' },
    },
    {
      label: 'error',
      result: { status: 'error' } as const,
      expected: { status: 'error' },
    },
  ])('represents a $label Company initialization outcome', async (scenario) => {
    const observed = observeSession({
      transport: transportWith({
        async loadCompanies() {
          return scenario.result;
        },
      }),
    });

    await vi.waitFor(() => {
      expect(observed.current().shellContext).toMatchObject({
        status: 'active',
        companyContext: scenario.expected,
        activityLog: { status: 'ready' },
      });
    });
    observed.unsubscribe();
  });

  it.each([
    { result: { status: 'forbidden' } as const, expectedStatus: 'forbidden' },
    { result: { status: 'error' } as const, expectedStatus: 'error' },
  ])(
    'settles initial actor access as $expectedStatus',
    async ({ result, expectedStatus }) => {
      const observed = observeSession({
        transport: transportWith({
          async loadActor() {
            return result;
          },
        }),
      });

      await vi.waitFor(() =>
        expect(observed.current().shellContext.status).toBe(expectedStatus),
      );
      observed.unsubscribe();
    },
  );

  it('rejects an unauthorized initial session', async () => {
    const rejectSession = vi.fn(async () => undefined);
    const observed = observeSession({
      transport: transportWith({
        async loadActor() {
          return { status: 'unauthorized' };
        },
      }),
      rejectSession,
    });

    await vi.waitFor(() => {
      expect(rejectSession).toHaveBeenCalledOnce();
      expect(observed.current().shellContext).toEqual({
        status: 'signed-out',
      });
    });
    observed.unsubscribe();
  });

  it('restores a persisted Company only after the transport validates it', async () => {
    localStorage.setItem(preferenceKey(baseActor), 'company-b');
    const observed = observeSession({
      transport: transportWith({
        async loadActor({ companyId }) {
          return {
            status: 'ok',
            value: companyId ? selectedActor(companyId) : baseActor,
          };
        },
        async loadActivityLog({ companyId }) {
          return activitySuccess(companyId);
        },
      }),
    });

    await vi.waitFor(() => {
      expect(observed.current().shellContext).toMatchObject({
        status: 'active',
        actor: { activeCompany: { id: 'company-b' } },
        activityLog: {
          status: 'ready',
          events: [{ id: 'activity-company-b' }],
        },
      });
    });
    observed.unsubscribe();
  });

  it('clears a persisted Company that the transport no longer authorizes', async () => {
    localStorage.setItem(preferenceKey(baseActor), 'company-b');
    const observed = observeSession({
      transport: transportWith({
        async loadActor({ companyId }) {
          return companyId
            ? { status: 'forbidden' }
            : { status: 'ok', value: baseActor };
        },
      }),
    });

    await vi.waitFor(() => {
      expect(observed.current().shellContext).toMatchObject({
        status: 'active',
        companyContext: {
          status: 'ready',
          companies: [{ id: 'company-a' }],
          recoveryMessage: 'stale',
        },
      });
    });
    const restored = observed.current().shellContext;
    if (restored.status !== 'active')
      throw new Error('Expected an active production-shell session.');
    expect(restored.actor.activeCompany).toBeUndefined();
    expect(localStorage.getItem(preferenceKey(baseActor))).toBeNull();
    observed.unsubscribe();
  });

  it('selects a visible Company and scopes the refreshed Activity Log to it', async () => {
    const selection = deferred<ApiResult<ActorContext>>();
    const observed = observeSession({
      transport: transportWith({
        async loadActor({ companyId }) {
          return companyId === 'company-b'
            ? selection.promise
            : { status: 'ok', value: baseActor };
        },
        async loadActivityLog({ companyId }) {
          return activitySuccess(companyId);
        },
      }),
    });
    await waitForReady(observed.current);

    const selecting = observed.current().selectCompany('company-b');
    await vi.waitFor(() =>
      expect(observed.current().shellContext).toMatchObject({
        status: 'active',
        companyContext: {
          selection: { status: 'pending', companyId: 'company-b' },
        },
      }),
    );
    selection.resolve({ status: 'ok', value: selectedActor('company-b') });
    await selecting;

    expect(observed.current().shellContext).toMatchObject({
      status: 'active',
      actor: { activeCompany: { id: 'company-b' } },
      companyContext: { selection: { status: 'idle' } },
      activityLog: {
        status: 'ready',
        events: [{ id: 'activity-company-b' }],
      },
    });
    observed.unsubscribe();
  });

  it('refreshes the active Company Activity Log without reloading actor authority', async () => {
    let activityRequest = 0;
    const loadActor = vi.fn(async ({ companyId }: { companyId?: string }) => ({
      status: 'ok' as const,
      value: companyId ? selectedActor(companyId) : baseActor,
    }));
    const observed = observeSession({
      transport: transportWith({
        loadActor,
        async loadCompanies() {
          return { status: 'ok', value: [companies[0]!] };
        },
        async loadActivityLog({ companyId }) {
          activityRequest += 1;
          const [event] = activitySuccess(companyId).value.events;
          return {
            status: 'ok',
            value: {
              events: event
                ? [{ ...event, id: `activity-${companyId}-${activityRequest}` }]
                : [],
            },
          };
        },
      }),
    });
    await vi.waitFor(() =>
      expect(observed.current().shellContext).toMatchObject({
        activityLog: {
          events: [{ id: 'activity-company-a-1' }],
        },
      }),
    );

    await observed.current().refreshActivityLog();

    expect(observed.current().shellContext).toMatchObject({
      activityLog: {
        events: [{ id: 'activity-company-a-2' }],
      },
    });
    expect(loadActor).toHaveBeenCalledTimes(2);
    observed.unsubscribe();
  });

  it('does not let an older Activity Log load overwrite a mutation refresh', async () => {
    const initialActivity = deferred<
      ApiResult<{
        events: ReturnType<typeof activitySuccess>['value']['events'];
      }>
    >();
    let activityRequest = 0;
    let initialSignal: AbortSignal | undefined;
    const observed = observeSession({
      transport: transportWith({
        async loadActor({ companyId }) {
          return {
            status: 'ok',
            value: companyId ? selectedActor(companyId) : baseActor,
          };
        },
        async loadCompanies() {
          return { status: 'ok', value: [companies[0]!] };
        },
        async loadActivityLog({ companyId, signal }) {
          activityRequest += 1;
          if (activityRequest === 1) {
            initialSignal = signal;
            return initialActivity.promise;
          }
          const refreshed = activitySuccess(companyId);
          return {
            ...refreshed,
            value: {
              events: refreshed.value.events.map((event) => ({
                ...event,
                id: 'activity-after-mutation',
              })),
            },
          };
        },
      }),
    });
    await vi.waitFor(() => {
      expect(activityRequest).toBe(1);
      expect(observed.current().shellContext.status).toBe('active');
    });

    await observed.current().refreshActivityLog();

    expect(initialSignal?.aborted).toBe(true);
    expect(observed.current().shellContext).toMatchObject({
      activityLog: {
        events: [{ id: 'activity-after-mutation' }],
      },
    });
    initialActivity.resolve({
      status: 'ok',
      value: {
        events: [
          {
            ...activitySuccess('company-a').value.events[0]!,
            id: 'stale-activity',
          },
        ],
      },
    });
    await initialActivity.promise;
    expect(observed.current().shellContext).toMatchObject({
      activityLog: {
        events: [{ id: 'activity-after-mutation' }],
      },
    });
    observed.unsubscribe();
  });

  it('accepts a revalidated actor and reloads permission-filtered activity', async () => {
    let activityRequest = 0;
    const initiallyAuthorizedActor: ActorContext = {
      ...selectedActor('company-a'),
      activeCompany: {
        ...selectedActor('company-a').activeCompany!,
        clientPermissions: ['client.read', 'client.create', 'client.update'],
      },
    };
    const observed = observeSession({
      transport: transportWith({
        async loadActor({ companyId }) {
          return {
            status: 'ok',
            value: companyId ? initiallyAuthorizedActor : baseActor,
          };
        },
        async loadCompanies() {
          return { status: 'ok', value: [companies[0]!] };
        },
        async loadActivityLog({ companyId }) {
          activityRequest += 1;
          return activitySuccess(companyId);
        },
      }),
    });
    await vi.waitFor(() => expect(activityRequest).toBe(1));

    await observed.current().acceptRevalidatedActor({
      ...initiallyAuthorizedActor,
      activeCompany: {
        ...initiallyAuthorizedActor.activeCompany!,
        clientPermissions: [],
      },
    });

    expect(observed.current().shellContext).toMatchObject({
      status: 'active',
      actor: {
        activeCompany: { id: 'company-a', clientPermissions: [] },
      },
      activityLog: { status: 'ready' },
    });
    expect(activityRequest).toBe(2);
    observed.unsubscribe();
  });

  it('removes a denied Company and returns selection to an idle recovery state', async () => {
    const observed = observeSession({
      transport: transportWith({
        async loadActor({ companyId }) {
          return companyId
            ? { status: 'forbidden' }
            : { status: 'ok', value: baseActor };
        },
      }),
    });
    await waitForReady(observed.current);

    await observed.current().selectCompany('company-b');

    expect(observed.current().shellContext).toMatchObject({
      status: 'active',
      companyContext: {
        status: 'ready',
        companies: [{ id: 'company-a' }],
        recoveryMessage: 'selection-failed',
        selection: { status: 'idle' },
      },
    });
    observed.unsubscribe();
  });

  it('exposes a recoverable Company-context error when selection fails', async () => {
    const observed = observeSession({
      transport: transportWith({
        async loadActor({ companyId }) {
          return companyId
            ? { status: 'error' }
            : { status: 'ok', value: baseActor };
        },
      }),
    });
    await waitForReady(observed.current);

    await observed.current().selectCompany('company-b');

    expect(observed.current().shellContext).toMatchObject({
      status: 'active',
      companyContext: {
        status: 'error',
        recovery: { companies },
      },
    });
    observed.unsubscribe();
  });

  it('exposes an Activity Log load failure without discarding shell access', async () => {
    const observed = observeSession({
      transport: transportWith({
        async loadActivityLog() {
          return { status: 'error' };
        },
      }),
    });

    await vi.waitFor(() =>
      expect(observed.current().shellContext).toMatchObject({
        status: 'active',
        activityLog: { status: 'error' },
      }),
    );
    observed.unsubscribe();
  });

  it('removes an active Company rejected by Activity Log access', async () => {
    const observed = observeSession({
      transport: transportWith({
        async loadActor({ companyId }) {
          return {
            status: 'ok',
            value: companyId ? selectedActor(companyId) : baseActor,
          };
        },
        async loadCompanies() {
          return { status: 'ok', value: [companies[0]!] };
        },
        async loadActivityLog() {
          return { status: 'forbidden' };
        },
      }),
    });

    await vi.waitFor(() =>
      expect(observed.current().shellContext).toMatchObject({
        status: 'active',
        companyContext: {
          status: 'ready',
          companies: [],
          recoveryMessage: 'stale',
        },
        activityLog: { status: 'error' },
      }),
    );
    const rejected = observed.current().shellContext;
    if (rejected.status !== 'active')
      throw new Error('Expected an active production-shell session.');
    expect(rejected.actor.activeCompany).toBeUndefined();
    observed.unsubscribe();
  });

  it('rejects the session when Activity Log access becomes unauthorized', async () => {
    const rejectSession = vi.fn(async () => undefined);
    const observed = observeSession({
      transport: transportWith({
        async loadActivityLog() {
          return { status: 'unauthorized' };
        },
      }),
      rejectSession,
    });

    await vi.waitFor(() => {
      expect(rejectSession).toHaveBeenCalledOnce();
      expect(observed.current().shellContext).toEqual({
        status: 'signed-out',
      });
    });
    observed.unsubscribe();
  });

  it('cancels an older selection and ignores its late result', async () => {
    const selections = new Map<
      string,
      ReturnType<typeof deferred<ApiResult<ActorContext>>>
    >();
    const signals = new Map<string, AbortSignal>();
    const observed = observeSession({
      transport: transportWith({
        async loadActor({ companyId, signal }) {
          if (!companyId) return { status: 'ok', value: baseActor };
          const selection = deferred<ApiResult<ActorContext>>();
          selections.set(companyId, selection);
          signals.set(companyId, signal);
          return selection.promise;
        },
      }),
    });
    await waitForReady(observed.current);

    const older = observed.current().selectCompany('company-a');
    await vi.waitFor(() => expect(selections.has('company-a')).toBe(true));
    const newer = observed.current().selectCompany('company-b');
    await vi.waitFor(() => expect(selections.has('company-b')).toBe(true));

    expect(signals.get('company-a')?.aborted).toBe(true);
    selections
      .get('company-b')!
      .resolve({ status: 'ok', value: selectedActor('company-b') });
    await newer;
    selections
      .get('company-a')!
      .resolve({ status: 'ok', value: selectedActor('company-a') });
    await older;

    expect(observed.current().shellContext).toMatchObject({
      status: 'active',
      actor: { activeCompany: { id: 'company-b' } },
    });
    observed.unsubscribe();
  });

  it('cancels a pending selection and ignores commands from the replaced identity', async () => {
    const staleSelection = deferred<ApiResult<ActorContext>>();
    let initialization = 0;
    let selectionRequests = 0;
    let staleSelectionSignal: AbortSignal | undefined;
    const transport = transportWith({
      async loadActor({ companyId, signal }) {
        if (companyId) {
          selectionRequests += 1;
          staleSelectionSignal = signal;
          return staleSelection.promise;
        }
        initialization += 1;
        return {
          status: 'ok',
          value: initialization === 1 ? baseActor : nextActor,
        };
      },
    });
    const session = createProductionShellSession({
      createTransport: async () => transport,
      rejectSession: async () => undefined,
      shouldInitialize: true,
    });
    let snapshot = session.getSnapshot();
    const observe = () => {
      snapshot = session.getSnapshot();
    };
    const disconnect = session.subscribe(observe);
    await waitForReady(() => snapshot);
    const staleSnapshot = snapshot;
    const pendingSelection = snapshot.selectCompany('company-a');
    await vi.waitFor(() => expect(selectionRequests).toBe(1));

    disconnect();
    expect(staleSelectionSignal?.aborted).toBe(true);
    const reconnect = session.subscribe(observe);
    await vi.waitFor(() =>
      expect(snapshot.shellContext).toMatchObject({
        status: 'active',
        actor: { internalUserId: 'user-2', workspaceId: 'workspace-2' },
        activityLog: { status: 'ready' },
      }),
    );
    staleSelection.resolve({
      status: 'ok',
      value: selectedActor('company-a'),
    });
    await pendingSelection;

    await staleSnapshot.selectCompany('company-b');
    staleSnapshot.includeCompany({
      id: 'company-secret',
      displayName: 'Confidential Company',
    });

    expect(selectionRequests).toBe(1);
    expect(snapshot.shellContext).toMatchObject({
      status: 'active',
      actor: { internalUserId: 'user-2' },
      companyContext: { status: 'ready', companies },
    });
    reconnect();
  });
});

function transportWith(
  overrides: Partial<ProductionShellTransport> = {},
): ProductionShellTransport {
  return {
    async loadActor() {
      return { status: 'ok', value: baseActor };
    },
    async loadCompanies() {
      return { status: 'ok', value: companies };
    },
    async loadActivityLog() {
      return { status: 'ok', value: { events: [] } };
    },
    ...overrides,
  };
}

function observeSession({
  transport,
  rejectSession = async () => undefined,
}: {
  transport: ProductionShellTransport;
  rejectSession?: () => Promise<void>;
}): {
  current: () => ProductionShellSessionSnapshot;
  unsubscribe: () => void;
} {
  const session: ProductionShellSession = createProductionShellSession({
    createTransport: async () => transport,
    rejectSession,
    shouldInitialize: true,
  });
  let snapshot = session.getSnapshot();
  const unsubscribe = session.subscribe(() => {
    snapshot = session.getSnapshot();
  });
  return { current: () => snapshot, unsubscribe };
}

async function waitForReady(
  current: () => ProductionShellSessionSnapshot,
): Promise<void> {
  await vi.waitFor(() =>
    expect(current().shellContext).toMatchObject({
      status: 'active',
      companyContext: { status: 'ready', cardinality: 'many' },
      activityLog: { status: 'ready' },
    }),
  );
}

function selectedActor(companyId: string): ActorContext {
  const company = companies.find(({ id }) => id === companyId);
  return {
    ...baseActor,
    activeCompany: {
      id: companyId,
      displayName: company?.displayName ?? companyId,
    },
  };
}

function activitySuccess(companyId: string | undefined) {
  return {
    status: 'ok' as const,
    value: {
      events: companyId
        ? [
            {
              id: `activity-${companyId}`,
              action: 'company.registered' as const,
              occurredAt: '2026-08-22T10:00:00.000Z',
              actor: { internalUserId: 'user-1', displayName: 'Ada' },
              target: {
                type: 'company' as const,
                companyId,
                displayName: companyId,
              },
              metadata: {},
            },
          ]
        : [],
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
