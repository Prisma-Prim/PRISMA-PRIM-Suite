import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import { companies, companyRoleAssignments } from '../database/schema/index.js';
import {
  COMPANY_PERMISSION_BUNDLES,
  type CompanyPermission,
} from './company-permissions.js';

@Injectable()
export class CompanyPermissionResolver {
  constructor(private readonly databaseContext: DatabaseContext) {}

  async has(
    workspaceId: string,
    workspaceMembershipId: string,
    companyId: string,
    permission: CompanyPermission,
  ): Promise<boolean> {
    const ids = await this.listCompanyIds(
      workspaceId,
      workspaceMembershipId,
      permission,
      companyId,
    );
    return ids.length > 0;
  }

  async listCompanyIds(
    workspaceId: string,
    workspaceMembershipId: string,
    permission: CompanyPermission,
    companyId?: string,
  ): Promise<string[]> {
    const conditions = [
      eq(companyRoleAssignments.workspaceId, workspaceId),
      eq(companyRoleAssignments.workspaceMembershipId, workspaceMembershipId),
      inArray(
        companyRoleAssignments.bundle,
        COMPANY_PERMISSION_BUNDLES[permission],
      ),
      isNull(companyRoleAssignments.revokedAt),
      eq(companies.status, 'active' as const),
    ];
    if (companyId) conditions.push(eq(companies.id, companyId));
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
