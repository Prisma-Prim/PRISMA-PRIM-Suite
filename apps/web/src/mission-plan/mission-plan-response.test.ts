import { expect, it } from 'vitest';
import {
  readVersion,
  catalogue,
  history,
  copiedPlan,
} from './mission-plan-response';
import { scope, source, cataloguePage } from './mission-plan.fixture';
it.each([
  null,
  {},
  { version: { ...source, companyId: 'foreign' } },
  { version: { ...source, activities: [] } },
  {
    version: {
      ...source,
      activities: [source.activities[0], source.activities[0]],
      activityCount: 2,
    },
  },
  { version: { ...source, activityCount: 51 } },
  { version: { ...source, publishedAt: '2026-02-30T10:00:00.000Z' } },
])(
  'refuses incomplete or foreign source before rendering any row: %j',
  (value) => {
    expect(() => readVersion(value, scope)).toThrow();
  },
);
it('keeps literal source text, order, exact Version identity and safe React text data', () => {
  expect(readVersion({ version: source }, scope)).toEqual(source);
});
it.each([
  { ...cataloguePage, nextCursor: 'x' },
  { items: [...cataloguePage.items, ...cataloguePage.items] },
  {
    items: [
      { ...cataloguePage.items[0], createdAt: '2026-02-30T12:00:00.000000Z' },
    ],
  },
  {
    items: [
      {
        ...cataloguePage.items[0],
        head: { ...source, planId: '50000000-0000-4000-8000-000000000999' },
      },
    ],
  },
])('rejects a malformed complete catalogue page %j', (value) =>
  expect(() => catalogue(value, scope)).toThrow(),
);
it.each([
  { headVersionNumber: 2, items: [source] },
  { headVersionNumber: 1, items: [source], nextBeforeVersion: '1' },
  { headVersionNumber: 1, items: [source, source] },
  { headVersionNumber: 1, items: [] },
])('rejects incomplete Version history %j', (value) =>
  expect(() => history(value, scope, source.planId)).toThrow(),
);
it('accepts an explicitly later-empty history page, without pretending the plan is absent', () => {
  expect(
    history({ headVersionNumber: 1, items: [] }, scope, source.planId, '1'),
  ).toMatchObject({ head: 1, items: [] });
});
it.each([
  { tasks: [] },
  {
    tasks: [
      {
        activityKey: source.activities[0]?.key,
        position: 1,
        taskId: '90000000-0000-4000-8000-000000000920',
      },
    ],
  },
  {
    tasks: [
      {
        activityKey: '70000000-0000-4000-8000-000000000999',
        position: 0,
        taskId: '90000000-0000-4000-8000-000000000920',
      },
    ],
  },
])('refuses a partial or retargeted Task mapping %j', ({ tasks }) =>
  expect(() =>
    copiedPlan(
      {
        plan: {
          projectId: '80000000-0000-4000-8000-000000000920',
          version: source,
          tasks,
        },
      },
      scope,
      '80000000-0000-4000-8000-000000000920',
    ),
  ).toThrow(),
);
