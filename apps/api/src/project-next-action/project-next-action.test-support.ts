import { randomUUID } from 'node:crypto';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

export const workspaceId = '00000000-0000-4000-8000-000000000993';
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public JSON object.');
  return Object.fromEntries(Object.entries(value));
}
export function string(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('Expected a public identifier.');
  return value;
}
export async function json(response: Response) {
  const value: unknown = await response.json();
  return object(value);
}
export async function openNextActionFixture(databaseUrl: string) {
  let harness: PostgresRestTestHarness;
  const database: IsolatedPostgresTestDatabase =
    await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'project_next_action',
    });
  async function open() {
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'next-action-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Next Action DEMO',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'next-action-colleague',
            workspaceId,
          },
        ]),
      },
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
    } = {},
  ) {
    const method = options.method ?? 'GET';
    return fetch(harness.origin + '/api' + path, {
      method,
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': options.subject ?? 'next-action-owner',
        'x-test-display-name': 'DEMO Coordinator',
        'x-test-email': 'coordinator@example.test',
        ...(options.workspaceId
          ? { 'x-workspace-context-id': options.workspaceId }
          : {}),
        ...(options.companyId
          ? { 'x-company-context-id': options.companyId }
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
      (await created('/companies', { displayName: 'Next Action DEMO' })).id,
    );
    const clientId = string(
      (
        await created(
          '/clients',
          { displayName: 'Synthetic Client' },
          companyId,
        )
      ).id,
    );
    const actor = await json(
      await request('/access/current-actor', { companyId }),
    );
    const membershipId = string(actor.workspaceMembershipId);
    await created('/company-project-assignments', {
      companyId,
      workspaceMembershipId: membershipId,
    });
    const project = await created(
      '/projects',
      { clientAccountId: clientId, title: 'Next action DEMO mission' },
      companyId,
    );
    const projectId = string(project.id);
    return {
      companyId,
      clientId,
      membershipId,
      actor,
      project,
      projectId,
      path: `/projects/${projectId}/next-action`,
    };
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
export type NextActionFixture = Awaited<
  ReturnType<typeof openNextActionFixture>
>;
