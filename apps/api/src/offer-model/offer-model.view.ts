import { InternalServerErrorException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import {
  offerModels,
  offerModelVersions,
  offerModelDecisions,
  offerModelWithdrawals,
} from '../database/schema/index.js';
import {
  OFFER_MODEL_CODE,
  OFFER_MODEL_LANGUAGE,
  readOfferModelContent,
} from './offer-model.content.js';

export type ModelRow = typeof offerModels.$inferSelect;
export type ModelVersionRow = typeof offerModelVersions.$inferSelect;
type AttributedRow = Pick<
  ModelVersionRow,
  | 'actorMembershipId'
  | 'actorInternalUserId'
  | 'actorDisplayName'
  | 'recordedAt'
>;

/** The complete frozen commercial configuration view; no broader module reads. */
export class OfferModelView {
  constructor(private readonly database: DatabaseContext) {}

  async head(model: ModelRow) {
    const [row] = await this.database.connection
      .select()
      .from(offerModelVersions)
      .where(
        and(
          eq(offerModelVersions.workspaceId, model.workspaceId),
          eq(offerModelVersions.companyId, model.companyId),
          eq(offerModelVersions.modelId, model.id),
        ),
      )
      .orderBy(desc(offerModelVersions.versionNumber))
      .limit(1);
    if (!row) throw invalidStoredModel();
    return row;
  }

  async version(row: ModelVersionRow) {
    const [decision] = await this.database.connection
      .select()
      .from(offerModelDecisions)
      .where(
        and(
          eq(offerModelDecisions.workspaceId, row.workspaceId),
          eq(offerModelDecisions.companyId, row.companyId),
          eq(offerModelDecisions.modelId, row.modelId),
          eq(offerModelDecisions.versionId, row.id),
        ),
      );
    const [withdrawal] = await this.database.connection
      .select()
      .from(offerModelWithdrawals)
      .where(
        and(
          eq(offerModelWithdrawals.workspaceId, row.workspaceId),
          eq(offerModelWithdrawals.companyId, row.companyId),
          eq(offerModelWithdrawals.modelId, row.modelId),
          eq(offerModelWithdrawals.versionId, row.id),
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
        .from(offerModelVersions)
        .where(
          and(
            eq(offerModelVersions.workspaceId, row.workspaceId),
            eq(offerModelVersions.companyId, row.companyId),
            eq(offerModelVersions.modelId, row.id),
            eq(offerModelVersions.id, row.activeVersionId),
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
        code: OFFER_MODEL_CODE,
        language: OFFER_MODEL_LANGUAGE,
        revision: row.revision,
        head: await this.version(await this.head(row)),
        activeVersion,
      },
    };
  }
}

export type OfferModelResult = Awaited<ReturnType<OfferModelView['model']>>;
export type OfferModelVersionView = Awaited<
  ReturnType<OfferModelView['version']>
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

function storedContent(value: unknown) {
  try {
    return readOfferModelContent(value);
  } catch {
    throw invalidStoredModel();
  }
}

export function invalidStoredModel() {
  return new InternalServerErrorException('The stored Offer model is invalid.');
}
