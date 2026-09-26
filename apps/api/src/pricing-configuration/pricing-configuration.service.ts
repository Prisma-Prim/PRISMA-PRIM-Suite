import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gt, isNull, lt, lte, or } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { DatabaseContext } from '../database/database-context.js';
import { pricingRuleVersions } from '../database/schema/index.js';
import {
  readPricingConfigurationLimit,
  readVersionCursor,
  versionCursor,
} from './pricing-configuration-pagination.js';
import {
  assertNever,
  commandFingerprint,
  findPublicationReceipt,
  idempotencyConflict,
  lockPublicationCommand,
  lockPublicationScope,
  publicationRejection,
  recordPublicationReceipt,
  staleHeadConflict,
  supersessionOf,
} from './pricing-configuration-publication.js';
import type {
  PricingRuleScope,
  PricingRuleVersionPage,
  PricingRuleVersionRecord,
  PublishPricingRuleVersionResult,
} from './pricing-configuration.types.js';
import {
  decidePricingRulePublication,
  pricingRuleVersionState,
} from './pricing-rule-version.policy.js';
import { readPublishPricingRuleVersionCommand } from './pricing-rule-version.validation.js';

type VersionRow = typeof pricingRuleVersions.$inferSelect;

const UUID_GRAMMAR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

// Every publication follows one order: revalidate live authority under a row
// lock, take the idempotency lock and honor an existing receipt, validate the
// payload, lock the Company's rule scope and its head, sample the one
// publication instant, then evaluate and write the supersession, version,
// event and receipt in one transaction. A result is returned only after that
// transaction commits; a failed write rolls all of them back. The rule-scope
// lock is held exclusively from before that instant until the transaction
// ends, and every read, replay included, samples its own instant only while
// holding the same lock shared. No reader can therefore observe the scope
// between a publication's instant and its end, so an accepted start never
// passes while readers still see the predecessor, and a start that passes
// before the commit never re-decides a publication.
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
      const fingerprint = commandFingerprint({ companyId, payload: value });
      // The rule scope is the active Company itself, whose liveness the
      // authority check above revalidated: there is no other target to read.
      const idempotency = { actor, companyId, idempotencyKey };
      await lockPublicationCommand(
        this.databaseContext.connection,
        idempotency,
      );
      const receipt = await findPublicationReceipt(
        this.databaseContext.connection,
        idempotency,
      );
      if (receipt) {
        // A replay reproduces the recorded result; it never re-evaluates the
        // expected head, so configuration that moved on cannot make it stale.
        if (
          receipt.command !== 'pricing_rule_version.publish' ||
          receipt.fingerprint !== fingerprint
        )
          throw idempotencyConflict();
        const replayedAt = await this.observeRuleScope(actor, companyId);
        return {
          outcome: receipt.outcome,
          version: versionView(
            await this.requireRecordedVersion(
              actor.workspaceId,
              companyId,
              receipt.versionId,
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
          throw staleHeadConflict(
            'Pricing Rule Version',
            decision.headVersionNumber,
          );
        case 'rejected':
          throw publicationRejection(decision.code, 'Pricing Rule Version');
        case 'unchanged':
          await recordPublicationReceipt(this.databaseContext.connection, {
            ...idempotency,
            receipt: {
              command: 'pricing_rule_version.publish',
              fingerprint,
              outcome: 'UNCHANGED',
              versionId: decision.head.id,
            },
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
          await recordPublicationReceipt(this.databaseContext.connection, {
            ...idempotency,
            receipt: {
              command: 'pricing_rule_version.publish',
              fingerprint,
              outcome: 'PUBLISHED',
              versionId: version.id,
            },
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
      const limit = readPricingConfigurationLimit(
        limitInput,
        'Pricing Rule Versions',
      );
      const cursor = readVersionCursor(cursorInput, 'Pricing Rule Versions');
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
          ? { nextCursor: versionCursor(last.versionNumber) }
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
  // flight has committed or rolled back, then reads the rows, so it sees the
  // outcome of every publication whose instant precedes its own.
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
    await lockPublicationScope(
      this.databaseContext.connection,
      { kind: 'rule', workspaceId: actor.workspaceId, companyId },
      mode,
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
