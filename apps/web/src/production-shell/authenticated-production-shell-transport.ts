import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { activityLogPageResponse } from './activity-log-response';
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
    loadActivityLog: async ({ companyId, signal }) => {
      const result = await api.request<unknown>('/activity-log', {
        companyContextId: companyId,
        signal,
      });
      if (result.status !== 'ok') return result;
      // An unproved successful page fails closed like any unreadable reply.
      try {
        return { status: 'ok', value: activityLogPageResponse(result.value) };
      } catch {
        return { status: 'error' };
      }
    },
  };
}
