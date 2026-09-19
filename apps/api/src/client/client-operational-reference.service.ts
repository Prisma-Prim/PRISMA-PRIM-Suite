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
  clientUnionOperations,
  clientUnionReviews,
  clientUnionReversals,
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

  async resolveReadableDossierId(
    actor: ActorContext,
    originalClientId: string,
  ): Promise<string | undefined> {
    const activeCompany = actor.activeCompany;
    const companyId = activeCompany?.id;
    if (!companyId || !activeCompany.clientPermissions.includes('client.read'))
      return undefined;

    const activeUnions = await this.databaseContext.connection
      .select({
        canonicalClientId: clientUnionOperations.canonicalClientId,
        firstClientId: clientUnionReviews.firstClientId,
        secondClientId: clientUnionReviews.secondClientId,
      })
      .from(clientUnionOperations)
      .innerJoin(
        clientUnionReviews,
        and(
          eq(clientUnionReviews.workspaceId, clientUnionOperations.workspaceId),
          eq(
            clientUnionReviews.reference,
            clientUnionOperations.reviewReference,
          ),
        ),
      )
      .leftJoin(
        clientUnionReversals,
        and(
          eq(
            clientUnionReversals.workspaceId,
            clientUnionOperations.workspaceId,
          ),
          eq(clientUnionReversals.operationId, clientUnionOperations.id),
        ),
      )
      .where(
        and(
          eq(clientUnionOperations.workspaceId, actor.workspaceId),
          sql`${clientUnionReversals.operationId} IS NULL`,
        ),
      );

    let dossierId = originalClientId;
    const visited = new Set<string>();
    while (true) {
      if (visited.has(dossierId)) return undefined;
      visited.add(dossierId);
      const candidates = new Set(
        activeUnions
          .filter(
            (operation) =>
              operation.firstClientId === dossierId ||
              operation.secondClientId === dossierId,
          )
          .map((operation) => operation.canonicalClientId)
          .filter((candidate) => candidate !== dossierId),
      );
      if (candidates.size === 0) break;
      if (candidates.size !== 1) return undefined;
      const [next] = candidates;
      if (!next) return undefined;
      dossierId = next;
    }

    const [readable] = await this.databaseContext.connection
      .select({ id: clientAccounts.id })
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
          eq(clientAccounts.id, dossierId),
          eq(clientAccounts.status, 'active'),
        ),
      );
    return readable?.id;
  }

  /** Call inside the owning command transaction, once for a new reference. */
  async lockActiveReferenceClient(actor: ActorContext, clientId: string) {
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
    return client;
  }

  /** Advance the reversal fence only for a material operation in this transaction. */
  async recordReferenceUse(actor: ActorContext, clientId: string) {
    const client = await this.lockActiveReferenceClient(actor, clientId);
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
