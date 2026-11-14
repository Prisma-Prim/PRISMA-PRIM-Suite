import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  invoiceRecordEffects,
  prepareAdditionalInvoiceRecordSource,
  prepareInvoiceRecordSource,
} from './invoice-record.proof-support.js';
import { InvoiceRecordStore } from './invoice-record.store.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

withPostgres('Invoice Record native atomicity and storage integrity', () => {
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

  it('rolls back the complete CREATE when its final restricted event fails, then retries the exact unreserved key', async () => {
    const source = await prepareInvoiceRecordSource(fixture);
    const key = randomUUID();
    const inventoryBefore = await source.read('/invoice-records');
    expect(inventoryBefore.items).toEqual([]);
    const before = await invoiceRecordEffects(fixture);
    try {
      // A sequence is deliberately nontransactional test instrumentation. Its
      // first call proves the trigger saw an already coupled head/fact/receipt;
      // a coincidental earlier HTTP 500 cannot qualify as this rollback proof.
      await fixture.pool.query(
        'CREATE SEQUENCE invoice_record_proof_final_event_visits',
      );
      await fixture.pool.query(`
        CREATE FUNCTION invoice_record_proof_fail_final_event() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM invoice_records r
            JOIN invoice_record_history h ON
              (h.workspace_id,h.company_id,h.record_id,h.revision)=
              (r.workspace_id,r.company_id,r.id,r.revision)
            JOIN invoice_record_commands c ON c.id=h.command_id
            WHERE (r.workspace_id,r.company_id,r.id,r.revision)=
              (NEW.workspace_id,NEW.company_id,NEW.record_id,NEW.revision)
              AND h.command_id=NEW.command_id AND r.entry_state='RECORDED'
              AND c.response->>'recordId'=r.id::text
              AND h.fact->'after'->'values'=r.values
          ) THEN
            PERFORM nextval('invoice_record_proof_final_event_visits');
          END IF;
          RAISE EXCEPTION 'Synthetic final Invoice Record event failure';
        END $$`);
      await fixture.pool.query(`
        CREATE TRIGGER invoice_record_proof_fail_final_event
        BEFORE INSERT ON invoice_record_events FOR EACH ROW
        EXECUTE FUNCTION invoice_record_proof_fail_final_event()`);
      const failed = await source.create(source.createBody, key);
      expect(failed.status).toBe(503);
      expect(
        (
          await fixture.pool.query<{
            last_value: string;
            is_called: boolean;
          }>(
            'SELECT last_value::text,is_called FROM invoice_record_proof_final_event_visits',
          )
        ).rows,
      ).toEqual([{ last_value: '1', is_called: true }]);
      expect(await invoiceRecordEffects(fixture)).toEqual(before);
      expect(await source.read('/invoice-records')).toEqual(inventoryBefore);
      expect(await invoiceRecordEffects(fixture)).toEqual(before);
    } finally {
      await fixture.pool.query(
        'DROP TRIGGER IF EXISTS invoice_record_proof_fail_final_event ON invoice_record_events',
      );
      await fixture.pool.query(
        'DROP FUNCTION IF EXISTS invoice_record_proof_fail_final_event()',
      );
      await fixture.pool.query(
        'DROP SEQUENCE IF EXISTS invoice_record_proof_final_event_visits',
      );
    }
    const retry = await source.create(source.createBody, key);
    expect(retry.status).toBe(201);
    const receipt = responseRecord(await retry.json());
    const recordId = responseString(receipt, 'recordId');
    const current = await source.read(`/invoice-records/${recordId}`);
    expect(responseRecord(current.record)).toMatchObject({
      id: recordId,
      revision: 1,
      entryState: 'RECORDED',
      values: source.createBody.values,
    });
    expect(responseRecord(current.history).items).toEqual([
      expect.objectContaining({
        recordId,
        revision: 1,
        commandId: receipt.commandId,
        action: 'CREATE',
        before: null,
        after: { entryState: 'RECORDED', values: source.createBody.values },
        reason: null,
      }),
    ]);
    const replay = await source.create(source.createBody, key);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(receipt);
  });

  it('rejects a closed native command with real captures for a draft, other-family PDF or non-PDF source', async () => {
    const source = await prepareInvoiceRecordSource(fixture);
    const created = await source.create();
    expect(created.status).toBe(201);
    const receipt = responseRecord(await created.json());
    const commandId = responseString(receipt, 'commandId');
    const recordId = responseString(receipt, 'recordId');
    const original = await source.read(`/invoice-records/${recordId}`);
    const successor = await source.mutate('/versions', { expectedRevision: 3 });
    expect(successor.status).toBe(201);
    const draftVersionId = responseString(
      responseRecord(await successor.json()),
      'versionId',
    );
    const draftUpload = await source.upload(draftVersionId, 4, source.bytes);
    expect(draftUpload.status).toBe(201);
    const draftRepresentationId = responseString(
      responseRecord(await draftUpload.json()),
      'representationId',
    );
    const versions = await source.call('/versions');
    expect(versions.status).toBe(200);
    expect(responseRecord(await versions.json()).versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: draftVersionId, status: 'draft' }),
      ]),
    );
    const reference = responseRecord(
      await fixture.command({
        ...source.target,
        path: '/documents',
        body: {
          clientId: source.f.ready.source.clientId,
          title: 'Fictional non-PDF reference',
          purpose: 'Negative Invoice Record source control',
          url: 'https://example.test/fictional-reference-1030',
        },
      }),
    );
    const referenceDocumentId = responseString(reference, 'id');
    const referenceVersion = responseRecord(reference.version);
    const referenceVersionId = responseString(referenceVersion, 'id');
    const referenceRepresentationId = responseString(
      responseRecord(referenceVersion.representation),
      'id',
    );
    const referenceDesignation = await fixture.post({
      ...source.target,
      path: `/documents/${referenceDocumentId}/versions/${referenceVersionId}/official-designation`,
      body: { expectedRevision: 1 },
    });
    expect(referenceDesignation.status).toBe(200);
    const invalidSources = [
      {
        documentId: source.source.documentId,
        documentVersionId: draftVersionId,
        representationId: draftRepresentationId,
        storedPdf: true,
      },
      {
        documentId: responseString(source.f.document, 'id'),
        documentVersionId: source.documentVersionId,
        representationId: source.earlierRepresentationId,
        storedPdf: true,
      },
      {
        documentId: referenceDocumentId,
        documentVersionId: referenceVersionId,
        representationId: referenceRepresentationId,
        storedPdf: false,
      },
    ];
    for (const { storedPdf, ...invalidSource } of invalidSources) {
      // Every tuple really exists. Missing UUIDs, uploads and setup errors do
      // not prove the formal financial-source constraint.
      if (storedPdf) {
        const native = await fixture.request({
          ...source.target,
          path: `/documents/${invalidSource.documentId}/versions/${invalidSource.documentVersionId}/content/${invalidSource.representationId}`,
        });
        expect(native.status).toBe(200);
        expect((await native.arrayBuffer()).byteLength).toBeGreaterThan(0);
      } else {
        const native = responseRecord(
          await fixture.read({
            ...source.target,
            path: `/documents/${invalidSource.documentId}`,
          }),
        );
        expect(native.version).toMatchObject({
          id: invalidSource.documentVersionId,
          status: 'official',
          representation: {
            id: invalidSource.representationId,
            kind: 'external-reference',
            url: 'https://example.test/fictional-reference-1030',
          },
        });
      }
      const before = await invoiceRecordEffects(fixture);
      const writer = await fixture.pool.connect();
      try {
        await writer.query('BEGIN');
        await expect(
          forgedCreate(writer, {
            commandId,
            body: {
              action: 'CREATE',
              ...source.createBody,
              source: invalidSource,
            },
          }),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'invoice_native_source',
        });
      } finally {
        await writer.query('ROLLBACK');
        writer.release();
      }
      expect(await invoiceRecordEffects(fixture)).toEqual(before);
      expect(
        (await source.read(`/invoice-records/${recordId}`)).record,
      ).toEqual(original.record);
    }
  });

  it('rejects a complete direct root with an invented copied party and keeps the lawful native declaration unchanged', async () => {
    const source = await prepareInvoiceRecordSource(fixture);
    const created = await source.create();
    expect(created.status).toBe(201);
    const receipt = responseRecord(await created.json());
    const recordId = responseString(receipt, 'recordId');
    const original = await source.read(`/invoice-records/${recordId}`);
    const before = await invoiceRecordEffects(fixture);
    const writer = await fixture.pool.connect();
    const statements = [
      {
        text: `INSERT INTO invoice_records
          (workspace_id,company_id,id,document_id,document_version_id,
           representation_id,source_snapshot,replaces_withdrawn_record_id,
           revision,entry_state,values,created_at)
         SELECT workspace_id,company_id,$2,document_id,document_version_id,
           representation_id,
           jsonb_set(source_snapshot,'{copiedContext,receivingParty,legalName}',
             '"Invented receiving party"'::jsonb),
           replaces_withdrawn_record_id,revision,entry_state,values,created_at
         FROM invoice_records WHERE id=$1`,
        values: [recordId, randomUUID()],
      },
      {
        text: `UPDATE invoice_records SET source_snapshot=
         jsonb_set(source_snapshot,'{copiedContext,receivingParty,legalName}',
           '"Invented receiving party"'::jsonb)
         WHERE id=$1`,
        values: [recordId],
      },
    ];
    try {
      for (const statement of statements) {
        await writer.query('BEGIN');
        try {
          await expect(writer.query(statement)).rejects.toMatchObject({
            code: '23514',
            constraint: 'invoice_effect_path',
          });
        } finally {
          await writer.query('ROLLBACK');
        }
        expect(await invoiceRecordEffects(fixture)).toEqual(before);
      }
    } finally {
      writer.release();
    }
    expect((await source.read(`/invoice-records/${recordId}`)).record).toEqual(
      original.record,
    );
  });

  it('rolls back all real native effects when the final response decoder succeeds and response construction then fails', async () => {
    const source = await prepareInvoiceRecordSource(fixture);
    const key = randomUUID();
    const inventoryBefore = await source.read('/invoice-records');
    const before = await invoiceRecordEffects(fixture);
    const original = InvoiceRecordStore.prototype.replay;
    let decoded: unknown;
    // Deliberate final response-boundary fault injection: the real decoder,
    // real commands, native source checks, history and event all run first.
    // No business collaborator or successful business response is replaced.
    const failure = vi
      .spyOn(InvoiceRecordStore.prototype, 'replay')
      .mockImplementationOnce(async function (
        this: InvoiceRecordStore,
        row: Parameters<InvoiceRecordStore['replay']>[0],
      ) {
        decoded = await original.call(this, row);
        throw new Error('Synthetic final Invoice Record response failure');
      });
    try {
      const response = await source.create(source.createBody, key);
      expect(response.status).toBe(503);
      expect(failure).toHaveBeenCalledTimes(1);
      expect(decoded).toMatchObject({
        format: 'EXTERNAL_INVOICE_COMMAND/1',
        action: 'CREATE',
        revision: 1,
        commandId: expect.any(String),
        recordId: expect.any(String),
        recordedAt: expect.any(String),
      });
      expect(await invoiceRecordEffects(fixture)).toEqual(before);
      expect(await source.read('/invoice-records')).toEqual(inventoryBefore);
    } finally {
      failure.mockRestore();
    }
    const retried = await source.create(source.createBody, key);
    expect(retried.status).toBe(201);
    const receipt = responseRecord(await retried.json());
    const recordId = responseString(receipt, 'recordId');
    const current = await source.read(`/invoice-records/${recordId}`);
    expect(responseRecord(current.record)).toMatchObject({
      id: recordId,
      revision: 1,
      entryState: 'RECORDED',
      values: source.createBody.values,
    });
    expect(responseRecord(current.history).items).toHaveLength(1);
    const effects = await invoiceRecordEffects(fixture);
    expect(effects.invoice_record_commands).toHaveLength(1);
    expect(effects.invoice_record_history).toHaveLength(1);
    expect(effects.invoice_record_events).toHaveLength(1);
    const replay = await source.create(source.createBody, key);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(receipt);
    expect(await invoiceRecordEffects(fixture)).toEqual(effects);
  });

  it('rejects fully specified forged CREATE, CORRECT, WITHDRAW and replacement bundles despite complete closed receipts, facts and events', async () => {
    const source = await prepareInvoiceRecordSource(fixture);
    const first = await source.create();
    expect(first.status).toBe(201);
    const firstReceipt = responseRecord(await first.json());
    const recordId = responseString(firstReceipt, 'recordId');
    const firstTemplate = await nativeBundleTemplate(
      fixture,
      responseString(firstReceipt, 'commandId'),
    );
    const other = await prepareAdditionalInvoiceRecordSource(fixture, {
      target: source.target,
      body: source.body,
      title: 'Fictional complete-bundle predecessor control',
    });
    const second = await other.create();
    expect(second.status).toBe(201);
    const secondReceipt = responseRecord(await second.json());
    const secondId = responseString(secondReceipt, 'recordId');
    const withdrawal = await source.command({
      recordId: secondId,
      body: {
        action: 'WITHDRAW_ENTRY',
        expectedRevision: 1,
        reason:
          'Real withdrawn source predecessor for the negative replacement control',
      },
    });
    expect(withdrawal.status).toBe(201);
    const replacementTemplate = await nativeBundleTemplate(
      fixture,
      responseString(secondReceipt, 'commandId'),
    );
    const originals = await source.read('/invoice-records');
    const before = await invoiceRecordEffects(fixture);
    const candidates = [
      fullForgedBundle(firstTemplate, 'CREATE', recordId),
      fullForgedBundle(firstTemplate, 'CORRECT', recordId),
      fullForgedBundle(firstTemplate, 'WITHDRAW_ENTRY', recordId),
      fullForgedBundle(replacementTemplate, 'REPLACEMENT', recordId),
    ];
    for (const candidate of candidates) {
      // Closed-format positive controls establish complete, individually valid
      // candidate receipts/facts. The rejection below is an owning mutation-path
      // invariant, never a missing history/event or malformed fixture failure.
      expect(
        (
          await fixture.pool.query<{ receipt: boolean; fact: boolean }>(
            'SELECT invoice_receipt_valid($1::jsonb) receipt,invoice_revision_valid($2::jsonb) fact',
            [
              JSON.stringify(candidate.command.response),
              JSON.stringify(candidate.history.fact),
            ],
          )
        ).rows,
      ).toEqual([{ receipt: true, fact: true }]);
      const writer = await fixture.pool.connect();
      try {
        await writer.query('BEGIN');
        await expect(
          insertFullForgedBundle(writer, candidate),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'invoice_effect_path',
        });
      } finally {
        await writer.query('ROLLBACK');
        writer.release();
      }
      expect(await invoiceRecordEffects(fixture)).toEqual(before);
      expect((await source.read('/invoice-records')).items).toEqual(
        originals.items,
      );
    }
  });

  describe('stored revision history verification', () => {
    async function createRecord(
      source: Awaited<ReturnType<typeof prepareInvoiceRecordSource>>,
      key = randomUUID(),
    ) {
      const created = await source.create(source.createBody, key);
      expect(created.status).toBe(201);
      return responseString(responseRecord(await created.json()), 'recordId');
    }

    it('fails closed on a forged revision gap in the detail, history and inventory reads', async () => {
      const source = await prepareInvoiceRecordSource(fixture);
      const recordId = await createRecord(source);
      const corrected = await source.command({
        recordId,
        body: {
          action: 'CORRECT',
          expectedRevision: 1,
          values: { ...source.createBody.values, grossMinor: '125600' },
          reason: 'Fictional transcription check',
        },
      });
      expect(corrected.status).toBe(201);
      const paths = [
        `/invoice-records/${recordId}`,
        `/invoice-records/${recordId}/history`,
        '/invoice-records',
      ];
      for (const path of paths)
        expect((await source.request(path)).status).toBe(200);
      // Revision 2 still chains to a plausible predecessor; only the missing
      // revision 1 betrays the forged gap.
      await damageStoredHistory([
        [
          'DELETE FROM invoice_record_events WHERE record_id=$1 AND revision=1',
          [recordId],
        ],
        [
          'DELETE FROM invoice_record_history WHERE record_id=$1 AND revision=1',
          [recordId],
        ],
      ]);
      for (const path of paths)
        expect((await source.request(path)).status).toBe(503);
    });

    it('refuses to replay a committed command whose stored revision fact names another actor', async () => {
      const source = await prepareInvoiceRecordSource(fixture);
      const key = randomUUID();
      const recordId = await createRecord(source, key);
      const replay = await source.create(source.createBody, key);
      expect(replay.status).toBe(201);
      await damageStoredHistory([
        [
          `UPDATE invoice_record_history SET fact=jsonb_set(fact,'{actor,displayName}',to_jsonb('Forged fictional label'::text)) WHERE record_id=$1`,
          [recordId],
        ],
      ]);
      expect((await source.create(source.createBody, key)).status).toBe(503);
    });

    it('reads the first history page once per detail and first history request', async () => {
      const source = await prepareInvoiceRecordSource(fixture);
      const recordId = await createRecord(source);
      for (const path of [
        `/invoice-records/${recordId}`,
        `/invoice-records/${recordId}/history`,
      ]) {
        const measured = await fixture.measureApplicationQueries(() =>
          source.request(path),
        );
        expect(measured.value.status).toBe(200);
        expect(
          measured.queries.filter((query) =>
            query.includes('from "invoice_record_history"'),
          ),
        ).toHaveLength(1);
      }
    });

    /**
     * Disposable-database damage only: the append-only guards are disabled
     * and re-enabled inside one transaction, so they never stay off.
     */
    async function damageStoredHistory(
      statements: readonly (readonly [string, readonly string[]])[],
    ) {
      const writer = await fixture.pool.connect();
      try {
        await writer.query('BEGIN');
        for (const table of ['invoice_record_events', 'invoice_record_history'])
          await writer.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
        for (const [statement, values] of statements)
          await writer.query(statement, [...values]);
        for (const table of ['invoice_record_events', 'invoice_record_history'])
          await writer.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
        await writer.query('COMMIT');
      } catch (error) {
        await writer.query('ROLLBACK');
        throw error;
      } finally {
        writer.release();
      }
    }
  });
});

