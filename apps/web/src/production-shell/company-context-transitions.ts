import type { ActorContext } from '../access-types';

export interface VisibleCompany {
  id: string;
  displayName: string;
}

interface ReadyCompanyContextState {
  status: 'ready';
  selection: { status: 'idle' } | { status: 'pending'; companyId: string };
  recoveryMessage?: 'stale' | 'selection-failed';
}

export type CompanyContextState =
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'error' }
  | (ReadyCompanyContextState & { cardinality: 'zero'; companies: [] })
  | (ReadyCompanyContextState & {
      cardinality: 'one';
      companies: [VisibleCompany];
    })
  | (ReadyCompanyContextState & {
      cardinality: 'many';
      companies: [VisibleCompany, VisibleCompany, ...VisibleCompany[]];
    });

export interface ActivityLogEvent {
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

export type ActivityLogState =
  | { status: 'loading' }
  | { status: 'ready'; events: ActivityLogEvent[] }
  | { status: 'error' };

export type ProductionShellContext =
  | { status: 'checking' }
  | {
      status: 'active';
      actor: ActorContext;
      activityLog: ActivityLogState;
      companyContext: CompanyContextState;
      sessionGeneration: number;
    }
  | { status: 'signed-out' }
  | { status: 'forbidden' }
  | { status: 'error' };

export interface CompanyContextOrigin {
  activeCompanyId: string | undefined;
  internalUserId: string;
  workspaceId: string;
  workspaceMembershipId: string;
  sessionGeneration: number;
}

export type LoadedCompanyContext =
  | Exclude<CompanyContextState, { status: 'ready' }>
  | {
      status: 'ready';
      companies: VisibleCompany[];
      recoveryMessage?: 'stale' | 'selection-failed';
    };

export type CompanyContextTransition =
  | { type: 'identity-changed' }
  | { type: 'session-signed-out' }
  | { type: 'access-forbidden' }
  | { type: 'access-failed' }
  | {
      type: 'session-activated';
      actor: ActorContext;
      companyContext: LoadedCompanyContext;
      sessionGeneration: number;
    }
  | {
      type: 'selection-started';
      origin: CompanyContextOrigin;
      companyId: string;
    }
  | {
      type: 'selection-confirmed';
      origin: CompanyContextOrigin;
      companyId: string;
      actor: ActorContext;
    }
  | {
      type: 'selection-denied';
      origin: CompanyContextOrigin;
      companyId: string;
    }
  | {
      type: 'selection-failed';
      origin: CompanyContextOrigin;
      companyId: string;
    }
  | {
      type: 'company-rejected';
      origin: CompanyContextOrigin;
      companyId: string;
      activityLog: 'preserve' | 'error';
    }
  | {
      type: 'company-included';
      origin: CompanyContextOrigin;
      company: VisibleCompany;
    }
  | {
      type: 'activity-resolved';
      origin: CompanyContextOrigin;
      activityLog: ActivityLogState;
    };

export function transitionCompanyContext(
  current: ProductionShellContext,
  transition: CompanyContextTransition,
): ProductionShellContext {
  switch (transition.type) {
    case 'identity-changed':
      return { status: 'checking' };
    case 'session-signed-out':
      return { status: 'signed-out' };
    case 'access-forbidden':
      return { status: 'forbidden' };
    case 'access-failed':
      return { status: 'error' };
    case 'session-activated':
      return {
        status: 'active',
        actor: transition.actor,
        companyContext: normalizeLoadedCompanyContext(
          transition.companyContext,
        ),
        activityLog: { status: 'loading' },
        sessionGeneration: transition.sessionGeneration,
      };
    case 'selection-started': {
      if (
        !matchesReadyOrigin(current, transition.origin) ||
        !current.companyContext.companies.some(
          ({ id }) => id === transition.companyId,
        )
      )
        return current;
      return {
        ...current,
        companyContext: {
          ...current.companyContext,
          selection: { status: 'pending', companyId: transition.companyId },
        },
      };
    }
    case 'selection-confirmed': {
      if (
        !matchesPendingSelection(
          current,
          transition.origin,
          transition.companyId,
        ) ||
        !current.companyContext.companies.some(
          ({ id }) => id === transition.companyId,
        )
      )
        return current;
      return {
        ...current,
        actor: transition.actor,
        companyContext: readyCompanyContext(current.companyContext.companies),
        activityLog: { status: 'loading' },
      };
    }
    case 'selection-denied': {
      if (
        !matchesPendingSelection(
          current,
          transition.origin,
          transition.companyId,
        ) ||
        !current.companyContext.companies.some(
          ({ id }) => id === transition.companyId,
        )
      )
        return current;
      return {
        ...current,
        actor: withoutActiveCompany(current.actor),
        companyContext: readyCompanyContext(
          withoutCompany(
            current.companyContext.companies,
            transition.companyId,
          ),
          'selection-failed',
        ),
      };
    }
    case 'selection-failed': {
      if (
        !matchesPendingSelection(
          current,
          transition.origin,
          transition.companyId,
        ) ||
        !current.companyContext.companies.some(
          ({ id }) => id === transition.companyId,
        )
      )
        return current;
      if (
        transition.origin.activeCompanyId !== undefined &&
        current.actor.activeCompany === undefined &&
        current.companyContext.recoveryMessage === 'stale'
      )
        return {
          ...current,
          companyContext: readyCompanyContext(
            current.companyContext.companies,
            'stale',
          ),
        };
      return { ...current, companyContext: { status: 'error' } };
    }
    case 'company-rejected': {
      if (
        !matchesReadyOrigin(current, transition.origin) ||
        current.actor.activeCompany?.id !== transition.companyId
      )
        return current;
      const selection =
        current.companyContext.selection.status === 'pending' &&
        current.companyContext.selection.companyId === transition.companyId
          ? { status: 'idle' as const }
          : current.companyContext.selection;
      return {
        ...current,
        actor: withoutActiveCompany(current.actor),
        companyContext: readyCompanyContext(
          withoutCompany(
            current.companyContext.companies,
            transition.companyId,
          ),
          'stale',
          selection,
        ),
        activityLog:
          transition.activityLog === 'error'
            ? { status: 'error' }
            : current.activityLog,
      };
    }
    case 'company-included': {
      if (!matchesReadyOrigin(current, transition.origin)) return current;
      const companies = [
        ...current.companyContext.companies.filter(
          ({ id }) => id !== transition.company.id,
        ),
        transition.company,
      ].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      );
      return {
        ...current,
        companyContext: readyCompanyContext(
          companies,
          current.companyContext.recoveryMessage,
          current.companyContext.selection,
        ),
      };
    }
    case 'activity-resolved':
      if (!matchesOrigin(current, transition.origin)) return current;
      return { ...current, activityLog: transition.activityLog };
  }
}

