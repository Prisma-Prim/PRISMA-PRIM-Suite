import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseContext } from '../database/database-context.js';
import type { ActorContext } from './access.types.js';
import { readMemberAuthority } from './member-authority.js';

/** Access owns live Risk authority, including the shared identity-first locks. */
@Injectable()
export class OperationalRiskAccessService {
  constructor(private readonly database: DatabaseContext) {}

  async requireActor({
    actor,
    record = false,
    lock = false,
  }: {
    actor: ActorContext;
    record?: boolean;
    lock?: boolean;
  }): Promise<string> {
    const companyId = actor.activeCompany?.id;
    if (!companyId) throw new ForbiddenException();
    const authority = await readMemberAuthority(this.database.connection, {
      workspaceId: actor.workspaceId,
      companyId,
      membershipId: actor.workspaceMembershipId,
      lock,
    });
    if (
      !authority ||
      authority.internalUserId !== actor.internalUserId ||
      !authority.operationalRiskReader ||
      (record && !authority.operationalRiskRecorder)
    )
      throw new ForbiddenException();
    return companyId;
  }
}
