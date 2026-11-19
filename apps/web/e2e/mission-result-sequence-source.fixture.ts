import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect } from './ui-chaos.fixture';
import {
  prepareAccessSequenceCase,
  accessIdentities,
  accessApiOrigin,
  accessObject,
  accessText,
} from './access-sequence-source.fixture';

/** Prepare only through native grants, commands and preserved original bytes. */
export async function prepareMissionResultSource(page: Page, suffix: string) {
  const access = await prepareAccessSequenceCase(page, suffix);
  // Company B is only a replacement context; no mission permission is consumed there.
  await access.grant('company-context', 'b');
  await Promise.all(
    [
      'company-context',
      'company-director-client',
      'company-project',
      'company-task-manager',
      'company-document-registrar',
      'company-document-project-organizer',
      'company-mission-deliverable-access',
      'company-document-content-reader',
      'company-document-content-uploader',
      'company-document-approver',
      'company-task-result-recorder',
      'company-project-next-action-coordinator',
    ].map((bundle) => access.grant(bundle, 'a')),
  );
  const headers = (company: 'a' | 'b' = 'a') => ({
    ...accessIdentities.member,
    'x-company-context-id': access.companies[company].id,
  });
  async function command(path: string, data: unknown) {
    const response = await page.request.post(accessApiOrigin + path, {
      headers: { ...headers(), 'idempotency-key': randomUUID() },
      data,
    });
    expect([200, 201], path).toContain(response.status());
    return accessObject(await response.json());
  }
  async function read(path: string) {
    const response = await page.request.get(accessApiOrigin + path, {
      headers: headers(),
    });
    expect(response.status(), path).toBe(200);
    return accessObject(await response.json());
  }
  const clientId = accessText(
    (
      await command('/clients', {
        displayName: `Fictional mission Client ${suffix}`,
      })
    ).id,
  );
  const title = `Fictional result Project ${suffix}`;
  const projectId = accessText(
    (await command('/projects', { title, clientAccountId: clientId })).id,
  );
  const taskTitle = `Literal mission result ${suffix}`;
  const taskId = accessText(
    (await command(`/projects/${projectId}/tasks`, { title: taskTitle })).id,
  );
  const otherTaskTitle = `Independent mission Task ${suffix}`;
  const otherTaskId = accessText(
    (await command(`/projects/${projectId}/tasks`, { title: otherTaskTitle }))
      .id,
  );
  const document = await command('/documents', {
    type: 'mission-deliverable',
    clientId,
    title: `Fictional mission original ${suffix}`,
    purpose: 'Prepared fictional evidence',
  });
  const documentId = accessText(document.id);
  const versionId = accessText(accessObject(document.version).id);
  const bytes = await readFile(
    new URL(
      '../../api/test-support/fixtures/questionnaire-demo.pdf',
      import.meta.url,
    ),
  );
  const upload = await page.request.post(
    `${accessApiOrigin}/documents/${documentId}/versions/${versionId}/content?expectedRevision=1&fileName=mission-original.pdf`,
    {
      headers: {
        ...headers(),
        'idempotency-key': randomUUID(),
        'content-type': 'application/pdf',
      },
      data: bytes,
    },
  );
  expect(upload.status()).toBe(201);
  await command(
    `/documents/${documentId}/versions/${versionId}/official-designation`,
    { expectedRevision: 2 },
  );
  await command(`/documents/${documentId}/project-association`, {
    action: 'link',
    projectId,
    expectedRevision: 0,
  });
  // Preparation powers are no prerequisite for reading/recording the qualified original.
  await Promise.all(
    [
      'company-document-project-organizer',
      'company-document-content-uploader',
      'company-document-approver',
    ].map((bundle) => access.revoke(bundle, 'a')),
  );
  const nativeActor = await access.read(
    '/access/current-actor',
    access.companies.a.id,
    'member',
  );
  return {
    ...access,
    workspaceId: accessText(nativeActor.workspaceId),
    headers: headers(),
    projectId,
    title,
    taskId,
    taskTitle,
    otherTaskId,
    otherTaskTitle,
    documentId,
    versionId,
    bytes,
    command,
    read,
    resultPath: `/tasks/${taskId}/results`,
  };
}
