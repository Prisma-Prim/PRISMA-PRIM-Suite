import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  PDF_A,
  type MissionDocumentFixture,
} from './mission-document.test-support.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades real previous questionnaire rows, receipts and exact PDF bytes without granting mission access',
  async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('TEST_DATABASE_URL is required.');
    const journal = record(
      JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
    );
    if (!Array.isArray(journal.entries))
      throw new Error('Invalid migration entries.');
    const entries = journal.entries;
    const index = entries.findIndex(
      (entry) => record(entry).tag === '0075_mission_deliverable_pdfs',
    );
    expect(index).toBeGreaterThan(0);
    const previous = await mkdtemp(join(tmpdir(), 'mission-upgrade-'));
    let fixture: MissionDocumentFixture | undefined;
    try {
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries: entries.slice(0, index) }),
      );
      for (const entry of entries.slice(0, index)) {
        const tag = text(record(entry).tag);
        if (!/^\d{4}_[a-z0-9_-]+$/u.test(tag))
          throw new Error('Invalid migration tag.');
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      }
      fixture = await createMissionDocumentFixture(url, previous);
      const { clientId } = await fixture.reset();
      await fixture.grant('/company-document-content-reader-assignments');
      await fixture.grant('/company-document-content-uploader-assignments');
      const body = {
        clientId,
        title: 'Prior questionnaire DEMO',
        purpose: 'Preserve prior behavior',
        url: 'https://example.test/prior',
      };
      const registered = await fixture.call('/documents', {
        method: 'POST',
        body,
        key: 'prior-registration',
      });
      expect(registered.status).toBe(201);
      const document = await json(registered);
      const scope = {
        documentId: text(document.id),
        versionId: text(record(document.version).id),
      };
      const upload = await fixture.upload({
        ...scope,
        revision: 1,
        bytes: PDF_A,
        key: 'prior-pdf',
      });
      expect(upload.status).toBe(201);
      const receipt = await upload.json();
      expect(
        (
          await fixture.call(`/documents/${scope.documentId}`, {
            method: 'PATCH',
            body: { expectedRevision: 2, title: 'Corrected prior DEMO' },
            key: 'prior-correction',
          })
        ).status,
      ).toBe(200);
      const tables = [
        'working_documents',
        'document_versions',
        'document_representations',
        'document_pdfs',
        'document_version_commands',
        'document_correction_commands',
        'document_registration_events',
        'document_project_events',
        'company_role_assignments',
      ];
      const { pool } = fixture;
      const snapshot = async () => {
        const result = [];
        for (const table of tables)
          result.push(
            (await pool.query(`SELECT * FROM ${table} ORDER BY id`)).rows,
          );
        return result;
      };
      const before = await snapshot();
      const beforeRead = await (
        await fixture.call(`/documents/${scope.documentId}`)
      ).json();
      await migrate(drizzle(fixture.pool), {
        migrationsFolder: resolve('drizzle'),
      });
      expect(await snapshot()).toEqual(before);
      expect(
        await (await fixture.call(`/documents/${scope.documentId}`)).json(),
      ).toEqual(beforeRead);
      const replay = await fixture.upload({
        ...scope,
        revision: 1,
        bytes: PDF_A,
        key: 'prior-pdf',
      });
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(receipt);
      const content = await fixture.call(
        `/documents/${scope.documentId}/versions/${scope.versionId}/content`,
      );
      expect(content.status).toBe(200);
      expect(Buffer.from(await content.arrayBuffer())).toEqual(PDF_A);
      const actor = record(
        (await json(await fixture.call('/access/current-actor'))).activeCompany,
      );
      expect(actor.documentPermissions).not.toContain(
        'document.mission_deliverable.access',
      );
      expect(
        (
          await fixture.call('/documents', {
            method: 'POST',
            body: {
              type: 'mission-deliverable',
              clientId,
              title: 'Not granted DEMO',
              purpose: 'No automatic access',
            },
          })
        ).status,
      ).toBe(403);
    } finally {
      await fixture?.close();
      await rm(previous, { recursive: true, force: true });
    }
  },
  60_000,
);
