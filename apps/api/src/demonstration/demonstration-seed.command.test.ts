import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  runDemonstrationSeedCommand,
  type DemonstrationSeedCommandResult,
} from './demonstration-seed.command.js';
import { DEMONSTRATION_SCENARIO } from './demonstration-scenario.js';

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000409';
const OTHER_WORKSPACE_ID = '00000000-0000-4000-8000-000000000410';
// Port 9 (discard) never serves PostgreSQL: a refusal proves no connection.
const UNREACHABLE_DATABASE_URL =
  'postgresql://unused:unused@127.0.0.1:9/never_test';

function environment(
  databaseUrl: string,
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'local-demo',
    ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'local-demonstration-user',
    ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
    ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'PRISMA DEMO Workspace',
    ...overrides,
  };
}

async function seed(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): Promise<{ result: DemonstrationSeedCommandResult; lines: unknown[] }> {
  const lines: unknown[] = [];
  const result = await runDemonstrationSeedCommand({
    argv,
    environment: env,
    write: (line) => lines.push(JSON.parse(line)),
  });
  return { result, lines };
}

const CONFIRMED = ['--confirm-workspace', WORKSPACE_ID];
const COMMERCIAL_STEPS = new Set([
  'commercial.prisma-prim.offer.prepare',
  'commercial.prisma-prim.offer.quality',
  'commercial.prisma-prim.offer.approve',
  'commercial.prisma-prim.contract.prepare',
  'commercial.prisma-prim.contract.quality',
  'commercial.prisma-prim.contract.approve',
]);

function outcomeOf(line: unknown): unknown {
  return typeof line === 'object' && line !== null && 'outcome' in line
    ? line.outcome
    : undefined;
}

