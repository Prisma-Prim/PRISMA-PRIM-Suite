import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import type { ActivityLogPageResponse } from './company-context-transitions';
import type { ProductionShellTransport } from './production-shell-session';

export async function createAuthenticatedProductionShellTransport(
  identity: BrowserIdentity,
): Promise<ProductionShellTransport> {
  const api = await createAuthenticatedApiClient(identity);
  return {
    loadActor: ({ companyId, signal }) =>
      api.request<ActorContext>('/access/current-actor', {
        companyContextId: companyId,
        signal,
      }),
    loadCompanies: ({ signal }) =>
      api.request('/companies', {
        signal,
      }),
    loadActivityLog: ({ companyId, signal }) =>
      api.request<ActivityLogPageResponse>('/activity-log', {
        companyContextId: companyId,
        signal,
      }),
  };
}
