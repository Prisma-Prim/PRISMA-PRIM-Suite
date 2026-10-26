import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { prepareReportedSigning } from './reported-contract-signing.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Independent reported-signing SQL integrity', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
    });
  });
  beforeEach(async () => {
    await fixture.reset();
    scanner.reset();
  });
  afterAll(async () => {
    await fixture?.close();
    await scanner?.close();
  });

  it('admits a complete native control and independently rejects forged scoped bindings, statement facts and incomplete coupled evidence', async () => {
    const foreign = await prepareReportedSigning(fixture),
      ready = await prepareReportedSigning(fixture, {
        clientTaxId: 'FOREIGN-INTEGRITY-877',
        correctedPdf: true,
      });
    const current = responseRecord(
      responseRecord(
        await fixture.read({ ...ready.target, path: ready.f.ready.path }),
      ).contract,
    );
    const version = responseRecord(current.version),
      approval = responseRecord(version.decision);
    const actor = responseRecord(
      await fixture.read({ ...ready.target, path: '/access/current-actor' }),
    );
    const run = responseRecord(
      await fixture.command({
        ...ready.target,
        path: `${ready.f.ready.path}/versions/${ready.f.contractVersionId}/quality-checks`,
        body: {},
      }),
    );
    const foreignCurrent = responseRecord(
      responseRecord(
        await fixture.read({ ...foreign.target, path: foreign.f.ready.path }),
      ).contract,
    );
    const foreignApproval = responseRecord(
      responseRecord(foreignCurrent.version).decision,
    );
    const page = responseRecord(
      await fixture.read({
        ...ready.target,
        path: ready.path + '/pdf-candidates',
      }),
    );
    if (!Array.isArray(page.items) || !page.items[0])
      throw new Error('Missing exact native reference.');
    const pdf = responseRecord(page.items[0]);
    const earlier = await fixture.pool.query<{ facts: unknown }>(
      `SELECT jsonb_build_object('representationId',id::text,'fileName',file_name,'mediaType',media_type,'size',size,'sha256',sha256,'scanOutcome',scan_outcome,'scanEngine',scan_engine,'scannedAt',to_char(scanned_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'storedByMembershipId',stored_by_membership_id::text,'storedAt',to_char(stored_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) facts FROM document_pdfs WHERE id=$1`,
      [ready.earlierRepresentationId],
    );
    const earlierPdf = { ...pdf, ...responseRecord(earlier.rows[0]?.facts) };
    const material = {
      workspaceId: responseString(actor, 'workspaceId'),
      companyId: ready.target.companyId,
      contractId: ready.f.contractId,
      versionId: ready.f.contractVersionId,
      approvalId: responseString(approval, 'id'),
      runId: responseString(run, 'id'),
      checksum: responseString(
        responseRecord(version.representation),
        'sha256',
      ),
      documentId: ready.body.documentId,
      documentVersionId: ready.body.documentVersionId,
      representationId: ready.body.representationId,
      membershipId: responseString(actor, 'workspaceMembershipId'),
      userId: responseString(actor, 'internalUserId'),
      recordedAt: responseString(run, 'evaluatedAt'),
      statement: ready.body,
      pdf,
    };
    type Material = typeof material;
    async function nativeControl(
      change: Partial<Material> = {},
      omit: 'none' | 'receipt' | 'event' | 'execution' | 'duplicate' = 'none',
    ) {
      const m = { ...material, ...change },
        connection = await fixture.pool.connect();
      try {
        await connection.query('BEGIN');
        const insert = () =>
          connection.query(
            `INSERT INTO contract_signing_declarations(workspace_id,company_id,contract_id,contract_version_id,approval_decision_id,quality_run_id,representation_checksum,document_id,document_version_id,representation_id,result_revision,actor_workspace_membership_id,actor_internal_user_id,recorded_at,statement,pdf) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,3,$11,$12,$13,$14::jsonb,$15::jsonb)`,
            [
              m.workspaceId,
              m.companyId,
              m.contractId,
              m.versionId,
              m.approvalId,
              m.runId,
              m.checksum,
              m.documentId,
              m.documentVersionId,
              m.representationId,
              m.membershipId,
              m.userId,
              m.recordedAt,
              JSON.stringify(m.statement),
              JSON.stringify(m.pdf),
            ],
          );
        await insert();
        if (omit === 'duplicate') await insert();
        if (omit !== 'execution')
          await connection.query(
            "UPDATE contract_versions SET execution_state='EXECUTED' WHERE id=$1",
            [ready.f.contractVersionId],
          );
        await connection.query('UPDATE contracts SET revision=3 WHERE id=$1', [
          ready.f.contractId,
        ]);
        await connection.query(
          'UPDATE client_accounts SET version=version+1 WHERE id=$1',
          [ready.f.ready.source.clientId],
        );
        if (omit !== 'receipt')
          await connection.query(
            `INSERT INTO contract_commands(workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_contract_id,kind,result_version_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,'DECLARE_SIGNING',$8,$9)`,
            [
              m.workspaceId,
              m.companyId,
              m.membershipId,
              randomUUID(),
              'a'.repeat(64),
              ready.f.ready.source.opportunityId,
              m.contractId,
              m.versionId,
              m.recordedAt,
            ],
          );
        if (omit !== 'event')
          await connection.query(
            `INSERT INTO contract_events(workspace_id,company_id,contract_id,contract_version_id,action,actor_internal_user_id,actor_workspace_membership_id,occurred_at,metadata) VALUES($1,$2,$3,$4,'contract_version.signing_declared',$5,$6,$7,$8::jsonb)`,
            [
              m.workspaceId,
              m.companyId,
              m.contractId,
              m.versionId,
              m.userId,
              m.membershipId,
              m.recordedAt,
              JSON.stringify({
                contractId: m.contractId,
                contractVersionId: m.versionId,
                versionNumber: 1,
                provenance: 'COMPANY_MODEL_OFFER',
                evidenceKind: 'DECLARED_RECEIVED_PDF',
              }),
            ],
          );
        await connection.query('SET CONSTRAINTS ALL IMMEDIATE');
      } finally {
        await connection.query('ROLLBACK');
        connection.release();
      }
    }
    await expect(nativeControl()).resolves.toBeUndefined();
    async function insertLegacySignature() {
      const connection = await fixture.pool.connect();
      try {
        await connection.query('BEGIN');
        await connection.query(
          `INSERT INTO contract_signatures(workspace_id,company_id,contract_id,contract_version_id,result_revision,actor_internal_user_id,actor_workspace_membership_id,recorded_at,provider_signatory_label,client_signatory_label,provider_signed_on,client_signed_on,quality_run_id,representation_checksum,acknowledged_warning_codes) SELECT workspace_id,company_id,contract_id,contract_version_id,3,actor_internal_user_id,actor_workspace_membership_id,evaluated_at,'Synthetic legacy provider','Synthetic legacy Client',(evaluated_at AT TIME ZONE 'UTC')::date,(evaluated_at AT TIME ZONE 'UTC')::date,id,$2,'[]'::jsonb FROM contract_quality_runs WHERE id=$1`,
          [material.runId, material.checksum],
        );
        await connection.query('SET CONSTRAINTS ALL IMMEDIATE');
      } finally {
        await connection.query('ROLLBACK');
        connection.release();
      }
    }
    await expect(insertLegacySignature()).rejects.toHaveProperty(
      'code',
      '23514',
    );

    for (const [label, change] of [
      [
        'foreign approval',
        { approvalId: responseString(foreignApproval, 'id') },
      ],
      ['foreign Contract Version', { versionId: foreign.f.contractVersionId }],
      ['foreign Document', { documentId: foreign.body.documentId }],
      [
        'foreign Document Version',
        { documentVersionId: foreign.body.documentVersionId },
      ],
      [
        'foreign PDF representation',
        { representationId: foreign.body.representationId },
      ],
      [
        'earlier draft PDF in the same designated Version',
        {
          representationId: ready.earlierRepresentationId,
          statement: {
            ...ready.body,
            representationId: ready.earlierRepresentationId,
          },
          pdf: earlierPdf,
        },
      ],
      ['approved checksum', { checksum: 'f'.repeat(64) }],
      [
        'blank Unicode basis',
        { statement: { ...ready.body, acceptanceBasis: '\u00A0\uFEFF' } },
      ],
      [
        'blank control label',
        {
          statement: {
            ...ready.body,
            providerSignatory: {
              ...ready.body.providerSignatory,
              label: '\t\n',
            },
          },
        },
      ],
      [
        'UTF-16 label overflow',
        {
          statement: {
            ...ready.body,
            providerSignatory: {
              ...ready.body.providerSignatory,
              label: '😀'.repeat(101),
            },
          },
        },
      ],
      ['forged PDF digest', { pdf: { ...pdf, sha256: 'f'.repeat(64) } }],
      [
        'wrong run',
        { runId: responseString(responseRecord(approval.qualityRun), 'id') },
      ],
      [
        'actor tuple',
        { membershipId: ready.f.ready.source.readerMembershipId },
      ],
      [
        'missing warning',
        { statement: { ...ready.body, acknowledgedWarningCodes: [] } },
      ],
      [
        'future date',
        {
          statement: {
            ...ready.body,
            providerSignatory: {
              ...ready.body.providerSignatory,
              signedOn: '2099-01-01',
            },
          },
        },
      ],
      [
        'unknown mandate',
        {
          statement: {
            ...ready.body,
            providerSignatory: {
              ...ready.body.providerSignatory,
              mandate: { kind: 'VERIFIED' },
            },
          },
        },
      ],
    ] satisfies [string, Partial<Material>][]) {
      await expect(nativeControl(change), label).rejects.toMatchObject({
        code: expect.stringMatching(/^(23503|23514)$/u),
      });
    }
    for (const omit of ['receipt', 'event', 'execution'] as const)
      await expect(nativeControl({}, omit), omit).rejects.toHaveProperty(
        'code',
        '23514',
      );
    await expect(nativeControl({}, 'duplicate')).rejects.toHaveProperty(
      'code',
      '23505',
    );
    expect(
      (
        await fixture.pool.query(
          'SELECT count(*)::int count FROM contract_signing_declarations',
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (
        await fixture.post({
          ...ready.target,
          path: ready.path,
          body: ready.body,
        })
      ).status,
    ).toBe(201);
    await expect(insertLegacySignature()).rejects.toHaveProperty(
      'code',
      '23514',
    );
  }, 30_000);
});
