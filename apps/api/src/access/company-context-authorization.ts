import {
  COMPANY_CONTRACT_PREPARER_BUNDLE,
  contractPreparerPermissionsFor,
  contractApproverPermissionsFor,
  COMPANY_CONTRACT_PREPARER_V1_PERMISSIONS,
  COMPANY_CONTRACT_APPROVER_V1_PERMISSIONS,
  COMPANY_CONTRACT_APPROVER_BUNDLE,
  type CompanyContractPermission,
} from './company-permissions.js';
import { Injectable, ForbiddenException } from '@nestjs/common';
import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
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
  COMPANY_DOCUMENT_APPROVER_BUNDLE,
  COMPANY_DOCUMENT_CONTENT_READER_BUNDLE,
  COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE,
  documentApproverPermissionsFor,
  documentPermissionsFor,
  isDocumentPermissionSetVersion,
  type DocumentPermission,
  type DocumentPermissionSetVersion,
  COMPANY_PROJECT_ACCESS_BUNDLE,
  COMPANY_PROJECT_APPROVER_BUNDLE,
  projectApproverPermissionsFor,
  isProjectPermissionSetVersion,
  projectPermissionsFor,
  type CompanyProjectPermissionSetVersion,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
  companyDirectorClientPermissionsFor,
  COMPANY_COMMERCIAL_INTAKE_BUNDLE,
  commercialIntakePermissionsFor,
  isCommercialIntakePermissionSetVersion,
  COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE,
  commercialActivityPermissionsFor,
  type CompanyCommercialIntakePermission,
  type CompanyCommercialIntakePermissionSetVersion,
  COMPANY_SERVICE_CATALOGUE_BUNDLE,
  serviceCataloguePermissionsFor,
  type CompanyServiceCataloguePermission,
  COMPANY_PRICING_CONFIGURATION_BUNDLE,
  pricingConfigurationPermissionsFor,
  type CompanyPricingConfigurationPermission,
  COMPANY_PRICING_USER_BUNDLE,
  pricingUserPermissionsFor,
  type CompanyPricingUserPermission,
  COMPANY_OFFER_PREPARER_BUNDLE,
  COMPANY_OFFER_APPROVER_BUNDLE,
  offerPreparerPermissionsFor,
  type CompanyOfferPermission,
  COMPANY_OFFER_PREPARER_V1_PERMISSIONS,
  COMPANY_OFFER_APPROVER_V1_PERMISSIONS,
  offerApproverPermissionsFor,
  COMMERCIAL_INTAKE_READ_PERMISSIONS,
  commercialIntakeVersionsWith,
  COMPANY_OPPORTUNITY_MANAGER_BUNDLE,
  COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE,
  projectStagePermissionsFor,
  COMPANY_PROJECT_TEMPLATE_USER_BUNDLE,
  projectTemplatePermissionsFor,
  projectTemplateConfigurationPermissionsFor,
  COMPANY_PROJECT_TEMPLATE_CONFIGURATION_BUNDLE,
  COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE,
  salesStageConfigurationPermissionsFor,
  isOpportunityManagerPermissionSetVersion,
  opportunityManagerPermissionsFor,
  opportunityManagerVersionsWith,
  type CompanyOpportunityManagerPermission,
  COMPANY_PRICING_ADJUSTMENT_BUNDLE,
  pricingAdjustmentPermissionsFor,
  type CompanyPricingAdjustmentPermission,
  COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE,
  COMPANY_PROFITABILITY_DIRECTOR_BUNDLE,
  profitabilityContributorPermissionsFor,
  profitabilityDirectorPermissionsFor,
} from './company-permissions.js';

const COMPANY_CONTEXT_AUTHORIZING_BUNDLES = [
  ...COMPANY_CONTEXT_USE_BUNDLES,
  COMPANY_PROJECT_ACCESS_BUNDLE,
] as const;

