import { expect, it } from 'vitest';
import { teamTasksQueryFixture } from './team-tasks.test-fixture';
import {
  readTask,
  readTaskList,
  readTaskDetail,
  readAssignedTasks,
  readTaskHistory,
} from './task-response';
import { readTeamTasks, defaultTeamTaskFilters } from './team-tasks-response';
import { readTaskPlanningReceipt } from './task-planning-response';

const f = teamTasksQueryFixture(),
  scope = { companyId: f.company.id, projectId: f.task.projectId };
const literal = 'Ș / Я / 😀\r\n  <b>literal</b>\rX\n  Y';
const current = { ...f.task, description: literal };
const attempt = {
  path: '/planning',
  key: 'planning-key',
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
const initial = {
  title: current.title,
  description: literal,
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
/** The same response without the given keys, as an earlier application sent it. */
function without(value: object, keys: readonly string[]) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
}
function receipt(tasks: unknown[]) {
  return { schema: 'task-planning/v1', projectId: current.projectId, tasks };
}

it('reads current Tasks, receipts and history with their descriptions and complete recognized corrections', () => {
  expect(readTask(current, scope).description).toBe(literal);
  expect(readTaskPlanningReceipt(receipt([current]), scope, attempt)).toEqual([
    readTask(current, scope),
  ]);
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
});

it.each([
  ['description', ['description']],
  ['priority', ['priority']],
  ['priority and description', ['priority', 'description']],
])('refuses a Task, a receipt and a creation without %s', (_name, keys) => {
  expect(() => readTask(without(current, keys), scope)).toThrow();
  expect(() =>
    readTaskPlanningReceipt(receipt([without(current, keys)]), scope, attempt),
  ).toThrow();
  expect(() =>
    readTaskHistory(
      {
        events: [
          {
            ...base,
            action: 'task.created',
            metadata: { version: 1, initial: without(initial, keys) },
          },
        ],
      },
      scope,
      current.id,
    ),
  ).toThrow();
});

it('refuses malformed descriptions and incomplete or unknown corrections', () => {
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
      () => readTaskPlanningReceipt(receipt([malformed]), scope, attempt),
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
