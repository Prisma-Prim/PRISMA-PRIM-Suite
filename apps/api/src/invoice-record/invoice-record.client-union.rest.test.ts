import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  invoiceRecordEffects,
  prepareInvoiceRecordSource,
} from './invoice-record.proof-support.js';

type Fixture = Awaited<ReturnType<typeof openEstimateOfferFixture>>;
type RecordSource = Awaited<ReturnType<typeof prepareInvoiceRecordSource>>;

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const financialTables = [
  'invoice_records',
  'invoice_record_commands',
  'invoice_record_history',
  'invoice_record_events',
  'invoice_record_cursor_keys',
];
const immutableSourceTables = [
  'working_documents',
  'external_invoice_document_relations',
  'document_versions',
  'document_representations',
  'document_pdfs',
  'document_version_commands',
  'document_correction_commands',
  'document_registration_events',
  'document_project_events',
];

withPostgres(
  'Invoice Record CREATE versus actual public Client legacy union',
  () => {
    let fixture: Fixture;
    let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
    let source: RecordSource;
    let pair: Awaited<ReturnType<typeof prepareLegacyUnion>>;
    let before: Awaited<ReturnType<typeof invoiceRecordEffects>>;
    let copiedContext: Record<string, unknown>;
    beforeAll(async () => {
      scanner = await openDocumentScannerFixture();
      fixture = await openEstimateOfferFixture({
        scannerEnvironment: scanner.environment,
        // Live User/member/Company/capture checks remain enabled. An unrelated
        // profile UPDATE must not stand in for the actual Client reference fence.
        synchronizeIdentityProfile: false,
      });
    });
    beforeEach(async () => {
      await fixture.reset();
      scanner.reset();
      source = await prepareInvoiceRecordSource(fixture);
      pair = await prepareLegacyUnion(fixture, source);
      const selection = await source.read('/invoice-records/sources');
      if (!Array.isArray(selection.items))
        throw new Error('Expected the authorized exact source selection.');
      const selected = selection.items.map(responseRecord).find((item) => {
        const tuple = responseRecord(item.source);
        return (
          tuple.documentId === source.source.documentId &&
          tuple.documentVersionId === source.source.documentVersionId &&
          tuple.representationId === source.source.representationId
        );
      });
      if (!selected)
        throw new Error('Expected the exact native formal source.');
      copiedContext = responseRecord(selected.copiedContext);
      before = await invoiceRecordEffects(fixture);
      for (const table of financialTables) expect(before[table]).toEqual([]);
    });
    afterAll(async () => {
      await fixture?.close();
      await scanner?.close();
    });

    it.each([true, false])(
      'linearizes native REST CREATE and union confirmation at the Client fence, Record first: %s',
      async (recordFirst) => {
        const table = recordFirst
          ? 'invoice_record_commands'
          : 'client_union_operations';
        const key = randomUUID();
        const holder = await fixture.pool.connect();
        let first: Promise<Response> | undefined;
        let second: Promise<Response> | undefined;
        try {
          await fixture.pool.query(
            'CREATE FUNCTION pause_invoice_record_public_union() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(10306580); RETURN NEW; END $$',
          );
          await fixture.pool.query(
            `CREATE TRIGGER pause_invoice_record_public_union BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION pause_invoice_record_public_union()`,
          );
          await holder.query('BEGIN');
          const pid = await backendPid(holder);
          await holder.query('SELECT pg_advisory_xact_lock(10306580)');
          // CREATE has already taken its Client new-use fence before its command
          // insert. Union has locked its real Client pair before its operation row.
          first = recordFirst
            ? source.create(source.createBody, key)
            : fixture.post(pair.confirmation);
          await waitForBlocked(fixture.pool, pid);
          second = recordFirst
            ? fixture.post(pair.confirmation)
            : source.create(source.createBody, key);
          await waitForBlocked(fixture.pool, pid, 2);
          await expectClientReferenceWait(fixture, pid);
          await holder.query('COMMIT');
        } finally {
          await holder.query('ROLLBACK').catch(() => undefined);
          holder.release();
          await Promise.allSettled([first, second]);
          await fixture.pool.query(
            `DROP TRIGGER IF EXISTS pause_invoice_record_public_union ON ${table}`,
          );
          await fixture.pool.query(
            'DROP FUNCTION IF EXISTS pause_invoice_record_public_union()',
          );
        }
        if (!first || !second)
          throw new Error(
            'Both public commands must reach their observed barriers.',
          );
        const recordResponse = await (recordFirst ? first : second);
        const unionResponse = await (recordFirst ? second : first);
        expect(unionResponse.status).toBe(201);
        const united = responseRecord(await unionResponse.json());
        expect(responseString(united, 'projectionReference')).not.toBe('');
        expect(recordResponse.status).toBe(recordFirst ? 201 : 404);

        const clients = await fixture.pool.query<{
          id: string;
          status: string;
        }>('SELECT id,status FROM client_accounts WHERE id=ANY($1::uuid[])', [
          [pair.originalClientId, pair.survivorId],
        ]);
        expect(clients.rows).toHaveLength(2);
        expect(clients.rows).toEqual(
          expect.arrayContaining([
            { id: pair.originalClientId, status: 'superseded' },
            { id: pair.survivorId, status: 'active' },
          ]),
        );
        expect(
          (
            await fixture.pool.query<{ count: number }>(
              'SELECT count(*)::integer count FROM client_union_operations',
            )
          ).rows,
        ).toEqual([{ count: 1 }]);
        const document = responseRecord(
          await fixture.read({
            ...source.target,
            path: `/documents/${source.source.documentId}`,
          }),
        );
        expect(document).toMatchObject({
          id: source.source.documentId,
          clientId: pair.originalClientId,
          clientDossierId: pair.survivorId,
          correction: 'read-only',
        });
        const exactNative = await source.call(
          `/versions/${source.source.documentVersionId}/content/${source.source.representationId}`,
        );
        expect(exactNative.status).toBe(200);
        expect(Buffer.from(await exactNative.arrayBuffer())).toEqual(
          source.bytes,
        );
        const inventory = await source.read('/invoice-records');
        const after = await invoiceRecordEffects(fixture);
        for (const sourceTable of immutableSourceTables) {
          expect(before[sourceTable]).toBeDefined();
          expect({ table: sourceTable, facts: after[sourceTable] }).toEqual({
            table: sourceTable,
            facts: before[sourceTable],
          });
        }
        expect(
          (
            await fixture.pool.query<{ count: number }>(
              "SELECT count(*)::integer count FROM invoice_records WHERE entry_state='RECORDED'",
            )
          ).rows,
        ).toEqual([{ count: recordFirst ? 1 : 0 }]);

        if (recordFirst) {
          const receipt = responseRecord(await recordResponse.json());
          const recordId = responseString(receipt, 'recordId');
          const current = await source.read(`/invoice-records/${recordId}`);
          expect(current.record).toMatchObject({
            id: recordId,
            revision: 1,
            entryState: 'RECORDED',
            values: source.createBody.values,
            copiedContext,
          });
          expect(current.capabilities).toEqual({
            canCorrect: false,
            canWithdraw: true,
          });
          expect(current.liveSource).toMatchObject({
            kind: 'AVAILABLE',
            documentId: source.source.documentId,
            documentVersionId: source.source.documentVersionId,
            content: {
              kind: 'AVAILABLE',
              representationId: source.source.representationId,
            },
          });
          const history = await source.read(
            `/invoice-records/${recordId}/history`,
          );
          expect(history).toMatchObject({
            recordId,
            headRevision: 1,
            nextCursor: null,
          });
          expect(history.items).toEqual([
            expect.objectContaining({
              format: 'EXTERNAL_INVOICE_REVISION/1',
              recordId,
              revision: 1,
              action: 'CREATE',
              commandId: receipt.commandId,
              actor: expect.objectContaining({
                membershipId: source.membershipId,
              }),
              recordedAt: receipt.recordedAt,
              before: null,
              after: {
                entryState: 'RECORDED',
                values: source.createBody.values,
              },
              reason: null,
            }),
          ]);
          expect(responseRecord(current.history).items).toEqual(history.items);
          expect(inventory.items).toEqual([current.record]);
          expect(after.invoice_records).toHaveLength(1);
          expect(after.invoice_record_commands).toHaveLength(1);
          expect(after.invoice_record_history).toHaveLength(1);
          expect(after.invoice_record_events).toEqual([
            expect.objectContaining({
              record_id: recordId,
              revision: 1,
              command_id: receipt.commandId,
              action: 'invoice_record.created',
              metadata: { revision: 1 },
            }),
          ]);
          const exactRecord = await source.request(
            `/invoice-records/${recordId}/source`,
          );
          expect(exactRecord.status).toBe(200);
          expect(Buffer.from(await exactRecord.arrayBuffer())).toEqual(
            source.bytes,
          );
          const replay = await source.create(source.createBody, key);
          expect(replay.status).toBe(201);
          expect(await replay.json()).toEqual(receipt);
          expect(
            (await source.read(`/invoice-records/${recordId}/history`)).items,
          ).toEqual(history.items);
        } else {
          expect(inventory.items).toEqual([]);
          for (const financialTable of financialTables)
            expect({
              table: financialTable,
              facts: after[financialTable],
            }).toEqual({
              table: financialTable,
              facts: before[financialTable],
            });
        }
        const unionReplay = await fixture.post(pair.confirmation);
        expect(unionReplay.status).toBe(201);
        expect(await unionReplay.json()).toEqual(united);
        expect(await invoiceRecordEffects(fixture)).toEqual(after);
      },
    );
  },
);

