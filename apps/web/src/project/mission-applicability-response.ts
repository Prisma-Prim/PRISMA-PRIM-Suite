import type { CopiedPilotTemplatePlan } from './project-template-response';
import { isProjectStatus } from './project-lifecycle-response';
import { taskStates } from './task-response';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid applicability response');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    /[\uD800-\uDFFF]/u.test(value) ||
    value.includes('\0')
  )
    throw new Error('Invalid applicability text');
  return value;
}
function literal(value: unknown, max: number) {
  const result = text(value);
  if (result !== result.trim() || Array.from(result).length > max)
    throw new Error('Invalid applicability statement');
  return result;
}
function revision(value: unknown, min = 0) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > 2147483647
  )
    throw new Error('Invalid applicability revision');
  return value;
}
function nullableId(value: unknown) {
  return value === null ? null : text(value);
}
export function readApplicabilityAgreement(value: unknown) {
  const row = object(value);
  if (
    row.kind === 'PARTIES_AGREEMENT_REPORTED' &&
    Object.keys(row).length === 2 &&
    row.basis === undefined
  )
    return { kind: row.kind, reference: literal(row.reference, 2000) } as const;
  if (
    (row.kind === 'NO_CONTRACTUAL_CHANGE_REPORTED' ||
      row.kind === 'PARTIES_AGREEMENT_UNAVAILABLE') &&
    Object.keys(row).length === 2 &&
    row.reference === undefined
  )
    return { kind: row.kind, basis: literal(row.basis, 2000) } as const;
  throw new Error('Invalid reported agreement');
}
/** A qualified reference is an observation, never a copied result declaration. */
function readApplicabilityResultObservation(value: unknown) {
  const row = object(value),
    reference = object(row.reference);
  if (
    Object.keys(row).length !== 3 ||
    !['id', 'revision', 'reference'].every((key) => key in row) ||
    Object.keys(reference).length !== 6 ||
    ![
      'documentId',
      'versionId',
      'versionNumber',
      'title',
      'status',
      'representationId',
    ].every((key) => key in reference) ||
    (reference.status !== 'official' && reference.status !== 'superseded')
  )
    throw new Error('Invalid applicability result observation');
  return {
    id: text(row.id),
    revision: revision(row.revision, 1),
    reference: {
      documentId: text(reference.documentId),
      versionId: text(reference.versionId),
      versionNumber: revision(reference.versionNumber, 1),
      title: text(reference.title),
      status: reference.status,
      representationId: text(reference.representationId),
    },
  };
}
function readApplicabilityActivity(
  value: unknown,
  planned: CopiedPilotTemplatePlan['activities'][number] | undefined,
) {
  const row = object(value),
    task = object(row.task),
    result = object(row.result),
    status = taskStates.find((status) => status === task.status);
  if (
    !planned ||
    row.key !== planned.key ||
    row.title !== planned.title ||
    row.activity !== planned.activity ||
    row.intendedResult !== planned.intendedResult ||
    task.id !== planned.taskId ||
    !status ||
    result.kind !== 'available'
  )
    throw new Error('Invalid applicability activity');
  return {
    ...planned,
    task: {
      id: planned.taskId,
      title: text(task.title),
      status,
      version: revision(task.version, 1),
    },
    result: {
      kind: 'available' as const,
      current:
        result.current === null
          ? null
          : readApplicabilityResultObservation(result.current),
    },
  };
}
function readIntent(value: unknown) {
  const row = object(value),
    observations = {
      taskId: text(row.taskId),
      expectedApplicabilityRevision: revision(
        row.expectedApplicabilityRevision,
      ),
      expectedTaskVersion: revision(row.expectedTaskVersion, 1),
      expectedResultRevision: revision(row.expectedResultRevision),
      expectedLifecycleRevision: revision(row.expectedLifecycleRevision),
    };
  switch (row.action) {
    case 'PROPOSE':
      return {
        ...observations,
        action: row.action,
        reason: literal(row.reason, 1000),
        scopeBasis: literal(row.scopeBasis, 2000),
        agreement: readApplicabilityAgreement(row.agreement),
      } as const;
    case 'CORRECT_PROPOSAL':
      return {
        ...observations,
        action: row.action,
        proposalId: text(row.proposalId),
        reason: literal(row.reason, 1000),
        scopeBasis: literal(row.scopeBasis, 2000),
        agreement: readApplicabilityAgreement(row.agreement),
        correctionReason: literal(row.correctionReason, 500),
      } as const;
    case 'DECIDE':
      if (row.outcome !== 'APPROVE' && row.outcome !== 'REJECT')
        throw new Error('Invalid applicability decision');
      return {
        ...observations,
        action: row.action,
        proposalId: text(row.proposalId),
        outcome: row.outcome,
        basis: literal(row.basis, 2000),
      } as const;
    case 'RESTORE':
      return {
        ...observations,
        action: row.action,
        approvalId: text(row.approvalId),
        basis: literal(row.basis, 2000),
      } as const;
    default:
      throw new Error('Invalid applicability intent');
  }
}
function factKind(
  value: unknown,
): 'PROPOSED' | 'PROPOSAL_CORRECTED' | 'APPROVED' | 'REJECTED' | 'RESTORED' {
  if (
    value === 'PROPOSED' ||
    value === 'PROPOSAL_CORRECTED' ||
    value === 'APPROVED' ||
    value === 'REJECTED' ||
    value === 'RESTORED'
  )
    return value;
  throw new Error('Invalid applicability fact kind');
}
export function readApplicabilityFact(
  value: unknown,
  plan: CopiedPilotTemplatePlan,
) {
  const row = object(value),
    kind = factKind(row.kind),
    source = object(row.source),
    task = object(row.observedTask),
    actor = object(row.actor),
    capture = object(row.capture),
    intent = readIntent(row.intent),
    factRevision = revision(row.revision, 1);
  const planned = plan.activities.find(
      (activity) => activity.key === row.activityKey,
    ),
    status = taskStates.find((status) => status === task.status);
  const predecessorId = nullableId(row.predecessorId),
    activityPredecessorId = nullableId(row.activityPredecessorId);
  const result =
    row.observedResult === null
      ? null
      : readApplicabilityResultObservation(row.observedResult);
  const expectedKind =
    intent.action === 'PROPOSE'
      ? 'PROPOSED'
      : intent.action === 'CORRECT_PROPOSAL'
        ? 'PROPOSAL_CORRECTED'
        : intent.action === 'RESTORE'
          ? 'RESTORED'
          : intent.outcome === 'APPROVE'
            ? 'APPROVED'
            : 'REJECTED';
  if (
    !planned ||
    source.templateKey !== plan.templateKey ||
    source.version !== 1 ||
    source.title !== planned.title ||
    source.activity !== planned.activity ||
    source.intendedResult !== planned.intendedResult ||
    task.id !== planned.taskId ||
    !status ||
    intent.taskId !== planned.taskId ||
    expectedKind !== kind ||
    intent.expectedApplicabilityRevision !== factRevision - 1 ||
    intent.expectedTaskVersion !== task.version ||
    intent.expectedResultRevision !== row.observedResultRevision ||
    intent.expectedLifecycleRevision !== row.observedLifecycleRevision ||
    (result?.revision ?? 0) !== row.observedResultRevision ||
    (factRevision === 1) !== (predecessorId === null) ||
    capture.permissionSetVersion !== 'v1' ||
    !Number.isFinite(Date.parse(text(row.occurredAt)))
  )
    throw new Error('Mismatched immutable applicability fact');
  return {
    id: text(row.id),
    revision: factRevision,
    kind,
    predecessorId,
    activityPredecessorId,
    activityKey: planned.key,
    source: {
      title: planned.title,
      activity: planned.activity,
      intendedResult: planned.intendedResult,
    },
    intent,
    observedTask: {
      id: planned.taskId,
      title: text(task.title),
      status,
      version: revision(task.version, 1),
    },
    observedResult: result,
    observedResultRevision: revision(row.observedResultRevision),
    observedLifecycleRevision: revision(row.observedLifecycleRevision),
    actor: {
      internalUserId: text(actor.internalUserId),
      workspaceMembershipId: text(actor.workspaceMembershipId),
      displayName: text(actor.displayName),
    },
    capture: {
      assignmentId: text(capture.assignmentId),
      permissionSetVersion: capture.permissionSetVersion,
    },
    occurredAt: text(row.occurredAt),
  };
}
export type ApplicabilityFact = ReturnType<typeof readApplicabilityFact>;
export type ApplicabilityIntent = ReturnType<typeof readIntent>;
export function readMissionApplicability(
  value: unknown,
  expected: { projectId: string; plan: CopiedPilotTemplatePlan },
) {
  const applicability = object(value).applicability;
  if (applicability === null) return null;
  const row = object(applicability);
  if (row.kind === 'unavailable' && Object.keys(row).length === 1)
    return { kind: 'unavailable' as const };
  const project = object(row.project),
    source = object(row.source),
    clarification = object(row.clarification),
    currentRevision = revision(row.revision);
  if (
    row.kind !== 'available' ||
    project.id !== expected.projectId ||
    !isProjectStatus(project.status) ||
    project.lifecycleRevision !== row.lifecycleRevision ||
    source.templateKey !== expected.plan.templateKey ||
    source.version !== 1 ||
    source.title !== expected.plan.title ||
    clarification.state !== 'BUSINESS_CLARIFICATION_PENDING' ||
    clarification.questionId !== 'MISSION-CLOSE-01' ||
    typeof row.mutable !== 'boolean' ||
    ((project.status === 'completed' || project.status === 'cancelled') &&
      row.mutable) ||
    !Array.isArray(row.activities) ||
    row.activities.length !== 13
  )
    throw new Error('Mismatched applicability projection');
  const rows: unknown[] = row.activities;
  const activities = rows.map((value, index) => {
    const row = object(value),
      activity = readApplicabilityActivity(
        value,
        expected.plan.activities[index],
      );
    const readFact = (value: unknown) =>
      value === null ? null : readApplicabilityFact(value, expected.plan);
    const pendingProposal = readFact(row.pendingProposal),
      activeApproval = readFact(row.activeApproval),
      lastProposal = readFact(row.lastProposal),
      lastDecision = readFact(row.lastDecision),
      lastRestoration = readFact(row.lastRestoration);
    if (
      (row.applicability !== 'REQUIRED' &&
        row.applicability !== 'EXCLUDED_BY_APPROVER') ||
      (row.applicability === 'EXCLUDED_BY_APPROVER') !==
        (activeApproval !== null) ||
      (pendingProposal !== null && activeApproval !== null) ||
      (pendingProposal &&
        pendingProposal.kind !== 'PROPOSED' &&
        pendingProposal.kind !== 'PROPOSAL_CORRECTED') ||
      (activeApproval && activeApproval.kind !== 'APPROVED') ||
      (lastProposal &&
        lastProposal.kind !== 'PROPOSED' &&
        lastProposal.kind !== 'PROPOSAL_CORRECTED') ||
      (lastDecision &&
        lastDecision.kind !== 'APPROVED' &&
        lastDecision.kind !== 'REJECTED') ||
      (lastRestoration && lastRestoration.kind !== 'RESTORED')
    )
      throw new Error('Invalid applicability consequence');
    for (const fact of [
      pendingProposal,
      activeApproval,
      lastProposal,
      lastDecision,
      lastRestoration,
    ])
      if (
        fact &&
        (fact.observedTask.id !== activity.task.id ||
          fact.revision > currentRevision)
      )
        throw new Error('Invalid activity fact reference');
    return {
      ...activity,
      result: activity.result,
      applicability: row.applicability,
      pendingProposal,
      activeApproval,
      lastProposal,
      lastDecision,
      lastRestoration,
    } as const;
  });
  return {
    kind: 'available' as const,
    projectId: expected.projectId,
    projectStatus: project.status,
    originalClientAccountId: text(project.clientAccountId),
    revision: currentRevision,
    lifecycleRevision: revision(row.lifecycleRevision),
    mutable: row.mutable,
    activities,
  };
}
export type ApplicabilitySnapshot = Extract<
  NonNullable<ReturnType<typeof readMissionApplicability>>,
  { kind: 'available' }
