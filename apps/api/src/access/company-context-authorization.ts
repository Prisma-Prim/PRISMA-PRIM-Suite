import { Injectable, ForbiddenException } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import {
  companies,
  companyRoleAssignments,
  internalUsers,
  workspacePermissionGrants,
  workspaceMemberships,
} from '../database/schema/index.js';
import type { ActiveCompanyContext, ActorContext } from './access.types.js';
import {
  COMPANY_CONTEXT_USE_BUNDLES,
  COMPANY_TASK_MANAGER_BUNDLE,
  taskPermissionsFor,
  COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE,
  COMPANY_DOCUMENT_REGISTRAR_BUNDLE,
  documentPermissionsFor,
  COMPANY_PROJECT_ACCESS_BUNDLE,
  COMPANY_PROJECT_V1_PERMISSIONS,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
  companyDirectorClientPermissionsFor,
  COMPANY_COMMERCIAL_INTAKE_BUNDLE,
  commercialIntakePermissionsFor,
  COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE,
  commercialActivityPermissionsFor,
  type CompanyCommercialIntakePermission,
} from './company-permissions.js';

const COMPANY_CONTEXT_AUTHORIZING_BUNDLES = [
  ...COMPANY_CONTEXT_USE_BUNDLES,
  COMPANY_PROJECT_ACCESS_BUNDLE,
] as const;

@Injectable()
export class CompanyContextAuthorization {
  constructor(private readonly databaseContext: DatabaseContext) {}

  async resolveAuthorizedActiveCompany(
    actor: ActorContext,
    companyId: string,
  ): Promise<ActiveCompanyContext | undefined> {
    if (actor.workspacePermissions.includes('company.manage')) {
      const company = await this.findActiveCompany(
        actor.workspaceId,
        companyId,
      );
      if (!company) return undefined;
      return (
        (await this.findAssignedActiveCompanies(actor, companyId))[0] ?? company
      );
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

  async duplicateReviewAuthorizedCompanyIds(
    actor: ActorContext,
    companyIds: readonly string[],
    lock = false,
  ): Promise<ReadonlySet<string>> {
    const requiredCompanyIds = [...new Set(companyIds)];
    if (requiredCompanyIds.length === 0) return new Set();
    const query = this.databaseContext.connection
      .select({ companyId: companyRoleAssignments.companyId })
      .from(companyRoleAssignments)
      .innerJoin(
        workspaceMemberships,
        and(
          eq(
            workspaceMemberships.workspaceId,
            companyRoleAssignments.workspaceId,
          ),
          eq(
            workspaceMemberships.id,
            companyRoleAssignments.workspaceMembershipId,
          ),
          eq(workspaceMemberships.status, 'active'),
        ),
      )
      .innerJoin(
        internalUsers,
        and(
          eq(internalUsers.id, workspaceMemberships.internalUserId),
          eq(internalUsers.id, actor.internalUserId),
          eq(internalUsers.status, 'active'),
        ),
      )
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
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(
            companyRoleAssignments.bundle,
            COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
          ),
          eq(companyRoleAssignments.permissionSetVersion, 'v2'),
          isNull(companyRoleAssignments.revokedAt),
          inArray(companyRoleAssignments.companyId, requiredCompanyIds),
        ),
      );
    const rows = lock ? await query.for('share') : await query;
    return new Set(rows.map((row) => row.companyId));
  }

