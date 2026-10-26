import { isProjectStatus } from './project-lifecycle-response';
import { readMissionActivity } from './mission-readiness-response';
import {
  readTaskResultDeclaration,
  type TaskResultDeclaration,
} from './task-results-response';
import type { CopiedPilotTemplatePlan } from './project-template-response';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid mission review');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Missing mission review text');
  return value;
}
function revision(value: unknown, minimum = 0) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > 2147483647
  )
    throw new Error('Invalid mission review revision');
  return value;
}
function evidenceParse(
  value: unknown,
):
  | { kind: 'EXTERNAL_REPORTED'; reference: string }
  | { kind: 'DECLARED_RESULT'; result: TaskResultDeclaration } {
  const row = object(value);
  if (row.kind === 'EXTERNAL_REPORTED')
    return { kind: row.kind, reference: text(row.reference) };
  if (row.kind === 'DECLARED_RESULT')
    return { kind: row.kind, result: readTaskResultDeclaration(row.result) };
  throw new Error('Invalid review evidence');
}
function outcome(value: unknown): 'ACCEPTED_BY_REVIEWER' | 'NEEDS_WORK' {
  if (value === 'ACCEPTED_BY_REVIEWER' || value === 'NEEDS_WORK') return value;
  throw new Error('Invalid human judgment');
}
export function readReviewJudgment(value: unknown) {
  const row = object(value),
    actor = object(row.actor),
    task = object(row.observedTask);
  const parsedOutcome = outcome(row.outcome);
  if (row.predecessorId !== null && typeof row.predecessorId !== 'string')
    throw new Error('Invalid predecessor');
  const parsedEvidence = evidenceParse(row.evidence);
  const observedResultRevision = revision(row.observedResultRevision);
  if (
    parsedEvidence.kind === 'DECLARED_RESULT' &&
    parsedEvidence.result.revision !== observedResultRevision
  )
    throw new Error('Mismatched exact review evidence');
  if (!Number.isFinite(Date.parse(text(row.occurredAt))))
    throw new Error('Invalid review time');
  return {
    id: text(row.id),
    batchId: text(row.batchId),
    reviewRevision: revision(row.reviewRevision, 1),
    predecessorId: row.predecessorId,
    outcome: parsedOutcome,
    basis: text(row.basis),
    occurredAt: text(row.occurredAt),
    actor: {
      internalUserId: text(actor.internalUserId),
      workspaceMembershipId: text(actor.workspaceMembershipId),
      displayName: text(actor.displayName),
    },
    observedTask: {
      id: text(task.id),
      title: text(task.title),
      version: revision(task.version, 1),
    },
    observedResultRevision,
    evidence: parsedEvidence,
  };
}
export function readMissionReview(
  value: unknown,
  expected: { projectId: string; plan: CopiedPilotTemplatePlan },
) {
  const raw = object(value).review;
  if (raw === null) return null;
  const review = object(raw);
  if (review.kind === 'unavailable' && Object.keys(review).length === 1)
    return { kind: 'unavailable' as const };
  const project = object(review.project),
    source = object(review.source);
  if (
    typeof review.mutable !== 'boolean' ||
    review.kind !== 'available' ||
    project.id !== expected.projectId ||
    !isProjectStatus(project.status) ||
    source.templateKey !== expected.plan.templateKey ||
    source.version !== expected.plan.version ||
    source.title !== expected.plan.title ||
    !Array.isArray(review.activities) ||
    review.activities.length !== 13
  )
    throw new Error('Mismatched mission review source');
  const head = revision(review.revision);
  const values: unknown[] = review.activities;
  const activities = values.map((value, index) => {
    const facts = readMissionActivity(value, expected.plan.activities[index]);
    if (facts.result.kind !== 'available')
      throw new Error('Invalid available review evidence');
    const rawLatest = object(value).latest;
    const latest = rawLatest === null ? null : readReviewJudgment(rawLatest);
    if (latest) {
      const current = object(rawLatest).current;
      if (
        latest.observedTask.id !== facts.task.id ||
        latest.reviewRevision > head ||
        typeof current !== 'boolean' ||
        current !==
          (latest.observedTask.version === facts.task.version &&
            latest.observedResultRevision ===
              (facts.result.current?.revision ?? 0))
      )
        throw new Error('Mismatched review facts');
      return { ...facts, result: facts.result, latest: { ...latest, current } };
    }
    return { ...facts, result: facts.result, latest: null };
  });
  if (head === 0 && activities.some((row) => row.latest !== null))
    throw new Error('Invalid empty review stream');
  return {
    kind: 'available' as const,
    mutable: review.mutable,
    revision: head,
    projectStatus: project.status,
    activities,
  };
}
export function readReviewHistory(
  value: unknown,
  plan: CopiedPilotTemplatePlan,
) {
  const raw = object(value).history;
  if (raw === null) return null;
  const history = object(raw);
  if (history.kind === 'unavailable' && Object.keys(history).length === 1)
    return { kind: 'unavailable' as const };
  if (
    history.kind !== 'available' ||
    !Array.isArray(history.batches) ||
    history.batches.length > 25 ||
    typeof history.hasMore !== 'boolean'
  )
    throw new Error('Invalid review history');
  const batches: unknown[] = history.batches;
  const parsed = batches.map((value) => {
    const batch = object(value);
    if (
      !Array.isArray(batch.items) ||
      batch.items.length < 1 ||
      batch.items.length > 13
    )
      throw new Error('Invalid history batch');
    const raw: unknown[] = batch.items;
    const items = raw.map(readReviewJudgment);
    const id = text(batch.id),
      rev = revision(batch.reviewRevision, 1);
    if (
      new Set(items.map((item) => item.observedTask.id)).size !==
        items.length ||
      items.some(
        (item) =>
          item.batchId !== id ||
          item.reviewRevision !== rev ||
          item.outcome !== batch.outcome ||
          item.basis !== batch.basis ||
          !plan.activities.some((row) => row.taskId === item.observedTask.id),
      )
    )
      throw new Error('Mismatched history item');
    return { id, reviewRevision: rev, items };
  });
  if (
    parsed.some(
      (batch, i) =>
        i > 0 && batch.reviewRevision >= (parsed[i - 1]?.reviewRevision ?? 0),
    ) ||
    (history.hasMore
      ? parsed.length !== 25 ||
        history.nextBeforeRevision !== parsed.at(-1)?.reviewRevision
      : history.nextBeforeRevision !== null)
  )
    throw new Error('Invalid history bounds');
  return {
    kind: 'available' as const,
    batches: parsed,
    hasMore: history.hasMore,
    nextBeforeRevision: history.hasMore
      ? revision(history.nextBeforeRevision, 1)
      : null,
  };
}
export function readReviewReceipt(value: unknown, projectId: string) {
  const row = object(value);
  if (
    row.projectId !== projectId ||
    (row.action !== 'recorded' && row.action !== 'unchanged')
  )
    throw new Error('Invalid review receipt');
  return {
    projectId,
    action: row.action,
    batchId: text(row.batchId),
    reviewRevision: revision(row.reviewRevision, 1),
  };
}
export type AvailableMissionReview = Extract<
  NonNullable<ReturnType<typeof readMissionReview>>,
  { kind: 'available' }
>;
export type MissionReviewJudgment = ReturnType<typeof readReviewJudgment>;
