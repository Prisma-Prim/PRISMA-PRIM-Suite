import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { requireWorkspacePermission } from '../access/access-policy.js';
import type { ActorContext } from '../access/access.types.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import {
  CLIENT_COMPANY_RELATIONSHIP_ESTABLISHED_ACTION,
  CLIENT_CREATED_ACTION,
} from '../accountability/accountability.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientAccountRegistrationCommands,
  clientAccounts,
  clientCompanyRelationships,
} from '../database/schema/index.js';
import type {
  ClientAccountView,
  ClientCommand,
  ClientQuery,
} from './client.types.js';

const SEARCH_RESULT_LIMIT = 20;
const MAXIMUM_SEARCH_LENGTH = 200;

@Injectable()
export class ClientService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly accountability: AccountabilityService,
  ) {}

  async query(
    actor: ActorContext,
    query: ClientQuery,
  ): Promise<ClientAccountView[]> {
    const companyId = requireClientAuthority(actor);
    switch (query.kind) {
      case 'active-company-list':
        return this.listForActiveCompany(actor.workspaceId, companyId);
      case 'workspace-search':
        return this.searchWorkspace(
          actor.workspaceId,
          companyId,
          requireSearchQuery(query.query),
        );
      default:
        return assertNever(query);
    }
  }

  async execute(
    actor: ActorContext,
    command: ClientCommand,
  ): Promise<ClientAccountView> {
    const companyId = requireClientAuthority(actor);
    switch (command.kind) {
      case 'register':
        return this.register(actor, companyId, {
          displayName: requireDisplayName(command.displayName),
          idempotencyKey: requireIdempotencyKey(command.idempotencyKey),
        });
      case 'attach':
        return this.attach(actor, companyId, command.clientAccountId);
      default:
        return assertNever(command);
    }
  }

  private async listForActiveCompany(
    workspaceId: string,
    companyId: string,
  ): Promise<ClientAccountView[]> {
    const rows = await this.databaseContext.connection
      .select({
        id: clientAccounts.id,
        displayName: clientAccounts.displayName,
      })
      .from(clientCompanyRelationships)
      .innerJoin(
        clientAccounts,
        and(
          eq(
            clientCompanyRelationships.workspaceId,
            clientAccounts.workspaceId,
          ),
          eq(clientCompanyRelationships.clientAccountId, clientAccounts.id),
        ),
      )
      .where(
        and(
          eq(clientCompanyRelationships.workspaceId, workspaceId),
          eq(clientCompanyRelationships.companyId, companyId),
          eq(clientCompanyRelationships.status, 'active'),
          eq(clientAccounts.status, 'active'),
        ),
      )
      .orderBy(asc(clientAccounts.displayName), asc(clientAccounts.id));
    return rows.map((client) => toView(client, true));
  }

  private async searchWorkspace(
    workspaceId: string,
    companyId: string,
    query: string,
  ): Promise<ClientAccountView[]> {
    const pattern = `%${escapeLikePattern(query)}%`;
    const rows = await this.databaseContext.connection
      .select({
        id: clientAccounts.id,
        displayName: clientAccounts.displayName,
        relationshipId: clientCompanyRelationships.id,
      })
      .from(clientAccounts)
      .leftJoin(
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
          eq(clientAccounts.workspaceId, workspaceId),
          eq(clientAccounts.status, 'active'),
          sql`${clientAccounts.displayName} ILIKE ${pattern} ESCAPE ${'\\'}`,
        ),
      )
      .orderBy(asc(clientAccounts.displayName), asc(clientAccounts.id))
      .limit(SEARCH_RESULT_LIMIT);
    return rows.map((client) => toView(client, client.relationshipId !== null));
  }

  private register(
    actor: ActorContext,
    companyId: string,
    command: { displayName: string; idempotencyKey: string },
  ): Promise<ClientAccountView> {
    return this.databaseContext.transaction(async () => {
      const [insertedCommand] = await this.databaseContext.connection
        .insert(clientAccountRegistrationCommands)
        .values({
          workspaceId: actor.workspaceId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey: command.idempotencyKey,
          displayName: command.displayName,
          companyId,
        })
        .onConflictDoNothing({
          target: [
            clientAccountRegistrationCommands.workspaceId,
            clientAccountRegistrationCommands.actorWorkspaceMembershipId,
            clientAccountRegistrationCommands.idempotencyKey,
          ],
        })
        .returning();

      if (!insertedCommand) {
        return this.resolveRegistrationReplay(actor, companyId, command);
      }

      const [client] = await this.databaseContext.connection
        .insert(clientAccounts)
        .values({
          workspaceId: actor.workspaceId,
          displayName: command.displayName,
          createdByInternalUserId: actor.internalUserId,
          createdByWorkspaceMembershipId: actor.workspaceMembershipId,
        })
        .returning();
      const [relationship] = await this.databaseContext.connection
        .insert(clientCompanyRelationships)
        .values({
          workspaceId: actor.workspaceId,
          clientAccountId: client.id,
          companyId,
          createdByInternalUserId: actor.internalUserId,
          createdByWorkspaceMembershipId: actor.workspaceMembershipId,
        })
        .returning();
      await this.databaseContext.connection
        .update(clientAccountRegistrationCommands)
        .set({
          resultClientAccountId: client.id,
          resultRelationshipId: relationship.id,
        })
        .where(eq(clientAccountRegistrationCommands.id, insertedCommand.id));
      await this.accountability.record({
        actor,
        action: CLIENT_CREATED_ACTION,
        target: { type: 'client_account', clientAccountId: client.id },
        metadata: {},
      });
      await this.recordRelationship(actor, relationship);
      return toView(client, true);
    });
  }

  private async resolveRegistrationReplay(
    actor: ActorContext,
    companyId: string,
    command: { displayName: string; idempotencyKey: string },
  ): Promise<ClientAccountView> {
    const [persistedCommand] = await this.databaseContext.connection
      .select()
      .from(clientAccountRegistrationCommands)
      .where(
        and(
          eq(clientAccountRegistrationCommands.workspaceId, actor.workspaceId),
          eq(
            clientAccountRegistrationCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(
            clientAccountRegistrationCommands.idempotencyKey,
            command.idempotencyKey,
          ),
        ),
      )
      .limit(1);
    if (!persistedCommand) {
      throw new Error('The idempotent Client command could not be resolved.');
    }
    if (
      persistedCommand.displayName !== command.displayName ||
      persistedCommand.companyId !== companyId
    ) {
      throw new BadRequestException(
        'Idempotency-Key was already used for another Client command.',
      );
    }
    if (
      !persistedCommand.resultClientAccountId ||
      !persistedCommand.resultRelationshipId
    ) {
      throw new Error('The idempotent Client command has no durable result.');
    }
    const [client] = await this.databaseContext.connection
      .select({
        id: clientAccounts.id,
        displayName: clientAccounts.displayName,
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
          eq(
            clientCompanyRelationships.id,
            persistedCommand.resultRelationshipId,
          ),
          eq(clientCompanyRelationships.companyId, companyId),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          eq(clientAccounts.id, persistedCommand.resultClientAccountId),
          eq(clientAccounts.status, 'active'),
        ),
      )
      .limit(1);
    if (!client) {
      throw new Error('The idempotent Client result is unavailable.');
    }
    return toView(client, true);
  }

  private attach(
    actor: ActorContext,
    companyId: string,
    clientAccountId: string,
  ): Promise<ClientAccountView> {
    return this.databaseContext.transaction(async () => {
      const [client] = await this.databaseContext.connection
        .select({
          id: clientAccounts.id,
          displayName: clientAccounts.displayName,
        })
        .from(clientAccounts)
        .where(
          and(
            eq(clientAccounts.workspaceId, actor.workspaceId),
            eq(clientAccounts.id, clientAccountId),
            eq(clientAccounts.status, 'active'),
          ),
        )
        .limit(1);
      if (!client) throw new NotFoundException();

      const [inserted] = await this.databaseContext.connection
        .insert(clientCompanyRelationships)
        .values({
          workspaceId: actor.workspaceId,
          clientAccountId,
          companyId,
          createdByInternalUserId: actor.internalUserId,
          createdByWorkspaceMembershipId: actor.workspaceMembershipId,
        })
        .onConflictDoNothing({
          target: [
            clientCompanyRelationships.workspaceId,
            clientCompanyRelationships.clientAccountId,
            clientCompanyRelationships.companyId,
          ],
        })
        .returning();
      if (inserted) {
        await this.recordRelationship(actor, inserted);
      } else {
        const [activeRelationship] = await this.databaseContext.connection
          .select({ id: clientCompanyRelationships.id })
          .from(clientCompanyRelationships)
          .where(
            and(
              eq(clientCompanyRelationships.workspaceId, actor.workspaceId),
              eq(clientCompanyRelationships.clientAccountId, clientAccountId),
              eq(clientCompanyRelationships.companyId, companyId),
              eq(clientCompanyRelationships.status, 'active'),
            ),
          )
          .limit(1);
        if (!activeRelationship) throw new NotFoundException();
      }
      return toView(client, true);
    });
  }

  private recordRelationship(
    actor: ActorContext,
    relationship: typeof clientCompanyRelationships.$inferSelect,
  ): Promise<void> {
    return this.accountability.record({
      actor,
      action: CLIENT_COMPANY_RELATIONSHIP_ESTABLISHED_ACTION,
      target: {
        type: 'client_company_relationship',
        relationshipId: relationship.id,
        clientAccountId: relationship.clientAccountId,
        companyId: relationship.companyId,
      },
      metadata: {},
    });
  }
}

function requireClientAuthority(actor: ActorContext): string {
  requireWorkspacePermission(actor, 'client.manage');
  if (!actor.activeCompany) throw new ForbiddenException();
  return actor.activeCompany.id;
}

function requireDisplayName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('Client display name is required.');
  }
  return value.trim();
}

function requireSearchQuery(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('Client search query is required.');
  }
  const query = value.trim();
  if (query.length > MAXIMUM_SEARCH_LENGTH) {
    throw new BadRequestException('Client search query is too long.');
  }
  return query;
}

function requireIdempotencyKey(value: string | undefined): string {
  if (!value?.trim()) {
    throw new BadRequestException('Idempotency-Key header is required.');
  }
  return value.trim();
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function toView(
  client: { id: string; displayName: string },
  relatedToActiveCompany: boolean,
): ClientAccountView {
  return {
    id: client.id,
    displayName: client.displayName,
    relatedToActiveCompany,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unexpected Client variant: ${JSON.stringify(value)}`);
}
