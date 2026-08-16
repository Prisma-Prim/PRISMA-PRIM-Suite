import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { ActiveCompanyContextLookup } from '../access/active-company-context.port.js';
import { DatabaseContext } from '../database/database-context.js';
import { companies } from '../database/schema/index.js';

@Injectable()
export class PostgresActiveCompanyContextLookup implements ActiveCompanyContextLookup {
  constructor(private readonly databaseContext: DatabaseContext) {}

  async findActive(
    workspaceId: string,
    requestedCompanyId: string,
  ): Promise<{ id: string; displayName: string } | undefined> {
    const [company] = await this.databaseContext.connection
      .select({ id: companies.id, displayName: companies.displayName })
      .from(companies)
      .where(
        and(
          eq(sql<string>`${companies.id}::text`, requestedCompanyId),
          eq(companies.workspaceId, workspaceId),
          eq(companies.status, 'active'),
        ),
      )
      .limit(1);
    return company;
  }
}
