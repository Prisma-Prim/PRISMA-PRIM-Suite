import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import {
  COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE,
  COMPANY_PROFITABILITY_DIRECTOR_BUNDLE,
} from '../access/company-permissions.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  companies,
  companyRoleAssignments,
  internalUsers,
  profitabilityCommandReceipts,
  profitabilityDecisions,
  profitabilityDirectCostLines,
  profitabilityEstimates,
  profitabilityEstimateVersions,
  workspaceMemberships,
} from '../database/schema/index.js';
import { calculateProfitability } from './profitability-calculation.js';
import type {
  ProfitabilityDecisionCode,
  ProfitabilityVersionRecord,
  SubmitProfitabilityCommand,
} from './profitability.types.js';
import {
  readDecideProfitabilityCommand,
  readSubmitProfitabilityCommand,
} from './profitability-validation.js';

type VersionRow = typeof profitabilityEstimateVersions.$inferSelect;
type DecisionRow = typeof profitabilityDecisions.$inferSelect;
const RULE = {
  id: 'CONFIRMED_COST_PROFITABILITY',
  version: 1,
  roundingMode: 'HALF_UP',
  scale: 2,
} as const;

@Injectable()
export class ProfitabilityService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly intake: CommercialIntakeService,
    private readonly accountability: AccountabilityService,
  ) {}

  async submit(
    actor: ActorContext,
    opportunityId: string,
    value: unknown,
    keyValue: string | undefined,
  ): Promise<ProfitabilityVersionRecord> {
    return this.database.transaction(async () => {
      const companyId = await this.requireAuthority(actor, 'contributor', true);
      const opportunity = await this.intake.requireReadablePricingOpportunity(
        actor,
        opportunityId,
      );
      const key = requireIdempotencyKey(keyValue);
      const fingerprint = this.fingerprint({
        opportunityId: opportunity.id,
        payload: value,
      });
      await this.lockCommand(actor, companyId, 'submit', key);
      const replay = await this.receipt(actor, companyId, 'submit', key);
      if (replay)
        return this.replay(replay.fingerprint, fingerprint, replay.result);
      const command = readSubmitProfitabilityCommand(value);
      await this.scopeLock(actor, companyId, opportunity.id);
      const [head] = await this.database.connection
        .select()
        .from(profitabilityEstimates)
        .where(
          and(
            eq(profitabilityEstimates.workspaceId, actor.workspaceId),
            eq(profitabilityEstimates.companyId, companyId),
            eq(profitabilityEstimates.opportunityId, opportunity.id),
          ),
        )
        .for('update');
      const actualHead = head?.latestVersionNumber ?? null;
      if (actualHead !== command.expectedLatestVersion)
        throw new ConflictException({
          code: 'STALE_PROFITABILITY_HEAD',
          expected: command.expectedLatestVersion,
          actual: actualHead,
        });
      const estimateId = head?.id ?? randomUUID();
      const versionId = randomUUID();
      const versionNumber = (actualHead ?? 0) + 1;
      const occurredAt = new Date();
      const calculation = calculateProfitability({
        price: command.proposedPrice,
        target: command.targetProfitability,
        costs: [
          command.executorCost,
          command.fiscalCost,
          command.allocatedOverhead,
          ...command.directCosts.map((line) => line.amount),
        ],
      });
      if (!head)
        await this.database.connection.insert(profitabilityEstimates).values({
          id: estimateId,
          workspaceId: actor.workspaceId,
          companyId,
          opportunityId: opportunity.id,
          clientRequestId: opportunity.clientRequestId,
          latestVersionNumber: 1,
        });
      else
        await this.database.connection
          .update(profitabilityEstimates)
          .set({ latestVersionNumber: versionNumber })
          .where(eq(profitabilityEstimates.id, estimateId));
      let predecessorVersionId: string | null = null;
      if (actualHead !== null) {
        const [predecessor] = await this.database.connection
          .select({ id: profitabilityEstimateVersions.id })
          .from(profitabilityEstimateVersions)
          .where(
            and(
              eq(profitabilityEstimateVersions.estimateId, estimateId),
              eq(profitabilityEstimateVersions.versionNumber, actualHead),
            ),
          );
        if (!predecessor)
          throw new Error('The protected estimate head is unavailable.');
        predecessorVersionId = predecessor.id;
      }
      await this.database.connection
        .insert(profitabilityEstimateVersions)
        .values({
          id: versionId,
          workspaceId: actor.workspaceId,
          companyId,
          estimateId,
          opportunityId: opportunity.id,
          clientRequestId: opportunity.clientRequestId,
          versionNumber,
          predecessorVersionId,
          currency: command.currency,
          executorType: command.executorType,
          executorCost: command.executorCost,
          fiscalCost: command.fiscalCost,
          allocatedOverhead: command.allocatedOverhead,
          targetProfitability: command.targetProfitability,
          proposedPrice: command.proposedPrice,
          pricingIntent: command.pricingIntent,
          strategicReason: command.strategicReason,
          costComplete: 'true',
          noKnownDuplicate: 'true',
          ...calculation,
          calculationRuleId: RULE.id,
          calculationRuleVersion: RULE.version,
          roundingMode: RULE.roundingMode,
          roundingScale: RULE.scale,
          createdByInternalUserId: actor.internalUserId,
          createdByWorkspaceMembershipId: actor.workspaceMembershipId,
          createdAt: occurredAt,
        });
      if (command.directCosts.length > 0)
        await this.database.connection
          .insert(profitabilityDirectCostLines)
          .values(
            command.directCosts.map((line, index) => ({
              id: randomUUID(),
              workspaceId: actor.workspaceId,
              companyId,
              estimateVersionId: versionId,
              position: index + 1,
              lineKey: line.key,
              category: line.category,
              label: line.label,
              currency: line.currency,
              amount: line.amount,
            })),
          );
      const result = this.commandResult(actor, command, {
        estimateId,
        versionId,
        versionNumber,
        predecessorVersionId,
        opportunityId: opportunity.id,
        clientRequestId: opportunity.clientRequestId,
        calculation,
        occurredAt,
      });
      await this.database.connection
        .insert(profitabilityCommandReceipts)
        .values({
          id: randomUUID(),
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          commandKind: 'submit',
          requestKey: key,
          fingerprint,
          result,
          createdAt: occurredAt,
        });
      await this.accountability.recordProfitabilityEvent({
        actor,
        companyId,
        estimateId,
        estimateVersionId: versionId,
        versionNumber,
        action: 'profitability_estimate_version.created',
        occurredAt,
      });
      return result;
    });
  }

  async decide(
    actor: ActorContext,
    opportunityId: string,
    versionId: string,
    value: unknown,
    keyValue: string | undefined,
  ): Promise<ProfitabilityVersionRecord> {
    return this.database.transaction(async () => {
      const companyId = await this.requireAuthority(actor, 'director', true);
      const opportunity = await this.intake.requireReadablePricingOpportunity(
        actor,
        opportunityId,
      );
      const key = requireIdempotencyKey(keyValue);
      const fingerprint = this.fingerprint({
        opportunityId: opportunity.id,
        versionId,
        payload: value,
      });
      await this.lockCommand(actor, companyId, 'decide', key);
      const replay = await this.receipt(actor, companyId, 'decide', key);
      if (replay)
        return this.replay(replay.fingerprint, fingerprint, replay.result);
      const command = readDecideProfitabilityCommand(value);
      const version = await this.version(
        actor,
        companyId,
        opportunity.id,
        versionId,
        command.versionNumber,
        true,
      );
      if (!version) throw new NotFoundException();
      const [existing] = await this.database.connection
        .select()
        .from(profitabilityDecisions)
        .where(
          and(
            eq(profitabilityDecisions.workspaceId, actor.workspaceId),
            eq(profitabilityDecisions.companyId, companyId),
            eq(profitabilityDecisions.estimateVersionId, version.id),
          ),
        )
        .limit(1);
      if (existing)
        throw new ConflictException({
          code: 'PROFITABILITY_VERSION_ALREADY_DECIDED',
        });
      const decisionId = randomUUID();
      const occurredAt = new Date();
      await this.database.connection.insert(profitabilityDecisions).values({
        id: decisionId,
        workspaceId: actor.workspaceId,
        companyId,
        estimateVersionId: version.id,
        versionNumber: version.versionNumber,
        code: command.code,
        decidedByInternalUserId: actor.internalUserId,
        decidedByWorkspaceMembershipId: actor.workspaceMembershipId,
        decidedAt: occurredAt,
      });
      const result = await this.hydrate(
        version,
        {
          id: decisionId,
          workspaceId: actor.workspaceId,
          companyId,
          estimateVersionId: version.id,
          versionNumber: version.versionNumber,
          code: command.code,
          decidedByInternalUserId: actor.internalUserId,
          decidedByWorkspaceMembershipId: actor.workspaceMembershipId,
          decidedAt: occurredAt,
        },
        actor.displayName,
      );
      await this.database.connection
        .insert(profitabilityCommandReceipts)
        .values({
          id: randomUUID(),
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          commandKind: 'decide',
          requestKey: key,
          fingerprint,
          result,
          createdAt: occurredAt,
        });
      await this.accountability.recordProfitabilityEvent({
        actor,
        companyId,
        estimateId: version.estimateId,
        estimateVersionId: version.id,
        versionNumber: version.versionNumber,
        action: 'profitability_estimate_version.decided',
        decisionCode: command.code,
        occurredAt,
      });
      return result;
    });
  }

  async list(
    actor: ActorContext,
    opportunityId: string,
    cursorValue: unknown,
    limitValue: unknown,
  ) {
    return this.database.transaction(async () => {
      const companyId = await this.requireAuthority(actor, 'read', false);
      const opportunity = await this.intake.requireReadablePricingOpportunity(
        actor,
        opportunityId,
      );
      const cursor =
        cursorValue === undefined
          ? undefined
          : this.positiveInteger(cursorValue, 'cursor');
      const limit =
        limitValue === undefined
          ? 25
          : Math.min(this.positiveInteger(limitValue, 'limit'), 50);
      const rows = await this.database.connection
        .select()
        .from(profitabilityEstimateVersions)
        .where(
          and(
            eq(profitabilityEstimateVersions.workspaceId, actor.workspaceId),
            eq(profitabilityEstimateVersions.companyId, companyId),
            eq(profitabilityEstimateVersions.opportunityId, opportunity.id),
            cursor === undefined
              ? undefined
              : lt(profitabilityEstimateVersions.versionNumber, cursor),
          ),
        )
        .orderBy(desc(profitabilityEstimateVersions.versionNumber))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      return {
        versions: await Promise.all(page.map((row) => this.hydrate(row))),
        nextCursor:
          rows.length > limit
            ? String(page[page.length - 1]?.versionNumber)
            : null,
      };
    });
  }

  async read(actor: ActorContext, opportunityId: string, versionId: string) {
    return this.database.transaction(async () => {
      const companyId = await this.requireAuthority(actor, 'read', false);
      const opportunity = await this.intake.requireReadablePricingOpportunity(
        actor,
        opportunityId,
      );
      const row = await this.version(
        actor,
        companyId,
        opportunity.id,
        versionId,
      );
      if (!row) throw new NotFoundException();
      return this.hydrate(row);
    });
  }

  private async requireAuthority(
    actor: ActorContext,
    kind: 'read' | 'contributor' | 'director',
    lock: boolean,
  ): Promise<string> {
    const companyId = actor.activeCompany?.id;
    if (!companyId) throw new ForbiddenException();
    const bundles =
      kind === 'contributor'
        ? [COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE]
        : kind === 'director'
          ? [COMPANY_PROFITABILITY_DIRECTOR_BUNDLE]
          : [
              COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE,
              COMPANY_PROFITABILITY_DIRECTOR_BUNDLE,
            ];
    const query = this.database.connection
      .select({ id: companyRoleAssignments.id })
      .from(companyRoleAssignments)
      .innerJoin(
        workspaceMemberships,
        and(
          eq(
            workspaceMemberships.workspaceId,
            companyRoleAssignments.workspaceId,
          ),
          eq(
            workspaceMemberships.id,
            companyRoleAssignments.workspaceMembershipId,
          ),
          eq(workspaceMemberships.internalUserId, actor.internalUserId),
          eq(workspaceMemberships.status, 'active'),
        ),
      )
      .innerJoin(
        internalUsers,
        and(
          eq(internalUsers.id, workspaceMemberships.internalUserId),
          eq(internalUsers.status, 'active'),
        ),
      )
      .innerJoin(
        companies,
        and(
          eq(companies.workspaceId, companyRoleAssignments.workspaceId),
          eq(companies.id, companyRoleAssignments.companyId),
          eq(companies.status, 'active'),
        ),
      )
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(companyRoleAssignments.companyId, companyId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          sql`${companyRoleAssignments.bundle} IN (${sql.join(
            bundles.map((bundle) => sql`${bundle}`),
            sql`, `,
          )})`,
          eq(companyRoleAssignments.permissionSetVersion, 'v1'),
          sql`${companyRoleAssignments.revokedAt} IS NULL`,
        ),
      );
    const rows = lock ? await query.for('share') : await query;
    if (rows.length === 0) throw new ForbiddenException();
    return companyId;
  }
  private fingerprint(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
  private async lockCommand(
    actor: ActorContext,
    companyId: string,
    kind: string,
    key: string,
  ) {
    await this.database.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.workspaceId}:${companyId}:${actor.workspaceMembershipId}:${kind}:${key}`}, 0))`,
    );
  }
  private async scopeLock(
    actor: ActorContext,
    companyId: string,
    opportunityId: string,
  ) {
    await this.database.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.workspaceId}:${companyId}:${opportunityId}:profitability`}, 0))`,
    );
  }
  private async receipt(
    actor: ActorContext,
    companyId: string,
    kind: string,
    key: string,
  ) {
    const [row] = await this.database.connection
      .select()
      .from(profitabilityCommandReceipts)
      .where(
        and(
          eq(profitabilityCommandReceipts.workspaceId, actor.workspaceId),
          eq(profitabilityCommandReceipts.companyId, companyId),
          eq(
            profitabilityCommandReceipts.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(profitabilityCommandReceipts.commandKind, kind),
          eq(profitabilityCommandReceipts.requestKey, key),
        ),
      )
      .limit(1);
    return row;
  }
  private replay(
    stored: string,
    submitted: string,
    result: ProfitabilityVersionRecord,
  ): ProfitabilityVersionRecord {
    if (stored !== submitted)
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
    return result;
  }
  private async version(
    actor: ActorContext,
    companyId: string,
    opportunityId: string,
    versionId: string,
    number?: number,
    lock = false,
  ) {
    const query = this.database.connection
      .select()
      .from(profitabilityEstimateVersions)
      .where(
        and(
          eq(profitabilityEstimateVersions.workspaceId, actor.workspaceId),
          eq(profitabilityEstimateVersions.companyId, companyId),
          eq(profitabilityEstimateVersions.opportunityId, opportunityId),
          eq(profitabilityEstimateVersions.id, versionId),
          number === undefined
            ? undefined
            : eq(profitabilityEstimateVersions.versionNumber, number),
        ),
      )
      .limit(1);
    const [row] = lock ? await query.for('update') : await query;
    return row;
  }
  private positiveInteger(value: unknown, field: string): number {
    const parsed =
      typeof value === 'string' && /^[1-9][0-9]*$/.test(value)
        ? Number(value)
        : NaN;
    if (!Number.isSafeInteger(parsed))
      throw new NotFoundException(`Invalid ${field}.`);
    return parsed;
  }
  private commandResult(
    actor: ActorContext,
    command: SubmitProfitabilityCommand,
    stored: {
      estimateId: string;
      versionId: string;
      versionNumber: number;
      predecessorVersionId: string | null;
      opportunityId: string;
      clientRequestId: string;
      calculation: ReturnType<typeof calculateProfitability>;
      occurredAt: Date;
    },
  ): ProfitabilityVersionRecord {
    return {
      estimateId: stored.estimateId,
      versionId: stored.versionId,
      versionNumber: stored.versionNumber,
      predecessorVersionId: stored.predecessorVersionId,
      opportunityId: stored.opportunityId,
      clientRequestId: stored.clientRequestId,
      currency: command.currency,
      executorType: command.executorType,
      executorCost: command.executorCost,
      fiscalCost: command.fiscalCost,
      allocatedOverhead: command.allocatedOverhead,
      directCosts: command.directCosts,
      targetProfitability: command.targetProfitability,
      proposedPrice: command.proposedPrice,
      pricingIntent: command.pricingIntent,
      strategicReason: command.strategicReason,
      costComplete: true,
      noKnownDuplicate: true,
      ...stored.calculation,
      calculationRule: RULE,
      createdBy: {
        workspaceMembershipId: actor.workspaceMembershipId,
        displayName: actor.displayName,
      },
      createdAt: stored.occurredAt.toISOString(),
      decision: null,
    };
  }
  private async hydrate(
    row: VersionRow,
    decisionInput?: DecisionRow,
    actorDisplayName?: string,
  ): Promise<ProfitabilityVersionRecord> {
    const lines = await this.database.connection
      .select()
      .from(profitabilityDirectCostLines)
      .where(eq(profitabilityDirectCostLines.estimateVersionId, row.id))
      .orderBy(profitabilityDirectCostLines.position);
    const decision =
      decisionInput ??
      (
        await this.database.connection
          .select()
          .from(profitabilityDecisions)
          .where(eq(profitabilityDecisions.estimateVersionId, row.id))
          .limit(1)
      )[0];
    const [creator] = await this.database.connection
      .select({ displayName: internalUsers.displayName })
      .from(internalUsers)
      .where(eq(internalUsers.id, row.createdByInternalUserId));
    let decidedBy: string | undefined = actorDisplayName;
    if (decision && decidedBy === undefined)
      decidedBy = (
        await this.database.connection
          .select({ displayName: internalUsers.displayName })
          .from(internalUsers)
          .where(eq(internalUsers.id, decision.decidedByInternalUserId))
          .limit(1)
      )[0]?.displayName;
    const code = decision ? decisionCode(decision.code) : undefined;
    return {
      estimateId: row.estimateId,
      versionId: row.id,
      versionNumber: row.versionNumber,
      predecessorVersionId: row.predecessorVersionId,
      opportunityId: row.opportunityId,
      clientRequestId: row.clientRequestId,
      currency: row.currency,
      executorType: row.executorType,
      executorCost: row.executorCost,
      fiscalCost: row.fiscalCost,
      allocatedOverhead: row.allocatedOverhead,
      directCosts: lines.map((line) => ({
        key: line.lineKey,
        category: directCategory(line.category),
        label: line.label,
        currency: line.currency,
        amount: line.amount,
      })),
      targetProfitability: row.targetProfitability,
      proposedPrice: row.proposedPrice,
      pricingIntent: row.pricingIntent,
      strategicReason: row.strategicReason,
      costComplete: true,
      noKnownDuplicate: true,
      totalCost: row.totalCost,
      profit: row.profit,
      estimatedProfitability: row.estimatedProfitability,
      targetDifference: row.targetDifference,
      calculationRule: RULE,
      createdBy: {
        workspaceMembershipId: row.createdByWorkspaceMembershipId,
        displayName: creator?.displayName ?? 'Unavailable member',
      },
      createdAt: row.createdAt.toISOString(),
      decision:
        decision && code
          ? {
              id: decision.id,
              code,
              decidedBy: {
                workspaceMembershipId: decision.decidedByWorkspaceMembershipId,
                displayName: decidedBy ?? 'Unavailable member',
              },
              decidedAt: decision.decidedAt.toISOString(),
            }
          : null,
    };
  }
}

function decisionCode(value: string): ProfitabilityDecisionCode {
  if (value === 'APPROVE' || value === 'MODIFY' || value === 'REJECT')
    return value;
  throw new Error('Stored decision code is unsupported.');
}
function directCategory(value: string) {
  if (
    value === 'PATENT_COST' ||
    value === 'TRAVEL' ||
    value === 'SUBCONTRACTOR' ||
    value === 'TRANSLATION_MATERIAL_CONSUMABLE' ||
    value === 'OTHER_PROJECT_DIRECT'
  )
    return value;
  throw new Error('Stored direct-cost category is unsupported.');
}
