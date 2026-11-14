import { configureMissionPlanTransport } from '../mission-plan/mission-plan-http.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  IDENTITY_SESSION_REVOKER,
  type IdentitySessionRevoker,
} from '../access/identity-session-revoker.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { SYNCHRONIZE_ACCESS_IDENTITY_PROFILE } from '../access/access.service.js';
import { Test } from '@nestjs/testing';
import type { Logger } from 'drizzle-orm/logger';
import { drizzle } from 'drizzle-orm/node-postgres';
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

export interface PostgresRestTestHarness {
  readonly origin: string;
  readonly pool: Pool;
  measureApplicationQueries<T>(
    work: () => Promise<T>,
  ): Promise<{ value: T; queryCount: number; queries: readonly string[] }>;
  close(): Promise<void>;
}

export interface CreatePostgresRestTestHarnessOptions {
  /** Keep stored profiles fixed while testing same-member domain lock ordering. */
  readonly synchronizeIdentityProfile?: boolean;
  readonly sessionRevoker?: IdentitySessionRevoker;
  // Replaces only the server clock boundary for fixed-instant tests.
  readonly serverClock?: ServerClock;
  readonly databaseUrl: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly listenPort?: number;
  readonly migrationsFolder?: string;
  /** Real pool capacity/deadline for public resource-exhaustion proof; no owning service is mocked. */
  readonly applicationPoolConfiguration?: {
    max: number;
    connectionTimeoutMillis: number;
  };
}

class ApplicationQueryCounter implements Logger {
  private readonly queries: string[] = [];

  logQuery(query: string): void {
    this.queries.push(query);
  }

  async measure<T>(
    work: () => Promise<T>,
  ): Promise<{ value: T; queryCount: number; queries: readonly string[] }> {
    const countBefore = this.queries.length;
    const value = await work();
    const queries = this.queries.slice(countBefore);
    return {
      value,
      queryCount: queries.length,
      queries,
    };
  }
}

export async function createPostgresRestTestHarness({
  databaseUrl,
  environment,
  listenPort = 0,
  migrationsFolder = './drizzle',
  sessionRevoker,
  serverClock,
  applicationPoolConfiguration,
  synchronizeIdentityProfile,
}: CreatePostgresRestTestHarnessOptions): Promise<PostgresRestTestHarness> {
  assertLocalTestDatabaseUrl(databaseUrl);
  Object.assign(process.env, environment, { DATABASE_URL: databaseUrl });

  const ownedResources: OwnedResource[] = [];
  try {
    const applicationPool = new Pool({
      connectionString: databaseUrl,
      ...applicationPoolConfiguration,
    });
    ownedResources.push({
      name: 'application PostgreSQL pool',
      cleanup: () => applicationPool.end(),
    });
    const queryCounter = new ApplicationQueryCounter();
    const database = drizzle({
      client: applicationPool,
      logger: queryCounter,
    });
    const builder = Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE)
      .useValue(database);
    if (synchronizeIdentityProfile !== undefined)
      builder
        .overrideProvider(SYNCHRONIZE_ACCESS_IDENTITY_PROFILE)
        .useValue(synchronizeIdentityProfile);
    if (sessionRevoker)
      builder
        .overrideProvider(IDENTITY_SESSION_REVOKER)
        .useValue(sessionRevoker);
    if (serverClock)
      builder.overrideProvider(SERVER_CLOCK).useValue(serverClock);
    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    ownedResources.unshift({
      name: 'Nest application',
      cleanup: () => app.close(),
    });

    configureMissionPlanTransport(app);
    app.setGlobalPrefix('api');
    await app.init();
    await app.listen(listenPort, '127.0.0.1');
    const origin = await app.getUrl();

    await migrate(database, { migrationsFolder });
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
      measureApplicationQueries: (work) => queryCounter.measure(work),
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
