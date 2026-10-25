import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import type { ActorContext } from '../access/access.types.js';
import { ContractModelAccessService } from '../access/contract-model-access.service.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import {
  commandFingerprint,
  runIdempotentCommand,
} from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  contractModels,
  contractModelVersions,
  contractModelDecisions,
  contractModelWithdrawals,
  contractModelCommands,
} from '../database/schema/index.js';
import {
  exactRecord,
  modelInteger,
  CONTRACT_MODEL_CODE,
  CONTRACT_MODEL_LANGUAGE,
  readContractModelContent,
  text,
} from './contract-model.content.js';
import { readContractModelReceipt } from './contract-model.receipt.js';
import { readContractModelHistory } from './contract-model.history.js';
import {
  invalidStoredModel,
  storedContent,
  ContractModelView,
  type ModelRow,
  type ModelVersionRow,
  type ContractModelResult,
} from './contract-model.view.js';

interface CommandInput {
  actor: ActorContext;
  payload: unknown;
  key: string | undefined;
}
type MutationInput = CommandInput &
  ({ kind: 'SUBMIT' } | { kind: 'DECIDE' | 'WITHDRAW'; versionId: string });
const operations = {
  SUBMIT: 'create',
  DECIDE: 'decide',
  WITHDRAW: 'withdraw',
} satisfies Record<MutationInput['kind'], 'create' | 'decide' | 'withdraw'>;

@Injectable()
export class ContractModelService {
  private readonly views: ContractModelView;
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: ContractModelAccessService,
    private readonly authorization: CompanyContextAuthorization,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {
    this.views = new ContractModelView(database);
  }

  submit(input: CommandInput) {
    return this.command({ ...input, kind: 'SUBMIT' });
  }
  decide(input: CommandInput & { versionId: string }) {
    return this.command({ ...input, kind: 'DECIDE' });
  }
  withdraw(input: CommandInput & { versionId: string }) {
    return this.command({ ...input, kind: 'WITHDRAW' });
  }

  selectableForContract({ actor }: { actor: ActorContext }) {
    return this.database
      .transaction(async () => ({
        selection: await this.contractSelection({ actor, lock: 'share' }),
      }))
      .catch(safeFailure);
  }

  /** Join the Contract caller's transaction and retain the selection fence. */
  async requireSelectedForContractWithinTransaction(input: {
    actor: ActorContext;
    versionId: string;
    versionNumber: number;
    approvalDecisionId: string;
  }) {
    const selection = await this.contractSelection({
      actor: input.actor,
      lock: 'update',
    });
    if (
      !selection ||
      selection.versionId !== input.versionId ||
      selection.versionNumber !== input.versionNumber ||
      selection.approvalDecisionId !== input.approvalDecisionId
    )
      throw conflict(
        'CONTRACT_MODEL_SELECTION_UNAVAILABLE',
        'The selected Contract model is unavailable for new use.',
      );
    return selection;
  }

  private async contractSelection({
    actor,
    lock,
  }: {
    actor: ActorContext;
    lock: 'share' | 'update';
  }) {
    const companyId = await this.authorization.requireContractAccess(
      actor,
      ['commercial.contract.prepare', 'commercial.contract.model.select'],
      true,
    );
    const model = await this.root({ actor, companyId, lock });
    if (!model?.activeVersionId) return null;
    const version = await this.exactVersion({
      model,
      versionId: model.activeVersionId,
    });
    const [decision] = await this.database.connection
      .select()
      .from(contractModelDecisions)
      .where(
        and(
          eq(contractModelDecisions.workspaceId, actor.workspaceId),
          eq(contractModelDecisions.companyId, companyId),
          eq(contractModelDecisions.modelId, model.id),
          eq(contractModelDecisions.versionId, version.id),
        ),
      );
    if (
      !decision ||
      decision.outcome !== 'APPROVE' ||
      decision.versionNumber !== version.versionNumber
    )
      throw invalidStoredModel();
    return {
      kind: 'APPROVED_COMPANY_CONTRACT_MODEL',
      modelId: model.id,
      code: CONTRACT_MODEL_CODE,
      language: CONTRACT_MODEL_LANGUAGE,
      versionId: version.id,
      versionNumber: version.versionNumber,
      approvalDecisionId: decision.id,
      approvedAt: decision.recordedAt.toISOString(),
      approvedBy: {
        workspaceMembershipId: decision.actorMembershipId,
        internalUserId: decision.actorInternalUserId,
      },
      content: storedContent(version.content),
    } satisfies { kind: 'APPROVED_COMPANY_CONTRACT_MODEL' } & Record<
      string,
      unknown
    >;
  }

