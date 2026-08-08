import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../database/database.constants.js';
import { internalUsers, workspaces } from '../database/schema/index.js';
import type { ActorContext, ExternalPrincipal } from './access.types.js';

const WORKSPACE_KEY = 'pilot-workspace';
const WORKSPACE_NAME = 'PRISMA Workspace';

@Injectable()
export class AccessService {
  constructor(@Inject(DATABASE) private readonly database: NodePgDatabase) {}

  async resolveActor(principal: ExternalPrincipal): Promise<ActorContext> {
    const [workspace] = await this.database
      .insert(workspaces)
      .values({ singletonKey: WORKSPACE_KEY, name: WORKSPACE_NAME })
      .onConflictDoUpdate({
        target: workspaces.singletonKey,
        set: { name: sql`excluded.name` },
      })
      .returning();

    const [resolvedInternalUser] = await this.database
      .insert(internalUsers)
      .values({
        workspaceId: workspace.id,
        externalProvider: principal.provider,
        externalSubject: principal.subject,
        displayName: principal.displayName,
        email: principal.email,
      })
      .onConflictDoUpdate({
        target: [internalUsers.externalProvider, internalUsers.externalSubject],
        set: {
          displayName: principal.displayName,
          email: principal.email,
          updatedAt: sql`now()`,
        },
        setWhere: eq(internalUsers.status, 'active'),
      })
      .returning();

    const internalUser =
      resolvedInternalUser ??
      (
        await this.database
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

    return {
      internalUserId: internalUser.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      displayName: internalUser.displayName,
      email: internalUser.email,
      active: true,
    };
  }
}
