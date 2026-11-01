import { runClientReferenceTransaction } from '../client/client-reference-transaction.js';
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, lt, lte, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CommercialResponsibleAccessService } from '../access/commercial-responsible-access.service.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { memberDisplayLabel } from '../access/member-authority.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import {
  idempotencyConflict,
  runIdempotentCommand,
  staleVersionConflict,
} from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientRequests,
  commercialIntakeCommands,
  commercialIntakeNextActionCommands,
  commercialIntakeOutcomeCommands,
  commercialIntakeResponsibleCommands,
  commercialIntakeStageCommands,
  internalUsers,
  opportunities,
  opportunityOutcomeHistory,
  opportunityStageHistory,
  salesStages,
} from '../database/schema/index.js';
import { SalesStageService } from '../sales-stage/sales-stage.service.js';
import {
  commercialIntakeCursor,
  opportunityHistoryCursor,
  readCommercialIntakeCursor,
  readCommercialIntakeLimit,
  readCommercialIntakeScope,
  readOpportunityHistoryCursor,
} from './commercial-intake-pagination.js';
import type {
  ChangeOpportunityResponsibleCommand,
  CommercialIntakeDetail,
  CommercialIntakeListClientProjection,
  CommercialIntakeListItem,
  CommercialIntakeListPage,
  CreateCommercialIntakeCommand,
  OpportunityNextActionUpdateResult,
  OpportunityOutcomeChangeResult,
  OpportunityOutcomeHistoryEntry,
  OpportunityOutcomeHistoryPage,
  OpportunityResponsibleCandidatePage,
  OpportunityResponsibleChangeResult,
  OpportunitySalesStage,
  OpportunityStageChangeResult,
  OpportunityStageHistoryEntry,
  OpportunityStageHistoryPage,
  ReadablePricingOpportunity,
  ReadableOfferOpportunity,
  CommercialClientProjection,
  SetOpportunityStageCommand,
  UpdateOpportunityNextActionCommand,
} from './commercial-intake.types.js';
import {
  MAXIMUM_OPPORTUNITY_VERSION,
  readChangeOpportunityOutcomeCommand,
  readChangeOpportunityResponsibleCommand,
  readCreateCommercialIntakeCommand,
  readSetOpportunityStageCommand,
  readUpdateOpportunityNextActionCommand,
} from './commercial-intake.validation.js';
import {
  nextActionFingerprint,
  opportunityCommandLockParts,
  outcomeFingerprint,
  responsibleFingerprint,
  stageFingerprint,
} from './opportunity-command.js';
import { resolveOutcomeTransition } from './opportunity-outcome.js';

type ClientRequestRow = typeof clientRequests.$inferSelect;
type OpportunityRow = typeof opportunities.$inferSelect;
type NextActionCommandRow =
  typeof commercialIntakeNextActionCommands.$inferSelect;
type ResponsibleCommandRow =
  typeof commercialIntakeResponsibleCommands.$inferSelect;
type OutcomeCommandRow = typeof commercialIntakeOutcomeCommands.$inferSelect;
type OutcomeHistoryRow = typeof opportunityOutcomeHistory.$inferSelect;
type StageCommandRow = typeof commercialIntakeStageCommands.$inferSelect;
type StageHistoryRow = typeof opportunityStageHistory.$inferSelect;
type HistoryBound =
  | { kind: 'through'; version: number }
  | { kind: 'before'; version: number }
  | undefined;

// Sections 23.6 and 24.5: the Request detail and each older page of an
// Opportunity history carry at most 50 entries.
const HISTORY_PAGE_SIZE = 50;

