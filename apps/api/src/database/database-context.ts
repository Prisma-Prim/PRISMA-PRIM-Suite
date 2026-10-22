import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTransactionConfig } from 'drizzle-orm/pg-core';
import { ClientReferenceStateDrift } from './client-reference-state-drift.js';
import { DATABASE } from './database.constants.js';

@Injectable()
export class DatabaseContext {
  private readonly transactions = new AsyncLocalStorage<NodePgDatabase>();

  constructor(@Inject(DATABASE) private readonly database: NodePgDatabase) {}

  get connection(): NodePgDatabase {
    return this.transactions.getStore() ?? this.database;
  }

  async transaction<T>(
    work: () => Promise<T>,
    config?: PgTransactionConfig,
  ): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.database.transaction(
          (transaction) =>
            this.transactions.run(transaction as NodePgDatabase, work),
          config,
        );
      } catch (error) {
        if (!(error instanceof ClientReferenceStateDrift)) throw error;
        if (attempt === 3) throw error.refusal;
        // Drizzle has completed rollback: release the old Client lock set
        // before the whole command rechecks current authority and references.
      }
    }
  }
}
