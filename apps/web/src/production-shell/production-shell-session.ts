import type { ActorContext } from '../access-types';
import type { ApiResult } from '../api/authenticated-api-client';
import { createCompanyContextPreferenceStore } from './company-context-preference';
import {
  captureCompanyContextOrigin,
  transitionCompanyContext,
  type ActivityLogPageResponse,
  type CompanyContextOrigin,
  type LoadedCompanyContext,
  type ProductionShellContext,
  type VisibleCompany,
} from './company-context-transitions';

interface ActorRequest {
  readonly companyId?: string;
  readonly signal: AbortSignal;
}

interface ActivityLogRequest {
  readonly companyId?: string;
  readonly signal: AbortSignal;
}

export interface ProductionShellTransport {
  loadActor(request: ActorRequest): Promise<ApiResult<ActorContext>>;
  loadCompanies(request: {
    readonly signal: AbortSignal;
  }): Promise<ApiResult<VisibleCompany[]>>;
  loadActivityLog(
    request: ActivityLogRequest,
  ): Promise<ApiResult<ActivityLogPageResponse>>;
}

export interface ProductionShellSessionSnapshot {
  readonly shellContext: ProductionShellContext;
  readonly selectCompany: (companyId: string) => Promise<void>;
  readonly refreshActivityLog: () => Promise<void>;
  readonly acceptRevalidatedActor: (actor: ActorContext) => Promise<void>;
  readonly rejectCompanyContext: (companyId: string) => void;
  readonly rejectCompanyContextAndRefreshActivity: (
    companyId: string,
  ) => Promise<void>;
  readonly rejectWorkspaceAccess: () => void;
  readonly includeCompany: (company: VisibleCompany) => void;
}

export interface ProductionShellSession {
  getSnapshot(): ProductionShellSessionSnapshot;
  subscribe(listener: () => void): () => void;
}

interface CreateProductionShellSessionOptions {
  readonly createTransport: () => Promise<ProductionShellTransport>;
  readonly rejectSession: () => Promise<void>;
  readonly shouldInitialize: boolean;
}

interface RequestOperation {
  readonly generation: number;
  readonly controller: AbortController;
}

type InitialCompanyContextResult =
  | {
      status: 'ok';
      actor: ActorContext;
      companyContext: LoadedCompanyContext;
    }
  | { status: 'unauthorized' };

