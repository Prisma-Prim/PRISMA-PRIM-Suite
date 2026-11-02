import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { revokeModelContractFixtureGrant } from '../contract/model-contract.test-fixture.js';
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
  prepareAdditionalInvoiceRecordSource,
  prepareInvoiceRecordSource,
} from './invoice-record.proof-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

withPostgres('Invoice Record native command concurrency', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
      // Live identity/membership/Company/capture checks remain enabled. Avoid
      // unrelated profile UPDATE locks masking the exact assignment wait edge.
      synchronizeIdentityProfile: false,
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

  it('keeps one active copied declaration when different keys race for the same exact native source', async () => {
    const source = await prepareInvoiceRecordSource(fixture);
    const firstKey = randomUUID();
    const secondKey = randomUUID();
    const barrier = await fixture.pool.connect();
    let first: Promise<Response> | undefined;
    let second: Promise<Response> | undefined;
    try {
      await barrier.query('BEGIN');
      const pid = await backendPid(barrier);
      await barrier.query(
        'SELECT id FROM working_documents WHERE id=$1 FOR UPDATE',
        [source.source.documentId],
      );
      first = source.create(source.createBody, firstKey);
      await waitForBlocked(fixture.pool, pid);
      second = source.create(source.createBody, secondKey);
      await waitForBlocked(fixture.pool, pid, 2);
      await barrier.query('COMMIT');
    } finally {
      await barrier.query('ROLLBACK').catch(() => undefined);
      barrier.release();
      await Promise.allSettled([first, second]);
    }
    if (!first || !second)
      throw new Error('Both creators must reach the barrier.');
    const responses = [
      { key: firstKey, response: await first },
      { key: secondKey, response: await second },
    ];
    expect(responses.map(({ response }) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const winner = responses.find(({ response }) => response.status === 201);
    const loser = responses.find(({ response }) => response.status === 409);
    if (!winner || !loser) throw new Error('Expected one successful creator.');
    const receipt = responseRecord(await winner.response.json());
    const recordId = responseString(receipt, 'recordId');
    expect(receipt).toEqual({
      format: 'EXTERNAL_INVOICE_COMMAND/1',
      commandId: expect.any(String),
      recordId,
      revision: 1,
      action: 'CREATE',
      recordedAt: expect.any(String),
    });
    expect(responseString(receipt, 'recordedAt')).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(await loser.response.json()).toMatchObject({
      code: 'INVOICE_SOURCE_ALREADY_RECORDED',
    });
    const current = await source.read(`/invoice-records/${recordId}`);
    expect(responseRecord(current.record)).toMatchObject({
      id: recordId,
      revision: 1,
      entryState: 'RECORDED',
      values: source.createBody.values,
      replacesWithdrawnRecordId: null,
      replacementRecordId: null,
    });
    const history = await source.read(`/invoice-records/${recordId}/history`);
    expect(history).toMatchObject({
      format: 'EXTERNAL_INVOICE_HISTORY/1',
      companyId: source.companyId,
      recordId,
      headRevision: 1,
      nextCursor: null,
      items: [
        {
          format: 'EXTERNAL_INVOICE_REVISION/1',
          recordId,
          revision: 1,
          action: 'CREATE',
          commandId: receipt.commandId,
          actor: { membershipId: source.membershipId },
          recordedAt: receipt.recordedAt,
          before: null,
          after: { entryState: 'RECORDED', values: source.createBody.values },
          reason: null,
        },
      ],
    });
    expect(responseRecord(current.history).items).toEqual(history.items);
    const inventory = await source.read('/invoice-records');
    expect(inventory).toMatchObject({
      format: 'EXTERNAL_INVOICE_INVENTORY/1',
      companyId: source.companyId,
      items: [current.record],
      nextCursor: null,
    });
    const replay = await source.create(source.createBody, winner.key);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(receipt);
    expect(await source.read(`/invoice-records/${recordId}/history`)).toEqual(
      history,
    );
    expect(await source.read('/invoice-records')).toEqual(inventory);
    const download = await source.request(
      `/invoice-records/${recordId}/source`,
    );
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(source.bytes);
  });

  it('replays one receipt and one complete effect when the exact same CREATE key and body race at the native source', async () => {
    const source = await prepareInvoiceRecordSource(fixture);
    const key = randomUUID();
    const barrier = await fixture.pool.connect();
    let first: Promise<Response> | undefined;
    let second: Promise<Response> | undefined;
    try {
      await barrier.query('BEGIN');
      const pid = await backendPid(barrier);
      await barrier.query(
        'SELECT id FROM working_documents WHERE id=$1 FOR UPDATE',
        [source.source.documentId],
      );
      first = source.create(source.createBody, key);
      await waitForBlocked(fixture.pool, pid);
      second = source.create(source.createBody, key);
      await waitForBlocked(fixture.pool, pid, 2);
      await barrier.query('COMMIT');
    } finally {
      await barrier.query('ROLLBACK').catch(() => undefined);
      barrier.release();
      await Promise.allSettled([first, second]);
    }
    if (!first || !second)
      throw new Error('Both retries must reach the barrier.');
    const firstResponse = await first;
    const secondResponse = await second;
    expect([firstResponse.status, secondResponse.status]).toEqual([201, 201]);
    const receipt = responseRecord(await firstResponse.json());
    expect(await secondResponse.json()).toEqual(receipt);
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
    expect((await source.read('/invoice-records')).items).toEqual([
      current.record,
    ]);
    const effects = await invoiceRecordEffects(fixture);
    expect(effects.invoice_records).toHaveLength(1);
    expect(effects.invoice_record_commands).toHaveLength(1);
    expect(effects.invoice_record_history).toHaveLength(1);
    expect(effects.invoice_record_events).toEqual([
      expect.objectContaining({
        record_id: recordId,
        revision: 1,
        command_id: receipt.commandId,
        action: 'invoice_record.created',
        metadata: { revision: 1 },
      }),
    ]);
    const replay = await source.create(source.createBody, key);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(receipt);
    expect(await invoiceRecordEffects(fixture)).toEqual(effects);
  });

  it.each(['CORRECT', 'WITHDRAW_ENTRY'])(
    'conserves one lawful revision when %s reaches the Record barrier before its competing command',
    async (firstAction) => {
      const source = await prepareInvoiceRecordSource(fixture);
      const created = await source.create();
      expect(created.status).toBe(201);
      const createReceipt = responseRecord(await created.json());
      const recordId = responseString(createReceipt, 'recordId');
      const correctedValues = {
        ...source.createBody.values,
        grossMinor: '125550',
        taxMinor: '0',
      };
      const correction = {
        action: 'CORRECT',
        expectedRevision: 1,
        values: correctedValues,
        reason: 'Correct the declared amount against the same saved PDF',
      };
      const withdrawal = {
        action: 'WITHDRAW_ENTRY',
        expectedRevision: 1,
        reason: 'Withdraw this PRISMA entry without external cancellation',
      };
      const firstBody = firstAction === 'CORRECT' ? correction : withdrawal;
      const secondBody = firstAction === 'CORRECT' ? withdrawal : correction;
      const firstKey = randomUUID();
      const secondKey = randomUUID();
      const barrier = await fixture.pool.connect();
      let first: Promise<Response> | undefined;
      let second: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        await barrier.query(
          'SELECT id FROM invoice_records WHERE id=$1 FOR UPDATE',
          [recordId],
        );
        first = source.command({ recordId, body: firstBody, key: firstKey });
        await waitForBlocked(fixture.pool, pid);
        second = source.command({ recordId, body: secondBody, key: secondKey });
        await waitForBlocked(fixture.pool, pid, 2);
        await barrier.query('COMMIT');
      } finally {
        await barrier.query('ROLLBACK').catch(() => undefined);
        barrier.release();
        await Promise.allSettled([first, second]);
      }
      if (!first || !second)
        throw new Error('Both commands must reach the barrier.');
      const responses = [
        { response: await first, body: firstBody, key: firstKey },
        { response: await second, body: secondBody, key: secondKey },
      ];
      expect(responses.map(({ response }) => response.status).sort()).toEqual([
        201, 409,
      ]);
      const winner = responses.find(({ response }) => response.status === 201);
      const loser = responses.find(({ response }) => response.status === 409);
      if (!winner || !loser) throw new Error('Expected one lawful transition.');
      expect(winner.body.action).toBe(firstAction);
      const receipt = responseRecord(await winner.response.json());
      expect(receipt).toMatchObject({
        recordId,
        revision: 2,
        action: winner.body.action,
      });
      const corrected = winner.body.action === 'CORRECT';
      expect(await loser.response.json()).toMatchObject({
        code: corrected ? 'STALE_INVOICE_RECORD' : 'INVOICE_WITHDRAWN',
      });
      const after = {
        entryState: corrected ? 'RECORDED' : 'WITHDRAWN',
        values: corrected ? correctedValues : source.createBody.values,
      };
      const current = await source.read(`/invoice-records/${recordId}`);
      expect(responseRecord(current.record)).toMatchObject({
        id: recordId,
        revision: 2,
        ...after,
      });
      const history = await source.read(`/invoice-records/${recordId}/history`);
      expect(history).toMatchObject({
        recordId,
        headRevision: 2,
        nextCursor: null,
      });
      expect(history.items).toEqual([
        expect.objectContaining({
          recordId,
          revision: 2,
          action: winner.body.action,
          commandId: receipt.commandId,
          before: { entryState: 'RECORDED', values: source.createBody.values },
          after,
          reason: winner.body.reason,
        }),
        expect.objectContaining({
          revision: 1,
          action: 'CREATE',
          commandId: createReceipt.commandId,
        }),
      ]);
      const effects = await invoiceRecordEffects(fixture);
      expect(effects.invoice_record_commands).toHaveLength(2);
      expect(effects.invoice_record_history).toHaveLength(2);
      expect(effects.invoice_record_events).toHaveLength(2);
      const replay = await source.command({
        recordId,
        body: winner.body,
        key: winner.key,
      });
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(receipt);
      expect(await invoiceRecordEffects(fixture)).toEqual(effects);
    },
  );

  it.each([
    { order: 'revocation first', revokeFirst: true },
    { order: 'command first', revokeFirst: false },
  ])(
    'linearizes the exact Recorder capture with $order through native assignment administration',
    async ({ revokeFirst }) => {
      const source = await prepareInvoiceRecordSource(fixture);
      await fixture.grant({
        path: '/company-invoice-reader-assignments',
        companyId: source.companyId,
        membershipId: source.membershipId,
      });
      const assigned = await fixture.pool.query<{ id: string }>(
        `SELECT id FROM company_role_assignments
         WHERE company_id=$1 AND workspace_membership_id=$2
           AND bundle='company_invoice_recorder' AND permission_set_version='v1'
           AND revoked_at IS NULL`,
        [source.companyId, source.membershipId],
      );
      expect(assigned.rows).toHaveLength(1);
      const assignmentId = assigned.rows[0]?.id;
      if (!assignmentId)
        throw new Error('Expected the exact native Recorder capture.');
      const before = await invoiceRecordEffects(fixture);
      const key = randomUUID();
      const barrier = await fixture.pool.connect();
      let pending: Promise<Response> | undefined;
      let revocation: Promise<Record<string, unknown>> | undefined;
      const revoke = () =>
        revokeModelContractFixtureGrant(
          fixture,
          '/company-invoice-recorder-assignments',
          source.companyId,
          source.membershipId,
        );
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        if (revokeFirst) {
          await barrier.query(
            'SELECT id FROM company_role_assignments WHERE id=$1 FOR UPDATE',
            [assignmentId],
          );
          revocation = revoke();
          await waitForRoleRevocation(fixture, pid);
          pending = source.create(source.createBody, key);
          await waitForBlocked(fixture.pool, pid, 2);
        } else {
          await fixture.pool.query(`
            CREATE FUNCTION invoice_record_proof_commit_barrier() RETURNS trigger
            LANGUAGE plpgsql AS $$ BEGIN
              PERFORM pg_advisory_xact_lock(10301031); RETURN NEW;
            END $$`);
          await fixture.pool.query(`
            CREATE TRIGGER invoice_record_proof_commit_barrier
            BEFORE INSERT ON invoice_record_events FOR EACH ROW
            EXECUTE FUNCTION invoice_record_proof_commit_barrier()`);
          await barrier.query('SELECT pg_advisory_xact_lock(10301031)');
          pending = source.create(source.createBody, key);
          await waitForBlocked(fixture.pool, pid);
          const blocked = await fixture.pool.query<{ pid: number }>(
            `SELECT pid FROM pg_stat_activity WHERE datname=current_database()
               AND $1=ANY(pg_blocking_pids(pid))`,
            [pid],
          );
          const commandPid = blocked.rows[0]?.pid;
          if (!commandPid)
            throw new Error('Expected the native command at its final event.');
          revocation = revoke();
          await waitForRoleRevocation(fixture, commandPid);
          await waitForBlocked(fixture.pool, pid, 2);
        }
        await barrier.query('COMMIT');
      } finally {
        await barrier.query('ROLLBACK').catch(() => undefined);
        barrier.release();
        await Promise.allSettled([pending, revocation]);
        await fixture.pool.query(
          'DROP TRIGGER IF EXISTS invoice_record_proof_commit_barrier ON invoice_record_events',
        );
        await fixture.pool.query(
          'DROP FUNCTION IF EXISTS invoice_record_proof_commit_barrier()',
        );
      }
      if (!pending || !revocation)
        throw new Error('Both native operations must reach the barrier.');
      await revocation;
      const result = await pending;
      expect(result.status).toBe(revokeFirst ? 403 : 201);
      const inventory = await source.read('/invoice-records');
      if (revokeFirst) {
        expect(inventory.items).toEqual([]);
        const after = await invoiceRecordEffects(fixture);
        for (const [table, facts] of Object.entries(before))
          if (table !== 'activity_log_events')
            expect({ table, facts: after[table] }).toEqual({ table, facts });
      } else {
        const receipt = responseRecord(await result.json());
        const recordId = responseString(receipt, 'recordId');
        const current = await source.read(`/invoice-records/${recordId}`);
        expect(responseRecord(current.record)).toMatchObject({
          id: recordId,
          revision: 1,
          entryState: 'RECORDED',
          values: source.createBody.values,
        });
        expect(inventory.items).toEqual([current.record]);
        expect(responseRecord(current.history).items).toHaveLength(1);
        const effects = await invoiceRecordEffects(fixture);
        expect(effects.invoice_record_commands).toHaveLength(1);
        expect(effects.invoice_record_history).toHaveLength(1);
        expect(effects.invoice_record_events).toHaveLength(1);
        const replay = await source.create(source.createBody, key);
        expect(replay.status).toBe(403);
        expect(await invoiceRecordEffects(fixture)).toEqual(effects);
      }
      const exact = await source.call(
        `/versions/${source.source.documentVersionId}/content/${source.source.representationId}`,
      );
      expect(exact.status).toBe(200);
      expect(Buffer.from(await exact.arrayBuffer())).toEqual(source.bytes);
    },
  );

  it('allows one direct replacement when different exact Documents race for the same withdrawn predecessor', async () => {
    const source = await prepareInvoiceRecordSource(fixture);
    const created = await source.create();
    expect(created.status).toBe(201);
    const predecessorId = responseString(
      responseRecord(await created.json()),
      'recordId',
    );
    const withdrawal = await source.command({
      recordId: predecessorId,
      body: {
        action: 'WITHDRAW_ENTRY',
        expectedRevision: 1,
        reason: 'Wrong source association; an explicit replacement is required',
      },
    });
    expect(withdrawal.status).toBe(201);
    const predecessorBefore = await source.read(
      `/invoice-records/${predecessorId}`,
    );
    const firstSource = await prepareAdditionalInvoiceRecordSource(fixture, {
      target: source.target,
      body: source.body,
      title: 'Fictional replacement source A — not a fiscal document',
    });
    const secondSource = await prepareAdditionalInvoiceRecordSource(fixture, {
      target: source.target,
      body: source.body,
      title: 'Fictional replacement source B — not a fiscal document',
    });
    expect(firstSource.source.documentId).not.toBe(
      secondSource.source.documentId,
    );
    const firstBody = {
      ...firstSource.createBody,
      replacesWithdrawnRecordId: predecessorId,
    };
    const secondBody = {
      ...secondSource.createBody,
      replacesWithdrawnRecordId: predecessorId,
    };
    const firstKey = randomUUID();
    const secondKey = randomUUID();
    const barrier = await fixture.pool.connect();
    let first: Promise<Response> | undefined;
    let second: Promise<Response> | undefined;
    try {
      await barrier.query('BEGIN');
      const pid = await backendPid(barrier);
      await barrier.query(
        'SELECT id FROM invoice_records WHERE id=$1 FOR UPDATE',
        [predecessorId],
      );
      first = firstSource.create(firstBody, firstKey);
      await waitForBlocked(fixture.pool, pid);
      second = secondSource.create(secondBody, secondKey);
      await waitForBlocked(fixture.pool, pid, 2);
      await barrier.query('COMMIT');
    } finally {
      await barrier.query('ROLLBACK').catch(() => undefined);
      barrier.release();
      await Promise.allSettled([first, second]);
    }
    if (!first || !second)
      throw new Error('Both replacements must reach the barrier.');
    const responses = [
      {
        response: await first,
        source: firstSource,
        body: firstBody,
        key: firstKey,
      },
      {
        response: await second,
        source: secondSource,
        body: secondBody,
        key: secondKey,
      },
    ];
    expect(responses.map(({ response }) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const winner = responses.find(({ response }) => response.status === 201);
    const loser = responses.find(({ response }) => response.status === 409);
    if (!winner || !loser) throw new Error('Expected one direct replacement.');
    const receipt = responseRecord(await winner.response.json());
    const replacementId = responseString(receipt, 'recordId');
    expect(await loser.response.json()).toMatchObject({
      code: 'INVOICE_PREDECESSOR_CONFLICT',
    });
    const predecessorAfter = await source.read(
      `/invoice-records/${predecessorId}`,
    );
    expect(predecessorAfter.record).toEqual({
      ...responseRecord(predecessorBefore.record),
      replacementRecordId: replacementId,
    });
    expect(responseRecord(predecessorAfter.history).items).toEqual(
      responseRecord(predecessorBefore.history).items,
    );
    const replacement = await source.read(`/invoice-records/${replacementId}`);
    expect(responseRecord(replacement.record)).toMatchObject({
      id: replacementId,
      revision: 1,
      entryState: 'RECORDED',
      values: source.createBody.values,
      replacesWithdrawnRecordId: predecessorId,
      replacementRecordId: null,
    });
    expect(replacement.liveSource).toMatchObject({
      kind: 'AVAILABLE',
      documentId: winner.source.source.documentId,
      documentVersionId: winner.source.source.documentVersionId,
      content: {
        kind: 'AVAILABLE',
        representationId: winner.source.source.representationId,
      },
    });
    const inventory = await source.read('/invoice-records');
    expect(inventory.items).toEqual(
      expect.arrayContaining([replacement.record, predecessorAfter.record]),
    );
    expect(inventory.items).toHaveLength(2);
    const effects = await invoiceRecordEffects(fixture);
    expect(effects.invoice_record_commands).toHaveLength(3);
    expect(effects.invoice_record_history).toHaveLength(3);
    expect(effects.invoice_record_events).toHaveLength(3);
    const replay = await winner.source.create(winner.body, winner.key);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(receipt);
    expect(await invoiceRecordEffects(fixture)).toEqual(effects);
    const exact = await source.request(
      `/invoice-records/${replacementId}/source`,
    );
    expect(exact.status).toBe(200);
    expect(Buffer.from(await exact.arrayBuffer())).toEqual(winner.source.bytes);
  });
  it('fences a complete direct native CREATE against original Client loss and rolls back both attempted transactions', async () => {
    const source = await prepareInvoiceRecordSource(fixture);
    const created = await source.create();
    expect(created.status).toBe(201);
    const receipt = responseRecord(await created.json());
    const templateCommandId = responseString(receipt, 'commandId');
    const other = await prepareAdditionalInvoiceRecordSource(fixture, {
      target: source.target,
      body: source.body,
      title: 'Fictional unused source for the native Client fence',
    });
    const selection = await source.read('/invoice-records/sources');
    expect(selection.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: other.source,
          versionState: 'official',
        }),
      ]),
    );
    const inventoryBefore = await source.read('/invoice-records');
    const before = await invoiceRecordEffects(fixture);
    const loss = await fixture.pool.connect();
    const writer = await fixture.pool.connect();
    const cancellation = new AbortController();
    let candidate: Promise<ClientFenceObservation> | undefined;
    let fence: Promise<ClientFenceObservation> | undefined;
    let observed: ClientFenceObservation | undefined;
    let lossOpen = false;
    try {
      await loss.query('BEGIN');
      lossOpen = true;
      const holderPid = await backendPid(loss);
      // This is the competing negative lifecycle-state attempt, never setup or
      // a public archive workflow. It holds only this exact Client row and is
      // unconditionally rolled back; all persistent prerequisites above are HTTP.
      const changed = await loss.query<{ id: string }>(
        `UPDATE client_accounts SET status='archived'
         WHERE id=$1::uuid AND status='active' RETURNING id`,
        [source.f.ready.source.clientId],
      );
      expect(changed.rows).toEqual([{ id: source.f.ready.source.clientId }]);
      await writer.query('BEGIN');
      candidate = (async (): Promise<ClientFenceObservation> => {
        try {
          await attemptNativeInvoiceCreate(writer, {
            templateCommandId,
            body: { action: 'CREATE', ...other.createBody },
          });
          return { kind: 'complete' };
        } catch (error) {
          if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === '23514' &&
            'constraint' in error &&
            error.constraint === 'invoice_native_source'
          )
            return { kind: 'refused' };
          throw error;
        }
      })();
      fence = observeNativeClientFence(fixture, {
        holderPid,
        signal: cancellation.signal,
      });
      // A complete unfenced bundle wins this race immediately on the defective
      // path. A timeout, absent event or unrelated setup refusal cannot pass.
      observed = await Promise.race([candidate, fence]);
      cancellation.abort();
      await loss.query('ROLLBACK');
      lossOpen = false;
      // The correctly blocked candidate may continue after Client loss rolls
      // back. Its complete effects remain uncommitted and are rolled back too.
      const final = await candidate;
      expect(['complete', 'refused']).toContain(final.kind);
    } finally {
      cancellation.abort();
      if (lossOpen) await loss.query('ROLLBACK').catch(() => undefined);
      await Promise.allSettled([candidate, fence]);
      await writer.query('ROLLBACK').catch(() => undefined);
      writer.release();
      loss.release();
    }
    expect(await invoiceRecordEffects(fixture)).toEqual(before);
    expect((await source.read('/invoice-records')).items).toEqual(
      inventoryBefore.items,
    );
    if (!observed)
      throw new Error('Expected the native Client fence observation.');
    expect(['blocked', 'refused']).toContain(observed.kind);
  });
});

