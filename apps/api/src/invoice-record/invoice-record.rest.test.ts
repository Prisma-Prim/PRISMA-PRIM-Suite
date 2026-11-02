import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  invoiceRecordEffects,
  prepareInvoiceRecordSource,
} from './invoice-record.proof-support.js';
const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('External Invoice Record complete native journey', () => {
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
  describe('native declaration lifecycle with an eligible source', () => {
    let source: Awaited<ReturnType<typeof prepareInvoiceRecordSource>>;
    beforeEach(async () => {
      source = await prepareInvoiceRecordSource(fixture);
    });

    it('preserves literal minor-unit/null declarations through correction, terminal withdrawal, explicit replacement and two restarts', async () => {
      const createKey = randomUUID();
      const created = await source.create(source.createBody, createKey);
      expect(created.status).toBe(201);
      const createReceipt = responseRecord(await created.json()),
        id = responseString(createReceipt, 'recordId');
      const initial = await source.read(`/invoice-records/${id}`);
      expect(responseRecord(initial.record).values).toEqual({
        externalSystem: ' Fictional manual process ',
        externalNumber: 'SYN-INV-001',
        issuedOn: '2026-01-15',
        dueOn: null,
        currency: 'MDL',
        grossMinor: '125500',
        netMinor: null,
        taxMinor: null,
      });
      const values = {
        externalSystem: ' Fictional manual process ',
        externalNumber: '  Factură 😀 / 001  ',
        issuedOn: '2032-02-29',
        dueOn: '0001-01-01',
        currency: 'MDL',
        grossMinor: '125550',
        netMinor: '100000',
        taxMinor: '0',
      };
      const correction = {
          action: 'CORRECT',
          expectedRevision: 1,
          values,
          reason: '  Transcription corrigée sur la source conservée 😀  ',
        },
        correctionKey = randomUUID();
      const corrected = await source.command({
        recordId: id,
        body: correction,
        key: correctionKey,
      });
      expect(corrected.status).toBe(201);
      const correctionReceipt: unknown = await corrected.json();
      const current = await source.read(`/invoice-records/${id}`);
      expect(responseRecord(current.record)).toMatchObject({
        revision: 2,
        entryState: 'RECORDED',
        values,
      });
      expect(responseRecord(current.history).items).toMatchObject([
        {
          revision: 2,
          before: { entryState: 'RECORDED', values: source.createBody.values },
          after: { entryState: 'RECORDED', values },
          reason: correction.reason,
        },
        { revision: 1, before: null, reason: null },
      ]);
      const effects = await invoiceRecordEffects(fixture),
        noChangeKey = randomUUID();
      expect(
        (
          await source.command({
            recordId: id,
            body: { ...correction, expectedRevision: 2 },
            key: noChangeKey,
          })
        ).status,
      ).toBe(409);
      expect(await invoiceRecordEffects(fixture)).toEqual(effects);
      const withdrawal = {
        action: 'WITHDRAW_ENTRY',
        expectedRevision: 2,
        reason: '  PRISMA entry only; no external cancellation.  ',
      };
      const withdrawn = await source.command({
        recordId: id,
        body: withdrawal,
        key: noChangeKey,
      });
      expect(withdrawn.status).toBe(201);
      const withdrawalReceipt: unknown = await withdrawn.json();
      const replayCorrection = await source.command({
        recordId: id,
        body: correction,
        key: correctionKey,
      });
      expect(replayCorrection.status).toBe(201);
      expect(await replayCorrection.json()).toEqual(correctionReceipt);
      expect((await source.create()).status).toBe(409);
      const replacementBody = {
          ...source.createBody,
          values: {
            ...values,
            currency: 'EUR',
            grossMinor: '99999999999999',
            netMinor: null,
            taxMinor: '0',
          },
          replacesWithdrawnRecordId: id,
        },
        replacementKey = randomUUID();
      const replaced = await source.create(replacementBody, replacementKey);
      expect(replaced.status).toBe(201);
      const replacementReceipt = responseRecord(await replaced.json()),
        replacementId = responseString(replacementReceipt, 'recordId');
      const original = await source.read(`/invoice-records/${id}`),
        replacement = await source.read(`/invoice-records/${replacementId}`);
      expect(responseRecord(original.record)).toMatchObject({
        entryState: 'WITHDRAWN',
        revision: 3,
        values,
        replacementRecordId: replacementId,
      });
      expect(responseRecord(replacement.record)).toMatchObject({
        entryState: 'RECORDED',
        revision: 1,
        values: replacementBody.values,
        replacesWithdrawnRecordId: id,
      });
      expect(responseRecord(original.record).copiedContext).toEqual(
        responseRecord(replacement.record).copiedContext,
      );
      const inventory = await source.read('/invoice-records');
      expect(inventory.items).toHaveLength(2);
      for (let restart = 0; restart < 2; restart++) {
        await fixture.restart();
        expect(await source.read(`/invoice-records/${id}`)).toEqual(original);
        expect(await source.read(`/invoice-records/${replacementId}`)).toEqual(
          replacement,
        );
        expect(await source.read('/invoice-records')).toEqual(inventory);
        const replay = await source.create(source.createBody, createKey);
        expect(replay.status).toBe(201);
        expect(await replay.json()).toEqual(createReceipt);
        const withdrawalReplay = await source.command({
          recordId: id,
          body: withdrawal,
          key: noChangeKey,
        });
        expect(withdrawalReplay.status).toBe(201);
        expect(await withdrawalReplay.json()).toEqual(withdrawalReceipt);
        const replacementReplay = await source.create(
          replacementBody,
          replacementKey,
        );
        expect(replacementReplay.status).toBe(201);
        expect(await replacementReplay.json()).toEqual(replacementReceipt);
        const pdf = await source.request(`/invoice-records/${id}/source`);
        expect(pdf.status).toBe(200);
        expect(Buffer.from(await pdf.arrayBuffer())).toEqual(source.bytes);
      }
    });
  });
  it('conflicts for an existing uploaded financial draft without reserving the key, while its exact official sibling stays independently eligible', async () => {
    const source = await prepareInvoiceRecordSource(fixture);
    const successor = await source.mutate('/versions', { expectedRevision: 3 });
    expect(successor.status).toBe(201);
    const versionId = responseString(
      responseRecord(await successor.json()),
      'versionId',
    );
    const uploaded = await source.upload(versionId, 4, source.bytes);
    expect(uploaded.status).toBe(201);
    const representationId = responseString(
      responseRecord(await uploaded.json()),
      'representationId',
    );
    const selector = await source.read('/invoice-records/sources');
    expect(selector.items).toMatchObject([{ source: source.source }]);
    const before = await invoiceRecordEffects(fixture),
      key = randomUUID();
    const refused = await source.create(
      {
        ...source.createBody,
        source: {
          documentId: source.source.documentId,
          documentVersionId: versionId,
          representationId,
        },
      },
      key,
    );
    expect(refused.status).toBe(409);
    expect(await invoiceRecordEffects(fixture)).toEqual(before);
    const created = await source.create(source.createBody, key);
    expect(created.status).toBe(201);
    const id = responseString(responseRecord(await created.json()), 'recordId');
    const pdf = await source.request(`/invoice-records/${id}/source`);
    expect(pdf.status).toBe(200);
    expect(Buffer.from(await pdf.arrayBuffer())).toEqual(source.bytes);
  });

  it('rejects malformed declarations before reserving their key and keeps each declared currency independent', async () => {
    const source = await prepareInvoiceRecordSource(fixture),
      key = randomUUID(),
      effects = await invoiceRecordEffects(fixture);
    const invalidValues = [
      { grossMinor: 125500 },
      { grossMinor: '0' },
      { grossMinor: '01' },
      { grossMinor: '1.00' },
      { grossMinor: '100000000000000' },
      { grossMinor: '1e2' },
      { netMinor: '-1' },
      { taxMinor: 0 },
      { externalSystem: '\u0085' },
      { externalNumber: 'bad\ud800' },
      { issuedOn: '2025-02-29' },
      { dueOn: '0000-01-01' },
      { currency: 'GBP' },
      { derivedTax: '0' },
    ];
    for (const invalid of invalidValues) {
      const response = await source.create(
        {
          ...source.createBody,
          values: { ...source.createBody.values, ...invalid },
        },
        key,
      );
      expect(response.status).toBe(400);
      expect(await invoiceRecordEffects(fixture)).toEqual(effects);
    }
    const accepted = await source.create(
      {
        ...source.createBody,
        values: { ...source.createBody.values, netMinor: '0', taxMinor: '0' },
      },
      key,
    );
    expect(accepted.status).toBe(201);
    const receipt = responseRecord(await accepted.json()),
      id = responseString(receipt, 'recordId');
    let revision = 1;
    for (const currency of ['EUR', 'RON', 'USD', 'MDL']) {
      const values = {
        ...source.createBody.values,
        currency,
        netMinor: '100000',
        taxMinor: '10000',
        grossMinor: '125550',
      };
      const corrected = await source.command({
        recordId: id,
        body: {
          action: 'CORRECT',
          expectedRevision: revision,
          values,
          reason: 'Independent declarations need not add up.',
        },
      });
      expect(corrected.status).toBe(201);
      revision++;
      expect(
        responseRecord((await source.read(`/invoice-records/${id}`)).record)
          .values,
      ).toEqual(values);
    }
  });
});