  read({ actor }: { actor: ActorContext }) {
    return this.database
      .transaction(async () => {
        const companyId = await this.access.requireActor({
          actor,
          operation: 'read',
          lock: true,
        });
        const model = await this.root({ actor, companyId, lock: 'share' });
        return model ? this.views.model(model) : { model: null };
      })
      .catch(safeFailure);
  }

  history({ actor, query }: { actor: ActorContext; query: unknown }) {
    return this.database
      .transaction(async () => {
        const companyId = await this.access.requireActor({
          actor,
          operation: 'read',
          lock: true,
        });
        const model = await this.root({ actor, companyId, lock: 'share' });
        return readContractModelHistory({
          database: this.database,
          model,
          query,
        });
      })
      .catch(safeFailure);
  }

  readVersion({
    actor,
    versionId,
  }: {
    actor: ActorContext;
    versionId: string;
  }) {
    return this.database
      .transaction(async () => {
        const companyId = await this.access.requireActor({
          actor,
          operation: 'read',
          lock: true,
        });
        const model = await this.root({ actor, companyId, lock: 'share' });
        if (!model) throw unavailable();
        const version = await this.exactVersion({
          model,
          versionId: requireUuid(versionId),
        });
        return {
          version: await this.views.version(version),
          currentSelection: { activeVersionId: model.activeVersionId },
        };
      })
      .catch(safeFailure);
  }

  private command(input: MutationInput): Promise<ContractModelResult> {
    const key = requireIdempotencyKey(input.key);
    const command = readMutation(input);
    const fingerprint = commandFingerprint({
      modelCode: CONTRACT_MODEL_CODE,
      ...command,
    });
    return runIdempotentCommand(this.database, {
      fingerprint,
      authorize: () =>
        this.access.requireActor({
          actor: input.actor,
          operation: operations[input.kind],
          lock: true,
        }),
      lockParts: (companyId) => [
        'contract-model',
        input.actor.workspaceId,
        companyId,
        CONTRACT_MODEL_CODE,
      ],
      findReceipt: async (companyId) => {
        const [receipt] = await this.database.connection
          .select()
          .from(contractModelCommands)
          .where(
            and(
              eq(contractModelCommands.workspaceId, input.actor.workspaceId),
              eq(contractModelCommands.companyId, companyId),
              eq(
                contractModelCommands.actorMembershipId,
                input.actor.workspaceMembershipId,
              ),
              eq(contractModelCommands.key, key),
            ),
          );
        return receipt;
      },
      conflict: () =>
        conflict(
          'CONTRACT_MODEL_IDEMPOTENCY_CONFLICT',
          'The key was used for a different Contract model command.',
        ),
      replay: async (companyId, receipt) => {
        const result = readContractModelReceipt(receipt.result);
        if (
          result.model.workspaceId !== input.actor.workspaceId ||
          result.model.companyId !== companyId ||
          result.model.id !== receipt.modelId
        )
          throw invalidStoredModel();
        return result;
      },
      execute: (companyId) =>
        this.execute({
          actor: input.actor,
          command,
          companyId,
          key,
          fingerprint,
        }),
    }).catch(safeFailure);
  }

