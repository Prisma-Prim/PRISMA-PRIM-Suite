import { ForbiddenException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTransactionConfig } from 'drizzle-orm/pg-core';
import { DatabaseContext } from '../database/database-context.js';
import { workspaces } from '../database/schema/index.js';
import { demonstrationWorkspaceRefusal } from './demonstration-target-guard.js';

/**
 * Seed composition only. Every writable transaction locks Workspace writes
 * before its first snapshot, revalidates the target, and retains the lock until
 * commit/rollback. Ordinary INSERT/UPDATE/DELETE from any other process conflict
 * with this table lock; no cooperation or advisory lock is assumed.
 *
 * The bootstrap uses this same transaction, so its Workspace upsert cannot
 * deadlock against a separate guard connection. Between transactions another
 * process may change the target; the next writable transaction then refuses.
 */
export class DemonstrationDatabaseContext extends DatabaseContext {
  constructor(
    private readonly seedDatabase: NodePgDatabase,
    private readonly target: {
      readonly workspaceId: string;
      readonly workspaceName: string;
    },
  ) {
    super(seedDatabase);
  }

  override transaction<T>(
    work: () => Promise<T>,
    config?: PgTransactionConfig,
  ): Promise<T> {
    // Owning modules can compose transactions. Reuse the already protected
    // connection rather than acquiring an incompatible lock against ourselves.
    if (this.connection !== this.seedDatabase) return work();
    return super.transaction(
      async () => {
        if (config?.accessMode !== 'read only') {
          await this.connection.execute(
            sql`LOCK TABLE workspaces IN SHARE ROW EXCLUSIVE MODE`,
          );
          const current = await this.connection
            .select({ id: workspaces.id, name: workspaces.name })
            .from(workspaces);
          const refusal = demonstrationWorkspaceRefusal(current, this.target);
          if (refusal) throw new ForbiddenException(refusal);
        }
        return work();
      },
      { ...config, accessMode: config?.accessMode ?? 'read write' },
    );
  }
}
