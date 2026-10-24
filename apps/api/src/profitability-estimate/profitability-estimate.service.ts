import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  profitabilityEstimates,
  profitabilityEstimateVersions,
  profitabilityEstimateDecisions,
  profitabilityEstimateReceipts,
} from '../database/schema/index.js';
import { calculateProfitability } from './profitability-estimate.calculation.js';
import {
  profitabilityFingerprint,
  profitabilityReplay,
  type ProfitabilityCommandKind,
} from './profitability-estimate.command.js';
import {
  readProfitabilityVersion,
  readProfitabilityPagination,
  encodeProfitabilityCursor,
} from './profitability-estimate.persistence.js';
import type {
  ApprovedEstimateCommercialProjection,
  ProfitabilityVersionRecord,
  ProfitabilityVersionPage,
} from './profitability-estimate.types.js';
import {
  readProfitabilitySubmission,
  readProfitabilityDecision,
} from './profitability-estimate.validation.js';

const UUID_GRAMMAR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CALCULATION_RULE = {
  id: 'CONFIRMED_COST_PROFITABILITY',
  version: 1,
  monetaryScale: 2,
  percentageScale: 2,
  rounding: 'HALF_UP',
} satisfies ProfitabilityVersionRecord['calculationRule'];

@Injectable()
export class ProfitabilityEstimateService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly intake: CommercialIntakeService,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  create({
    actor,
    opportunityId,
    body,
    key,
  }: {
    actor: ActorContext;
    opportunityId: string;
    body: unknown;
    key: string | undefined;
  }): Promise<ProfitabilityVersionRecord> {
    return this.protectedTransaction(async () => {
      const companyId =
        await this.authorization.requireProfitabilityEstimateAccess(
          actor,
          'create',
          true,
        );
      // The Opportunity owner protects both its row and the actor's live
      // read authority before any cached confidential outcome is considered.
      const target = await this.intake.requireReadableProfitabilityOpportunity(
        actor,
        opportunityId,
      );
      const idempotencyKey = requireIdempotencyKey(key);
      const fingerprint = profitabilityFingerprint({ opportunityId, body });
      const replay = await profitabilityReplay(
        this.database.connection,
        actor,
        companyId,
        'create',
        idempotencyKey,
        fingerprint,
      );
      if (replay) return replay;
      const { expectedLatestVersionNumber, ...inputs } =
        readProfitabilitySubmission(body);
      const [existing] = await this.database.connection
        .select()
        .from(profitabilityEstimates)
        .where(
          and(
            eq(profitabilityEstimates.workspaceId, actor.workspaceId),
            eq(profitabilityEstimates.companyId, companyId),
            eq(profitabilityEstimates.opportunityId, target.id),
          ),
        )
        .for('update');
      const latestVersionNumber = existing?.latestVersionNumber ?? null;
      if (expectedLatestVersionNumber !== latestVersionNumber)
        throw new ConflictException({
          code: 'STALE_LATEST_VERSION',
          latestVersionNumber,
          message:
            'Reload the estimate history before submitting a correction.',
        });
      if (latestVersionNumber === 2_147_483_647)
        throw new ConflictException({
          code: 'VERSION_EXHAUSTED',
          message: 'The version number cannot be incremented.',
        });
      const occurredAt = this.clock.now();
      const estimateId = existing?.id ?? randomUUID();
      if (!existing)
        await this.database.connection.insert(profitabilityEstimates).values({
          id: estimateId,
          workspaceId: actor.workspaceId,
          companyId,
          opportunityId: target.id,
          clientRequestId: target.clientRequestId,
          latestVersionNumber: 0,
          createdAt: occurredAt,
        });
      const versionNumber = (latestVersionNumber ?? 0) + 1;
      const [predecessor] = existing
        ? await this.database.connection
            .select({ id: profitabilityEstimateVersions.id })
            .from(profitabilityEstimateVersions)
            .where(
              and(
                eq(profitabilityEstimateVersions.estimateId, estimateId),
                eq(
                  profitabilityEstimateVersions.workspaceId,
                  actor.workspaceId,
                ),
                eq(profitabilityEstimateVersions.companyId, companyId),
                eq(
                  profitabilityEstimateVersions.versionNumber,
                  existing.latestVersionNumber,
                ),
              ),
            )
        : [];
      if (existing && !predecessor)
        throw new Error('The profitability estimate head is incomplete.');
      const [version] = await this.database.connection
        .insert(profitabilityEstimateVersions)
        .values({
          id: randomUUID(),
          estimateId,
          workspaceId: actor.workspaceId,
          companyId,
          opportunityId: target.id,
          clientRequestId: target.clientRequestId,
          versionNumber,
          predecessorVersionId: predecessor?.id ?? null,
          predecessorVersionNumber: latestVersionNumber,
          inputs,
          results: calculateProfitability(inputs),
          calculationRule: CALCULATION_RULE,
          createdByWorkspaceMembershipId: actor.workspaceMembershipId,
          createdAt: occurredAt,
        })
        .returning();
      if (!version)
        throw new Error('The profitability estimate version was not recorded.');
      await this.database.connection
        .update(profitabilityEstimates)
        .set({ latestVersionNumber: versionNumber })
        .where(
          and(
            eq(profitabilityEstimates.workspaceId, actor.workspaceId),
            eq(profitabilityEstimates.companyId, companyId),
            eq(profitabilityEstimates.id, estimateId),
          ),
        );
      const response = readProfitabilityVersion(version, null);
      await this.recordReceipt(
        actor,
        companyId,
        'create',
        idempotencyKey,
        fingerprint,
        response,
        occurredAt,
      );
      await this.accountability.recordProfitabilityEstimateEvent({
        actor,
        companyId,
        estimateId,
        versionId: version.id,
        versionNumber,
        opportunityId: target.id,
        clientRequestId: target.clientRequestId,
        occurredAt,
        action: 'profitability_estimate_version.created',
      });
      return response;
    });
  }

  decide({
    actor,
    opportunityId,
    versionId,
    body,
    key,
  }: {
    actor: ActorContext;
    opportunityId: string;
    versionId: string;
    body: unknown;
    key: string | undefined;
  }): Promise<ProfitabilityVersionRecord> {
    return this.protectedTransaction(async () => {
      const companyId =
        await this.authorization.requireProfitabilityEstimateAccess(
          actor,
          'decide',
          true,
        );
      const target = await this.intake.requireReadableProfitabilityOpportunity(
        actor,
        opportunityId,
      );
      const idempotencyKey = requireIdempotencyKey(key);
      const fingerprint = profitabilityFingerprint({
        opportunityId,
        versionId,
        body,
      });
      const replay = await profitabilityReplay(
        this.database.connection,
        actor,
        companyId,
        'decide',
        idempotencyKey,
        fingerprint,
      );
      if (replay) return replay;
      const command = readProfitabilityDecision(body);
      const version = await this.version(
        actor,
        companyId,
        target.id,
        versionId,
      );
      if (command.expectedVersionNumber !== version.versionNumber)
        throw new ConflictException({
          code: 'STALE_VERSION',
          message: 'Reload the exact version before deciding.',
        });
      const [previous] = await this.database.connection
        .select()
        .from(profitabilityEstimateDecisions)
        .where(
          and(
            eq(profitabilityEstimateDecisions.workspaceId, actor.workspaceId),
            eq(profitabilityEstimateDecisions.companyId, companyId),
            eq(profitabilityEstimateDecisions.versionId, version.id),
          ),
        );
      if (previous)
        throw new ConflictException({
          code: 'DECISION_CONFLICT',
          message: 'This exact version already has a Director decision.',
        });
      const occurredAt = this.clock.now();
      const [decision] = await this.database.connection
        .insert(profitabilityEstimateDecisions)
        .values({
          id: randomUUID(),
          workspaceId: actor.workspaceId,
          companyId,
          estimateId: version.estimateId,
          opportunityId: target.id,
          clientRequestId: target.clientRequestId,
          versionId: version.id,
          versionNumber: version.versionNumber,
          decidedByWorkspaceMembershipId: actor.workspaceMembershipId,
          decidedAt: occurredAt,
          code: command.code,
        })
        .returning();
      if (!decision) throw new Error('The Director decision was not recorded.');
      const response = readProfitabilityVersion(version, decision);
      await this.recordReceipt(
        actor,
        companyId,
        'decide',
        idempotencyKey,
        fingerprint,
        response,
        occurredAt,
      );
      await this.accountability.recordProfitabilityEstimateEvent({
        actor,
        companyId,
        estimateId: version.estimateId,
        versionId: version.id,
        versionNumber: version.versionNumber,
        opportunityId: target.id,
        clientRequestId: target.clientRequestId,
        occurredAt,
        action: 'profitability_estimate_version.decided',
        decisionCode: command.code,
      });
      return response;
    });
  }

  read({
    actor,
    opportunityId,
    versionId,
  }: {
    actor: ActorContext;
    opportunityId: string;
    versionId: string;
  }): Promise<ProfitabilityVersionRecord> {
    return this.protectedTransaction(() =>
      this.readWithinTransaction({ actor, opportunityId, versionId }),
    );
  }

  /** Borrow the caller's protected transaction; never open a nested read. */
  private async readWithinTransaction({
    actor,
    opportunityId,
    versionId,
  }: {
    actor: ActorContext;
    opportunityId: string;
    versionId: string;
  }): Promise<ProfitabilityVersionRecord> {
    const companyId =
      await this.authorization.requireProfitabilityEstimateAccess(
        actor,
        'read',
        true,
      );
    const target = await this.intake.requireReadableProfitabilityOpportunity(
      actor,
      opportunityId,
    );
    const version = await this.version(actor, companyId, target.id, versionId);
    const [decision] = await this.database.connection
      .select()
      .from(profitabilityEstimateDecisions)
      .where(
        and(
          eq(profitabilityEstimateDecisions.workspaceId, actor.workspaceId),
          eq(profitabilityEstimateDecisions.companyId, companyId),
          eq(profitabilityEstimateDecisions.versionId, version.id),
        ),
      );
    return readProfitabilityVersion(version, decision ?? null);
  }

  /** Current source authority is required even for a handoff receipt replay. */
  async readApprovedOfferPriceWithinTransaction({
    actor,
    opportunityId,
    versionId,
    versionNumber,
  }: {
    actor: ActorContext;
    opportunityId: string;
    versionId: string;
    versionNumber: number;
  }): Promise<ApprovedEstimateCommercialProjection> {
    const version = await this.readWithinTransaction({
      actor,
      opportunityId,
      versionId,
    });
    if (version.versionNumber !== versionNumber)
      throw new ConflictException({
        code: 'PROFITABILITY_VERSION_MISMATCH',
        message: 'The selected economic Version does not match.',
      });
    if (version.decision?.code !== 'APPROVE')
      throw new ConflictException({
        code: 'PROFITABILITY_VERSION_NOT_APPROVED',
        message: 'The selected economic Version is not approved.',
      });
    return {
      estimateId: version.estimateId,
      estimateVersionId: version.id,
      estimateVersionNumber: version.versionNumber,
      approvalDecisionId: version.decision.id,
      approvedAt: version.decision.decidedAt,
      amount: version.inputs.proposedPrice,
      currency: version.inputs.currency,
    };
  }

  list({
    actor,
    opportunityId,
    query,
  }: {
    actor: ActorContext;
    opportunityId: string;
    query: unknown;
  }): Promise<ProfitabilityVersionPage> {
    return this.protectedTransaction(async () => {
      const companyId =
        await this.authorization.requireProfitabilityEstimateAccess(
          actor,
          'read',
          true,
        );
      const target = await this.intake.requireReadableProfitabilityOpportunity(
        actor,
        opportunityId,
      );
      const scope = {
        workspaceId: actor.workspaceId,
        companyId,
        opportunityId: target.id,
      };
      const page = readProfitabilityPagination(query, scope);
      const [estimate] = await this.database.connection
        .select()
        .from(profitabilityEstimates)
        .where(
          and(
            eq(profitabilityEstimates.workspaceId, actor.workspaceId),
            eq(profitabilityEstimates.companyId, companyId),
            eq(profitabilityEstimates.opportunityId, target.id),
          ),
        );
      if (!estimate) return { items: [], latestVersionNumber: null };
      const rows = await this.database.connection
        .select({
          version: profitabilityEstimateVersions,
          decision: profitabilityEstimateDecisions,
        })
        .from(profitabilityEstimateVersions)
        .leftJoin(
          profitabilityEstimateDecisions,
          and(
            eq(
              profitabilityEstimateDecisions.workspaceId,
              profitabilityEstimateVersions.workspaceId,
            ),
            eq(
              profitabilityEstimateDecisions.companyId,
              profitabilityEstimateVersions.companyId,
            ),
            eq(
              profitabilityEstimateDecisions.versionId,
              profitabilityEstimateVersions.id,
            ),
          ),
        )
        .where(
          and(
            eq(profitabilityEstimateVersions.workspaceId, actor.workspaceId),
            eq(profitabilityEstimateVersions.companyId, companyId),
            eq(profitabilityEstimateVersions.estimateId, estimate.id),
            page.beforeVersionNumber === undefined
              ? undefined
              : lt(
                  profitabilityEstimateVersions.versionNumber,
                  page.beforeVersionNumber,
                ),
          ),
        )
        .orderBy(desc(profitabilityEstimateVersions.versionNumber))
        .limit(page.limit + 1);
      const selected = rows.slice(0, page.limit);
      const last = selected.at(-1);
      return {
        items: selected.map((row) =>
          readProfitabilityVersion(row.version, row.decision),
        ),
        latestVersionNumber: estimate.latestVersionNumber,
        ...(rows.length > page.limit && last
          ? {
              nextCursor: encodeProfitabilityCursor(
                scope,
                last.version.versionNumber,
              ),
            }
          : {}),
      };
    });
  }

  // Driver failures include SQL parameters. Keep confidential inputs out of
  // framework logs and HTTP bodies, including commit-acknowledgement failures.
  // The caller retains its exact key/payload until a durable retry resolves it.
  private async protectedTransaction<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await this.database.transaction(work);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException({
        code: 'PROFITABILITY_COMMAND_FAILED',
        message:
          'The outcome could not be confirmed. Retry with the same command.',
      });
    }
  }

  private async version(
    actor: ActorContext,
    companyId: string,
    opportunityId: string,
    versionId: string,
  ) {
    if (!UUID_GRAMMAR.test(versionId)) throw new NotFoundException();
    const [version] = await this.database.connection
      .select()
      .from(profitabilityEstimateVersions)
      .where(
        and(
          eq(profitabilityEstimateVersions.workspaceId, actor.workspaceId),
          eq(profitabilityEstimateVersions.companyId, companyId),
          eq(profitabilityEstimateVersions.opportunityId, opportunityId),
          eq(profitabilityEstimateVersions.id, versionId.toLowerCase()),
        ),
      );
    if (!version) throw new NotFoundException();
    return version;
  }

  private async recordReceipt(
    actor: ActorContext,
    companyId: string,
    commandKind: ProfitabilityCommandKind,
    idempotencyKey: string,
    fingerprint: string,
    response: ProfitabilityVersionRecord,
    createdAt: Date,
  ) {
    await this.database.connection
      .insert(profitabilityEstimateReceipts)
      .values({
        workspaceId: actor.workspaceId,
        companyId,
        actorWorkspaceMembershipId: actor.workspaceMembershipId,
        commandKind,
        idempotencyKey,
        fingerprint,
        response,
        versionId: response.id,
        opportunityId: response.opportunityId,
        createdAt,
      });
  }
}