type ClientFenceObservation =
  | { kind: 'blocked'; nativePid: number }
  | { kind: 'refused' }
  | { kind: 'complete' }
  | { kind: 'cancelled' };

async function attemptNativeInvoiceCreate(
  writer: PoolClient,
  input: { templateCommandId: string; body: unknown },
) {
  const commandId = randomUUID();
  const recordId = randomUUID();
  const inserted = await writer.query<{ id: string }>(
    `INSERT INTO invoice_record_commands
      (workspace_id,company_id,id,record_id,actor_membership_id,
       actor_internal_user_id,actor_display_name,assignment_id,source_captures,idempotency_key,intent)
     SELECT c.workspace_id,c.company_id,$2::uuid,$3::uuid,c.actor_membership_id,
       c.actor_internal_user_id,c.actor_display_name,c.assignment_id,c.source_captures,$4::text,
       jsonb_build_object('format','EXTERNAL_INVOICE_INTENT/1',
         'workspaceId',c.workspace_id::text,'companyId',c.company_id::text,
         'actorMembershipId',c.actor_membership_id::text,
         'recordId',($3::uuid)::text,'body',$5::jsonb)
     FROM invoice_record_commands c WHERE c.id=$1::uuid RETURNING id`,
    [
      input.templateCommandId,
      commandId,
      recordId,
      randomUUID(),
      JSON.stringify(input.body),
    ],
  );
  expect(inserted.rows).toEqual([{ id: commandId }]);
  const event = await writer.query<{ record_id: string }>(
    `INSERT INTO invoice_record_events
      (workspace_id,company_id,record_id,revision,command_id,
       actor_membership_id,actor_internal_user_id,occurred_at,action,metadata)
     SELECT workspace_id,company_id,record_id,revision,id,
       actor_membership_id,actor_internal_user_id,created_at,
       'invoice_record.created',jsonb_build_object('revision',revision)
     FROM invoice_record_commands WHERE id=$1::uuid RETURNING record_id`,
    [commandId],
  );
  expect(event.rows).toEqual([{ record_id: recordId }]);
  await writer.query('SET CONSTRAINTS ALL IMMEDIATE');
  const coupled = await writer.query<{
    records: number;
    commands: number;
    history: number;
    events: number;
  }>(
    `SELECT
      (SELECT count(*)::integer FROM invoice_records WHERE id=$1::uuid) records,
      (SELECT count(*)::integer FROM invoice_record_commands WHERE id=$2::uuid) commands,
      (SELECT count(*)::integer FROM invoice_record_history WHERE command_id=$2::uuid) history,
      (SELECT count(*)::integer FROM invoice_record_events WHERE command_id=$2::uuid) events`,
    [recordId, commandId],
  );
  expect(coupled.rows).toEqual([
    { records: 1, commands: 1, history: 1, events: 1 },
  ]);
}

