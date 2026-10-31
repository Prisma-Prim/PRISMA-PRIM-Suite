import { ConflictException } from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import type { ApplicabilityInput } from './mission-applicability.input.js';
import type { ApplicabilityFact } from './mission-applicability.store.js';

/** Pure material-successor boundary, reached only after replay and unchanged cases. */
export function nextApplicabilityRevision(current: number) {
  if (!Number.isInteger(current) || current < 0 || current > 2147483647)
    throw new Error('Invalid stored applicability revision.');
  if (current === 2147483647)
    throw new ConflictException('Applicability revision is exhausted.');
  return current + 1;
}

export function applicabilityKind(
  input: ApplicabilityInput,
): ApplicabilityFact['kind'] {
  switch (input.action) {
    case 'PROPOSE':
      return 'PROPOSED';
    case 'CORRECT_PROPOSAL':
      return 'PROPOSAL_CORRECTED';
    case 'DECIDE':
      return input.outcome === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    case 'RESTORE':
      return 'RESTORED';
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}
export function isPending(row: ApplicabilityFact | null) {
  return row?.kind === 'PROPOSED' || row?.kind === 'PROPOSAL_CORRECTED';
}
function proposalContent(input: ApplicabilityInput) {
  if (input.action !== 'PROPOSE' && input.action !== 'CORRECT_PROPOSAL')
    return null;
  return JSON.stringify([input.reason, input.scopeBasis, input.agreement]);
}
export function sameApplicabilityFact(
  actor: ActorContext,
  input: ApplicabilityInput,
  row: ApplicabilityFact,
  previous: ApplicabilityInput,
) {
  const sameActor =
    row.actorInternalUserId === actor.internalUserId &&
    row.actorMembershipId === actor.workspaceMembershipId;
  switch (input.action) {
    case 'PROPOSE':
      return (
        sameActor &&
        isPending(row) &&
        proposalContent(input) === proposalContent(previous)
      );
    case 'CORRECT_PROPOSAL':
      return (
        isPending(row) &&
        input.proposalId === row.id &&
        proposalContent(input) === proposalContent(previous)
      );
    case 'DECIDE':
      return (
        sameActor &&
        previous.action === 'DECIDE' &&
        input.proposalId === previous.proposalId &&
        input.outcome === previous.outcome &&
        input.basis === previous.basis
      );
    case 'RESTORE':
      return (
        sameActor &&
        previous.action === 'RESTORE' &&
        input.approvalId === previous.approvalId &&
        input.basis === previous.basis
      );
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}
export function requireApplicabilityTransition(
  input: ApplicabilityInput,
  last: ApplicabilityFact | null,
  previous: ApplicabilityInput | null,
) {
  switch (input.action) {
    case 'PROPOSE':
      if (last && last.kind !== 'REJECTED' && last.kind !== 'RESTORED')
        throw new ConflictException(
          'Resolve the current proposal or restore its approval first.',
        );
      return;
    case 'CORRECT_PROPOSAL':
      if (!last || !isPending(last) || last.id !== input.proposalId)
        throw new ConflictException(
          'Select the exact current pending proposal.',
        );
      return;
    case 'DECIDE':
      if (!last || !isPending(last) || last.id !== input.proposalId)
        throw new ConflictException(
          'Select the exact current pending proposal.',
        );
      if (
        !previous ||
        (previous.action !== 'PROPOSE' &&
          previous.action !== 'CORRECT_PROPOSAL')
      )
        throw new Error('Invalid pending proposal.');
      if (
        input.outcome === 'APPROVE' &&
        previous.agreement.kind === 'PARTIES_AGREEMENT_UNAVAILABLE'
      )
        throw new ConflictException(
          'The reported parties agreement is unavailable. Correct the proposal before approval.',
        );
      return;
    case 'RESTORE':
      if (last?.kind !== 'APPROVED' || last.id !== input.approvalId)
        throw new ConflictException('Select the exact active approval.');
      return;
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}
