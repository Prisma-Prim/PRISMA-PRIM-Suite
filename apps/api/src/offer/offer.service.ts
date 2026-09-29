import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  offerCommands,
  offerReferenceCounters,
  offerVersions,
  offers,
} from '../database/schema/index.js';
import { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import { commandFingerprint } from '../pricing-configuration/pricing-configuration-publication.js';
import type { PricingSnapshotRecord } from '../pricing-configuration/pricing-snapshot.types.js';
import type {
  OfferRecord,
  OfferVersionRecord,
  OfferRecipientCopy,
} from './offer.types.js';
import { readCreateOfferCommand } from './offer.validation.js';

type OfferRow = typeof offers.$inferSelect;
type OfferVersionRow = typeof offerVersions.$inferSelect;
type OfferCommandRow = typeof offerCommands.$inferSelect;

@Injectable()
export class OfferService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly accountability: AccountabilityService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly intake: CommercialIntakeService,
    private readonly pricing: PricingSnapshotService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  async create(
    actor: ActorContext,
    opportunityId: string,
    value: unknown,
    key: string | undefined,
  ): Promise<OfferRecord> {
    await this.authorization.requireOfferAccess(actor, [
      'commercial.offer.prepare',
    ]);
    const idempotencyKey = requireIdempotencyKey(key);
    return this.databaseContext.transaction(async () => {
      const companyId = await this.authorization.requireOfferAccess(
        actor,
        ['commercial.offer.prepare'],
        true,
      );
      const opportunity = await this.intake.requireReadableOfferOpportunity(
        actor,
        opportunityId,
        true,
      );
      if (opportunity.status !== 'OPEN') {
        throw namedConflict(
          'OPPORTUNITY_NOT_OPEN',
          'The Opportunity is not open.',
        );
      }
      if (!opportunity.originalClientAccountId) {
        throw namedConflict(
          'OFFER_CLIENT_REQUIRED',
          'The Request must have a readable Client before creating an Offer.',
        );
      }
      const fingerprint = commandFingerprint({
        opportunityId: opportunity.id,
        payload: value,
      });
      await this.lockCommand(actor, companyId, idempotencyKey);
      const receipt = await this.findCommand(actor, companyId, idempotencyKey);
      if (receipt) {
        if (
          receipt.opportunityId !== opportunity.id ||
          receipt.fingerprint !== fingerprint
        )
          throw namedConflict(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency-Key was already used for another Offer command.',
          );
        const command = readCreateOfferCommand(value);
        const snapshot = await this.pricing.resolveOfferSnapshot({
          actor,
          companyId,
          opportunityId: opportunity.id,
          snapshotId: command.pricingSnapshotId,
        });
        requireUnadjustedOfferSnapshot(snapshot);
        await this.clients.lockOfferRecipient(
          actor,
          opportunity.originalClientAccountId,
          command.recipient,
        );
        const stored = await this.requireOfferById(
          actor,
          companyId,
          receipt.resultOfferId,
        );
        return this.offerView(actor, stored.offer, stored.version, snapshot);
      }
      const command = readCreateOfferCommand(value);
      const snapshot = await this.pricing.resolveOfferSnapshot({
        actor,
        companyId,
        opportunityId: opportunity.id,
        snapshotId: command.pricingSnapshotId,
      });
      requireUnadjustedOfferSnapshot(snapshot);
      const recipient = await this.clients.lockOfferRecipient(
        actor,
        opportunity.originalClientAccountId,
        command.recipient,
      );
      const existing = await this.findOffer(
        actor.workspaceId,
        companyId,
        opportunity.id,
      );
      if (existing)
        throw namedConflict(
          'OFFER_ALREADY_EXISTS',
          'An Offer already exists for this Opportunity.',
        );

      const createdAt = this.clock.now();
      const illustrativeReference = await this.allocateReference(
        actor.workspaceId,
        companyId,
      );
      const [offer] = await this.databaseContext.connection
        .insert(offers)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          opportunityId: opportunity.id,
          clientRequestId: opportunity.clientRequestId,
          originalClientAccountId: opportunity.originalClientAccountId,
          illustrativeReference,
          createdByInternalUserId: actor.internalUserId,
          createdByWorkspaceMembershipId: actor.workspaceMembershipId,
          createdAt,
        })
        .returning();
      if (!offer) throw new Error('The Offer was not recorded.');
      const validUntil = new Date(
        createdAt.getTime() + command.validityDays * 86_400_000,
      );
      const [version] = await this.databaseContext.connection
        .insert(offerVersions)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          offerId: offer.id,
          opportunityId: opportunity.id,
          clientRequestId: opportunity.clientRequestId,
          originalClientAccountId: opportunity.originalClientAccountId,
          pricingSnapshotId: snapshot.id,
          recipientClientAccountId: recipient.currentClientAccountId,
          recipientKind: recipient.recipient.kind,
          recipientAdditionalLegalEntityId:
            recipient.recipient.kind === 'ADDITIONAL'
              ? recipient.recipient.additionalLegalEntityId
              : null,
          recipientLegalName: recipient.recipient.legalName,
          recipientTaxId: recipient.recipient.taxId,
          recipientLegalAddress: recipient.recipient.legalAddress,
          issuingCompanyLabel: actor.activeCompany?.displayName ?? '',
          validityDays: command.validityDays,
          validUntil,
          scopeNote: command.scopeNote,
          commercialConditions: command.commercialConditions,
          createdByInternalUserId: actor.internalUserId,
          createdByWorkspaceMembershipId: actor.workspaceMembershipId,
          createdAt,
        })
        .returning();
      if (!version) throw new Error('Offer Version 1 was not recorded.');
      await this.clients.recordLockedReferenceUse(actor, recipient);
      const [recordedCommand] = await this.databaseContext.connection
        .insert(offerCommands)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          fingerprint,
          opportunityId: opportunity.id,
          resultOfferId: offer.id,
          createdAt,
        })
        .returning({ id: offerCommands.id });
      if (!recordedCommand)
        throw new Error('The Create Offer receipt was not recorded.');
      await this.accountability.recordOfferCreated({
        actor,
        companyId,
        offerId: offer.id,
        offerVersionId: version.id,
        illustrativeReference,
        pricingSnapshotId: snapshot.id,
        recipientKind: recipient.recipient.kind,
        occurredAt: createdAt,
      });
      return this.offerView(actor, offer, version, snapshot);
    });
  }

  async read(
    actor: ActorContext,
    opportunityId: string,
  ): Promise<OfferRecord | null> {
    await this.authorization.requireOfferAccess(actor, [
      'commercial.offer.read',
    ]);
    return this.databaseContext.transaction(
      async () => {
        const companyId = await this.authorization.requireOfferAccess(
          actor,
          ['commercial.offer.read'],
          true,
        );
        const opportunity = await this.intake.requireReadableOfferOpportunity(
          actor,
          opportunityId,
          false,
        );
        const offer = await this.findOffer(
          actor.workspaceId,
          companyId,
          opportunity.id,
        );
        if (!offer) return null;
        const stored = await this.requireOfferById(actor, companyId, offer.id);
        const snapshot = await this.pricing.resolveOfferSnapshot({
          actor,
          companyId,
          opportunityId: opportunity.id,
          snapshotId: stored.version.pricingSnapshotId,
        });
        return this.offerView(actor, stored.offer, stored.version, snapshot);
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  private async offerView(
    actor: ActorContext,
    offer: OfferRow,
    version: OfferVersionRow,
    snapshot: PricingSnapshotRecord,
  ): Promise<OfferRecord> {
    const clientReference = await this.intake.readPricingClientProjection(
      actor,
      offer.originalClientAccountId,
    );
    return {
      id: offer.id,
      companyId: offer.companyId,
      opportunityId: offer.opportunityId,
      clientRequestId: offer.clientRequestId,
      originalClientAccountId: offer.originalClientAccountId,
      illustrativeReference: offer.illustrativeReference,
      revision: 1,
      provisional: true,
      createdByWorkspaceMembershipId: offer.createdByWorkspaceMembershipId,
      createdAt: offer.createdAt.toISOString(),
      ...(clientReference ? { clientReference } : {}),
      version: offerVersionView(version, snapshot),
    };
  }

  private async findOffer(
    workspaceId: string,
    companyId: string,
    opportunityId: string,
  ): Promise<OfferRow | undefined> {
    const [offer] = await this.databaseContext.connection
      .select()
      .from(offers)
      .where(
        and(
          eq(offers.workspaceId, workspaceId),
          eq(offers.companyId, companyId),
          eq(offers.opportunityId, opportunityId),
        ),
      );
    return offer;
  }

  private async requireOfferById(
    actor: ActorContext,
    companyId: string,
    offerId: string,
  ): Promise<{ offer: OfferRow; version: OfferVersionRow }> {
    const [offer] = await this.databaseContext.connection
      .select()
      .from(offers)
      .where(
        and(
          eq(offers.workspaceId, actor.workspaceId),
          eq(offers.companyId, companyId),
          eq(offers.id, offerId),
        ),
      );
    if (!offer) throw new NotFoundException();
    const [version] = await this.databaseContext.connection
      .select()
      .from(offerVersions)
      .where(
        and(
          eq(offerVersions.workspaceId, actor.workspaceId),
          eq(offerVersions.companyId, companyId),
          eq(offerVersions.offerId, offer.id),
          eq(offerVersions.versionNumber, 1),
        ),
      );
    if (!version) throw new Error('Offer Version 1 is missing.');
    return { offer, version };
  }

  private async lockCommand(
    actor: ActorContext,
    companyId: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.databaseContext.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(
        ${`${actor.workspaceId}:${companyId}:${actor.workspaceMembershipId}:${idempotencyKey}`},
        0
      ))`,
    );
  }

  private async findCommand(
    actor: ActorContext,
    companyId: string,
    idempotencyKey: string,
  ): Promise<OfferCommandRow | undefined> {
    const [command] = await this.databaseContext.connection
      .select()
      .from(offerCommands)
      .where(
        and(
          eq(offerCommands.workspaceId, actor.workspaceId),
          eq(offerCommands.companyId, companyId),
          eq(
            offerCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(offerCommands.idempotencyKey, idempotencyKey),
        ),
      );
    return command;
  }

  private async allocateReference(
    workspaceId: string,
    companyId: string,
  ): Promise<number> {
    const [counter] = await this.databaseContext.connection
      .insert(offerReferenceCounters)
      .values({ workspaceId, companyId, currentReference: 1 })
      .onConflictDoUpdate({
        target: [
          offerReferenceCounters.workspaceId,
          offerReferenceCounters.companyId,
        ],
        set: {
          currentReference: sql`${offerReferenceCounters.currentReference} + 1`,
        },
      })
      .returning({ currentReference: offerReferenceCounters.currentReference });
    if (!counter || counter.currentReference < 1)
      throw new Error('The illustrative Offer reference was not allocated.');
    return counter.currentReference;
  }
}

function offerVersionView(
  row: OfferVersionRow,
  pricingSnapshot: PricingSnapshotRecord,
): OfferVersionRecord {
  if (
    row.versionNumber !== 1 ||
    row.decisionState !== 'PENDING' ||
    row.transmissionState !== 'NOT_TRANSMITTED' ||
    row.clientResponseState !== 'NONE' ||
    row.provenance !== 'ILLUSTRATIVE'
  )
    throw new Error('Offer Version 1 has an invalid stored state.');
  return {
    id: row.id,
    versionNumber: 1,
    pricingSnapshotId: row.pricingSnapshotId,
    pricingSnapshot,
    recipient: offerRecipientCopy(row),
    issuingCompanyLabel: row.issuingCompanyLabel,
    validityDays: row.validityDays,
    validUntil: row.validUntil.toISOString(),
    scopeNote: row.scopeNote,
    commercialConditions: row.commercialConditions,
    decisionState: 'PENDING',
    transmissionState: 'NOT_TRANSMITTED',
    clientResponseState: 'NONE',
    provenance: 'ILLUSTRATIVE',
    provisional: true,
    createdByWorkspaceMembershipId: row.createdByWorkspaceMembershipId,
    createdAt: row.createdAt.toISOString(),
  };
}

function offerRecipientCopy(row: OfferVersionRow): OfferRecipientCopy {
  const identity = {
    legalName: row.recipientLegalName,
    taxId: row.recipientTaxId,
    legalAddress: row.recipientLegalAddress,
  };
  if (row.recipientKind === 'PRIMARY') return { ...identity, kind: 'PRIMARY' };
  if (
    row.recipientKind === 'ADDITIONAL' &&
    row.recipientAdditionalLegalEntityId
  ) {
    return {
      ...identity,
      kind: 'ADDITIONAL',
      additionalLegalEntityId: row.recipientAdditionalLegalEntityId,
    };
  }
  throw new Error('The stored Offer recipient is invalid.');
}

function namedConflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

function requireUnadjustedOfferSnapshot(snapshot: PricingSnapshotRecord): void {
  if (snapshot.lines.some((line) => line.adjustment !== null))
    throw namedConflict(
      'PRICING_SNAPSHOT_ADJUSTMENT_UNSUPPORTED',
      'Adjusted Pricing Snapshots are not supported by Offer version 1.',
    );
}
