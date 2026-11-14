import type { BrowserIdentity } from '../access-composition';
import { readCurrentActor } from '../access/current-actor';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { readVisibleCompanies } from '../company/company-response';
import { activityLogPageResponse } from './activity-log-response';
import type { ProductionShellTransport } from './production-shell-session';

export async function createAuthenticatedProductionShellTransport(
  identity: BrowserIdentity,
): Promise<ProductionShellTransport> {
  const api = await createAuthenticatedApiClient(identity);
  return {
    loadActor: ({ companyId, signal }) =>
      readCurrentActor({
        api,
        companyContextId: companyId,
        signal,
      }),
    loadCompanies: async ({ signal }) => {
      const result = await api.request('/companies', {
        signal,
      });
      if (result.status !== 'ok') return result;
      try {
        return { status: 'ok', value: readVisibleCompanies(result.value) };
      } catch {
        return { status: 'error' };
      }
    },
    loadActivityLog: async ({ companyId, signal }) => {
      const result = await api.request('/activity-log', {
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
