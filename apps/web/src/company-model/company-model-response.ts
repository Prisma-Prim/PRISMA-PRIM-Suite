import type {
  CompanyModelContentBase,
  ModelSourceKind,
} from './company-model-kind';

/** The part of a kind that the response readers need. */
export type ModelResponseKind<Content extends CompanyModelContentBase> =
  Readonly<{
    identity: Readonly<Record<string, string>>;
    readContent: (value: unknown) => Content;
  }>;

export function readCompanyModelResponse<
  Content extends CompanyModelContentBase,
>(kind: ModelResponseKind<Content>, value: unknown) {
  const payload = record(value);
  if (payload.model === null) return { model: null };
  const row = record(payload.model);
  for (const [field, expected] of Object.entries(kind.identity))
    if (row[field] !== expected) throw invalid();
  const head = readModelVersion(kind, row.head);
  const activeVersion =
    row.activeVersion === null ? null : readSummary(row.activeVersion);
  const revision = modelInteger(row.revision, 1);
  if (
    revision < head.versionNumber ||
    (activeVersion && activeVersion.versionNumber > head.versionNumber)
  )
    throw invalid();
  if (
    activeVersion?.id === head.id &&
    (activeVersion.versionNumber !== head.versionNumber ||
      activeVersion.sourceKind !== head.content.sourceKind ||
      activeVersion.serviceTitle !== head.content.serviceTitle ||
      head.decision?.outcome !== 'APPROVE' ||
      head.withdrawal)
  )
    throw invalid();
  if (
    head.decision?.outcome === 'APPROVE' &&
    !head.withdrawal &&
    activeVersion?.id !== head.id
  )
    throw invalid();
  if (head.withdrawal && activeVersion) throw invalid();
  return {
    model: {
      id: uuid(row.id),
      workspaceId: uuid(row.workspaceId),
      companyId: uuid(row.companyId),
      revision,
      head,
      activeVersion,
    },
  };
}
export type CompanyModel<Content extends CompanyModelContentBase> = NonNullable<
  ReturnType<typeof readCompanyModelResponse<Content>>['model']
>;

export function readModelVersion<Content extends CompanyModelContentBase>(
  kind: ModelResponseKind<Content>,
  value: unknown,
) {
  const row = record(value);
  const versionNumber = modelInteger(row.versionNumber, 1);
  const predecessorVersionId =
    row.predecessorVersionId === null ? null : uuid(row.predecessorVersionId);
  if ((versionNumber === 1) !== (predecessorVersionId === null))
    throw invalid();
  const decision = row.decision === null ? null : readDecision(row.decision);
  const withdrawal =
    row.withdrawal === null ? null : readWithdrawal(row.withdrawal);
  if (withdrawal && decision?.outcome !== 'APPROVE') throw invalid();
  return {
    id: uuid(row.id),
    versionNumber,
    predecessorVersionId,
    content: kind.readContent(row.content),
    ...attributed(row),
    decision,
    withdrawal,
  };
}
export type CompanyModelVersion<Content extends CompanyModelContentBase> =
  ReturnType<typeof readModelVersion<Content>>;

export function readExactModelVersion<Content extends CompanyModelContentBase>(
  kind: ModelResponseKind<Content>,
  value: unknown,
) {
  const payload = record(value);
  const selection = record(payload.currentSelection);
  return {
    version: readModelVersion(kind, payload.version),
    currentSelection: {
      activeVersionId:
        selection.activeVersionId === null
          ? null
          : uuid(selection.activeVersionId),
    },
  };
}

export function readModelHistory(value: unknown) {
  const payload = record(value);
  if (!Array.isArray(payload.versions) || payload.versions.length > 50)
    throw invalid();
  const versions = payload.versions.map((value: unknown) => {
    const row = record(value);
    const summary = readSummary(row);
    const decision = row.decision === null ? null : record(row.decision);
    return {
      ...summary,
      predecessorVersionId:
        row.predecessorVersionId === null
          ? null
          : uuid(row.predecessorVersionId),
      ...attributed(row),
      decision: decision
        ? {
            outcome: outcome(decision.outcome),
            recordedAt: instant(decision.recordedAt),
          }
        : null,
    };
  });
  if (
    new Set(versions.map((row) => row.id)).size !== versions.length ||
    versions.some(
      (row, index) =>
        index > 0 &&
        (versions[index - 1]?.versionNumber ?? 0) <= row.versionNumber,
    )
  )
    throw invalid();
  const nextCursor = payload.nextCursor;
  if (
    nextCursor !== null &&
    (typeof nextCursor !== 'string' ||
      !/^[A-Za-z0-9_-]{1,1024}$/.test(nextCursor) ||
      versions.length === 0)
  )
    throw invalid();
  return { versions, nextCursor };
}
export type CompanyModelHistory = ReturnType<typeof readModelHistory>;

function readSummary(value: unknown) {
  const row = record(value);
  return {
    id: uuid(row.id),
    versionNumber: modelInteger(row.versionNumber, 1),
    sourceKind: sourceKind(row.sourceKind),
    serviceTitle: modelText(row.serviceTitle, 300),
  };
}
function readDecision(value: unknown) {
  const row = record(value);
  return {
    id: uuid(row.id),
    outcome: outcome(row.outcome),
    basis: modelText(row.basis, 2_000),
    ...attributed(row),
  };
}
function readWithdrawal(value: unknown) {
  const row = record(value);
  return {
    id: uuid(row.id),
    reason: modelText(row.reason, 2_000),
    ...attributed(row),
  };
}
function attributed(row: Record<string, unknown>) {
  const actor = record(row.actor);
  if (typeof actor.displayName !== 'string') throw invalid();
  return {
    actor: {
      workspaceMembershipId: uuid(actor.workspaceMembershipId),
      internalUserId: uuid(actor.internalUserId),
      displayName: actor.displayName,
    },
    recordedAt: instant(row.recordedAt),
  };
}
function outcome(value: unknown): 'APPROVE' | 'REJECT' {
  if (value === 'APPROVE' || value === 'REJECT') return value;
  throw invalid();
}
function sourceKind(value: unknown): ModelSourceKind {
  if (value === 'ILLUSTRATIVE' || value === 'COMPANY_SUPPLIED') return value;
  throw invalid();
}
/** A non-blank literal without NUL or lone surrogates, at most `limit` long. */
export function modelText(value: unknown, limit: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.includes('\u0000') ||
    /[\uD800-\uDFFF]/u.test(value) ||
    value.length > limit
  )
    throw invalid();
  return value;
}
function modelInteger(value: unknown, minimum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > 2_147_483_647
  )
    throw invalid();
  return value;
}
function instant(value: unknown) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw invalid();
  return value;
}
function uuid(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw invalid();
  return value.toLowerCase();
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid();
  return Object.fromEntries(Object.entries(value));
}
function invalid() {
  return new Error('Invalid consulting Company model response.');
}
