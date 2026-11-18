import { createHash, randomUUID } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CERTIFICATION_OWNER,
  CERTIFICATION_READER,
  SYNTHETIC_PDF,
  openCertificationFixture,
  record,
  text,
} from '../certification/certification.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'Recoverable native Project document intake',
  { timeout: 60_000 },
  () => {
    let fixture: Awaited<ReturnType<typeof openCertificationFixture>>;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
      fixture = await openCertificationFixture({
        databaseUrl,
        namePrefix: 'document_intake',
        workspaceId: '00000000-0000-4000-8000-000000001454',
      });
      await fixture.grant(
        CERTIFICATION_OWNER,
        '/company-document-project-organizer-assignments',
      );
    }, 120_000);
    afterAll(async () => {
      await fixture?.close();
    });

    it('registers a draft-only file-backed Project source without relaxing the questionnaire reference contract', async () => {
      const project = record(
        await (
          await fixture.call(
            CERTIFICATION_OWNER,
            `/projects/${fixture.projectId}`,
          )
        ).json(),
      );
      const metadata = {
        clientId: text(project.clientAccountId),
        title: 'Fictional local working source',
        purpose: 'Preserve an incoming original without inventing a reference.',
      };
      const response = await fixture.call(CERTIFICATION_OWNER, '/documents', {
        method: 'POST',
        body: { type: 'project-source', ...metadata },
      });
      expect(response.status, await response.clone().text()).toBe(201);
      const document = record(await response.json());
      expect(document.type).toBe('project-source');
      expect(record(document.version)).toMatchObject({
        status: 'draft',
        representation: null,
      });
      const inventory = await fixture.call(CERTIFICATION_OWNER, '/documents');
      expect(inventory.status).toBe(200);
      expect(
        records(await inventory.json()).some((item) => item.id === document.id),
      ).toBe(true);
      const invalidQuestionnaire = await fixture.call(
        CERTIFICATION_OWNER,
        '/documents',
        { method: 'POST', body: { type: 'questionnaire', ...metadata } },
      );
      expect(invalidQuestionnaire.status).toBe(400);
      const designation = await fixture.call(
        CERTIFICATION_OWNER,
        `/documents/${text(document.id)}/versions/${text(record(document.version).id)}/official-designation`,
        { method: 'POST', body: { expectedRevision: 1 } },
      );
      expect(designation.status).toBe(409);
    });

    it('admits exact RU/RO originals with native ownership and explicit duplicate state, without inventing references or official designation', async () => {
      const project = record(
        await (
          await fixture.call(
            CERTIFICATION_OWNER,
            `/projects/${fixture.projectId}`,
          )
        ).json(),
      );
      const docx = zipSync({
        '[Content_Types].xml': strToU8(
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        ),
        '_rels/.rels': strToU8(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        ),
        'word/document.xml': strToU8(
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Denumire juridică: Firma Fictivă SRL</w:t></w:r></w:p><w:p><w:r><w:t>Адрес: ул. Учебная 12</w:t></w:r></w:p></w:body></w:document>',
        ),
      });
      const file = {
        fileName: 'dosar-ru-ro.docx',
        kind: 'docx',
        language: 'ro',
        size: docx.length,
        sha256: createHash('sha256').update(docx).digest('hex'),
        title: 'Fictional incoming working original',
        purpose: 'Explicitly reviewed fictional intake metadata',
      };
      const path = `/projects/${fixture.projectId}/dossier-analysis/intake-batches`;
      const response = await fixture.call(CERTIFICATION_OWNER, path, {
        method: 'POST',
        body: {
          format: 'DOCUMENT_INTAKE/1',
          expectedClientId: text(project.clientAccountId),
          items: [file, { ...file, fileName: 'same-bytes.docx' }],
        },
      });
      expect(response.status, await response.clone().text()).toBe(201);
      const admitted = record(await response.json());
      expect(admitted).toMatchObject({
        phase: 'paused',
        revision: 1,
        projectId: fixture.projectId,
        clientId: project.clientAccountId,
      });
      expect(Array.isArray(admitted.items)).toBe(true);
      const items = records(admitted.items);
      expect(items[0]?.progress).toEqual({ stage: 'queued' });
      expect(items[1]?.progress).toEqual({
        stage: 'duplicate',
        duplicateOf: { kind: 'item', id: items[0]?.id },
      });
      const batchId = text(admitted.id);
      const reopened = await fixture.call(
        CERTIFICATION_OWNER,
        `${path}/${batchId}`,
      );
      expect(reopened.status).toBe(200);
      expect(await reopened.json()).toEqual(admitted);
      expect(JSON.stringify(admitted)).not.toContain('https://');
      expect(JSON.stringify(admitted)).not.toContain('official');
    });

    async function projectClient() {
      return text(
        record(
          await (
            await fixture.call(
              CERTIFICATION_OWNER,
              `/projects/${fixture.projectId}`,
            )
          ).json(),
        ).clientAccountId,
      );
    }
    function file(bytes: Uint8Array, name: string, language = 'ro') {
      return {
        fileName: name,
        kind: name.endsWith('.pdf') ? 'pdf' : 'docx',
        language,
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        title: `Fictional ${name}`,
        purpose: 'Reviewed working original; no official approval.',
      };
    }
    async function createdBatch(items: unknown[], key = randomUUID()) {
      const response = await fixture.call(
        CERTIFICATION_OWNER,
        `/projects/${fixture.projectId}/dossier-analysis/intake-batches`,
        {
          method: 'POST',
          key,
          body: {
            format: 'DOCUMENT_INTAKE/1',
            expectedClientId: await projectClient(),
            items,
          },
        },
      );
      expect(response.status, await response.clone().text()).toBe(201);
      return record(await response.json());
    }
    function batchPath(batch: Record<string, unknown>) {
      return `/projects/${fixture.projectId}/dossier-analysis/intake-batches/${text(batch.id)}`;
    }
    async function action(
      batch: Record<string, unknown>,
      action: 'start' | 'pause' | 'stop',
    ) {
      const response = await fixture.call(
        CERTIFICATION_OWNER,
        `${batchPath(batch)}/state`,
        { method: 'POST', body: { expectedRevision: batch.revision, action } },
      );
      expect(response.status, await response.clone().text()).toBe(201);
      return record(await response.json());
    }
    async function step(
      batch: Record<string, unknown>,
      index: number,
      suffix = 'advance',
    ) {
      const item = records(batch.items)[index];
      if (!item) throw new Error('Expected intake item.');
      const response = await fixture.call(
        CERTIFICATION_OWNER,
        `${batchPath(batch)}/items/${text(item.id)}/${suffix}`,
        { method: 'POST', body: { expectedRevision: batch.revision } },
      );
      expect(response.status, await response.clone().text()).toBe(201);
      return record(await response.json());
    }
    async function raw(
      batch: Record<string, unknown>,
      index: number,
      bytes: Uint8Array,
    ) {
      const item = records(batch.items)[index];
      if (!item) throw new Error('Expected intake item.');
      const detail = await fixture.call(CERTIFICATION_OWNER, batchPath(batch));
      return fetch(
        `${new URL(detail.url).origin}/api${batchPath(batch)}/items/${text(item.id)}/content?expectedRevision=${String(batch.revision)}`,
        {
          method: 'POST',
          headers: {
            'x-test-external-provider': 'deterministic-test',
            'x-test-external-subject': CERTIFICATION_OWNER,
            'x-test-display-name': `Synthetic ${CERTIFICATION_OWNER}`,
            'x-test-email': `${CERTIFICATION_OWNER}@example.test`,
            'x-company-context-id': fixture.companyId,
            'content-type':
              record(item.file).kind === 'pdf'
                ? 'application/pdf'
                : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          body: new Uint8Array(bytes),
        },
      );
    }
    async function uploaded(
      batch: Record<string, unknown>,
      index: number,
      bytes: Uint8Array,
    ) {
      const response = await raw(batch, index, bytes);
      expect(response.status, await response.clone().text()).toBe(201);
      return record(await response.json());
    }
    async function reopened(batch: Record<string, unknown>) {
      const response = await fixture.call(
        CERTIFICATION_OWNER,
        batchPath(batch),
      );
      expect(response.status).toBe(200);
      return record(await response.json());
    }

    it('retains exact originals and per-file failures across pause, reopen and deliberate recovery, without duplicate native effects', async () => {
      const word = literalDocx(
        'Denumire juridică: Firma de probă SRL\nАдрес: ул. Примерная 14',
      );
      const invalid = Buffer.from('PK\u0003\u0004not an OPC Word document');
      let batch = await createdBatch([
        file(SYNTHETIC_PDF, 'audit-ru.pdf', 'ru'),
        file(word, 'dosar-ro.docx'),
        file(invalid, 'broken.docx'),
        file(word, 'duplicate.docx'),
        {
          kind: 'invalid',
          fileName: 'notes.txt',
          size: 12,
          reason: 'unsupported_type',
        },
      ]);
      batch = await action(batch, 'start');
      for (const index of [0, 1]) {
        batch = await step(batch, index);
        batch = await step(batch, index);
        batch = await uploaded(
          batch,
          index,
          index === 0 ? SYNTHETIC_PDF : word,
        );
        if (index === 0) batch = await step(batch, index);
        batch = await step(batch, index);
      }
      expect(
        records(batch.items)
          .slice(0, 2)
          .map((item) => record(item.progress).stage),
      ).toEqual(['complete', 'complete']);
      batch = await step(await step(batch, 2), 2);
      const bad = await raw(batch, 2, invalid);
      expect(bad.status).toBe(400);
      batch = await reopened(batch);
      expect(record(records(batch.items)[2]?.lastAttempt)).toMatchObject({
        outcome: 'failed',
        code: 'invalid_file',
      });
      batch = await action(batch, 'pause');
      expect(await reopened(batch)).toEqual(batch);
      const paused = await raw(batch, 2, invalid);
      expect(paused.status).toBe(409);
      batch = await action(batch, 'start');
      batch = await step(batch, 2, 'skip');
      batch = await step(batch, 3, 'skip');
      expect(batch.phase).toBe('completed');
      const retained = records(batch.items);
      expect(retained).toHaveLength(5);
      expect(record(record(retained[2]?.progress).retained).stage).toBe(
        'linked',
      );
      expect(record(retained[4]?.file).reason).toBe('unsupported_type');
      for (const [index, bytes] of [
        [0, SYNTHETIC_PDF],
        [1, word],
      ] as const) {
        const progress = record(retained[index]?.progress),
          target = record(progress.target);
        const document = record(
          await (
            await fixture.call(
              CERTIFICATION_OWNER,
              `/documents/${text(target.documentId)}`,
            )
          ).json(),
        );
        expect(document).toMatchObject({
          type: 'project-source',
          clientId: await projectClient(),
        });
        expect(record(document.version)).toMatchObject({
          id: target.versionId,
          status: 'draft',
          representation: null,
        });
        const original = await fixture.call(
          CERTIFICATION_OWNER,
          `/projects/${fixture.projectId}/dossier-analysis/sources/${text(progress.sourceId)}/original`,
        );
        expect(original.status, await original.clone().text()).toBe(200);
        expect(Buffer.from(await original.arrayBuffer())).toEqual(
          Buffer.from(bytes),
        );
      }
      const duplicates = await createdBatch([file(word, 'again.docx')]);
      expect(record(records(duplicates.items)[0]?.progress)).toMatchObject({
        stage: 'duplicate',
        duplicateOf: {
          kind: 'source',
          id: record(retained[1]?.progress).sourceId,
        },
      });
    });

    it('replays admission, conceals another actor’s jobs, and refuses stale or malformed progress commands', async () => {
      const key = randomUUID(),
        input = [
          file(literalDocx('Адрес: Учебная 1454'), 'ownership.docx', 'ru'),
        ];
      const admitted = await createdBatch(input, key);
      expect(await createdBatch(input, key)).toEqual(admitted);
      const conflict = await fixture.call(
        CERTIFICATION_OWNER,
        `/projects/${fixture.projectId}/dossier-analysis/intake-batches`,
        {
          method: 'POST',
          key,
          body: {
            format: 'DOCUMENT_INTAKE/1',
            expectedClientId: await projectClient(),
            items: [{ ...input[0], title: 'Changed' }],
          },
        },
      );
      expect(conflict.status).toBe(409);
      for (const route of [
        '/company-document-registrar-assignments',
        '/company-document-content-reader-assignments',
      ])
        await fixture.grant(CERTIFICATION_READER, route);
      const foreign = await fixture.call(
        CERTIFICATION_READER,
        batchPath(admitted),
      );
      const missing = await fixture.call(
        CERTIFICATION_READER,
        batchPath({ ...admitted, id: randomUUID() }),
      );
      expect(foreign.status).toBe(404);
      expect(await foreign.json()).toEqual(await missing.json());
      const active = await action(admitted, 'start');
      const item = records(active.items)[0];
      const path = `${batchPath(active)}/items/${text(item?.id)}/advance`;
      const responses = await Promise.all(
        [0, 1].map(() =>
          fixture.call(CERTIFICATION_OWNER, path, {
            method: 'POST',
            body: { expectedRevision: active.revision },
          }),
        ),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      const fresh = await reopened(active);
      expect(record(records(fresh.items)[0]?.progress).stage).toBe(
        'registered',
      );
      const malformed = await fixture.call(CERTIFICATION_OWNER, path, {
        method: 'POST',
        body: { expectedRevision: fresh.revision, actor: CERTIFICATION_OWNER },
      });
      expect(malformed.status).toBe(400);
    });

    it('recovers a committed PDF whose checkpoint acknowledgement failed, using one native upload receipt and exact public bytes', async () => {
      const pdf = await PDFDocument.create();
      pdf.addPage().drawText('Fictional lost acknowledgement recovery');
      const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
      let batch = await createdBatch([file(bytes, 'recovery.pdf', 'ru')]);
      batch = await action(batch, 'start');
      batch = await step(await step(batch, 0), 0);
      const target = record(record(records(batch.items)[0]?.progress).target);
      await fixture.databasePool.query(
        `CREATE FUNCTION reject_test_intake_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF jsonb_path_exists(NEW.manifest, '$.items[*].progress ? (@.stage == "pdf_stored")') THEN RAISE EXCEPTION 'Synthetic checkpoint connection failure'; END IF; RETURN NEW; END $$`,
      );
      await fixture.databasePool.query(
        'CREATE TRIGGER test_intake_ack BEFORE UPDATE ON dossier_intake_batches FOR EACH ROW EXECUTE FUNCTION reject_test_intake_ack()',
      );
      try {
        const lost = await raw(batch, 0, bytes);
        expect(lost.status).toBe(503);
      } finally {
        await fixture.databasePool.query(
          'DROP TRIGGER test_intake_ack ON dossier_intake_batches',
        );
        await fixture.databasePool.query(
          'DROP FUNCTION reject_test_intake_ack()',
        );
      }
      const content = `/documents/${text(target.documentId)}/versions/${text(target.versionId)}/content`;
      const historyBefore = record(
        await (
          await fixture.call(CERTIFICATION_OWNER, `${content}/history`)
        ).json(),
      );
      const uploads = records(historyBefore.uploads);
      expect(uploads).toHaveLength(1);
      const original = await fixture.call(
        CERTIFICATION_OWNER,
        `${content}/${text(uploads[0]?.representationId)}`,
      );
      expect(original.status).toBe(200);
      expect(Buffer.from(await original.arrayBuffer())).toEqual(bytes);
      batch = await reopened(batch);
      expect(record(records(batch.items)[0]?.progress).stage).toBe('linked');
      batch = await uploaded(batch, 0, bytes);
      batch = await step(await step(batch, 0), 0);
      expect(batch.phase).toBe('completed');
      const historyAfter = record(
        await (
          await fixture.call(CERTIFICATION_OWNER, `${content}/history`)
        ).json(),
      );
      expect(historyAfter).toEqual(historyBefore);
      expect(record(records(batch.items)[0]?.progress)).toMatchObject({
        stage: 'complete',
        target,
        representationId: uploads[0]?.representationId,
      });
    });

    it('replays one committed PDF source when its selection checkpoint acknowledgement fails', async () => {
      const pdf = await PDFDocument.create();
      pdf.addPage().drawText('Fictional PDF source selection replay');
      const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
      let batch = await createdBatch([file(bytes, 'selection-recovery.pdf')]);
      batch = await step(await step(await action(batch, 'start'), 0), 0);
      batch = await uploaded(batch, 0, bytes);
      const prior = record(records(batch.items)[0]?.progress);
      const target = record(prior.target);
      await fixture.databasePool.query(
        `CREATE FUNCTION reject_test_pdf_selection_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF jsonb_path_exists(NEW.manifest, '$.items[*].progress ? (@.stage == "source_stored")') THEN RAISE EXCEPTION 'Synthetic PDF selection checkpoint failure'; END IF; RETURN NEW; END $$`,
      );
      await fixture.databasePool.query(
        'CREATE TRIGGER test_pdf_selection_ack BEFORE UPDATE ON dossier_intake_batches FOR EACH ROW EXECUTE FUNCTION reject_test_pdf_selection_ack()',
      );
      try {
        const response = await fixture.call(
          CERTIFICATION_OWNER,
          `${batchPath(batch)}/items/${text(records(batch.items)[0]?.id)}/advance`,
          { method: 'POST', body: { expectedRevision: batch.revision } },
        );
        expect(response.status).toBe(503);
      } finally {
        await fixture.databasePool.query(
          'DROP TRIGGER test_pdf_selection_ack ON dossier_intake_batches',
        );
        await fixture.databasePool.query(
          'DROP FUNCTION reject_test_pdf_selection_ack()',
        );
      }
      const workspacePath = `/projects/${fixture.projectId}/dossier-analysis`;
      async function originals() {
        return records(
          record(
            await (
              await fixture.call(CERTIFICATION_OWNER, workspacePath)
            ).json(),
          ).sources,
        ).filter((source) => source.documentId === target.documentId);
      }
      const before = await originals();
      expect(before).toHaveLength(1);
      batch = await reopened(batch);
      expect(record(records(batch.items)[0]?.progress)).toEqual(prior);
      batch = await step(batch, 0);
      expect(record(records(batch.items)[0]?.progress).sourceId).toBe(
        before[0]?.id,
      );
      batch = await step(batch, 0);
      expect(batch.phase).toBe('completed');
      expect(await originals()).toEqual(before);
      const original = await fixture.call(
        CERTIFICATION_OWNER,
        `${workspacePath}/sources/${text(before[0]?.id)}/original`,
      );
      expect(original.status).toBe(200);
      expect(Buffer.from(await original.arrayBuffer())).toEqual(bytes);
    });

    it('refuses PDF source selection when native metadata changes after preflight commits', async () => {
      const pdf = await PDFDocument.create();
      pdf.addPage().drawText('Fictional source selection metadata fence');
      const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
      let batch = await createdBatch([file(bytes, 'selection-metadata.pdf')]);
      batch = await step(await step(await action(batch, 'start'), 0), 0);
      batch = await uploaded(batch, 0, bytes);
      const prior = record(records(batch.items)[0]?.progress);
      expect(prior.stage).toBe('pdf_stored');
      const target = record(prior.target);
      const documentPath = `/documents/${text(target.documentId)}`;
      const hold = await fixture.holdTable('dossier_intake_batches', 'SHARE');
      const gate = await fixture.databasePool.connect();
      const itemId = text(records(batch.items)[0]?.id);
      const pending = fixture.call(
        CERTIFICATION_OWNER,
        `${batchPath(batch)}/items/${itemId}/advance`,
        { method: 'POST', body: { expectedRevision: batch.revision } },
      );
      try {
        await gate.query('BEGIN');
        const gatePid = (
          await gate.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]?.pid;
        if (typeof gatePid !== 'number')
          throw new Error('Expected native gate pid');
        await expect.poll(() => hold.waiting(), { timeout: 10_000 }).toBe(true);
        const projectKey = JSON.stringify([
          'dossier-analysis-project',
          '00000000-0000-4000-8000-000000001454',
          fixture.companyId,
          fixture.projectId,
        ]);
        const acquired = gate.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [projectKey],
        );
        await expect
          .poll(
            async () => {
              const result = await fixture.databasePool.query<{
                waiting: boolean;
              }>(
                "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted) AS waiting",
                [gatePid],
              );
              return result.rows[0]?.waiting;
            },
            { timeout: 10_000 },
          )
          .toBe(true);
        // The gate queues before source selection can reacquire this lock.
        // After preflight commits, it holds selection until the native edit commits.
        await hold.release();
        await acquired;
        // A separate database writer commits the same native metadata CAS.
        // It avoids the owner's permission locks serializing the HTTP edit
        // behind source selection while the Project gate is deliberately held.
        const changed = await gate.query(
          `UPDATE working_documents
             SET title=$2, purpose=$3, working_revision=working_revision+1
           WHERE id=$1 AND working_revision=2`,
          [
            target.documentId,
            'Native metadata changed after selection preflight',
            'Human correction commits before native source selection',
          ],
        );
        expect(changed.rowCount).toBe(1);
      } finally {
        await hold.release();
        await gate.query('COMMIT');
        gate.release();
      }
      const response = await pending;
      expect(response.status, await response.clone().text()).toBe(409);
      const workspacePath = `/projects/${fixture.projectId}/dossier-analysis`;
      const workspace = record(
        await (await fixture.call(CERTIFICATION_OWNER, workspacePath)).json(),
      );
      expect(
        records(workspace.sources).some(
          (source) => source.documentId === target.documentId,
        ),
      ).toBe(false);
      batch = await reopened(batch);
      expect(records(batch.items)[0]).toMatchObject({
        progress: prior,
        lastAttempt: { outcome: 'failed', code: 'stale_target' },
      });
      const original = await fixture.call(
        CERTIFICATION_OWNER,
        `${documentPath}/versions/${text(target.versionId)}/content/${text(prior.representationId)}`,
      );
      expect(original.status).toBe(200);
      expect(Buffer.from(await original.arrayBuffer())).toEqual(bytes);
      expect((await step(batch, 0, 'skip')).phase).toBe('completed');
    });

    it.each(['unlink', 'unlink-relink', 'move'])(
      'refuses a PDF whose admitted Project association changes during scanning: %s',
      async (change) => {
        const pdf = await PDFDocument.create();
        pdf.addPage().drawText(`Fictional PDF association fence ${change}`);
        const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
        let batch = await createdBatch([
          file(bytes, `association-${change}.pdf`),
        ]);
        batch = await step(await step(await action(batch, 'start'), 0), 0);
        const target = record(record(records(batch.items)[0]?.progress).target);
        const documentPath = `/documents/${text(target.documentId)}`;
        const nextProjectId =
          change === 'move'
            ? text(
                (
                  await fixture.created(
                    await fixture.call(CERTIFICATION_OWNER, '/projects', {
                      method: 'POST',
                      body: {
                        title: 'Another fictional intake Project',
                        clientAccountId: await projectClient(),
                      },
                    }),
                  )
                ).id,
              )
            : fixture.projectId;
        const barrier = fixture.holdNextScan();
        const pending = raw(batch, 0, bytes);
        try {
          await Promise.race([
            barrier.reached,
            pending.then(() => {
              throw new Error('PDF upload missed the scanner barrier.');
            }),
          ]);
          const unlinked = await fixture.call(
            CERTIFICATION_OWNER,
            `${documentPath}/project-association`,
            {
              method: 'POST',
              body: {
                action: 'unlink',
                projectId: fixture.projectId,
                expectedRevision: 1,
              },
            },
          );
          expect(unlinked.status, await unlinked.clone().text()).toBe(201);
          if (change !== 'unlink') {
            const linked = await fixture.call(
              CERTIFICATION_OWNER,
              `${documentPath}/project-association`,
              {
                method: 'POST',
                body: {
                  action: 'link',
                  projectId: nextProjectId,
                  expectedRevision: 2,
                },
              },
            );
            expect(linked.status, await linked.clone().text()).toBe(201);
          }
        } finally {
          barrier.release();
        }
        const response = await pending;
        expect(response.status, await response.clone().text()).toBe(409);
        const history = record(
          await (
            await fixture.call(
              CERTIFICATION_OWNER,
              `${documentPath}/versions/${text(target.versionId)}/content/history`,
            )
          ).json(),
        );
        expect(records(history.uploads)).toEqual([]);
        expect(
          record(
            await (
              await fixture.call(CERTIFICATION_OWNER, documentPath)
            ).json(),
          ).workingRevision,
        ).toBe(1);
        batch = await reopened(batch);
        expect(records(batch.items)[0]).toMatchObject({
          progress: { stage: 'linked', target },
          lastAttempt: { outcome: 'failed', code: 'stale_target' },
        });
        batch = await step(batch, 0, 'skip');
        expect(batch.phase).toBe('completed');
      },
    );

    it.each(['metadata', 'PDF', 'Project association'])(
      'refuses a new Word source when native %s changes during scanning, retaining the prior checkpoint',
      async (change) => {
        const bytes = literalDocx(
          `Адрес: изменение во время проверки Word ${change}`,
        );
        let batch = await createdBatch([
          file(bytes, 'concurrent-edit.docx', 'ru'),
        ]);
        batch = await step(await step(await action(batch, 'start'), 0), 0);
        const target = record(record(records(batch.items)[0]?.progress).target);
        const barrier = fixture.holdNextScan();
        const pending = raw(batch, 0, bytes);
        try {
          await Promise.race([
            barrier.reached,
            pending.then(() => {
              throw new Error('Word preservation missed the scanner barrier.');
            }),
          ]);
          const documentPath = `/documents/${text(target.documentId)}`;
          if (change === 'metadata') {
            const changed = await fixture.call(
              CERTIFICATION_OWNER,
              documentPath,
              {
                method: 'PATCH',
                body: {
                  expectedRevision: 1,
                  title: 'Native correction while scanning',
                  purpose: 'The admitted metadata is no longer current',
                },
              },
            );
            expect(changed.status, await changed.clone().text()).toBe(200);
          } else if (change === 'PDF') {
            const detail = await fixture.call(
              CERTIFICATION_OWNER,
              documentPath,
            );
            const changed = await fetch(
              `${new URL(detail.url).origin}/api${documentPath}/versions/${text(target.versionId)}/content?expectedRevision=1&fileName=concurrent.pdf`,
              {
                method: 'POST',
                headers: {
                  'x-test-external-provider': 'deterministic-test',
                  'x-test-external-subject': CERTIFICATION_OWNER,
                  'x-test-display-name': `Synthetic ${CERTIFICATION_OWNER}`,
                  'x-test-email': `${CERTIFICATION_OWNER}@example.test`,
                  'x-company-context-id': fixture.companyId,
                  'content-type': 'application/pdf',
                  'idempotency-key': randomUUID(),
                },
                body: new Uint8Array(SYNTHETIC_PDF),
              },
            );
            expect(changed.status, await changed.clone().text()).toBe(201);
          } else {
            for (const { action, expectedRevision } of [
              { action: 'unlink', expectedRevision: 1 },
              { action: 'link', expectedRevision: 2 },
            ]) {
              const changed = await fixture.call(
                CERTIFICATION_OWNER,
                `${documentPath}/project-association`,
                {
                  method: 'POST',
                  body: {
                    action,
                    projectId: fixture.projectId,
                    expectedRevision,
                  },
                },
              );
              expect(changed.status, await changed.clone().text()).toBe(201);
            }
          }
        } finally {
          barrier.release();
        }
        const response = await pending;
        expect(response.status, await response.clone().text()).toBe(409);
        const current = await reopened(batch);
        expect(records(current.items)[0]).toMatchObject({
          progress: { stage: 'linked', target },
          lastAttempt: { outcome: 'failed', code: 'stale_target' },
        });
        const workspace = record(
          await (
            await fixture.call(
              CERTIFICATION_OWNER,
              `/projects/${fixture.projectId}/dossier-analysis`,
            )
          ).json(),
        );
        expect(
          records(workspace.sources).some(
            (source) => source.documentId === target.documentId,
          ),
        ).toBe(false);
      },
    );

    it('recovers one committed Word source after its checkpoint acknowledgement fails without a second source effect', async () => {
      const bytes = literalDocx('Domeniu: Recuperare Word cu același original');
      let batch = await createdBatch([file(bytes, 'word-recovery.docx')]);
      batch = await step(await step(await action(batch, 'start'), 0), 0);
      const target = record(record(records(batch.items)[0]?.progress).target);
      await fixture.databasePool.query(
        `CREATE FUNCTION reject_test_word_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF jsonb_path_exists(NEW.manifest, '$.items[*].progress ? (@.stage == "source_stored")') THEN RAISE EXCEPTION 'Synthetic Word checkpoint failure'; END IF; RETURN NEW; END $$`,
      );
      await fixture.databasePool.query(
        'CREATE TRIGGER test_word_ack BEFORE UPDATE ON dossier_intake_batches FOR EACH ROW EXECUTE FUNCTION reject_test_word_ack()',
      );
      try {
        expect((await raw(batch, 0, bytes)).status).toBe(503);
      } finally {
        await fixture.databasePool.query(
          'DROP TRIGGER test_word_ack ON dossier_intake_batches',
        );
        await fixture.databasePool.query(
          'DROP FUNCTION reject_test_word_ack()',
        );
      }
      const workspacePath = `/projects/${fixture.projectId}/dossier-analysis`;
      async function originals() {
        return records(
          record(
            await (
              await fixture.call(CERTIFICATION_OWNER, workspacePath)
            ).json(),
          ).sources,
        ).filter((source) => source.documentId === target.documentId);
      }
      const before = await originals();
      expect(before).toHaveLength(1);
      batch = await reopened(batch);
      expect(record(records(batch.items)[0]?.progress).stage).toBe('linked');
      batch = await uploaded(batch, 0, bytes);
      expect(record(records(batch.items)[0]?.progress).sourceId).toBe(
        before[0]?.id,
      );
      batch = await step(batch, 0);
      expect(batch.phase).toBe('completed');
      expect(await originals()).toEqual(before);
      const original = await fixture.call(
        CERTIFICATION_OWNER,
        `${workspacePath}/sources/${text(before[0]?.id)}/original`,
      );
      expect(original.status).toBe(200);
      expect(Buffer.from(await original.arrayBuffer())).toEqual(
        Buffer.from(bytes),
      );
    });

    it.each(['advance', 'upload'])(
      'records a stale target refusal before %s so the unfinished item can be deliberately skipped',
      async (operation) => {
        const bytes = literalDocx(
          `Адрес: отказ до ${operation} без потери прогресса`,
        );
        let batch = await step(
          await action(
            await createdBatch([file(bytes, `stale-${operation}.docx`, 'ru')]),
            'start',
          ),
          0,
        );
        if (operation === 'upload') batch = await step(batch, 0);
        const priorProgress = record(records(batch.items)[0]?.progress);
        const target = record(priorProgress.target);
        const path = `/documents/${text(target.documentId)}`;
        const edited = await fixture.call(CERTIFICATION_OWNER, path, {
          method: 'PATCH',
          body: {
            expectedRevision: 1,
            title: `Human correction before ${operation}`,
            purpose: 'Native metadata changed independently',
          },
        });
        expect(edited.status, await edited.clone().text()).toBe(200);
        const afterEdit = await fixture.call(CERTIFICATION_OWNER, path);
        expect(afterEdit.status).toBe(200);
        const nativeAfterEdit = record(await afterEdit.json());
        const response =
          operation === 'upload'
            ? await raw(batch, 0, bytes)
            : await fixture.call(
                CERTIFICATION_OWNER,
                `${batchPath(batch)}/items/${text(records(batch.items)[0]?.id)}/advance`,
                { method: 'POST', body: { expectedRevision: batch.revision } },
              );
        expect(response.status).toBe(409);
        batch = await reopened(batch);
        expect(records(batch.items)[0]).toMatchObject({
          progress: priorProgress,
          failureCount: 1,
          lastAttempt: { outcome: 'failed', code: 'stale_target' },
        });
        batch = await step(batch, 0, 'skip');
        expect(batch.phase).toBe('completed');
        expect(record(records(batch.items)[0]?.progress).retained).toEqual(
          priorProgress,
        );
        expect(
          await (await fixture.call(CERTIFICATION_OWNER, path)).json(),
        ).toEqual(nativeAfterEdit);
      },
    );

    it('rejects changed originals and changed native Document metadata while retaining the exact prior checkpoint', async () => {
      const bytes = literalDocx(
        'Адрес: Учебная 1454, проверка точного оригинала',
      );
      let batch = await createdBatch([file(bytes, 'exact.docx', 'ru')]);
      batch = await action(batch, 'start');
      batch = await step(await step(batch, 0), 0);
      const target = record(record(records(batch.items)[0]?.progress).target);
      const wrong = await raw(
        batch,
        0,
        literalDocx('Адрес: это другой оригинал'),
      );
      expect(wrong.status).toBe(400);
      batch = await reopened(batch);
      expect(records(batch.items)[0]).toMatchObject({
        failureCount: 1,
        lastAttempt: { outcome: 'failed', code: 'invalid_file' },
        progress: { stage: 'linked', target },
      });
      const changed = await fixture.call(
        CERTIFICATION_OWNER,
        `/documents/${text(target.documentId)}`,
        {
          method: 'PATCH',
          body: {
            expectedRevision: 1,
            title: 'Reviewed by another native edit',
            purpose: 'Changed after admission',
          },
        },
      );
      expect(changed.status, await changed.clone().text()).toBe(200);
      const stale = await raw(batch, 0, bytes);
      expect(stale.status).toBe(409);
      const refused = await reopened(batch);
      expect(record(records(refused.items)[0]?.progress)).toEqual(
        record(records(batch.items)[0]?.progress),
      );
      expect(records(refused.items)[0]).toMatchObject({
        failureCount: 2,
        lastAttempt: { outcome: 'failed', code: 'stale_target' },
      });
      const noSource = record(
        await (
          await fixture.call(
            CERTIFICATION_OWNER,
            `/projects/${fixture.projectId}/dossier-analysis`,
          )
        ).json(),
      );
      expect(
        records(noSource.sources).some(
          (source) => source.documentId === target.documentId,
        ),
      ).toBe(false);
    });

    it('rechecks live captured authority on resume and retains read-only checkpoints after revocation', async () => {
      const admitted = await createdBatch([
        file(
          literalDocx('Адрес: разрешение на продолжение'),
          'grant.docx',
          'ru',
        ),
      ]);
      const route = '/company-document-project-organizer-assignments';
      const revoked = await fixture.call(
        CERTIFICATION_OWNER,
        `${route}/${fixture.membership(CERTIFICATION_OWNER)}/${fixture.companyId}`,
        { method: 'DELETE', company: null },
      );
      expect(revoked.status, await revoked.clone().text()).toBe(200);
      try {
        const denied = await fixture.call(
          CERTIFICATION_OWNER,
          `${batchPath(admitted)}/state`,
          {
            method: 'POST',
            body: { action: 'start', expectedRevision: admitted.revision },
          },
        );
        expect(denied.status).toBe(403);
        expect(await reopened(admitted)).toEqual(admitted);
      } finally {
        await fixture.grant(CERTIFICATION_OWNER, route);
      }
      expect((await action(admitted, 'start')).phase).toBe('active');
    });

    it('identifies an original admitted in another concurrent actor-owned batch before either batch creates a native Document', async () => {
      const original = file(
        literalDocx('Адрес: параллельные пакеты 1454'),
        'parallel.docx',
        'ru',
      );
      const admitted = await Promise.all([
        createdBatch([original]),
        createdBatch([{ ...original, fileName: 'parallel-again.docx' }]),
      ]);
      const primary = admitted.find(
        (batch) => record(records(batch.items)[0]?.progress).stage === 'queued',
      );
      const duplicate = admitted.find(
        (batch) =>
          record(records(batch.items)[0]?.progress).stage === 'duplicate',
      );
      if (!primary || !duplicate)
        throw new Error(
          'Expected one queued original and one explicit earlier-batch duplicate.',
        );
      expect(record(records(duplicate.items)[0]?.progress)).toEqual({
        stage: 'duplicate',
        duplicateOf: {
          kind: 'batch',
          id: primary.id,
          itemId: records(primary.items)[0]?.id,
        },
      });
      const skipped = await step(duplicate, 0, 'skip');
      expect(skipped.phase).toBe('completed');
      expect(
        record(record(records(skipped.items)[0]?.progress).duplicateOf).id,
      ).toBe(primary.id);
    });

    it('counts an unreadable original without inventing a hash or creating a native Document', async () => {
      const before = await (
        await fixture.call(CERTIFICATION_OWNER, '/documents')
      ).json();
      const admitted = await createdBatch([
        {
          kind: 'invalid',
          fileName: 'unreadable.docx',
          size: 80,
          reason: 'unreadable_file',
        },
      ]);
      expect(admitted.phase).toBe('completed');
      expect(records(admitted.items)).toHaveLength(1);
      expect(record(records(admitted.items)[0]?.file).reason).toBe(
        'unreadable_file',
      );
      expect(
        await (await fixture.call(CERTIFICATION_OWNER, '/documents')).json(),
      ).toEqual(before);
    });

    it('enforces the original native Project/Client scope and bounded manifest at the migrated database boundary', async () => {
      const batch = await createdBatch([
        {
          kind: 'invalid',
          fileName: 'excluded.txt',
          size: 7,
          reason: 'unsupported_type',
        },
      ]);
      await expect(
        fixture.databasePool.query(
          'UPDATE dossier_intake_batches SET client_id = $1 WHERE id = $2',
          [randomUUID(), batch.id],
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'dossier_intake_batches_project_fk',
      });
      await expect(
        fixture.databasePool.query(
          'UPDATE dossier_intake_batches SET manifest = $1 WHERE id = $2',
          [
            JSON.stringify({ format: 'DOCUMENT_INTAKE_STATE/1', items: [] }),
            batch.id,
          ],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'dossier_intake_batches_state_check',
      });
      await expect(
        fixture.databasePool.query(
          'UPDATE dossier_intake_batches SET manifest = $1 WHERE id = $2',
          [JSON.stringify({ items: [{ kind: 'invalid' }] }), batch.id],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'dossier_intake_batches_state_check',
      });
      expect(await reopened(batch)).toEqual(batch);
    });
  },
);

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected response items.');
  const items: unknown[] = value;
  return items.map(record);
}
function literalDocx(content: string) {
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': strToU8(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${content}</w:t></w:r></w:p></w:body></w:document>`,
    ),
  });
}
