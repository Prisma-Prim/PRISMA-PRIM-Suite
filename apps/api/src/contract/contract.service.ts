import { createDirectContract } from './contract-direct-command.js';
import {
  createContractAddendum,
  type CreateAddendumInput,
} from './contract-addendum-command.js';
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
import { and, desc, eq, lt, sql } from 'drizzle-orm';
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
  contractQualityRuns,
} from '../database/schema/index.js';
import { OfferService } from '../offer/offer.service.js';
import type { OfferRecipientCopy } from '../offer/offer.types.js';
import { commandFingerprint } from '../pricing-configuration/pricing-configuration-publication.js';
import { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import {
  evaluateContractQuality,
  requireHeadContractVersion,
  type ContractQualityRun,
} from './contract-quality.js';
import { type ContractDecision } from './contract-decision.js';
import {
  decideContractVersion,
  type DecideContractVersionInput,
} from './contract-decision-command.js';
import { qualityRunView } from './contract-quality-view.js';
import {
  recordContractSignature,
  type RecordContractSignatureInput,
} from './contract-signature-command.js';
import {
  createContractVersion,
  type CreateContractVersionInput,
} from './contract-version-command.js';
import {
  ContractVersionReader,
  recordedRecipient,
} from './contract-version-reader.js';
import { readCreateContractCommand } from './contract.validation.js';
import {
  CONTRACT_TEMPLATE_CODE,
  CONTRACT_TEMPLATE_VERSION,
  CONTRACT_CLAUSE_VERSIONS,
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
    private readonly versions: ContractVersionReader,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  async create(input: {
    actor: ActorContext;
    opportunityId: string;
    contractId?: string;
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
            receipt.kind !== 'CREATE' ||
            receipt.fingerprint !== fingerprint ||
            receipt.opportunityId !== opportunity.id
          )
            throw conflict(
              'IDEMPOTENCY_CONFLICT',
              'Idempotency-Key was used for another Contract command.',
            );
          const [initialVersion] = await this.databaseContext.connection
            .select({ id: contractVersions.id })
            .from(contractVersions)
            .where(
              and(
                eq(contractVersions.workspaceId, actor.workspaceId),
                eq(contractVersions.companyId, companyId),
                eq(contractVersions.contractId, receipt.resultContractId),
                eq(contractVersions.opportunityId, opportunity.id),
                eq(contractVersions.versionNumber, 1),
              ),
            );
          if (!initialVersion)
            throw new Error('Missing created Contract Version.');
          const existing = await this.versions.find({
            actor,
            companyId,
            opportunityId: opportunity.id,
            versionId: initialVersion.id,
          });
          if (!existing || existing.contract.id !== receipt.resultContractId)
            throw new Error('Missing recorded Contract.');
          return this.versions.view(actor, existing.contract, existing.version);
        }
        if (
          await this.versions.find({
            actor,
            companyId,
            opportunityId: opportunity.id,
          })
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
          source: {
            kind: 'ACCEPTED_OFFER',
            offerVersionId: source.offerVersionId,
          },
          pricingSnapshotId: source.pricingSnapshotId,
          occurredAt: createdAt,
        });
        return this.versions.view(actor, contract, version);
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

  async createDirect(input: Parameters<typeof createDirectContract>[0]) {
    return createDirectContract(input, {
      databaseContext: this.databaseContext,
      authorization: this.authorization,
      accountability: this.accountability,
      clients: this.clients,
      intake: this.intake,
      offers: this.offers,
      pricing: this.pricing,
      versions: this.versions,
      clock: this.clock,
    });
  }

  async createAddendum(input: CreateAddendumInput) {
    return createContractAddendum(input, {
      databaseContext: this.databaseContext,
      authorization: this.authorization,
      accountability: this.accountability,
      clients: this.clients,
      intake: this.intake,
      pricing: this.pricing,
      versions: this.versions,
      clock: this.clock,
    });
  }
  async createVersion(input: CreateContractVersionInput) {
    return createContractVersion(input, {
      databaseContext: this.databaseContext,
      authorization: this.authorization,
      accountability: this.accountability,
      clients: this.clients,
      intake: this.intake,
      offers: this.offers,
      pricing: this.pricing,
      clock: this.clock,
      find: (target) => this.versions.find(target),
    });
  }

  async decide(input: DecideContractVersionInput): Promise<ContractDecision> {
    return decideContractVersion(input, {
      databaseContext: this.databaseContext,
      authorization: this.authorization,
      accountability: this.accountability,
      intake: this.intake,
      clock: this.clock,
      find: (target) => this.versions.find(target),
      evaluateFreshQuality: (target) => this.evaluateFreshQuality(target),
      representationChecksum: async (actor, contract, version) =>
        (await this.versions.view(actor, contract, version)).version
          .representation.sha256,
    });
  }

  async recordSignature(input: RecordContractSignatureInput) {
    return recordContractSignature(input, {
      databaseContext: this.databaseContext,
      authorization: this.authorization,
      accountability: this.accountability,
      intake: this.intake,
      clock: this.clock,
      find: (target) => this.versions.find(target),
      evaluateFreshQuality: (target) => this.evaluateFreshQuality(target),
      representationChecksum: async (actor, contract, version) =>
        (await this.versions.view(actor, contract, version)).version
          .representation.sha256,
    });
  }

  async runQualityChecks(input: {
    actor: ActorContext;
    opportunityId: string;
    contractId?: string;
    versionId: string;
    payload: unknown;
    idempotencyKey: string | undefined;
  }): Promise<ContractQualityRun> {
    await this.authorization.requireContractQualityAccess(input.actor);
    const key = requireIdempotencyKey(input.idempotencyKey);
    return this.databaseContext
      .transaction(async () => {
        const { actor } = input;
        const companyId = await this.authorization.requireContractQualityAccess(
          actor,
          true,
        );
        await this.intake.requireReadableOfferOpportunity(
          actor,
          input.opportunityId,
          true,
        );
        const found = await this.versions.find({
          actor,
          companyId,
          opportunityId: input.opportunityId,
          versionId: input.versionId,
          contractId: input.contractId,
        });
        if (!found || found.version.id !== input.versionId)
          throw new NotFoundException();
        const { contract, version } = found;
        const fingerprint = commandFingerprint({
          kind: 'RUN_QUALITY_CHECKS',
          ...(input.contractId === undefined
            ? {}
            : { contractId: input.contractId }),
          opportunityId: input.opportunityId,
          versionId: input.versionId,
          payload: input.payload,
        });
        await this.databaseContext.connection.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.workspaceId}:${companyId}:${actor.workspaceMembershipId}:${key}`},0))`,
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
              eq(contractCommands.idempotencyKey, key),
            ),
          );
        if (receipt) {
          if (
            receipt.kind !== 'RUN_QUALITY_CHECKS' ||
            receipt.fingerprint !== fingerprint ||
            receipt.resultContractId !== contract.id ||
            !receipt.resultQualityRunId
          )
            throw conflict(
              'IDEMPOTENCY_CONFLICT',
              'Idempotency-Key was used for another Contract command.',
            );
          const [recorded] = await this.databaseContext.connection
            .select()
            .from(contractQualityRuns)
            .where(
              and(
                eq(contractQualityRuns.workspaceId, actor.workspaceId),
                eq(contractQualityRuns.companyId, companyId),
                eq(contractQualityRuns.contractId, contract.id),
                eq(contractQualityRuns.contractVersionId, version.id),
                eq(contractQualityRuns.id, receipt.resultQualityRunId),
              ),
            );
          if (!recorded)
            throw new Error(
              'The recorded Contract Quality Check run is missing.',
            );
          return qualityRunView(recorded, version, contract);
        }
        if (
          typeof input.payload !== 'object' ||
          input.payload === null ||
          Array.isArray(input.payload) ||
          Object.keys(input.payload).length !== 0
        )
          throw new BadRequestException({
            code: 'INVALID_CONTRACT_INPUT',
            field: 'body',
          });
        if (version.supersededByVersionId)
          throw conflict(
            'CONTRACT_VERSION_SUPERSEDED',
            'The Contract Version has been superseded.',
          );
        const { evaluatedAt, results } = await this.evaluateFreshQuality({
          actor,
          companyId,
          contract,
          version,
        });
        const [run] = await this.databaseContext.connection
          .insert(contractQualityRuns)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            contractId: contract.id,
            contractVersionId: version.id,
            actorInternalUserId: actor.internalUserId,
            actorWorkspaceMembershipId: actor.workspaceMembershipId,
            evaluatedAt,
            results,
          })
          .returning();
        if (!run)
          throw new Error('The Contract Quality Check run was not recorded.');
        const response = qualityRunView(run, version, contract);
        await this.databaseContext.connection.insert(contractCommands).values({
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey: key,
          fingerprint,
          opportunityId: contract.opportunityId,
          resultContractId: contract.id,
          kind: 'RUN_QUALITY_CHECKS',
          resultQualityRunId: run.id,
          createdAt: evaluatedAt,
        });
        return response;
      })
      .catch((error: unknown) => {
        if (error instanceof HttpException) throw error;
        throw new InternalServerErrorException({
          code: 'CONTRACT_QUALITY_UNCERTAIN',
          correlationId: randomUUID(),
          message:
            'The Quality Check outcome is uncertain. Retry the identical command.',
        });
      });
  }

  private async evaluateFreshQuality({
    actor,
    companyId,
    contract,
    version,
  }: {
    actor: ActorContext;
    companyId: string;
    contract: ContractRow;
    version: VersionRow;
  }) {
    const source =
      contract.origin !== 'ACCEPTED_OFFER'
        ? null
        : await this.offers.inspectContractQualitySource({
            actor,
            opportunityId: contract.opportunityId,
            contractId: contract.id,
          });
    const parent =
      contract.kind === 'ADDENDUM'
        ? await this.versions.addendumSource(actor, contract)
        : null;
    const pricing =
      version.pricingSnapshotId === null
        ? null
        : await this.pricing.resolveContractVersionSnapshot({
            actor,
            companyId,
            opportunityId: contract.opportunityId,
            contractVersionId: version.id,
          });
    const recipient = recordedRecipient(version);
    // The Client owner fences current identity, relationship and union resolution
    // without requiring or granting dossier-read permission.
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
    await this.databaseContext.connection
      .select({ id: contracts.id })
      .from(contracts)
      .where(
        and(
          eq(contracts.workspaceId, actor.workspaceId),
          eq(contracts.companyId, companyId),
          eq(contracts.id, contract.id),
        ),
      )
      .for('update');
    const [head] = await this.databaseContext.connection
      .select({ id: contractVersions.id })
      .from(contractVersions)
      .where(
        and(
          eq(contractVersions.workspaceId, actor.workspaceId),
          eq(contractVersions.companyId, companyId),
          eq(contractVersions.contractId, contract.id),
        ),
      )
      .orderBy(desc(contractVersions.versionNumber))
      .limit(1);
    requireHeadContractVersion({
      versionId: version.id,
      headVersionId: head?.id,
    });
    const evaluatedAt = this.clock.now();
    const results = evaluateContractQuality({
      instant: evaluatedAt,
      companyId,
      partyKey: partyKey(contract.originalClientAccountId, recipient),
      identity: recipient,
      partyAvailable: current.recipientAvailable,
      partyIdentityCurrent: current.recipientIdentityCurrent,
      snapshotId: version.pricingSnapshotId,
      snapshot: pricing
        ? {
            ...pricing,
            belongsToOffer: pricing.opportunityId === contract.opportunityId,
          }
        : null,
      scopeNote: version.scopeNote,
      commercialConditions: version.commercialConditions,
      termStartsOn: version.termStartsOn,
      termEndsOn: version.termEndsOn,
      specialConditions: version.specialConditions,
      preliminaryWork: null,
      provenance: version.provenance,
      provisional: version.provenance === 'ILLUSTRATIVE',
      source: parent
        ? {
            kind: 'ADDENDUM',
            companyId: parent.contract.companyId,
            partyKey: partyKey(
              parent.contract.originalClientAccountId,
              recordedRecipient(parent.version),
            ),
            identity: recordedRecipient(parent.version),
            parentKind:
              parent.contract.kind === 'PRECONTRACT'
                ? 'PRECONTRACT'
                : 'CONTRACT',
            parentExecutionState: 'EXECUTED',
            currency: parent.currency,
          }
        : source
          ? {
              kind: 'ACCEPTED_OFFER',
              companyId: source.companyId,
              partyKey: partyKey(
                source.originalClientAccountId,
                source.recipient,
              ),
              identity: source.recipient,
              snapshotId: source.pricingSnapshotId,
              scopeNote: source.scopeNote,
              commercialConditions: source.commercialConditions,
            }
          : contract.origin === 'DIRECT'
            ? { kind: 'DIRECT', companyId: contract.companyId }
            : missingQualitySource(),
    });
    return { evaluatedAt, results };
  }

  async listQualityRuns(input: {
    actor: ActorContext;
    opportunityId: string;
    contractId?: string;
    versionId: string;
    limit: string | undefined;
    cursor: string | undefined;
  }) {
    return this.databaseContext.transaction(async () => {
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
      const found = await this.versions.find({
        actor: input.actor,
        companyId,
        opportunityId: input.opportunityId,
        ...(input.contractId === undefined
          ? {}
          : { contractId: input.contractId }),
        versionId: input.versionId,
      });
      if (!found || found.version.id !== input.versionId)
        throw new NotFoundException();
      const limit = input.limit === undefined ? 25 : Number(input.limit);
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50 ||
        (input.limit !== undefined && !/^\d+$/u.test(input.limit))
      )
        throw new BadRequestException({ field: 'limit' });
      const scope = and(
        eq(contractQualityRuns.workspaceId, input.actor.workspaceId),
        eq(contractQualityRuns.companyId, companyId),
        eq(contractQualityRuns.contractId, found.contract.id),
        eq(contractQualityRuns.contractVersionId, input.versionId),
      );
      let before: number | undefined;
      if (input.cursor !== undefined) {
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
            input.cursor,
          )
        )
          throw new BadRequestException({ field: 'cursor' });
        const [cursor] = await this.databaseContext.connection
          .select({ sequence: contractQualityRuns.sequence })
          .from(contractQualityRuns)
          .where(and(scope, eq(contractQualityRuns.id, input.cursor)));
        if (!cursor) throw new BadRequestException({ field: 'cursor' });
        before = cursor.sequence;
      }
      const rows = await this.databaseContext.connection
        .select()
        .from(contractQualityRuns)
        .where(
          and(
            scope,
            before === undefined
              ? undefined
              : lt(contractQualityRuns.sequence, before),
          ),
        )
        .orderBy(desc(contractQualityRuns.sequence))
        .limit(limit + 1);
      const items = rows
        .slice(0, limit)
        .map((row) => qualityRunView(row, found.version, found.contract));
      return {
        items,
        nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
      };
    });
  }

  async readQualityRun(input: {
    actor: ActorContext;
    opportunityId: string;
    contractId?: string;
    versionId: string;
    runId: string;
  }): Promise<ContractQualityRun> {
    return this.databaseContext.transaction(async () => {
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
      const found = await this.versions.find({
        actor: input.actor,
        companyId,
        opportunityId: input.opportunityId,
        ...(input.contractId === undefined
          ? {}
          : { contractId: input.contractId }),
        versionId: input.versionId,
      });
      if (
        !found ||
        found.version.id !== input.versionId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          input.runId,
        )
      )
        throw new NotFoundException();
      const [run] = await this.databaseContext.connection
        .select()
        .from(contractQualityRuns)
        .where(
          and(
            eq(contractQualityRuns.workspaceId, input.actor.workspaceId),
            eq(contractQualityRuns.companyId, companyId),
            eq(contractQualityRuns.contractId, found.contract.id),
            eq(contractQualityRuns.contractVersionId, input.versionId),
            eq(contractQualityRuns.id, input.runId),
          ),
        );
      if (!run) throw new NotFoundException();
      return qualityRunView(run, found.version, found.contract);
    });
  }

  async read(input: Parameters<ContractVersionReader['read']>[0]) {
    return this.versions.read(input);
  }
  async listVersions(
    input: Parameters<ContractVersionReader['listVersions']>[0],
  ) {
    return this.versions.listVersions(input);
  }
}
function conflict(code: string, message: string) {
  return new ConflictException({ code, message });
}

function partyKey(clientId: string, recipient: OfferRecipientCopy): string {
  return recipient.kind === 'PRIMARY'
    ? `PRIMARY:${clientId}`
    : `ADDITIONAL:${recipient.additionalLegalEntityId}`;
}

function missingQualitySource(): never {
  throw new Error('Missing Contract quality source.');
}
