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
  commercialIntakeNextActionCommands,
  internalUsers,
  opportunities,
} from '../database/schema/index.js';
import {
  commercialIntakeCursor,
  readCommercialIntakeCursor,
  readCommercialIntakeLimit,
} from './commercial-intake-pagination.js';
import type {
  CommercialIntakeDetail,
  CommercialIntakeListClientProjection,
  CommercialIntakeListItem,
  CommercialIntakeListPage,
  CreateCommercialIntakeCommand,
  OpportunityNextActionUpdateResult,
  ReadablePricingOpportunity,
  CommercialClientProjection,
  UpdateOpportunityNextActionCommand,
} from './commercial-intake.types.js';
import {
  MAXIMUM_OPPORTUNITY_VERSION,
  readCreateCommercialIntakeCommand,
  readUpdateOpportunityNextActionCommand,
} from './commercial-intake.validation.js';

type ClientRequestRow = typeof clientRequests.$inferSelect;
type OpportunityRow = typeof opportunities.$inferSelect;
type NextActionCommandRow =
  typeof commercialIntakeNextActionCommands.$inferSelect;

const UUID_GRAMMAR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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
    await this.authorization.requireCommercialIntakeAccess(actor, 'create');
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
      // The creator is the initial responsible actor, and this request already
      // synchronized that internal user's display name, so the create response
      // carries the same label the list projection reads back.
      const responsibleDisplayName = actor.displayName;
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
      return detailView({
        request,
        opportunity,
        responsibleDisplayName,
        client: clientReference,
      });
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

  /**
   * Call inside the owning command transaction to answer with the same
   * permission-filtered detail as `read`. The captured read authority is held
   * under share locks until that command commits, so a concurrent revocation
   * orders entirely before the command or after its answer.
   */
  async readWithinCommand(
    actor: ActorContext,
    requestId: string,
  ): Promise<CommercialIntakeDetail> {
    const companyId = await this.authorization.requireCommercialIntakeAccess(
      actor,
      'read',
      true,
    );
    return this.loadDetail(actor, companyId, requestId, false);
  }

  // Pricing reuses this exact Commercial Intake read boundary. The captured
  // assignment and Request are held under share locks, while the Opportunity
  // row is only read. Client association is therefore ordered on the Request,
  // and unrelated next-action updates do not wait on a calculation.
  async requireReadablePricingOpportunity(
    actor: ActorContext,
    opportunityId: string,
  ): Promise<ReadablePricingOpportunity> {
    const companyId = await this.authorization.requireCommercialIntakeAccess(
      actor,
      'read',
      true,
    );
    if (!UUID_GRAMMAR.test(opportunityId)) throw new NotFoundException();
    const [target] = await this.databaseContext.connection
      .select({
        id: opportunities.id,
        clientRequestId: opportunities.clientRequestId,
        originalClientAccountId: clientRequests.clientAccountId,
      })
      .from(opportunities)
      .innerJoin(
        clientRequests,
        and(
          eq(clientRequests.workspaceId, opportunities.workspaceId),
          eq(clientRequests.companyId, opportunities.companyId),
          eq(clientRequests.id, opportunities.clientRequestId),
        ),
      )
      .where(
        and(
          eq(opportunities.workspaceId, actor.workspaceId),
          eq(opportunities.companyId, companyId),
          eq(opportunities.id, opportunityId.toLowerCase()),
        ),
      )
      .for('share', { of: clientRequests });
    if (!target) throw new NotFoundException();
    return target;
  }

  // Client remains the sole owner of union and visibility projection. Losing
  // Client authority hides this live block without hiding the snapshot.
  async readPricingClientProjection(
    actor: ActorContext,
    originalClientAccountId: string | null,
  ): Promise<CommercialClientProjection | undefined> {
    if (!originalClientAccountId || !canReadClients(actor)) return undefined;
    try {
      const reference = (
        await this.clients.readProjectReferences(
          actor,
          [originalClientAccountId],
          true,
        )
      ).get(originalClientAccountId);
      return reference
        ? clientReferenceView(originalClientAccountId, reference)
        : undefined;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        return undefined;
      throw error;
    }
  }

  async updateNextAction(
    actor: ActorContext,
    opportunityId: string,
    value: unknown,
    key: string | undefined,
  ): Promise<OpportunityNextActionUpdateResult> {
    await this.authorization.requireCommercialIntakeAccess(
      actor,
      'update-next-action',
    );
    const command = readUpdateOpportunityNextActionCommand(value);
    const idempotencyKey = requireIdempotencyKey(key);
    const fingerprint = nextActionFingerprint(opportunityId, command);
    return this.databaseContext.transaction(async () => {
      // Authority is re-read under a share lock so a concurrent revocation
      // or suspension commits either before this check or after this write.
      const companyId = await this.authorization.requireCommercialIntakeAccess(
        actor,
        'update-next-action',
        true,
      );
      await this.lockNextActionCommand(actor, companyId, idempotencyKey);
      const replay = await this.findNextActionCommand(
        actor,
        companyId,
        idempotencyKey,
      );
      if (replay) {
        if (replay.fingerprint !== fingerprint)
          throw new ConflictException({
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Idempotency-Key was already used for another update.',
          });
        // An exact retry resolves before its now-stale observed version
        // could be rejected: target visibility is rechecked, then the
        // recorded receipt returns without a second write or event.
        const current = await this.requireVisibleOpportunity(
          actor,
          companyId,
          opportunityId,
          false,
        );
        return {
          receipt: receiptView(replay),
          request: await this.loadDetail(
            actor,
            companyId,
            current.clientRequestId,
            false,
          ),
        };
      }

      const current = await this.requireVisibleOpportunity(
        actor,
        companyId,
        opportunityId,
        true,
      );
      if (current.version !== command.expectedVersion) throw staleVersion();
      if (current.nextAction === command.nextAction) {
        const receipt = await this.recordNextActionCommand({
          actor,
          companyId,
          opportunityId,
          idempotencyKey,
          fingerprint,
          command,
          outcome: 'unchanged',
          resultVersion: current.version,
        });
        return {
          receipt: receiptView(receipt),
          request: await this.loadDetail(
            actor,
            companyId,
            current.clientRequestId,
            false,
          ),
        };
      }
      // Refused before any write, so no Opportunity change, event or
      // receipt commits and the key stays unused.
      if (current.version >= MAXIMUM_OPPORTUNITY_VERSION)
        throw versionExhausted();

      const resultVersion = current.version + 1;
      const [updated] = await this.databaseContext.connection
        .update(opportunities)
        .set({
          nextAction: command.nextAction,
          version: resultVersion,
          lastUpdatedByInternalUserId: actor.internalUserId,
          lastUpdatedByWorkspaceMembershipId: actor.workspaceMembershipId,
          lastUpdatedAt: sql`now()`,
        })
        .where(
          and(
            eq(opportunities.workspaceId, actor.workspaceId),
            eq(opportunities.companyId, companyId),
            eq(opportunities.id, opportunityId),
            eq(opportunities.version, command.expectedVersion),
          ),
        )
        .returning();
      if (!updated) throw staleVersion();
      await this.accountability.recordOpportunityNextActionUpdated({
        actor,
        companyId,
        clientRequestId: updated.clientRequestId,
        opportunityId: updated.id,
        opportunityVersion: updated.version,
      });
      const receipt = await this.recordNextActionCommand({
        actor,
        companyId,
        opportunityId,
        idempotencyKey,
        fingerprint,
        command,
        outcome: 'updated',
        resultVersion,
      });
      return {
        receipt: receiptView(receipt),
        request: await this.loadDetail(
          actor,
          companyId,
          updated.clientRequestId,
          false,
        ),
      };
    });
  }

  async list(
    actor: ActorContext,
    limitInput: unknown,
    cursorInput: unknown,
  ): Promise<CommercialIntakeListPage> {
    const companyId = await this.authorization.requireCommercialIntakeAccess(
      actor,
      'read',
    );
    const limit = readCommercialIntakeLimit(limitInput);
    const cursor = readCommercialIntakeCursor(cursorInput);
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
    const clientProjections = await this.currentClientProjections(
      actor,
      pageRows.map(({ request }) => request.clientAccountId),
    );
    return {
      items: pageRows.map(
        ({
          request,
          opportunity,
          responsibleDisplayName,
        }): CommercialIntakeListItem => {
          const clientProjection = request.clientAccountId
            ? clientProjections.get(request.clientAccountId)
            : undefined;
          const item = {
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
          };
          return clientProjection ? { ...item, ...clientProjection } : item;
        },
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

  /**
   * Client resolves every linked row of one page in a single batched call to
   * its operational-reference projection. That owner decides whether a name
   * is readable and whether a current dossier exists after union, reversal and
   * the Company `client.read` condition.
   */
  private async currentClientProjections(
    actor: ActorContext,
    clientIds: ReadonlyArray<string | null>,
  ): Promise<ReadonlyMap<string, CommercialIntakeListClientProjection>> {
    const projections = new Map<string, CommercialIntakeListClientProjection>();
    const linkedClientIds = clientIds.filter((clientId) => clientId !== null);
    if (linkedClientIds.length === 0 || !canReadClients(actor))
      return projections;
    const references = await this.clients.readProjectReferences(
      actor,
      linkedClientIds,
    );
    for (const [clientId, reference] of references)
      projections.set(clientId, {
        clientDisplayName: reference.displayName,
        ...(reference.clientDossierId
          ? { clientDossierId: reference.clientDossierId }
          : {}),
      });
    return projections;
  }

  private async loadDetail(
    actor: ActorContext,
    companyId: string,
    requestId: string,
    requireClientVisibility: boolean,
  ): Promise<CommercialIntakeDetail> {
    const [row] = await this.databaseContext.connection
      .select({
        request: clientRequests,
        opportunity: opportunities,
        responsibleDisplayName: internalUsers.displayName,
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
      // The same actor projection as the list, so one initial Opportunity
      // never shows two identities.
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, opportunities.responsibleInternalUserId),
      )
      .where(
        and(
          eq(clientRequests.workspaceId, actor.workspaceId),
          eq(clientRequests.companyId, companyId),
          eq(clientRequests.id, requestId),
        ),
      );
    if (!row) throw new NotFoundException();
    const view = (
      client?: NonNullable<CommercialIntakeDetail['clientReference']>,
    ): CommercialIntakeDetail =>
      detailView({
        request: row.request,
        opportunity: row.opportunity,
        responsibleDisplayName: row.responsibleDisplayName,
        ...(client ? { client } : {}),
      });
    if (!row.request.clientAccountId) return view();
    if (!canReadClients(actor)) {
      if (requireClientVisibility) throw clientUnavailable();
      return view();
    }
    let reference;
    try {
      reference = (
        await this.clients.readProjectReferences(
          actor,
          [row.request.clientAccountId],
          requireClientVisibility,
        )
      ).get(row.request.clientAccountId);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        if (requireClientVisibility) throw clientUnavailable();
        return view();
      }
      throw error;
    }
    if (!reference) {
      if (requireClientVisibility) throw clientUnavailable();
      return view();
    }
    return view(clientReferenceView(row.request.clientAccountId, reference));
  }

  private async recordClientReference(actor: ActorContext, clientId: string) {
    try {
      await this.clients.recordReferenceUse(actor, clientId);
      const reference = (
        await this.clients.readProjectReferences(actor, [clientId])
      ).get(clientId);
      if (!reference) throw clientUnavailable();
      return clientReferenceView(clientId, reference);
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

  // The same safe not-found response as Request detail: an unknown,
  // cross-Company or cross-Workspace Opportunity is indistinguishable.
  private async requireVisibleOpportunity(
    actor: ActorContext,
    companyId: string,
    opportunityId: string,
    lock: boolean,
  ): Promise<OpportunityRow> {
    const query = this.databaseContext.connection
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, actor.workspaceId),
          eq(opportunities.companyId, companyId),
          eq(opportunities.id, opportunityId),
        ),
      );
    const [opportunity] = lock ? await query.for('update') : await query;
    if (!opportunity) throw new NotFoundException();
    return opportunity;
  }

  private async recordNextActionCommand(input: {
    actor: ActorContext;
    companyId: string;
    opportunityId: string;
    idempotencyKey: string;
    fingerprint: string;
    command: UpdateOpportunityNextActionCommand;
    outcome: NextActionCommandRow['outcome'];
    resultVersion: number;
  }): Promise<NextActionCommandRow> {
    const [receipt] = await this.databaseContext.connection
      .insert(commercialIntakeNextActionCommands)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        idempotencyKey: input.idempotencyKey,
        fingerprint: input.fingerprint,
        opportunityId: input.opportunityId,
        expectedVersion: input.command.expectedVersion,
        resultVersion: input.resultVersion,
        outcome: input.outcome,
        nextAction: input.command.nextAction,
      })
      .returning();
    if (!receipt) throw new Error('The next-action command was not recorded.');
    return receipt;
  }

  private async lockNextActionCommand(
    actor: ActorContext,
    companyId: string,
    idempotencyKey: string,
  ): Promise<void> {
    const lockKey = JSON.stringify([
      'commercial-intake.update-next-action',
      actor.workspaceId,
      companyId,
      actor.workspaceMembershipId,
      idempotencyKey,
    ]);
    await this.databaseContext.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
  }

  private async findNextActionCommand(
    actor: ActorContext,
    companyId: string,
    idempotencyKey: string,
  ): Promise<NextActionCommandRow | undefined> {
    const [command] = await this.databaseContext.connection
      .select()
      .from(commercialIntakeNextActionCommands)
      .where(
        and(
          eq(commercialIntakeNextActionCommands.workspaceId, actor.workspaceId),
          eq(commercialIntakeNextActionCommands.companyId, companyId),
          eq(
            commercialIntakeNextActionCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(commercialIntakeNextActionCommands.idempotencyKey, idempotencyKey),
        ),
      );
    return command;
  }
}

