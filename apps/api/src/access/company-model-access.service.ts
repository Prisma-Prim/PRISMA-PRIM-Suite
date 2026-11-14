import {
  parseCompanyId,
  parseWorkspaceMembershipId,
} from './access-identifiers.js';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseContext } from '../database/database-context.js';
import type { ActorContext } from './access.types.js';
import { readMemberAuthority } from './member-authority.js';

/** The member authority family that reads, edits and approves one model kind. */
export type CompanyModelAuthority = 'offerModel' | 'contractModel';

@Injectable()
export class CompanyModelAccessService {
  constructor(private readonly database: DatabaseContext) {}

  async requireActor({
    actor,
    authority: family,
    operation,
    lock,
  }: {
    actor: ActorContext;
    authority: CompanyModelAuthority;
    operation: 'read' | 'create' | 'decide' | 'withdraw';
    lock: boolean;
  }): Promise<string> {
    const companyId = actor.activeCompany?.id;
    if (!companyId) throw new ForbiddenException();
    const authority = await readMemberAuthority(this.database.connection, {
      workspaceId: actor.workspaceId,
      companyId: parseCompanyId(companyId),
      membershipId: parseWorkspaceMembershipId(actor.workspaceMembershipId),
      lock,
    });
    if (
      !authority ||
      authority.internalUserId !== actor.internalUserId ||
      !authority[`${family}Reader`]
    )
      throw new ForbiddenException();
    switch (operation) {
      case 'read':
        return companyId;
      case 'create':
        if (!authority[`${family}Editor`]) throw new ForbiddenException();
        return companyId;
      case 'decide':
      case 'withdraw':
        if (!authority[`${family}Approver`]) throw new ForbiddenException();
        return companyId;
      default: {
        const unsupported: never = operation;
        throw new Error(
          `Unsupported Company model operation: ${String(unsupported)}`,
        );
      }
    }
  }
}
