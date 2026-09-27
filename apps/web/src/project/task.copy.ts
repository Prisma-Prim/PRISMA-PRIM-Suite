import type { TaskEvent, TaskPriority, TaskState } from './task-response';

export const taskCopy = {
  activityTarget: 'Task',
  activityActionLabels: {
    'task.created': 'created a Task',
    'task.updated': 'updated a Task',
    'task.status.changed': "changed a Task's status",
    'task.completed': 'declared a Task done',
    'task.cancelled': 'cancelled a Task',
    'task.reopened': 'reopened a Task',
  } satisfies Record<TaskEvent['action'], string>,
  title: 'Tasks',
  warning:
    'Manual preparation Tasks. Each state records a declaration; it does not approve execution or satisfy a business gate.',
  loading: 'Loading Tasks…',
  error: 'Tasks could not be loaded. Reload to try again.',
  denied: 'Task, Project and Client read access are required for this Company.',
  missing:
    'This Task could not be found. Reload the Task or choose another Task from the list.',
  empty: 'No manual Tasks for this Project yet.',
  searchLabel: 'Search Tasks',
  statusFilterLabel: 'Task status',
  assigneeFilterLabel: 'Task responsible member',
  dateFilterLabel: 'Task date filter',
  allDates: 'All dates',
  withoutDate: 'Without a date',
  dateRange: 'Date range',
  dateFrom: 'Task date from',
  dateThrough: 'Task date through',
  dateRangeInvalid:
    'Enter calendar dates with the from date on or before the through date. No date filter is applied until then.',
  resetDateFilter: 'Reset date filter',
  all: 'All',
  noMatch: 'No Tasks match the current filters.',
  immutable:
    'Read-only: the original Client has been superseded. Task history remains available.',
  closedReadOnly:
    'Read-only: this Project is closed. Task history remains available.',
  reload: 'Reload Tasks',
  reloadDetail: 'Reload Task',
  create: 'Create Task',
  newTask: 'New Task',
  list: 'Back to Task list',
  titleLabel: 'Task title',
  assignee: 'Responsible member',
  dueDate: 'Due date',
  noDate: 'No due date',
  priority: 'Priority',
  priorities: {
    normal: 'Normal',
    important: 'Important',
    critical: 'Critical',
  } satisfies Record<TaskPriority, string>,
  priorityChange: ({ before, after }: { before: string; after: string }) =>
    `${before} → ${after}`,
  unassigned: 'Unassigned',
  noMembers:
    'No eligible responsible members. You can leave the Task unassigned.',
  memberUnavailable:
    'Current responsible member is no longer eligible. Choose another member or leave unassigned.',
  membersError:
    'Responsible members could not be loaded. Reload before changing the Task.',
  save: 'Save Task',
  states: {
    todo: 'To do',
    in_progress: 'In progress',
    blocked: 'Blocked',
    done: 'Done',
    cancelled: 'Cancelled',
  } satisfies Record<TaskState, string>,
  moves: {
    todo: 'Mark to do',
    in_progress: 'Mark in progress',
    blocked: 'Mark blocked',
    done: 'Mark done',
    cancelled: 'Cancel Task',
    reopen: 'Reopen Task',
  } satisfies Record<TaskState | 'reopen', string>,
  actions: 'Task actions',
  blockageReason: 'Blockage reason',
  cancellationReason: 'Cancellation reason',
  saveBlockage: 'Save blockage',
  saveCancellation: 'Save cancellation',
  keepState: 'Keep current state',
  reasonValidation: 'Enter a reason of 1–500 characters.',
  reason: 'Reason',
  blockedBy: 'Blocked by',
  cancelledBy: 'Cancelled by',
  history: 'Task history',
  createdBy: 'Created by',
  completion: 'Completion declared by',
  at: 'on',
  version: 'Version',
  validation:
    'Enter a title of 1–200 characters and a valid due date, or leave the date empty.',
  conflict:
    'This Task or its permissions changed. Reload the Task before making another change.',
  closedRefusal: 'This Project was closed. Reload to see its current state.',
  rejected:
    'The change was rejected. Reload the Task and check its fields and responsible member.',
  uncertain:
    'The result is not confirmed. Retry the same change to safely recover its recorded result.',
  retry: 'Retry pending Task change',
  confirmed: 'Task change recorded.',
  created: 'Task created',
  updated: 'Task edited',
  statusChanged: 'Status changed',
  completed: 'Completion declared',
  cancelled: 'Task cancelled',
  reopened: 'Task reopened',
  status: 'Status',
  before: 'Before',
  after: 'After',
  myTasks: {
    title: 'My Tasks',
    note: 'Read-only. Edit or complete a Task in its Project.',
    listLabel: 'Open Tasks assigned to you',
    refresh: 'Refresh My Tasks',
    loading: 'Loading your open Tasks…',
    empty: 'No open Tasks assigned to you',
    denied:
      'Your open Tasks need Task, Project and Client read access in this Company.',
    error: 'Your open Tasks could not be loaded.',
    retry: 'Retry',
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
  },
};
