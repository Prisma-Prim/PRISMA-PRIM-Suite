import {
  restoreFrozenTaskSetup,
  applyHistoricalTaskTarget,
} from '../task/frozen-task-migration.test-support.js';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  PDF_A,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades genuine pre-result Tasks/receipts and frozen mission PDFs without rewriting history or granting Recorder',
  async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('TEST_DATABASE_URL is required.');
    const journal = record(
      JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
    );
    if (!Array.isArray(journal.entries))
      throw new Error('Invalid migration journal.');
    const entries = journal.entries;
    const index = entries.findIndex(
      (entry) => record(entry).tag === '0076_task_results',
    );
    expect(index).toBeGreaterThan(0);
    const previous = await mkdtemp(join(tmpdir(), 'task-results-upgrade-'));
    let fixture: MissionDocumentFixture | undefined;
    try {
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries: entries.slice(0, index) }),
      );
      for (const entry of entries.slice(0, index)) {
        const tag = text(record(entry).tag);
        if (!/^\d{4}_[a-z0-9_-]+$/u.test(tag))
          throw new Error('Invalid migration tag.');
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      }
      fixture = await createMissionDocumentFixture(url, previous);
      const frozen = await restoreFrozenTaskSetup(fixture.pool, 'task-results');
      const rawContext = record(frozen.context);
      const context = {
        companyId: text(rawContext.companyId),
        membershipId: text(rawContext.membershipId),
        clientId: text(rawContext.clientId),
        projectId: text(rawContext.projectId),
        taskId: text(rawContext.taskId),
        documentId: text(rawContext.documentId),
        versionId: text(rawContext.versionId),
      };
      await fixture.resumeFrozenContext(context);
      const completeBody = frozen.completeBody,
        priorReceipt = frozen.priorReceipt,
        taskBefore = record(frozen.taskBefore),
        historyBefore = frozen.historyBefore;
      const { pool } = fixture;
      const tables = [
        'tasks',
        'task_commands',
        'task_events',
        'projects',
        'project_creation_events',
        'working_documents',
        'document_versions',
        'document_pdfs',
        'document_version_commands',
        'document_project_events',
        'company_role_assignments',
      ];
      const snapshot = async () => {
        const rows: unknown[] = [];
        // Fixed test-owned table names; snapshots prove upgrade identity, not business behavior.
        for (const table of tables)
          rows.push(
            (
              await pool.query(
                `SELECT (to_jsonb(t) ${table === 'tasks' ? "- 'description'" : ''}) AS row FROM ${table} t ORDER BY id`,
              )
            ).rows,
          );
        return rows;
      };
      const before = await snapshot();
      await applyHistoricalTaskTarget({
        pool: pool,
        previous,
        journal,
        entries,
        index,
      });
      expect(await snapshot()).toEqual(before);
      await migrate(drizzle(pool), { migrationsFolder: resolve('drizzle') });
      expect(
        await json(await fixture.call(`/tasks/${context.taskId}`)),
      ).toEqual({
        ...taskBefore,
        task: { ...record(taskBefore.task), description: null },
      });
      expect(
        await json(await fixture.call(`/tasks/${context.taskId}/history`)),
      ).toEqual(historyBefore);
      const replay = await fixture.call(`/tasks/${context.taskId}/complete`, {
        method: 'POST',
        key: 'pre-upgrade-completion',
        body: completeBody,
      });
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(priorReceipt);
      expect(
        await json(await fixture.call(`/tasks/${context.taskId}`)),
      ).toMatchObject({ task: { version: 3, status: 'todo' } });
      const download = await fixture.call(
        `/documents/${context.documentId}/versions/${context.versionId}/content`,
      );
      expect(download.status).toBe(200);
      expect(Buffer.from(await download.arrayBuffer())).toEqual(PDF_A);
      const actor = record(
        (await json(await fixture.call('/access/current-actor'))).activeCompany,
      );
      expect(actor.taskResultPermissions).toBeUndefined();
      expect(actor.taskResultRecorderAssignmentId).toBeUndefined();
      const body = {
        expectedTaskVersion: 3,
        expectedResultRevision: 0,
        documentId: context.documentId,
        versionId: context.versionId,
        declaration: 'Explicit post-upgrade result DEMO',
      };
      expect(
        (
          await fixture.call(`/tasks/${context.taskId}/results`, {
            method: 'POST',
            body,
          })
        ).status,
      ).toBe(403);
      expect(
        await json(await fixture.call(`/tasks/${context.taskId}/results`)),
      ).toMatchObject({ revision: 0, current: null });
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS count FROM task_result_declarations',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      await fixture.grant('/company-task-result-recorder-assignments');
      const recorded = await fixture.call(`/tasks/${context.taskId}/results`, {
        method: 'POST',
        body,
      });
      expect(recorded.status).toBe(201);
      expect(
        await json(await fixture.call(`/tasks/${context.taskId}`)),
      ).toEqual({
        ...taskBefore,
        task: { ...record(taskBefore.task), description: null },
      });
      expect(
        await json(await fixture.call(`/tasks/${context.taskId}/history`)),
      ).toEqual(historyBefore);
    } finally {
      try {
        await fixture?.close();
      } finally {
        await rm(previous, { recursive: true, force: true });
      }
    }
  },
);
