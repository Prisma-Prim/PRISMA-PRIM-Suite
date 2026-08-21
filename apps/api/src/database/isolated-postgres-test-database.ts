import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import {
  cleanupIsolatedTargetDatabase,
  waitForPostgresCallbackOrAbort,
  waitForTargetDatabaseConnectionsToClose,
} from './isolated-postgres-test-lifecycle.js';
import { assertLocalTestDatabaseUrl } from './test-database-target.js';

export interface IsolatedPostgresTestDatabase {
  readonly databaseName: string;
  readonly targetUrl: string;
  readonly administrationPool: Pool;
  readonly targetPool: Pool;
  close(): Promise<void>;
}

export interface CreateIsolatedPostgresTestDatabaseOptions {
  readonly baseDatabaseUrl: string;
  readonly namePrefix: string;
}

export async function createIsolatedPostgresTestDatabase({
  baseDatabaseUrl,
  namePrefix,
}: CreateIsolatedPostgresTestDatabaseOptions): Promise<IsolatedPostgresTestDatabase> {
  assertLocalTestDatabaseUrl(baseDatabaseUrl);
  const databaseName = isolatedDatabaseName(namePrefix);
  const administrationPool = new Pool({ connectionString: baseDatabaseUrl });
  let targetPool: Pool | undefined;
  let targetDatabaseCreated = false;

  try {
    targetDatabaseCreated = true;
    await administrationPool.query(`CREATE DATABASE "${databaseName}"`);
    const target = new URL(baseDatabaseUrl);
    target.pathname = `/${databaseName}`;
    const targetUrl = target.toString();
    targetPool = new Pool({ connectionString: targetUrl });

    let closed = false;
    return {
      databaseName,
      targetUrl,
      administrationPool,
      targetPool,
      async close() {
        if (closed) return;
        closed = true;
        const cleanupFailures: Error[] = [];

        await captureCleanupFailure(
          cleanupFailures,
          'isolated target database pool',
          () => targetPool!.end(),
        );
        await captureCleanupFailure(
          cleanupFailures,
          'isolated target database',
          async () => {
            if (!targetDatabaseCreated) return;
            await cleanupIsolatedTargetDatabase({
              waitForConnectionsToClose: () =>
                waitForTargetDatabaseConnectionsToClose(
                  (remainingMs, signal) =>
                    countTargetDatabaseConnections(
                      baseDatabaseUrl,
                      databaseName,
                      remainingMs,
                      signal,
                    ),
                ),
              dropDatabase: async (force) => {
                await administrationPool.query(
                  `DROP DATABASE IF EXISTS "${databaseName}"${
                    force ? ' WITH (FORCE)' : ''
                  }`,
                );
                targetDatabaseCreated = false;
              },
            });
          },
        );
        await captureCleanupFailure(
          cleanupFailures,
          'isolated database administration pool',
          () => administrationPool.end(),
        );

        if (cleanupFailures.length === 1) throw cleanupFailures[0];
        if (cleanupFailures.length > 1) {
          throw new AggregateError(
            cleanupFailures,
            'Multiple isolated PostgreSQL database cleanup steps failed.',
          );
        }
      },
    };
  } catch (error) {
    const cleanupFailures: unknown[] = [];
    if (targetPool) {
      try {
        await targetPool.end();
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError);
      }
    }
    if (targetDatabaseCreated) {
      try {
        await administrationPool.query(
          `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
        );
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError);
      }
    }
    try {
      await administrationPool.end();
    } catch (cleanupError) {
      cleanupFailures.push(cleanupError);
    }
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        [error, ...cleanupFailures],
        'Isolated PostgreSQL database creation failed and cleanup also failed.',
        { cause: error },
      );
    }
    throw error;
  }
}

async function countTargetDatabaseConnections(
  baseDatabaseUrl: string,
  databaseName: string,
  remainingMs: number,
  signal: AbortSignal,
): Promise<number> {
  const boundedQueryMs = Math.max(1, Math.floor(remainingMs));
  const diagnosticClient = new Client({
    connectionString: baseDatabaseUrl,
    connectionTimeoutMillis: boundedQueryMs,
    query_timeout: boundedQueryMs,
    statement_timeout: boundedQueryMs,
  });
  let closePromise: Promise<void> | undefined;
  const closeDiagnosticClient = () => {
    closePromise ??= diagnosticClient.end();
    return closePromise;
  };
  const closeOnAbort = () => {
    void closeDiagnosticClient().catch(() => undefined);
  };
  signal.addEventListener('abort', closeOnAbort, {
    once: true,
  });

  try {
    await waitForPostgresCallbackOrAbort<undefined>(
      signal,
      (complete) => {
        diagnosticClient.connect((error: Error | undefined) => {
          if (error) complete({ ok: false, error });
          else complete({ ok: true, value: undefined });
        });
      },
    );
    const result = await waitForPostgresCallbackOrAbort<{
      readonly rows: readonly {
        readonly connectionCount: number;
      }[];
    }>(signal, (complete) => {
      diagnosticClient.query<{
        connectionCount: number;
      }>(
        `SELECT count(*)::integer AS "connectionCount"
         FROM pg_stat_activity
         WHERE datname = $1`,
        [databaseName],
        (error, queryResult) => {
          if (error) complete({ ok: false, error });
          else complete({ ok: true, value: queryResult });
        },
      );
    });
    return result.rows[0]?.connectionCount ?? 0;
  } finally {
    signal.removeEventListener('abort', closeOnAbort);
    await closeDiagnosticClient();
  }
}

async function captureCleanupFailure(
  failures: Error[],
  name: string,
  cleanup: () => Promise<void>,
): Promise<void> {
  try {
    await cleanup();
  } catch (error) {
    failures.push(new Error(`Failed to clean up ${name}.`, { cause: error }));
  }
}

function isolatedDatabaseName(namePrefix: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(namePrefix)) {
    throw new Error(
      'Isolated PostgreSQL database name prefix must use lowercase letters, digits, and underscores.',
    );
  }
  const databaseName = `${namePrefix}_${randomUUID().replaceAll('-', '')}_test`;
  if (databaseName.length > 63) {
    throw new Error(
      'Isolated PostgreSQL database name exceeds PostgreSQL identifier limits.',
    );
  }
  return databaseName;
}
