import type { CopiedPilotTemplatePlan } from './project-template-response';
import { isProjectStatus } from './project-lifecycle-response';
import { taskStates, type TaskState } from './task-response';
import {
  readTaskResultDeclaration,
  type TaskResultDeclaration,
} from './task-results-response';

export type MissionResult =
  | { kind: 'unavailable' }
  | { kind: 'available'; current: TaskResultDeclaration | null };
export function missionState(status: TaskState, result: MissionResult) {
  switch (status) {
    case 'todo':
    case 'in_progress':
    case 'blocked':
      return 'WORK_OPEN';
    case 'cancelled':
      return 'WORK_CANCELLED';
    case 'done':
      return result.kind === 'unavailable'
        ? 'EVIDENCE_UNAVAILABLE'
        : result.current === null
          ? 'RESULT_NOT_RECORDED'
          : 'RECORDED_RESULT_NOT_REVIEWED';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid mission readiness');
  return Object.fromEntries(Object.entries(value));
}
export function readMissionReadiness(
  value: unknown,
  expected: { projectId: string; plan: CopiedPilotTemplatePlan },
) {
  const assessment = object(value).assessment;
  if (assessment === null) return null;
  const row = object(assessment),
    project = object(row.project),
    source = object(row.source),
    clarification = object(row.clarification);
  if (
    row.kind !== 'DIAGNOSTIC_ONLY' ||
    project.id !== expected.projectId ||
    !isProjectStatus(project.status) ||
    source.templateKey !== expected.plan.templateKey ||
    source.version !== expected.plan.version ||
    source.title !== expected.plan.title ||
    clarification.state !== 'BUSINESS_CLARIFICATION_PENDING' ||
    clarification.questionId !== 'MISSION-CLOSE-01' ||
    !Array.isArray(row.activities) ||
    row.activities.length !== 13
  )
    throw new Error('Mismatched mission readiness');
  const values: unknown[] = row.activities;
  const activities = values.map((value, index) => {
    const item = object(value),
      task = object(item.task),
      result = object(item.result),
      planned = expected.plan.activities[index];
    const status = taskStates.find((state) => state === task.status);
    if (
      !planned ||
      item.key !== planned.key ||
      item.title !== planned.title ||
      item.activity !== planned.activity ||
      item.intendedResult !== planned.intendedResult ||
      task.id !== planned.taskId ||
      !status ||
      typeof task.title !== 'string' ||
      !task.title.trim() ||
      typeof task.version !== 'number' ||
      !Number.isSafeInteger(task.version) ||
      task.version < 1
    )
      throw new Error('Invalid mission activity');
    let projection: MissionResult;
    if (result.kind === 'unavailable' && Object.keys(result).length === 1)
      projection = { kind: 'unavailable' };
    else if (result.kind === 'available')
      projection = {
        kind: 'available',
        current:
          result.current === null
            ? null
            : readTaskResultDeclaration(result.current),
      };
    else throw new Error('Invalid mission result');
    const state = missionState(status, projection);
    if (item.state !== state) throw new Error('Invalid diagnostic state');
    return {
      ...planned,
      task: {
        id: planned.taskId,
        title: task.title,
        status,
        version: task.version,
      },
      result: projection,
      state,
    };
  });
  return { projectStatus: project.status, activities };
}
export type MissionReadinessSnapshot = NonNullable<
  ReturnType<typeof readMissionReadiness>
>;
