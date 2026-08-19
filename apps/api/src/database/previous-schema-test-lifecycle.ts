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

const defaultTimeoutMs = 5_000;
const defaultPollIntervalMs = 25;

export async function waitForTargetDatabaseConnectionsToClose(
  getConnectionCount: () => Promise<number>,
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
    throw new RangeError('The connection-close poll interval must be positive.');
  }

  const deadline = now() + timeoutMs;
  for (;;) {
    const connectionCount = await getConnectionCount();
    if (!Number.isSafeInteger(connectionCount) || connectionCount < 0) {
      throw new Error(
        `Expected a non-negative target database connection count, received ${connectionCount}.`,
      );
    }
    if (connectionCount === 0) return;

    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      throw new Error(
        `Timed out waiting for ${connectionCount} target database connection(s) to close.`,
      );
    }

    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
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
