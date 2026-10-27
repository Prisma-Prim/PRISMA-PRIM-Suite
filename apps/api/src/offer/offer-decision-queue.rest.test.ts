import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_OWNER,
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_DIRECTOR,
  ESTIMATE_OFFER_READER,
  ESTIMATE_OFFER_WORKSPACE,
  openEstimateOfferFixture,
  estimateOfferIntent,
  responseRecord,
  responseString,
} from './offer-estimate-preparation.test-support.js';
import {
  generatedOfferIntent,
  prepareGeneratedOfferWorkflow,
} from './offer-model-generation.test-fixture.js';
import { effects } from './offer-concurrency.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Pending Offer discovery through public REST', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture();
  });
  beforeEach(async () => fixture.reset());
  afterAll(async () => fixture?.close());

  it('finds an exact pending model Version without Client, cost or configuration read', async () => {
    const target = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
    const response = await fixture.request({
      path: '/offer-decision-queue',
      companyId: target.source.companyId,
      headers: ESTIMATE_OFFER_READER,
    });
    expect(response.status).toBe(200);
    const page: unknown = await response.json();
    expect(page).toEqual({
      items: [
        {
          workspaceId: ESTIMATE_OFFER_WORKSPACE,
          companyId: target.source.companyId,
          offerId: expect.any(String),
          versionId: target.versionId,
          opportunityId: target.source.opportunityId,
          clientRequestId: expect.any(String),
          opportunityTitle: 'Synthetic internal Offer',
          illustrativeReference: 1,
          versionNumber: 1,
          provenance: 'COMPANY_MODEL_ESTIMATE',
          createdAt: '2026-10-24T09:00:00.000000Z',
        },
      ],
    });
  });

  it('rejects year zero with safe400 before binding a PostgreSQL timestamp', async () => {
    const s = await fixture.prepare();
    const cursor = Buffer.from(
      JSON.stringify({
        workspaceId: ESTIMATE_OFFER_WORKSPACE,
        companyId: s.companyId,
        family: 'OFFER',
        versionId: '00000000-0000-4000-8000-000000000911',
        createdAt: '0000-10-24T09:00:00.000000Z',
      }),
    ).toString('base64url');
    const response = await fixture.request({
      path: '/offer-decision-queue?cursor=' + cursor,
      companyId: s.companyId,
      headers: ESTIMATE_OFFER_READER,
    });
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain(s.companyId);
  });

  it('keeps only the undecided head, preserves exact predecessor reads and excludes internal-only drafts', async () => {
    const target = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
    const successor = responseRecord(
      await fixture.command({
        path: `${target.path}/versions/from-approved-model`,
        companyId: target.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          ...generatedOfferIntent(target.source),
          expectedOfferRevision: 1,
        },
      }),
    );
    const head = responseString(responseRecord(successor.version), 'id');
    const readQueue = () =>
      fixture.read({
        path: '/offer-decision-queue',
        companyId: target.source.companyId,
        headers: ESTIMATE_OFFER_READER,
      });
    expect(queueItems(await readQueue()).map((v) => v.versionId)).toEqual([
      head,
    ]);
    const old = responseRecord(
      responseRecord(
        await fixture.read({
          path: `${target.path}/versions/${target.versionId}`,
          companyId: target.source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).offer,
    );
    expect(old.version).toMatchObject({
      id: target.versionId,
      supersededByVersionId: head,
    });
    await fixture.command({
      path: `${target.path}/versions/${head}/reject`,
      companyId: target.source.companyId,
      headers: ESTIMATE_OFFER_READER,
      body: { expectedOfferRevision: 2, reason: 'Synthetic queue rejection' },
    });
    expect(await readQueue()).toEqual({ items: [] });
    await fixture.command({
      path: `${target.path}/versions/from-approved-estimate`,
      companyId: target.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: { ...estimateOfferIntent(target.source), expectedOfferRevision: 3 },
    });
    expect(await readQueue()).toEqual({ items: [] });
  });

  it('removes an approved Version without confusing approval with transmission or acceptance', async () => {
    const target = await prepareGeneratedOfferWorkflow(fixture, 'APPROVED');
    expect(
      await fixture.read({
        path: '/offer-decision-queue',
        companyId: target.source.companyId,
        headers: ESTIMATE_OFFER_READER,
      }),
    ).toEqual({ items: [] });
  });

  it('preserves v1 illustrative decisions without lending model approval', async () => {
    const legacy = await openEstimateOfferFixture({
      historicalOfferCaptures: { preparer: 'v3', approver: 'v1' },
    });
    try {
      const target = await prepareGeneratedOfferWorkflow(legacy, 'PENDING');
      expect(
        await legacy.read({
          path: '/offer-decision-queue',
          companyId: target.source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).toEqual({ items: [] });
      const snapshot = await legacy.illustrativeSnapshot(target.source);
      const ordinary = responseRecord(
        await legacy.command({
          path: `${target.path}/versions`,
          companyId: target.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: {
            pricingSnapshotId: snapshot.id,
            expectedOfferRevision: 1,
            recipient: { kind: 'PRIMARY' },
            validityDays: 30,
            scopeNote: null,
            commercialConditions: null,
          },
        }),
      );
      expect(
        queueItems(
          await legacy.read({
            path: '/offer-decision-queue',
            companyId: target.source.companyId,
            headers: ESTIMATE_OFFER_READER,
          }),
        ),
      ).toMatchObject([
        {
          versionId: responseRecord(ordinary.version).id,
          provenance: 'ILLUSTRATIVE',
          versionNumber: 2,
        },
      ]);
      await legacy.command({
        path: `${target.path}/versions/${responseRecord(ordinary.version).id}/reject`,
        companyId: target.source.companyId,
        headers: ESTIMATE_OFFER_READER,
        body: { expectedOfferRevision: 2, reason: 'Explicit legacy decision' },
      });
      expect(
        await legacy.read({
          path: '/offer-decision-queue',
          companyId: target.source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).toEqual({ items: [] });
    } finally {
      await legacy.close();
    }
  });

  it('requires explicit current approver and Intake authority even for an empty page', async () => {
    const s = await fixture.prepare();
    expect(
      await fixture.read({
        path: '/offer-decision-queue',
        companyId: s.companyId,
        headers: ESTIMATE_OFFER_READER,
      }),
    ).toEqual({ items: [] });
    for (const headers of [
      ESTIMATE_OFFER_OWNER,
      ESTIMATE_OFFER_PREPARER,
      ESTIMATE_OFFER_DIRECTOR,
    ])
      expect(
        (
          await fixture.request({
            path: '/offer-decision-queue',
            companyId: s.companyId,
            headers,
          })
        ).status,
      ).toBe(403);
    const revoked = await fixture.request({
      path: `/company-commercial-intake-assignments/${s.readerMembershipId}/${s.companyId}`,
      init: {
        method: 'DELETE',
        headers: { 'idempotency-key': 'revoke-queue-intake' },
      },
    });
    expect(revoked.status).toBe(200);
    expect(
      (
        await fixture.request({
          path: '/offer-decision-queue',
          companyId: s.companyId,
          headers: ESTIMATE_OFFER_READER,
        })
      ).status,
    ).toBe(403);
  });

  it('validates cursor/query inputs after authorization and writes no commercial record or event', async () => {
    const target = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
    const before = await effects(fixture.pool);
    for (const query of [
      '?cursor=',
      '?cursor=broken',
      '?cursor=a&cursor=b',
      '?cursor[]=a',
      '?limit=50',
      '?offset=0',
      '?sort=latest',
    ]) {
      const response = await fixture.request({
        path: '/offer-decision-queue' + query,
        companyId: target.source.companyId,
        headers: ESTIMATE_OFFER_READER,
      });
      expect(response.status, query).toBe(400);
      expect(JSON.stringify(await response.json())).not.toContain(
        target.versionId,
      );
    }
    const denied = await fixture.request({
      path: '/offer-decision-queue?cursor=broken',
      companyId: target.source.companyId,
      headers: ESTIMATE_OFFER_DIRECTOR,
    });
    expect(denied.status).toBe(403);
    await fixture.read({
      path: '/offer-decision-queue',
      companyId: target.source.companyId,
      headers: ESTIMATE_OFFER_READER,
    });
    expect(await effects(fixture.pool)).toEqual(before);
    const foreign = await fixture.request({
      path: '/offer-decision-queue',
      companyId: target.source.companyId,
      headers: ESTIMATE_OFFER_READER,
      init: {
        headers: {
          'x-workspace-context-id': '00000000-0000-4000-8000-000000000999',
        },
      },
    });
    expect(foreign.status).toBe(403);
    expect(JSON.stringify(await foreign.json())).not.toContain(
      target.versionId,
    );
  });

  it('iterates every tied-date head, retains a decided anchor cursor, and rejects foreign-family/scope cursors', async () => {
    const s = await fixture.prepare();
    const firstSnapshot = await fixture.illustrativeSnapshot(s);
    const versionIds: string[] = [];
    for (let n = 0; n < 27; n++) {
      const opportunityId =
        n === 0
          ? s.opportunityId
          : responseString(
              responseRecord(
                responseRecord(
                  await fixture.command({
                    path: '/commercial-intake/requests',
                    companyId: s.companyId,
                    headers: ESTIMATE_OFFER_PREPARER,
                    body: {
                      clientAccountId: s.clientId,
                      originalText: 'Synthetic paginated Offer',
                      opportunity: {
                        title: `Pending Offer ${n}`,
                        nextAction: 'Review',
                      },
                    },
                  }),
                ).initialOpportunity,
              ),
              'id',
            );
      const snapshot =
        n === 0
          ? firstSnapshot
          : responseRecord(
              await fixture.command({
                path: `/pricing/opportunities/${opportunityId}/snapshots`,
                companyId: s.companyId,
                headers: ESTIMATE_OFFER_PREPARER,
                body: {
                  pricingRuleVersionNumber:
                    firstSnapshot.catalogue.ruleVersionNumber,
                  lines: [
                    {
                      offeringId: firstSnapshot.catalogue.offeringId,
                      tariffVersionNumber:
                        firstSnapshot.catalogue.tariffVersionNumber,
                      quantity: '1',
                    },
                  ],
                },
              }),
            );
      const created = responseRecord(
        await fixture.command({
          path: `/offers/opportunities/${opportunityId}`,
          companyId: s.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: {
            pricingSnapshotId: snapshot.id,
            recipient: { kind: 'PRIMARY' },
            validityDays: 30,
            scopeNote: null,
            commercialConditions: null,
          },
        }),
      );
      versionIds.push(responseString(responseRecord(created.version), 'id'));
    }
    const first = responseRecord(
      await fixture.read({
        path: '/offer-decision-queue',
        companyId: s.companyId,
        headers: ESTIMATE_OFFER_READER,
      }),
    );
    const sorted = [...versionIds].sort();
    expect(queueItems(first).map((v) => v.versionId)).toEqual(
      sorted.slice(0, 25),
    );
    const cursor = responseString(first, 'nextCursor');
    const anchor = queueItems(first)[24];
    if (!anchor) throw new Error('Missing pagination anchor');
    await fixture.command({
      path: `/offers/opportunities/${anchor.opportunityId}/versions/${anchor.versionId}/reject`,
      companyId: s.companyId,
      headers: ESTIMATE_OFFER_READER,
      body: { expectedOfferRevision: 1, reason: 'Synthetic anchor decision' },
    });
    const last = await fixture.read({
      path: '/offer-decision-queue?cursor=' + cursor,
      companyId: s.companyId,
      headers: ESTIMATE_OFFER_READER,
    });
    expect(queueItems(last).map((v) => v.versionId)).toEqual(sorted.slice(25));
    expect(responseRecord(last).nextCursor).toBeUndefined();
    const other = responseRecord(
      await fixture.command({
        path: '/companies',
        body: { displayName: 'Other Offer queue Company' },
      }),
    );
    const otherCompanyId = responseString(other, 'id');
    for (const path of [
      '/company-context-assignments',
      '/company-commercial-intake-assignments',
      '/company-offer-approver-assignments',
    ])
      await fixture.grant({
        path,
        companyId: otherCompanyId,
        membershipId: s.readerMembershipId,
      });
    expect(
      (
        await fixture.request({
          path: '/offer-decision-queue?cursor=' + cursor,
          companyId: otherCompanyId,
          headers: ESTIMATE_OFFER_READER,
        })
      ).status,
    ).toBe(400);
    const decoded: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString(),
    );
    const foreignFamily = Buffer.from(
      JSON.stringify({ ...responseRecord(decoded), family: 'CONTRACT' }),
    ).toString('base64url');
    expect(
      (
        await fixture.request({
          path: '/offer-decision-queue?cursor=' + foreignFamily,
          companyId: s.companyId,
          headers: ESTIMATE_OFFER_READER,
        })
      ).status,
    ).toBe(400);
    expect(
      await fixture.read({
        path: '/offer-decision-queue',
        companyId: otherCompanyId,
        headers: ESTIMATE_OFFER_READER,
      }),
    ).toEqual({ items: [] });
    const revoke = await fixture.request({
      path: `/company-offer-approver-assignments/${s.readerMembershipId}/${s.companyId}`,
      init: {
        method: 'DELETE',
        headers: { 'idempotency-key': 'revoke-queue-approver' },
      },
    });
    expect(revoke.status).toBe(200);
    expect(
      (
        await fixture.request({
          path: '/offer-decision-queue?cursor=' + cursor,
          companyId: s.companyId,
          headers: ESTIMATE_OFFER_READER,
        })
      ).status,
    ).toBe(403);
  }, 15_000);
});

function queueItems(value: unknown) {
  const items = responseRecord(value).items;
  if (!Array.isArray(items)) throw new Error('Missing public queue items');
  return items.map((item: unknown) => responseRecord(item));
}
