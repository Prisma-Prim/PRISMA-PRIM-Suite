import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { CommercialCatalogueService } from '../commercial-catalogue/commercial-catalogue.service.js';
import type { CompanyServiceOfferingRecord } from '../commercial-catalogue/commercial-catalogue.types.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  pricingRuleVersions,
  pricingSnapshotLines,
  pricingSnapshots,
  tariffVersions,
} from '../database/schema/index.js';
import { calculatePricingLines } from './pricing-calculation.js';
import { invalid } from './effective-dated-version.validation.js';
import {
  pricingSnapshotCursor,
  readPricingSnapshotCursor,
  readPricingSnapshotLimit,
} from './pricing-snapshot-pagination.js';
import type {
  PricingSnapshotLineRecord,
  PricingSnapshotPage,
  PricingSnapshotRecord,
} from './pricing-snapshot.types.js';
import {
  commandFingerprint,
  findPublicationReceipt,
  idempotencyConflict,
  lockPublicationCommand,
  lockPublicationScope,
  recordPricingSnapshotReceipt,
} from './pricing-configuration-publication.js';
import type { CreatePricingSnapshotCommand } from './pricing-configuration.types.js';
import { readPricingSnapshotCommand } from './pricing-snapshot.validation.js';

type RuleVersionRow = typeof pricingRuleVersions.$inferSelect;
type TariffVersionRow = typeof tariffVersions.$inferSelect;
type SnapshotRow = typeof pricingSnapshots.$inferSelect;
type SnapshotLineRow = typeof pricingSnapshotLines.$inferSelect;

const UUID_GRAMMAR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface SelectedLine {
  readonly command: CreatePricingSnapshotCommand['lines'][number];
  readonly offering: CompanyServiceOfferingRecord;
  readonly tariff: TariffVersionRow;
}

