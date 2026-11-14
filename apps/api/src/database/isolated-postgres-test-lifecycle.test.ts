import { describe, expect, it, vi } from 'vitest';
import {
  cleanupIsolatedTargetDatabase,
  waitForPostgresCallbackOrAbort,
  waitForTargetDatabaseConnectionsToClose,
} from './isolated-postgres-test-lifecycle.js';

describe('isolated PostgreSQL test database lifecycle', () => {
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

    await cleanupIsolatedTargetDatabase({
      waitForConnectionsToClose: () =>
        waitForTargetDatabaseConnectionsToClose(getConnectionCount, {
          timeoutMs: 10,
          pollIntervalMs: 1,
          now: () => 0,
          sleep: async () => {
            targetConnectionCount = 0;
          },
        }),
      dropDatabase,
    });

    await Promise.resolve();
    expect(getConnectionCount).toHaveBeenCalledTimes(2);
    expect(dropDatabase).toHaveBeenCalledTimes(1);
    expect(dropDatabase).toHaveBeenCalledWith(false);
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
    expect(getConnectionCount).toHaveBeenCalledTimes(2);
  });

  it('bounds a stalled connection-count query by the lifecycle deadline', async () => {
    let diagnosticConnectionClosed = false;
    const getConnectionCount = vi.fn(
      (_remainingMs: number, signal: AbortSignal) =>
        new Promise<number>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              queueMicrotask(() => {
                diagnosticConnectionClosed = true;
                reject(signal.reason);
              });
            },
            { once: true },
          );
        }),
    );

    await expect(
      waitForTargetDatabaseConnectionsToClose(getConnectionCount, {
        timeoutMs: 5,
        pollIntervalMs: 1,
        now: () => 0,
      }),
    ).rejects.toThrow(
      'Timed out waiting for the target database connection-count query to finish.',
    );
    expect(diagnosticConnectionClosed).toBe(true);
    expect(getConnectionCount).toHaveBeenCalledTimes(1);
    expect(getConnectionCount).toHaveBeenCalledWith(5, expect.any(AbortSignal));
  });

  it('settles a PostgreSQL callback operation when abort wins the connect race', async () => {
    const controller = new AbortController();
    let complete:
      | ((result: { readonly ok: true; readonly value: undefined }) => void)
      | undefined;
    const operation = waitForPostgresCallbackOrAbort<undefined>(
      controller.signal,
      (callback) => {
        complete = callback;
      },
    );
    const timeoutFailure = new Error('diagnostic deadline exceeded');

    controller.abort(timeoutFailure);

    await expect(operation).rejects.toBe(timeoutFailure);
    complete?.({ ok: true, value: undefined });
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
    const dropDatabase = vi.fn(async (force: boolean) => {
      expect(force).toBe(true);
      targetDatabaseExists = false;
    });

    await expect(
      cleanupIsolatedTargetDatabase({
        waitForConnectionsToClose: async () => {
          throw waitFailure;
        },
        dropDatabase,
      }),
    ).rejects.toBe(waitFailure);

    expect(targetDatabaseExists).toBe(false);
    expect(dropDatabase).toHaveBeenCalledTimes(1);
  });

  it('reports both graceful and forced database cleanup failures', async () => {
    const waitFailure = new Error('connection wait failed');
    const forceDropFailure = new Error('forced drop failed');
    const dropDatabase = vi.fn(async (force: boolean) => {
      expect(force).toBe(true);
      throw forceDropFailure;
    });

    let cleanupFailure: unknown;
    try {
      await cleanupIsolatedTargetDatabase({
        waitForConnectionsToClose: async () => {
          throw waitFailure;
        },
        dropDatabase,
      });
    } catch (error) {
      cleanupFailure = error;
    }

    if (!(cleanupFailure instanceof AggregateError))
      throw new Error('Expected an AggregateError cleanup failure.');
    expect(cleanupFailure.cause).toBe(waitFailure);
    expect(cleanupFailure.errors).toEqual([waitFailure, forceDropFailure]);
    expect(dropDatabase).toHaveBeenCalledTimes(1);
  });
});
