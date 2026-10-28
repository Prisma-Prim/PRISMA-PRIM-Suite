import { expect } from 'vitest';
import {
  objects,
  text,
  type PilotPlanFixture,
} from '../project-template/project-pilot-plan.test-support.js';

/** Public native setup shared by protocol and deterministic PostgreSQL cases. */
export async function preparePlanning(f: PilotPlanFixture, count = 3) {
  const project = await f.command('/projects', {
    title: 'Grouped planning DEMO',
    clientAccountId: f.clientId,
  });
  const projectId = text(project.id);
  const originals = [];
  for (let index = 0; index < count; index++)
    originals.push(
      await f.command(`/projects/${projectId}/tasks`, {
        title: `Activity ${index + 1} DEMO`,
      }),
    );
  const tasks = originals.map((task, index) => ({
    taskId: text(task.id),
    expectedVersion: 1,
    assigneeMembershipId: index === 0 ? f.membershipId : null,
    dueDate: index === 0 ? '2026-11-02' : '2026-11-09',
  }));
  const path = `/projects/${projectId}/tasks/planning`;
  return {
    projectId,
    originals,
    body: { tasks },
    path,
    plan: (options: Parameters<PilotPlanFixture['request']>[1] = {}) =>
      f.request(path, { method: 'POST', body: { tasks }, ...options }),
  };
}

export async function planningEffects(f: PilotPlanFixture) {
  return (
    await f.harness.pool.query<{ state: unknown }>(`SELECT jsonb_build_object(
    'tasks', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM tasks t),
    'history', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM task_events t),
    'activity', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM activity_log_events t),
    'commands', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM task_commands t),
    'clients', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM client_accounts t)
  ) state`)
  ).rows;
}

export async function eligiblePlanningColleague(f: PilotPlanFixture) {
  const subject = 'pilot-colleague';
  const member = text(
    (
      await f.read('/access/current-actor', {
        subject,
        companyId: '',
        workspaceId: f.workspaceId,
      })
    ).workspaceMembershipId,
  );
  for (const path of [
    '/company-context-assignments',
    '/company-director-client-assignments',
    '/company-project-assignments',
    '/company-task-manager-assignments',
  ])
    await f.grant(path, member);
  return { subject, member, workspaceId: f.workspaceId };
}

export async function assertOriginalPlanning(
  f: PilotPlanFixture,
  setup: Awaited<ReturnType<typeof preparePlanning>>,
) {
  for (const task of setup.originals) {
    expect((await f.read(`/tasks/${text(task.id)}`)).task).toEqual(task);
    expect(
      objects((await f.read(`/tasks/${text(task.id)}/history`)).events),
    ).toHaveLength(1);
  }
}