async function observeNativeClientFence(
  fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
  input: { holderPid: number; signal: AbortSignal },
): Promise<ClientFenceObservation> {
  const deadline = Date.now() + 4000;
  while (!input.signal.aborted && Date.now() < deadline) {
    const waiting = await fixture.pool.query<{ pid: number }>(
      `SELECT pid FROM pg_stat_activity WHERE datname=current_database()
         AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid))`,
      [input.holderPid],
    );
    const native = waiting.rows[0];
    if (waiting.rows.length === 1 && native)
      return { kind: 'blocked', nativePid: native.pid };
    await setImmediate();
  }
  if (input.signal.aborted) return { kind: 'cancelled' };
  throw new Error(
    'Expected the complete native candidate at the exact Client fence.',
  );
}

async function waitForRoleRevocation(
  fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
  blockerPid: number,
) {
  const deadline = Date.now() + 3000;
  do {
    const result = await fixture.pool.query<{ pid: number }>(
      `SELECT pid FROM pg_stat_activity WHERE datname=current_database()
         AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid))
         AND query ILIKE '%update%company_role_assignments%'`,
      [blockerPid],
    );
    if (result.rows.length === 1) return;
    await setImmediate();
  } while (Date.now() < deadline);
  throw new Error(
    'Expected the native Recorder revocation at its exact assignment lock.',
  );
}
