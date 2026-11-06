import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import { prepareReceivedAddendumParent } from './received-addendum.test-support.js';
import { ReceivedAddendumRelationsService } from './received-addendum-relations.service.js';
const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Received Addendum integrity and atomic response boundary', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
    scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>,
    parent: Awaited<ReturnType<typeof prepareReceivedAddendumParent>>;
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
    });
  });
  beforeEach(async () => {
    await fixture.reset();
    scanner.reset();
    parent = await prepareReceivedAddendumParent(fixture);
  });
  afterAll(async () => {
    await fixture?.close();
    await scanner?.close();
  });
  const tables = [
    'working_documents',
    'received_addendum_document_relations',
    'document_versions',
    'document_pdfs',
    'document_version_commands',
    'document_correction_commands',
    'document_registration_events',
    'activity_log_events',
    'client_accounts',
    'contracts',
    'contract_versions',
    'contract_commands',
    'contract_events',
    'contract_signing_declarations',
  ];
  async function facts() {
    const value: Record<string, unknown> = {};
    for (const table of tables)
      value[table] = (
        await fixture.pool.query<{ facts: unknown }>(
          `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) facts FROM ${table} t`,
        )
      ).rows[0]?.facts;
    return value;
  }
  it('rolls back final registration event refusal and then succeeds with exactly the original key', async () => {
    const before = await facts(),
      key = randomUUID();
    await fixture.pool.query(
      "CREATE FUNCTION reject_addendum_registration_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic final event refusal'; END $$; CREATE TRIGGER reject_addendum_registration_event BEFORE INSERT ON document_registration_events FOR EACH ROW EXECUTE FUNCTION reject_addendum_registration_event()",
    );
    try {
      expect((await parent.register(key)).status).toBe(500);
      expect(await facts()).toEqual(before);
    } finally {
      await fixture.pool.query(
        'DROP TRIGGER reject_addendum_registration_event ON document_registration_events; DROP FUNCTION reject_addendum_registration_event()',
      );
    }
    const retry = await parent.register(key);
    expect(retry.status).toBe(201);
    const saved = await retry.json();
    expect(await (await parent.register(key)).json()).toEqual(saved);
  });
  it('rolls back final relation response construction rather than conserving an unseen partial registration', async () => {
    const before = await facts(),
      key = randomUUID();
    const failure = vi
      .spyOn(ReceivedAddendumRelationsService.prototype, 'read')
      .mockRejectedValueOnce(
        new Error('Synthetic final response construction refusal'),
      );
    try {
      expect((await parent.register(key)).status).toBe(500);
      expect(await facts()).toEqual(before);
    } finally {
      failure.mockRestore();
    }
    expect((await parent.register(key)).status).toBe(201);
  });
  it('rejects mutation of complete registered identity, source, party, relation, receipt and native registration event', async () => {
    const registered = await parent.register();
    expect(registered.status).toBe(201);
    const document = responseRecord(await registered.json()),
      id = responseString(document, 'id'),
      before = await facts();
    for (const query of [
      "UPDATE received_addendum_document_relations SET source_description='forged source' WHERE document_id=$1",
      "UPDATE received_addendum_document_relations SET received_on=DATE '2026-11-06' WHERE document_id=$1",
      'UPDATE received_addendum_document_relations SET contract_version_number=999 WHERE document_id=$1',
      "UPDATE received_addendum_document_relations SET recipient_legal_name='forged party' WHERE document_id=$1",
      "UPDATE working_documents SET idempotency_key='forged receipt' WHERE id=$1",
      "UPDATE working_documents SET request_fingerprint=repeat('0',64) WHERE id=$1",
      'UPDATE working_documents SET project_id=gen_random_uuid(),project_revision=1 WHERE id=$1',
      'DELETE FROM received_addendum_document_relations WHERE document_id=$1',
      'DELETE FROM working_documents WHERE id=$1',
      "UPDATE document_registration_events SET occurred_at=occurred_at+interval '1 second' WHERE document_id=$1",
    ]) {
      await expect(fixture.pool.query(query, [id])).rejects.toMatchObject({
        code: query.startsWith('UPDATE document_registration_events')
          ? 'P0001'
          : '23514',
      });
      expect(await facts()).toEqual(before);
    }
  });
  it.each(['fingerprint', 'party', 'event'] as const)(
    'rejects a fully coupled SQL-forged %s registration independently of HTTP',
    async (variant) => {
      const registered = await parent.register();
      expect(registered.status).toBe(201);
      const id = responseString(responseRecord(await registered.json()), 'id'),
        before = await facts(),
        tx = await fixture.pool.connect();
      try {
        await tx.query('BEGIN');
        const root = await tx.query<{ id: string }>(
          `INSERT INTO working_documents(workspace_id,company_id,client_id,type,title,purpose,created_by_membership_id,idempotency_key,request_fingerprint) SELECT workspace_id,company_id,client_id,type,title,purpose,created_by_membership_id,gen_random_uuid()::text,CASE WHEN $2='fingerprint' THEN repeat('0',64) ELSE request_fingerprint END FROM working_documents WHERE id=$1 RETURNING id`,
          [id, variant],
        );
        const forged = root.rows[0]?.id;
        if (!forged) throw new Error('Synthetic negative root required');
        await tx.query(
          'INSERT INTO document_versions(workspace_id,company_id,document_id,number,created_by_membership_id,created_at) SELECT workspace_id,company_id,id,1,created_by_membership_id,created_at FROM working_documents WHERE id=$1',
          [forged],
        );
        const columns = [
          'document_id',
          'workspace_id',
          'company_id',
          'opportunity_id',
          'contract_id',
          'contract_version_id',
          'contract_version_number',
          'illustrative_reference',
          'recipient_kind',
          'recipient_additional_legal_entity_id',
          'recipient_legal_name',
          'recipient_tax_id',
          'recipient_legal_address',
          'source_description',
          'initial_title',
          'initial_purpose',
          'received_on',
          'registered_by_membership_id',
          'registered_by_internal_user_id',
          'registered_at',
        ];
        const projection = columns.map((c) =>
          c === 'document_id'
            ? 'd.id'
            : c === 'registered_at'
              ? 'd.created_at'
              : c === 'recipient_legal_name' && variant === 'party'
                ? "'forged party'"
                : `r.${c}`,
        );
        const coupled = async () => {
          await tx.query(
            `INSERT INTO received_addendum_document_relations(${columns.join(',')}) SELECT ${projection.join(',')} FROM received_addendum_document_relations r JOIN working_documents d ON d.id=$2 WHERE r.document_id=$1`,
            [id, forged],
          );
          await tx.query(
            "INSERT INTO document_registration_events(workspace_id,company_id,document_id,actor_membership_id,occurred_at) SELECT workspace_id,company_id,id,created_by_membership_id,created_at+interval '1 second' FROM working_documents WHERE id=$1",
            [forged],
          );
          await tx.query('COMMIT');
        };
        await expect(coupled()).rejects.toMatchObject({ code: '23514' });
      } finally {
        await tx.query('ROLLBACK');
        tx.release();
      }
      expect(await facts()).toEqual(before);
    },
  );
});
