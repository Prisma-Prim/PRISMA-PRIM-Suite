import { readTask } from '../project/task-response';
import { readTaskResultDeclaration } from '../project/task-results-response';
import { copiedPlan, object, type Scope } from './mission-plan-response';
import { uuid } from './mission-plan-authority';
import { PROJECT_STATUSES } from '../project/project-lifecycle-response';

function rows(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid current-work rows.');
  return value;
}
function exact(value: unknown, keys: string[]) {
  const row = object(value);
  if (
    Object.keys(row).length !== keys.length ||
    Object.keys(row).some((k) => !keys.includes(k))
  )
    throw new Error('Invalid current-work wrapper.');
  return row;
}
function result(value: unknown) {
  const row = object(value);
  if (row.kind === 'unavailable') {
    exact(row, ['kind']);
    return { kind: 'unavailable' } satisfies { kind: 'unavailable' };
  }
  if (row.kind !== 'available') throw new Error('Invalid current result.');
  exact(row, ['kind', 'current']);
  const current =
    row.current === null ? null : readTaskResultDeclaration(row.current);
  if (
    current &&
    ![
      current.id,
      current.actor.internalUserId,
      current.actor.workspaceMembershipId,
      current.reference.documentId,
      current.reference.versionId,
      current.reference.representationId,
      ...(current.kind === 'corrected' ? [current.predecessorId] : []),
    ].every(uuid)
  )
    throw new Error('Invalid current result identities.');
  return { kind: 'available', current } satisfies {
    kind: 'available';
    current: typeof current;
  };
}
/** Validate the entire consumed response before publishing any count, row or continuation. */
export function readCurrentWork(
  value: unknown,
  expected: Scope & { projectId: string; clientAccountId: string },
) {
  const raw = exact(value, ['overview']).overview;
  if (raw === null) return null;
  const overview = exact(raw, [
    'workspaceId',
    'companyId',
    'project',
    'plan',
    'activities',
  ]);
  const project = exact(overview.project, ['id', 'clientAccountId', 'status']);
  if (
    overview.workspaceId !== expected.workspaceId ||
    overview.companyId !== expected.companyId ||
    project.id !== expected.projectId ||
    project.clientAccountId !== expected.clientAccountId ||
    !PROJECT_STATUSES.some((status) => status === project.status)
  )
    throw new Error('Invalid current-work context.');
  const plan = copiedPlan(
    { plan: overview.plan },
    expected,
    expected.projectId,
  );
  if (!plan) throw new Error('Missing current-work source.');
  const activities = rows(overview.activities).map((value, position) => {
    const row = exact(value, ['activityKey', 'position', 'task', 'result']);
    const mapping = plan.tasks[position];
    const source = plan.version.activities[position];
    const task = readTask(row.task, {
      companyId: expected.companyId,
      projectId: expected.projectId,
    });
    if (
      !mapping ||
      !source ||
      row.position !== position ||
      row.activityKey !== mapping.activityKey ||
      task.id !== mapping.taskId ||
      task.clientAccountId !== expected.clientAccountId ||
      ![
        task.id,
        task.clientAccountId,
        task.createdBy.internalUserId,
        task.createdBy.workspaceMembershipId,
        ...(task.assignee ? [task.assignee.workspaceMembershipId] : []),
      ].every(uuid)
    )
      throw new Error('Invalid current-work Task binding.');
    return {
      activityKey: mapping.activityKey,
      position,
      source,
      task,
      result: result(row.result),
    };
  });
  const resultIds = activities.flatMap((row) =>
    row.result.kind === 'available' && row.result.current
      ? [row.result.current.id]
      : [],
  );
  if (
    activities.length !== plan.tasks.length ||
    new Set(resultIds).size !== resultIds.length
  )
    throw new Error('Incomplete current-work response.');
  return { plan, activities };
}
export type CurrentWork = NonNullable<ReturnType<typeof readCurrentWork>>;
