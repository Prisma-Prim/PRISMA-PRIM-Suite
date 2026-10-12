import {
  ConflictException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import type { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import type { AccountabilityService } from '../accountability/accountability.service.js';
import type { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import type { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import type { OpportunityOutcomeStatus } from '../commercial-intake/opportunity-outcome.js';
import type { DatabaseContext } from '../database/database-context.js';
import type { OfferService } from '../offer/offer.service.js';
import type { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import type { ServerClock } from '../clock/server-clock.js';
import type { ContractVersionReader } from './contract-version-reader.js';
import {
  contracts,
  contractVersions,
  contractCommands,
  contractReferenceCounters,
} from '../database/schema/index.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import {
  readDirectCreationCommand,
  selectedAddendumSnapshotId,
} from './contract.validation.js';
import {
  CONTRACT_TEMPLATE_CODE,
  CONTRACT_TEMPLATE_VERSION,
  CONTRACT_CLAUSE_VERSIONS,
} from './contract-representation.js';
const CLOSED_OPPORTUNITY_STATUSES: ReadonlySet<OpportunityOutcomeStatus> =
  new Set(['LOST', 'DISQUALIFIED', 'ARCHIVED']);
interface DirectContractDependencies {
  databaseContext: DatabaseContext;
  authorization: CompanyContextAuthorization;
  accountability: AccountabilityService;
  clients: ClientOperationalReferenceService;
  intake: CommercialIntakeService;
  offers: OfferService;
  pricing: PricingSnapshotService;
  versions: ContractVersionReader;
  clock: ServerClock;
}
export async function createDirectContract(
  input: {
    actor: ActorContext;
    opportunityId: string;
    contractId?: string;
    payload: unknown;
    idempotencyKey: string | undefined;
  },
  dependencies: DirectContractDependencies,
) {
  await dependencies.authorization.requireContractAccess(input.actor, [
    'commercial.contract.prepare',
  ]);
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  return dependencies.databaseContext
    .transaction(async () => {
      const { actor } = input;
      const companyId = await dependencies.authorization.requireContractAccess(
        actor,
        ['commercial.contract.prepare'],
        true,
      );
      const opportunity =
        await dependencies.intake.requireReadableOfferOpportunity(
          actor,
          input.opportunityId,
          true,
        );
      const fingerprint = commandFingerprint({
        kind: 'CREATE_DIRECT',
        opportunityId: opportunity.id,
        payload: input.payload,
      });
      await dependencies.databaseContext.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.workspaceId}:${companyId}:${actor.workspaceMembershipId}:${idempotencyKey}`},0))`,
      );
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
            eq(contractCommands.idempotencyKey, idempotencyKey),
          ),
        );
      // Only a new creation is refused once the Opportunity is closed without
      // a win (Commercial Workflow PRD section 23.5), and before any other
      // creation prerequisite; an exact replay still returns a creation
      // committed before the closure.
      if (!receipt && CLOSED_OPPORTUNITY_STATUSES.has(opportunity.status))
        throw conflict('OPPORTUNITY_CLOSED', 'The Opportunity is closed.');
      if (!opportunity.originalClientAccountId)
        throw conflict('CONTRACT_CLIENT_REQUIRED', 'A Client is required.');
      await dependencies.clients.readProjectReferences(
        actor,
        [opportunity.originalClientAccountId],
        true,
      );
      const selectedSnapshotId = selectedAddendumSnapshotId(input.payload);
      if (selectedSnapshotId !== null)
        await dependencies.pricing.resolveOfferSnapshot({
          actor,
          companyId,
          opportunityId: opportunity.id,
          snapshotId: selectedSnapshotId,
        });
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
        const [initialVersion] = await dependencies.databaseContext.connection
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
        const existing = await dependencies.versions.find({
          actor,
          companyId,
          opportunityId: opportunity.id,
          versionId: initialVersion.id,
        });
        if (!existing || existing.contract.id !== receipt.resultContractId)
          throw new Error('Missing recorded Contract.');
        // Replay requires the recorded party to stay readable, as for Addenda.
        const party = existing.version;
        const selection =
          party.recipientKind === 'PRIMARY'
            ? { kind: 'PRIMARY' as const }
            : party.recipientKind === 'ADDITIONAL' &&
                party.recipientAdditionalLegalEntityId
              ? {
                  kind: 'ADDITIONAL' as const,
                  legalEntityId: party.recipientAdditionalLegalEntityId,
                }
              : null;
        if (!selection) throw new Error('Invalid recorded Contract party.');
        await dependencies.clients.lockOfferRecipient(
          actor,
          existing.contract.originalClientAccountId,
          selection,
        );
        return dependencies.versions.view(
          actor,
          existing.contract,
          existing.version,
        );
      }
      if (
        await dependencies.versions.find({
          actor,
          companyId,
          opportunityId: opportunity.id,
        })
      )
        throw conflict(
          'CONTRACT_ALREADY_EXISTS',
          'This Opportunity already has a Contract.',
        );
      const command = readDirectCreationCommand(input.payload);
      const recipient = await dependencies.clients.lockOfferRecipient(
        actor,
        opportunity.originalClientAccountId,
        command.recipient,
      );
      await dependencies.pricing.resolveOfferSnapshot({
        actor,
        companyId,
        opportunityId: opportunity.id,
        snapshotId: command.pricingSnapshotId,
      });
      if (
        await dependencies.offers.hasAcceptedContractSource({
          actor,
          companyId,
          opportunityId: opportunity.id,
        })
      )
        throw conflict('ACCEPTED_OFFER_EXISTS', 'An Accepted Offer exists.');
      const createdAt = dependencies.clock.now();
      const [counter] = await dependencies.databaseContext.connection
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
      const [contract] = await dependencies.databaseContext.connection
        .insert(contracts)
        .values({
          ...attribution,
          opportunityId: opportunity.id,
          clientRequestId: opportunity.clientRequestId,
          originalClientAccountId: opportunity.originalClientAccountId,
          origin: 'DIRECT',
          directReason: command.directReason,
          illustrativeReference: counter.currentReference,
        })
        .returning();
      if (!contract) throw new Error('Contract was not recorded.');
      const [version] = await dependencies.databaseContext.connection
        .insert(contractVersions)
        .values({
          ...attribution,
          contractId: contract.id,
          opportunityId: opportunity.id,
          pricingSnapshotId: command.pricingSnapshotId,
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
          scopeNote: command.scopeNote,
          commercialConditions: command.commercialConditions,
          termStartsOn: command.termStartsOn,
          termEndsOn: command.termEndsOn,
          specialConditions: command.specialConditions,
          templateCode: CONTRACT_TEMPLATE_CODE,
          templateVersion: CONTRACT_TEMPLATE_VERSION,
          clauseVersions: CONTRACT_CLAUSE_VERSIONS,
        })
        .returning();
      if (!version) throw new Error('Contract Version was not recorded.');
      await dependencies.clients.recordLockedReferenceUse(actor, recipient);
      await dependencies.databaseContext.connection
        .insert(contractCommands)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          fingerprint,
          opportunityId: opportunity.id,
          resultContractId: contract.id,
          createdAt,
        });
      await dependencies.accountability.recordContractCreated({
        actor,
        companyId,
        contractId: contract.id,
        contractVersionId: version.id,
        illustrativeReference: contract.illustrativeReference,
        source: { kind: 'DIRECT' },
        pricingSnapshotId: command.pricingSnapshotId,
        occurredAt: createdAt,
      });
      return dependencies.versions.view(actor, contract, version);
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

function conflict(code: string, message: string) {
  return new ConflictException({ code, message });
}
