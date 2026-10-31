import { randomUUID } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CommercialPdfRenderer } from '../commercial-pdf/commercial-pdf-renderer.js';
import { OfferService } from './offer.service.js';
import {
  ESTIMATE_OFFER_OWNER,
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from './offer-estimate-preparation.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Illustrative v1 PDF exact read boundaries', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture();
  });
  beforeEach(async () => {
    await fixture.reset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await fixture?.close();
  });
  async function prepare(adjusted = false) {
    const source = await fixture.prepare();
    const snapshot = await fixture.illustrativeSnapshot(source, adjusted);
    const path = `/offers/opportunities/${source.opportunityId}`;
    const intent = {
      pricingSnapshotId: snapshot.id,
      recipient: { kind: 'PRIMARY' },
      scopeNote: 'Frozen illustrative scope',
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
    const version = responseRecord(offer.version),
      representation = responseRecord(version.representation);
    return {
      source,
      path,
      intent,
      offer,
      version,
      representation,
      exact: `${path}/versions/${responseString(version, 'id')}`,
      digest: responseString(representation, 'sha256'),
    };
  }
  type Ready = Awaited<ReturnType<typeof prepare>>;
  const download = (
    flow: Ready,
    digest = flow.digest,
    companyId = flow.source.companyId,
    headers = ESTIMATE_OFFER_PREPARER,
  ) =>
    fixture.request({
      path: `${flow.exact}/pdf?sourceHtmlSha256=${digest}`,
      companyId,
      headers,
    });
  const read = (flow: Ready) =>
    fixture.read({
      path: flow.exact,
      companyId: flow.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
    });
  async function revoke(
    flow: Ready,
    bundle: string,
    membershipId = flow.source.preparerMembershipId,
  ) {
    const response = await fixture.request({
      path: `/${bundle}-assignments/${membershipId}/${flow.source.companyId}`,
      headers: ESTIMATE_OFFER_OWNER,
      init: { method: 'DELETE', headers: { 'idempotency-key': randomUUID() } },
    });
    expect(response.status).toBe(200);
  }
  function noAttachment(response: Response) {
    expect(response.headers.get('content-disposition')).toBeNull();
    expect(response.headers.get('x-commercial-pdf-source')).toBeNull();
    expect(response.headers.get('x-commercial-pdf-sha256')).toBeNull();
    expect(response.headers.get('x-commercial-pdf-renderer')).toBeNull();
    expect(response.headers.get('content-type')).not.toBe('application/pdf');
  }
  it('keeps the immutable historical target after successor/restart and loss of unrelated pricing/Client source grants', async () => {
    const flow = await prepare();
    await fixture.command({
      path: flow.path + '/versions',
      companyId: flow.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: {
        ...flow.intent,
        expectedOfferRevision: 1,
        commercialConditions: 'New successor content',
      },
    });
    for (const bundle of [
      'company-pricing-user',
      'company-pricing-configuration',
      'company-director-client',
    ])
      await revoke(flow, bundle);
    await fixture.restart();
    const before = await read(flow);
    const result = await download(flow);
    expect(result.status).toBe(200);
    expect(
      JSON.parse(result.headers.get('x-commercial-pdf-source') ?? 'null'),
    ).toMatchObject({
      versionId: flow.version.id,
      versionNumber: 1,
      sourceHtmlSha256: flow.digest,
    });
    expect(responseRecord(responseRecord(before).offer).version).toMatchObject({
      representation: flow.representation,
      scopeNote: flow.version.scopeNote,
    });
    expect(await read(flow)).toEqual(before);
  }, 30_000);
  it.each([
    'company-offer-approver',
    'company-commercial-intake',
    'company-context',
  ])(
    'refuses independently revoked %s before source-specific mismatch disclosure',
    async (bundle) => {
      const flow = await prepare();
      // The preparer also holds catalogue/source assignments that legitimately
      // authorize Company context. This minimal reader isolates each lost grant.
      await revoke(flow, bundle, flow.source.readerMembershipId);
      const response = await download(
        flow,
        '0'.repeat(64),
        flow.source.companyId,
        ESTIMATE_OFFER_READER,
      );
      expect(response.status).toBe(403);
      noAttachment(response);
    },
    30_000,
  );
  it.each(['actor', 'membership', 'company'])(
    'refuses inactive %s before content-specific disclosure',
    async (kind) => {
      const flow = await prepare();
      if (kind === 'actor')
        await fixture.pool.query(
          "UPDATE internal_users SET status='inactive' WHERE id=(SELECT internal_user_id FROM workspace_memberships WHERE id=$1)",
          [flow.source.preparerMembershipId],
        );
      else if (kind === 'membership')
        await fixture.pool.query(
          "UPDATE workspace_memberships SET status='inactive' WHERE id=$1",
          [flow.source.preparerMembershipId],
        );
      else
        await fixture.pool.query(
          "UPDATE companies SET status='inactive' WHERE id=$1",
          [flow.source.companyId],
        );
      const response = await download(flow, '0'.repeat(64));
      expect(response.status).toBe(403);
      noAttachment(response);
    },
    30_000,
  );
  it('refuses unknown/null captured Offer grants and preserves the original assignment', async () => {
    const flow = await prepare();
    const rows = await fixture.pool.query<{ id: string; version: string }>(
      'SELECT id,permission_set_version AS version FROM company_role_assignments WHERE workspace_membership_id=$1 AND bundle=$2 AND revoked_at IS NULL',
      [flow.source.preparerMembershipId, 'company_offer_preparer'],
    );
    const capture = rows.rows[0];
    const constraint = await fixture.pool.query<{ definition: string }>(
      "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='company_role_assignments'::regclass AND conname='company_role_assignments_permission_set_version_check'",
    );
    const definition = constraint.rows[0]?.definition;
    if (!capture || !definition)
      throw new Error('Expected isolated grant and constraint.');
    await fixture.pool.query(
      'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
    );
    try {
      for (const version of [null, 'UNKNOWN_PDF_1005']) {
        await fixture.pool.query(
          'UPDATE company_role_assignments SET permission_set_version=$2 WHERE id=$1',
          [capture.id, version],
        );
        const response = await download(flow, '0'.repeat(64));
        expect(response.status).toBe(403);
        noAttachment(response);
      }
    } finally {
      await fixture.pool.query(
        'UPDATE company_role_assignments SET permission_set_version=$2 WHERE id=$1',
        [capture.id, capture.version],
      );
      await fixture.pool.query(
        'ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ' +
          definition,
      );
    }
  }, 30_000);
  it('refuses a wrong digest/extra query, adjusted v2 and authorized foreign-Company target without hidden attachment metadata', async () => {
    const flow = await prepare();
    const mismatch = await download(flow, '0'.repeat(64));
    expect(mismatch.status).toBe(409);
    noAttachment(mismatch);
    const invalid = await fixture.request({
      path: `${flow.exact}/pdf?sourceHtmlSha256=${flow.digest}&renderer=unknown`,
      companyId: flow.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
    });
    expect(invalid.status).toBe(400);
    noAttachment(invalid);
    const other = responseRecord(
      await fixture.command({
        path: '/companies',
        body: { displayName: 'Other PDF Company' },
      }),
    );
    const companyId = responseString(other, 'id');
    for (const bundle of [
      'company-context',
      'company-commercial-intake',
      'company-offer-preparer',
    ])
      await fixture.grant({
        path: `/${bundle}-assignments`,
        companyId,
        membershipId: flow.source.preparerMembershipId,
      });
    const foreign = await download(flow, flow.digest, companyId);
    expect(foreign.status).toBe(404);
    noAttachment(foreign);
    const anonymous = await download(
      flow,
      flow.digest,
      flow.source.companyId,
      {},
    );
    expect(anonymous.status).toBe(401);
    noAttachment(anonymous);
  }, 30_000);
  it('refuses adjusted v2 without rewriting its independently readable HTML', async () => {
    const flow = await prepare(true),
      before = await read(flow);
    const response = await download(flow);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: 'PDF_SOURCE_UNSUPPORTED',
    });
    noAttachment(response);
    expect(await read(flow)).toEqual(before);
  }, 30_000);
  it.each([false, true])(
    'releases bytes only when the complete final authorized read wins (final read first=%s)',
    async (finalFirst) => {
      const flow = await prepare();
      let enter = () => {},
        release = () => {};
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      if (finalFirst) {
        const original = OfferService.prototype.read;
        let reads = 0;
        vi.spyOn(OfferService.prototype, 'read').mockImplementation(
          async function (this: OfferService, ...args) {
            const result = await original.apply(this, args);
            if (++reads === 2) {
              enter();
              await barrier;
            }
            return result;
          },
        );
      } else {
        const original = CommercialPdfRenderer.prototype.render;
        vi.spyOn(CommercialPdfRenderer.prototype, 'render').mockImplementation(
          async function (this: CommercialPdfRenderer, ...args) {
            const bytes = await original.apply(this, args);
            enter();
            await barrier;
            return bytes;
          },
        );
      }
      const pending = download(flow);
      try {
        await entered;
        await revoke(flow, 'company-offer-preparer');
      } finally {
        release();
      }
      const response = await pending;
      expect(response.status).toBe(finalFirst ? 200 : 403);
      if (!finalFirst) noAttachment(response);
    },
    30_000,
  );
  it.each(['oversized', 'failure'])(
    'refuses %s renderer output without an attachment and retains exact HTML recovery',
    async (kind) => {
      const flow = await prepare(),
        before = await read(flow);
      if (kind === 'oversized')
        vi.spyOn(CommercialPdfRenderer.prototype, 'render').mockResolvedValue(
          new Uint8Array(16 * 1024 * 1024 + 1),
        );
      else
        vi.spyOn(CommercialPdfRenderer.prototype, 'render').mockRejectedValue(
          new ServiceUnavailableException({ code: 'PDF_RENDER_UNAVAILABLE' }),
        );
      const response = await download(flow);
      expect(response.status).toBe(kind === 'oversized' ? 422 : 503);
      noAttachment(response);
      expect(await read(flow)).toEqual(before);
    },
    30_000,
  );
});
