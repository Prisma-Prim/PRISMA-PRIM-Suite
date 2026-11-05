import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPaymentEvidenceFixture,
  paymentJson,
  paymentNoticePdf,
  type PaymentEvidenceFixture,
} from './payment-evidence.test-support.js';
import {
  paymentEvidenceEffects,
  registerPaymentSource,
} from './payment-evidence-proof.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
type RegistrationForgery = {
  target: 'source' | 'document' | 'version' | 'event';
  patch: Record<string, unknown>;
};

withPostgres('Payment Evidence Source native integrity', () => {
  let fixture: PaymentEvidenceFixture;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await createPaymentEvidenceFixture(databaseUrl);
  });
  beforeEach(async () => {
    await fixture.reset();
  });
  afterAll(async () => {
    await fixture?.close();
  });

  /** Intentionally forged candidates only; every attempt fails and rolls back. */
  async function forgedRegistration(
    writer: PoolClient,
    originalId: string,
    forgery: RegistrationForgery,
  ) {
    expect(Object.keys(forgery.patch).length).toBeGreaterThan(0);
    const documentId = randomUUID();
    const patch = (target: RegistrationForgery['target']) =>
      JSON.stringify(forgery.target === target ? forgery.patch : {});
    await writer.query(
      `INSERT INTO working_documents
      SELECT (jsonb_populate_record(NULL::working_documents,to_jsonb(d) ||
      jsonb_build_object('id',$2::text,'idempotency_key',$3::text,'created_at',date_trunc('milliseconds',now())) || $4::jsonb)).*
      FROM working_documents d WHERE id=$1`,
      [originalId, documentId, randomUUID(), patch('document')],
    );
    await writer.query(
      `INSERT INTO document_versions
      SELECT (jsonb_populate_record(NULL::document_versions,to_jsonb(v) ||
      jsonb_build_object('id',$3::text,'document_id',d.id::text,'created_at',d.created_at) || $4::jsonb)).*
      FROM document_versions v JOIN working_documents d ON d.id=$2
      WHERE v.document_id=$1 AND v.number=1`,
      [originalId, documentId, randomUUID(), patch('version')],
    );
    await writer.query(
      `INSERT INTO document_registration_events
      SELECT (jsonb_populate_record(NULL::document_registration_events,to_jsonb(e) ||
      jsonb_build_object('id',$3::text,'document_id',d.id::text,'occurred_at',d.created_at) || $4::jsonb)).*
      FROM document_registration_events e JOIN working_documents d ON d.id=$2
      WHERE e.document_id=$1`,
      [originalId, documentId, randomUUID(), patch('event')],
    );
    // Include the forged next Client-use fence: its absence cannot explain rejection.
    // This is part of the rejected adversarial transaction, never a positive fixture or fence reset.
    await writer.query(
      'UPDATE client_accounts SET version=version+1,updated_at=now() WHERE id=(SELECT client_id FROM working_documents WHERE id=$1)',
      [documentId],
    );
    await writer.query(
      `INSERT INTO payment_evidence_document_sources
      SELECT (jsonb_populate_record(NULL::payment_evidence_document_sources,to_jsonb(s) ||
      jsonb_build_object('document_id',d.id::text,'registered_at',d.created_at,'original_client_version',c.version-1) || $3::jsonb)).*
      FROM payment_evidence_document_sources s JOIN working_documents d ON d.id=$2
      JOIN client_accounts c ON c.id=d.client_id WHERE s.document_id=$1`,
      [originalId, documentId, patch('source')],
    );
    await writer.query('SET CONSTRAINTS ALL IMMEDIATE');
  }
  async function refused(
    originalId: string,
    forgery: RegistrationForgery,
    constraint: string,
  ) {
    const before = await paymentEvidenceEffects(fixture.pool);
    const writer = await fixture.pool.connect();
    try {
      await writer.query('BEGIN');
      await expect(
        forgedRegistration(writer, originalId, forgery),
      ).rejects.toMatchObject({ code: '23514', constraint });
    } finally {
      await writer.query('ROLLBACK');
      writer.release();
    }
    expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
  }

  it.each(['PRIMARY', 'ADDITIONAL'] as const)(
    'rejects a fully coupled invented %s payer copy independently of HTTP',
    async (payer) => {
      const source = await registerPaymentSource(fixture, payer);
      await refused(
        source.documentId,
        {
          target: 'source',
          patch: { payer_legal_name: 'Invented fully coupled payer' },
        },
        'payment_evidence_source_binding',
      );
      expect(
        await paymentJson(
          await fixture.call('/documents/' + source.documentId),
        ),
      ).toEqual(source.document);
    },
  );
  it.each([
    'original Client',
    'Company label',
    'registrar membership',
    'tax null',
    'address',
    'fingerprint',
    'Version actor',
    'event actor',
  ] as const)('rejects the fully coupled %s forgery', async (kind) => {
    const source = await registerPaymentSource(fixture);
    const cases = {
      'original Client': {
        target: 'source',
        patch: {
          original_client_account_id: fixture.ready.unionTargetClientId,
        },
      },
      'Company label': {
        target: 'source',
        patch: { receiving_company_label: 'Invented receiving Company' },
      },
      'registrar membership': {
        target: 'source',
        patch: {
          registered_by_membership_id: fixture.ready.membershipIds.reader,
        },
      },
      'tax null': { target: 'source', patch: { payer_tax_id: null } },
      address: {
        target: 'source',
        patch: { payer_legal_address: 'Invented historical address' },
      },
      fingerprint: {
        target: 'document',
        patch: { request_fingerprint: '0'.repeat(64) },
      },
      'Version actor': {
        target: 'version',
        patch: { created_by_membership_id: fixture.ready.membershipIds.reader },
      },
      'event actor': {
        target: 'event',
        patch: { actor_membership_id: fixture.ready.membershipIds.reader },
      },
    } satisfies Record<typeof kind, RegistrationForgery>;
    await refused(
      source.documentId,
      cases[kind],
      kind === 'Version actor' || kind === 'event actor'
        ? 'payment_evidence_registration_coupling'
        : 'payment_evidence_source_binding',
    );
  });

  it.each([
    'questionnaire',
    'mission-deliverable',
    'received-contract',
    'external-invoice',
  ])(
    'rejects a fully coupled Source relation on the native %s family before deferred coupling',
    async (family) => {
      const source = await registerPaymentSource(fixture);
      await refused(
        source.documentId,
        { target: 'document', patch: { type: family } },
        'payment_evidence_source_binding',
      );
    },
  );

  it('retains original source/identity and independently rejects Project, reference and empty-official forgery', async () => {
    const source = await registerPaymentSource(fixture);
    const before = await paymentEvidenceEffects(fixture.pool);
    for (const sql of [
      'DELETE FROM payment_evidence_document_sources WHERE document_id=$1',
      "UPDATE payment_evidence_document_sources SET source_description='Invented replacement' WHERE document_id=$1",
      "UPDATE payment_evidence_document_sources SET received_on='2026-01-15' WHERE document_id=$1",
      "UPDATE payment_evidence_document_sources SET payer_legal_name='Invented payer' WHERE document_id=$1",
    ])
      await expect(
        fixture.pool.query(sql, [source.documentId]),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'payment_evidence_source_immutable',
      });
    for (const sql of [
      'UPDATE working_documents SET client_id=gen_random_uuid() WHERE id=$1',
      'UPDATE working_documents SET company_id=gen_random_uuid() WHERE id=$1',
      "UPDATE working_documents SET request_fingerprint='invented' WHERE id=$1",
      'DELETE FROM working_documents WHERE id=$1',
    ])
      await expect(
        fixture.pool.query(sql, [source.documentId]),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'payment_evidence_identity_immutable',
      });
    await expect(
      fixture.pool.query(
        "UPDATE working_documents SET type='questionnaire' WHERE id=$1",
        [source.documentId],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'document_family_immutable',
    });
    await expect(
      fixture.pool.query(
        'UPDATE working_documents SET project_id=gen_random_uuid(),project_revision=1 WHERE id=$1',
        [source.documentId],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'payment_evidence_metadata_project_check',
    });
    await expect(
      fixture.pool.query(
        "INSERT INTO document_representations(workspace_id,company_id,version_id,url,added_by_membership_id) SELECT workspace_id,company_id,id,'https://example.test/forged',created_by_membership_id FROM document_versions WHERE id=$1",
        [source.versionId],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'mission_document_external_reference_forbidden',
    });
    await expect(
      fixture.pool.query(
        "UPDATE document_versions SET status='official',designated_at=now(),designated_by_membership_id=created_by_membership_id,frozen_title='Invented official',frozen_purpose='Missing PDF' WHERE id=$1",
        [source.versionId],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'mission_document_version_pdf_required',
    });
    expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
  });

  it('rejects a fully coupled native correction after Recorder loss, preserving the public correction receipt', async () => {
    const source = await registerPaymentSource(fixture);
    const corrected = await fixture.call('/documents/' + source.documentId, {
      method: 'PATCH',
      body: { expectedRevision: 1, title: 'Native corrected title' },
    });
    expect(corrected.status).toBe(200);
    expect(
      (
        await fixture.revoke(
          '/company-payment-recorder-assignments',
          fixture.ready.membershipIds.owner,
        )
      ).status,
    ).toBe(200);
    const before = await paymentEvidenceEffects(fixture.pool);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          companyId: fixture.ready.companyId,
          documentId: source.documentId,
          expectedRevision: 2,
          title: 'Forged later correction',
        }),
      )
      .digest('hex');
    const writer = await fixture.pool.connect();
    try {
      await writer.query('BEGIN');
      await writer.query(
        "UPDATE working_documents SET working_revision=3,title='Forged later correction' WHERE id=$1",
        [source.documentId],
      );
      await writer.query(
        'UPDATE client_accounts SET version=version+1,updated_at=now() WHERE id=$1',
        [fixture.ready.clientId],
      );
      await expect(
        writer.query(
          `INSERT INTO document_correction_commands
        SELECT (jsonb_populate_record(NULL::document_correction_commands,to_jsonb(c) ||
        jsonb_build_object('id',$2::text,'idempotency_key',$3::text,'expected_revision',2,'revision',3,
        'before_title',c.after_title,'after_title','Forged later correction','request_fingerprint',$4::text,'occurred_at',now()))).*
        FROM document_correction_commands c WHERE document_id=$1 AND revision=2`,
          [source.documentId, randomUUID(), randomUUID(), fingerprint],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'payment_evidence_native_authority',
      });
    } finally {
      await writer.query('ROLLBACK');
      writer.release();
    }
    expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
    const history = await fixture.call(
      '/documents/' + source.documentId + '/correction-history',
    );
    expect(history.status).toBe(200);
    expect((await paymentJson(history)).corrections).toHaveLength(1);
  });

  it('rejects a fully coupled native successor draft after Recorder loss', async () => {
    const source = await registerPaymentSource(fixture);
    expect(
      (
        await fixture.upload({
          ...source,
          revision: 1,
          bytes: await paymentNoticePdf(),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await fixture.call(
          `/documents/${source.documentId}/versions/${source.versionId}/official-designation`,
          { method: 'POST', body: { expectedRevision: 2 } },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await fixture.revoke(
          '/company-payment-recorder-assignments',
          fixture.ready.membershipIds.owner,
        )
      ).status,
    ).toBe(200);
    const before = await paymentEvidenceEffects(fixture.pool);
    const writer = await fixture.pool.connect();
    const versionId = randomUUID();
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          companyId: fixture.ready.companyId,
          documentId: source.documentId,
          versionId: null,
          action: 'drafted',
          expectedRevision: 3,
        }),
      )
      .digest('hex');
    try {
      await writer.query('BEGIN');
      await writer.query(
        `INSERT INTO document_versions(workspace_id,company_id,document_id,id,number,status,created_by_membership_id,created_at)
        SELECT workspace_id,company_id,id,$2,2,'draft',created_by_membership_id,date_trunc('milliseconds',now()) FROM working_documents WHERE id=$1`,
        [source.documentId, versionId],
      );
      await writer.query(
        'UPDATE working_documents SET working_revision=4 WHERE id=$1',
        [source.documentId],
      );
      await writer.query(
        'UPDATE client_accounts SET version=version+1,updated_at=now() WHERE id=$1',
        [fixture.ready.clientId],
      );
      await expect(
        writer.query(
          `INSERT INTO document_version_commands
        SELECT (jsonb_populate_record(NULL::document_version_commands,to_jsonb(c) ||
        jsonb_build_object('id',$2::text,'idempotency_key',$3::text,'action','drafted',
        'version_id',$4::text,'version_number',2,'related_version_number',1,
        'representation_id',null,'representation_form',null,'appended_after_designation',null,
        'expected_revision',3,'revision',4,'request_fingerprint',$5::text,'occurred_at',date_trunc('milliseconds',now())))).*
        FROM document_version_commands c WHERE document_id=$1 AND action='designated_official'`,
          [
            source.documentId,
            randomUUID(),
            randomUUID(),
            versionId,
            fingerprint,
          ],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'payment_evidence_native_authority',
      });
    } finally {
      await writer.query('ROLLBACK');
      writer.release();
    }
    expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
    expect(
      (
        await paymentJson(
          await fixture.call(`/documents/${source.documentId}/versions`),
        )
      ).versions,
    ).toHaveLength(1);
  });

  it('designates preserved clean content without Content Reader/Uploader, while refusing another upload', async () => {
    const source = await registerPaymentSource(fixture);
    expect(
      (
        await fixture.upload({
          ...source,
          revision: 1,
          bytes: await paymentNoticePdf(),
        })
      ).status,
    ).toBe(201);
    for (const path of [
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
    ])
      expect(
        (await fixture.revoke(path, fixture.ready.membershipIds.owner)).status,
      ).toBe(200);
    const designation = await fixture.call(
      `/documents/${source.documentId}/versions/${source.versionId}/official-designation`,
      { method: 'POST', body: { expectedRevision: 2 } },
    );
    expect(designation.status, await designation.clone().text()).toBe(200);
    expect(await paymentJson(designation)).toMatchObject({
      action: 'designated_official',
      workingRevision: 3,
    });
    const before = await paymentEvidenceEffects(fixture.pool);
    expect(
      (
        await fixture.upload({
          ...source,
          revision: 3,
          bytes: await paymentNoticePdf('Denied'),
        })
      ).status,
    ).toBe(403);
    expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
  });
});
