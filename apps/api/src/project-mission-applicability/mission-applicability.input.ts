import { BadRequestException } from '@nestjs/common';
import {
  requireUuid,
  requireIdempotencyKey,
} from '../access/access-command-validation.js';

export function closedObject(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Expected an object.');
  const object = Object.fromEntries(Object.entries(value));
  if (Object.keys(object).some((key) => !keys.includes(key)))
    throw new BadRequestException('Unknown field.');
  return object;
}
export function applicabilityRevision(value: unknown, positive = false) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < (positive ? 1 : 0) ||
    value > 2147483647
  )
    throw new BadRequestException('Invalid observed revision.');
  return value;
}
export function applicabilityLiteral(value: unknown, maximum: number) {
  if (
    typeof value !== 'string' ||
    /[\uD800-\uDFFF]/u.test(value) ||
    value.includes('\0')
  )
    throw new BadRequestException('A valid literal statement is required.');
  const result = value.trim();
  if (Array.from(result).length < 1 || Array.from(result).length > maximum)
    throw new BadRequestException(
      `A literal statement of 1–${maximum} characters is required.`,
    );
  return result;
}
function agreementInput(value: unknown) {
  const object = closedObject(value, ['kind', 'basis', 'reference']);
  if (
    object.kind === 'PARTIES_AGREEMENT_REPORTED' &&
    object.basis === undefined
  )
    return {
      kind: object.kind,
      reference: applicabilityLiteral(object.reference, 2000),
    } as const;
  if (
    (object.kind === 'NO_CONTRACTUAL_CHANGE_REPORTED' ||
      object.kind === 'PARTIES_AGREEMENT_UNAVAILABLE') &&
    object.reference === undefined
  )
    return {
      kind: object.kind,
      basis: applicabilityLiteral(object.basis, 2000),
    } as const;
  throw new BadRequestException('Choose a reported agreement basis.');
}
export function applicabilityInput(value: unknown) {
  const common = [
    'action',
    'taskId',
    'expectedApplicabilityRevision',
    'expectedTaskVersion',
    'expectedResultRevision',
    'expectedLifecycleRevision',
  ];
  const action = closedObject(value, [
    ...common,
    'reason',
    'scopeBasis',
    'agreement',
    'proposalId',
    'correctionReason',
    'outcome',
    'basis',
    'approvalId',
  ]).action;
  if (
    action !== 'PROPOSE' &&
    action !== 'CORRECT_PROPOSAL' &&
    action !== 'DECIDE' &&
    action !== 'RESTORE'
  )
    throw new BadRequestException('Unknown applicability action.');
  const fields =
    action === 'PROPOSE'
      ? ['reason', 'scopeBasis', 'agreement']
      : action === 'CORRECT_PROPOSAL'
        ? [
            'proposalId',
            'reason',
            'scopeBasis',
            'agreement',
            'correctionReason',
          ]
        : action === 'DECIDE'
          ? ['proposalId', 'outcome', 'basis']
          : action === 'RESTORE'
            ? ['approvalId', 'basis']
            : null;
  if (!fields) throw new BadRequestException('Unknown applicability action.');
  const body = closedObject(value, [...common, ...fields]);
  const observations = {
    taskId: requireUuid(body.taskId),
    expectedApplicabilityRevision: applicabilityRevision(
      body.expectedApplicabilityRevision,
    ),
    expectedTaskVersion: applicabilityRevision(body.expectedTaskVersion, true),
    expectedResultRevision: applicabilityRevision(body.expectedResultRevision),
    expectedLifecycleRevision: applicabilityRevision(
      body.expectedLifecycleRevision,
    ),
  };
  switch (action) {
    case 'PROPOSE':
      return {
        ...observations,
        action,
        reason: applicabilityLiteral(body.reason, 1000),
        scopeBasis: applicabilityLiteral(body.scopeBasis, 2000),
        agreement: agreementInput(body.agreement),
      } as const;
    case 'CORRECT_PROPOSAL':
      return {
        ...observations,
        action,
        proposalId: requireUuid(body.proposalId),
        reason: applicabilityLiteral(body.reason, 1000),
        scopeBasis: applicabilityLiteral(body.scopeBasis, 2000),
        agreement: agreementInput(body.agreement),
        correctionReason: applicabilityLiteral(body.correctionReason, 500),
      } as const;
    case 'DECIDE': {
      if (body.outcome !== 'APPROVE' && body.outcome !== 'REJECT')
        throw new BadRequestException('Choose an explicit decision.');
      return {
        ...observations,
        action,
        proposalId: requireUuid(body.proposalId),
        outcome: body.outcome,
        basis: applicabilityLiteral(body.basis, 2000),
      } as const;
    }
    case 'RESTORE':
      return {
        ...observations,
        action,
        approvalId: requireUuid(body.approvalId),
        basis: applicabilityLiteral(body.basis, 2000),
      } as const;
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
export type ApplicabilityInput = ReturnType<typeof applicabilityInput>;
export function applicabilityHistoryQuery(value: unknown) {
  const query = closedObject(value, ['beforeRevision']);
  if (query.beforeRevision === undefined) return undefined;
  if (
    typeof query.beforeRevision !== 'string' ||
    !/^[1-9]\d*$/u.test(query.beforeRevision)
  )
    throw new BadRequestException('Invalid history cursor.');
  return applicabilityRevision(Number(query.beforeRevision), true);
}

/** Same literal key representation, bounded to the existing immutable receipt's resource limit. */
export function applicabilityIdempotencyKey(value: string | undefined) {
  const key = requireIdempotencyKey(value);
  if (
    Array.from(key).length > 200 ||
    /[\uD800-\uDFFF]/u.test(key) ||
    key.includes('\0')
  )
    throw new BadRequestException('Invalid Idempotency-Key.');
  return key;
}
