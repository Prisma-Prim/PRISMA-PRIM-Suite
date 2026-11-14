import {
  restoreFrozenTaskSetup,
  applyHistoricalTaskTarget,
} from '../task/frozen-task-migration.test-support.js';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  ESTIMATE_OFFER_PREPARER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'applies the reported signing migration to genuine 0083 preserving received bytes, simulated signing, receipts, grants, links and declared Task results without backfill',
  async () => {
    const previous = await mkdtemp(join(tmpdir(), 'reported-signing-0083-'));
    const scanner = await openDocumentScannerFixture();
    let fixture:
      Awaited<ReturnType<typeof openEstimateOfferFixture>> | undefined;
    try {
      const journal = responseRecord(
        JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
      );
      if (!Array.isArray(journal.entries))
        throw new Error('Missing migration journal.');
      const entries = journal.entries.map(responseRecord),
        index = entries.findIndex(
          (row) => row.tag === '0084_reported_contract_signing',
        );
      expect(index).toBe(84);
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries: entries.slice(0, index) }),
      );
      for (const row of entries.slice(0, index)) {
        const tag = responseString(row, 'tag');
        if (!/^\d{4}_[a-z0-9_-]+$/u.test(tag))
          throw new Error('Invalid migration tag.');
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      }
      fixture = await openEstimateOfferFixture({
        migrationsFolder: previous,
        scannerEnvironment: scanner.environment,
      });
      const f = fixture;
      expect(
        (
          await f.pool.query(
            "SELECT to_regclass('contract_signing_declarations') declaration",
          )
        ).rows,
      ).toEqual([{ declaration: null }]);
      const frozen = await restoreFrozenTaskSetup(
        f.pool,
        'reported-contract-signing',
      );
      const rawSource = responseRecord(frozen.source);
      const source = {
        companyId: responseString(rawSource, 'companyId'),
        preparerMembershipId: responseString(rawSource, 'preparerMembershipId'),
      };
      const target = {
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      };
      const tables = (
        await f.pool.query<{ tablename: string }>(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        )
      ).rows.map((row) => row.tablename);
      if (tables.some((table) => !/^[a-z_]+$/u.test(table)))
        throw new Error('Invalid isolated migration table.');
      const facts = async () => {
        const rows: Record<string, unknown> = {};
        for (const table of tables)
          rows[table] = (
            await f.pool.query<{ facts: unknown }>(
              `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) facts FROM ${table} t`,
            )
          ).rows[0]?.facts;
        return rows;
      };
      const actorBefore = await f.read({
          ...target,
          path: '/access/current-actor',
        }),
        before = await facts();
      await applyHistoricalTaskTarget({
        pool: f.pool,
        previous,
        journal,
        entries,
        index,
      });
      await applyHistoricalTaskTarget({
        pool: f.pool,
        previous,
        journal,
        entries,
        index,
      });
      expect(await facts()).toEqual(before);
      expect(
        await f.read({ ...target, path: '/access/current-actor' }),
      ).toEqual(actorBefore);
      expect(
        (
          await f.pool.query(
            "SELECT (SELECT count(*)::int FROM contract_signing_declarations) declarations,(SELECT count(*)::int FROM company_role_assignments WHERE bundle='company_contract_signature_declarer') grants",
          )
        ).rows,
      ).toEqual([{ declarations: 0, grants: 0 }]);
      for (const version of [null, 'v0', 'v2'])
        await expect(
          f.pool.query(
            "INSERT INTO company_role_assignments(workspace_id,company_id,workspace_membership_id,bundle,permission_set_version) SELECT workspace_id,company_id,workspace_membership_id,'company_contract_signature_declarer',$1 FROM company_role_assignments WHERE company_id=$2 LIMIT 1",
            [version, source.companyId],
          ),
        ).rejects.toHaveProperty('code', '23514');
      // Migration 0116 refuses these pre-description receipts (#1348), so the
      // upgrade proof stops at its own migration (#1343 A6).
    } finally {
      await fixture?.close();
      await scanner.close();
      await rm(previous, { recursive: true, force: true });
    }
  },
  30_000,
);
