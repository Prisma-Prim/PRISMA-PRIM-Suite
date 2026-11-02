import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { revokeModelContractFixtureGrant } from '../contract/model-contract.test-fixture.js';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  ESTIMATE_OFFER_DIRECTOR,
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { prepareInvoiceRecordSource } from './invoice-record.proof-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const nativeLosses = [
  {
    name: 'financial Document family',
    paths: ['/company-external-invoice-access-assignments'],
    source: 'unavailable',
    relation: null,
  },
  {
    name: 'native content',
    paths: ['/company-document-content-reader-assignments'],
    source: 'metadata-only',
    relation: null,
  },
  {
    name: 'Contract and Opportunity',
    paths: [
      '/company-contract-preparer-assignments',
      '/company-contract-approver-assignments',
      '/company-commercial-intake-assignments',
    ],
    source: 'available',
    relation: 'contract',
  },
  {
    name: 'original Client',
    paths: ['/company-director-client-assignments'],
    source: 'unavailable',
    relation: 'client',
  },
];

withPostgres(
  'Invoice Record copied disclosure and native projection privacy',
  () => {
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

    it.each(nativeLosses)(
      'retains copied facts and terminal withdrawal after $name loss, while stronger commands and replay refuse',
      async (loss) => {
        const source = await prepareInvoiceRecordSource(fixture);
        const createKey = randomUUID();
        const created = await source.create(source.createBody, createKey);
        expect(created.status).toBe(201);
        const createReceipt = responseRecord(await created.json());
        const recordId = responseString(createReceipt, 'recordId');
        const correctionKey = randomUUID();
        const values = {
          ...source.createBody.values,
          grossMinor: '125550',
          taxMinor: '0',
        };
        const correction = {
          action: 'CORRECT',
          expectedRevision: 1,
          values,
          reason:
            '  Correct the literal transcription against the saved source 😀  ',
        };
        const corrected = await source.command({
          recordId,
          body: correction,
          key: correctionKey,
        });
        expect(corrected.status).toBe(201);
        const correctionReceipt = responseRecord(await corrected.json());
        const before = await source.read(`/invoice-records/${recordId}`);
        const historyBefore = responseRecord(before.history).items;

        // This independent native reader retains all original rights. The revoked
        // actor's unavailable projection must not be an outage or missing fixture.
        const controlMembershipId = source.f.ready.source.directorMembershipId;
        for (const path of [
          '/company-director-client-assignments',
          '/company-document-registrar-assignments',
          '/company-document-content-reader-assignments',
          '/company-invoice-reader-assignments',
          '/company-external-invoice-access-assignments',
        ])
          await fixture.grant({
            path,
            companyId: source.companyId,
            membershipId: controlMembershipId,
          });
        const exactControl = () =>
          fixture.request({
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_DIRECTOR,
            path: `/documents/${source.source.documentId}/versions/${source.source.documentVersionId}/content/${source.source.representationId}`,
          });
        const controlBefore = await exactControl();
        expect(controlBefore.status).toBe(200);
        expect(Buffer.from(await controlBefore.arrayBuffer())).toEqual(
          source.bytes,
        );

        for (const path of loss.paths)
          await revokeModelContractFixtureGrant(
            fixture,
            path,
            source.companyId,
            source.membershipId,
          );
        const current = await source.read(`/invoice-records/${recordId}`);
        expect(current.record).toEqual(before.record);
        expect(responseRecord(current.record).values).toEqual(values);
        expect(responseRecord(current.history).items).toEqual(historyBefore);
        expect(current.capabilities).toEqual({
          canCorrect: false,
          canWithdraw: true,
        });
        if (loss.source === 'unavailable')
          expect(current.liveSource).toEqual({ kind: 'UNAVAILABLE' });
        else {
          expect(current.liveSource).toMatchObject({
            kind: 'AVAILABLE',
            documentId: source.source.documentId,
            documentVersionId: source.source.documentVersionId,
            content:
              loss.source === 'metadata-only'
                ? { kind: 'UNAVAILABLE' }
                : {
                    kind: 'AVAILABLE',
                    representationId: source.source.representationId,
                  },
          });
          if (loss.source === 'metadata-only')
            expect(responseRecord(current.liveSource).content).toEqual({
              kind: 'UNAVAILABLE',
            });
        }
        if (loss.relation)
          expect(responseRecord(current.related)[loss.relation]).toEqual({
            kind: 'UNAVAILABLE',
          });
        const inventory = await source.read('/invoice-records');
        expect(inventory.items).toEqual([current.record]);
        const history = await source.read(
          `/invoice-records/${recordId}/history`,
        );
        expect(history.items).toEqual(historyBefore);
        if (loss.source !== 'available') {
          const visible = JSON.stringify({ current, inventory, history });
          for (const hidden of [
            source.source.representationId,
            'fictional-invoice.pdf',
            createHash('sha256').update(source.bytes).digest('hex'),
            ...(loss.source === 'unavailable'
              ? [source.source.documentId, source.source.documentVersionId]
              : []),
          ])
            expect(visible).not.toContain(hidden);
        }

        for (const denied of [
          await source.create(source.createBody, createKey),
          await source.create(),
          await source.command({
            recordId,
            body: correction,
            key: correctionKey,
          }),
          await source.command({
            recordId,
            body: {
              ...correction,
              expectedRevision: 2,
              values: { ...values, grossMinor: '125551' },
            },
          }),
        ])
          expect([403, 404]).toContain(denied.status);
        expect(
          (await source.read(`/invoice-records/${recordId}`)).record,
        ).toEqual(before.record);
        const download = await source.request(
          `/invoice-records/${recordId}/source`,
        );
        if (loss.source === 'available') {
          expect(download.status).toBe(200);
          expect(Buffer.from(await download.arrayBuffer())).toEqual(
            source.bytes,
          );
        } else expect([403, 404]).toContain(download.status);
        const afterDownload = await source.read(`/invoice-records/${recordId}`);
        expect(afterDownload.record).toEqual(before.record);
        expect(responseRecord(afterDownload.history).items).toEqual(
          historyBefore,
        );
        const controlAfter = await exactControl();
        expect(controlAfter.status).toBe(200);
        expect(Buffer.from(await controlAfter.arrayBuffer())).toEqual(
          source.bytes,
        );

        const withdrawal = {
          action: 'WITHDRAW_ENTRY',
          expectedRevision: 2,
          reason: '  Withdraw the PRISMA entry; no external cancellation.  ',
        };
        const withdrawalKey = randomUUID();
        const withdrawn = await source.command({
          recordId,
          body: withdrawal,
          key: withdrawalKey,
        });
        expect(withdrawn.status).toBe(201);
        const withdrawalReceipt: unknown = await withdrawn.json();
        const replay = await source.command({
          recordId,
          body: withdrawal,
          key: withdrawalKey,
        });
        expect(replay.status).toBe(201);
        expect(await replay.json()).toEqual(withdrawalReceipt);
        const terminal = await source.read(`/invoice-records/${recordId}`);
        expect(terminal.record).toEqual({
          ...responseRecord(before.record),
          revision: 3,
          entryState: 'WITHDRAWN',
        });
        expect(terminal.capabilities).toEqual({
          canCorrect: false,
          canWithdraw: false,
        });
        expect(responseRecord(terminal.history).items).toEqual([
          expect.objectContaining({
            revision: 3,
            action: 'WITHDRAW_ENTRY',
            before: { entryState: 'RECORDED', values },
            after: { entryState: 'WITHDRAWN', values },
            reason: withdrawal.reason,
          }),
          ...historyItems(historyBefore),
        ]);

        // Restoring independent authority allows committed CREATE/CORRECT replay
        // even though new commands would now refuse the withdrawn entry.
        for (const path of loss.paths)
          await fixture.grant({
            path,
            companyId: source.companyId,
            membershipId: source.membershipId,
          });
        const createReplay = await source.create(source.createBody, createKey);
        expect(createReplay.status).toBe(201);
        expect(await createReplay.json()).toEqual(createReceipt);
        const correctionReplay = await source.command({
          recordId,
          body: correction,
          key: correctionKey,
        });
        expect(correctionReplay.status).toBe(201);
        expect(await correctionReplay.json()).toEqual(correctionReceipt);
        expect(
          (await source.read(`/invoice-records/${recordId}`)).record,
        ).toEqual(terminal.record);
      },
    );

    it('discloses copied facts to the explicitly assigned finance-only reader without native links or command authority', async () => {
      const source = await prepareInvoiceRecordSource(fixture);
      const created = await source.create();
      expect(created.status).toBe(201);
      const receipt = responseRecord(await created.json());
      const recordId = responseString(receipt, 'recordId');
      const original = await source.read(`/invoice-records/${recordId}`);
      await fixture.grant({
        path: '/company-invoice-reader-assignments',
        companyId: source.companyId,
        membershipId: source.f.ready.source.readerMembershipId,
      });
      const reader = {
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_READER,
      };
      const detail = responseRecord(
        await fixture.read({ ...reader, path: `/invoice-records/${recordId}` }),
      );
      expect(detail.record).toEqual(original.record);
      expect(responseRecord(detail.history).items).toEqual(
        responseRecord(original.history).items,
      );
      expect(detail.liveSource).toEqual({ kind: 'UNAVAILABLE' });
      expect(detail.related).toEqual({
        contract: { kind: 'UNAVAILABLE' },
        client: { kind: 'UNAVAILABLE' },
      });
      expect(detail.capabilities).toEqual({
        canCorrect: false,
        canWithdraw: false,
      });
      for (const hidden of [
        source.source.documentId,
        source.source.documentVersionId,
        source.source.representationId,
        'fictional-invoice.pdf',
        createHash('sha256').update(source.bytes).digest('hex'),
      ])
        expect(JSON.stringify(detail)).not.toContain(hidden);
      expect(
        responseRecord(
          await fixture.read({ ...reader, path: '/invoice-records' }),
        ).items,
      ).toEqual([original.record]);
      for (const path of [
        '/invoice-records/sources',
        `/invoice-records/${recordId}/source`,
      ])
        expect([403, 404]).toContain(
          (await fixture.request({ ...reader, path })).status,
        );
      for (const action of [
        {
          action: 'CORRECT',
          expectedRevision: 1,
          values: { ...source.createBody.values, grossMinor: '125550' },
          reason: 'Reader has no recording authority',
        },
        {
          action: 'WITHDRAW_ENTRY',
          expectedRevision: 1,
          reason: 'Reader has no withdrawal authority',
        },
      ])
        expect(
          (
            await fixture.post({
              ...reader,
              path: `/invoice-records/${recordId}/commands`,
              body: action,
            })
          ).status,
        ).toBe(403);
      expect(
        (await source.read(`/invoice-records/${recordId}`)).record,
      ).toEqual(original.record);
    });

    it('excludes Record facts and restricted events from generic Activity and operational Home even for a financial recorder', async () => {
      const source = await prepareInvoiceRecordSource(fixture);
      for (const path of [
        '/company-invoice-reader-assignments',
        '/company-project-assignments',
        '/company-document-project-organizer-assignments',
        '/company-task-manager-assignments',
        '/company-task-result-recorder-assignments',
      ])
        await fixture.grant({
          path,
          companyId: source.companyId,
          membershipId: source.membershipId,
        });
      const genericPaths = ['/activity-log', '/operational-home'];
      const before = await Promise.all(
        genericPaths.map((path) => source.read(path)),
      );
      const created = await source.create({
        ...source.createBody,
        values: {
          ...source.createBody.values,
          externalNumber: 'PRIVATE-RECORD-REFERENCE-1030',
          externalSystem: 'Private transcription process 1030',
        },
      });
      expect(created.status).toBe(201);
      const receipt = responseRecord(await created.json());
      const recordId = responseString(receipt, 'recordId');
      const corrected = await source.command({
        recordId,
        body: {
          action: 'CORRECT',
          expectedRevision: 1,
          values: {
            ...source.createBody.values,
            externalNumber: 'PRIVATE-RECORD-REFERENCE-1030',
            externalSystem: 'Private transcription process 1030',
            grossMinor: '125550',
          },
          reason: 'Private corrected transcription reason 1030',
        },
      });
      expect(corrected.status).toBe(201);
      const correctionReceipt = responseRecord(await corrected.json());
      const withdrawn = await source.command({
        recordId,
        body: {
          action: 'WITHDRAW_ENTRY',
          expectedRevision: 2,
          reason: 'Private recorded withdrawal reason 1030',
        },
      });
      expect(withdrawn.status).toBe(201);
      const after = await Promise.all(
        genericPaths.map((path) => source.read(path)),
      );
      expect(after).toEqual(before);
      const serialized = JSON.stringify(after);
      for (const secret of [
        recordId,
        responseString(receipt, 'commandId'),
        responseString(correctionReceipt, 'commandId'),
        source.source.documentId,
        source.source.representationId,
        'PRIVATE-RECORD-REFERENCE-1030',
        'Private transcription process 1030',
        'Private recorded withdrawal reason 1030',
        'Private corrected transcription reason 1030',
        'invoice_record.created',
        'invoice_record.transcription.corrected',
        'invoice_record.entry.withdrawn',
      ])
        expect(serialized).not.toContain(secret);
    });
  },
);

function historyItems(value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new Error('Expected immutable history items.');
  return value;
}
