import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  ESTIMATE_OFFER_DIRECTOR,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { prepareInvoiceRecordSource } from './invoice-record.proof-support.js';
const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Invoice Record repeatable current/history snapshot', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
      synchronizeIdentityProfile: false,
    });
  });
  beforeEach(async () => {
    await fixture.reset();
    scanner.reset();
  });
  afterAll(async () => {
    await fixture?.close();
    await scanner?.close();
  });
  it('returns one complete old snapshot while an independently authorized native correction commits during its authority wait', async () => {
    const source = await prepareInvoiceRecordSource(fixture),
      created = await source.create();
    expect(created.status).toBe(201);
    const recordId = responseString(
      responseRecord(await created.json()),
      'recordId',
    );
    const membershipId = source.f.ready.source.directorMembershipId;
    for (const path of [
      '/company-invoice-recorder-assignments',
      '/company-external-invoice-access-assignments',
      '/company-document-registrar-assignments',
      '/company-document-content-reader-assignments',
      '/company-director-client-assignments',
      '/company-contract-preparer-assignments',
      '/company-commercial-intake-assignments',
    ])
      await fixture.grant({ path, companyId: source.companyId, membershipId });
    const before = await source.read(`/invoice-records/${recordId}`),
      barrier = await fixture.pool.connect();
    let pending: Promise<Response> | undefined;
    const values = {
      ...source.createBody.values,
      grossMinor: '125550',
      netMinor: '0',
    };
    try {
      await barrier.query('BEGIN');
      const pid = await backendPid(barrier);
      const locked = await barrier.query(
        "SELECT id FROM company_role_assignments WHERE company_id=$1::uuid AND workspace_membership_id=$2::uuid AND bundle::text='company_invoice_recorder' AND revoked_at IS NULL FOR UPDATE",
        [source.companyId, source.membershipId],
      );
      expect(locked.rowCount).toBe(1);
      pending = source.request(`/invoice-records/${recordId}`);
      await waitForBlocked(fixture.pool, pid);
      const corrected = await fixture.post({
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_DIRECTOR,
        path: `/invoice-records/${recordId}/commands`,
        key: randomUUID(),
        body: {
          action: 'CORRECT',
          expectedRevision: 1,
          values,
          reason:
            'Independent native correction while the copied reader retains its earlier snapshot.',
        },
      });
      expect(corrected.status).toBe(201);
      expect(responseRecord(await corrected.json()).revision).toBe(2);
      await waitForBlocked(fixture.pool, pid);
      await barrier.query('COMMIT');
    } finally {
      await barrier.query('ROLLBACK').catch(() => undefined);
      barrier.release();
      await Promise.allSettled([pending]);
    }
    if (!pending)
      throw new Error(
        'The real copied read did not reach its authority barrier.',
      );
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(before);
    const fresh = await source.read(`/invoice-records/${recordId}`);
    expect(responseRecord(fresh.record)).toMatchObject({ revision: 2, values });
    expect(responseRecord(fresh.history).items).toMatchObject([
      { revision: 2, after: { entryState: 'RECORDED', values } },
      {
        revision: 1,
        after: { entryState: 'RECORDED', values: source.createBody.values },
      },
    ]);
  });
});