>;
export function readApplicabilityHistory(
  value: unknown,
  plan: CopiedPilotTemplatePlan,
  before?: number,
) {
  const history = object(value).history;
  if (history === null) return null;
  const row = object(history);
  if (row.kind === 'unavailable' && Object.keys(row).length === 1)
    return { kind: 'unavailable' as const };
  if (
    row.kind !== 'available' ||
    !Array.isArray(row.facts) ||
    row.facts.length > 25 ||
    typeof row.hasMore !== 'boolean'
  )
    throw new Error('Invalid applicability history');
  const values: unknown[] = row.facts,
    facts = values.map((value) => readApplicabilityFact(value, plan));
  for (let index = 0; index < facts.length; index++) {
    const fact = facts[index],
      previous = facts[index - 1];
    if (
      !fact ||
      (before !== undefined && fact.revision >= before) ||
      (previous && fact.revision !== previous.revision - 1)
    )
      throw new Error('Invalid applicability history order');
  }
  if (
    row.hasMore
      ? facts.length !== 25 || row.nextBeforeRevision !== facts[24]?.revision
      : row.nextBeforeRevision !== null
  )
    throw new Error('Invalid applicability history cursor');
  return {
    kind: 'available' as const,
    facts,
    hasMore: row.hasMore,
    nextBeforeRevision:
      row.nextBeforeRevision === null
        ? null
        : revision(row.nextBeforeRevision, 1),
  };
}
export function readApplicabilityReceipt(value: unknown, projectId: string) {
  const row = object(value);
  if (
    Object.keys(row).length !== 4 ||
    row.projectId !== projectId ||
    (row.action !== 'recorded' && row.action !== 'unchanged')
  )
    throw new Error('Invalid applicability receipt');
  return {
    action: row.action,
    projectId,
    factId: text(row.factId),
    applicabilityRevision: revision(row.applicabilityRevision, 1),
  };
}
