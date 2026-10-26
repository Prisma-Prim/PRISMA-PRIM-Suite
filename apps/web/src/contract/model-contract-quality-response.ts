import { modelInteger, text } from '../contract-model/contract-model-content';

export const modelContractRules = {
  SOURCE_COMPANY_MATCHES: 'ERROR',
  PARTY_AVAILABLE: 'ERROR',
  PARTY_MATCHES_SOURCE: 'ERROR',
  PARTY_TAX_ID_RECORDED: 'ERROR',
  PARTY_IDENTITY_MATCHES_SOURCE: 'WARNING',
  PARTY_IDENTITY_CURRENT: 'WARNING',
  ISSUER_MATCHES_SOURCE: 'ERROR',
  SERVICE_MATCHES_SOURCE: 'ERROR',
  FINANCIALS_MATCH_SOURCE: 'ERROR',
  CONDITIONS_MATCH_SOURCE: 'ERROR',
  SOURCE_OFFER_READY: 'ERROR',
  MODEL_APPROVAL_PRESERVED: 'ERROR',
  MODEL_WORDING_REVIEWED: 'WARNING',
  ANNEX_SCOPE_REVIEWED: 'WARNING',
  ADDED_CONDITIONS_CONFIRMED: 'WARNING',
  TERM_END_NOT_PASSED: 'WARNING',
  PROVISIONAL_MARKER_PRESENT: 'ERROR',
} satisfies Record<string, 'ERROR' | 'WARNING'>;
export type ModelContractCheckCode = keyof typeof modelContractRules;

export function readModelContractQuality(value: unknown, versionId: string) {
  const row = record(value);
  if (
    row.contractVersionId !== versionId ||
    row.ruleSet !== 'CONTRACT_QUALITY_COMPANY_MODEL' ||
    row.ruleSetVersion !== 1 ||
    !Array.isArray(row.results) ||
    row.results.length !== Object.keys(modelContractRules).length
  )
    invalid();
  const entries: unknown[] = row.results;
  return {
    id: text(row.id, 100),
    contractVersionId: versionId,
    ruleSet: 'CONTRACT_QUALITY_COMPANY_MODEL' as const,
    ruleSetVersion: 1 as const,
    actorWorkspaceMembershipId: text(row.actorWorkspaceMembershipId, 100),
    evaluatedAt: instant(row.evaluatedAt),
    results: Object.entries(modelContractRules).map(
      ([code, severity], index) => {
        const result = record(entries[index]);
        if (
          !isCode(code) ||
          result.code !== code ||
          (result.status !== 'PASS' && result.status !== severity) ||
          ((code === 'MODEL_WORDING_REVIEWED' ||
            code === 'ANNEX_SCOPE_REVIEWED') &&
            result.status !== 'WARNING')
        )
          invalid();
        return {
          code,
          status: result.status === 'PASS' ? ('PASS' as const) : severity,
        };
      },
    ),
  };
}
export type ModelContractQuality = ReturnType<typeof readModelContractQuality>;

export function readModelContractDecision(
  value: unknown,
  binding: { versionId: string; createdRevision: number; checksum: string },
) {
  const row = record(value);
  if (
    row.contractVersionId !== binding.versionId ||
    modelInteger(row.revision, 2) !== binding.createdRevision + 1
  )
    invalid();
  const base = {
    id: text(row.id, 100),
    contractVersionId: binding.versionId,
    revision: modelInteger(row.revision, 2),
    actorWorkspaceMembershipId: text(row.actorWorkspaceMembershipId, 100),
    decidedAt: instant(row.decidedAt),
  };
  if (row.kind === 'REJECT')
    return { ...base, kind: 'REJECT' as const, reason: text(row.reason, 500) };
  if (
    row.kind !== 'APPROVE' ||
    row.representationChecksum !== binding.checksum ||
    !Array.isArray(row.acknowledgedWarningCodes)
  )
    invalid();
  const qualityRun = readModelContractQuality(
    row.qualityRun,
    binding.versionId,
  );
  const warnings = qualityRun.results
    .filter((r) => r.status === 'WARNING')
    .map((r) => r.code)
    .sort();
  if (
    qualityRun.evaluatedAt !== base.decidedAt ||
    qualityRun.actorWorkspaceMembershipId !== base.actorWorkspaceMembershipId ||
    qualityRun.results.some((r) => r.status === 'ERROR') ||
    JSON.stringify(row.acknowledgedWarningCodes) !== JSON.stringify(warnings)
  )
    invalid();
  return {
    ...base,
    kind: 'APPROVE' as const,
    reviewBasis: text(row.reviewBasis, 2000),
    representationChecksum: binding.checksum,
    qualityRun,
    acknowledgedWarningCodes: warnings,
  };
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid();
  return Object.fromEntries(Object.entries(value));
}
function instant(value: unknown) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid();
  return value;
}
function isCode(value: string): value is ModelContractCheckCode {
  return Object.hasOwn(modelContractRules, value);
}
function invalid(): never {
  throw new Error('Invalid model Contract check or decision response.');
}
