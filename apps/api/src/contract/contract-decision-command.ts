import { qualityRunView } from './contract-quality-view.js';
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
import type { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import type { DatabaseContext } from '../database/database-context.js';
import type { ServerClock } from '../clock/server-clock.js';
import {
  contracts,
  contractVersions,
  contractQualityRuns,
  contractCommands,
  contractDecisions,
} from '../database/schema/index.js';
import { commandFingerprint } from '../pricing-configuration/pricing-configuration-publication.js';
import {
  readContractDecisionCommand,
  readContractWarningCodes,
  type ContractDecision,
} from './contract-decision.js';
import { type ContractQualityResult } from './contract-quality.js';
type ContractRow = typeof contracts.$inferSelect;
type VersionRow = typeof contractVersions.$inferSelect;
export interface DecideContractVersionInput {
  actor: ActorContext;
  opportunityId: string;
  versionId: string;
  kind: 'APPROVE' | 'REJECT';
  payload: unknown;
  idempotencyKey: string | undefined;
}
export interface DecisionDependencies {
  databaseContext: DatabaseContext;
  authorization: CompanyContextAuthorization;
  accountability: AccountabilityService;
  intake: CommercialIntakeService;
  clock: ServerClock;
  find: (input: {
    actor: ActorContext;
    companyId: string;
    opportunityId: string;
    versionId?: string;
  }) => Promise<{ contract: ContractRow; version: VersionRow } | undefined>;
  evaluateFreshQuality: (input: {
    actor: ActorContext;
    companyId: string;
    contract: ContractRow;
    version: VersionRow;
  }) => Promise<{ evaluatedAt: Date; results: ContractQualityResult[] }>;
  representationChecksum: (
    actor: ActorContext,
    contract: ContractRow,
    version: VersionRow,
  ) => Promise<string>;
}
export async function decideContractVersion(
  input: DecideContractVersionInput,
  dependencies: DecisionDependencies,
): Promise<ContractDecision> {
  await dependencies.authorization.requireContractAccess(input.actor, [
    'commercial.contract.read',
    'commercial.contract.approve',
  ]);
  const key = requireIdempotencyKey(input.idempotencyKey);
  return dependencies.databaseContext
    .transaction(async () => {
      const { actor } = input;
      const companyId = await dependencies.authorization.requireContractAccess(
        actor,
        ['commercial.contract.read', 'commercial.contract.approve'],
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
        versionId: input.versionId,
      });
      if (!found || found.version.id !== input.versionId)
        throw new NotFoundException();
      const fingerprint = commandFingerprint({
        kind: input.kind,
        opportunityId: input.opportunityId,
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
          receipt.kind !== input.kind ||
          receipt.fingerprint !== fingerprint ||
          receipt.resultContractId !== found.contract.id ||
          !receipt.resultDecisionId
        )
          throw conflict(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency-Key was used for another Contract command.',
          );
        const recorded = await readContractDecision(
          dependencies.databaseContext,
          actor,
          found.contract,
          found.version,
        );
        if (!recorded || recorded.id !== receipt.resultDecisionId)
          throw new Error('Missing recorded Contract decision.');
        return recorded;
      }
      if (found.version.supersededByVersionId)
        throw conflict(
          'CONTRACT_VERSION_SUPERSEDED',
          'The Contract Version has been superseded.',
        );
      const command = readContractDecisionCommand(input.kind, input.payload);
      // Approval shares C3's Client-owner fence and fresh evaluation. Rejection
      // needs no quality context, so it only locks the Contract's decision state.
      const quality =
        command.kind === 'APPROVE'
          ? await dependencies.evaluateFreshQuality({
              actor,
              companyId,
              ...found,
            })
          : null;
      if (!quality)
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
      if (current.version.decisionState !== 'PENDING')
        throw conflict(
          'CONTRACT_VERSION_ALREADY_DECIDED',
          'The Contract Version already has a decision.',
        );
      const decidedAt = quality?.evaluatedAt ?? dependencies.clock.now();
      let qualityRunId: string | null = null;
      let checksum: string | null = null;
      let warnings: readonly string[] | null = null;
      if (command.kind === 'APPROVE' && quality) {
        if (quality.results.some((result) => result.status === 'ERROR'))
          throw conflict(
            'QUALITY_CHECK_ERRORS',
            'Quality Check errors block approval.',
          );
        const currentWarnings = quality.results
          .filter((result) => result.status === 'WARNING')
          .map((result) => result.code)
          .sort();
        if (
          JSON.stringify([...command.acknowledgedWarningCodes].sort()) !==
          JSON.stringify(currentWarnings)
        )
          throw conflict(
            'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
            'Acknowledge exactly the current warnings.',
          );
        warnings = currentWarnings;
        checksum = await dependencies.representationChecksum(
          actor,
          current.contract,
          current.version,
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
            evaluatedAt: decidedAt,
            results: quality.results,
          })
          .returning();
        if (!run) throw new Error('Missing Contract approval check run.');
        qualityRunId = run.id;
      }
      const [decision] = await dependencies.databaseContext.connection
        .insert(contractDecisions)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          contractId: current.contract.id,
          contractVersionId: current.version.id,
          kind: command.kind,
          resultRevision: current.contract.revision + 1,
          actorInternalUserId: actor.internalUserId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          decidedAt,
          reason: command.kind === 'REJECT' ? command.reason : null,
          qualityRunId,
          representationChecksum: checksum,
          acknowledgedWarningCodes: warnings,
        })
        .returning();
      if (!decision) throw new Error('Missing Contract decision.');
      await dependencies.databaseContext.connection
        .update(contractVersions)
        .set({
          decisionState: command.kind === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        })
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
          kind: command.kind,
          resultDecisionId: decision.id,
          createdAt: decidedAt,
        });
      await dependencies.accountability.recordContractDecision({
        actor,
        companyId,
        contractId: current.contract.id,
        contractVersionId: current.version.id,
        versionNumber: current.version.versionNumber,
        kind: command.kind,
        offerVersionId: current.contract.sourceOfferVersionId,
        pricingSnapshotId: current.version.pricingSnapshotId,
        acknowledgedWarningCodes: warnings ?? [],
        occurredAt: decidedAt,
      });
      const recorded = await readContractDecision(
        dependencies.databaseContext,
        actor,
        current.contract,
        current.version,
      );
      if (!recorded) throw new Error('Missing committed Contract decision.');
      return recorded;
    })
    .catch((error: unknown) => {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException({
        code: 'CONTRACT_DECISION_UNCERTAIN',
        correlationId: randomUUID(),
        message:
          'The Contract decision outcome is uncertain. Retry the identical command.',
      });
    });
}

