import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import type {
  CompanyContextState,
  VisibleCompany,
} from '../company/CompanyContextSelector';
import {
  createAuthenticatedApiClient,
  type ApiResult,
  type AuthenticatedApiClient,
} from '../api/authenticated-api-client';
import { createCompanyContextPreferenceStore } from './company-context-preference';
import {
  loadInitialCompanyContext,
  withoutActiveCompany,
  withoutCompany,
} from './company-context-session';

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

interface RequestOperation {
  generation: number;
  controller: AbortController;
}

const companyContextPreference = createCompanyContextPreferenceStore();

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
    setShellContext({ status: 'checking' });
    return invalidateCurrentGeneration;
  }, [identity]);

  async function rejectUnauthorized(
    result: ApiResult<unknown>,
    operation: RequestOperation,
  ): Promise<boolean> {
    if (result.status !== 'unauthorized') return false;
    await identity.rejectSession();
    if (isCurrent(operation)) setShellContext({ status: 'signed-out' });
    return true;
  }

  useEffect(() => {
    if (!identity.loaded || !identity.signedIn) return;
    const operation = beginOperation();
    void initialize(operation).catch((error: unknown) => {
      if (!isCurrent(operation) || isAbortError(error)) return;
      setShellContext({ status: 'error' });
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
        setShellContext({ status: 'forbidden' });
        return;
      }
      if (actorResult.status !== 'ok') {
        setShellContext({ status: 'error' });
        return;
      }

      const loaded = await loadInitialCompanyContext(
        api,
        companyContextPreference,
        actorResult.value,
        operation.controller.signal,
      );
      if (!isCurrent(operation)) return;
      if (loaded.status === 'unauthorized') {
        await rejectUnauthorized(loaded, operation);
        return;
      }
      if (loaded.preferenceAction?.type === 'write') {
        companyContextPreference.write(
          loaded.preferenceAction.actor,
          loaded.preferenceAction.companyId,
        );
      } else if (loaded.preferenceAction?.type === 'clear') {
        companyContextPreference.clear(loaded.preferenceAction.actor);
      }
      setShellContext({
        status: 'active',
        actor: loaded.actor,
        companyContext: loaded.companyContext,
        activityLog: { status: 'loading' },
        sessionGeneration: operation.generation,
      });
      await loadActivityLog(api, loaded.actor, operation);
    }
  }, [identity]);

  useEffect(() => {
    if (
      shellContext.status !== 'active' ||
      shellContext.companyContext.status !== 'ready'
    )
      return;
    if (
      shellContext.companyContext.recoveryMessage === 'stale' &&
      !shellContext.actor.activeCompany
    ) {
      companyContextPreference.clear(shellContext.actor);
      return;
    }
    const activeCompanyId = shellContext.actor.activeCompany?.id;
    if (
      activeCompanyId &&
      shellContext.companyContext.companies.some(
        ({ id }) => id === activeCompanyId,
      )
    )
      companyContextPreference.write(shellContext.actor, activeCompanyId);
  }, [shellContext]);

  async function loadActivityLog(
    api: AuthenticatedApiClient,
    actor: ActorContext,
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
      const rejectedCompanyId = actor.activeCompany.id;
      companyContextPreference.clear(actor);
      setShellContext((current) => {
        if (
          current.status !== 'active' ||
          current.companyContext.status !== 'ready' ||
          current.actor.activeCompany?.id !== rejectedCompanyId
        )
          return current;
        return {
          ...current,
          actor: withoutActiveCompany(current.actor),
          companyContext: {
            ...current.companyContext,
            companies: withoutCompany(
              current.companyContext.companies,
              rejectedCompanyId,
            ),
            selecting: false,
            recoveryMessage: 'stale',
          },
          activityLog: { status: 'error' },
        };
      });
      return;
    }
    if (result.status === 'forbidden') {
      setShellContext({ status: 'forbidden' });
      return;
    }
    const activityLog: ActivityLogState =
      result.status === 'ok'
        ? { status: 'ready', events: result.value.events }
        : { status: 'error' };
    setShellContext((current) =>
      current.status === 'active' &&
      matchesActivityActorContext(current.actor, actor)
        ? { ...current, activityLog }
        : current,
    );
  }

  async function selectCompany(companyId: string): Promise<void> {
    if (
      shellContext.status !== 'active' ||
      shellContext.companyContext.status !== 'ready'
    )
      return;
    const snapshot = {
      status: 'active' as const,
      actor: shellContext.actor,
      activityLog: shellContext.activityLog,
      companyContext: shellContext.companyContext,
      sessionGeneration: shellContext.sessionGeneration,
    };
    const operation = beginOperation();
    setShellContext({
      ...snapshot,
      companyContext: { ...snapshot.companyContext, selecting: true },
    });

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
        companyContextPreference.clear(snapshot.actor);
        setShellContext((current) => {
          if (
            current.status !== 'active' ||
            current.companyContext.status !== 'ready' ||
            current.sessionGeneration !== snapshot.sessionGeneration
          )
            return current;
          return {
            status: 'active',
            actor: withoutActiveCompany(current.actor),
            activityLog: current.activityLog,
            sessionGeneration: current.sessionGeneration,
            companyContext: {
              status: 'ready',
              companies: withoutCompany(
                current.companyContext.companies,
                companyId,
              ),
              selecting: false,
              recoveryMessage: 'selection-failed',
            },
          };
        });
        return;
      }
      if (selectedResult.status !== 'ok') {
        setShellContext((current) =>
          failCurrentCompanySelection(
            current,
            snapshot.sessionGeneration,
            companyId,
          ),
        );
        return;
      }

      const actor = selectedResult.value;
      const companyContext: CompanyContextState = {
        status: 'ready',
        companies: snapshot.companyContext.companies,
        selecting: false,
      };
      setShellContext((current) => {
        if (
          current.status !== 'active' ||
          current.companyContext.status !== 'ready' ||
          current.sessionGeneration !== snapshot.sessionGeneration ||
          !current.companyContext.companies.some(({ id }) => id === companyId)
        )
          return current;
        return {
          status: 'active',
          actor,
          sessionGeneration: snapshot.sessionGeneration,
          companyContext: {
            ...companyContext,
            companies: current.companyContext.companies,
          },
          activityLog: { status: 'loading' },
        };
      });
      await loadActivityLog(api, actor, operation);
    } catch (error: unknown) {
      if (!isCurrent(operation) || isAbortError(error)) return;
      setShellContext((current) =>
        failCurrentCompanySelection(
          current,
          snapshot.sessionGeneration,
          companyId,
        ),
      );
    }
  }

  function rejectCompanyContext(rejectedCompanyId: string): void {
    const origin = registrationCallbackOrigin(shellContext);
    setShellContext((current) => {
      if (
        !matchesRegistrationCallbackOrigin(current, origin) ||
        current.status !== 'active' ||
        current.companyContext.status !== 'ready' ||
        current.actor.activeCompany?.id !== rejectedCompanyId
      )
        return current;
      return {
        ...current,
        actor: withoutActiveCompany(current.actor),
        companyContext: {
          ...current.companyContext,
          companies: withoutCompany(
            current.companyContext.companies,
            rejectedCompanyId,
          ),
          selecting: false,
          recoveryMessage: 'stale',
        },
      };
    });
  }

  function includeCompany(company: VisibleCompany): void {
    const origin = registrationCallbackOrigin(shellContext);
    setShellContext((current) => {
      if (
        !matchesRegistrationCallbackOrigin(current, origin) ||
        current.status !== 'active' ||
        current.companyContext.status !== 'ready'
      )
        return current;
      const companies = [
        ...current.companyContext.companies.filter(
          ({ id }) => id !== company.id,
        ),
        company,
      ].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      );
      return {
        ...current,
        companyContext: { ...current.companyContext, companies },
      };
    });
  }

  return {
    shellContext,
    selectCompany,
    rejectCompanyContext,
    includeCompany,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

interface RegistrationCallbackOrigin {
  activeCompanyId: string | undefined;
  internalUserId: string;
  workspaceId: string;
  workspaceMembershipId: string;
  sessionGeneration: number;
}

function registrationCallbackOrigin(
  context: ProductionShellContext,
): RegistrationCallbackOrigin | undefined {
  if (context.status !== 'active') return undefined;
  return {
    activeCompanyId: context.actor.activeCompany?.id,
    internalUserId: context.actor.internalUserId,
    workspaceId: context.actor.workspaceId,
    workspaceMembershipId: context.actor.workspaceMembershipId,
    sessionGeneration: context.sessionGeneration,
  };
}

function matchesRegistrationCallbackOrigin(
  context: ProductionShellContext,
  origin: RegistrationCallbackOrigin | undefined,
): context is Extract<ProductionShellContext, { status: 'active' }> {
  return (
    origin !== undefined &&
    context.status === 'active' &&
    context.actor.activeCompany?.id === origin.activeCompanyId &&
    context.actor.internalUserId === origin.internalUserId &&
    context.actor.workspaceId === origin.workspaceId &&
    context.actor.workspaceMembershipId === origin.workspaceMembershipId &&
    context.sessionGeneration === origin.sessionGeneration
  );
}

function matchesActivityActorContext(
  current: ActorContext,
  requested: ActorContext,
): boolean {
  return (
    current.internalUserId === requested.internalUserId &&
    current.workspaceId === requested.workspaceId &&
    current.workspaceMembershipId === requested.workspaceMembershipId &&
    current.activeCompany?.id === requested.activeCompany?.id
  );
}

function failCurrentCompanySelection(
  current: ProductionShellContext,
  sessionGeneration: number,
  requestedCompanyId: string,
): ProductionShellContext {
  if (
    current.status !== 'active' ||
    current.companyContext.status !== 'ready' ||
    current.sessionGeneration !== sessionGeneration ||
    !current.companyContext.selecting ||
    !current.companyContext.companies.some(
      ({ id }) => id === requestedCompanyId,
    )
  )
    return current;
  return { ...current, companyContext: { status: 'error' } };
}
