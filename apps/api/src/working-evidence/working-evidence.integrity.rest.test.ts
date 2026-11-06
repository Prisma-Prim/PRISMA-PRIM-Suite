import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  openWorkingEvidenceFixture,
  json,
  record,
  text,
  type WorkingEvidenceFixture,
} from './working-evidence.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres(
  'Working Evidence atomicity, current authority and exact integrity',
  () => {
    let fixture: WorkingEvidenceFixture;
    let projectId: string;
    let clientId: string;
    let companyId: string;
    let membershipId: string;
    let source: Awaited<ReturnType<WorkingEvidenceFixture['source']>>;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await openWorkingEvidenceFixture(databaseUrl);
    });
    beforeEach(async () => {
      ({ projectId, clientId, companyId, membershipId } =
        await fixture.prepare());
      source = await fixture.source();
    });
    afterAll(async () => fixture?.close());
    const post = (body: unknown) =>
      fixture.call(`/projects/${projectId}/working-evidence-cases`, {
        method: 'POST',
        body,
      });
    async function effects() {
      return (
        await fixture.pool.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM working_evidence_cases t) AS cases,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM working_evidence_revisions t) AS revisions,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM working_evidence_supports t) AS supports,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY revision_id) FROM working_evidence_outputs t) AS outputs,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id) FROM working_evidence_receipts t) AS receipts,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY revision_id) FROM working_evidence_events t) AS events,
      (SELECT jsonb_agg(jsonb_build_array(id,version) ORDER BY id) FROM client_accounts) AS clients`)
      ).rows;
    }

    async function independentNativeActor(extraGrants: readonly string[]) {
      const identity = {
        subject: 'mission-collaborator',
        displayName: 'Fictional independent native actor',
        email: 'mission-collaborator@example.test',
      };
      const actorResponse = await fixture.call('/access/current-actor', {
        company: null,
        identity,
      });
      expect(actorResponse.status).toBe(200);
      const actorMembershipId = text(
        (await json(actorResponse)).workspaceMembershipId,
      );
      for (const path of [
        '/company-context-assignments',
        '/company-director-client-assignments',
        ...extraGrants,
      ]) {
        const granted = await fixture.call(path, {
          method: 'POST',
          company: null,
          body: { companyId, workspaceMembershipId: actorMembershipId },
        });
        expect(granted.status, path).toBe(201);
      }
      return identity;
    }

    it('lets public Project closure win before a waiting Case new-use without a partial Case or extra Client fence', async () => {
      const identity = await independentNativeActor([
        '/company-project-assignments',
        '/company-project-approver-assignments',
      ]);
      const before = record((await effects())[0]);
      const clientsBefore = (
        await fixture.pool.query<{ id: string; version: number }>(
          'SELECT id,version FROM client_accounts ORDER BY id',
        )
      ).rows;
      await fixture.pool.query(
        "CREATE FUNCTION working_evidence_close_gate_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='cancelled' THEN PERFORM pg_advisory_xact_lock(1056,1); END IF; RETURN NEW; END $$; CREATE TRIGGER working_evidence_close_gate_test BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION working_evidence_close_gate_test()",
      );
      const barrier = await fixture.pool.connect();
      let released = false;
      let closing: Promise<Response> | undefined;
      let recording: Promise<Response> | undefined;
      try {
        const pid = await backendPid(barrier);
        await barrier.query('SELECT pg_advisory_lock(1056,1)');
        closing = fixture.call(`/projects/${projectId}/lifecycle-transitions`, {
          method: 'POST',
          identity,
          body: {
            action: 'cancel',
            expectedLifecycleRevision: 0,
            reason: 'Fictional cancellation before a competing working record',
          },
        });
        await waitForBlocked(fixture.pool, pid);
        // The native transition owns Client identity, relationship and Project
        // locks before its update. Case must wait on that same identity before
        // qualifying or locking any exact source Document.
        recording = post(fixture.recordBody([source]));
        await waitForBlocked(fixture.pool, pid, 2);
        expect(await effects()).toEqual([before]);
        await barrier.query('SELECT pg_advisory_unlock(1056,1)');
        released = true;
        expect((await closing).status).toBe(200);
        const refused = await recording;
        expect(refused.status).toBe(409);
        expect(await refused.json()).toEqual({ code: 'new_use_unavailable' });
        expect(await effects()).toEqual([
          {
            ...before,
            clients: clientsBefore.map((client) => [
              client.id,
              client.version + (client.id === clientId ? 1 : 0),
            ]),
          },
        ]);
        expect(
          await json(await fixture.call(`/projects/${projectId}/lifecycle`)),
        ).toMatchObject({
          status: 'cancelled',
          lifecycleRevision: 1,
          transitions: [{ action: 'cancel' }],
        });
        expect(
          (
            await fixture.pool.query(
              'SELECT count(*)::int AS count FROM project_lifecycle_transitions WHERE project_id=$1',
              [projectId],
            )
          ).rows,
        ).toEqual([{ count: 1 }]);
      } finally {
        if (!released) await barrier.query('SELECT pg_advisory_unlock(1056,1)');
        await Promise.allSettled([closing, recording]);
        barrier.release();
        await fixture.pool.query(
          'DROP FUNCTION working_evidence_close_gate_test() CASCADE',
        );
      }
    });

    it('lets a public Client union win before a waiting Case new-use while retaining its exact original Project and source', async () => {
      const identity = await independentNativeActor([]);
      const registered = await fixture.call('/clients', {
        method: 'POST',
        body: { displayName: 'Fictional canonical Client for native union' },
      });
      expect(registered.status).toBe(201);
      const canonicalClientId = text((await json(registered)).id);
      // Reuse the native Project lifecycle/Client union historical-data fixture:
      // public registration refuses duplicates, so only the legacy identifier
      // coincidence is set here. Review and union still use the real public API.
      await fixture.pool.query(
        "UPDATE client_accounts SET tax_id='WORKING-EVIDENCE-FICTIONAL-UNION' WHERE id=ANY($1::uuid[])",
        [[clientId, canonicalClientId]],
      );
      const reviewResponse = await fixture.call(
        `/clients/${clientId}/union-reviews`,
        {
          method: 'POST',
          identity,
          body: {},
        },
      );
      expect(reviewResponse.status).toBe(201);
      const review = await json(reviewResponse);
      expect(review.outcome).toBe('comparison');
      const before = record((await effects())[0]);
      const clientsBefore = (
        await fixture.pool.query<{ id: string; version: number }>(
          'SELECT id,version FROM client_accounts ORDER BY id',
        )
      ).rows;
      await fixture.pool.query(
        "CREATE FUNCTION working_evidence_union_gate_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='superseded' THEN PERFORM pg_advisory_xact_lock(1056,2); END IF; RETURN NEW; END $$; CREATE TRIGGER working_evidence_union_gate_test BEFORE UPDATE ON client_accounts FOR EACH ROW EXECUTE FUNCTION working_evidence_union_gate_test()",
      );
      const barrier = await fixture.pool.connect();
      let released = false;
      let uniting: Promise<Response> | undefined;
      let recording: Promise<Response> | undefined;
      try {
        const pid = await backendPid(barrier);
        await barrier.query('SELECT pg_advisory_lock(1056,2)');
        uniting = fixture.call(
          `/client-union-reviews/${text(review.reviewReference)}/confirm`,
          {
            method: 'POST',
            identity,
            body: {
              canonicalClientId,
              fields: {
                displayName: clientId,
                taxId: clientId,
                address: clientId,
                telephone: clientId,
                generalEmail: clientId,
                businessActivity: clientId,
              },
              companyIds: [companyId],
              reviewedDifferences: true,
              reason:
                'Fictional legacy identity comparison before competing new use',
            },
          },
        );
        await waitForBlocked(fixture.pool, pid);
        // Union owns the sorted original Client identities before relationships.
        // Case cannot take a Document lock first and continue from an active
        // Client snapshot once the public union has superseded that original.
        recording = post(fixture.recordBody([source]));
        await waitForBlocked(fixture.pool, pid, 2);
        expect(await effects()).toEqual([before]);
        await barrier.query('SELECT pg_advisory_unlock(1056,2)');
        released = true;
        expect((await uniting).status).toBe(201);
        const refused = await recording;
        expect(refused.status).toBe(409);
        expect(await refused.json()).toEqual({ code: 'new_use_unavailable' });
        expect(await effects()).toEqual([
          {
            ...before,
            clients: clientsBefore.map((client) => [
              client.id,
              client.version + 1,
            ]),
          },
        ]);
        expect(
          await json(await fixture.call(`/projects/${projectId}`)),
        ).toMatchObject({
          clientAccountId: clientId,
        });
        expect(
          await json(await fixture.call(`/documents/${source.documentId}`)),
        ).toMatchObject({
          clientId,
        });
        expect(
          (
            await fixture.pool.query(
              'SELECT id,status::text AS status FROM client_accounts WHERE id=$1',
              [clientId],
            )
          ).rows,
        ).toEqual([{ id: clientId, status: 'superseded' }]);
        expect(
          (
            await fixture.pool.query(
              'SELECT count(*)::int AS count FROM client_union_operations',
            )
          ).rows,
        ).toEqual([{ count: 1 }]);
      } finally {
        if (!released) await barrier.query('SELECT pg_advisory_unlock(1056,2)');
        await Promise.allSettled([uniting, recording]);
        barrier.release();
        await fixture.pool.query(
          'DROP FUNCTION working_evidence_union_gate_test() CASCADE',
        );
      }
    });

    it('replays an exact committed command before damaged fresh bytes but refuses every whole artifact without an attachment prefix', async () => {
      const command = fixture.recordBody([source]);
      const saved = await post(command);
      expect(saved.status).toBe(201);
      const receipt = await json(saved);
      const path = `/working-evidence-cases/${text(receipt.caseId)}/revisions/${text(receipt.revisionId)}`;
      const detail = await json(await fixture.call(path));
      const evidence = record(detail.evidence);
      if (!Array.isArray(evidence.supports))
        throw new Error('Expected exact support.');
      const support = record(evidence.supports[0]);
      // Deliberate damage only in this disposable database, matching the native content
      // integrity seam. Restore all guards before exercising the public boundary.
      await fixture.pool.query(
        'ALTER TABLE document_pdfs DISABLE TRIGGER USER',
      );
      try {
        await fixture.pool.query(
          'UPDATE document_pdfs SET sha256=$1 WHERE id=$2',
          ['0'.repeat(64), source.representationId],
        );
      } finally {
        await fixture.pool.query(
          'ALTER TABLE document_pdfs ENABLE TRIGGER USER',
        );
      }
      expect(await json(await post(command))).toEqual(receipt);
      expect(await json(await fixture.call(path))).toMatchObject({
        statement: command.values.statement,
        evidence: { state: 'visible' },
      });
      for (const suffix of [
        '/statement',
        '/annex',
        `/evidence/${text(support.evidenceId)}`,
      ]) {
        const unavailable = await fixture.call(path + suffix);
        expect(unavailable.status).toBe(503);
        expect(unavailable.headers.get('content-disposition')).toBeNull();
        expect(unavailable.headers.get('content-type')).not.toMatch(
          /application\/(?:pdf|zip)|text\/html/u,
        );
        expect(await unavailable.json()).toEqual({
          code: 'content_unavailable',
        });
      }
      const before = await effects();
      const newUse = await post({ ...command, commandId: randomUUID() });
      expect(newUse.status).toBe(503);
      expect(await newUse.json()).toEqual({ code: 'content_unavailable' });
      expect(await effects()).toEqual(before);
    });

    it('fails closed on unknown persisted receipt, support snapshot and intent shapes without rewriting conserved facts', async () => {
      const command = fixture.recordBody([source]);
      const saved = await post(command);
      expect(saved.status).toBe(201);
      const receipt = await json(saved);
      const path = `/working-evidence-cases/${text(receipt.caseId)}/revisions/${text(receipt.revisionId)}`;
      const selected = await fixture.pool.query<{
        receipt: unknown;
        intent: unknown;
        fingerprint: string;
        snapshot: unknown;
      }>(
        `SELECT r.receipt,r.intent,r.fingerprint,s.snapshot
         FROM working_evidence_receipts r
         JOIN working_evidence_supports s ON s.revision_id=r.revision_id
         WHERE r.revision_id=$1`,
        [receipt.revisionId],
      );
      const stored = selected.rows[0];
      if (!stored)
        throw new Error('Expected the complete conserved fictional revision.');
      const originalReceipt = record(stored.receipt);
      const originalIntent = record(stored.intent);
      const originalSupport = record(stored.snapshot);
      const healthy = await effects();
      async function replaceReceipt(value: unknown) {
        await fixture.pool.query(
          'ALTER TABLE working_evidence_receipts DISABLE TRIGGER USER',
        );
        try {
          await fixture.pool.query(
            'UPDATE working_evidence_receipts SET receipt=$1::jsonb WHERE revision_id=$2',
            [JSON.stringify(value), receipt.revisionId],
          );
        } finally {
          await fixture.pool.query(
            'ALTER TABLE working_evidence_receipts ENABLE TRIGGER USER',
          );
        }
      }
      async function replaceSupport(value: unknown) {
        await fixture.pool.query(
          'ALTER TABLE working_evidence_supports DISABLE TRIGGER USER',
        );
        try {
          await fixture.pool.query(
            'UPDATE working_evidence_supports SET snapshot=$1::jsonb WHERE revision_id=$2',
            [JSON.stringify(value), receipt.revisionId],
          );
        } finally {
          await fixture.pool.query(
            'ALTER TABLE working_evidence_supports ENABLE TRIGGER USER',
          );
        }
      }
      async function replaceIntent(value: unknown, fingerprint: string | null) {
        await fixture.pool.query(
          'ALTER TABLE working_evidence_receipts DISABLE TRIGGER USER',
        );
        try {
          await fixture.pool.query(
            `UPDATE working_evidence_receipts SET intent=$1::jsonb,
             fingerprint=coalesce($3,encode(sha256(convert_to(($1::jsonb)::text,'UTF8')),'hex'))
             WHERE revision_id=$2`,
            [JSON.stringify(value), receipt.revisionId, fingerprint],
          );
        } finally {
          await fixture.pool.query(
            'ALTER TABLE working_evidence_receipts ENABLE TRIGGER USER',
          );
        }
      }
      async function unavailableWithoutWrites(work: () => Promise<Response>) {
        const before = await effects();
        const response = await work();
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ code: 'content_unavailable' });
        expect(await effects()).toEqual(before);
      }
      // Only deliberate disposable-database damage bypasses guards. Every public
      // operation below runs after all native/conservation guards are restored.
      try {
        for (const malformed of [
          { ...originalReceipt, format: 'WORKING_EVIDENCE_CASE_RECEIPT/2' },
          {
            ...originalReceipt,
            unrecognized: 'Fictional extra persisted field',
          },
        ]) {
          await replaceReceipt(malformed);
          await unavailableWithoutWrites(() => post(command));
        }
        await replaceReceipt(originalReceipt);
        for (const malformed of [
          { format: 'UNRECOGNIZED_WORKING_EVIDENCE_SUPPORT/2' },
          {
            ...originalSupport,
            unrecognized: 'Fictional extra persisted field',
          },
        ]) {
          await replaceSupport(malformed);
          await unavailableWithoutWrites(() => fixture.call(path));
          await unavailableWithoutWrites(() => fixture.call(path + '/annex'));
        }
        await replaceSupport(originalSupport);
        // Match the damaged intent's digest so a fingerprint mismatch cannot
        // substitute for strict unknown-format rejection at the public replay seam.
        await replaceIntent(
          { ...originalIntent, format: 'WORKING_EVIDENCE_CASE_INTENT/2' },
          null,
        );
        await unavailableWithoutWrites(() => post(command));
      } finally {
        await replaceReceipt(originalReceipt);
        await replaceSupport(originalSupport);
        await replaceIntent(originalIntent, stored.fingerprint);
      }
      expect(await effects()).toEqual(healthy);
      expect(await json(await post(command))).toEqual(receipt);
    });

    it('rolls back the complete aggregate, receipt, event, output and original Client fence when final event persistence fails', async () => {
      const before = await effects();
      await fixture.pool.query(
        "CREATE FUNCTION reject_working_evidence_event_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictional final event refusal'; END $$; CREATE TRIGGER reject_working_evidence_event_test BEFORE INSERT ON working_evidence_events FOR EACH ROW EXECUTE FUNCTION reject_working_evidence_event_test()",
      );
      const command = fixture.recordBody([source]);
      try {
        const failed = await post(command);
        expect(failed.status).toBe(500);
        expect(await effects()).toEqual(before);
        expect(
          await json(
            await fixture.call(`/projects/${projectId}/working-evidence-cases`),
          ),
        ).toMatchObject({ items: [], nextCursor: null });
      } finally {
        await fixture.pool.query(
          'DROP FUNCTION reject_working_evidence_event_test() CASCADE',
        );
      }
      const retried = await post(command);
      expect(retried.status).toBe(201);
      expect(await json(retried)).toMatchObject({
        revisionNumber: 1,
        action: 'RECORD',
      });
    });

    it('rejects updates and deletion of every conserved revision fact at the database boundary', async () => {
      const saved = await post(fixture.recordBody([source]));
      expect(saved.status).toBe(201);
      const receipt = await json(saved);
      const before = await effects();
      for (const sql of [
        'UPDATE working_evidence_revisions SET statement=statement WHERE id=$1',
        'DELETE FROM working_evidence_revisions WHERE id=$1',
        'UPDATE working_evidence_supports SET snapshot=snapshot WHERE revision_id=$1',
        'DELETE FROM working_evidence_supports WHERE revision_id=$1',
        'UPDATE working_evidence_outputs SET statement=statement WHERE revision_id=$1',
        'DELETE FROM working_evidence_outputs WHERE revision_id=$1',
        'UPDATE working_evidence_receipts SET intent=intent WHERE revision_id=$1',
        'DELETE FROM working_evidence_receipts WHERE revision_id=$1',
        'UPDATE working_evidence_events SET metadata=metadata WHERE revision_id=$1',
        'DELETE FROM working_evidence_events WHERE revision_id=$1',
      ])
        await expect(
          fixture.pool.query(sql, [receipt.revisionId]),
        ).rejects.toMatchObject({ code: '23514' });
      expect(await effects()).toEqual(before);
    });

    it('rejects an orphan Case head at deferred commit without manufacturing a revision, receipt or fence', async () => {
      const before = await effects();
      await expect(
        fixture.pool.query(
          `INSERT INTO working_evidence_cases (id,workspace_id,company_id,project_id,original_client_id,revision,current_revision_id,created_at)
       SELECT $1,workspace_id,company_id,id,client_account_id,1,$2,now() FROM projects WHERE id=$3`,
          [randomUUID(), randomUUID(), projectId],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'working_evidence_complete_head',
      });
      expect(await effects()).toEqual(before);
    });

    it('serializes two new records behind the original Client identity before locking either source Document', async () => {
      const second = await fixture.source({
        title: 'Independent fictional source',
      });
      const connection = await fixture.pool.connect();
      let firstRequest: Promise<Response> | undefined;
      let secondRequest: Promise<Response> | undefined;
      try {
        await connection.query('BEGIN');
        const pid = await backendPid(connection);
        await connection.query(
          'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
          [clientId],
        );
        firstRequest = post(fixture.recordBody([source, second]));
        secondRequest = post(fixture.recordBody([second, source]));
        await waitForBlocked(fixture.pool, pid, 2);
        const heldDocuments = await fixture.pool.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM pg_locks WHERE relation='working_documents'::regclass AND mode IN ('RowShareLock','RowExclusiveLock') AND pid IN (SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)))",
          [pid],
        );
        expect(heldDocuments.rows[0]?.count).toBe(0);
        await connection.query('COMMIT');
        expect((await firstRequest).status).toBe(201);
        expect((await secondRequest).status).toBe(201);
      } finally {
        await connection.query('ROLLBACK');
        connection.release();
        await Promise.allSettled([firstRequest, secondRequest]);
      }
    });

    it('rechecks Recorder revocation after waiting instead of committing from a stale Actor projection', async () => {
      const connection = await fixture.pool.connect();
      let pending: Promise<Response> | undefined;
      try {
        await connection.query('BEGIN');
        const pid = await backendPid(connection);
        await connection.query(
          "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_working_evidence_case_recorder' FOR UPDATE",
          [companyId, membershipId],
        );
        pending = post(fixture.recordBody([source]));
        await waitForBlocked(fixture.pool, pid);
        await connection.query(
          "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_working_evidence_case_recorder' AND revoked_at IS NULL",
          [companyId, membershipId],
        );
        await connection.query('COMMIT');
        expect((await pending).status).toBe(403);
        expect(
          await json(
            await fixture.call(`/projects/${projectId}/working-evidence-cases`),
          ),
        ).toMatchObject({ items: [], nextCursor: null });
      } finally {
        await connection.query('ROLLBACK');
        connection.release();
        await pending?.catch(() => undefined);
      }
    });
  },
);
