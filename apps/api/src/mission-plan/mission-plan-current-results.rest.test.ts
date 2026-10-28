import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import { preserveFrozenResultDocument } from '../task/task-results.test-support.js';
import { MissionPlanCopyService } from './mission-plan-copy.service.js';
const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres(
  'Configured current work native result and snapshot boundaries',
  () => {
    let f: MissionDocumentFixture;
    let projectId: string,
      taskId: string,
      clientId: string,
      version: Record<string, unknown>;
    const activity = {
      key: '00000000-0000-4000-8000-000000000941',
      title: 'Original configured Task',
      activity: ' Preserved action Ж\n ',
      intendedResult: ' Preserved intended result é\n ',
    };
    beforeAll(async () => {
      const url = process.env.TEST_DATABASE_URL;
      if (!url) throw new Error('Missing disposable PG');
      f = await createMissionDocumentFixture(url);
    });
    afterAll(async () => f?.close());
    async function command(path: string, body: unknown) {
      const response = await f.call(path, { method: 'POST', body });
      expect(response.status, path).toBe(201);
      return json(response);
    }
    async function read() {
      const r = await f.call(
        `/projects/${projectId}/mission-plan/current-work`,
      );
      expect(r.status).toBe(200);
      return record((await json(r)).overview);
    }
    function rows(v: Record<string, unknown>) {
      if (!Array.isArray(v.activities)) throw new Error('Expected activities');
      return v.activities.map(record);
    }
    beforeEach(async () => {
      ({ clientId } = await f.reset());
      for (const path of [
        'company-project',
        'company-task-manager',
        'company-mission-plan-configuration',
        'company-mission-plan-user',
        'company-mission-deliverable-access',
        'company-document-content-reader',
        'company-document-content-uploader',
        'company-document-approver',
        'company-document-project-organizer',
        'company-task-result-recorder',
      ])
        await f.grant('/' + path + '-assignments');
      version = record(
        (
          await command('/mission-plans', {
            title: 'Configured source DEMO',
            activities: [activity],
          })
        ).version,
      );
      projectId = text(
        (
          await command('/projects/from-mission-plan', {
            title: 'Current work DEMO',
            clientAccountId: clientId,
            planId: version.planId,
            versionId: version.id,
            versionNumber: 1,
          })
        ).id,
      );
      const copy = record(
        (await json(await f.call(`/projects/${projectId}/mission-plan`))).plan,
      );
      if (!Array.isArray(copy.tasks)) throw new Error('Missing mapping');
      taskId = text(record(copy.tasks[0]).taskId);
    });
    async function resultDocument() {
      const reference = await preserveFrozenResultDocument({
        fixture: f,
        registration: {
          type: 'mission-deliverable',
          clientId,
          title: 'Frozen exact result DEMO',
          purpose: 'Synthetic current result',
        },
      });
      await command(`/documents/${reference.documentId}/project-association`, {
        action: 'link',
        projectId,
        expectedRevision: 0,
      });
      return reference;
    }
    async function declare(
      reference: Awaited<ReturnType<typeof resultDocument>>,
      correction = false,
    ) {
      return command(
        `/tasks/${taskId}/results${correction ? '/corrections' : ''}`,
        {
          expectedTaskVersion: 1,
          expectedResultRevision: correction ? 1 : 0,
          ...reference,
          declaration: correction
            ? 'Corrected current literal Ж / é'
            : 'Original declaration',
          ...(correction ? { reason: 'Correction reason literal' } : {}),
        },
      );
    }
    it('distinguishes authorized empty from latest corrected declaration and preserves its frozen reference', async () => {
      expect(rows(await read())[0]?.result).toEqual({
        kind: 'available',
        current: null,
      });
      const reference = await resultDocument();
      await declare(reference);
      await declare(reference, true);
      const overview = await read(),
        row = rows(overview)[0];
      expect(row?.result).toMatchObject({
        kind: 'available',
        current: {
          kind: 'corrected',
          revision: 2,
          declaration: 'Corrected current literal Ж / é',
          reason: 'Correction reason literal',
          reference: {
            ...reference,
            versionNumber: 1,
            title: 'Frozen exact result DEMO',
            status: 'official',
          },
        },
      });
      expect(record(record(overview.plan).version)).toEqual(version);
      expect(record(row?.task).version).toBe(1);
    });
    it.each([
      'company_document_registrar',
      'company_mission_deliverable_access',
      'company_document_content_reader',
    ])(
      'redacts only optional results after independent %s loss and keeps source/Task readable',
      async (bundle) => {
        await declare(await resultDocument());
        await f.pool.query(
          'UPDATE company_role_assignments SET revoked_at=now() WHERE bundle=$1',
          [bundle],
        );
        expect(rows(await read())[0]?.result).toEqual({ kind: 'unavailable' });
        expect((await f.call(`/tasks/${taskId}`)).status).toBe(200);
        expect(
          (await f.call(`/projects/${projectId}/mission-plan`)).status,
        ).toBe(200);
      },
    );
    it('propagates invalid already-authorized latest exact references as whole-read errors and never falls back to older results', async () => {
      const ref = await resultDocument();
      await declare(ref);
      await declare(ref, true);
      await f.pool.query('ALTER TABLE document_versions DISABLE TRIGGER USER');
      try {
        await f.pool.query(
          "UPDATE document_versions SET frozen_title='' WHERE document_id=$1",
          [ref.documentId],
        );
      } finally {
        await f.pool.query('ALTER TABLE document_versions ENABLE TRIGGER USER');
      }
      const response = await f.call(
        `/projects/${projectId}/mission-plan/current-work`,
      );
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('Original declaration');
    });
    it('covers all transitive native reads with one repeatable-read read-only transaction without locks, writes or PDF bytes', async () => {
      await declare(await resultDocument());
      const before = await effects();
      const scans = f.scanCount;
      const trace = await f.measureApplicationQueries(() =>
        f.call(`/projects/${projectId}/mission-plan/current-work`),
      );
      expect(trace.value.status).toBe(200);
      const start = trace.queries.findIndex((q) =>
        /^begin isolation level repeatable read read only$/iu.test(q),
      );
      expect(start).toBeGreaterThanOrEqual(0);
      const reads = trace.queries.slice(start);
      expect(reads.at(-1)).toBe('commit');
      expect(reads.filter((q) => /^begin/iu.test(q))).toHaveLength(1);
      expect(reads.join(' ')).not.toMatch(
        /for (?:key )?share|for update|insert into|delete from|update "|"bytes"/iu,
      );
      expect(reads.join(' ')).toMatch(/mission_plan_task_copies/);
      expect(reads.join(' ')).toMatch(/task_result_declarations/);
      expect(reads.join(' ')).toMatch(/workspace_permission_grants/);
      expect(reads.join(' ')).toMatch(/document_pdfs/);
      expect(await effects()).toEqual(before);
      expect(f.scanCount).toBe(scans);
    });
    async function effects() {
      return (
        await f.pool.query(
          'SELECT (SELECT count(*) FROM activity_log_events) events,(SELECT count(*) FROM task_result_commands) commands,(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM client_accounts c) clients',
        )
      ).rows;
    }
    it('keeps a coherent old snapshot across concurrent source publication, Task edit and result correction, then re-reads the committed facts', async () => {
      const ref = await resultDocument();
      await declare(ref);
      let reached: () => void = () => {},
        release: () => void = () => {};
      const atCopy = new Promise<void>((r) => {
          reached = r;
        }),
        continued = new Promise<void>((r) => {
          release = r;
        });
      const original = MissionPlanCopyService.prototype.readWithinTransaction;
      const barrier = vi
        .spyOn(MissionPlanCopyService.prototype, 'readWithinTransaction')
        .mockImplementationOnce(async function (
          this: MissionPlanCopyService,
          input,
        ) {
          const copy = await original.call(this, input);
          reached();
          await continued;
          return copy;
        });
      const pending = f.call(
        `/projects/${projectId}/mission-plan/current-work`,
      );
      try {
        await Promise.race([
          atCopy,
          pending.then(() => {
            throw new Error('Expected snapshot barrier');
          }),
        ]);
        await declare(ref, true);
        expect(
          (
            await f.call(`/tasks/${taskId}`, {
              method: 'PATCH',
              body: {
                expectedVersion: 1,
                title: 'Later native Task',
                priority: 'important',
              },
            })
          ).status,
        ).toBe(200);
        await command(`/mission-plans/${text(version.planId)}/versions`, {
          title: 'Later source',
          activities: [
            {
              ...activity,
              key: randomUUID(),
              intendedResult: 'Later intended result',
            },
          ],
          expectedHeadVersion: 1,
        });
        release();
        const response = await pending;
        expect(response.status).toBe(200);
        const old = record((await json(response)).overview);
        expect(rows(old)[0]).toMatchObject({
          task: { title: activity.title, version: 1 },
          result: {
            kind: 'available',
            current: { revision: 1, declaration: 'Original declaration' },
          },
        });
        expect(record(record(old.plan).version)).toEqual(version);
        expect(rows(await read())[0]).toMatchObject({
          task: { title: 'Later native Task', version: 2 },
          result: {
            kind: 'available',
            current: {
              revision: 2,
              declaration: 'Corrected current literal Ж / é',
            },
          },
        });
      } finally {
        release();
        barrier.mockRestore();
        await pending.catch(() => undefined);
      }
    });
  },
);
