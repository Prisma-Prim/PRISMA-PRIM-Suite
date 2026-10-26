import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import { prepareMissionReview } from './mission-result-review.test-support.js';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)(
  'Mission review owner barriers through PostgreSQL REST',
  () => {
    let fixture: MissionDocumentFixture;
    beforeAll(async () => {
      if (!url) throw new Error('Database required');
      fixture = await createMissionDocumentFixture(url);
    });
    afterAll(async () => fixture?.close());
    async function blockedBy(pid: number) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const result = await fixture.pool.query(
          'SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid)) LIMIT 1',
          [pid],
        );
        const row = result.rows[0];
        if (row !== undefined) {
          const value = record(row).pid;
          if (typeof value !== 'number')
            throw new Error('Missing PostgreSQL identity');
          return value;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(
        'Public command did not reach the expected owner barrier',
      );
    }
    async function gate(
      table: string,
      operation: 'INSERT' | 'UPDATE',
      condition = 'true',
    ) {
      // Fixed test-owned identifiers only; the application owners remain real.
      await fixture.pool.query(
        `CREATE FUNCTION mission_review_test_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN PERFORM pg_advisory_xact_lock(887); END IF; RETURN NEW; END $$`,
      );
      await fixture.pool.query(
        `CREATE TRIGGER mission_review_test_gate BEFORE ${operation} ON ${table} FOR EACH ROW EXECUTE FUNCTION mission_review_test_gate()`,
      );
      const connection = await fixture.pool.connect();
      await connection.query('BEGIN');
      const result = await connection.query('SELECT pg_backend_pid() AS pid');
      const pid = record(result.rows[0]).pid;
      if (typeof pid !== 'number') throw new Error('Missing gate identity');
      await connection.query('SELECT pg_advisory_xact_lock(887)');
      let released = false;
      return {
        pid,
        release: async () => {
          if (released) return;
          released = true;
          try {
            await connection.query('COMMIT');
          } finally {
            connection.release();
          }
        },
        remove: () =>
          fixture.pool.query(
            'DROP FUNCTION mission_review_test_gate() CASCADE',
          ),
      };
    }
    it.each(['review-first', 'reopen-first'])(
      'serializes observed done Tasks: %s',
      async (order) => {
        const context = await prepareMissionReview(fixture);
        const barrier =
          order === 'review-first'
            ? await gate('mission_result_review_batches', 'INSERT')
            : await gate('tasks', 'UPDATE');
        let first: Promise<Response> | undefined,
          second: Promise<Response> | undefined;
        const review = () =>
          fixture.call(context.path, { method: 'POST', body: context.body });
        const reopen = () =>
          fixture.call(`/tasks/${context.taskId}/reopen`, {
            method: 'POST',
            body: { expectedVersion: 2 },
          });
        try {
          first = order === 'review-first' ? review() : reopen();
          const firstPid = await blockedBy(barrier.pid);
          second = order === 'review-first' ? reopen() : review();
          await blockedBy(firstPid);
          await barrier.release();
          expect((await first).status).toBe(201);
          expect((await second).status).toBe(
            order === 'review-first' ? 201 : 409,
          );
          const projection = record(
            (await json(await fixture.call(context.path))).review,
          );
          expect(projection.revision).toBe(order === 'review-first' ? 1 : 0);
        } finally {
          await barrier.release();
          await first?.catch(() => undefined);
          await second?.catch(() => undefined);
          await barrier.remove();
        }
      },
      20_000,
    );
    it.each(['review-first', 'revoke-first'])(
      'serializes captured Reviewer authority: %s',
      async (order) => {
        const context = await prepareMissionReview(fixture);
        const barrier =
          order === 'review-first'
            ? await gate('mission_result_review_batches', 'INSERT')
            : await gate(
                'company_role_assignments',
                'UPDATE',
                "NEW.bundle::text='company_mission_result_reviewer'",
              );
        let first: Promise<Response> | undefined,
          second: Promise<Response> | undefined;
        const review = () =>
          fixture.call(context.path, {
            method: 'POST',
            key: 'captured-race-demo',
            body: context.body,
          });
        const revoke = () =>
          fixture.call(
            `/company-mission-result-reviewer-assignments/${context.membershipId}/${context.companyId}`,
            { method: 'DELETE', company: null },
          );
        try {
          first = order === 'review-first' ? review() : revoke();
          const firstPid = await blockedBy(barrier.pid);
          second = order === 'review-first' ? revoke() : review();
          await blockedBy(firstPid);
          await barrier.release();
          expect((await first).status).toBe(
            order === 'review-first' ? 201 : 200,
          );
          expect((await second).status).toBe(
            order === 'review-first' ? 200 : 403,
          );
          expect((await review()).status).toBe(403);
          expect(
            record((await json(await fixture.call(context.path))).review)
              .revision,
          ).toBe(order === 'review-first' ? 1 : 0);
        } finally {
          await barrier.release();
          await first?.catch(() => undefined);
          await second?.catch(() => undefined);
          await barrier.remove();
        }
      },
      20_000,
    );
    it.each(['review-first', 'close-first'])(
      'serializes ordinary Project closure and the Client fence: %s',
      async (order) => {
        const context = await prepareMissionReview(fixture);
        await fixture.grant('/company-project-approver-assignments');
        for (const row of context.activities.slice(1))
          expect(
            (
              await fixture.call(`/tasks/${text(row.taskId)}/cancel`, {
                method: 'POST',
                body: {
                  expectedVersion: 1,
                  reason: 'Ordinary cancelled work DEMO',
                },
              })
            ).status,
          ).toBe(201);
        const barrier =
          order === 'review-first'
            ? await gate('mission_result_review_batches', 'INSERT')
            : await gate('projects', 'UPDATE', "NEW.status='cancelled'");
        let first: Promise<Response> | undefined,
          second: Promise<Response> | undefined;
        const review = () =>
          fixture.call(context.path, { method: 'POST', body: context.body });
        const close = () =>
          fixture.call(`/projects/${context.projectId}/lifecycle-transitions`, {
            method: 'POST',
            body: {
              action: 'cancel',
              expectedLifecycleRevision: 0,
              reason: 'Ordinary closure DEMO',
            },
          });
        try {
          first = order === 'review-first' ? review() : close();
          const firstPid = await blockedBy(barrier.pid);
          second = order === 'review-first' ? close() : review();
          await blockedBy(firstPid);
          await barrier.release();
          expect((await first).status).toBe(
            order === 'review-first' ? 201 : 200,
          );
          expect((await second).status).toBe(
            order === 'review-first' ? 200 : 409,
          );
        } finally {
          await barrier.release();
          await first?.catch(() => undefined);
          await second?.catch(() => undefined);
          await barrier.remove();
        }
      },
      20_000,
    );
    it.each([
      'mission_result_review_items',
      'mission_result_review_events',
      'mission_result_review_commands',
    ])(
      'rolls back rows, receipts, event and original Client fence when %s fails',
      async (table) => {
        const context = await prepareMissionReview(fixture);
        const before = (
          await fixture.pool.query(
            'SELECT version,updated_at FROM client_accounts WHERE id=$1',
            [context.clientId],
          )
        ).rows;
        await fixture.pool.query(
          "CREATE FUNCTION mission_review_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic coupling failure'; END $$",
        );
        await fixture.pool.query(
          `CREATE TRIGGER mission_review_fail BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION mission_review_fail()`,
        );
        try {
          expect(
            (
              await fixture.call(context.path, {
                method: 'POST',
                body: context.body,
              })
            ).status,
          ).toBe(500);
        } finally {
          await fixture.pool.query(
            'DROP FUNCTION mission_review_fail() CASCADE',
          );
        }
        expect(
          (
            await fixture.pool.query(
              'SELECT version,updated_at FROM client_accounts WHERE id=$1',
              [context.clientId],
            )
          ).rows,
        ).toEqual(before);
        expect(
          record((await json(await fixture.call(context.path))).review)
            .revision,
        ).toBe(0);
        for (const relation of [
          'mission_result_review_batches',
          'mission_result_review_items',
          'mission_result_review_events',
          'mission_result_review_commands',
        ])
          expect(
            (
              await fixture.pool.query(
                `SELECT count(*)::int AS count FROM ${relation}`,
              )
            ).rows,
          ).toEqual([{ count: 0 }]);
      },
    );
    it.each(['review-first', 'union-first'])(
      'preserves original Client identity during a governed union: %s',
      async (order) => {
        const context = await prepareMissionReview(fixture);
        await fixture.grant('/company-director-client-assignments');
        const canonical = await fixture.call('/clients', {
          method: 'POST',
          body: { displayName: 'Canonical mission Client DEMO' },
        });
        expect(canonical.status).toBe(201);
        const canonicalId = text((await json(canonical)).id);
        await fixture.pool.query(
          "UPDATE client_accounts SET tax_id='MISSION-REVIEW-UNION-DEMO' WHERE id=ANY($1::uuid[])",
          [[context.clientId, canonicalId]],
        );
        const makeUnion = async () => {
          const review = await fixture.call(
            `/clients/${context.clientId}/union-reviews`,
            { method: 'POST', body: {} },
          );
          expect(review.status).toBe(201);
          return text((await json(review)).reviewReference);
        };
        const reference = await makeUnion();
        const union = (ref: string) =>
          fixture.call(`/client-union-reviews/${ref}/confirm`, {
            method: 'POST',
            body: {
              canonicalClientId: canonicalId,
              fields: {
                displayName: context.clientId,
                taxId: context.clientId,
                address: context.clientId,
                telephone: context.clientId,
                generalEmail: context.clientId,
                businessActivity: context.clientId,
              },
              companyIds: [context.companyId],
              reviewedDifferences: true,
              reason: 'Synthetic original-Client correction DEMO',
            },
          });
        const review = () =>
          fixture.call(context.path, {
            method: 'POST',
            key: 'union-review-demo',
            body: context.body,
          });
        const barrier =
          order === 'review-first'
            ? await gate('mission_result_review_batches', 'INSERT')
            : await gate(
                'client_accounts',
                'UPDATE',
                "NEW.status='superseded' AND OLD.status='active'",
              );
        let first: Promise<Response> | undefined,
          second: Promise<Response> | undefined;
        try {
          first = order === 'review-first' ? review() : union(reference);
          const firstPid = await blockedBy(barrier.pid);
          second = order === 'review-first' ? union(reference) : review();
          await blockedBy(firstPid);
          await barrier.release();
          expect((await first).status).toBe(201);
          expect((await second).status).toBe(404);
          await barrier.remove();
          if (order === 'review-first') {
            expect((await union(await makeUnion())).status).toBe(201);
            expect((await review()).status).toBe(201);
          }
          const projection = record(
            (await json(await fixture.call(context.path))).review,
          );
          expect(projection).toMatchObject({
            mutable: false,
            revision: order === 'review-first' ? 1 : 0,
          });
          expect(
            record(
              await json(await fixture.call(`/projects/${context.projectId}`)),
            ).clientAccountId,
          ).toBe(context.clientId);
        } finally {
          await barrier.release();
          await first?.catch(() => undefined);
          await second?.catch(() => undefined);
          await fixture.pool.query(
            'DROP FUNCTION IF EXISTS mission_review_test_gate() CASCADE',
          );
        }
      },
      20_000,
    );
    it.each(['review-first', 'suspend-first'])(
      'serializes reviewer membership suspension at the Workspace parent: %s',
      async (order) => {
        const context = await prepareMissionReview(fixture);
        const identity = {
          subject: 'mission-collaborator',
          displayName: 'Review Collaborator DEMO',
          email: 'reviewer@example.test',
        };
        const member = text(
          (
            await json(
              await fixture.call('/access/current-actor', {
                identity,
                company: null,
              }),
            )
          ).workspaceMembershipId,
        );
        for (const bundle of [
          'context',
          'director-client',
          'project',
          'task-manager',
          'project-template-user',
          'document-registrar',
          'mission-deliverable-access',
          'document-content-reader',
          'mission-result-reviewer',
        ]) {
          const route =
            bundle === 'context'
              ? '/company-context-assignments'
              : `/company-${bundle}-assignments`;
          expect(
            (
              await fixture.call(route, {
                method: 'POST',
                company: null,
                body: {
                  companyId: context.companyId,
                  workspaceMembershipId: member,
                },
              })
            ).status,
          ).toBe(201);
        }
        const review = () =>
          fixture.call(context.path, {
            method: 'POST',
            identity,
            body: context.body,
          });
        const suspend = () =>
          fixture.call('/workspace-membership-suspensions', {
            method: 'POST',
            company: null,
            body: { workspaceMembershipId: member },
          });
        const barrier =
          order === 'review-first'
            ? await gate('mission_result_review_batches', 'INSERT')
            : await gate(
                'workspace_memberships',
                'UPDATE',
                "NEW.status='inactive'",
              );
        let first: Promise<Response> | undefined,
          second: Promise<Response> | undefined;
        try {
          first = order === 'review-first' ? review() : suspend();
          const firstPid = await blockedBy(barrier.pid);
          second = order === 'review-first' ? suspend() : review();
          await blockedBy(firstPid);
          await barrier.release();
          expect((await first).status).toBe(201);
          expect((await second).status).toBe(
            order === 'review-first' ? 201 : 403,
          );
          expect((await review()).status).toBe(403);
          expect(
            record((await json(await fixture.call(context.path))).review)
              .revision,
          ).toBe(order === 'review-first' ? 1 : 0);
        } finally {
          await barrier.release();
          await first?.catch(() => undefined);
          await second?.catch(() => undefined);
          await barrier.remove();
        }
      },
      20_000,
    );
  },
);
