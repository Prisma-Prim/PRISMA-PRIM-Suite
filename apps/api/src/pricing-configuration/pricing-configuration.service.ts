import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gt, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  pricingConfigurationCommands,
  pricingRuleVersions,
} from '../database/schema/index.js';
import {
  readPricingConfigurationLimit,
  readRuleVersionCursor,
  ruleVersionCursor,
} from './pricing-configuration-pagination.js';
import type {
  PricingRuleScope,
  PricingRuleVersionPage,
  PricingRuleVersionRecord,
  PricingRuleVersionSupersession,
  PublishPricingRuleVersionResult,
} from './pricing-configuration.types.js';
import {
  decidePricingRulePublication,
  pricingRuleVersionState,
  type PricingRulePublicationRejection,
} from './pricing-rule-version.policy.js';
import { readPublishPricingRuleVersionCommand } from './pricing-rule-version.validation.js';

type VersionRow = typeof pricingRuleVersions.$inferSelect;
type ReceiptRow = typeof pricingConfigurationCommands.$inferSelect;

const UUID_GRAMMAR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

// Every publication follows one order: revalidate live authority under a row
// lock, take the idempotency lock and honor an existing receipt, validate the
// payload, lock the Company's rule scope and its head, sample the one server
// instant, then evaluate and commit the version, supersession, event and
// receipt together. The rule-scope lock is held exclusively from before that
// instant until the transaction commits, and every read, replay included,
// samples its own instant only while holding the same lock shared. No reader
// can therefore observe the scope between a publication's instant and its
// commit, so an accepted start never passes while readers still see the
// predecessor.
@Injectable()
export class PricingConfigurationService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  async publishRuleVersion(
    actor: ActorContext,
    value: unknown,
    key: string | undefined,
  ): Promise<PublishPricingRuleVersionResult> {
    return this.databaseContext.transaction(async () => {
      const companyId =
        await this.authorization.requirePricingConfigurationAccess(
          actor,
          ['commercial.pricing.configuration.manage'],
          true,
        );
      const idempotencyKey = requireIdempotencyKey(key);
      const fingerprint = commandFingerprint(companyId, value);
      // The rule scope is the active Company itself, whose liveness the
      // authority check above revalidated: there is no other target to read.
      await this.advisoryLock([
        'pricing-configuration.command',
        actor.workspaceId,
        companyId,
        actor.workspaceMembershipId,
        idempotencyKey,
      ]);
      const receipt = await this.findReceipt(actor, companyId, idempotencyKey);
      if (receipt) {
        // A replay reproduces the recorded result; it never re-evaluates the
        // expected head, so configuration that moved on cannot make it stale.
        if (
          receipt.command !== 'pricing_rule_version.publish' ||
          receipt.fingerprint !== fingerprint
        )
          throw new ConflictException({
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Idempotency-Key was already used for another command.',
          });
        const replayedAt = await this.observeRuleScope(actor, companyId);
        return {
          outcome: receipt.outcome,
          version: versionView(
            await this.requireRecordedVersion(
              actor.workspaceId,
              companyId,
              receipt.resultPricingRuleVersionId,
            ),
            replayedAt,
          ),
        };
      }

      const command = readPublishPricingRuleVersionCommand(value);
      // Serializes every publication in the Company, including two first
      // publications that have no head row to lock, and holds every read of
      // the scope until this publication commits.
      await this.lockRuleScope(actor, companyId, 'exclusive');
      const [head] = await this.databaseContext.connection
        .select()
        .from(pricingRuleVersions)
        .where(
          and(
            eq(pricingRuleVersions.workspaceId, actor.workspaceId),
            eq(pricingRuleVersions.companyId, companyId),
            isNull(pricingRuleVersions.supersededByVersionId),
          ),
        )
        .for('update');
      const now = this.clock.now();
      const decision = decidePricingRulePublication({ head, command, now });
      switch (decision.kind) {
        case 'stale':
          throw new ConflictException({
            code: 'STALE_ACTIVE_VERSION',
            message:
              'Another Pricing Rule Version is now the head. Reload before publishing.',
            headVersionNumber: decision.headVersionNumber,
          });
        case 'rejected':
          throw publicationRejection(decision.code);
        case 'unchanged':
          await this.recordReceipt({
            actor,
            companyId,
            idempotencyKey,
            fingerprint,
            outcome: 'UNCHANGED',
            resultPricingRuleVersionId: decision.head.id,
            createdAt: now,
          });
          return {
            outcome: 'UNCHANGED',
            version: versionView(decision.head, now),
          };
        case 'publish': {
          const versionId = randomUUID();
          // The takeover is written before the successor row exists so the
          // Company never holds two heads; the deferred successor key is
          // verified when this transaction commits.
          if (decision.predecessor) {
            const [takenOver] = await this.databaseContext.connection
              .update(pricingRuleVersions)
              .set({
                supersededByVersionId: versionId,
                supersededAt: now,
                supersededFrom: command.effectiveFrom,
              })
              .where(
                and(
                  eq(pricingRuleVersions.workspaceId, actor.workspaceId),
                  eq(pricingRuleVersions.companyId, companyId),
                  eq(pricingRuleVersions.id, decision.predecessor.id),
                  isNull(pricingRuleVersions.supersededByVersionId),
                ),
              )
              .returning({ id: pricingRuleVersions.id });
            if (!takenOver)
              throw new Error(
                'The locked Pricing Rule head was not taken over.',
              );
          }
          const [version] = await this.databaseContext.connection
            .insert(pricingRuleVersions)
            .values({
              id: versionId,
              workspaceId: actor.workspaceId,
              companyId,
              versionNumber: decision.versionNumber,
              label: command.label,
              effectiveFrom: command.effectiveFrom,
              effectiveTo: command.effectiveTo,
              createdByInternalUserId: actor.internalUserId,
              createdByWorkspaceMembershipId: actor.workspaceMembershipId,
              createdAt: now,
            })
            .returning();
          if (!version)
            throw new Error('The Pricing Rule Version was not recorded.');
          await this.accountability.recordPricingRuleVersionPublished({
            actor,
            companyId,
            pricingRuleVersionId: version.id,
            versionNumber: version.versionNumber,
            occurredAt: now,
          });
          await this.recordReceipt({
            actor,
            companyId,
            idempotencyKey,
            fingerprint,
            outcome: 'PUBLISHED',
            resultPricingRuleVersionId: version.id,
            createdAt: now,
          });
          return { outcome: 'PUBLISHED', version: versionView(version, now) };
        }
        default:
          return assertNever(decision);
      }
    });
  }

  async readRuleScope(actor: ActorContext): Promise<PricingRuleScope> {
    return this.databaseContext.transaction(async () => {
      const companyId =
        await this.authorization.requirePricingConfigurationAccess(actor, [
          'commercial.pricing.configuration.read',
        ]);
      const now = await this.observeRuleScope(actor, companyId);
      // One statement returns the head and the version CURRENT at the request
      // instant, so both answers come from the same snapshot.
      const rows = await this.databaseContext.connection
        .select()
        .from(pricingRuleVersions)
        .where(
          and(
            eq(pricingRuleVersions.workspaceId, actor.workspaceId),
            eq(pricingRuleVersions.companyId, companyId),
            or(
              isNull(pricingRuleVersions.supersededByVersionId),
              and(
                lte(pricingRuleVersions.effectiveFrom, now),
                or(
                  isNull(pricingRuleVersions.effectiveTo),
                  gt(pricingRuleVersions.effectiveTo, now),
                ),
                or(
                  isNull(pricingRuleVersions.supersededFrom),
                  gt(pricingRuleVersions.supersededFrom, now),
                ),
              ),
            ),
          ),
        );
      const head = rows.find((row) => row.supersededByVersionId === null);
      const current = rows.find(
        (row) => pricingRuleVersionState(row, now) === 'CURRENT',
      );
      return {
        current: current ? versionView(current, now) : null,
        headVersionNumber: head?.versionNumber ?? null,
        provisional: true,
      };
    });
  }

  async listRuleVersions(
    actor: ActorContext,
    cursorInput: unknown,
    limitInput: unknown,
  ): Promise<PricingRuleVersionPage> {
    return this.databaseContext.transaction(async () => {
      const companyId =
        await this.authorization.requirePricingConfigurationAccess(actor, [
          'commercial.pricing.configuration.read',
        ]);
      const limit = readPricingConfigurationLimit(limitInput);
      const cursor = readRuleVersionCursor(cursorInput);
      const now = await this.observeRuleScope(actor, companyId);
      const rows = await this.databaseContext.connection
        .select()
        .from(pricingRuleVersions)
        .where(
          and(
            eq(pricingRuleVersions.workspaceId, actor.workspaceId),
            eq(pricingRuleVersions.companyId, companyId),
            cursor === undefined
              ? undefined
              : lt(pricingRuleVersions.versionNumber, cursor),
          ),
        )
        .orderBy(desc(pricingRuleVersions.versionNumber))
        .limit(limit + 1);
      const pageRows = rows.slice(0, limit);
      const last = pageRows.at(-1);
      return {
        items: pageRows.map((row) => versionView(row, now)),
        ...(rows.length > limit && last
          ? { nextCursor: ruleVersionCursor(last.versionNumber) }
          : {}),
        provisional: true,
      };
    });
  }

  async readRuleVersion(
    actor: ActorContext,
    versionId: string,
  ): Promise<PricingRuleVersionRecord> {
    return this.databaseContext.transaction(async () => {
      const companyId =
        await this.authorization.requirePricingConfigurationAccess(actor, [
          'commercial.pricing.configuration.read',
        ]);
      // A malformed, unknown, cross-Company or cross-Workspace identifier gets
      // the same safe not-found, after authority so nothing is disclosed first.
      if (!UUID_GRAMMAR.test(versionId)) throw new NotFoundException();
      const now = await this.observeRuleScope(actor, companyId);
      const version = await this.findVersion(
        actor.workspaceId,
        companyId,
        versionId.toLowerCase(),
      );
      if (!version) throw new NotFoundException();
      return versionView(version, now);
    });
  }

  // A read samples its instant only after any publication of the Company in
  // flight has committed, then reads the rows, so it sees every publication
  // whose instant precedes its own.
  private async observeRuleScope(
    actor: ActorContext,
    companyId: string,
  ): Promise<Date> {
    await this.lockRuleScope(actor, companyId, 'shared');
    return this.clock.now();
  }

  private async lockRuleScope(
    actor: ActorContext,
    companyId: string,
    mode: 'exclusive' | 'shared',
  ): Promise<void> {
    const lockKey = JSON.stringify([
      'pricing-configuration.rule-scope',
      actor.workspaceId,
      companyId,
    ]);
    await this.databaseContext.connection.execute(
      mode === 'exclusive'
        ? sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
        : sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${lockKey}, 0))`,
    );
  }

  private async findVersion(
    workspaceId: string,
    companyId: string,
    versionId: string,
  ): Promise<VersionRow | undefined> {
    const [version] = await this.databaseContext.connection
      .select()
      .from(pricingRuleVersions)
      .where(
        and(
          eq(pricingRuleVersions.workspaceId, workspaceId),
          eq(pricingRuleVersions.companyId, companyId),
          eq(pricingRuleVersions.id, versionId),
        ),
      );
    return version;
  }

  private async requireRecordedVersion(
    workspaceId: string,
    companyId: string,
    versionId: string,
  ): Promise<VersionRow> {
    const version = await this.findVersion(workspaceId, companyId, versionId);
    if (!version)
      throw new Error('The recorded Pricing Rule Version is unavailable.');
    return version;
  }

  private async advisoryLock(parts: readonly string[]): Promise<void> {
    const lockKey = JSON.stringify(parts);
    await this.databaseContext.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
  }

  private async findReceipt(
    actor: ActorContext,
    companyId: string,
    idempotencyKey: string,
  ): Promise<ReceiptRow | undefined> {
    const [receipt] = await this.databaseContext.connection
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
    return receipt;
  }

  private async recordReceipt(input: {
    actor: ActorContext;
    companyId: string;
    idempotencyKey: string;
    fingerprint: string;
    outcome: ReceiptRow['outcome'];
    resultPricingRuleVersionId: string;
    createdAt: Date;
  }): Promise<void> {
    await this.databaseContext.connection
      .insert(pricingConfigurationCommands)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        command: 'pricing_rule_version.publish',
        idempotencyKey: input.idempotencyKey,
        fingerprint: input.fingerprint,
        outcome: input.outcome,
        resultPricingRuleVersionId: input.resultPricingRuleVersionId,
        createdAt: input.createdAt,
      });
  }
}

function publicationRejection(
  code: PricingRulePublicationRejection,
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
        message: 'The Pricing Rule Version number cannot be incremented.',
      });
    default:
      return assertNever(code);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled publication decision: ${String(value)}`);
}

// The fingerprint covers the Company and the payload exactly as submitted,
// label and instant strings included. It is computed before validation so a
// replay is recognized without re-running any later step of the command.
function commandFingerprint(companyId: string, payload: unknown): string {
  return createHash('sha256')
    .update(stableJson({ companyId, payload }))
    .digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function versionView(row: VersionRow, now: Date): PricingRuleVersionRecord {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    label: row.label,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    ruleShape: row.ruleShape,
    roundingMode: row.roundingMode,
    roundingScale: row.roundingScale,
    taxApplication: row.taxApplication,
    provenance: row.provenance,
    provisional: true,
    state: pricingRuleVersionState(row, now),
    supersession: supersessionOf(row),
    createdByWorkspaceMembershipId: row.createdByWorkspaceMembershipId,
    createdAt: row.createdAt.toISOString(),
  };
}

// The database check keeps the three selection columns all set or all empty.
function supersessionOf(
  row: VersionRow,
): PricingRuleVersionSupersession | null {
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
    throw new Error('The Pricing Rule Version supersession is incomplete.');
  return {
    supersededByVersionId,
    supersededAt: supersededAt.toISOString(),
    supersededFrom: supersededFrom.toISOString(),
  };
}