describe('demonstration seed command refusals before any database access', () => {
  it.each([
    [
      'an unknown option',
      ['--force'],
      environment(UNREACHABLE_DATABASE_URL),
      'invalid-arguments',
    ],
    [
      'two confirmations',
      [...CONFIRMED, `--confirm-workspace=${WORKSPACE_ID}`],
      environment(UNREACHABLE_DATABASE_URL),
      'invalid-arguments',
    ],
    [
      'a malformed confirmation',
      ['--confirm-workspace', 'workspace'],
      environment(UNREACHABLE_DATABASE_URL),
      'invalid-arguments',
    ],
    [
      'an incomplete bootstrap configuration',
      CONFIRMED,
      environment(UNREACHABLE_DATABASE_URL, {
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: undefined,
      }),
      'configuration-incomplete',
    ],
    [
      'no confirmation',
      [],
      environment(UNREACHABLE_DATABASE_URL),
      'confirmation-required',
    ],
    [
      'another Workspace confirmation',
      ['--confirm-workspace', OTHER_WORKSPACE_ID],
      environment(UNREACHABLE_DATABASE_URL),
      'confirmation-mismatch',
    ],
    [
      'a configured Workspace name without DEMO',
      CONFIRMED,
      environment(UNREACHABLE_DATABASE_URL, {
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'PRISMA Workspace',
      }),
      'workspace-name-without-demo',
    ],
    [
      'an owner using the persona provider',
      CONFIRMED,
      environment(UNREACHABLE_DATABASE_URL, {
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'demo-seed',
      }),
      'owner-provider-reserved',
    ],
    [
      'a production environment',
      CONFIRMED,
      environment(UNREACHABLE_DATABASE_URL, { NODE_ENV: 'production' }),
      'production-environment',
    ],
    [
      'a missing environment name',
      CONFIRMED,
      environment(UNREACHABLE_DATABASE_URL, { NODE_ENV: undefined }),
      'production-environment',
    ],
    [
      'an unapproved environment name',
      CONFIRMED,
      environment(UNREACHABLE_DATABASE_URL, { NODE_ENV: 'staging' }),
      'production-environment',
    ],
  ])('refuses %s with a named reason', async (_case, argv, env, reason) => {
    const { result, lines } = await seed(argv, env);
    expect(result).toEqual({
      exitCode: 2,
      outcome: 'refused',
      refusal: reason,
      providerCallAttempts: 0,
    });
    expect(lines).toEqual([{ scenario: 'demo-v3', result: 'refused', reason }]);
  });
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = testDatabaseUrl ? describe : describe.skip;

withPostgres('demonstration seed command against PostgreSQL', () => {
  let database: IsolatedPostgresTestDatabase;
  let pool: Pool;

  async function identitySnapshot() {
    return (
      await pool.query<{
        id: string;
        provider: string;
        subject: string;
        displayName: string;
        email: string;
        status: string;
        createdAt: string;
        updatedAt: string;
      }>(
        `SELECT id, external_provider AS provider, external_subject AS subject,
                display_name AS "displayName", email, status,
                created_at::text AS "createdAt", updated_at::text AS "updatedAt"
           FROM internal_users
          ORDER BY external_provider, external_subject`,
      )
    ).rows;
  }

  async function snapshot(): Promise<Record<string, number>> {
    const tables = await pool.query<{ schema: string; name: string }>(
      `SELECT table_schema AS schema, table_name AS name
         FROM information_schema.tables
        WHERE table_schema IN ('public', 'drizzle') AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name`,
    );
    const counts: Record<string, number> = {};
    for (const table of tables.rows) {
      const result = await pool.query<{ count: number }>(
        `SELECT count(*)::integer AS count FROM "${table.schema}"."${table.name}"`,
      );
      counts[`${table.schema}.${table.name}`] = result.rows[0]?.count ?? -1;
    }
    return counts;
  }

  async function expectRefusedWithoutWrites(reason: string): Promise<void> {
    const before = await snapshot();
    const { result, lines } = await seed(
      CONFIRMED,
      environment(database.targetUrl),
    );
    expect(result).toMatchObject({
      exitCode: 2,
      outcome: 'refused',
      refusal: reason,
      providerCallAttempts: 0,
    });
    expect(lines).toEqual([{ scenario: 'demo-v3', result: 'refused', reason }]);
    expect(await snapshot()).toEqual(before);
  }

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: testDatabaseUrl,
      namePrefix: 'demo_seed_command',
    });
    pool = database.targetPool;
  }, 60_000);

  afterAll(async () => {
    await database?.close();
  });

  it('refuses a markerless persisted persona before creating its Workspace Membership', async () => {
    if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const isolated = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: testDatabaseUrl,
      namePrefix: 'demo_seed_markerless',
    });
    try {
      await migrate(drizzle({ client: isolated.targetPool }), {
        migrationsFolder: './drizzle',
      });
      await isolated.targetPool.query(
        `INSERT INTO internal_users
           (external_provider, external_subject, display_name, email)
         VALUES ('demo-seed', 'DEMO-persona-ana', 'Ana Popescu',
                 'ana.demo@example.test')`,
      );

      const stopped = await seed(CONFIRMED, environment(isolated.targetUrl));

      expect(stopped.result).toEqual({
        exitCode: 3,
        outcome: 'stopped',
        providerCallAttempts: 0,
      });
      expect(stopped.lines.at(-1)).toEqual({
        scenario: 'demo-v3',
        result: 'stopped',
        step: 'persona.ana',
        reason: 'persona-not-synthetic',
        status: 403,
      });
      expect(
        (
          await isolated.targetPool.query<{ count: number }>(
            `SELECT count(*)::integer AS count
               FROM workspace_memberships AS membership
               JOIN internal_users AS internal_user
                 ON internal_user.id = membership.internal_user_id
              WHERE internal_user.external_provider = 'demo-seed'
                AND internal_user.external_subject = 'DEMO-persona-ana'`,
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (
          await isolated.targetPool.query<{ displayName: string }>(
            `SELECT display_name AS "displayName"
               FROM internal_users
              WHERE external_provider = 'demo-seed'
                AND external_subject = 'DEMO-persona-ana'`,
          )
        ).rows,
      ).toEqual([{ displayName: 'Ana Popescu' }]);
    } finally {
      await isolated.close();
    }
  }, 60_000);

  it('refuses every non-demonstration target, then converges idempotently through the public API', async () => {
    // A database that is not at the application's latest migration.
    await expectRefusedWithoutWrites('schema-not-latest');
    expect(await snapshot()).toEqual({});

    await migrate(drizzle({ client: pool }), { migrationsFolder: './drizzle' });

    // A database holding another Workspace.
    await pool.query(
      `INSERT INTO workspaces (id, name) VALUES ($1, 'Other Workspace')`,
      [OTHER_WORKSPACE_ID],
    );
    await expectRefusedWithoutWrites('other-workspace-present');
    await pool.query('DELETE FROM workspaces WHERE id = $1', [
      OTHER_WORKSPACE_ID,
    ]);

    // The configured id cannot turn an existing non-DEMO Workspace into a target.
    await pool.query(
      `INSERT INTO workspaces (id, name) VALUES ($1, 'PRISMA Workspace')`,
      [WORKSPACE_ID],
    );
    await expectRefusedWithoutWrites('workspace-name-without-demo');
    expect(
      (
        await pool.query<{ name: string }>(
          'SELECT name FROM workspaces WHERE id = $1',
          [WORKSPACE_ID],
        )
      ).rows,
    ).toEqual([{ name: 'PRISMA Workspace' }]);
    await pool.query('DELETE FROM workspaces WHERE id = $1', [WORKSPACE_ID]);

    // A stale DEMO configuration must never undo an operator rename.
    await pool.query(
      "INSERT INTO workspaces (id, name) VALUES ($1, 'Renamed DEMO Workspace')",
      [WORKSPACE_ID],
    );
    await expectRefusedWithoutWrites('workspace-name-mismatch');
    expect(
      (
        await pool.query('SELECT name FROM workspaces WHERE id = $1', [
          WORKSPACE_ID,
        ])
      ).rows,
    ).toEqual([{ name: 'Renamed DEMO Workspace' }]);
    await pool.query('DELETE FROM workspaces WHERE id = $1', [WORKSPACE_ID]);

    // No confirmation, against the real target: nothing is written.
    const beforeUnconfirmed = await snapshot();
    expect(
      (await seed([], environment(database.targetUrl))).result.refusal,
    ).toBe('confirmation-required');
    expect(await snapshot()).toEqual(beforeUnconfirmed);

    const first = await seed(CONFIRMED, environment(database.targetUrl));
    expect(first.result).toEqual({
      exitCode: 0,
      outcome: 'converged',
      providerCallAttempts: 0,
    });
    const steps = DEMONSTRATION_SCENARIO.steps;
    expect(first.lines).toHaveLength(steps.length + 2);
    expect(first.lines[0]).toEqual({
      scenario: 'demo-v3',
      workspace: { id: WORKSPACE_ID, name: 'PRISMA DEMO Workspace' },
    });
    expect(first.lines.slice(1, -1)).toEqual(
      steps.map((step) =>
        expect.objectContaining({
          scenario: 'demo-v3',
          step: step.key,
          outcome: COMMERCIAL_STEPS.has(step.key) ? 'confirmed' : 'created',
          recordId: expect.any(String),
          ...(step.register ? { register: step.register } : {}),
        }),
      ),
    );
    expect(first.lines.at(-1)).toMatchObject({
      scenario: 'demo-v3',
      result: 'converged',
      companies: [
        { key: 'prisma-prim', displayName: 'PRISMA-PRIM' },
        { key: 'bic', displayName: 'BIC' },
        { key: 'ecg', displayName: 'ECG' },
      ],
      personas: [
        {
          key: 'ana',
          displayName: 'Ana DEMO',
          company: 'PRISMA-PRIM',
          profile: 'DEMO Manager',
        },
        {
          key: 'ion',
          displayName: 'Ion DEMO',
          company: 'PRISMA-PRIM',
          profile: 'DEMO Consultant',
        },
        {
          key: 'maria',
          displayName: 'Maria DEMO',
          company: 'BIC',
          profile: 'DEMO Manager',
        },
        {
          key: 'victor',
          displayName: 'Victor DEMO',
          company: 'ECG',
          profile: 'DEMO Restricted member',
          bundles: ['Company Context Access'],
        },
      ],
    });
    // Only the configured owner and the dedicated persona principals exist.
    expect(await identitySnapshot()).toEqual([
      {
        id: expect.any(String),
        provider: 'demo-seed',
        subject: 'DEMO-persona-ana',
        displayName: 'Ana DEMO',
        email: 'ana.demo@example.test',
        status: 'active',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
      {
        id: expect.any(String),
        provider: 'demo-seed',
        subject: 'DEMO-persona-ion',
        displayName: 'Ion DEMO',
        email: 'ion.demo@example.test',
        status: 'active',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
      {
        id: expect.any(String),
        provider: 'demo-seed',
        subject: 'DEMO-persona-maria',
        displayName: 'Maria DEMO',
        email: 'maria.demo@example.test',
        status: 'active',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
      {
        id: expect.any(String),
        provider: 'demo-seed',
        subject: 'DEMO-persona-victor',
        displayName: 'Victor DEMO',
        email: 'victor.demo@example.test',
        status: 'active',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
      {
        id: expect.any(String),
        provider: 'local-demo',
        subject: 'local-demonstration-user',
        displayName: 'DEMO Workspace owner',
        email: 'workspace-owner@example.test',
        status: 'active',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    ]);

    await pool.query(
      `UPDATE internal_users
          SET updated_at = TIMESTAMPTZ '2026-01-01 00:00:00+00'`,
    );
    await pool.query(
      `UPDATE internal_users
          SET display_name = 'Ana DEMO corrected',
              email = 'ana.corrected.demo@example.test'
        WHERE external_provider = 'demo-seed'
          AND external_subject = 'DEMO-persona-ana'`,
    );
    const identitiesBeforeReplay = await identitySnapshot();
    const afterFirst = await snapshot();
    const second = await seed(CONFIRMED, environment(database.targetUrl));
    expect(second.result).toMatchObject({
      exitCode: 0,
      providerCallAttempts: 0,
    });
    for (const [index, line] of second.lines.slice(1, -1).entries()) {
      const step = steps[index];
      if (!step) throw new Error('Unexpected manifest step.');
      if (COMMERCIAL_STEPS.has(step.key))
        expect(outcomeOf(line)).toBe('confirmed');
      else expect(['replayed', 'present']).toContain(outcomeOf(line));
    }
    expect(await identitySnapshot()).toEqual(identitiesBeforeReplay);
    expect(await snapshot()).toEqual(afterFirst);

    // A preserved persona profile that lost its synthetic marker is never
    // overwritten and stops the run before later scenario commands.
    await pool.query(
      `UPDATE internal_users
          SET display_name = 'Ana Popescu'
        WHERE external_provider = 'demo-seed'
          AND external_subject = 'DEMO-persona-ana'`,
    );
    const identitiesBeforeProfileStop = await identitySnapshot();
    const rowsBeforeProfileStop = await snapshot();
    const profileStop = await seed(CONFIRMED, environment(database.targetUrl));
    expect(profileStop.result).toEqual({
      exitCode: 3,
      outcome: 'stopped',
      providerCallAttempts: 0,
    });
    expect(profileStop.lines.at(-1)).toEqual({
      scenario: 'demo-v3',
      result: 'stopped',
      step: 'persona.ana',
      reason: 'persona-not-synthetic',
      status: 403,
    });
    expect(await identitySnapshot()).toEqual(identitiesBeforeProfileStop);
    expect(await snapshot()).toEqual(rowsBeforeProfileStop);
    await pool.query(
      `UPDATE internal_users
          SET display_name = 'Ana DEMO corrected'
        WHERE external_provider = 'demo-seed'
          AND external_subject = 'DEMO-persona-ana'`,
    );

    // A historical revocation under an operator key leaves the stable seed
    // key unused. The seed must still stop before sending a replacement grant.
    await pool.query(
      `UPDATE company_role_assignments AS assignment
          SET revoked_at = TIMESTAMPTZ '2026-01-02 00:00:00+00',
              updated_at = TIMESTAMPTZ '2026-01-02 00:00:00+00'
         FROM company_context_assignment_commands AS command
        WHERE command.result_assignment_id = assignment.id
          AND command.idempotency_key = 'demo-v1:grant.ana.context'`,
    );
    await pool.query(
      `UPDATE company_context_assignment_commands
          SET idempotency_key = 'operator-historical-ana-context'
        WHERE idempotency_key = 'demo-v1:grant.ana.context'`,
    );
    const revokedGrantBeforeReplay = (
      await pool.query<{
        id: string;
        idempotencyKey: string;
        revokedAt: string;
        updatedAt: string;
      }>(
        `SELECT assignment.id::text AS id,
                command.idempotency_key AS "idempotencyKey",
                assignment.revoked_at::text AS "revokedAt",
                assignment.updated_at::text AS "updatedAt"
           FROM company_role_assignments AS assignment
           JOIN company_context_assignment_commands AS command
             ON command.result_assignment_id = assignment.id
          WHERE command.idempotency_key = 'operator-historical-ana-context'`,
      )
    ).rows;
    expect(revokedGrantBeforeReplay).toHaveLength(1);
    const identitiesBeforeRevokedGrantStop = await identitySnapshot();
    const rowsBeforeRevokedGrantStop = await snapshot();
    const revokedGrantStop = await seed(
      CONFIRMED,
      environment(database.targetUrl),
    );
    expect(revokedGrantStop.result).toEqual({
      exitCode: 3,
      outcome: 'stopped',
      providerCallAttempts: 0,
    });
    expect(revokedGrantStop.lines.at(-1)).toEqual({
      scenario: 'demo-v3',
      result: 'stopped',
      step: 'grant.ana.context',
      reason: 'grant-revoked',
      status: null,
    });
    expect(await identitySnapshot()).toEqual(identitiesBeforeRevokedGrantStop);
    expect(await snapshot()).toEqual(rowsBeforeRevokedGrantStop);
    expect(
      (
        await pool.query<{
          id: string;
          idempotencyKey: string;
          revokedAt: string;
          updatedAt: string;
        }>(
          `SELECT assignment.id::text AS id,
                  command.idempotency_key AS "idempotencyKey",
                  assignment.revoked_at::text AS "revokedAt",
                  assignment.updated_at::text AS "updatedAt"
             FROM company_role_assignments AS assignment
             JOIN company_context_assignment_commands AS command
               ON command.result_assignment_id = assignment.id
            WHERE command.idempotency_key = 'operator-historical-ana-context'`,
        )
      ).rows,
    ).toEqual(revokedGrantBeforeReplay);
    await pool.query(
      `UPDATE company_context_assignment_commands
          SET idempotency_key = 'demo-v1:grant.ana.context'
        WHERE idempotency_key = 'operator-historical-ana-context'`,
    );
    await pool.query(
      `UPDATE company_role_assignments AS assignment
          SET revoked_at = NULL
         FROM company_context_assignment_commands AS command
        WHERE command.result_assignment_id = assignment.id
          AND command.idempotency_key = 'demo-v1:grant.ana.context'`,
    );

    // A scenario Company display name held by a Company the seed did not register.
    await pool.query(
      `INSERT INTO companies (workspace_id, display_name, created_by_internal_user_id,
                              created_by_workspace_membership_id, registration_idempotency_key)
       SELECT workspace_id, 'BIC', created_by_internal_user_id,
              created_by_workspace_membership_id, 'hand-made-company'
         FROM companies LIMIT 1`,
    );
    await expectRefusedWithoutWrites('company-name-held');
    await pool.query(
      `DELETE FROM companies WHERE registration_idempotency_key = 'hand-made-company'`,
    );

    // A database behind the application's latest migration.
    const [latest] = (
      await pool.query<{ id: number; hash: string; created_at: string }>(
        `SELECT id, hash, created_at::text AS created_at
           FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`,
      )
    ).rows;
    if (!latest) throw new Error('The migrated database has no migration.');
    await pool.query('DELETE FROM drizzle.__drizzle_migrations WHERE id = $1', [
      latest.id,
    ]);
    await expectRefusedWithoutWrites('schema-not-latest');
    await pool.query(
      'INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES ($1, $2, $3::bigint)',
      [latest.id, latest.hash, latest.created_at],
    );
  }, 240_000);
});
