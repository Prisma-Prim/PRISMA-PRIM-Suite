import { preserveFrozenResultDocument } from '../task/task-results.test-support.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  PDF_B,
  json,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import {
  objects,
  pilotKey,
} from '../project-template/project-pilot-plan.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'Attributable mission-result review through public REST',
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
        '/company-mission-deliverable-access-assignments',
        '/company-document-content-reader-assignments',
      ])
        await fixture.grant(path);
      const response = await fixture.call('/projects/from-template', {
        method: 'POST',
        body: {
          clientAccountId: context.clientId,
          title: 'Mission review DEMO',
          templateKey: pilotKey,
          templateVersion: 1,
        },
      });
      expect(response.status).toBe(201);
      const projectId = text((await json(response)).id);
      return { ...context, projectId };
    }

    it('reads all conserved activities and an empty review stream without Reviewer authority', async () => {
      const { projectId } = await prepare();
      const raw = record(
        (
          await json(
            await fixture.call(`/projects/${projectId}/mission-readiness`),
          )
        ).assessment,
      );
      const response = await fixture.call(
        `/projects/${projectId}/mission-result-reviews`,
      );
      expect(response.status).toBe(200);
      const review = record((await json(response)).review);
      expect(review).toMatchObject({
        kind: 'available',
        project: { id: projectId },
        source: raw.source,
        revision: 0,
      });
      const rows = objects(review.activities);
      expect(rows).toHaveLength(13);
      expect(rows.map((row) => row.task)).toEqual(
        objects(raw.activities).map((row) => row.task),
      );
      for (const row of rows) {
        expect(row.latest).toBeNull();
        expect(row.result).toEqual({ kind: 'available', current: null });
      }
      const history = await fixture.call(
        `/projects/${projectId}/mission-result-reviews/history`,
      );
      expect(history.status).toBe(200);
      expect(await history.json()).toMatchObject({
        history: {
          kind: 'available',
          batches: [],
          hasMore: false,
          nextBeforeRevision: null,
        },
      });
    });
    it('records a deliberate multi-activity external-evidence judgment under an explicit Reviewer capture', async () => {
      const { projectId } = await prepare();
      const path = `/projects/${projectId}/mission-result-reviews`;
      const initial = record((await json(await fixture.call(path))).review);
      const rows = objects(initial.activities).slice(0, 2);
      for (const row of rows) {
        expect(
          (
            await fixture.call(`/tasks/${text(record(row.task).id)}/complete`, {
              method: 'POST',
              body: { expectedVersion: 1 },
            })
          ).status,
        ).toBe(201);
      }
      const grant = await fixture.grant(
        '/company-mission-result-reviewer-assignments',
      );
      expect(grant).toMatchObject({
        bundle: 'Company Mission Result Reviewer',
        permissionSetVersion: 'v1',
        active: true,
      });
      expect(
        record(
          (await json(await fixture.call('/access/current-actor')))
            .activeCompany,
        ),
      ).toMatchObject({
        missionResultReviewPermissions: ['project.mission_result.review'],
        missionResultReviewerAssignmentId: text(grant.id),
        missionResultReviewerPermissionSetVersion: 'v1',
      });
      const body = {
        expectedReviewRevision: 0,
        outcome: 'ACCEPTED_BY_REVIEWER',
        basis:
          'Reviewed the listed intended results against the identified physical records DEMO.',
        items: rows.map((row) => ({
          taskId: record(row.task).id,
          expectedTaskVersion: 2,
          expectedResultRevision: 0,
          evidence: {
            kind: 'EXTERNAL_REPORTED',
            reference: `Physical register ${text(row.key)} — revisionA DEMO`,
          },
        })),
      };
      const response = await fixture.call(path, {
        method: 'POST',
        key: 'review-external-demo',
        body,
      });
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        action: 'recorded',
        projectId,
        reviewRevision: 1,
      });
      const current = record((await json(await fixture.call(path))).review);
      expect(current.revision).toBe(1);
      expect(
        objects(current.activities)
          .slice(0, 2)
          .map((row) => row.latest),
      ).toEqual(
        rows.map((row) =>
          expect.objectContaining({
            outcome: body.outcome,
            basis: body.basis,
            evidence: {
              kind: 'EXTERNAL_REPORTED',
              reference: `Physical register ${text(row.key)} — revisionA DEMO`,
            },
            current: true,
          }),
        ),
      );
      expect(
        objects(current.activities)
          .slice(2)
          .every((row) => row.latest === null),
      ).toBe(true);
      const later = await fixture.call(path, {
        method: 'POST',
        body: {
          ...body,
          expectedReviewRevision: 1,
          outcome: 'NEEDS_WORK',
          basis: 'Only the second activity needs further work DEMO.',
          items: body.items.slice(1),
        },
      });
      expect(later.status).toBe(201);
      const revised = objects(
        record((await json(await fixture.call(path))).review).activities,
      );
      expect(revised[0]?.latest).toMatchObject({
        reviewRevision: 1,
        basis: body.basis,
      });
      expect(revised[1]?.latest).toMatchObject({
        reviewRevision: 2,
        outcome: 'NEEDS_WORK',
        predecessorId: record(objects(current.activities)[1]?.latest).id,
      });
    });
    async function readyReview() {
      const context = await prepare();
      await fixture.grant('/company-mission-result-reviewer-assignments');
      const path = `/projects/${context.projectId}/mission-result-reviews`;
      const review = record((await json(await fixture.call(path))).review);
      const first = objects(review.activities)[0];
      if (!first) throw new Error('Expected a mapped Task');
      const taskId = text(record(first.task).id);
      expect(
        (
          await fixture.call(`/tasks/${taskId}/complete`, {
            method: 'POST',
            body: { expectedVersion: 1 },
          })
        ).status,
      ).toBe(201);
      const body = {
        expectedReviewRevision: 0,
        outcome: 'NEEDS_WORK',
        basis: 'Gaps identified against the frozen intended result DEMO.',
        items: [
          {
            taskId,
            expectedTaskVersion: 2,
            expectedResultRevision: 0,
            evidence: {
              kind: 'EXTERNAL_REPORTED',
              reference: 'Physical register DEMO — edition A',
            },
          },
        ],
      };
      return { ...context, path, taskId, body };
    }
    async function counts() {
      return (
        await fixture.pool.query(
          'SELECT (SELECT count(*)::int FROM mission_result_review_batches) AS batches,(SELECT count(*)::int FROM mission_result_review_items) AS items,(SELECT count(*)::int FROM mission_result_review_commands) AS commands,(SELECT count(*)::int FROM mission_result_review_events) AS events',
        )
      ).rows;
    }
    it('confirms identical commands, rejects changed intent and records a fresh-key semantic no-op without another Client fence', async () => {
      const { path, clientId, body } = await readyReview();
      const before = (
        await fixture.pool.query(
          'SELECT version FROM client_accounts WHERE id=$1',
          [clientId],
        )
      ).rows;
      const submit = (key: string, value: unknown = body) =>
        fixture.call(path, { method: 'POST', key, body: value });
      const first = await json(await submit('first-demo'));
      expect(first.action).toBe('recorded');
      expect(await json(await submit('first-demo'))).toEqual(first);
      expect(
        (await submit('first-demo', { ...body, basis: 'Changed DEMO' })).status,
      ).toBe(409);
      expect(
        await json(
          await submit('noop-demo', { ...body, expectedReviewRevision: 1 }),
        ),
      ).toEqual({ ...first, action: 'unchanged' });
      expect(await counts()).toEqual([
        { batches: 1, items: 1, commands: 2, events: 1 },
      ]);
      const after = (
        await fixture.pool.query(
          'SELECT version FROM client_accounts WHERE id=$1',
          [clientId],
        )
      ).rows;
      expect(Number(after[0]?.version)).toBe(Number(before[0]?.version) + 1);
    });
    it('retains previous per-activity judgments and reports app changes as stale without erasing history', async () => {
      const { path, taskId, body } = await readyReview();
      expect((await fixture.call(path, { method: 'POST', body })).status).toBe(
        201,
      );
      expect(
        (
          await fixture.call(`/tasks/${taskId}/reopen`, {
            method: 'POST',
            body: { expectedVersion: 2 },
          })
        ).status,
      ).toBe(201);
      const review = record((await json(await fixture.call(path))).review);
      expect(record(objects(review.activities)[0]?.latest).current).toBe(false);
      expect(
        (
          await fixture.call(path, {
            method: 'POST',
            body: { ...body, expectedReviewRevision: 1 },
          })
        ).status,
      ).toBe(409);
      const history = record(
        (await json(await fixture.call(path + '/history'))).history,
      );
      expect(objects(history.batches)).toHaveLength(1);
      expect(
        record(objects(record(objects(history.batches)[0]).items)[0]).basis,
      ).toBe(body.basis);
      expect(await counts()).toEqual([
        { batches: 1, items: 1, commands: 1, events: 1 },
      ]);
    });
    it('does not leak even empty review counts or identifiers after independent evidence loss; Reviewer loss preserves read history', async () => {
      const { path, body, companyId, membershipId } = await readyReview();
      expect((await fixture.call(path, { method: 'POST', body })).status).toBe(
        201,
      );
      expect(
        (
          await fixture.call(
            `/company-mission-result-reviewer-assignments/${membershipId}/${companyId}`,
            { method: 'DELETE', company: null },
          )
        ).status,
      ).toBe(200);
      expect(record((await json(await fixture.call(path))).review).kind).toBe(
        'available',
      );
      expect((await fixture.call(path, { method: 'POST', body })).status).toBe(
        403,
      );
      expect(
        (
          await fixture.call(
            `/company-document-content-reader-assignments/${membershipId}/${companyId}`,
            { method: 'DELETE', company: null },
          )
        ).status,
      ).toBe(200);
      expect(await json(await fixture.call(path))).toEqual({
        review: { kind: 'unavailable' },
      });
      expect(await json(await fixture.call(path + '/history'))).toEqual({
        history: { kind: 'unavailable' },
      });
    });
    it.each([
      { outcome: 'FULFILLED' },
      { expectedReviewRevision: -1 },
      { basis: ' ' },
      { items: [] },
      { extra: true },
    ])('rejects malformed intent without partial facts: %j', async (change) => {
      const { path, body } = await readyReview();
      expect(
        (
          await fixture.call(path, {
            method: 'POST',
            body: { ...body, ...change },
          })
        ).status,
      ).toBe(400);
      expect(await counts()).toEqual([
        { batches: 0, items: 0, commands: 0, events: 0 },
      ]);
    });
    it.each(['0', '-1', '1.5', 'foreign', '2147483648'])(
      'rejects malformed history cursors: %s',
      async (cursor) => {
        const { path } = await readyReview();
        expect(
          (await fixture.call(path + '/history?beforeRevision=' + cursor))
            .status,
        ).toBe(400);
      },
    );
    it('gives competing observed revisions one atomic successor and confirms simultaneous identical intent', async () => {
      const { path, body } = await readyReview();
      const response = await Promise.all([
        fixture.call(path, { method: 'POST', key: 'same-demo', body }),
        fixture.call(path, { method: 'POST', key: 'same-demo', body }),
      ]);
      expect(response.map((row) => row.status)).toEqual([201, 201]);
      expect(await response[0]?.json()).toEqual(await response[1]?.json());
      const next = await Promise.all([
        fixture.call(path, {
          method: 'POST',
          body: {
            ...body,
            expectedReviewRevision: 1,
            basis: 'First changed judgment DEMO',
          },
        }),
        fixture.call(path, {
          method: 'POST',
          body: {
            ...body,
            expectedReviewRevision: 1,
            basis: 'Second changed judgment DEMO',
          },
        }),
      ]);
      expect(next.map((row) => row.status).sort()).toEqual([201, 409]);
      expect(await counts()).toEqual([
        { batches: 2, items: 2, commands: 2, events: 2 },
      ]);
    });
    it('seals coupled history and rejects changes or new items added to a committed batch', async () => {
      const { path, body } = await readyReview();
      expect((await fixture.call(path, { method: 'POST', body })).status).toBe(
        201,
      );
      for (const table of [
        'mission_result_review_batches',
        'mission_result_review_items',
        'mission_result_review_events',
        'mission_result_review_commands',
      ]) {
        await expect(
          fixture.pool.query(`DELETE FROM ${table}`),
        ).rejects.toMatchObject({ code: '23514' });
      }
      await expect(
        fixture.pool.query(
          "UPDATE mission_result_review_batches SET basis='forged'",
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        fixture.pool.query(
          'INSERT INTO mission_result_review_items SELECT * FROM mission_result_review_items',
        ),
      ).rejects.toMatchObject({ code: '23514' });
      expect(await counts()).toEqual([
        { batches: 1, items: 1, commands: 1, events: 1 },
      ]);
    });

    it('reviews an exact declared result and retains its immutable evidence after later app correction', async () => {
      const { path, taskId, projectId, clientId, body } = await readyReview();
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
          clientId,
          title: 'Review evidence DEMO',
          purpose: 'Exact declared result DEMO',
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
          await fixture.call(`/tasks/${taskId}/reopen`, {
            method: 'POST',
            body: { expectedVersion: 2 },
          })
        ).status,
      ).toBe(201);
      const resultBody = {
        expectedTaskVersion: 3,
        expectedResultRevision: 0,
        documentId,
        versionId,
        declaration: 'Exact evidence examined DEMO',
      };
      const result = await json(
        await fixture.call(`/tasks/${taskId}/results`, {
          method: 'POST',
          body: resultBody,
        }),
      );
      expect(
        (
          await fixture.call(`/tasks/${taskId}/complete`, {
            method: 'POST',
            body: { expectedVersion: 3 },
          })
        ).status,
      ).toBe(201);
      const input = {
        ...body,
        outcome: 'ACCEPTED_BY_REVIEWER',
        items: [
          {
            taskId,
            expectedTaskVersion: 4,
            expectedResultRevision: 1,
            evidence: {
              kind: 'DECLARED_RESULT',
              resultId: text(result.resultId),
            },
          },
        ],
      };
      const recorded = await fixture.call(path, {
        method: 'POST',
        key: 'exact-declared-demo',
        body: input,
      });
      expect(recorded.status).toBe(201);
      const receipt = await recorded.json();
      const current = record((await json(await fixture.call(path))).review);
      expect(objects(current.activities)[0]?.latest).toMatchObject({
        current: true,
        outcome: 'ACCEPTED_BY_REVIEWER',
        evidence: {
          kind: 'DECLARED_RESULT',
          result: { id: result.resultId, reference: { documentId, versionId } },
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
      expect(
        objects(
          record((await json(await fixture.call(path))).review).activities,
        )[0]?.latest,
      ).toMatchObject({
        current: true,
        evidence: {
          result: {
            id: result.resultId,
            reference: { documentId, versionId, status: 'superseded' },
          },
        },
      });
      expect(
        (
          await fixture.call(`/tasks/${taskId}/reopen`, {
            method: 'POST',
            body: { expectedVersion: 4 },
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await fixture.call(`/tasks/${taskId}/results/corrections`, {
            method: 'POST',
            body: {
              ...resultBody,
              expectedTaskVersion: 5,
              expectedResultRevision: 1,
              declaration: 'Corrected declaration DEMO',
              reason: 'Review found a difference DEMO',
            },
          })
        ).status,
      ).toBe(201);
      expect(
        objects(
          record((await json(await fixture.call(path))).review).activities,
        )[0]?.latest,
      ).toMatchObject({
        current: false,
        evidence: {
          result: {
            id: result.resultId,
            declaration: 'Exact evidence examined DEMO',
          },
        },
      });
      expect(
        await json(
          await fixture.call(path, {
            method: 'POST',
            key: 'exact-declared-demo',
            body: input,
          }),
        ),
      ).toEqual(receipt);
    }, 30_000);
    it('keeps ordinary closure independent and permits only committed confirmation on a closed Project', async () => {
      const { path, projectId, taskId, body } = await readyReview();
      await fixture.grant('/company-project-approver-assignments');
      const recorded = await fixture.call(path, {
        method: 'POST',
        key: 'closed-review-demo',
        body,
      });
      expect(recorded.status).toBe(201);
      const receipt = await recorded.json();
      const source = record((await json(await fixture.call(path))).review);
      for (const row of objects(source.activities).slice(1))
        expect(
          (
            await fixture.call(`/tasks/${text(record(row.task).id)}/cancel`, {
              method: 'POST',
              body: {
                expectedVersion: 1,
                reason: 'Ordinary cancellation DEMO',
              },
            })
          ).status,
        ).toBe(201);
      const closed = await fixture.call(
        `/projects/${projectId}/lifecycle-transitions`,
        {
          method: 'POST',
          body: {
            action: 'cancel',
            expectedLifecycleRevision: 0,
            reason: 'Ordinary closure DEMO',
          },
        },
      );
      expect(closed.status).toBe(200);
      expect(
        await json(
          await fixture.call(path, {
            method: 'POST',
            key: 'closed-review-demo',
            body,
          }),
        ),
      ).toEqual(receipt);
      expect(
        (
          await fixture.call(path, {
            method: 'POST',
            body: { ...body, expectedReviewRevision: 1 },
          })
        ).status,
      ).toBe(409);
      expect(
        record((await json(await fixture.call(path))).review),
      ).toMatchObject({ mutable: false, revision: 1 });
      expect(
        record((await json(await fixture.call(`/tasks/${taskId}`))).task)
          .status,
      ).toBe('done');
    }, 30_000);
    it('bounds immutable history to 25 batches with a Project-local validated cursor', async () => {
      const { path, body } = await readyReview();
      for (let revision = 0; revision < 27; revision++)
        expect(
          (
            await fixture.call(path, {
              method: 'POST',
              body: {
                ...body,
                expectedReviewRevision: revision,
                basis: `Deliberate judgment ${revision + 1} DEMO`,
              },
            })
          ).status,
        ).toBe(201);
      const first = record(
        (await json(await fixture.call(path + '/history'))).history,
      );
      expect(first).toMatchObject({ hasMore: true, nextBeforeRevision: 3 });
      expect(objects(first.batches).map((row) => row.reviewRevision)).toEqual(
        Array.from({ length: 25 }, (_, index) => 27 - index),
      );
      const second = record(
        (await json(await fixture.call(path + '/history?beforeRevision=3')))
          .history,
      );
      expect(second).toMatchObject({
        hasMore: false,
        nextBeforeRevision: null,
      });
      expect(objects(second.batches).map((row) => row.reviewRevision)).toEqual([
        2, 1,
      ]);
    }, 30_000);
    it.each([null, 'v2'])(
      'fails closed for an unsupported captured Reviewer version %s without losing permitted history',
      async (version) => {
        const { path, body, companyId, membershipId } = await readyReview();
        const result = await fixture.pool.query(
          "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
        );
        const definition = text(record(result.rows[0]).definition);
        await fixture.pool.query(
          'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
        );
        try {
          await fixture.pool.query(
            "UPDATE company_role_assignments SET permission_set_version=$1 WHERE company_id=$2 AND workspace_membership_id=$3 AND bundle::text='company_mission_result_reviewer'",
            [version, companyId, membershipId],
          );
          const actor = record(
            (await json(await fixture.call('/access/current-actor')))
              .activeCompany,
          );
          expect(actor).not.toHaveProperty('missionResultReviewerAssignmentId');
          expect(
            (await fixture.call(path, { method: 'POST', body })).status,
          ).toBe(403);
          expect(
            record((await json(await fixture.call(path))).review).revision,
          ).toBe(0);
        } finally {
          await fixture.pool.query(
            "UPDATE company_role_assignments SET permission_set_version='v1' WHERE company_id=$1 AND bundle::text='company_mission_result_reviewer'",
            [companyId],
          );
          await fixture.pool.query(
            `ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ${definition}`,
          );
        }
      },
    );

    it('distinguishes unsupported Projects, unavailable empty evidence, foreign scope and ineligible selected Tasks', async () => {
      const {
        path,
        projectId,
        taskId,
        clientId,
        membershipId,
        companyId,
        body,
      } = await readyReview();
      const manual = await fixture.call('/projects', {
        method: 'POST',
        body: {
          clientAccountId: clientId,
          title: 'Ordinary unsupported mission DEMO',
        },
      });
      const id = text((await json(manual)).id);
      expect(
        await json(
          await fixture.call(`/projects/${id}/mission-result-reviews`),
        ),
      ).toEqual({ review: null });
      expect(
        await json(
          await fixture.call(`/projects/${id}/mission-result-reviews/history`),
        ),
      ).toEqual({ history: null });
      expect(
        (
          await fixture.call(`/projects/${id}/mission-result-reviews`, {
            method: 'POST',
            body,
          })
        ).status,
      ).toBe(409);
      const raw = record((await json(await fixture.call(path))).review);
      const other = objects(raw.activities)[1];
      if (!other) throw new Error('Expected another mapped activity');
      const unready = {
        ...body,
        items: [
          {
            ...body.items[0],
            taskId: text(record(other.task).id),
            expectedTaskVersion: 1,
          },
        ],
      };
      expect(
        (await fixture.call(path, { method: 'POST', body: unready })).status,
      ).toBe(409);
      expect(
        (
          await fixture.call(
            '/projects/00000000-0000-4000-8000-000000000999/mission-result-reviews',
          )
        ).status,
      ).toBe(404);
      expect(
        (await fixture.call('/projects/invalid/mission-result-reviews')).status,
      ).toBe(400);
      expect(
        (
          await fixture.call(path, {
            method: 'POST',
            body: { ...body, items: [...body.items, ...body.items] },
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await fixture.call(path, {
            method: 'POST',
            body: {
              ...body,
              items: [
                {
                  taskId,
                  expectedTaskVersion: 2,
                  expectedResultRevision: 0,
                  evidence: {
                    kind: 'EXTERNAL_REPORTED',
                    reference: 'literal',
                    resultId: taskId,
                  },
                },
              ],
            },
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await fixture.call(
            `/company-document-content-reader-assignments/${membershipId}/${companyId}`,
            { method: 'DELETE', company: null },
          )
        ).status,
      ).toBe(200);
      expect(await json(await fixture.call(path))).toEqual({
        review: { kind: 'unavailable' },
      });
      expect(await json(await fixture.call(path + '/history'))).toEqual({
        history: { kind: 'unavailable' },
      });
      expect(
        (await fixture.call(`/projects/${projectId}/template`)).status,
      ).toBe(200);
    });
    it('rejects native partial successors and foreign captured attribution without leaking review evidence into ordinary feeds', async () => {
      const { path, body, taskId } = await readyReview();
      expect((await fixture.call(path, { method: 'POST', body })).status).toBe(
        201,
      );
      const forge = `INSERT INTO mission_result_review_batches SELECT (jsonb_populate_record(NULL::mission_result_review_batches, to_jsonb(b) || jsonb_build_object('id',gen_random_uuid(),'revision',2,'predecessor_id',b.id,'previous_revision',1) || $1::jsonb)).* FROM mission_result_review_batches b WHERE revision=1`;
      for (const change of [
        {},
        { actor_membership_id: '00000000-0000-4000-8000-000000000999' },
        { reviewer_assignment_id: '00000000-0000-4000-8000-000000000999' },
        { predecessor_id: '00000000-0000-4000-8000-000000000999' },
      ])
        await expect(
          fixture.pool.query(forge, [JSON.stringify(change)]),
        ).rejects.toMatchObject({ code: '23514' });
      expect(await counts()).toEqual([
        { batches: 1, items: 1, commands: 1, events: 1 },
      ]);
      const connection = await fixture.pool.connect();
      try {
        for (const change of [
          { task_id: '00000000-0000-4000-8000-000000000999' },
          { company_id: '00000000-0000-4000-8000-000000000999' },
          { position: 12 },
          { task_version: 3 },
          { task_title: 'Forged observed title DEMO' },
          { result_revision: 1 },
          { predecessor_id: '00000000-0000-4000-8000-000000000999' },
          {
            evidence_kind: 'DECLARED_RESULT',
            result_id: '00000000-0000-4000-8000-000000000999',
            external_reference: null,
          },
          { external_reference: null },
        ]) {
          await connection.query('BEGIN');
          try {
            const next = await connection.query(forge + ' RETURNING id', [
              '{}',
            ]);
            const nextId = text(record(next.rows[0]).id);
            await expect(
              connection.query(
                `INSERT INTO mission_result_review_items SELECT (jsonb_populate_record(NULL::mission_result_review_items, to_jsonb(i) || jsonb_build_object('id',gen_random_uuid(),'batch_id',$1::uuid,'review_revision',2,'predecessor_id',i.id) || $2::jsonb)).* FROM mission_result_review_items i WHERE review_revision=1`,
                [nextId, JSON.stringify(change)],
              ),
            ).rejects.toMatchObject({ severity: 'ERROR' });
          } finally {
            await connection.query('ROLLBACK');
          }
        }
      } finally {
        connection.release();
      }
      expect(
        (
          await fixture.pool.query(
            'SELECT metadata FROM mission_result_review_events',
          )
        ).rows,
      ).toEqual([{ metadata: { revision: 1 } }]);
      expect(
        (
          await fixture.pool.query(
            "SELECT count(*)::int AS count FROM activity_log_events WHERE action::text='project.mission_result.reviewed'",
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      const ordinary = await json(
        await fixture.call(`/tasks/${taskId}/history`),
      );
      expect(JSON.stringify(ordinary)).not.toContain(body.basis);
    });
  },
);
