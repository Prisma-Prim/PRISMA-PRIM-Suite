import { Test } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { AppModule } from '../app.module.js';
import { DATABASE } from './database.constants.js';
import { assertLocalTestDatabaseUrl } from './test-database-target.js';

type PostgresRestTestDatabase = NodePgDatabase & {
  readonly $client: Pool;
};

export interface PostgresRestTestHarness {
  readonly origin: string;
  readonly pool: Pool;
  close(): Promise<void>;
}

export interface CreatePostgresRestTestHarnessOptions {
  readonly databaseUrl: string;
  readonly environment: Readonly<Record<string, string>>;
}

export async function createPostgresRestTestHarness({
  databaseUrl,
  environment,
}: CreatePostgresRestTestHarnessOptions): Promise<PostgresRestTestHarness> {
  assertLocalTestDatabaseUrl(databaseUrl);
  Object.assign(process.env, environment, { DATABASE_URL: databaseUrl });

  const ownedResources: OwnedResource[] = [];
  try {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    ownedResources.push({ name: 'Nest application', close: () => app.close() });
    const database = app.get<PostgresRestTestDatabase>(DATABASE);
    ownedResources.push({
      name: 'application PostgreSQL pool',
      close: () => database.$client.end(),
    });

    app.setGlobalPrefix('api');
    await app.init();
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();

    await migrate(database, { migrationsFolder: './drizzle' });
    const pool = new Pool({ connectionString: databaseUrl });
    ownedResources.unshift({
      name: 'raw PostgreSQL pool',
      close: () => pool.end(),
    });
    let closed = false;

    return {
      origin,
      pool,
      async close() {
        if (closed) return;
        closed = true;
        await closeOwnedResources(ownedResources);
      },
    };
  } catch (error) {
    let cleanupFailed = false;
    let cleanupFailure: unknown;
    try {
      await closeOwnedResources(ownedResources);
    } catch (caughtCleanupError) {
      cleanupFailed = true;
      cleanupFailure = caughtCleanupError;
    }
    if (cleanupFailed) {
      const cleanupErrors =
        cleanupFailure instanceof AggregateError
          ? cleanupFailure.errors
          : [cleanupFailure];
      throw new AggregateError(
        [error, ...cleanupErrors],
        'PostgreSQL REST test harness setup failed and cleanup also failed.',
        { cause: error },
      );
    }
    throw error;
  }
}

interface OwnedResource {
  readonly name: string;
  readonly close: () => Promise<void>;
}

async function closeOwnedResources(
  resources: readonly OwnedResource[],
): Promise<void> {
  const failures: Error[] = [];

  for (const resource of resources) {
    try {
      await resource.close();
    } catch (error) {
      failures.push(
        new Error(`Failed to close ${resource.name}.`, { cause: error }),
      );
    }
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      'Multiple PostgreSQL REST test harness resources failed to close.',
    );
  }
}
