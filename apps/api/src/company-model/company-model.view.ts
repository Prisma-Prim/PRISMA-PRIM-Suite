import { InternalServerErrorException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { DatabaseContext } from '../database/database-context.js';
import type {
  CompanyModelContent,
  CompanyModelIdentity,
  CompanyModelKind,
  ModelRow,
  ModelVersionRow,
} from './company-model.kind.js';

type AttributedRow = Pick<
  ModelVersionRow,
  | 'actorMembershipId'
  | 'actorInternalUserId'
  | 'actorDisplayName'
  | 'recordedAt'
>;

/** The complete frozen configuration view of one kind; no broader module reads. */
export class CompanyModelView<
  Content extends CompanyModelContent,
  Identity extends CompanyModelIdentity,
  Selection extends string,
> {
  constructor(
    private readonly kind: CompanyModelKind<Content, Identity, Selection>,
    private readonly database: DatabaseContext,
  ) {}

  async head(model: ModelRow) {
    const { versions } = this.kind.tables;
    const [row] = await this.database.connection
      .select()
      .from(versions)
      .where(
        and(
          eq(versions.workspaceId, model.workspaceId),
          eq(versions.companyId, model.companyId),
          eq(versions.modelId, model.id),
        ),
      )
      .orderBy(desc(versions.versionNumber))
      .limit(1);
    if (!row) throw invalidStoredModel(this.kind);
    return row;
  }

  async version(row: ModelVersionRow) {
    const { decisions, withdrawals } = this.kind.tables;
    const [decision] = await this.database.connection
      .select()
      .from(decisions)
      .where(
        and(
          eq(decisions.workspaceId, row.workspaceId),
          eq(decisions.companyId, row.companyId),
          eq(decisions.modelId, row.modelId),
          eq(decisions.versionId, row.id),
        ),
      );
    const [withdrawal] = await this.database.connection
      .select()
      .from(withdrawals)
      .where(
        and(
          eq(withdrawals.workspaceId, row.workspaceId),
          eq(withdrawals.companyId, row.companyId),
          eq(withdrawals.modelId, row.modelId),
          eq(withdrawals.versionId, row.id),
        ),
      );
    return {
      id: row.id,
      versionNumber: row.versionNumber,
      predecessorVersionId: row.predecessorVersionId,
      content: storedContent(this.kind, row.content),
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
    const { versions } = this.kind.tables;
    let activeVersion = null;
    if (row.activeVersionId) {
      const [active] = await this.database.connection
        .select()
        .from(versions)
        .where(
          and(
            eq(versions.workspaceId, row.workspaceId),
            eq(versions.companyId, row.companyId),
            eq(versions.modelId, row.id),
            eq(versions.id, row.activeVersionId),
          ),
        );
      if (!active) throw invalidStoredModel(this.kind);
      activeVersion = versionSummary(this.kind, active);
    }
    return {
      model: {
        id: row.id,
        workspaceId: row.workspaceId,
        companyId: row.companyId,
        ...this.kind.identity,
        revision: row.revision,
        head: await this.version(await this.head(row)),
        activeVersion,
      },
    };
  }
}

export type CompanyModelResult<
  Content extends CompanyModelContent,
  Identity extends CompanyModelIdentity,
  Selection extends string,
> = Awaited<
  ReturnType<CompanyModelView<Content, Identity, Selection>['model']>
>;
export type CompanyModelVersionView<Content extends CompanyModelContent> =
  Awaited<
    ReturnType<
      CompanyModelView<Content, CompanyModelIdentity, string>['version']
    >
  >;
export interface CompanyModelVersionSummary {
  id: string;
  versionNumber: number;
  sourceKind: CompanyModelContent['sourceKind'];
  serviceTitle: string;
}

export function versionSummary(
  kind: ContentReader<CompanyModelContent>,
  row: ModelVersionRow,
): CompanyModelVersionSummary {
  const content = storedContent(kind, row.content);
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

/** The part of a kind that reads its stored content. */
export interface ContentReader<Content> {
  readonly noun: string;
  readContent(value: unknown): Content;
}

export function storedContent<Content>(
  kind: ContentReader<Content>,
  value: unknown,
): Content {
  try {
    return kind.readContent(value);
  } catch {
    throw invalidStoredModel(kind);
  }
}

export function invalidStoredModel(kind: { readonly noun: string }) {
  return new InternalServerErrorException(
    `The stored ${kind.noun} model is invalid.`,
  );
}
