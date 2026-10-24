import { runClientReferenceTransaction } from '../client/client-reference-transaction.js';
import {
  ConflictException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import type { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import type { AccountabilityService } from '../accountability/accountability.service.js';
import type { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import type { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import type { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import type { DatabaseContext } from '../database/database-context.js';
import type { ServerClock } from '../clock/server-clock.js';
import {
  contracts,
  contractVersions,
  contractCommands,
  contractReferenceCounters,
} from '../database/schema/index.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import type { ContractVersionReader } from './contract-version-reader.js';
import {
  readAddendumCommand,
  selectedAddendumSnapshotId,
} from './contract.validation.js';
import { ADDENDUM_CLAUSE_VERSIONS } from './contract-representation.js';

export interface CreateAddendumInput {
  actor: ActorContext;
  opportunityId: string;
  parentContractId: string;
  payload: unknown;
  idempotencyKey: string | undefined;
}
export async function createContractAddendum(
  input: CreateAddendumInput,
  dependencies: {
    databaseContext: DatabaseContext;
    authorization: CompanyContextAuthorization;
    accountability: AccountabilityService;
    clients: ClientOperationalReferenceService;
    intake: CommercialIntakeService;
    pricing: PricingSnapshotService;
    versions: ContractVersionReader;
    clock: ServerClock;
  },
) {
  const {
    databaseContext: database,
    authorization,
    clients,
    intake,
    pricing,
    versions,
    accountability,
    clock,
  } = dependencies;
  const permissions = [
    'commercial.contract.read',
    'commercial.contract.prepare',
  ] as const;
  await authorization.requireContractAccess(input.actor, permissions);
  const key = requireIdempotencyKey(input.idempotencyKey);
  return runClientReferenceTransaction({
    database: database,
    work: async () => {
      const { actor } = input;
      const companyId = await authorization.requireContractAccess(
        actor,
        permissions,
        true,
      );
      await intake.requireReadableOfferOpportunity(
        actor,
        input.opportunityId,
        true,
      );
      const parent = await versions.find({
        actor,
        companyId,
        opportunityId: input.opportunityId,
        contractId: input.parentContractId,
      });
      if (!parent) throw new NotFoundException();
      await database.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.workspaceId}:${companyId}:${actor.workspaceMembershipId}:${key}`},0))`,
      );
      const party = parent.version;
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
      if (!selection) throw new Error('Invalid parent party.');
      const recipient = await clients.lockOfferRecipient(
        actor,
        parent.contract.originalClientAccountId,
        selection,
      );
      const selectedSnapshotId = selectedAddendumSnapshotId(input.payload);
      if (selectedSnapshotId !== null)
        await pricing.resolveOfferSnapshot({
          actor,
          companyId,
          opportunityId: input.opportunityId,
          snapshotId: selectedSnapshotId,
        });
      const fingerprint = commandFingerprint({
        kind: 'CREATE_ADDENDUM',
        opportunityId: input.opportunityId,
        parentContractId: input.parentContractId,
        payload: input.payload,
      });
      const [receipt] = await database.connection
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
          receipt.kind !== 'CREATE' ||
          receipt.fingerprint !== fingerprint ||
          receipt.opportunityId !== input.opportunityId
        )
          throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' });
        const result = await versions.find({
          actor,
          companyId,
          opportunityId: input.opportunityId,
          contractId: receipt.resultContractId,
        });
        const [initial] = await database.connection
          .select()
          .from(contractVersions)
          .where(
            and(
              eq(contractVersions.contractId, receipt.resultContractId),
              eq(contractVersions.versionNumber, 1),
            ),
          );
        if (
          !result ||
          !initial ||
          result.contract.parentContractId !== input.parentContractId
        )
          throw new Error('Missing Addendum receipt result.');
        return versions.view(actor, result.contract, initial);
      }
      const command = readAddendumCommand(input.payload);
      await database.connection
        .select({ id: contracts.id })
        .from(contracts)
        .where(
          and(
            eq(contracts.workspaceId, actor.workspaceId),
            eq(contracts.companyId, companyId),
            eq(contracts.id, input.parentContractId),
          ),
        )
        .for('update');
      const current = await versions.find({
        actor,
        companyId,
        opportunityId: input.opportunityId,
        contractId: input.parentContractId,
      });
      if (!current) throw new NotFoundException();
      if (current.contract.revision !== command.expectedContractRevision)
        throw new ConflictException({ code: 'STALE_CONTRACT_REVISION' });
      if (!['CONTRACT', 'PRECONTRACT'].includes(current.contract.kind))
        throw new ConflictException({ code: 'ADDENDUM_PARENT_INVALID' });
      if (current.version.executionState !== 'EXECUTED')
        throw new ConflictException({ code: 'CONTRACT_NOT_EXECUTED' });
      const [last] = await database.connection
        .select({ ordinal: contracts.addendumOrdinal })
        .from(contracts)
        .where(
          and(
            eq(contracts.workspaceId, actor.workspaceId),
            eq(contracts.companyId, companyId),
            eq(contracts.parentContractId, current.contract.id),
          ),
        )
        .orderBy(desc(contracts.addendumOrdinal))
        .limit(1);
      const ordinal = (last?.ordinal ?? 0) + 1;
      const [counter] = await database.connection
        .insert(contractReferenceCounters)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          kind: 'ADDENDUM',
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
      if (!counter) throw new Error('Missing Addendum reference.');
      const createdAt = clock.now();
      const attribution = {
        workspaceId: actor.workspaceId,
        companyId,
        createdByInternalUserId: actor.internalUserId,
        createdByWorkspaceMembershipId: actor.workspaceMembershipId,
        createdAt,
      };
      const [contract] = await database.connection
        .insert(contracts)
        .values({
          ...attribution,
          kind: 'ADDENDUM',
          origin: null,
          sourceOfferId: null,
          sourceOfferVersionId: null,
          opportunityId: current.contract.opportunityId,
          clientRequestId: current.contract.clientRequestId,
          originalClientAccountId: current.contract.originalClientAccountId,
          parentContractId: current.contract.id,
          addendumOrdinal: ordinal,
          illustrativeReference: counter.currentReference,
        })
        .returning();
      if (!contract) throw new Error('Missing Addendum.');
      const [version] = await database.connection
        .insert(contractVersions)
        .values({
          ...attribution,
          contractId: contract.id,
          opportunityId: contract.opportunityId,
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
          pricingSnapshotId: command.pricingSnapshotId,
          changeSummary: command.changeSummary,
          termEndsOn: command.termEndsOn,
          templateCode: 'ADDENDUM_ILLUSTRATIVE',
          templateVersion: 1,
          clauseVersions: ADDENDUM_CLAUSE_VERSIONS,
        })
        .returning();
      if (!version) throw new Error('Missing Addendum Version.');
      await clients.recordLockedReferenceUse(actor, recipient);
      await database.connection.insert(contractCommands).values({
        workspaceId: actor.workspaceId,
        companyId,
        actorWorkspaceMembershipId: actor.workspaceMembershipId,
        idempotencyKey: key,
        fingerprint,
        opportunityId: contract.opportunityId,
        resultContractId: contract.id,
        createdAt,
      });
      await accountability.recordContractCreated({
        actor,
        companyId,
        contractId: contract.id,
        contractVersionId: version.id,
        illustrativeReference: contract.illustrativeReference,
        source: {
          kind: 'ADDENDUM',
          parentContractId: current.contract.id,
          addendumOrdinal: ordinal,
        },
        pricingSnapshotId: version.pricingSnapshotId,
        occurredAt: createdAt,
      });
      return versions.view(actor, contract, version);
    },
  }).catch((error: unknown) => {
    if (error instanceof HttpException) throw error;
    throw new InternalServerErrorException({
      code: 'CONTRACT_CREATION_UNCERTAIN',
      correlationId: randomUUID(),
      message:
        'The Addendum outcome is uncertain. Retry the identical command.',
    });
  });
}