  private async execute({
    actor,
    command,
    companyId,
    key,
    fingerprint,
  }: {
    actor: ActorContext;
    command: ReturnType<typeof readMutation>;
    companyId: string;
    key: string;
    fingerprint: string;
  }): Promise<ContractModelResult> {
    let model = await this.root({ actor, companyId, lock: 'update' });
    const now = this.clock.now();
    if (!Number.isFinite(now.getTime()))
      throw new InternalServerErrorException(
        'The server clock is unavailable.',
      );
    let version: ModelVersionRow;
    let action:
      | 'contract_model.version.created'
      | 'contract_model.version.approved'
      | 'contract_model.version.rejected'
      | 'contract_model.version.withdrawn';
    switch (command.kind) {
      case 'SUBMIT': {
        if (command.expectedModelRevision !== (model?.revision ?? 0))
          throw stale();
        let predecessor: ModelVersionRow | undefined;
        if (model) predecessor = await this.views.head(model);
        else {
          const [created] = await this.database.connection
            .insert(contractModels)
            .values({
              id: randomUUID(),
              workspaceId: actor.workspaceId,
              companyId,
              code: CONTRACT_MODEL_CODE,
              language: CONTRACT_MODEL_LANGUAGE,
              revision: 1,
              createdAt: now,
            })
            .returning();
          if (!created) throw invalidStoredModel();
          model = created;
        }
        const [created] = await this.database.connection
          .insert(contractModelVersions)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            modelId: model.id,
            versionNumber: (predecessor?.versionNumber ?? 0) + 1,
            predecessorVersionId: predecessor?.id ?? null,
            predecessorVersionNumber: predecessor?.versionNumber ?? null,
            content: command.content,
            ...this.attributed(actor, now),
          })
          .returning();
        if (!created) throw invalidStoredModel();
        version = created;
        if (predecessor) model = await this.advance(model);
        action = 'contract_model.version.created';
        break;
      }
      case 'DECIDE': {
        if (!model) throw unavailable();
        version = await this.exactVersion({
          model,
          versionId: command.versionId,
        });
        this.expected({ model, version, command });
        const head = await this.views.head(model);
        if (head.id !== version.id)
          throw conflict(
            'CONTRACT_MODEL_VERSION_SUPERSEDED',
            'Only the pending head can be decided.',
          );
        const current = await this.views.version(version);
        if (current.decision)
          throw conflict(
            'CONTRACT_MODEL_VERSION_DECIDED',
            'This Version already has a decision.',
          );
        await this.database.connection.insert(contractModelDecisions).values({
          workspaceId: actor.workspaceId,
          companyId,
          modelId: model.id,
          versionId: version.id,
          versionNumber: version.versionNumber,
          outcome: command.outcome,
          basis: command.basis,
          ...this.attributed(actor, now),
        });
        model = await this.advance(
          model,
          command.outcome === 'APPROVE' ? version.id : model.activeVersionId,
        );
        action =
          command.outcome === 'APPROVE'
            ? 'contract_model.version.approved'
            : 'contract_model.version.rejected';
        break;
      }
      case 'WITHDRAW': {
        if (!model) throw unavailable();
        version = await this.exactVersion({
          model,
          versionId: command.versionId,
        });
        this.expected({ model, version, command });
        const current = await this.views.version(version);
        if (
          model.activeVersionId !== version.id ||
          current.decision?.outcome !== 'APPROVE' ||
          current.withdrawal
        )
          throw conflict(
            'CONTRACT_MODEL_SELECTION_UNAVAILABLE',
            'This Version is not currently available for new use.',
          );
        await this.database.connection.insert(contractModelWithdrawals).values({
          workspaceId: actor.workspaceId,
          companyId,
          modelId: model.id,
          versionId: version.id,
          versionNumber: version.versionNumber,
          reason: command.reason,
          ...this.attributed(actor, now),
        });
        model = await this.advance(model, null);
        action = 'contract_model.version.withdrawn';
        break;
      }
      default: {
        const unsupported: never = command;
        throw new Error(
          `Unsupported Contract model command: ${String(unsupported)}`,
        );
      }
    }
    const result = await this.views.model(model);
    await this.database.connection.insert(contractModelCommands).values({
      workspaceId: actor.workspaceId,
      companyId,
      modelId: model.id,
      actorMembershipId: actor.workspaceMembershipId,
      actorInternalUserId: actor.internalUserId,
      key,
      kind: command.kind,
      fingerprint,
      result,
      recordedAt: now,
    });
    await this.accountability.recordContractModelEvent({
      actor,
      companyId,
      modelId: model.id,
      versionId: version.id,
      versionNumber: version.versionNumber,
      revision: model.revision,
      action,
      recordedAt: now,
    });
    return result;
  }

  private async root({
    actor,
    companyId,
    lock,
  }: {
    actor: ActorContext;
    companyId: string;
    lock: 'share' | 'update';
  }) {
    const [model] = await this.database.connection
      .select()
      .from(contractModels)
      .where(
        and(
          eq(contractModels.workspaceId, actor.workspaceId),
          eq(contractModels.companyId, companyId),
          eq(contractModels.code, CONTRACT_MODEL_CODE),
        ),
      )
      .for(lock);
    return model;
  }
  private async exactVersion({
    model,
    versionId,
  }: {
    model: ModelRow;
    versionId: string;
  }) {
    const [version] = await this.database.connection
      .select()
      .from(contractModelVersions)
      .where(
        and(
          eq(contractModelVersions.workspaceId, model.workspaceId),
          eq(contractModelVersions.companyId, model.companyId),
          eq(contractModelVersions.modelId, model.id),
          eq(contractModelVersions.id, versionId),
        ),
      );
    if (!version) throw unavailable();
    return version;
  }
  private async advance(
    model: ModelRow,
    activeVersionId = model.activeVersionId,
  ) {
    const [updated] = await this.database.connection
      .update(contractModels)
      .set({ revision: model.revision + 1, activeVersionId })
      .where(
        and(
          eq(contractModels.workspaceId, model.workspaceId),
          eq(contractModels.companyId, model.companyId),
          eq(contractModels.id, model.id),
          eq(contractModels.revision, model.revision),
        ),
      )
      .returning();
    if (!updated) throw stale();
    return updated;
  }
  private expected({
    model,
    version,
    command,
  }: {
    model: ModelRow;
    version: ModelVersionRow;
    command: { expectedModelRevision: number; versionNumber: number };
  }) {
    if (model.revision !== command.expectedModelRevision) throw stale();
    if (version.versionNumber !== command.versionNumber)
      throw conflict(
        'CONTRACT_MODEL_VERSION_MISMATCH',
        'The selected Version number does not match.',
      );
  }
  private attributed(actor: ActorContext, recordedAt: Date) {
    return {
      actorMembershipId: actor.workspaceMembershipId,
      actorInternalUserId: actor.internalUserId,
      actorDisplayName: actor.displayName,
      recordedAt,
    };
  }
}

