import { expect } from 'vitest';
import {
  json,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import {
  objects,
  pilotKey,
} from '../project-template/project-pilot-plan.test-support.js';

export async function prepareMissionReview(
  fixture: MissionDocumentFixture,
  reviewer = true,
) {
  const context = await fixture.reset();
  for (const route of [
    '/company-project-assignments',
    '/company-task-manager-assignments',
    '/company-project-template-user-assignments',
    '/company-mission-deliverable-access-assignments',
    '/company-document-content-reader-assignments',
  ])
    await fixture.grant(route);
  const created = await fixture.call('/projects/from-template', {
    method: 'POST',
    body: {
      clientAccountId: context.clientId,
      title: 'Mission review DEMO',
      templateKey: pilotKey,
      templateVersion: 1,
    },
  });
  expect(created.status).toBe(201);
  const projectId = text((await json(created)).id);
  const plan = await json(
    await fixture.call(`/projects/${projectId}/template`),
  );
  const activities = objects(record(plan.template).activities);
  const first = activities[0];
  if (!first) throw new Error('Expected pilot Task');
  const taskId = text(first.taskId);
  expect(
    (
      await fixture.call(`/tasks/${taskId}/complete`, {
        method: 'POST',
        body: { expectedVersion: 1 },
      })
    ).status,
  ).toBe(201);
  if (reviewer)
    await fixture.grant('/company-mission-result-reviewer-assignments');
  const body = {
    expectedReviewRevision: 0,
    outcome: 'NEEDS_WORK',
    basis: 'Literal review basis DEMO',
    items: [
      {
        taskId,
        expectedTaskVersion: 2,
        expectedResultRevision: 0,
        evidence: {
          kind: 'EXTERNAL_REPORTED',
          reference: 'Physical register DEMO',
        },
      },
    ],
  };
  return {
    ...context,
    projectId,
    taskId,
    activities,
    plan,
    body,
    path: `/projects/${projectId}/mission-result-reviews`,
  };
}
