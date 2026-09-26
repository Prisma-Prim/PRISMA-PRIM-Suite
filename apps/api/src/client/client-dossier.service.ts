import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import {
  CLIENT_CORRECTED_ACTION,
  type ClientCorrectionChanges,
} from '../accountability/accountability.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientAccountCorrectionCommands,
  clientAccounts,
  clientCompanyRelationships,
  companies,
} from '../database/schema/index.js';
import type {
  CorrectionPatch,
  NormalizedDossierFields,
} from './client-dossier-validation.js';
import type { ClientDossierView } from './client.types.js';
import {
  ClientDuplicateReviewService,
  throwDuplicateReviewConflict,
} from './client-duplicate-review.service.js';
import type { ClientMutationOutcome } from './client-duplicate-review.types.js';
import { sameJsonValue } from './json-structural-equality.js';

type ClientRow = Pick<
  typeof clientAccounts.$inferSelect,
  | 'id'
  | 'displayName'
  | 'taxId'
  | 'address'
  | 'telephone'
  | 'generalEmail'
  | 'contacts'
  | 'businessActivity'
  | 'version'
>;

interface DossierTarget {
  workspaceId: string;
  companyId: string;
  clientAccountId: string;
}

export interface CorrectClientDossierCommand {
  clientAccountId: string;
  expectedVersion: number;
  changes: CorrectionPatch;
  idempotencyKey: string;
}

