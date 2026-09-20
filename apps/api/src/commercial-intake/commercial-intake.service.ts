import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientRequests,
  commercialIntakeCommands,
  internalUsers,
  opportunities,
} from '../database/schema/index.js';
import {
  commercialIntakeCursor,
  type CommercialIntakeCursor,
} from './commercial-intake-pagination.js';
import type {
  CommercialIntakeDetail,
  CommercialIntakeListPage,
  CreateCommercialIntakeCommand,
} from './commercial-intake.types.js';
import { readCreateCommercialIntakeCommand } from './commercial-intake.validation.js';

type ClientRequestRow = typeof clientRequests.$inferSelect;
type OpportunityRow = typeof opportunities.$inferSelect;

@Injectable()
export class CommercialIntakeService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly clients: ClientOperationalReferenceService,
    private readonly accountability: AccountabilityService,
  ) {}

  async create(
    actor: ActorContext,
    value: unknown,
    key: string | undefined,
  ): Promise<CommercialIntakeDetail> {
    const command = readCreateCommercialIntakeCommand(value);
    const idempotencyKey = requireIdempotencyKey(key);
    const fingerprint = commandFingerprint(command);
    return this.databaseContext.transaction(async () => {
      const companyId = await this.authorization.requireCommercialIntakeAccess(
        actor,
        'create',
        true,
      );
      await this.lockCommand(actor, companyId, idempotencyKey);
      const replay = await this.findCommand(actor, companyId, idempotencyKey);
      if (replay) {
        if (replay.fingerprint !== fingerprint)
          throw new ConflictException({
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Idempotency-Key was already used for another Request.',
          });
        return this.loadDetail(
          actor,
          companyId,
          replay.resultClientRequestId,
          true,
        );
      }

      const clientReference = command.clientAccountId
        ? await this.recordClientReference(actor, command.clientAccountId)
        : undefined;
      const [request] = await this.databaseContext.connection
        .insert(clientRequests)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          clientAccountId: command.clientAccountId,
          originalText: command.originalText,
          sourceLabel: command.sourceLabel,
          reportedReceivedAt: command.reportedReceivedAt,
          subject: command.subject,
          capturedByInternalUserId: actor.internalUserId,
          capturedByWorkspaceMembershipId: actor.workspaceMembershipId,
        })
        .returning();
      if (!request) throw new Error('The Client Request was not recorded.');
      const [opportunity] = await this.databaseContext.connection
        .insert(opportunities)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          clientRequestId: request.id,
          initial: true,
          title: command.opportunity.title,
          scope: command.opportunity.scope,
          nextAction: command.opportunity.nextAction,
          responsibleInternalUserId: actor.internalUserId,
          responsibleWorkspaceMembershipId: actor.workspaceMembershipId,
        })
        .returning();
      if (!opportunity)
        throw new Error('The initial Opportunity was not recorded.');
      await this.accountability.recordCommercialIntakeCreated({
        actor,
        companyId,
        clientRequestId: request.id,
        opportunityId: opportunity.id,
      });
      await this.databaseContext.connection
        .insert(commercialIntakeCommands)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          fingerprint,
          resultClientRequestId: request.id,
        });
      return detailView(request, opportunity, clientReference);
    });
  }

  async read(
    actor: ActorContext,
    requestId: string,
  ): Promise<CommercialIntakeDetail> {
    const companyId = await this.authorization.requireCommercialIntakeAccess(
      actor,
      'read',
    );
    return this.loadDetail(actor, companyId, requestId, false);
  }

  async list(
    actor: ActorContext,
    limit: number,
    cursor?: CommercialIntakeCursor,
  ): Promise<CommercialIntakeListPage> {
    const companyId = await this.authorization.requireCommercialIntakeAccess(
      actor,
      'read',
    );
    const rows = await this.databaseContext.connection
      .select({
        request: clientRequests,
        opportunity: opportunities,
        responsibleDisplayName: internalUsers.displayName,
        capturedAtCursor: sql<string>`to_char(
          ${clientRequests.capturedAt} AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )`.as('captured_at_cursor'),
      })
      .from(clientRequests)
      .innerJoin(
        opportunities,
        and(
          eq(opportunities.workspaceId, clientRequests.workspaceId),
          eq(opportunities.companyId, clientRequests.companyId),
          eq(opportunities.clientRequestId, clientRequests.id),
          eq(opportunities.initial, true),
        ),
      )
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, opportunities.responsibleInternalUserId),
      )
      .where(
        and(
          eq(clientRequests.workspaceId, actor.workspaceId),
          eq(clientRequests.companyId, companyId),
          cursor
            ? sql<boolean>`(${clientRequests.capturedAt}, ${clientRequests.id})
                < (${cursor.capturedAt}::timestamptz, ${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(clientRequests.capturedAt), desc(clientRequests.id))
      .limit(limit + 1);
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(
        ({ request, opportunity, responsibleDisplayName }) => ({
          id: request.id,
          subject: request.subject,
          capturedAt: request.capturedAt.toISOString(),
          initialOpportunity: {
            title: opportunity.title,
            nextAction: opportunity.nextAction,
            responsibleActor: {
              workspaceMembershipId:
                opportunity.responsibleWorkspaceMembershipId,
              displayName: responsibleDisplayName,
            },
          },
        }),
      ),
      ...(rows.length > limit && last
        ? {
            nextCursor: commercialIntakeCursor({
              capturedAt: last.capturedAtCursor,
              id: last.request.id,
            }),
          }
        : {}),
    };
  }

  private async loadDetail(
    actor: ActorContext,
    companyId: string,
    requestId: string,
    requireClientVisibility: boolean,
  ): Promise<CommercialIntakeDetail> {
    const [row] = await this.databaseContext.connection
      .select({ request: clientRequests, opportunity: opportunities })
      .from(clientRequests)
      .innerJoin(
        opportunities,
        and(
          eq(opportunities.workspaceId, clientRequests.workspaceId),
          eq(opportunities.companyId, clientRequests.companyId),
          eq(opportunities.clientRequestId, clientRequests.id),
          eq(opportunities.initial, true),
        ),
      )
      .where(
        and(
          eq(clientRequests.workspaceId, actor.workspaceId),
          eq(clientRequests.companyId, companyId),
          eq(clientRequests.id, requestId),
        ),
      );
    if (!row) throw new NotFoundException();
    if (!row.request.clientAccountId)
      return detailView(row.request, row.opportunity);
    const canReadClient =
      actor.workspacePermissions.includes('client.manage') ||
      actor.activeCompany?.clientPermissions.includes('client.read') === true;
    if (!canReadClient) {
      if (requireClientVisibility) throw clientUnavailable();
      return detailView(row.request, row.opportunity);
    }
    const reference = (
      await this.clients.readProjectReferences(actor, [
        row.request.clientAccountId,
      ])
    ).get(row.request.clientAccountId);
    if (!reference?.clientDossierId) {
      if (requireClientVisibility) throw clientUnavailable();
      return detailView(row.request, row.opportunity);
    }
    return detailView(row.request, row.opportunity, {
      id: reference.clientDossierId,
      displayName: reference.displayName,
    });
  }

  private async recordClientReference(actor: ActorContext, clientId: string) {
    try {
      return await this.clients.recordReferenceUse(actor, clientId);
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
      'commercial-intake.create',
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
  ) {
    const [command] = await this.databaseContext.connection
      .select()
      .from(commercialIntakeCommands)
      .where(
        and(
          eq(commercialIntakeCommands.workspaceId, actor.workspaceId),
          eq(commercialIntakeCommands.companyId, companyId),
          eq(
            commercialIntakeCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(commercialIntakeCommands.idempotencyKey, idempotencyKey),
        ),
      );
    return command;
  }
}

function commandFingerprint(command: CreateCommercialIntakeCommand): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        originalText: command.originalText,
        sourceLabel: command.sourceLabel,
        reportedReceivedAt: command.reportedReceivedAtInput,
        subject: command.subject,
        clientAccountId: command.clientAccountId,
        opportunity: command.opportunity,
      }),
    )
    .digest('hex');
}

function detailView(
  request: ClientRequestRow,
  opportunity: OpportunityRow,
  client?: { id: string; displayName: string },
): CommercialIntakeDetail {
  if (request.version !== 1 || opportunity.version !== 1)
    throw new Error('Unsupported commercial intake version.');
  return {
    id: request.id,
    companyId: request.companyId,
    sourceKind: request.sourceKind,
    sourceLabel: request.sourceLabel,
    reportedReceivedAt: request.reportedReceivedAt?.toISOString() ?? null,
    subject: request.subject,
    originalText: request.originalText,
    capturedByWorkspaceMembershipId: request.capturedByWorkspaceMembershipId,
    capturedAt: request.capturedAt.toISOString(),
    version: request.version,
    ...(request.clientAccountId && client
      ? {
          clientReference: {
            originalClientId: request.clientAccountId,
            currentClientId: client.id,
            displayName: client.displayName,
          },
        }
      : {}),
    initialOpportunity: {
      id: opportunity.id,
      title: opportunity.title,
      scope: opportunity.scope,
      nextAction: opportunity.nextAction,
      status: opportunity.status,
      responsibleWorkspaceMembershipId:
        opportunity.responsibleWorkspaceMembershipId,
      createdAt: opportunity.createdAt.toISOString(),
      version: opportunity.version,
    },
  };
}

function clientUnavailable(): NotFoundException {
  return new NotFoundException({
    code: 'CLIENT_REFERENCE_UNAVAILABLE',
    message: 'Refresh Client search before retrying.',
  });
}
