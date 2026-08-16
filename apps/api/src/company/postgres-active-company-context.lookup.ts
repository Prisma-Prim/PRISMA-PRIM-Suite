import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ActiveCompanyContextLookup } from '../access/active-company-context.port.js';
import { DatabaseContext } from '../database/database-context.js';
import { companies, companyRoleAssignments } from '../database/schema/index.js';

@Injectable()
export class PostgresActiveCompanyContextLookup implements ActiveCompanyContextLookup {
  constructor(private readonly databaseContext: DatabaseContext) {}

  async findActive(
    workspaceId: string,
    workspaceMembershipId: string,
    requestedCompanyId: string,
    canManageAllCompanies: boolean,
  ): Promise<{ id: string; displayName: string } | undefined> {
    const query = this.databaseContext.connection
      .select({ id: companies.id, displayName: companies.displayName })
      .from(companies);
    const source = canManageAllCompanies
      ? query
      : query.innerJoin(
          companyRoleAssignments,
          and(
            eq(companyRoleAssignments.workspaceId, companies.workspaceId),
            eq(companyRoleAssignments.companyId, companies.id),
            eq(
              companyRoleAssignments.workspaceMembershipId,
              workspaceMembershipId,
            ),
            eq(companyRoleAssignments.bundle, 'company_context_access'),
            isNull(companyRoleAssignments.revokedAt),
          ),
        );
    const [company] = await source
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

  async hasAnyActive(
    workspaceId: string,
    workspaceMembershipId: string,
    canManageAllCompanies: boolean,
  ): Promise<boolean> {
    if (canManageAllCompanies) {
      const [company] = await this.databaseContext.connection
        .select({ id: companies.id })
        .from(companies)
        .where(
          and(
            eq(companies.workspaceId, workspaceId),
            eq(companies.status, 'active'),
          ),
        )
        .limit(1);
      return Boolean(company);
    }
    const [assignment] = await this.databaseContext.connection
      .select({ id: companyRoleAssignments.id })
      .from(companyRoleAssignments)
      .innerJoin(
        companies,
        and(
          eq(companies.workspaceId, companyRoleAssignments.workspaceId),
          eq(companies.id, companyRoleAssignments.companyId),
          eq(companies.status, 'active'),
        ),
      )
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            workspaceMembershipId,
          ),
          eq(companyRoleAssignments.bundle, 'company_context_access'),
          isNull(companyRoleAssignments.revokedAt),
        ),
      )
      .limit(1);
    return Boolean(assignment);
  }
}
