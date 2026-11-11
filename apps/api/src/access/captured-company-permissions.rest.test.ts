import { ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import { parseInternalUserId, parseWorkspaceId } from './access-identifiers.js';
import type { ActorContext } from './access.types.js';
import type { CompanyPermission } from './captured-company-permissions.js';
import { CompanyContextAuthorization } from './company-context-authorization.js';
import {
  companyRoleGrantVersion,
  companyRolePermissionsFor,
} from './company-permissions.js';
import { assignmentRouteCases } from './company-role-assignment.routes.test-fixture.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000001151';
const permissionCases = [
  ...assignmentRouteCases.filter(
    ({ bundle }) => bundle !== 'company_context_access',
  ),
  {
    bundle: 'company_knowledge_source_administrator',
    path: '/api/knowledge/assignments/administrators',
  },
  {
    bundle: 'company_knowledge_evidence_reader',
    path: '/api/knowledge/assignments/readers',
  },
] as const;

describe.skipIf(!databaseUrl)('Captured Company permission generations', () => {
  let isolated: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let database: DatabaseContext;
  let authorization: CompanyContextAuthorization;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    isolated = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'captured_permissions',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: isolated.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'capture-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Captured Permission Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'capture-member',
            workspaceId,
          },
        ]),
      },
    });
    database = new DatabaseContext(drizzle({ client: harness.pool }));
    authorization = new CompanyContextAuthorization(database);
  });
  beforeEach(async () => {
    await harness.pool.query('TRUNCATE workspaces, internal_users CASCADE');
  });
  afterAll(async () => {
    await harness?.close();
    await isolated?.close();
  });

  it.each(permissionCases)(
    'rechecks the exact captured generation of $bundle, including copied actors',
    async ({ bundle, path }) => {
      await request('/api/access/current-actor', 'GET');
      const memberResponse = await request(
        '/api/access/current-actor',
        'GET',
        undefined,
        'capture-member',
      );
      expect(memberResponse.status).toBe(200);
      const member = object(await memberResponse.json());
      const actor: ActorContext = {
        internalUserId: parseInternalUserId(string(member.internalUserId)),
        workspaceId: parseWorkspaceId(string(member.workspaceId)),
        workspaceMembershipId: string(member.workspaceMembershipId),
        workspaceName: string(member.workspaceName),
        displayName: string(member.displayName),
        email: string(member.email),
        active: true,
        workspacePermissions: [],
      };
      const created = await request('/api/companies', 'POST', {
        displayName: 'Synthetic captured Company',
      });
      expect(created.status).toBe(201);
      const companyId = string(object(await created.json()).id);
      const target = {
        companyId,
        workspaceMembershipId: actor.workspaceMembershipId,
      };
      expect(
        (await request('/api/company-context-assignments', 'POST', target))
          .status,
      ).toBe(201);
      const grant = await request(path, 'POST', target);
      expect(grant.status).toBe(201);
      const assignmentId = string(object(await grant.json()).id);
      const permissions: readonly CompanyPermission[] =
        companyRolePermissionsFor(bundle, companyRoleGrantVersion(bundle));
      const permission = permissions[0];
      if (!permission)
        throw new Error('Expected a versioned permission bundle.');
      const activeCompany = await authorization.resolveAuthorizedActiveCompany(
        actor,
        companyId,
      );
      if (!activeCompany)
        throw new Error('Expected a server-resolved Company.');
      const captured = { ...actor, activeCompany: { ...activeCompany } };
      const access = await database.transaction(() =>
        authorization.requirePermissions(captured, { permissions, lock: true }),
      );
      expect(access.companyId).toBe(companyId);
      expect(access.grants).toContainEqual({
        bundle,
        assignmentId,
        permissionSetVersion: companyRoleGrantVersion(bundle),
      });
      expect(access.grant(permission).assignmentId).toBe(assignmentId);

      expect(
        (
          await request(
            `${path}/${actor.workspaceMembershipId}/${companyId}`,
            'DELETE',
          )
        ).status,
      ).toBe(200);
      const replaced = await request(path, 'POST', target);
      expect(replaced.status).toBe(201);
      const replacementId = string(object(await replaced.json()).id);
      expect(replacementId).not.toBe(assignmentId);
      await expect(
        database.transaction(() =>
          authorization.requirePermissions(captured, {
            permissions,
            lock: true,
          }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        authorization.hasPermissions(captured, { permissions }),
      ).resolves.toBe(false);
      const refreshed = {
        ...actor,
        activeCompany: await authorization.resolveAuthorizedActiveCompany(
          actor,
          companyId,
        ),
      };
      const current = await authorization.requirePermissions(refreshed, {
        permissions,
      });
      expect(current.companyId).toBe(companyId);
      expect(current.grant(permission).assignmentId).toBe(replacementId);
    },
  );

  function request(
    path: string,
    method: string,
    value?: unknown,
    subject = 'capture-owner',
  ) {
    return fetch(harness.origin + path, {
      method,
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': subject,
        'x-test-display-name': subject,
        'x-test-email': `${subject}@example.test`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
  }
});

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an API object.');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected an API string.');
  return value;
}
