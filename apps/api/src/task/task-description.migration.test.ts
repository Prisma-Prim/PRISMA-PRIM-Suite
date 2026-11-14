import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import {
  applyHistoricalTaskTarget,
  restoreFrozenTaskSetup,
} from './frozen-task-migration.test-support.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'adds the description to the exact0086 manual/copied/closed/grouped/result facts without rewriting them, then refuses to migrate their pre-description receipts further',
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
      await restoreFrozenTaskSetup(fixture.pool, 'task-description');
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
      await applyHistoricalTaskTarget({
        pool: f.pool,
        previous,
        journal,
        entries,
        index,
      });
      expect(await snapshot()).toEqual(before);
      expect(
        (
          await f.pool.query(
            'SELECT count(*)::int count FROM tasks WHERE description IS NOT NULL',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      const [task] = (
        await f.pool.query<{ id: string }>('SELECT id FROM tasks LIMIT 1')
      ).rows;
      if (!task) throw new Error('A frozen Task is required.');
      const constraints = ['', ' ', '﻿X', 'X ', '😀'.repeat(2001)];
      for (const value of constraints)
        await expect(
          f.pool.query('UPDATE tasks SET description=$2 WHERE id=$1', [
            task.id,
            value,
          ]),
        ).rejects.toMatchObject({ code: '23514' });
      for (const hex of ['00', 'eda080', 'edbfbf'])
        await expect(
          f.pool.query(
            "UPDATE tasks SET description=convert_from(decode($2,'hex'),'UTF8') WHERE id=$1",
            [task.id, hex],
          ),
        ).rejects.toMatchObject({ code: '22021' });
      const repeat = await snapshot();
      await migrate(drizzle(f.pool), { migrationsFolder: previous });
      expect(await snapshot()).toEqual(repeat);
      const migration = await readFile(
        'drizzle/0087_task_description.sql',
        'utf8',
      );
      expect(migration).not.toMatch(/\b(?:DROP|DELETE|UPDATE|INSERT)\b/iu);
      // These genuine receipts and creations predate descriptions: migration
      // 0116 refuses them (#1348) and the upgrade proof stops here (#1343 A6).
      let refusal: unknown = await migrate(drizzle(f.pool), {
        migrationsFolder: resolve('drizzle'),
      }).then(
        () => undefined,
        (error: unknown) => error,
      );
      while (refusal instanceof Error && !('code' in refusal))
        refusal = refusal.cause;
      expect(refusal).toMatchObject({
        code: 'P0001',
        message:
          'task_commands holds a Task receipt recorded before Task descriptions; the development database must be recreated.',
      });
      expect(await snapshot()).toEqual(repeat);
    } finally {
      await fixture?.close();
      await rm(previous, { recursive: true, force: true });
    }
  },
  60_000,
);
