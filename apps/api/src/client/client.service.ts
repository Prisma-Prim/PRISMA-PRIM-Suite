import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { requireWorkspacePermission } from '../access/access-policy.js';
import { LEGACY_CLIENT_MANAGE_COMPANY_PERMISSIONS } from '../access/company-permissions.js';
import type {
  ActorContext,
  CompanyClientPermission,
} from '../access/access.types.js';
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
  ClientDossierView,
  ClientQuery,
} from './client.types.js';
import {
  type NormalizedDossierFields,
  normalizeCorrection,
  normalizeRegistration,
  requireVersion,
} from './client-dossier-validation.js';
import { ClientDossierService } from './client-dossier.service.js';
import { sameJsonValue } from './json-structural-equality.js';

const SEARCH_RESULT_LIMIT = 20;
const MAXIMUM_SEARCH_LENGTH = 200;
@Injectable()
export class ClientService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly accountability: AccountabilityService,
    private readonly dossiers: ClientDossierService,
  ) {}

  async query(
    actor: ActorContext,
    query: { kind: 'dossier'; clientAccountId: string },
  ): Promise<ClientDossierView>;
  async query(
    actor: ActorContext,
    query: Exclude<ClientQuery, { kind: 'dossier' }>,
  ): Promise<ClientAccountView[]>;
  async query(
    actor: ActorContext,
    query: ClientQuery,
  ): Promise<ClientAccountView[] | ClientDossierView> {
    const companyId = requireClientPermission(actor, 'client.read');
    switch (query.kind) {
      case 'active-company-list':
        return this.listForActiveCompany(actor.workspaceId, companyId);
      case 'workspace-search':
        return this.searchWorkspace(
          actor,
          companyId,
          requireSearchQuery(query.query),
        );
      case 'dossier':
        return this.dossiers.read(
          actor.workspaceId,
          companyId,
          query.clientAccountId,
        );
      default:
        return assertNever(query);
    }
  }

  async execute(
    actor: ActorContext,
    command: Extract<ClientCommand, { kind: 'correct' }>,
  ): Promise<ClientDossierView>;
  async execute(
    actor: ActorContext,
    command: Exclude<ClientCommand, { kind: 'correct' }>,
  ): Promise<ClientAccountView>;
  async execute(
    actor: ActorContext,
    command: ClientCommand,
  ): Promise<ClientAccountView | ClientDossierView> {
    switch (command.kind) {
      case 'register': {
        const companyId = requireClientPermission(actor, 'client.create');
        return this.register(
          actor,
          companyId,
          normalizeRegistration(command.fields),
          requireIdempotencyKey(command.idempotencyKey),
        );
      }
      case 'attach': {
        requireWorkspacePermission(actor, 'client.manage');
        const companyId = requireActiveCompany(actor);
        return this.attach(actor, companyId, command.clientAccountId);
      }
      case 'correct': {
        const companyId = requireClientPermission(actor, 'client.update');
        return this.dossiers.correct(actor, companyId, {
          clientAccountId: command.clientAccountId,
          expectedVersion: requireVersion(command.expectedVersion),
          changes: normalizeCorrection(command.changes),
          idempotencyKey: requireIdempotencyKey(command.idempotencyKey),
        });
      }
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
    return rows.map((client) => toSummary(client, true));
  }

  private async searchWorkspace(
    actor: ActorContext,
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
          eq(clientAccounts.workspaceId, actor.workspaceId),
          eq(clientAccounts.status, 'active'),
          sql`${clientAccounts.displayName} ILIKE ${pattern} ESCAPE ${'\\'}`,
          actor.workspacePermissions.includes('client.manage')
            ? undefined
            : sql`${clientCompanyRelationships.id} IS NOT NULL`,
        ),
      )
      .orderBy(asc(clientAccounts.displayName), asc(clientAccounts.id))
      .limit(SEARCH_RESULT_LIMIT);
    return rows.map((client) =>
      toSummary(client, client.relationshipId !== null),
    );
  }

  private register(
    actor: ActorContext,
    companyId: string,
    fields: NormalizedDossierFields,
    idempotencyKey: string,
  ): Promise<ClientAccountView> {
    return this.databaseContext.transaction(async () => {
      const [insertedCommand] = await this.databaseContext.connection
        .insert(clientAccountRegistrationCommands)
        .values({
          workspaceId: actor.workspaceId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          companyId,
          ...fields,
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
        return this.resolveRegistrationReplay(
          actor,
          companyId,
          fields,
          idempotencyKey,
        );
      }

      const [client] = await this.databaseContext.connection
        .insert(clientAccounts)
        .values({
          workspaceId: actor.workspaceId,
          ...fields,
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
      return toSummary(client, true);
    });
  }

  private async resolveRegistrationReplay(
    actor: ActorContext,
    companyId: string,
    fields: NormalizedDossierFields,
    idempotencyKey: string,
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
          eq(clientAccountRegistrationCommands.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (!persistedCommand) {
      throw new Error('The idempotent Client command could not be resolved.');
    }
    if (
      persistedCommand.companyId !== companyId ||
      !sameRegistrationFields(persistedCommand, fields)
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
    if (!client)
      throw new Error('The idempotent Client result is unavailable.');
    return toSummary(client, true);
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
      return toSummary(client, true);
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

function requireClientPermission(
  actor: ActorContext,
  permission: CompanyClientPermission,
): string {
  const companyId = requireActiveCompany(actor);
  if (
    !(
      actor.workspacePermissions.includes('client.manage') &&
      (
        LEGACY_CLIENT_MANAGE_COMPANY_PERMISSIONS as readonly CompanyClientPermission[]
      ).includes(permission)
    ) &&
    !actor.activeCompany?.clientPermissions.includes(permission)
  ) {
    throw new ForbiddenException();
  }
  return companyId;
}

function requireActiveCompany(actor: ActorContext): string {
  if (!actor.activeCompany) throw new ForbiddenException();
  return actor.activeCompany.id;
}

function sameRegistrationFields(
  persisted: typeof clientAccountRegistrationCommands.$inferSelect,
  fields: NormalizedDossierFields,
): boolean {
  return (
    persisted.displayName === fields.displayName &&
    persisted.taxId === fields.taxId &&
    persisted.address === fields.address &&
    persisted.telephone === fields.telephone &&
    persisted.generalEmail === fields.generalEmail &&
    persisted.businessActivity === fields.businessActivity &&
    sameJsonValue(persisted.contacts, fields.contacts)
  );
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

function toSummary(
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
