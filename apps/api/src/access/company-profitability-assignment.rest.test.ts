import { ForbiddenException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseContext } from '../database/database-context.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import type { ActorContext } from './access.types.js';
import { CompanyContextAuthorization } from './company-context-authorization.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000498';
const BUNDLES = [
  {
    path: 'company-profitability-contributor-assignments',
    label: 'Company Profitability Contributor',
    storage: 'company_profitability_contributor',
    prefix: 'profitabilityContributor',
    action: 'company_profitability_contributor_assignment',
    permissions: [
      'commercial.profitability_estimate.read',
      'commercial.profitability_estimate.create',
    ],
  },
  {
    path: 'company-profitability-director-assignments',
    label: 'Company Profitability Director',
    storage: 'company_profitability_director',
    prefix: 'profitabilityDirector',
    action: 'company_profitability_director_assignment',
    permissions: [
      'commercial.profitability_estimate.read',
      'commercial.profitability_estimate.decide',
    ],
  },
];

withPostgres(
  'Profitability assignment administration and live authorization',
  () => {
    let isolated: IsolatedPostgresTestDatabase;
    let harness: PostgresRestTestHarness;
    let origin: string;
    let pool: Pool;
    let authorization: CompanyContextAuthorization;
    let sequence = 0;

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      isolated = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'profitability_assignments',
      });
      harness = await createPostgresRestTestHarness({
        databaseUrl: isolated.targetUrl,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'owner',
          ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Synthetic Profitability Workspace',
          ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
            {
              provider: 'deterministic-test',
              subject: 'member',
              workspaceId: WORKSPACE_ID,
            },
          ]),
        },
      });
      ({ origin, pool } = harness);
      authorization = new CompanyContextAuthorization(
        new DatabaseContext(drizzle({ client: pool })),
      );
    });
    beforeEach(async () => {
      await pool.query('TRUNCATE workspaces, internal_users CASCADE');
    });
    afterAll(async () => {
      await harness?.close();
      await isolated?.close();
    });

    it.each(BUNDLES)(
      '$label captures v1, replays/no-ops atomically and records only actual transitions',
      async (bundle) => {
        const owner = await actor('owner');
        const member = await actor('member');
        const companyId = await company();
        const key = `explicit-${bundle.storage}`;
        const body = {
          workspaceMembershipId: member.workspaceMembershipId,
          companyId,
        };
        const granted = await request(bundle.path, 'POST', body, key);
        expect(granted.status).toBe(201);
        const assignment = record(await granted.json());
        expect(assignment).toMatchObject({
          ...body,
          bundle: bundle.label,
          active: true,
          permissionSetVersion: 'v1',
        });
        expect((await request(bundle.path, 'POST', body, key)).status).toBe(
          201,
        );
        expect((await request(bundle.path, 'POST', body)).status).toBe(201);
        expect(
          (await request(bundle.path, 'POST', body, undefined, 'member'))
            .status,
        ).toBe(403);
        expect((await selected('member', companyId)).status).toBe(403);
        await grant(
          'company-context-assignments',
          member.workspaceMembershipId,
          companyId,
        );
        const projection = record(
          await (await selected('member', companyId)).json(),
        );
        expect(record(projection.activeCompany)).toMatchObject({
          [`${bundle.prefix}Permissions`]: bundle.permissions,
          [`${bundle.prefix}PermissionAssignmentId`]: assignment.id,
          [`${bundle.prefix}PermissionSetVersion`]: 'v1',
        });
        const administration = await request(
          'company-context-assignments/administration',
          'GET',
        );
        expect(record(await administration.json()).assignments).toContainEqual(
          assignment,
        );
        const activityBefore = await activity('owner');
        expect(
          activityBefore.filter(
            (event) => event.action === `${bundle.action}.granted`,
          ),
        ).toEqual([
          expect.objectContaining({
            actor: {
              internalUserId: owner.internalUserId,
              displayName: 'owner',
            },
            target: expect.objectContaining({
              type: 'company_role_assignment',
              assignmentId: assignment.id,
              workspaceMembershipId: member.workspaceMembershipId,
              internalUserId: member.internalUserId,
            }),
            metadata: { bundle: bundle.label },
            occurredAt: expect.any(String),
          }),
        ]);
        expect(
          (await activity('member')).some(
            (event) =>
              typeof event.action === 'string' &&
              event.action.startsWith(bundle.action),
          ),
        ).toBe(false);
        const revokePath = `${bundle.path}/${member.workspaceMembershipId}/${companyId}`;
        expect(
          (await request(revokePath, 'DELETE', undefined, 'revoke')).status,
        ).toBe(200);
        expect(
          (await request(revokePath, 'DELETE', undefined, 'revoke')).status,
        ).toBe(200);
        expect((await request(revokePath, 'DELETE')).status).toBe(200);
        const after = record(
          record(await (await selected('member', companyId)).json())
            .activeCompany,
        );
        expect(after[`${bundle.prefix}Permissions`]).toBeUndefined();
        const events = (await activity('owner')).filter(
          (event) =>
            typeof event.action === 'string' &&
            event.action.startsWith(bundle.action),
        );
        expect(events.map((event) => event.action).sort()).toEqual([
          `${bundle.action}.granted`,
          `${bundle.action}.revoked`,
        ]);
        expect((await request(bundle.path, 'POST', body)).status).toBe(201);
      },
    );

    it('requires separate current grants for read, create and decide; stale actor data cannot preserve revoked authority', async () => {
      await actor('owner');
      const member = await actor('member');
      const companyId = await company();
      await grant(
        'company-context-assignments',
        member.workspaceMembershipId,
        companyId,
      );
      const captured: ActorContext = {
        ...member,
        activeCompany: {
          id: companyId,
          displayName: 'Synthetic Company',
          clientPermissions: [],
          profitabilityContributorPermissions: [
            'commercial.profitability_estimate.read',
            'commercial.profitability_estimate.create',
          ],
          profitabilityDirectorPermissions: [
            'commercial.profitability_estimate.read',
            'commercial.profitability_estimate.decide',
          ],
        },
      };
      for (const operation of ['read', 'create', 'decide'] as const)
        await expect(
          authorization.requireProfitabilityEstimateAccess(captured, operation),
        ).rejects.toBeInstanceOf(ForbiddenException);
      await grant(BUNDLES[0].path, member.workspaceMembershipId, companyId);
      await expect(
        authorization.requireProfitabilityEstimateAccess(captured, 'read'),
      ).resolves.toBe(companyId);
      await expect(
        authorization.requireProfitabilityEstimateAccess(captured, 'create'),
      ).resolves.toBe(companyId);
      await expect(
        authorization.requireProfitabilityEstimateAccess(captured, 'decide'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await request(
        `${BUNDLES[0].path}/${member.workspaceMembershipId}/${companyId}`,
        'DELETE',
      );
      await grant(BUNDLES[1].path, member.workspaceMembershipId, companyId);
      await expect(
        authorization.requireProfitabilityEstimateAccess(captured, 'read'),
      ).resolves.toBe(companyId);
      await expect(
        authorization.requireProfitabilityEstimateAccess(captured, 'decide'),
      ).resolves.toBe(companyId);
      await expect(
        authorization.requireProfitabilityEstimateAccess(captured, 'create'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await grant(BUNDLES[0].path, member.workspaceMembershipId, companyId);
      await expect(
        authorization.requireProfitabilityEstimateAccess(captured, 'create'),
      ).resolves.toBe(companyId);
      await request(
        `company-context-assignments/${member.workspaceMembershipId}/${companyId}`,
        'DELETE',
      );
      for (const operation of ['read', 'create', 'decide'] as const)
        await expect(
          authorization.requireProfitabilityEstimateAccess(captured, operation),
        ).rejects.toBeInstanceOf(ForbiddenException);
      await grant(
        'company-context-assignments',
        member.workspaceMembershipId,
        companyId,
      );
      await pool.query(
        "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
        [member.workspaceMembershipId],
      );
      await expect(
        authorization.requireProfitabilityEstimateAccess(captured, 'read'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each(BUNDLES)(
      '$label rejects inactive and foreign targets without recording transitions',
      async (bundle) => {
        const owner = await actor('owner');
        const member = await actor('member');
        const companyId = await company();
        await pool.query(
          "UPDATE companies SET status = 'inactive' WHERE id = $1",
          [companyId],
        );
        const unavailable = {
          workspaceMembershipId: member.workspaceMembershipId,
          companyId,
        };
        const inactive = await request(bundle.path, 'POST', unavailable);
        expect(inactive.status).toBe(403);
        const foreignWorkspaceId = '00000000-0000-4000-8000-000000004981';
        const foreignCompanyId = '00000000-0000-4000-8000-000000004982';
        await pool.query('INSERT INTO workspaces (id,name) VALUES ($1,$2)', [
          foreignWorkspaceId,
          'Other Synthetic Workspace',
        ]);
        const foreignMembershipId = '00000000-0000-4000-8000-000000004983';
        await pool.query(
          'INSERT INTO workspace_memberships (id,workspace_id,internal_user_id) VALUES ($1,$2,$3)',
          [foreignMembershipId, foreignWorkspaceId, owner.internalUserId],
        );
        await pool.query(
          'INSERT INTO companies (id,workspace_id,display_name,created_by_internal_user_id,created_by_workspace_membership_id,registration_idempotency_key) VALUES ($1,$2,$3,$4,$5,$6)',
          [
            foreignCompanyId,
            foreignWorkspaceId,
            'Other Synthetic Company',
            owner.internalUserId,
            foreignMembershipId,
            'synthetic-foreign-company',
          ],
        );
        const foreign = await request(bundle.path, 'POST', {
          ...unavailable,
          companyId: foreignCompanyId,
        });
        expect(foreign.status).toBe(403);
        expect(await foreign.json()).toEqual(await inactive.json());
        expect(
          (await activity('owner')).some(
            (event) =>
              typeof event.action === 'string' &&
              event.action.startsWith(bundle.action),
          ),
        ).toBe(false);
      },
    );

    async function actor(subject: string): Promise<ActorContext> {
      const response = await request(
        'access/current-actor',
        'GET',
        undefined,
        undefined,
        subject,
      );
      expect(response.status).toBe(200);
      const value = record(await response.json());
      return {
        internalUserId: string(value.internalUserId),
        workspaceMembershipId: string(value.workspaceMembershipId),
        workspaceId: string(value.workspaceId),
        workspaceName: string(value.workspaceName),
        displayName: string(value.displayName),
        email: string(value.email),
        active: true,
        workspacePermissions: [],
      };
    }
    async function company(): Promise<string> {
      const response = await request('companies', 'POST', {
        displayName: 'Synthetic Company',
      });
      expect(response.status).toBe(201);
      return string(record(await response.json()).id);
    }
    async function grant(
      path: string,
      workspaceMembershipId: string,
      companyId: string,
    ) {
      expect(
        (await request(path, 'POST', { workspaceMembershipId, companyId }))
          .status,
      ).toBe(201);
    }
    function selected(subject: string, companyId: string) {
      return fetch(`${origin}/api/access/current-actor`, {
        headers: { ...headers(subject), 'x-company-context-id': companyId },
      });
    }
    async function activity(subject: string) {
      const response = await request(
        'activity-log',
        'GET',
        undefined,
        undefined,
        subject,
      );
      expect(response.status).toBe(200);
      const events = record(await response.json()).events;
      if (!Array.isArray(events)) throw new Error('Expected Activity events.');
      return events.map(record);
    }
    function request(
      path: string,
      method: string,
      body?: unknown,
      key?: string,
      subject = 'owner',
    ) {
      return fetch(`${origin}/api/${path}`, {
        method,
        headers: {
          ...headers(subject),
          'content-type': 'application/json',
          'idempotency-key': key ?? `profitability-assignment-${++sequence}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
  },
);

function headers(subject: string) {
  return {
    'x-test-external-provider': 'deterministic-test',
    'x-test-external-subject': subject,
    'x-test-display-name': subject,
    'x-test-email': `${subject}@example.test`,
  };
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected a record.');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string.');
  return value;
}
