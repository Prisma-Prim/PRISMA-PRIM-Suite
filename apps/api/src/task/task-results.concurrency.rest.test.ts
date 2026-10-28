import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import { prepareTaskResult } from './task-results.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
withPostgres('D4 concurrent Task result transactions REST', () => {
  let fixture: MissionDocumentFixture;
  let context: Awaited<ReturnType<typeof prepareTaskResult>>;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await createMissionDocumentFixture(databaseUrl);
  });
  afterAll(async () => {
    await fixture?.close();
  });
  beforeEach(async () => {
    context = await prepareTaskResult(fixture);
    await fixture.grant('/company-task-result-recorder-assignments');
  });
  const submit = (options: { key?: string; declaration?: string } = {}) =>
    fixture.call(`/tasks/${context.taskId}/results`, {
      method: 'POST',
      key: options.key ?? 'concurrent-record-demo',
      body: {
        expectedTaskVersion: 1,
        expectedResultRevision: 0,
        documentId: context.documentId,
        versionId: context.versionId,
        declaration: options.declaration ?? 'Concurrent result DEMO',
      },
    });
  const complete = () =>
    fixture.call(`/tasks/${context.taskId}/complete`, {
      method: 'POST',
      body: { expectedVersion: 1 },
    });
  const counts = async () =>
    (
      await fixture.pool.query(
        'SELECT (SELECT count(*)::int FROM task_result_declarations) AS declarations,(SELECT count(*)::int FROM task_result_events) AS events,(SELECT count(*)::int FROM task_result_commands) AS commands',
      )
    ).rows;

  it('gives simultaneous exact requests one material result and one stable receipt', async () => {
    const responses = await Promise.all([submit(), submit()]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(await responses[0]?.json()).toEqual(await responses[1]?.json());
    expect(await counts()).toEqual([
      { declarations: 1, events: 1, commands: 1 },
    ]);
    expect(
      await json(await fixture.call(`/tasks/${context.taskId}/results`)),
    ).toMatchObject({ revision: 1, taskVersion: 1 });
  });

  it('permits at most one of two different corrections against one observed result revision', async () => {
    expect((await submit()).status).toBe(201);
    const correction = (declaration: string) =>
      fixture.call(`/tasks/${context.taskId}/results/corrections`, {
        method: 'POST',
        key: `correct-${declaration}`,
        body: {
          expectedTaskVersion: 1,
          expectedResultRevision: 1,
          documentId: context.documentId,
          versionId: context.versionId,
          declaration,
          reason: 'Concurrent declared correction',
        },
      });
    const responses = await Promise.all([
      correction('First outcome DEMO'),
      correction('Second outcome DEMO'),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const winner = responses.find((response) => response.status === 201);
    if (!winner) throw new Error('Expected exactly one material correction.');
    const receipt = await json(winner);
    expect(
      await json(await fixture.call(`/tasks/${context.taskId}/results`)),
    ).toMatchObject({ revision: 2, current: { id: text(receipt.resultId) } });
    expect(await counts()).toEqual([
      { declarations: 2, events: 2, commands: 2 },
    ]);
  });

  it.each(['result-first', 'instructions-first'])(
    'serializes ordinary instructions and independent results at the native Task row: %s',
    async (order) => {
      const description = 'Literal concurrent instructions\r\n  Ș / Я / 😀';
      const edit = () =>
        fixture.call(`/tasks/${context.taskId}`, {
          method: 'PATCH',
          key: 'concurrent-instructions',
          body: { expectedVersion: 1, description },
        });
      const gate = await hold('task');
      let pendingRecord: Promise<Response> | undefined;
      let pendingEdit: Promise<Response> | undefined;
      try {
        if (order === 'result-first') {
          pendingRecord = submit();
          const pid = await blockedBy(gate.pid);
          pendingEdit = edit();
          await blockedBy(pid);
        } else {
          pendingEdit = edit();
          const pid = await blockedBy(gate.pid);
          pendingRecord = submit();
          await blockedBy(pid);
        }
        await gate.release();
        if (!pendingEdit || !pendingRecord)
          throw new Error('Expected both native commands.');
        expect((await pendingEdit).status).toBe(200);
        expect((await pendingRecord).status).toBe(
          order === 'result-first' ? 201 : 409,
        );
        const task = await json(await fixture.call(`/tasks/${context.taskId}`));
        expect(task).toMatchObject({ task: { version: 2, description } });
        const result = await json(
          await fixture.call(`/tasks/${context.taskId}/results`),
        );
        expect(result).toMatchObject({
          taskVersion: 2,
          revision: order === 'result-first' ? 1 : 0,
        });
        expect(JSON.stringify(result)).not.toContain(
          'Literal concurrent instructions',
        );
        expect(await counts()).toEqual([
          {
            declarations: order === 'result-first' ? 1 : 0,
            events: order === 'result-first' ? 1 : 0,
            commands: order === 'result-first' ? 1 : 0,
          },
        ]);
      } finally {
        await gate.release();
        await pendingRecord?.catch(() => undefined);
        await pendingEdit?.catch(() => undefined);
      }
    },
  );

  it.each(['record-first', 'complete-first'])(
    'serializes Task completion with a result at the owning Task row: %s',
    async (order) => {
      const gate = await hold('task');
      let pendingRecord: Promise<Response> | undefined;
      let pendingComplete: Promise<Response> | undefined;
      try {
        if (order === 'record-first') {
          pendingRecord = submit();
          const recordPid = await blockedBy(gate.pid);
          pendingComplete = complete();
          await blockedBy(recordPid);
        } else {
          pendingComplete = complete();
          const completePid = await blockedBy(gate.pid);
          pendingRecord = submit();
          await blockedBy(completePid);
        }
        await gate.release();
        if (!pendingRecord || !pendingComplete)
          throw new Error('Expected both public commands.');
        expect((await pendingComplete).status).toBe(201);
        expect((await pendingRecord).status).toBe(
          order === 'record-first' ? 201 : 409,
        );
        expect(await counts()).toEqual([
          {
            declarations: order === 'record-first' ? 1 : 0,
            events: order === 'record-first' ? 1 : 0,
            commands: order === 'record-first' ? 1 : 0,
          },
        ]);
        expect(
          await json(await fixture.call(`/tasks/${context.taskId}/results`)),
        ).toMatchObject({
          mutable: false,
          taskVersion: 2,
          revision: order === 'record-first' ? 1 : 0,
        });
      } finally {
        await gate.release();
        await pendingRecord?.catch(() => undefined);
        await pendingComplete?.catch(() => undefined);
      }
    },
  );

  it.each([
    {
      path: '/company-task-result-recorder-assignments',
      denied: 403,
      read: 200,
    },
    {
      path: '/company-mission-deliverable-access-assignments',
      denied: 404,
      read: 404,
    },
    {
      path: '/company-document-content-reader-assignments',
      denied: 404,
      read: 404,
    },
    { path: '/company-task-manager-assignments', denied: 403, read: 403 },
  ])(
    'fences a new material write against successful $path revocation',
    async ({ path, denied, read }) => {
      await fixture.pool.query(
        'CREATE FUNCTION task_result_test_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(834); RETURN NEW; END $$',
      );
      await fixture.pool.query(
        'CREATE TRIGGER task_result_test_gate BEFORE INSERT ON task_result_declarations FOR EACH ROW EXECUTE FUNCTION task_result_test_gate()',
      );
      const gate = await hold('insert');
      let pendingRecord: Promise<Response> | undefined;
      let pendingRevoke: Promise<Response> | undefined;
      try {
        pendingRecord = submit();
        const recordPid = await blockedBy(gate.pid);
        pendingRevoke = fixture.call(
          `${path}/${context.membershipId}/${context.companyId}`,
          { method: 'DELETE', company: null },
        );
        await blockedBy(recordPid);
        await gate.release();
        expect((await pendingRecord).status).toBe(201);
        expect((await pendingRevoke).status).toBe(200);
        expect(await counts()).toEqual([
          { declarations: 1, events: 1, commands: 1 },
        ]);
        expect((await submit()).status).toBe(denied);
        expect(
          (await fixture.call(`/tasks/${context.taskId}/results`)).status,
        ).toBe(read);
      } finally {
        await gate.release();
        await pendingRecord?.catch(() => undefined);
        await pendingRevoke?.catch(() => undefined);
        await fixture.pool.query(
          'DROP FUNCTION task_result_test_gate() CASCADE',
        );
      }
    },
  );

  it.each([
    'task_result_declarations',
    'task_result_events',
    'task_result_commands',
  ])(
    'rolls all result state, history, receipt and Client fence back on %s persistence failure',
    async (table) => {
      const before = await fixture.pool.query(
        'SELECT id,version,updated_at FROM client_accounts ORDER BY id',
      );
      await fixture.pool.query(
        "CREATE FUNCTION fail_task_result_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic Task result write failure' USING ERRCODE='23514'; END $$",
      );
      // These three literal test-owned table names are the complete DDL allowlist.
      await fixture.pool.query(
        `CREATE TRIGGER fail_task_result_write BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_task_result_write()`,
      );
      try {
        expect((await submit()).status).toBe(500);
      } finally {
        await fixture.pool.query(
          'DROP FUNCTION fail_task_result_write() CASCADE',
        );
      }
      expect(await counts()).toEqual([
        { declarations: 0, events: 0, commands: 0 },
      ]);
      expect(
        (
          await fixture.pool.query(
            'SELECT id,version,updated_at FROM client_accounts ORDER BY id',
          )
        ).rows,
      ).toEqual(before.rows);
      expect(
        await json(await fixture.call(`/tasks/${context.taskId}/results`)),
      ).toMatchObject({ revision: 0, current: null, taskVersion: 1 });
      expect((await submit()).status).toBe(201);
      expect(await counts()).toEqual([
        { declarations: 1, events: 1, commands: 1 },
      ]);
    },
  );

  async function hold(kind: 'task' | 'insert') {
    const connection = await fixture.pool.connect();
    try {
      await connection.query('BEGIN');
      const response = await connection.query('SELECT pg_backend_pid() AS pid');
      const pid = integer(record(response.rows[0]).pid);
      if (kind === 'task')
        await connection.query('SELECT id FROM tasks WHERE id=$1 FOR UPDATE', [
          context.taskId,
        ]);
      else await connection.query('SELECT pg_advisory_xact_lock(834)');
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
      };
    } catch (error) {
      try {
        await connection.query('ROLLBACK');
      } finally {
        connection.release();
      }
      throw error;
    }
  }
  async function blockedBy(pid: number): Promise<number> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const waiting = await fixture.pool.query(
        'SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid)) LIMIT 1',
        [pid],
      );
      const row = waiting.rows[0];
      if (row !== undefined) return integer(record(row).pid);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      'The public command did not reach the expected PostgreSQL gate.',
    );
  }
});
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1)
    throw new Error('Expected a PostgreSQL session identity.');
  return value;
}
