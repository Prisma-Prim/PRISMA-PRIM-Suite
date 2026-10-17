import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import { companyRoleAssignments } from '../database/schema/core.js';
import type { ActorContext } from './access.types.js';
import { CompanyContextAuthorization } from './company-context-authorization.js';
import { COMPANY_PROJECT_TEMPLATE_USER_BUNDLE } from './company-permissions.js';
import { TaskAccessService } from './task-access.service.js';

/** Access owns live captured Template authority; no assignment implies other rights. */
@Injectable()
export class ProjectTemplateAccessService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly company: CompanyContextAuthorization,
    private readonly tasks: TaskAccessService,
  ) {}

  async requireActor(
    actor: ActorContext,
    options: {
      instantiate?: boolean;
      copiedPlan?: boolean;
      lock?: boolean;
    } = {},
  ) {
    const companyId =
      options.instantiate || options.copiedPlan
        ? await this.company.requireProjectAccess(actor, options.lock)
        : await this.company.requireProjectReadPermission(actor, options.lock);
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
          eq(
            companyRoleAssignments.bundle,
            COMPANY_PROJECT_TEMPLATE_USER_BUNDLE,
          ),
          eq(companyRoleAssignments.permissionSetVersion, 'v1'),
          isNull(companyRoleAssignments.revokedAt),
        ),
      );
    const [assignment] = options.lock ? await query.for('share') : await query;
    if (!assignment) throw new ForbiddenException();
    if (options.instantiate) {
      if (!actor.activeCompany?.projectPermissions?.includes('project.create'))
        throw new ForbiddenException();
      await this.tasks.requireActor(actor, true, options.lock);
    } else if (options.copiedPlan) {
      await this.tasks.requireActor(actor);
    }
    return companyId;
  }
}
