import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, gt } from 'drizzle-orm';
import type { ActorContext } from './access.types.js';
import { CompanyContextAuthorization } from './company-context-authorization.js';
import { DatabaseContext } from '../database/database-context.js';
import { workspaceMemberships } from '../database/schema/core.js';
import { readMemberAuthority } from './member-authority.js';

/** Access owns Company-only candidate policy and all of its native lock participants. */
@Injectable()
export class InternalTaskAccessService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
  ) {}
  requireActor(actor: ActorContext, lock: boolean) {
    return this.authorization.requireInternalTaskAccess(actor, lock);
  }
  private candidate(actor: ActorContext, membershipId: string, lock: boolean) {
    const companyId = actor.activeCompany?.id;
    if (!companyId)
      throw new BadRequestException('The responsible member is unavailable.');
    return readMemberAuthority(this.database.connection, {
      workspaceId: actor.workspaceId,
      companyId,
      membershipId,
      lock,
    });
  }
  async requireAssignee(actor: ActorContext, membershipId: string) {
    const member = await this.candidate(actor, membershipId, true);
    if (!member?.internalTaskRead)
      throw new BadRequestException('The responsible member is unavailable.');
    return { membershipId, displayLabel: member.displayLabel };
  }
  async eligible(actor: ActorContext, afterMembershipId: string | undefined) {
    await this.requireActor(actor, false);
    if (
      afterMembershipId &&
      !(await this.candidate(actor, afterMembershipId, false))?.internalTaskRead
    )
      throw new NotFoundException();
    const members: Array<{ membershipId: string; displayLabel: string }> = [];
    // Apply the live predicate before selecting the 25+lookahead eligible rows.
    // Bounded scan batches avoid both a directory-sized allocation and an offset cap.
    let scanAfter = afterMembershipId;
    while (members.length < 26) {
      const batch = await this.database.connection
        .select({ id: workspaceMemberships.id })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, actor.workspaceId),
            eq(workspaceMemberships.status, 'active'),
            scanAfter ? gt(workspaceMemberships.id, scanAfter) : undefined,
          ),
        )
        .orderBy(asc(workspaceMemberships.id))
        .limit(100);
      for (const row of batch) {
        scanAfter = row.id;
        const member = await this.candidate(actor, row.id, false);
        if (member?.internalTaskRead)
          members.push({
            membershipId: row.id,
            displayLabel: member.displayLabel,
          });
        if (members.length === 26) break;
      }
      if (batch.length < 100) break;
    }
    return {
      format: 'company-internal-task-assignees-v1',
      members: members.slice(0, 25),
      nextAfterMembershipId:
        members.length > 25 ? (members[24]?.membershipId ?? null) : null,
    };
  }
}
