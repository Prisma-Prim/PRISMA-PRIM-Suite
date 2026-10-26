import { runClientReferenceTransaction } from '../client/client-reference-transaction.js';
import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
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
import { ContractModelService } from '../contract-model/contract-model.service.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  contracts,
  contractVersions,
  contractCommands,
  contractReferenceCounters,
} from '../database/schema/index.js';
import { OfferService } from '../offer/offer.service.js';
import { readModelContractPreparation } from './model-contract-case.js';
import type { ModelContractOfferSource } from './model-contract-representation.js';
import { modelContractVersionValues } from './model-contract-version-values.js';
import {
  ContractVersionReader,
  recordedRecipient,
} from './contract-version-reader.js';
import { contractSource } from './contract-source.js';
import { storedModelContractSnapshot } from './model-contract-snapshot.js';
import { evaluateModelContractQuality } from './model-contract-quality.js';
import type { ContractQualityEvaluation } from './contract-quality.js';
import { modelContractCreationReceipt } from './model-contract-view.js';

type ContractRow = typeof contracts.$inferSelect;
type PreparationInput = {
  actor: ActorContext;
  opportunityId: string;
  payload: unknown;
  idempotencyKey: string | undefined;
};

@Injectable()
export class ModelContractService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly accountability: AccountabilityService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly intake: CommercialIntakeService,
    private readonly offers: OfferService,
    private readonly models: ContractModelService,
    private readonly versions: ContractVersionReader,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  prepare(input: PreparationInput) {
    return this.prepareCommand(input, false);
  }
  createVersion(input: PreparationInput) {
    return this.prepareCommand(input, true);
  }

  /** Join the owning command transaction. Client, Offer, then Contract fences. */
  async evaluateFreshQualityWithinTransaction(input: {
    actor: ActorContext;
    companyId: string;
    contract: ContractRow;
    version: typeof contractVersions.$inferSelect;
  }): Promise<ContractQualityEvaluation> {
    await this.authorization.requireContractQualityAccess(
      input.actor,
      true,
      true,
    );
    return this.evaluateBoundQualityWithinTransaction(input);
  }

  /** Declaration consumes ordinary signature authority, never model-based approval. */
  async evaluateSigningQualityWithinTransaction(input: {
    actor: ActorContext;
    companyId: string;
    contract: ContractRow;
    version: typeof contractVersions.$inferSelect;
  }): Promise<ContractQualityEvaluation> {
    await this.authorization.requireContractAccess(
      input.actor,
      ['commercial.contract.read', 'commercial.contract.signature.record'],
      true,
    );
    return this.evaluateBoundQualityWithinTransaction(input);
  }

  private async evaluateBoundQualityWithinTransaction(input: {
    actor: ActorContext;
    companyId: string;
    contract: ContractRow;
    version: typeof contractVersions.$inferSelect;
  }): Promise<ContractQualityEvaluation> {
    const { actor, companyId, contract, version } = input;
    await this.authorization.requireOfferAccess(
      actor,
      ['commercial.offer.read'],
      true,
    );
    const snapshot = storedModelContractSnapshot(contract, version),
      recipient = recordedRecipient(version);
    const current = await this.clients.inspectOfferQualityContext({
      actor,
      companyId,
      originalClientAccountId: contract.originalClientAccountId,
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
    const source = await this.offers.resolveModelContractSource({
      actor,
      opportunityId: contract.opportunityId,
      offerVersionId: snapshot.offerSource.offerVersionId,
      requireEligible: false,
    });
    await this.lockContractWithinTransaction(contract);
    const head = await this.versions.find({
      actor,
      companyId,
      opportunityId: contract.opportunityId,
      contractId: contract.id,
    });
    if (head?.version.id !== version.id)
      throw conflict('CONTRACT_VERSION_SUPERSEDED');
    const evaluatedAt = this.clock.now();
    return evaluateModelContractQuality({
      snapshot,
      companyId,
      recipient,
      currentSource: source.copy,
      sourceReady: source.ready && evaluatedAt < source.validUntil,
      partyAvailable: current.recipientAvailable,
      identityCurrent: current.recipientIdentityCurrent,
      instant: evaluatedAt,
    });
  }

  private async prepareCommand(input: PreparationInput, successor: boolean) {
    await this.authorization.requireContractAccess(input.actor, [
      'commercial.contract.prepare',
      'commercial.contract.model.select',
      'commercial.contract.model_based.prepare',
    ]);
    const key = requireIdempotencyKey(input.idempotencyKey),
      command = readModelContractPreparation(input.payload, successor);
    return runClientReferenceTransaction({
      database: this.database,
      work: async () => {
        const { actor } = input;
        const companyId = await this.authorization.requireContractAccess(
          actor,
          [
            'commercial.contract.prepare',
            'commercial.contract.model.select',
            'commercial.contract.model_based.prepare',
          ],
          true,
        );
        const opportunity = await this.intake.requireReadableOfferOpportunity(
          actor,
          input.opportunityId,
          true,
        );
        await this.authorization.requireOfferAccess(
          actor,
          ['commercial.offer.read'],
          true,
        );
        await this.clients.lockRecipientReadAuthority(actor);
        const kind = successor ? 'CREATE_VERSION' : 'CREATE';
        const fingerprint = commandFingerprint({
          kind: successor ? 'MODEL_CREATE_VERSION' : 'MODEL_CREATE',
          opportunityId: opportunity.id,
          command,
        });
        await this.database.connection.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.workspaceId}:${companyId}:${actor.workspaceMembershipId}:${key}`},0))`,
        );
        const [receipt] = await this.database.connection
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
              eq(contractCommands.idempotencyKey, key),
            ),
          );
        if (receipt) {
          if (receipt.kind !== kind || receipt.fingerprint !== fingerprint)
            throw conflict('IDEMPOTENCY_CONFLICT');
          const [initial] = successor
            ? []
            : await this.database.connection
                .select({ id: contractVersions.id })
                .from(contractVersions)
                .where(
                  and(
                    eq(contractVersions.workspaceId, actor.workspaceId),
                    eq(contractVersions.companyId, companyId),
                    eq(contractVersions.contractId, receipt.resultContractId),
                    eq(contractVersions.versionNumber, 1),
                  ),
                )
                .limit(1);
          const versionId = successor ? receipt.resultVersionId : initial?.id;
          if (!versionId)
            throw new Error('Missing committed model Contract target.');
          const found = await this.versions.find({
            actor,
            companyId,
            opportunityId: opportunity.id,
            contractId: receipt.resultContractId,
            versionId,
          });
          if (!found) throw new Error('Missing committed model Contract.');
          return modelContractCreationReceipt(
            this.database,
            actor,
            found.contract,
            found.version,
          );
        }
        if (opportunity.status !== 'OPEN')
          throw conflict('OPPORTUNITY_NOT_OPEN');
        let previous = await this.versions.find({
          actor,
          companyId,
          opportunityId: opportunity.id,
        });
        if (!successor && previous) throw conflict('CONTRACT_ALREADY_EXISTS');
        if (
          successor &&
          (!previous ||
            previous.contract.origin !== 'COMPANY_MODEL_OFFER' ||
            previous.version.provenance !== 'COMPANY_MODEL_OFFER')
        )
          throw conflict('CONTRACT_MODEL_SOURCE_REQUIRED');
        if (!opportunity.originalClientAccountId)
          throw conflict('CONTRACT_CLIENT_REQUIRED');
        await this.clients.lockActiveReferenceClient(
          actor,
          opportunity.originalClientAccountId,
        );
        const selected = await this.offers.resolveModelContractSource({
          actor,
          opportunityId: opportunity.id,
          offerVersionId: command.sourceOfferVersionId,
          requireEligible: true,
        });
        const offerSource = selected.copy;
        const recipient = await this.clients.lockOfferRecipient(
          actor,
          offerSource.originalClientAccountId,
          offerSource.recipient.kind === 'PRIMARY'
            ? { kind: 'PRIMARY' }
            : {
                kind: 'ADDITIONAL',
                legalEntityId: offerSource.recipient.additionalLegalEntityId,
              },
        );
        const modelSource =
          await this.models.requireSelectedForContractWithinTransaction({
            actor,
            versionId: command.modelVersionId,
            versionNumber: command.modelVersionNumber,
            approvalDecisionId: command.modelApprovalDecisionId,
          });
        if (previous) {
          await this.lockContractWithinTransaction(previous.contract);
          previous = await this.versions.find({
            actor,
            companyId,
            opportunityId: opportunity.id,
            contractId: previous.contract.id,
          });
          if (
            !previous ||
            previous.contract.origin !== 'COMPANY_MODEL_OFFER' ||
            previous.version.provenance !== 'COMPANY_MODEL_OFFER'
          )
            throw conflict('CONTRACT_MODEL_SOURCE_REQUIRED');
          if (previous.contract.revision !== command.expectedContractRevision)
            throw conflict('STALE_CONTRACT_REVISION');
          if (previous.version.executionState !== 'NOT_EXECUTED')
            throw conflict('CONTRACT_EXECUTED');
          if (
            previous.contract.sourceOfferId !== offerSource.offerId ||
            previous.contract.originalClientAccountId !==
              offerSource.originalClientAccountId ||
            previous.version.recipientKind !== recipient.recipient.kind ||
            previous.version.recipientAdditionalLegalEntityId !==
              (recipient.recipient.kind === 'ADDITIONAL'
                ? recipient.recipient.additionalLegalEntityId
                : null)
          )
            throw conflict('CONTRACT_SOURCE_PARTY_CHANGED');
        }
        const createdAt = this.clock.now();
        if (createdAt >= selected.validUntil)
          throw conflict('OFFER_NOT_PREPARABLE');
        const contract = previous
          ? { ...previous.contract, revision: previous.contract.revision + 1 }
          : await this.createRootWithinTransaction({
              actor,
              companyId,
              offerSource,
              createdAt,
            });
        const [version] = await this.database.connection
          .insert(contractVersions)
          .values(
            modelContractVersionValues({
              actor,
              contract,
              previous: previous?.version ?? null,
              createdAt,
              modelSource,
              offerSource,
              caseDetails: command.caseDetails,
              recipient,
            }),
          )
          .returning();
        if (!version) throw new Error('Missing model Contract Version.');
        if (previous) {
          await this.database.connection
            .update(contractVersions)
            .set({ supersededByVersionId: version.id, supersededAt: createdAt })
            .where(
              and(
                eq(contractVersions.workspaceId, actor.workspaceId),
                eq(contractVersions.companyId, companyId),
                eq(contractVersions.id, previous.version.id),
              ),
            );
          await this.database.connection
            .update(contracts)
            .set({ revision: contract.revision })
            .where(
              and(
                eq(contracts.workspaceId, actor.workspaceId),
                eq(contracts.companyId, companyId),
                eq(contracts.id, contract.id),
              ),
            );
        }
        await this.clients.recordLockedReferenceUse(actor, recipient);
        await this.database.connection.insert(contractCommands).values({
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey: key,
          fingerprint,
          opportunityId: opportunity.id,
          resultContractId: contract.id,
          kind,
          resultVersionId: successor ? version.id : null,
          createdAt,
        });
        if (previous)
          await this.accountability.recordContractVersionCreated({
            actor,
            companyId,
            contractId: contract.id,
            contractVersionId: version.id,
            versionNumber: version.versionNumber,
            predecessorVersionNumber: previous.version.versionNumber,
            source: contractSource(contract, version),
            pricingSnapshotId: null,
            occurredAt: createdAt,
          });
        else
          await this.accountability.recordContractCreated({
            actor,
            companyId,
            contractId: contract.id,
            contractVersionId: version.id,
            illustrativeReference: contract.illustrativeReference,
            source: contractSource(contract, version),
            pricingSnapshotId: null,
            occurredAt: createdAt,
          });
        return modelContractCreationReceipt(
          this.database,
          actor,
          contract,
          version,
        );
      },
    }).catch((error: unknown) => {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException({
        code: 'CONTRACT_CREATION_UNCERTAIN',
        correlationId: randomUUID(),
        message:
          'The Contract outcome is uncertain. Retry the identical command.',
      });
    });
  }

  private async lockContractWithinTransaction(contract: ContractRow) {
    await this.database.connection
      .select({ id: contracts.id })
      .from(contracts)
      .where(
        and(
          eq(contracts.workspaceId, contract.workspaceId),
          eq(contracts.companyId, contract.companyId),
          eq(contracts.id, contract.id),
        ),
      )
      .for('update');
  }
  private async createRootWithinTransaction(input: {
    actor: ActorContext;
    companyId: string;
    offerSource: ModelContractOfferSource;
    createdAt: Date;
  }) {
    const { actor, companyId, offerSource, createdAt } = input;
    const [counter] = await this.database.connection
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
          currentReference: sql`${contractReferenceCounters.currentReference}+1`,
        },
      })
      .returning();
    if (!counter) throw new Error('Missing Contract reference.');
    const [precontract] = await this.database.connection
      .select({ id: contracts.id })
      .from(contracts)
      .where(
        and(
          eq(contracts.workspaceId, actor.workspaceId),
          eq(contracts.companyId, companyId),
          eq(contracts.opportunityId, offerSource.opportunityId),
          eq(contracts.kind, 'PRECONTRACT'),
        ),
      );
    const [contract] = await this.database.connection
      .insert(contracts)
      .values({
        workspaceId: actor.workspaceId,
        companyId,
        opportunityId: offerSource.opportunityId,
        clientRequestId: offerSource.clientRequestId,
        originalClientAccountId: offerSource.originalClientAccountId,
        kind: 'CONTRACT',
        origin: 'COMPANY_MODEL_OFFER',
        sourceOfferId: offerSource.offerId,
        sourceOfferVersionId: offerSource.offerVersionId,
        precontractId: precontract?.id ?? null,
        illustrativeReference: counter.currentReference,
        createdByInternalUserId: actor.internalUserId,
        createdByWorkspaceMembershipId: actor.workspaceMembershipId,
        createdAt,
      })
      .returning();
    if (!contract) throw new Error('Missing model Contract.');
    return contract;
  }
}
function conflict(code: string) {
  return new ConflictException({
    code,
    message:
      'The Contract or its selected source is no longer eligible. Reload and select again.',
  });
}
