import { BadRequestException, ConflictException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ActorContext } from '../access/access.types.js';
import { pricingConfigurationCommands } from '../database/schema/index.js';
import type { EffectiveDatedPublicationRejection } from './effective-dated-version.policy.js';
import type { VersionSupersession } from './pricing-configuration.types.js';

// Mechanics every effective-dated publication of the pricing configuration
// shares: one idempotency namespace per (actor, Company, key) across rule and
// tariff publications, one transaction-scoped protection per scope, and the
// same named refusals.

type ReceiptRow = typeof pricingConfigurationCommands.$inferSelect;

export interface PublicationReceipt {
  readonly command: 'pricing_rule_version.publish' | 'tariff_version.publish';
  readonly fingerprint: string;
  readonly outcome: 'PUBLISHED' | 'UNCHANGED';
  readonly versionId: string;
}

export interface PricingSnapshotReceipt {
  readonly command: 'pricing_snapshot.calculate';
  readonly fingerprint: string;
  readonly outcome: 'CREATED';
  readonly snapshotId: string;
}

export type PricingCommandReceipt = PublicationReceipt | PricingSnapshotReceipt;

// A Company's Pricing Rule Versions form one scope; each offering's Tariff
// Versions form another. A scope's protection exists before its first
// version and never serializes another scope.
export type PublicationScope =
  | {
      readonly kind: 'rule';
      readonly workspaceId: string;
      readonly companyId: string;
    }
  | {
      readonly kind: 'tariff';
      readonly workspaceId: string;
      readonly companyId: string;
      readonly offeringId: string;
    };

export type VersionSubject = 'Pricing Rule Version' | 'Tariff Version';

