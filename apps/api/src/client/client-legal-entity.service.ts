import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import {
  CLIENT_LEGAL_ENTITY_CORRECTED_ACTION,
  CLIENT_LEGAL_ENTITY_REGISTERED_ACTION,
  type CanonicalActivityEvent,
} from '../accountability/accountability.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientLegalEntities,
  clientLegalEntityCommands,
} from '../database/schema/index.js';
import { ClientDossierService } from './client-dossier.service.js';
import { readStoredLegalEntityResult } from './client-legal-entity-validation.js';
import {
  CLIENT_LEGAL_ENTITY_CAPACITY,
  CLIENT_LEGAL_ENTITY_CAPACITY_EXCEEDED,
  type ClientLegalEntityChanges,
  type ClientLegalEntityCommand,
  type ClientLegalEntityFieldChanges,
  type ClientLegalEntityList,
  type ClientLegalEntityMutationResult,
  type ClientLegalEntityValues,
  type ClientLegalEntityView,
} from './client-legal-entity.types.js';
import { sameJsonValue } from './json-structural-equality.js';

type LegalEntityRow = typeof clientLegalEntities.$inferSelect;
type CommandReceipt = typeof clientLegalEntityCommands.$inferSelect;
/** Distributes over each event variant so action and metadata stay paired. */
type EventMeaning<Event extends CanonicalActivityEvent> = Event extends unknown
  ? Pick<Event, 'action' | 'metadata'>
  : never;
type LegalEntityEvent = EventMeaning<
  Extract<
    CanonicalActivityEvent,
    {
      action:
        | typeof CLIENT_LEGAL_ENTITY_REGISTERED_ACTION
        | typeof CLIENT_LEGAL_ENTITY_CORRECTED_ACTION;
    }
  >
>;
interface LegalEntityChange {
  legalEntity: ClientLegalEntityView;
  event: LegalEntityEvent;
}

/**
 * Additional Client Legal Entities recorded in a shared Client dossier. Every
 * read and command reuses the dossier's readability, correction authority and
 * version token; nothing here reaches duplicate detection or search.
 */
