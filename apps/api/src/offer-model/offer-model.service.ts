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
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { OfferModelAccessService } from '../access/offer-model-access.service.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import {
  commandFingerprint,
  runIdempotentCommand,
} from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  offerModels,
  offerModelVersions,
  offerModelDecisions,
  offerModelWithdrawals,
  offerModelCommands,
} from '../database/schema/index.js';
import {
  exactRecord,
  modelInteger,
  OFFER_MODEL_CODE,
  OFFER_MODEL_LANGUAGE,
  readOfferModelContent,
  text,
} from './offer-model.content.js';
import { readOfferModelReceipt } from './offer-model.receipt.js';
import { readOfferModelHistory } from './offer-model.history.js';
import {
  invalidStoredModel,
  OfferModelView,
  type ModelRow,
  type ModelVersionRow,
  type OfferModelResult,
  storedContent,
} from './offer-model.view.js';

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
export class OfferModelService {
  private readonly views: OfferModelView;
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: OfferModelAccessService,
    private readonly companyAuthorization: CompanyContextAuthorization,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {
    this.views = new OfferModelView(database);
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

  readSelectionForOffer({ actor }: { actor: ActorContext }) {
    return this.database
      .transaction(async () => ({
        selection: await this.selectionForOffer({ actor, lock: 'share' }),
      }))
      .catch(safeFailure);
  }

  /** Borrow the Offer caller's transaction; retain the root lock through commit. */
  async requireSelectedForOfferWithinTransaction(input: {
    actor: ActorContext;
    versionId: string;
    versionNumber: number;
  }) {
    const selection = await this.selectionForOffer({
      actor: input.actor,
      lock: 'update',
    });
    if (
      !selection ||
      selection.versionId !== input.versionId ||
      selection.versionNumber !== input.versionNumber
    )
      throw conflict(
        'OFFER_MODEL_SELECTION_UNAVAILABLE',
        'The selected Offer model is unavailable for new use.',
      );
    return selection;
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
        return readOfferModelHistory({ database: this.database, model, query });
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

  private command(input: MutationInput): Promise<OfferModelResult> {
    const key = requireIdempotencyKey(input.key);
    const fingerprint = commandFingerprint({
      kind: input.kind,
      versionId: input.kind === 'SUBMIT' ? null : input.versionId,
      payload: input.payload,
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
        'offer-model',
        input.actor.workspaceId,
        companyId,
        OFFER_MODEL_CODE,
      ],
      findReceipt: async (companyId) => {
        const [receipt] = await this.database.connection
          .select()
          .from(offerModelCommands)
          .where(
            and(
              eq(offerModelCommands.workspaceId, input.actor.workspaceId),
              eq(offerModelCommands.companyId, companyId),
              eq(
                offerModelCommands.actorMembershipId,
                input.actor.workspaceMembershipId,
              ),
              eq(offerModelCommands.key, key),
            ),
          );
        return receipt;
      },
      conflict: () =>
        conflict(
          'OFFER_MODEL_IDEMPOTENCY_CONFLICT',
          'The key was used for a different Offer model command.',
        ),
      replay: async (companyId, receipt) => {
        const result = readOfferModelReceipt(receipt.result);
        if (
          result.model.workspaceId !== input.actor.workspaceId ||
          result.model.companyId !== companyId ||
          result.model.id !== receipt.modelId
        )
          throw invalidStoredModel();
        return result;
      },
      execute: (companyId) =>
        this.execute({ input, companyId, key, fingerprint }),
    }).catch(safeFailure);
  }

  private async execute({
    input,
    companyId,
    key,
    fingerprint,
  }: {
    input: MutationInput;
    companyId: string;
    key: string;
    fingerprint: string;
  }): Promise<OfferModelResult> {
    const { actor } = input;
    let model = await this.root({ actor, companyId, lock: 'update' });
    const command = readMutation(input);
    const now = this.clock.now();
    if (!Number.isFinite(now.getTime()))
      throw new InternalServerErrorException(
        'The server clock is unavailable.',
      );
    let version: ModelVersionRow;
    let action:
      | 'offer_model.version.created'
      | 'offer_model.version.approved'
      | 'offer_model.version.rejected'
      | 'offer_model.version.withdrawn';
    switch (command.kind) {
      case 'SUBMIT': {
        if (command.expectedModelRevision !== (model?.revision ?? 0))
          throw stale();
        let predecessor: ModelVersionRow | undefined;
        if (model) predecessor = await this.views.head(model);
        else {
          const [created] = await this.database.connection
            .insert(offerModels)
            .values({
              id: randomUUID(),
              workspaceId: actor.workspaceId,
              companyId,
              code: OFFER_MODEL_CODE,
              language: OFFER_MODEL_LANGUAGE,
              revision: 1,
              createdAt: now,
            })
            .returning();
          if (!created) throw invalidStoredModel();
          model = created;
        }
        const [created] = await this.database.connection
          .insert(offerModelVersions)
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
        action = 'offer_model.version.created';
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
            'OFFER_MODEL_VERSION_SUPERSEDED',
            'Only the pending head can be decided.',
          );
        const current = await this.views.version(version);
        if (current.decision)
          throw conflict(
            'OFFER_MODEL_VERSION_DECIDED',
            'This Version already has a decision.',
          );
        await this.database.connection.insert(offerModelDecisions).values({
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
            ? 'offer_model.version.approved'
            : 'offer_model.version.rejected';
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
            'OFFER_MODEL_SELECTION_UNAVAILABLE',
            'This Version is not currently available for new use.',
          );
        await this.database.connection.insert(offerModelWithdrawals).values({
          workspaceId: actor.workspaceId,
          companyId,
          modelId: model.id,
          versionId: version.id,
          versionNumber: version.versionNumber,
          reason: command.reason,
          ...this.attributed(actor, now),
        });
        model = await this.advance(model, null);
        action = 'offer_model.version.withdrawn';
        break;
      }
      default: {
        const unsupported: never = command;
        throw new Error(
          `Unsupported Offer model command: ${String(unsupported)}`,
        );
      }
    }
    const result = await this.views.model(model);
    await this.database.connection.insert(offerModelCommands).values({
      workspaceId: actor.workspaceId,
      companyId,
      modelId: model.id,
      actorMembershipId: actor.workspaceMembershipId,
      actorInternalUserId: actor.internalUserId,
      key,
      kind: input.kind,
      fingerprint,
      result,
      recordedAt: now,
    });
    await this.accountability.recordOfferModelEvent({
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

  private async selectionForOffer({
    actor,
    lock,
  }: {
    actor: ActorContext;
    lock: 'share' | 'update';
  }) {
    const companyId = await this.companyAuthorization.requireOfferAccess(
      actor,
      ['commercial.offer.model.select'],
      true,
    );
    const model = await this.root({ actor, companyId, lock });
    if (!model?.activeVersionId) return null;
    const version = await this.exactVersion({
      model,
      versionId: model.activeVersionId,
    });
    const [decision] = await this.database.connection
      .select({
        id: offerModelDecisions.id,
        outcome: offerModelDecisions.outcome,
        versionNumber: offerModelDecisions.versionNumber,
        actorMembershipId: offerModelDecisions.actorMembershipId,
        actorInternalUserId: offerModelDecisions.actorInternalUserId,
        recordedAt: offerModelDecisions.recordedAt,
      })
      .from(offerModelDecisions)
      .where(
        and(
          eq(offerModelDecisions.workspaceId, actor.workspaceId),
          eq(offerModelDecisions.companyId, companyId),
          eq(offerModelDecisions.modelId, model.id),
          eq(offerModelDecisions.versionId, version.id),
        ),
      );
    if (
      !decision ||
      decision.outcome !== 'APPROVE' ||
      decision.versionNumber !== version.versionNumber
    )
      throw invalidStoredModel();
    return {
      kind: 'APPROVED_COMPANY_OFFER_MODEL',
      modelId: model.id,
      code: OFFER_MODEL_CODE,
      language: OFFER_MODEL_LANGUAGE,
      versionId: version.id,
      versionNumber: version.versionNumber,
      approvalDecisionId: decision.id,
      approvedAt: decision.recordedAt.toISOString(),
      approvedBy: {
        workspaceMembershipId: decision.actorMembershipId,
        internalUserId: decision.actorInternalUserId,
      },
      content: storedContent(version.content),
    } satisfies {
      kind: 'APPROVED_COMPANY_OFFER_MODEL';
      code: typeof OFFER_MODEL_CODE;
      language: typeof OFFER_MODEL_LANGUAGE;
    } & Record<string, unknown>;
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
      .from(offerModels)
      .where(
        and(
          eq(offerModels.workspaceId, actor.workspaceId),
          eq(offerModels.companyId, companyId),
          eq(offerModels.code, OFFER_MODEL_CODE),
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
      .from(offerModelVersions)
      .where(
        and(
          eq(offerModelVersions.workspaceId, model.workspaceId),
          eq(offerModelVersions.companyId, model.companyId),
          eq(offerModelVersions.modelId, model.id),
          eq(offerModelVersions.id, versionId),
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
      .update(offerModels)
      .set({ revision: model.revision + 1, activeVersionId })
      .where(
        and(
          eq(offerModels.workspaceId, model.workspaceId),
          eq(offerModels.companyId, model.companyId),
          eq(offerModels.id, model.id),
          eq(offerModels.revision, model.revision),
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
        'OFFER_MODEL_VERSION_MISMATCH',
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
        content: readOfferModelContent(body.content),
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
        `Unsupported Offer model command: ${String(unsupported)}`,
      );
    }
  }
}
function conflict(code: string, message: string) {
  return new ConflictException({ code, message });
}
function stale() {
  return conflict(
    'STALE_OFFER_MODEL_REVISION',
    'Reload the Offer model before another command.',
  );
}
function unavailable() {
  return new NotFoundException('The Offer model Version is unavailable.');
}

function readDecisionOutcome(
  value: unknown,
): typeof offerModelDecisions.$inferSelect.outcome {
  if (value === 'APPROVE' || value === 'REJECT') return value;
  throw new BadRequestException('The model decision is invalid.');
}

function safeFailure(error: unknown): never {
  if (error instanceof HttpException) throw error;
  throw new InternalServerErrorException(
    'The Offer model operation could not be completed.',
  );
}
