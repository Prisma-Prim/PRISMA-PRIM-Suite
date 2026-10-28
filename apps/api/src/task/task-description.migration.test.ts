import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import { restoreFrozenTaskSetup } from './frozen-task-migration.test-support.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades the exact0086 manual/copied/closed/grouped/result/PDF/source/grant facts without rewriting historical absence',
  async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('Disposable PostgreSQL is required.');
    const journal = record(
      JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
    );
    if (!Array.isArray(journal.entries))
      throw new Error('Invalid migration journal.');
    const entries: unknown[] = journal.entries;
    const index = entries.findIndex(
      (entry) => record(entry).tag === '0087_task_description',
    );
    expect(index).toBe(87);
    expect(record(entries[index - 1]).tag).toBe('0086_company_mission_plans');
    const previous = await mkdtemp(join(tmpdir(), 'task-description-upgrade-'));
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
      const frozen = await restoreFrozenTaskSetup(
        fixture.pool,
        'task-description',
      );
      const raw = record(frozen.context);
      const context = {
        companyId: text(raw.companyId),
        membershipId: text(raw.membershipId),
        clientId: text(raw.clientId),
        projectId: text(raw.projectId),
        taskId: text(raw.taskId),
        documentId: text(raw.documentId),
        versionId: text(raw.versionId),
      };
      await fixture.resumeFrozenContext(context);
      const f = fixture;
      expect(
        (
          await f.pool.query(
            "SELECT column_name FROM information_schema.columns WHERE table_name='tasks' AND column_name='description'",
          )
        ).rows,
      ).toEqual([]);
      const tables = (
        await f.pool.query<{ name: string }>(
          "SELECT table_name name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
        )
      ).rows.map((row) => row.name);
      async function snapshot() {
        const data: Record<string, string[]> = {};
        for (const table of tables) {
          if (!/^[a-z_]+$/.test(table))
            throw new Error('Invalid historical table.');
          data[table] = (
            await f.pool.query<{ row: string }>(
              `SELECT (to_jsonb(t) ${table === 'tasks' ? "- 'description'" : ''})::text row FROM "${table}" t ORDER BY to_jsonb(t)::text`,
            )
          ).rows.map((row) => row.row);
        }
        return data;
      }
      const before = await snapshot();
      expect(before.tasks?.length).toBeGreaterThan(18);
      expect(before.task_commands?.length).toBeGreaterThan(5);
      expect(before.task_result_declarations).toHaveLength(1);
      expect(before.document_pdfs).toHaveLength(1);
      expect(before.mission_plan_task_copies).toHaveLength(1);
      const pdf = `/documents/${context.documentId}/versions/${context.versionId}/content`;
      const downloadBefore = await f.call(pdf);
      expect(downloadBefore.status).toBe(200);
      const pdfHash = createHash('sha256')
        .update(Buffer.from(await downloadBefore.arrayBuffer()))
        .digest('hex');
      // GET synchronizes the external profile timestamp; migration comparison begins after that explicit read.
      const prior = await snapshot();
      await migrate(drizzle(f.pool), { migrationsFolder: resolve('drizzle') });
      expect(await snapshot()).toEqual(prior);
      expect(
        (
          await f.pool.query(
            'SELECT count(*)::int count FROM tasks WHERE description IS NOT NULL',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (await json(await f.call(`/tasks/${context.taskId}`))).task,
      ).toMatchObject({ description: null, version: 2 });
      const history = await json(
        await f.call(`/tasks/${context.taskId}/history`),
      );
      if (!Array.isArray(history.events))
        throw new Error('Expected native history.');
      expect(
        record(record(record(history.events[0]).metadata).initial),
      ).not.toHaveProperty('description');
      const groupedPath = `/projects/${context.projectId}/tasks/planning`;
      const replay = await f.call(groupedPath, {
        method: 'POST',
        key: 'old-group-command',
        body: frozen.groupBody,
      });
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(frozen.groupReceipt);
      const changed = await f.call(`/tasks/${context.taskId}`, {
        method: 'PATCH',
        key: 'new-description',
        body: {
          expectedVersion: 2,
          description: 'New instructions\r\n  Ș / Я / 😀',
        },
      });
      expect(changed.status).toBe(200);
      expect((await json(changed)).description).toBe(
        'New instructions\r\n  Ș / Я / 😀',
      );
      const oldAgain = await f.call(groupedPath, {
        method: 'POST',
        key: 'old-group-command',
        body: frozen.groupBody,
      });
      expect(await oldAgain.json()).toEqual(frozen.groupReceipt);
      const resultReplay = await f.call(`/tasks/${context.taskId}/results`, {
        method: 'POST',
        key: 'preserved-result',
        body: frozen.resultIntent,
      });
      expect(resultReplay.status).toBe(201);
      expect(await resultReplay.json()).toEqual(frozen.resultReceipt);
      const downloadAfter = await f.call(pdf);
      expect(downloadAfter.status).toBe(200);
      expect(
        createHash('sha256')
          .update(Buffer.from(await downloadAfter.arrayBuffer()))
          .digest('hex'),
      ).toBe(pdfHash);
      const constraints = ['', ' ', '\ufeffX', 'X\u202f', '😀'.repeat(2001)];
      for (const value of constraints)
        await expect(
          f.pool.query('UPDATE tasks SET description=$2 WHERE id=$1', [
            context.taskId,
            value,
          ]),
        ).rejects.toMatchObject({ code: '23514' });
      for (const hex of ['00', 'eda080', 'edbfbf'])
        await expect(
          f.pool.query(
            "UPDATE tasks SET description=convert_from(decode($2,'hex'),'UTF8') WHERE id=$1",
            [context.taskId, hex],
          ),
        ).rejects.toMatchObject({ code: '22021' });
      const current = await json(await f.call(`/tasks/${context.taskId}`));
      await f.pool.query('UPDATE tasks SET title=title WHERE id=$1', [
        context.taskId,
      ]);
      expect(await json(await f.call(`/tasks/${context.taskId}`))).toEqual(
        current,
      );
      const repeat = await snapshot();
      await migrate(drizzle(f.pool), { migrationsFolder: resolve('drizzle') });
      expect(await snapshot()).toEqual(repeat);
      const migration = await readFile(
        'drizzle/0087_task_description.sql',
        'utf8',
      );
      expect(migration).not.toMatch(/\b(?:DROP|DELETE|UPDATE|INSERT)\b/iu);
    } finally {
      await fixture?.close();
      await rm(previous, { recursive: true, force: true });
    }
  },
  60_000,
);