@Injectable()
export class ClientLegalEntityService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly accountability: AccountabilityService,
    private readonly dossiers: ClientDossierService,
  ) {}

  /** Visibility and the list share one snapshot; the read records nothing. */
  list(
    actor: ActorContext,
    companyId: string,
    clientAccountId: string,
  ): Promise<ClientLegalEntityList> {
    return this.databaseContext.transaction(
      async () => {
        const { version } = await this.dossiers.requireReadable({
          workspaceId: actor.workspaceId,
          companyId,
          clientAccountId,
        });
        const rows = await this.databaseContext.connection
          .select()
          .from(clientLegalEntities)
          .where(
            and(
              eq(clientLegalEntities.workspaceId, actor.workspaceId),
              eq(clientLegalEntities.clientAccountId, clientAccountId),
            ),
          )
          .orderBy(
            asc(clientLegalEntities.createdAt),
            asc(clientLegalEntities.id),
          )
          .limit(CLIENT_LEGAL_ENTITY_CAPACITY);
        return { clientVersion: version, legalEntities: rows.map(toView) };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /**
   * Registers or corrects one entity. The receipt, the entity change, the
   * Client version increment and exactly one event commit together, following
   * the delivered dossier correction order: the key is reserved before the
   * Client row lock, and an exact replay returns the stored result.
   */
  execute(
    actor: ActorContext,
    companyId: string,
    command: ClientLegalEntityCommand,
  ): Promise<ClientLegalEntityMutationResult> {
    return this.databaseContext.transaction(async () => {
      const target = {
        workspaceId: actor.workspaceId,
        companyId,
        clientAccountId: command.clientAccountId,
      };
      const existing = await this.findReceipt(actor, command.idempotencyKey);
      if (existing) return this.replay(existing, companyId, command);

      // The receipt's foreign keys require the relationship and the entity,
      // so refuse an unknown or unrelated target before reserving the key.
      await this.dossiers.requireReadable(target);
      if (command.action === 'correct') {
        await this.requireLegalEntity(
          actor.workspaceId,
          command.clientAccountId,
          command.legalEntityId,
        );
      }
      const [reserved] = await this.databaseContext.connection
        .insert(clientLegalEntityCommands)
        .values({
          workspaceId: actor.workspaceId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey: command.idempotencyKey,
          action: command.action,
          clientAccountId: command.clientAccountId,
          companyId,
          legalEntityId: targetLegalEntityId(command),
          expectedClientVersion: command.expectedClientVersion,
          intent: commandIntent(command),
        })
        .onConflictDoNothing()
        .returning();
      if (!reserved) {
        const raced = await this.findReceipt(actor, command.idempotencyKey);
        if (!raced) {
          throw new Error(
            'The idempotent Client legal entity command was lost.',
          );
        }
        return this.replay(raced, companyId, command);
      }

      const { clientVersion, value } = await this.dossiers.applyVersionedChange(
        { ...target, expectedVersion: command.expectedClientVersion },
        () =>
          command.action === 'register'
            ? this.insertLegalEntity(
                actor,
                command.clientAccountId,
                command.values,
              )
            : this.updateLegalEntity(
                actor.workspaceId,
                command.clientAccountId,
                command.legalEntityId,
                command.changes,
              ),
      );
      const result: ClientLegalEntityMutationResult = {
        clientVersion,
        legalEntity: value.legalEntity,
      };
      await this.databaseContext.connection
        .update(clientLegalEntityCommands)
        .set({ result })
        .where(eq(clientLegalEntityCommands.id, reserved.id));
      await this.accountability.record({
        actor,
        ...value.event,
        target: {
          type: 'client_account',
          clientAccountId: command.clientAccountId,
          companyId,
        },
        transitionId: reserved.id,
      });
      return result;
    });
  }

  /** Union preflight: whether any input Client records an additional entity. */
  async anyRecorded(
    workspaceId: string,
    clientAccountIds: readonly string[],
  ): Promise<boolean> {
    if (clientAccountIds.length === 0) return false;
    const [recorded] = await this.databaseContext.connection
      .select({ id: clientLegalEntities.id })
      .from(clientLegalEntities)
      .where(
        and(
          eq(clientLegalEntities.workspaceId, workspaceId),
          inArray(clientLegalEntities.clientAccountId, [...clientAccountIds]),
        ),
      )
      .limit(1);
    return recorded !== undefined;
  }

  private async insertLegalEntity(
    actor: ActorContext,
    clientAccountId: string,
    values: ClientLegalEntityValues,
  ): Promise<LegalEntityChange> {
    const [recorded] = await this.databaseContext.connection
      .select({ total: count() })
      .from(clientLegalEntities)
      .where(
        and(
          eq(clientLegalEntities.workspaceId, actor.workspaceId),
          eq(clientLegalEntities.clientAccountId, clientAccountId),
        ),
      );
    if ((recorded?.total ?? 0) >= CLIENT_LEGAL_ENTITY_CAPACITY) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: CLIENT_LEGAL_ENTITY_CAPACITY_EXCEEDED,
      });
    }
    const [inserted] = await this.databaseContext.connection
      .insert(clientLegalEntities)
      .values({
        workspaceId: actor.workspaceId,
        clientAccountId,
        ...values,
        createdByInternalUserId: actor.internalUserId,
        createdByWorkspaceMembershipId: actor.workspaceMembershipId,
      })
      .returning();
    if (!inserted) throw new Error('The Client legal entity was not recorded.');
    return {
      legalEntity: toView(inserted),
      event: {
        action: CLIENT_LEGAL_ENTITY_REGISTERED_ACTION,
        metadata: { legalEntityId: inserted.id, values },
      },
    };
  }

  private async updateLegalEntity(
    workspaceId: string,
    clientAccountId: string,
    legalEntityId: string,
    changes: ClientLegalEntityChanges,
  ): Promise<LegalEntityChange> {
    const current = await this.requireLegalEntity(
      workspaceId,
      clientAccountId,
      legalEntityId,
    );
    const material = materialChanges(current, changes);
    if (Object.keys(material).length === 0) {
      throw new BadRequestException(
        'The Client correction must change at least one field.',
      );
    }
    const [updated] = await this.databaseContext.connection
      .update(clientLegalEntities)
      .set(changes)
      .where(
        and(
          eq(clientLegalEntities.workspaceId, workspaceId),
          eq(clientLegalEntities.clientAccountId, clientAccountId),
          eq(clientLegalEntities.id, legalEntityId),
        ),
      )
      .returning();
    if (!updated) throw new Error('The Client legal entity was not corrected.');
    return {
      legalEntity: toView(updated),
      event: {
        action: CLIENT_LEGAL_ENTITY_CORRECTED_ACTION,
        metadata: { legalEntityId, changes: material },
      },
    };
  }

  /**
   * An exact replay returns the stored result after the relationship check a
   * correction replay applies; any other reuse of the key is refused.
   */
  private async replay(
    receipt: CommandReceipt,
    companyId: string,
    command: ClientLegalEntityCommand,
  ): Promise<ClientLegalEntityMutationResult> {
    if (!sameCommand(receipt, companyId, command)) {
      throw new BadRequestException(
        'Idempotency-Key was already used for another Client command.',
      );
    }
    if (receipt.result === null) {
      throw new Error(
        'The idempotent Client legal entity command is incomplete.',
      );
    }
    await this.dossiers.requireReplayable({
      workspaceId: receipt.workspaceId,
      companyId,
      clientAccountId: command.clientAccountId,
    });
    return readStoredLegalEntityResult(receipt.result);
  }

  private async requireLegalEntity(
    workspaceId: string,
    clientAccountId: string,
    legalEntityId: string,
  ): Promise<LegalEntityRow> {
    const [legalEntity] = await this.databaseContext.connection
      .select()
      .from(clientLegalEntities)
      .where(
        and(
          eq(clientLegalEntities.workspaceId, workspaceId),
          eq(clientLegalEntities.clientAccountId, clientAccountId),
          eq(clientLegalEntities.id, legalEntityId),
        ),
      )
      .limit(1);
    if (!legalEntity) throw new NotFoundException();
    return legalEntity;
  }

  private async findReceipt(
    actor: ActorContext,
    idempotencyKey: string,
  ): Promise<CommandReceipt | undefined> {
    const [receipt] = await this.databaseContext.connection
      .select()
      .from(clientLegalEntityCommands)
      .where(
        and(
          eq(clientLegalEntityCommands.workspaceId, actor.workspaceId),
          eq(
            clientLegalEntityCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(clientLegalEntityCommands.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return receipt;
  }
}

function toView(row: LegalEntityRow): ClientLegalEntityView {
  return {
    id: row.id,
    legalName: row.legalName,
    taxId: row.taxId,
    legalAddress: row.legalAddress,
    createdAt: row.createdAt.toISOString(),
  };
}

function materialChanges(
  current: ClientLegalEntityValues,
  changes: ClientLegalEntityChanges,
): ClientLegalEntityFieldChanges {
  const material: ClientLegalEntityFieldChanges = {};
  if (
    changes.legalName !== undefined &&
    changes.legalName !== current.legalName
  )
    material.legalName = {
      before: current.legalName,
      after: changes.legalName,
    };
  if (changes.taxId !== undefined && changes.taxId !== current.taxId)
    material.taxId = { before: current.taxId, after: changes.taxId };
  if (
    changes.legalAddress !== undefined &&
    changes.legalAddress !== current.legalAddress
  )
    material.legalAddress = {
      before: current.legalAddress,
      after: changes.legalAddress,
    };
  return material;
}

function targetLegalEntityId(command: ClientLegalEntityCommand): string | null {
  return command.action === 'correct' ? command.legalEntityId : null;
}

function commandIntent(
  command: ClientLegalEntityCommand,
): ClientLegalEntityValues | ClientLegalEntityChanges {
  return command.action === 'register' ? command.values : command.changes;
}

function sameCommand(
  receipt: CommandReceipt,
  companyId: string,
  command: ClientLegalEntityCommand,
): boolean {
  return (
    receipt.action === command.action &&
    receipt.companyId === companyId &&
    receipt.clientAccountId === command.clientAccountId &&
    receipt.legalEntityId === targetLegalEntityId(command) &&
    receipt.expectedClientVersion === command.expectedClientVersion &&
    sameJsonValue(receipt.intent, commandIntent(command))
  );
}
