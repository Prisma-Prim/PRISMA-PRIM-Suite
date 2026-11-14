import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import type { ActorContext } from '../access/access.types.js';
import type { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import type { CompanyModelAccessService } from '../access/company-model-access.service.js';
import type { AccountabilityService } from '../accountability/accountability.service.js';
import type { ServerClock } from '../clock/server-clock.js';
import {
  commandFingerprint,
  runIdempotentCommand,
} from '../command/idempotent-command.js';
import type { DatabaseContext } from '../database/database-context.js';
import { readCompanyModelHistory } from './company-model.history.js';
import type {
  CompanyModelContent,
  CompanyModelIdentity,
  CompanyModelKind,
  CompanyModelStep,
  ModelRow,
  ModelVersionRow,
} from './company-model.kind.js';
import { readCompanyModelReceipt } from './company-model.receipt.js';
import {
  CompanyModelView,
  invalidStoredModel,
  storedContent,
  type CompanyModelResult,
} from './company-model.view.js';

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

/** The approved Version a generation copies, with the decision approving it. */
export interface CompanyModelSelection<
  Content extends CompanyModelContent,
  Identity extends CompanyModelIdentity,
  Selection extends string,
> {
  readonly kind: Selection;
  readonly modelId: string;
  readonly code: Identity['code'];
  readonly language: Identity['language'];
  readonly versionId: string;
  readonly versionNumber: number;
  readonly approvalDecisionId: string;
  readonly approvedAt: string;
  readonly approvedBy: {
    readonly workspaceMembershipId: string;
    readonly internalUserId: string;
  };
  readonly content: Content;
}

/** The collaborators every kind's lifecycle runs on. */
export interface CompanyModelDependencies {
  readonly database: DatabaseContext;
  readonly access: CompanyModelAccessService;
  readonly authorization: CompanyContextAuthorization;
  readonly accountability: AccountabilityService;
  readonly clock: ServerClock;
}

/**
 * The lifecycle of one Company model kind: submit, decide and withdraw
 * Versions, read the model, its history and Versions, and fence the approved
 * Version a generation selects. A kind's injectable service extends it.
 */
export class CompanyModelService<
  Content extends CompanyModelContent,
  Identity extends CompanyModelIdentity,
  Selection extends string,
> {
  private readonly views: CompanyModelView<Content, Identity, Selection>;
  private readonly database: DatabaseContext;

  constructor(
    private readonly kind: CompanyModelKind<Content, Identity, Selection>,
    private readonly dependencies: CompanyModelDependencies,
  ) {
    this.database = dependencies.database;
    this.views = new CompanyModelView(kind, dependencies.database);
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

  /** The approved Version a generation would select now, or none. */
  readSelection({ actor }: { actor: ActorContext }) {
    return this.database
      .transaction(async () => ({
        selection: await this.selection({ actor, lock: 'share' }),
      }))
      .catch((error: unknown) => this.safeFailure(error));
  }

  /**
   * Joins the generation's transaction and keeps the model root locked until
   * it commits. The generation names the Version and the approval decision it
   * observed; any other current selection is refused.
   */
  async requireSelectedWithinTransaction(input: {
    actor: ActorContext;
    versionId: string;
    versionNumber: number;
    approvalDecisionId: string;
  }) {
    const selection = await this.selection({
      actor: input.actor,
      lock: 'update',
    });
    if (
      !selection ||
      selection.versionId !== input.versionId ||
      selection.versionNumber !== input.versionNumber ||
      selection.approvalDecisionId !== input.approvalDecisionId
    )
      throw this.conflict(
        `${this.kind.codePrefix}_SELECTION_UNAVAILABLE`,
        `The selected ${this.kind.noun} model is unavailable for new use.`,
      );
    return selection;
  }

  read({ actor }: { actor: ActorContext }) {
    return this.database
      .transaction(async () => {
        const companyId = await this.requireActor(actor, 'read');
        const model = await this.root({ actor, companyId, lock: 'share' });
        return model ? this.views.model(model) : { model: null };
      })
      .catch((error: unknown) => this.safeFailure(error));
  }

  history({ actor, query }: { actor: ActorContext; query: unknown }) {
    return this.database
      .transaction(async () => {
        const companyId = await this.requireActor(actor, 'read');
        const model = await this.root({ actor, companyId, lock: 'share' });
        return readCompanyModelHistory({
          kind: this.kind,
          database: this.database,
          model,
          query,
        });
      })
      .catch((error: unknown) => this.safeFailure(error));
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
        const companyId = await this.requireActor(actor, 'read');
        const model = await this.root({ actor, companyId, lock: 'share' });
        if (!model) throw this.unavailable();
        const version = await this.exactVersion({
          model,
          versionId: requireUuid(versionId),
        });
        return {
          version: await this.views.version(version),
          currentSelection: { activeVersionId: model.activeVersionId },
        };
      })
      .catch((error: unknown) => this.safeFailure(error));
  }

  private requireActor(
    actor: ActorContext,
    operation: 'read' | 'create' | 'decide' | 'withdraw',
  ) {
    return this.dependencies.access.requireActor({
      actor,
      authority: this.kind.authority,
      operation,
      lock: true,
    });
  }

  // The fingerprint covers the payload as submitted, before validation, so an
  // exact retry replays its receipt without running any later step.
  private command(
    input: MutationInput,
  ): Promise<CompanyModelResult<Content, Identity, Selection>> {
    const key = requireIdempotencyKey(input.key);
    const fingerprint = commandFingerprint({
      kind: input.kind,
      versionId: input.kind === 'SUBMIT' ? null : input.versionId,
      payload: input.payload,
    });
    const { commands } = this.kind.tables;
    return runIdempotentCommand(this.database, {
      fingerprint,
      authorize: () => this.requireActor(input.actor, operations[input.kind]),
      lockParts: (companyId) => [
        this.kind.lockName,
        input.actor.workspaceId,
        companyId,
        this.kind.identity.code,
      ],
      findReceipt: async (companyId) => {
        const [receipt] = await this.database.connection
          .select()
          .from(commands)
          .where(
            and(
              eq(commands.workspaceId, input.actor.workspaceId),
              eq(commands.companyId, companyId),
              eq(commands.actorMembershipId, input.actor.workspaceMembershipId),
              eq(commands.key, key),
            ),
          );
        return receipt;
      },
      conflict: () =>
        this.conflict(
          `${this.kind.codePrefix}_IDEMPOTENCY_CONFLICT`,
          `The key was used for a different ${this.kind.noun} model command.`,
        ),
      replay: async (companyId, receipt) => {
        const result = readCompanyModelReceipt(this.kind, receipt.result);
        if (
          result.model.workspaceId !== input.actor.workspaceId ||
          result.model.companyId !== companyId ||
          result.model.id !== receipt.modelId
        )
          throw invalidStoredModel(this.kind);
        return result;
      },
      execute: (companyId) =>
        this.execute({ input, companyId, key, fingerprint }),
    }).catch((error: unknown) => this.safeFailure(error));
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
  }): Promise<CompanyModelResult<Content, Identity, Selection>> {
    const { actor } = input;
    const { models, versions, decisions, withdrawals, commands } =
      this.kind.tables;
    let model = await this.root({ actor, companyId, lock: 'update' });
    const command = this.readMutation(input);
    const now = this.dependencies.clock.now();
    if (!Number.isFinite(now.getTime()))
      throw new InternalServerErrorException(
        'The server clock is unavailable.',
      );
    let version: ModelVersionRow;
    let step: CompanyModelStep;
    switch (command.kind) {
      case 'SUBMIT': {
        if (command.expectedModelRevision !== (model?.revision ?? 0))
          throw this.stale();
        let predecessor: ModelVersionRow | undefined;
        if (model) predecessor = await this.views.head(model);
        else {
          const [created] = await this.database.connection
            .insert(models)
            .values({
              id: randomUUID(),
              workspaceId: actor.workspaceId,
              companyId,
              code: this.kind.identity.code,
              language: this.kind.identity.language,
              revision: 1,
              createdAt: now,
            })
            .returning();
          if (!created) throw invalidStoredModel(this.kind);
          model = created;
        }
        const [created] = await this.database.connection
          .insert(versions)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            modelId: model.id,
            versionNumber: (predecessor?.versionNumber ?? 0) + 1,
            predecessorVersionId: predecessor?.id ?? null,
            predecessorVersionNumber: predecessor?.versionNumber ?? null,
            content: command.content,
            ...attributed(actor, now),
          })
          .returning();
        if (!created) throw invalidStoredModel(this.kind);
        version = created;
        if (predecessor) model = await this.advance(model);
        step = 'created';
        break;
      }
      case 'DECIDE': {
        if (!model) throw this.unavailable();
        version = await this.exactVersion({
          model,
          versionId: command.versionId,
        });
        this.expected({ model, version, command });
        const head = await this.views.head(model);
        if (head.id !== version.id)
          throw this.conflict(
            `${this.kind.codePrefix}_VERSION_SUPERSEDED`,
            'Only the pending head can be decided.',
          );
        const current = await this.views.version(version);
        if (current.decision)
          throw this.conflict(
            `${this.kind.codePrefix}_VERSION_DECIDED`,
            'This Version already has a decision.',
          );
        await this.database.connection.insert(decisions).values({
          workspaceId: actor.workspaceId,
          companyId,
          modelId: model.id,
          versionId: version.id,
          versionNumber: version.versionNumber,
          outcome: command.outcome,
          basis: command.basis,
          ...attributed(actor, now),
        });
        model = await this.advance(
          model,
          command.outcome === 'APPROVE' ? version.id : model.activeVersionId,
        );
        step = command.outcome === 'APPROVE' ? 'approved' : 'rejected';
        break;
      }
      case 'WITHDRAW': {
        if (!model) throw this.unavailable();
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
          throw this.conflict(
            `${this.kind.codePrefix}_SELECTION_UNAVAILABLE`,
            'This Version is not currently available for new use.',
          );
        await this.database.connection.insert(withdrawals).values({
          workspaceId: actor.workspaceId,
          companyId,
          modelId: model.id,
          versionId: version.id,
          versionNumber: version.versionNumber,
          reason: command.reason,
          ...attributed(actor, now),
        });
        model = await this.advance(model, null);
        step = 'withdrawn';
        break;
      }
      default: {
        const unsupported: never = command;
        throw new Error(
          `Unsupported ${this.kind.noun} model command: ${String(unsupported)}`,
        );
      }
    }
    const result = await this.views.model(model);
    await this.database.connection.insert(commands).values({
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
    await this.kind.recordEvent(this.dependencies.accountability, {
      actor,
      companyId,
      modelId: model.id,
      versionId: version.id,
      versionNumber: version.versionNumber,
      revision: model.revision,
      step,
      recordedAt: now,
    });
    return result;
  }

  private async selection({
    actor,
    lock,
  }: {
    actor: ActorContext;
    lock: 'share' | 'update';
  }): Promise<CompanyModelSelection<Content, Identity, Selection> | null> {
    const { decisions } = this.kind.tables;
    const companyId = (
      await this.dependencies.authorization.requirePermissions(actor, {
        permissions: this.kind.selection.permissions,
        lock: true,
      })
    ).companyId;
    const model = await this.root({ actor, companyId, lock });
    if (!model?.activeVersionId) return null;
    const version = await this.exactVersion({
      model,
      versionId: model.activeVersionId,
    });
    const [decision] = await this.database.connection
      .select({
        id: decisions.id,
        outcome: decisions.outcome,
        versionNumber: decisions.versionNumber,
        actorMembershipId: decisions.actorMembershipId,
        actorInternalUserId: decisions.actorInternalUserId,
        recordedAt: decisions.recordedAt,
      })
      .from(decisions)
      .where(
        and(
          eq(decisions.workspaceId, actor.workspaceId),
          eq(decisions.companyId, companyId),
          eq(decisions.modelId, model.id),
          eq(decisions.versionId, version.id),
        ),
      );
    if (
      !decision ||
      decision.outcome !== 'APPROVE' ||
      decision.versionNumber !== version.versionNumber
    )
      throw invalidStoredModel(this.kind);
    return {
      kind: this.kind.selection.kind,
      modelId: model.id,
      code: this.kind.identity.code,
      language: this.kind.identity.language,
      versionId: version.id,
      versionNumber: version.versionNumber,
      approvalDecisionId: decision.id,
      approvedAt: decision.recordedAt.toISOString(),
      approvedBy: {
        workspaceMembershipId: decision.actorMembershipId,
        internalUserId: decision.actorInternalUserId,
      },
      content: storedContent(this.kind, version.content),
    };
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
    const { models } = this.kind.tables;
    const [model] = await this.database.connection
      .select()
      .from(models)
      .where(
        and(
          eq(models.workspaceId, actor.workspaceId),
          eq(models.companyId, companyId),
          eq(models.code, this.kind.identity.code),
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
    const { versions } = this.kind.tables;
    const [version] = await this.database.connection
      .select()
      .from(versions)
      .where(
        and(
          eq(versions.workspaceId, model.workspaceId),
          eq(versions.companyId, model.companyId),
          eq(versions.modelId, model.id),
          eq(versions.id, versionId),
        ),
      );
    if (!version) throw this.unavailable();
    return version;
  }
  private async advance(
    model: ModelRow,
    activeVersionId = model.activeVersionId,
  ) {
    const { models } = this.kind.tables;
    const [updated] = await this.database.connection
      .update(models)
      .set({ revision: model.revision + 1, activeVersionId })
      .where(
        and(
          eq(models.workspaceId, model.workspaceId),
          eq(models.companyId, model.companyId),
          eq(models.id, model.id),
          eq(models.revision, model.revision),
        ),
      )
      .returning();
    if (!updated) throw this.stale();
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
    if (model.revision !== command.expectedModelRevision) throw this.stale();
    if (version.versionNumber !== command.versionNumber)
      throw this.conflict(
        `${this.kind.codePrefix}_VERSION_MISMATCH`,
        'The selected Version number does not match.',
      );
  }

  private readMutation(input: MutationInput) {
    const { exactRecord, modelInteger, text } = this.kind.fields;
    switch (input.kind) {
      case 'SUBMIT': {
        const body = exactRecord(input.payload, [
          'expectedModelRevision',
          'content',
        ]);
        return {
          kind: input.kind,
          expectedModelRevision: modelInteger(body.expectedModelRevision, 0),
          content: this.kind.readContent(body.content),
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
          `Unsupported ${this.kind.noun} model command: ${String(unsupported)}`,
        );
      }
    }
  }

  private conflict(code: string, message: string) {
    return new ConflictException({ code, message });
  }
  private stale() {
    return this.conflict(
      `STALE_${this.kind.codePrefix}_REVISION`,
      `Reload the ${this.kind.noun} model before another command.`,
    );
  }
  private unavailable() {
    return new NotFoundException(
      `The ${this.kind.noun} model Version is unavailable.`,
    );
  }
  private safeFailure(error: unknown): never {
    if (error instanceof HttpException) throw error;
    throw new InternalServerErrorException(
      `The ${this.kind.noun} model operation could not be completed.`,
    );
  }
}

function attributed(actor: ActorContext, recordedAt: Date) {
  return {
    actorMembershipId: actor.workspaceMembershipId,
    actorInternalUserId: actor.internalUserId,
    actorDisplayName: actor.displayName,
    recordedAt,
  };
}

function readDecisionOutcome(value: unknown): 'APPROVE' | 'REJECT' {
  if (value === 'APPROVE' || value === 'REJECT') return value;
  throw new BadRequestException('The model decision is invalid.');
}
