import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boundaries = vi.hoisted(() => {
  const rawPool = {
    end: vi.fn(async () => undefined),
  };
  const applicationPool = {
    end: vi.fn(async () => undefined),
  };
  const database = { $client: applicationPool };
  const app = {
    setGlobalPrefix: vi.fn(),
    init: vi.fn(async () => undefined),
    listen: vi.fn(async () => undefined),
    getUrl: vi.fn(async () => 'http://127.0.0.1:4321'),
    get: vi.fn(() => database),
    close: vi.fn(async () => undefined),
  };
  const moduleRef = {
    createNestApplication: vi.fn(() => app),
  };
  const compile = vi.fn(async () => moduleRef);
  const createTestingModule = vi.fn(() => ({ compile }));
  const migrate = vi.fn(async () => undefined);
  const Pool = vi.fn(function Pool() {
    return rawPool;
  });

  return {
    Pool,
    app,
    applicationPool,
    compile,
    createTestingModule,
    database,
    migrate,
    moduleRef,
    rawPool,
  };
});

vi.mock('@nestjs/testing', () => ({
  Test: { createTestingModule: boundaries.createTestingModule },
}));
vi.mock('drizzle-orm/node-postgres/migrator', () => ({
  migrate: boundaries.migrate,
}));
vi.mock('pg', () => ({ Pool: boundaries.Pool }));

import { AppModule } from '../app.module.js';
import { DATABASE } from './database.constants.js';
import { createPostgresRestTestHarness } from './postgres-rest-test-harness.js';

const environmentKey = 'POSTGRES_REST_HARNESS_TEST_VALUE';
let previousEnvironmentValue: string | undefined;

describe('PostgreSQL REST test harness', () => {
  beforeEach(() => {
    previousEnvironmentValue = process.env[environmentKey];
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (previousEnvironmentValue === undefined) {
      delete process.env[environmentKey];
    } else {
      process.env[environmentKey] = previousEnvironmentValue;
    }
  });

  it('owns the real REST application and both PostgreSQL pools behind one idempotent close', async () => {
    const databaseUrl =
      'postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/harness_test';

    const harness = await createPostgresRestTestHarness({
      databaseUrl,
      environment: { [environmentKey]: 'configured-before-compilation' },
    });

    expect(process.env[environmentKey]).toBe('configured-before-compilation');
    expect(process.env.DATABASE_URL).toBe(databaseUrl);
    expect(boundaries.createTestingModule).toHaveBeenCalledWith({
      imports: [AppModule],
    });
    expect(boundaries.app.setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(boundaries.app.init).toHaveBeenCalledOnce();
    expect(boundaries.app.listen).toHaveBeenCalledWith(0, '127.0.0.1');
    expect(boundaries.app.get).toHaveBeenCalledWith(DATABASE);
    expect(boundaries.migrate).toHaveBeenCalledWith(boundaries.database, {
      migrationsFolder: './drizzle',
    });
    expect(boundaries.Pool).toHaveBeenCalledWith({
      connectionString: databaseUrl,
    });
    expect(harness).toMatchObject({
      app: boundaries.app,
      database: boundaries.database,
      origin: 'http://127.0.0.1:4321',
      pool: boundaries.rawPool,
    });

    await harness.close();
    await harness.close();

    expect(boundaries.rawPool.end).toHaveBeenCalledOnce();
    expect(boundaries.app.close).toHaveBeenCalledOnce();
    expect(boundaries.applicationPool.end).toHaveBeenCalledOnce();
  });

  it('attempts every owned cleanup once and reports all teardown failures', async () => {
    const rawPoolFailure = new Error('raw pool close failed');
    const applicationFailure = new Error('application close failed');
    boundaries.rawPool.end.mockRejectedValueOnce(rawPoolFailure);
    boundaries.app.close.mockRejectedValueOnce(applicationFailure);

    const harness = await createPostgresRestTestHarness({
      databaseUrl:
        'postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/harness_test',
      environment: {},
    });

    let cleanupFailure: unknown;
    try {
      await harness.close();
    } catch (error) {
      cleanupFailure = error;
    }

    expect(cleanupFailure).toBeInstanceOf(AggregateError);
    if (!(cleanupFailure instanceof AggregateError)) {
      throw new Error('Expected an aggregate cleanup failure.');
    }
    expect(cleanupFailure.errors).toEqual([
      expect.objectContaining({ cause: rawPoolFailure }),
      expect.objectContaining({ cause: applicationFailure }),
    ]);
    expect(boundaries.rawPool.end).toHaveBeenCalledOnce();
    expect(boundaries.app.close).toHaveBeenCalledOnce();
    expect(boundaries.applicationPool.end).toHaveBeenCalledOnce();

    await harness.close();
    expect(boundaries.rawPool.end).toHaveBeenCalledOnce();
    expect(boundaries.app.close).toHaveBeenCalledOnce();
    expect(boundaries.applicationPool.end).toHaveBeenCalledOnce();
  });

  it('closes partially owned resources while preserving a setup failure', async () => {
    const migrationFailure = new Error('migration failed');
    boundaries.migrate.mockRejectedValueOnce(migrationFailure);

    await expect(
      createPostgresRestTestHarness({
        databaseUrl:
          'postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/harness_test',
        environment: {},
      }),
    ).rejects.toBe(migrationFailure);

    expect(boundaries.Pool).not.toHaveBeenCalled();
    expect(boundaries.app.close).toHaveBeenCalledOnce();
    expect(boundaries.applicationPool.end).toHaveBeenCalledOnce();
  });
});
