import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { revokeModelContractFixtureGrant } from '../contract/model-contract.test-fixture.js';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  prepareAdditionalInvoiceRecordSource,
  prepareInvoiceRecordSource,
  prepareInvoiceRecordSourceInNewCompany,
} from './invoice-record.proof-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

withPostgres('Invoice Record bounded, head-bound public continuation', () => {
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

  describe('history continuation with another native Company source', () => {
    let other: Awaited<
      ReturnType<typeof prepareInvoiceRecordSourceInNewCompany>
    >;
    beforeEach(async () => {
      other = await prepareInvoiceRecordSourceInNewCompany(fixture, {
        clientTaxId: 'FICTIONAL-CURSOR-COMPANY-1030',
      });
    });

    it('reads 27 native revisions as 25+2, refuses actor/Company/tamper reuse, and reloads deliberately when the head changes', async () => {
      const created = await source.create();
      expect(created.status).toBe(201);
      const recordId = responseString(
        responseRecord(await created.json()),
        'recordId',
      );
      for (let revision = 1; revision < 27; revision++) {
        const correction = await source.command({
          recordId,
          body: {
            action: 'CORRECT',
            expectedRevision: revision,
            values: {
              ...source.createBody.values,
              grossMinor: (125500n + BigInt(revision)).toString(),
            },
            reason: `Fictional declared transcription revision ${revision + 1}`,
          },
        });
        expect(correction.status).toBe(201);
        expect(responseRecord(await correction.json()).revision).toBe(
          revision + 1,
        );
      }
      const first = await source.read(`/invoice-records/${recordId}/history`);
      expect(first).toMatchObject({
        format: 'EXTERNAL_INVOICE_HISTORY/1',
        companyId: source.companyId,
        recordId,
        headRevision: 27,
      });
      expect(revisionNumbers(first)).toEqual(
        Array.from({ length: 25 }, (_, index) => 27 - index),
      );
      const cursor = responseString(first, 'nextCursor');
      const continuationPath = `/invoice-records/${recordId}/history?cursor=${encodeURIComponent(cursor)}`;
      const second = await source.read(continuationPath);
      expect(second).toMatchObject({
        recordId,
        headRevision: 27,
        nextCursor: null,
      });
      expect(revisionNumbers(second)).toEqual([2, 1]);
      const current = await source.read(`/invoice-records/${recordId}`);
      expect(responseRecord(current.record).revision).toBe(27);
      expect(responseRecord(current.history).items).toEqual(first.items);
      expect(responseRecord(current.history).nextCursor).toBe(cursor);

      const tampered = `${cursor.startsWith('A') ? 'B' : 'A'}${cursor.slice(1)}`;
      const tamperResponse = await source.request(
        `/invoice-records/${recordId}/history?cursor=${encodeURIComponent(tampered)}`,
      );
      expect(tamperResponse.status).toBe(400);
      await fixture.grant({
        path: '/company-invoice-reader-assignments',
        companyId: source.companyId,
        membershipId: source.f.ready.source.readerMembershipId,
      });
      const reader = {
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_READER,
      };
      const readerControl = responseRecord(
        await fixture.read({
          ...reader,
          path: `/invoice-records/${recordId}/history`,
        }),
      );
      expect(readerControl.items).toEqual(first.items);
      expect(
        (await fixture.request({ ...reader, path: continuationPath })).status,
      ).toBe(400);

      expect(other.companyId).not.toBe(source.companyId);
      const otherCreated = await other.create();
      expect(otherCreated.status).toBe(201);
      const otherId = responseString(
        responseRecord(await otherCreated.json()),
        'recordId',
      );
      const otherPath = `/invoice-records/${otherId}/history`;
      const otherControl = responseRecord(
        await fixture.read({ ...other.target, path: otherPath }),
      );
      expect(otherControl).toMatchObject({
        companyId: other.companyId,
        recordId: otherId,
        headRevision: 1,
        nextCursor: null,
      });
      const crossCompany = await fixture.request({
        ...other.target,
        path: `${otherPath}?cursor=${encodeURIComponent(cursor)}`,
      });
      expect(crossCompany.status).toBe(400);
      expect(JSON.stringify(await crossCompany.json())).not.toContain(recordId);

      const interleaved = await source.command({
        recordId,
        body: {
          action: 'CORRECT',
          expectedRevision: 27,
          values: { ...source.createBody.values, grossMinor: '125550' },
          reason: 'A new declaration retires the earlier continuation head',
        },
      });
      expect(interleaved.status).toBe(201);
      const changedHead = await source.request(continuationPath);
      expect(changedHead.status).toBe(409);
      expect(await changedHead.json()).toMatchObject({
        code: 'INVOICE_HISTORY_CHANGED',
      });
      const refreshed = await source.read(
        `/invoice-records/${recordId}/history`,
      );
      expect(refreshed.headRevision).toBe(28);
      expect(revisionNumbers(refreshed)).toEqual(
        Array.from({ length: 25 }, (_, index) => 28 - index),
      );
      const freshCursor = responseString(refreshed, 'nextCursor');
      expect(
        revisionNumbers(
          await source.read(
            `/invoice-records/${recordId}/history?cursor=${encodeURIComponent(freshCursor)}`,
          ),
        ),
      ).toEqual([3, 2, 1]);

      await revokeModelContractFixtureGrant(
        fixture,
        '/company-invoice-recorder-assignments',
        source.companyId,
        source.membershipId,
      );
      await fixture.grant({
        path: '/company-invoice-recorder-assignments',
        companyId: source.companyId,
        membershipId: source.membershipId,
      });
      const replacementControl = await source.read(
        `/invoice-records/${recordId}/history`,
      );
      expect(replacementControl.headRevision).toBe(28);
      expect(replacementControl.items).toEqual(refreshed.items);
      expect(replacementControl.readCapture).not.toBe(refreshed.readCapture);
      const retiredCapture = await source.request(
        `/invoice-records/${recordId}/history?cursor=${encodeURIComponent(freshCursor)}`,
      );
      expect(retiredCapture.status).toBe(400);
    });
  });

  it('lists 26 native linked entries as 25+1 in descending creation order with both entry states and no totals or search', async () => {
    const created: Array<{
      id: string;
      createdAt: string;
      replacesWithdrawnRecordId: string | null;
    }> = [];
    let predecessorId: string | null = null;
    for (let index = 0; index < 26; index++) {
      if (predecessorId !== null) {
        const withdrawal = await source.command({
          recordId: predecessorId,
          body: {
            action: 'WITHDRAW_ENTRY',
            expectedRevision: 1,
            reason: `Fictional entry ${index} withdrawn before explicit replacement`,
          },
        });
        expect(withdrawal.status).toBe(201);
        expect(responseRecord(await withdrawal.json())).toMatchObject({
          recordId: predecessorId,
          action: 'WITHDRAW_ENTRY',
          revision: 2,
        });
      }
      const response = await source.create({
        ...source.createBody,
        replacesWithdrawnRecordId: predecessorId,
      });
      expect(response.status).toBe(201);
      const receipt = responseRecord(await response.json());
      expect(receipt).toMatchObject({ action: 'CREATE', revision: 1 });
      const recordId = responseString(receipt, 'recordId');
      created.push({
        id: recordId,
        createdAt: responseString(receipt, 'recordedAt'),
        replacesWithdrawnRecordId: predecessorId,
      });
      predecessorId = recordId;
    }
    const ordered = [...created].sort((a, b) => {
      if (a.createdAt !== b.createdAt)
        return a.createdAt < b.createdAt ? 1 : -1;
      return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
    });
    const first = await source.read('/invoice-records');
    expect(first).toMatchObject({
      format: 'EXTERNAL_INVOICE_INVENTORY/1',
      companyId: source.companyId,
    });
    const firstItems = pageItems(first);
    expect(firstItems).toHaveLength(25);
    expect(firstItems.map((item) => responseString(item, 'id'))).toEqual(
      ordered.slice(0, 25).map((item) => item.id),
    );
    const cursor = responseString(first, 'nextCursor');
    const second = await source.read(
      `/invoice-records?cursor=${encodeURIComponent(cursor)}`,
    );
    expect(second).toMatchObject({
      format: 'EXTERNAL_INVOICE_INVENTORY/1',
      companyId: source.companyId,
      nextCursor: null,
    });
    const secondItems = pageItems(second);
    expect(secondItems).toHaveLength(1);
    expect(secondItems.map((item) => responseString(item, 'id'))).toEqual(
      ordered.slice(25).map((item) => item.id),
    );
    const all = [...firstItems, ...secondItems];
    expect(new Set(all.map((item) => responseString(item, 'id'))).size).toBe(
      26,
    );
    created.forEach((record, index) => {
      const item = all.find((row) => row.id === record.id);
      expect(item).toMatchObject({
        id: record.id,
        createdAt: record.createdAt,
        revision: index === 25 ? 1 : 2,
        entryState: index === 25 ? 'RECORDED' : 'WITHDRAWN',
        values: source.createBody.values,
        replacesWithdrawnRecordId: record.replacesWithdrawnRecordId,
        replacementRecordId: created[index + 1]?.id ?? null,
      });
    });
    for (const page of [first, second])
      for (const forbidden of [
        'count',
        'total',
        'totalCount',
        'balance',
        'search',
      ])
        expect(page).not.toHaveProperty(forbidden);
    const tampered = `${cursor.startsWith('A') ? 'B' : 'A'}${cursor.slice(1)}`;
    expect(
      (
        await source.request(
          `/invoice-records?cursor=${encodeURIComponent(tampered)}`,
        )
      ).status,
    ).toBe(400);
    expect(
      (await source.request('/invoice-records?externalNumber=SYN-INV-001'))
        .status,
    ).toBe(400);
    expect((await source.read('/invoice-records')).items).toEqual(first.items);
  });

  it('retains two RECORDED entries with the same external number when their exact native Documents differ', async () => {
    const first = await source.create();
    expect(first.status).toBe(201);
    const firstId = responseString(
      responseRecord(await first.json()),
      'recordId',
    );
    const other = await prepareAdditionalInvoiceRecordSource(fixture, {
      target: source.target,
      body: source.body,
      title: 'Different fictional invoice — same declared external number',
    });
    expect(other.source.documentId).not.toBe(source.source.documentId);
    const second = await other.create();
    expect(second.status).toBe(201);
    const secondId = responseString(
      responseRecord(await second.json()),
      'recordId',
    );
    const inventory = await source.read('/invoice-records');
    expect(pageItems(inventory)).toHaveLength(2);
    expect(pageItems(inventory)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstId,
          entryState: 'RECORDED',
          revision: 1,
          values: source.createBody.values,
        }),
        expect.objectContaining({
          id: secondId,
          entryState: 'RECORDED',
          revision: 1,
          values: source.createBody.values,
        }),
      ]),
    );
    expect(inventory.nextCursor).toBe(null);
  });
});

function revisionNumbers(page: Record<string, unknown>): number[] {
  return pageItems(page).map((item) => {
    const revision = item.revision;
    if (typeof revision !== 'number')
      throw new Error('Expected history revision.');
    return revision;
  });
}

function pageItems(page: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(page.items))
    throw new Error('Expected bounded page items.');
  return page.items.map(responseRecord);
}
