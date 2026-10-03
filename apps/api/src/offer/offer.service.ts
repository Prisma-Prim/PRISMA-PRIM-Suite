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
import { and, desc, DrizzleQueryError, eq, sql } from 'drizzle-orm';
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
  offerQualityRuns,
  offerDecisions,
  OFFER_TEMPLATE_CODE,
  OFFER_TEMPLATE_VERSION,
} from '../database/schema/index.js';
import { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import { commandFingerprint } from '../pricing-configuration/pricing-configuration-publication.js';
import type { PricingSnapshotRecord } from '../pricing-configuration/pricing-snapshot.types.js';
import type {
  OfferRecord,
  OfferVersionRecord,
  OfferRecipientCopy,
  OfferDecision,
} from './offer.types.js';
import {
  readCreateOfferCommand,
  readOfferDecisionCommand,
  readOfferWarningCodes,
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

  async read(
    actor: ActorContext,
    opportunityId: string,
  ): Promise<OfferRecord | null> {
    await this.authorization.requireOfferAccess(actor, [
      'commercial.offer.read',
    ]);
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
        previousTransmittedCurrency: null,
        ...context,
        recipientTaxId: target.recipientTaxId,
        provenance: target.provenance,
        provisional: target.provenance === 'ILLUSTRATIVE',
      });
      // O1 permits only version 1 and no transmissions. O5/O7 supply the earlier
      // transmitted version when their actual persisted states are introduced.
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
        requireHeadOfferVersion({
          offerVersionId: target.id,
          headVersionId: head?.id,
        });
        if (offer.revision !== command.expectedOfferRevision)
          throw namedConflict(
            'STALE_OFFER_REVISION',
            'The Offer changed. Reload it before deciding.',
          );
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
            previousTransmittedCurrency: null,
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
        latestQualityRun: latestRun ? qualityRunView(latestRun) : null,
        decision,
        decisionState: decision?.state ?? 'PENDING',
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
  illustrativeReference: number,
  row: OfferVersionRow,
  pricingSnapshot: PricingSnapshotRecord,
): Omit<OfferVersionRecord, 'latestQualityRun' | 'decision'> {
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
