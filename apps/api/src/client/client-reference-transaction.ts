import type { DatabaseContext } from '../database/database-context.js';
import { ClientReferenceStateDrift } from './client-reference-state-drift.js';

/**
 * Whole-transaction recovery for commands and reads that lock readable Client
 * references. Work must recheck live authority on each attempt and keep external
 * effects outside this callback; all writes must use its database transaction.
 */
export async function runClientReferenceTransaction<T>({
  database,
  work,
  config,
}: {
  database: DatabaseContext;
  work: () => Promise<T>;
  config?: Parameters<DatabaseContext['transaction']>[1];
}): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await database.transaction(work, config);
    } catch (error) {
      if (!(error instanceof ClientReferenceStateDrift)) throw error;
      if (attempt === 3) throw error.refusal;
      // Awaiting the failed transaction completes rollback and releases the old
      // Client lock set before the whole callback rechecks authority/references.
    }
  }
}
