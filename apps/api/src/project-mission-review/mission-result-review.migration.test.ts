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
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades genuine previous-schema source/Tasks/results and old roles without enrollment, then preserves review receipts across repeat upgrade and two API restarts',
  async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('TEST_DATABASE_URL required');
    const journal = record(
      JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
    );
    if (!Array.isArray(journal.entries)) throw new Error('Invalid journal');
    const entries: unknown[] = journal.entries;
    const index = entries.findIndex(
      (entry) => record(entry).tag === '0085_mission_result_reviews',
    );
    expect(index).toBeGreaterThan(0);
    const previous = await mkdtemp(join(tmpdir(), 'mission-review-upgrade-'));
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
          throw new Error('Invalid migration tag');
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      }
      fixture = await createMissionDocumentFixture(url, previous);
      const frozen = await restoreFrozenTaskSetup(
        fixture.pool,
        'mission-result-review',
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
      const pool = fixture.pool;
      const conserved = async () => {
        const values: unknown[] = [];
        for (const table of [
          'projects',
          'tasks',
          'task_commands',
          'task_events',
          'project_template_instances',
          'project_template_task_copies',
          'task_result_declarations',
          'task_result_commands',
          'task_result_events',
          'working_documents',
          'document_versions',
          'document_pdfs',
          'company_role_assignments',
          'client_accounts',
          'activity_log_events',
        ])
          values.push(
            (
              await pool.query(
                `SELECT (to_jsonb(t) ${table === 'tasks' ? "- 'description'" : ''}) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`,
              )
            ).rows,
          );
        return values;
      };
      const before = await conserved();
      expect(
        (
          await pool.query(
            "SELECT to_regclass('mission_result_review_batches') AS relation",
          )
        ).rows,
      ).toEqual([{ relation: null }]);
      await applyHistoricalTaskTarget({
        pool: pool,
        previous,
        journal,
        entries,
        index,
      });
      expect(await conserved()).toEqual(before);
      await migrate(drizzle(pool), { migrationsFolder: resolve('drizzle') });
      await migrate(drizzle(pool), { migrationsFolder: resolve('drizzle') });
      expect(await conserved()).toEqual(before);
      expect(
        (
          await fixture.call(context.path, {
            method: 'POST',
            body: context.body,
          })
        ).status,
      ).toBe(403);
      expect(
        record((await json(await fixture.call(context.path))).review).revision,
      ).toBe(0);
      await fixture.grant('/company-mission-result-reviewer-assignments');
      const first = await fixture.call(context.path, {
        method: 'POST',
        key: 'persistent-review-demo',
        body: context.body,
      });
      expect(first.status).toBe(201);
      const receipt = await first.json();
      const review = await json(await fixture.call(context.path));
      for (let restart = 0; restart < 2; restart++) {
        await fixture.restart();
        expect(await json(await fixture.call(context.path))).toEqual(review);
        expect(
          await json(
            await fixture.call(context.path, {
              method: 'POST',
              key: 'persistent-review-demo',
              body: context.body,
            }),
          ),
        ).toEqual(receipt);
      }
    } finally {
      await fixture?.close();
      await rm(previous, { recursive: true, force: true });
    }
  },
  60_000,
);