async function prepareLegacyUnion(fixture: Fixture, source: RecordSource) {
  const originalClientId = source.f.ready.source.clientId;
  const survivor = responseRecord(
    await fixture.command({
      ...source.target,
      path: '/clients',
      body: {
        displayName: 'Fictional surviving Client for Record union',
        taxId: 'FICTIONAL-SURVIVOR-RECORD-1030',
        address: 'Fictional survivor address',
      },
    }),
  );
  const survivorId = responseString(survivor, 'id');
  const dossier = responseRecord(
    await fixture.read({
      ...source.target,
      path: `/clients/${survivorId}`,
    }),
  );
  const version = dossier.version;
  if (
    typeof version !== 'number' ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    throw new Error('Expected the native survivor Client version.');
  const original = responseRecord(
    await fixture.read({
      ...source.target,
      path: `/clients/${originalClientId}`,
    }),
  );
  const before = await invoiceRecordEffects(fixture);
  expect(
    (
      await fixture.post({
        ...source.target,
        path: '/clients',
        body: {
          displayName: 'Rejected duplicate Client fixture',
          taxId: original.taxId,
        },
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await fixture.request({
        ...source.target,
        path: `/clients/${survivorId}`,
        init: {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify({
            expectedVersion: version,
            taxId: original.taxId,
          }),
        },
      })
    ).status,
  ).toBe(409);
  expect(await invoiceRecordEffects(fixture)).toEqual(before);
  // The Source owner's accepted, explicitly historical Client input seam:
  // both Clients, their grants, Contract, signing declaration and PDF above were
  // created publicly. Current commands correctly refuse duplicate tax IDs.
  // Only this labeled legacy identifier preparation uses SQL; union review,
  // confirmation and both competing business commands remain native HTTP.
  await fixture.pool.query(
    "UPDATE client_accounts SET tax_id='FICTIONAL-LEGACY-RECORD-UNION-1030' WHERE id=ANY($1::uuid[])",
    [[originalClientId, survivorId]],
  );
  const review = responseRecord(
    await fixture.command({
      ...source.target,
      path: `/clients/${originalClientId}/union-reviews`,
      body: {},
    }),
  );
  const confirmation = {
    ...source.target,
    path: `/client-union-reviews/${responseString(review, 'reviewReference')}/confirm`,
    body: {
      canonicalClientId: survivorId,
      fields: {
        displayName: survivorId,
        taxId: originalClientId,
        address: survivorId,
        telephone: originalClientId,
        generalEmail: originalClientId,
        businessActivity: originalClientId,
      },
      companyIds: [source.companyId],
      reviewedDifferences: true,
      reason:
        'Fictional legacy duplicate reviewed; preserve the original invoice declaration',
    },
    key: randomUUID(),
  };
  return { originalClientId, survivorId, confirmation };
}

async function expectClientReferenceWait(fixture: Fixture, holderPid: number) {
  const result = await fixture.pool.query<{ count: number }>(
    `WITH RECURSIVE waiting AS (
       SELECT pid,pg_blocking_pids(pid) blockers FROM pg_stat_activity
       WHERE datname=current_database() AND wait_event_type='Lock'
     ), chain AS (
       SELECT pid FROM waiting WHERE $1=ANY(blockers)
       UNION SELECT w.pid FROM waiting w JOIN chain c ON c.pid=ANY(w.blockers)
     ) SELECT count(*)::integer count FROM pg_stat_activity
       WHERE pid IN (SELECT pid FROM chain) AND query ILIKE '%client_accounts%'`,
    [holderPid],
  );
  expect(result.rows).toEqual([{ count: 1 }]);
}