export async function readContractDecision(
  databaseContext: DatabaseContext,
  actor: ActorContext,
  contract: ContractRow,
  version: VersionRow,
): Promise<ContractDecision | null> {
  const [row] = await databaseContext.connection
    .select()
    .from(contractDecisions)
    .where(
      and(
        eq(contractDecisions.workspaceId, actor.workspaceId),
        eq(contractDecisions.companyId, contract.companyId),
        eq(contractDecisions.contractId, contract.id),
        eq(contractDecisions.contractVersionId, version.id),
      ),
    );
  if (!row) return null;
  if (row.resultRevision !== version.createdContractRevision + 1)
    throw new Error('Invalid stored Contract decision revision.');
  const base = {
    id: row.id,
    contractVersionId: version.id,
    revision: row.resultRevision,
    actorWorkspaceMembershipId: row.actorWorkspaceMembershipId,
    decidedAt: row.decidedAt.toISOString(),
  };
  if (
    row.kind === 'REJECT' &&
    typeof row.reason === 'string' &&
    row.reason.trim() &&
    Array.from(row.reason).length <= 500 &&
    row.qualityRunId === null &&
    row.representationChecksum === null &&
    row.acknowledgedWarningCodes === null
  )
    return { ...base, kind: 'REJECT', reason: row.reason };
  if (
    row.kind === 'APPROVE' &&
    row.reason === null &&
    row.qualityRunId &&
    row.representationChecksum &&
    /^[0-9a-f]{64}$/u.test(row.representationChecksum)
  ) {
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
      run.evaluatedAt.getTime() !== row.decidedAt.getTime()
    )
      throw new Error('Invalid Contract approval check run.');
    const qualityRun = qualityRunView(run, version);
    const acknowledgedWarningCodes = readContractWarningCodes(
      row.acknowledgedWarningCodes,
    );
    if (
      qualityRun.results.some((result) => result.status === 'ERROR') ||
      JSON.stringify(acknowledgedWarningCodes) !==
        JSON.stringify(
          qualityRun.results
            .filter((result) => result.status === 'WARNING')
            .map((result) => result.code)
            .sort(),
        )
    )
      throw new Error('Invalid stored Contract approval warnings.');
    return {
      ...base,
      kind: 'APPROVE',
      qualityRun,
      acknowledgedWarningCodes,
      representationChecksum: row.representationChecksum,
    };
  }
  throw new Error('Invalid stored Contract decision.');
}
function conflict(code: string, message: string) {
  return new ConflictException({ code, message });
}
