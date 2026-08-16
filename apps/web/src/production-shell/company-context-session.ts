import type { ActorContext } from '../access-types';
import type { AuthenticatedApiClient } from '../api/authenticated-api-client';
import { createCompanyContextPreferenceStore } from './company-context-preference';
import type {
  LoadedCompanyContext,
  ProductionShellContext,
  VisibleCompany,
} from './company-context-transitions';

const preference = createCompanyContextPreferenceStore();

export type InitialCompanyContextResult =
  | {
      status: 'ok';
      actor: ActorContext;
      companyContext: LoadedCompanyContext;
    }
  | { status: 'unauthorized' };

export async function loadInitialCompanyContext(
  api: AuthenticatedApiClient,
  baseActor: ActorContext,
  signal: AbortSignal,
): Promise<InitialCompanyContextResult> {
  if (!baseActor.workspacePermissions.includes('company.manage')) {
    return {
      status: 'ok',
      actor: baseActor,
      companyContext: { status: 'forbidden' },
    };
  }
  const companiesResult = await api.request<VisibleCompany[]>('/companies', {
    signal,
  });
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

  const selectedResult = await api.request<ActorContext>(
    '/access/current-actor',
    { companyContextId: requestedCompanyId, signal },
  );
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

export function synchronizeCompanyContextPreference(
  context: ProductionShellContext,
): void {
  if (context.status !== 'active' || context.companyContext.status !== 'ready')
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