@Injectable()
export class ClientDossierService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly accountability: AccountabilityService,
    private readonly duplicateReviews: ClientDuplicateReviewService,
  ) {}

  async read(
    workspaceId: string,
    companyId: string,
    clientAccountId: string,
  ): Promise<ClientDossierView> {
    const client = await this.requireRelatedClient(
      workspaceId,
      companyId,
      clientAccountId,
    );
    return this.toDossier(client, workspaceId);
  }

  /**
   * Refuses exactly as `read` does, without building the dossier view, and
   * returns the version it observed.
   */
  async requireReadable(input: DossierTarget): Promise<{ version: number }> {
    const client = await this.requireRelatedClient(
      input.workspaceId,
      input.companyId,
      input.clientAccountId,
    );
    return { version: client.version };
  }

  /**
   * Refuses an exact replay as a correction replay does: the relationship
   * must still be active, while a since-superseded Client stays replayable.
   */
  async requireReplayable(input: DossierTarget): Promise<void> {
    await this.requireRelatedClient(
      input.workspaceId,
      input.companyId,
      input.clientAccountId,
      ['active', 'superseded'],
    );
  }

  /**
   * Applies one change that shares the dossier concurrency token, inside the
   * caller's transaction. Like a correction, it locks the active related
   * Client, requires the expected version before the change runs and then
   * advances the version by exactly one. It refuses as `read` does, or with
   * the delivered stale conflict.
   */
  async applyVersionedChange<T>(
    input: DossierTarget & { expectedVersion: number },
    change: () => Promise<T>,
  ): Promise<{ clientVersion: number; value: T }> {
    const current = await this.findRelatedClient(
      input.workspaceId,
      input.companyId,
      input.clientAccountId,
      { lock: true },
    );
    if (!current) throw new NotFoundException();
    if (current.version !== input.expectedVersion) throw staleDossier();
    const value = await change();
    const [advanced] = await this.databaseContext.connection
      .update(clientAccounts)
      .set({
        version: sql`${clientAccounts.version} + 1`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(clientAccounts.workspaceId, input.workspaceId),
          eq(clientAccounts.id, input.clientAccountId),
          eq(clientAccounts.status, 'active'),
          eq(clientAccounts.version, input.expectedVersion),
        ),
      )
      .returning({ version: clientAccounts.version });
    if (!advanced) throw staleDossier();
    return { clientVersion: advanced.version, value };
  }

  async correct(
    actor: ActorContext,
    companyId: string,
    command: CorrectClientDossierCommand,
  ): Promise<ClientDossierView> {
    const outcome = await this.databaseContext.transaction<
      ClientMutationOutcome<ClientDossierView>
    >(async () => {
      const existingCommand = await this.findCorrectionCommand(
        actor,
        command.idempotencyKey,
      );
      if (existingCommand) {
        assertSameCorrection(existingCommand, companyId, command);
        if (!existingCommand.result) {
          const duplicateReviewReference =
            await this.duplicateReviews.correctionReplayReference(
              actor,
              existingCommand.id,
            );
          if (duplicateReviewReference) {
            return {
              kind: 'duplicate-review-required',
              reference: duplicateReviewReference,
            };
          }
          throw new Error('The idempotent Client correction is incomplete.');
        }
        await this.requireRelatedClient(
          actor.workspaceId,
          companyId,
          command.clientAccountId,
          ['active', 'superseded'],
        );
        return { kind: 'completed', value: existingCommand.result };
      }

      // The reservation's foreign keys require this relationship, so refuse an
      // unknown or unrelated Client before reserving the key.
      await this.requireRelatedClient(
        actor.workspaceId,
        companyId,
        command.clientAccountId,
      );
      const [reserved] = await this.databaseContext.connection
        .insert(clientAccountCorrectionCommands)
        .values({
          workspaceId: actor.workspaceId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey: command.idempotencyKey,
          clientAccountId: command.clientAccountId,
          companyId,
          expectedVersion: command.expectedVersion,
          changes: command.changes,
        })
        .onConflictDoNothing()
        .returning();
      if (!reserved) {
        return this.resolveRacedCorrection(actor, companyId, command);
      }

      const current = await this.findRelatedClient(
        actor.workspaceId,
        companyId,
        command.clientAccountId,
        { lock: true },
      );
      if (!current) throw new NotFoundException();
      if (current.version !== command.expectedVersion) throw staleDossier();
      const materialChanges = materialCorrectionChanges(
        current,
        command.changes,
      );
      if (Object.keys(materialChanges).length === 0) {
        throw new BadRequestException(
          'The Client correction must change at least one field.',
        );
      }

      if (
        Object.hasOwn(command.changes, 'taxId') &&
        (command.changes.taxId?.trim() ?? null) !==
          (current.taxId?.trim() ?? null) &&
        command.changes.taxId !== null
      ) {
        const duplicateReviewReference =
          await this.duplicateReviews.proposeCorrection({
            actor,
            attemptedCompanyId: companyId,
            commandId: reserved.id,
            clientAccountId: current.id,
            version: current.version,
            fields: applyCorrection(current, command.changes),
          });
        if (duplicateReviewReference) {
          return {
            kind: 'duplicate-review-required',
            reference: duplicateReviewReference,
          };
        }
      }

      const [updated] = await this.databaseContext.connection
        .update(clientAccounts)
        .set({
          ...command.changes,
          version: sql`${clientAccounts.version} + 1`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(clientAccounts.workspaceId, actor.workspaceId),
            eq(clientAccounts.id, command.clientAccountId),
            eq(clientAccounts.status, 'active'),
            eq(clientAccounts.version, command.expectedVersion),
          ),
        )
        .returning(clientSelection());
      if (!updated) throw staleDossier();

      const result = await this.toDossier(updated, actor.workspaceId);
      await this.databaseContext.connection
        .update(clientAccountCorrectionCommands)
        .set({ result })
        .where(eq(clientAccountCorrectionCommands.id, reserved.id));
      await this.accountability.record({
        actor,
        action: CLIENT_CORRECTED_ACTION,
        target: {
          type: 'client_account',
          clientAccountId: command.clientAccountId,
          companyId,
        },
        metadata: { changes: materialChanges },
        transitionId: reserved.id,
      });
      return { kind: 'completed', value: result };
    });
    if (outcome.kind === 'duplicate-review-required') {
      throwDuplicateReviewConflict(outcome.reference);
    }
    return outcome.value;
  }

  private async resolveRacedCorrection(
    actor: ActorContext,
    companyId: string,
    command: CorrectClientDossierCommand,
  ): Promise<ClientMutationOutcome<ClientDossierView>> {
    const racedCommand = await this.findCorrectionCommand(
      actor,
      command.idempotencyKey,
    );
    if (!racedCommand) {
      throw new Error('The idempotent Client correction was not found.');
    }
    assertSameCorrection(racedCommand, companyId, command);
    if (!racedCommand.result) {
      const duplicateReviewReference =
        await this.duplicateReviews.correctionReplayReference(
          actor,
          racedCommand.id,
        );
      if (duplicateReviewReference) {
        return {
          kind: 'duplicate-review-required',
          reference: duplicateReviewReference,
        };
      }
      throw new ConflictException('The correction command is still pending.');
    }
    await this.requireRelatedClient(
      actor.workspaceId,
      companyId,
      command.clientAccountId,
      ['active', 'superseded'],
    );
    return { kind: 'completed', value: racedCommand.result };
  }

  private async requireRelatedClient(
    workspaceId: string,
    companyId: string,
    clientAccountId: string,
    statuses: (typeof clientAccounts.$inferSelect.status)[] = ['active'],
  ): Promise<ClientRow> {
    const client = await this.findRelatedClient(
      workspaceId,
      companyId,
      clientAccountId,
      { statuses },
    );
    if (!client) throw new NotFoundException();
    return client;
  }

  private async findCorrectionCommand(
    actor: ActorContext,
    idempotencyKey: string,
  ) {
    const [command] = await this.databaseContext.connection
      .select()
      .from(clientAccountCorrectionCommands)
      .where(
        and(
          eq(clientAccountCorrectionCommands.workspaceId, actor.workspaceId),
          eq(
            clientAccountCorrectionCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(clientAccountCorrectionCommands.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return command;
  }

  private async findRelatedClient(
    workspaceId: string,
    companyId: string,
    clientAccountId: string,
    options: {
      lock?: boolean;
      statuses?: (typeof clientAccounts.$inferSelect.status)[];
    } = {},
  ): Promise<ClientRow | undefined> {
    const query = this.databaseContext.connection
      .select(clientSelection())
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
          eq(clientAccounts.workspaceId, workspaceId),
          eq(clientAccounts.id, clientAccountId),
          inArray(clientAccounts.status, options.statuses ?? ['active']),
        ),
      );
    // Lock as the non-key dossier UPDATE does. FOR UPDATE also conflicts with
    // the KEY SHARE lock a racing command's receipt foreign key already holds
    // on this row, so two reserved corrections would deadlock, not queue.
    return options.lock
      ? (await query.for('no key update', { of: clientAccounts }).limit(1))[0]
      : (await query.limit(1))[0];
  }

  private async toDossier(
    client: ClientRow,
    workspaceId: string,
  ): Promise<ClientDossierView> {
    const involvedCompanies = await this.databaseContext.connection
      .select({ displayName: companies.displayName })
      .from(clientCompanyRelationships)
      .innerJoin(
        companies,
        and(
          eq(companies.workspaceId, clientCompanyRelationships.workspaceId),
          eq(companies.id, clientCompanyRelationships.companyId),
        ),
      )
      .where(
        and(
          eq(clientCompanyRelationships.workspaceId, workspaceId),
          eq(clientCompanyRelationships.clientAccountId, client.id),
          eq(clientCompanyRelationships.status, 'active'),
          eq(companies.status, 'active'),
        ),
      )
      .orderBy(asc(companies.displayName), asc(companies.id));
    return {
      ...client,
      relatedToActiveCompany: true,
      involvedCompanyDisplayNames: involvedCompanies.map(
        (company) => company.displayName,
      ),
    };
  }
}

function staleDossier(): ConflictException {
  return new ConflictException('The Client dossier has changed.');
}

function clientSelection() {
  return {
    id: clientAccounts.id,
    displayName: clientAccounts.displayName,
    taxId: clientAccounts.taxId,
    address: clientAccounts.address,
    telephone: clientAccounts.telephone,
    generalEmail: clientAccounts.generalEmail,
    contacts: clientAccounts.contacts,
    businessActivity: clientAccounts.businessActivity,
    version: clientAccounts.version,
  };
}

function assertSameCorrection(
  persisted: typeof clientAccountCorrectionCommands.$inferSelect,
  companyId: string,
  command: CorrectClientDossierCommand,
): void {
  if (
    persisted.companyId !== companyId ||
    persisted.clientAccountId !== command.clientAccountId ||
    persisted.expectedVersion !== command.expectedVersion ||
    !sameJsonValue(persisted.changes, command.changes)
  ) {
    throw new BadRequestException(
      'Idempotency-Key was already used for another Client correction.',
    );
  }
}

function materialCorrectionChanges(
  current: ClientRow,
  patch: CorrectionPatch,
): ClientCorrectionChanges {
  const changes: ClientCorrectionChanges = {};
  for (const field of Object.keys(patch)) {
    const key = dossierField(field);
    const before = current[key];
    const after = patch[key];
    if (!sameJsonValue(before, after)) changes[key] = { before, after };
  }
  return changes;
}

function applyCorrection(
  current: ClientRow,
  patch: CorrectionPatch,
): NormalizedDossierFields {
  return {
    displayName: patch.displayName ?? current.displayName,
    taxId: Object.hasOwn(patch, 'taxId')
      ? (patch.taxId ?? null)
      : current.taxId,
    address: Object.hasOwn(patch, 'address')
      ? (patch.address ?? null)
      : current.address,
    telephone: Object.hasOwn(patch, 'telephone')
      ? (patch.telephone ?? null)
      : current.telephone,
    generalEmail: Object.hasOwn(patch, 'generalEmail')
      ? (patch.generalEmail ?? null)
      : current.generalEmail,
    contacts: patch.contacts ?? current.contacts,
    businessActivity: Object.hasOwn(patch, 'businessActivity')
      ? (patch.businessActivity ?? null)
      : current.businessActivity,
  };
}

function dossierField(value: string): keyof NormalizedDossierFields {
  switch (value) {
    case 'displayName':
    case 'taxId':
    case 'address':
    case 'telephone':
    case 'generalEmail':
    case 'contacts':
    case 'businessActivity':
      return value;
    default:
      throw new Error(`Unexpected Client dossier field: ${value}`);
  }
}
