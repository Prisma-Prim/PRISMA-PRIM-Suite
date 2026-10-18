import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { ActorContext } from './access.types.js';
import { ProjectTemplateAccessService } from './project-template-access.service.js';
import { TaskAccessService } from './task-access.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { companyRoleAssignments } from '../database/schema/core.js';
import { COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE } from './company-permissions.js';

/** The independent opt-in permission grants only stage advance, never Task manage. */
@Injectable()
export class ProjectStageAccessService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly templates: ProjectTemplateAccessService,
    private readonly tasks: TaskAccessService,
  ) {}
  async requireReader(actor: ActorContext, lock = false) {
    const companyId = await this.templates.requireActor(actor, {
      copiedPlan: true,
      lock,
    });
    // Serialize the independent Task read prerequisites against live revocation/suspension.
    if (lock) await this.tasks.requireActor(actor, false, true);
    return companyId;
  }
  async canAdvance(actor: ActorContext, lock = false) {
    const companyId = actor.activeCompany?.id;
    if (!companyId) return false;
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
            COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE,
          ),
          eq(companyRoleAssignments.permissionSetVersion, 'v1'),
          isNull(companyRoleAssignments.revokedAt),
        ),
      );
    const [row] = lock ? await query.for('share') : await query;
    return row !== undefined;
  }
  async requireAdvance(actor: ActorContext) {
    const companyId = await this.requireReader(actor, true);
    if (!(await this.canAdvance(actor, true))) throw new ForbiddenException();
    return companyId;
  }
}
