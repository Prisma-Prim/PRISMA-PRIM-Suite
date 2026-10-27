import { ForbiddenException, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import { workspaces } from '../database/schema/core.js';
import { readMemberAuthority } from './member-authority.js';
import type { ActorContext } from './access.types.js';
@Injectable()
export class MissionPlanAccessService {
  constructor(private readonly database: DatabaseContext) {}
  async requireActor({
    actor,
    operation,
    lock,
  }: {
    actor: ActorContext;
    operation: 'read' | 'publish' | 'instantiate';
    lock: boolean;
  }) {
    const companyId = actor.activeCompany?.id;
    if (!companyId) throw new ForbiddenException();
    if (lock) {
      const [workspace] = await this.database.connection
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, actor.workspaceId))
        .for('key share');
      if (!workspace) throw new ForbiddenException();
    }
    const authority = await readMemberAuthority(this.database.connection, {
      workspaceId: actor.workspaceId,
      companyId,
      membershipId: actor.workspaceMembershipId,
      lock,
    });
    if (
      !authority ||
      authority.internalUserId !== actor.internalUserId ||
      !authority.missionPlanReader
    )
      throw new ForbiddenException();
    switch (operation) {
      case 'read':
        return companyId;
      case 'publish':
        if (!authority.missionPlanConfigurator) throw new ForbiddenException();
        return companyId;
      case 'instantiate':
        if (!authority.missionPlanUser) throw new ForbiddenException();
        return companyId;
      default: {
        const unsupported: never = operation;
        throw new Error(String(unsupported));
      }
    }
  }
}
