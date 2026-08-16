import { describe, expect, it } from 'vitest';
import type { ActorContext } from '../access-types';
import {
  captureCompanyContextOrigin,
  transitionCompanyContext,
  type ProductionShellContext,
} from './company-context-transitions';

const actor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'Workspace',
  displayName: 'Ada',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: ['company.manage'],
};

describe('Company context transitions', () => {
  it.each([
    { cardinality: 'zero', companies: [] },
    {
      cardinality: 'one',
      companies: [{ id: 'company-a', displayName: 'Company A' }],
    },
    {
      cardinality: 'many',
      companies: [
        { id: 'company-a', displayName: 'Company A' },
        { id: 'company-b', displayName: 'Company B' },
      ],
    },
  ] as const)(
    'represents $cardinality available Companies explicitly',
    ({ companies, cardinality }) => {
      const current: ProductionShellContext = { status: 'checking' };

      const next = transitionCompanyContext(current, {
        type: 'session-activated',
        actor,
        companyContext: { status: 'ready', companies: [...companies] },
        sessionGeneration: 1,
      });

      expect(next).toMatchObject({
        status: 'active',
        companyContext: { status: 'ready', cardinality, companies },
      });
    },
  );

  it('restores a server-validated Company when a refreshed session activates', () => {
    const restoredActor = selectedActor('company-a', 'Company A');

    const next = transitionCompanyContext(
      { status: 'checking' },
      {
        type: 'session-activated',
        actor: restoredActor,
        companyContext: {
          status: 'ready',
          companies: [{ id: 'company-a', displayName: 'Company A' }],
        },
        sessionGeneration: 3,
      },
    );

    expect(next).toMatchObject({
      status: 'active',
      actor: { activeCompany: { id: 'company-a' } },
      companyContext: {
        status: 'ready',
        cardinality: 'one',
        selection: { status: 'idle' },
      },
      activityLog: { status: 'loading' },
    });
  });

  it('moves selection from pending to confirmed and refreshes Activity Log', () => {
    const active = activate([
      { id: 'company-a', displayName: 'Company A' },
      { id: 'company-b', displayName: 'Company B' },
    ]);
    const origin = requiredOrigin(active);
    const selecting = transitionCompanyContext(active, {
      type: 'selection-started',
      origin,
      companyId: 'company-b',
    });

    expect(selecting).toMatchObject({
      status: 'active',
      companyContext: {
        selection: { status: 'pending', companyId: 'company-b' },
      },
    });

    const selected = transitionCompanyContext(selecting, {
      type: 'selection-confirmed',
      origin,
      companyId: 'company-b',
      actor: selectedActor('company-b', 'Company B'),
    });

    expect(selected).toMatchObject({
      status: 'active',
      actor: { activeCompany: { id: 'company-b' } },
      companyContext: { selection: { status: 'idle' } },
      activityLog: { status: 'loading' },
    });
  });

  it('recovers from stale Company denial without preserving denied activity', () => {
    const active = activate(
      [
        { id: 'company-a', displayName: 'Company A' },
        { id: 'company-b', displayName: 'Company B' },
      ],
      selectedActor('company-a', 'Company A'),
    );

    const next = transitionCompanyContext(active, {
      type: 'company-rejected',
      origin: requiredOrigin(active),
      companyId: 'company-a',
      activityLog: 'error',
    });

    expect(next).toMatchObject({
      status: 'active',
      companyContext: {
        status: 'ready',
        cardinality: 'one',
        companies: [{ id: 'company-b' }],
        recoveryMessage: 'stale',
      },
      activityLog: { status: 'error' },
    });
    if (next.status !== 'active') throw new Error('Expected active context');
    expect(next.actor.activeCompany).toBeUndefined();
  });

  it.each(['success', 'denial', 'failure'] as const)(
    'settles a rejected active Company selection before its later %s',
    (outcome) => {
      const active = activate(
        [
          { id: 'company-a', displayName: 'Company A' },
          { id: 'company-b', displayName: 'Company B' },
        ],
        selectedActor('company-a', 'Company A'),
      );
      const origin = requiredOrigin(active);
      const selecting = transitionCompanyContext(active, {
        type: 'selection-started',
        origin,
        companyId: 'company-a',
      });
      const rejected = transitionCompanyContext(selecting, {
        type: 'company-rejected',
        origin,
        companyId: 'company-a',
        activityLog: 'preserve',
      });

      expect(rejected).toMatchObject({
        status: 'active',
        companyContext: {
          companies: [{ id: 'company-b' }],
          selection: { status: 'idle' },
          recoveryMessage: 'stale',
        },
      });

      const settled = settleSelection(rejected, origin, outcome);
      expect(settled).toBe(rejected);
    },
  );

  it('keeps a pending newer Company selection after the active Company is rejected', () => {
    const { origin, rejected } = rejectCompanyAWhileSelectingCompanyB();

    expect(rejected).toMatchObject({
      status: 'active',
      companyContext: {
        companies: [{ id: 'company-b' }],
        selection: { status: 'pending', companyId: 'company-b' },
        recoveryMessage: 'stale',
      },
    });

    const selected = transitionCompanyContext(rejected, {
      type: 'selection-confirmed',
      origin,
      companyId: 'company-b',
      actor: selectedActor('company-b', 'Company B'),
    });

    expect(selected).toMatchObject({
      status: 'active',
      actor: { activeCompany: { id: 'company-b' } },
      companyContext: {
        companies: [{ id: 'company-b' }],
        selection: { status: 'idle' },
      },
    });
  });

  it('does not restore the rejected active Company when the pending selection fails', () => {
    const { origin, rejected } = rejectCompanyAWhileSelectingCompanyB();

    const failed = transitionCompanyContext(rejected, {
      type: 'selection-failed',
      origin,
      companyId: 'company-b',
    });

    expect(failed).toMatchObject({
      status: 'active',
      companyContext: {
        status: 'ready',
        companies: [{ id: 'company-b' }],
        selection: { status: 'idle' },
        recoveryMessage: 'stale',
      },
    });
    if (failed.status !== 'active') throw new Error('Expected active context');
    expect(failed.actor.activeCompany).toBeUndefined();
  });

  it('recovers a rejected active Company after a newer selection has failed', () => {
    const active = activate(
      [
        { id: 'company-a', displayName: 'Company A' },
        { id: 'company-b', displayName: 'Company B' },
      ],
      selectedActor('company-a', 'Company A'),
    );
    const origin = requiredOrigin(active);
    const selecting = transitionCompanyContext(active, {
      type: 'selection-started',
      origin,
      companyId: 'company-b',
    });
    const failed = transitionCompanyContext(selecting, {
      type: 'selection-failed',
      origin,
      companyId: 'company-b',
    });

    expect(failed).toMatchObject({
      status: 'active',
      actor: { activeCompany: { id: 'company-a' } },
      companyContext: { status: 'error' },
    });
    for (const staleOrigin of [
      { ...origin, internalUserId: 'user-2' },
      { ...origin, workspaceId: 'workspace-2' },
      { ...origin, workspaceMembershipId: 'membership-2' },
      { ...origin, sessionGeneration: origin.sessionGeneration - 1 },
    ]) {
      const stale = transitionCompanyContext(failed, {
        type: 'company-rejected',
        origin: staleOrigin,
        companyId: 'company-a',
        activityLog: 'preserve',
      });
      expect(stale).toBe(failed);
    }

    const rejected = transitionCompanyContext(failed, {
      type: 'company-rejected',
      origin,
      companyId: 'company-a',
      activityLog: 'preserve',
    });
    expect(rejected).toMatchObject({
      status: 'active',
      companyContext: {
        status: 'ready',
        companies: [{ id: 'company-b' }],
        selection: { status: 'idle' },
        recoveryMessage: 'stale',
      },
    });
    if (rejected.status !== 'active')
      throw new Error('Expected active context');
    expect(rejected.actor.activeCompany).toBeUndefined();
  });

  it('does not fabricate Company recovery from an initial load error', () => {
    const unavailable = transitionCompanyContext(
      { status: 'checking' },
      {
        type: 'session-activated',
        actor: selectedActor('company-a', 'Company A'),
        companyContext: { status: 'error' },
        sessionGeneration: 9,
      },
    );

    const rejected = transitionCompanyContext(unavailable, {
      type: 'company-rejected',
      origin: requiredOrigin(unavailable),
      companyId: 'company-a',
      activityLog: 'preserve',
    });

    expect(rejected).toBe(unavailable);
  });

  it('removes both denied Companies when the pending selection is denied', () => {
    const { origin, rejected } = rejectCompanyAWhileSelectingCompanyB();

    const denied = transitionCompanyContext(rejected, {
      type: 'selection-denied',
      origin,
      companyId: 'company-b',
    });

    expect(denied).toMatchObject({
      status: 'active',
      companyContext: {
        status: 'ready',
        cardinality: 'zero',
        companies: [],
        selection: { status: 'idle' },
        recoveryMessage: 'selection-failed',
      },
    });
    if (denied.status !== 'active') throw new Error('Expected active context');
    expect(denied.actor.activeCompany).toBeUndefined();
  });

  it('does not settle a pending selection for an older session generation', () => {
    const { origin, rejected } = rejectCompanyAWhileSelectingCompanyB();

    const stale = transitionCompanyContext(rejected, {
      type: 'selection-confirmed',
      origin: { ...origin, sessionGeneration: origin.sessionGeneration - 1 },
      companyId: 'company-b',
      actor: selectedActor('company-b', 'Company B'),
    });

    expect(stale).toBe(rejected);
  });

  it('does not let a stale Activity Log response cross a session generation', () => {
    const active = activate([]);
    const staleOrigin = { ...requiredOrigin(active), sessionGeneration: 8 };

    const next = transitionCompanyContext(active, {
      type: 'activity-resolved',
      origin: staleOrigin,
      activityLog: { status: 'ready', events: [] },
    });

    expect(next).toBe(active);
  });

  it('represents rejected authentication as an explicit sign-out transition', () => {
    const next = transitionCompanyContext(activate([]), {
      type: 'session-signed-out',
    });

    expect(next).toEqual({ status: 'signed-out' });
  });
});

