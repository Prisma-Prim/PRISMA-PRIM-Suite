import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { revokeModelContractFixtureGrant } from '../contract/model-contract.test-fixture.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import {
  externalInvoiceEffects,
  fictionalInvoicePdf,
  openExternalInvoiceDocument,
  prepareExternalInvoiceSource,
} from './external-invoice.test-support.js';
import { ExternalInvoiceRelationsService } from './external-invoice-relations.service.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres(
  'Exact confidential external invoice content and failure conservation',
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
      vi.restoreAllMocks();
      await fixture?.close();
      await scanner?.close();
    });

    it('preserves a structurally readable fictional PDF at the exact native 5 MiB byte limit', async () => {
      const f = await openExternalInvoiceDocument(fixture);
      const versionId = responseString(
        responseRecord(f.document.version),
        'id',
      );
      const original = await fictionalInvoicePdf();
      const bytes = Buffer.concat([
        original,
        Buffer.alloc(5 * 1024 * 1024 - original.length - 6, 0x20),
        Buffer.from('\n%%EOF'),
      ]);
      expect(bytes.length).toBe(5242880);
      const uploaded = await f.upload(versionId, 1, bytes);
      expect(uploaded.status).toBe(201);
      const receipt = responseRecord(await uploaded.json());
      const response = await f.call(
        `/versions/${versionId}/content/${responseString(receipt, 'representationId')}`,
      );
      expect(response.status).toBe(200);
      expect(
        Buffer.compare(Buffer.from(await response.arrayBuffer()), bytes),
      ).toBe(0);
      const versions = responseRecord(await (await f.call('/versions')).json());
      expect(versions.versions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pdfContent: expect.objectContaining({ size: 5242880 }),
          }),
        ]),
      );
    });

    it('keeps existing native financial mutations usable after Contract and Opportunity read loss while refusing new registration and redacting only the relation', async () => {
      const f = await openExternalInvoiceDocument(fixture);
      const versionId = responseString(
        responseRecord(f.document.version),
        'id',
      );
      for (const path of [
        '/company-contract-preparer-assignments',
        '/company-contract-approver-assignments',
        '/company-commercial-intake-assignments',
      ])
        await revokeModelContractFixtureGrant(
          fixture,
          path,
          f.companyId,
          f.membershipId,
        );
      expect(
        (
          await f.request(
            { ...f.body, title: 'A new inaccessible Contract source' },
            randomUUID(),
          )
        ).status,
      ).toBe(403);
      expect(
        responseRecord(await (await f.call('')).json()).externalInvoiceRelation,
      ).toEqual({ access: 'denied' });
      const corrected = await f.call('', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({
          expectedRevision: 1,
          title: 'Corrected independently readable native title',
          purpose: f.body.purpose,
        }),
      });
      expect(corrected.status).toBe(200);
      const bytes = await fictionalInvoicePdf();
      const upload = await f.upload(versionId, 2, bytes);
      expect(upload.status).toBe(201);
      expect(
        (
          await f.mutate(`/versions/${versionId}/official-designation`, {
            expectedRevision: 3,
          })
        ).status,
      ).toBe(200);
      const successor = await f.mutate('/versions', { expectedRevision: 4 });
      expect(successor.status).toBe(201);
      const exact = await f.call(`/versions/${versionId}/content`);
      expect(exact.status).toBe(200);
      expect(Buffer.from(await exact.arrayBuffer())).toEqual(bytes);
      const detail = responseRecord(await (await f.call('')).json());
      expect(detail.externalInvoiceRelation).toEqual({ access: 'denied' });
      expect(detail).not.toHaveProperty('createdByMembershipId');
      expect(detail.title).toBe(
        'Corrected independently readable native title',
      );
    });

    it('conserves distinct equal-byte uploads, empty successor, exact historical Versions and bytes after two restarts', async () => {
      const f = await openExternalInvoiceDocument(fixture);
      const originalRelation = responseRecord(
        f.document.externalInvoiceRelation,
      );
      const v1 = responseString(responseRecord(f.document.version), 'id');
      const pdfA = await fictionalInvoicePdf();
      const uploadKey = randomUUID();
      const first = await f.upload(v1, 1, pdfA, uploadKey);
      expect(first.status).toBe(201);
      const r1 = responseRecord(await first.json());
      const scans = scanner.scanCount;
      expect(await (await f.upload(v1, 1, pdfA, uploadKey)).json()).toEqual(r1);
      expect(scanner.scanCount).toBe(scans);
      const second = await f.upload(v1, 2, pdfA);
      expect(second.status).toBe(201);
      const r2 = responseRecord(await second.json());
      expect(r1.representationId).not.toBe(r2.representationId);
      const designated = await f.mutate(
        `/versions/${v1}/official-designation`,
        { expectedRevision: 3 },
      );
      expect(designated.status).toBe(200);
      const successor = await f.mutate('/versions', { expectedRevision: 4 });
      expect(successor.status).toBe(201);
      const v2 = responseString(
        responseRecord(await successor.json()),
        'versionId',
      );
      const empty = responseRecord(await (await f.call('/versions')).json());
      expect(empty.versions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: v2,
            status: 'draft',
            pdfContent: { state: 'absent' },
          }),
        ]),
      );
      const pdfB = await fictionalInvoicePdf('SYN-INV-002');
      const third = await f.upload(v2, 5, pdfB);
      expect(third.status).toBe(201);
      const r3 = responseRecord(await third.json());
      expect(
        (
          await f.mutate(`/versions/${v2}/official-designation`, {
            expectedRevision: 6,
          })
        ).status,
      ).toBe(200);
      for (let restart = 0; restart < 2; restart++) {
        await fixture.restart();
        const versions = responseRecord(
          await (await f.call('/versions')).json(),
        );
        expect(versions.versions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: v1, status: 'superseded' }),
            expect.objectContaining({ id: v2, status: 'official' }),
          ]),
        );
        for (const [versionId, representationId, expected] of [
          [v1, responseString(r1, 'representationId'), pdfA],
          [v1, responseString(r2, 'representationId'), pdfA],
          [v2, responseString(r3, 'representationId'), pdfB],
        ] satisfies Array<[string, string, Buffer]>) {
          const downloaded = await f.call(
            `/versions/${versionId}/content/${representationId}`,
          );
          expect(downloaded.status).toBe(200);
          expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(expected);
        }
        expect(
          responseRecord(await (await f.call('')).json())
            .externalInvoiceRelation,
        ).toEqual(originalRelation);
        expect(await f.register()).toEqual(await (await f.call('')).json());
      }
      const history = await f.call(`/versions/${v1}/content/history`);
      expect(responseRecord(await history.json()).uploads).toHaveLength(2);
    });

    it('separates relation, content and financial disclosure and leaves native received Documents readable', async () => {
      const f = await openExternalInvoiceDocument(fixture);
      const v = responseString(responseRecord(f.document.version), 'id');
      expect((await f.upload(v, 1, await fictionalInvoicePdf())).status).toBe(
        201,
      );
      for (const path of [
        '/company-contract-preparer-assignments',
        '/company-contract-approver-assignments',
        '/company-commercial-intake-assignments',
      ])
        await revokeModelContractFixtureGrant(
          fixture,
          path,
          f.companyId,
          f.membershipId,
        );
      const detail = responseRecord(await (await f.call('')).json());
      expect(detail.externalInvoiceRelation).toEqual({ access: 'denied' });
      expect(detail.title).toBe(f.body.title);
      expect((await f.call(`/versions/${v}/content`)).status).toBe(200);
      await revokeModelContractFixtureGrant(
        fixture,
        '/company-document-content-reader-assignments',
        f.companyId,
        f.membershipId,
      );
      const versions = responseRecord(await (await f.call('/versions')).json());
      expect(versions.versions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: v,
            pdfContent: { state: 'stored', access: 'denied' },
          }),
        ]),
      );
      expect(JSON.stringify(versions)).not.toContain('fictional-invoice.pdf');
      expect((await f.call(`/versions/${v}/content`)).status).toBe(403);
      await revokeModelContractFixtureGrant(
        fixture,
        '/company-external-invoice-access-assignments',
        f.companyId,
        f.membershipId,
      );
      expect((await f.call('')).status).toBe(404);
      expect((await f.call('/versions')).status).toBe(404);
      const visible = await fixture.read({ ...f.target, path: '/documents' });
      expect(JSON.stringify(visible)).not.toContain(f.documentId);
      expect(JSON.stringify(visible)).toContain(f.f.document.id);
    });

    it('refuses malformed registration and atomically rolls back final event and response-construction failures', async () => {
      const f = await prepareExternalInvoiceSource(fixture);
      const before = await externalInvoiceEffects(fixture);
      const missingDate = Object.fromEntries(
        Object.entries(f.body).filter(([field]) => field !== 'receivedOn'),
      );
      for (const body of [
        missingDate,
        { ...f.body, receivedOn: undefined },
        { ...f.body, receivedOn: '2026-02-29' },
        { ...f.body, receivedOn: '0000-01-01' },
        { ...f.body, sourceDescription: ' ' },
        { ...f.body, party: { kind: 'PRIMARY' } },
        { ...f.body, clientId: f.f.ready.source.clientId },
        { ...f.body, amount: 1255.5 },
      ])
        expect((await f.request(body, randomUUID())).status).toBe(400);
      expect(await externalInvoiceEffects(fixture)).toEqual(before);
      await fixture.pool.query(
        "CREATE FUNCTION fail_financial_registration_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM working_documents WHERE id=NEW.document_id AND type='external-invoice') THEN RAISE EXCEPTION 'Synthetic final event failure'; END IF; RETURN NEW; END $$",
      );
      await fixture.pool.query(
        'CREATE TRIGGER fail_financial_event BEFORE INSERT ON document_registration_events FOR EACH ROW EXECUTE FUNCTION fail_financial_registration_event()',
      );
      expect((await f.request()).status).toBe(500);
      expect(await externalInvoiceEffects(fixture)).toEqual(before);
      await fixture.pool.query(
        'DROP TRIGGER fail_financial_event ON document_registration_events',
      );
      const failure = vi
        .spyOn(ExternalInvoiceRelationsService.prototype, 'read')
        .mockRejectedValueOnce(
          new Error('Synthetic response-construction failure'),
        );
      try {
        expect((await f.request()).status).toBe(500);
        expect(await externalInvoiceEffects(fixture)).toEqual(before);
      } finally {
        failure.mockRestore();
      }
      expect((await f.request()).status).toBe(201);
    });
  },
);
