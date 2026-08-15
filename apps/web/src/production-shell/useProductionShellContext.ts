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
  recoverRejectedCompanyContext,
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
  const shellContextRef = useRef(shellContext);
  useLayoutEffect(() => {
    shellContextRef.current = shellContext;
  }, [shellContext]);

  function beginOperation(): RequestOperation {
    operationRef.current?.controller.abort();
    const operation = {
      generation: ++generationRef.current,
      controller: new AbortController(),
    };
    operationRef.current = operation;
    return operation;
  }

  function cancelCurrentOperation(): void {
    operationRef.current?.controller.abort();
    operationRef.current = undefined;
    generationRef.current += 1;
  }

  function isCurrent(operation: RequestOperation): boolean {
    return operation.generation === generationRef.current;
  }

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
      });
      await loadActivityLog(api, loaded.actor, operation);
    }
  }, [identity]);

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
      current.status === 'active' ? { ...current, activityLog } : current,
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
      if (selectedResult.status === 'forbidden') {
        companyContextPreference.clear(snapshot.actor);
        setShellContext((current) => {
          let latestActor = snapshot.actor;
          let latestActivityLog = snapshot.activityLog;
          let latestCompanies = snapshot.companyContext.companies;
          if (
            current.status === 'active' &&
            current.companyContext.status === 'ready'
          ) {
            latestActor = current.actor;
            latestActivityLog = current.activityLog;
            latestCompanies = current.companyContext.companies;
          }
          return {
            status: 'active',
            actor: withoutActiveCompany(latestActor),
            activityLog: latestActivityLog,
            companyContext: {
              status: 'ready',
              companies: withoutCompany(latestCompanies, companyId),
              selecting: false,
              recoveryMessage: 'selection-failed',
            },
          };
        });
        return;
      }
      if (selectedResult.status !== 'ok') {
        setShellContext({
          ...snapshot,
          companyContext: { status: 'error' },
        });
        return;
      }

      const actor = selectedResult.value;
      const companyContext: CompanyContextState = {
        status: 'ready',
        companies: snapshot.companyContext.companies,
        selecting: false,
      };
      companyContextPreference.write(actor, companyId);
      setShellContext((current) => ({
        status: 'active',
        actor,
        companyContext: {
          ...companyContext,
          companies:
            current.status === 'active' &&
            current.companyContext.status === 'ready'
              ? current.companyContext.companies
              : companyContext.companies,
        },
        activityLog: { status: 'loading' },
      }));
      await loadActivityLog(api, actor, operation);
    } catch (error: unknown) {
      if (!isCurrent(operation) || isAbortError(error)) return;
      setShellContext({ ...snapshot, companyContext: { status: 'error' } });
    }
  }

  function rejectCompanyContext(rejectedCompanyId: string): void {
    const current = shellContextRef.current;
    if (
      current.status !== 'active' ||
      current.companyContext.status !== 'ready' ||
      current.actor.activeCompany?.id !== rejectedCompanyId
    )
      return;
    cancelCurrentOperation();
    const recovery = recoverRejectedCompanyContext(
      companyContextPreference,
      current.actor,
      current.companyContext,
    );
    setShellContext({
      status: 'active',
      ...recovery,
      activityLog: current.activityLog,
    });
  }

  function includeCompany(company: VisibleCompany): void {
    setShellContext((current) => {
      if (
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
