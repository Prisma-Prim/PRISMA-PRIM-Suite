import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { createAuthenticatedProductionShellTransport } from './authenticated-production-shell-transport';
import { createProductionShellSession } from './production-shell-session';
import {
  baseActor,
  browserIdentity,
  companies,
  selectedActor,
} from './production-shell-context.test-fixtures';
import { preferenceKey } from './company-context-preference';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());
it.each(
  (
    [
      'Actor',
      'Company rejection',
      'Workspace rejection',
      'Activity refresh',
      'Company inclusion',
      'Company selection',
    ] as const
  ).flatMap((effect) =>
    ['replacement', 'roundtrip'].map((mode) => ({ effect, mode })),
  ),
)(
  'retires the old public session $effect callback after a verified full Actor $mode',
  async ({ effect, mode }) => {
    localStorage.setItem(preferenceKey(baseActor), 'company-a');
    const original = selectedActor('company-a', 'Company A');
    let current = original,
      activityReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(input.toString(), window.location.origin).pathname;
        if (path.endsWith('/companies')) return Response.json(companies);
        if (path.endsWith('/activity-log')) {
          activityReads++;
          return Response.json({ events: [] });
        }
        if (path.endsWith('/access/current-actor')) {
          const companyId = new Headers(init?.headers).get(
            'x-company-context-id',
          );
          return Response.json(
            companyId
              ? companyId === 'company-a'
                ? current
                : selectedActor(companyId, 'Company B')
              : baseActor,
          );
        }
        throw new Error('Unexpected native HTTP boundary');
      }),
    );
    const identity = browserIdentity(),
      transport = await createAuthenticatedProductionShellTransport(identity),
      session = createProductionShellSession({
        createTransport: async () => transport,
        rejectSession: identity.rejectSession,
        shouldInitialize: true,
      }),
      unsubscribe = session.subscribe(() => undefined);
    try {
      await vi.waitFor(() =>
        expect(session.getSnapshot().shellContext).toMatchObject({
          status: 'active',
          actor: { activeCompany: { id: 'company-a' } },
          activityLog: { status: 'ready' },
        }),
      );
      const old = session.getSnapshot();
      const fresh: ActorContext = {
        ...original,
        activeCompany: {
          id: 'company-a',
          displayName: 'Company A',
          missionApplicabilityProposalPermissions: [
            'project.mission_applicability.propose',
          ],
          missionApplicabilityCoordinatorAssignmentId: 'fresh-coordinator-demo',
          missionApplicabilityCoordinatorPermissionSetVersion: 'v1',
        },
      };
      current = fresh;
      const parsed = await transport.loadActor({
        companyId: 'company-a',
        signal: new AbortController().signal,
      });
      if (parsed.status !== 'ok')
        throw new Error('Verified native Actor required');
      await old.acceptRevalidatedActor(parsed.value);
      if (mode === 'roundtrip') {
        current = original;
        const returned = await transport.loadActor({
          companyId: 'company-a',
          signal: new AbortController().signal,
        });
        if (returned.status !== 'ok')
          throw new Error('Verified returned Actor required');
        await session.getSnapshot().acceptRevalidatedActor(returned.value);
      }
      const before = session.getSnapshot().shellContext,
        readsBefore = activityReads;
      switch (effect) {
        case 'Actor':
          await old.acceptRevalidatedActor(original);
          break;
        case 'Company rejection':
          old.rejectCompanyContext('company-a');
          break;
        case 'Workspace rejection':
          old.rejectWorkspaceAccess();
          break;
        case 'Activity refresh':
          await old.refreshActivityLog();
          break;
        case 'Company inclusion':
          old.includeCompany({
            id: 'company-retired',
            displayName: 'Retired Company DEMO',
          });
          break;
        case 'Company selection':
          await old.selectCompany('company-b');
          break;
        default: {
          const exhaustive: never = effect;
          throw new Error(exhaustive);
        }
      }
      expect(session.getSnapshot().shellContext).toEqual(before);
      expect(activityReads).toBe(readsBefore);
    } finally {
      unsubscribe();
    }
  },
);
