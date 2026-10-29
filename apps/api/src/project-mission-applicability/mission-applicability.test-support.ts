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

export async function prepareApplicability(fixture: MissionDocumentFixture) {
  const context = await fixture.reset();
  for (const path of [
    '/company-project-assignments',
    '/company-task-manager-assignments',
    '/company-project-template-user-assignments',
    '/company-mission-deliverable-access-assignments',
    '/company-document-content-reader-assignments',
  ])
    await fixture.grant(path);
  const created = await fixture.call('/projects/from-template', {
    method: 'POST',
    body: {
      clientAccountId: context.clientId,
      title: 'Applicability journey DEMO',
      templateKey: pilotKey,
      templateVersion: 1,
    },
  });
  expect(created.status).toBe(201);
  const projectId = text((await json(created)).id),
    path = `/projects/${projectId}/mission-applicability`;
  const plan = await json(
    await fixture.call(`/projects/${projectId}/template`),
  );
  const activities = objects(record(plan.template).activities);
  const taskId = text(activities[6]?.taskId);
  return { ...context, projectId, path, taskId, plan, activities };
}
export async function currentApplicability(
  fixture: MissionDocumentFixture,
  path: string,
) {
  const response = await fixture.call(path);
  expect(response.status).toBe(200);
  return record((await json(response)).applicability);
}
export async function observedApplicability(
  fixture: MissionDocumentFixture,
  path: string,
  taskId: string,
) {
  const projection = await currentApplicability(fixture, path);
  const row = objects(projection.activities).find(
    (row) => record(row.task).id === taskId,
  );
  if (!row) throw new Error('Expected mapped activity');
  return {
    taskId,
    expectedApplicabilityRevision: projection.revision,
    expectedTaskVersion: record(row.task).version,
    expectedResultRevision:
      record(row.result).current === null
        ? 0
        : record(record(row.result).current).revision,
    expectedLifecycleRevision: projection.lifecycleRevision,
  };
}
export const demoProposal = {
  action: 'PROPOSE',
  reason: '  DEMO concrete scope\r\nЖ / é / 🌍  ',
  scopeBasis: ' DEMO literal agreed scope ',
  agreement: {
    kind: 'PARTIES_AGREEMENT_UNAVAILABLE',
    basis: ' DEMO parties agreement not yet available ',
  },
};