// Every captured Registrar version carries Document metadata and
// Representation read; null or unknown versions fail closed.
const DOCUMENT_READ_REGISTRAR_VERSIONS = [
  'v1',
  'v2',
  'v3',
] as const satisfies readonly DocumentPermissionSetVersion[];

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
          inArray(companyRoleAssignments.permissionSetVersion, [
            ...DOCUMENT_READ_REGISTRAR_VERSIONS,
          ]),
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

  // `document.correct` exists in captured Registrar v2 and v3; a legacy v1
  // assignment fails closed.
  async requireDocumentCorrection(actor: ActorContext): Promise<string> {
    return this.requireLockedDocumentAuthority(actor, 'document.correct', {
      bundle: COMPANY_DOCUMENT_REGISTRAR_BUNDLE,
      versions: ['v2', 'v3'],
    });
  }

  // `document.version.manage` exists only in captured Registrar v3.
  async requireDocumentVersionManagement(actor: ActorContext): Promise<string> {
    return this.requireLockedDocumentAuthority(
      actor,
      'document.version.manage',
      { bundle: COMPANY_DOCUMENT_REGISTRAR_BUNDLE, versions: ['v3'] },
    );
  }

  // Designation requires a live captured Company Document Approver v1 in
  // addition to the delivered Document read authority, which any Registrar
  // version provides. The Approver itself grants neither.
  async requireDocumentVersionDesignation(
    actor: ActorContext,
  ): Promise<string> {
    return this.requireLockedDocumentAuthority(
      actor,
      'document.version.designate_official',
      { bundle: COMPANY_DOCUMENT_APPROVER_BUNDLE, versions: ['v1'] },
    );
  }

  async requireDocumentContentRead(actor: ActorContext): Promise<string> {
    return this.requireLockedDocumentAuthority(actor, 'document.content.read', {
      bundle: COMPANY_DOCUMENT_CONTENT_READER_BUNDLE,
      versions: ['v1'],
    });
  }
  async requireDocumentContentUpload(actor: ActorContext): Promise<string> {
    await this.requireDocumentContentRead(actor);
    await this.requireDocumentVersionManagement(actor);
    return this.requireLockedDocumentAuthority(
      actor,
      'document.content.upload',
      { bundle: COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE, versions: ['v1'] },
    );
  }
  async hasDocumentContentRead(actor: ActorContext): Promise<boolean> {
    const companyId = actor.activeCompany?.id;
    if (
      !companyId ||
      !actor.activeCompany?.documentPermissions?.includes(
        'document.content.read',
      )
    )
      return false;
    const [assignment] = await this.databaseContext.connection
      .select({ id: companyRoleAssignments.id })
      .from(companyRoleAssignments)
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(companyRoleAssignments.companyId, companyId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(
            companyRoleAssignments.bundle,
            COMPANY_DOCUMENT_CONTENT_READER_BUNDLE,
          ),
          eq(companyRoleAssignments.permissionSetVersion, 'v1'),
          isNull(companyRoleAssignments.revokedAt),
        ),
      );
    return assignment !== undefined;
  }

  /**
   * A Document command's live authority: the locked Document read authority,
   * Representation read, the required permission and its captured assignment
   * locked `FOR SHARE`, which serializes the command against revocation.
   */
  private async requireLockedDocumentAuthority(
    actor: ActorContext,
    permission: DocumentPermission,
    grant:
      | {
          bundle: typeof COMPANY_DOCUMENT_REGISTRAR_BUNDLE;
          versions: readonly DocumentPermissionSetVersion[];
        }
      | {
          bundle:
            | typeof COMPANY_DOCUMENT_APPROVER_BUNDLE
            | typeof COMPANY_DOCUMENT_CONTENT_READER_BUNDLE
            | typeof COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE;
          versions: readonly ['v1'];
        },
  ): Promise<string> {
    const companyId = await this.requireDocumentAccess(actor, true);
    if (
      !actor.activeCompany?.documentPermissions?.includes(permission) ||
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
          eq(companyRoleAssignments.bundle, grant.bundle),
          inArray(companyRoleAssignments.permissionSetVersion, [
            ...grant.versions,
          ]),
          isNull(companyRoleAssignments.revokedAt),
        ),
      )
      .for('share');
    if (!assignment) throw new ForbiddenException();
    return companyId;
  }

  // A source catalogue contains no Client or Project records. Validate the
  // live captured Project read permission without granting access to that data.
  async requireProjectReadPermission(
    actor: ActorContext,
    lock = false,
  ): Promise<string> {
    const companyId = await this.requireProjectPermissionAssignment(
      actor,
      ['v1', 'v2'],
      lock,
    );
    await this.requireLiveCompanyContext(actor, companyId, lock);
    return companyId;
  }

  // Every delivered Project read and create accepts either captured version.
  async requireProjectAccess(
    actor: ActorContext,
    lock = false,
  ): Promise<string> {
    return this.requireProjectAssignment(actor, ['v1', 'v2'], lock);
  }

  // `project.update` exists only in captured v2, so a legacy v1 assignment
  // fails closed. A locked read serializes a command against revocation,
  // suspension and the loss of the Client read prerequisite.
  async requireProjectUpdate(
    actor: ActorContext,
    lock = false,
  ): Promise<string> {
    if (!actor.activeCompany?.projectPermissions?.includes('project.update'))
      throw new ForbiddenException();
    return this.requireProjectAssignment(actor, ['v2'], lock);
  }

  // Company Project Approver v1 carries only the lifecycle permissions. Its
  // holder independently needs current Project read and Client read in the
  // active Company. A locked read serializes a transition against the
  // revocation of any of them.
  async requireProjectLifecycleTransition(
    actor: ActorContext,
    lock = false,
  ): Promise<string> {
    const companyId = await this.requireProjectAccess(actor, lock);
    if (
      !actor.activeCompany?.projectApproverPermissions?.includes(
        'project.lifecycle.transition',
      )
    )
      throw new ForbiddenException();
    await this.requireLiveCapturedAssignment(
      actor,
      companyId,
      capturedGrant(COMPANY_PROJECT_APPROVER_BUNDLE),
      lock,
    );
    return companyId;
  }

  async requireProjectClose(
    actor: ActorContext,
    lock = false,
  ): Promise<string> {
    const companyId = await this.requireProjectAccess(actor, lock);
    if (
      !actor.activeCompany?.projectApproverPermissions?.includes(
        'project.close',
      )
    )
      throw new ForbiddenException();
    await this.requireLiveCapturedAssignment(
      actor,
      companyId,
      capturedGrant(COMPANY_PROJECT_APPROVER_BUNDLE),
      lock,
    );
    return companyId;
  }

  private async requireProjectPermissionAssignment(
    actor: ActorContext,
    capturedVersions: readonly CompanyProjectPermissionSetVersion[],
    lock: boolean,
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
          inArray(companyRoleAssignments.permissionSetVersion, [
            ...capturedVersions,
          ]),
          isNull(companyRoleAssignments.revokedAt),
        ),
      );
    const rows = lock ? await query.for('share') : await query;
    if (rows.length === 0) throw new ForbiddenException();
    return companyId;
  }

  private async requireProjectAssignment(
    actor: ActorContext,
    capturedVersions: readonly CompanyProjectPermissionSetVersion[],
    lock: boolean,
  ): Promise<string> {
    const companyId = await this.requireProjectPermissionAssignment(
      actor,
      capturedVersions,
      lock,
    );
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
    mode: CommercialIntakeAccessMode,
    lock = false,
  ): Promise<string> {
    const companyId = actor.activeCompany?.id;
    const permissions = actor.activeCompany?.commercialIntakePermissions ?? [];
    const { required, capturedVersions } = commercialIntakeRequirement(mode);
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
          inArray(companyRoleAssignments.permissionSetVersion, [
            ...capturedVersions,
          ]),
          isNull(companyRoleAssignments.revokedAt),
        ),
      );
    const rows = lock ? await query.for('share') : await query;
    if (rows.length === 0) throw new ForbiddenException();
    await this.requireLiveCompanyContext(actor, companyId, lock);
    return companyId;
  }

  // Company Service Catalogue v1 grants catalogue authority only. Company
  // context must already follow from an independent assignment, and a locked
  // read serializes a command against a concurrent revocation of the bundle.
  async requireServiceCatalogueAccess(
    actor: ActorContext,
    required: readonly CompanyServiceCataloguePermission[],
    lock = false,
  ): Promise<string> {
    const companyId = actor.activeCompany?.id;
    const permissions = actor.activeCompany?.serviceCataloguePermissions ?? [];
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
          eq(companyRoleAssignments.bundle, COMPANY_SERVICE_CATALOGUE_BUNDLE),
          eq(companyRoleAssignments.permissionSetVersion, 'v1'),
          isNull(companyRoleAssignments.revokedAt),
        ),
      );
    const rows = lock ? await query.for('share') : await query;
    if (rows.length === 0) throw new ForbiddenException();
    await this.requireLiveCompanyContext(actor, companyId, lock);
    return companyId;
  }

  // Configuration read is carried by a live captured Company Pricing
  // Configuration v1 or Company Pricing User v1 assignment, and management by
  // Configuration v1 alone (pricing PRD section 10). A bundle is accepted only
  // when its own captured permissions include every required one, so neither
  // lends the other anything. Company context must already follow from an
  // independent assignment, and a locked read serializes a command against a
  // concurrent revocation.
  async requirePricingConfigurationAccess(
    actor: ActorContext,
    required: readonly CompanyPricingConfigurationPermission[],
    lock = false,
  ): Promise<string> {
    const company = actor.activeCompany;
    const grants: SQL[] = [];
    if (carriesEvery(company?.pricingConfigurationPermissions, required))
      grants.push(capturedGrant(COMPANY_PRICING_CONFIGURATION_BUNDLE));
    if (carriesEvery(company?.pricingUserPermissions, required))
      grants.push(capturedGrant(COMPANY_PRICING_USER_BUNDLE));
    if (!company || grants.length === 0) throw new ForbiddenException();
    await this.requireLiveCapturedAssignment(
      actor,
      company.id,
      anyCapturedGrant(grants),
      lock,
    );
    await this.requireLiveCompanyContext(actor, company.id, lock);
    return company.id;
  }

  // Reassignment needs the live captured Company Opportunity Manager v1 or v2.
  async requireOpportunityAssign(
    actor: ActorContext,
    lock = false,
  ): Promise<string> {
    return this.requireOpportunityManagerPermission(
      actor,
      'commercial.opportunity.assign',
      lock,
    );
  }

  // The outcome status change exists only in captured Company Opportunity
  // Manager v2, so a legacy v1 assignment fails closed.
  async requireOpportunityOutcomeChange(
    actor: ActorContext,
    lock = false,
  ): Promise<string> {
    return this.requireOpportunityManagerPermission(
      actor,
      'commercial.opportunity.outcome.change',
      lock,
    );
  }

  // A manager permission needs a live captured Opportunity Manager version
  // carrying it, a live Commercial Intake version carrying both reads and
  // live Company context, all in the same active Company. A locked read
  // serializes the command against revocation of any of them and suspension
  // of the actor. It leaves the Company row unlocked: reassignment later
  // share-locks its target member before that row, the order Company
  // assignment administration uses, so a concurrent grant or revocation for
  // the target cannot deadlock with it.
  private async requireOpportunityManagerPermission(
    actor: ActorContext,
    permission: CompanyOpportunityManagerPermission,
    lock: boolean,
  ): Promise<string> {
    const company = actor.activeCompany;
    const intakePermissions = company?.commercialIntakePermissions ?? [];
    if (
      !company?.opportunityManagerPermissions?.includes(permission) ||
      COMMERCIAL_INTAKE_READ_PERMISSIONS.some(
        (required) => !intakePermissions.includes(required),
      )
    )
      throw new ForbiddenException();
    await this.requireLiveCapturedAssignment(
      actor,
      company.id,
      // One array parameter keeps this locked read's text short enough for
      // pg_stat_activity to show its locking clause.
      sql`(${eq(
        companyRoleAssignments.bundle,
        COMPANY_OPPORTUNITY_MANAGER_BUNDLE,
      )} AND ${companyRoleAssignments.permissionSetVersion} = ANY(${sql.param(
        opportunityManagerVersionsWith(permission),
      )}))`,
      lock,
      'member-rows',
    );
    await this.requireLiveCommercialIntakeRead(actor, company.id, lock);
    await this.requireLiveCompanyContext(actor, company.id, lock);
    return company.id;
  }

  // Sales Stage configuration needs the live captured Company Sales Stage
  // Configuration v1, a live Commercial Intake version carrying both reads and
  // live Company context, all in the same active Company. A locked read
  // serializes the command against revocation of any of them and suspension
  // of the actor.
  async requireSalesStageConfiguration(
    actor: ActorContext,
    lock = false,
  ): Promise<string> {
    const company = actor.activeCompany;
    if (
      !company?.salesStageConfigurationPermissions?.includes(
        'commercial.sales_stage.configure',
      ) ||
      !carriesEvery(
        company.commercialIntakePermissions,
        COMMERCIAL_INTAKE_READ_PERMISSIONS,
      )
    )
      throw new ForbiddenException();
    await this.requireLiveCapturedAssignment(
      actor,
      company.id,
      capturedGrant(COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE),
      lock,
      'member-rows',
    );
    await this.requireLiveCommercialIntakeRead(actor, company.id, lock);
    await this.requireLiveCompanyContext(actor, company.id, lock);
    return company.id;
  }

  // The live captured Commercial Intake read prerequisite of an opt-in
  // commercial bundle: any captured version carrying both reads.
  private async requireLiveCommercialIntakeRead(
    actor: ActorContext,
    companyId: string,
    lock: boolean,
  ): Promise<void> {
    await this.requireLiveCapturedAssignment(
      actor,
      companyId,
      sql`(${eq(
        companyRoleAssignments.bundle,
        COMPANY_COMMERCIAL_INTAKE_BUNDLE,
      )} AND ${inArray(
        companyRoleAssignments.permissionSetVersion,
        commercialIntakeVersionsWith(COMMERCIAL_INTAKE_READ_PERMISSIONS),
      )})`,
      lock,
      'member-rows',
    );
  }

  // Calculation belongs only to Company Pricing User v1. Snapshot reads use
  // requirePricingSnapshotReadAccess because Offer Preparer v1 also carries
  // that one permission without gaining calculation authority.
  async requirePricingUserAccess(
    actor: ActorContext,
    required: readonly CompanyPricingUserPermission[],
    lock = false,
  ): Promise<string> {
    const company = actor.activeCompany;
    if (!company || !carriesEvery(company.pricingUserPermissions, required))
      throw new ForbiddenException();
    await this.requireLiveCapturedAssignment(
      actor,
      company.id,
      capturedGrant(COMPANY_PRICING_USER_BUNDLE),
      lock,
    );
    await this.requireLiveCompanyContext(actor, company.id, lock);
    return company.id;
  }

  async requireContractAccess(
    actor: ActorContext,
    required: readonly CompanyContractPermission[],
    lock = false,
  ): Promise<string> {
    const company = actor.activeCompany;
    if (!company || !carriesEvery(company.contractPermissions, required))
      throw new ForbiddenException();
    const grants: SQL[] = [];
    if (
      required.every((p) =>
        COMPANY_CONTRACT_PREPARER_V1_PERMISSIONS.some((own) => own === p),
      )
    )
      grants.push(capturedGrant(COMPANY_CONTRACT_PREPARER_BUNDLE));
    if (
      required.every((p) =>
        COMPANY_CONTRACT_APPROVER_V1_PERMISSIONS.some((own) => own === p),
      )
    )
      grants.push(capturedGrant(COMPANY_CONTRACT_APPROVER_BUNDLE));
    if (!grants.length) throw new ForbiddenException();
    await this.requireLiveCapturedAssignment(
      actor,
      company.id,
      anyCapturedGrant(grants),
      lock,
    );
    await this.requireLiveCompanyContext(actor, company.id, lock);
    return company.id;
  }

  async requireContractQualityAccess(
    actor: ActorContext,
    lock = false,
  ): Promise<string> {
    const company = actor.activeCompany;
    const grants: SQL[] = [];
    if (company?.contractPermissions?.includes('commercial.contract.prepare'))
      grants.push(capturedGrant(COMPANY_CONTRACT_PREPARER_BUNDLE));
    if (company?.contractPermissions?.includes('commercial.contract.approve'))
      grants.push(capturedGrant(COMPANY_CONTRACT_APPROVER_BUNDLE));
    if (!company || !grants.length) throw new ForbiddenException();
    await this.requireLiveCapturedAssignment(
      actor,
      company.id,
      anyCapturedGrant(grants),
      lock,
    );
    await this.requireLiveCompanyContext(actor, company.id, lock);
    return company.id;
  }

  // The bundles are independent from Company context and Opportunity read.
  // The Opportunity owner must separately prove target readability.
  async requireProfitabilityEstimateAccess(
    actor: ActorContext,
    operation: 'read' | 'create' | 'decide',
    lock = false,
  ): Promise<string> {
    const company = actor.activeCompany;
    const grants: SQL[] = [];
    if (
      company?.profitabilityContributorPermissions?.includes(
        'commercial.profitability_estimate.read',
      ) &&
      (operation === 'read' ||
        (operation === 'create' &&
          company.profitabilityContributorPermissions.includes(
            'commercial.profitability_estimate.create',
          )))
    )
      grants.push(capturedGrant(COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE));
    if (
      company?.profitabilityDirectorPermissions?.includes(
        'commercial.profitability_estimate.read',
      ) &&
      (operation === 'read' ||
        (operation === 'decide' &&
          company.profitabilityDirectorPermissions.includes(
            'commercial.profitability_estimate.decide',
          )))
    )
      grants.push(capturedGrant(COMPANY_PROFITABILITY_DIRECTOR_BUNDLE));
    if (!company || grants.length === 0) throw new ForbiddenException();
    await this.requireLiveCapturedAssignment(
      actor,
      company.id,
      anyCapturedGrant(grants),
      lock,
    );
    await this.requireLiveCompanyContext(actor, company.id, lock);
    return company.id;
  }

  async requireOfferAccess(
    actor: ActorContext,
    required: readonly CompanyOfferPermission[],
    lock = false,
  ): Promise<string> {
    const company = actor.activeCompany;
    if (!company || !carriesEvery(company.offerPermissions, required))
      throw new ForbiddenException();
    const grants: SQL[] = [];
    if (
      required.every((p) =>
        COMPANY_OFFER_PREPARER_V1_PERMISSIONS.some((own) => own === p),
      )
    )
      grants.push(capturedGrant(COMPANY_OFFER_PREPARER_BUNDLE));
    if (
      required.every((p) =>
        COMPANY_OFFER_APPROVER_V1_PERMISSIONS.some((own) => own === p),
      )
    )
      grants.push(capturedGrant(COMPANY_OFFER_APPROVER_BUNDLE));
    if (!grants.length) throw new ForbiddenException();
    await this.requireLiveCapturedAssignment(
      actor,
      company.id,
      anyCapturedGrant(grants),
      lock,
    );
    await this.requireLiveCompanyContext(actor, company.id, lock);
    return company.id;
  }

  async requireOfferQualityAccess(
    actor: ActorContext,
    lock = false,
  ): Promise<string> {
    const company = actor.activeCompany;
    const grants: SQL[] = [];
    if (company?.offerPermissions?.includes('commercial.offer.prepare'))
      grants.push(capturedGrant(COMPANY_OFFER_PREPARER_BUNDLE));
    if (company?.offerPermissions?.includes('commercial.offer.approve'))
      grants.push(capturedGrant(COMPANY_OFFER_APPROVER_BUNDLE));
    if (!company || !grants.length) throw new ForbiddenException();
    await this.requireLiveCapturedAssignment(
      actor,
      company.id,
      anyCapturedGrant(grants),
      lock,
    );
    await this.requireLiveCompanyContext(actor, company.id, lock);
    return company.id;
  }

  // Applying an adjustment requires its own captured v1 assignment. It does
  // not lend calculation, Snapshot read or Company context authority.
  async requirePricingAdjustmentAccess(
    actor: ActorContext,
    required: readonly CompanyPricingAdjustmentPermission[],
    lock = false,
  ): Promise<string> {
    const company = actor.activeCompany;
    if (
      !company ||
      !carriesEvery(company.pricingAdjustmentPermissions, required)
    )
      throw new ForbiddenException();
    await this.requireLiveCapturedAssignment(
      actor,
      company.id,
      capturedGrant(COMPANY_PRICING_ADJUSTMENT_BUNDLE),
      lock,
    );
    await this.requireLiveCompanyContext(actor, company.id, lock);
    return company.id;
  }

  // Snapshot read may come from Pricing User v1 or Offer Preparer v1. Each
  // grant is checked independently and neither confers calculation authority.
  async requirePricingSnapshotReadAccess(
    actor: ActorContext,
    lock = false,
  ): Promise<string> {
    const company = actor.activeCompany;
    const grants: SQL[] = [];
    if (
      company?.pricingUserPermissions?.includes(
        'commercial.pricing.snapshot.read',
      )
    )
      grants.push(capturedGrant(COMPANY_PRICING_USER_BUNDLE));
    if (company?.offerPermissions?.includes('commercial.pricing.snapshot.read'))
      grants.push(capturedGrant(COMPANY_OFFER_PREPARER_BUNDLE));
    if (!company || grants.length === 0) throw new ForbiddenException();
    await this.requireLiveCapturedAssignment(
      actor,
      company.id,
      anyCapturedGrant(grants),
      lock,
    );
    await this.requireLiveCompanyContext(actor, company.id, lock);
    return company.id;
  }

  // Offering read is carried by a live captured Company Service Catalogue v1,
  // Company Pricing Configuration v1 or Company Pricing User v1 assignment
  // (pricing PRD section 10). None confers any other permission of another.
  async requireOfferingReadAccess(actor: ActorContext): Promise<string> {
    const company = actor.activeCompany;
    const grants: SQL[] = [];
    if (
      company?.serviceCataloguePermissions?.includes('commercial.offering.read')
    )
      grants.push(capturedGrant(COMPANY_SERVICE_CATALOGUE_BUNDLE));
    if (
      company?.pricingConfigurationPermissions?.includes(
        'commercial.offering.read',
      )
    )
      grants.push(capturedGrant(COMPANY_PRICING_CONFIGURATION_BUNDLE));
    if (company?.pricingUserPermissions?.includes('commercial.offering.read'))
      grants.push(capturedGrant(COMPANY_PRICING_USER_BUNDLE));
    if (!company || grants.length === 0) throw new ForbiddenException();
    await this.requireLiveCapturedAssignment(
      actor,
      company.id,
      anyCapturedGrant(grants),
      false,
    );
    await this.requireLiveCompanyContext(actor, company.id, false);
    return company.id;
  }

  private async requireLiveCapturedAssignment(
    actor: ActorContext,
    companyId: string,
    grant: SQL,
    lock: boolean,
    // Which joined rows a locked read share-locks: every row, or only the
    // assignment, membership and Internal User rows of the actor.
    lockedRows: 'all-rows' | 'member-rows' = 'all-rows',
  ): Promise<void> {
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
          grant,
          isNull(companyRoleAssignments.revokedAt),
        ),
      );
    const rows = !lock
      ? await query
      : lockedRows === 'member-rows'
        ? await query.for('share', {
            of: [companyRoleAssignments, workspaceMemberships, internalUsers],
          })
        : await query.for('share');
    if (rows.length === 0) throw new ForbiddenException();
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
      inArray(sql`${companyRoleAssignments.bundle}::text`, [
        ...COMPANY_CONTEXT_AUTHORIZING_BUNDLES,
        COMPANY_COMMERCIAL_INTAKE_BUNDLE,
        COMPANY_SERVICE_CATALOGUE_BUNDLE,
        COMPANY_PRICING_CONFIGURATION_BUNDLE,
        COMPANY_PRICING_USER_BUNDLE,
        COMPANY_OFFER_PREPARER_BUNDLE,
        COMPANY_CONTRACT_PREPARER_BUNDLE,
        COMPANY_CONTRACT_APPROVER_BUNDLE,
        COMPANY_OFFER_APPROVER_BUNDLE,
        COMPANY_PRICING_ADJUSTMENT_BUNDLE,
        COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE,
        COMPANY_OPPORTUNITY_MANAGER_BUNDLE,
        COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE,
        COMPANY_PROJECT_TEMPLATE_USER_BUNDLE,
        COMPANY_PROJECT_TEMPLATE_CONFIGURATION_BUNDLE,
        COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE,
        COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE,
        COMPANY_PROFITABILITY_DIRECTOR_BUNDLE,
        COMPANY_TASK_MANAGER_BUNDLE,
        COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE,
        COMPANY_PROJECT_APPROVER_BUNDLE,
        COMPANY_DOCUMENT_APPROVER_BUNDLE,
        COMPANY_DOCUMENT_CONTENT_READER_BUNDLE,
        COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE,
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
      // Like the Organizer, the Approver contributes only its designation
      // permission and never Company context.
      if (
        row.bundle === COMPANY_DOCUMENT_APPROVER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.documentPermissions = [
          ...(company.documentPermissions ?? []),
          ...documentApproverPermissionsFor(row.permissionSetVersion),
        ];
        company.documentApproverAssignmentId = row.assignmentId;
        company.documentApproverPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_DOCUMENT_CONTENT_READER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.documentPermissions = [
          ...(company.documentPermissions ?? []),
          'document.content.read',
        ];
        company.documentContentReaderAssignmentId = row.assignmentId;
        company.documentContentReaderPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.documentPermissions = [
          ...(company.documentPermissions ?? []),
          'document.content.upload',
        ];
        company.documentContentUploaderAssignmentId = row.assignmentId;
        company.documentContentUploaderPermissionSetVersion = 'v1';
      }
      if (row.bundle === COMPANY_DOCUMENT_REGISTRAR_BUNDLE) {
        if (!isDocumentPermissionSetVersion(row.permissionSetVersion)) continue;
        const permissions = documentPermissionsFor(row.permissionSetVersion);
        company.documentPermissions = [
          ...(company.documentPermissions ?? []),
          ...permissions,
        ];
        company.documentPermissionSetVersion = row.permissionSetVersion;
      }
      if (
        row.bundle === COMPANY_PROJECT_ACCESS_BUNDLE &&
        isProjectPermissionSetVersion(row.permissionSetVersion)
      ) {
        company.projectPermissions = [
          ...projectPermissionsFor(row.permissionSetVersion),
        ];
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
        isCommercialIntakePermissionSetVersion(row.permissionSetVersion)
      ) {
        company.commercialIntakePermissions = [
          ...commercialIntakePermissionsFor(row.permissionSetVersion),
        ];
        company.commercialIntakePermissionAssignmentId = row.assignmentId;
        company.commercialIntakePermissionSetVersion = row.permissionSetVersion;
      }
      if (
        row.bundle === COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.profitabilityContributorPermissions = [
          ...profitabilityContributorPermissionsFor(row.permissionSetVersion),
        ];
        company.profitabilityContributorPermissionAssignmentId =
          row.assignmentId;
        company.profitabilityContributorPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_PROFITABILITY_DIRECTOR_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.profitabilityDirectorPermissions = [
          ...profitabilityDirectorPermissionsFor(row.permissionSetVersion),
        ];
        company.profitabilityDirectorPermissionAssignmentId = row.assignmentId;
        company.profitabilityDirectorPermissionSetVersion = 'v1';
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
      // The manager bundle carries reassignment and, from v2, the outcome
      // status change. It never contributes Company context; its
      // prerequisites are evaluated separately.
      if (
        row.bundle === COMPANY_OPPORTUNITY_MANAGER_BUNDLE &&
        isOpportunityManagerPermissionSetVersion(row.permissionSetVersion)
      ) {
        company.opportunityManagerPermissions = [
          ...opportunityManagerPermissionsFor(row.permissionSetVersion),
        ];
        company.opportunityManagerPermissionAssignmentId = row.assignmentId;
        company.opportunityManagerPermissionSetVersion =
          row.permissionSetVersion;
      }
      if (
        row.bundle === COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.projectStagePermissions = [
          ...projectStagePermissionsFor(row.permissionSetVersion),
        ];
        company.projectStagePermissionAssignmentId = row.assignmentId;
        company.projectStagePermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_PROJECT_TEMPLATE_USER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.projectTemplatePermissions = [
          ...projectTemplatePermissionsFor(row.permissionSetVersion),
        ];
        company.projectTemplatePermissionAssignmentId = row.assignmentId;
        company.projectTemplatePermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_PROJECT_TEMPLATE_CONFIGURATION_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.projectTemplateConfigurationPermissions = [
          ...projectTemplateConfigurationPermissionsFor(
            row.permissionSetVersion,
          ),
        ];
        company.projectTemplateConfigurationPermissionAssignmentId =
          row.assignmentId;
        company.projectTemplateConfigurationPermissionSetVersion = 'v1';
      }
      // The configuration bundle carries Sales Stage configuration only. It
      // never contributes Company context; its prerequisites are evaluated
      // separately.
      if (
        row.bundle === COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.salesStageConfigurationPermissions = [
          ...salesStageConfigurationPermissionsFor(row.permissionSetVersion),
        ];
        company.salesStageConfigurationPermissionAssignmentId =
          row.assignmentId;
        company.salesStageConfigurationPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_SERVICE_CATALOGUE_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.serviceCataloguePermissions = [
          ...serviceCataloguePermissionsFor(row.permissionSetVersion),
        ];
        company.serviceCataloguePermissionAssignmentId = row.assignmentId;
        company.serviceCataloguePermissionSetVersion = 'v1';
      }
      // Configuration contributes its captured permissions only; like the
      // catalogue bundle it never authorizes Company context by itself.
      if (
        row.bundle === COMPANY_PRICING_CONFIGURATION_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.pricingConfigurationPermissions = [
          ...pricingConfigurationPermissionsFor(row.permissionSetVersion),
        ];
        company.pricingConfigurationPermissionAssignmentId = row.assignmentId;
        company.pricingConfigurationPermissionSetVersion = 'v1';
      }
      // The approver contributes its captured lifecycle permissions only; it
      // never authorizes Company context or Project read by itself.
      if (
        row.bundle === COMPANY_PROJECT_APPROVER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.projectApproverPermissions = [
          ...projectApproverPermissionsFor(row.permissionSetVersion),
        ];
        company.projectApproverPermissionAssignmentId = row.assignmentId;
        company.projectApproverPermissionSetVersion = 'v1';
      }
      // Pricing User likewise contributes its captured permissions only and
      // never authorizes Company context by itself.
      if (
        row.bundle === COMPANY_PRICING_USER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.pricingUserPermissions = [
          ...pricingUserPermissionsFor(row.permissionSetVersion),
        ];
        company.pricingUserPermissionAssignmentId = row.assignmentId;
        company.pricingUserPermissionSetVersion = 'v1';
      }
      // Pricing Adjustment contributes only its one apply permission and
      // never authorizes Company context by itself.
      if (
        row.bundle === COMPANY_PRICING_ADJUSTMENT_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.pricingAdjustmentPermissions = [
          ...pricingAdjustmentPermissionsFor(row.permissionSetVersion),
        ];
        company.pricingAdjustmentPermissionAssignmentId = row.assignmentId;
        company.pricingAdjustmentPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_OFFER_PREPARER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.offerPermissions = [
          ...(company.offerPermissions ?? []),
          ...offerPreparerPermissionsFor(row.permissionSetVersion),
        ];
        company.offerPermissionAssignmentId = row.assignmentId;
        company.offerPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_CONTRACT_PREPARER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.contractPermissions = [
          ...(company.contractPermissions ?? []),
          ...contractPreparerPermissionsFor(row.permissionSetVersion),
        ];
        company.contractPermissionAssignmentId = row.assignmentId;
        company.contractPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_CONTRACT_APPROVER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.contractPermissions = [
          ...(company.contractPermissions ?? []),
          ...contractApproverPermissionsFor(row.permissionSetVersion),
        ];
        company.contractApproverAssignmentId = row.assignmentId;
        company.contractApproverPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_OFFER_APPROVER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.offerPermissions = [
          ...(company.offerPermissions ?? []),
          ...offerApproverPermissionsFor(row.permissionSetVersion),
        ];
        company.offerApproverAssignmentId = row.assignmentId;
        company.offerApproverPermissionSetVersion = 'v1';
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

// Runtime authorization evaluates the captured version recorded on the live
// assignment; every bundle introduced here exists only as v1.
function capturedGrant(
  bundle:
    | typeof COMPANY_SERVICE_CATALOGUE_BUNDLE
    | typeof COMPANY_PRICING_CONFIGURATION_BUNDLE
    | typeof COMPANY_PRICING_USER_BUNDLE
    | typeof COMPANY_PROJECT_APPROVER_BUNDLE
    | typeof COMPANY_PRICING_ADJUSTMENT_BUNDLE
    | typeof COMPANY_OFFER_PREPARER_BUNDLE
    | typeof COMPANY_CONTRACT_PREPARER_BUNDLE
    | typeof COMPANY_CONTRACT_APPROVER_BUNDLE
    | typeof COMPANY_OFFER_APPROVER_BUNDLE
    | typeof COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE
    | typeof COMPANY_PROFITABILITY_DIRECTOR_BUNDLE
    | typeof COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE,
): SQL {
  return sql`(${sql`${companyRoleAssignments.bundle}::text = ${bundle}`} AND ${eq(
    companyRoleAssignments.permissionSetVersion,
    'v1',
  )})`;
}

// Any one of the alternative live captured grants satisfies a check.
function anyCapturedGrant(grants: readonly SQL[]): SQL {
  return sql`(${sql.join([...grants], sql` OR `)})`;
}

// A captured bundle satisfies a check only through its own permissions.
function carriesEvery(
  captured: readonly string[] | undefined,
  required: readonly string[],
): boolean {
  return (
    captured !== undefined &&
    required.every((permission) => captured.includes(permission))
  );
}

export type CompanyContextVisibility =
  | { kind: 'all-active' }
  | { kind: 'assigned-active'; companyIds: readonly string[] };

export type CommercialIntakeAccessMode =
  'read' | 'create' | 'update-next-action' | 'associate-client' | 'set-stage';

// Runtime authorization evaluates the captured assignment version. Reads and
// creates accept every captured version that carries them. Later mutations
// require every captured version that carries their permission.
function commercialIntakeRequirement(mode: CommercialIntakeAccessMode): {
  required: readonly CompanyCommercialIntakePermission[];
  capturedVersions: readonly CompanyCommercialIntakePermissionSetVersion[];
} {
  const required = commercialIntakeRequiredPermissions(mode);
  return { required, capturedVersions: commercialIntakeVersionsWith(required) };
}

function commercialIntakeRequiredPermissions(
  mode: CommercialIntakeAccessMode,
): readonly CompanyCommercialIntakePermission[] {
  switch (mode) {
    case 'read':
      return ['commercial.request.read', 'commercial.opportunity.read'];
    case 'create':
      return ['commercial.request.create', 'commercial.opportunity.create'];
    case 'update-next-action':
      return [
        'commercial.request.read',
        'commercial.opportunity.read',
        'commercial.opportunity.next_action.update',
      ];
    case 'associate-client':
      return ['commercial.request.read', 'commercial.request.client.associate'];
    case 'set-stage':
      return [
        'commercial.request.read',
        'commercial.opportunity.read',
        'commercial.opportunity.stage.set',
      ];
    default:
      return assertNeverMode(mode);
  }
}

function assertNeverMode(mode: never): never {
  throw new Error(`Unknown commercial intake access mode: ${String(mode)}`);
}