@Injectable()
export class PricingSnapshotService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly catalogue: CommercialCatalogueService,
    private readonly intake: CommercialIntakeService,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  async calculate(
    actor: ActorContext,
    opportunityIdInput: string,
    value: unknown,
    key: string | undefined,
  ): Promise<PricingSnapshotRecord> {
    return this.databaseContext.transaction(async () => {
      const companyId = await this.authorization.requirePricingUserAccess(
        actor,
        ['commercial.pricing.calculate'],
        true,
      );
      const opportunity = await this.intake.requireReadablePricingOpportunity(
        actor,
        opportunityIdInput,
      );
      const idempotencyKey = requireIdempotencyKey(key);
      const fingerprint = commandFingerprint({
        companyId,
        opportunityId: opportunity.id,
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
        if (
          receipt.command !== 'pricing_snapshot.calculate' ||
          receipt.fingerprint !== fingerprint
        )
          throw idempotencyConflict();
        return this.requireSnapshot(
          actor,
          companyId,
          opportunity.id,
          receipt.snapshotId,
        );
      }

      const command = readPricingSnapshotCommand(value);
      const offerings = await this.catalogue.readPricingOfferings(
        actor,
        command.lines.map(({ offeringId }) => offeringId),
      );
      for (const [index, line] of command.lines.entries())
        if (!offerings.has(line.offeringId))
          invalid(
            `lines[${index}].offeringId`,
            'Choose an offering from the active Company.',
          );

      await lockPublicationScope(
        this.databaseContext.connection,
        { kind: 'rule', workspaceId: actor.workspaceId, companyId },
        'shared',
      );
      for (const offeringId of [...offerings.keys()].sort())
        await lockPublicationScope(
          this.databaseContext.connection,
          {
            kind: 'tariff',
            workspaceId: actor.workspaceId,
            companyId,
            offeringId,
          },
          'shared',
        );

      const calculatedAt = this.clock.now();
      const rule = await this.requireRule(
        actor,
        companyId,
        command.pricingRuleVersionNumber,
        calculatedAt,
      );
      const selectedLines: SelectedLine[] = [];
      for (const [index, line] of command.lines.entries()) {
        const offering = offerings.get(line.offeringId);
        if (!offering)
          throw new Error('The validated offering trace is unavailable.');
        selectedLines.push({
          command: line,
          offering,
          tariff: await this.requireTariff(
            actor,
            companyId,
            line.offeringId,
            line.tariffVersionNumber,
            index + 1,
            calculatedAt,
          ),
        });
      }
      const currencies = new Set(
        selectedLines.map(({ tariff }) => tariff.currency),
      );
      if (currencies.size !== 1) throw mixedCurrency();
      const currency = selectedLines[0]?.tariff.currency;
      if (!currency)
        throw new Error('The validated Pricing Snapshot has no currency.');

      const calculation = calculatePricingLines(
        selectedLines.map(({ command: line, tariff }) => ({
          unitAmount: tariff.unitAmount,
          quantity: line.quantity,
          taxRatePercent: tariff.taxRatePercent,
        })),
      );
      const committedAt = this.clock.now();
      const snapshotId = randomUUID();
      await this.databaseContext.connection.insert(pricingSnapshots).values({
        id: snapshotId,
        workspaceId: actor.workspaceId,
        companyId,
        opportunityId: opportunity.id,
        clientRequestId: opportunity.clientRequestId,
        originalClientAccountId: opportunity.originalClientAccountId,
        pricingRuleVersionId: rule.id,
        pricingRuleVersionNumber: rule.versionNumber,
        ruleShape: rule.ruleShape,
        roundingMode: rule.roundingMode,
        roundingScale: rule.roundingScale,
        taxApplication: rule.taxApplication,
        currency,
        subtotal: calculation.subtotal,
        taxTotal: calculation.taxTotal,
        total: calculation.total,
        calculatedByInternalUserId: actor.internalUserId,
        calculatedByWorkspaceMembershipId: actor.workspaceMembershipId,
        calculatedAt,
        committedAt,
      });
      await this.databaseContext.connection.insert(pricingSnapshotLines).values(
        selectedLines.map(({ command: line, offering, tariff }, index) => {
          const calculated = calculation.lines[index];
          if (!calculated)
            throw new Error('The Pricing Snapshot line was not calculated.');
          return {
            id: randomUUID(),
            workspaceId: actor.workspaceId,
            companyId,
            snapshotId,
            lineNumber: index + 1,
            serviceDefinitionId: offering.serviceDefinitionId,
            serviceCode: offering.serviceDefinition.code,
            serviceName: offering.serviceDefinition.name,
            offeringId: offering.id,
            commercialLabel: offering.commercialLabel,
            tariffVersionId: tariff.id,
            tariffVersionNumber: tariff.versionNumber,
            unit: tariff.unit,
            unitAmount: tariff.unitAmount,
            currency: tariff.currency,
            taxRatePercent: tariff.taxRatePercent,
            taxLabel: tariff.taxLabel,
            quantity: line.quantity,
            quantityInput: line.quantity,
            ruleShape: rule.ruleShape,
            rawLineAmount: calculated.rawLineAmount,
            lineNet: calculated.lineNet,
            rawLineTax: calculated.rawLineTax,
            lineTax: calculated.lineTax,
          };
        }),
      );
      await this.accountability.recordPricingSnapshotCreated({
        actor,
        companyId,
        pricingSnapshotId: snapshotId,
        opportunityId: opportunity.id,
        lineCount: selectedLines.length,
        currency,
        occurredAt: committedAt,
      });
      await recordPricingSnapshotReceipt(this.databaseContext.connection, {
        ...idempotency,
        fingerprint,
        snapshotId,
        createdAt: committedAt,
      });
      return this.requireSnapshot(actor, companyId, opportunity.id, snapshotId);
    });
  }

  async list(
    actor: ActorContext,
    opportunityId: string,
    cursorInput: unknown,
    limitInput: unknown,
  ): Promise<PricingSnapshotPage> {
    return this.databaseContext.transaction(async () => {
      const companyId = await this.authorization.requirePricingUserAccess(
        actor,
        ['commercial.pricing.snapshot.read'],
        true,
      );
      const opportunity = await this.intake.requireReadablePricingOpportunity(
        actor,
        opportunityId,
      );
      const limit = readPricingSnapshotLimit(limitInput);
      const cursor = readPricingSnapshotCursor(cursorInput);
      const rows = await this.databaseContext.connection
        .select()
        .from(pricingSnapshots)
        .where(
          and(
            eq(pricingSnapshots.workspaceId, actor.workspaceId),
            eq(pricingSnapshots.companyId, companyId),
            eq(pricingSnapshots.opportunityId, opportunity.id),
            cursor
              ? sql<boolean>`(${pricingSnapshots.calculatedAt}, ${pricingSnapshots.id})
                  < (${cursor.calculatedAt}::timestamptz, ${cursor.id}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(pricingSnapshots.calculatedAt), desc(pricingSnapshots.id))
        .limit(limit + 1);
      const pageRows = rows.slice(0, limit);
      const items: PricingSnapshotRecord[] = [];
      for (const row of pageRows)
        items.push(await this.snapshotView(actor, row));
      const last = pageRows.at(-1);
      return {
        items,
        ...(rows.length > limit && last
          ? {
              nextCursor: pricingSnapshotCursor({
                calculatedAt: last.calculatedAt.toISOString(),
                id: last.id,
              }),
            }
          : {}),
      };
    });
  }

  async read(
    actor: ActorContext,
    opportunityId: string,
    snapshotId: string,
  ): Promise<PricingSnapshotRecord> {
    return this.databaseContext.transaction(async () => {
      const companyId = await this.authorization.requirePricingUserAccess(
        actor,
        ['commercial.pricing.snapshot.read'],
        true,
      );
      const opportunity = await this.intake.requireReadablePricingOpportunity(
        actor,
        opportunityId,
      );
      if (!UUID_GRAMMAR.test(snapshotId)) throw new NotFoundException();
      return this.requireSnapshot(
        actor,
        companyId,
        opportunity.id,
        snapshotId.toLowerCase(),
      );
    });
  }

  private async requireRule(
    actor: ActorContext,
    companyId: string,
    versionNumber: number,
    calculatedAt: Date,
  ): Promise<RuleVersionRow> {
    const [rule] = await this.databaseContext.connection
      .select()
      .from(pricingRuleVersions)
      .where(
        and(
          eq(pricingRuleVersions.workspaceId, actor.workspaceId),
          eq(pricingRuleVersions.companyId, companyId),
          eq(pricingRuleVersions.versionNumber, versionNumber),
        ),
      );
    if (!rule) throw new NotFoundException();
    if (isTakenOver(rule, calculatedAt))
      throw staleVersion(
        'STALE_PRICING_RULE_VERSION',
        await this.ruleHead(actor, companyId),
      );
    if (!isEffective(rule, calculatedAt))
      throw versionNotEffective('PRICING_RULE_NOT_EFFECTIVE');
    return rule;
  }

  private async requireTariff(
    actor: ActorContext,
    companyId: string,
    offeringId: string,
    versionNumber: number,
    linePosition: number,
    calculatedAt: Date,
  ): Promise<TariffVersionRow> {
    const [tariff] = await this.databaseContext.connection
      .select()
      .from(tariffVersions)
      .where(
        and(
          eq(tariffVersions.workspaceId, actor.workspaceId),
          eq(tariffVersions.companyId, companyId),
          eq(tariffVersions.offeringId, offeringId),
          eq(tariffVersions.versionNumber, versionNumber),
        ),
      );
    if (!tariff) throw new NotFoundException();
    if (isTakenOver(tariff, calculatedAt))
      throw staleVersion(
        'STALE_TARIFF_VERSION',
        await this.tariffHead(actor, companyId, offeringId),
        linePosition,
      );
    if (!isEffective(tariff, calculatedAt))
      throw versionNotEffective('TARIFF_NOT_EFFECTIVE', linePosition);
    return tariff;
  }

  private async ruleHead(
    actor: ActorContext,
    companyId: string,
  ): Promise<number | null> {
    const [head] = await this.databaseContext.connection
      .select({ versionNumber: pricingRuleVersions.versionNumber })
      .from(pricingRuleVersions)
      .where(
        and(
          eq(pricingRuleVersions.workspaceId, actor.workspaceId),
          eq(pricingRuleVersions.companyId, companyId),
          isNull(pricingRuleVersions.supersededByVersionId),
        ),
      );
    return head?.versionNumber ?? null;
  }

  private async tariffHead(
    actor: ActorContext,
    companyId: string,
    offeringId: string,
  ): Promise<number | null> {
    const [head] = await this.databaseContext.connection
      .select({ versionNumber: tariffVersions.versionNumber })
      .from(tariffVersions)
      .where(
        and(
          eq(tariffVersions.workspaceId, actor.workspaceId),
          eq(tariffVersions.companyId, companyId),
          eq(tariffVersions.offeringId, offeringId),
          isNull(tariffVersions.supersededByVersionId),
        ),
      );
    return head?.versionNumber ?? null;
  }

  private async requireSnapshot(
    actor: ActorContext,
    companyId: string,
    opportunityId: string,
    snapshotId: string,
  ): Promise<PricingSnapshotRecord> {
    const [snapshot] = await this.databaseContext.connection
      .select()
      .from(pricingSnapshots)
      .where(
        and(
          eq(pricingSnapshots.workspaceId, actor.workspaceId),
          eq(pricingSnapshots.companyId, companyId),
          eq(pricingSnapshots.opportunityId, opportunityId),
          eq(pricingSnapshots.id, snapshotId),
        ),
      );
    if (!snapshot) throw new NotFoundException();
    return this.snapshotView(actor, snapshot);
  }

  private async snapshotView(
    actor: ActorContext,
    snapshot: SnapshotRow,
  ): Promise<PricingSnapshotRecord> {
    const lines = await this.databaseContext.connection
      .select()
      .from(pricingSnapshotLines)
      .where(
        and(
          eq(pricingSnapshotLines.workspaceId, snapshot.workspaceId),
          eq(pricingSnapshotLines.companyId, snapshot.companyId),
          eq(pricingSnapshotLines.snapshotId, snapshot.id),
        ),
      )
      .orderBy(asc(pricingSnapshotLines.lineNumber));
    const clientReference = snapshot.originalClientAccountId
      ? await this.intake.readPricingClientProjection(
          actor,
          snapshot.originalClientAccountId,
        )
      : undefined;
    return {
      id: snapshot.id,
      opportunityId: snapshot.opportunityId,
      clientRequestId: snapshot.clientRequestId,
      ...(clientReference ? { clientReference } : {}),
      pricingRuleVersion: {
        id: snapshot.pricingRuleVersionId,
        versionNumber: snapshot.pricingRuleVersionNumber,
        ruleShape: snapshot.ruleShape,
        roundingMode: snapshot.roundingMode,
        roundingScale: snapshot.roundingScale,
        taxApplication: snapshot.taxApplication,
      },
      currency: snapshot.currency,
      lines: lines.map(snapshotLineView),
      subtotal: snapshot.subtotal,
      taxTotal: snapshot.taxTotal,
      total: snapshot.total,
      calculatedByWorkspaceMembershipId:
        snapshot.calculatedByWorkspaceMembershipId,
      calculatedAt: snapshot.calculatedAt.toISOString(),
      committedAt: snapshot.committedAt.toISOString(),
      version: 1,
      provenance: 'ILLUSTRATIVE',
      provisional: true,
    };
  }
}

function snapshotLineView(row: SnapshotLineRow): PricingSnapshotLineRecord {
  return {
    position: row.lineNumber,
    serviceDefinitionId: row.serviceDefinitionId,
    serviceCode: row.serviceCode,
    serviceName: row.serviceName,
    offeringId: row.offeringId,
    commercialLabel: row.commercialLabel,
    tariffVersionId: row.tariffVersionId,
    tariffVersionNumber: row.tariffVersionNumber,
    unit: row.unit,
    unitAmount: row.unitAmount,
    currency: row.currency,
    taxRatePercent: row.taxRatePercent,
    taxLabel: row.taxLabel,
    quantity: row.quantityInput,
    ruleShape: row.ruleShape,
    rawLineAmount: row.rawLineAmount,
    lineNet: row.lineNet,
    rawLineTax: row.rawLineTax,
    lineTax: row.lineTax,
  };
}

function isTakenOver(
  row: { supersededFrom: Date | null },
  calculatedAt: Date,
): boolean {
  return row.supersededFrom !== null && row.supersededFrom <= calculatedAt;
}

function isEffective(
  row: { effectiveFrom: Date; effectiveTo: Date | null },
  calculatedAt: Date,
): boolean {
  return (
    row.effectiveFrom <= calculatedAt &&
    (row.effectiveTo === null || calculatedAt < row.effectiveTo)
  );
}

function staleVersion(
  code: 'STALE_PRICING_RULE_VERSION' | 'STALE_TARIFF_VERSION',
  headVersionNumber: number | null,
  linePosition?: number,
): ConflictException {
  return new ConflictException({
    code,
    message: 'The declared version has been taken over.',
    headVersionNumber,
    ...(linePosition === undefined ? {} : { linePosition }),
  });
}

function versionNotEffective(
  code: 'PRICING_RULE_NOT_EFFECTIVE' | 'TARIFF_NOT_EFFECTIVE',
  linePosition?: number,
): ConflictException {
  return new ConflictException({
    code,
    message: 'The declared version is not effective at the calculation time.',
    ...(linePosition === undefined ? {} : { linePosition }),
  });
}

function mixedCurrency(): ConflictException {
  return new ConflictException({
    code: 'MIXED_CURRENCY',
    message: 'Choose Tariff Versions that use one currency.',
  });
}
