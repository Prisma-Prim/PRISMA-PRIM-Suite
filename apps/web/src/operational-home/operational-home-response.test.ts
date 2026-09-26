import { describe, expect, it } from 'vitest';
import { readOperationalHome } from './operational-home-response';

const companyId = 'company-a';
const today = '2026-09-27';
const attribution = {
  internalUserId: 'ana',
  workspaceMembershipId: 'membership-ana',
  displayName: 'Ana',
};
const project = {
  id: 'project-iso',
  title: 'ISO 9001 — GRUP Demo SA',
  clientDisplayName: 'GRUP Demo SA',
};
const task = {
  id: 'task-collect',
  companyId,
  projectId: project.id,
  clientAccountId: 'client-grup',
  title: 'Collect procedures',
  assignee: {
    workspaceMembershipId: 'membership-ana',
    displayLabel: 'Ana · 1',
  },
  dueDate: '2026-09-20',
  priority: 'critical',
  status: 'todo',
  completion: null,
  version: 1,
  createdAt: '2026-09-19T09:00:00.000Z',
  updatedAt: '2026-09-19T09:00:00.000Z',
  createdBy: attribution,
  project,
  rules: ['overdue', 'critical'],
  dueInDays: -7,
};

function response(attention: unknown) {
  return {
    companyId,
    today,
    summaries: [{ kind: 'overdue_tasks', count: 1 }],
    attention,
  };
}

describe('operational home attention response', () => {
  it('accepts the bounded Task queue with its ordered rules and signed day distance', () => {
    expect(
      readOperationalHome(response({ matchingCount: 1, tasks: [task] }), {
        companyId,
        workspaceMembershipId: attribution.workspaceMembershipId,
      }),
    ).toEqual({
      companyId,
      today,
      summaries: [{ kind: 'overdue_tasks', count: 1 }],
      attention: { matchingCount: 1, tasks: [task] },
    });
  });

  it.each([
    [
      'another member',
      [
        {
          ...task,
          assignee: {
            ...task.assignee,
            workspaceMembershipId: 'membership-other',
          },
        },
      ],
      1,
    ],
    ['an unassigned Task', [{ ...task, assignee: null }], 1],
    ['an unknown rule', [{ ...task, rules: ['urgent'] }], 1],
    ['unordered rules', [{ ...task, rules: ['critical', 'overdue'] }], 1],
    ['an empty rule list', [{ ...task, rules: [] }], 1],
    [
      'a normal undated Task with no attention rule',
      [
        {
          ...task,
          dueDate: null,
          priority: 'normal',
          rules: [],
          dueInDays: null,
        },
      ],
      1,
    ],
    [
      'a normal Task due after the attention window with no attention rule',
      [
        {
          ...task,
          dueDate: '2026-10-05',
          priority: 'normal',
          rules: [],
          dueInDays: 8,
        },
      ],
      1,
    ],
    ['an inconsistent overdue day count', [{ ...task, dueInDays: -6 }], 1],
    [
      'an inconsistent due-soon date',
      [
        {
          ...task,
          dueDate: '2026-10-05',
          rules: ['due_soon'],
          dueInDays: 8,
        },
      ],
      1,
    ],
    ['more rows than the total', [task], 0],
    [
      'more than ten rows',
      Array.from({ length: 11 }, (_, index) => ({
        ...task,
        id: `task-${index}`,
      })),
      11,
    ],
  ])('fails closed on %s', (_case, tasks, matchingCount) => {
    expect(() =>
      readOperationalHome(response({ matchingCount, tasks }), {
        companyId,
        workspaceMembershipId: attribution.workspaceMembershipId,
      }),
    ).toThrow();
  });
});
