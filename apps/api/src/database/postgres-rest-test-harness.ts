import { Test } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { AppModule } from '../app.module.js';
import { DATABASE } from './database.constants.js';
import {
  createIdempotentCleanup,
  rethrowAfterCleanup,
  type OwnedResource,
} from './owned-resource-cleanup.js';
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
    ownedResources.push({
      name: 'Nest application',
      cleanup: () => app.close(),
    });
    const database = app.get<PostgresRestTestDatabase>(DATABASE);
    ownedResources.push({
      name: 'application PostgreSQL pool',
      cleanup: () => database.$client.end(),
    });

    app.setGlobalPrefix('api');
    await app.init();
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();

    await migrate(database, { migrationsFolder: './drizzle' });
    const pool = new Pool({ connectionString: databaseUrl });
    ownedResources.unshift({
      name: 'raw PostgreSQL pool',
      cleanup: () => pool.end(),
    });
    const close = createIdempotentCleanup({
      resources: ownedResources,
      multipleFailuresMessage:
        'Multiple PostgreSQL REST test harness resources failed to close.',
      failureAction: 'close',
    });

    return {
      origin,
      pool,
      close,
    };
  } catch (error) {
    return await rethrowAfterCleanup({
      primaryFailure: error,
      resources: ownedResources,
      message:
        'PostgreSQL REST test harness setup failed and cleanup also failed.',
      failureAction: 'close',
    });
  }
}
