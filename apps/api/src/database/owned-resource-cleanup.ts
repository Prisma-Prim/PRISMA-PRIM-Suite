export interface OwnedResource {
  readonly name: string;
  readonly cleanup: () => Promise<void>;
}

export interface RethrowAfterCleanupOptions {
  readonly primaryFailure: unknown;
  readonly resources: readonly OwnedResource[];
  readonly message: string;
  readonly failureAction: CleanupFailureAction;
}

export interface CreateIdempotentCleanupOptions {
  readonly resources: readonly OwnedResource[];
  readonly multipleFailuresMessage: string;
  readonly failureAction: CleanupFailureAction;
}

type CleanupFailureAction = 'clean up' | 'close';

export function createIdempotentCleanup({
  resources,
  multipleFailuresMessage,
  failureAction,
}: CreateIdempotentCleanupOptions): () => Promise<void> {
  let started = false;
  return async () => {
    if (started) return;
    started = true;

    const cleanupFailures = await collectCleanupFailures(
      resources,
      failureAction,
    );
    if (cleanupFailures.length === 1) throw cleanupFailures[0];
    if (cleanupFailures.length > 1) {
      throw new AggregateError(cleanupFailures, multipleFailuresMessage);
    }
  };
}

export async function rethrowAfterCleanup({
  primaryFailure,
  resources,
  message,
  failureAction,
}: RethrowAfterCleanupOptions): Promise<never> {
  const cleanupFailures = await collectCleanupFailures(
    resources,
    failureAction,
  );
  if (cleanupFailures.length === 0) {
    throw primaryFailure;
  }
  throw new AggregateError([primaryFailure, ...cleanupFailures], message, {
    cause: primaryFailure,
  });
}

async function collectCleanupFailures(
  resources: readonly OwnedResource[],
  failureAction: CleanupFailureAction,
): Promise<Error[]> {
  const failures: Error[] = [];
  for (const resource of resources) {
    try {
      await resource.cleanup();
    } catch (error) {
      failures.push(
        new Error(`Failed to ${failureAction} ${resource.name}.`, {
          cause: error,
        }),
      );
    }
  }
  return failures;
}
