import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applicationFacts,
  CERTIFICATION_OWNER,
  CERTIFICATION_READER,
  openCertificationFixture,
  record,
  text,
} from '../certification/certification.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'Dossier Analysis exact Certification attachment authority',
  () => {
    let fixture: Awaited<ReturnType<typeof openCertificationFixture>>;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
      fixture = await openCertificationFixture({
        databaseUrl,
        namePrefix: 'dossier_cert',
        workspaceId: '00000000-0000-4000-8000-000000007435',
      });
      for (const path of [
        '/company-document-registrar-assignments',
        '/company-received-audit-source-access-assignments',
        '/company-document-content-reader-assignments',
      ])
        await fixture.grant(CERTIFICATION_READER, path);
    }, 120_000);
    afterAll(async () => {
      await fixture?.close();
    });

    it('accepts the exact attached version only and withholds history after Case reader rights are revoked', async () => {
      const caseId = await fixture.caseWithApplication();
      const attachmentId = await fixture.attach(caseId, 'evidence', 2);
      const listing = record(
        await (
          await fixture.call(
            CERTIFICATION_OWNER,
            `/certification-cases/${caseId}/documents`,
          )
        ).json(),
      );
      if (!Array.isArray(listing.items))
        throw new Error('Expected attachment register');
      const attachment = listing.items
        .map(record)
        .find((item) => item.id === attachmentId);
      if (!attachment) throw new Error('Missing exact attachment');
      const documentId = text(attachment.documentId);
      const documentVersionId = text(attachment.versionId);
      const prefix = `/projects/${fixture.projectId}/dossier-analysis`;
      const inventory = await fixture.call(
        CERTIFICATION_OWNER,
        `${prefix}/inventory`,
      );
      expect(inventory.status).toBe(200);
      const items = record(await inventory.json()).items;
      if (!Array.isArray(items)) throw new Error('Expected inventory');
      const source = items
        .map(record)
        .find(
          (item) => item.attachmentId === attachmentId && item.kind === 'pdf',
        );
      if (!source)
        throw new Error('Expected exact attached source in inventory');
      expect(source).toMatchObject({
        documentId,
        documentVersionId,
        caseId,
        attachmentId,
      });
      const body = {
        documentId,
        documentVersionId,
        representationId: text(source.representationId),
        language: 'en',
        caseId,
        attachmentId,
      };
      const invalid = await fixture.call(
        CERTIFICATION_OWNER,
        `${prefix}/sources`,
        { method: 'POST', body: { ...body, attachmentId: randomUUID() } },
      );
      expect([403, 404, 409]).toContain(invalid.status);
      const added = await fixture.call(
        CERTIFICATION_OWNER,
        `${prefix}/sources`,
        { method: 'POST', body },
      );
      expect(added.status, await added.clone().text()).toBe(201);
      const sourceId = text(record(await added.json()).id);
      // Hold the final run-store read only after capture has acquired the
      // native Case and project locks. Both competing commands must then be
      // observed waiting, so releasing the barrier tests real serialization.
      const barrier = await fixture.holdTable('dossier_analysis_runs');
      const runPromise = fixture.call(CERTIFICATION_OWNER, `${prefix}/runs`, {
        method: 'POST',
        body: {},
      });
      let removal: Promise<Response> | undefined;
      let caseChange: Promise<Response> | undefined;
      try {
        await expect
          .poll(() => barrier.waiting(), { timeout: 20_000 })
          .toBe(true);
        removal = fixture.call(
          CERTIFICATION_OWNER,
          `${prefix}/sources/${sourceId}`,
          { method: 'DELETE' },
        );
        caseChange = fixture.call(
          CERTIFICATION_OWNER,
          `/certification-cases/${caseId}/application`,
          {
            method: 'POST',
            body: {
              expectedRevision: 3,
              reason: 'Synthetic correction after the captured run',
              facts: applicationFacts({
                declaredLegalName: 'Updated synthetic name',
              }),
            },
          },
        );
        await expect
          .poll(
            async () => {
              const waiting = await fixture.databasePool.query<{
                count: string;
              }>(
                "SELECT count(*)::text AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
              );
              return Number(waiting.rows[0]?.count ?? '0');
            },
            { timeout: 20_000 },
          )
          .toBeGreaterThanOrEqual(3);
      } finally {
        await barrier.release();
      }
      if (!removal || !caseChange)
        throw new Error('Competing commands were not started');
      const [created, removed, changed] = await Promise.all([
        runPromise,
        removal,
        caseChange,
      ]);
      expect(created.status, await created.clone().text()).toBe(201);
      expect(removed.status, await removed.clone().text()).toBe(200);
      expect(changed.status, await changed.clone().text()).toBe(201);
      const runId = text(record(await created.json()).id);
      const oldRun = await fixture.call(
        CERTIFICATION_OWNER,
        `${prefix}/runs/${runId}`,
      );
      expect(oldRun.status).toBe(200);
      expect(record(await oldRun.json()).stale).toBe(true);
      const before = await fixture.call(
        CERTIFICATION_READER,
        `${prefix}/runs/${runId}/context`,
      );
      expect(before.status).toBe(200);
      expect(JSON.stringify(await before.json())).toContain(sourceId);
      const revoked = await fixture.call(
        CERTIFICATION_OWNER,
        `/company-certification-reader-assignments/${fixture.membership(CERTIFICATION_READER)}/${fixture.companyId}`,
        { method: 'DELETE', company: null },
      );
      expect(revoked.status).toBe(200);
      for (const suffix of [
        `/runs/${runId}`,
        `/runs/${runId}/context`,
        `/sources/${sourceId}/original`,
        '/inventory',
      ]) {
        const denied = await fixture.call(
          CERTIFICATION_READER,
          prefix + suffix,
        );
        const payload = await denied.text();
        expect(payload).not.toContain(documentId);
        expect(payload).not.toContain(attachmentId);
        expect(payload).not.toContain('Fictional evidence');
      }
    }, 120_000);
  },
);
