import { beforeEach, describe, expect, it, vi } from 'vitest';

type CompletionCallback = (error?: Error) => void;
type ConnectionCountCallback = (
  error: Error | undefined,
  result?: { readonly rows: readonly { readonly connectionCount: number }[] },
) => void;

const boundaries = vi.hoisted(() => {
  let poolNumber = 0;
  const administrationPool = {
    query: vi.fn(async () => ({ rows: [] })),
    end: vi.fn(async () => undefined),
  };
  const targetPool = {
    end: vi.fn(async () => undefined),
  };
  const diagnosticClient = {
    connect: vi.fn((callback: CompletionCallback) => callback()),
    query: vi.fn(
      (
        _query: string,
        _values: readonly string[],
        callback: ConnectionCountCallback,
      ) => callback(undefined, { rows: [{ connectionCount: 0 }] }),
    ),
    end: vi.fn(async () => undefined),
  };
  const Pool = vi.fn(function Pool() {
    poolNumber += 1;
    return poolNumber === 1 ? administrationPool : targetPool;
  });
  const Client = vi.fn(function Client() {
    return diagnosticClient;
  });

  return {
    Client,
    Pool,
    administrationPool,
    diagnosticClient,
    resetPoolSequence: () => {
      poolNumber = 0;
    },
    targetPool,
  };
});

vi.mock('pg', () => ({ Client: boundaries.Client, Pool: boundaries.Pool }));

import { createIsolatedPostgresTestDatabase } from './isolated-postgres-test-database.js';

describe('isolated PostgreSQL test database', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundaries.resetPoolSequence();
    boundaries.administrationPool.query.mockResolvedValue({ rows: [] });
    boundaries.administrationPool.end.mockResolvedValue(undefined);
    boundaries.targetPool.end.mockResolvedValue(undefined);
  });

  it('cleans the target pool, database and administration pool once', async () => {
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl:
        'postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/base_test',
      namePrefix: 'cleanup',
    });

    await database.close();
    await database.close();

    expect(boundaries.targetPool.end).toHaveBeenCalledOnce();
    expect(boundaries.diagnosticClient.connect).toHaveBeenCalledOnce();
    expect(boundaries.diagnosticClient.query).toHaveBeenCalledOnce();
    expect(boundaries.diagnosticClient.end).toHaveBeenCalledOnce();
    expect(boundaries.administrationPool.query).toHaveBeenCalledTimes(2);
    expect(boundaries.administrationPool.end).toHaveBeenCalledOnce();
  });

  it('preserves creation failure before named cleanup failures', async () => {
    const creationFailure = new Error('create database failed');
    const dropFailure = new Error('forced drop failed');
    const administrationCloseFailure = new Error(
      'administration pool close failed',
    );
    boundaries.administrationPool.query
      .mockRejectedValueOnce(creationFailure)
      .mockRejectedValueOnce(dropFailure);
    boundaries.administrationPool.end.mockRejectedValueOnce(
      administrationCloseFailure,
    );

    let lifecycleFailure: unknown;
    try {
      await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl:
          'postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/base_test',
        namePrefix: 'cleanup',
      });
    } catch (error) {
      lifecycleFailure = error;
    }

    expect(lifecycleFailure).toBeInstanceOf(AggregateError);
    if (!(lifecycleFailure instanceof AggregateError)) {
      throw new Error('Expected an aggregate lifecycle failure.');
    }
    expect(lifecycleFailure.cause).toBe(creationFailure);
    expect(lifecycleFailure.errors[0]).toBe(creationFailure);
    expect(lifecycleFailure.errors[1]).toEqual(
      expect.objectContaining({
        message: 'Failed to clean up isolated target database.',
        cause: dropFailure,
      }),
    );
    expect(lifecycleFailure.errors[2]).toEqual(
      expect.objectContaining({
        message: 'Failed to clean up isolated database administration pool.',
        cause: administrationCloseFailure,
      }),
    );
    expect(boundaries.Pool).toHaveBeenCalledOnce();
    expect(boundaries.administrationPool.end).toHaveBeenCalledOnce();
  });
});
