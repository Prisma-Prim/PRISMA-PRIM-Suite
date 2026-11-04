import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { prepareInvoiceRecordSource } from './invoice-record.proof-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Invoice Record native Actor display text', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  let source: Awaited<ReturnType<typeof prepareInvoiceRecordSource>>;
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
    });
  });
  beforeEach(async () => {
    await fixture.reset();
    scanner.reset();
    source = await prepareInvoiceRecordSource(fixture);
  });
  afterAll(async () => {
    await fixture?.close();
    await scanner?.close();
  });

  it.each([
    ['longer than 1000 characters', 'Native Actor ' + 'A'.repeat(1001)],
    ['containing an internal tab', 'Native\tActor'],
  ])('preserves a real admitted Actor label %s', async (_name, label) => {
    const target = {
      ...source.target,
      headers: { ...source.target.headers, 'x-test-display-name': label },
    };
    // The external identity fixture supplies profile input only. Native Access
    // establishes this actual User/member/Company Actor before any Invoice I/O.
    const admitted = await fixture.request({
      ...target,
      path: '/access/current-actor',
    });
    expect(admitted.status).toBe(200);
    expect(await admitted.json()).toMatchObject({
      displayName: label,
      workspaceMembershipId: source.membershipId,
      activeCompany: { id: source.companyId },
    });
    const createKey = randomUUID();
    const created = await fixture.post({
      ...target,
      path: '/invoice-records',
      body: source.createBody,
      key: createKey,
    });
    expect(created.status).toBe(201);
    const receipt: unknown = await created.json();
    const id = responseString(responseRecord(receipt), 'recordId');
    const correction = await fixture.post({
      ...target,
      path: `/invoice-records/${id}/commands`,
      body: {
        action: 'CORRECT',
        expectedRevision: 1,
        values: { ...source.createBody.values, grossMinor: '125550' },
        reason: 'Literal manual reason retains its own strict grammar',
      },
    });
    expect(correction.status).toBe(201);
    const withdrawal = await fixture.post({
      ...target,
      path: `/invoice-records/${id}/commands`,
      body: {
        action: 'WITHDRAW_ENTRY',
        expectedRevision: 2,
        reason: 'Withdraw this PRISMA entry only',
      },
    });
    expect(withdrawal.status).toBe(201);
    await fixture.restart();
    const retained = await source.read(`/invoice-records/${id}`);
    expect(retained.actor).toMatchObject({ displayName: label });
    const history = await source.read(`/invoice-records/${id}/history`);
    expect(history.items).toMatchObject([
      { revision: 3, actor: { displayName: label } },
      { revision: 2, actor: { displayName: label } },
      { revision: 1, actor: { displayName: label } },
    ]);
    const replay = await source.create(source.createBody, createKey);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(receipt);
    expect(await source.read(`/invoice-records/${id}/history`)).toEqual(
      history,
    );
  });
});
