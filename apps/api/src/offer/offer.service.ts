import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, desc, DrizzleQueryError, eq, lt, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  contracts,
  offerCommands,
  offerReferenceCounters,
  offerVersions,
  offers,
  offerQualityRuns,
  offerDecisions,
  offerTransmissions,
  offerClientResponses,
  OFFER_TEMPLATE_CODE,
  OFFER_TEMPLATE_VERSION,
} from '../database/schema/index.js';
import { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import { commandFingerprint } from '../pricing-configuration/pricing-configuration-publication.js';
import type { PricingSnapshotRecord } from '../pricing-configuration/pricing-snapshot.types.js';
import { offerClientResponseState } from './offer.types.js';
import type {
  OfferRecord,
  OfferVersionRecord,
  OfferRecipientCopy,
  OfferDecision,
  OfferTransmission,
  OfferClientResponse,
  OfferTransmissionState,
  OfferVersionDifference,
} from './offer.types.js';
import {
  readCreateOfferCommand,
  readCreateOfferVersionCommand,
  readOfferDecisionCommand,
  readOfferWarningCodes,
  readOfferTransmissionCommand,
  readOfferClientResponseCommand,
} from './offer.validation.js';
import { renderOfferRepresentation } from './offer-representation.js';
import {
  evaluateOfferQuality,
  readOfferQualityResults,
  requireHeadOfferVersion,
  type OfferQualityRun,
} from './offer-quality.js';

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

  /** Only the immutable source reference bound to a readable Contract. */
  async readContractSourceReference(input: {
    actor: ActorContext;
    contractId: string;
    opportunityId: string;
  }) {
    const companyId = await this.authorization.requireContractAccess(
      input.actor,
      ['commercial.contract.read'],
      true,
    );
    await this.intake.requireReadableOfferOpportunity(
      input.actor,
      input.opportunityId,
      false,
    );
    const [source] = await this.databaseContext.connection
      .select({
        illustrativeReference: offers.illustrativeReference,
        versionNumber: offerVersions.versionNumber,
      })
      .from(contracts)
      .innerJoin(
        offers,
        and(
          eq(offers.id, contracts.sourceOfferId),
          eq(offers.workspaceId, contracts.workspaceId),
          eq(offers.companyId, contracts.companyId),
          eq(offers.opportunityId, contracts.opportunityId),
        ),
      )
      .innerJoin(
        offerVersions,
        and(
          eq(offerVersions.id, contracts.sourceOfferVersionId),
          eq(offerVersions.offerId, offers.id),
          eq(offerVersions.workspaceId, contracts.workspaceId),
          eq(offerVersions.companyId, contracts.companyId),
        ),
      )
      .where(
        and(
          eq(contracts.workspaceId, input.actor.workspaceId),
          eq(contracts.companyId, companyId),
          eq(contracts.opportunityId, input.opportunityId),
          eq(contracts.id, input.contractId),
        ),
      );
    if (!source) throw new NotFoundException();
    return source;
  }

  /** Recorded accepted source only; no pricing or live-Client projection locks. */
  async resolveAcceptedContractSource(input: {
    actor: ActorContext;
    opportunityId: string;
    offerVersionId: string;
    lock: boolean;
  }) {
    const companyId = await this.authorization.requireOfferAccess(
      input.actor,
      ['commercial.offer.read'],
      true,
    );
    const query = this.databaseContext.connection
      .select()
      .from(offers)
      .where(
        and(
          eq(offers.workspaceId, input.actor.workspaceId),
          eq(offers.companyId, companyId),
          eq(offers.opportunityId, input.opportunityId),
        ),
      );
    const [offer] = input.lock ? await query.for('share') : await query;
    if (!offer) throw new NotFoundException();
    const { version } = await this.requireOfferById(
      input.actor,
      companyId,
      offer.id,
      input.offerVersionId,
    );
    const response = await this.findClientResponse({
      workspaceId: input.actor.workspaceId,
      companyId,
      offerVersionId: version.id,
    });
    if (version.supersededByVersionId || response?.outcome !== 'ACCEPTED')
      throw namedConflict(
        'OFFER_NOT_ACCEPTED',
        'The Offer Version is not accepted.',
      );
    if (version.provenance !== 'ILLUSTRATIVE')
      throw new Error('Invalid accepted Offer provenance.');
    return {
      offerId: offer.id,
      offerVersionId: version.id,
      originalClientAccountId: offer.originalClientAccountId,
      clientRequestId: offer.clientRequestId,
      pricingSnapshotId: version.pricingSnapshotId,
      recipient: offerRecipientCopy(version),
      scopeNote: version.scopeNote,
      commercialConditions: version.commercialConditions,
    };
  }

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
          receipt.kind !== 'CREATE_OFFER' ||
          receipt.opportunityId !== opportunity.id ||
          receipt.fingerprint !== fingerprint
        )
          throw namedConflict(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency-Key was already used for another Offer command.',
          );
        const command = readCreateOfferCommand(value);
        await this.clients.lockOfferRecipient(
          actor,
          opportunity.originalClientAccountId,
          command.recipient,
        );
        const snapshot = await this.pricing.resolveOfferSnapshot({
          actor,
          companyId,
          opportunityId: opportunity.id,
          snapshotId: command.pricingSnapshotId,
        });
        requireUnadjustedOfferSnapshot(snapshot);
        const stored = await this.requireOfferById(
          actor,
          companyId,
          receipt.resultOfferId,
          1,
        );
        return this.offerView(actor, stored.offer, stored.version, snapshot);
      }
      const command = readCreateOfferCommand(value);
      // Snapshot's live Client projection takes a share lock. Acquire the
      // recipient write fence first so distinct Opportunities for one Client
      // cannot deadlock by upgrading two existing share locks.
      const recipient = await this.clients.lockOfferRecipient(
        actor,
        opportunity.originalClientAccountId,
        command.recipient,
      );
      const snapshot = await this.pricing.resolveOfferSnapshot({
        actor,
        companyId,
        opportunityId: opportunity.id,
        snapshotId: command.pricingSnapshotId,
      });
      requireUnadjustedOfferSnapshot(snapshot);
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
          templateCode: OFFER_TEMPLATE_CODE,
          templateVersion: OFFER_TEMPLATE_VERSION,
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

  async createVersion(input: {
    actor: ActorContext;
    opportunityId: string;
    payload: unknown;
    idempotencyKey: string | undefined;
  }): Promise<OfferRecord> {
    const { actor } = input;
    await this.authorization.requireOfferAccess(actor, [
      'commercial.offer.prepare',
    ]);
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    return this.databaseContext
      .transaction(async () => {
        const companyId = await this.authorization.requireOfferAccess(
          actor,
          ['commercial.offer.prepare'],
          true,
        );
        const opportunity = await this.intake.requireReadableOfferOpportunity(
          actor,
          input.opportunityId,
          true,
        );
        const existing = await this.findOffer(
          actor.workspaceId,
          companyId,
          opportunity.id,
        );
        if (!existing) throw new NotFoundException();
        // Naming a recipient always revalidates the original Client through its owner,
        // including retries. Resolve the write fence before Snapshot projection locks.
        await this.clients.lockOfferRecipient(
          actor,
          existing.originalClientAccountId,
          { kind: 'PRIMARY' },
        );
        const fingerprint = commandFingerprint({
          kind: 'CREATE_OFFER_VERSION',
          opportunityId: opportunity.id,
          payload: input.payload,
        });
        await this.lockCommand(actor, companyId, idempotencyKey);
        const receipt = await this.findCommand(
          actor,
          companyId,
          idempotencyKey,
        );
        if (
          receipt &&
          (receipt.kind !== 'CREATE_OFFER_VERSION' ||
            receipt.fingerprint !== fingerprint ||
            receipt.resultOfferId !== existing.id ||
            !receipt.resultVersionId ||
            !receipt.resultOfferRevision)
        )
          throw namedConflict(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency-Key was already used for another Offer command.',
          );
        const command = readCreateOfferVersionCommand(input.payload);
        const recipient = await this.clients.lockOfferRecipient(
          actor,
          existing.originalClientAccountId,
          command.recipient,
        );
        const snapshot = await this.pricing.resolveOfferSnapshot({
          actor,
          companyId,
          opportunityId: opportunity.id,
          snapshotId: command.pricingSnapshotId,
        });
        requireUnadjustedOfferSnapshot(snapshot);
        if (receipt) {
          if (
            receipt.kind !== 'CREATE_OFFER_VERSION' ||
            receipt.fingerprint !== fingerprint ||
            receipt.resultOfferId !== existing.id ||
            !receipt.resultVersionId ||
            !receipt.resultOfferRevision
          )
            throw namedConflict(
              'IDEMPOTENCY_CONFLICT',
              'Idempotency-Key was already used for another Offer command.',
            );
          const stored = await this.requireOfferById(
            actor,
            companyId,
            existing.id,
            receipt.resultVersionId,
          );
          return this.createdVersionView(
            actor,
            { ...stored.offer, revision: receipt.resultOfferRevision },
            stored.version,
            snapshot,
          );
        }
        const [offer] = await this.databaseContext.connection
          .select()
          .from(offers)
          .where(
            and(
              eq(offers.workspaceId, actor.workspaceId),
              eq(offers.companyId, companyId),
              eq(offers.id, existing.id),
            ),
          )
          .for('update');
        if (!offer) throw new NotFoundException();
        if (offer.revision !== command.expectedOfferRevision)
          throw namedConflict(
            'STALE_OFFER_REVISION',
            'The Offer changed. Reload it before creating a version.',
          );
        const [accepted] = await this.databaseContext.connection
          .select({ id: offerClientResponses.id })
          .from(offerClientResponses)
          .where(
            and(
              eq(offerClientResponses.workspaceId, actor.workspaceId),
              eq(offerClientResponses.companyId, companyId),
              eq(offerClientResponses.offerId, offer.id),
              eq(offerClientResponses.outcome, 'ACCEPTED'),
            ),
          )
          .limit(1);
        if (accepted)
          throw namedConflict(
            'OFFER_ACCEPTED',
            'The accepted Offer cannot receive another version.',
          );
        const { version: predecessor } = await this.requireOfferById(
          actor,
          companyId,
          offer.id,
        );
        const createdAt = this.clock.now();
        if (!Number.isFinite(createdAt.getTime()))
          throw new Error('Invalid server instant.');
        const [version] = await this.databaseContext.connection
          .insert(offerVersions)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            offerId: offer.id,
            opportunityId: offer.opportunityId,
            clientRequestId: offer.clientRequestId,
            originalClientAccountId: offer.originalClientAccountId,
            versionNumber: predecessor.versionNumber + 1,
            predecessorVersionId: predecessor.id,
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
            validUntil: new Date(
              createdAt.getTime() + command.validityDays * 86_400_000,
            ),
            scopeNote: command.scopeNote,
            commercialConditions: command.commercialConditions,
            templateCode: OFFER_TEMPLATE_CODE,
            templateVersion: OFFER_TEMPLATE_VERSION,
            createdByInternalUserId: actor.internalUserId,
            createdByWorkspaceMembershipId: actor.workspaceMembershipId,
            createdAt,
          })
          .returning();
        if (!version)
          throw new Error('The successor Offer Version was not recorded.');
        await this.databaseContext.connection
          .update(offerVersions)
          .set({ supersededByVersionId: version.id, supersededAt: createdAt })
          .where(eq(offerVersions.id, predecessor.id));
        const revision = offer.revision + 1;
        await this.databaseContext.connection
          .update(offers)
          .set({ revision })
          .where(eq(offers.id, offer.id));
        await this.clients.recordLockedReferenceUse(actor, recipient);
        await this.databaseContext.connection.insert(offerCommands).values({
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          fingerprint,
          opportunityId: opportunity.id,
          resultOfferId: offer.id,
          kind: 'CREATE_OFFER_VERSION',
          resultVersionId: version.id,
          resultOfferRevision: revision,
          createdAt,
        });
        await this.accountability.recordOfferVersionCreated({
          actor,
          companyId,
          offerId: offer.id,
          offerVersionId: version.id,
          versionNumber: version.versionNumber,
          predecessorVersionNumber: predecessor.versionNumber,
          pricingSnapshotId: snapshot.id,
          recipientKind: version.recipientKind,
          occurredAt: createdAt,
        });
        return this.createdVersionView(
          actor,
          { ...offer, revision },
          version,
          snapshot,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof HttpException) throw error;
        throw new InternalServerErrorException({
          code: 'OFFER_VERSION_UNCERTAIN',
          correlationId: randomUUID(),
          message:
            'The version outcome is uncertain. Retry the identical command.',
        });
      });
  }

  async listVersions(input: {
    actor: ActorContext;
    opportunityId: string;
    cursor?: string;
    limit?: string;
  }) {
    const { actor } = input;
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
          input.opportunityId,
          false,
        );
        const offer = await this.findOffer(
          actor.workspaceId,
          companyId,
          opportunity.id,
        );
        if (!offer) return { versions: [], nextCursor: null };
        const limit = input.limit === undefined ? 25 : Number(input.limit);
        if (
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 50 ||
          (input.limit !== undefined && !/^[1-9][0-9]*$/u.test(input.limit))
        )
          throw new BadRequestException({
            code: 'OFFER_VALIDATION_ERROR',
            field: 'limit',
          });
        let before: number | undefined;
        if (input.cursor !== undefined) {
          const match = /^([0-9a-f-]{36}):([1-9][0-9]*)$/u.exec(input.cursor);
          if (
            !match ||
            match[1] !== offer.id ||
            !Number.isSafeInteger(Number(match[2]))
          )
            throw new BadRequestException({
              code: 'OFFER_VALIDATION_ERROR',
              field: 'cursor',
            });
          before = Number(match[2]);
        }
        const rows = await this.databaseContext.connection
          .select()
          .from(offerVersions)
          .where(
            and(
              eq(offerVersions.workspaceId, actor.workspaceId),
              eq(offerVersions.companyId, companyId),
              eq(offerVersions.offerId, offer.id),
              before === undefined
                ? undefined
                : lt(offerVersions.versionNumber, before),
            ),
          )
          .orderBy(desc(offerVersions.versionNumber))
          .limit(limit + 1);
        const page = rows.slice(0, limit);
        return {
          versions: page.map((version) => ({
            id: version.id,
            versionNumber: version.versionNumber,
            createdAt: version.createdAt.toISOString(),
            predecessorVersionId: version.predecessorVersionId,
            supersededByVersionId: version.supersededByVersionId,
          })),
          nextCursor:
            rows.length > limit
              ? `${offer.id}:${page.at(-1)?.versionNumber}`
              : null,
        };
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  private async createdVersionView(
    actor: ActorContext,
    offer: OfferRow,
    version: OfferVersionRow,
    snapshot: PricingSnapshotRecord,
  ): Promise<OfferRecord> {
    const { clientReference, ...recordedSnapshot } = snapshot;
    // A command receipt reproduces immutable content. Current Client projection
    // remains independently permission-gated on the ordinary read boundary.
    void clientReference;
    return {
      id: offer.id,
      companyId: offer.companyId,
      opportunityId: offer.opportunityId,
      clientRequestId: offer.clientRequestId,
      originalClientAccountId: offer.originalClientAccountId,
      illustrativeReference: offer.illustrativeReference,
      revision: offer.revision,
      provisional: true,
      createdByWorkspaceMembershipId: offer.createdByWorkspaceMembershipId,
      createdAt: offer.createdAt.toISOString(),
      version: {
        ...offerVersionView(
          offer.illustrativeReference,
          version,
          recordedSnapshot,
        ),
        supersededByVersionId: null,
        supersededAt: null,
        differences: await this.versionDifferences(
          actor,
          offer,
          version,
          snapshot,
        ),
        latestQualityRun: null,
        decision: null,
        transmissionState: 'NOT_TRANSMITTED',
        transmission: null,
        clientResponseState: 'NONE',
        clientResponse: null,
      },
    };
  }

  private async versionDifferences(
    actor: ActorContext,
    offer: OfferRow,
    version: OfferVersionRow,
    snapshot: PricingSnapshotRecord,
  ): Promise<OfferVersionDifference[]> {
    if (!version.predecessorVersionId) return [];
    const [previous] = await this.databaseContext.connection
      .select()
      .from(offerVersions)
      .where(
        and(
          eq(offerVersions.workspaceId, offer.workspaceId),
          eq(offerVersions.companyId, offer.companyId),
          eq(offerVersions.offerId, offer.id),
          eq(offerVersions.id, version.predecessorVersionId),
        ),
      );
    if (!previous) throw new Error('The Offer predecessor is missing.');
    const previousSnapshot = await this.pricing.resolveOfferVersionSnapshot({
      actor,
      companyId: offer.companyId,
      opportunityId: offer.opportunityId,
      offerVersionId: previous.id,
    });
    return recordedDifferences(previous, previousSnapshot, version, snapshot);
  }

  async read(
    actor: ActorContext,
    opportunityId: string,
    offerVersionId?: string,
  ): Promise<OfferRecord | null> {
    await this.authorization.requireOfferAccess(actor, [
      'commercial.offer.read',
    ]);
    if (
      offerVersionId !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        offerVersionId,
      )
    )
      throw new NotFoundException();
    // A profile refresh can invalidate a locked row after the repeatable-read
    // snapshot began. Restart the entire read, including live authority checks;
    // never continue an aborted transaction or retry a mutation here.
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.databaseContext.transaction(
          async () => {
            const companyId = await this.authorization.requireOfferAccess(
              actor,
              ['commercial.offer.read'],
              true,
            );
            const opportunity =
              await this.intake.requireReadableOfferOpportunity(
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
            const stored = await this.requireOfferById(
              actor,
              companyId,
              offer.id,
              offerVersionId,
            );
            const snapshot = await this.pricing.resolveOfferVersionSnapshot({
              actor,
              companyId,
              opportunityId: opportunity.id,
              offerVersionId: stored.version.id,
            });
            return this.offerView(
              actor,
              stored.offer,
              stored.version,
              snapshot,
            );
          },
          { isolationLevel: 'repeatable read' },
        );
      } catch (error) {
        const cause = error instanceof DrizzleQueryError ? error.cause : error;
        if (
          attempt >= 3 ||
          typeof cause !== 'object' ||
          cause === null ||
          !('code' in cause) ||
          cause.code !== '40001'
        )
          throw error;
        // Let concurrent identity-profile writes settle before taking a fresh snapshot.
        await new Promise<void>((resolve) => setTimeout(resolve, 25 * attempt));
      }
    }
  }

  async runQualityChecks(input: {
    actor: ActorContext;
    opportunityId: string;
    offerVersionId: string;
    payload: unknown;
    idempotencyKey: string | undefined;
  }): Promise<OfferQualityRun> {
    const { actor } = input;
    await this.authorization.requireOfferQualityAccess(actor);
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    return this.databaseContext.transaction(async () => {
      const companyId = await this.authorization.requireOfferQualityAccess(
        actor,
        true,
      );
      const opportunity = await this.intake.requireReadableOfferOpportunity(
        actor,
        input.opportunityId,
        true,
      );
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          input.offerVersionId,
        )
      )
        throw new NotFoundException();
      const offer = await this.findOffer(
        actor.workspaceId,
        companyId,
        opportunity.id,
      );
      if (!offer) throw new NotFoundException();
      const [target] = await this.databaseContext.connection
        .select()
        .from(offerVersions)
        .where(
          and(
            eq(offerVersions.workspaceId, actor.workspaceId),
            eq(offerVersions.companyId, companyId),
            eq(offerVersions.offerId, offer.id),
            eq(offerVersions.id, input.offerVersionId),
          ),
        );
      if (!target) throw new NotFoundException();
      const fingerprint = commandFingerprint({
        kind: 'RUN_QUALITY_CHECKS',
        opportunityId: opportunity.id,
        offerVersionId: input.offerVersionId,
        payload: input.payload,
      });
      await this.lockCommand(actor, companyId, idempotencyKey);
      const receipt = await this.findCommand(actor, companyId, idempotencyKey);
      if (receipt) {
        if (
          receipt.kind !== 'RUN_QUALITY_CHECKS' ||
          receipt.fingerprint !== fingerprint ||
          receipt.resultOfferId !== offer.id ||
          !receipt.resultQualityRunId
        )
          throw namedConflict(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency-Key was already used for another Offer command.',
          );
        const [run] = await this.databaseContext.connection
          .select()
          .from(offerQualityRuns)
          .where(
            and(
              eq(offerQualityRuns.workspaceId, actor.workspaceId),
              eq(offerQualityRuns.companyId, companyId),
              eq(offerQualityRuns.offerVersionId, target.id),
              eq(offerQualityRuns.id, receipt.resultQualityRunId),
            ),
          );
        if (!run) throw new Error('The recorded Quality Check run is missing.');
        return qualityRunView(run);
      }
      if (
        typeof input.payload !== 'object' ||
        input.payload === null ||
        Array.isArray(input.payload) ||
        Object.keys(input.payload).length !== 0
      )
        throw new BadRequestException({
          fields: { command: 'Quality Checks accept an empty command only.' },
        });
      // Serialize with all Offer commands; this command never changes revision.
      await this.databaseContext.connection
        .select({ id: offers.id })
        .from(offers)
        .where(
          and(
            eq(offers.workspaceId, actor.workspaceId),
            eq(offers.companyId, companyId),
            eq(offers.id, offer.id),
          ),
        )
        .for('update');
      const [head] = await this.databaseContext.connection
        .select({ id: offerVersions.id })
        .from(offerVersions)
        .where(
          and(
            eq(offerVersions.workspaceId, actor.workspaceId),
            eq(offerVersions.companyId, companyId),
            eq(offerVersions.offerId, offer.id),
          ),
        )
        .orderBy(desc(offerVersions.versionNumber))
        .limit(1);
      requireHeadOfferVersion({
        offerVersionId: target.id,
        headVersionId: head?.id,
      });
      const pricing = await this.pricing.inspectOfferQualitySnapshot({
        actor,
        companyId,
        opportunityId: opportunity.id,
        snapshotId: target.pricingSnapshotId,
      });
      const recipient = offerRecipientCopy(target);
      const context = await this.clients.inspectOfferQualityContext({
        actor,
        companyId,
        originalClientAccountId: offer.originalClientAccountId,
        snapshotOriginalClientAccountId: pricing.originalClientAccountId,
        recipient:
          recipient.kind === 'PRIMARY'
            ? { kind: 'PRIMARY' }
            : {
                kind: 'ADDITIONAL',
                legalEntityId: recipient.additionalLegalEntityId,
              },
        recordedIdentity: recipient,
      });
      const evaluatedAt = this.clock.now();
      const results = evaluateOfferQuality({
        instant: evaluatedAt,
        validUntil: target.validUntil,
        snapshot: {
          ...pricing.snapshot,
          belongsToOffer:
            pricing.snapshot.opportunityId === offer.opportunityId,
        },
        previousTransmittedCurrency: await this.previousTransmittedCurrency(
          actor,
          offer,
          target,
        ),
        ...context,
        recipientTaxId: target.recipientTaxId,
        provenance: target.provenance,
        provisional: target.provenance === 'ILLUSTRATIVE',
      });
      const [run] = await this.databaseContext.connection
        .insert(offerQualityRuns)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          offerId: offer.id,
          offerVersionId: target.id,
          actorInternalUserId: actor.internalUserId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          evaluatedAt,
          results,
        })
        .returning();
      if (!run) throw new Error('The Quality Check run was not recorded.');
      await this.databaseContext.connection.insert(offerCommands).values({
        workspaceId: actor.workspaceId,
        companyId,
        actorWorkspaceMembershipId: actor.workspaceMembershipId,
        idempotencyKey,
        fingerprint,
        opportunityId: opportunity.id,
        resultOfferId: offer.id,
        kind: 'RUN_QUALITY_CHECKS',
        resultQualityRunId: run.id,
        createdAt: evaluatedAt,
      });
      return qualityRunView(run);
    });
  }

  async decide(input: {
    actor: ActorContext;
    opportunityId: string;
    offerVersionId: string;
    payload: unknown;
    idempotencyKey: string | undefined;
    kind: 'APPROVE' | 'REJECT';
  }): Promise<OfferDecision> {
    const { actor } = input;
    await this.authorization.requireOfferAccess(actor, [
      'commercial.offer.approve',
    ]);
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    return this.databaseContext
      .transaction(async () => {
        const companyId = await this.authorization.requireOfferAccess(
          actor,
          ['commercial.offer.approve'],
          true,
        );
        const opportunity = await this.intake.requireReadableOfferOpportunity(
          actor,
          input.opportunityId,
          true,
        );
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
            input.offerVersionId,
          )
        )
          throw new NotFoundException();
        const existing = await this.findOffer(
          actor.workspaceId,
          companyId,
          opportunity.id,
        );
        if (!existing) throw new NotFoundException();
        const [target] = await this.databaseContext.connection
          .select()
          .from(offerVersions)
          .where(
            and(
              eq(offerVersions.workspaceId, actor.workspaceId),
              eq(offerVersions.companyId, companyId),
              eq(offerVersions.offerId, existing.id),
              eq(offerVersions.id, input.offerVersionId),
            ),
          );
        if (!target) throw new NotFoundException();
        const fingerprint = commandFingerprint({
          kind: input.kind,
          opportunityId: opportunity.id,
          offerVersionId: input.offerVersionId,
          payload: input.payload,
        });
        await this.lockCommand(actor, companyId, idempotencyKey);
        const receipt = await this.findCommand(
          actor,
          companyId,
          idempotencyKey,
        );
        if (receipt) {
          if (
            receipt.kind !== input.kind ||
            receipt.fingerprint !== fingerprint ||
            receipt.resultOfferId !== existing.id ||
            !receipt.resultDecisionId
          )
            throw namedConflict(
              'IDEMPOTENCY_CONFLICT',
              'Idempotency-Key was already used for another Offer command.',
            );
          const decision = await this.findDecision(
            actor.workspaceId,
            companyId,
            target.id,
          );
          if (!decision || decision.id !== receipt.resultDecisionId)
            throw new Error('The recorded Offer decision is missing.');
          return this.decisionView(decision);
        }
        const command = readOfferDecisionCommand(input.payload, input.kind);
        const [offer] = await this.databaseContext.connection
          .select()
          .from(offers)
          .where(
            and(
              eq(offers.workspaceId, actor.workspaceId),
              eq(offers.companyId, companyId),
              eq(offers.id, existing.id),
            ),
          )
          .for('update');
        if (!offer) throw new NotFoundException();
        const [head] = await this.databaseContext.connection
          .select({ id: offerVersions.id })
          .from(offerVersions)
          .where(
            and(
              eq(offerVersions.workspaceId, actor.workspaceId),
              eq(offerVersions.companyId, companyId),
              eq(offerVersions.offerId, offer.id),
            ),
          )
          .orderBy(desc(offerVersions.versionNumber))
          .limit(1);
        if (offer.revision !== command.expectedOfferRevision)
          throw namedConflict(
            'STALE_OFFER_REVISION',
            'The Offer changed. Reload it before deciding.',
          );
        requireHeadOfferVersion({
          offerVersionId: target.id,
          headVersionId: head?.id,
        });
        if (await this.findDecision(actor.workspaceId, companyId, target.id))
          throw namedConflict(
            'OFFER_VERSION_ALREADY_DECIDED',
            'The Offer Version already has a decision.',
          );
        let approval:
          | {
              qualityRunId: string;
              acknowledgedWarningCodes: readonly string[];
              representationSha256: string;
            }
          | undefined;
        let decidedAt: Date;
        if (command.kind === 'APPROVE') {
          const pricing = await this.pricing.inspectOfferQualitySnapshot({
            actor,
            companyId,
            opportunityId: offer.opportunityId,
            snapshotId: target.pricingSnapshotId,
          });
          const recipient = offerRecipientCopy(target);
          const context = await this.clients.inspectOfferQualityContext({
            actor,
            companyId,
            originalClientAccountId: offer.originalClientAccountId,
            snapshotOriginalClientAccountId: pricing.originalClientAccountId,
            recipient:
              recipient.kind === 'PRIMARY'
                ? { kind: 'PRIMARY' }
                : {
                    kind: 'ADDITIONAL',
                    legalEntityId: recipient.additionalLegalEntityId,
                  },
            recordedIdentity: recipient,
          });
          decidedAt = this.clock.now();
          const results = evaluateOfferQuality({
            instant: decidedAt,
            validUntil: target.validUntil,
            snapshot: {
              ...pricing.snapshot,
              belongsToOffer:
                pricing.snapshot.opportunityId === offer.opportunityId,
            },
            previousTransmittedCurrency: await this.previousTransmittedCurrency(
              actor,
              offer,
              target,
            ),
            ...context,
            recipientTaxId: target.recipientTaxId,
            provenance: target.provenance,
            provisional: target.provenance === 'ILLUSTRATIVE',
          });
          if (results.some((result) => result.status === 'ERROR'))
            throw namedConflict(
              'QUALITY_CHECK_ERRORS',
              'Current Quality Check errors prevent approval.',
            );
          const warnings = results
            .filter((result) => result.status === 'WARNING')
            .map((result) => result.code);
          if (
            warnings.length !== command.acknowledgedWarningCodes.length ||
            !warnings.every((code) =>
              command.acknowledgedWarningCodes.includes(code),
            )
          )
            throw namedConflict(
              'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
              'Acknowledge exactly the current Quality Check warnings.',
            );
          const representation = offerVersionView(
            offer.illustrativeReference,
            target,
            pricing.snapshot,
          ).representation;
          const [run] = await this.databaseContext.connection
            .insert(offerQualityRuns)
            .values({
              workspaceId: actor.workspaceId,
              companyId,
              offerId: offer.id,
              offerVersionId: target.id,
              actorInternalUserId: actor.internalUserId,
              actorWorkspaceMembershipId: actor.workspaceMembershipId,
              evaluatedAt: decidedAt,
              results,
            })
            .returning();
          if (!run)
            throw new Error('The approval Quality Check run was not recorded.');
          approval = {
            qualityRunId: run.id,
            acknowledgedWarningCodes: command.acknowledgedWarningCodes,
            representationSha256: representation.sha256,
          };
        } else decidedAt = this.clock.now();
        const [decision] = await this.databaseContext.connection
          .insert(offerDecisions)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            offerId: offer.id,
            offerVersionId: target.id,
            state: command.kind === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            offerRevision: offer.revision + 1,
            actorInternalUserId: actor.internalUserId,
            actorWorkspaceMembershipId: actor.workspaceMembershipId,
            decidedAt,
            ...approval,
            reason: command.kind === 'REJECT' ? command.reason : null,
          })
          .returning();
        if (!decision) throw new Error('The Offer decision was not recorded.');
        await this.databaseContext.connection
          .update(offers)
          .set({ revision: decision.offerRevision })
          .where(eq(offers.id, offer.id));
        await this.databaseContext.connection.insert(offerCommands).values({
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          fingerprint,
          opportunityId: opportunity.id,
          resultOfferId: offer.id,
          kind: command.kind,
          resultDecisionId: decision.id,
          createdAt: decidedAt,
        });
        await this.accountability.recordOfferDecision({
          actor,
          companyId,
          offerId: offer.id,
          offerVersionId: target.id,
          versionNumber: target.versionNumber,
          occurredAt: decidedAt,
          state: decision.state,
          acknowledgedWarningCodes: approval?.acknowledgedWarningCodes,
        });
        return this.decisionView(decision);
      })
      .catch((error: unknown) => {
        if (error instanceof HttpException) throw error;
        // Never pass SQL parameters (including rejection reasons) to Nest's
        // default exception logger. Commit uncertainty requires an explicit retry.
        throw new InternalServerErrorException({
          code: 'OFFER_DECISION_UNCERTAIN',
          correlationId: randomUUID(),
          message:
            'The decision outcome is uncertain. Retry the identical command.',
        });
      });
  }

  async recordClientResponse(input: {
    actor: ActorContext;
    opportunityId: string;
    offerVersionId: string;
    payload: unknown;
    idempotencyKey: string | undefined;
  }): Promise<OfferClientResponse> {
    const { actor } = input;
    await this.authorization.requireOfferAccess(actor, [
      'commercial.offer.response.record',
    ]);
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    return this.databaseContext
      .transaction(async () => {
        const companyId = await this.authorization.requireOfferAccess(
          actor,
          ['commercial.offer.response.record'],
          true,
        );
        const opportunity = await this.intake.requireReadableOfferOpportunity(
          actor,
          input.opportunityId,
          true,
        );
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
            input.offerVersionId,
          )
        )
          throw new NotFoundException();
        const existing = await this.findOffer(
          actor.workspaceId,
          companyId,
          opportunity.id,
        );
        if (!existing) throw new NotFoundException();
        const [target] = await this.databaseContext.connection
          .select()
          .from(offerVersions)
          .where(
            and(
              eq(offerVersions.workspaceId, actor.workspaceId),
              eq(offerVersions.companyId, companyId),
              eq(offerVersions.offerId, existing.id),
              eq(offerVersions.id, input.offerVersionId),
            ),
          );
        if (!target) throw new NotFoundException();
        const recipient = offerRecipientCopy(target);
        // The response selects no new entity. Fence recorded references through
        // Client without lending dossier read authority or adding Quality Checks.
        await this.clients.inspectOfferQualityContext({
          actor,
          companyId,
          originalClientAccountId: existing.originalClientAccountId,
          snapshotOriginalClientAccountId: null,
          recipient:
            recipient.kind === 'PRIMARY'
              ? { kind: 'PRIMARY' }
              : {
                  kind: 'ADDITIONAL',
                  legalEntityId: recipient.additionalLegalEntityId,
                },
          recordedIdentity: recipient,
        });
        const fingerprint = commandFingerprint({
          kind: 'RECORD_CLIENT_RESPONSE',
          opportunityId: opportunity.id,
          offerVersionId: input.offerVersionId,
          payload: input.payload,
        });
        await this.lockCommand(actor, companyId, idempotencyKey);
        const receipt = await this.findCommand(
          actor,
          companyId,
          idempotencyKey,
        );
        if (receipt) {
          if (
            receipt.kind !== 'RECORD_CLIENT_RESPONSE' ||
            receipt.fingerprint !== fingerprint ||
            receipt.resultOfferId !== existing.id ||
            !receipt.resultClientResponseId
          )
            throw namedConflict(
              'IDEMPOTENCY_CONFLICT',
              'Idempotency-Key was already used for another Offer command.',
            );
          const row = await this.findClientResponse({
            workspaceId: actor.workspaceId,
            companyId,
            offerVersionId: target.id,
          });
          if (!row || row.id !== receipt.resultClientResponseId)
            throw new Error('The recorded Offer Client response is missing.');
          return this.clientResponseView(row);
        }
        const command = readOfferClientResponseCommand(input.payload);
        const [offer] = await this.databaseContext.connection
          .select()
          .from(offers)
          .where(
            and(
              eq(offers.workspaceId, actor.workspaceId),
              eq(offers.companyId, companyId),
              eq(offers.id, existing.id),
            ),
          )
          .for('update');
        if (!offer) throw new NotFoundException();
        const [head] = await this.databaseContext.connection
          .select({ id: offerVersions.id })
          .from(offerVersions)
          .where(
            and(
              eq(offerVersions.workspaceId, actor.workspaceId),
              eq(offerVersions.companyId, companyId),
              eq(offerVersions.offerId, offer.id),
            ),
          )
          .orderBy(desc(offerVersions.versionNumber))
          .limit(1);
        if (offer.revision !== command.expectedOfferRevision)
          throw namedConflict(
            'STALE_OFFER_REVISION',
            'The Offer changed. Reload it before recording a Client response.',
          );
        requireHeadOfferVersion({
          offerVersionId: target.id,
          headVersionId: head?.id,
        });
        const transmission = await this.findTransmission(
          actor.workspaceId,
          companyId,
          target.id,
        );
        if (!transmission)
          throw namedConflict(
            'OFFER_VERSION_NOT_TRANSMITTED',
            'The Offer Version is not transmitted.',
          );
        if (
          await this.findClientResponse({
            workspaceId: actor.workspaceId,
            companyId,
            offerVersionId: target.id,
          })
        )
          throw namedConflict(
            'CLIENT_RESPONSE_ALREADY_RECORDED',
            'The Offer Version already has a Client response.',
          );
        const decidedAt = this.clock.now();
        if (!Number.isFinite(decidedAt.getTime()))
          throw new Error('Invalid server instant.');
        if (command.outcome === 'EXPIRED') {
          if (decidedAt < target.validUntil)
            throw namedConflict(
              'OFFER_VALIDITY_NOT_ELAPSED',
              'The Offer validity has not elapsed.',
            );
        } else {
          if (
            command.receivedAt < transmission.transmittedAt ||
            command.receivedAt > decidedAt
          )
            throw new BadRequestException({
              code: 'OFFER_VALIDATION_ERROR',
              field: 'receivedAt',
              message:
                'Received time must be between transmission and the recording instant.',
            });
          if (command.receivedAt >= target.validUntil)
            throw namedConflict(
              'OFFER_VALIDITY_ELAPSED',
              'The reported Client response was received after validity elapsed.',
            );
        }
        const [response] = await this.databaseContext.connection
          .insert(offerClientResponses)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            offerId: offer.id,
            offerVersionId: target.id,
            offerRevision: offer.revision + 1,
            actorInternalUserId: actor.internalUserId,
            actorWorkspaceMembershipId: actor.workspaceMembershipId,
            decidedAt,
            outcome: command.outcome,
            receivedAt:
              command.outcome === 'EXPIRED' ? null : command.receivedAt,
            reason: command.outcome === 'REJECTED' ? command.reason : null,
          })
          .returning();
        if (!response)
          throw new Error('The Offer Client response was not recorded.');
        await this.databaseContext.connection
          .update(offers)
          .set({ revision: response.offerRevision })
          .where(eq(offers.id, offer.id));
        await this.databaseContext.connection.insert(offerCommands).values({
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          fingerprint,
          opportunityId: opportunity.id,
          resultOfferId: offer.id,
          kind: 'RECORD_CLIENT_RESPONSE',
          resultClientResponseId: response.id,
          createdAt: decidedAt,
        });
        await this.accountability.recordOfferClientResponse({
          actor,
          companyId,
          offerId: offer.id,
          offerVersionId: target.id,
          versionNumber: target.versionNumber,
          occurredAt: decidedAt,
          outcome: command.outcome,
        });
        return this.clientResponseView(response);
      })
      .catch((error: unknown) => {
        if (error instanceof HttpException) throw error;
        throw new InternalServerErrorException({
          code: 'OFFER_CLIENT_RESPONSE_UNCERTAIN',
          correlationId: randomUUID(),
          message:
            'The Client response outcome is uncertain. Retry the identical command.',
        });
      });
  }

  private async findClientResponse(input: {
    workspaceId: string;
    companyId: string;
    offerVersionId: string;
  }) {
    const { workspaceId, companyId, offerVersionId } = input;
    const [row] = await this.databaseContext.connection
      .select()
      .from(offerClientResponses)
      .where(
        and(
          eq(offerClientResponses.workspaceId, workspaceId),
          eq(offerClientResponses.companyId, companyId),
          eq(offerClientResponses.offerVersionId, offerVersionId),
        ),
      );
    return row;
  }

  private clientResponseView(
    row: typeof offerClientResponses.$inferSelect,
  ): OfferClientResponse {
    if (row.evidenceKind !== 'SIMULATED')
      throw new Error('Invalid stored Client response evidence.');
    const base = {
      id: row.id,
      offerVersionId: row.offerVersionId,
      offerRevision: row.offerRevision,
      actorWorkspaceMembershipId: row.actorWorkspaceMembershipId,
      decidedAt: row.decidedAt.toISOString(),
      evidenceKind: row.evidenceKind,
    };
    if (
      row.outcome === 'EXPIRED' &&
      row.receivedAt === null &&
      row.reason === null
    )
      return { ...base, outcome: 'EXPIRED' };
    if (row.outcome === 'ACCEPTED' && row.receivedAt && row.reason === null)
      return {
        ...base,
        outcome: 'ACCEPTED',
        receivedAt: row.receivedAt.toISOString(),
      };
    if (row.outcome === 'REJECTED' && row.receivedAt && row.reason !== null)
      return {
        ...base,
        outcome: 'REJECTED',
        receivedAt: row.receivedAt.toISOString(),
        reason: row.reason,
      };
    throw new Error('Invalid stored Client response.');
  }

  async recordTransmission(input: {
    actor: ActorContext;
    opportunityId: string;
    offerVersionId: string;
    payload: unknown;
    idempotencyKey: string | undefined;
  }): Promise<OfferTransmission> {
    const { actor } = input;
    await this.authorization.requireOfferAccess(actor, [
      'commercial.offer.transmission.record',
    ]);
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    return this.databaseContext
      .transaction(async () => {
        const companyId = await this.authorization.requireOfferAccess(
          actor,
          ['commercial.offer.transmission.record'],
          true,
        );
        const opportunity = await this.intake.requireReadableOfferOpportunity(
          actor,
          input.opportunityId,
          true,
        );
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
            input.offerVersionId,
          )
        )
          throw new NotFoundException();
        const existing = await this.findOffer(
          actor.workspaceId,
          companyId,
          opportunity.id,
        );
        if (!existing) throw new NotFoundException();
        const [target] = await this.databaseContext.connection
          .select()
          .from(offerVersions)
          .where(
            and(
              eq(offerVersions.workspaceId, actor.workspaceId),
              eq(offerVersions.companyId, companyId),
              eq(offerVersions.offerId, existing.id),
              eq(offerVersions.id, input.offerVersionId),
            ),
          );
        if (!target) throw new NotFoundException();
        const fingerprint = commandFingerprint({
          kind: 'RECORD_TRANSMISSION',
          opportunityId: opportunity.id,
          offerVersionId: input.offerVersionId,
          payload: input.payload,
        });
        await this.lockCommand(actor, companyId, idempotencyKey);
        const receipt = await this.findCommand(
          actor,
          companyId,
          idempotencyKey,
        );
        if (receipt) {
          if (
            receipt.kind !== 'RECORD_TRANSMISSION' ||
            receipt.fingerprint !== fingerprint ||
            receipt.resultOfferId !== existing.id ||
            !receipt.resultTransmissionId
          )
            throw namedConflict(
              'IDEMPOTENCY_CONFLICT',
              'Idempotency-Key was already used for another Offer command.',
            );
          const row = await this.findTransmission(
            actor.workspaceId,
            companyId,
            target.id,
          );
          if (!row || row.id !== receipt.resultTransmissionId)
            throw new Error('The recorded Offer transmission is missing.');
          return this.transmissionView(row);
        }
        const command = readOfferTransmissionCommand(input.payload);
        const [offer] = await this.databaseContext.connection
          .select()
          .from(offers)
          .where(
            and(
              eq(offers.workspaceId, actor.workspaceId),
              eq(offers.companyId, companyId),
              eq(offers.id, existing.id),
            ),
          )
          .for('update');
        if (!offer) throw new NotFoundException();
        const [head] = await this.databaseContext.connection
          .select({ id: offerVersions.id })
          .from(offerVersions)
          .where(
            and(
              eq(offerVersions.workspaceId, actor.workspaceId),
              eq(offerVersions.companyId, companyId),
              eq(offerVersions.offerId, offer.id),
            ),
          )
          .orderBy(desc(offerVersions.versionNumber))
          .limit(1);
        if (offer.revision !== command.expectedOfferRevision)
          throw namedConflict(
            'STALE_OFFER_REVISION',
            'The Offer changed. Reload it before transmission.',
          );
        requireHeadOfferVersion({
          offerVersionId: target.id,
          headVersionId: head?.id,
        });
        const approval = await this.findDecision(
          actor.workspaceId,
          companyId,
          target.id,
        );
        if (approval?.state !== 'APPROVED' || !approval.representationSha256)
          throw namedConflict(
            'OFFER_VERSION_NOT_APPROVED',
            'The Offer Version is not approved.',
          );
        if (
          await this.findTransmission(actor.workspaceId, companyId, target.id)
        )
          throw namedConflict(
            'OFFER_VERSION_ALREADY_TRANSMITTED',
            'The Offer Version already has a transmission.',
          );
        const pricing = await this.pricing.inspectOfferQualitySnapshot({
          actor,
          companyId,
          opportunityId: offer.opportunityId,
          snapshotId: target.pricingSnapshotId,
        });
        const recipient = offerRecipientCopy(target);
        const context = await this.clients.inspectOfferQualityContext({
          actor,
          companyId,
          originalClientAccountId: offer.originalClientAccountId,
          snapshotOriginalClientAccountId: pricing.originalClientAccountId,
          recipient:
            recipient.kind === 'PRIMARY'
              ? { kind: 'PRIMARY' }
              : {
                  kind: 'ADDITIONAL',
                  legalEntityId: recipient.additionalLegalEntityId,
                },
          recordedIdentity: recipient,
        });
        const transmittedAt = this.clock.now();
        if (!Number.isFinite(transmittedAt.getTime()))
          throw new Error('Invalid server instant.');
        const results = evaluateOfferQuality({
          instant: transmittedAt,
          validUntil: target.validUntil,
          snapshot: {
            ...pricing.snapshot,
            belongsToOffer:
              pricing.snapshot.opportunityId === offer.opportunityId,
          },
          previousTransmittedCurrency: await this.previousTransmittedCurrency(
            actor,
            offer,
            target,
          ),
          ...context,
          recipientTaxId: target.recipientTaxId,
          provenance: target.provenance,
          provisional: target.provenance === 'ILLUSTRATIVE',
        });
        if (results.some((result) => result.status === 'ERROR'))
          throw namedConflict(
            'QUALITY_CHECK_ERRORS',
            'Current Quality Check errors prevent transmission.',
          );
        const previouslyAcknowledged = readOfferWarningCodes(
          approval.acknowledgedWarningCodes,
        );
        const warnings = results
          .filter(
            (result) =>
              result.status === 'WARNING' &&
              !previouslyAcknowledged.includes(result.code),
          )
          .map((result) => result.code);
        if (
          warnings.length !== command.acknowledgedWarningCodes.length ||
          !warnings.every((code) =>
            command.acknowledgedWarningCodes.includes(code),
          )
        )
          throw namedConflict(
            'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
            'Acknowledge exactly the current warnings not acknowledged at approval.',
          );
        const representation = offerVersionView(
          offer.illustrativeReference,
          target,
          pricing.snapshot,
        ).representation;
        if (representation.sha256 !== approval.representationSha256)
          throw namedConflict(
            'REPRESENTATION_MISMATCH',
            'The representation does not match the approved checksum.',
          );
        const [run] = await this.databaseContext.connection
          .insert(offerQualityRuns)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            offerId: offer.id,
            offerVersionId: target.id,
            actorInternalUserId: actor.internalUserId,
            actorWorkspaceMembershipId: actor.workspaceMembershipId,
            evaluatedAt: transmittedAt,
            results,
          })
          .returning();
        if (!run)
          throw new Error(
            'The transmission Quality Check run was not recorded.',
          );
        const [transmission] = await this.databaseContext.connection
          .insert(offerTransmissions)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            offerId: offer.id,
            offerVersionId: target.id,
            offerRevision: offer.revision + 1,
            actorInternalUserId: actor.internalUserId,
            actorWorkspaceMembershipId: actor.workspaceMembershipId,
            transmittedAt,
            qualityRunId: run.id,
            acknowledgedWarningCodes: command.acknowledgedWarningCodes,
            representationSha256: approval.representationSha256,
            note: command.note,
          })
          .returning();
        if (!transmission)
          throw new Error('The Offer transmission was not recorded.');
        await this.databaseContext.connection
          .update(offers)
          .set({ revision: transmission.offerRevision })
          .where(eq(offers.id, offer.id));
        await this.databaseContext.connection.insert(offerCommands).values({
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          fingerprint,
          opportunityId: opportunity.id,
          resultOfferId: offer.id,
          kind: 'RECORD_TRANSMISSION',
          resultTransmissionId: transmission.id,
          createdAt: transmittedAt,
        });
        await this.accountability.recordOfferTransmission({
          actor,
          companyId,
          offerId: offer.id,
          offerVersionId: target.id,
          versionNumber: target.versionNumber,
          occurredAt: transmittedAt,
          acknowledgedWarningCodes: command.acknowledgedWarningCodes,
        });
        return this.transmissionView(transmission);
      })
      .catch((error: unknown) => {
        if (error instanceof HttpException) throw error;
        // SQL parameters can include the private note. Expose only safe diagnostics.
        throw new InternalServerErrorException({
          code: 'OFFER_TRANSMISSION_UNCERTAIN',
          correlationId: randomUUID(),
          message:
            'The transmission outcome is uncertain. Retry the identical command.',
        });
      });
  }

  private async previousTransmittedCurrency(
    actor: ActorContext,
    offer: OfferRow,
    version: OfferVersionRow,
  ): Promise<string | null> {
    const [earlier] = await this.databaseContext.connection
      .select({ id: offerVersions.id })
      .from(offerVersions)
      .innerJoin(
        offerTransmissions,
        and(
          eq(offerTransmissions.workspaceId, offerVersions.workspaceId),
          eq(offerTransmissions.companyId, offerVersions.companyId),
          eq(offerTransmissions.offerId, offerVersions.offerId),
          eq(offerTransmissions.offerVersionId, offerVersions.id),
        ),
      )
      .where(
        and(
          eq(offerVersions.workspaceId, actor.workspaceId),
          eq(offerVersions.companyId, offer.companyId),
          eq(offerVersions.offerId, offer.id),
          lt(offerVersions.versionNumber, version.versionNumber),
        ),
      )
      .orderBy(desc(offerVersions.versionNumber))
      .limit(1);
    if (!earlier) return null;
    const snapshot = await this.pricing.resolveOfferVersionSnapshot({
      actor,
      companyId: offer.companyId,
      opportunityId: offer.opportunityId,
      offerVersionId: earlier.id,
    });
    return snapshot.currency;
  }

  private async findTransmission(
    workspaceId: string,
    companyId: string,
    offerVersionId: string,
  ) {
    const [row] = await this.databaseContext.connection
      .select()
      .from(offerTransmissions)
      .where(
        and(
          eq(offerTransmissions.workspaceId, workspaceId),
          eq(offerTransmissions.companyId, companyId),
          eq(offerTransmissions.offerVersionId, offerVersionId),
        ),
      );
    return row;
  }

  private async transmissionView(
    row: typeof offerTransmissions.$inferSelect,
  ): Promise<OfferTransmission> {
    if (
      row.channel !== 'SIMULATED' ||
      !Number.isFinite(row.transmittedAt.getTime())
    )
      throw new Error('Invalid stored Offer transmission.');
    const [run] = await this.databaseContext.connection
      .select()
      .from(offerQualityRuns)
      .where(
        and(
          eq(offerQualityRuns.workspaceId, row.workspaceId),
          eq(offerQualityRuns.companyId, row.companyId),
          eq(offerQualityRuns.offerId, row.offerId),
          eq(offerQualityRuns.offerVersionId, row.offerVersionId),
          eq(offerQualityRuns.id, row.qualityRunId),
        ),
      );
    if (!run) throw new Error('The transmission Quality Check run is missing.');
    return {
      id: row.id,
      offerVersionId: row.offerVersionId,
      offerRevision: row.offerRevision,
      actorWorkspaceMembershipId: row.actorWorkspaceMembershipId,
      transmittedAt: row.transmittedAt.toISOString(),
      channel: row.channel,
      note: row.note,
      qualityRun: qualityRunView(run),
      acknowledgedWarningCodes: readOfferWarningCodes(
        row.acknowledgedWarningCodes,
      ),
      representationSha256: row.representationSha256,
    };
  }

  private async findDecision(
    workspaceId: string,
    companyId: string,
    offerVersionId: string,
  ) {
    const [decision] = await this.databaseContext.connection
      .select()
      .from(offerDecisions)
      .where(
        and(
          eq(offerDecisions.workspaceId, workspaceId),
          eq(offerDecisions.companyId, companyId),
          eq(offerDecisions.offerVersionId, offerVersionId),
        ),
      );
    return decision;
  }

  private async decisionView(
    row: typeof offerDecisions.$inferSelect,
  ): Promise<OfferDecision> {
    const base = {
      id: row.id,
      offerVersionId: row.offerVersionId,
      offerRevision: row.offerRevision,
      actorWorkspaceMembershipId: row.actorWorkspaceMembershipId,
      decidedAt: row.decidedAt.toISOString(),
    };
    if (row.state === 'REJECTED' && row.reason !== null)
      return { ...base, state: 'REJECTED', reason: row.reason };
    if (
      row.state !== 'APPROVED' ||
      !row.qualityRunId ||
      !row.representationSha256
    )
      throw new Error('Invalid stored Offer decision.');
    const [run] = await this.databaseContext.connection
      .select()
      .from(offerQualityRuns)
      .where(
        and(
          eq(offerQualityRuns.workspaceId, row.workspaceId),
          eq(offerQualityRuns.companyId, row.companyId),
          eq(offerQualityRuns.offerId, row.offerId),
          eq(offerQualityRuns.offerVersionId, row.offerVersionId),
          eq(offerQualityRuns.id, row.qualityRunId),
        ),
      );
    if (!run) throw new Error('The approval Quality Check run is missing.');
    return {
      ...base,
      state: 'APPROVED',
      qualityRun: qualityRunView(run),
      acknowledgedWarningCodes: readOfferWarningCodes(
        row.acknowledgedWarningCodes,
      ),
      representationSha256: row.representationSha256,
    };
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
    const [latestRun] = await this.databaseContext.connection
      .select()
      .from(offerQualityRuns)
      .where(
        and(
          eq(offerQualityRuns.workspaceId, actor.workspaceId),
          eq(offerQualityRuns.companyId, offer.companyId),
          eq(offerQualityRuns.offerVersionId, version.id),
        ),
      )
      .orderBy(desc(offerQualityRuns.sequence))
      .limit(1);
    const decisionRow = await this.findDecision(
      actor.workspaceId,
      offer.companyId,
      version.id,
    );
    const decision = decisionRow ? await this.decisionView(decisionRow) : null;
    const transmissionRow = await this.findTransmission(
      actor.workspaceId,
      offer.companyId,
      version.id,
    );
    const responseRow = await this.findClientResponse({
      workspaceId: actor.workspaceId,
      companyId: offer.companyId,
      offerVersionId: version.id,
    });
    const clientResponse = responseRow
      ? this.clientResponseView(responseRow)
      : null;
    const transmissionState: OfferTransmissionState = transmissionRow
      ? {
          transmissionState: 'TRANSMITTED',
          ...offerClientResponseState(clientResponse),
          transmission: await this.transmissionView(transmissionRow),
        }
      : {
          transmissionState: 'NOT_TRANSMITTED',
          clientResponseState: 'NONE',
          clientResponse: null,
          transmission: null,
        };
    return {
      id: offer.id,
      companyId: offer.companyId,
      opportunityId: offer.opportunityId,
      clientRequestId: offer.clientRequestId,
      originalClientAccountId: offer.originalClientAccountId,
      illustrativeReference: offer.illustrativeReference,
      revision: offer.revision,
      provisional: true,
      createdByWorkspaceMembershipId: offer.createdByWorkspaceMembershipId,
      createdAt: offer.createdAt.toISOString(),
      ...(clientReference ? { clientReference } : {}),
      version: {
        ...offerVersionView(offer.illustrativeReference, version, snapshot),
        differences: await this.versionDifferences(
          actor,
          offer,
          version,
          snapshot,
        ),
        latestQualityRun: latestRun ? qualityRunView(latestRun) : null,
        decision,
        decisionState: decision?.state ?? 'PENDING',
        ...transmissionState,
        validityElapsed: this.clock.now() >= version.validUntil,
      },
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
    offerVersionId?: string | number,
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
          typeof offerVersionId === 'number'
            ? eq(offerVersions.versionNumber, offerVersionId)
            : offerVersionId
              ? eq(offerVersions.id, offerVersionId)
              : undefined,
        ),
      )
      .orderBy(desc(offerVersions.versionNumber))
      .limit(1);
    if (!version) throw new NotFoundException();
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
  illustrativeReference: number,
  row: OfferVersionRow,
  pricingSnapshot: PricingSnapshotRecord,
): Omit<OfferVersionRecord, 'latestQualityRun' | 'decision'> {
  if (
    !Number.isSafeInteger(row.versionNumber) ||
    row.versionNumber < 1 ||
    row.decisionState !== 'PENDING' ||
    row.transmissionState !== 'NOT_TRANSMITTED' ||
    row.clientResponseState !== 'NONE' ||
    row.provenance !== 'ILLUSTRATIVE'
  )
    throw new Error('Offer Version 1 has an invalid stored state.');
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    predecessorVersionId: row.predecessorVersionId,
    supersededByVersionId: row.supersededByVersionId,
    supersededAt: row.supersededAt?.toISOString() ?? null,
    differences: [],
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
    clientResponse: null,
    validityElapsed: false,
    transmission: null,
    provenance: 'ILLUSTRATIVE',
    provisional: true,
    createdByWorkspaceMembershipId: row.createdByWorkspaceMembershipId,
    createdAt: row.createdAt.toISOString(),
    representation: renderOfferRepresentation({
      templateCode: row.templateCode,
      templateVersion: row.templateVersion,
      illustrativeReference,
      versionNumber: row.versionNumber,
      issuingCompanyLabel: row.issuingCompanyLabel,
      recipient: {
        legalName: row.recipientLegalName,
        taxId: row.recipientTaxId,
        legalAddress: row.recipientLegalAddress,
      },
      createdAt: row.createdAt.toISOString(),
      validUntil: row.validUntil.toISOString(),
      lines: pricingSnapshot.lines,
      subtotal: pricingSnapshot.subtotal,
      taxTotal: pricingSnapshot.taxTotal,
      total: pricingSnapshot.total,
      currency: pricingSnapshot.currency,
      scopeNote: row.scopeNote,
      commercialConditions: row.commercialConditions,
      pricingSnapshotId: pricingSnapshot.id,
      provenance: 'ILLUSTRATIVE',
    }),
  };
}

