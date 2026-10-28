import {
  restoreFrozenTaskSetup,
  applyHistoricalTaskTarget,
} from '../task/frozen-task-migration.test-support.js';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import { PDF_A } from '../documents/mission-document.test-support.js';
import {
  ESTIMATE_OFFER_PREPARER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades genuine 0083 preserving received bytes, simulated signing, receipts, grants, links and declared Task results without backfill',
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
      const rawReceived = responseRecord(frozen.received);
      const rawReady = responseRecord(rawReceived.ready);
      const received = {
        ready: { path: responseString(rawReady, 'path') },
        contractVersionId: responseString(rawReceived, 'contractVersionId'),
        call: (suffix: string) =>
          f.request({
            path: responseString(rawReceived, 'path') + suffix,
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
      };
      const target = {
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      };
      const command = (
        path: string,
        body: unknown,
        key: string = randomUUID(),
      ) => f.command({ ...target, path, body, key });
      const taskId = responseString(frozen, 'taskId'),
        documentId = responseString(frozen, 'documentId'),
        documentVersionId = responseString(frozen, 'documentVersionId'),
        resultKey = responseString(frozen, 'resultKey');
      const resultIntent = frozen.resultIntent,
        result = frozen.result,
        resultBefore = frozen.resultBefore;
      const tables = (
        await f.pool.query<{ tablename: string }>(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        )
      ).rows.map((row) => row.tablename);
      if (tables.some((table) => !/^[a-z_]+$/u.test(table)))
        throw new Error('Invalid isolated migration table.');
      const facts = async (descriptionAdded = false) => {
        const rows: Record<string, unknown> = {};
        for (const table of tables)
          rows[table] = (
            await f.pool.query<{ facts: unknown }>(
              `SELECT coalesce(jsonb_agg(to_jsonb(t) ${descriptionAdded && table === 'tasks' ? "- 'description'" : ''} ORDER BY to_jsonb(t)::text),'[]'::jsonb) facts FROM ${table} t`,
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
      // The explicit Actor read above synchronizes its profile timestamp.
      const beforeCurrent = await facts();
      await f.applyCurrentMigrations();
      await f.applyCurrentMigrations();
      expect(await facts(true)).toEqual(beforeCurrent);
      expect(
        (await f.pool.query('SELECT description FROM tasks')).rows,
      ).toEqual([{ description: null }]);
      const path = `${received.ready.path}/versions/${received.contractVersionId}/signing-declarations`;
      expect(
        (await f.request({ ...target, path: path + '/pdf-candidates' })).status,
      ).toBe(403);
      await f.restart();
      expect(
        Buffer.from(
          await (
            await received.call(`/versions/${documentVersionId}/content`)
          ).arrayBuffer(),
        ),
      ).toEqual(PDF_A);
      expect(
        await f.read({ ...target, path: `/tasks/${taskId}/results` }),
      ).toEqual(resultBefore);
      expect(
        await command(`/tasks/${taskId}/results`, resultIntent, resultKey),
      ).toEqual(result);
      await f.grant({
        path: '/company-contract-signature-declarer-assignments',
        companyId: source.companyId,
        membershipId: source.preparerMembershipId,
      });
      const page = responseRecord(
        await f.read({ ...target, path: path + '/pdf-candidates' }),
      );
      if (!Array.isArray(page.items) || !page.items[0])
        throw new Error('Missing post-upgrade eligible PDF.');
      const pdf = responseRecord(page.items[0]);
      expect(
        await command(path, {
          expectedContractRevision: 2,
          documentId,
          documentVersionId,
          representationId: responseString(pdf, 'representationId'),
          providerSignatory: {
            label: 'Prior reported provider',
            signedOn: null,
            mandate: { kind: 'UNKNOWN' },
          },
          clientSignatory: {
            label: 'Prior reported Client',
            signedOn: '2026-01-01',
            mandate: { kind: 'UNKNOWN' },
          },
          concordanceBasis: 'Exact prior PDF compared',
          acceptanceBasis: 'Human case statement after explicit new grant',
          acknowledgedWarningCodes: page.warningCodes,
        }),
      ).toMatchObject({ evidenceKind: 'DECLARED_RECEIVED_PDF' });
      async function insertReportedEvidenceIntoLegacyMode() {
        const connection = await f.pool.connect();
        try {
          await connection.query('BEGIN');
          const inserted = await connection.query(
            `INSERT INTO contract_signing_declarations(workspace_id,company_id,contract_id,contract_version_id,approval_decision_id,quality_run_id,representation_checksum,document_id,document_version_id,representation_id,result_revision,actor_workspace_membership_id,actor_internal_user_id,recorded_at,statement,pdf)
          SELECT v.workspace_id,v.company_id,v.contract_id,v.id,d.id,d.quality_run_id,d.representation_checksum,s.document_id,s.document_version_id,s.representation_id,3,d.actor_workspace_membership_id,d.actor_internal_user_id,d.decided_at,s.statement,s.pdf
          FROM contract_versions v JOIN contracts c ON c.id=v.contract_id JOIN contract_decisions d ON d.contract_version_id=v.id AND d.kind='APPROVE' CROSS JOIN contract_signing_declarations s
          WHERE c.company_id=$1 AND c.origin<>'COMPANY_MODEL_OFFER' AND s.contract_version_id=$2 LIMIT 1`,
            [source.companyId, received.contractVersionId],
          );
          expect(inserted.rowCount).toBe(1);
          await connection.query('SET CONSTRAINTS ALL IMMEDIATE');
        } finally {
          await connection.query('ROLLBACK');
          connection.release();
        }
      }
      await expect(
        insertReportedEvidenceIntoLegacyMode(),
      ).rejects.toHaveProperty('code', '23514');
    } finally {
      await fixture?.close();
      await scanner.close();
      await rm(previous, { recursive: true, force: true });
    }
  },
  30_000,
);
