import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import { companies, companyRoleAssignments } from '../database/schema/index.js';
import type { ActorContext } from './access.types.js';
import { COMPANY_CONTEXT_USE_BUNDLES } from './company-permissions.js';

@Injectable()
export class CompanyContextAuthorization {
  constructor(private readonly databaseContext: DatabaseContext) {}

  async hasCompanyContextAuthority(
    actor: ActorContext,
    companyId: string,
  ): Promise<boolean> {
    if (actor.workspacePermissions.includes('company.manage')) return true;
    const companyIds = await this.findAssignedActiveCompanyIds(
      actor,
      companyId,
    );
    return companyIds.length > 0;
  }

  async resolveVisibleCompanyScope(
    actor: ActorContext,
  ): Promise<CompanyContextVisibility> {
    if (actor.workspacePermissions.includes('company.manage')) {
      return { kind: 'all-active' };
    }
    return {
      kind: 'assigned-active',
      companyIds: await this.findAssignedActiveCompanyIds(actor),
    };
  }

  private async findAssignedActiveCompanyIds(
    actor: ActorContext,
    companyId?: string,
  ): Promise<readonly string[]> {
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
    if (companyId) {
      conditions.push(eq(sql<string>`${companies.id}::text`, companyId));
    }
    const rows = await this.databaseContext.connection
      .select({ companyId: companies.id })
      .from(companyRoleAssignments)
      .innerJoin(
        companies,
        and(
          eq(companies.workspaceId, companyRoleAssignments.workspaceId),
          eq(companies.id, companyRoleAssignments.companyId),
        ),
      )
      .where(and(...conditions));
    return rows.map((row) => row.companyId);
  }
}

export type CompanyContextVisibility =
  | { kind: 'all-active' }
  | { kind: 'assigned-active'; companyIds: readonly string[] };
