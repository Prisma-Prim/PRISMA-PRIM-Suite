import {
  restoreFrozenTaskSetup,
  applyHistoricalTaskTarget,
} from '../task/frozen-task-migration.test-support.js';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'applies the pilot plan migration to genuine 0076 data with captured v1, advanced four-Task plan and frozen declared result unchanged and bounds the copied plan',
  async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('TEST_DATABASE_URL required');
    const journal = record(
      JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
    );
    if (!Array.isArray(journal.entries)) throw new Error('Invalid journal');
    const entries: unknown[] = journal.entries,
      index = entries.findIndex(
        (entry) => record(entry).tag === '0077_pilot_activity_plan',
      );
    expect(text(record(entries[index - 1]).tag)).toBe('0076_task_results');
    const previous = await mkdtemp(join(tmpdir(), 'pilot-upgrade-'));
    let fixture: MissionDocumentFixture | undefined;
    try {
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries: entries.slice(0, index) }),
      );
      for (const entry of entries.slice(0, index)) {
        const tag = text(record(entry).tag);
        if (!/^\d{4}_[a-z0-9_-]+$/u.test(tag)) throw new Error('Invalid tag');
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      }
      fixture = await createMissionDocumentFixture(url, previous);
      const frozen = await restoreFrozenTaskSetup(
        fixture.pool,
        'project-pilot-plan',
      );
      const rawContext = record(frozen.context);
      const context = {
        companyId: text(rawContext.companyId),
        membershipId: text(rawContext.membershipId),
        clientId: text(rawContext.clientId),
        projectId: text(rawContext.projectId),
        taskId: text(rawContext.taskId),
        documentId: text(rawContext.documentId ?? frozen.documentId),
        versionId: text(rawContext.versionId ?? frozen.versionId),
        path: text(rawContext.path ?? '/unused'),
        body: rawContext.body,
      };
      await fixture.resumeFrozenContext(context);
      const f = fixture,
        projectId = text(frozen.projectId);
      // Test-owned table inventory proves row preservation across the actual upgrade.
      const tables = (
        await f.pool.query<{ name: string }>(
          "SELECT table_name name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
        )
      ).rows.map((row) => row.name);
      async function snapshot() {
        const rows: Record<string, string[]> = {};
        for (const table of tables) {
          if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table name');
          rows[table] = (
            await f.pool.query<{ row: string }>(
              `SELECT (to_jsonb(preserved) ${table === 'tasks' ? "- 'description'" : ''})::text row FROM "${table}" preserved`,
            )
          ).rows
            .map((row) => row.row)
            .sort();
        }
        return rows;
      }
      const before = await snapshot();
      await applyHistoricalTaskTarget({
        pool: f.pool,
        previous,
        journal,
        entries,
        index,
      });
      expect(await snapshot()).toEqual(before);
      // Migration 0116 refuses these pre-description receipts (#1348), so the
      // upgrade proof stops at its own migration (#1343 A6).
      // Historical bounds protect modifications as well as new links.
      for (const position of [4, 12])
        await expect(
          f.pool.query(
            'UPDATE project_template_task_copies SET position=$1 WHERE project_id=$2 AND position=3',
            [position, projectId],
          ),
        ).rejects.toMatchObject({ code: '23514' });
    } finally {
      try {
        await fixture?.close();
      } finally {
        await rm(previous, { recursive: true, force: true });
      }
    }
  },
  60_000,
);
