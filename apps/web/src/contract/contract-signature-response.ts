import type { ContractDecisionView } from './contract-decision-response';
import {
  readContractQualityRun,
  type ContractQualityRunView,
} from './contract-quality-response';
export interface ContractSignatureView {
  id: string;
  contractVersionId: string;
  revision: number;
  evidenceKind: 'SIMULATED';
  provenance: 'ILLUSTRATIVE';
  provisional: true;
  actorWorkspaceMembershipId: string;
  recordedAt: string;
  providerSignatoryLabel: string;
  clientSignatoryLabel: string;
  providerSignedOn: string;
  clientSignedOn: string;
  note: string | null;
  qualityRun: ContractQualityRunView;
  acknowledgedWarningCodes: readonly string[];
  representationChecksum: string;
}
export function readContractSignature(
  value: unknown,
  input: {
    versionId: string;
    termEndsOn: string | null;
    approval: ContractDecisionView | null;
    addendum?: { pricingSnapshotId: string | null };
  },
): ContractSignatureView {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid Contract signature.');
  const row: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  const approval = input.approval;
  if (
    !approval ||
    approval.kind !== 'APPROVE' ||
    row.contractVersionId !== input.versionId ||
    row.revision !== approval.revision + 1 ||
    row.evidenceKind !== 'SIMULATED' ||
    row.provenance !== 'ILLUSTRATIVE' ||
    row.provisional !== true ||
    row.representationChecksum !== approval.representationChecksum
  )
    throw new Error('Invalid Contract signature evidence.');
  const recordedAt = text(row.recordedAt),
    actorWorkspaceMembershipId = text(row.actorWorkspaceMembershipId);
  if (
    !Number.isFinite(Date.parse(recordedAt)) ||
    Date.parse(recordedAt) < Date.parse(approval.decidedAt)
  )
    throw new Error('Invalid Contract signature instant.');
  const providerSignedOn = date(row.providerSignedOn),
    clientSignedOn = date(row.clientSignedOn);
  for (const signedOn of [providerSignedOn, clientSignedOn])
    if (
      signedOn < approval.decidedAt.slice(0, 10) ||
      signedOn > recordedAt.slice(0, 10)
    )
      throw new Error('Invalid Contract signature date range.');
  const qualityRun = readContractQualityRun(
    row.qualityRun,
    input.versionId,
    input.termEndsOn,
    input.addendum,
  );
  if (
    qualityRun.actorWorkspaceMembershipId !== actorWorkspaceMembershipId ||
    qualityRun.evaluatedAt !== recordedAt ||
    qualityRun.results.some((result) => result.status === 'ERROR')
  )
    throw new Error('Invalid Contract signature checks.');
  if (!Array.isArray(row.acknowledgedWarningCodes))
    throw new Error('Invalid Contract signature warnings.');
  const warnings = row.acknowledgedWarningCodes.map(text);
  const expected = qualityRun.results
    .filter(
      (result) =>
        result.status === 'WARNING' &&
        !approval.acknowledgedWarningCodes.includes(result.code),
    )
    .map((result) => result.code)
    .sort();
  if (JSON.stringify(warnings) !== JSON.stringify(expected))
    throw new Error('Invalid Contract signature warnings.');
  const note = row.note === null ? null : text(row.note);
  if (note !== null && (Array.from(note).length > 500 || note.includes('\0')))
    throw new Error('Invalid Contract signature note.');
  return {
    id: text(row.id),
    contractVersionId: input.versionId,
    revision: approval.revision + 1,
    evidenceKind: 'SIMULATED',
    provenance: 'ILLUSTRATIVE',
    provisional: true,
    actorWorkspaceMembershipId,
    recordedAt,
    providerSignatoryLabel: label(row.providerSignatoryLabel),
    clientSignatoryLabel: label(row.clientSignatoryLabel),
    providerSignedOn,
    clientSignedOn,
    note,
    qualityRun,
    acknowledgedWarningCodes: warnings,
    representationChecksum: approval.representationChecksum,
  };
}
function text(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Invalid Contract signature text.');
  return value;
}
function label(value: unknown): string {
  const result = text(value);
  if (
    !result.trim() ||
    Array.from(result).length > 200 ||
    result.includes('\0')
  )
    throw new Error('Invalid Contract signatory label.');
  return result;
}
function date(value: unknown): string {
  const result = text(value);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(result) ||
    !Number.isFinite(Date.parse(result + 'T00:00:00Z')) ||
    new Date(result + 'T00:00:00Z').toISOString().slice(0, 10) !== result
  )
    throw new Error('Invalid Contract signing date.');
  return result;
}
