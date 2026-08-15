import type { ActorContext } from '../access-types';
import type {
  CompanyContextState,
  VisibleCompany,
} from '../company/CompanyContextSelector';
import type { AuthenticatedApiClient } from '../api/authenticated-api-client';
import type { CompanyContextPreferenceStore } from './company-context-preference';

export type InitialCompanyContextResult =
  | {
      status: 'ok';
      actor: ActorContext;
      companyContext: CompanyContextState;
      preferenceAction?:
        | { type: 'write'; actor: ActorContext; companyId: string }
        | { type: 'clear'; actor: ActorContext };
    }
  | { status: 'unauthorized' };

export async function loadInitialCompanyContext(
  api: AuthenticatedApiClient,
  preference: CompanyContextPreferenceStore,
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
      companyContext: { status: 'ready', companies, selecting: false },
    };
  }

  const selectedResult = await api.request<ActorContext>(
    '/access/current-actor',
    { companyContextId: requestedCompanyId, signal },
  );
  if (selectedResult.status === 'unauthorized')
    return { status: 'unauthorized' };
  if (selectedResult.status === 'forbidden') {
    companies = withoutCompany(companies, requestedCompanyId);
    return {
      status: 'ok',
      actor: baseActor,
      preferenceAction: { type: 'clear', actor: baseActor },
      companyContext: {
        status: 'ready',
        companies,
        selecting: false,
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
    preferenceAction: {
      type: 'write',
      actor: selectedResult.value,
      companyId: requestedCompanyId,
    },
    companyContext: { status: 'ready', companies, selecting: false },
  };
}

export function withoutCompany(
  companies: VisibleCompany[],
  rejectedCompanyId: string | undefined,
): VisibleCompany[] {
  return rejectedCompanyId
    ? companies.filter((company) => company.id !== rejectedCompanyId)
    : companies;
}

export function withoutActiveCompany(actor: ActorContext): ActorContext {
  const workspaceActor = { ...actor };
  delete workspaceActor.activeCompany;
  return workspaceActor;
}