function activate(
  companies: { id: string; displayName: string }[],
  activeActor: ActorContext = actor,
): ProductionShellContext {
  return transitionCompanyContext(
    { status: 'checking' },
    {
      type: 'session-activated',
      actor: activeActor,
      companyContext: { status: 'ready', companies },
      sessionGeneration: 9,
    },
  );
}

function requiredOrigin(context: ProductionShellContext) {
  const origin = captureCompanyContextOrigin(context);
  if (!origin) throw new Error('Expected an active Company context origin');
  return origin;
}

function selectedActor(id: string, displayName: string): ActorContext {
  return { ...actor, activeCompany: { id, displayName } };
}

function rejectCompanyAWhileSelectingCompanyB() {
  const active = activate(
    [
      { id: 'company-a', displayName: 'Company A' },
      { id: 'company-b', displayName: 'Company B' },
    ],
    selectedActor('company-a', 'Company A'),
  );
  const origin = requiredOrigin(active);
  const selecting = transitionCompanyContext(active, {
    type: 'selection-started',
    origin,
    companyId: 'company-b',
  });
  const rejected = transitionCompanyContext(selecting, {
    type: 'company-rejected',
    origin,
    companyId: 'company-a',
    activityLog: 'preserve',
  });
  return { origin, rejected };
}

function settleSelection(
  context: ProductionShellContext,
  origin: ReturnType<typeof requiredOrigin>,
  outcome: 'success' | 'denial' | 'failure',
): ProductionShellContext {
  if (outcome === 'success')
    return transitionCompanyContext(context, {
      type: 'selection-confirmed',
      origin,
      companyId: 'company-a',
      actor: selectedActor('company-a', 'Company A'),
    });
  return transitionCompanyContext(context, {
    type: outcome === 'denial' ? 'selection-denied' : 'selection-failed',
    origin,
    companyId: 'company-a',
  });
}