async function forgedCreate(
  writer: PoolClient,
  input: { commandId: string; body: unknown },
) {
  const recordId = randomUUID();
  await writer.query(
    `INSERT INTO invoice_record_commands
      (workspace_id,company_id,id,record_id,actor_membership_id,
       actor_internal_user_id,actor_display_name,assignment_id,source_captures,idempotency_key,intent)
     SELECT c.workspace_id,c.company_id,$2::uuid,$3::uuid,c.actor_membership_id,
       c.actor_internal_user_id,c.actor_display_name,c.assignment_id,c.source_captures,$4::text,
       jsonb_build_object('format','EXTERNAL_INVOICE_INTENT/1',
         'workspaceId',c.workspace_id::text,'companyId',c.company_id::text,
         'actorMembershipId',c.actor_membership_id::text,
         'recordId',($3::uuid)::text,'body',$5::jsonb)
     FROM invoice_record_commands c WHERE c.id=$1::uuid`,
    [
      input.commandId,
      randomUUID(),
      recordId,
      randomUUID(),
      JSON.stringify(input.body),
    ],
  );
  await writer.query('SET CONSTRAINTS ALL IMMEDIATE');
}

async function nativeBundleTemplate(
  fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
  commandId: string,
) {
  const result = await fixture.pool.query<{
    root: unknown;
    command: unknown;
    fact: unknown;
    event: unknown;
  }>(
    `SELECT to_jsonb(r) root,to_jsonb(c) command,h.fact,to_jsonb(e) event
     FROM invoice_record_commands c
     JOIN invoice_records r ON
       (r.workspace_id,r.company_id,r.id)=(c.workspace_id,c.company_id,c.record_id)
     JOIN invoice_record_history h ON h.command_id=c.id
     JOIN invoice_record_events e ON e.command_id=c.id
     WHERE c.id=$1::uuid`,
    [commandId],
  );
  expect(result.rows).toHaveLength(1);
  const row = result.rows[0];
  if (!row) throw new Error('Expected a complete genuine native bundle.');
  return {
    root: responseRecord(row.root),
    command: responseRecord(row.command),
    fact: responseRecord(row.fact),
    event: responseRecord(row.event),
  };
}

