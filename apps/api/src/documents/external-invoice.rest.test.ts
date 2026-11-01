import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
  ESTIMATE_OFFER_PREPARER,
} from '../offer/offer-estimate-preparation.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import { prepareExternalInvoiceSource } from './external-invoice.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Confidential external invoice source public REST', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
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
  it('registers an exact declared source with a server-derived PRIMARY party and native empty draft', async () => {
    const ready = await prepareExternalInvoiceSource(fixture);
    const response = await ready.request();
    expect(response.status).toBe(201);
    const document = responseRecord(await response.json());
    expect(document).toMatchObject({
      type: 'external-invoice',
      companyId: ready.companyId,
      clientId: ready.f.ready.source.clientId,
      version: { status: 'draft', representation: null },
      externalInvoiceRelation: {
        access: 'granted',
        ...ready.selection,
        sourceDescription: 'Fictional manual process',
        receivedOn: null,
        recordedRecipient: { kind: 'PRIMARY' },
      },
    });
    const relation = responseRecord(document.externalInvoiceRelation);
    expect(responseRecord(relation.recordedRecipient)).not.toHaveProperty(
      'additionalLegalEntityId',
    );
    expect(await ready.register()).toEqual(document);
    const listed = await fixture.read({
      companyId: ready.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      path: '/documents',
    });
    expect(listed).toContainEqual(document);
    expect(responseString(document, 'id')).not.toBe(ready.selection.contractId);
  });
});
