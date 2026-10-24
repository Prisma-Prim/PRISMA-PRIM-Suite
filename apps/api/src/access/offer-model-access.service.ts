import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseContext } from '../database/database-context.js';
import type { ActorContext } from './access.types.js';
import { readMemberAuthority } from './member-authority.js';

@Injectable()
export class OfferModelAccessService {
  constructor(private readonly database: DatabaseContext) {}

  async requireActor({
    actor,
    operation,
    lock,
  }: {
    actor: ActorContext;
    operation: 'read' | 'create' | 'decide' | 'withdraw';
    lock: boolean;
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
      !authority.offerModelReader
    )
      throw new ForbiddenException();
    switch (operation) {
      case 'read':
        return companyId;
      case 'create':
        if (!authority.offerModelEditor) throw new ForbiddenException();
        return companyId;
      case 'decide':
      case 'withdraw':
        if (!authority.offerModelApprover) throw new ForbiddenException();
        return companyId;
      default: {
        const unsupported: never = operation;
        throw new Error(
          `Unsupported Offer model operation: ${String(unsupported)}`,
        );
      }
    }
  }
}
