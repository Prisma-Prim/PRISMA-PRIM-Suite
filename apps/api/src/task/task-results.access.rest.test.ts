import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import { prepareTaskResult } from './task-results.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('D4 independent Task result authority REST', () => {
  let fixture: MissionDocumentFixture;
  let context: Awaited<ReturnType<typeof prepareTaskResult>>;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await createMissionDocumentFixture(databaseUrl);
  });
  afterAll(async () => {
    await fixture?.close();
  });
  beforeEach(async () => {
    context = await prepareTaskResult(fixture);
  });

  const input = () => ({
    expectedTaskVersion: 1,
    expectedResultRevision: 0,
    documentId: context.documentId,
    versionId: context.versionId,
    declaration: 'Confidential exact result declaration DEMO834',
  });
  const submit = (key = 'authority-result-demo') =>
    fixture.call(`/tasks/${context.taskId}/results`, {
      method: 'POST',
      body: input(),
      key,
    });
  const revoke = (path: string) =>
    fixture.call(`${path}/${context.membershipId}/${context.companyId}`, {
      method: 'DELETE',
      company: null,
    });
  const routes = () => [
    `/tasks/${context.taskId}/results`,
    `/tasks/${context.taskId}/results/history`,
    `/tasks/${context.taskId}/results/eligible-versions`,
  ];

  it('keeps ordinary Task Manager and read authority independent from Recorder, including committed replay', async () => {
    const empty = await fixture.call(`/tasks/${context.taskId}/results`);
    expect(empty.status).toBe(200);
    expect(await empty.json()).toMatchObject({ revision: 0, current: null });
    expect((await submit()).status).toBe(403);
    const grant = await fixture.grant(
      '/company-task-result-recorder-assignments',
    );
    expect(grant).toMatchObject({
      bundle: 'Company Task Result Recorder',
      permissionSetVersion: 'v1',
      active: true,
    });
    const actor = await json(await fixture.call('/access/current-actor'));
    expect(record(actor.activeCompany)).toMatchObject({
      taskResultPermissions: ['task.result.record'],
      taskResultRecorderAssignmentId: text(grant.id),
      taskResultRecorderPermissionSetVersion: 'v1',
      taskPermissions: ['task.read', 'task.manage'],
      projectPermissionAssignmentId: expect.any(String),
      projectPermissionSetVersion: 'v2',
      documentPermissionAssignmentId: expect.any(String),
      documentPermissionSetVersion: 'v3',
    });
    const created = await submit();
    expect(created.status).toBe(201);
    const receipt = await created.json();
    const replay = await submit();
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(receipt);
    expect(
      (await revoke('/company-task-result-recorder-assignments')).status,
    ).toBe(200);
    expect((await submit()).status).toBe(403);
    expect((await submit('new-denied-intention')).status).toBe(403);
    for (const path of routes())
      expect((await fixture.call(path)).status).toBe(200);
    expect(
      await json(await fixture.call(`/tasks/${context.taskId}`)),
    ).toMatchObject({ task: { version: 1, status: 'todo' } });
  });

  it.each([
    { path: '/company-mission-deliverable-access-assignments', status: 404 },
    { path: '/company-document-content-reader-assignments', status: 404 },
    { path: '/company-document-registrar-assignments', status: 403 },
  ])(
    'removes protected result reads after $path revocation while ordinary Task data/history remains readable',
    async ({ path, status }) => {
      await fixture.grant('/company-task-result-recorder-assignments');
      const taskBefore = await json(
        await fixture.call(`/tasks/${context.taskId}`),
      );
      const response = await submit();
      expect(response.status).toBe(201);
      const receipt = await json(response);
      expect((await revoke(path)).status).toBe(200);
      for (const route of routes()) {
        const read = await fixture.call(route);
        expect(read.status).toBe(status);
        const serialized = await read.text();
        expect(serialized).not.toContain(context.documentId);
        expect(serialized).not.toContain(text(receipt.resultId));
        expect(serialized).not.toContain(input().declaration);
      }
      expect((await submit()).status).toBe(status);
      const task = await fixture.call(`/tasks/${context.taskId}`);
      expect(task.status).toBe(200);
      expect(await task.json()).toEqual(taskBefore);
      const history = await fixture.call(`/tasks/${context.taskId}/history`);
      expect(history.status).toBe(200);
      const historyBody = await history.text();
      expect(historyBody).not.toContain(text(receipt.resultId));
      expect(historyBody).not.toContain(input().declaration);
      const activity = await fixture.call('/activity-log');
      expect(activity.status).toBe(200);
      const activityBody = await activity.text();
      expect(activityBody).not.toContain(text(receipt.resultId));
      expect(activityBody).not.toContain(input().declaration);
    },
  );

  it('requires ordinary Task read/manage even when all Document and Recorder grants remain active', async () => {
    await fixture.grant('/company-task-result-recorder-assignments');
    expect((await submit()).status).toBe(201);
    expect((await revoke('/company-task-manager-assignments')).status).toBe(
      200,
    );
    for (const path of routes())
      expect((await fixture.call(path)).status).toBe(403);
    expect((await submit()).status).toBe(403);
  });

  it('denies current/history/selector/new commands and committed replay after public Workspace suspension without rewriting the original result', async () => {
    const identity = {
      subject: 'mission-collaborator',
      displayName: 'Result Collaborator DEMO',
      email: 'collaborator@example.test',
    };
    const member = await json(
      await fixture.call('/access/current-actor', { company: null, identity }),
    );
    const workspaceMembershipId = text(member.workspaceMembershipId);
    for (const bundle of [
      'context',
      'director-client',
      'project',
      'task-manager',
      'document-registrar',
      'document-content-reader',
      'mission-deliverable-access',
      'task-result-recorder',
    ]) {
      expect(
        (
          await fixture.call(`/company-${bundle}-assignments`, {
            method: 'POST',
            company: null,
            body: { companyId: context.companyId, workspaceMembershipId },
          })
        ).status,
      ).toBe(201);
    }
    const command = () =>
      fixture.call(`/tasks/${context.taskId}/results`, {
        method: 'POST',
        identity,
        body: input(),
        key: 'suspended-record-result',
      });
    expect((await command()).status).toBe(201);
    const preserved = await json(
      await fixture.call(`/tasks/${context.taskId}/results`),
    );
    expect(record(record(preserved.current).actor).workspaceMembershipId).toBe(
      workspaceMembershipId,
    );
    expect(
      (
        await fixture.call('/workspace-membership-suspensions', {
          method: 'POST',
          company: null,
          body: { workspaceMembershipId },
        })
      ).status,
    ).toBe(201);
    for (const route of routes()) {
      const response = await fixture.call(route, { identity });
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain(input().declaration);
    }
    expect((await command()).status).toBe(403);
    expect(
      (
        await fixture.call(`/tasks/${context.taskId}/results`, {
          method: 'POST',
          identity,
          body: input(),
        })
      ).status,
    ).toBe(403);
    expect(
      await json(await fixture.call(`/tasks/${context.taskId}/results`)),
    ).toEqual(preserved);
  });

  it.each([null, 'v999'])(
    'fails closed for a Recorder assignment captured with %s while retaining independent result reads',
    async (captured) => {
      const assignment = await fixture.grant(
        '/company-task-result-recorder-assignments',
      );
      const constraint = await fixture.pool.query(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
      );
      const definition = text(record(constraint.rows[0]).definition);
      await fixture.pool.query(
        'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
      );
      try {
        await fixture.pool.query(
          'UPDATE company_role_assignments SET permission_set_version=$2 WHERE id=$1',
          [text(assignment.id), captured],
        );
        expect((await submit()).status).toBe(403);
        const actor = await json(await fixture.call('/access/current-actor'));
        expect(
          record(actor.activeCompany).taskResultPermissions,
        ).toBeUndefined();
        expect(
          record(actor.activeCompany).taskResultRecorderAssignmentId,
        ).toBeUndefined();
        const current = await fixture.call(`/tasks/${context.taskId}/results`);
        expect(current.status).toBe(200);
        expect(await current.json()).toMatchObject({
          revision: 0,
          current: null,
        });
      } finally {
        await fixture.pool.query(
          "UPDATE company_role_assignments SET permission_set_version='v1' WHERE id=$1",
          [text(assignment.id)],
        );
        await fixture.pool.query(
          'ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ' +
            definition,
        );
      }
    },
  );

  it('hides known Task/result identifiers in another fully authorized Company and without selected context', async () => {
    await fixture.grant('/company-task-result-recorder-assignments');
    expect((await submit()).status).toBe(201);
    const company = await fixture.call('/companies', {
      method: 'POST',
      company: null,
      body: { displayName: 'Other Task result Company DEMO' },
    });
    expect(company.status).toBe(201);
    const otherId = text((await json(company)).id);
    for (const path of [
      '/company-project-assignments',
      '/company-task-manager-assignments',
      '/company-document-registrar-assignments',
      '/company-document-content-reader-assignments',
      '/company-mission-deliverable-access-assignments',
      '/company-task-result-recorder-assignments',
    ]) {
      expect(
        (
          await fixture.call(path, {
            method: 'POST',
            company: null,
            body: {
              companyId: otherId,
              workspaceMembershipId: context.membershipId,
            },
          })
        ).status,
      ).toBe(201);
    }
    for (const path of routes()) {
      expect((await fixture.call(path, { company: otherId })).status).toBe(404);
      expect((await fixture.call(path, { company: null })).status).toBe(403);
    }
    expect(
      (
        await fixture.call(`/tasks/${context.taskId}/results`, {
          method: 'POST',
          company: otherId,
          body: input(),
          key: 'foreign-company-record-demo',
        })
      ).status,
    ).toBe(404);
    expect(
      await json(await fixture.call(`/tasks/${context.taskId}/results`)),
    ).toMatchObject({ revision: 1 });
  });

  it('hides a known result resource in a second real Workspace in the same database', async () => {
    await fixture.grant('/company-task-result-recorder-assignments');
    const target = fixture.pool.options.connectionString;
    if (typeof target !== 'string')
      throw new Error('Expected the owned isolated test database target.');
    const keys = [
      'ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT',
      'ACCESS_BOOTSTRAP_WORKSPACE_ID',
      'ACCESS_BOOTSTRAP_WORKSPACE_NAME',
      'ACCESS_ACCEPTED_INVITATIONS_JSON',
    ];
    const previous = keys.map((key) => ({ key, value: process.env[key] }));
    let foreign: PostgresRestTestHarness | undefined;
    let foreignCompany: string | undefined;
    try {
      foreign = await createPostgresRestTestHarness({
        databaseUrl: target,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'task-result-foreign-owner',
          ACCESS_BOOTSTRAP_WORKSPACE_ID: '00000000-0000-4000-8000-000000000834',
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Other Task result Workspace DEMO',
          ACCESS_ACCEPTED_INVITATIONS_JSON: '[]',
        },
      });
      const origin = foreign.origin;
      const call = (
        path: string,
        options: {
          method?: string;
          body?: unknown;
          company?: string | null;
        } = {},
      ) => {
        const company =
          options.company === undefined ? foreignCompany : options.company;
        return fetch(origin + '/api' + path, {
          method: options.method ?? 'GET',
          headers: {
            'x-test-external-provider': 'deterministic-test',
            'x-test-external-subject': 'task-result-foreign-owner',
            'x-test-display-name': 'Other Workspace Owner DEMO',
            'x-test-email': 'other-workspace-owner@example.test',
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
            ...(company ? { 'x-company-context-id': company } : {}),
          },
          ...(options.body === undefined
            ? {}
            : { body: JSON.stringify(options.body) }),
        });
      };
      const company = await call('/companies', {
        method: 'POST',
        body: { displayName: 'Other Workspace Company DEMO' },
      });
      expect(company.status).toBe(201);
      foreignCompany = text((await json(company)).id);
      const actor = await json(
        await call('/access/current-actor', { company: null }),
      );
      expect(actor.workspaceId).toBe('00000000-0000-4000-8000-000000000834');
      for (const path of [
        '/company-project-assignments',
        '/company-task-manager-assignments',
        '/company-document-registrar-assignments',
        '/company-document-content-reader-assignments',
        '/company-mission-deliverable-access-assignments',
      ]) {
        expect(
          (
            await call(path, {
              method: 'POST',
              company: null,
              body: {
                companyId: foreignCompany,
                workspaceMembershipId: text(actor.workspaceMembershipId),
              },
            })
          ).status,
        ).toBe(201);
      }
      const client = await call('/clients', {
        method: 'POST',
        body: { displayName: 'Other Workspace Client DEMO' },
      });
      expect(client.status).toBe(201);
      const project = await call('/projects', {
        method: 'POST',
        body: {
          clientAccountId: text((await json(client)).id),
          title: 'Other Workspace Project DEMO',
        },
      });
      expect(project.status).toBe(201);
      const task = await call(
        `/projects/${text((await json(project)).id)}/tasks`,
        {
          method: 'POST',
          body: { title: 'Private other Workspace Task DEMO834' },
        },
      );
      expect(task.status).toBe(201);
      const taskId = text((await json(task)).id);
      const readable = await call(`/tasks/${taskId}/results`);
      expect(readable.status).toBe(200);
      expect(await readable.json()).toMatchObject({
        revision: 0,
        current: null,
      });
      for (const entry of previous) {
        if (entry.value === undefined) delete process.env[entry.key];
        else process.env[entry.key] = entry.value;
      }
      for (const path of [
        `/tasks/${taskId}/results`,
        `/tasks/${taskId}/results/history`,
        `/tasks/${taskId}/results/eligible-versions`,
      ]) {
        const denied = await fixture.call(path);
        expect(denied.status).toBe(404);
        expect(await denied.text()).not.toContain(
          'Private other Workspace Task DEMO834',
        );
        expect(
          (await fixture.call(path, { company: foreignCompany })).status,
        ).toBe(403);
      }
      expect(
        (
          await fixture.call(`/tasks/${taskId}/results`, {
            method: 'POST',
            key: 'foreign-workspace-record',
            body: input(),
          })
        ).status,
      ).toBe(404);
    } finally {
      for (const entry of previous) {
        if (entry.value === undefined) delete process.env[entry.key];
        else process.env[entry.key] = entry.value;
      }
      await foreign?.close();
    }
  });
});
