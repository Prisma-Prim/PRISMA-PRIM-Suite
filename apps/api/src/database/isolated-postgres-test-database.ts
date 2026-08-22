import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import {
  cleanupIsolatedTargetDatabase,
  waitForPostgresCallbackOrAbort,
  waitForTargetDatabaseConnectionsToClose,
} from './isolated-postgres-test-lifecycle.js';
import {
  createIdempotentCleanup,
  rethrowAfterCleanup,
  type OwnedResource,
} from './owned-resource-cleanup.js';
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
  let targetDatabaseCreated = false;
  const administrationPoolResource: OwnedResource = {
    name: 'isolated database administration pool',
    cleanup: () => administrationPool.end(),
  };
  const setupCleanupResources: OwnedResource[] = [administrationPoolResource];
  const cleanupTargetDatabase = async () => {
    if (!targetDatabaseCreated) return;
    await cleanupIsolatedTargetDatabase({
      waitForConnectionsToClose: () =>
        waitForTargetDatabaseConnectionsToClose((remainingMs, signal) =>
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
  };
  const forceDropTargetDatabase = async () => {
    if (!targetDatabaseCreated) return;
    await administrationPool.query(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    );
    targetDatabaseCreated = false;
  };

  try {
    targetDatabaseCreated = true;
    setupCleanupResources.unshift({
      name: 'isolated target database',
      cleanup: forceDropTargetDatabase,
    });
    await administrationPool.query(`CREATE DATABASE "${databaseName}"`);
    const target = new URL(baseDatabaseUrl);
    target.pathname = `/${databaseName}`;
    const targetUrl = target.toString();
    const targetPool = new Pool({ connectionString: targetUrl });
    const targetPoolResource: OwnedResource = {
      name: 'isolated target database pool',
      cleanup: () => targetPool.end(),
    };
    setupCleanupResources.unshift(targetPoolResource);
    const close = createIdempotentCleanup({
      resources: [
        targetPoolResource,
        {
          name: 'isolated target database',
          cleanup: cleanupTargetDatabase,
        },
        administrationPoolResource,
      ],
      multipleFailuresMessage:
        'Multiple isolated PostgreSQL database cleanup steps failed.',
      failureAction: 'clean up',
    });

    return {
      databaseName,
      targetUrl,
      administrationPool,
      targetPool,
      close,
    };
  } catch (error) {
    return await rethrowAfterCleanup({
      primaryFailure: error,
      resources: setupCleanupResources,
      message:
        'Isolated PostgreSQL database creation failed and cleanup also failed.',
      failureAction: 'clean up',
    });
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
    await waitForPostgresCallbackOrAbort<undefined>(signal, (complete) => {
      diagnosticClient.connect((error: Error | undefined) => {
        if (error) complete({ ok: false, error });
        else complete({ ok: true, value: undefined });
      });
    });
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
