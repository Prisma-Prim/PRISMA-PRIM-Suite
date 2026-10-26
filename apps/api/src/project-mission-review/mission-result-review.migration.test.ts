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
import { preserveFrozenResultDocument } from '../task/task-results.test-support.js';
import { prepareMissionReview } from './mission-result-review.test-support.js';

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
      const context = await prepareMissionReview(fixture, false);
      for (const route of [
        '/company-task-result-recorder-assignments',
        '/company-document-content-uploader-assignments',
        '/company-document-approver-assignments',
        '/company-document-project-organizer-assignments',
      ])
        await fixture.grant(route);
      const { documentId, versionId } = await preserveFrozenResultDocument({
        fixture,
        registration: {
          type: 'mission-deliverable',
          clientId: context.clientId,
          title: 'Pre-upgrade exact result DEMO',
          purpose: 'Preserve genuine old evidence',
        },
      });
      expect(
        (
          await fixture.call(`/documents/${documentId}/project-association`, {
            method: 'POST',
            body: {
              action: 'link',
              projectId: context.projectId,
              expectedRevision: 0,
            },
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await fixture.call(`/tasks/${context.taskId}/reopen`, {
            method: 'POST',
            body: { expectedVersion: 2 },
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await fixture.call(`/tasks/${context.taskId}/results`, {
            method: 'POST',
            body: {
              expectedTaskVersion: 3,
              expectedResultRevision: 0,
              documentId,
              versionId,
              declaration: 'Genuine pre-review declaration DEMO',
            },
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await fixture.call(`/tasks/${context.taskId}/complete`, {
            method: 'POST',
            body: { expectedVersion: 3 },
          })
        ).status,
      ).toBe(201);
      context.body.items = context.body.items.map((item) => ({
        ...item,
        expectedTaskVersion: 4,
        expectedResultRevision: 1,
      }));
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
                `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`,
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
      await migrate(drizzle(pool), { migrationsFolder: resolve('drizzle') });
      expect(await conserved()).toEqual(before);
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
