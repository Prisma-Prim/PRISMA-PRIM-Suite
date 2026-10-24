import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import { createPostgresRestTestHarness } from '../database/postgres-rest-test-harness.js';

export const pilotKey = 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE';
export const legacyKey = 'CONSULTING_PREPARATION_ILLUSTRATIVE';
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object.');
  return Object.fromEntries(Object.entries(value));
}
export function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string.');
  return value;
}
export function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected an array.');
  const rows: unknown[] = value;
  return rows.map(object);
}
export async function json(response: Response) {
  const value: unknown = await response.json();
  return object(value);
}
interface Options {
  method?: string;
  body?: unknown;
  key?: string;
  companyId?: string;
  subject?: string;
  workspaceId?: string;
}
export async function createPilotPlanFixture(baseDatabaseUrl: string) {
  const workspaceId = '00000000-0000-4000-8000-000000000838';
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl,
    namePrefix: 'pilot_plan',
  });
  const harness = await createPostgresRestTestHarness({
    databaseUrl: database.targetUrl,
    environment: {
      NODE_ENV: 'test',
      ACCESS_IDENTITY_MODE: 'test',
      ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
      ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'pilot-owner',
      ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
      ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Pilot planning DEMO',
      ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
        {
          provider: 'deterministic-test',
          subject: 'pilot-colleague',
          workspaceId,
        },
      ]),
    },
  });
  let companyId = '',
    clientId = '',
    membershipId = '';
  function request(path: string, options: Options = {}) {
    const subject = options.subject ?? 'pilot-owner';
    const company = options.companyId ?? companyId;
    return fetch(`${harness.origin}/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': subject,
        'x-test-display-name': subject,
        'x-test-email': `${subject}@example.test`,
        'content-type': 'application/json',
        'idempotency-key': options.key ?? randomUUID(),
        ...(company ? { 'x-company-context-id': company } : {}),
        ...(options.workspaceId
          ? { 'x-workspace-context-id': options.workspaceId }
          : {}),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  }
  async function read(path: string, options: Options = {}) {
    const response = await request(path, options);
    expect(response.status).toBe(200);
    return json(response);
  }
  async function command(path: string, body: unknown, options: Options = {}) {
    const response = await request(path, { ...options, method: 'POST', body });
    expect(response.status).toBe(201);
    return json(response);
  }
  function grant(path: string, target = membershipId) {
    return command(path, { companyId, workspaceMembershipId: target });
  }
  return {
    harness,
    request,
    read,
    command,
    grant,
    workspaceId,
    get companyId() {
      return companyId;
    },
    get clientId() {
      return clientId;
    },
    get membershipId() {
      return membershipId;
    },
    intent(overrides: Record<string, unknown> = {}) {
      return {
        title: 'Consulting pilot DEMO',
        clientAccountId: clientId,
        templateKey: pilotKey,
        templateVersion: 1,
        ...overrides,
      };
    },
    async reset() {
      await harness.pool.query('TRUNCATE workspaces, internal_users CASCADE');
      companyId = '';
      membershipId = text(
        (await read('/access/current-actor')).workspaceMembershipId,
      );
      companyId = text(
        (await command('/companies', { displayName: 'Pilot Company DEMO' })).id,
      );
      for (const path of [
        '/company-director-client-assignments',
        '/company-project-assignments',
        '/company-task-manager-assignments',
        '/company-project-template-user-assignments',
      ])
        await grant(path);
      clientId = text(
        (await command('/clients', { displayName: 'Pilot Client DEMO' })).id,
      );
    },
    async close() {
      await harness.close();
      await database.close();
    },
  };
}
export type PilotPlanFixture = Awaited<
  ReturnType<typeof createPilotPlanFixture>
>;
