import { revokeModelContractFixtureGrant } from '../contract/model-contract.test-fixture.js';
import { randomUUID } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import { DocumentPdfStorage } from '../documents/document-pdf-storage.js';
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
withPostgres('Invoice Record independent financial copy lifetime', () => {
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
  it('keeps the copied financial fact readable through a real storage-adapter outage while exact bytes and fresh correction remain unavailable', async () => {
    const source = await prepareInvoiceRecordSource(fixture),
      created = await source.create();
    expect(created.status).toBe(201);
    const id = responseString(responseRecord(await created.json()), 'recordId'),
      before = await source.read(`/invoice-records/${id}`),
      effects = await invoiceRecordEffects(fixture);
    const control = await source.request(`/invoice-records/${id}/source`);
    expect(control.status).toBe(200);
    expect(Buffer.from(await control.arrayBuffer())).toEqual(source.bytes);
    const body = {
        action: 'CORRECT',
        expectedRevision: 1,
        values: { ...source.createBody.values, grossMinor: '125550' },
        reason:
          'Manual correction remains an independently gated source operation.',
      },
      key = randomUUID();
    // Fault only the external storage adapter. Every financial fact, role,
    // authority check, source relation and PostgreSQL business path stays real.
    const outage = vi
      .spyOn(DocumentPdfStorage.prototype, 'read')
      .mockRejectedValue(
        new ServiceUnavailableException('Synthetic private storage outage'),
      );
    try {
      const current = await source.request(`/invoice-records/${id}`);
      expect(current.status).toBe(200);
      expect(responseRecord(await current.json()).record).toEqual(
        before.record,
      );
      const pdf = await source.request(`/invoice-records/${id}/source`);
      expect(pdf.status).toBe(503);
      expect((await source.command({ recordId: id, body, key })).status).toBe(
        503,
      );
      expect(await invoiceRecordEffects(fixture)).toEqual(effects);
      expect(
        responseRecord(await source.read(`/invoice-records/${id}`)).record,
      ).toEqual(before.record);
    } finally {
      outage.mockRestore();
    }
    const restored = await source.request(`/invoice-records/${id}/source`);
    expect(restored.status).toBe(200);
    expect(Buffer.from(await restored.arrayBuffer())).toEqual(source.bytes);
    expect((await source.command({ recordId: id, body, key })).status).toBe(
      201,
    );
  });
  it('keeps the consumed financial read capture stable when unconsumed Client access is withdrawn but independent Company context stays live', async () => {
    const source = await prepareInvoiceRecordSource(fixture),
      created = await source.create();
    expect(created.status).toBe(201);
    const id = responseString(responseRecord(await created.json()), 'recordId'),
      before = await source.read(`/invoice-records/${id}`);
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-director-client-assignments',
      source.companyId,
      source.membershipId,
    );
    const current = await source.read(`/invoice-records/${id}`);
    expect(current.record).toEqual(before.record);
    expect(current.readCapture).toBe(before.readCapture);
    expect(current.capabilities).toEqual({
      canCorrect: false,
      canWithdraw: true,
    });
    const withdrawn = await source.command({
      recordId: id,
      body: {
        action: 'WITHDRAW_ENTRY',
        expectedRevision: 1,
        reason:
          'Financial withdrawal remains independent from optional Client disclosure.',
      },
    });
    expect(withdrawn.status).toBe(201);
  });
  it('retains copied reads under a newly captured Reader after Recorder withdrawal, and refuses them only after Reader withdrawal', async () => {
    const source = await prepareInvoiceRecordSource(fixture),
      created = await source.create();
    expect(created.status).toBe(201);
    const id = responseString(responseRecord(await created.json()), 'recordId'),
      before = await source.read(`/invoice-records/${id}`);
    await fixture.grant({
      path: '/company-invoice-reader-assignments',
      companyId: source.companyId,
      membershipId: source.membershipId,
    });
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-invoice-recorder-assignments',
      source.companyId,
      source.membershipId,
    );
    const reader = await source.read(`/invoice-records/${id}`);
    expect(reader.record).toEqual(before.record);
    expect(reader.history).toEqual(before.history);
    expect(reader.readCapture).not.toBe(before.readCapture);
    expect(reader.capabilities).toEqual({
      canCorrect: false,
      canWithdraw: false,
    });
    const effects = await invoiceRecordEffects(fixture);
    expect(
      (
        await source.command({
          recordId: id,
          body: {
            action: 'WITHDRAW_ENTRY',
            expectedRevision: 1,
            reason: 'Recorder is withdrawn; this write has no authority.',
          },
        })
      ).status,
    ).toBe(403);
    const stillReadable = await source.read(`/invoice-records/${id}`);
    expect(stillReadable.record).toEqual(before.record);
    expect(stillReadable.history).toEqual(before.history);
    expect((await source.read('/invoice-records')).items).toEqual([
      reader.record,
    ]);
    expect(await invoiceRecordEffects(fixture)).toEqual(effects);
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-invoice-reader-assignments',
      source.companyId,
      source.membershipId,
    );
    expect((await source.request(`/invoice-records/${id}`)).status).toBe(403);
    expect(
      (await source.request(`/invoice-records/${id}/history`)).status,
    ).toBe(403);
  });
  it.each(['archived', 'superseded'])(
    'preserves the exact copied history and terminal withdrawal after the original Client becomes %s',
    async (status) => {
      const source = await prepareInvoiceRecordSource(fixture),
        created = await source.create();
      expect(created.status).toBe(201);
      const id = responseString(
        responseRecord(await created.json()),
        'recordId',
      );
      const corrected = await source.command({
        recordId: id,
        body: {
          action: 'CORRECT',
          expectedRevision: 1,
          values: {
            ...source.createBody.values,
            grossMinor: '125550',
            taxMinor: '0',
          },
          reason:
            '  Preserve this literal correction before Client retirement.  ',
        },
      });
      expect(corrected.status).toBe(201);
      const before = await source.read(`/invoice-records/${id}`),
        oldFacts = responseRecord(before.history).items;
      if (!Array.isArray(oldFacts))
        throw new Error('Expected retained revision facts.');
      // Native Client lifecycle fixture, following the Client owner's own
      // archived/superseded REST preconditions; no invented archive endpoint.
      const changed = await fixture.pool.query(
        'UPDATE client_accounts SET status=$2 WHERE id=$1 RETURNING id',
        [source.f.ready.source.clientId, status],
      );
      expect(changed.rowCount).toBe(1);
      const effects = await invoiceRecordEffects(fixture),
        current = await source.read(`/invoice-records/${id}`);
      expect(current.record).toEqual(before.record);
      expect(current.readCapture).toBe(before.readCapture);
      expect(current.capabilities).toEqual({
        canCorrect: false,
        canWithdraw: true,
      });
      expect(current.history).toEqual(before.history);
      expect((await source.request('/invoice-records')).status).toBe(200);
      expect(
        (await source.read(`/invoice-records/${id}/history`)).items,
      ).toEqual(oldFacts);
      expect((await source.create()).status).toBe(404);
      const refused = await source.command({
        recordId: id,
        body: {
          action: 'CORRECT',
          expectedRevision: 2,
          values: { ...source.createBody.values, grossMinor: '999900' },
          reason:
            'A fresh source use must retain active original Client eligibility.',
        },
      });
      expect(refused.status).toBe(404);
      expect(await invoiceRecordEffects(fixture)).toEqual(effects);
      const withdrawn = await source.command({
        recordId: id,
        body: {
          action: 'WITHDRAW_ENTRY',
          expectedRevision: 2,
          reason: 'Withdraw only the PRISMA entry after Client retirement.',
        },
      });
      expect(withdrawn.status).toBe(201);
      const terminal = await source.read(`/invoice-records/${id}`);
      expect(terminal.record).toMatchObject({
        entryState: 'WITHDRAWN',
        revision: 3,
        values: responseRecord(before.record).values,
        copiedContext: responseRecord(before.record).copiedContext,
      });
      expect(responseRecord(terminal.history).items).toEqual([
        expect.objectContaining({ action: 'WITHDRAW_ENTRY', revision: 3 }),
        ...oldFacts,
      ]);
    },
  );
  it('keeps the original financial copy, exact PDF and entry withdrawal through actual public Client union and reversal', async () => {
    const source = await prepareInvoiceRecordSource(fixture),
      created = await source.create();
    expect(created.status).toBe(201);
    const id = responseString(responseRecord(await created.json()), 'recordId'),
      before = await source.read(`/invoice-records/${id}`),
      originalClientId = source.f.ready.source.clientId;
    const command = (path: string, body: unknown) =>
      fixture.command({ ...source.target, path, body });
    const survivorId = responseString(
      responseRecord(
        await command('/clients', {
          displayName: 'Fictional surviving Invoice Client',
          taxId: 'FICTIONAL-SURVIVOR-1030',
          address: 'Fictional survivor address',
        }),
      ),
      'id',
    );
    // The native union requires a legacy duplicate. Both Clients were created
    // publicly; this historical-input seam matches the delivered Source proof.
    // All review, confirmation, reversal, Record and PDF actions remain HTTP.
    await fixture.pool.query(
      "UPDATE client_accounts SET tax_id='FICTIONAL-LEGACY-UNION-1030' WHERE id=ANY($1::uuid[])",
      [[originalClientId, survivorId]],
    );
    const reviewReference = responseString(
      responseRecord(
        await command(`/clients/${originalClientId}/union-reviews`, {}),
      ),
      'reviewReference',
    );
    const united = responseRecord(
      await command(`/client-union-reviews/${reviewReference}/confirm`, {
        canonicalClientId: survivorId,
        fields: {
          displayName: survivorId,
          taxId: originalClientId,
          address: survivorId,
          telephone: originalClientId,
          generalEmail: originalClientId,
          businessActivity: originalClientId,
        },
        companyIds: [source.companyId],
        reviewedDifferences: true,
        reason:
          'Fictional legacy duplicate reviewed without retargeting financial history.',
      }),
    );
    const afterUnion = await source.read(`/invoice-records/${id}`);
    expect(afterUnion.record).toEqual(before.record);
    expect(afterUnion.history).toEqual(before.history);
    expect(afterUnion.capabilities).toEqual({
      canCorrect: false,
      canWithdraw: true,
    });
    const pdf = await source.request(`/invoice-records/${id}/source`);
    expect(pdf.status).toBe(200);
    expect(Buffer.from(await pdf.arrayBuffer())).toEqual(source.bytes);
    const effects = await invoiceRecordEffects(fixture);
    expect((await source.create()).status).toBe(404);
    expect(
      (
        await source.command({
          recordId: id,
          body: {
            action: 'CORRECT',
            expectedRevision: 1,
            values: { ...source.createBody.values, grossMinor: '125550' },
            reason:
              'The superseded original is ineligible for a fresh source use.',
          },
        })
      ).status,
    ).toBe(404);
    expect(await invoiceRecordEffects(fixture)).toEqual(effects);
    expect(
      (
        await source.command({
          recordId: id,
          body: {
            action: 'WITHDRAW_ENTRY',
            expectedRevision: 1,
            reason:
              'Withdraw only this copied entry under independent Finance authority.',
          },
        })
      ).status,
    ).toBe(201);
    const terminal = await source.read(`/invoice-records/${id}`);
    const reversed = await command(
      `/client-union-operations/${responseString(united, 'projectionReference')}/reversal`,
      {
        companyIds: [source.companyId],
        reason: 'Fictional reviewed union reversal.',
      },
    );
    expect(responseRecord(reversed).outcome).toBe('reversed');
    const afterReversal = await source.read(`/invoice-records/${id}`);
    expect(afterReversal.record).toEqual(terminal.record);
    expect(afterReversal.history).toEqual(terminal.history);
    expect(afterReversal.record).toMatchObject({
      entryState: 'WITHDRAWN',
      revision: 2,
      values: responseRecord(before.record).values,
      copiedContext: responseRecord(before.record).copiedContext,
    });
    expect(afterReversal.capabilities).toEqual({
      canCorrect: false,
      canWithdraw: false,
    });
  });
});
