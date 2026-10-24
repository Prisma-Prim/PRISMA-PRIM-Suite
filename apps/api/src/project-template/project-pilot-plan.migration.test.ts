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
import { prepareTaskResult } from '../task/task-results.test-support.js';
import {
  objects,
  pilotKey,
  legacyKey,
} from './project-pilot-plan.test-support.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades genuine 0076 data with captured v1, advanced four-Task plan and frozen declared result unchanged; bounds the new pilot independently',
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
      const context = await prepareTaskResult(fixture),
        f = fixture;
      await f.grant('/company-task-result-recorder-assignments');
      const resultIntent = {
        expectedTaskVersion: 1,
        expectedResultRevision: 0,
        documentId: context.documentId,
        versionId: context.versionId,
        declaration: 'Preserved delivered output DEMO',
      };
      const result = await f.call(`/tasks/${context.taskId}/results`, {
        method: 'POST',
        key: 'preserved-result',
        body: resultIntent,
      });
      expect(result.status).toBe(201);
      const resultReceipt = await json(result);
      const actor = await json(await f.call('/access/current-actor')),
        workspaceId = text(actor.workspaceId);
      await f.pool.query(
        "INSERT INTO company_role_assignments(workspace_id,company_id,workspace_membership_id,bundle,permission_set_version) VALUES($1,$2,$3,'company_project_template_user','v1')",
        [workspaceId, context.companyId, context.membershipId],
      );
      async function read(path: string) {
        const response = await f.call(path);
        expect(response.status).toBe(200);
        return json(response);
      }
      async function command(path: string, body: unknown, key?: string) {
        const response = await f.call(path, { method: 'POST', body, key });
        expect(response.status).toBe(201);
        return json(response);
      }
      const intent = {
        title: 'Preserved legacy Project DEMO',
        clientAccountId: context.clientId,
        templateKey: legacyKey,
        templateVersion: 1,
      };
      const project = await command(
          '/projects/from-template',
          intent,
          'preserved-legacy',
        ),
        projectId = text(project.id);
      const progress = record(
        (await read(`/projects/${projectId}/stage-progress`)).progress,
      );
      for (const row of objects(progress.requiredTasks))
        await command(`/tasks/${text(row.taskId)}/complete`, {
          expectedVersion: 1,
        });
      await f.grant('/company-project-stage-advancer-assignments');
      const stageIntent = {
        expectedStageRevision: 0,
        expectedStageKey: 'scoping',
        targetStageKey: 'preparation',
      };
      const stageReceipt = await command(
        `/projects/${projectId}/stage-advance`,
        stageIntent,
        'preserved-stage',
      );
      const sourceBefore = await read(`/projects/${projectId}/template`),
        stageBefore = await read(`/projects/${projectId}/stage-progress`),
        resultBefore = await read(`/tasks/${context.taskId}/results/history`);
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
              `SELECT to_jsonb(preserved)::text row FROM "${table}" preserved`,
            )
          ).rows
            .map((row) => row.row)
            .sort();
        }
        return rows;
      }
      const before = await snapshot();
      await migrate(drizzle(f.pool), { migrationsFolder: resolve('drizzle') });
      expect(await snapshot()).toEqual(before);
      expect(await read(`/projects/${projectId}/template`)).toEqual(
        sourceBefore,
      );
      expect(await read(`/projects/${projectId}/stage-progress`)).toEqual(
        stageBefore,
      );
      expect(await read(`/tasks/${context.taskId}/results/history`)).toEqual(
        resultBefore,
      );
      expect(
        await command('/projects/from-template', intent, 'preserved-legacy'),
      ).toEqual(project);
      expect(
        await command(
          `/projects/${projectId}/stage-advance`,
          stageIntent,
          'preserved-stage',
        ),
      ).toEqual(stageReceipt);
      expect(
        await command(
          `/tasks/${context.taskId}/results`,
          resultIntent,
          'preserved-result',
        ),
      ).toEqual(resultReceipt);
      const captured = record(
        (await read('/access/current-actor')).activeCompany,
      );
      expect(captured.projectTemplatePermissionSetVersion).toBe('v1');
      expect(captured.projectTemplatePermissions).toEqual([
        'project.template.read',
        'project.template.instantiate',
      ]);
      expect(
        (await f.call(`/project-templates?templateKey=${pilotKey}`)).status,
      ).toBe(403);
      const fifth = await command(`/projects/${projectId}/tasks`, {
        title: 'Independent fifth ordinary Task DEMO',
      });
      await expect(
        f.pool.query(
          'INSERT INTO project_template_task_copies(workspace_id,company_id,project_id,task_id,position) VALUES($1,$2,$3,$4,4)',
          [workspaceId, context.companyId, projectId, text(fifth.id)],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      expect(
        (
          await f.call(
            `/company-project-template-user-assignments/${context.membershipId}/${context.companyId}`,
            { method: 'DELETE' },
          )
        ).status,
      ).toBe(200);
      expect(
        (await f.grant('/company-project-template-user-assignments'))
          .permissionSetVersion,
      ).toBe('v2');
      const pilot = await command('/projects/from-template', {
          ...intent,
          title: 'New pilot DEMO',
          templateKey: pilotKey,
        }),
        pilotId = text(pilot.id);
      expect(
        objects(
          record((await read(`/projects/${pilotId}/template`)).template)
            .activities,
        ),
      ).toHaveLength(13);
      await expect(
        f.pool.query(
          "UPDATE project_template_instances SET stage_revision=1,current_stage_key='preparation' WHERE project_id=$1",
          [pilotId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      const extra = await command(`/projects/${pilotId}/tasks`, {
        title: 'Independent fourteenth Task DEMO',
      });
      await expect(
        f.pool.query(
          'INSERT INTO project_template_task_copies(workspace_id,company_id,project_id,task_id,position) VALUES($1,$2,$3,$4,13)',
          [workspaceId, context.companyId, pilotId, text(extra.id)],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        f.pool.query(
          "UPDATE project_template_instances SET snapshot='{}' WHERE project_id=$1",
          [pilotId],
        ),
      ).rejects.toBeDefined();
      await expect(
        f.pool.query(
          'DELETE FROM project_template_task_copies WHERE project_id=$1',
          [pilotId],
        ),
      ).rejects.toBeDefined();
      await expect(
        f.pool.query(
          "UPDATE company_role_assignments SET permission_set_version='v3' WHERE bundle='company_project_template_user' AND revoked_at IS NULL",
        ),
      ).rejects.toMatchObject({ code: '23514' });
      const beforeRepeat = await snapshot();
      await migrate(drizzle(f.pool), { migrationsFolder: resolve('drizzle') });
      expect(await snapshot()).toEqual(beforeRepeat);
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
