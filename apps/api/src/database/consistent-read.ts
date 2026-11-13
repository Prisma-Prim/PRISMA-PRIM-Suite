import { DrizzleQueryError } from 'drizzle-orm';
import type { PgTransactionConfig } from 'drizzle-orm/pg-core';

/**
 * Opens one transaction per attempt, normally `DatabaseContext`. A feature
 * with its own whole-transaction recovery, such as Client reference drift,
 * supplies it here so each attempt keeps that recovery.
 */
export interface ConsistentReadTransactions {
  transaction<T>(
    work: () => Promise<T>,
    config?: PgTransactionConfig,
  ): Promise<T>;
}

const ATTEMPTS = 8;

/**
 * Runs a read in one repeatable-read snapshot. A concurrent identity-profile
 * or assignment refresh can invalidate a row the read locks after its
 * snapshot began (SQLSTATE 40001); the whole read then restarts, live
 * authority checks included. It never continues an aborted snapshot and must
 * never wrap a business command.
 */
export async function readConsistently<T>(
  database: ConsistentReadTransactions,
  read: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await database.transaction(read, {
        isolationLevel: 'repeatable read',
      });
    } catch (error) {
      if (attempt >= ATTEMPTS || !serializationFailure(error)) throw error;
      // Bounded backoff lets parallel refreshes settle: eight attempts add at
      // most 1.125 seconds of delay without weakening the snapshot.
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.min(25 * 2 ** (attempt - 1), 250)),
      );
    }
  }
}

function serializationFailure(error: unknown): boolean {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === '40001'
  );
}
