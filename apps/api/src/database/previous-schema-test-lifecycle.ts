export {
  cleanupIsolatedTargetDatabase,
  waitForPostgresCallbackOrAbort,
  waitForTargetDatabaseConnectionsToClose,
  type AbortablePostgresOperationResult,
  type CleanupIsolatedTargetDatabaseOptions,
  type WaitForTargetDatabaseConnectionsOptions,
} from './isolated-postgres-test-lifecycle.js';

export type PreviousSchemaTestCleanupStep = {
  readonly name: string;
  readonly cleanup: () => Promise<void>;
};

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