function fullForgedBundle(
  template: Awaited<ReturnType<typeof nativeBundleTemplate>>,
  kind: 'CREATE' | 'CORRECT' | 'WITHDRAW_ENTRY' | 'REPLACEMENT',
  invalidPredecessorId: string,
) {
  const create = kind === 'CREATE' || kind === 'REPLACEMENT';
  const action = kind === 'REPLACEMENT' ? 'CREATE' : kind;
  const recordId = create ? randomUUID() : responseString(template.root, 'id');
  const commandId = randomUUID();
  const revision = create ? 1 : 2;
  const recordedAt = responseString(template.fact, 'recordedAt');
  const originalValues = responseRecord(template.root.values);
  const sourceSnapshot = responseRecord(template.root.source_snapshot);
  const originalContext = responseRecord(sourceSnapshot.copiedContext);
  const party = responseRecord(originalContext.receivingParty);
  const after = {
    entryState: kind === 'WITHDRAW_ENTRY' ? 'WITHDRAWN' : 'RECORDED',
    values:
      kind === 'CORRECT'
        ? { ...originalValues, grossMinor: '99999999999999' }
        : originalValues,
  };
  const declaredReason =
    'Actual closed command intent in the synthetic candidate';
  const predecessorId = kind === 'REPLACEMENT' ? invalidPredecessorId : null;
  const body = create
    ? {
        action: 'CREATE',
        source: sourceSnapshot.source,
        values: originalValues,
        acknowledgeExternalDeclaration: true,
        replacesWithdrawnRecordId: predecessorId,
      }
    : kind === 'CORRECT'
      ? {
          action: 'CORRECT',
          expectedRevision: 1,
          values: { ...originalValues, grossMinor: '125550' },
          reason: declaredReason,
        }
      : {
          action: 'WITHDRAW_ENTRY',
          expectedRevision: 1,
          reason: declaredReason,
        };
  const receipt = {
    format: 'EXTERNAL_INVOICE_COMMAND/1',
    commandId,
    recordId,
    revision,
    action,
    recordedAt,
  };
  const fact = {
    format: 'EXTERNAL_INVOICE_REVISION/1',
    recordId,
    revision,
    action,
    commandId,
    actor: template.fact.actor,
    recordedAt,
    before: create ? null : { entryState: 'RECORDED', values: originalValues },
    after,
    reason: create
      ? null
      : kind === 'WITHDRAW_ENTRY'
        ? 'Invented historical reason absent from the complete command intent'
        : declaredReason,
  };
  const scope = {
    workspace_id: responseString(template.root, 'workspace_id'),
    company_id: responseString(template.root, 'company_id'),
  };
  return {
    create,
    root: {
      ...template.root,
      id: recordId,
      revision,
      entry_state: after.entryState,
      values: after.values,
      source_snapshot:
        kind === 'CREATE'
          ? {
              ...sourceSnapshot,
              copiedContext: {
                ...originalContext,
                receivingParty: {
                  ...party,
                  legalName:
                    'Invented copied party with a complete forged chain',
                },
              },
            }
          : sourceSnapshot,
      replaces_withdrawn_record_id: predecessorId,
      created_at: create ? recordedAt : template.root.created_at,
    },
    command: {
      ...template.command,
      id: commandId,
      record_id: recordId,
      idempotency_key: randomUUID(),
      revision,
      response: receipt,
      source_captures:
        kind === 'WITHDRAW_ENTRY' ? null : template.command.source_captures,
      created_at: recordedAt,
      intent: {
        ...responseRecord(template.command.intent),
        recordId,
        body,
      },
    },
    history: {
      ...scope,
      record_id: recordId,
      revision,
      command_id: commandId,
      fact,
    },
    event: {
      ...template.event,
      record_id: recordId,
      revision,
      command_id: commandId,
      occurred_at: recordedAt,
      action:
        action === 'CREATE'
          ? 'invoice_record.created'
          : action === 'CORRECT'
            ? 'invoice_record.transcription.corrected'
            : 'invoice_record.entry.withdrawn',
      metadata: { revision },
    },
  };
}

