import { setTimeout as delay } from 'node:timers/promises';

export type PreviousSchemaTestCleanupStep = {
  readonly name: string;
  readonly cleanup: () => Promise<void>;
};

export type WaitForTargetDatabaseConnectionsOptions = {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly now?: () => number;
  readonly sleep?: (delayMs: number) => Promise<void>;
};

export type CleanupIsolatedTargetDatabaseOptions = {
  readonly waitForConnectionsToClose: () => Promise<void>;
  readonly dropDatabase: (force: boolean) => Promise<void>;
};

export type AbortablePostgresOperationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown };

const defaultTimeoutMs = 5_000;
const defaultPollIntervalMs = 25;

export function waitForPostgresCallbackOrAbort<T>(
  signal: AbortSignal,
  start: (
    complete: (result: AbortablePostgresOperationResult<T>) => void,
  ) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (result: AbortablePostgresOperationResult<T>) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      if (result.ok) resolve(result.value);
      else reject(result.error);
    };
    const abort = () => {
      finish({
        ok: false,
        error:
          signal.reason ??
          new Error('PostgreSQL diagnostic operation aborted.'),
      });
    };

    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    try {
      start(finish);
    } catch (error) {
      finish({ ok: false, error });
    }
  });
}

function getConnectionCountBeforeDeadline(
  getConnectionCount: (
    remainingMs: number,
    signal: AbortSignal,
  ) => Promise<number>,
  remainingMs: number,
): Promise<number> {
  const controller = new AbortController();
  const timeoutFailure = new Error(
    'Timed out waiting for the target database connection-count query to finish.',
  );
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const operation = Promise.resolve().then(() =>
    getConnectionCount(remainingMs, controller.signal),
  );
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(timeoutFailure);
      reject(timeoutFailure);
    }, remainingMs);
  });

  return Promise.race([operation, deadline])
    .catch(async (error: unknown) => {
      if (!timedOut) throw error;

      // The callback owns its PostgreSQL client. Wait for its abort cleanup so
      // no diagnostic connection can outlive this lifecycle boundary.
      try {
        await operation;
      } catch {
        // The deterministic deadline error remains the public diagnostic.
      }
      throw timeoutFailure;
    })
    .finally(() => {
      if (timeout) clearTimeout(timeout);
    });
}

export async function waitForTargetDatabaseConnectionsToClose(
  getConnectionCount: (
    remainingMs: number,
    signal: AbortSignal,
  ) => Promise<number>,
  options: WaitForTargetDatabaseConnectionsOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const pollIntervalMs = options.pollIntervalMs ?? defaultPollIntervalMs;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? delay;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('The connection-close timeout must be positive.');
  }
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new RangeError(
      'The connection-close poll interval must be positive.',
    );
  }

  const deadline = now() + timeoutMs;
  let lastConnectionCount: number | undefined;
  for (;;) {
    const remainingBeforeQueryMs = deadline - now();
    if (remainingBeforeQueryMs <= 0) {
      throw new Error(
        lastConnectionCount === undefined
          ? 'Timed out waiting for target database connections to close.'
          : `Timed out waiting for ${lastConnectionCount} target database connection(s) to close.`,
      );
    }
    const connectionCount = await getConnectionCountBeforeDeadline(
      getConnectionCount,
      remainingBeforeQueryMs,
    );
    if (!Number.isSafeInteger(connectionCount) || connectionCount < 0) {
      throw new Error(
        `Expected a non-negative target database connection count, received ${connectionCount}.`,
      );
    }
    if (connectionCount === 0) return;
    lastConnectionCount = connectionCount;

    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      throw new Error(
        `Timed out waiting for ${connectionCount} target database connection(s) to close.`,
      );
    }

    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
}

export async function cleanupIsolatedTargetDatabase({
  waitForConnectionsToClose,
  dropDatabase,
}: CleanupIsolatedTargetDatabaseOptions): Promise<void> {
  let gracefulFailure: unknown;
  try {
    await waitForConnectionsToClose();
    await dropDatabase(false);
    return;
  } catch (error) {
    gracefulFailure = error;
  }

  let forceDropFailed = false;
  let forceDropFailure: unknown;
  try {
    await dropDatabase(true);
  } catch (error) {
    forceDropFailed = true;
    forceDropFailure = error;
  }

  if (forceDropFailed) {
    throw new AggregateError(
      [gracefulFailure, forceDropFailure],
      'Graceful target database cleanup failed and the forced fallback also failed.',
      { cause: gracefulFailure },
    );
  }

  throw gracefulFailure;
}

export async function runPreviousSchemaTestLifecycle(
  execute: () => Promise<void>,
  cleanupSteps: readonly PreviousSchemaTestCleanupStep[],
): Promise<void> {
  let hasPrimaryFailure = false;
  let primaryFailure: unknown;
  try {
    await execute();
  } catch (error) {
    hasPrimaryFailure = true;
    primaryFailure = error;
  }

  const cleanupFailures: Error[] = [];
  for (const step of cleanupSteps) {
    try {
      await step.cleanup();
    } catch (error) {
      cleanupFailures.push(
        new Error(`Failed to clean up ${step.name}.`, { cause: error }),
      );
    }
  }

  if (hasPrimaryFailure) {
    if (cleanupFailures.length === 0) throw primaryFailure;
    throw new AggregateError(
      [primaryFailure, ...cleanupFailures],
      'The previous-schema migration preflight failed and cleanup also failed.',
      { cause: primaryFailure },
    );
  }

  if (cleanupFailures.length === 1) throw cleanupFailures[0];
  if (cleanupFailures.length > 1) {
    throw new AggregateError(
      cleanupFailures,
      'Multiple previous-schema migration preflight cleanup steps failed.',
    );
  }
}
