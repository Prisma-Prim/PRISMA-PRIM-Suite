import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CERTIFICATION_APPROVER as APPROVER,
  openCertificationFixture,
  record,
} from './certification.test-support.js';
import { certificateReleaseCommands } from './certification-release.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('Certificate Revision schema', () => {
  it('keeps scoped Certificate Revisions immutable and checked and the issued Certificate fixed on a database migrated from empty', async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
    const fixture = await openCertificationFixture({
      databaseUrl,
      namePrefix: 'revision1295_schema',
      workspaceId: '00000000-0000-4000-8000-000000012950',
    });
    try {
      const { approved, issue, attach, read, ok } = certificateReleaseCommands(
        () => fixture,
      );
      const issued = await approved('SCHEMA-CURRENT-1295');
      await issue(issued, 'SCHEMA-CURRENT-1295');
      const before = await read(issued);
      await ok(issued, APPROVER, 'certificate-revisions', {
        reason: 'Correct the PDF after issuance.',
        revisedOn: '2026-11-07',
        attachmentId: await attach(issued, 'certificate'),
        revisionMarked: false,
        independenceAttested: true,
      });
      expect(record((await read(issued)).release)).toMatchObject({
        currentRevisionIndex: 1,
      });
      expect((await read(issued)).certificate).toEqual(before.certificate);
      for (const sql of [
        "UPDATE certification_certificate_revisions SET reason='mutated'",
        'DELETE FROM certification_certificate_revisions',
      ])
        await expect(fixture.databasePool.query(sql)).rejects.toMatchObject({
          code: '23514',
        });
      for (const [fields, code] of [
        [{ index: 0 }, '23514'],
        [{ reason: ' ' }, '23514'],
        [{ revision_marked: null }, '23502'],
        [{ independence_attested: false }, '23514'],
        [{ company_id: randomUUID() }, '23503'],
        [{ case_id: randomUUID() }, '23503'],
        [{ workspace_id: randomUUID() }, '23503'],
      ] satisfies [Record<string, unknown>, string][])
        await expect(
          fixture.databasePool.query(
            `INSERT INTO certification_certificate_revisions SELECT (jsonb_populate_record(NULL::certification_certificate_revisions,to_jsonb(r) || $1::jsonb)).* FROM certification_certificate_revisions r LIMIT 1`,
            [JSON.stringify({ id: randomUUID(), ...fields })],
          ),
        ).rejects.toMatchObject({ code });
      await expect(
        fixture.databasePool.query(
          "UPDATE certification_certificates SET number='MUTATED' WHERE case_id=$1",
          [issued],
        ),
      ).rejects.toBeDefined();
    } finally {
      await fixture.close();
    }
  }, 120_000);
});
