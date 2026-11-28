import { describe, expect, it } from 'vitest';
import type {
  AttentionTask,
  OverdueTask,
} from '../../operational-home/operational-home-response';
import type { UpcomingTask } from '../../operational-home/upcoming-deadlines-response';
import { todayDecisions, todayTasks } from './clarte-today.test-fixture';
import { workInOrder, workKey, type WorkLists } from './work-order';

const project = {
  id: todayTasks.auditPlan.projectId,
  title: 'Fictional ISO 22000 certification',
  clientDisplayName: 'Fictional Lumen Dairy SRL',
};
type FixtureTask = (typeof todayTasks)[keyof typeof todayTasks];
// Only identity and order matter here; the read parsers prove the rest.
const attention = (task: FixtureTask): AttentionTask => ({
  ...task,
  project,
  rules: ['overdue'],
  dueInDays: -3,
});
const overdue = (task: FixtureTask): OverdueTask => ({
  ...task,
  project,
  daysOverdue: 3,
});
const upcoming = (task: FixtureTask): UpcomingTask => ({ ...task, project });

describe('work in order', () => {
  it('lists decisions by queue, then attention, overdue and upcoming Tasks, each in its read order', () => {
    const lists: WorkLists = {
      contract: [todayDecisions.contract],
      offer: [todayDecisions.offer],
      profitability: [todayDecisions.profitability],
      upcoming: [upcoming(todayTasks.call), upcoming(todayTasks.stageOne)],
      overdue: [overdue(todayTasks.questionnaire)],
      attention: [attention(todayTasks.haccp), attention(todayTasks.auditPlan)],
    };
    expect(workInOrder(lists).map(workKey)).toEqual([
      `profitability:${todayDecisions.profitability.versionId}`,
      `offer:${todayDecisions.offer.versionId}`,
      `contract:${todayDecisions.contract.versionId}`,
      `task:${todayTasks.haccp.id}`,
      `task:${todayTasks.auditPlan.id}`,
      `task:${todayTasks.questionnaire.id}`,
      `task:${todayTasks.call.id}`,
      `task:${todayTasks.stageOne.id}`,
    ]);
  });

  it('keeps a Task listed by several reads once, where it first appears', () => {
    const items = workInOrder({
      attention: [attention(todayTasks.auditPlan)],
      overdue: [
        overdue(todayTasks.questionnaire),
        overdue(todayTasks.auditPlan),
      ],
      upcoming: [upcoming(todayTasks.auditPlan)],
    });
    expect(items.map((item) => [item.source, workKey(item)])).toEqual([
      ['attention', `task:${todayTasks.auditPlan.id}`],
      ['overdue', `task:${todayTasks.questionnaire.id}`],
    ]);
  });

  it('leaves out every list it was not given', () => {
    expect(workInOrder({})).toEqual([]);
    expect(
      workInOrder({ offer: [todayDecisions.offer] }).map((item) => item.source),
    ).toEqual(['decision']);
  });
});
