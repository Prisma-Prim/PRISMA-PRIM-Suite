import type { Page, Route } from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import type { UnionDetail } from '../src/client/client-union-contract';
import {
  historyCompanies,
  historyDetail,
  historyEvents,
  historyFirst,
  historyProjection,
  historySecond,
  historySourceList,
} from '../src/test/client-union-history-localization.fixture';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';

type RouteReply = (route: Route) => Promise<void> | void;
type ReversalCommand = Readonly<{
  path: string;
  method: string;
  body: string | null;
  company: string | undefined;
  key: string | undefined;
}>;

export async function installHistoryLocalizationFixture({
  page,
}: {
  page: Page;
}) {
  const state: {
    actor: ActorContext;
    detail: UnionDetail;
    history: unknown;
    sources: unknown;
    reversed: boolean;
    refreshFails: boolean;
    apiReads: string[];
    clientReads: number;
    activityReads: number;
    detailReads: number;
    dossierReads: string[];
    commands: ReversalCommand[];
    detailReply: RouteReply | undefined;
    reverseReply: RouteReply | undefined;
  } = {
    actor: {
      ...actorContextFixture,
      workspacePermissions: ['client.manage'],
      activeCompany: {
        ...historyCompanies[0],
        clientPermissions: ['client.read', 'client.duplicate.resolve'],
        clientPermissionAssignmentId: 'resolver-assignment-712',
        clientPermissionSetVersion: 'v2',
      },
    },
    detail: historyDetail,
    history: historyEvents,
    sources: historySourceList,
    reversed: false,
    refreshFails: false,
    apiReads: [],
    clientReads: 0,
    activityReads: 0,
    detailReads: 0,
    dossierReads: [],
    commands: [],
    detailReply: undefined,
    reverseReply: undefined,
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const company = request.headers()['x-company-context-id'];
    state.apiReads.push(`${request.method()} ${path}`);
    if (path === '/api/access/current-actor') {
      const selected = historyCompanies.find(({ id }) => id === company);
      return route.fulfill({
        json:
          selected && state.actor.activeCompany
            ? {
                ...state.actor,
                activeCompany: { ...state.actor.activeCompany, ...selected },
              }
            : state.actor,
      });
    }
    if (path === '/api/companies')
      return route.fulfill({ json: historyCompanies });
    if (path === '/api/operational-home') {
      return route.fulfill({
        json: operationalHomeFixture(company ?? historyCompanies[0].id, {
          active_clients: 1,
        }),
      });
    }
    if (path === '/api/activity-log') {
      state.activityReads += 1;
      return state.reversed && state.refreshFails
        ? route.fulfill({ status: 503 })
        : route.fulfill({ json: { events: [] } });
    }
    if (path === '/api/clients') {
      state.clientReads += 1;
      return state.reversed && state.refreshFails
        ? route.fulfill({ status: 503 })
        : route.fulfill({
            json: (state.reversed
              ? [historyFirst, historySecond]
              : [historyFirst]
            ).map((client) => ({
              id: client.id,
              displayName: client.displayName,
              relatedToActiveCompany: true,
            })),
          });
    }
    if (path === '/api/client-duplicate-reviews') {
      return route.fulfill({ json: { items: [], next_cursor: null } });
    }
    if (path === '/api/client-union-sources')
      return route.fulfill({ json: state.sources });
    if (path === `/api/clients/${historySecond.id}/union-history`) {
      return route.fulfill({ json: state.history });
    }
    if (
      path ===
      `/api/client-union-operations/${encodeURIComponent(historyProjection)}`
    ) {
      state.detailReads += 1;
      return state.detailReply
        ? state.detailReply(route)
        : route.fulfill({
            json: {
              ...state.detail,
              operationId: 'PRIVATE operation',
              identityBasis: 'PRIVATE identity basis',
            },
          });
    }
    if (
      path ===
      `/api/client-union-operations/${encodeURIComponent(historyProjection)}/reversal`
    ) {
      state.commands.push({
        path,
        method: request.method(),
        body: request.postData(),
        company,
        key: request.headers()['idempotency-key'],
      });
      if (state.reverseReply) return state.reverseReply(route);
      state.reversed = true;
      return route.fulfill({
        status: 201,
        json: {
          outcome: 'reversed',
          clientIds: [historyFirst.id, historySecond.id],
        },
      });
    }
    const dossier = [historyFirst, historySecond].find(
      ({ id }) => path === `/api/clients/${id}`,
    );
    if (dossier) {
      state.dossierReads.push(dossier.id);
      return route.fulfill({
        json: {
          ...dossier,
          involvedCompanyDisplayNames: historyCompanies.map(
            ({ displayName }) => displayName,
          ),
        },
      });
    }
    if (path.endsWith('/legal-entities')) {
      return route.fulfill({
        json: { clientVersion: 1234, legalEntities: [] },
      });
    }
    if (path.endsWith('/correction-history')) {
      return route.fulfill({ json: { corrections: [], nextCursor: null } });
    }
    return route.fulfill({ status: 404 });
  });
  return state;
}
