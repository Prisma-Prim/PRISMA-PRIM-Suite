import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { prepareModelContractSource } from '../contract/model-contract.test-fixture.js';
import {
  ESTIMATE_OFFER_PREPARER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import { PDF_A, PDF_B } from './mission-document.test-support.js';
import { receivedContractEffects } from './received-contract.test-support.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades genuine 0082 without changing existing captures, model Contracts, questionnaire/mission PDFs, receipts, associations or Task results',
  async () => {
    const previous = await mkdtemp(join(tmpdir(), 'received-contract-0082-'));
    let fixture:
      Awaited<ReturnType<typeof openEstimateOfferFixture>> | undefined;
    const scanner = await openDocumentScannerFixture();
    try {
      const journal = responseRecord(
        JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
      );
      if (!Array.isArray(journal.entries))
        throw new Error('Invalid migration journal');
      const entries = journal.entries.map(responseRecord),
        index = entries.findIndex(
          (entry) => entry.tag === '0083_received_contract_pdfs',
        );
      expect(index).toBe(83);
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries: entries.slice(0, index) }),
      );
      for (const entry of entries.slice(0, index)) {
        const tag = responseString(entry, 'tag');
        if (!/^\d{4}_[a-z0-9_-]+$/u.test(tag))
          throw new Error('Invalid migration tag');
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
            "SELECT to_regclass('received_contract_document_relations') AS relation",
          )
        ).rows,
      ).toEqual([{ relation: null }]);
      const ready = await prepareModelContractSource(f),
        s = ready.source;
      const contract = responseRecord(
        await ready.invoke(ready.path + '/from-approved-model', ready.intent),
      );
      for (const path of [
        '/company-document-registrar-assignments',
        '/company-mission-deliverable-access-assignments',
        '/company-document-content-reader-assignments',
        '/company-document-content-uploader-assignments',
        '/company-document-approver-assignments',
        '/company-document-project-organizer-assignments',
        '/company-project-assignments',
        '/company-task-manager-assignments',
        '/company-task-result-recorder-assignments',
      ])
        await f.grant({
          path,
          companyId: s.companyId,
          membershipId: s.preparerMembershipId,
        });
      const command = (
        path: string,
        body: unknown,
        key: string = randomUUID(),
      ) =>
        f.command({
          path,
          body,
          key,
          companyId: s.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        });
      const request = (path: string, init: RequestInit = {}) =>
        f.request({
          path,
          init,
          companyId: s.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        });
      const project = responseRecord(
        await command('/projects', {
          title: 'Prior received migration Project DEMO',
          clientAccountId: s.clientId,
        }),
      );
      const projectId = responseString(project, 'id');
      const task = responseRecord(
        await command(`/projects/${projectId}/tasks`, {
          title: 'Prior ordinary result Task DEMO',
        }),
      );
      const registrations = [
        {
          clientId: s.clientId,
          title: 'Prior questionnaire DEMO',
          purpose: 'Conserve ordinary reference',
          url: 'https://example.test/received-upgrade',
        },
        {
          type: 'mission-deliverable',
          clientId: s.clientId,
          title: 'Prior mission output DEMO',
          purpose: 'Conserve ordinary result',
        },
      ];
      const preserved: Array<{
        documentId: string;
        firstVersionId: string;
        versionId: string;
        before: unknown;
        body: unknown;
        key: string;
      }> = [];
      for (const [index, body] of registrations.entries()) {
        const key = 'prior-received-upgrade-' + index;
        const document = responseRecord(await command('/documents', body, key));
        const documentId = responseString(document, 'id'),
          firstVersionId = responseString(
            responseRecord(document.version),
            'id',
          );
        const upload = async (
          versionId: string,
          revision: number,
          bytes: Buffer,
        ) => {
          const result = await request(
            `/documents/${documentId}/versions/${versionId}/content?expectedRevision=${revision}&fileName=prior-demo.pdf`,
            {
              method: 'POST',
              headers: {
                'content-type': 'application/pdf',
                'idempotency-key': 'prior-upgrade-pdf-' + versionId,
              },
              body: new Uint8Array(bytes),
            },
          );
          expect(result.status).toBe(201);
        };
        const designate = async (versionId: string, revision: number) => {
          const result = await request(
            `/documents/${documentId}/versions/${versionId}/official-designation`,
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': 'prior-upgrade-official-' + versionId,
              },
              body: JSON.stringify({ expectedRevision: revision }),
            },
          );
          expect(result.status).toBe(200);
        };
        await upload(firstVersionId, 1, PDF_A);
        await designate(firstVersionId, 2);
        const drafted = responseRecord(
          await command(`/documents/${documentId}/versions`, {
            expectedRevision: 3,
          }),
        );
        const versionId = responseString(drafted, 'versionId');
        await upload(versionId, 4, PDF_B);
        await designate(versionId, 5);
        await command(`/documents/${documentId}/project-association`, {
          action: 'link',
          projectId,
          expectedRevision: 0,
        });
        const read = await request(`/documents/${documentId}`);
        expect(read.status).toBe(200);
        preserved.push({
          documentId,
          firstVersionId,
          versionId,
          before: await read.json(),
          body,
          key,
        });
      }
      const mission = preserved[1];
      if (!mission) throw new Error('Missing prior mission');
      const taskId = responseString(task, 'id');
      await command(`/tasks/${taskId}/results`, {
        expectedTaskVersion: 1,
        expectedResultRevision: 0,
        documentId: mission.documentId,
        versionId: mission.versionId,
        declaration: 'Prior declared synthetic mission result',
      });
      const actorBefore = await (await request('/access/current-actor')).json();
      const before = await receivedContractEffects(f.pool, false);
      // Compare existing business rows outside the Document-owned effects too.
      const domainSnapshot = async () => {
        const rows: Record<string, unknown> = {};
        for (const table of [
          'company_role_assignments',
          'projects',
          'tasks',
          'task_result_declarations',
          'task_result_commands',
          'task_result_events',
          'contracts',
          'contract_versions',
          'contract_commands',
          'contract_events',
          'contract_models',
          'contract_model_versions',
          'offers',
          'offer_versions',
        ])
          rows[table] = (
            await f.pool.query<{ facts: unknown }>(
              `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS facts FROM ${table} t`,
            )
          ).rows[0]?.facts;
        return rows;
      };
      const domainBefore = await domainSnapshot();
      await f.applyCurrentMigrations();
      expect(await receivedContractEffects(f.pool)).toEqual({
        ...before,
        received_contract_document_relations: [],
      });
      expect(await domainSnapshot()).toEqual(domainBefore);
      expect(await (await request('/access/current-actor')).json()).toEqual(
        actorBefore,
      );
      expect(
        (
          await f.pool.query(
            "SELECT count(*)::int AS count FROM company_role_assignments WHERE bundle='company_received_contract_access'",
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      for (const capture of [null, 'v0', 'v2'])
        await expect(
          f.pool.query(
            "INSERT INTO company_role_assignments(workspace_id,company_id,workspace_membership_id,bundle,permission_set_version) SELECT workspace_id,company_id,workspace_membership_id,'company_received_contract_access',$1 FROM company_role_assignments WHERE company_id=$2 AND workspace_membership_id=$3 LIMIT 1",
            [capture, s.companyId, s.preparerMembershipId],
          ),
        ).rejects.toHaveProperty('code', '23514');
      const receivedBody = {
        type: 'received-contract',
        opportunityId: s.opportunityId,
        contractId: responseString(contract, 'id'),
        contractVersionId: responseString(
          responseRecord(contract.version),
          'id',
        ),
        title: 'Post-upgrade received original',
        purpose: 'Explicit new authority only',
        sourceDescription: 'Synthetic received source',
      };
      expect(
        (
          await f.post({
            path: '/documents',
            companyId: s.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
            body: receivedBody,
          })
        ).status,
      ).toBe(403);
      await f.restart();
      for (const item of preserved) {
        expect(await command('/documents', item.body, item.key)).toEqual(
          item.before,
        );
        for (const [versionId, bytes] of [
          [item.firstVersionId, PDF_A],
          [item.versionId, PDF_B],
        ] as const) {
          const download = await request(
            `/documents/${item.documentId}/versions/${versionId}/content`,
          );
          expect(download.status).toBe(200);
          expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
        }
      }
      expect(
        await (await request(`/tasks/${taskId}/results`)).json(),
      ).toMatchObject({
        current: {
          reference: {
            documentId: mission.documentId,
            versionId: mission.versionId,
          },
        },
      });
      await f.applyCurrentMigrations();
      expect(await domainSnapshot()).toEqual(domainBefore);
      await f.grant({
        path: '/company-received-contract-access-assignments',
        companyId: s.companyId,
        membershipId: s.preparerMembershipId,
      });
      expect(await command('/documents', receivedBody)).toMatchObject({
        type: 'received-contract',
        receivedContractRelation: { access: 'granted' },
      });
    } finally {
      await fixture?.close();
      await scanner.close();
      await rm(previous, { recursive: true, force: true });
    }
  },
);
