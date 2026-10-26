import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PDF_B,
  createMissionDocumentFixture,
  json,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import { expectedPilotActivities } from './project-pilot-plan.test-fixtures.js';
import { preserveFrozenResultDocument } from '../task/task-results.test-support.js';
import { objects, pilotKey } from './project-pilot-plan.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'Diagnostic mission readiness through public REST',
  () => {
    let fixture: MissionDocumentFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await createMissionDocumentFixture(databaseUrl);
    });
    afterAll(async () => fixture?.close());

    async function prepare() {
      const context = await fixture.reset();
      for (const path of [
        '/company-project-assignments',
        '/company-task-manager-assignments',
        '/company-project-template-user-assignments',
      ])
        await fixture.grant(path);
      const response = await fixture.call('/projects/from-template', {
        method: 'POST',
        body: {
          clientAccountId: context.clientId,
          title: 'Readiness DEMO',
          templateKey: pilotKey,
          templateVersion: 1,
        },
      });
      expect(response.status).toBe(201);
      const projectId = text((await json(response)).id);
      const plan = await json(
        await fixture.call(`/projects/${projectId}/template`),
      );
      return {
        ...context,
        projectId,
        plan,
        activities: objects(record(plan.template).activities),
      };
    }

    it('shows every preserved activity and current Task without inferring fulfillment or writing facts', async () => {
      const { projectId, plan, activities } = await prepare();
      const before = await fixture.pool.query(
        'SELECT count(*) FROM activity_log_events',
      );
      const response = await fixture.call(
        `/projects/${projectId}/mission-readiness`,
      );
      expect(response.status).toBe(200);
      const assessment = record((await json(response)).assessment);
      expect(assessment).toMatchObject({
        kind: 'DIAGNOSTIC_ONLY',
        project: { id: projectId, status: 'preparatory' },
        source: { templateKey: pilotKey, version: 1 },
        clarification: {
          state: 'BUSINESS_CLARIFICATION_PENDING',
          questionId: 'MISSION-CLOSE-01',
        },
      });
      const rows = objects(assessment.activities);
      expect(rows).toHaveLength(13);
      for (const [index, row] of rows.entries()) {
        expect(row).toMatchObject({
          ...expectedPilotActivities[index],
          task: { id: activities[index]?.taskId, status: 'todo', version: 1 },
          result: { kind: 'unavailable' },
          state: 'WORK_OPEN',
        });
        expect(row.result).toEqual({ kind: 'unavailable' });
        expect(row).not.toHaveProperty('fulfilled');
      }
      expect(assessment).not.toHaveProperty('canComplete');
      expect(
        await json(await fixture.call(`/projects/${projectId}/template`)),
      ).toEqual(plan);
      expect(
        (await fixture.pool.query('SELECT count(*) FROM activity_log_events'))
          .rows,
      ).toEqual(before.rows);
    });

    it('distinguishes unsupported plans, malformed identifiers and foreign Project scope', async () => {
      const { clientId, projectId } = await prepare();
      const manual = await fixture.call('/projects', {
        method: 'POST',
        body: { clientAccountId: clientId, title: 'Ordinary DEMO' },
      });
      expect(manual.status).toBe(201);
      const id = text((await json(manual)).id);
      const response = await fixture.call(`/projects/${id}/mission-readiness`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ assessment: null });
      const legacy = await fixture.call('/projects/from-template', {
        method: 'POST',
        body: {
          clientAccountId: clientId,
          title: 'Legacy DEMO',
          templateKey: 'CONSULTING_PREPARATION_ILLUSTRATIVE',
          templateVersion: 1,
        },
      });
      expect(legacy.status).toBe(201);
      expect(
        await json(
          await fixture.call(
            `/projects/${text((await json(legacy)).id)}/mission-readiness`,
          ),
        ),
      ).toEqual({ assessment: null });

      expect(
        (await fixture.call('/projects/invalid/mission-readiness')).status,
      ).toBe(400);
      expect(
        (await fixture.call(`/projects/${randomUUID()}/mission-readiness`))
          .status,
      ).toBe(404);
      expect(
        (
          await fixture.call(`/projects/${projectId}/mission-readiness`, {
            company: randomUUID(),
          })
        ).status,
      ).not.toBe(200);
    });
    it('reloads all diagnostic states and redacts denied evidence without losing Task context', async () => {
      const { projectId, clientId, companyId, membershipId, activities, plan } =
        await prepare();
      const [emptyId, cancelledId, recordedId] = activities.map((row) =>
        text(row.taskId),
      );
      if (!emptyId || !cancelledId || !recordedId)
        throw new Error('Expected copied Tasks');
      for (const path of [
        '/company-mission-deliverable-access-assignments',
        '/company-document-content-reader-assignments',
        '/company-document-content-uploader-assignments',
        '/company-document-approver-assignments',
        '/company-document-project-organizer-assignments',
        '/company-task-result-recorder-assignments',
      ])
        await fixture.grant(path);
      const { documentId, versionId } = await preserveFrozenResultDocument({
        fixture,
        registration: {
          type: 'mission-deliverable',
          clientId,
          title: 'Readiness result DEMO',
          purpose: 'Evidence fixture',
        },
      });
      expect(
        (
          await fixture.call(`/documents/${documentId}/project-association`, {
            method: 'POST',
            body: { action: 'link', projectId, expectedRevision: 0 },
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await fixture.call(`/tasks/${recordedId}/results`, {
            method: 'POST',
            body: {
              expectedTaskVersion: 1,
              expectedResultRevision: 0,
              documentId,
              versionId,
              declaration: 'Literal secret evidence DEMO883',
            },
          })
        ).status,
      ).toBe(201);
      for (const taskId of [emptyId, recordedId])
        expect(
          (
            await fixture.call(`/tasks/${taskId}/complete`, {
              method: 'POST',
              body: { expectedVersion: 1 },
            })
          ).status,
        ).toBe(201);
      expect(
        (
          await fixture.call(`/tasks/${cancelledId}/cancel`, {
            method: 'POST',
            body: {
              expectedVersion: 1,
              reason: 'Cancelled work is not fulfillment DEMO',
            },
          })
        ).status,
      ).toBe(201);
      const path = `/projects/${projectId}/mission-readiness`;
      const read = async () => {
        const response = await fixture.call(path);
        expect(response.status).toBe(200);
        return record((await json(response)).assessment);
      };
      const rows = objects((await read()).activities);
      expect(rows.map((row) => row.state)).toEqual([
        'RESULT_NOT_RECORDED',
        'WORK_CANCELLED',
        'RECORDED_RESULT_NOT_REVIEWED',
        ...Array.from({ length: 10 }, () => 'WORK_OPEN'),
      ]);
      expect(rows[0]?.result).toEqual({ kind: 'available', current: null });
      expect(rows[2]?.result).toMatchObject({
        kind: 'available',
        current: {
          declaration: 'Literal secret evidence DEMO883',
          reference: { documentId, versionId },
        },
      });

      const successor = await fixture.call(
        `/documents/${documentId}/versions`,
        { method: 'POST', body: { expectedRevision: 3 } },
      );
      expect(successor.status).toBe(201);
      const successorId = text((await json(successor)).versionId);
      expect(
        (
          await fixture.upload({
            documentId,
            versionId: successorId,
            revision: 4,
            bytes: PDF_B,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await fixture.call(
            `/documents/${documentId}/versions/${successorId}/official-designation`,
            { method: 'POST', body: { expectedRevision: 5 } },
          )
        ).status,
      ).toBe(200);
      expect(objects((await read()).activities)[2]?.result).toMatchObject({
        kind: 'available',
        current: {
          reference: {
            documentId,
            versionId,
            versionNumber: 1,
            status: 'superseded',
          },
        },
      });
      expect(
        (
          await fixture.call(`/tasks/${emptyId}/reopen`, {
            method: 'POST',
            body: { expectedVersion: 2 },
          })
        ).status,
      ).toBe(201);
      expect(objects((await read()).activities)[0]).toMatchObject({
        state: 'WORK_OPEN',
        task: { version: 3, status: 'todo' },
      });
      expect(
        (
          await fixture.call(
            `/company-document-content-reader-assignments/${membershipId}/${companyId}`,
            { method: 'DELETE', company: null },
          )
        ).status,
      ).toBe(200);
      const denied = await read();
      expect(objects(denied.activities)[2]).toMatchObject({
        state: 'EVIDENCE_UNAVAILABLE',
        task: { id: recordedId, status: 'done' },
        result: { kind: 'unavailable' },
      });
      for (const row of objects(denied.activities))
        expect(row.result).toEqual({ kind: 'unavailable' });
      for (const secret of [
        'Literal secret evidence DEMO883',
        documentId,
        versionId,
        'Readiness result DEMO',
      ])
        expect(JSON.stringify(denied)).not.toContain(secret);
      expect(
        await json(await fixture.call(`/projects/${projectId}/template`)),
      ).toEqual(plan);
      expect((await fixture.call(`/tasks/${recordedId}`)).status).toBe(200);
      await fixture.grant('/company-document-content-reader-assignments');
      expect(objects((await read()).activities)[2]).toMatchObject({
        state: 'RECORDED_RESULT_NOT_REVIEWED',
      });
    });

    it('refuses captured legacy access and corrupt mappings instead of empty success', async () => {
      const { projectId } = await prepare();
      const path = `/projects/${projectId}/mission-readiness`;
      await fixture.pool.query(
        "UPDATE company_role_assignments SET permission_set_version='v1' WHERE bundle='company_project_template_user'",
      );
      expect((await fixture.call(path)).status).toBe(403);
      await fixture.pool.query(
        "UPDATE company_role_assignments SET permission_set_version='v2' WHERE bundle='company_project_template_user'",
      );
      expect((await fixture.call(path)).status).toBe(200);
      // Deliberately simulate corrupt historical storage in this disposable database.
      await fixture.pool.query(
        'ALTER TABLE project_template_task_copies DISABLE TRIGGER USER',
      );
      await fixture.pool.query(
        'DELETE FROM project_template_task_copies WHERE project_id=$1 AND position=12',
        [projectId],
      );
      await fixture.pool.query(
        'ALTER TABLE project_template_task_copies ENABLE TRIGGER USER',
      );
      expect((await fixture.call(path)).status).toBe(500);
    });
  },
);
