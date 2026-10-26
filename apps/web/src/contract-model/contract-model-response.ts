import {
  modelInteger,
  readContractModelContent,
  sourceKind,
  text,
} from './contract-model-content';

export function readContractModelResponse(value: unknown) {
  const payload = record(value);
  if (payload.model === null) return { model: null };
  const row = record(payload.model);
  if (
    row.code !== 'INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO' ||
    row.kind !== 'CONTRACT' ||
    row.language !== 'ro'
  )
    throw invalid();
  const head = readModelVersion(row.head);
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
      code: 'INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO',
      kind: 'CONTRACT',
      language: 'ro',
      revision,
      head,
      activeVersion,
    },
  };
}
export type ContractModelRead = ReturnType<typeof readContractModelResponse>;
export type ContractModel = NonNullable<ContractModelRead['model']>;

export function readModelVersion(value: unknown) {
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
    content: readContractModelContent(row.content),
    ...attributed(row),
    decision,
    withdrawal,
  };
}
export type ContractModelVersion = ReturnType<typeof readModelVersion>;

export function readExactModelVersion(value: unknown) {
  const payload = record(value);
  const selection = record(payload.currentSelection);
  return {
    version: readModelVersion(payload.version),
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
export type ContractModelHistory = ReturnType<typeof readModelHistory>;

function readSummary(value: unknown) {
  const row = record(value);
  return {
    id: uuid(row.id),
    versionNumber: modelInteger(row.versionNumber, 1),
    sourceKind: sourceKind(row.sourceKind),
    serviceTitle: text(row.serviceTitle, 300),
  };
}
function readDecision(value: unknown) {
  const row = record(value);
  return {
    id: uuid(row.id),
    outcome: outcome(row.outcome),
    basis: text(row.basis, 2_000),
    ...attributed(row),
  };
}
function readWithdrawal(value: unknown) {
  const row = record(value);
  return {
    id: uuid(row.id),
    reason: text(row.reason, 2_000),
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
  return new Error('Invalid consulting Contract model response.');
}
