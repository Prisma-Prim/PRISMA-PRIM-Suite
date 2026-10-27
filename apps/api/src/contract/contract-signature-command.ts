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
import type { DatabaseContext } from '../database/database-context.js';
import {
  contracts,
  contractVersions,
  contractCommands,
  contractSignatures,
  contractQualityRuns,
} from '../database/schema/index.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import {
  readContractDecision,
  type DecisionDependencies,
} from './contract-decision-command.js';
import { readContractWarningCodes } from './contract-decision.js';
import { qualityRunView } from './contract-quality-view.js';
import {
  readContractSignatureCommand,
  requireSigningDateRange,
  type ContractSignature,
} from './contract-signature.js';
export interface RecordContractSignatureInput {
  actor: ActorContext;
  opportunityId: string;
  contractId?: string;
  versionId: string;
  payload: unknown;
  idempotencyKey: string | undefined;
}
export async function recordContractSignature(
  input: RecordContractSignatureInput,
  dependencies: DecisionDependencies,
): Promise<ContractSignature> {
  const permissions = [
    'commercial.contract.read',
    'commercial.contract.signature.record',
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
        versionId: input.versionId,
      });
      if (!found || found.version.id !== input.versionId)
        throw new NotFoundException();
      if (found.version.provenance === 'COMPANY_MODEL_OFFER')
        throw conflict(
          'CONTRACT_EXECUTION_MODE_UNSUPPORTED',
          'This Contract mode does not support simulated signature.',
        );
      const fingerprint = commandFingerprint({
        kind: 'RECORD_SIGNATURE',
        opportunityId: input.opportunityId,
        ...(input.contractId === undefined
          ? {}
          : { contractId: input.contractId }),
        versionId: input.versionId,
        payload: input.payload,
      });
      await dependencies.databaseContext.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.workspaceId}:${companyId}:${actor.workspaceMembershipId}:${key}`},0))`,
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
            eq(contractCommands.idempotencyKey, key),
          ),
        );
      if (receipt) {
        if (
          receipt.kind !== 'RECORD_SIGNATURE' ||
          receipt.fingerprint !== fingerprint ||
          receipt.resultContractId !== found.contract.id ||
          !receipt.resultSignatureId
        )
          throw conflict(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency-Key was used for another Contract command.',
          );
        const recorded = await readContractSignature(
          dependencies.databaseContext,
          actor,
          found.contract,
          found.version,
        );
        if (!recorded || recorded.id !== receipt.resultSignatureId)
          throw new Error('Missing recorded Contract signature.');
        return recorded;
      }
      if (found.version.supersededByVersionId)
        throw conflict(
          'CONTRACT_VERSION_SUPERSEDED',
          'The Contract Version has been superseded.',
        );
      const command = readContractSignatureCommand(input.payload);
      // C3 fences the current Client context before locking the Contract and sampling one instant.
      const quality = await dependencies.evaluateFreshQuality({
        actor,
        companyId,
        ...found,
      });
      const current = await dependencies.find({
        actor,
        companyId,
        opportunityId: input.opportunityId,
        ...(input.contractId === undefined
          ? {}
          : { contractId: input.contractId }),
      });
      if (!current) throw new NotFoundException();
      if (current.version.id !== input.versionId)
        throw conflict(
          'CONTRACT_VERSION_SUPERSEDED',
          'The Contract Version has been superseded.',
        );
      if (current.contract.revision !== command.expectedContractRevision)
        throw conflict(
          'STALE_CONTRACT_REVISION',
          'The Contract revision changed.',
        );
      if (current.version.decisionState !== 'APPROVED')
        throw conflict(
          'CONTRACT_VERSION_NOT_APPROVED',
          'The Contract Version is not approved.',
        );
      if (current.version.executionState === 'EXECUTED')
        throw conflict(
          'CONTRACT_VERSION_ALREADY_EXECUTED',
          'The Contract Version is already executed.',
        );
      const approval = await readContractDecision(
        dependencies.databaseContext,
        actor,
        current.contract,
        current.version,
      );
      if (!approval || approval.kind !== 'APPROVE')
        throw new Error('Missing Contract approval.');
      requireSigningDateRange({
        command,
        approvedAt: approval.decidedAt,
        recordedAt: quality.evaluatedAt,
      });
      if (quality.results.some((result) => result.status === 'ERROR'))
        throw conflict(
          'QUALITY_CHECK_ERRORS',
          'Quality Check errors block signature recording.',
        );
      const warnings = quality.results
        .filter(
          (result) =>
            result.status === 'WARNING' &&
            !approval.acknowledgedWarningCodes.includes(result.code),
        )
        .map((result) => result.code)
        .sort();
      if (
        JSON.stringify([...command.acknowledgedWarningCodes].sort()) !==
        JSON.stringify(warnings)
      )
        throw conflict(
          'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
          'Acknowledge exactly the new current warnings.',
        );
      const checksum = await dependencies.representationChecksum(
        actor,
        current.contract,
        current.version,
      );
      if (checksum !== approval.representationChecksum)
        throw conflict(
          'REPRESENTATION_MISMATCH',
          'The representation differs from the approved one.',
        );
      const [run] = await dependencies.databaseContext.connection
        .insert(contractQualityRuns)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          contractId: current.contract.id,
          contractVersionId: current.version.id,
          actorInternalUserId: actor.internalUserId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          ruleSetVersion: quality.ruleSetVersion,
          evaluatedAt: quality.evaluatedAt,
          results: quality.results,
        })
        .returning();
      if (!run) throw new Error('Missing Contract signature check run.');
      const [signature] = await dependencies.databaseContext.connection
        .insert(contractSignatures)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          contractId: current.contract.id,
          contractVersionId: current.version.id,
          resultRevision: current.contract.revision + 1,
          actorInternalUserId: actor.internalUserId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          recordedAt: quality.evaluatedAt,
          providerSignatoryLabel: command.providerSignatoryLabel,
          clientSignatoryLabel: command.clientSignatoryLabel,
          providerSignedOn: command.providerSignedOn,
          clientSignedOn: command.clientSignedOn,
          note: command.note,
          qualityRunId: run.id,
          representationChecksum: checksum,
          acknowledgedWarningCodes: warnings,
        })
        .returning();
      if (!signature) throw new Error('Missing Contract signature.');
      await dependencies.databaseContext.connection
        .update(contractVersions)
        .set({ executionState: 'EXECUTED' })
        .where(
          and(
            eq(contractVersions.workspaceId, actor.workspaceId),
            eq(contractVersions.companyId, companyId),
            eq(contractVersions.id, current.version.id),
          ),
        );
      await dependencies.databaseContext.connection
        .update(contracts)
        .set({ revision: current.contract.revision + 1 })
        .where(
          and(
            eq(contracts.workspaceId, actor.workspaceId),
            eq(contracts.companyId, companyId),
            eq(contracts.id, current.contract.id),
          ),
        );
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
          kind: 'RECORD_SIGNATURE',
          resultSignatureId: signature.id,
          createdAt: quality.evaluatedAt,
        });
      await dependencies.accountability.recordContractSignature({
        actor,
        companyId,
        contractId: current.contract.id,
        contractVersionId: current.version.id,
        versionNumber: current.version.versionNumber,
        source: contractSource(current.contract, current.version),
        pricingSnapshotId: current.version.pricingSnapshotId,
        ruleSetVersion: quality.ruleSetVersion,
        acknowledgedWarningCodes: warnings,
        occurredAt: quality.evaluatedAt,
      });
      const recorded = await readContractSignature(
        dependencies.databaseContext,
        actor,
        current.contract,
        current.version,
      );
      if (!recorded) throw new Error('Missing committed Contract signature.');
      return recorded;
    },
  }).catch((error: unknown) => {
    if (error instanceof HttpException) throw error;
    throw new InternalServerErrorException({
      code: 'CONTRACT_SIGNATURE_UNCERTAIN',
      correlationId: randomUUID(),
      message:
        'The Contract signature outcome is uncertain. Retry the identical command.',
    });
  });
}
export async function readContractSignature(
  databaseContext: DatabaseContext,
  actor: ActorContext,
  contract: typeof contracts.$inferSelect,
  version: typeof contractVersions.$inferSelect,
): Promise<ContractSignature | null> {
  const [row] = await databaseContext.connection
    .select()
    .from(contractSignatures)
    .where(
      and(
        eq(contractSignatures.workspaceId, actor.workspaceId),
        eq(contractSignatures.companyId, contract.companyId),
        eq(contractSignatures.contractId, contract.id),
        eq(contractSignatures.contractVersionId, version.id),
      ),
    );
  if (!row) return null;
  if (
    row.resultRevision !== version.createdContractRevision + 2 ||
    row.evidenceKind !== 'SIMULATED' ||
    row.provenance !== 'ILLUSTRATIVE' ||
    !/^[0-9a-f]{64}$/u.test(row.representationChecksum)
  )
    throw new Error('Invalid stored Contract signature.');
  const [run] = await databaseContext.connection
    .select()
    .from(contractQualityRuns)
    .where(
      and(
        eq(contractQualityRuns.workspaceId, actor.workspaceId),
        eq(contractQualityRuns.companyId, contract.companyId),
        eq(contractQualityRuns.contractId, contract.id),
        eq(contractQualityRuns.contractVersionId, version.id),
        eq(contractQualityRuns.id, row.qualityRunId),
      ),
    );
  if (
    !run ||
    run.actorWorkspaceMembershipId !== row.actorWorkspaceMembershipId ||
    run.actorInternalUserId !== row.actorInternalUserId ||
    run.evaluatedAt.getTime() !== row.recordedAt.getTime()
  )
    throw new Error('Invalid Contract signature check run.');
  return {
    id: row.id,
    contractVersionId: version.id,
    revision: row.resultRevision,
    evidenceKind: 'SIMULATED',
    provenance: 'ILLUSTRATIVE',
    provisional: true,
    actorWorkspaceMembershipId: row.actorWorkspaceMembershipId,
    recordedAt: row.recordedAt.toISOString(),
    providerSignatoryLabel: row.providerSignatoryLabel,
    clientSignatoryLabel: row.clientSignatoryLabel,
    providerSignedOn: row.providerSignedOn,
    clientSignedOn: row.clientSignedOn,
    note: row.note,
    qualityRun: qualityRunView(run, version, contract),
    acknowledgedWarningCodes: readContractWarningCodes(
      row.acknowledgedWarningCodes,
    ),
    representationChecksum: row.representationChecksum,
  };
}
function conflict(code: string, message: string) {
  return new ConflictException({ code, message });
}
