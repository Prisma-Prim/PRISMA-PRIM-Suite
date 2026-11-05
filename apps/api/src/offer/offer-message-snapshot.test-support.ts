import { Pool } from 'pg';
import { assertLocalTestDatabaseUrl } from '../database/test-database-target.js';

/** Full rows, including empty negative-control tables; no count-only evidence. */
export async function snapshotOfferMessageState(
  pool: Pool,
  workspaceId: string,
) {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables = await connection.query<{ table_name: string }>(
      `SELECT t.table_name FROM information_schema.tables t
       JOIN information_schema.columns c
         ON c.table_schema=t.table_schema AND c.table_name=t.table_name
       WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
         AND c.column_name='workspace_id'
       ORDER BY t.table_name`,
    );
    const business: Record<string, unknown[]> = {};
    for (const table of tables.rows) {
      if (!/^[a-z][a-z0-9_]*$/u.test(table.table_name))
        throw new Error('Unexpected test database table identifier.');
      // Only validated catalog identifiers enter SQL; scope stays a parameter.
      const result = await connection.query<{ row: unknown }>(
        `SELECT to_jsonb(scoped) AS row FROM public."${table.table_name}" scoped
         WHERE workspace_id=$1 ORDER BY to_jsonb(scoped)::text`,
        [workspaceId],
      );
      business[table.table_name] = result.rows.map((row) => row.row);
    }
    const workspace = await connection.query<{ row: unknown }>(
      'SELECT to_jsonb(w) AS row FROM workspaces w WHERE id=$1 ORDER BY id',
      [workspaceId],
    );
    business.workspaces = workspace.rows.map((row) => row.row);
    const profiles = await connection.query<{ row: unknown }>(
      `SELECT to_jsonb(u) AS row FROM internal_users u
       WHERE EXISTS (SELECT 1 FROM workspace_memberships m
                     WHERE m.internal_user_id=u.id AND m.workspace_id=$1)
       ORDER BY u.id`,
      [workspaceId],
    );
    await connection.query('COMMIT');
    return {
      business,
      // Identity-provider profile synchronization is technical, not a business write.
      identityProfiles: profiles.rows.map((row) => row.row),
    };
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }
}

/** Browser global setup keeps its isolated URL private; locate its native Company. */
export async function snapshotOfferMessageAcceptanceState(input: {
  baseDatabaseUrl: string;
  workspaceId: string;
  companyId: string;
}) {
  assertLocalTestDatabaseUrl(input.baseDatabaseUrl);
  const catalog = new Pool({ connectionString: input.baseDatabaseUrl, max: 1 });
  const matches: string[] = [];
  try {
    const databases = await catalog.query<{ datname: string }>(
      `SELECT datname FROM pg_database
       WHERE datallowconn AND datname ~ '^operational_acceptance_[0-9a-f]{32}_test$'
       ORDER BY datname`,
    );
    for (const database of databases.rows) {
      if (!/^operational_acceptance_[0-9a-f]{32}_test$/u.test(database.datname))
        throw new Error('Unexpected acceptance database identifier.');
      const target = new URL(input.baseDatabaseUrl);
      target.pathname = '/' + database.datname;
      assertLocalTestDatabaseUrl(target.toString());
      const candidate = new Pool({
        connectionString: target.toString(),
        max: 1,
      });
      try {
        const company = await candidate.query<{ id: string }>(
          'SELECT id FROM companies WHERE workspace_id=$1 AND id=$2',
          [input.workspaceId, input.companyId],
        );
        if (company.rows.length === 1) matches.push(target.toString());
      } finally {
        await candidate.end();
      }
    }
  } finally {
    await catalog.end();
  }
  const [connectionString] = matches;
  if (matches.length !== 1 || !connectionString)
    throw new Error(
      'Expected exactly one isolated acceptance Company database.',
    );
  const pool = new Pool({ connectionString, max: 1 });
  try {
    return await snapshotOfferMessageState(pool, input.workspaceId);
  } finally {
    await pool.end();
  }
}
