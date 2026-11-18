import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CERTIFICATION_OWNER,
  openCertificationFixture,
  record,
  text,
} from '../certification/certification.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
function records(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Expected public array');
  return value.map(record);
}

describe.skipIf(!databaseUrl)(
  'Complete pilot input compatibility',
  { timeout: 60_000 },
  () => {
    let f: Awaited<ReturnType<typeof openCertificationFixture>>;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
      f = await openCertificationFixture({
        databaseUrl,
        namePrefix: 'pilot_1452_compatibility',
        workspaceId: '00000000-0000-4000-8000-000000001452',
      });
      await f.grant(
        CERTIFICATION_OWNER,
        '/company-document-project-organizer-assignments',
      );
    }, 120_000);
    afterAll(async () => {
      await f?.close();
    });
    it('retains an exact batch Word original as a draft while its human-corrected scope prepares and saves the ordinary native Stage plan', async () => {
      const caseId = await f.approvedTeamCase();
      const attachment = await f.attach(caseId, 'plan', 8);
      const project = record(
        await (
          await f.call(CERTIFICATION_OWNER, `/projects/${f.projectId}`)
        ).json(),
      );
      const prefix = `/projects/${f.projectId}/dossier-analysis`;
      const bytes = zipSync({
        '[Content_Types].xml': strToU8(
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        ),
        '_rels/.rels': strToU8(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        ),
        'word/document.xml': strToU8(
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Domeniu: Producție de lactate</w:t></w:r></w:p><w:p><w:r><w:t>Адрес: ул. Учебная 12</w:t></w:r></w:p></w:body></w:document>',
        ),
      });
      let batch = await f.created(
        await f.call(CERTIFICATION_OWNER, `${prefix}/intake-batches`, {
          method: 'POST',
          body: {
            format: 'DOCUMENT_INTAKE/1',
            expectedClientId: project.clientAccountId,
            items: [
              {
                fileName: 'dosar-область.docx',
                kind: 'docx',
                language: 'ro',
                size: bytes.length,
                sha256: createHash('sha256').update(bytes).digest('hex'),
                title: 'Fictional pilot working original',
                purpose: 'Explicitly reviewed source ownership and language',
              },
            ],
          },
        }),
      );
      const batchPath = `${prefix}/intake-batches/${text(batch.id)}`;
      batch = await f.created(
        await f.call(CERTIFICATION_OWNER, `${batchPath}/state`, {
          method: 'POST',
          body: { expectedRevision: batch.revision, action: 'start' },
        }),
      );
      const first = records(batch.items)[0];
      if (!first) throw new Error('Missing admitted original');
      const itemPath = `${batchPath}/items/${text(first.id)}`;
      async function advance() {
        batch = await f.created(
          await f.call(CERTIFICATION_OWNER, `${itemPath}/advance`, {
            method: 'POST',
            body: { expectedRevision: batch.revision },
          }),
        );
      }
      await advance();
      await advance();
      const detail = await f.call(CERTIFICATION_OWNER, batchPath);
      const upload = await fetch(
        `${new URL(detail.url).origin}/api${itemPath}/content?expectedRevision=${String(batch.revision)}`,
        {
          method: 'POST',
          headers: {
            'x-test-external-provider': 'deterministic-test',
            'x-test-external-subject': CERTIFICATION_OWNER,
            'x-test-display-name': `Synthetic ${CERTIFICATION_OWNER}`,
            'x-test-email': `${CERTIFICATION_OWNER}@example.test`,
            'x-company-context-id': f.companyId,
            'content-type':
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          body: new Uint8Array(bytes),
        },
      );
      batch = await f.created(upload);
      await advance();
      expect(batch.phase).toBe('completed');
      const completed = record(records(batch.items)[0]?.progress);
      expect(completed.stage).toBe('complete');
      const target = record(completed.target),
        sourceId = text(completed.sourceId);
      const original = await f.call(
        CERTIFICATION_OWNER,
        `${prefix}/sources/${sourceId}/original`,
      );
      expect(original.status).toBe(200);
      expect(Buffer.from(await original.arrayBuffer())).toEqual(
        Buffer.from(bytes),
      );
      const documentPath = `/documents/${text(target.documentId)}`;
      const beforeDocument = await (
        await f.call(CERTIFICATION_OWNER, documentPath)
      ).json();
      expect(record(beforeDocument)).toMatchObject({
        type: 'project-source',
        version: {
          id: target.versionId,
          status: 'draft',
          representation: null,
        },
      });
      const beforeCase = await (
        await f.call(CERTIFICATION_OWNER, `/certification-cases/${caseId}`)
      ).json();
      const run = await f.created(
        await f.call(CERTIFICATION_OWNER, `${prefix}/runs`, {
          method: 'POST',
          body: {},
        }),
      );
      const runPath = `${prefix}/runs/${text(run.id)}`;
      const analysis = record(
        await (await f.call(CERTIFICATION_OWNER, runPath)).json(),
      );
      const candidate = records(analysis.candidates).find(
        (c) => c.field === 'scope' && record(c.citation).sourceId === sourceId,
      );
      if (!candidate)
        throw new Error(
          'Expected scope extracted from the actual newly imported draft',
        );
      expect(record(candidate.citation)).toMatchObject({
        documentVersionId: target.versionId,
        locator: 'word/document.xml#paragraph:1',
        quote: 'Producție de lactate',
      });
      await f.created(
        await f.call(CERTIFICATION_OWNER, `${runPath}/suggestions`, {
          method: 'POST',
          body: {
            snapshotHash: analysis.snapshotHash,
            suggestions: [
              {
                field: 'scope',
                value: candidate.value,
                rationale: 'Fictional deliberate human review',
                citations: [candidate.citation],
              },
            ],
          },
        }),
      );
      const suggestion = records(
        record(await (await f.call(CERTIFICATION_OWNER, runPath)).json())
          .suggestions,
      )[0];
      if (!suggestion) throw new Error('Expected imported proposal');
      const reviewedScope =
        'Producție de lactate — domeniu confirmat de o persoană';
      await f.created(
        await f.call(
          CERTIFICATION_OWNER,
          `${prefix}/suggestions/${text(suggestion.id)}/reviews`,
          {
            method: 'POST',
            body: {
              expectedRevision: 0,
              decision: 'correct',
              replacementValue: reviewedScope,
            },
          },
        ),
      );
      const preparationPath = `${runPath}/certification-stage-draft?caseId=${caseId}&expectedRevision=9&step=stage_1_plan`;
      const preparation = await f.call(CERTIFICATION_OWNER, preparationPath);
      expect(preparation.status, await preparation.clone().text()).toBe(200);
      expect(record(await preparation.json())).toMatchObject({
        format: 'CERTIFICATION_STAGE_DRAFT/1',
        target: {
          caseId,
          projectId: f.projectId,
          revision: 9,
          step: 'stage_1_plan',
        },
        candidates: [
          {
            field: 'scope',
            value: reviewedScope,
            reviewRevision: 1,
            citations: [
              {
                sourceId,
                documentVersionId: target.versionId,
                quote: 'Producție de lactate',
              },
            ],
          },
        ],
      });
      expect(
        await (
          await f.call(CERTIFICATION_OWNER, `/certification-cases/${caseId}`)
        ).json(),
      ).toEqual(beforeCase);
      const manualScope = reviewedScope + '; limită revizuită de auditor';
      const saved = await f.created(
        await f.call(
          CERTIFICATION_OWNER,
          `/certification-cases/${caseId}/stages/stage-1/plan`,
          {
            method: 'POST',
            body: {
              expectedRevision: 9,
              startDate: '2026-11-10',
              endDate: '2026-11-10',
              onSiteDays: '1',
              remoteDays: '0',
              objectives: 'Human professional objectives',
              scope: manualScope,
              planAttachmentId: attachment,
              sentToClientOn: null,
              deviationNote: null,
            },
          },
        ),
      );
      expect(
        records(saved.stages).find((s) => s.step === 'stage_1_plan'),
      ).toMatchObject({
        value: {
          scope: manualScope,
          objectives: 'Human professional objectives',
        },
      });
      expect(
        await (await f.call(CERTIFICATION_OWNER, documentPath)).json(),
      ).toEqual(beforeDocument);
      expect((await f.call(CERTIFICATION_OWNER, preparationPath)).status).toBe(
        409,
      );
      // This generic Project original is not a formal Case attachment: its
      // unchanged source review stays current, while the target Case revision
      // remains independently authoritative.
      expect(
        record(await (await f.call(CERTIFICATION_OWNER, runPath)).json()).stale,
      ).toBe(false);
      const currentTarget = preparationPath.replace(
        'expectedRevision=9',
        'expectedRevision=10',
      );
      expect((await f.call(CERTIFICATION_OWNER, currentTarget)).status).toBe(
        200,
      );
      const removed = await f.call(
        CERTIFICATION_OWNER,
        `${prefix}/sources/${sourceId}`,
        { method: 'DELETE' },
      );
      expect(removed.status, await removed.clone().text()).toBe(200);
      expect((await f.call(CERTIFICATION_OWNER, currentTarget)).status).toBe(
        409,
      );
      const history = record(
        await (await f.call(CERTIFICATION_OWNER, runPath)).json(),
      );
      expect(history.stale).toBe(true);
      expect(
        records(history.suggestions).find((s) => s.id === suggestion.id),
      ).toMatchObject({
        proposal: { value: 'Producție de lactate' },
        reviews: [{ decision: 'correct', replacementValue: reviewedScope }],
      });
    });
  },
);
