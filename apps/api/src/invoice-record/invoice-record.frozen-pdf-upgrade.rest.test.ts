import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  fictionalInvoicePdf,
  openExternalInvoiceDocument,
} from '../documents/external-invoice.test-support.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  fictionalInvoiceValues,
  invoiceRecordEffects,
  prepareAdditionalInvoiceRecordSource,
} from './invoice-record.proof-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Invoice frozen-PDF native policy upgrade', () => {
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

  it('retains an older recorded upload through the native policy upgrade, correction, replay and exact download while refusing a new native use', async () => {
    const document = await openExternalInvoiceDocument(fixture);
    const versionId = responseString(
      responseRecord(document.document.version),
      'id',
    );
    const bytes = await fictionalInvoicePdf();
    const upload = await document.upload(versionId, 1, bytes);
    expect(upload.status).toBe(201);
    const representationId = responseString(
      responseRecord(await upload.json()),
      'representationId',
    );
    const replacementBytes = await fictionalInvoicePdf('SYN-INV-REPLACEMENT');
    expect(replacementBytes).not.toEqual(bytes);
    expect((await document.upload(versionId, 2, replacementBytes)).status).toBe(
      201,
    );
    expect(
      (
        await document.mutate(`/versions/${versionId}/official-designation`, {
          expectedRevision: 3,
        })
      ).status,
    ).toBe(200);
    const source = {
      documentId: document.documentId,
      documentVersionId: versionId,
      representationId,
    };
    const body = {
      source,
      values: fictionalInvoiceValues(),
      acknowledgeExternalDeclaration: true,
      replacesWithdrawnRecordId: null,
    };
    const templateSource = await prepareAdditionalInvoiceRecordSource(fixture, {
      target: document.target,
      body: document.body,
      title: 'Native authority template — fictional invoice',
    });
    const createdTemplate = await templateSource.create();
    expect(createdTemplate.status).toBe(201);
    const templateCommandId = responseString(
      responseRecord(await createdTemplate.json()),
      'commandId',
    );
    const key = randomUUID();
    const writer = await fixture.pool.connect();
    let receipt: Record<string, unknown>;
    try {
      const before = await invoiceRecordEffects(fixture);
      await writer.query('BEGIN');
      await expect(
        nativeCreate(writer, { templateCommandId, body, key }),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'invoice_native_source',
      });
      await writer.query('ROLLBACK');
      expect(await invoiceRecordEffects(fixture)).toEqual(before);

      await writer.query('BEGIN');
      // Restore the actual previous native policies, then produce a fully
      // coupled Record under them. No guard is disabled and no source row is rewritten.
      for (const { file, name } of [
        {
          file: '0095_invoice_records.sql',
          name: 'documents_invoice_record_source',
        },
        { file: '0095_invoice_records.sql', name: 'invoice_prepare_command' },
        {
          file: '0097_manual_payment_observations.sql',
          name: 'documents_payment_source',
        },
        {
          file: '0084_reported_contract_signing.sql',
          name: 'validate_reported_contract_signing',
        },
        {
          file: '0099_working_evidence_cases.sql',
          name: 'guard_working_evidence_support',
        },
        {
          file: '0076_task_results.sql',
          name: 'task_result_declaration_guard',
        },
      ]) {
        const sql = await readFile(`drizzle/${file}`, 'utf8');
        const definition = sql
          .split('--> statement-breakpoint')
          .find((part) => part.includes(`CREATE FUNCTION ${name}(`));
        if (!definition)
          throw new Error('Expected the committed previous native policy.');
        await writer.query(
          definition.replace(
            `CREATE FUNCTION ${name}(`,
            `CREATE OR REPLACE FUNCTION ${name}(`,
          ),
        );
      }
      await writer.query(
        'DROP FUNCTION documents_frozen_pdf(document_versions,document_pdfs,integer,boolean)',
      );
      await writer.query(
        'DROP FUNCTION documents_invoice_record_source(uuid,uuid,jsonb,boolean)',
      );
      receipt = await nativeCreate(writer, { templateCommandId, body, key });
      const preserved = await nativeFacts(writer);
      const migration = await readFile(
        'drizzle/0109_document_frozen_pdf.sql',
        'utf8',
      );
      for (const statement of migration.split('--> statement-breakpoint'))
        if (statement.trim()) await writer.query(statement);
      expect(await nativeFacts(writer)).toEqual(preserved);
      await writer.query('COMMIT');
    } finally {
      await writer.query('ROLLBACK');
      writer.release();
    }
    const recordId = responseString(receipt, 'recordId');
    const detail = responseRecord(
      await fixture.read({
        ...document.target,
        path: `/invoice-records/${recordId}`,
      }),
    );
    expect(detail.capabilities).toMatchObject({ canCorrect: true });
    expect(detail.liveSource).toMatchObject({
      kind: 'AVAILABLE',
      content: {
        kind: 'AVAILABLE',
        representationId,
        byteLength: bytes.length,
      },
    });
    const download = await fixture.request({
      ...document.target,
      path: `/invoice-records/${recordId}/source`,
    });
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
    const corrected = await fixture.post({
      ...document.target,
      path: `/invoice-records/${recordId}/commands`,
      body: {
        action: 'CORRECT',
        expectedRevision: 1,
        values: { ...body.values, externalNumber: 'SYN-INV-CORRECTED' },
        reason: 'Correct transcription while retaining the original source.',
      },
    });
    expect(corrected.status).toBe(201);
    const after = responseRecord(
      await fixture.read({
        ...document.target,
        path: `/invoice-records/${recordId}`,
      }),
    );
    expect(after.record).toMatchObject({
      revision: 2,
      values: { externalNumber: 'SYN-INV-CORRECTED' },
    });
    expect(after.liveSource).toEqual(detail.liveSource);
    const conserved = await invoiceRecordEffects(fixture);
    const replay = await fixture.post({
      ...document.target,
      path: '/invoice-records',
      body,
      key,
    });
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(receipt);
    expect(await invoiceRecordEffects(fixture)).toEqual(conserved);
  });
});