const UUID_GRAMMAR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class CommercialIntakeService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly clients: ClientOperationalReferenceService,
    private readonly accountability: AccountabilityService,
    private readonly responsibleAccess: CommercialResponsibleAccessService,
    private readonly salesStages: SalesStageService,
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
    return runClientReferenceTransaction({
      database: this.databaseContext,
      work: async () => {
        const companyId =
          await this.authorization.requireCommercialIntakeAccess(
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
          outcomeHistory: { entries: [] },
          salesStage: null,
          stageHistory: { entries: [] },
          client: clientReference,
        });
      },
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

  /**
   * Offer's public Commercial Intake seam. It proves current Opportunity read,
   * keeps cross-scope targets indistinguishable, and optionally serializes
   * Create Offer on the Opportunity row.
   */
  async requireReadableOfferOpportunity(
    actor: ActorContext,
    opportunityId: string,
    lock: boolean,
  ): Promise<ReadableOfferOpportunity> {
    const companyId = await this.authorization.requireCommercialIntakeAccess(
      actor,
      'read',
      lock,
    );
    if (!UUID_GRAMMAR.test(opportunityId)) throw new NotFoundException();
    const query = this.databaseContext.connection
      .select({
        id: opportunities.id,
        clientRequestId: opportunities.clientRequestId,
        originalClientAccountId: clientRequests.clientAccountId,
        status: opportunities.status,
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
      );
    // Request owns association ordering. Take its lock before Opportunity so
    // an association holding Request and waiting on Client can record its
    // Opportunity-linked event without an Offer holding that Opportunity.
    const [target] = lock
      ? await query.for('update', { of: clientRequests })
      : await query;
    if (!target) throw new NotFoundException();
    if (lock) {
      // The joined read above may have waited on the Request while an
      // outcome change committed; its Opportunity columns then come from the
      // earlier snapshot. Re-read the status with the Opportunity lock so a
      // creation queued behind a closure sees the closed status.
      const [lockedOpportunity] = await this.databaseContext.connection
        .select({ id: opportunities.id, status: opportunities.status })
        .from(opportunities)
        .where(
          and(
            eq(opportunities.workspaceId, actor.workspaceId),
            eq(opportunities.companyId, companyId),
            eq(opportunities.id, target.id),
            eq(opportunities.clientRequestId, target.clientRequestId),
          ),
        )
        .for('update');
      if (!lockedOpportunity) throw new NotFoundException();
      return { ...target, status: lockedOpportunity.status };
    }
    return target;
  }

  /** Bounded labels for already scoped estimate Versions; never a Client read. */
  async readProfitabilityOpportunityTitles(
    actor: ActorContext,
    opportunityIds: readonly string[],
  ) {
    const companyId = await this.authorization.requireCommercialIntakeAccess(
      actor,
      'read',
    );
    if (opportunityIds.length > 26) throw new BadRequestException();
    if (opportunityIds.length === 0) return new Map<string, string>();
    const rows = await this.databaseContext.connection
      .select({ id: opportunities.id, title: opportunities.title })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, actor.workspaceId),
          eq(opportunities.companyId, companyId),
          inArray(opportunities.id, [...opportunityIds]),
        ),
      );
    return new Map(rows.map((row) => [row.id, row.title]));
  }

  /** Profitability commands and reads retain the owner row and live read grant
   * until their transaction ends, including receipt replay. */
  async requireReadableProfitabilityOpportunity(
    actor: ActorContext,
    opportunityId: string,
  ): Promise<ReadableOfferOpportunity> {
    return this.requireReadableOfferOpportunity(actor, opportunityId, true);
  }

  /** Only live native target readability precedes a past date receipt. */
  async requireFollowUpTarget(actor: ActorContext, opportunityId: string) {
    const companyId = await this.authorization.requireCommercialIntakeAccess(
      actor,
      'read',
    );
    if (!UUID_GRAMMAR.test(opportunityId)) throw new NotFoundException();
    const opportunity = await this.requireVisibleOpportunity(
      actor,
      companyId,
      opportunityId,
      false,
    );
    return {
      id: opportunity.id,
      requestId: opportunity.clientRequestId,
      companyId,
    };
  }

  /** Native participant for the independent date owner: no Client new use. */
  async requireFollowUpOpportunity(
    actor: ActorContext,
    opportunityId: string,
    lock: boolean,
  ) {
    const companyId = await this.authorization.requireCommercialIntakeAccess(
      actor,
      'read',
      lock,
    );
    if (!UUID_GRAMMAR.test(opportunityId)) throw new NotFoundException();
    const opportunity = lock
      ? await this.lockRequestThenOpportunity(actor, companyId, opportunityId)
      : await this.requireVisibleOpportunity(
          actor,
          companyId,
          opportunityId,
          false,
        );
    const result = await this.databaseContext.connection.execute<{
      epoch: string;
    }>(
      sql`SELECT commercial_follow_up_epoch(${actor.workspaceId}::uuid,${companyId}::uuid,${opportunity.id}::uuid) AS epoch`,
    );
    const epoch = result.rows[0]?.epoch;
    if (typeof epoch !== 'string')
      throw new Error('Native Opportunity outcome evidence is unavailable.');
    return {
      id: opportunity.id,
      requestId: opportunity.clientRequestId,
      companyId,
      status: opportunity.status,
      version: opportunity.version,
      outcomeEpoch: epoch,
    };
  }

  /** Public optional Client projections for a bounded already authorized discovery. */
  async followUpClientProjections(
    actor: ActorContext,
    targets: readonly { opportunityId: string; requestId: string }[],
  ) {
    if (targets.length > 25) throw new BadRequestException();
    const result = new Map<string, CommercialIntakeListClientProjection>();
    for (const target of targets) {
      const detail = await this.read(actor, target.requestId);
      if (detail.initialOpportunity.id !== target.opportunityId)
        throw new NotFoundException();
      result.set(
        target.opportunityId,
        detail.clientReference
          ? {
              clientDisplayName: detail.clientReference.displayName,
              ...(detail.clientReference.currentClientId
                ? { clientDossierId: detail.clientReference.currentClientId }
                : {}),
            }
          : {},
      );
    }
    return result;
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
    return runIdempotentCommand(this.databaseContext, {
      fingerprint,
      authorize: () =>
        this.authorization.requireCommercialIntakeAccess(
          actor,
          'update-next-action',
          true,
        ),
      lockParts: (companyId) =>
        opportunityCommandLockParts({
          command: 'commercial-intake.update-next-action',
          actor,
          companyId,
          idempotencyKey,
        }),
      findReceipt: (companyId) =>
        this.findNextActionCommand(actor, companyId, idempotencyKey),
      conflict: () =>
        idempotencyConflict(
          'Idempotency-Key was already used for another update.',
        ),
      replay: (companyId, receipt) =>
        this.replayOpportunityReceipt(
          actor,
          companyId,
          opportunityId,
          receiptView(receipt),
        ),
      execute: async (companyId) => {
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
      },
    });
  }

  /**
   * Replaces the responsible actor of one Company-owned Opportunity with an
   * eligible member of the same Company. It shares the Opportunity version with
   * the next-action update and changes nothing else about the Opportunity, its
   * Request or its Client association.
   */
  async changeResponsible(
    actor: ActorContext,
    opportunityId: string,
    value: unknown,
    key: string | undefined,
  ): Promise<OpportunityResponsibleChangeResult> {
    await this.authorization.requireOpportunityAssign(actor);
    const command = readChangeOpportunityResponsibleCommand(value);
    const idempotencyKey = requireIdempotencyKey(key);
    const fingerprint = responsibleFingerprint(opportunityId, command);
    return runIdempotentCommand(this.databaseContext, {
      fingerprint,
      authorize: () => this.authorization.requireOpportunityAssign(actor, true),
      lockParts: (companyId) =>
        opportunityCommandLockParts({
          command: 'commercial-intake.change-responsible',
          actor,
          companyId,
          idempotencyKey,
        }),
      findReceipt: (companyId) =>
        this.findResponsibleCommand(actor, companyId, idempotencyKey),
      conflict: () =>
        idempotencyConflict(
          'Idempotency-Key was already used for another responsible actor change.',
        ),
      replay: (companyId, receipt) =>
        this.replayOpportunityReceipt(
          actor,
          companyId,
          opportunityId,
          responsibleReceiptView(receipt),
        ),
      execute: async (companyId) => {
        const current = await this.requireVisibleOpportunity(
          actor,
          companyId,
          opportunityId,
          true,
        );
        if (current.version !== command.expectedVersion) throw staleVersion();
        const receipt = {
          actor,
          companyId,
          opportunityId,
          idempotencyKey,
          fingerprint,
          command,
        };
        // Naming the current responsible actor is a no-op that needs no
        // eligibility check: nothing changes, so nothing is granted either.
        if (
          current.responsibleWorkspaceMembershipId ===
          command.workspaceMembershipId
        )
          return {
            receipt: responsibleReceiptView(
              await this.recordResponsibleCommand({
                ...receipt,
                outcome: 'unchanged',
                resultVersion: current.version,
              }),
            ),
            request: await this.loadDetail(
              actor,
              companyId,
              current.clientRequestId,
              false,
            ),
          };
        // Refused before any write, so no Opportunity change, event or
        // receipt commits and the key stays unused.
        if (current.version >= MAXIMUM_OPPORTUNITY_VERSION)
          throw versionExhausted();
        const after = await this.responsibleAccess.requireEligibleMember(
          actor,
          companyId,
          command.workspaceMembershipId,
        );
        const before = {
          workspaceMembershipId: current.responsibleWorkspaceMembershipId,
          displayLabel: await this.responsibleAccess.recordedLabel(
            actor,
            current.responsibleWorkspaceMembershipId,
          ),
        };

        const resultVersion = current.version + 1;
        const [updated] = await this.databaseContext.connection
          .update(opportunities)
          .set({
            responsibleInternalUserId: after.internalUserId,
            responsibleWorkspaceMembershipId: after.workspaceMembershipId,
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
        await this.accountability.recordOpportunityResponsibleChanged({
          actor,
          companyId,
          clientRequestId: updated.clientRequestId,
          opportunityId: updated.id,
          opportunityVersion: updated.version,
          before,
          after: {
            workspaceMembershipId: after.workspaceMembershipId,
            displayLabel: after.displayLabel,
          },
        });
        return {
          receipt: responsibleReceiptView(
            await this.recordResponsibleCommand({
              ...receipt,
              outcome: 'updated',
              resultVersion,
            }),
          ),
          request: await this.loadDetail(
            actor,
            companyId,
            updated.clientRequestId,
            false,
          ),
        };
      },
    });
  }

  /**
   * Changes the outcome status of one Company-owned Opportunity through one
   * section 23.2 transition. It shares the Opportunity version with the
   * next-action update and the reassignment, records one history entry, one
   * receipt and one event, and changes nothing else about the Opportunity,
   * its Request or its Client association.
   */
  async changeOutcome(
    actor: ActorContext,
    opportunityId: string,
    value: unknown,
    key: string | undefined,
  ): Promise<OpportunityOutcomeChangeResult> {
    await this.authorization.requireOpportunityOutcomeChange(actor);
    const command = readChangeOpportunityOutcomeCommand(value);
    const idempotencyKey = requireIdempotencyKey(key);
    const fingerprint = outcomeFingerprint(opportunityId, command);
    return runIdempotentCommand(this.databaseContext, {
      fingerprint,
      authorize: () =>
        this.authorization.requireOpportunityOutcomeChange(actor, true),
      lockParts: (companyId) =>
        opportunityCommandLockParts({
          command: 'commercial-intake.change-outcome',
          actor,
          companyId,
          idempotencyKey,
        }),
      findReceipt: (companyId) =>
        this.findOutcomeCommand(actor, companyId, idempotencyKey),
      conflict: () =>
        idempotencyConflict(
          'Idempotency-Key was already used for another outcome status change.',
        ),
      // A replay also resolves before its now-current status could be
      // rejected as a disallowed transition.
      replay: (companyId, receipt) =>
        this.replayOpportunityReceipt(
          actor,
          companyId,
          opportunityId,
          outcomeReceiptView(receipt),
        ),
      execute: async (companyId) => {
        const current = await this.lockRequestThenOpportunity(
          actor,
          companyId,
          opportunityId,
        );
        if (current.version !== command.expectedVersion) throw staleVersion();
        const resolution = resolveOutcomeTransition(
          current.status,
          command.change,
        );
        if (resolution.kind === 'not-allowed')
          throw new ConflictException({
            code: 'OUTCOME_TRANSITION_NOT_ALLOWED',
            message:
              'This status change is not allowed from the current status. Reload the Request.',
          });
        if (resolution.kind === 'invalid-field')
          throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            field: resolution.field,
            message: resolution.message,
          });
        // Refused before any write, so no Opportunity change, history entry,
        // event or receipt commits and the key stays unused.
        if (current.version >= MAXIMUM_OPPORTUNITY_VERSION)
          throw versionExhausted();

        const { recorded } = resolution;
        const resultVersion = current.version + 1;
        const [updated] = await this.databaseContext.connection
          .update(opportunities)
          .set({
            status: recorded.newStatus,
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
        await this.databaseContext.connection
          .insert(opportunityOutcomeHistory)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            opportunityId: updated.id,
            opportunityVersion: updated.version,
            previousStatus: recorded.previousStatus,
            newStatus: recorded.newStatus,
            lossReasonCode: recorded.lossReasonCode,
            reason: recorded.reason,
            note: recorded.note,
            actorInternalUserId: actor.internalUserId,
            actorWorkspaceMembershipId: actor.workspaceMembershipId,
            actorDisplayLabel: memberDisplayLabel(
              actor.displayName,
              actor.workspaceMembershipId,
            ),
          });
        await this.accountability.recordOpportunityOutcomeChanged({
          actor,
          companyId,
          clientRequestId: updated.clientRequestId,
          opportunityId: updated.id,
          opportunityVersion: updated.version,
          previousStatus: recorded.previousStatus,
          newStatus: recorded.newStatus,
          lossReasonCode: recorded.lossReasonCode,
        });
        const [receipt] = await this.databaseContext.connection
          .insert(commercialIntakeOutcomeCommands)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            actorWorkspaceMembershipId: actor.workspaceMembershipId,
            idempotencyKey,
            fingerprint,
            opportunityId: updated.id,
            expectedVersion: command.expectedVersion,
            resultVersion,
            previousStatus: recorded.previousStatus,
            newStatus: recorded.newStatus,
          })
          .returning();
        if (!receipt)
          throw new Error('The outcome status command was not recorded.');
        return {
          receipt: outcomeReceiptView(receipt),
          request: await this.loadDetail(
            actor,
            companyId,
            updated.clientRequestId,
            false,
          ),
        };
      },
    });
  }

  /**
   * One older page of a visible Opportunity's outcome history, newest first.
   * Commercial Intake read is the only authority required.
   */
  async outcomeHistory(
    actor: ActorContext,
    opportunityId: string,
    cursorInput: unknown,
  ): Promise<OpportunityOutcomeHistoryPage> {
    const companyId = await this.authorization.requireCommercialIntakeAccess(
      actor,
      'read',
    );
    const beforeVersion = readOpportunityHistoryCursor(cursorInput);
    return this.databaseContext.transaction(
      async () => {
        await this.requireVisibleOpportunity(
          actor,
          companyId,
          opportunityId,
          false,
        );
        return this.outcomeHistoryPage(
          actor,
          companyId,
          opportunityId,
          beforeVersion === undefined
            ? undefined
            : { kind: 'before', version: beforeVersion },
        );
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /**
   * Assigns one `ACTIVE` Sales Stage of the Opportunity's Company, or clears
   * the stage (section 24.4). It shares the Opportunity version with the
   * next action, the reassignment and the outcome status, is accepted in
   * every outcome status, records one history entry, one receipt and one
   * event, and changes nothing else about the Opportunity or its Request.
   */
  async setStage(
    actor: ActorContext,
    opportunityId: string,
    value: unknown,
    key: string | undefined,
  ): Promise<OpportunityStageChangeResult> {
    await this.authorization.requireCommercialIntakeAccess(actor, 'set-stage');
    const command = readSetOpportunityStageCommand(value);
    const idempotencyKey = requireIdempotencyKey(key);
    const fingerprint = stageFingerprint(opportunityId, command);
    return runIdempotentCommand(this.databaseContext, {
      fingerprint,
      authorize: () =>
        this.authorization.requireCommercialIntakeAccess(
          actor,
          'set-stage',
          true,
        ),
      lockParts: (companyId) =>
        opportunityCommandLockParts({
          command: 'commercial-intake.set-stage',
          actor,
          companyId,
          idempotencyKey,
        }),
      findReceipt: (companyId) =>
        this.findStageCommand(actor, companyId, idempotencyKey),
      conflict: () =>
        idempotencyConflict(
          'Idempotency-Key was already used for another Sales Stage change.',
        ),
      replay: (companyId, receipt) =>
        this.replayOpportunityReceipt(
          actor,
          companyId,
          opportunityId,
          stageReceiptView(receipt),
        ),
      execute: async (companyId) => {
        const current = await this.requireVisibleOpportunity(
          actor,
          companyId,
          opportunityId,
          true,
        );
        if (current.version !== command.expectedVersion) throw staleVersion();
        const receipt = {
          actor,
          companyId,
          opportunityId,
          idempotencyKey,
          fingerprint,
          command,
        };
        // Submitting the current stage, or null without a stage, changes
        // nothing: an unchanged receipt and no event.
        if (current.salesStageId === command.salesStageId)
          return {
            receipt: stageReceiptView(
              await this.recordStageCommand({
                ...receipt,
                outcome: 'unchanged',
                resultVersion: current.version,
              }),
            ),
            request: await this.loadDetail(
              actor,
              companyId,
              current.clientRequestId,
              false,
            ),
          };
        // Refused before any write, so no Opportunity change, history entry,
        // event or receipt commits and the key stays unused.
        if (current.version >= MAXIMUM_OPPORTUNITY_VERSION)
          throw versionExhausted();
        const newStage =
          command.salesStageId === null
            ? null
            : await this.salesStages.lockAssignableStage({
                workspaceId: actor.workspaceId,
                companyId,
                salesStageId: command.salesStageId,
              });
        if (newStage === undefined)
          throw new ConflictException({
            code: 'SALES_STAGE_UNAVAILABLE',
            message:
              'This Sales Stage cannot be assigned. Reload the Request and choose another stage.',
          });
        const previousStage =
          current.salesStageId === null
            ? null
            : {
                id: current.salesStageId,
                label: await this.salesStages.currentLabel({
                  workspaceId: actor.workspaceId,
                  companyId,
                  salesStageId: current.salesStageId,
                }),
              };

        const resultVersion = current.version + 1;
        const [updated] = await this.databaseContext.connection
          .update(opportunities)
          .set({
            salesStageId: newStage?.id ?? null,
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
        await this.databaseContext.connection
          .insert(opportunityStageHistory)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            opportunityId: updated.id,
            opportunityVersion: updated.version,
            previousSalesStageId: previousStage?.id ?? null,
            previousLabel: previousStage?.label ?? null,
            newSalesStageId: newStage?.id ?? null,
            newLabel: newStage?.label ?? null,
            actorInternalUserId: actor.internalUserId,
            actorWorkspaceMembershipId: actor.workspaceMembershipId,
            actorDisplayLabel: memberDisplayLabel(
              actor.displayName,
              actor.workspaceMembershipId,
            ),
          });
        await this.accountability.recordOpportunityStageChanged({
          actor,
          companyId,
          clientRequestId: updated.clientRequestId,
          opportunityId: updated.id,
          opportunityVersion: updated.version,
          previousStage: previousStage && {
            salesStageId: previousStage.id,
            label: previousStage.label,
          },
          newStage: newStage && {
            salesStageId: newStage.id,
            label: newStage.label,
          },
        });
        return {
          receipt: stageReceiptView(
            await this.recordStageCommand({
              ...receipt,
              outcome: 'updated',
              resultVersion,
            }),
          ),
          request: await this.loadDetail(
            actor,
            companyId,
            updated.clientRequestId,
            false,
          ),
        };
      },
    });
  }

  /**
   * One older page of a visible Opportunity's Sales Stage history, newest
   * first. Commercial Intake read is the only authority required.
   */
  async stageHistory(
    actor: ActorContext,
    opportunityId: string,
    cursorInput: unknown,
  ): Promise<OpportunityStageHistoryPage> {
    const companyId = await this.authorization.requireCommercialIntakeAccess(
      actor,
      'read',
    );
    const beforeVersion = readOpportunityHistoryCursor(cursorInput);
    return this.databaseContext.transaction(
      async () => {
        await this.requireVisibleOpportunity(
          actor,
          companyId,
          opportunityId,
          false,
        );
        return this.stageHistoryPage(
          actor,
          companyId,
          opportunityId,
          beforeVersion === undefined
            ? undefined
            : { kind: 'before', version: beforeVersion },
        );
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /**
   * The members who may become responsible for one visible Opportunity. The
   * same authority as the command is required; Access owns eligibility.
   */
  async eligibleResponsibleActors(
    actor: ActorContext,
    opportunityId: string,
  ): Promise<OpportunityResponsibleCandidatePage> {
    return this.databaseContext.transaction(
      async () => {
        const companyId =
          await this.authorization.requireOpportunityAssign(actor);
        await this.requireVisibleOpportunity(
          actor,
          companyId,
          opportunityId,
          false,
        );
        return {
          members: await this.responsibleAccess.eligibleMembers(
            actor,
            companyId,
          ),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async list(
    actor: ActorContext,
    query: {
      readonly limit: unknown;
      readonly cursor: unknown;
      readonly viewQuery: unknown;
    },
  ): Promise<CommercialIntakeListPage> {
    return this.databaseContext.transaction(() => this.listPage(actor, query), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    });
  }

  private async listPage(
    actor: ActorContext,
    query: Parameters<CommercialIntakeService['list']>[1],
  ): Promise<CommercialIntakeListPage> {
    const companyId = await this.authorization.requireCommercialIntakeAccess(
      actor,
      'read',
    );
    const limit = readCommercialIntakeLimit(query.limit);
    const cursor = readCommercialIntakeCursor(query.cursor);
    const scope = readCommercialIntakeScope(query.viewQuery);
    const clientIds =
      scope.kind === 'client'
        ? await this.clients.readDossierOriginalReferenceIds(
            actor,
            scope.clientDossierId,
          )
        : undefined;
    const rows = await this.databaseContext.connection
      .select({
        request: clientRequests,
        opportunity: opportunities,
        responsibleDisplayName: internalUsers.displayName,
        salesStageLabel: salesStages.label,
        salesStageState: salesStages.state,
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
      .leftJoin(salesStages, assignedSalesStage())
      .where(
        and(
          eq(clientRequests.workspaceId, actor.workspaceId),
          eq(clientRequests.companyId, companyId),
          clientIds
            ? inArray(clientRequests.clientAccountId, [...clientIds])
            : undefined,
          scope.kind === 'mine_open'
            ? and(
                eq(
                  opportunities.responsibleWorkspaceMembershipId,
                  actor.workspaceMembershipId,
                ),
                inArray(opportunities.status, ['OPEN', 'ON_HOLD']),
              )
            : undefined,
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
          salesStageLabel,
          salesStageState,
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
              status: opportunity.status,
              salesStage: salesStageView(
                opportunity.salesStageId,
                salesStageLabel,
                salesStageState,
              ),
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
        salesStageLabel: salesStages.label,
        salesStageState: salesStages.state,
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
      .leftJoin(salesStages, assignedSalesStage())
      .where(
        and(
          eq(clientRequests.workspaceId, actor.workspaceId),
          eq(clientRequests.companyId, companyId),
          eq(clientRequests.id, requestId),
        ),
      );
    if (!row) throw new NotFoundException();
    // Bound history to the Opportunity version just read: under READ
    // COMMITTED a transition committing between the two queries would
    // otherwise pair the old status with its new history entry.
    const readVersion = {
      kind: 'through',
      version: row.opportunity.version,
    } as const;
    const outcomeHistory = await this.outcomeHistoryPage(
      actor,
      companyId,
      row.opportunity.id,
      readVersion,
    );
    const stageHistory = await this.stageHistoryPage(
      actor,
      companyId,
      row.opportunity.id,
      readVersion,
    );
    const view = (
      client?: NonNullable<CommercialIntakeDetail['clientReference']>,
    ): CommercialIntakeDetail =>
      detailView({
        request: row.request,
        opportunity: row.opportunity,
        responsibleDisplayName: row.responsibleDisplayName,
        outcomeHistory,
        salesStage: salesStageView(
          row.opportunity.salesStageId,
          row.salesStageLabel,
          row.salesStageState,
        ),
        stageHistory,
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

  private async outcomeHistoryPage(
    actor: ActorContext,
    companyId: string,
    opportunityId: string,
    bound: HistoryBound,
  ): Promise<OpportunityOutcomeHistoryPage> {
    const rows = await this.databaseContext.connection
      .select()
      .from(opportunityOutcomeHistory)
      .where(
        and(
          eq(opportunityOutcomeHistory.workspaceId, actor.workspaceId),
          eq(opportunityOutcomeHistory.companyId, companyId),
          eq(opportunityOutcomeHistory.opportunityId, opportunityId),
          bound === undefined
            ? undefined
            : bound.kind === 'through'
              ? lte(opportunityOutcomeHistory.opportunityVersion, bound.version)
              : lt(opportunityOutcomeHistory.opportunityVersion, bound.version),
        ),
      )
      .orderBy(desc(opportunityOutcomeHistory.opportunityVersion))
      .limit(HISTORY_PAGE_SIZE + 1);
    const entries = rows.slice(0, HISTORY_PAGE_SIZE);
    const last = entries.at(-1);
    return {
      entries: entries.map(outcomeHistoryEntryView),
      ...(rows.length > HISTORY_PAGE_SIZE && last
        ? { nextCursor: opportunityHistoryCursor(last.opportunityVersion) }
        : {}),
    };
  }

  private async stageHistoryPage(
    actor: ActorContext,
    companyId: string,
    opportunityId: string,
    bound: HistoryBound,
  ): Promise<OpportunityStageHistoryPage> {
    const rows = await this.databaseContext.connection
      .select()
      .from(opportunityStageHistory)
      .where(
        and(
          eq(opportunityStageHistory.workspaceId, actor.workspaceId),
          eq(opportunityStageHistory.companyId, companyId),
          eq(opportunityStageHistory.opportunityId, opportunityId),
          bound === undefined
            ? undefined
            : bound.kind === 'through'
              ? lte(opportunityStageHistory.opportunityVersion, bound.version)
              : lt(opportunityStageHistory.opportunityVersion, bound.version),
        ),
      )
      .orderBy(desc(opportunityStageHistory.opportunityVersion))
      .limit(HISTORY_PAGE_SIZE + 1);
    const entries = rows.slice(0, HISTORY_PAGE_SIZE);
    const last = entries.at(-1);
    return {
      entries: entries.map(stageHistoryEntryView),
      ...(rows.length > HISTORY_PAGE_SIZE && last
        ? { nextCursor: opportunityHistoryCursor(last.opportunityVersion) }
        : {}),
    };
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

  /**
   * Outcome changes lock the owning Request before the Opportunity, the order
   * Offer and direct Contract creation take through
   * requireReadableOfferOpportunity, whose Request FOR UPDATE this lock
   * conflicts with, so a closure and a creation serialize. NO KEY UPDATE
   * still admits the KEY SHARE that a next-action or responsible change
   * holding the Opportunity takes through its event's Request foreign key,
   * so those siblings finish instead of deadlocking with this command.
   */
  private async lockRequestThenOpportunity(
    actor: ActorContext,
    companyId: string,
    opportunityId: string,
  ): Promise<OpportunityRow> {
    const [target] = await this.databaseContext.connection
      .select({ clientRequestId: opportunities.clientRequestId })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, actor.workspaceId),
          eq(opportunities.companyId, companyId),
          eq(opportunities.id, opportunityId),
        ),
      );
    if (!target) throw new NotFoundException();
    await this.databaseContext.connection
      .select({ id: clientRequests.id })
      .from(clientRequests)
      .where(
        and(
          eq(clientRequests.workspaceId, actor.workspaceId),
          eq(clientRequests.companyId, companyId),
          eq(clientRequests.id, target.clientRequestId),
        ),
      )
      .for('no key update');
    return this.requireVisibleOpportunity(
      actor,
      companyId,
      opportunityId,
      true,
    );
  }

  // An exact retry resolves before its now-stale observed version could be
  // rejected: target visibility is rechecked, then the recorded receipt
  // returns without a second write or event.
  private async replayOpportunityReceipt<Receipt>(
    actor: ActorContext,
    companyId: string,
    opportunityId: string,
    receipt: Receipt,
  ): Promise<{ receipt: Receipt; request: CommercialIntakeDetail }> {
    const current = await this.requireVisibleOpportunity(
      actor,
      companyId,
      opportunityId,
      false,
    );
    return {
      receipt,
      request: await this.loadDetail(
        actor,
        companyId,
        current.clientRequestId,
        false,
      ),
    };
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
    // These commands change next-action/responsible/version fields, never an
    // Opportunity key. Keep writers mutually exclusive while allowing the
    // KEY SHARE taken by association's event FK; otherwise its Request lock
    // and this event's Request FK can form a cycle across the two rows.
    const [opportunity] = lock ? await query.for('no key update') : await query;
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

  private async recordResponsibleCommand(input: {
    actor: ActorContext;
    companyId: string;
    opportunityId: string;
    idempotencyKey: string;
    fingerprint: string;
    command: ChangeOpportunityResponsibleCommand;
    outcome: ResponsibleCommandRow['outcome'];
    resultVersion: number;
  }): Promise<ResponsibleCommandRow> {
    const [receipt] = await this.databaseContext.connection
      .insert(commercialIntakeResponsibleCommands)
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
        responsibleWorkspaceMembershipId: input.command.workspaceMembershipId,
      })
      .returning();
    if (!receipt)
      throw new Error('The responsible actor command was not recorded.');
    return receipt;
  }

  private async findResponsibleCommand(
    actor: ActorContext,
    companyId: string,
    idempotencyKey: string,
  ): Promise<ResponsibleCommandRow | undefined> {
    const [command] = await this.databaseContext.connection
      .select()
      .from(commercialIntakeResponsibleCommands)
      .where(
        and(
          eq(
            commercialIntakeResponsibleCommands.workspaceId,
            actor.workspaceId,
          ),
          eq(commercialIntakeResponsibleCommands.companyId, companyId),
          eq(
            commercialIntakeResponsibleCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(
            commercialIntakeResponsibleCommands.idempotencyKey,
            idempotencyKey,
          ),
        ),
      );
    return command;
  }

  private async recordStageCommand(input: {
    actor: ActorContext;
    companyId: string;
    opportunityId: string;
    idempotencyKey: string;
    fingerprint: string;
    command: SetOpportunityStageCommand;
    outcome: StageCommandRow['outcome'];
    resultVersion: number;
  }): Promise<StageCommandRow> {
    const [receipt] = await this.databaseContext.connection
      .insert(commercialIntakeStageCommands)
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
        salesStageId: input.command.salesStageId,
      })
      .returning();
    if (!receipt) throw new Error('The Sales Stage command was not recorded.');
    return receipt;
  }

  private async findStageCommand(
    actor: ActorContext,
    companyId: string,
    idempotencyKey: string,
  ): Promise<StageCommandRow | undefined> {
    const [command] = await this.databaseContext.connection
      .select()
      .from(commercialIntakeStageCommands)
      .where(
        and(
          eq(commercialIntakeStageCommands.workspaceId, actor.workspaceId),
          eq(commercialIntakeStageCommands.companyId, companyId),
          eq(
            commercialIntakeStageCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(commercialIntakeStageCommands.idempotencyKey, idempotencyKey),
        ),
      );
    return command;
  }

  private async findOutcomeCommand(
    actor: ActorContext,
    companyId: string,
    idempotencyKey: string,
  ): Promise<OutcomeCommandRow | undefined> {
    const [command] = await this.databaseContext.connection
      .select()
      .from(commercialIntakeOutcomeCommands)
      .where(
        and(
          eq(commercialIntakeOutcomeCommands.workspaceId, actor.workspaceId),
          eq(commercialIntakeOutcomeCommands.companyId, companyId),
          eq(
            commercialIntakeOutcomeCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(commercialIntakeOutcomeCommands.idempotencyKey, idempotencyKey),
        ),
      );
    return command;
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

function outcomeReceiptView(
  command: OutcomeCommandRow,
): OpportunityOutcomeChangeResult['receipt'] {
  return {
    opportunityId: command.opportunityId,
    previousStatus: command.previousStatus,
    status: command.newStatus,
    version: command.resultVersion,
  };
}

function stageReceiptView(
  command: StageCommandRow,
): OpportunityStageChangeResult['receipt'] {
  return {
    opportunityId: command.opportunityId,
    salesStageId: command.salesStageId,
    version: command.resultVersion,
    outcome: command.outcome,
  };
}

function stageHistoryEntryView(
  row: StageHistoryRow,
): OpportunityStageHistoryEntry {
  return {
    previousStage: recordedStageView(
      row.previousSalesStageId,
      row.previousLabel,
    ),
    newStage: recordedStageView(row.newSalesStageId, row.newLabel),
    version: row.opportunityVersion,
    actor: {
      workspaceMembershipId: row.actorWorkspaceMembershipId,
      displayLabel: row.actorDisplayLabel,
    },
    changedAt: row.changedAt.toISOString(),
  };
}

// The history CHECK keeps a recorded stage and its captured label together.
function recordedStageView(
  salesStageId: string | null,
  label: string | null,
): OpportunityStageHistoryEntry['previousStage'] {
  if (salesStageId === null && label === null) return null;
  if (salesStageId === null || label === null)
    throw new Error('Unsupported Sales Stage history entry.');
  return { salesStageId, label };
}

// The assigned stage, joined in the Opportunity's own Workspace and Company.
function assignedSalesStage() {
  return and(
    eq(salesStages.workspaceId, opportunities.workspaceId),
    eq(salesStages.companyId, opportunities.companyId),
    eq(salesStages.id, opportunities.salesStageId),
  );
}

function salesStageView(
  salesStageId: string | null,
  label: string | null,
  state: OpportunitySalesStage['state'] | null,
): OpportunitySalesStage | null {
  if (salesStageId === null) return null;
  // The composite foreign key keeps an assigned stage in the same Company.
  if (label === null || state === null)
    throw new Error('The assigned Sales Stage is missing.');
  return { id: salesStageId, label, state };
}

function outcomeHistoryEntryView(
  row: OutcomeHistoryRow,
): OpportunityOutcomeHistoryEntry {
  return {
    previousStatus: row.previousStatus,
    newStatus: row.newStatus,
    lossReasonCode: row.lossReasonCode,
    reason: row.reason,
    note: row.note,
    version: row.opportunityVersion,
    actor: {
      workspaceMembershipId: row.actorWorkspaceMembershipId,
      displayLabel: row.actorDisplayLabel,
    },
    changedAt: row.changedAt.toISOString(),
  };
}

function responsibleReceiptView(
  command: ResponsibleCommandRow,
): OpportunityResponsibleChangeResult['receipt'] {
  return {
    opportunityId: command.opportunityId,
    workspaceMembershipId: command.responsibleWorkspaceMembershipId,
    version: command.resultVersion,
    outcome: command.outcome,
  };
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
  return staleVersionConflict('Reload the Request before retrying.');
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
  outcomeHistory,
  salesStage,
  stageHistory,
  client,
}: {
  request: ClientRequestRow;
  opportunity: OpportunityRow;
  responsibleDisplayName: string;
  outcomeHistory: OpportunityOutcomeHistoryPage;
  salesStage: OpportunitySalesStage | null;
  stageHistory: OpportunityStageHistoryPage;
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
      // The newest history entry records when the current status was entered;
      // without one the Opportunity has been OPEN since its capture.
      statusEnteredAt:
        outcomeHistory.entries[0]?.changedAt ??
        opportunity.createdAt.toISOString(),
      outcomeHistory,
      salesStage,
      stageHistory,
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
