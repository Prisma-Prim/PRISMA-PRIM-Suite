import type { Page } from '@playwright/test';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';
import {
  buildClientRequest,
  requestListItemFor,
} from '../src/test/commercial-intake-responses';
import {
  approvedTransmissionOffer,
  clientResponseRecord,
  literalSimulationNote,
  transmissionRecord,
  withClientResponse,
  withTransmission,
} from '../src/test/offer-transmission-response-fixture';
import type {
  OfferClientResponseView,
  OfferTransmissionView,
  OfferView,
} from '../src/offer/offer-response';

export const company707 = {
  id: '00000000-0000-4000-8000-000000000707',
  displayName: 'Synthetic Offer Company / Société / Компания',
};
export const requests707 = (['ACCEPTED', 'REJECTED', 'EXPIRED'] as const).map(
  (outcome) => ({
    outcome,
    request: buildClientRequest({
      id: `request-${outcome}`,
      companyId: company707.id,
      subject: `${outcome} {original} / Исходный`,
      clientAssociationStatus: 'visible',
      clientReference: {
        originalClientId: 'client-707',
        currentClientId: 'client-707',
        displayName: 'Client {original} / Клиент',
      },
      initialOpportunity: { id: `opportunity-${outcome}` },
    }),
  }),
);
export type Command707 = {
  path: string;
  body: string | null;
  key: string | undefined;
  companyId: string | undefined;
  method: string;
};
function gate() {
  let complete: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    release() {
      if (!complete) throw new Error('Missing HTTP gate.');
      complete();
    },
  };
}