// A publication holds its scope exclusively from before its publication
// instant until its transaction ends. A read, a version list, a by-id read and
// a replay hold it shared, and only then sample their own instant.
export async function lockPublicationScope(
  connection: NodePgDatabase,
  scope: PublicationScope,
  mode: 'exclusive' | 'shared',
): Promise<void> {
  const lockKey = JSON.stringify(
    scope.kind === 'rule'
      ? ['pricing-configuration.rule-scope', scope.workspaceId, scope.companyId]
      : [
          'pricing-configuration.tariff-scope',
          scope.workspaceId,
          scope.companyId,
          scope.offeringId,
        ],
  );
  await connection.execute(
    mode === 'exclusive'
      ? sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
      : sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${lockKey}, 0))`,
  );
}

// Serializes every command of one (actor, Company, key), whatever it
// publishes, so concurrent exact retries converge on one receipt.
export async function lockPublicationCommand(
  connection: NodePgDatabase,
  {
    actor,
    companyId,
    idempotencyKey,
  }: { actor: ActorContext; companyId: string; idempotencyKey: string },
): Promise<void> {
  const lockKey = JSON.stringify([
    'pricing-configuration.command',
    actor.workspaceId,
    companyId,
    actor.workspaceMembershipId,
    idempotencyKey,
  ]);
  await connection.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
  );
}

export async function findPublicationReceipt(
  connection: NodePgDatabase,
  {
    actor,
    companyId,
    idempotencyKey,
  }: { actor: ActorContext; companyId: string; idempotencyKey: string },
): Promise<PricingCommandReceipt | undefined> {
  const [receipt] = await connection
    .select()
    .from(pricingConfigurationCommands)
    .where(
      and(
        eq(pricingConfigurationCommands.workspaceId, actor.workspaceId),
        eq(pricingConfigurationCommands.companyId, companyId),
        eq(
          pricingConfigurationCommands.actorWorkspaceMembershipId,
          actor.workspaceMembershipId,
        ),
        eq(pricingConfigurationCommands.idempotencyKey, idempotencyKey),
      ),
    );
  return receipt ? pricingCommandReceipt(receipt) : undefined;
}

export async function recordPublicationReceipt(
  connection: NodePgDatabase,
  input: {
    actor: ActorContext;
    companyId: string;
    idempotencyKey: string;
    receipt: PublicationReceipt;
    createdAt: Date;
  },
): Promise<void> {
  const { command, fingerprint, outcome, versionId } = input.receipt;
  await connection.insert(pricingConfigurationCommands).values({
    workspaceId: input.actor.workspaceId,
    companyId: input.companyId,
    actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
    command,
    idempotencyKey: input.idempotencyKey,
    fingerprint,
    outcome,
    resultPricingRuleVersionId:
      command === 'pricing_rule_version.publish' ? versionId : null,
    resultTariffVersionId:
      command === 'tariff_version.publish' ? versionId : null,
    resultPricingSnapshotId: null,
    createdAt: input.createdAt,
  });
}

export async function recordPricingSnapshotReceipt(
  connection: NodePgDatabase,
  input: {
    actor: ActorContext;
    companyId: string;
    idempotencyKey: string;
    fingerprint: string;
    snapshotId: string;
    createdAt: Date;
  },
): Promise<void> {
  await connection.insert(pricingConfigurationCommands).values({
    workspaceId: input.actor.workspaceId,
    companyId: input.companyId,
    actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
    command: 'pricing_snapshot.calculate',
    idempotencyKey: input.idempotencyKey,
    fingerprint: input.fingerprint,
    outcome: 'CREATED',
    resultPricingRuleVersionId: null,
    resultTariffVersionId: null,
    resultPricingSnapshotId: input.snapshotId,
    createdAt: input.createdAt,
  });
}

// The database check keeps exactly one result reference, of the command's
// own kind; a stored receipt that breaks it is not replayed.
function pricingCommandReceipt(row: ReceiptRow): PricingCommandReceipt {
  switch (row.command) {
    case 'pricing_rule_version.publish':
    case 'tariff_version.publish': {
      const [versionId, otherVersionId] =
        row.command === 'pricing_rule_version.publish'
          ? [row.resultPricingRuleVersionId, row.resultTariffVersionId]
          : [row.resultTariffVersionId, row.resultPricingRuleVersionId];
      if (
        versionId === null ||
        otherVersionId !== null ||
        row.resultPricingSnapshotId !== null ||
        (row.outcome !== 'PUBLISHED' && row.outcome !== 'UNCHANGED')
      )
        throw new Error('The pricing publication receipt is incomplete.');
      return {
        command: row.command,
        fingerprint: row.fingerprint,
        outcome: row.outcome,
        versionId,
      };
    }
    case 'pricing_snapshot.calculate':
      if (
        row.outcome !== 'CREATED' ||
        row.resultPricingSnapshotId === null ||
        row.resultPricingRuleVersionId !== null ||
        row.resultTariffVersionId !== null
      )
        throw new Error('The Pricing Snapshot receipt is incomplete.');
      return {
        command: row.command,
        fingerprint: row.fingerprint,
        outcome: row.outcome,
        snapshotId: row.resultPricingSnapshotId,
      };
    default:
      return assertNever(row.command);
  }
}

// Contract REST tests still import the fingerprint from here; the command
// module owns it.
export { commandFingerprint } from '../command/idempotent-command.js';

export function idempotencyConflict(): ConflictException {
  return new ConflictException({
    code: 'IDEMPOTENCY_CONFLICT',
    message: 'Idempotency-Key was already used for another command.',
  });
}

// Names only the scope's current head number.
export function staleHeadConflict(
  subject: VersionSubject,
  headVersionNumber: number | null,
): ConflictException {
  return new ConflictException({
    code: 'STALE_ACTIVE_VERSION',
    message: `Another ${subject} is now the head. Reload before publishing.`,
    headVersionNumber,
  });
}

export function publicationRejection(
  code: EffectiveDatedPublicationRejection,
  subject: VersionSubject,
): BadRequestException | ConflictException {
  switch (code) {
    case 'EFFECTIVE_FROM_PAST':
      return new BadRequestException({
        code,
        field: 'effectiveFrom',
        message: 'Choose a start that is not earlier than now.',
      });
    case 'EFFECTIVE_FROM_NOT_ADVANCING':
      return new BadRequestException({
        code,
        field: 'effectiveFrom',
        message: 'Choose a start later than the head version start.',
      });
    case 'EFFECTIVE_WINDOW_GAP':
      return new ConflictException({
        code,
        message:
          'The head version ends before this start. Choose a start no later than its end.',
      });
    case 'VERSION_EXHAUSTED':
      return new ConflictException({
        code,
        message: `The ${subject} number cannot be incremented.`,
      });
    default:
      return assertNever(code);
  }
}

// The database check keeps the three selection columns all set or all empty.
export function supersessionOf(row: {
  readonly supersededByVersionId: string | null;
  readonly supersededAt: Date | null;
  readonly supersededFrom: Date | null;
}): VersionSupersession | null {
  const { supersededByVersionId, supersededAt, supersededFrom } = row;
  if (
    supersededByVersionId === null &&
    supersededAt === null &&
    supersededFrom === null
  )
    return null;
  if (
    supersededByVersionId === null ||
    supersededAt === null ||
    supersededFrom === null
  )
    throw new Error('The version supersession is incomplete.');
  return {
    supersededByVersionId,
    supersededAt: supersededAt.toISOString(),
    supersededFrom: supersededFrom.toISOString(),
  };
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled publication decision: ${String(value)}`);
}
