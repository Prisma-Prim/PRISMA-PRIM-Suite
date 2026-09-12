import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
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
        );
        return { kind: 'completed', value: existingCommand.result };
      }

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
        true,
      );
      if (!current) throw new NotFoundException();
      if (current.version !== command.expectedVersion) {
        throw new ConflictException('The Client dossier has changed.');
      }
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
      if (!updated) {
        throw new ConflictException('The Client dossier has changed.');
      }

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
    );
    return { kind: 'completed', value: racedCommand.result };
  }

  private async requireRelatedClient(
    workspaceId: string,
    companyId: string,
    clientAccountId: string,
  ): Promise<ClientRow> {
    const client = await this.findRelatedClient(
      workspaceId,
      companyId,
      clientAccountId,
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
    lock = false,
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
          eq(clientAccounts.status, 'active'),
        ),
      );
    return lock
      ? (await query.for('update', { of: clientAccounts }).limit(1))[0]
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
