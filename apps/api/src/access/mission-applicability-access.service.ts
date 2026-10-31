import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import { companyRoleAssignments } from '../database/schema/core.js';
import type { ActorContext } from './access.types.js';
import { CompanyContextAuthorization } from './company-context-authorization.js';
import type { CompanyRoleBundle } from './company-permissions.js';

type Capture = {
  id: string | undefined;
  version: unknown;
  bundle: CompanyRoleBundle;
  versions: readonly string[];
};
/** Exact consumed source/evidence captures for the bounded applicability caller-owned transaction. */
@Injectable()
export class MissionApplicabilityAccessService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly companies: CompanyContextAuthorization,
  ) {}
  private async captured(actor: ActorContext, capture: Capture, lock: boolean) {
    const companyId = actor.activeCompany?.id;
    if (
      !companyId ||
      !capture.id ||
      typeof capture.version !== 'string' ||
      !capture.versions.includes(capture.version)
    )
      return false;
    const query = this.database.connection
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
          eq(companyRoleAssignments.id, capture.id),
          eq(companyRoleAssignments.bundle, capture.bundle),
          eq(companyRoleAssignments.permissionSetVersion, capture.version),
          isNull(companyRoleAssignments.revokedAt),
        ),
      );
    const [row] = lock ? await query.for('share') : await query;
    return row !== undefined;
  }
  async requireSourceReadWithinTransaction(actor: ActorContext, lock = false) {
    const company = actor.activeCompany;
    if (
      !actor.active ||
      !company?.projectPermissions?.includes('project.read') ||
      !company.taskPermissions?.includes('task.read') ||
      !company.projectTemplatePermissions?.includes('project.template.read') ||
      !company.projectTemplatePermissions.includes(
        'project.template.pilot.read',
      )
    )
      throw new ForbiddenException();
    await this.companies.requireProjectAccess(actor, lock);
    for (const capture of [
      {
        id: company.projectPermissionAssignmentId,
        version: company.projectPermissionSetVersion,
        bundle: 'company_project_access',
        versions: ['v1', 'v2'],
      },
      {
        id: company.taskPermissionAssignmentId,
        version: company.taskPermissionSetVersion,
        bundle: 'company_task_manager',
        versions: ['v1'],
      },
      {
        id: company.projectTemplatePermissionAssignmentId,
        version: company.projectTemplatePermissionSetVersion,
        bundle: 'company_project_template_user',
        versions: ['v2'],
      },
    ] satisfies Capture[])
      if (!(await this.captured(actor, capture, lock)))
        throw new ForbiddenException();
  }
  async hasEvidenceReadWithinTransaction(actor: ActorContext, lock = false) {
    const company = actor.activeCompany;
    if (
      !actor.active ||
      !company?.documentPermissions?.includes('document.read') ||
      !company.documentPermissions.includes('document.content.read') ||
      !company.documentPermissions.includes(
        'document.mission_deliverable.access',
      )
    )
      return false;
    for (const capture of [
      {
        id: company.documentPermissionAssignmentId,
        version: company.documentPermissionSetVersion,
        bundle: 'company_document_registrar',
        versions: ['v1', 'v2', 'v3'],
      },
      {
        id: company.documentContentReaderAssignmentId,
        version: company.documentContentReaderPermissionSetVersion,
        bundle: 'company_document_content_reader',
        versions: ['v1'],
      },
      {
        id: company.missionDeliverableAccessAssignmentId,
        version: company.missionDeliverableAccessPermissionSetVersion,
        bundle: 'company_mission_deliverable_access',
        versions: ['v1'],
      },
    ] satisfies Capture[])
      if (!(await this.captured(actor, capture, lock))) return false;
    return true;
  }
}