async function nativeCreate(
  writer: PoolClient,
  input: { templateCommandId: string; body: unknown; key: string },
) {
  const commandId = randomUUID(),
    recordId = randomUUID();
  const intentBody = { ...responseRecord(input.body), action: 'CREATE' };
  await writer.query(
    `INSERT INTO invoice_record_commands
    (workspace_id,company_id,id,record_id,actor_membership_id,actor_internal_user_id,actor_display_name,assignment_id,source_captures,idempotency_key,intent)
    SELECT c.workspace_id,c.company_id,$2::uuid,$3::uuid,c.actor_membership_id,c.actor_internal_user_id,c.actor_display_name,c.assignment_id,c.source_captures,$4::text,
      jsonb_build_object('format','EXTERNAL_INVOICE_INTENT/1','workspaceId',c.workspace_id::text,'companyId',c.company_id::text,'actorMembershipId',c.actor_membership_id::text,'recordId',($3::uuid)::text,'body',$5::jsonb)
    FROM invoice_record_commands c WHERE c.id=$1::uuid`,
    [
      input.templateCommandId,
      commandId,
      recordId,
      input.key,
      JSON.stringify(intentBody),
    ],
  );
  await writer.query(
    `INSERT INTO invoice_record_events
    (workspace_id,company_id,record_id,revision,command_id,actor_membership_id,actor_internal_user_id,occurred_at,action,metadata)
    SELECT workspace_id,company_id,record_id,revision,id,actor_membership_id,actor_internal_user_id,created_at,'invoice_record.created',jsonb_build_object('revision',revision)
    FROM invoice_record_commands WHERE id=$1::uuid`,
    [commandId],
  );
  await writer.query('SET CONSTRAINTS ALL IMMEDIATE');
  const result = await writer.query<{ response: unknown }>(
    'SELECT response FROM invoice_record_commands WHERE id=$1::uuid',
    [commandId],
  );
  return responseRecord(result.rows[0]?.response);
}

async function nativeFacts(writer: PoolClient) {
  const facts: Record<string, unknown> = {};
  for (const table of [
    'invoice_records',
    'invoice_record_commands',
    'invoice_record_history',
    'invoice_record_events',
    'invoice_record_cursor_keys',
    'document_pdfs',
    'client_accounts',
    'activity_log_events',
  ]) {
    const result = await writer.query<{ facts: unknown }>(
      `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) facts FROM ${table} t`,
    );
    facts[table] = result.rows[0]?.facts;
  }
  return facts;
}