function readMutation(input: MutationInput) {
  switch (input.kind) {
    case 'SUBMIT': {
      const body = exactRecord(input.payload, [
        'expectedModelRevision',
        'content',
      ]);
      return {
        kind: input.kind,
        expectedModelRevision: modelInteger(body.expectedModelRevision, 0),
        content: readContractModelContent(body.content),
      };
    }
    case 'DECIDE': {
      const body = exactRecord(input.payload, [
        'versionNumber',
        'expectedModelRevision',
        'outcome',
        'basis',
      ]);
      const outcome = readDecisionOutcome(body.outcome);
      return {
        kind: input.kind,
        versionId: requireUuid(input.versionId),
        versionNumber: modelInteger(body.versionNumber, 1),
        expectedModelRevision: modelInteger(body.expectedModelRevision, 1),
        outcome,
        basis: text(body.basis, 2_000),
      };
    }
    case 'WITHDRAW': {
      const body = exactRecord(input.payload, [
        'versionNumber',
        'expectedModelRevision',
        'reason',
      ]);
      return {
        kind: input.kind,
        versionId: requireUuid(input.versionId),
        versionNumber: modelInteger(body.versionNumber, 1),
        expectedModelRevision: modelInteger(body.expectedModelRevision, 1),
        reason: text(body.reason, 2_000),
      };
    }
    default: {
      const unsupported: never = input;
      throw new Error(
        `Unsupported Contract model command: ${String(unsupported)}`,
      );
    }
  }
}
function conflict(code: string, message: string) {
  return new ConflictException({ code, message });
}
function stale() {
  return conflict(
    'STALE_CONTRACT_MODEL_REVISION',
    'Reload the Contract model before another command.',
  );
}
function unavailable() {
  return new NotFoundException('The Contract model Version is unavailable.');
}

function readDecisionOutcome(
  value: unknown,
): typeof contractModelDecisions.$inferSelect.outcome {
  if (value === 'APPROVE' || value === 'REJECT') return value;
  throw new BadRequestException('The model decision is invalid.');
}

function safeFailure(error: unknown): never {
  if (error instanceof HttpException) throw error;
  throw new InternalServerErrorException(
    'The Contract model operation could not be completed.',
  );
}
