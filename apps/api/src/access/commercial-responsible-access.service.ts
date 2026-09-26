import { BadRequestException, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import {
  internalUsers,
  workspaceMemberships,
} from '../database/schema/index.js';
import type { ActorContext } from './access.types.js';
import { memberDisplayLabel, readMemberAuthority } from './member-authority.js';

/** Only a membership identifier and label; never email or exclusion reasons. */
export interface OpportunityResponsibleCandidate {
  workspaceMembershipId: string;
  displayLabel: string;
}

/** An eligible member revalidated inside a command, with its Internal User. */
export interface EligibleOpportunityResponsible extends OpportunityResponsibleCandidate {
  internalUserId: string;
}

/**
 * Access owns who may become an Opportunity's responsible actor: an active
 * Internal User with an active same-Workspace membership, effective Company
 * context and live captured Commercial Intake read in the Opportunity's
 * Company. Being responsible grants nothing. The caller first authorizes the
 * reassignment and the exact Opportunity in that Company.
 */
@Injectable()
export class CommercialResponsibleAccessService {
  constructor(private readonly database: DatabaseContext) {}

  async eligibleMembers(
    actor: ActorContext,
    companyId: string,
  ): Promise<OpportunityResponsibleCandidate[]> {
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
    const members: OpportunityResponsibleCandidate[] = [];
    for (const member of memberships) {
      const authority = await readMemberAuthority(this.database.connection, {
        workspaceId: actor.workspaceId,
        companyId,
        membershipId: member.id,
        lock: false,
      });
      if (authority?.commercialIntakeReader)
        members.push({
          workspaceMembershipId: member.id,
          displayLabel: authority.displayLabel,
        });
    }
    return members.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
  }

  /**
   * Revalidates a new responsible actor inside the command, share-locking its
   * authority so a concurrent suspension or revocation commits before or after.
   * Every rejected identifier returns the same unavailable response.
   */
  async requireEligibleMember(
    actor: ActorContext,
    companyId: string,
    workspaceMembershipId: string,
  ): Promise<EligibleOpportunityResponsible> {
    const authority = await readMemberAuthority(this.database.connection, {
      workspaceId: actor.workspaceId,
      companyId,
      membershipId: workspaceMembershipId,
      lock: true,
    });
    if (!authority?.commercialIntakeReader)
      throw new BadRequestException({
        code: 'RESPONSIBLE_ACTOR_UNAVAILABLE',
        message: 'This member cannot become responsible. Reload the list.',
      });
    return {
      workspaceMembershipId,
      internalUserId: authority.internalUserId,
      displayLabel: authority.displayLabel,
    };
  }

  /**
   * The label of a recorded responsible actor as captured now, whether or not
   * the member is still eligible or active. It reads no email.
   */
  async recordedLabel(
    actor: ActorContext,
    workspaceMembershipId: string,
  ): Promise<string> {
    const [member] = await this.database.connection
      .select({ displayName: internalUsers.displayName })
      .from(workspaceMemberships)
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, workspaceMemberships.internalUserId),
      )
      .where(
        and(
          eq(workspaceMemberships.workspaceId, actor.workspaceId),
          eq(workspaceMemberships.id, workspaceMembershipId),
        ),
      );
    if (!member)
      throw new Error('The recorded responsible actor is unavailable.');
    return memberDisplayLabel(member.displayName, workspaceMembershipId);
  }
}
