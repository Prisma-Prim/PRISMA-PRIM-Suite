import { expect, it } from 'vitest';
import { teamTasksQueryFixture } from './team-tasks.test-fixture';
import {
  readTask,
  readTaskOutcome,
  readTaskList,
  readTaskDetail,
  readAssignedTasks,
  readTaskHistory,
  type TaskOutcome,
} from './task-response';
import { readTeamTasks, defaultTeamTaskFilters } from './team-tasks-response';
import { readTaskPlanningReceipt } from './task-planning-response';

const f = teamTasksQueryFixture(),
  scope = { companyId: f.company.id, projectId: f.task.projectId };
const literal = 'Ș / Я / 😀\r\n  <b>literal</b>\rX\n  Y';
it('keeps strict current Tasks distinct from legacy immutable outcomes and complete recognized corrections', () => {
  const current = { ...f.task, description: literal };
  expect(readTask(current, scope).description).toBe(literal);
  const legacy: TaskOutcome = { ...f.task };
  delete legacy.description;
  expect(() => readTask(legacy, scope)).toThrow();
  expect(readTaskOutcome(legacy, scope)).not.toHaveProperty('description');
  const attempt = {
    path: '/planning',
    key: 'old-key',
    body: {
      tasks: [
        {
          taskId: current.id,
          expectedVersion: 1,
          assigneeMembershipId: current.assignee?.workspaceMembershipId ?? null,
          dueDate: current.dueDate,
        },
      ],
    },
  };
  expect(
    readTaskPlanningReceipt(
      {
        schema: 'task-planning/v1',
        projectId: current.projectId,
        tasks: [legacy],
      },
      scope,
      attempt,
    )[0],
  ).not.toHaveProperty('description');
  const initial = {
    title: current.title,
    assignee: current.assignee,
    dueDate: current.dueDate,
    priority: current.priority,
  };
  const base = {
    id: 'event',
    occurredAt: current.createdAt,
    actor: current.createdBy,
    target: {
      type: 'task',
      taskId: current.id,
      taskTitle: current.title,
      companyId: current.companyId,
    },
  };
  const events = [
    { ...base, action: 'task.created', metadata: { version: 1, initial } },
    {
      ...base,
      id: 'corrected',
      action: 'task.updated',
      metadata: {
        version: 2,
        changes: {
          title: { before: current.title, after: 'Corrected' },
          description: { before: literal, after: null },
        },
      },
    },
  ];
  expect(readTaskHistory({ events }, scope, current.id)).toEqual(events);
  for (const description of [
    undefined,
    '',
    ' leading',
    'trailing\r',
    '\0',
    '\ud800',
    '\udfff',
    '😀'.repeat(2001),
    4,
    [],
    {},
  ]) {
    const malformed = { ...current, description };
    for (const decode of [
      () => readTask(malformed, scope),
      () => readTaskOutcome(malformed, scope),
      () => readTaskList({ mutable: true, tasks: [malformed] }, scope),
      () =>
        readTaskDetail({ mutable: true, task: malformed }, scope, current.id),
      () =>
        readAssignedTasks(
          { tasks: [malformed] },
          {
            companyId: current.companyId,
            workspaceMembershipId:
              current.assignee?.workspaceMembershipId ?? '',
          },
        ),
      () =>
        readTeamTasks(
          { ...f.page, tasks: [malformed] },
          {
            companyId: current.companyId,
            offset: 0,
            filters: defaultTeamTaskFilters,
          },
        ),
      () =>
        readTaskPlanningReceipt(
          {
            schema: 'task-planning/v1',
            projectId: current.projectId,
            tasks: [malformed],
          },
          scope,
          attempt,
        ),
    ])
      expect(decode).toThrow();
    expect(() =>
      readTaskHistory(
        {
          events: [
            {
              ...base,
              action: 'task.created',
              metadata: { version: 1, initial: { ...initial, description } },
            },
          ],
        },
        scope,
        current.id,
      ),
    ).toThrow();
  }
  for (const description of [
    { before: null },
    { after: 'x' },
    { before: null, after: null },
    { before: null, after: 'x', unknown: 1 },
  ])
    expect(() =>
      readTaskHistory(
        {
          events: [
            {
              ...base,
              action: 'task.updated',
              metadata: { version: 2, changes: { description } },
            },
          ],
        },
        scope,
        current.id,
      ),
    ).toThrow();
});
