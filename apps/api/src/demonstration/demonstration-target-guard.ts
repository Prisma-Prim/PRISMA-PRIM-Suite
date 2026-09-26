import { readMigrationFiles } from 'drizzle-orm/migrator';
import { Client } from 'pg';

/**
 * Read-only classification of a seed target. It runs in one read-only
 * PostgreSQL transaction, so the database itself refuses any write, and it
 * reads only what the refusal rules of Platform PRD section 17 need.
 */

export type DemonstrationTargetRefusal =
  'schema-not-latest' | 'other-workspace-present' | 'company-name-held';

export type DemonstrationTargetClassification =
  | {
      readonly kind: 'demonstration-target';
      /** The configured owner's current profile, when it already exists. */
      readonly owner: {
        readonly displayName: string;
        readonly email: string;
      } | null;
    }
  | { readonly kind: 'refused'; readonly reason: DemonstrationTargetRefusal };

export interface DemonstrationTargetInput {
  readonly databaseUrl: string;
  readonly workspaceId: string;
  readonly owner: { readonly provider: string; readonly subject: string };
  /** Each scenario Company display name with the key the seed registers it with. */
  readonly companies: readonly {
    readonly displayName: string;
    readonly registrationKey: string;
  }[];
  readonly migrationsFolder: string;
}

export async function classifyDemonstrationTarget(
  input: DemonstrationTargetInput,
): Promise<DemonstrationTargetClassification> {
  const expectedMigrations = readMigrationFiles({
    migrationsFolder: input.migrationsFolder,
  })
    .map((migration) => migration.folderMillis)
    .sort((left, right) => left - right);
  const client = new Client({ connectionString: input.databaseUrl });
  await client.connect();
  try {
    await client.query(
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );
    try {
      const classification = await classify(client, input, expectedMigrations);
      await client.query('COMMIT');
      return classification;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function classify(
  client: Client,
  input: DemonstrationTargetInput,
  expectedMigrations: readonly number[],
): Promise<DemonstrationTargetClassification> {
  if (!(await atLatestMigration(client, expectedMigrations)))
    return { kind: 'refused', reason: 'schema-not-latest' };

  const workspaces = await rows(
    client,
    'SELECT id::text AS id FROM workspaces',
  );
  if (
    workspaces.some(
      (row) =>
        column(row, 'id').toLowerCase() !== input.workspaceId.toLowerCase(),
    )
  )
    return { kind: 'refused', reason: 'other-workspace-present' };

  const companies = await rows(
    client,
    `SELECT display_name, registration_idempotency_key
       FROM companies
      WHERE workspace_id = $1::uuid AND display_name = ANY($2::text[])`,
    [input.workspaceId, input.companies.map((company) => company.displayName)],
  );
  const held = companies.some(
    (row) =>
      !input.companies.some(
        (company) =>
          company.displayName === column(row, 'display_name') &&
          company.registrationKey ===
            column(row, 'registration_idempotency_key'),
      ),
  );
  if (held) return { kind: 'refused', reason: 'company-name-held' };

  const [owner] = await rows(
    client,
    `SELECT display_name, email
       FROM internal_users
      WHERE external_provider = $1 AND external_subject = $2`,
    [input.owner.provider, input.owner.subject],
  );
  return {
    kind: 'demonstration-target',
    owner: owner
      ? {
          displayName: column(owner, 'display_name'),
          email: column(owner, 'email'),
        }
      : null,
  };
}

/**
 * The application's latest migration is applied exactly when the recorded
 * migrations are the committed journal entries. Drizzle orders and applies
 * migrations by their journal instant, so the instants are compared rather
 * than file hashes, which depend on the checkout's line endings.
 */
async function atLatestMigration(
  client: Client,
  expected: readonly number[],
): Promise<boolean> {
  const [table] = await rows(
    client,
    `SELECT CASE WHEN to_regclass('drizzle.__drizzle_migrations') IS NULL
                 THEN 'absent' ELSE 'present' END AS state`,
  );
  if (!table || column(table, 'state') !== 'present') return false;
  const recorded = (
    await rows(
      client,
      'SELECT created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC, id ASC',
    )
  ).map((row) => Number(column(row, 'created_at')));
  return (
    recorded.length === expected.length &&
    recorded.every((value, index) => value === expected[index])
  );
}

/** Stored rows are untrusted: every column read is proven to be text below. */
async function rows(
  client: Client,
  query: string,
  values: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  const result = await client.query<Record<string, unknown>>(query, values);
  return result.rows;
}

function column(row: Record<string, unknown>, name: string): string {
  const value = row[name];
  if (typeof value !== 'string')
    throw new Error(`The target column ${name} is not text.`);
  return value;
}
