import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { INTERNAL_USER_PROVISIONED_ACTION } from '../accountability/accountability.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { internalUsers, workspaces } from '../database/schema/index.js';
import type { ActorContext, ExternalPrincipal } from './access.types.js';

const WORKSPACE_KEY = 'pilot-workspace';
const WORKSPACE_NAME = 'PRISMA Workspace';

@Injectable()
export class AccessService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly accountability: AccountabilityService,
  ) {}

  async resolveActor(principal: ExternalPrincipal): Promise<ActorContext> {
    return this.databaseContext.transaction(async () => {
      const database = this.databaseContext.connection;
      const [workspace] = await database
        .insert(workspaces)
        .values({ singletonKey: WORKSPACE_KEY, name: WORKSPACE_NAME })
        .onConflictDoUpdate({
          target: workspaces.singletonKey,
          set: { name: sql`excluded.name` },
        })
        .returning();

      const [createdInternalUser] = await database
        .insert(internalUsers)
        .values({
          workspaceId: workspace.id,
          externalProvider: principal.provider,
          externalSubject: principal.subject,
          displayName: principal.displayName,
          email: principal.email,
        })
        .onConflictDoNothing()
        .returning();

      let internalUser =
        createdInternalUser ??
        (
          await database
            .select()
            .from(internalUsers)
            .where(
              and(
                eq(internalUsers.externalProvider, principal.provider),
                eq(internalUsers.externalSubject, principal.subject),
              ),
            )
            .limit(1)
        )[0];

      if (internalUser.status !== 'active') throw new ForbiddenException();

      if (!createdInternalUser) {
        const [updatedInternalUser] = await database
          .update(internalUsers)
          .set({
            displayName: principal.displayName,
            email: principal.email,
            updatedAt: sql`now()`,
          })
          .where(eq(internalUsers.id, internalUser.id))
          .returning();
        internalUser = updatedInternalUser;
      }

      const actor: ActorContext = {
        internalUserId: internalUser.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        displayName: internalUser.displayName,
        email: internalUser.email,
        active: true,
      };

      if (createdInternalUser) {
        await this.accountability.record({
          actor,
          action: INTERNAL_USER_PROVISIONED_ACTION,
          target: {
            type: 'internal_user',
            internalUserId: internalUser.id,
          },
          metadata: { identityProvider: principal.provider },
        });
      }

      return actor;
    });
  }
}