export function createProductionShellSession({
  createTransport,
  rejectSession,
  shouldInitialize,
}: CreateProductionShellSessionOptions): ProductionShellSession {
  const preference = createCompanyContextPreferenceStore();
  const listeners = new Set<() => void>();
  let shellContext: ProductionShellContext = { status: 'checking' };
  let snapshot = createSnapshot(shellContext);
  let operation: RequestOperation | undefined;
  let activityOperation: RequestOperation | undefined;
  let generation = 0;
  let connected = false;

  function createSnapshot(
    context: ProductionShellContext,
  ): ProductionShellSessionSnapshot {
    const origin = captureCompanyContextOrigin(context);
    return {
      shellContext: context,
      selectCompany: (companyId) => selectCompany(context, origin, companyId),
      refreshActivityLog: () => refreshActivityLog(context, origin),
      acceptRevalidatedActor: (actor) =>
        acceptRevalidatedActor(context, origin, actor),
      rejectCompanyContext: (companyId) => {
        if (!connected || !origin) return;
        dispatch({
          type: 'company-rejected',
          origin,
          companyId,
          activityLog: 'preserve',
        });
      },
      rejectCompanyContextAndRefreshActivity: async (companyId) => {
        if (!connected || !origin) return;
        const previousContext = shellContext;
        dispatch({
          type: 'company-rejected',
          origin,
          companyId,
          activityLog: 'loading',
        });
        if (shellContext === previousContext) return;
        await snapshot.refreshActivityLog();
      },
      rejectWorkspaceAccess: () => {
        if (!connected || !origin || context.status !== 'active') return;
        dispatch({ type: 'access-forbidden' });
      },
      includeCompany: (company) => {
        if (!connected || !origin) return;
        dispatch({ type: 'company-included', origin, company });
      },
    };
  }

  function dispatch(
    transition: Parameters<typeof transitionCompanyContext>[1],
  ): void {
    const next = transitionCompanyContext(shellContext, transition);
    if (next === shellContext) return;
    shellContext = next;
    snapshot = createSnapshot(shellContext);
    synchronizeCompanyContextPreference(shellContext);
    for (const listener of listeners) listener();
  }

  function beginOperation(): RequestOperation {
    operation?.controller.abort();
    activityOperation?.controller.abort();
    activityOperation = undefined;
    operation = {
      generation: ++generation,
      controller: new AbortController(),
    };
    return operation;
  }

  function disconnect(): void {
    operation?.controller.abort();
    activityOperation?.controller.abort();
    operation = undefined;
    activityOperation = undefined;
    generation += 1;
    connected = false;
  }

  function isCurrent(candidate: RequestOperation): boolean {
    return (
      connected &&
      !candidate.controller.signal.aborted &&
      candidate.generation === generation
    );
  }

  function beginActivityOperation(): RequestOperation {
    activityOperation?.controller.abort();
    activityOperation = {
      generation,
      controller: new AbortController(),
    };
    return activityOperation;
  }

  function matchesCurrentOrigin(origin: CompanyContextOrigin): boolean {
    const currentOrigin = captureCompanyContextOrigin(shellContext);
    return (
      currentOrigin !== undefined &&
      currentOrigin.activeCompanyId === origin.activeCompanyId &&
      currentOrigin.internalUserId === origin.internalUserId &&
      currentOrigin.workspaceId === origin.workspaceId &&
      currentOrigin.workspaceMembershipId === origin.workspaceMembershipId &&
      currentOrigin.sessionGeneration === origin.sessionGeneration
    );
  }

  async function rejectUnauthorized(
    result: ApiResult<unknown>,
    candidate: RequestOperation,
  ): Promise<boolean> {
    if (result.status !== 'unauthorized') return false;
    await rejectSession();
    if (isCurrent(candidate)) dispatch({ type: 'session-signed-out' });
    return true;
  }

  async function rejectRevokedWorkspaceAccess(
    transport: ProductionShellTransport,
    candidate: RequestOperation,
  ): Promise<boolean> {
    const workspaceActor = await transport.loadActor({
      signal: candidate.controller.signal,
    });
    if (!isCurrent(candidate)) return true;
    if (await rejectUnauthorized(workspaceActor, candidate)) return true;
    if (!isCurrent(candidate)) return true;
    if (workspaceActor.status !== 'forbidden') return false;
    dispatch({ type: 'access-forbidden' });
    return true;
  }

  async function loadActivityLog(
    transport: ProductionShellTransport,
    actor: ActorContext,
    origin: CompanyContextOrigin,
    candidate: RequestOperation,
  ): Promise<void> {
    const result = await transport.loadActivityLog({
      companyId: actor.activeCompany?.id,
      signal: candidate.controller.signal,
    });
    if (!isCurrent(candidate)) return;
    if (await rejectUnauthorized(result, candidate)) return;
    if (!isCurrent(candidate)) return;
    if (result.status === 'forbidden') {
      if (await rejectRevokedWorkspaceAccess(transport, candidate)) return;
      if (!isCurrent(candidate)) return;
      if (actor.activeCompany) {
        dispatch({
          type: 'company-rejected',
          origin,
          companyId: actor.activeCompany.id,
          activityLog: 'error',
        });
      } else {
        dispatch({ type: 'access-forbidden' });
      }
      return;
    }
    dispatch({
      type: 'activity-resolved',
      origin,
      activityLog:
        result.status === 'ok'
          ? {
              status: 'ready',
              events: result.value.events,
              clientUnionOperations: result.value.clientUnionOperations ?? [],
            }
          : { status: 'error' },
    });
  }

  async function initialize(candidate: RequestOperation): Promise<void> {
    const transport = await createTransport();
    if (!isCurrent(candidate)) return;
    const actorResult = await transport.loadActor({
      signal: candidate.controller.signal,
    });
    if (!isCurrent(candidate)) return;
    if (await rejectUnauthorized(actorResult, candidate)) return;
    if (!isCurrent(candidate)) return;
    if (actorResult.status === 'forbidden') {
      dispatch({ type: 'access-forbidden' });
      return;
    }
    if (actorResult.status !== 'ok') {
      dispatch({ type: 'access-failed' });
      return;
    }

    const loaded = await loadInitialCompanyContext(
      transport,
      actorResult.value,
      candidate.controller.signal,
    );
    if (!isCurrent(candidate)) return;
    if (loaded.status === 'unauthorized') {
      await rejectUnauthorized(loaded, candidate);
      return;
    }
    dispatch({
      type: 'session-activated',
      actor: loaded.actor,
      companyContext: loaded.companyContext,
      sessionGeneration: candidate.generation,
    });
    await loadActivityLog(
      transport,
      loaded.actor,
      originFor(loaded.actor, candidate.generation),
      beginActivityOperation(),
    );
  }

  async function selectCompany(
    capturedContext: ProductionShellContext,
    origin: CompanyContextOrigin | undefined,
    companyId: string,
  ): Promise<void> {
    if (
      !connected ||
      !origin ||
      !matchesCurrentOrigin(origin) ||
      capturedContext.status !== 'active' ||
      capturedContext.companyContext.status !== 'ready'
    )
      return;
    const candidate = beginOperation();
    dispatch({ type: 'selection-started', origin, companyId });

    try {
      const transport = await createTransport();
      if (!isCurrent(candidate)) return;
      const selectedResult = await transport.loadActor({
        companyId,
        signal: candidate.controller.signal,
      });
      if (!isCurrent(candidate)) return;
      if (await rejectUnauthorized(selectedResult, candidate)) return;
      if (!isCurrent(candidate)) return;
      if (selectedResult.status === 'forbidden') {
        if (await rejectRevokedWorkspaceAccess(transport, candidate)) return;
        if (!isCurrent(candidate)) return;
        dispatch({ type: 'selection-denied', origin, companyId });
        return;
      }
      if (selectedResult.status !== 'ok') {
        dispatch({ type: 'selection-failed', origin, companyId });
        return;
      }

      const actor = selectedResult.value;
      dispatch({
        type: 'selection-confirmed',
        origin,
        companyId,
        actor,
      });
      await loadActivityLog(
        transport,
        actor,
        originFor(actor, origin.sessionGeneration),
        beginActivityOperation(),
      );
    } catch (error: unknown) {
      if (!isCurrent(candidate) || isAbortError(error)) return;
      dispatch({ type: 'selection-failed', origin, companyId });
    }
  }

  async function refreshActivityLog(
    capturedContext: ProductionShellContext,
    origin: CompanyContextOrigin | undefined,
  ): Promise<void> {
    if (
      !connected ||
      !origin ||
      !matchesCurrentOrigin(origin) ||
      capturedContext.status !== 'active'
    )
      return;
    const candidate = beginActivityOperation();
    try {
      const transport = await createTransport();
      if (!isCurrent(candidate) || !matchesCurrentOrigin(origin)) return;
      await loadActivityLog(
        transport,
        capturedContext.actor,
        origin,
        candidate,
      );
    } catch (error: unknown) {
      if (
        !isCurrent(candidate) ||
        !matchesCurrentOrigin(origin) ||
        isAbortError(error)
      )
        return;
      dispatch({
        type: 'activity-resolved',
        origin,
        activityLog: { status: 'error' },
      });
    } finally {
      if (activityOperation === candidate) activityOperation = undefined;
    }
  }

  async function acceptRevalidatedActor(
    capturedContext: ProductionShellContext,
    origin: CompanyContextOrigin | undefined,
    actor: ActorContext,
  ): Promise<void> {
    if (
      !connected ||
      !origin ||
      !matchesCurrentOrigin(origin) ||
      capturedContext.status !== 'active'
    )
      return;
    dispatch({ type: 'actor-revalidated', origin, actor });
    if (
      shellContext.status !== 'active' ||
      shellContext.actor !== actor ||
      !matchesCurrentOrigin(origin)
    )
      return;
    const candidate = beginActivityOperation();
    try {
      const transport = await createTransport();
      if (!isCurrent(candidate) || !matchesCurrentOrigin(origin)) return;
      await loadActivityLog(transport, actor, origin, candidate);
    } catch (error: unknown) {
      if (
        !isCurrent(candidate) ||
        !matchesCurrentOrigin(origin) ||
        isAbortError(error)
      )
        return;
      dispatch({
        type: 'activity-resolved',
        origin,
        activityLog: { status: 'error' },
      });
    } finally {
      if (activityOperation === candidate) activityOperation = undefined;
    }
  }

  function connect(): void {
    if (connected) return;
    connected = true;
    dispatch({ type: 'identity-changed' });
    if (!shouldInitialize) return;
    const candidate = beginOperation();
    void initialize(candidate).catch((error: unknown) => {
      if (!isCurrent(candidate) || isAbortError(error)) return;
      dispatch({ type: 'access-failed' });
    });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      connect();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) disconnect();
      };
    },
  };

  async function loadInitialCompanyContext(
    transport: ProductionShellTransport,
    baseActor: ActorContext,
    signal: AbortSignal,
  ): Promise<InitialCompanyContextResult> {
    const companiesResult = await transport.loadCompanies({ signal });
    if (companiesResult.status === 'unauthorized')
      return { status: 'unauthorized' };
    if (companiesResult.status === 'forbidden') {
      return {
        status: 'ok',
        actor: baseActor,
        companyContext: { status: 'forbidden' },
      };
    }
    if (companiesResult.status !== 'ok') {
      return {
        status: 'ok',
        actor: baseActor,
        companyContext: { status: 'error' },
      };
    }

    let companies = companiesResult.value;
    const persistedCompanyId = preference.read(baseActor);
    const requestedCompanyId =
      persistedCompanyId ??
      (companies.length === 1 ? companies[0]?.id : undefined);
    if (!requestedCompanyId) {
      return {
        status: 'ok',
        actor: baseActor,
        companyContext: { status: 'ready', companies },
      };
    }

    const selectedResult = await transport.loadActor({
      companyId: requestedCompanyId,
      signal,
    });
    if (selectedResult.status === 'unauthorized')
      return { status: 'unauthorized' };
    if (selectedResult.status === 'forbidden') {
      companies = companies.filter(({ id }) => id !== requestedCompanyId);
      return {
        status: 'ok',
        actor: baseActor,
        companyContext: {
          status: 'ready',
          companies,
          recoveryMessage: persistedCompanyId ? 'stale' : 'selection-failed',
        },
      };
    }
    if (selectedResult.status !== 'ok') {
      return {
        status: 'ok',
        actor: baseActor,
        companyContext: { status: 'error' },
      };
    }
    return {
      status: 'ok',
      actor: selectedResult.value,
      companyContext: { status: 'ready', companies },
    };
  }

  function synchronizeCompanyContextPreference(
    context: ProductionShellContext,
  ): void {
    if (
      context.status !== 'active' ||
      context.companyContext.status !== 'ready'
    )
      return;
    const activeCompanyId = context.actor.activeCompany?.id;
    if (!activeCompanyId && context.companyContext.recoveryMessage) {
      preference.clear(context.actor);
      return;
    }
    if (
      activeCompanyId &&
      context.companyContext.companies.some(({ id }) => id === activeCompanyId)
    )
      preference.write(context.actor, activeCompanyId);
  }
}

function originFor(
  actor: ActorContext,
  sessionGeneration: number,
): CompanyContextOrigin {
  return {
    activeCompanyId: actor.activeCompany?.id,
    internalUserId: actor.internalUserId,
    workspaceId: actor.workspaceId,
    workspaceMembershipId: actor.workspaceMembershipId,
    sessionGeneration,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
