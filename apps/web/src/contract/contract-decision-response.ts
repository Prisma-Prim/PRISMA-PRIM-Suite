import {
  readContractQualityRun,
  type ContractQualityRunBinding,
  type ContractQualityRunView,
} from './contract-quality-response';
export type ContractDecisionView = {
  id: string;
  contractVersionId: string;
  revision: number;
  actorWorkspaceMembershipId: string;
  decidedAt: string;
} & (
  | {
      kind: 'APPROVE';
      qualityRun: ContractQualityRunView;
      acknowledgedWarningCodes: readonly string[];
      representationChecksum: string;
    }
  | { kind: 'REJECT'; reason: string }
);
/** An approval run names exactly the rule set bound to the version. */
export function readContractDecision(
  value: unknown,
  binding: ContractQualityRunBinding,
): ContractDecisionView {
  const { versionId } = binding;
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid Contract decision.');
  const input = Object.fromEntries(Object.entries(value));
  if (
    input.contractVersionId !== versionId ||
    typeof input.revision !== 'number' ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 2 ||
    typeof input.decidedAt !== 'string' ||
    !Number.isFinite(Date.parse(input.decidedAt))
  )
    throw new Error('Invalid Contract decision target.');
  const base = {
    id: text(input.id),
    contractVersionId: versionId,
    revision: input.revision,
    actorWorkspaceMembershipId: text(input.actorWorkspaceMembershipId),
    decidedAt: input.decidedAt,
  };
  if (input.kind === 'REJECT') {
    const reason = text(input.reason);
    if (
      !reason.trim() ||
      Array.from(reason).length > 500 ||
      Object.keys(input).some(
        (key) =>
          ![
            'id',
            'contractVersionId',
            'revision',
            'actorWorkspaceMembershipId',
            'decidedAt',
            'kind',
            'reason',
          ].includes(key),
      )
    )
      throw new Error('Invalid Contract rejection.');
    return { ...base, kind: 'REJECT', reason };
  }
  if (input.kind === 'APPROVE') {
    const qualityRun = readContractQualityRun(input.qualityRun, binding);
    const representationChecksum = text(input.representationChecksum);
    if (
      !/^[0-9a-f]{64}$/u.test(representationChecksum) ||
      qualityRun.actorWorkspaceMembershipId !==
        base.actorWorkspaceMembershipId ||
      qualityRun.evaluatedAt !== base.decidedAt ||
      qualityRun.results.some((item) => item.status === 'ERROR') ||
      !Array.isArray(input.acknowledgedWarningCodes)
    )
      throw new Error('Invalid Contract approval evidence.');
    const codes: string[] = [];
    for (const value of input.acknowledgedWarningCodes) codes.push(text(value));
    const warnings = qualityRun.results
      .filter((item) => item.status === 'WARNING')
      .map((item) => item.code)
      .sort();
    if (
      JSON.stringify(codes) !== JSON.stringify(warnings) ||
      Object.keys(input).some(
        (key) =>
          ![
            'id',
            'contractVersionId',
            'revision',
            'actorWorkspaceMembershipId',
            'decidedAt',
            'kind',
            'qualityRun',
            'acknowledgedWarningCodes',
            'representationChecksum',
          ].includes(key),
      )
    )
      throw new Error('Invalid Contract approval warnings.');
    return {
      ...base,
      kind: 'APPROVE',
      qualityRun,
      representationChecksum,
      acknowledgedWarningCodes: codes,
    };
  }
  throw new Error('Invalid Contract decision kind.');
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Invalid Contract decision text.');
  return value;
}
