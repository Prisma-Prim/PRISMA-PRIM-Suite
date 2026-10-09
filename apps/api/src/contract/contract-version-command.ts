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
import { commandFingerprint } from '../pricing-configuration/pricing-configuration-publication.js';
import {
  readCreateContractVersionCommand,
  readAddendumCommand,
  selectedAddendumSnapshotId,
} from './contract.validation.js';
import {
  CONTRACT_TEMPLATE_CODE,
  CONTRACT_TEMPLATE_VERSION,
  CONTRACT_CLAUSE_VERSIONS,
  ADDENDUM_CLAUSE_VERSIONS,
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
  return dependencies.databaseContext
    .transaction(async () => {
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
      const recipient = await dependencies.clients.lockOfferRecipient(
        actor,
        found.contract.originalClientAccountId,
        selection,
      );
      const selectedSnapshotId =
        found.contract.kind === 'ADDENDUM'
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
        payload: input.payload,
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
      const command =
        found.contract.kind === 'ADDENDUM'
          ? readAddendumCommand(input.payload)
          : {
              ...readCreateContractVersionCommand(input.payload),
              changeSummary: null,
              pricingSnapshotId: found.version.pricingSnapshotId,
            };
      const source =
        found.contract.kind === 'ADDENDUM'
          ? null
          : await dependencies.offers.inspectContractQualitySource({
              actor,
              opportunityId: input.opportunityId,
              contractId: found.contract.id,
            });
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
          recipientKind: recipient.recipient.kind,
          recipientAdditionalLegalEntityId:
            recipient.recipient.kind === 'ADDITIONAL'
              ? recipient.recipient.additionalLegalEntityId
              : null,
          recipientLegalName: recipient.recipient.legalName,
          recipientTaxId: recipient.recipient.taxId,
          recipientLegalAddress: recipient.recipient.legalAddress,
          issuingCompanyLabel: current.version.issuingCompanyLabel,
          scopeNote: source?.scopeNote ?? null,
          commercialConditions: source?.commercialConditions ?? null,
          termStartsOn: command.termStartsOn,
          termEndsOn: command.termEndsOn,
          specialConditions: command.specialConditions,
          changeSummary: command.changeSummary,
          templateCode:
            current.contract.kind === 'ADDENDUM'
              ? 'ADDENDUM_ILLUSTRATIVE'
              : CONTRACT_TEMPLATE_CODE,
          templateVersion: CONTRACT_TEMPLATE_VERSION,
          clauseVersions:
            current.contract.kind === 'ADDENDUM'
              ? ADDENDUM_CLAUSE_VERSIONS
              : CONTRACT_CLAUSE_VERSIONS,
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
        offerVersionId: current.contract.sourceOfferVersionId,
        ...(current.contract.parentContractId &&
        current.contract.addendumOrdinal
          ? {
              addendum: {
                parentContractId: current.contract.parentContractId,
                addendumOrdinal: current.contract.addendumOrdinal,
              },
            }
          : {}),
        pricingSnapshotId: version.pricingSnapshotId,
        occurredAt: createdAt,
      });
      return createdVersionResult(current.contract, version);
    })
    .catch((error: unknown) => {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException({
        code: 'CONTRACT_VERSION_UNCERTAIN',
        correlationId: randomUUID(),
        message:
          'The Contract Version outcome is uncertain. Retry the identical command.',
      });
    });
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
