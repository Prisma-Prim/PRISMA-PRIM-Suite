import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  createAuthenticatedApiClient,
  type ApiResult,
  type AuthenticatedApiClient,
} from '../api/authenticated-api-client';
import {
  captureCompanyContextOrigin,
  transitionCompanyContext,
  type ActivityLogEvent,
  type CompanyContextOrigin,
  type CompanyContextTransition,
  type ProductionShellContext,
  type VisibleCompany,
} from './company-context-transitions';
import {
  loadInitialCompanyContext,
  synchronizeCompanyContextPreference,
} from './company-context-session';

export type {
  ActivityLogEvent,
  ActivityLogState,
  ProductionShellContext,
} from './company-context-transitions';

interface RequestOperation {
  generation: number;
  controller: AbortController;
}

export function useProductionShellContext(identity: BrowserIdentity): {
  shellContext: ProductionShellContext;
  selectCompany: (companyId: string) => Promise<void>;
  rejectCompanyContext: (rejectedCompanyId: string) => void;
  includeCompany: (company: VisibleCompany) => void;
} {
  const [shellContext, setShellContext] = useState<ProductionShellContext>({
    status: 'checking',
  });
  const operationRef = useRef<RequestOperation | undefined>(undefined);
  const generationRef = useRef(0);

  function dispatch(transition: CompanyContextTransition): void {
    setShellContext((current) => transitionCompanyContext(current, transition));
  }

  function beginOperation(): RequestOperation {
    operationRef.current?.controller.abort();
    const operation = {
      generation: ++generationRef.current,
      controller: new AbortController(),
    };
    operationRef.current = operation;
    return operation;
  }

  function invalidateCurrentGeneration(): void {
    operationRef.current?.controller.abort();
    operationRef.current = undefined;
    generationRef.current += 1;
  }

  function isCurrent(operation: RequestOperation): boolean {
    return operation.generation === generationRef.current;
  }

  useLayoutEffect(() => {
    invalidateCurrentGeneration();
    dispatch({ type: 'identity-changed' });
    return invalidateCurrentGeneration;
  }, [identity]);

  async function rejectUnauthorized(
    result: ApiResult<unknown>,
    operation: RequestOperation,
  ): Promise<boolean> {
    if (result.status !== 'unauthorized') return false;
    await identity.rejectSession();
    if (isCurrent(operation)) dispatch({ type: 'session-signed-out' });
    return true;
  }

  useEffect(() => {
    if (!identity.loaded || !identity.signedIn) return;
    const operation = beginOperation();
    void initialize(operation).catch((error: unknown) => {
      if (!isCurrent(operation) || isAbortError(error)) return;
      dispatch({ type: 'access-failed' });
    });
    return () => operation.controller.abort();

    async function initialize(operation: RequestOperation): Promise<void> {
      const api = await createAuthenticatedApiClient(identity);
      if (!isCurrent(operation)) return;
      const actorResult = await api.request<ActorContext>(
        '/access/current-actor',
        { signal: operation.controller.signal },
      );
      if (!isCurrent(operation)) return;
      if (await rejectUnauthorized(actorResult, operation)) return;
      if (!isCurrent(operation)) return;
      if (actorResult.status === 'forbidden') {
        dispatch({ type: 'access-forbidden' });
        return;
      }
      if (actorResult.status !== 'ok') {
        dispatch({ type: 'access-failed' });
        return;
      }

      const loaded = await loadInitialCompanyContext(
        api,
        actorResult.value,
        operation.controller.signal,
      );
      if (!isCurrent(operation)) return;
      if (loaded.status === 'unauthorized') {
        await rejectUnauthorized(loaded, operation);
        return;
      }
      dispatch({
        type: 'session-activated',
        actor: loaded.actor,
        companyContext: loaded.companyContext,
        sessionGeneration: operation.generation,
      });
      await loadActivityLog(
        api,
        loaded.actor,
        originFor(loaded.actor, operation.generation),
        operation,
      );
    }
  }, [identity]);

  useEffect(
    () => synchronizeCompanyContextPreference(shellContext),
    [shellContext],
  );

  async function loadActivityLog(
    api: AuthenticatedApiClient,
    actor: ActorContext,
    origin: CompanyContextOrigin,
    operation: RequestOperation,
  ): Promise<void> {
    const result = await api.request<{ events: ActivityLogEvent[] }>(
      '/activity-log',
      {
        companyContextId: actor.activeCompany?.id,
        signal: operation.controller.signal,
      },
    );
    if (!isCurrent(operation)) return;
    if (await rejectUnauthorized(result, operation)) return;
    if (!isCurrent(operation)) return;
    if (result.status === 'forbidden' && actor.activeCompany) {
      dispatch({
        type: 'company-rejected',
        origin,
        companyId: actor.activeCompany.id,
        activityLog: 'error',
      });
      return;
    }
    if (result.status === 'forbidden') {
      dispatch({ type: 'access-forbidden' });
      return;
    }
    dispatch({
      type: 'activity-resolved',
      origin,
      activityLog:
        result.status === 'ok'
          ? { status: 'ready', events: result.value.events }
          : { status: 'error' },
    });
  }

  async function selectCompany(companyId: string): Promise<void> {
    if (
      shellContext.status !== 'active' ||
      shellContext.companyContext.status !== 'ready'
    )
      return;
    const origin = captureCompanyContextOrigin(shellContext);
    if (!origin) return;
    const operation = beginOperation();
    dispatch({ type: 'selection-started', origin, companyId });

    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!isCurrent(operation)) return;
      const selectedResult = await api.request<ActorContext>(
        '/access/current-actor',
        {
          companyContextId: companyId,
          signal: operation.controller.signal,
        },
      );
      if (!isCurrent(operation)) return;
      if (await rejectUnauthorized(selectedResult, operation)) return;
      if (!isCurrent(operation)) return;
      if (selectedResult.status === 'forbidden') {
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
        api,
        actor,
        originFor(actor, origin.sessionGeneration),
        operation,
      );
    } catch (error: unknown) {
      if (!isCurrent(operation) || isAbortError(error)) return;
      dispatch({ type: 'selection-failed', origin, companyId });
    }
  }

  function rejectCompanyContext(rejectedCompanyId: string): void {
    const origin = captureCompanyContextOrigin(shellContext);
    if (!origin) return;
    dispatch({
      type: 'company-rejected',
      origin,
      companyId: rejectedCompanyId,
      activityLog: 'preserve',
    });
  }

  function includeCompany(company: VisibleCompany): void {
    const origin = captureCompanyContextOrigin(shellContext);
    if (!origin) return;
    dispatch({ type: 'company-included', origin, company });
  }

  return {
    shellContext,
    selectCompany,
    rejectCompanyContext,
    includeCompany,
  };
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
