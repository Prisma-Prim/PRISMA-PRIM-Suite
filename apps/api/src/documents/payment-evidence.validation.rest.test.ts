import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PDFDocument, PDFHexString, PDFName } from 'pdf-lib';
import {
  createPaymentEvidenceFixture,
  paymentJson,
  paymentNoticePdf,
  paymentRecord,
  paymentText,
  type PaymentEvidenceFixture,
} from './payment-evidence.test-support.js';
import {
  paymentEvidenceEffects,
  paymentSourceBody,
  registerPaymentSource,
} from './payment-evidence-proof.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres(
  'Payment Evidence Source closed registration and native content bounds',
  () => {
    let fixture: PaymentEvidenceFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await createPaymentEvidenceFixture(databaseUrl);
    });
    beforeEach(async () => {
      await fixture.reset();
    });
    afterAll(async () => {
      await fixture?.close();
    });

    it.each([
      { amount: '1255.50' },
      { currency: 'MDL' },
      { workspaceId: '00000000-0000-4000-8000-000000001045' },
      { registeredBy: {} },
      { paymentEvidenceSource: {} },
      { status: 'official' },
      { projectId: null },
      { receivedOn: '2026-02-30' },
      { receivedOn: '0000-01-01' },
      { receivedOn: '2026-1-15' },
      { receivedOn: '2026-01-15T00:00:00Z' },
      { receivedOn: '' },
      { receivedOn: 20260115 },
      { title: ' ' },
      { title: 'x'.repeat(201) },
      { purpose: 'x'.repeat(2001) },
      { sourceDescription: 'x'.repeat(2001) },
      { sourceDescription: '\0' },
      { payer: { kind: 'PRIMARY', legalName: 'Supplied identity' } },
      { payer: { kind: 'ADDITIONAL' } },
      { payer: { kind: 'CANONICAL' } },
    ])(
      'refuses supplied ownership, money, invalid date or malformed closed fields %# without effects',
      async (patch) => {
        const before = await paymentEvidenceEffects(fixture.pool);
        const response = await fixture.call('/documents', {
          method: 'POST',
          body: { ...paymentSourceBody(fixture), ...patch },
        });
        expect(response.status, await response.clone().text()).toBe(400);
        expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
      },
    );

    it('preserves literal Unicode and a leap calendar date while refusing changed intent under the same native key', async () => {
      const literal = '<script>literal()</script> Ș Я é 😀\nsecond line';
      const body = {
        ...paymentSourceBody(fixture),
        title: literal,
        purpose: literal,
        sourceDescription: literal,
        receivedOn: '2024-02-29',
      };
      const key = 'fictional-source-calendar-literal';
      const created = await fixture.call('/documents', {
        method: 'POST',
        key,
        body,
      });
      expect(created.status, await created.clone().text()).toBe(201);
      const document = await paymentJson(created);
      expect(document).toMatchObject({
        title: literal,
        purpose: literal,
        paymentEvidenceSource: {
          sourceDescription: literal,
          receivedOn: '2024-02-29',
        },
      });
      const replay = await fixture.call('/documents', {
        method: 'POST',
        key,
        body,
      });
      expect(replay.status).toBe(201);
      expect(await paymentJson(replay)).toEqual(document);
      const before = await paymentEvidenceEffects(fixture.pool);
      expect(
        (
          await fixture.call('/documents', {
            method: 'POST',
            key,
            body: { ...body, receivedOn: null },
          })
        ).status,
      ).toBe(409);
      expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
    });

    it('fails closed on actual oversized, malformed, infected, uncertain and unavailable-scanner bytes without effects', async () => {
      const source = await registerPaymentSource(fixture);
      const before = await paymentEvidenceEffects(fixture.pool);
      const bytes = await paymentNoticePdf();
      expect(
        (
          await fixture.upload({
            ...source,
            revision: 1,
            bytes: Buffer.alloc(5 * 1024 * 1024 + 1),
          })
        ).status,
      ).toBe(413);
      expect(
        (
          await fixture.upload({
            ...source,
            revision: 1,
            bytes: Buffer.from('not a PDF'),
          })
        ).status,
      ).toBe(400);
      expect(fixture.scanner.scanCount).toBe(0);
      for (const [mode, status] of [
        ['unsafe', 400],
        ['malformed', 503],
        ['unavailable', 503],
      ] as const) {
        fixture.scanner.setScanMode(mode);
        expect(
          (await fixture.upload({ ...source, revision: 1, bytes })).status,
        ).toBe(status);
        expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
      }
    });

    it('accepts exactly five MiB of valid native PDF bytes and preserves their exact historical identity', async () => {
      const source = await registerPaymentSource(fixture);
      const pdf = await paymentNoticePdf();
      const bytes = Buffer.concat([
        pdf,
        Buffer.alloc(5 * 1024 * 1024 - pdf.length - 6, 0x20),
        Buffer.from('\n%%EOF'),
      ]);
      expect(bytes.length).toBe(5 * 1024 * 1024);
      const response = await fixture.upload({ ...source, revision: 1, bytes });
      expect(response.status, await response.clone().text()).toBe(201);
      expect(fixture.scanner.scanCount).toBe(1);
      const representationId = paymentText(
        (await paymentJson(response)).representationId,
      );
      const read = await fixture.call(
        `/documents/${source.documentId}/versions/${source.versionId}/content/${representationId}`,
      );
      expect(read.status).toBe(200);
      expect(Buffer.compare(Buffer.from(await read.arrayBuffer()), bytes)).toBe(
        0,
      );
    });

    it('refuses a parser-readable encryption-marked PDF after native scanning and preserves every native effect', async () => {
      const source = await registerPaymentSource(fixture);
      const before = await paymentEvidenceEffects(fixture.pool);
      const marked = await PDFDocument.load(await paymentNoticePdf());
      // Standard encryption trailer exercises refusal, without a cryptographic claim.
      marked.context.trailerInfo.Encrypt = marked.context.register(
        marked.context.obj({
          Filter: PDFName.of('Standard'),
          V: 1,
          R: 2,
          O: PDFHexString.of('00'.repeat(32)),
          U: PDFHexString.of('00'.repeat(32)),
          P: -4,
        }),
      );
      expect(
        (
          await fixture.upload({
            ...source,
            revision: 1,
            bytes: Buffer.from(await marked.save()),
          })
        ).status,
      ).toBe(400);
      expect(fixture.scanner.scanCount).toBe(1);
      expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
    });

    // This new bounded lifecycle performs 149 native public commands; no fabricated Versions.
    it('creates fifty real formal Versions and refuses the fifty-first without a new receipt, fence or event', async () => {
      const source = await registerPaymentSource(fixture);
      const bytes = await paymentNoticePdf();
      let versionId = source.versionId,
        revision = 1;
      for (let number = 1; number <= 50; number++) {
        const uploaded = await fixture.upload({
          ...source,
          versionId,
          revision,
          key: randomUUID(),
          bytes,
        });
        expect(uploaded.status, await uploaded.clone().text()).toBe(201);
        revision += 1;
        const official = await fixture.call(
          `/documents/${source.documentId}/versions/${versionId}/official-designation`,
          { method: 'POST', body: { expectedRevision: revision } },
        );
        expect(official.status, await official.clone().text()).toBe(200);
        revision += 1;
        if (number < 50) {
          const draft = await fixture.call(
            `/documents/${source.documentId}/versions`,
            { method: 'POST', body: { expectedRevision: revision } },
          );
          expect(draft.status, await draft.clone().text()).toBe(201);
          const receipt = await paymentJson(draft);
          expect(receipt.versionNumber).toBe(number + 1);
          versionId = paymentText(receipt.versionId);
          revision += 1;
        }
      }
      const before = await paymentEvidenceEffects(fixture.pool);
      const refused = await fixture.call(
        `/documents/${source.documentId}/versions`,
        { method: 'POST', body: { expectedRevision: revision } },
      );
      expect(refused.status).toBe(409);
      expect(await paymentJson(refused)).toMatchObject({
        code: 'document_version_capacity_exceeded',
      });
      expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
      const result = await paymentJson(
        await fixture.call(`/documents/${source.documentId}/versions`),
      );
      if (!Array.isArray(result.versions))
        throw new Error('Expected native Versions.');
      expect(result.versions).toHaveLength(50);
      expect(
        result.versions
          .map(paymentRecord)
          .filter((row) => row.status === 'official'),
      ).toHaveLength(1);
      expect(fixture.scanner.scanCount).toBe(50);
    }, 60_000);
  },
);
