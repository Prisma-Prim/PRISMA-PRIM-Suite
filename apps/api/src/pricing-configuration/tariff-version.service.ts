import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gt, isNull, lt, lte, or } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { CommercialCatalogueService } from '../commercial-catalogue/commercial-catalogue.service.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import { tariffVersions } from '../database/schema/index.js';
import {
  readPricingConfigurationLimit,
  readVersionCursor,
  versionCursor,
} from './pricing-configuration-pagination.js';
import {
  assertNever,
  findPublicationReceipt,
  idempotencyConflict,
  lockPublicationCommand,
  lockPublicationScope,
  publicationRejection,
  recordPublicationReceipt,
  staleHeadConflict,
  supersessionOf,
  type PublicationScope,
} from './pricing-configuration-publication.js';
import type {
  PublishTariffVersionResult,
  TariffScope,
  TariffVersionPage,
  TariffVersionRecord,
} from './pricing-configuration.types.js';
import {
  TAX_RATE_PERCENT_SCALE,
  UNIT_AMOUNT_SCALE,
  decimalAtScale,
} from './pricing-decimal.js';
import {
  decideTariffPublication,
  tariffVersionState,
} from './tariff-version.policy.js';
import { readPublishTariffVersionCommand } from './tariff-version.validation.js';

type VersionRow = typeof tariffVersions.$inferSelect;

// One offering's Tariff scope, resolved from a readable offering.
type OfferingScope = Extract<PublicationScope, { kind: 'tariff' }>;

const UUID_GRAMMAR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

