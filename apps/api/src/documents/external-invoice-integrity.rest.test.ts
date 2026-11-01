import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { draftInput } from '../knowledge/knowledge.validation.js';
import { prepareReportedSigning } from '../contract/reported-contract-signing.test-support.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import { PDF_A } from './mission-document.test-support.js';
import {
  externalInvoiceEffects,
  fictionalInvoicePdf,
  openExternalInvoiceDocument,
} from './external-invoice.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

withPostgres(
  'External invoice native relation and downstream integrity',
  () => {
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

    async function effects() {
      const result = await externalInvoiceEffects(fixture);
      for (const table of [
        'knowledge_sources',
        'knowledge_passages',
        'knowledge_source_events',
        'knowledge_source_commands',
        'knowledge_interactions',
      ]) {
        const rows = await fixture.pool.query<{ facts: unknown }>(
          `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS facts FROM ${table} t`,
        );
        result[table] = rows.rows[0]?.facts;
      }
      return result;
    }

    /** A complete native registration candidate; only the named adversarial facts differ. */
    async function candidate(
      writer: PoolClient,
      sourceDocumentId: string,
      input: {
        relationPatch?: Record<string, unknown>;
        documentPatch?: Record<string, unknown>;
        omit?: 'relation' | 'version' | 'event';
      },
    ) {
      const documentId = randomUUID();
      const versionId = randomUUID();
      await writer.query(
        `INSERT INTO working_documents
       SELECT (jsonb_populate_record(NULL::working_documents,
         to_jsonb(d) || jsonb_build_object('id',$2::text,'idempotency_key',$3::text,'created_at',date_trunc('milliseconds',now())) || $4::jsonb)).*
       FROM working_documents d WHERE id=$1`,
        [
          sourceDocumentId,
          documentId,
          randomUUID(),
          JSON.stringify(input.documentPatch ?? {}),
        ],
      );
      if (input.omit !== 'version')
        await writer.query(
          `INSERT INTO document_versions(workspace_id,company_id,document_id,id,number,status,created_by_membership_id,created_at)
         SELECT workspace_id,company_id,id,$2,1,'draft',created_by_membership_id,created_at FROM working_documents WHERE id=$1`,
          [documentId, versionId],
        );
      if (input.omit !== 'event')
        await writer.query(
          `INSERT INTO document_registration_events(workspace_id,company_id,document_id,actor_membership_id,occurred_at)
         SELECT workspace_id,company_id,id,created_by_membership_id,created_at FROM working_documents WHERE id=$1`,
          [documentId],
        );
      // Include the original Client fence even for the fully coupled invented
      // candidate, so a missing native side effect cannot explain its refusal.
      await writer.query(
        'UPDATE client_accounts SET version=version+1,updated_at=now() WHERE id=(SELECT client_id FROM working_documents WHERE id=$1)',
        [documentId],
      );
      if (input.omit !== 'relation')
        await writer.query(
          `INSERT INTO external_invoice_document_relations
         SELECT (jsonb_populate_record(NULL::external_invoice_document_relations,
           to_jsonb(r) || jsonb_build_object('document_id',d.id::text,'registered_at',d.created_at) || $3::jsonb)).*
         FROM external_invoice_document_relations r JOIN working_documents d ON d.id=$2 WHERE r.document_id=$1`,
          [
            sourceDocumentId,
            documentId,
            JSON.stringify(input.relationPatch ?? {}),
          ],
        );
      await writer.query('SET CONSTRAINTS ALL IMMEDIATE');
      return { documentId, versionId };
    }

    async function refusedCandidate(
      documentId: string,
      input: Parameters<typeof candidate>[2],
      expected: { code: string; constraint?: string },
    ) {
      const before = await effects();
      const writer = await fixture.pool.connect();
      try {
        await writer.query('BEGIN');
        await expect(
          candidate(writer, documentId, input),
        ).rejects.toMatchObject(expected);
      } finally {
        await writer.query('ROLLBACK');
        writer.release();
      }
      expect(await effects()).toEqual(before);
    }

    it('rejects omitted relation, Version and event effects while accepting the fully coupled lawful native shape', async () => {
      const f = await openExternalInvoiceDocument(fixture);
      const before = await effects();
      const writer = await fixture.pool.connect();
      try {
        await writer.query('BEGIN');
        await expect(
          candidate(writer, f.documentId, {}),
        ).resolves.toMatchObject({
          documentId: expect.any(String),
          versionId: expect.any(String),
        });
      } finally {
        await writer.query('ROLLBACK');
        writer.release();
      }
      expect(await effects()).toEqual(before);
      await refusedCandidate(
        f.documentId,
        { omit: 'relation' },
        { code: '23514', constraint: 'external_invoice_relation_required' },
      );
      await refusedCandidate(
        f.documentId,
        { omit: 'version' },
        { code: '23514', constraint: 'external_invoice_registration_coupling' },
      );
      await refusedCandidate(
        f.documentId,
        { omit: 'event' },
        { code: '23514', constraint: 'external_invoice_registration_coupling' },
      );
    });

    it('rejects fully coupled invented parties, foreign source tuples and malformed/null/unknown stored relation facts', async () => {
      const f = await openExternalInvoiceDocument(fixture);
      const foreign = await prepareReportedSigning(fixture, {
        clientTaxId: 'FICTIONAL-FOREIGN-INVOICE-1020',
      });
      await fixture.command({
        ...foreign.target,
        path: foreign.path,
        body: foreign.body,
      });
      const otherSelection = {
        opportunityId: foreign.f.ready.source.opportunityId,
        contractId: foreign.f.contractId,
        contractVersionId: foreign.f.contractVersionId,
      };
      const binding = {
        code: '23514',
        constraint: 'external_invoice_relation_binding',
      };
      for (const patch of [
        { recipient_kind: 'UNKNOWN' },
        { recipient_kind: null },
        {
          recipient_kind: 'ADDITIONAL',
          recipient_additional_legal_entity_id: randomUUID(),
        },
        { recipient_additional_legal_entity_id: randomUUID() },
        {
          recipient_legal_name:
            'Invented fully coupled financial receiving party',
        },
        { recipient_legal_name: null },
        { recipient_tax_id: null },
        { recipient_legal_address: 'Invented source address' },
        { opportunity_id: randomUUID() },
        { contract_version_number: 999 },
        { contract_version_number: null },
        { illustrative_reference: 999 },
        { registered_by_membership_id: f.f.ready.source.readerMembershipId },
        { registered_by_internal_user_id: randomUUID() },
        { registered_at: '2000-01-01T00:00:00.000Z' },
        { registered_at: null },
        { received_on: '10000-01-01' },
        {
          opportunity_id: otherSelection.opportunityId,
          contract_id: otherSelection.contractId,
          contract_version_id: otherSelection.contractVersionId,
        },
      ])
        await refusedCandidate(f.documentId, { relationPatch: patch }, binding);
      await refusedCandidate(
        f.documentId,
        { relationPatch: { source_description: null } },
        { code: '23502' },
      );
      await refusedCandidate(
        f.documentId,
        { relationPatch: { source_description: ' ' } },
        { code: '23514', constraint: 'external_invoice_relation_values_check' },
      );
      await refusedCandidate(
        f.documentId,
        { relationPatch: { source_description: 'x'.repeat(2001) } },
        { code: '23514', constraint: 'external_invoice_relation_values_check' },
      );
      for (const source_description of [
        '\u00a0',
        '\u00a0Untrimmed source',
        '😀'.repeat(1001),
      ])
        await refusedCandidate(
          f.documentId,
          { relationPatch: { source_description } },
          {
            code: '23514',
            constraint: 'external_invoice_relation_values_check',
          },
        );
      await refusedCandidate(
        f.documentId,
        { documentPatch: { client_id: foreign.f.ready.source.clientId } },
        binding,
      );
    });

    it('retains immutable family/owner/source context and refuses Project, reference and empty-official native writes', async () => {
      const f = await openExternalInvoiceDocument(fixture);
      const versionId = responseString(
        responseRecord(f.document.version),
        'id',
      );
      const before = await effects();
      for (const statement of [
        'DELETE FROM external_invoice_document_relations WHERE document_id=$1',
        "UPDATE external_invoice_document_relations SET source_description='Invented replacement source' WHERE document_id=$1",
        'UPDATE external_invoice_document_relations SET received_on=NULL WHERE document_id=$1',
        "UPDATE external_invoice_document_relations SET recipient_kind='UNKNOWN' WHERE document_id=$1",
      ])
        await expect(
          fixture.pool.query(statement, [f.documentId]),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'external_invoice_relation_immutable',
        });
      for (const statement of [
        "UPDATE working_documents SET type='received-contract' WHERE id=$1",
        'UPDATE working_documents SET client_id=gen_random_uuid() WHERE id=$1',
        'UPDATE working_documents SET company_id=gen_random_uuid() WHERE id=$1',
        "UPDATE working_documents SET request_fingerprint='invented' WHERE id=$1",
        'DELETE FROM working_documents WHERE id=$1',
      ])
        await expect(
          fixture.pool.query(statement, [f.documentId]),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'external_invoice_identity_immutable',
        });
      await expect(
        fixture.pool.query(
          'UPDATE working_documents SET project_id=gen_random_uuid(),project_revision=1 WHERE id=$1',
          [f.documentId],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'external_invoice_project_forbidden',
      });
      await expect(
        fixture.pool.query(
          "INSERT INTO document_representations(workspace_id,company_id,version_id,url,added_by_membership_id) SELECT workspace_id,company_id,id,'https://example.test/ineligible',created_by_membership_id FROM document_versions WHERE id=$1",
          [versionId],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'mission_document_external_reference_forbidden',
      });
      await expect(
        fixture.pool.query(
          "UPDATE document_versions SET status='official',designated_at=now(),designated_by_membership_id=created_by_membership_id,frozen_title='Fictional official without PDF',frozen_purpose='No stored content' WHERE id=$1",
          [versionId],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'mission_document_version_pdf_required',
      });
      expect(await effects()).toEqual(before);
      expect(await (await f.call('')).json()).toEqual(f.document);
    });

    it('rejects a fully coupled financial Knowledge source intent at its explicit native family guard with a lawful received-source positive control', async () => {
      const f = await openExternalInvoiceDocument(fixture);
      const versionId = responseString(
        responseRecord(f.document.version),
        'id',
      );
      const pdf = await fictionalInvoicePdf();
      const uploaded = await f.upload(versionId, 1, pdf);
      expect(uploaded.status).toBe(201);
      const upload = responseRecord(await uploaded.json());
      expect(
        (
          await f.mutate(`/versions/${versionId}/official-designation`, {
            expectedRevision: 2,
          })
        ).status,
      ).toBe(200);
      for (const path of [
        '/knowledge/assignments/administrators',
        '/knowledge/assignments/readers',
      ])
        await fixture.grant({
          path,
          companyId: f.companyId,
          membershipId: f.membershipId,
        });
      const lawfulBody = {
        documentId: responseString(f.f.document, 'id'),
        documentVersionId: f.documentVersionId,
        representationId: f.earlierRepresentationId,
        sourceSha256: createHash('sha256').update(PDF_A).digest('hex'),
        language: 'en',
        ownerReference: 'Fictional source owner',
        provenance:
          'Fictional received Contract preserved through native commands',
        rightsEvidenceReference: 'Synthetic authored source declaration only',
        permittedPurpose: 'cited-evidence',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveUntil: '2027-01-01T00:00:00.000Z',
        passages: [
          {
            locator: 'p1',
            text: 'Fictional received Contract source; unverified',
          },
        ],
      };
      const lawful = responseRecord(
        await fixture.command({
          ...f.target,
          path: '/knowledge/sources',
          body: lawfulBody,
        }),
      );
      const sourceId = responseString(lawful, 'sourceId');
      const before = await effects();
      const coupled = async (writer: PoolClient, financial: boolean) => {
        const candidateId = randomUUID();
        const financialSha = createHash('sha256').update(pdf).digest('hex');
        const projectionSha = createHash('sha256')
          .update(
            JSON.stringify({
              documentVersionId: versionId,
              representationId: responseString(upload, 'representationId'),
              sourceSha256: financialSha,
              passages: [
                {
                  locator: 'p1',
                  text: 'Fictional received Contract source; unverified',
                },
              ],
            }),
          )
          .digest('hex');
        const patch = financial
          ? {
              document_id: f.documentId,
              document_version_id: versionId,
              representation_id: responseString(upload, 'representationId'),
              source_sha256: financialSha,
              projection_sha256: projectionSha,
            }
          : {};
        const intent = financial
          ? {
              ...lawfulBody,
              documentId: f.documentId,
              documentVersionId: versionId,
              representationId: responseString(upload, 'representationId'),
              sourceSha256: financialSha,
            }
          : lawfulBody;
        const fingerprint = createHash('sha256')
          .update(
            JSON.stringify({
              companyId: f.companyId,
              kind: 'create',
              input: draftInput(intent),
            }),
          )
          .digest('hex');
        await writer.query(
          `WITH source AS (
          INSERT INTO knowledge_sources SELECT (jsonb_populate_record(NULL::knowledge_sources,to_jsonb(s)||jsonb_build_object('id',$2::text)||$3::jsonb)).*
          FROM knowledge_sources s WHERE id=$1 RETURNING *
        ), passages AS (
          INSERT INTO knowledge_passages SELECT p.workspace_id,p.company_id,s.id,p.position,p.locator,p.text,p.sha256 FROM knowledge_passages p CROSS JOIN source s WHERE p.source_id=$1 RETURNING source_id
        ), event AS (
          INSERT INTO knowledge_source_events SELECT gen_random_uuid(),e.workspace_id,e.company_id,s.id,e.revision,e.action,e.actor_membership_id,e.actor_internal_user_id,e.actor_display_name,$5,e.recorded_at
          FROM knowledge_source_events e CROSS JOIN source s CROSS JOIN (SELECT count(*) FROM passages) p WHERE e.source_id=$1 RETURNING source_id
        ), command AS (
          INSERT INTO knowledge_source_commands SELECT gen_random_uuid(),c.workspace_id,c.company_id,c.actor_membership_id,$4,$5,s.id,
            c.result||jsonb_build_object('sourceId',s.id::text,'sourceSha256',s.source_sha256,'projectionSha256',s.projection_sha256)
          FROM knowledge_source_commands c CROSS JOIN source s CROSS JOIN (SELECT count(*) FROM event) e WHERE c.source_id=$1 RETURNING source_id
        ) SELECT source_id FROM command`,
          [
            sourceId,
            candidateId,
            JSON.stringify(patch),
            randomUUID(),
            fingerprint,
          ],
        );
        await writer.query('SET CONSTRAINTS ALL IMMEDIATE');
      };
      for (const financial of [false, true]) {
        const writer = await fixture.pool.connect();
        try {
          await writer.query('BEGIN');
          if (financial)
            await expect(coupled(writer, true)).rejects.toMatchObject({
              code: '23514',
              constraint: 'financial_document_use_forbidden',
            });
          else await coupled(writer, false);
        } finally {
          await writer.query('ROLLBACK');
          writer.release();
        }
        expect(await effects()).toEqual(before);
      }
    });
  },
);
