import type { ApplicabilityFact } from './mission-applicability-response';

export type ApplicabilityRelation = {
  kind:
    | 'correctsProposal'
    | 'decisionProposal'
    | 'restoredApproval'
    | 'priorActivityFact';
  targetId: string;
};
export function applicabilityRelation(
  fact: ApplicabilityFact,
): ApplicabilityRelation | null {
  switch (fact.intent.action) {
    case 'CORRECT_PROPOSAL':
      return { kind: 'correctsProposal', targetId: fact.intent.proposalId };
    case 'DECIDE':
      return { kind: 'decisionProposal', targetId: fact.intent.proposalId };
    case 'RESTORE':
      return { kind: 'restoredApproval', targetId: fact.intent.approvalId };
    case 'PROPOSE':
      return fact.activityPredecessorId === null
        ? null
        : { kind: 'priorActivityFact', targetId: fact.activityPredecessorId };
    default: {
      const exhaustive: never = fact.intent;
      return exhaustive;
    }
  }
}
function correctKind(relation: ApplicabilityRelation, fact: ApplicabilityFact) {
  switch (relation.kind) {
    case 'correctsProposal':
    case 'decisionProposal':
      return fact.kind === 'PROPOSED' || fact.kind === 'PROPOSAL_CORRECTED';
    case 'restoredApproval':
      return fact.kind === 'APPROVED';
    case 'priorActivityFact':
      return fact.kind === 'REJECTED' || fact.kind === 'RESTORED';
    default: {
      const exhaustive: never = relation.kind;
      return exhaustive;
    }
  }
}
export function resolveApplicabilityRelation({
  origin,
  relation,
  facts,
}: {
  origin: ApplicabilityFact;
  relation: ApplicabilityRelation;
  facts: readonly ApplicabilityFact[];
}):
  | { kind: 'known'; fact: ApplicabilityFact }
  | { kind: 'notLoaded' | 'unverified' } {
  const matches = facts.filter((fact) => fact.id === relation.targetId),
    target = matches[0];
  if (!target) return { kind: 'notLoaded' };
  if (
    target.revision >= origin.revision ||
    target.activityKey !== origin.activityKey ||
    target.observedTask.id !== origin.observedTask.id ||
    !correctKind(relation, target) ||
    matches.some((fact) => JSON.stringify(fact) !== JSON.stringify(target))
  )
    return { kind: 'unverified' };
  return { kind: 'known', fact: target };
}
export function supersedingApplicabilityCorrection(
  fact: ApplicabilityFact,
  knownFacts: readonly ApplicabilityFact[],
) {
  return knownFacts.find((candidate) => {
    const relation = applicabilityRelation(candidate);
    return (
      relation?.kind === 'correctsProposal' &&
      relation.targetId === fact.id &&
      resolveApplicabilityRelation({
        origin: candidate,
        relation,
        facts: [fact],
      }).kind === 'known'
    );
  });
}
