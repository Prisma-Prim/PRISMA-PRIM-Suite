import { randomUUID } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CERTIFICATION_OWNER,
  CERTIFICATION_READER,
  applicationFacts,
  openCertificationFixture,
  record,
  text,
} from '../certification/certification.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
function rows(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Expected public array');
  return value.map(record);
}

describe.skipIf(!databaseUrl)(
  'Reviewed dossier values prepare a native application draft',
  { timeout: 60_000 },
  () => {
    let fixture: Awaited<ReturnType<typeof openCertificationFixture>>;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
      fixture = await openCertificationFixture({
        databaseUrl,
        namePrefix: 'dossier_draft',
        workspaceId: '00000000-0000-4000-8000-000000001453',
      });
    }, 120_000);
    afterAll(async () => {
      await fixture?.close();
    });

    async function sourceCase() {
      const caseId = await fixture.caseWithApplication();
      const attachmentId = await fixture.attach(caseId, 'evidence', 2);
      const response = await fixture.call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/documents`,
      );
      const attachment = rows(record(await response.json()).items).find(
        (a) => a.id === attachmentId,
      );
      if (!attachment) throw new Error('Expected exact attachment');
      const prefix = `/projects/${fixture.projectId}/dossier-analysis`;
      const documentId = text(attachment.documentId);
      const documentVersionId = text(attachment.versionId);
      const xml =
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        [
          'Denumire juridică: Firma Fictivă SRL',
          'Адрес: ул. Учебная 12',
          'Domeniu: Producție de lactate',
          'Cod fiscal: RO12345678',
        ]
          .map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`)
          .join('') +
        '</w:body></w:document>';
      const docx = zipSync({
        '[Content_Types].xml': strToU8(
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        ),
        '_rels/.rels': strToU8(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        ),
        'word/document.xml': strToU8(xml),
      });
      const query = new URLSearchParams({
        documentId,
        documentVersionId,
        caseId,
        attachmentId,
        fileName: 'fictiv-ru-ro.docx',
        language: 'ro',
      });
      const upload = await fetch(
        new URL(`/api${prefix}/sources/docx?${query}`, response.url),
        {
          method: 'POST',
          headers: {
            'x-test-external-provider': 'deterministic-test',
            'x-test-external-subject': CERTIFICATION_OWNER,
            'x-test-display-name': `Synthetic ${CERTIFICATION_OWNER}`,
            'x-test-email': `${CERTIFICATION_OWNER}@example.test`,
            'x-company-context-id': fixture.companyId,
            'idempotency-key': randomUUID(),
            'content-type':
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          body: new Uint8Array(docx),
        },
      );
      expect(upload.status, await upload.clone().text()).toBe(201);
      const run = await fixture.created(
        await fixture.call(CERTIFICATION_OWNER, `${prefix}/runs`, {
          method: 'POST',
          body: {},
        }),
      );
      const runId = text(run.id);
      const detail = record(
        await (
          await fixture.call(CERTIFICATION_OWNER, `${prefix}/runs/${runId}`)
        ).json(),
      );
      const candidates = rows(detail.candidates);
      const proposals = ['legalName', 'address', 'scope', 'taxId'].map(
        (field) => {
          const candidate = candidates.find(
            (c) =>
              c.field === field &&
              record(c.citation).documentVersionId === documentVersionId,
          );
          if (!candidate)
            throw new Error(`Missing literal fixture field ${field}`);
          return {
            field,
            value: text(candidate.value),
            rationale: 'Fictional source, deliberately reviewed by a human.',
            citations: [candidate.citation],
          };
        },
      );
      await fixture.created(
        await fixture.call(
          CERTIFICATION_OWNER,
          `${prefix}/runs/${runId}/suggestions`,
          {
            method: 'POST',
            body: { snapshotHash: detail.snapshotHash, suggestions: proposals },
          },
        ),
      );
      const imported = record(
        await (
          await fixture.call(CERTIFICATION_OWNER, `${prefix}/runs/${runId}`)
        ).json(),
      );
      const suggestions = rows(imported.suggestions);
      for (const suggestion of suggestions) {
        const field = record(suggestion.proposal).field;
        if (field === 'taxId') continue;
        await fixture.created(
          await fixture.call(
            CERTIFICATION_OWNER,
            `${prefix}/suggestions/${text(suggestion.id)}/reviews`,
            {
              method: 'POST',
              body: {
                expectedRevision: 0,
                decision:
                  field === 'address'
                    ? 'correct'
                    : field === 'scope'
                      ? 'reject'
                      : 'confirm',
                ...(field === 'address'
                  ? {
                      replacementValue:
                        'ул. Учебная 14, адрес подтверждён человеком',
                    }
                  : {}),
              },
            },
          ),
        );
      }
      return { caseId, prefix, runId, documentVersionId, suggestions };
    }

    it('offers only the latest confirmed and corrected literal values with citations, without changing the native Case', async () => {
      const context = await sourceCase();
      const before = await (
        await fixture.call(
          CERTIFICATION_OWNER,
          `/certification-cases/${context.caseId}`,
        )
      ).json();
      const path = `${context.prefix}/runs/${context.runId}/certification-draft?caseId=${context.caseId}&expectedRevision=3`;
      const response = await fixture.call(CERTIFICATION_OWNER, path);
      expect(response.status, await response.clone().text()).toBe(200);
      expect(response.headers.get('cache-control')).toContain('no-store');
      const preview = record(await response.json());
      expect(preview.format).toBe('CERTIFICATION_APPLICATION_DRAFT/1');
      expect(preview.target).toMatchObject({
        caseId: context.caseId,
        projectId: fixture.projectId,
        revision: 3,
      });
      const candidates = rows(preview.candidates);
      expect(candidates).toHaveLength(2);
      expect(candidates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'declaredLegalName',
            value: 'Firma Fictivă SRL',
            reviewRevision: 1,
          }),
          expect.objectContaining({
            field: 'declaredAddress',
            value: 'ул. Учебная 14, адрес подтверждён человеком',
            proposalValue: 'ул. Учебная 12',
            reviewRevision: 1,
          }),
        ]),
      );
      for (const candidate of candidates)
        expect(rows(candidate.citations)[0]).toMatchObject({
          documentVersionId: context.documentVersionId,
        });
      expect(
        await (await fixture.call(CERTIFICATION_OWNER, path)).json(),
      ).toEqual(preview);
      expect(
        await (
          await fixture.call(
            CERTIFICATION_OWNER,
            `/certification-cases/${context.caseId}`,
          )
        ).json(),
      ).toEqual(before);
    });
    it('requires current manager authority and gives foreign Company and absent targets the same concealed response', async () => {
      const c = await sourceCase();
      const path = `${c.prefix}/runs/${c.runId}/certification-draft?caseId=${c.caseId}&expectedRevision=3`;
      const reader = await fixture.call(CERTIFICATION_READER, path);
      expect(reader.status).toBe(403);
      expect(await reader.text()).not.toContain('Firma Fictivă');
      const other = await fixture.created(
        await fixture.call(CERTIFICATION_OWNER, '/companies', {
          method: 'POST',
          company: null,
          body: { displayName: 'Other fictional preparation Company' },
        }),
      );
      const companyId = text(other.id);
      for (const kind of [
        'context',
        'project',
        'director-client',
        'certification-reader',
        'certification-programme-manager',
      ]) {
        await fixture.created(
          await fixture.call(
            CERTIFICATION_OWNER,
            `/company-${kind}-assignments`,
            {
              method: 'POST',
              company: null,
              body: {
                companyId,
                workspaceMembershipId: fixture.membership(CERTIFICATION_OWNER),
              },
            },
          ),
        );
      }
      const hidden = await fixture.call(CERTIFICATION_OWNER, path, {
        company: companyId,
      });
      const absent = await fixture.call(
        CERTIFICATION_OWNER,
        `${c.prefix}/runs/${c.runId}/certification-draft?caseId=${randomUUID()}&expectedRevision=3`,
        { company: companyId },
      );
      expect(hidden.status).toBe(404);
      expect(absent.status).toBe(404);
      expect(await hidden.json()).toEqual(await absent.json());
    });

    it('refuses stale Case/source snapshots and malformed queries while preserving historical reviewed proposals', async () => {
      const c = await sourceCase();
      const base = `${c.prefix}/runs/${c.runId}/certification-draft`;
      for (const query of [
        `caseId=${c.caseId}&expectedRevision=2`,
        `caseId=${c.caseId}&expectedRevision=3&expectedRevision=4`,
        `caseId=${c.caseId}&expectedRevision=3&unsafe=true`,
      ]) {
        const reply = await fixture.call(
          CERTIFICATION_OWNER,
          `${base}?${query}`,
        );
        expect(reply.status).toBe(query.endsWith('Revision=2') ? 409 : 400);
      }
      await fixture.created(
        await fixture.call(
          CERTIFICATION_OWNER,
          `/certification-cases/${c.caseId}/application`,
          {
            method: 'POST',
            body: {
              expectedRevision: 3,
              reason: 'An explicit native correction.',
              facts: applicationFacts({
                declaredLegalName: 'Changed canonical name',
              }),
            },
          },
        ),
      );
      const stale = await fixture.call(
        CERTIFICATION_OWNER,
        `${base}?caseId=${c.caseId}&expectedRevision=4`,
      );
      expect(stale.status).toBe(409);
      const historical = record(
        await (
          await fixture.call(CERTIFICATION_OWNER, `${c.prefix}/runs/${c.runId}`)
        ).json(),
      );
      expect(historical.stale).toBe(true);
      expect(JSON.stringify(historical.suggestions)).toContain(
        'ул. Учебная 14',
      );
    });

    it('removes a formerly confirmed proposal after a later human rejection instead of returning cached eligibility', async () => {
      const c = await sourceCase();
      const name = c.suggestions.find(
        (s) => record(s.proposal).field === 'legalName',
      );
      if (!name) throw new Error('Expected original suggestion');
      const path = `${c.prefix}/runs/${c.runId}/certification-draft?caseId=${c.caseId}&expectedRevision=3`;
      expect(
        rows(
          record(await (await fixture.call(CERTIFICATION_OWNER, path)).json())
            .candidates,
        ),
      ).toHaveLength(2);
      await fixture.created(
        await fixture.call(
          CERTIFICATION_OWNER,
          `${c.prefix}/suggestions/${text(name.id)}/reviews`,
          { method: 'POST', body: { expectedRevision: 1, decision: 'reject' } },
        ),
      );
      const fresh = record(
        await (await fixture.call(CERTIFICATION_OWNER, path)).json(),
      );
      expect(rows(fresh.candidates).map((row) => row.field)).toEqual([
        'declaredAddress',
      ]);
      const address = c.suggestions.find(
        (s) => record(s.proposal).field === 'address',
      );
      if (!address) throw new Error('Expected address proposal');
      await fixture.created(
        await fixture.call(
          CERTIFICATION_OWNER,
          `${c.prefix}/suggestions/${text(address.id)}/reviews`,
          {
            method: 'POST',
            body: {
              expectedRevision: 1,
              decision: 'correct',
              replacementValue: 'x'.repeat(501),
            },
          },
        ),
      );
      expect(
        rows(
          record(await (await fixture.call(CERTIFICATION_OWNER, path)).json())
            .candidates,
        ),
      ).toEqual([]);
      const revoked = await fixture.call(
        CERTIFICATION_OWNER,
        `/company-certification-programme-manager-assignments/${fixture.membership(CERTIFICATION_OWNER)}/${fixture.companyId}`,
        { method: 'DELETE', company: null },
      );
      expect(revoked.status).toBe(200);
      const denied = await fixture.call(CERTIFICATION_OWNER, path);
      expect(denied.status).toBe(403);
      expect(await denied.text()).not.toContain('Учебная');
    });
  },
);
