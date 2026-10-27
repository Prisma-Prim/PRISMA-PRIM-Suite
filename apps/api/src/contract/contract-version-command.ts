import { runClientReferenceTransaction } from '../client/client-reference-transaction.js';
import { contractSource } from './contract-source.js';
import {
  ConflictException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import type { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import type { AccountabilityService } from '../accountability/accountability.service.js';
import type { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import type { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import type { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import type { OfferService } from '../offer/offer.service.js';
import type { DatabaseContext } from '../database/database-context.js';
import type { ServerClock } from '../clock/server-clock.js';
import {
  contracts,
  contractVersions,
  contractCommands,
} from '../database/schema/index.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import {
  readCreateContractVersionCommand,
  readPrepareContractVersionCommand,
  readAddendumCommand,
  readDirectVersionCommand,
  readPrecontractVersionCommand,
  selectedAddendumSnapshotId,
} from './contract.validation.js';
import {
  ADDENDUM_CLAUSE_VERSIONS,
  agreementGenerationFields,
} from './contract-representation.js';

type ContractRow = typeof contracts.$inferSelect;
type VersionRow = typeof contractVersions.$inferSelect;
export interface CreateContractVersionInput {
  actor: ActorContext;
  opportunityId: string;
  contractId?: string;
  payload: unknown;
  idempotencyKey: string | undefined;
}
interface VersionDependencies {
  databaseContext: DatabaseContext;
  authorization: CompanyContextAuthorization;
  accountability: AccountabilityService;
  clients: ClientOperationalReferenceService;
  intake: CommercialIntakeService;
  offers: OfferService;
  pricing: PricingSnapshotService;
  clock: ServerClock;
  find: (input: {
    actor: ActorContext;
    companyId: string;
    opportunityId: string;
    contractId?: string;
    versionId?: string;
  }) => Promise<{ contract: ContractRow; version: VersionRow } | undefined>;
}
export async function createContractVersion(
  input: CreateContractVersionInput,
  dependencies: VersionDependencies,
) {
  const permissions = [
    'commercial.contract.read',
    'commercial.contract.prepare',
  ] as const;
  await dependencies.authorization.requireContractAccess(
    input.actor,
    permissions,
  );
  const key = requireIdempotencyKey(input.idempotencyKey);
  return runClientReferenceTransaction({
    database: dependencies.databaseContext,
    work: async () => {
      const { actor } = input;
      const companyId = await dependencies.authorization.requireContractAccess(
        actor,
        permissions,
        true,
      );
      await dependencies.intake.requireReadableOfferOpportunity(
        actor,
        input.opportunityId,
        true,
      );
      const found = await dependencies.find({
        actor,
        companyId,
        opportunityId: input.opportunityId,
        ...(input.contractId === undefined
          ? {}
          : { contractId: input.contractId }),
      });
      if (!found) throw new NotFoundException();
      if (found.version.provenance === 'COMPANY_MODEL_OFFER')
        throw conflict('CONTRACT_MODEL_SOURCE_REQUIRED');
      const early = found.contract.origin === 'OFFER_PREPARATION';
      if (early) {
        await dependencies.authorization.requireContractAccess(
          actor,
          ['commercial.contract.prepare_pending_offer'],
          true,
        );
        await dependencies.authorization.requireOfferAccess(
          actor,
          ['commercial.offer.read'],
          true,
        );
        await dependencies.clients.lockRecipientReadAuthority(actor);
      }
      const earlyCommand = early
        ? readPrepareContractVersionCommand(input.payload)
        : null;
      // Preserve command ordering: Opportunity, scoped key, Client fence, receipt, Contract.
      await dependencies.databaseContext.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.workspaceId}:${companyId}:${actor.workspaceMembershipId}:${key}`},0))`,
      );
      const selection =
        found.version.recipientKind === 'PRIMARY'
          ? { kind: 'PRIMARY' as const }
          : found.version.recipientKind === 'ADDITIONAL' &&
              found.version.recipientAdditionalLegalEntityId
            ? {
                kind: 'ADDITIONAL' as const,
                legalEntityId: found.version.recipientAdditionalLegalEntityId,
              }
            : null;
      if (!selection) throw new Error('Invalid recorded Contract party.');
      const lockRecipient = () =>
        dependencies.clients.lockOfferRecipient(
          actor,
          found.contract.originalClientAccountId,
          selection,
        );
      const legacyRecipient = early ? null : await lockRecipient();
      const selectedSnapshotId =
        found.contract.origin === 'DIRECT' || found.contract.kind === 'ADDENDUM'
          ? selectedAddendumSnapshotId(input.payload)
          : null;
      if (selectedSnapshotId !== null)
        await dependencies.pricing.resolveOfferSnapshot({
          actor,
          companyId,
          opportunityId: input.opportunityId,
          snapshotId: selectedSnapshotId,
        });
      const fingerprint = commandFingerprint({
        kind: 'CREATE_VERSION',
        opportunityId: input.opportunityId,
        ...(input.contractId === undefined
          ? {}
          : { contractId: input.contractId }),
        payload: earlyCommand ?? input.payload,
      });
      const [receipt] = await dependencies.databaseContext.connection
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
          receipt.kind !== 'CREATE_VERSION' ||
          receipt.fingerprint !== fingerprint ||
          receipt.resultContractId !== found.contract.id ||
          !receipt.resultVersionId
        )
          throw conflict('IDEMPOTENCY_CONFLICT');
        const stored = await dependencies.find({
          actor,
          companyId,
          opportunityId: input.opportunityId,
          ...(input.contractId === undefined
            ? {}
            : { contractId: input.contractId }),
          versionId: receipt.resultVersionId,
        });
        if (!stored) throw new Error('Missing recorded Contract Version.');
        return createdVersionResult(stored.contract, stored.version);
      }
      if (early)
        await dependencies.clients.lockActiveReferenceClient(
          actor,
          found.contract.originalClientAccountId,
        );
      const recipient = legacyRecipient ?? (await lockRecipient());
      const command = readVersionCommand(found, input.payload, earlyCommand);
      const earlySource = earlyCommand
        ? await dependencies.offers.resolvePreparationContractSource({
            actor,
            opportunityId: input.opportunityId,
            offerVersionId: earlyCommand.sourceOfferVersionId,
            lock: true,
            allowAccepted: true,
          })
        : null;
      const source =
        earlySource ??
        (found.contract.origin !== 'ACCEPTED_OFFER'
          ? null
          : await dependencies.offers.inspectContractQualitySource({
              actor,
              opportunityId: input.opportunityId,
              contractId: found.contract.id,
            }));
      if (
        earlySource &&
        (found.contract.sourceOfferId !== earlySource.offerId ||
          found.contract.originalClientAccountId !==
            earlySource.originalClientAccountId ||
          found.version.recipientKind !== earlySource.recipient.kind ||
          (earlySource.recipient.kind === 'ADDITIONAL' &&
            found.version.recipientAdditionalLegalEntityId !==
              earlySource.recipient.additionalLegalEntityId))
      )
        throw conflict('CONTRACT_SOURCE_PARTY_MISMATCH');
      const copiedRecipient = earlySource?.recipient ?? recipient.recipient;
      await dependencies.databaseContext.connection
        .select({ id: contracts.id })
        .from(contracts)
        .where(
          and(
            eq(contracts.workspaceId, actor.workspaceId),
            eq(contracts.companyId, companyId),
            eq(contracts.id, found.contract.id),
          ),
        )
        .for('update');
      const current = await dependencies.find({
        actor,
        companyId,
        opportunityId: input.opportunityId,
        ...(input.contractId === undefined
          ? {}
          : { contractId: input.contractId }),
      });
      if (!current) throw new NotFoundException();
      if (current.contract.revision !== command.expectedContractRevision)
        throw conflict('STALE_CONTRACT_REVISION');
      const [executed] = await dependencies.databaseContext.connection
        .select({ id: contractVersions.id })
        .from(contractVersions)
        .where(
          and(
            eq(contractVersions.workspaceId, actor.workspaceId),
            eq(contractVersions.companyId, companyId),
            eq(contractVersions.contractId, current.contract.id),
            eq(contractVersions.executionState, 'EXECUTED'),
          ),
        )
        .limit(1);
      if (executed) throw conflict('CONTRACT_EXECUTED');
      const createdAt = dependencies.clock.now();
      const revision = current.contract.revision + 1;
      const [version] = await dependencies.databaseContext.connection
        .insert(contractVersions)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          contractId: current.contract.id,
          opportunityId: input.opportunityId,
          versionNumber: current.version.versionNumber + 1,
          createdContractRevision: revision,
          predecessorVersionId: current.version.id,
          pricingSnapshotId: source
            ? source.pricingSnapshotId
            : command.pricingSnapshotId,
          recipientClientAccountId: recipient.currentClientAccountId,
          recipientKind: copiedRecipient.kind,
          recipientAdditionalLegalEntityId:
            copiedRecipient.kind === 'ADDITIONAL'
              ? copiedRecipient.additionalLegalEntityId
              : null,
          recipientLegalName: copiedRecipient.legalName,
          recipientTaxId: copiedRecipient.taxId,
          recipientLegalAddress: copiedRecipient.legalAddress,
          issuingCompanyLabel: current.version.issuingCompanyLabel,
          scopeNote: source ? source.scopeNote : command.scopeNote,
          commercialConditions: source
            ? source.commercialConditions
            : command.commercialConditions,
          termStartsOn: command.termStartsOn,
          termEndsOn: command.termEndsOn,
          specialConditions: command.specialConditions,
          changeSummary: command.changeSummary,
          ...(command.generation.kind === 'ADDENDUM'
            ? {
                templateCode: 'ADDENDUM_ILLUSTRATIVE',
                templateVersion: 1,
                clauseVersions: ADDENDUM_CLAUSE_VERSIONS,
              }
            : agreementGenerationFields(command.generation)),
          ...(earlyCommand
            ? {
                sourceOfferVersionId: earlyCommand.sourceOfferVersionId,
                templateCode: 'CONTRACT_PREPARATION_ILLUSTRATIVE',
              }
            : {}),
          createdByInternalUserId: actor.internalUserId,
          createdByWorkspaceMembershipId: actor.workspaceMembershipId,
          createdAt,
        })
        .returning();
      if (!version) throw new Error('Missing new Contract Version.');
      await dependencies.databaseContext.connection
        .update(contractVersions)
        .set({ supersededByVersionId: version.id, supersededAt: createdAt })
        .where(eq(contractVersions.id, current.version.id));
      await dependencies.databaseContext.connection
        .update(contracts)
        .set({ revision })
        .where(eq(contracts.id, current.contract.id));
      await dependencies.clients.recordLockedReferenceUse(actor, recipient);
      await dependencies.databaseContext.connection
        .insert(contractCommands)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey: key,
          fingerprint,
          opportunityId: input.opportunityId,
          resultContractId: current.contract.id,
          kind: 'CREATE_VERSION',
          resultVersionId: version.id,
          createdAt,
        });
      await dependencies.accountability.recordContractVersionCreated({
        actor,
        companyId,
        contractId: current.contract.id,
        contractVersionId: version.id,
        versionNumber: version.versionNumber,
        predecessorVersionNumber: current.version.versionNumber,
        source: contractSource(current.contract, version),
        pricingSnapshotId: version.pricingSnapshotId,
        occurredAt: createdAt,
      });
      return createdVersionResult(current.contract, version);
    },
  }).catch((error: unknown) => {
    if (error instanceof HttpException) throw error;
    throw new InternalServerErrorException({
      code: 'CONTRACT_VERSION_UNCERTAIN',
      correlationId: randomUUID(),
      message:
        'The Contract Version outcome is uncertain. Retry the identical command.',
    });
  });
}
/** Kind-specific entered fields; inherited source content stays server-owned. */
function readVersionCommand(
  found: { contract: ContractRow; version: VersionRow },
  payload: unknown,
  earlyCommand: ReturnType<typeof readPrepareContractVersionCommand> | null,
) {
  const inherited = {
    changeSummary: null,
    scopeNote: null,
    commercialConditions: null,
    pricingSnapshotId: found.version.pricingSnapshotId,
  };
  if (found.contract.kind === 'ADDENDUM')
    return {
      ...readAddendumCommand(payload),
      scopeNote: null,
      commercialConditions: null,
      generation: { kind: 'ADDENDUM' } as const,
    };
  if (found.contract.kind === 'PRECONTRACT') {
    const entered = readPrecontractVersionCommand(payload);
    return {
      ...entered,
      ...inherited,
      generation: {
        kind: 'PRECONTRACT',
        preliminaryWork: entered.preliminaryWork,
      } as const,
    };
  }
  if (found.contract.origin === 'OFFER_PREPARATION' && earlyCommand)
    return {
      ...earlyCommand,
      ...inherited,
      generation: { kind: 'CONTRACT' } as const,
    };
  if (found.contract.origin === 'DIRECT')
    return {
      ...readDirectVersionCommand(payload),
      generation: { kind: 'CONTRACT' } as const,
    };
  return {
    ...readCreateContractVersionCommand(payload),
    ...inherited,
    generation: { kind: 'CONTRACT' } as const,
  };
}
function createdVersionResult(contract: ContractRow, version: VersionRow) {
  return {
    contractId: contract.id,
    contractVersionId: version.id,
    versionNumber: version.versionNumber,
    revision: version.createdContractRevision,
    createdAt: version.createdAt.toISOString(),
    provisional: true,
  };
}
function conflict(code: string) {
  return new ConflictException({ code });
}
