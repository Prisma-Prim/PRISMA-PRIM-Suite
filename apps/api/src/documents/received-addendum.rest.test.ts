import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  openEstimateOfferFixture,
  responseRecord,
} from '../offer/offer-estimate-preparation.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import { prepareReceivedAddendumParent } from './received-addendum.test-support.js';
const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Exact received Addendum native sources', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
    scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
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
  let parent: Awaited<ReturnType<typeof prepareReceivedAddendumParent>>;
  describe('genuine executed V2', () => {
    beforeEach(async () => {
      parent = await prepareReceivedAddendumParent(fixture);
    });
    it('discovers and registers its exact executed parent', async () => {
      const signed = parent;
      const positive = await signed.call(
        '/documents/received-addendum-sources',
      );
      expect(positive.status).toBe(200);
      expect(responseRecord(await positive.json()).sources).toEqual([
        expect.objectContaining({
          parentContractId: signed.parentContractId,
          parentContractVersionId: signed.parentContractVersionId,
          contractVersionNumber: 2,
        }),
      ]);
      const registered = await signed.register();
      expect({
        status: registered.status,
        body: await registered.json(),
      }).toMatchObject({
        status: 201,
        body: {
          type: 'received-addendum',
          version: { status: 'draft', representation: null },
        },
      });
    });
  });
  describe('approved unsigned parent', () => {
    beforeEach(async () => {
      parent = await prepareReceivedAddendumParent(fixture, false);
    });
    it('keeps old received Contract eligibility and excludes the unsigned Addendum parent', async () => {
      const unsigned = parent;
      const old = await unsigned.call('/documents/received-contract-sources');
      expect(old.status).toBe(200);
      expect(responseRecord(await old.json()).sources).toContainEqual(
        expect.objectContaining({
          contractVersionId: unsigned.parentContractVersionId,
        }),
      );
      const next = await unsigned.call('/documents/received-addendum-sources');
      expect(next.status).toBe(200);
      expect(responseRecord(await next.json()).sources).toEqual([]);
    });
  });
});
