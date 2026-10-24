import { expect } from 'vitest';
import {
  json,
  record,
  text,
  PDF_A,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';

/** Shared public setup only; no owning module is mocked. Recorder remains opt-in per test. */
export async function prepareTaskResult(fixture: MissionDocumentFixture) {
  const { companyId, membershipId, clientId } = await fixture.reset();
  for (const path of [
    '/company-project-assignments',
    '/company-task-manager-assignments',
    '/company-mission-deliverable-access-assignments',
    '/company-document-content-reader-assignments',
    '/company-document-content-uploader-assignments',
    '/company-document-approver-assignments',
    '/company-document-project-organizer-assignments',
  ])
    await fixture.grant(path);

  const project = await fixture.call('/projects', {
    method: 'POST',
    body: { clientAccountId: clientId, title: 'Task result Project DEMO' },
  });
  expect(project.status).toBe(201);
  const projectId = text((await json(project)).id);
  const task = await fixture.call(`/projects/${projectId}/tasks`, {
    method: 'POST',
    body: { title: 'Preserve mission output DEMO' },
  });
  expect(task.status).toBe(201);
  const taskId = text((await json(task)).id);

  const { documentId, versionId } = await preserveFrozenResultDocument({
    fixture,
    registration: {
      type: 'mission-deliverable',
      clientId,
      title: 'Frozen mission output DEMO',
      purpose: 'Preserve the declared Task result',
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
  return {
    companyId,
    membershipId,
    clientId,
    projectId,
    taskId,
    documentId,
    versionId,
  };
}

/** Preserve through the real upload/designation boundaries before testing a result reference. */
export async function preserveFrozenResultDocument(input: {
  fixture: MissionDocumentFixture;
  registration: unknown;
}) {
  const { fixture } = input;
  const registration = await fixture.call('/documents', {
    method: 'POST',
    body: input.registration,
  });
  expect(registration.status).toBe(201);
  const document = await json(registration);
  const documentId = text(document.id);
  const versionId = text(record(document.version).id);
  expect(
    (
      await fixture.upload({
        documentId,
        versionId,
        revision: 1,
        bytes: PDF_A,
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await fixture.call(
        `/documents/${documentId}/versions/${versionId}/official-designation`,
        { method: 'POST', body: { expectedRevision: 2 } },
      )
    ).status,
  ).toBe(200);
  return { documentId, versionId };
}
