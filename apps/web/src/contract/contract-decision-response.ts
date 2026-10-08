import {
  readContractQualityRun,
  type ContractQualityRunView,
} from './contract-quality-response';
export type ContractDecisionView = {
  id: string;
  contractVersionId: string;
  revision: 2;
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
export function readContractDecision(
  value: unknown,
  versionId: string,
  termEndsOn: string | null,
): ContractDecisionView {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid Contract decision.');
  const input = Object.fromEntries(Object.entries(value));
  if (
    input.contractVersionId !== versionId ||
    input.revision !== 2 ||
    typeof input.decidedAt !== 'string' ||
    !Number.isFinite(Date.parse(input.decidedAt))
  )
    throw new Error('Invalid Contract decision target.');
  const base = {
    id: text(input.id),
    contractVersionId: versionId,
    revision: 2 as const,
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
    const qualityRun = readContractQualityRun(
      input.qualityRun,
      versionId,
      termEndsOn,
    );
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
