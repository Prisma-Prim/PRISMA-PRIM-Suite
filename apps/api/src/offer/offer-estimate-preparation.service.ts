import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  INTERNAL_ESTIMATE_OFFER_PROVENANCE,
  offerCommands,
  offerClientResponses,
  offers,
  offerVersions,
} from '../database/schema/index.js';
import { ProfitabilityEstimateService } from '../profitability-estimate/profitability-estimate.service.js';
import { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import { OfferCommandStore } from './offer-command-store.js';
import { EstimateOfferView } from './offer-estimate-view.js';
import {
  readCreateEstimateOfferCommand,
  readCreateEstimateOfferVersionCommand,
} from './offer.validation.js';
import type { InternalOfferRecord } from './offer-estimate-preparation.types.js';

interface PreparationInput {
  actor: ActorContext;
  opportunityId: string;
  payload: unknown;
  key: string | undefined;
}

type PreparationCommand =
  | ({ kind: 'CREATE_ESTIMATE_OFFER' } & ReturnType<
      typeof readCreateEstimateOfferCommand
    >)
  | ({
      kind: 'CREATE_ESTIMATE_OFFER_VERSION';
      offer: typeof offers.$inferSelect;
    } & ReturnType<typeof readCreateEstimateOfferVersionCommand>);

@Injectable()
export class EstimateOfferPreparationService {
  private readonly commands: OfferCommandStore;
  private readonly views: EstimateOfferView;

  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly accountability: AccountabilityService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly intake: CommercialIntakeService,
    private readonly estimates: ProfitabilityEstimateService,
    pricing: PricingSnapshotService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {
    this.commands = new OfferCommandStore(database);
    this.views = new EstimateOfferView({ database, intake, clock, pricing });
  }

  create(input: PreparationInput): Promise<InternalOfferRecord> {
    return this.prepare(input, 'CREATE_ESTIMATE_OFFER');
  }

  createVersion(input: PreparationInput): Promise<InternalOfferRecord> {
    return this.prepare(input, 'CREATE_ESTIMATE_OFFER_VERSION');
  }

  private async prepare(
    { actor, opportunityId, payload, key }: PreparationInput,
    kind: 'CREATE_ESTIMATE_OFFER' | 'CREATE_ESTIMATE_OFFER_VERSION',
  ): Promise<InternalOfferRecord> {
    await this.requireAccess(actor);
    const idempotencyKey = requireIdempotencyKey(key);
    try {
      return await this.database.transaction(async () => {
        const companyId = await this.requireAccess(actor, true);
        await this.authorization.requireProfitabilityEstimateAccess(
          actor,
          'read',
          true,
        );
        const opportunity = await this.intake.requireReadableOfferOpportunity(
          actor,
          opportunityId,
          true,
        );
        const fingerprint = commandFingerprint({
          kind,
          opportunityId: opportunity.id,
          payload,
        });
        await this.commands.lock({ actor, companyId, idempotencyKey });
        const receipt = await this.commands.find({
          actor,
          companyId,
          idempotencyKey,
        });
        if (
          receipt &&
          (receipt.kind !== kind ||
            receipt.opportunityId !== opportunity.id ||
            receipt.fingerprint !== fingerprint)
        )
          throw conflict(
            'IDEMPOTENCY_CONFLICT',
            'The key belongs to another Offer command.',
          );
        if (
          !receipt &&
          kind === 'CREATE_ESTIMATE_OFFER' &&
          opportunity.status !== 'OPEN'
        )
          throw conflict(
            'OPPORTUNITY_NOT_OPEN',
            'The Opportunity is not open.',
          );
        if (!opportunity.originalClientAccountId)
          throw conflict(
            'OFFER_CLIENT_REQUIRED',
            'The Request needs a readable Client.',
          );
        const [existing] = await this.database.connection
          .select()
          .from(offers)
          .where(
            and(
              eq(offers.workspaceId, actor.workspaceId),
              eq(offers.companyId, companyId),
              eq(offers.opportunityId, opportunity.id),
            ),
          );
        const originalClientAccountId =
          existing?.originalClientAccountId ??
          opportunity.originalClientAccountId;
        let command: PreparationCommand;
        if (kind === 'CREATE_ESTIMATE_OFFER')
          command = { kind, ...readCreateEstimateOfferCommand(payload) };
        else {
          if (!existing) throw new NotFoundException();
          command = {
            kind,
            offer: existing,
            ...readCreateEstimateOfferVersionCommand(payload),
          };
        }
        // Acquire the write fence before a source read can borrow Client shares.
        const recipient = await this.clients.lockOfferRecipient(
          actor,
          originalClientAccountId,
          command.recipient,
        );
        const source =
          await this.estimates.readApprovedOfferPriceWithinTransaction({
            actor,
            opportunityId: opportunity.id,
            versionId: command.estimateVersionId,
            versionNumber: command.estimateVersionNumber,
          });
        if (receipt) {
          if (!receipt.resultVersionId || receipt.resultOfferRevision === null)
            throw new Error('The internal Offer receipt is incomplete.');
          const [offer] = await this.database.connection
            .select()
            .from(offers)
            .where(
              and(
                eq(offers.workspaceId, actor.workspaceId),
                eq(offers.companyId, companyId),
                eq(offers.id, receipt.resultOfferId),
              ),
            );
          const [version] = await this.database.connection
            .select()
            .from(offerVersions)
            .where(
              and(
                eq(offerVersions.workspaceId, actor.workspaceId),
                eq(offerVersions.companyId, companyId),
                eq(offerVersions.offerId, receipt.resultOfferId),
                eq(offerVersions.id, receipt.resultVersionId),
              ),
            );
          if (!offer || !version) throw new NotFoundException();
          return this.views.readPrepared({
            actor,
            offer,
            version,
            revision: receipt.resultOfferRevision,
          });
        }
        if (kind === 'CREATE_ESTIMATE_OFFER' && existing)
          throw conflict(
            'OFFER_ALREADY_EXISTS',
            'An Offer already exists for this Opportunity.',
          );
        let predecessor: typeof offerVersions.$inferSelect | undefined;
        let current = existing;
        if (command.kind === 'CREATE_ESTIMATE_OFFER_VERSION') {
          const [locked] = await this.database.connection
            .select()
            .from(offers)
            .where(
              and(
                eq(offers.workspaceId, actor.workspaceId),
                eq(offers.companyId, companyId),
                eq(offers.id, command.offer.id),
              ),
            )
            .for('update');
          if (!locked) throw new NotFoundException();
          current = locked;
          if (locked.revision !== command.expectedOfferRevision)
            throw conflict(
              'STALE_OFFER_REVISION',
              'The Offer changed. Reload it before creating a Version.',
            );
          const [accepted] = await this.database.connection
            .select({ id: offerClientResponses.id })
            .from(offerClientResponses)
            .where(
              and(
                eq(offerClientResponses.workspaceId, actor.workspaceId),
                eq(offerClientResponses.companyId, companyId),
                eq(offerClientResponses.offerId, locked.id),
                eq(offerClientResponses.outcome, 'ACCEPTED'),
              ),
            )
            .limit(1);
          if (accepted)
            throw conflict(
              'OFFER_ACCEPTED',
              'The accepted Offer cannot receive another Version.',
            );
          const [head] = await this.database.connection
            .select()
            .from(offerVersions)
            .where(
              and(
                eq(offerVersions.workspaceId, actor.workspaceId),
                eq(offerVersions.companyId, companyId),
                eq(offerVersions.offerId, locked.id),
              ),
            )
            .orderBy(desc(offerVersions.versionNumber))
            .limit(1);
          if (!head) throw new Error('The Offer head is missing.');
          predecessor = head;
        }
        const company = actor.activeCompany;
        if (!company || company.id !== companyId)
          throw new ForbiddenException();
        const createdAt = this.clock.now();
        const illustrativeReference =
          current?.illustrativeReference ??
          (await this.commands.allocateReference({
            workspaceId: actor.workspaceId,
            companyId,
          }));
        const [offer] = current
          ? [current]
          : await this.database.connection
              .insert(offers)
              .values({
                workspaceId: actor.workspaceId,
                companyId,
                opportunityId: opportunity.id,
                clientRequestId: opportunity.clientRequestId,
                originalClientAccountId,
                illustrativeReference,
                createdByInternalUserId: actor.internalUserId,
                createdByWorkspaceMembershipId: actor.workspaceMembershipId,
                createdAt,
              })
              .returning();
        if (!offer) throw new Error('The internal Offer was not recorded.');
        const [version] = await this.database.connection
          .insert(offerVersions)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            offerId: offer.id,
            opportunityId: opportunity.id,
            clientRequestId: opportunity.clientRequestId,
            originalClientAccountId,
            versionNumber: predecessor ? predecessor.versionNumber + 1 : 1,
            predecessorVersionId: predecessor?.id ?? null,
            pricingSnapshotId: null,
            estimateSourceId: source.estimateId,
            estimateSourceVersionId: source.estimateVersionId,
            estimateSourceVersionNumber: source.estimateVersionNumber,
            estimateSourceDecisionId: source.approvalDecisionId,
            estimateSourceDecisionCode: 'APPROVE',
            estimateSourceApprovedAt: new Date(source.approvedAt),
            estimateSourceAmount: source.amount,
            estimateSourceCurrency: source.currency,
            recipientClientAccountId: recipient.currentClientAccountId,
            recipientKind: recipient.recipient.kind,
            recipientAdditionalLegalEntityId:
              recipient.recipient.kind === 'ADDITIONAL'
                ? recipient.recipient.additionalLegalEntityId
                : null,
            recipientLegalName: recipient.recipient.legalName,
            recipientTaxId: recipient.recipient.taxId,
            recipientLegalAddress: recipient.recipient.legalAddress,
            issuingCompanyLabel: company.displayName,
            validityDays: command.validityDays,
            validUntil: new Date(
              createdAt.getTime() + command.validityDays * 86_400_000,
            ),
            scopeNote: command.scopeNote,
            commercialConditions: command.commercialConditions,
            templateCode: null,
            templateVersion: null,
            provenance: INTERNAL_ESTIMATE_OFFER_PROVENANCE,
            createdByInternalUserId: actor.internalUserId,
            createdByWorkspaceMembershipId: actor.workspaceMembershipId,
            createdAt,
          })
          .returning();
        if (!version)
          throw new Error('The internal Offer Version was not recorded.');
        const revision = predecessor ? offer.revision + 1 : 1;
        if (predecessor) {
          await this.database.connection
            .update(offerVersions)
            .set({ supersededByVersionId: version.id, supersededAt: createdAt })
            .where(eq(offerVersions.id, predecessor.id));
          await this.database.connection
            .update(offers)
            .set({ revision })
            .where(eq(offers.id, offer.id));
        }
        await this.clients.recordLockedReferenceUse(actor, recipient);
        await this.database.connection.insert(offerCommands).values({
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          fingerprint,
          opportunityId: opportunity.id,
          resultOfferId: offer.id,
          kind,
          resultVersionId: version.id,
          resultOfferRevision: revision,
          createdAt,
        });
        await this.accountability.recordInternalOfferPrepared({
          actor,
          companyId,
          offerId: offer.id,
          offerVersionId: version.id,
          versionNumber: version.versionNumber,
          illustrativeReference,
          recipientKind: recipient.recipient.kind,
          estimateVersionId: source.estimateVersionId,
          estimateVersionNumber: source.estimateVersionNumber,
          approvalDecisionId: source.approvalDecisionId,
          occurredAt: createdAt,
        });
        return this.views.readPrepared({ actor, offer, version, revision });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // PostgreSQL details can include amounts and recipient values.
      throw new InternalServerErrorException({
        code: 'OFFER_COMMAND_FAILED',
        message: 'The Offer command could not be completed.',
      });
    }
  }

  private requireAccess(actor: ActorContext, lock = false) {
    return this.authorization.requireOfferAccess(
      actor,
      [
        'commercial.offer.read',
        'commercial.offer.prepare',
        'commercial.offer.estimate.prepare',
      ],
      lock,
    );
  }
}

function conflict(code: string, message: string) {
  return new ConflictException({ code, message });
}