  async requireDocumentProjectManage(actor: ActorContext): Promise<void> {
    const companyId = await this.requireDocumentAccess(actor, true);
    await this.requireProjectAccess(actor, true);
    if (
      !actor.activeCompany?.documentPermissions?.includes(
        'document.project.manage',
      )
    )
      throw new ForbiddenException();
    const [assignment] = await this.databaseContext.connection
      .select({ id: companyRoleAssignments.id })
      .from(companyRoleAssignments)
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(companyRoleAssignments.companyId, companyId),
          eq(
            companyRoleAssignments.bundle,
            COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE,
          ),
          eq(companyRoleAssignments.permissionSetVersion, 'v1'),
          isNull(companyRoleAssignments.revokedAt),
        ),
      )
      .for('share');
    if (!assignment) throw new ForbiddenException();
  }
  async requireDocumentAccess(
    actor: ActorContext,
    lock = false,
  ): Promise<string> {
    const companyId = actor.activeCompany?.id;
    if (!companyId) throw new ForbiddenException();
    const query = this.databaseContext.connection
      .select({ id: companyRoleAssignments.id })
      .from(companyRoleAssignments)
      .innerJoin(
        workspaceMemberships,
        and(
          eq(
            workspaceMemberships.workspaceId,
            companyRoleAssignments.workspaceId,
          ),
          eq(
            workspaceMemberships.id,
            companyRoleAssignments.workspaceMembershipId,
          ),
          eq(workspaceMemberships.status, 'active'),
        ),
      )
      .innerJoin(
        internalUsers,
        and(
          eq(internalUsers.id, workspaceMemberships.internalUserId),
          eq(internalUsers.id, actor.internalUserId),
          eq(internalUsers.status, 'active'),
        ),
      )
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
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(companyRoleAssignments.companyId, companyId),
          eq(companyRoleAssignments.bundle, COMPANY_DOCUMENT_REGISTRAR_BUNDLE),
          inArray(companyRoleAssignments.permissionSetVersion, ['v1', 'v2']),
          isNull(companyRoleAssignments.revokedAt),
        ),
      );
    const rows = lock ? await query.for('share') : await query;
    if (rows.length === 0) throw new ForbiddenException();
    if (!actor.workspacePermissions.includes('client.manage')) {
      const clientQuery = this.databaseContext.connection
        .select({ id: companyRoleAssignments.id })
        .from(companyRoleAssignments)
        .where(
          and(
            eq(companyRoleAssignments.workspaceId, actor.workspaceId),
            eq(
              companyRoleAssignments.workspaceMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(companyRoleAssignments.companyId, companyId),
            eq(
              companyRoleAssignments.bundle,
              COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
            ),
            inArray(companyRoleAssignments.permissionSetVersion, ['v1', 'v2']),
            isNull(companyRoleAssignments.revokedAt),
          ),
        );
      const clientRows = lock
        ? await clientQuery.for('share')
        : await clientQuery;
      if (clientRows.length === 0) throw new ForbiddenException();
    }
    return companyId;
  }

  async requireDocumentCorrection(actor: ActorContext): Promise<string> {
    const companyId = await this.requireDocumentAccess(actor, true);
    if (
      !actor.activeCompany?.documentPermissions?.includes('document.correct') ||
      !actor.activeCompany.documentPermissions.includes(
        'document.reference.read',
      )
    )
      throw new ForbiddenException();
    const [assignment] = await this.databaseContext.connection
      .select({ id: companyRoleAssignments.id })
      .from(companyRoleAssignments)
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(companyRoleAssignments.companyId, companyId),
          eq(companyRoleAssignments.bundle, COMPANY_DOCUMENT_REGISTRAR_BUNDLE),
          eq(companyRoleAssignments.permissionSetVersion, 'v2'),
          isNull(companyRoleAssignments.revokedAt),
        ),
      )
      .for('share');
    if (!assignment) throw new ForbiddenException();
    return companyId;
  }

  async requireProjectAccess(
    actor: ActorContext,
    lock = false,
  ): Promise<string> {
    const companyId = actor.activeCompany?.id;
    if (!companyId) throw new ForbiddenException();
    const query = this.databaseContext.connection
      .select({ id: companyRoleAssignments.id })
      .from(companyRoleAssignments)
      .innerJoin(
        workspaceMemberships,
        and(
          eq(
            workspaceMemberships.workspaceId,
            companyRoleAssignments.workspaceId,
          ),
          eq(
            workspaceMemberships.id,
            companyRoleAssignments.workspaceMembershipId,
          ),
          eq(workspaceMemberships.status, 'active'),
        ),
      )
      .innerJoin(
        internalUsers,
        and(
          eq(internalUsers.id, workspaceMemberships.internalUserId),
          eq(internalUsers.id, actor.internalUserId),
          eq(internalUsers.status, 'active'),
        ),
      )
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
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(companyRoleAssignments.companyId, companyId),
          eq(companyRoleAssignments.bundle, COMPANY_PROJECT_ACCESS_BUNDLE),
          eq(companyRoleAssignments.permissionSetVersion, 'v1'),
          isNull(companyRoleAssignments.revokedAt),
        ),
      );
    const rows = lock ? await query.for('share') : await query;
    if (rows.length === 0) throw new ForbiddenException();
    if (!actor.workspacePermissions.includes('client.manage')) {
      const clientQuery = this.databaseContext.connection
        .select({ id: companyRoleAssignments.id })
        .from(companyRoleAssignments)
        .where(
          and(
            eq(companyRoleAssignments.workspaceId, actor.workspaceId),
            eq(
              companyRoleAssignments.workspaceMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(companyRoleAssignments.companyId, companyId),
            eq(
              companyRoleAssignments.bundle,
              COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
            ),
            inArray(companyRoleAssignments.permissionSetVersion, ['v1', 'v2']),
            isNull(companyRoleAssignments.revokedAt),
          ),
        );
      const clientRows = lock
        ? await clientQuery.for('share')
        : await clientQuery;
      if (clientRows.length === 0) throw new ForbiddenException();
    }
    return companyId;
  }

  async requireCommercialIntakeAccess(
    actor: ActorContext,
    mode: 'read' | 'create',
    lock = false,
  ): Promise<string> {
    const companyId = actor.activeCompany?.id;
    const permissions = actor.activeCompany?.commercialIntakePermissions ?? [];
    const required: readonly CompanyCommercialIntakePermission[] =
      mode === 'read'
        ? ['commercial.request.read', 'commercial.opportunity.read']
        : ['commercial.request.create', 'commercial.opportunity.create'];
    if (
      !companyId ||
      required.some((permission) => !permissions.includes(permission))
    )
      throw new ForbiddenException();
    const query = this.databaseContext.connection
      .select({ id: companyRoleAssignments.id })
      .from(companyRoleAssignments)
      .innerJoin(
        workspaceMemberships,
        and(
          eq(
            workspaceMemberships.workspaceId,
            companyRoleAssignments.workspaceId,
          ),
          eq(
            workspaceMemberships.id,
            companyRoleAssignments.workspaceMembershipId,
          ),
          eq(workspaceMemberships.status, 'active'),
        ),
      )
      .innerJoin(
        internalUsers,
        and(
          eq(internalUsers.id, workspaceMemberships.internalUserId),
          eq(internalUsers.id, actor.internalUserId),
          eq(internalUsers.status, 'active'),
        ),
      )
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
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(companyRoleAssignments.companyId, companyId),
          eq(companyRoleAssignments.bundle, COMPANY_COMMERCIAL_INTAKE_BUNDLE),
          eq(companyRoleAssignments.permissionSetVersion, 'v1'),
          isNull(companyRoleAssignments.revokedAt),
        ),
      );
    const rows = lock ? await query.for('share') : await query;
    if (rows.length === 0) throw new ForbiddenException();
    await this.requireLiveCompanyContext(actor, companyId, lock);
    return companyId;
  }

  private async requireLiveCompanyContext(
    actor: ActorContext,
    companyId: string,
    lock: boolean,
  ): Promise<void> {
    if (actor.workspacePermissions.includes('company.manage')) {
      const managerQuery = this.databaseContext.connection
        .select({ id: workspacePermissionGrants.id })
        .from(workspacePermissionGrants)
        .where(
          and(
            eq(workspacePermissionGrants.workspaceId, actor.workspaceId),
            eq(
              workspacePermissionGrants.workspaceMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(workspacePermissionGrants.permission, 'company.manage'),
          ),
        );
      const managerGrants = lock
        ? await managerQuery.for('share')
        : await managerQuery;
      if (managerGrants.length > 0) return;
    }

    const contextQuery = this.databaseContext.connection
      .select({ id: companyRoleAssignments.id })
      .from(companyRoleAssignments)
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(companyRoleAssignments.companyId, companyId),
          inArray(
            companyRoleAssignments.bundle,
            COMPANY_CONTEXT_AUTHORIZING_BUNDLES,
          ),
          isNull(companyRoleAssignments.revokedAt),
        ),
      );
    const contextAssignments = lock
      ? await contextQuery.for('share')
      : await contextQuery;
    if (contextAssignments.length === 0) throw new ForbiddenException();
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
    return company ? { ...company, clientPermissions: [] } : undefined;
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
      inArray(companyRoleAssignments.bundle, [
        ...COMPANY_CONTEXT_AUTHORIZING_BUNDLES,
        COMPANY_COMMERCIAL_INTAKE_BUNDLE,
        COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE,
        COMPANY_TASK_MANAGER_BUNDLE,
        COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE,
      ]),
      isNull(companyRoleAssignments.revokedAt),
      eq(companies.status, 'active' as const),
    ];
    if (companyId !== undefined) {
      conditions.push(eq(sql<string>`${companies.id}::text`, companyId));
    }
    const rows = await this.databaseContext.connection
      .select({
        id: companies.id,
        displayName: companies.displayName,
        bundle: companyRoleAssignments.bundle,
        assignmentId: companyRoleAssignments.id,
        permissionSetVersion: companyRoleAssignments.permissionSetVersion,
      })
      .from(companyRoleAssignments)
      .innerJoin(
        companies,
        and(
          eq(companies.workspaceId, companyRoleAssignments.workspaceId),
          eq(companies.id, companyRoleAssignments.companyId),
        ),
      )
      .where(and(...conditions));
    const companiesById = new Map<string, ActiveCompanyContext>();
    const independentlyAuthorizedCompanies = new Set<string>();
    for (const row of rows) {
      const existing = companiesById.get(row.id);
      const company: ActiveCompanyContext = existing ?? {
        id: row.id,
        displayName: row.displayName,
        clientPermissions: [],
      };
      if (row.bundle === COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE) {
        if (
          row.permissionSetVersion !== 'v1' &&
          row.permissionSetVersion !== 'v2'
        ) {
          continue;
        }
        const clientPermissions = companyDirectorClientPermissionsFor(
          row.permissionSetVersion,
        );
        company.clientPermissions = [...clientPermissions];
        company.clientPermissionAssignmentId = row.assignmentId;
        company.clientPermissionSetVersion = row.permissionSetVersion;
      }
      if (
        row.bundle === COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.documentPermissions = [
          ...(company.documentPermissions ?? []),
          'document.project.manage',
        ];
      }
      if (row.bundle === COMPANY_DOCUMENT_REGISTRAR_BUNDLE) {
        if (
          row.permissionSetVersion !== 'v1' &&
          row.permissionSetVersion !== 'v2'
        )
          continue;
        const permissions = documentPermissionsFor(row.permissionSetVersion);
        company.documentPermissions = [
          ...(company.documentPermissions ?? []),
          ...permissions,
        ];
        company.documentPermissionSetVersion = row.permissionSetVersion;
      }
      if (
        row.bundle === COMPANY_PROJECT_ACCESS_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.projectPermissions = [...COMPANY_PROJECT_V1_PERMISSIONS];
      }
      if (
        row.bundle === COMPANY_TASK_MANAGER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.taskPermissions = [
          ...taskPermissionsFor(row.permissionSetVersion),
        ];
        company.taskPermissionAssignmentId = row.assignmentId;
        company.taskPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_COMMERCIAL_INTAKE_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.commercialIntakePermissions = [
          ...commercialIntakePermissionsFor(row.permissionSetVersion),
        ];
        company.commercialIntakePermissionAssignmentId = row.assignmentId;
        company.commercialIntakePermissionSetVersion = 'v1';
      }
      // The reader bundle carries Activity read only. It never contributes
      // Company context, so it is resolved but not authorizing.
      if (
        row.bundle === COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.commercialActivityPermissions = [
          ...commercialActivityPermissionsFor(row.permissionSetVersion),
        ];
        company.commercialActivityPermissionSetVersion = 'v1';
      }
      if (
        COMPANY_CONTEXT_AUTHORIZING_BUNDLES.some(
          (bundle) => row.bundle === bundle,
        )
      ) {
        independentlyAuthorizedCompanies.add(row.id);
      }
      companiesById.set(row.id, company);
    }
    // Organizer contributes only its mutation permission. Company context must
    // already follow from another assignment or Workspace Company management.
    return [...companiesById.values()].filter(
      (company) =>
        actor.workspacePermissions.includes('company.manage') ||
        independentlyAuthorizedCompanies.has(company.id),
    );
  }
}

export type CompanyContextVisibility =
  | { kind: 'all-active' }
  | { kind: 'assigned-active'; companyIds: readonly string[] };
