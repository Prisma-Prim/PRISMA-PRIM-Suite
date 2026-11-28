import type { ContractDecisionQueueItem } from '../../contract/contract-decision-queue-response';
import type { OfferDecisionQueueItem } from '../../offer/offer-decision-queue-response';
import type {
  AttentionTask,
  OverdueTask,
} from '../../operational-home/operational-home-response';
import type { UpcomingTask } from '../../operational-home/upcoming-deadlines-response';
import type { DecisionQueueItem } from '../../profitability-estimate/profitability-decision-queue-response';

/** The decision queues of Today, in their fixed order. */
export const decisionQueues = ['profitability', 'offer', 'contract'] as const;
export type DecisionQueueKind = (typeof decisionQueues)[number];

/** One decision as its queue listed it, opened in that queue's existing review. */
export type DecisionWork =
  | { queue: 'profitability'; item: DecisionQueueItem }
  | { queue: 'offer'; item: OfferDecisionQueueItem }
  | { queue: 'contract'; item: ContractDecisionQueueItem };

/** One item of work in order, with the list it came from. */
export type WorkItem =
  | ({ source: 'decision' } & DecisionWork)
  | { source: 'attention'; task: AttentionTask }
  | { source: 'overdue'; task: OverdueTask }
  | { source: 'upcoming'; task: UpcomingTask };
export type WorkSource = WorkItem['source'];

/** The groups of work in order, in their fixed order. */
export const workSources = [
  'decision',
  'attention',
  'overdue',
  'upcoming',
] as const satisfies readonly WorkSource[];

/**
 * The server-provided lists work in order presents. A list is absent when
 * the actor cannot read it, when it is not loaded, or when its items cannot
 * be opened from Today.
 */
export type WorkLists = Readonly<{
  profitability?: readonly DecisionQueueItem[];
  offer?: readonly OfferDecisionQueueItem[];
  contract?: readonly ContractDecisionQueueItem[];
  attention?: readonly AttentionTask[];
  overdue?: readonly OverdueTask[];
  upcoming?: readonly UpcomingTask[];
}>;

/** A stable identity for one item across rereads of its list. */
export function workKey(item: WorkItem): string {
  return item.source === 'decision'
    ? `${item.queue}:${item.item.versionId}`
    : `task:${item.task.id}`;
}

/**
 * Work in order (#1532): the decisions awaiting the actor (Profitability
 * Estimates, then Offers, then Contracts), then the Tasks needing the
 * actor's attention, then the Company's overdue Tasks, then the actor's
 * upcoming deadlines. Each list keeps the order its server read returned.
 * A Task listed by several reads appears once, where it first appears. This
 * is a presentation of the lists, never a priority rule of its own.
 */
export function workInOrder(lists: WorkLists): WorkItem[] {
  const decisions: WorkItem[] = [
    ...(lists.profitability ?? []).map((item): WorkItem => ({
      source: 'decision',
      queue: 'profitability',
      item,
    })),
    ...(lists.offer ?? []).map((item): WorkItem => ({
      source: 'decision',
      queue: 'offer',
      item,
    })),
    ...(lists.contract ?? []).map((item): WorkItem => ({
      source: 'decision',
      queue: 'contract',
      item,
    })),
  ];
  const tasks: WorkItem[] = [
    ...(lists.attention ?? []).map((task): WorkItem => ({
      source: 'attention',
      task,
    })),
    ...(lists.overdue ?? []).map((task): WorkItem => ({
      source: 'overdue',
      task,
    })),
    ...(lists.upcoming ?? []).map((task): WorkItem => ({
      source: 'upcoming',
      task,
    })),
  ];
  const seen = new Set<string>();
  return [...decisions, ...tasks].filter((item) => {
    const key = workKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