function nextActionFingerprint(
  opportunityId: string,
  command: UpdateOpportunityNextActionCommand,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        opportunityId,
        expectedVersion: command.expectedVersion,
        nextAction: command.nextAction,
      }),
    )
    .digest('hex');
}

function receiptView(
  command: NextActionCommandRow,
): OpportunityNextActionUpdateResult['receipt'] {
  return {
    opportunityId: command.opportunityId,
    nextAction: command.nextAction,
    version: command.resultVersion,
    outcome: command.outcome,
  };
}

function staleVersion(): ConflictException {
  return new ConflictException({
    code: 'STALE_VERSION',
    message: 'Reload the Request before retrying.',
  });
}

function versionExhausted(): ConflictException {
  return new ConflictException({
    code: 'VERSION_EXHAUSTED',
    message: 'The Opportunity version cannot be incremented.',
  });
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

function detailView({
  request,
  opportunity,
  responsibleDisplayName,
  client,
}: {
  request: ClientRequestRow;
  opportunity: OpportunityRow;
  responsibleDisplayName: string;
  client?: NonNullable<CommercialIntakeDetail['clientReference']>;
}): CommercialIntakeDetail {
  if (
    (request.version !== 1 && request.version !== 2) ||
    (request.version === 2 && !request.clientAccountId) ||
    opportunity.version < 1
  )
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
    clientAssociationStatus: request.clientAccountId
      ? client
        ? 'visible'
        : 'hidden'
      : 'absent',
    ...(request.clientAccountId && client
      ? {
          clientReference: client,
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
      responsibleActor: {
        workspaceMembershipId: opportunity.responsibleWorkspaceMembershipId,
        displayName: responsibleDisplayName,
      },
      createdAt: opportunity.createdAt.toISOString(),
      version: opportunity.version,
    },
  };
}

function clientReferenceView(
  originalClientId: string,
  reference: { displayName: string; clientDossierId?: string },
): NonNullable<CommercialIntakeDetail['clientReference']> {
  return {
    originalClientId,
    ...(reference.clientDossierId
      ? { currentClientId: reference.clientDossierId }
      : {}),
    displayName: reference.displayName,
  };
}

// The Client owner's operational-reference read condition. It only decides
// whether that owner is asked; the owner decides what a reader may see.
function canReadClients(actor: ActorContext): boolean {
  return (
    actor.workspacePermissions.includes('client.manage') ||
    actor.activeCompany?.clientPermissions.includes('client.read') === true
  );
}

function clientUnavailable(): NotFoundException {
  return new NotFoundException({
    code: 'CLIENT_REFERENCE_UNAVAILABLE',
    message: 'Refresh Client search before retrying.',
  });
}
