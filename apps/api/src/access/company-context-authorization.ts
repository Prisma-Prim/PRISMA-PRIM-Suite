import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import { companies, companyRoleAssignments } from '../database/schema/index.js';
import type { ActiveCompanyContext, ActorContext } from './access.types.js';
import { COMPANY_CONTEXT_USE_BUNDLES } from './company-permissions.js';

@Injectable()
export class CompanyContextAuthorization {
  constructor(private readonly databaseContext: DatabaseContext) {}

  async resolveAuthorizedActiveCompany(
    actor: ActorContext,
    companyId: string,
  ): Promise<ActiveCompanyContext | undefined> {
    if (actor.workspacePermissions.includes('company.manage')) {
      return this.findActiveCompany(actor.workspaceId, companyId);
    }
    return (await this.findAssignedActiveCompanies(actor, companyId))[0];
  }

  async resolveVisibleCompanyScope(
    actor: ActorContext,
  ): Promise<CompanyContextVisibility> {
    if (actor.workspacePermissions.includes('company.manage')) {
      return { kind: 'all-active' };
    }
    return {
      kind: 'assigned-active',
      companyIds: (await this.findAssignedActiveCompanies(actor)).map(
        (company) => company.id,
      ),
    };
  }

  private async findActiveCompany(
    workspaceId: string,
    companyId: string,
  ): Promise<ActiveCompanyContext | undefined> {
    const [company] = await this.databaseContext.connection
      .select({ id: companies.id, displayName: companies.displayName })
      .from(companies)
      .where(
        and(
          eq(companies.workspaceId, workspaceId),
          eq(sql<string>`${companies.id}::text`, companyId),
          eq(companies.status, 'active'),
        ),
      )
      .limit(1);
    return company;
  }

  private async findAssignedActiveCompanies(
    actor: ActorContext,
    companyId?: string,
  ): Promise<readonly ActiveCompanyContext[]> {
    const conditions = [
      eq(companyRoleAssignments.workspaceId, actor.workspaceId),
      eq(
        companyRoleAssignments.workspaceMembershipId,
        actor.workspaceMembershipId,
      ),
      inArray(companyRoleAssignments.bundle, COMPANY_CONTEXT_USE_BUNDLES),
      isNull(companyRoleAssignments.revokedAt),
      eq(companies.status, 'active' as const),
    ];
    if (companyId !== undefined) {
      conditions.push(eq(sql<string>`${companies.id}::text`, companyId));
    }
    const rows = await this.databaseContext.connection
      .select({ id: companies.id, displayName: companies.displayName })
      .from(companyRoleAssignments)
      .innerJoin(
        companies,
        and(
          eq(companies.workspaceId, companyRoleAssignments.workspaceId),
          eq(companies.id, companyRoleAssignments.companyId),
        ),
      )
      .where(and(...conditions));
    return rows;
  }
}

export type CompanyContextVisibility =
  | { kind: 'all-active' }
  | { kind: 'assigned-active'; companyIds: readonly string[] };
