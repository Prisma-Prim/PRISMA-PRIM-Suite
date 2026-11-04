import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { revokeModelContractFixtureGrant } from '../contract/model-contract.test-fixture.js';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { prepareInvoiceRecordSource } from './invoice-record.proof-support.js';
import {
  prepareAdditionalCopiedRecordSource,
  type CopiedRecordSource,
} from './invoice-record.copied-context.test-support.js';

type Fixture = Awaited<ReturnType<typeof openEstimateOfferFixture>>;
type NativeInput = NonNullable<Parameters<Fixture['prepare']>[0]>;
const vectors: Array<{
  name: string;
  kind: 'PRIMARY' | 'ADDITIONAL';
  input: NativeInput;
}> = [
  {
    name: 'a native 201-character tax ID',
    kind: 'PRIMARY',
    input: { clientTaxId: 'T'.repeat(201) },
  },
  {
    name: 'native party bounds and internal line breaks or tabs',
    kind: 'PRIMARY',
    input: {
      clientDisplayName: 'Legal\n' + 'N'.repeat(194),
      clientTaxId: 'TAX\t' + 'T'.repeat(496),
      clientAddress: 'Address\n' + 'A'.repeat(1992),
    },
  },
  {
    name: 'a native Company label with an internal line break',
    kind: 'PRIMARY',
    input: { companyDisplayName: 'Fictional Company\nSecond line' },
  },
  {
    name: 'a native Company label longer than 1000 characters',
    kind: 'PRIMARY',
    input: { companyDisplayName: 'C'.repeat(1001) },
  },
  {
    name: 'a native ADDITIONAL party at its bounds with internal line breaks',
    kind: 'ADDITIONAL',
    input: {
      clientDisplayName: 'Legal\n' + 'N'.repeat(194),
      clientTaxId: 'TAX\t' + 'T'.repeat(496),
      clientAddress: 'Address\n' + 'A'.repeat(1992),
    },
  },
];
const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

withPostgres('Invoice Record native copied-context grammar', () => {
  let fixture: Fixture;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
    });
  });
  afterAll(async () => {
    await fixture?.close();
    await scanner?.close();
  });

  describe.each(vectors)('$name', ({ input, kind }) => {
    let source: CopiedRecordSource;
    beforeEach(async () => {
      await fixture.reset();
      scanner.reset();
      // Only native producer inputs vary. Every Company, Client, model,
      // Contract, declaration, source, byte and grant uses real HTTP/PostgreSQL.
      source =
        kind === 'PRIMARY'
          ? await prepareInvoiceRecordSource({
              ...fixture,
              prepare: (original = {}) =>
                fixture.prepare({ ...original, ...input }),
            })
          : await prepareAdditionalCopiedRecordSource(fixture, {
              legalName: input.clientDisplayName ?? 'Additional native party',
              taxId: input.clientTaxId ?? 'ADDITIONAL-SYNTHETIC-1030',
              legalAddress: input.clientAddress ?? 'Additional native address',
            });
    });

    it('preserves exact copies through reads, commands, replays and restart without fresh Client access', async () => {
      const createKey = randomUUID();
      const invalid = await source.create(
        {
          ...source.createBody,
          values: {
            ...source.createBody.values,
            externalSystem: 'Manual\ninput stays strict',
          },
        },
        createKey,
      );
      expect(invalid.status).toBe(400);
      const created = await source.create(source.createBody, createKey);
      expect(created.status).toBe(201);
      const createReceipt: unknown = await created.json();
      const id = responseString(responseRecord(createReceipt), 'recordId');
      const initialResponse = await source.request(`/invoice-records/${id}`);
      expect(initialResponse.status).toBe(200);
      const initial = responseRecord(await initialResponse.json());
      const copiedContext = responseRecord(initial.record).copiedContext;
      expect(copiedContext).toMatchObject({
        companyLabel:
          input.companyDisplayName ?? 'Synthetic internal Offer Company',
        receivingParty: {
          kind,
          legalName:
            input.clientDisplayName ?? 'Synthetic internal Offer Client',
          taxIdentifier: input.clientTaxId ?? 'SYNTHETIC-842',
          address: input.clientAddress ?? '842 Example Street',
        },
      });
      const inventory = await source.read('/invoice-records');
      expect(inventory.items).toMatchObject([{ id, copiedContext }]);
      const firstHistory = await source.read(`/invoice-records/${id}/history`);
      expect(firstHistory.items).toMatchObject([{ revision: 1 }]);

      const correctionKey = randomUUID();
      const correction = {
        action: 'CORRECT',
        expectedRevision: 1,
        values: { ...source.createBody.values, grossMinor: '125550' },
        reason: 'Literal transcription correction, not a party correction',
      };
      expect(
        (
          await source.command({
            recordId: id,
            key: correctionKey,
            body: { ...correction, reason: 'Manual\nreason stays strict' },
          })
        ).status,
      ).toBe(400);
      const corrected = await source.command({
        recordId: id,
        body: correction,
        key: correctionKey,
      });
      expect(corrected.status).toBe(201);
      const correctionReceipt: unknown = await corrected.json();
      const replayCreate = await source.create(source.createBody, createKey);
      expect(replayCreate.status).toBe(201);
      expect(await replayCreate.json()).toEqual(createReceipt);
      const replayCorrection = await source.command({
        recordId: id,
        body: correction,
        key: correctionKey,
      });
      expect(replayCorrection.status).toBe(201);
      expect(await replayCorrection.json()).toEqual(correctionReceipt);

      await revokeModelContractFixtureGrant(
        fixture,
        '/company-director-client-assignments',
        source.companyId,
        source.membershipId,
      );
      const independent = await source.read(`/invoice-records/${id}`);
      expect(responseRecord(independent.record).copiedContext).toEqual(
        copiedContext,
      );
      expect(responseRecord(independent.related).client).toEqual({
        kind: 'UNAVAILABLE',
      });
      const withdrawalKey = randomUUID();
      const withdrawal = {
        action: 'WITHDRAW_ENTRY',
        expectedRevision: 2,
        reason: 'Withdraw only this PRISMA entry',
      };
      const withdrawn = await source.command({
        recordId: id,
        body: withdrawal,
        key: withdrawalKey,
      });
      expect(withdrawn.status).toBe(201);
      const withdrawalReceipt: unknown = await withdrawn.json();
      await fixture.restart();
      const retained = await source.read(`/invoice-records/${id}`);
      expect(retained.record).toMatchObject({
        revision: 3,
        entryState: 'WITHDRAWN',
        values: correction.values,
        copiedContext,
      });
      expect(responseRecord(retained.history).items).toMatchObject([
        { revision: 3 },
        { revision: 2 },
        { revision: 1 },
      ]);
      const replayWithdrawal = await source.command({
        recordId: id,
        body: withdrawal,
        key: withdrawalKey,
      });
      expect(replayWithdrawal.status).toBe(201);
      expect(await replayWithdrawal.json()).toEqual(withdrawalReceipt);
      expect((await source.create(source.createBody, createKey)).status).toBe(
        403,
      );
      const retainedInventory = await source.read('/invoice-records');
      expect(retainedInventory.items).toMatchObject([
        { id, entryState: 'WITHDRAWN', copiedContext },
      ]);
    });
  });
});
