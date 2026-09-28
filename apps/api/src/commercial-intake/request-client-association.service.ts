import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientRequests,
  commercialIntakeClientAssociationCommands,
  opportunities,
} from '../database/schema/index.js';
import { CommercialIntakeService } from './commercial-intake.service.js';
import type {
  AssociateClientCommand,
  ClientAssociationResult,
} from './commercial-intake.types.js';
import { readAssociateClientCommand } from './commercial-intake.validation.js';

type AssociationCommandRow =
  typeof commercialIntakeClientAssociationCommands.$inferSelect;

const UUID_GRAMMAR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class RequestClientAssociationService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly clients: ClientOperationalReferenceService,
    private readonly accountability: AccountabilityService,
    private readonly intake: CommercialIntakeService,
  ) {}

  async associate(
    actor: ActorContext,
    requestIdInput: string,
    value: unknown,
    key: string | undefined,
  ): Promise<ClientAssociationResult> {
    await this.authorization.requireCommercialIntakeAccess(
      actor,
      'associate-client',
    );
    const requestId = requestIdentifier(requestIdInput);
    const command = readAssociateClientCommand(value);
    const idempotencyKey = requireIdempotencyKey(key);
    const fingerprint = associationFingerprint(requestId, command);

    const recorded = await this.databaseContext.transaction(async () => {
      const companyId = await this.authorization.requireCommercialIntakeAccess(
        actor,
        'associate-client',
        true,
      );
      await this.requireRequest(actor, companyId, requestId, false);
      await this.lockCommand(actor, companyId, idempotencyKey);
      const replay = await this.findCommand(actor, companyId, idempotencyKey);
      if (replay) {
        if (replay.fingerprint !== fingerprint) throw idempotencyConflict();
        await this.requireAvailableClient(actor, replay.clientAccountId);
        return replay;
      }

      const current = await this.requireRequest(
        actor,
        companyId,
        requestId,
        true,
      );
      if (current.clientAccountId) throw alreadyAssociated();
      if (current.version !== command.expectedVersion) throw staleVersion();

      await this.recordClientReference(actor, command.clientAccountId);
      const [updated] = await this.databaseContext.connection
        .update(clientRequests)
        .set({ clientAccountId: command.clientAccountId, version: 2 })
        .where(
          and(
            eq(clientRequests.workspaceId, actor.workspaceId),
            eq(clientRequests.companyId, companyId),
            eq(clientRequests.id, requestId),
            eq(clientRequests.version, command.expectedVersion),
            isNull(clientRequests.clientAccountId),
          ),
        )
        .returning();
      if (!updated) throw staleVersion();
      const [opportunity] = await this.databaseContext.connection
        .select({ id: opportunities.id })
        .from(opportunities)
        .where(
          and(
            eq(opportunities.workspaceId, actor.workspaceId),
            eq(opportunities.companyId, companyId),
            eq(opportunities.clientRequestId, requestId),
            eq(opportunities.initial, true),
          ),
        );
      if (!opportunity)
        throw new Error('The initial Opportunity is unavailable.');

      await this.accountability.recordClientRequestClientAssociated({
        actor,
        companyId,
        clientRequestId: requestId,
        opportunityId: opportunity.id,
      });
      const [receipt] = await this.databaseContext.connection
        .insert(commercialIntakeClientAssociationCommands)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          fingerprint,
          clientRequestId: requestId,
          clientAccountId: command.clientAccountId,
          expectedVersion: command.expectedVersion,
          resultVersion: 2,
        })
        .returning();
      if (!receipt)
        throw new Error('The Client association receipt was not recorded.');
      return receipt;
    });

    return {
      receipt: associationReceipt(recorded),
      request: await this.intake.read(actor, requestId),
    };
  }

  private async requireRequest(
    actor: ActorContext,
    companyId: string,
    requestId: string,
    lock: boolean,
  ) {
    const query = this.databaseContext.connection
      .select()
      .from(clientRequests)
      .where(
        and(
          eq(clientRequests.workspaceId, actor.workspaceId),
          eq(clientRequests.companyId, companyId),
          eq(clientRequests.id, requestId),
        ),
      );
    const [request] = lock ? await query.for('update') : await query;
    if (!request) throw new NotFoundException();
    return request;
  }

  private async requireAvailableClient(
    actor: ActorContext,
    clientAccountId: string,
  ): Promise<void> {
    try {
      await this.clients.lockActiveReferenceClient(actor, clientAccountId);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        throw clientUnavailable();
      throw error;
    }
  }

  private async recordClientReference(
    actor: ActorContext,
    clientAccountId: string,
  ): Promise<void> {
    try {
      await this.clients.recordReferenceUse(actor, clientAccountId);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        throw clientUnavailable();
      throw error;
    }
  }

  private async lockCommand(
    actor: ActorContext,
    companyId: string,
    idempotencyKey: string,
  ): Promise<void> {
    const lockKey = JSON.stringify([
      'commercial-intake.associate-client',
      actor.workspaceId,
      companyId,
      actor.workspaceMembershipId,
      idempotencyKey,
    ]);
    await this.databaseContext.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
  }

  private async findCommand(
    actor: ActorContext,
    companyId: string,
    idempotencyKey: string,
  ): Promise<AssociationCommandRow | undefined> {
    const [command] = await this.databaseContext.connection
      .select()
      .from(commercialIntakeClientAssociationCommands)
      .where(
        and(
          eq(
            commercialIntakeClientAssociationCommands.workspaceId,
            actor.workspaceId,
          ),
          eq(commercialIntakeClientAssociationCommands.companyId, companyId),
          eq(
            commercialIntakeClientAssociationCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(
            commercialIntakeClientAssociationCommands.idempotencyKey,
            idempotencyKey,
          ),
        ),
      );
    return command;
  }
}

function requestIdentifier(value: string): string {
  if (!UUID_GRAMMAR.test(value))
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      field: 'requestId',
      message: 'Choose a valid Client Request.',
    });
  return value.toLowerCase();
}

function associationFingerprint(
  requestId: string,
  command: AssociateClientCommand,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        requestId,
        expectedVersion: command.expectedVersion,
        clientAccountId: command.clientAccountId,
      }),
    )
    .digest('hex');
}

function associationReceipt(
  command: AssociationCommandRow,
): ClientAssociationResult['receipt'] {
  if (command.resultVersion !== 2)
    throw new Error('Unsupported Client association receipt.');
  return {
    requestId: command.clientRequestId,
    version: 2,
    outcome: 'associated',
  };
}

function idempotencyConflict(): ConflictException {
  return new ConflictException({
    code: 'IDEMPOTENCY_CONFLICT',
    message: 'Idempotency-Key was already used for another association.',
  });
}

function staleVersion(): ConflictException {
  return new ConflictException({
    code: 'STALE_VERSION',
    message: 'Reload the Request before retrying.',
  });
}

function alreadyAssociated(): ConflictException {
  return new ConflictException({
    code: 'CLIENT_ALREADY_ASSOCIATED',
    message: 'This Client Request already has a Client association.',
  });
}

function clientUnavailable(): NotFoundException {
  return new NotFoundException({
    code: 'CLIENT_REFERENCE_UNAVAILABLE',
    message: 'Refresh Client search before retrying.',
  });
}
