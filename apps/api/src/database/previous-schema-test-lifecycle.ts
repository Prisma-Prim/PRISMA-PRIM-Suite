export {
  cleanupIsolatedTargetDatabase,
  waitForPostgresCallbackOrAbort,
  waitForTargetDatabaseConnectionsToClose,
  type AbortablePostgresOperationResult,
  type CleanupIsolatedTargetDatabaseOptions,
  type WaitForTargetDatabaseConnectionsOptions,
} from './isolated-postgres-test-lifecycle.js';
import {
  createIdempotentCleanup,
  rethrowAfterCleanup,
  type OwnedResource,
} from './owned-resource-cleanup.js';

export type PreviousSchemaTestCleanupStep = OwnedResource;

export async function runPreviousSchemaTestLifecycle(
  execute: () => Promise<void>,
  cleanupSteps: readonly PreviousSchemaTestCleanupStep[],
): Promise<void> {
  const cleanupAfterSuccess = createIdempotentCleanup({
    resources: cleanupSteps,
    multipleFailuresMessage:
      'Multiple previous-schema migration preflight cleanup steps failed.',
    failureAction: 'clean up',
  });
  try {
    await execute();
  } catch (error) {
    await rethrowAfterCleanup({
      primaryFailure: error,
      resources: cleanupSteps,
      message:
        'The previous-schema migration preflight failed and cleanup also failed.',
      failureAction: 'clean up',
    });
  }
  await cleanupAfterSuccess();
}
