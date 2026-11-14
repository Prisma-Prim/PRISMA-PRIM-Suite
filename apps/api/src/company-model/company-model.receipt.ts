import { requireUuid } from '../access/access-command-validation.js';
import type {
  CompanyModelContent,
  CompanyModelIdentity,
  CompanyModelKind,
} from './company-model.kind.js';
import {
  invalidStoredModel,
  type CompanyModelResult,
  type CompanyModelVersionSummary,
  type CompanyModelVersionView,
} from './company-model.view.js';

/** Strict/lossless receipt format, deliberately separate from any HTTP decoder. */
export function readCompanyModelReceipt<
  Content extends CompanyModelContent,
  Identity extends CompanyModelIdentity,
  Selection extends string,
>(
  kind: CompanyModelKind<Content, Identity, Selection>,
  value: unknown,
): CompanyModelResult<Content, Identity, Selection> {
  const { exactRecord, modelInteger } = kind.fields;
  try {
    const result = exactRecord(value, ['model']);
    const model = exactRecord(result.model, [
      'id',
      'workspaceId',
      'companyId',
      ...Object.keys(kind.identity),
      'revision',
      'head',
      'activeVersion',
    ]);
    if (
      Object.entries(kind.identity).some(
        ([field, expected]) => model[field] !== expected,
      )
    )
      throw invalidStoredModel(kind);
    const reader = new ReceiptReader(kind);
    return {
      model: {
        id: uuid(kind, model.id),
        workspaceId: uuid(kind, model.workspaceId),
        companyId: uuid(kind, model.companyId),
        ...kind.identity,
        revision: modelInteger(model.revision, 1),
        head: reader.version(model.head),
        activeVersion:
          model.activeVersion === null
            ? null
            : reader.active(model.activeVersion),
      },
    };
  } catch {
    throw invalidStoredModel(kind);
  }
}

class ReceiptReader<
  Content extends CompanyModelContent,
  Identity extends CompanyModelIdentity,
  Selection extends string,
> {
  constructor(
    private readonly kind: CompanyModelKind<Content, Identity, Selection>,
  ) {}

  version(value: unknown): CompanyModelVersionView<Content> {
    const { exactRecord, modelInteger } = this.kind.fields;
    const row = exactRecord(value, [
      'id',
      'versionNumber',
      'predecessorVersionId',
      'content',
      'actor',
      'recordedAt',
      'decision',
      'withdrawal',
    ]);
    const content = this.kind.readContent(row.content);
    // Content readers admit an omitted contact; a receipt always spells it.
    exactRecord(exactRecord(row.content, Object.keys(content)).issuer, [
      'legalName',
      'taxId',
      'legalAddress',
      'contactDetails',
    ]);
    return {
      id: uuid(this.kind, row.id),
      versionNumber: modelInteger(row.versionNumber, 1),
      predecessorVersionId:
        row.predecessorVersionId === null
          ? null
          : uuid(this.kind, row.predecessorVersionId),
      content,
      ...this.attributed(row),
      decision: row.decision === null ? null : this.decision(row.decision),
      withdrawal:
        row.withdrawal === null ? null : this.withdrawal(row.withdrawal),
    };
  }

  active(value: unknown): CompanyModelVersionSummary {
    const { exactRecord, modelInteger, sourceKind, text } = this.kind.fields;
    const row = exactRecord(value, [
      'id',
      'versionNumber',
      'sourceKind',
      'serviceTitle',
    ]);
    return {
      id: uuid(this.kind, row.id),
      versionNumber: modelInteger(row.versionNumber, 1),
      sourceKind: sourceKind(row.sourceKind),
      serviceTitle: text(row.serviceTitle, 300),
    };
  }

  private decision(
    value: unknown,
  ): NonNullable<CompanyModelVersionView<Content>['decision']> {
    const { exactRecord, text } = this.kind.fields;
    const row = exactRecord(value, [
      'id',
      'outcome',
      'basis',
      'actor',
      'recordedAt',
    ]);
    const outcome = row.outcome;
    if (outcome !== 'APPROVE' && outcome !== 'REJECT')
      throw invalidStoredModel(this.kind);
    return {
      id: uuid(this.kind, row.id),
      outcome,
      basis: text(row.basis, 2_000),
      ...this.attributed(row),
    };
  }

  private withdrawal(value: unknown) {
    const { exactRecord, text } = this.kind.fields;
    const row = exactRecord(value, ['id', 'reason', 'actor', 'recordedAt']);
    return {
      id: uuid(this.kind, row.id),
      reason: text(row.reason, 2_000),
      ...this.attributed(row),
    };
  }

  private attributed(row: Record<string, unknown>) {
    const actor = this.kind.fields.exactRecord(row.actor, [
      'workspaceMembershipId',
      'internalUserId',
      'displayName',
    ]);
    const recordedAt = row.recordedAt;
    if (
      typeof recordedAt !== 'string' ||
      !Number.isFinite(Date.parse(recordedAt)) ||
      new Date(recordedAt).toISOString() !== recordedAt
    )
      throw invalidStoredModel(this.kind);
    if (typeof actor.displayName !== 'string')
      throw invalidStoredModel(this.kind);
    return {
      actor: {
        workspaceMembershipId: uuid(this.kind, actor.workspaceMembershipId),
        internalUserId: uuid(this.kind, actor.internalUserId),
        displayName: actor.displayName,
      },
      recordedAt,
    };
  }
}

function uuid(kind: { readonly noun: string }, value: unknown) {
  const id = requireUuid(value);
  if (id !== value) throw invalidStoredModel(kind);
  return id;
}
