import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientAccounts,
  clientCompanyRelationships,
} from '../database/schema/index.js';

/** Client owns the identity and relationship checks used by operational records. */
@Injectable()
export class ClientOperationalReferenceService {
  constructor(private readonly databaseContext: DatabaseContext) {}

  async readReferenceClient(actor: ActorContext, originalClientId: string) {
    const companyId = this.requireClientRead(actor);
    const [client] = await this.databaseContext.connection
      .select({
        id: clientAccounts.id,
        displayName: clientAccounts.displayName,
        status: clientAccounts.status,
      })
      .from(clientAccounts)
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(
            clientCompanyRelationships.workspaceId,
            clientAccounts.workspaceId,
          ),
          eq(clientCompanyRelationships.clientAccountId, clientAccounts.id),
          eq(clientCompanyRelationships.companyId, companyId),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          eq(clientAccounts.id, originalClientId),
          inArray(clientAccounts.status, ['active', 'superseded']),
        ),
      );
    if (!client) throw new NotFoundException();
    return client;
  }

  /** Call inside the owning command transaction, once for a new reference. */
  async recordReferenceUse(actor: ActorContext, clientId: string) {
    const companyId = this.requireClientRead(actor);
    // Union and reversal lock Client identities before relationships. Use the same
    // order and recheck status after waiting, so a concurrent reversal cannot pass
    // its snapshot fence after a successful new operational reference.
    const [client] = await this.databaseContext.connection
      .select()
      .from(clientAccounts)
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          eq(clientAccounts.id, clientId),
        ),
      )
      .for('update');
    if (!client || client.status !== 'active') throw new NotFoundException();
    const [relationship] = await this.databaseContext.connection
      .select({ id: clientCompanyRelationships.id })
      .from(clientCompanyRelationships)
      .where(
        and(
          eq(clientCompanyRelationships.workspaceId, actor.workspaceId),
          eq(clientCompanyRelationships.clientAccountId, clientId),
          eq(clientCompanyRelationships.companyId, companyId),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .for('share');
    if (!relationship) throw new NotFoundException();
    if (client.version >= 2147483647)
      throw new ConflictException('Client reference version is exhausted.');
    await this.databaseContext.connection
      .update(clientAccounts)
      .set({ version: client.version + 1, updatedAt: sql`now()` })
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          eq(clientAccounts.id, clientId),
        ),
      );
    return { id: client.id, displayName: client.displayName };
  }

  private requireClientRead(actor: ActorContext): string {
    if (
      !actor.activeCompany ||
      (!actor.workspacePermissions.includes('client.manage') &&
        !actor.activeCompany.clientPermissions.includes('client.read'))
    )
      throw new ForbiddenException();
    return actor.activeCompany.id;
  }
}
