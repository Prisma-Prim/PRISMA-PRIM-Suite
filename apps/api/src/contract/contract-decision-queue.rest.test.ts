import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_READER,
  ESTIMATE_OFFER_OWNER,
  ESTIMATE_OFFER_WORKSPACE,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  prepareModelContractSource,
  revokeModelContractFixtureGrant,
} from './model-contract.test-fixture.js';
import { modelContractEffects } from './model-contract.test-support.js';
import {
  grantQueueReader,
  prepareAllLegacyQueueKinds,
  prepareLegacyQueueScope,
  queueItems,
} from './contract-decision-queue.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Pending Contract discovery through public REST', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let instant = new Date('2026-10-24T09:00:00.000Z');
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture({
      serverClock: { now: () => new Date(instant) },
    });
  });
  beforeEach(async () => {
    instant = new Date('2026-10-24T09:00:00.000Z');
    await fixture.reset();
  });
  afterAll(async () => fixture?.close());

  it('finds the exact pending model Contract without Client, cost or configuration read and leaves business facts unchanged', async () => {
    const ready = await prepareModelContractSource(fixture);
    const created = responseRecord(
      await ready.invoke(ready.path + '/from-approved-model', ready.intent),
    );
    await fixture.grant({
      path: '/company-contract-approver-assignments',
      companyId: ready.source.companyId,
      membershipId: ready.source.readerMembershipId,
    });
    const before = await modelContractEffects(fixture.pool);
    const response = await fixture.request({
      path: '/contract-decision-queue',
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_READER,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        {
          workspaceId: ESTIMATE_OFFER_WORKSPACE,
          companyId: ready.source.companyId,
          contractId: responseString(created, 'id'),
          versionId: responseString(responseRecord(created.version), 'id'),
          opportunityId: ready.source.opportunityId,
          clientRequestId: responseString(created, 'clientRequestId'),
          opportunityTitle: 'Synthetic internal Offer',
          illustrativeReference: 1,
          versionNumber: 1,
          kind: 'CONTRACT',
          provenance: 'COMPANY_MODEL_OFFER',
          createdAt: '2026-10-24T09:00:00.000000Z',
        },
      ],
    });
    expect(await modelContractEffects(fixture.pool)).toEqual(before);
    expect(
      (
        await fixture.request({
          path: '/clients/' + ready.source.clientId,
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_READER,
        })
      ).status,
    ).toBe(403);
  });

  it('preserves all ordinary kinds and legacy origins under v1 without independent Offer read', async () => {
    const ready = await prepareAllLegacyQueueKinds(fixture);
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-offer-approver-assignments',
      ready.source.companyId,
      ready.source.readerMembershipId,
    );
    const page = await fixture.read({
      path: '/contract-decision-queue',
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_READER,
    });
    const items = queueItems(page);
    expect(items.map((row) => responseString(row, 'versionId')).sort()).toEqual(
      ready.pending
        .map((row) => responseString(responseRecord(row.version), 'id'))
        .sort(),
    );
    expect(new Set(items.map((row) => row.kind))).toEqual(
      new Set(['CONTRACT', 'PRECONTRACT', 'ADDENDUM']),
    );
    expect(items.every((row) => row.provenance === 'ILLUSTRATIVE')).toBe(true);
    expect(items.some((row) => row.contractId === ready.parent.id)).toBe(false);
    const agreement = ready.pending.find((row) => row.kind === 'PRECONTRACT');
    if (!agreement) throw new Error('Missing public Precontract');
    expect(
      (
        await fixture.request({
          path: `/contracts/opportunities/${agreement.opportunityId}/agreements/${agreement.id}/versions/${responseString(responseRecord(agreement.version), 'id')}`,
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_READER,
        })
      ).status,
    ).toBe(200);
  }, 15000);

  it.each(['v1', 'missing-source'] as const)(
    'excludes model rows under %s while preserving independently readable frozen content',
    async (mode) => {
      const ready = await prepareModelContractSource(fixture);
      const created = responseRecord(
        await ready.invoke(ready.path + '/from-approved-model', ready.intent),
      );
      await grantQueueReader(
        fixture,
        ready.source,
        mode === 'v1' ? 'v1' : 'v2',
      );
      if (mode === 'missing-source')
        await revokeModelContractFixtureGrant(
          fixture,
          '/company-offer-approver-assignments',
          ready.source.companyId,
          ready.source.readerMembershipId,
        );
      expect(
        await fixture.read({
          path: '/contract-decision-queue',
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).toEqual({ items: [] });
      const exact = await fixture.read({
        path:
          ready.path +
          '/versions/' +
          responseString(responseRecord(created.version), 'id'),
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_READER,
      });
      expect(responseRecord(responseRecord(exact).contract).version).toEqual(
        created.version,
      );
    },
  );

  it('keeps only the current undecided head and preserves an exact superseded Version read', async () => {
    const ready = await prepareModelContractSource(fixture);
    const first = responseRecord(
      await ready.invoke(ready.path + '/from-approved-model', ready.intent),
    );
    await grantQueueReader(fixture, ready.source);
    const next = responseRecord(
      await ready.invoke(ready.path + '/versions/from-approved-model', {
        ...ready.intent,
        expectedContractRevision: 1,
      }),
    );
    expect(
      queueItems(
        await fixture.read({
          path: '/contract-decision-queue',
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).map((row) => row.versionId),
    ).toEqual([responseRecord(next.version).id]);
    const old = responseRecord(
      responseRecord(
        await fixture.read({
          path:
            ready.path +
            '/versions/' +
            responseString(responseRecord(first.version), 'id'),
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).contract,
    );
    expect(old.version).toMatchObject({
      id: responseRecord(first.version).id,
      supersededByVersionId: responseRecord(next.version).id,
    });
  });

  it.each(['approve', 'reject'] as const)(
    'removes a Version after its native %s decision',
    async (kind) => {
      const ready = await prepareModelContractSource(fixture);
      const created = responseRecord(
        await ready.invoke(ready.path + '/from-approved-model', ready.intent),
      );
      await grantQueueReader(fixture, ready.source);
      expect(
        queueItems(
          await fixture.read({
            path: '/contract-decision-queue',
            companyId: ready.source.companyId,
            headers: ESTIMATE_OFFER_READER,
          }),
        ),
      ).toHaveLength(1);
      await fixture.command({
        path:
          ready.path +
          '/versions/' +
          responseString(responseRecord(created.version), 'id') +
          '/' +
          kind,
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_READER,
        body:
          kind === 'approve'
            ? {
                expectedContractRevision: 1,
                acknowledgedWarningCodes: [
                  'MODEL_WORDING_REVIEWED',
                  'ANNEX_SCOPE_REVIEWED',
                ],
                reviewBasis: 'Synthetic exact Contract review',
              }
            : {
                expectedContractRevision: 1,
                reason: 'Synthetic explicit rejection',
              },
      });
      expect(
        await fixture.read({
          path: '/contract-decision-queue',
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).toEqual({ items: [] });
    },
  );

  it('requires ordinary Contract and Intake authority even for empty reads, with live revocation', async () => {
    const source = await fixture.prepare();
    const read = (headers = ESTIMATE_OFFER_READER) =>
      fixture.request({
        path: '/contract-decision-queue?cursor=broken',
        companyId: source.companyId,
        headers,
      });
    expect((await read()).status).toBe(403);
    expect((await read(ESTIMATE_OFFER_OWNER)).status).toBe(403);
    await grantQueueReader(fixture, source);
    expect(
      await fixture.read({
        path: '/contract-decision-queue',
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_READER,
      }),
    ).toEqual({ items: [] });
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-commercial-intake-assignments',
      source.companyId,
      source.readerMembershipId,
    );
    expect((await read()).status).toBe(403);
  });

  it.each(['expired', 'rejected-source'] as const)(
    'still discovers a pending Contract with an %s source needing native correction',
    async (state) => {
      const ready = await prepareModelContractSource(fixture);
      const created = responseRecord(
        await ready.invoke(ready.path + '/from-approved-model', ready.intent),
      );
      await grantQueueReader(fixture, ready.source);
      if (state === 'expired') instant = new Date('2026-11-25T09:00:00.000Z');
      else
        await fixture.command({
          path: ready.flow.base + '/client-response',
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_READER,
          body: {
            expectedOfferRevision: ready.flow.revision,
            outcome: 'REJECTED',
            receivedAt: instant.toISOString(),
            reason: 'Synthetic source correction',
          },
        });
      expect(
        queueItems(
          await fixture.read({
            path: '/contract-decision-queue',
            companyId: ready.source.companyId,
            headers: ESTIMATE_OFFER_READER,
          }),
        ).map((row) => row.versionId),
      ).toEqual([responseRecord(created.version).id]);
      const check = responseRecord(
        await ready.invoke(
          ready.path +
            '/versions/' +
            responseString(responseRecord(created.version), 'id') +
            '/quality-checks',
          {},
        ),
      );
      expect(check.results).toContainEqual({
        code: 'SOURCE_OFFER_READY',
        status: 'ERROR',
      });
    },
  );

  it('rejects malformed, repeated, array, foreign and unsupported queries after authority without effects', async () => {
    const ready = await prepareLegacyQueueScope(fixture);
    const contract = await ready.direct();
    const versionId = responseString(responseRecord(contract.version), 'id');
    const encode = (patch: Record<string, unknown>) =>
      Buffer.from(
        JSON.stringify({
          workspaceId: ESTIMATE_OFFER_WORKSPACE,
          companyId: ready.source.companyId,
          family: 'CONTRACT',
          createdAt: '2026-10-24T09:00:00.000000Z',
          versionId,
          ...patch,
        }),
      ).toString('base64url');
    const before = await modelContractEffects(fixture.pool);
    for (const query of [
      '?cursor=',
      '?cursor=broken',
      '?cursor=a&cursor=b',
      '?cursor[]=a',
      '?limit=50',
      '?offset=0',
      '?sort=latest',
      '?search=anything',
      ...[
        { family: 'OFFER' },
        { family: 'ESTIMATE' },
        { companyId: '00000000-0000-4000-8000-000000000999' },
        { workspaceId: '00000000-0000-4000-8000-000000000999' },
        { createdAt: '0000-10-24T09:00:00.000000Z' },
        { createdAt: '2026-02-30T09:00:00.000000Z' },
        { versionId: 'broken' },
        { extra: 'unexpected' },
      ].map((patch) => '?cursor=' + encode(patch)),
    ]) {
      const response = await fixture.request({
        path: '/contract-decision-queue' + query,
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_READER,
      });
      expect(response.status, query).toBe(400);
      expect(JSON.stringify(await response.json())).not.toContain(versionId);
    }
    for (const scope of [
      { companyId: '00000000-0000-4000-8000-000000000999' },
      {
        companyId: ready.source.companyId,
        init: {
          headers: {
            'x-workspace-context-id': '00000000-0000-4000-8000-000000000999',
          },
        },
      },
    ]) {
      const response = await fixture.request({
        path: '/contract-decision-queue',
        headers: ESTIMATE_OFFER_READER,
        ...scope,
      });
      expect(response.status).toBe(403);
      expect(JSON.stringify(await response.json())).not.toContain(versionId);
    }
    expect(await modelContractEffects(fixture.pool)).toEqual(before);
  });

  it('iterates all tied-date heads, retains a decided anchor and preserves microsecond cursor precision', async () => {
    const ready = await prepareLegacyQueueScope(fixture);
    const created: Record<string, unknown>[] = [];
    for (let n = 0; n < 27; n++)
      created.push(
        await ready.direct(
          n === 0
            ? ready.initial
            : await ready.newOpportunity('Pending Contract ' + n),
        ),
      );
    const ids = created
      .map((row) => responseString(responseRecord(row.version), 'id'))
      .sort();
    const read = (cursor?: string) =>
      fixture.read({
        path: '/contract-decision-queue' + (cursor ? '?cursor=' + cursor : ''),
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_READER,
      });
    const first = responseRecord(await read());
    const firstRows = queueItems(first);
    expect(firstRows.map((row) => row.versionId)).toEqual(ids.slice(0, 25));
    expect(
      firstRows.every((row) => row.createdAt === '2026-10-24T09:00:00.000000Z'),
    ).toBe(true);
    const cursor = responseString(first, 'nextCursor');
    const boundary: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    expect(boundary).toEqual({
      workspaceId: ESTIMATE_OFFER_WORKSPACE,
      companyId: ready.source.companyId,
      family: 'CONTRACT',
      createdAt: '2026-10-24T09:00:00.000000Z',
      versionId: ids[24],
    });
    const later = responseRecord(await read(cursor));
    expect(queueItems(later).map((row) => row.versionId)).toEqual(
      ids.slice(25),
    );
    expect(later.nextCursor).toBeUndefined();
    const anchor = created.find(
      (row) => responseRecord(row.version).id === ids[24],
    );
    if (!anchor) throw new Error('Missing public boundary Contract');
    await ready.invoke(
      `/contracts/opportunities/${anchor.opportunityId}/versions/${ids[24]}/reject`,
      {
        expectedContractRevision: 1,
        reason: 'Synthetic decided cursor anchor',
      },
      ESTIMATE_OFFER_READER,
    );
    expect(queueItems(await read(cursor)).map((row) => row.versionId)).toEqual(
      ids.slice(25),
    );
    const microcursor = Buffer.from(
      JSON.stringify({
        ...responseRecord(boundary),
        createdAt: '2026-10-24T09:00:00.000001Z',
      }),
    ).toString('base64url');
    expect(await read(microcursor)).toEqual({ items: [] });
  }, 20000);
});