export function captureCompanyContextOrigin(
  context: ProductionShellContext,
): CompanyContextOrigin | undefined {
  if (context.status !== 'active') return undefined;
  return {
    activeCompanyId: context.actor.activeCompany?.id,
    internalUserId: context.actor.internalUserId,
    workspaceId: context.actor.workspaceId,
    workspaceMembershipId: context.actor.workspaceMembershipId,
    sessionGeneration: context.sessionGeneration,
  };
}

function matchesReadyOrigin(
  context: ProductionShellContext,
  origin: CompanyContextOrigin,
): context is Extract<ProductionShellContext, { status: 'active' }> & {
  companyContext: Extract<CompanyContextState, { status: 'ready' }>;
} {
  return (
    context.status === 'active' &&
    context.companyContext.status === 'ready' &&
    matchesOrigin(context, origin)
  );
}

function matchesPendingSelection(
  context: ProductionShellContext,
  origin: CompanyContextOrigin,
  companyId: string,
): context is Extract<ProductionShellContext, { status: 'active' }> & {
  companyContext: Extract<CompanyContextState, { status: 'ready' }>;
} {
  if (
    context.status !== 'active' ||
    context.companyContext.status !== 'ready' ||
    context.companyContext.selection.status !== 'pending' ||
    context.companyContext.selection.companyId !== companyId ||
    !matchesSessionOrigin(context, origin)
  )
    return false;
  return (
    context.actor.activeCompany?.id === origin.activeCompanyId ||
    (origin.activeCompanyId !== undefined &&
      context.actor.activeCompany === undefined &&
      context.companyContext.recoveryMessage === 'stale')
  );
}

function matchesOrigin(
  context: ProductionShellContext,
  origin: CompanyContextOrigin,
): context is Extract<ProductionShellContext, { status: 'active' }> {
  return (
    context.status === 'active' &&
    context.actor.activeCompany?.id === origin.activeCompanyId &&
    matchesSessionOrigin(context, origin)
  );
}

function matchesSessionOrigin(
  context: Extract<ProductionShellContext, { status: 'active' }>,
  origin: CompanyContextOrigin,
): boolean {
  return (
    context.actor.internalUserId === origin.internalUserId &&
    context.actor.workspaceId === origin.workspaceId &&
    context.actor.workspaceMembershipId === origin.workspaceMembershipId &&
    context.sessionGeneration === origin.sessionGeneration
  );
}

function normalizeLoadedCompanyContext(
  state: LoadedCompanyContext,
): CompanyContextState {
  return state.status === 'ready'
    ? readyCompanyContext(state.companies, state.recoveryMessage)
    : state;
}

function readyCompanyContext(
  companies: VisibleCompany[],
  recoveryMessage?: 'stale' | 'selection-failed',
  selection: Extract<CompanyContextState, { status: 'ready' }>['selection'] = {
    status: 'idle',
  },
): Extract<CompanyContextState, { status: 'ready' }> {
  const shared = { status: 'ready' as const, selection, recoveryMessage };
  if (companies.length === 0)
    return { ...shared, cardinality: 'zero', companies: [] };
  if (companies.length === 1)
    return { ...shared, cardinality: 'one', companies: [companies[0]!] };
  return {
    ...shared,
    cardinality: 'many',
    companies: [companies[0]!, companies[1]!, ...companies.slice(2)],
  };
}

function withoutCompany(
  companies: VisibleCompany[],
  rejectedCompanyId: string,
): VisibleCompany[] {
  return companies.filter((company) => company.id !== rejectedCompanyId);
}

function withoutActiveCompany(actor: ActorContext): ActorContext {
  const workspaceActor = { ...actor };
  delete workspaceActor.activeCompany;
  return workspaceActor;
}