function recordedDifferences(
  previous: OfferVersionRow,
  previousSnapshot: PricingSnapshotRecord,
  current: OfferVersionRow,
  currentSnapshot: PricingSnapshotRecord,
): OfferVersionDifference[] {
  function fields(
    version: OfferVersionRow,
    snapshot: PricingSnapshotRecord,
  ): Record<string, string | number | null> {
    return {
      recipientKind: version.recipientKind,
      recipientAdditionalLegalEntityId:
        version.recipientAdditionalLegalEntityId,
      recipientLegalName: version.recipientLegalName,
      recipientTaxId: version.recipientTaxId,
      recipientLegalAddress: version.recipientLegalAddress,
      pricingSnapshotId: snapshot.id,
      currency: snapshot.currency,
      total: snapshot.total,
      validityDays: version.validityDays,
      validUntil: version.validUntil.toISOString(),
      scopeNote: version.scopeNote,
      commercialConditions: version.commercialConditions,
    };
  }
  const before = fields(previous, previousSnapshot);
  return Object.entries(fields(current, currentSnapshot)).map(
    ([field, value]) => ({
      field,
      previous: before[field] ?? null,
      current: value,
      changed: before[field] !== value,
    }),
  );
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

function qualityRunView(
  row: typeof offerQualityRuns.$inferSelect,
): OfferQualityRun {
  if (row.ruleSet !== 'OFFER_QUALITY_ILLUSTRATIVE' || row.ruleSetVersion !== 1)
    throw new Error('Unsupported stored Offer Quality Check rule set.');
  return {
    id: row.id,
    offerVersionId: row.offerVersionId,
    ruleSet: row.ruleSet,
    ruleSetVersion: 1,
    actorWorkspaceMembershipId: row.actorWorkspaceMembershipId,
    evaluatedAt: row.evaluatedAt.toISOString(),
    results: readOfferQualityResults(row.results),
  };
}

function requireUnadjustedOfferSnapshot(snapshot: PricingSnapshotRecord): void {
  if (snapshot.lines.some((line) => line.adjustment !== null))
    throw namedConflict(
      'PRICING_SNAPSHOT_ADJUSTMENT_UNSUPPORTED',
      'Adjusted Pricing Snapshots are not supported by Offer version 1.',
    );
}
