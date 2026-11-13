import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import {
  CERTIFICATION_APPROVER as APPROVER,
  openCertificationFixture,
  record,
} from './certification.test-support.js';
import {
  certificateReleaseCommands,
  CERTIFICATE_TEXTS,
} from './certification-release.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('Certificate Revision migration', () => {
  it('upgrades real issued and legacy Cases without rewriting issuance, receipts or events and guards immutable scoped revisions', async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
    const { fixture, migrationWhen, close } =
      await openRevisionMigrationFixture(databaseUrl);
    try {
      const { approved, issue, granted, attach, read, ok } =
        certificateReleaseCommands(() => fixture);
      const ordinary = await approved('MIGRATION-CURRENT-1295');
      await issue(ordinary, 'MIGRATION-CURRENT-1295');
      const legacy = await granted();
      const attachmentId = await attach(legacy, 'certificate');
      // Exact pre-release persisted shape, with real Case/actor/document FKs.
      await fixture.databasePool.query(
        `
        INSERT INTO certification_certificates (workspace_id,company_id,case_id,case_revision,number,valid_from,valid_until,first_surveillance_by,texts,independence_attested,attachment_id,actor_membership_id,actor_internal_user_id,actor_display_name,recorded_at)
        SELECT workspace_id,company_id,case_id,(SELECT revision+1 FROM certification_cases WHERE id=$1),'MIGRATION-LEGACY-1295','2026-11-06','2029-11-05','2027-11-06',$2::jsonb,true,$3,actor_membership_id,actor_internal_user_id,actor_display_name,recorded_at
        FROM certification_step_versions WHERE case_id=$1 AND step='decision' ORDER BY version DESC LIMIT 1`,
        [legacy, JSON.stringify(CERTIFICATE_TEXTS), attachmentId],
      );
      await fixture.databasePool.query(
        "UPDATE certification_cases SET status='certified', revision=revision+1 WHERE id=$1",
        [legacy],
      );
      const ordinaryBefore = await read(ordinary);
      const legacyBefore = await read(legacy);
      const originals = await fixture.databasePool.query(
        'SELECT * FROM certification_certificates WHERE case_id=ANY($1::uuid[]) ORDER BY case_id',
        [[ordinary, legacy]],
      );
      const receipts = await fixture.databasePool.query(
        'SELECT * FROM certification_receipts WHERE case_id=ANY($1::uuid[]) ORDER BY id',
        [[ordinary, legacy]],
      );
      const events = await fixture.databasePool.query(
        'SELECT * FROM certification_events WHERE case_id=ANY($1::uuid[]) ORDER BY id',
        [[ordinary, legacy]],
      );
      expect(
        (
          await fixture.databasePool.query(
            'SELECT max(created_at)::text AS latest FROM drizzle.__drizzle_migrations',
          )
        ).rows,
      ).toEqual([{ latest: String(migrationWhen) }]);
      // Recreate precisely the predecessor boundary around these real rows.
      await fixture.databasePool.query(
        'DROP TABLE certification_certificate_revisions',
      );
      await fixture.databasePool.query(
        'DELETE FROM drizzle.__drizzle_migrations WHERE created_at=$1',
        [migrationWhen],
      );
      const database = drizzle(fixture.databasePool);
      await migrate(database, { migrationsFolder: resolve('drizzle') });
      await migrate(database, { migrationsFolder: resolve('drizzle') });
      expect(
        (
          await fixture.databasePool.query(
            'SELECT * FROM certification_certificates WHERE case_id=ANY($1::uuid[]) ORDER BY case_id',
            [[ordinary, legacy]],
          )
        ).rows,
      ).toEqual(originals.rows);
      expect(
        (
          await fixture.databasePool.query(
            'SELECT * FROM certification_receipts WHERE case_id=ANY($1::uuid[]) ORDER BY id',
            [[ordinary, legacy]],
          )
        ).rows,
      ).toEqual(receipts.rows);
      expect(
        (
          await fixture.databasePool.query(
            'SELECT * FROM certification_events WHERE case_id=ANY($1::uuid[]) ORDER BY id',
            [[ordinary, legacy]],
          )
        ).rows,
      ).toEqual(events.rows);
      expect(await read(ordinary)).toEqual(ordinaryBefore);
      expect(await read(legacy)).toEqual(legacyBefore);
      const release = record(legacyBefore.release);
      expect(release).toMatchObject({
        legacyIssuance: true,
        drafts: [],
        opinions: [],
        approvals: [],
        revisions: [],
        currentRevisionIndex: 0,
      });
      expect(record(legacyBefore.certificate)).toMatchObject({
        issuedOn: null,
        approvedDraftVersionId: null,
      });
      expect(await fixture.numberObservationCount(legacy)).toBe(0);
      await ok(legacy, APPROVER, 'certificate-revisions', {
        reason: 'Correct a legacy PDF without inventing release history.',
        revisedOn: '2026-11-01',
        attachmentId: await attach(legacy, 'certificate'),
        revisionMarked: false,
        independenceAttested: true,
      });
      expect(record((await read(legacy)).release)).toMatchObject({
        legacyIssuance: true,
        currentRevisionIndex: 1,
        drafts: [],
        opinions: [],
        approvals: [],
      });
      expect((await read(legacy)).certificate).toEqual(
        legacyBefore.certificate,
      );
      expect(await fixture.numberObservationCount(legacy)).toBe(0);
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
          [legacy],
        ),
      ).rejects.toBeDefined();
    } finally {
      await close();
    }
  }, 120_000);
});

/** Seed this historical boundary before any later migration can be recorded. */
async function openRevisionMigrationFixture(databaseUrl: string) {
  const migrationsFolder = await mkdtemp(
    join(tmpdir(), 'certificate-revisions-boundary-'),
  );
  try {
    const directory = resolve('drizzle');
    const raw: unknown = JSON.parse(
      await readFile(join(directory, 'meta', '_journal.json'), 'utf8'),
    );
    const journal = record(raw);
    if (!Array.isArray(journal.entries))
      throw new Error('Journal entries required.');
    const entries = journal.entries.map(record);
    const index = entries.findIndex(
      (entry) => entry.tag === '0113_certification_certificate_revisions',
    );
    const target = entries[index];
    if (index < 0 || typeof target?.when !== 'number')
      throw new Error('Revision migration timestamp required.');
    const boundary = entries.slice(0, index + 1);
    await mkdir(join(migrationsFolder, 'meta'));
    await writeFile(
      join(migrationsFolder, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: boundary }),
    );
    for (const entry of boundary) {
      if (typeof entry.tag !== 'string') throw new Error('Tag required.');
      await cp(
        join(directory, `${entry.tag}.sql`),
        join(migrationsFolder, `${entry.tag}.sql`),
      );
    }
    const fixture = await openCertificationFixture({
      databaseUrl,
      namePrefix: 'revision1295_migration',
      workspaceId: '00000000-0000-4000-8000-000000012950',
      migrationsFolder,
    });
    return {
      fixture,
      migrationWhen: target.when,
      async close() {
        try {
          await fixture.close();
        } finally {
          await rm(migrationsFolder, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    await rm(migrationsFolder, { recursive: true, force: true });
    throw error;
  }
}
