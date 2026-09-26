import type { CompanySummaryKind } from './operational-home-response';

type Context = { company: string; today: string };

export const operationalHomeCopy = {
  title: 'Company summary',
  note: ({ company, today }: Context) =>
    `Counted on ${today} from the records you can open in ${company}.`,
  refresh: 'Refresh Company summary',
  retry: 'Retry',
  loading: 'Loading the Company summary…',
  error: 'The Company summary could not be loaded. No counts are shown.',
  denied: 'The Company summary is not available with your current access.',
  summaries: {
    active_clients: {
      label: 'Active Clients',
      definition: ({ company }: Context) =>
        `Clients with an active relationship with ${company}`,
      destination: 'Open the Client directory',
    },
    open_projects: {
      label: 'Open Projects',
      definition: () => 'Projects you can open that are not closed',
      destination: 'Open the Project list',
    },
    overdue_tasks: {
      label: 'Overdue Tasks',
      definition: ({ today }: Context) =>
        `Open Tasks due before ${today} in Projects you can open`,
      destination: 'Show the overdue Tasks',
    },
  } satisfies Record<
    CompanySummaryKind,
    {
      label: string;
      definition: (context: Context) => string;
      destination: string;
    }
  >,
  /** The accessible name: label, count and destination. */
  cardName: ({
    label,
    count,
    destination,
  }: {
    label: string;
    count: string;
    destination: string;
  }) => `${label}: ${count}. ${destination}`,
  overdue: {
    title: ({ company }: Pick<Context, 'company'>) =>
      `Overdue Tasks in ${company}`,
    loading: 'Loading the overdue Tasks…',
    error: 'The overdue Tasks could not be loaded.',
    denied: 'The overdue Tasks are not available with your current access.',
    empty: ({ company }: Pick<Context, 'company'>) =>
      `No overdue Tasks in the Projects you can open in ${company}.`,
    truncated: ({ shown, total }: { shown: string; total: string }) =>
      `Showing the ${shown} oldest of ${total} overdue Tasks.`,
    listLabel: 'Overdue Tasks, oldest due date first',
    overdueBy: ({ days, count }: { days: number; count: string }) =>
      days === 1 ? `Overdue by ${count} day` : `Overdue by ${count} days`,
    state: 'State',
    dueDate: 'Due date',
    responsible: 'Responsible member',
    unassigned: 'Unassigned',
    project: 'Project',
    client: 'Client',
    open: 'Open',
    openTask: ({
      task,
      project,
      client,
    }: {
      task: string;
      project: string;
      client: string;
    }) => `Open ${task} in ${project} (${client})`,
    close: 'Close',
    closeName: 'Close the overdue Tasks',
    retry: 'Retry',
  },
  attention: {
    title: 'My attention',
    listLabel: 'Tasks that need your attention',
    empty: ({ company, today }: Context) =>
      `Nothing needs your attention in ${company} on ${today}.`,
    truncated: ({ shown, total }: { shown: number; total: number }) =>
      `Showing ${shown} of ${total} Tasks that need your attention.`,
    overdueBy: (days: number) =>
      days === 1 ? 'Overdue by 1 day' : `Overdue by ${days} days`,
    critical: 'Critical',
    blocked: 'Blocked',
    dueToday: 'Due today',
    dueIn: (days: number) =>
      days === 1 ? 'Due in 1 day' : `Due in ${days} days`,
    state: 'State',
    dueDate: 'Due date',
    noDate: 'No due date',
    project: 'Project',
    client: 'Client',
    open: 'Open',
    openTask: ({
      task,
      project,
      client,
    }: {
      task: string;
      project: string;
      client: string;
    }) => `Open ${task} in ${project} (${client})`,
    seeAll: 'See all in My Tasks',
  },
};
