import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAuthenticatedProductionShellTransport } from './authenticated-production-shell-transport';
import { preferenceKey } from './company-context-preference';
import {
  baseActor,
  browserIdentity,
  companies,
  jsonResponse,
  selectedActor,
} from './production-shell-context.test-fixtures';
import { createProductionShellSession } from './production-shell-session';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

it.each(['Activity Log', 'Company selection'])(
  'retains Company and identity when native %s recovery cannot read the Workspace Actor',
  async (trigger) => {
    let unreadable = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        if (path.endsWith('/companies')) return jsonResponse(companies);
        if (path.endsWith('/access/current-actor')) {
          const companyId = new Headers(init?.headers).get(
            'x-company-context-id',
          );
          if (!companyId && unreadable)
            return jsonResponse({ internalUserId: 'unproved' });
          if (
            companyId === 'company-b' &&
            unreadable &&
            trigger === 'Company selection'
          )
            return new Response(null, { status: 403 });
          return jsonResponse(
            companyId
              ? selectedActor(
                  companyId,
                  companyId === 'company-a' ? 'Company A' : 'Company B',
                )
              : baseActor,
          );
        }
        if (path.endsWith('/activity-log'))
          return unreadable && trigger === 'Activity Log'
            ? new Response(null, { status: 403 })
            : jsonResponse({ events: [] });
        throw new Error(`Unexpected request ${path}`);
      }),
    );
    const { identity, session, unsubscribe } = await selectedNativeSession();
    try {
      unreadable = true;
      if (trigger === 'Activity Log')
        await session.getSnapshot().refreshActivityLog();
      else await session.getSnapshot().selectCompany('company-b');
      expect(session.getSnapshot().shellContext).toMatchObject({
        status: 'active',
        actor: selectedActor('company-a', 'Company A'),
        companyContext:
          trigger === 'Activity Log'
            ? { status: 'ready', companies }
            : { status: 'error', recovery: { companies } },
        activityLog: { status: trigger === 'Activity Log' ? 'error' : 'ready' },
      });
      expect(localStorage.getItem(preferenceKey(baseActor))).toBe('company-a');
      expect(identity.rejectSession).not.toHaveBeenCalled();
      expect(identity.signOut).not.toHaveBeenCalled();
      if (trigger === 'Activity Log') {
        unreadable = false;
        await session.getSnapshot().refreshActivityLog();
        expect(session.getSnapshot().shellContext).toMatchObject({
          actor: selectedActor('company-a', 'Company A'),
          companyContext: { status: 'ready', companies },
          activityLog: { status: 'ready' },
        });
      }
    } finally {
      unsubscribe();
    }
  },
);

it.each([200, 401, 403])(
  'preserves native Activity Log rejection behavior after verified Workspace HTTP %s',
  async (workspaceStatus) => {
    let rejected = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        if (path.endsWith('/companies')) return jsonResponse(companies);
        if (path.endsWith('/access/current-actor')) {
          const companyId = new Headers(init?.headers).get(
            'x-company-context-id',
          );
          if (!companyId && rejected)
            return Response.json(baseActor, { status: workspaceStatus });
          return jsonResponse(
            companyId ? selectedActor(companyId, 'Company A') : baseActor,
          );
        }
        if (path.endsWith('/activity-log'))
          return rejected
            ? new Response(null, { status: 403 })
            : jsonResponse({ events: [] });
        throw new Error(`Unexpected request ${path}`);
      }),
    );
    const { identity, session, unsubscribe } = await selectedNativeSession();
    try {
      rejected = true;
      await session.getSnapshot().refreshActivityLog();
      if (workspaceStatus === 401) {
        expect(session.getSnapshot().shellContext).toEqual({
          status: 'signed-out',
        });
        expect(identity.rejectSession).toHaveBeenCalledOnce();
      } else if (workspaceStatus === 403) {
        expect(session.getSnapshot().shellContext).toEqual({
          status: 'forbidden',
        });
        expect(identity.rejectSession).not.toHaveBeenCalled();
      } else {
        const context = session.getSnapshot().shellContext;
        expect(context).toMatchObject({
          status: 'active',
          companyContext: {
            status: 'ready',
            companies: [{ id: 'company-b', displayName: 'Company B' }],
            recoveryMessage: 'stale',
          },
          activityLog: { status: 'error' },
        });
        if (context.status !== 'active')
          throw new Error('Expected active Workspace context');
        expect(context.actor.activeCompany).toBeUndefined();
        expect(localStorage.getItem(preferenceKey(baseActor))).toBeNull();
        expect(identity.rejectSession).not.toHaveBeenCalled();
      }
    } finally {
      unsubscribe();
    }
  },
);

async function selectedNativeSession() {
  const identity = browserIdentity();
  const session = createProductionShellSession({
    createTransport: () =>
      createAuthenticatedProductionShellTransport(identity),
    rejectSession: identity.rejectSession,
    shouldInitialize: true,
  });
  const unsubscribe = session.subscribe(() => undefined);
  try {
    await vi.waitFor(() =>
      expect(session.getSnapshot().shellContext).toMatchObject({
        status: 'active',
        activityLog: { status: 'ready' },
      }),
    );
    await session.getSnapshot().selectCompany('company-a');
    return { identity, session, unsubscribe };
  } catch (error: unknown) {
    unsubscribe();
    throw error;
  }
}
