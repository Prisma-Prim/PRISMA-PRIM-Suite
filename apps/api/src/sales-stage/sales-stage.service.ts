import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import {
  advisoryTransactionLock,
  commandFingerprint,
  idempotencyConflict,
  runIdempotentCommand,
} from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  salesStageConfigurationCommands,
  salesStageConfigurations,
  salesStages,
} from '../database/schema/index.js';
import { SALES_STAGE_LIMIT } from './sales-stage.definition.js';
import type {
  AssignableSalesStage,
  SalesStageCreateResult,
  SalesStageList,
} from './sales-stage.types.js';
import { readCreateSalesStageCommand } from './sales-stage.validation.js';

type ConfigurationCommandRow =
  typeof salesStageConfigurationCommands.$inferSelect;

/**
 * Owns a Company's configurable Sales Stages (Commercial Workflow PRD section
 * 24): the ordered list with its configuration revision, the configuration
 * operations and the narrow lookup an Opportunity assignment uses.
 */
@Injectable()
export class SalesStageService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly accountability: AccountabilityService,
  ) {}

  /** The stage list requires only Commercial Intake read in the Company. */
  async list(actor: ActorContext): Promise<SalesStageList> {
    const companyId = await this.authorization.requireCommercialIntakeAccess(
      actor,
      'read',
    );
    return this.databaseContext.transaction(
      () => this.readList(actor.workspaceId, companyId),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /**
   * Appends one `ACTIVE` stage at the end of the list at the observed
   * configuration revision, recording the stage, the next revision, one
   * `sales_stage.configured` event and the receipt in one transaction.
   */
  async create(
    actor: ActorContext,
    value: unknown,
    key: string | undefined,
  ): Promise<SalesStageCreateResult> {
    await this.authorization.requireSalesStageConfiguration(actor);
    const command = readCreateSalesStageCommand(value);
    const idempotencyKey = requireIdempotencyKey(key);
    const fingerprint = commandFingerprint({
      expectedRevision: command.expectedRevision,
      label: command.label,
    });
    return runIdempotentCommand(this.databaseContext, {
      fingerprint,
      authorize: () =>
        this.authorization.requireSalesStageConfiguration(actor, true),
      lockParts: (companyId) => [
        'sales-stage.create',
        actor.workspaceId,
        companyId,
        actor.workspaceMembershipId,
        idempotencyKey,
      ],
      findReceipt: (companyId) =>
        this.findCommand(actor, companyId, idempotencyKey),
      conflict: () =>
        idempotencyConflict(
          'Idempotency-Key was already used for another Sales Stage.',
        ),
      replay: async (companyId, receipt) => ({
        receipt: receiptView(receipt),
        configuration: await this.readList(actor.workspaceId, companyId),
      }),
      execute: async (companyId) => {
        // Every configuration operation of the Company serializes here, so
        // one observed revision admits at most one committed operation.
        await advisoryTransactionLock(this.databaseContext.connection, [
          'sales-stage.configuration',
          actor.workspaceId,
          companyId,
        ]);
        const current = await this.readList(actor.workspaceId, companyId);
        if (current.revision !== command.expectedRevision)
          throw new ConflictException({
            code: 'STALE_CONFIGURATION',
            message: 'Reload the Sales Stages before retrying.',
          });
        if (await this.labelTaken(actor, companyId, command.label))
          throw new BadRequestException({
            code: 'SALES_STAGE_LABEL_TAKEN',
            field: 'label',
            message: 'Another Sales Stage already uses this label.',
          });
        if (current.stages.length >= SALES_STAGE_LIMIT)
          throw new ConflictException({
            code: 'SALES_STAGE_LIMIT',
            message: `A Company holds at most ${SALES_STAGE_LIMIT} Sales Stages.`,
          });

        const revision = current.revision + 1;
        const position = current.stages.length + 1;
        const [stage] = await this.databaseContext.connection
          .insert(salesStages)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            label: command.label,
            position,
            createdByInternalUserId: actor.internalUserId,
            createdByWorkspaceMembershipId: actor.workspaceMembershipId,
          })
          .returning();
        if (!stage) throw new Error('The Sales Stage was not recorded.');
        await this.databaseContext.connection
          .insert(salesStageConfigurations)
          .values({ workspaceId: actor.workspaceId, companyId, revision })
          .onConflictDoUpdate({
            target: [
              salesStageConfigurations.workspaceId,
              salesStageConfigurations.companyId,
            ],
            set: { revision, updatedAt: sql`now()` },
          });
        await this.accountability.recordSalesStageConfigured({
          actor,
          companyId,
          salesStageId: stage.id,
          configurationRevision: revision,
          label: stage.label,
        });
        const [receipt] = await this.databaseContext.connection
          .insert(salesStageConfigurationCommands)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            actorWorkspaceMembershipId: actor.workspaceMembershipId,
            idempotencyKey,
            fingerprint,
            operation: 'CREATED',
            salesStageId: stage.id,
            label: stage.label,
            position: stage.position,
            expectedRevision: command.expectedRevision,
            resultRevision: revision,
          })
          .returning();
        if (!receipt)
          throw new Error('The Sales Stage command was not recorded.');
        return {
          receipt: receiptView(receipt),
          configuration: await this.readList(actor.workspaceId, companyId),
        };
      },
    });
  }

  /**
   * The `ACTIVE` stage of the Company an Opportunity may be assigned, held
   * under a share lock until the assignment commits, so the assignment
   * serializes with any change of that stage's state. An unknown,
   * other-Company or unassignable stage resolves to nothing.
   */
  async lockAssignableStage(input: {
    readonly workspaceId: string;
    readonly companyId: string;
    readonly salesStageId: string;
  }): Promise<AssignableSalesStage | undefined> {
    const [stage] = await this.databaseContext.connection
      .select({ id: salesStages.id, label: salesStages.label })
      .from(salesStages)
      .where(
        and(
          eq(salesStages.workspaceId, input.workspaceId),
          eq(salesStages.companyId, input.companyId),
          eq(salesStages.id, input.salesStageId),
          eq(salesStages.state, 'ACTIVE'),
        ),
      )
      .for('share');
    return stage;
  }

  /** The current label of one stage of the Company, as recorded now. */
  async currentLabel(input: {
    readonly workspaceId: string;
    readonly companyId: string;
    readonly salesStageId: string;
  }): Promise<string> {
    const [stage] = await this.databaseContext.connection
      .select({ label: salesStages.label })
      .from(salesStages)
      .where(
        and(
          eq(salesStages.workspaceId, input.workspaceId),
          eq(salesStages.companyId, input.companyId),
          eq(salesStages.id, input.salesStageId),
        ),
      );
    if (!stage) throw new Error('The assigned Sales Stage is missing.');
    return stage.label;
  }

  private async readList(
    workspaceId: string,
    companyId: string,
  ): Promise<SalesStageList> {
    const [configuration] = await this.databaseContext.connection
      .select({ revision: salesStageConfigurations.revision })
      .from(salesStageConfigurations)
      .where(
        and(
          eq(salesStageConfigurations.workspaceId, workspaceId),
          eq(salesStageConfigurations.companyId, companyId),
        ),
      );
    const stages = await this.databaseContext.connection
      .select({
        id: salesStages.id,
        label: salesStages.label,
        position: salesStages.position,
        state: salesStages.state,
      })
      .from(salesStages)
      .where(
        and(
          eq(salesStages.workspaceId, workspaceId),
          eq(salesStages.companyId, companyId),
        ),
      )
      .orderBy(asc(salesStages.position));
    return { revision: configuration?.revision ?? 0, stages };
  }

  // Uniqueness ignores case exactly as the `sales_stages_label_unique` index
  // compares labels, so the refusal is decided before the index would refuse.
  private async labelTaken(
    actor: ActorContext,
    companyId: string,
    label: string,
  ): Promise<boolean> {
    const [row] = await this.databaseContext.connection
      .select({ matches: count() })
      .from(salesStages)
      .where(
        and(
          eq(salesStages.workspaceId, actor.workspaceId),
          eq(salesStages.companyId, companyId),
          sql`lower(${salesStages.label}) = lower(${label})`,
        ),
      );
    return (row?.matches ?? 0) > 0;
  }

  private async findCommand(
    actor: ActorContext,
    companyId: string,
    idempotencyKey: string,
  ): Promise<ConfigurationCommandRow | undefined> {
    const [command] = await this.databaseContext.connection
      .select()
      .from(salesStageConfigurationCommands)
      .where(
        and(
          eq(salesStageConfigurationCommands.workspaceId, actor.workspaceId),
          eq(salesStageConfigurationCommands.companyId, companyId),
          eq(
            salesStageConfigurationCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(salesStageConfigurationCommands.idempotencyKey, idempotencyKey),
        ),
      );
    return command;
  }
}

function receiptView(
  command: ConfigurationCommandRow,
): SalesStageCreateResult['receipt'] {
  return {
    operation: command.operation,
    salesStageId: command.salesStageId,
    label: command.label,
    position: command.position,
    revision: command.resultRevision,
  };
}
