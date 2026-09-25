import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import { workspaceMemberships } from '../database/schema/index.js';
import type { ActorContext } from './access.types.js';
import { readMemberAuthority } from './member-authority.js';

/** Only a membership identifier and label; never email or exclusion reasons. */
export interface ProjectResponsibleCandidate {
  workspaceMembershipId: string;
  displayLabel: string;
}

/**
 * Access owns who may be named a Project's responsible member: an active
 * Internal User with an active same-Workspace membership, effective Company
 * context, Project read (captured v1 or v2) and Client read. Being named grants
 * nothing. The caller first authorizes `project.update`, the exact Project and
 * its active original Client relationship.
 */
@Injectable()
export class ProjectResponsibleAccessService {
  constructor(private readonly database: DatabaseContext) {}

  async eligibleMembers(
    actor: ActorContext,
  ): Promise<ProjectResponsibleCandidate[]> {
    const companyId = requireCompany(actor);
    const memberships = await this.database.connection
      .select({ id: workspaceMemberships.id })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, actor.workspaceId),
          eq(workspaceMemberships.status, 'active'),
        ),
      )
      .orderBy(asc(workspaceMemberships.id));
    const members: ProjectResponsibleCandidate[] = [];
    for (const member of memberships) {
      const authority = await readMemberAuthority(this.database.connection, {
        workspaceId: actor.workspaceId,
        companyId,
        membershipId: member.id,
        lock: false,
      });
      if (authority?.projectReader)
        members.push({
          workspaceMembershipId: member.id,
          displayLabel: authority.displayLabel,
        });
    }
    return members.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
  }

  /** Revalidates a new target inside the command, share-locking its authority. */
  async requireEligibleMember(
    actor: ActorContext,
    membershipId: string,
  ): Promise<ProjectResponsibleCandidate> {
    const authority = await readMemberAuthority(this.database.connection, {
      workspaceId: actor.workspaceId,
      companyId: requireCompany(actor),
      membershipId,
      lock: true,
    });
    if (!authority?.projectReader)
      throw new BadRequestException('The responsible member is unavailable.');
    return {
      workspaceMembershipId: membershipId,
      displayLabel: authority.displayLabel,
    };
  }
}

function requireCompany(actor: ActorContext): string {
  const companyId = actor.activeCompany?.id;
  if (!companyId) throw new ForbiddenException();
  return companyId;
}