// Tariff Versions follow the Pricing Rule mechanics per offering. A
// publication revalidates live authority under a row lock, then the target
// offering's readability through the catalogue boundary, then takes the
// shared (actor, Company, key) idempotency lock and honors an existing
// receipt, validates the payload, locks the offering's scope and its head,
// samples the one publication instant, and writes the supersession, version,
// event and receipt in one transaction that answers only once committed. The
// offering's scope protection is held exclusively from before that instant
// until the transaction ends; every read, replay included, samples its own
// instant only while holding it shared. Offerings never share a scope, and no
// offering's scope is the Company's rule scope.
@Injectable()
export class TariffVersionService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly catalogue: CommercialCatalogueService,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  async publishTariffVersion(
    actor: ActorContext,
    offeringId: string,
    value: unknown,
    key: string | undefined,
  ): Promise<PublishTariffVersionResult> {
    return this.databaseContext.transaction(async () => {
      const companyId =
        await this.authorization.requirePricingConfigurationAccess(
          actor,
          ['commercial.pricing.configuration.manage'],
          true,
        );
      const scope = await this.requireReadableOffering(
        actor,
        companyId,
        offeringId,
      );
      const idempotencyKey = requireIdempotencyKey(key);
      const fingerprint = commandFingerprint({
        companyId,
        offeringId: scope.offeringId,
        payload: value,
      });
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
        // Its fingerprint names the offering, so its version is in this scope.
        if (
          receipt.command !== 'tariff_version.publish' ||
          receipt.fingerprint !== fingerprint
        )
          throw idempotencyConflict();
        const replayedAt = await this.observe(scope);
        return {
          outcome: receipt.outcome,
          version: tariffVersionView(
            await this.requireRecordedVersion(scope, receipt.versionId),
            replayedAt,
          ),
        };
      }

      const command = readPublishTariffVersionCommand(value);
      // Serializes every publication of the offering, including two first
      // publications that have no head row to lock, and holds every read of
      // the offering's scope until this publication commits.
      await lockPublicationScope(
        this.databaseContext.connection,
        scope,
        'exclusive',
      );
      const [head] = await this.databaseContext.connection
        .select()
        .from(tariffVersions)
        .where(
          and(inScope(scope), isNull(tariffVersions.supersededByVersionId)),
        )
        .for('update');
      const now = this.clock.now();
      const decision = decideTariffPublication({ head, command, now });
      switch (decision.kind) {
        case 'stale':
          throw staleHeadConflict('Tariff Version', decision.headVersionNumber);
        case 'rejected':
          throw publicationRejection(decision.code, 'Tariff Version');
        case 'unchanged':
          await recordPublicationReceipt(this.databaseContext.connection, {
            ...idempotency,
            receipt: {
              command: 'tariff_version.publish',
              fingerprint,
              outcome: 'UNCHANGED',
              versionId: decision.head.id,
            },
            createdAt: now,
          });
          return {
            outcome: 'UNCHANGED',
            version: tariffVersionView(decision.head, now),
          };
        case 'publish': {
          const versionId = randomUUID();
          // The takeover is written before the successor row exists so the
          // offering never holds two heads; the deferred successor key is
          // verified when this transaction commits.
          if (decision.predecessor) {
            const [takenOver] = await this.databaseContext.connection
              .update(tariffVersions)
              .set({
                supersededByVersionId: versionId,
                supersededAt: now,
                supersededFrom: command.effectiveFrom,
              })
              .where(
                and(
                  inScope(scope),
                  eq(tariffVersions.id, decision.predecessor.id),
                  isNull(tariffVersions.supersededByVersionId),
                ),
              )
              .returning({ id: tariffVersions.id });
            if (!takenOver)
              throw new Error('The locked Tariff head was not taken over.');
          }
          const [version] = await this.databaseContext.connection
            .insert(tariffVersions)
            .values({
              id: versionId,
              workspaceId: scope.workspaceId,
              companyId: scope.companyId,
              offeringId: scope.offeringId,
              versionNumber: decision.versionNumber,
              unit: command.unit,
              unitAmount: command.unitAmount,
              currency: command.currency,
              taxRatePercent: command.taxRatePercent,
              taxLabel: command.taxLabel,
              effectiveFrom: command.effectiveFrom,
              effectiveTo: command.effectiveTo,
              createdByInternalUserId: actor.internalUserId,
              createdByWorkspaceMembershipId: actor.workspaceMembershipId,
              createdAt: now,
            })
            .returning();
          if (!version) throw new Error('The Tariff Version was not recorded.');
          await this.accountability.recordTariffVersionPublished({
            actor,
            companyId,
            tariffVersionId: version.id,
            offeringId: version.offeringId,
            versionNumber: version.versionNumber,
            currency: version.currency,
            occurredAt: now,
          });
          await recordPublicationReceipt(this.databaseContext.connection, {
            ...idempotency,
            receipt: {
              command: 'tariff_version.publish',
              fingerprint,
              outcome: 'PUBLISHED',
              versionId: version.id,
            },
            createdAt: now,
          });
          return {
            outcome: 'PUBLISHED',
            version: tariffVersionView(version, now),
          };
        }
        default:
          return assertNever(decision);
      }
    });
  }

  async readTariffScope(
    actor: ActorContext,
    offeringId: string,
  ): Promise<TariffScope> {
    return this.databaseContext.transaction(async () => {
      const companyId =
        await this.authorization.requirePricingConfigurationAccess(actor, [
          'commercial.pricing.configuration.read',
        ]);
      const scope = await this.requireReadableOffering(
        actor,
        companyId,
        offeringId,
      );
      const now = await this.observe(scope);
      // One statement returns the head and the version CURRENT at the request
      // instant, so both answers come from the same snapshot.
      const rows = await this.databaseContext.connection
        .select()
        .from(tariffVersions)
        .where(
          and(
            inScope(scope),
            or(
              isNull(tariffVersions.supersededByVersionId),
              and(
                lte(tariffVersions.effectiveFrom, now),
                or(
                  isNull(tariffVersions.effectiveTo),
                  gt(tariffVersions.effectiveTo, now),
                ),
                or(
                  isNull(tariffVersions.supersededFrom),
                  gt(tariffVersions.supersededFrom, now),
                ),
              ),
            ),
          ),
        );
      const head = rows.find((row) => row.supersededByVersionId === null);
      const current = rows.find(
        (row) => tariffVersionState(row, now) === 'CURRENT',
      );
      return {
        offeringId: scope.offeringId,
        current: current ? tariffVersionView(current, now) : null,
        headVersionNumber: head?.versionNumber ?? null,
        provisional: true,
      };
    });
  }

  async listTariffVersions(
    actor: ActorContext,
    offeringId: string,
    cursorInput: unknown,
    limitInput: unknown,
  ): Promise<TariffVersionPage> {
    return this.databaseContext.transaction(async () => {
      const companyId =
        await this.authorization.requirePricingConfigurationAccess(actor, [
          'commercial.pricing.configuration.read',
        ]);
      const scope = await this.requireReadableOffering(
        actor,
        companyId,
        offeringId,
      );
      const limit = readPricingConfigurationLimit(
        limitInput,
        'Tariff Versions',
      );
      const cursor = readVersionCursor(cursorInput, 'Tariff Versions');
      const now = await this.observe(scope);
      const rows = await this.databaseContext.connection
        .select()
        .from(tariffVersions)
        .where(
          and(
            inScope(scope),
            cursor === undefined
              ? undefined
              : lt(tariffVersions.versionNumber, cursor),
          ),
        )
        .orderBy(desc(tariffVersions.versionNumber))
        .limit(limit + 1);
      const pageRows = rows.slice(0, limit);
      const last = pageRows.at(-1);
      return {
        items: pageRows.map((row) => tariffVersionView(row, now)),
        ...(rows.length > limit && last
          ? { nextCursor: versionCursor(last.versionNumber) }
          : {}),
        provisional: true,
      };
    });
  }

  async readTariffVersion(
    actor: ActorContext,
    versionId: string,
  ): Promise<TariffVersionRecord> {
    return this.databaseContext.transaction(async () => {
      const companyId =
        await this.authorization.requirePricingConfigurationAccess(actor, [
          'commercial.pricing.configuration.read',
        ]);
      // A malformed, unknown, cross-Company or cross-Workspace identifier gets
      // the same safe not-found, after authority so nothing is disclosed first.
      if (!UUID_GRAMMAR.test(versionId)) throw new NotFoundException();
      const id = versionId.toLowerCase();
      // The offering is immutable content, so it may be resolved before the
      // protection; selection metadata is read only while holding it.
      const [located] = await this.databaseContext.connection
        .select({ offeringId: tariffVersions.offeringId })
        .from(tariffVersions)
        .where(
          and(
            eq(tariffVersions.workspaceId, actor.workspaceId),
            eq(tariffVersions.companyId, companyId),
            eq(tariffVersions.id, id),
          ),
        );
      if (!located) throw new NotFoundException();
      const scope = await this.requireReadableOffering(
        actor,
        companyId,
        located.offeringId,
      );
      const now = await this.observe(scope);
      return tariffVersionView(
        await this.requireRecordedVersion(scope, id),
        now,
      );
    });
  }

  // The offering is read through the catalogue boundary that owns it, inside
  // this transaction, and must remain readable by the actor. A malformed
  // identifier gets the same safe not-found as an unknown, cross-Company or
  // cross-Workspace one, and only after authority.
  private async requireReadableOffering(
    actor: ActorContext,
    companyId: string,
    offeringId: string,
  ): Promise<OfferingScope> {
    if (!UUID_GRAMMAR.test(offeringId)) throw new NotFoundException();
    const offering = await this.catalogue.getCompanyServiceOffering(
      actor,
      offeringId.toLowerCase(),
    );
    if (offering.companyId !== companyId) throw new NotFoundException();
    return {
      kind: 'tariff',
      workspaceId: actor.workspaceId,
      companyId,
      offeringId: offering.id,
    };
  }

  // A read samples its instant only after any publication of the offering in
  // flight has committed or rolled back, then reads the rows, so it sees the
  // outcome of every publication whose instant precedes its own.
  private async observe(scope: OfferingScope): Promise<Date> {
    await lockPublicationScope(
      this.databaseContext.connection,
      scope,
      'shared',
    );
    return this.clock.now();
  }

  // A version is never deleted, so a recorded or located one stays readable.
  private async requireRecordedVersion(
    scope: OfferingScope,
    versionId: string,
  ): Promise<VersionRow> {
    const [version] = await this.databaseContext.connection
      .select()
      .from(tariffVersions)
      .where(and(inScope(scope), eq(tariffVersions.id, versionId)));
    if (!version)
      throw new Error('The recorded Tariff Version is unavailable.');
    return version;
  }
}

function inScope(scope: OfferingScope) {
  return and(
    eq(tariffVersions.workspaceId, scope.workspaceId),
    eq(tariffVersions.companyId, scope.companyId),
    eq(tariffVersions.offeringId, scope.offeringId),
  );
}

function tariffVersionView(row: VersionRow, now: Date): TariffVersionRecord {
  return {
    id: row.id,
    offeringId: row.offeringId,
    versionNumber: row.versionNumber,
    unit: row.unit,
    unitAmount: decimalAtScale(row.unitAmount, UNIT_AMOUNT_SCALE),
    currency: row.currency,
    taxRatePercent: decimalAtScale(row.taxRatePercent, TAX_RATE_PERCENT_SCALE),
    taxLabel: row.taxLabel,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    provenance: row.provenance,
    provisional: true,
    state: tariffVersionState(row, now),
    supersession: supersessionOf(row),
    createdByWorkspaceMembershipId: row.createdByWorkspaceMembershipId,
    createdAt: row.createdAt.toISOString(),
  };
}
