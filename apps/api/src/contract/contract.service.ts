import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
  contracts,
  contractVersions,
  contractCommands,
  contractReferenceCounters,
} from '../database/schema/index.js';
import { OfferService } from '../offer/offer.service.js';
import type { OfferRecipientCopy } from '../offer/offer.types.js';
import { commandFingerprint } from '../pricing-configuration/pricing-configuration-publication.js';
import { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import { readCreateContractCommand } from './contract.validation.js';
import {
  CONTRACT_TEMPLATE_CODE,
  CONTRACT_TEMPLATE_VERSION,
  CONTRACT_CLAUSE_VERSIONS,
  renderContractRepresentation,
} from './contract-representation.js';

type ContractRow = typeof contracts.$inferSelect;
type VersionRow = typeof contractVersions.$inferSelect;

@Injectable()
export class ContractService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly accountability: AccountabilityService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly intake: CommercialIntakeService,
    private readonly offers: OfferService,
    private readonly pricing: PricingSnapshotService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  async create(input: {
    actor: ActorContext;
    opportunityId: string;
    payload: unknown;
    idempotencyKey: string | undefined;
  }) {
    await this.authorization.requireContractAccess(input.actor, [
      'commercial.contract.prepare',
    ]);
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    return this.databaseContext
      .transaction(async () => {
        const { actor } = input;
        const companyId = await this.authorization.requireContractAccess(
          actor,
          ['commercial.contract.prepare'],
          true,
        );
        const opportunity = await this.intake.requireReadableOfferOpportunity(
          actor,
          input.opportunityId,
          true,
        );
        const command = readCreateContractCommand(input.payload);
        const source = await this.offers.resolveAcceptedContractSource({
          actor,
          opportunityId: opportunity.id,
          offerVersionId: command.acceptedOfferVersionId,
          lock: false,
        });
        const selection =
          source.recipient.kind === 'PRIMARY'
            ? { kind: 'PRIMARY' as const }
            : {
                kind: 'ADDITIONAL' as const,
                legalEntityId: source.recipient.additionalLegalEntityId,
              };
        // Client's write fence precedes any Offer lock or live identity projection.
        const recipient = await this.clients.lockOfferRecipient(
          actor,
          source.originalClientAccountId,
          selection,
        );
        await this.offers.resolveAcceptedContractSource({
          actor,
          opportunityId: opportunity.id,
          offerVersionId: command.acceptedOfferVersionId,
          lock: true,
        });
        const fingerprint = commandFingerprint({
          opportunityId: opportunity.id,
          payload: input.payload,
        });
        await this.databaseContext.connection.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.workspaceId}:${companyId}:${actor.workspaceMembershipId}:${idempotencyKey}`},0))`,
        );
        const [receipt] = await this.databaseContext.connection
          .select()
          .from(contractCommands)
          .where(
            and(
              eq(contractCommands.workspaceId, actor.workspaceId),
              eq(contractCommands.companyId, companyId),
              eq(
                contractCommands.actorWorkspaceMembershipId,
                actor.workspaceMembershipId,
              ),
              eq(contractCommands.idempotencyKey, idempotencyKey),
            ),
          );
        if (receipt) {
          if (
            receipt.fingerprint !== fingerprint ||
            receipt.opportunityId !== opportunity.id
          )
            throw conflict(
              'IDEMPOTENCY_CONFLICT',
              'Idempotency-Key was used for another Contract command.',
            );
          const existing = await this.find({
            actor,
            companyId,
            opportunityId: opportunity.id,
          });
          if (!existing || existing.contract.id !== receipt.resultContractId)
            throw new Error('Missing recorded Contract.');
          return this.view(actor, existing.contract, existing.version);
        }
        if (
          await this.find({ actor, companyId, opportunityId: opportunity.id })
        )
          throw conflict(
            'CONTRACT_ALREADY_EXISTS',
            'This Opportunity already has a Contract.',
          );
        const createdAt = this.clock.now();
        const [counter] = await this.databaseContext.connection
          .insert(contractReferenceCounters)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            kind: 'CONTRACT',
            currentReference: 1,
          })
          .onConflictDoUpdate({
            target: [
              contractReferenceCounters.workspaceId,
              contractReferenceCounters.companyId,
              contractReferenceCounters.kind,
            ],
            set: {
              currentReference: sql`${contractReferenceCounters.currentReference} + 1`,
            },
          })
          .returning();
        if (!counter) throw new Error('Missing Contract reference.');
        const attribution = {
          workspaceId: actor.workspaceId,
          companyId,
          createdByInternalUserId: actor.internalUserId,
          createdByWorkspaceMembershipId: actor.workspaceMembershipId,
          createdAt,
        };
        const [contract] = await this.databaseContext.connection
          .insert(contracts)
          .values({
            ...attribution,
            opportunityId: opportunity.id,
            clientRequestId: source.clientRequestId,
            originalClientAccountId: source.originalClientAccountId,
            sourceOfferId: source.offerId,
            sourceOfferVersionId: source.offerVersionId,
            illustrativeReference: counter.currentReference,
          })
          .returning();
        if (!contract) throw new Error('Contract was not recorded.');
        const [version] = await this.databaseContext.connection
          .insert(contractVersions)
          .values({
            ...attribution,
            contractId: contract.id,
            opportunityId: opportunity.id,
            pricingSnapshotId: source.pricingSnapshotId,
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
            scopeNote: source.scopeNote,
            commercialConditions: source.commercialConditions,
            termStartsOn: command.termStartsOn,
            termEndsOn: command.termEndsOn,
            specialConditions: command.specialConditions,
            templateCode: CONTRACT_TEMPLATE_CODE,
            templateVersion: CONTRACT_TEMPLATE_VERSION,
            clauseVersions: CONTRACT_CLAUSE_VERSIONS,
          })
          .returning();
        if (!version) throw new Error('Contract Version was not recorded.');
        await this.clients.recordLockedReferenceUse(actor, recipient);
        await this.databaseContext.connection.insert(contractCommands).values({
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          fingerprint,
          opportunityId: opportunity.id,
          resultContractId: contract.id,
          createdAt,
        });
        await this.accountability.recordContractCreated({
          actor,
          companyId,
          contractId: contract.id,
          contractVersionId: version.id,
          illustrativeReference: contract.illustrativeReference,
          offerVersionId: source.offerVersionId,
          pricingSnapshotId: source.pricingSnapshotId,
          occurredAt: createdAt,
        });
        return this.view(actor, contract, version);
      })
      .catch((error: unknown) => {
        if (error instanceof HttpException) throw error;
        throw new InternalServerErrorException({
          code: 'CONTRACT_CREATION_UNCERTAIN',
          correlationId: randomUUID(),
          message:
            'The Contract outcome is uncertain. Retry the identical command.',
        });
      });
  }

  async read(input: {
    actor: ActorContext;
    opportunityId: string;
    versionId?: string;
  }) {
    return this.databaseContext.transaction(async () => {
      const companyId = await this.authorization.requireContractAccess(
        input.actor,
        ['commercial.contract.read'],
        true,
      );
      const opportunity = await this.intake.requireReadableOfferOpportunity(
        input.actor,
        input.opportunityId,
        false,
      );
      const found = await this.find({
        actor: input.actor,
        companyId,
        opportunityId: opportunity.id,
      });
      if (!found) {
        if (input.versionId) throw new NotFoundException();
        return null;
      }
      if (input.versionId !== undefined && input.versionId !== found.version.id)
        throw new NotFoundException();
      return this.view(input.actor, found.contract, found.version);
    });
  }

  async listVersions(input: {
    actor: ActorContext;
    opportunityId: string;
    limit: string | undefined;
    cursor: string | undefined;
  }) {
    const limit = input.limit === undefined ? 25 : Number(input.limit);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (input.limit !== undefined && !/^\d+$/u.test(input.limit))
    )
      throw new BadRequestException({ field: 'limit' });
    const contract = await this.read(input);
    if (
      input.cursor !== undefined &&
      (!contract || input.cursor !== contract.version.id)
    )
      throw new BadRequestException({ field: 'cursor' });
    return {
      items: contract && input.cursor === undefined ? [contract.version] : [],
      nextCursor: null,
    };
  }

  private async find({
    actor,
    companyId,
    opportunityId,
  }: {
    actor: ActorContext;
    companyId: string;
    opportunityId: string;
  }) {
    const [found] = await this.databaseContext.connection
      .select({ contract: contracts, version: contractVersions })
      .from(contracts)
      .innerJoin(
        contractVersions,
        and(
          eq(contractVersions.workspaceId, contracts.workspaceId),
          eq(contractVersions.companyId, contracts.companyId),
          eq(contractVersions.contractId, contracts.id),
        ),
      )
      .where(
        and(
          eq(contracts.workspaceId, actor.workspaceId),
          eq(contracts.companyId, companyId),
          eq(contracts.opportunityId, opportunityId),
        ),
      );
    return found;
  }

  private async view(
    actor: ActorContext,
    contract: ContractRow,
    version: VersionRow,
  ) {
    if (
      contract.kind !== 'CONTRACT' ||
      contract.origin !== 'ACCEPTED_OFFER' ||
      contract.revision !== 1 ||
      version.versionNumber !== 1 ||
      version.decisionState !== 'PENDING' ||
      version.executionState !== 'NOT_EXECUTED' ||
      version.provenance !== 'ILLUSTRATIVE'
    )
      throw new Error('Invalid stored Contract state.');
    const party = {
      legalName: version.recipientLegalName,
      taxId: version.recipientTaxId,
      legalAddress: version.recipientLegalAddress,
    };
    let recipient: OfferRecipientCopy;
    if (
      version.recipientKind === 'PRIMARY' &&
      version.recipientAdditionalLegalEntityId === null
    )
      recipient = { ...party, kind: 'PRIMARY' };
    else if (
      version.recipientKind === 'ADDITIONAL' &&
      version.recipientAdditionalLegalEntityId
    )
      recipient = {
        ...party,
        kind: 'ADDITIONAL',
        additionalLegalEntityId: version.recipientAdditionalLegalEntityId,
      };
    else throw new Error('Invalid recorded Contract party.');
    const pricingSnapshot = await this.pricing.resolveContractVersionSnapshot({
      actor,
      companyId: contract.companyId,
      opportunityId: contract.opportunityId,
      contractVersionId: version.id,
    });
    const sourceOffer = await this.offers.readContractSourceReference({
      actor,
      contractId: contract.id,
      opportunityId: contract.opportunityId,
    });
    const clientReference = await this.intake.readPricingClientProjection(
      actor,
      contract.originalClientAccountId,
    );
    return {
      id: contract.id,
      companyId: contract.companyId,
      opportunityId: contract.opportunityId,
      clientRequestId: contract.clientRequestId,
      originalClientAccountId: contract.originalClientAccountId,
      kind: contract.kind,
      origin: contract.origin,
      sourceOfferId: contract.sourceOfferId,
      sourceOfferVersionId: contract.sourceOfferVersionId,
      sourceOffer,
      illustrativeReference: contract.illustrativeReference,
      revision: contract.revision,
      provisional: true,
      createdByWorkspaceMembershipId: contract.createdByWorkspaceMembershipId,
      createdAt: contract.createdAt.toISOString(),
      ...(clientReference ? { clientReference } : {}),
      version: {
        id: version.id,
        representation: renderContractRepresentation({
          templateCode: version.templateCode,
          templateVersion: version.templateVersion,
          clauseVersions: version.clauseVersions,
          illustrativeReference: contract.illustrativeReference,
          versionNumber: version.versionNumber,
          issuingCompanyLabel: version.issuingCompanyLabel,
          recipient,
          createdAt: version.createdAt.toISOString(),
          sourceOffer,
          pricingSnapshotId: version.pricingSnapshotId,
          lines: pricingSnapshot.lines,
          subtotal: pricingSnapshot.subtotal,
          taxTotal: pricingSnapshot.taxTotal,
          total: pricingSnapshot.total,
          currency: pricingSnapshot.currency,
          scopeNote: version.scopeNote,
          commercialConditions: version.commercialConditions,
          termStartsOn: version.termStartsOn,
          termEndsOn: version.termEndsOn,
          specialConditions: version.specialConditions,
          provenance: 'ILLUSTRATIVE',
        }),
        versionNumber: version.versionNumber,
        recipient,
        issuingCompanyLabel: version.issuingCompanyLabel,
        pricingSnapshotId: version.pricingSnapshotId,
        pricingSnapshot,
        scopeNote: version.scopeNote,
        commercialConditions: version.commercialConditions,
        termStartsOn: version.termStartsOn,
        termEndsOn: version.termEndsOn,
        specialConditions: version.specialConditions,
        decisionState: version.decisionState,
        executionState: version.executionState,
        provenance: version.provenance,
        provisional: true,
        createdByWorkspaceMembershipId: version.createdByWorkspaceMembershipId,
        createdAt: version.createdAt.toISOString(),
      },
    };
  }
}
function conflict(code: string, message: string) {
  return new ConflictException({ code, message });
}