export async function installTransmissionRoutes(
  page: Page,
  {
    readOnly = false,
    authorityLoss = false,
  }: { readOnly?: boolean; authorityLoss?: boolean } = {},
) {
  const offers = new Map<string, OfferView>();
  const initialOffers = new Map<string, OfferView>();
  const historicalOffers = new Map<string, OfferView>();
  for (const { outcome, request } of requests707) {
    const approved = approvedTransmissionOffer({
      offerId: `offer-${outcome}`,
      versionId: `version-${outcome}`,
      bindingVersion: outcome === 'REJECTED' ? 2 : 1,
    });
    const start =
      outcome === 'ACCEPTED' ? approved : withTransmission({ offer: approved });
    const offer: OfferView = {
      ...start,
      version: { ...start.version, validityElapsed: outcome === 'EXPIRED' },
    };
    const saved = withClientResponse({
      offer: withTransmission({ offer: approved }),
      outcome,
    });
    let initial = readOnly ? saved : offer;
    if (readOnly && outcome !== 'ACCEPTED') {
      const next = approvedTransmissionOffer({
        offerId: saved.id,
        versionId: `head-${outcome}`,
        bindingVersion: saved.version.qualityRuleSetVersion,
      });
      initial = {
        ...next,
        revision: saved.revision + 2,
        version: {
          ...next.version,
          versionNumber: 2,
          predecessorVersionId: saved.version.id,
        },
      };
      historicalOffers.set(request.initialOpportunity.id, {
        ...saved,
        revision: initial.revision,
        version: {
          ...saved.version,
          supersededByVersionId: next.version.id,
          supersededAt: '2026-10-28T09:00:00.000Z',
        },
      });
    }
    if (authorityLoss)
      initial = {
        ...initial,
        version: {
          ...initial.version,
          versionNumber: 2,
          predecessorVersionId: 'version-history',
        },
      };
    offers.set(request.initialOpportunity.id, initial);
    initialOffers.set(request.initialOpportunity.id, initial);
  }
  const receipts = new Map<
    string,
    {
      body: string | null;
      value: OfferTransmissionView | OfferClientResponseView;
    }
  >();
  const commands: Command707[] = [];
  const requests: string[] = [];
  const lateReplies: string[] = [];
  const transmissionGate = gate();
  const responseGates = new Map(
    requests707.map(({ outcome }) => [outcome, gate()]),
  );
  let retired = false;
  page.on('close', () => {
    transmissionGate.release();
    for (const pending of responseGates.values()) pending.release();
  });

  function actor(selected: boolean) {
    return {
      ...actorContextFixture,
      internalUserId: 'user-one',
      workspaceMembershipId: 'membership-one',
      workspacePermissions: [],
      ...(selected
        ? {
            activeCompany: {
              ...company707,
              clientPermissions: [],
              commercialIntakePermissionAssignmentId: 'intake-reader-707',
              commercialIntakePermissionSetVersion: 'v1',
              commercialIntakePermissions: [
                'commercial.request.read',
                'commercial.request.create',
                'commercial.opportunity.read',
                'commercial.opportunity.create',
              ],
              offerPermissionAssignmentId:
                readOnly || retired ? undefined : 'offer-preparer-707',
              offerPermissionSetVersion: readOnly || retired ? undefined : 'v1',
              offerApproverAssignmentId:
                readOnly || retired ? undefined : 'offer-approver-707',
              offerApproverPermissionSetVersion:
                readOnly || retired ? undefined : 'v1',
              offerPermissions:
                readOnly || retired
                  ? ['commercial.offer.read']
                  : [
                      'commercial.offer.read',
                      'commercial.offer.transmission.record',
                      'commercial.offer.response.record',
                    ],
            },
          }
        : {}),
    };
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push(`${request.method()} ${path}`);
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: actor(
          request.headers()['x-company-context-id'] === company707.id,
        ),
      });
    if (path === '/api/companies') return route.fulfill({ json: [company707] });
    if (path === '/api/operational-home')
      return route.fulfill({ json: operationalHomeFixture(company707.id, {}) });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/commercial-intake/requests')
      return route.fulfill({
        json: {
          items: requests707.map(({ request: item }) =>
            requestListItemFor(item),
          ),
        },
      });
    const requested = requests707.find(
      ({ request: item }) =>
        path === `/api/commercial-intake/requests/${item.id}`,
    );
    if (requested) return route.fulfill({ json: requested.request });
    const entry = [...offers].find(([id]) =>
      path.startsWith(`/api/offers/opportunities/${id}`),
    );
    if (!entry) return route.fulfill({ status: 404 });
    const [opportunityId, offer] = entry;
    const base = `/api/offers/opportunities/${opportunityId}`;
    if (request.method() === 'GET') {
      if (path === `${base}/versions`)
        return route.fulfill({
          json: {
            versions: [
              {
                id: offer.version.id,
                versionNumber: offer.version.versionNumber,
                createdAt: '2026-09-27T09:00:00.000Z',
                supersededByVersionId: null,
              },
              ...(historicalOffers.has(opportunityId)
                ? [
                    {
                      id: `version-${requestedOutcome(opportunityId)}`,
                      versionNumber: 1,
                      createdAt: '2026-09-27T09:00:00.000Z',
                      supersededByVersionId: offer.version.id,
                    },
                  ]
                : []),
              ...(authorityLoss
                ? [
                    {
                      id: 'version-history',
                      versionNumber: 1,
                      createdAt: '2026-09-26T09:00:00.000Z',
                      supersededByVersionId: offer.version.id,
                    },
                  ]
                : []),
            ],
            nextCursor: null,
          },
        });
      const historical = historicalOffers.get(opportunityId);
      if (historical && path === `${base}/versions/${historical.version.id}`)
        return route.fulfill({ json: { offer: historical } });
      if (path.endsWith('/versions/version-history') && authorityLoss) {
        retired = true;
        return route.fulfill({
          status: 403,
          json: { privateDetail: 'HIDDEN-RETIRED-AUTHORITY' },
        });
      }
      if (path === base || path === `${base}/versions/${offer.version.id}`)
        return route.fulfill({ json: { offer } });
      return route.fulfill({ status: 404 });
    }
    const command = {
      path,
      body: request.postData(),
      key: request.headers()['idempotency-key'],
      companyId: request.headers()['x-company-context-id'],
      method: request.method(),
    };
    commands.push(command);
    if (readOnly || retired) return route.fulfill({ status: 403 });
    if (!command.key) throw new Error('Missing idempotency key.');
    const receiptId = `${path}:${command.key}`;
    const receipt = receipts.get(receiptId);
    if (receipt)
      return route.fulfill(
        receipt.body === command.body
          ? { status: 201, json: receipt.value }
          : { status: 409, json: { code: 'IDEMPOTENCY_CONFLICT' } },
      );
    let value: OfferTransmissionView | OfferClientResponseView;
    let pending: ReturnType<typeof gate>;
    if (path.endsWith('/transmission')) {
      value = transmissionRecord({ offer, note: literalSimulationNote });
      if (!authorityLoss)
        offers.set(opportunityId, withTransmission({ offer }));
      pending = transmissionGate;
    } else if (path.endsWith('/client-response')) {
      const scenario = requests707.find(
        ({ request: item }) => item.initialOpportunity.id === opportunityId,
      );
      if (!scenario) throw new Error('Unknown synthetic outcome.');
      value = clientResponseRecord({ offer, outcome: scenario.outcome });
      offers.set(
        opportunityId,
        withClientResponse({ offer, outcome: scenario.outcome }),
      );
      const responseGate = responseGates.get(scenario.outcome);
      if (!responseGate) throw new Error('Missing response HTTP gate.');
      pending = responseGate;
    } else return route.fulfill({ status: 404 });
    receipts.set(receiptId, { body: command.body, value });
    await pending.promise;
    if (page.isClosed()) return;
    if (authorityLoss) {
      try {
        await route.fulfill({ status: 201, json: value });
      } finally {
        lateReplies.push(path);
      }
      return;
    }
    return route.fulfill({ status: 503 });
  });
  return {
    offers,
    initialOffers,
    commands,
    requests,
    lateReplies,
    releaseTransmission: transmissionGate.release,
    releaseResponse(outcome: OfferClientResponseView['outcome']) {
      const pending = responseGates.get(outcome);
      if (!pending) throw new Error('Missing response HTTP gate.');
      pending.release();
    },
  };
}

function requestedOutcome(opportunityId: string): string {
  const entry = requests707.find(
    ({ request }) => request.initialOpportunity.id === opportunityId,
  );
  if (!entry) throw new Error('Unknown synthetic Opportunity.');
  return entry.outcome;
}
