import { plan, snapshot } from './mission-applicability-app-fixture';
import type { ApplicabilityIntent } from '../project/mission-applicability-response';

export function historyActivity(index: number) {
  const row = plan.activities[index];
  if (!row) throw new Error('Expected preserved source activity');
  return row;
}
function observations({
  revision,
  index,
}: {
  revision: number;
  index: number;
}) {
  return {
    taskId: historyActivity(index).taskId,
    expectedApplicabilityRevision: revision - 1,
    expectedTaskVersion: 1,
    expectedResultRevision: 0,
    expectedLifecycleRevision: 0,
  };
}
export function historyFact({
  revision,
  index,
  intent,
  activityPredecessorId,
}: {
  revision: number;
  index: number;
  intent: ApplicabilityIntent;
  activityPredecessorId: string | null;
}) {
  const row = historyActivity(index);
  return {
    id: `fact-${revision}`,
    revision,
    kind:
      intent.action === 'PROPOSE'
        ? 'PROPOSED'
        : intent.action === 'CORRECT_PROPOSAL'
          ? 'PROPOSAL_CORRECTED'
          : intent.action === 'RESTORE'
            ? 'RESTORED'
            : intent.outcome === 'APPROVE'
              ? 'APPROVED'
              : 'REJECTED',
    predecessorId: revision === 1 ? null : `fact-${revision - 1}`,
    activityPredecessorId,
    activityKey: row.key,
    source: {
      templateKey: plan.templateKey,
      version: 1,
      title: row.title,
      activity: row.activity,
      intendedResult: row.intendedResult,
    },
    intent,
    observedTask: {
      id: row.taskId,
      title: row.title,
      status: 'todo',
      version: 1,
    },
    observedResult: null,
    observedResultRevision: 0,
    observedLifecycleRevision: 0,
    actor: {
      internalUserId: 'history-author-demo',
      workspaceMembershipId: 'history-member-demo',
      displayName: `Historical author ${revision} DEMO`,
    },
    capture: { assignmentId: 'history-grant-demo', permissionSetVersion: 'v1' },
    occurredAt: new Date(Date.UTC(2026, 9, 29, 0, 0, revision)).toISOString(),
  };
}
export function historyProposal({
  revision,
  index,
  previous = null,
}: {
  revision: number;
  index: number;
  previous?: string | null;
}) {
  const content = {
    ...observations({ revision, index }),
    reason: `Literal proposal ${revision} DEMO Ж / é / 🌍`,
    scopeBasis: `Reported scope ${revision} DEMO`,
    agreement: {
      kind: 'NO_CONTRACTUAL_CHANGE_REPORTED',
      basis: 'Reported agreement basis DEMO',
    } as const,
  };
  return historyFact({
    revision,
    index,
    activityPredecessorId: previous,
    intent:
      previous === null
        ? { ...content, action: 'PROPOSE' }
        : {
            ...content,
            action: 'CORRECT_PROPOSAL',
            proposalId: previous,
            correctionReason: `Correction ${revision} DEMO`,
          },
  });
}
export function historyDecision({
  revision,
  index,
  proposalId,
  outcome = 'APPROVE',
}: {
  revision: number;
  index: number;
  proposalId: string;
  outcome?: 'APPROVE' | 'REJECT';
}) {
  return historyFact({
    revision,
    index,
    activityPredecessorId: proposalId,
    intent: {
      ...observations({ revision, index }),
      action: 'DECIDE',
      proposalId,
      outcome,
      basis: `Reviewed decision ${revision} DEMO`,
    },
  });
}
export function distantApprovalFixture() {
  const facts: ReturnType<typeof historyFact>[] = [];
  let previous: string | null = null;
  for (let revision = 1; revision < 30; revision++) {
    const fact = historyProposal({
      revision,
      index: revision === 4 ? 0 : 1,
      previous: revision === 4 ? null : previous,
    });
    facts.push(fact);
    if (revision !== 4) previous = fact.id;
  }
  const proposal = facts.find((fact) => fact.revision === 4),
    pending = facts.find((fact) => fact.revision === 29);
  if (!proposal || !pending)
    throw new Error('Expected exact synthetic predecessors');
  const approval = historyDecision({
    revision: 30,
    index: 0,
    proposalId: proposal.id,
  });
  facts.push(approval);
  const base = snapshot();
  return {
    facts,
    current: {
      applicability: {
        ...base.applicability,
        revision: 30,
        activities: base.applicability.activities.map((row, index) =>
          index === 0
            ? {
                ...row,
                applicability: 'EXCLUDED_BY_APPROVER',
                lastProposal: proposal,
                activeApproval: approval,
                lastDecision: approval,
              }
            : index === 1
              ? { ...row, pendingProposal: pending, lastProposal: pending }
              : row,
        ),
      },
    },
    page(before = 31) {
      const older = facts.filter((fact) => fact.revision < before).reverse(),
        selected = older.slice(0, 25);
      return {
        history: {
          kind: 'available',
          facts: selected,
          hasMore: older.length > 25,
          nextBeforeRevision:
            older.length > 25 ? selected.at(-1)?.revision : null,
        },
      };
    },
  };
}

export function distantDecisionFixture() {
  const approved = distantApprovalFixture(),
    approval = approved.facts.find((fact) => fact.revision === 30);
  if (!approval) throw new Error('Expected exact synthetic approval');
  const restoration = historyFact({
    revision: 31,
    index: 0,
    activityPredecessorId: approval.id,
    intent: {
      ...observations({ revision: 31, index: 0 }),
      action: 'RESTORE',
      approvalId: approval.id,
      basis: 'Restore exact excluded activity DEMO',
    },
  });
  const proposal = {
    ...historyProposal({ revision: 32, index: 0 }),
    activityPredecessorId: restoration.id,
  };
  const facts = [...approved.facts, restoration, proposal];
  let previous = 'fact-29';
  for (let revision = 33; revision <= 60; revision++) {
    const fact = historyProposal({ revision, index: 1, previous });
    facts.push(fact);
    previous = fact.id;
  }
  const pending = facts.at(-1);
  if (!pending) throw new Error('Expected current other-activity proposal');
  return {
    facts,
    current: {
      applicability: {
        ...approved.current.applicability,
        revision: 60,
        activities: approved.current.applicability.activities.map(
          (row, index) =>
            index === 0
              ? {
                  ...row,
                  applicability: 'REQUIRED',
                  pendingProposal: proposal,
                  activeApproval: null,
                  lastProposal: proposal,
                  lastDecision: approval,
                  lastRestoration: restoration,
                }
              : index === 1
                ? { ...row, pendingProposal: pending, lastProposal: pending }
                : row,
        ),
      },
    },
    page(before = 61) {
      const older = facts.filter((fact) => fact.revision < before).reverse(),
        selected = older.slice(0, 25);
      return {
        history: {
          kind: 'available',
          facts: selected,
          hasMore: older.length > 25,
          nextBeforeRevision:
            older.length > 25 ? selected.at(-1)?.revision : null,
        },
      };
    },
  };
}
