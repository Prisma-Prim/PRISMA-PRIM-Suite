import { BadRequestException } from '@nestjs/common';
import {
  CONTRACT_QUALITY_RULES,
  type ContractQualityCode,
  type ContractQualityRun,
} from './contract-quality.js';

export type ContractDecisionCommand =
  | {
      readonly kind: 'APPROVE';
      readonly expectedContractRevision: number;
      readonly acknowledgedWarningCodes: readonly ContractQualityCode[];
    }
  | {
      readonly kind: 'REJECT';
      readonly expectedContractRevision: number;
      readonly reason: string;
    };
export type ContractDecision = {
  readonly id: string;
  readonly contractVersionId: string;
  readonly revision: number;
  readonly actorWorkspaceMembershipId: string;
  readonly decidedAt: string;
} & (
  | {
      readonly kind: 'APPROVE';
      readonly qualityRun: ContractQualityRun;
      readonly acknowledgedWarningCodes: readonly ContractQualityCode[];
      readonly representationChecksum: string;
    }
  | { readonly kind: 'REJECT'; readonly reason: string }
);
export function readContractWarningCodes(
  value: unknown,
): ContractQualityCode[] {
  if (
    !Array.isArray(value) ||
    value.length > Object.keys(CONTRACT_QUALITY_RULES).length
  )
    throw invalid('acknowledgedWarningCodes');
  const codes: ContractQualityCode[] = [];
  for (const item of value) {
    if (
      typeof item !== 'string' ||
      !isQualityCode(item) ||
      CONTRACT_QUALITY_RULES[item] !== 'WARNING' ||
      codes.includes(item)
    )
      throw invalid('acknowledgedWarningCodes');
    codes.push(item);
  }
  return codes;
}
function isQualityCode(value: string): value is ContractQualityCode {
  return Object.hasOwn(CONTRACT_QUALITY_RULES, value);
}
export function readContractDecisionCommand(
  kind: 'APPROVE' | 'REJECT',
  value: unknown,
): ContractDecisionCommand {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body');
  const input = Object.fromEntries(Object.entries(value));
  const allowed =
    kind === 'APPROVE'
      ? ['expectedContractRevision', 'acknowledgedWarningCodes']
      : ['expectedContractRevision', 'reason'];
  for (const key of Object.keys(input))
    if (!allowed.includes(key)) throw invalid(key);
  const expectedContractRevision = input.expectedContractRevision;
  if (
    typeof expectedContractRevision !== 'number' ||
    !Number.isSafeInteger(expectedContractRevision) ||
    expectedContractRevision < 1
  )
    throw invalid('expectedContractRevision');
  if (kind === 'APPROVE')
    return {
      kind,
      expectedContractRevision,
      acknowledgedWarningCodes: readContractWarningCodes(
        input.acknowledgedWarningCodes,
      ),
    };
  const reason = input.reason;
  if (
    typeof reason !== 'string' ||
    !reason.trim() ||
    Array.from(reason).length > 500 ||
    reason.includes('\0')
  )
    throw invalid('reason');
  return { kind, expectedContractRevision, reason };
}
function invalid(field: string) {
  return new BadRequestException({ code: 'INVALID_CONTRACT_INPUT', field });
}
