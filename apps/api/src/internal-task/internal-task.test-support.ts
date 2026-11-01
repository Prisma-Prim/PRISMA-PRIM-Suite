import { randomUUID } from 'node:crypto';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

export const workspaceId = '00000000-0000-4000-8000-000000001006';
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public object.');
  return Object.fromEntries(Object.entries(value));
}
export function string(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected a public identifier.');
  return value;
}
export async function json(response: Response) {
  const value: unknown = await response.json();
  return object(value);
}
export async function openInternalTaskFixture(databaseUrl: string) {
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: databaseUrl,
    namePrefix: 'internal_task',
  });
  let harness: PostgresRestTestHarness;
  const environment = {
    NODE_ENV: 'test',
    ACCESS_IDENTITY_MODE: 'test',
    ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
    ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'internal-task-owner',
    ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
    ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Internal Company Work DEMO',
    ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
      [
        'manager',
        'colleague',
        'outsider',
        ...Array.from({ length: 28 }, (_, i) => 'candidate-' + i),
      ].map((subject) => ({
        provider: 'deterministic-test',
        subject: 'internal-task-' + subject,
        workspaceId,
      })),
    ),
  };
  async function open() {
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment,
      synchronizeIdentityProfile: false,
      serverClock: { now: () => new Date('2026-10-31T12:00:00.000Z') },
    });
  }
  await open();
  async function request(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      companyId?: string;
      key?: string;
      subject?: string;
      workspaceId?: string;
      anonymous?: boolean;
    } = {},
  ) {
    const method = options.method ?? 'GET';
    return fetch(harness.origin + '/api' + path, {
      method,
      headers: {
        ...(options.anonymous
          ? {}
          : {
              'x-test-external-provider': 'deterministic-test',
              'x-test-external-subject':
                'internal-task-' + (options.subject ?? 'owner'),
              'x-test-display-name': 'DEMO ' + (options.subject ?? 'owner'),
              'x-test-email': (options.subject ?? 'owner') + '@example.test',
            }),
        ...(options.companyId
          ? { 'x-company-context-id': options.companyId }
          : {}),
        ...(options.workspaceId
          ? { 'x-workspace-context-id': options.workspaceId }
          : {}),
        ...(method === 'GET'
          ? {}
          : {
              'content-type': 'application/json',
              'idempotency-key': options.key ?? randomUUID(),
            }),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  }
  async function created(path: string, body: unknown, companyId?: string) {
    const response = await request(path, { method: 'POST', body, companyId });
    if (response.status !== 201)
      throw new Error(
        `Synthetic setup ${path} expected201, got${response.status}: ${await response.text()}`,
      );
    return json(response);
  }
  async function setup() {
    await harness.pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
    const companyId = string(
      (await created('/companies', { displayName: 'Internal Work DEMO' })).id,
    );
    const member = await json(
      await request('/access/current-actor', { subject: 'manager' }),
    );
    const membershipId = string(member.workspaceMembershipId);
    for (const bundle of ['context', 'internal-task-manager'])
      await created('/company-' + bundle + '-assignments', {
        companyId,
        workspaceMembershipId: membershipId,
      });
    const actor = await json(
      await request('/access/current-actor', { companyId, subject: 'manager' }),
    );
    return { companyId, membershipId, actor };
  }
  return {
    request,
    created,
    setup,
    get pool() {
      return harness.pool;
    },
    async restart() {
      await harness.close();
      await open();
    },
    async close() {
      await harness.close();
      await database.close();
    },
  };
}
export type InternalTaskFixture = Awaited<
  ReturnType<typeof openInternalTaskFixture>
>;
