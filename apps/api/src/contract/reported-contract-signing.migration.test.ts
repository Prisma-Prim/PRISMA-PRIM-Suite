import { commandFingerprint } from '../command/idempotent-command.js';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import { PDF_A } from '../documents/mission-document.test-support.js';
import { registerReceivedContract } from '../documents/received-contract.test-support.js';
import {
  ESTIMATE_OFFER_PREPARER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { seedLegacyOffer } from '../offer/offer-historical.test-fixture.js';

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
      const received = await registerReceivedContract(f),
        source = received.ready.source;
      const target = {
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      };
      for (const path of [
        '/company-document-content-reader-assignments',
        '/company-document-content-uploader-assignments',
        '/company-document-approver-assignments',
        '/company-project-assignments',
        '/company-task-manager-assignments',
        '/company-task-result-recorder-assignments',
        '/company-mission-deliverable-access-assignments',
        '/company-document-project-organizer-assignments',
      ])
        await f.grant({
          path,
          companyId: source.companyId,
          membershipId: source.preparerMembershipId,
        });
      const command = (
        path: string,
        body: unknown,
        key: string = randomUUID(),
      ) => f.command({ ...target, path, body, key });
      const documentId = responseString(received.document, 'id'),
        documentVersionId = responseString(
          responseRecord(received.document.version),
          'id',
        );
      expect((await received.upload(documentVersionId, 1, PDF_A)).status).toBe(
        201,
      );
      expect(
        (
          await received.mutate(
            `/versions/${documentVersionId}/official-designation`,
            { expectedRevision: 2 },
          )
        ).status,
      ).toBe(200);
      // The genuine old schema has no declaration table. Current exact-read code is intentionally
      // unavailable there; native historical approval uses the actual 0083 guards, never disabled.
      const approvalBody = {
        expectedContractRevision: 1,
        acknowledgedWarningCodes: [
          'MODEL_WORDING_REVIEWED',
          'ANNEX_SCOPE_REVIEWED',
        ],
        reviewBasis: 'Prior model Contract deliberately approved',
      };
      const quality = responseRecord(
        await command(
          `${received.ready.path}/versions/${received.contractVersionId}/quality-checks`,
          {},
        ),
      );
      const approvalKey = 'genuine-0083-model-approval';
      const connection = await f.pool.connect();
      try {
        await connection.query('BEGIN');
        const fingerprint = commandFingerprint({
          kind: 'APPROVE',
          opportunityId: source.opportunityId,
          versionId: received.contractVersionId,
          payload: approvalBody,
        });
        const values = [
          received.contractId,
          received.contractVersionId,
          responseString(quality, 'id'),
          randomUUID(),
          approvalBody.reviewBasis,
          JSON.stringify([...approvalBody.acknowledgedWarningCodes].sort()),
        ];
        await connection.query(
          `INSERT INTO contract_decisions(id,workspace_id,company_id,contract_id,contract_version_id,kind,result_revision,actor_internal_user_id,actor_workspace_membership_id,decided_at,quality_run_id,representation_checksum,acknowledged_warning_codes,review_basis)
        SELECT $4,v.workspace_id,v.company_id,v.contract_id,v.id,'APPROVE',2,q.actor_internal_user_id,q.actor_workspace_membership_id,q.evaluated_at,q.id,v.model_generation_snapshot->'representation'->>'sha256',$6::jsonb,$5 FROM contract_versions v JOIN contract_quality_runs q ON q.contract_version_id=v.id AND q.id=$3 WHERE v.contract_id=$1 AND v.id=$2`,
          values,
        );
        await connection.query(
          "UPDATE contract_versions SET decision_state='APPROVED' WHERE id=$1",
          [received.contractVersionId],
        );
        await connection.query('UPDATE contracts SET revision=2 WHERE id=$1', [
          received.contractId,
        ]);
        await connection.query(
          `INSERT INTO contract_commands(workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_contract_id,kind,result_decision_id,created_at) SELECT c.workspace_id,c.company_id,d.actor_workspace_membership_id,$2,$3,c.opportunity_id,c.id,'APPROVE',d.id,d.decided_at FROM contracts c JOIN contract_decisions d ON d.contract_id=c.id WHERE c.id=$1`,
          [received.contractId, approvalKey, fingerprint],
        );
        await connection.query(
          `INSERT INTO contract_events(workspace_id,company_id,contract_id,contract_version_id,action,actor_internal_user_id,actor_workspace_membership_id,occurred_at,metadata) SELECT c.workspace_id,c.company_id,c.id,v.id,'contract_version.approved',d.actor_internal_user_id,d.actor_workspace_membership_id,d.decided_at,model_contract_event_metadata(c,v,2)||jsonb_build_object('contractVersionId',v.id::text,'versionNumber',v.version_number,'ruleSetVersion',1,'acknowledgedWarningCodes',d.acknowledged_warning_codes) FROM contracts c JOIN contract_versions v ON v.contract_id=c.id JOIN contract_decisions d ON d.contract_version_id=v.id WHERE c.id=$1`,
          [received.contractId],
        );
        await connection.query('COMMIT');
      } finally {
        await connection.query('ROLLBACK');
        connection.release();
      }

      const oldRequest = responseRecord(
        await command('/commercial-intake/requests', {
          clientAccountId: source.clientId,
          originalText: 'Prior illustrative case',
          opportunity: {
            title: 'Prior illustrative case',
            nextAction: 'Preserve old facts',
          },
        }),
      );
      const oldSource = {
        ...source,
        requestId: responseString(oldRequest, 'id'),
        opportunityId: responseString(
          responseRecord(oldRequest.initialOpportunity),
          'id',
        ),
      };
      const users = await f.pool.query<{
        userId: string;
        readerUserId: string;
      }>(
        'SELECT m.internal_user_id "userId",r.internal_user_id "readerUserId" FROM workspace_memberships m JOIN workspace_memberships r ON r.id=$2 WHERE m.id=$1',
        [source.preparerMembershipId, source.readerMembershipId],
      );
      const actor = users.rows[0];
      if (!actor) throw new Error('Missing historical identities.');
      const snapshot = await f.illustrativeSnapshot(oldSource, false);
      await seedLegacyOffer({
        ...oldSource,
        ...actor,
        pool: f.pool,
        snapshot,
        reference: 2,
        accepted: true,
        contract: true,
        linkedProject: true,
      });
      const projects = await f.pool.query<{ id: string }>(
        'SELECT id FROM projects WHERE company_id=$1',
        [source.companyId],
      );
      const projectId = projects.rows[0]?.id;
      if (!projectId) throw new Error('Missing old linked Project.');
      const task = responseRecord(
        await command(`/projects/${projectId}/tasks`, {
          title: 'Prior declared ordinary result',
        }),
      );
      const taskId = responseString(task, 'id');
      const mission = responseRecord(
        await command('/documents', {
          type: 'mission-deliverable',
          clientId: source.clientId,
          title: 'Prior mission PDF',
          purpose: 'Preserve exact result',
        }),
      );
      const missionId = responseString(mission, 'id'),
        missionVersionId = responseString(
          responseRecord(mission.version),
          'id',
        );
      const upload = await f.request({
        ...target,
        path: `/documents/${missionId}/versions/${missionVersionId}/content?expectedRevision=1&fileName=prior-demo.pdf`,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/pdf',
            'idempotency-key': randomUUID(),
          },
          body: new Uint8Array(PDF_A),
        },
      });
      expect(upload.status).toBe(201);
      const designated = await f.request({
        ...target,
        path: `/documents/${missionId}/versions/${missionVersionId}/official-designation`,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify({ expectedRevision: 2 }),
        },
      });
      expect(designated.status).toBe(200);
      await command(`/documents/${missionId}/project-association`, {
        action: 'link',
        projectId,
        expectedRevision: 0,
      });
      const resultIntent = {
        expectedTaskVersion: 1,
        expectedResultRevision: 0,
        documentId: missionId,
        versionId: missionVersionId,
        declaration: 'Prior literal synthetic result',
      };
      const resultKey = 'genuine-0083-task-result';
      const result = await command(
        `/tasks/${taskId}/results`,
        resultIntent,
        resultKey,
      );
      const resultBefore = await f.read({
        ...target,
        path: `/tasks/${taskId}/results`,
      });
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
      await f.applyCurrentMigrations();
      await f.applyCurrentMigrations();
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
