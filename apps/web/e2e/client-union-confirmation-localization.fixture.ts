import type { Page, Route } from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import type { UnionComparison } from '../src/client/client-union-contract';
import {
  confirmationActor,
  confirmationCompanies,
  confirmationFirst,
  confirmationCanonical,
  confirmationDossier,
  confirmationPair,
  confirmationSecond,
} from '../src/test/client-union-confirmation-localization.fixture';
import { operationalHomeFixture } from './actor-context.fixture';

type RouteReply = (route: Route) => Promise<void> | void;
type ConfirmationCommand = Readonly<{
  path: string;
  method: string;
  body: string | null;
  company: string | undefined;
  key: string | undefined;
}>;

export async function installConfirmationLocalizationFixture({
  page,
}: {
  page: Page;
}) {
  const state: {
    actor: ActorContext;
    comparison: UnionComparison;
    united: boolean;
    refreshFails: boolean;
    apiRequests: string[];
    unexpectedRequests: string[];
    clientReads: number;
    activityReads: number;
    reviewReads: number;
    dossierReads: string[];
    commands: ConfirmationCommand[];
    reviewReply: RouteReply | undefined;
    confirmReply: RouteReply | undefined;
  } = {
    actor: { ...confirmationActor },
    comparison: confirmationPair,
    united: false,
    refreshFails: false,
    apiRequests: [],
    unexpectedRequests: [],
    clientReads: 0,
    activityReads: 0,
    reviewReads: 0,
    dossierReads: [],
    commands: [],
    reviewReply: undefined,
    confirmReply: undefined,
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const company = request.headers()['x-company-context-id'];
    state.apiRequests.push(`${request.method()} ${path}${url.search}`);
    if (path === '/api/access/current-actor') {
      const selected = confirmationCompanies.find(({ id }) => id === company);
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
      return route.fulfill({ json: confirmationCompanies });
    if (path === '/api/operational-home')
      return route.fulfill({
        json: operationalHomeFixture(company ?? confirmationCompanies[0].id, {
          active_clients: state.united ? 1 : 2,
        }),
      });
    if (path === '/api/activity-log') {
      state.activityReads += 1;
      return state.united && state.refreshFails
        ? route.fulfill({ status: 503 })
        : route.fulfill({ json: { events: [] } });
    }
    if (path === '/api/client-duplicate-reviews')
      return route.fulfill({ json: { items: [], next_cursor: null } });
    if (path === '/api/clients') {
      state.clientReads += 1;
      return state.united && state.refreshFails
        ? route.fulfill({ status: 503 })
        : route.fulfill({
            json: (state.united
              ? [confirmationCanonical]
              : [confirmationFirst, confirmationSecond]
            ).map((client) => ({ ...client, relatedToActiveCompany: true })),
          });
    }
    if (
      path === `/api/clients/${confirmationFirst.id}/union-reviews` ||
      path === `/api/clients/${confirmationSecond.id}/union-reviews`
    ) {
      state.reviewReads += 1;
      return state.reviewReply
        ? state.reviewReply(route)
        : route.fulfill({ status: 201, json: state.comparison });
    }
    if (
      path ===
      `/api/client-union-reviews/${encodeURIComponent(state.comparison.reviewReference)}/confirm`
    ) {
      state.commands.push({
        path,
        method: request.method(),
        body: request.postData(),
        company,
        key: request.headers()['idempotency-key'],
      });
      if (state.confirmReply) return state.confirmReply(route);
      state.united = true;
      return route.fulfill({
        status: 201,
        json: {
          outcome: 'united',
          canonicalClientId: confirmationSecond.id,
          projectionReference: 'projection-716',
        },
      });
    }
    const clientId = [confirmationFirst.id, confirmationSecond.id].find(
      (id) => path === `/api/clients/${id}`,
    );
    const client = clientId
      ? confirmationDossier({ clientId, united: state.united })
      : undefined;
    if (client) {
      state.dossierReads.push(client.id);
      return route.fulfill({
        json: {
          ...client,
          relatedToActiveCompany: true,
          involvedCompanyDisplayNames: confirmationCompanies.map(
            ({ displayName }) => displayName,
          ),
        },
      });
    }
    const legalClientId = [confirmationFirst.id, confirmationSecond.id].find(
      (id) => path === `/api/clients/${id}/legal-entities`,
    );
    const legalDossier = legalClientId
      ? confirmationDossier({ clientId: legalClientId, united: state.united })
      : undefined;
    if (legalDossier)
      return route.fulfill({
        json: { clientVersion: legalDossier.version, legalEntities: [] },
      });
    state.unexpectedRequests.push(`${request.method()} ${path}${url.search}`);
    return route.fulfill({ status: 404 });
  });
  return state;
}
