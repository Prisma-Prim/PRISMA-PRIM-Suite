import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from './database.constants.js';

@Injectable()
export class DatabaseContext {
  private readonly transactions = new AsyncLocalStorage<NodePgDatabase>();

  constructor(@Inject(DATABASE) private readonly database: NodePgDatabase) {}

  get connection(): NodePgDatabase {
    return this.transactions.getStore() ?? this.database;
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return this.database.transaction((transaction) =>
      this.transactions.run(transaction as NodePgDatabase, work),
    );
  }
}
