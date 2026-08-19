import { describe, expect, it, vi } from 'vitest';
import {
  cleanupIsolatedTargetDatabase,
  runPreviousSchemaTestLifecycle,
  waitForTargetDatabaseConnectionsToClose,
} from './previous-schema-test-lifecycle.js';

describe('previous-schema test lifecycle', () => {
  it('waits for a closing target connection before dropping the database', async () => {
    let targetConnectionCount = 1;
    const lateConnectionErrors: Error[] = [];
    const getConnectionCount = vi.fn(async () => targetConnectionCount);
    const dropDatabase = vi.fn(async () => {
      if (targetConnectionCount > 0) {
        queueMicrotask(() => {
          lateConnectionErrors.push(
            Object.assign(
              new Error('terminating connection due to administrator command'),
              { code: '57P01' },
            ),
          );
        });
      }
    });

    await runPreviousSchemaTestLifecycle(
      async () => undefined,
      [
        { name: 'application pool', cleanup: async () => undefined },
        { name: 'migration pool', cleanup: async () => undefined },
        {
          name: 'target database connections',
          cleanup: () =>
            waitForTargetDatabaseConnectionsToClose(getConnectionCount, {
              timeoutMs: 10,
              pollIntervalMs: 1,
              sleep: async () => {
                targetConnectionCount = 0;
              },
            }),
        },
        { name: 'isolated target database', cleanup: dropDatabase },
      ],
    );

    await Promise.resolve();
    expect(getConnectionCount).toHaveBeenCalledTimes(2);
    expect(dropDatabase).toHaveBeenCalledTimes(1);
    expect(lateConnectionErrors).toEqual([]);
  });

  it('fails deterministically when target connections do not close', async () => {
    let now = 0;
    const getConnectionCount = vi.fn(async () => 2);

    await expect(
      waitForTargetDatabaseConnectionsToClose(getConnectionCount, {
        timeoutMs: 2,
        pollIntervalMs: 1,
        now: () => now,
        sleep: async (delayMs) => {
          now += delayMs;
        },
      }),
    ).rejects.toThrow(
      'Timed out waiting for 2 target database connection(s) to close.',
    );
    expect(getConnectionCount).toHaveBeenCalledTimes(3);
  });

  it('bounds a stalled connection-count query by the lifecycle deadline', async () => {
    const getConnectionCount = vi.fn(
      () => new Promise<number>(() => undefined),
    );

    await expect(
      waitForTargetDatabaseConnectionsToClose(getConnectionCount, {
        timeoutMs: 5,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow(
      'Timed out waiting for the target database connection-count query to finish.',
    );
    expect(getConnectionCount).toHaveBeenCalledTimes(1);
  });

  it('uses a normal drop after target connections close', async () => {
    const waitForConnectionsToClose = vi.fn(async () => undefined);
    const dropDatabase = vi.fn(async () => undefined);

    await cleanupIsolatedTargetDatabase({
      waitForConnectionsToClose,
      dropDatabase,
    });

    expect(waitForConnectionsToClose).toHaveBeenCalledTimes(1);
    expect(dropDatabase).toHaveBeenCalledTimes(1);
    expect(dropDatabase).toHaveBeenCalledWith(false);
  });

  it('force-drops after a connection-wait failure and preserves that failure', async () => {
    const waitFailure = new Error(
      'Timed out waiting for 1 target database connection(s) to close.',
    );
    let targetDatabaseExists = true;
    const cleanupAfterDrop = vi.fn(async () => undefined);
    const dropDatabase = vi.fn(async (force: boolean) => {
      expect(force).toBe(true);
      targetDatabaseExists = false;
    });
    const primaryFailure = new Error('health assertion failed');

    let lifecycleFailure: unknown;
    try {
      await runPreviousSchemaTestLifecycle(async () => {
        throw primaryFailure;
      }, [
        {
          name: 'isolated target database',
          cleanup: () =>
            cleanupIsolatedTargetDatabase({
              waitForConnectionsToClose: async () => {
                throw waitFailure;
              },
              dropDatabase,
            }),
        },
        { name: 'temporary migrations', cleanup: cleanupAfterDrop },
      ]);
    } catch (error) {
      lifecycleFailure = error;
    }

    expect(targetDatabaseExists).toBe(false);
    expect(dropDatabase).toHaveBeenCalledTimes(1);
    expect(cleanupAfterDrop).toHaveBeenCalledTimes(1);
    expect(lifecycleFailure).toBeInstanceOf(AggregateError);
    const aggregate = lifecycleFailure as AggregateError;
    expect(aggregate.cause).toBe(primaryFailure);
    expect(aggregate.errors[0]).toBe(primaryFailure);
    expect((aggregate.errors[1] as Error).cause).toBe(waitFailure);
  });

  it('reports both graceful and forced database cleanup failures', async () => {
    const waitFailure = new Error('connection wait failed');
    const forceDropFailure = new Error('forced drop failed');
    const dropDatabase = vi.fn(async (force: boolean) => {
      expect(force).toBe(true);
      throw forceDropFailure;
    });

    let lifecycleFailure: unknown;
    try {
      await cleanupIsolatedTargetDatabase({
        waitForConnectionsToClose: async () => {
          throw waitFailure;
        },
        dropDatabase,
      });
    } catch (error) {
      lifecycleFailure = error;
    }

    expect(lifecycleFailure).toBeInstanceOf(AggregateError);
    const aggregate = lifecycleFailure as AggregateError;
    expect(aggregate.cause).toBe(waitFailure);
    expect(aggregate.errors).toEqual([waitFailure, forceDropFailure]);
    expect(dropDatabase).toHaveBeenCalledTimes(1);
  });

  it('attempts every cleanup once and preserves the primary failure', async () => {
    const primaryFailure = new Error('health assertion failed');
    const cleanupFailure = new Error('application pool close failed');
    const firstCleanup = vi.fn(async () => {
      throw cleanupFailure;
    });
    const secondCleanup = vi.fn(async () => undefined);

    let lifecycleFailure: unknown;
    try {
      await runPreviousSchemaTestLifecycle(async () => {
        throw primaryFailure;
      }, [
        { name: 'application pool', cleanup: firstCleanup },
        { name: 'migration pool', cleanup: secondCleanup },
      ]);
    } catch (error) {
      lifecycleFailure = error;
    }

    expect(lifecycleFailure).toBeInstanceOf(AggregateError);
    const aggregate = lifecycleFailure as AggregateError;
    expect(aggregate.cause).toBe(primaryFailure);
    expect(aggregate.errors[0]).toBe(primaryFailure);
    expect((aggregate.errors[1] as Error).cause).toBe(cleanupFailure);
    expect(firstCleanup).toHaveBeenCalledTimes(1);
    expect(secondCleanup).toHaveBeenCalledTimes(1);
  });

  it('rethrows an injected preflight failure after successful cleanup', async () => {
    const primaryFailure = new Error('migration failed');
    const cleanup = vi.fn(async () => undefined);

    let lifecycleFailure: unknown;
    try {
      await runPreviousSchemaTestLifecycle(async () => {
        throw primaryFailure;
      }, [{ name: 'migration pool', cleanup }]);
    } catch (error) {
      lifecycleFailure = error;
    }

    expect(lifecycleFailure).toBe(primaryFailure);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('keeps an unexpected PostgreSQL connection error fatal', async () => {
    const connectionError = Object.assign(
      new Error('unexpected PostgreSQL connection error'),
      { code: '57P01' },
    );

    let lifecycleFailure: unknown;
    try {
      await runPreviousSchemaTestLifecycle(
        async () => undefined,
        [
          {
            name: 'migration pool',
            cleanup: async () => {
              throw connectionError;
            },
          },
        ],
      );
    } catch (error) {
      lifecycleFailure = error;
    }

    expect(lifecycleFailure).toBeInstanceOf(Error);
    expect((lifecycleFailure as Error).cause).toBe(connectionError);
  });
});
