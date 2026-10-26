import { InternalServerErrorException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import {
  contractModels,
  contractModelVersions,
  contractModelDecisions,
  contractModelWithdrawals,
} from '../database/schema/index.js';
import {
  CONTRACT_MODEL_CODE,
  CONTRACT_MODEL_LANGUAGE,
  readContractModelContent,
} from './contract-model.content.js';

export type ModelRow = typeof contractModels.$inferSelect;
export type ModelVersionRow = typeof contractModelVersions.$inferSelect;
type AttributedRow = Pick<
  ModelVersionRow,
  | 'actorMembershipId'
  | 'actorInternalUserId'
  | 'actorDisplayName'
  | 'recordedAt'
>;

/** The complete frozen commercial configuration view; no broader module reads. */
export class ContractModelView {
  constructor(private readonly database: DatabaseContext) {}

  async head(model: ModelRow) {
    const [row] = await this.database.connection
      .select()
      .from(contractModelVersions)
      .where(
        and(
          eq(contractModelVersions.workspaceId, model.workspaceId),
          eq(contractModelVersions.companyId, model.companyId),
          eq(contractModelVersions.modelId, model.id),
        ),
      )
      .orderBy(desc(contractModelVersions.versionNumber))
      .limit(1);
    if (!row) throw invalidStoredModel();
    return row;
  }

  async version(row: ModelVersionRow) {
    const [decision] = await this.database.connection
      .select()
      .from(contractModelDecisions)
      .where(
        and(
          eq(contractModelDecisions.workspaceId, row.workspaceId),
          eq(contractModelDecisions.companyId, row.companyId),
          eq(contractModelDecisions.modelId, row.modelId),
          eq(contractModelDecisions.versionId, row.id),
        ),
      );
    const [withdrawal] = await this.database.connection
      .select()
      .from(contractModelWithdrawals)
      .where(
        and(
          eq(contractModelWithdrawals.workspaceId, row.workspaceId),
          eq(contractModelWithdrawals.companyId, row.companyId),
          eq(contractModelWithdrawals.modelId, row.modelId),
          eq(contractModelWithdrawals.versionId, row.id),
        ),
      );
    return {
      id: row.id,
      versionNumber: row.versionNumber,
      predecessorVersionId: row.predecessorVersionId,
      content: storedContent(row.content),
      ...attribution(row),
      decision: decision
        ? {
            id: decision.id,
            outcome: decision.outcome,
            basis: decision.basis,
            ...attribution(decision),
          }
        : null,
      withdrawal: withdrawal
        ? {
            id: withdrawal.id,
            reason: withdrawal.reason,
            ...attribution(withdrawal),
          }
        : null,
    };
  }

  async model(row: ModelRow) {
    let activeVersion = null;
    if (row.activeVersionId) {
      const [active] = await this.database.connection
        .select()
        .from(contractModelVersions)
        .where(
          and(
            eq(contractModelVersions.workspaceId, row.workspaceId),
            eq(contractModelVersions.companyId, row.companyId),
            eq(contractModelVersions.modelId, row.id),
            eq(contractModelVersions.id, row.activeVersionId),
          ),
        );
      if (!active) throw invalidStoredModel();
      activeVersion = versionSummary(active);
    }
    return {
      model: {
        id: row.id,
        workspaceId: row.workspaceId,
        companyId: row.companyId,
        code: CONTRACT_MODEL_CODE,
        kind: 'CONTRACT' as const,
        language: CONTRACT_MODEL_LANGUAGE,
        revision: row.revision,
        head: await this.version(await this.head(row)),
        activeVersion,
      },
    };
  }
}

export type ContractModelResult = Awaited<
  ReturnType<ContractModelView['model']>
>;
export type ContractModelVersionView = Awaited<
  ReturnType<ContractModelView['version']>
>;

export function versionSummary(row: ModelVersionRow) {
  const content = storedContent(row.content);
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    sourceKind: content.sourceKind,
    serviceTitle: content.serviceTitle,
  };
}

export function attribution(row: AttributedRow) {
  return {
    actor: {
      workspaceMembershipId: row.actorMembershipId,
      internalUserId: row.actorInternalUserId,
      displayName: row.actorDisplayName,
    },
    recordedAt: row.recordedAt.toISOString(),
  };
}

export function storedContent(value: unknown) {
  try {
    return readContractModelContent(value);
  } catch {
    throw invalidStoredModel();
  }
}

export function invalidStoredModel() {
  return new InternalServerErrorException(
    'The stored Contract model is invalid.',
  );
}
