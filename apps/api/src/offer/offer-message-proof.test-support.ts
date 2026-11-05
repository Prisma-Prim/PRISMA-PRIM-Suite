import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from './offer-estimate-preparation.test-support.js';

export type OfferMessageFixture = Awaited<
  ReturnType<typeof openEstimateOfferFixture>
>;

export async function readMessageOffer(
  fixture: OfferMessageFixture,
  input: { base: string; companyId: string },
) {
  const offer = responseRecord(
    responseRecord(
      await fixture.read({
        path: input.base,
        companyId: input.companyId,
        headers: ESTIMATE_OFFER_READER,
      }),
    ).offer,
  );
  const version = responseRecord(offer.version);
  const representation = responseRecord(version.representation);
  return {
    offer,
    version,
    digest: responseString(representation, 'sha256'),
    html: responseString(representation, 'html'),
  };
}

export async function prepareMessageIllustrativeOffer(
  fixture: OfferMessageFixture,
  adjusted = false,
) {
  const source = await fixture.prepare();
  const snapshot = await fixture.illustrativeSnapshot(source, adjusted);
  const path = `/offers/opportunities/${source.opportunityId}`;
  const intent = {
    pricingSnapshotId: responseString(snapshot, 'id'),
    recipient: { kind: 'PRIMARY' },
    scopeNote: 'Literal illustrative message source',
    commercialConditions: null,
  };
  const offer = responseRecord(
    await fixture.command({
      path,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: intent,
    }),
  );
  const versionId = responseString(responseRecord(offer.version), 'id');
  return {
    source,
    path,
    base: `${path}/versions/${versionId}`,
    versionId,
    intent,
  };
}

export async function currentMessageCapture(
  fixture: OfferMessageFixture,
  companyId: string,
  headers: Readonly<Record<string, string>> = ESTIMATE_OFFER_READER,
) {
  const actor = responseRecord(
    await fixture.read({
      path: '/access/current-actor',
      companyId,
      headers,
    }),
  );
  const capture = responseString(
    responseRecord(actor.activeCompany),
    'offerMessageReadCapture',
  );
  expect(capture).toMatch(/^offer-message-read\.v1\.[0-9a-f]{64}$/u);
  return { actor, capture };
}

export async function revokeMessageGrant(
  fixture: OfferMessageFixture,
  input: { path: string; companyId: string; membershipId: string },
) {
  const response = await fixture.request({
    path: `${input.path}/${input.membershipId}/${input.companyId}`,
    init: {
      method: 'DELETE',
      headers: { 'idempotency-key': randomUUID() },
    },
  });
  expect({
    status: response.status,
    body: await response.json(),
  }).toMatchObject({
    status: 200,
  });
}