async function insertFullForgedBundle(
  writer: PoolClient,
  candidate: ReturnType<typeof fullForgedBundle>,
) {
  // Every candidate carries a root plus its complete matching command, receipt,
  // revision fact and typed event. The material forgery is copied party, intended
  // amount, historical reason or incompatible active/source predecessor.
  const rootWrite = candidate.create
    ? `INSERT INTO invoice_records
        (workspace_id,company_id,id,document_id,document_version_id,representation_id,
         source_snapshot,replaces_withdrawn_record_id,revision,entry_state,values,created_at)
       SELECT (r->>'workspace_id')::uuid,(r->>'company_id')::uuid,(r->>'id')::uuid,
         (r->>'document_id')::uuid,(r->>'document_version_id')::uuid,
         (r->>'representation_id')::uuid,r->'source_snapshot',
         (r->>'replaces_withdrawn_record_id')::uuid,(r->>'revision')::integer,
         r->>'entry_state',r->'values',(r->>'created_at')::timestamptz
       FROM candidate RETURNING id`
    : `UPDATE invoice_records target SET
         revision=(candidate.r->>'revision')::integer,
         entry_state=candidate.r->>'entry_state',values=candidate.r->'values'
       FROM candidate WHERE target.id=(candidate.r->>'id')::uuid
         AND target.workspace_id=(candidate.r->>'workspace_id')::uuid
         AND target.company_id=(candidate.r->>'company_id')::uuid
       RETURNING target.id`;
  await writer.query(
    `WITH candidate AS (SELECT $1::jsonb r,$2::jsonb c,$3::jsonb h,$4::jsonb e),
     root_write AS (${rootWrite}),
     command_write AS (
       INSERT INTO invoice_record_commands
       SELECT (jsonb_populate_record(NULL::invoice_record_commands,c)).*
       FROM candidate CROSS JOIN root_write RETURNING id
     ),
     history_write AS (
       INSERT INTO invoice_record_history
       SELECT (jsonb_populate_record(NULL::invoice_record_history,h)).*
       FROM candidate CROSS JOIN command_write RETURNING record_id
     ),
     event_write AS (
       INSERT INTO invoice_record_events
       SELECT (jsonb_populate_record(NULL::invoice_record_events,e)).*
       FROM candidate CROSS JOIN history_write RETURNING record_id
     ) SELECT count(*) FROM event_write`,
    [
      JSON.stringify(candidate.root),
      JSON.stringify(candidate.command),
      JSON.stringify(candidate.history),
      JSON.stringify(candidate.event),
    ],
  );
  await writer.query('SET CONSTRAINTS ALL IMMEDIATE');
}
