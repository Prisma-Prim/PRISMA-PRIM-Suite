import type { ActorContext } from '../../access-types';
import { companyGrants } from '../../access/company-grants.test-fixture';
import type { TaskState, TaskView } from '../../project/task-response';

/**
 * A small stateful API over fictional records for the Clarté Tasks App tests
 * and browser journey (#1542): My, Unassigned, Blocked and Team Tasks, one
 * Project's Tasks with their history and commands, grouped planning, a Task
 * result with its exact PDF, and the Company's internal Tasks. Every other
 * request is answered 404 and reported as unhandled.
 */

const uuid = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export const tasksCompany = {
  id: uuid(1542),
  displayName: 'Fictional Quality Office',
};
const workspaceId = uuid(15420);
export const tasksMe = {
  internalUserId: uuid(15421),
  workspaceMembershipId: uuid(15422),
  displayName: 'Ada Ionescu',
};
export const tasksColleague = {
  internalUserId: uuid(15423),
  workspaceMembershipId: uuid(15424),
  displayName: 'Ion Rusu',
};
const meAssignee = {
  workspaceMembershipId: tasksMe.workspaceMembershipId,
  displayLabel: tasksMe.displayName,
};
const colleagueAssignee = {
  workspaceMembershipId: tasksColleague.workspaceMembershipId,
  displayLabel: tasksColleague.displayName,
};

/** The fictional tester: Task, Project, Client, result and internal-Task grants in one Company. */
export function tasksActor(): ActorContext {
  return {
    ...tasksMe,
    workspaceId,
    workspaceName: 'Fictional Workspace',
    email: 'ada@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...tasksCompany,
      grants: companyGrants(
        {
          bundle: 'company_director_client_access',
          version: 'v2',
          assignmentId: uuid(15431),
        },
        {
          bundle: 'company_internal_task_manager',
          version: 'v1',
          assignmentId: uuid(15432),
        },
        {
          bundle: 'company_task_manager',
          version: 'v1',
          assignmentId: uuid(15433),
        },
        {
          bundle: 'company_document_registrar',
          version: 'v3',
          assignmentId: uuid(15434),
        },
        {
          bundle: 'company_project_access',
          version: 'v2',
          assignmentId: uuid(15435),
        },
        {
          bundle: 'company_document_content_reader',
          version: 'v1',
          assignmentId: uuid(15436),
        },
        {
          bundle: 'company_task_result_recorder',
          version: 'v1',
          assignmentId: uuid(15437),
        },
        {
          bundle: 'company_mission_deliverable_access',
          version: 'v1',
          assignmentId: uuid(15438),
        },
      ),
    },
  };
}

export const tasksClients = {
  dairy: { id: uuid(15451), displayName: 'Fictional Lumen Dairy SRL' },
  metal: { id: uuid(15452), displayName: 'Fictional Nord Metal SA' },
};
export const tasksProjects = {
  dairy: {
    id: uuid(15461),
    title: 'Fictional ISO 22000 certification',
    client: tasksClients.dairy,
  },
  metal: {
    id: uuid(15462),
    title: 'Fictional ISO 9001 support',
    client: tasksClients.metal,
  },
};
type ProjectKey = keyof typeof tasksProjects;

/** A calendar date `days` from the browser's own day, as the views group them. */
export function tasksDay(days: number, now: Date = new Date()): string {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  day.setDate(day.getDate() + days);
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${day.getFullYear()}-${month}-${date}`;
}

type Seed = Readonly<{
  key: string;
  project: ProjectKey;
  title: string;
  assignee: 'me' | 'colleague' | null;
  due: number | null;
  priority?: 'normal' | 'important' | 'critical';
  status?: 'todo' | 'in_progress' | 'blocked';
  reason?: string;
}>;

/** The fictional Tasks, in the order the server returns them (due date, then creation). */
const seeds: readonly Seed[] = [
  {
    key: 'questionnaire',
    project: 'dairy',
    title: 'Review the supplier questionnaire',
    assignee: 'me',
    due: -2,
    priority: 'critical',
  },
  {
    key: 'records',
    project: 'metal',
    title: 'Collect the training records',
    assignee: 'colleague',
    due: -1,
    status: 'blocked',
    reason: 'Waiting for the signed attendance sheets',
  },
  {
    key: 'checklist',
    project: 'dairy',
    title: 'Prepare the stage 2 checklist',
    assignee: 'me',
    due: 0,
    status: 'in_progress',
  },
  {
    key: 'participants',
    project: 'dairy',
    title: 'List the HACCP training participants',
    assignee: null,
    due: 1,
  },
  {
    key: 'procedure',
    project: 'metal',
    title: 'Draft the document control procedure',
    assignee: 'me',
    due: 3,
    priority: 'important',
  },
  {
    key: 'minutes',
    project: 'dairy',
    title: 'Scan the signed stage 1 minutes',
    assignee: null,
    due: 5,
  },
  {
    key: 'calibration',
    project: 'dairy',
    title: 'Check the calibration certificates',
    assignee: 'me',
    due: 9,
  },
  {
    key: 'agenda',
    project: 'dairy',
    title: 'Send the audit agenda',
    assignee: 'colleague',
    due: 12,
  },
  {
    key: 'budget',
    project: 'metal',
    title: 'Estimate the 2027 surveillance budget',
    assignee: 'me',
    due: null,
  },
];

export const tasksTitles = Object.fromEntries(
  seeds.map((seed) => [seed.key, seed.title]),
);
export function tasksId(key: string): string {
  const index = seeds.findIndex((seed) => seed.key === key);
  if (index < 0) throw new Error(`Unknown fictional Task ${key}`);
  return uuid(15500 + index);
}

const createdAt = '2026-11-02T09:00:00.000Z';
const attribution = (who: typeof tasksMe) => ({
  internalUserId: who.internalUserId,
  workspaceMembershipId: who.workspaceMembershipId,
  displayName: who.displayName,
});

/** Results of the Clarté Tasks API: JSON, a PDF body, or nothing. */
export type TasksReply =
  { status: number; json: unknown } | { status: 200; pdf: string };
export type TasksRequest = Readonly<{
  method: string;
  url: URL;
  body: unknown;
}>;

type Event = Record<string, unknown>;
type StoredTask = { task: TaskView; events: Event[] };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a JSON object body.');
  return Object.fromEntries(Object.entries(value));
}

export const tasksResultReference = {
  documentId: uuid(15601),
  versionId: uuid(15602),
  versionNumber: 2,
  title: 'Fictional stage 1 audit report',
  status: 'official',
  representationId: uuid(15603),
};

export function createClarteTasksApi(now: Date = new Date()) {
  const unhandled = new Set<string>();
  const commands: Array<{ method: string; path: string; body: unknown }> = [];
  const tasks = new Map<string, StoredTask>();
  let clock = Date.parse('2026-11-20T08:00:00.000Z');
  const tick = () => {
    clock += 60_000;
    return new Date(clock).toISOString();
  };
  const assignee = (who: Seed['assignee']) =>
    who === 'me' ? meAssignee : who === 'colleague' ? colleagueAssignee : null;
  seeds.forEach((seed, index) => {
    const project = tasksProjects[seed.project];
    const base = {
      id: uuid(15500 + index),
      companyId: tasksCompany.id,
      projectId: project.id,
      clientAccountId: project.client.id,
      title: seed.title,
      description: null,
      assignee: assignee(seed.assignee),
      dueDate: seed.due === null ? null : tasksDay(seed.due, now),
      priority: seed.priority ?? 'normal',
      version: 1,
      createdAt,
      updatedAt: createdAt,
      createdBy: attribution(tasksMe),
    } as const;
    const task: TaskView =
      seed.status === 'blocked'
        ? {
            ...base,
            version: 2,
            status: 'blocked',
            completion: null,
            blockage: {
              reason: seed.reason ?? 'Blocked',
              actor: attribution(tasksColleague),
              occurredAt: '2026-11-18T10:00:00.000Z',
            },
          }
        : {
            ...base,
            status: seed.status ?? 'todo',
            completion: null,
          };
    const created = event(task, 'task.created', 1, createdAt, {
      initial: {
        title: base.title,
        description: null,
        assignee: base.assignee,
        dueDate: base.dueDate,
        priority: base.priority,
      },
    });
    tasks.set(task.id, {
      task,
      events:
        seed.status === 'blocked'
          ? [
              {
                ...event(
                  task,
                  'task.status.changed',
                  2,
                  '2026-11-18T10:00:00.000Z',
                  {
                    before: 'todo',
                    after: 'blocked',
                    reason: seed.reason,
                  },
                ),
                actor: attribution(tasksColleague),
              },
              created,
            ]
          : [created],
    });
  });

  function event(
    task: TaskView,
    action: string,
    version: number,
    occurredAt: string,
    metadata: Record<string, unknown>,
  ): Event {
    return {
      id: `${task.id}:${version}`,
      occurredAt,
      actor: attribution(tasksMe),
      target: {
        type: 'task',
        taskId: task.id,
        taskTitle: task.title,
        companyId: tasksCompany.id,
      },
      action,
      metadata: { version, ...metadata },
    };
  }
  const projectOf = (projectId: string) =>
    Object.values(tasksProjects).find((project) => project.id === projectId);
  const withProject = (task: TaskView) => {
    const project = projectOf(task.projectId);
    if (!project) throw new Error('Unknown fictional Project');
    return {
      ...task,
      project: {
        id: project.id,
        title: project.title,
        clientDisplayName: project.client.displayName,
      },
    };
  };
  // The server's order: due date with undated last, then creation.
  const all = () =>
    [...tasks.values()]
      .map((stored) => stored.task)
      .sort(
        (left, right) =>
          (left.dueDate ?? '9999-12-31').localeCompare(
            right.dueDate ?? '9999-12-31',
          ) || left.createdAt.localeCompare(right.createdAt),
      );
  const open = (task: TaskView) =>
    task.status === 'todo' ||
    task.status === 'in_progress' ||
    task.status === 'blocked';
  const page = (rows: TaskView[], offset: number) => ({
    companyId: tasksCompany.id,
    offset,
    pageSize: 25,
    hasNextPage: rows.length > offset + 25,
    tasks: rows.slice(offset, offset + 25).map(withProject),
  });

  // The declared result of the in-progress checklist Task.
  let result: {
    revision: number;
    current: Record<string, unknown> | null;
    history: Record<string, unknown>[];
  } = { revision: 0, current: null, history: [] };
  const resultTask = tasksId('checklist');

  // Internal Tasks of the Company.
  const internal: Record<string, unknown>[] = [];
  const internalHistory = new Map<string, Record<string, unknown>[]>();
  {
    const booking = internalTask(
      uuid(15701),
      'Renew the training room booking',
      'todo',
    );
    const created = internalTask(
      uuid(15702),
      'Update the 2027 price list',
      'todo',
    );
    const started = {
      ...created,
      version: 2,
      status: 'in_progress',
      updatedAt: '2026-11-03T09:00:00.000Z',
    };
    internal.push(booking, started);
    internalHistory.set(booking.id, [internalFact(booking, null, 'CREATE')]);
    internalHistory.set(started.id, [
      internalFact(started, created, 'MOVE'),
      internalFact(created, null, 'CREATE'),
    ]);
  }
  function internalTask(id: string, title: string, status: TaskState) {
    return {
      format: 'company-internal-task-v1',
      id,
      workspaceId,
      companyId: tasksCompany.id,
      version: 1,
      title,
      description: null,
      assignee: null,
      dueDate: tasksDay(7, now),
      priority: 'normal',
      status,
      createdByMembershipId: tasksMe.workspaceMembershipId,
      createdAt,
      updatedAt: createdAt,
      completion: null,
      reason: null,
    };
  }

  function move(
    stored: StoredTask,
    body: Record<string, unknown>,
    action: 'status' | 'complete' | 'cancel' | 'reopen',
  ): TasksReply {
    const { task } = stored;
    if (body.expectedVersion !== task.version)
      return { status: 409, json: { code: 'version_conflict' } };
    const at = tick();
    const version = task.version + 1;
    const common = { ...task, version, updatedAt: at };
    let next: TaskView;
    let metadata: Record<string, unknown>;
    let eventAction: string;
    const reason = typeof body.reason === 'string' ? body.reason : null;
    if (action === 'status' && body.status === 'blocked' && reason) {
      next = {
        ...common,
        status: 'blocked',
        completion: null,
        blockage: { reason, actor: attribution(tasksMe), occurredAt: at },
      };
      eventAction = 'task.status.changed';
      metadata = { before: task.status, after: 'blocked', reason };
    } else if (
      action === 'status' &&
      (body.status === 'todo' || body.status === 'in_progress')
    ) {
      next = { ...common, status: body.status, completion: null };
      eventAction = 'task.status.changed';
      metadata = { before: task.status, after: body.status, reason: null };
    } else if (action === 'complete') {
      next = {
        ...common,
        status: 'done',
        completion: { actor: attribution(tasksMe), occurredAt: at },
      };
      eventAction = 'task.completed';
      metadata = { before: task.status, after: 'done' };
    } else if (action === 'cancel' && reason) {
      next = {
        ...common,
        status: 'cancelled',
        completion: null,
        cancellation: { reason, actor: attribution(tasksMe), occurredAt: at },
      };
      eventAction = 'task.cancelled';
      metadata = { before: task.status, after: 'cancelled', reason };
    } else if (action === 'reopen') {
      next = { ...common, status: 'todo', completion: null };
      eventAction = 'task.reopened';
      metadata = { before: task.status, after: 'todo' };
    } else return { status: 400, json: { code: 'validation' } };
    stored.task = next;
    stored.events = [
      event(next, eventAction, version, at, metadata),
      ...stored.events,
    ];
    return { status: 200, json: next };
  }

  function reply({ method, url, body }: TasksRequest): TasksReply {
    const path = url.pathname.replace(/^\/api/u, '');
    const segments = path.split('/').filter(Boolean);
    if (method !== 'GET') commands.push({ method, path, body });
    if (method === 'GET' && path === '/access/current-actor')
      return { status: 200, json: tasksActor() };
    if (method === 'GET' && path === '/companies')
      return { status: 200, json: [tasksCompany] };
    if (method === 'GET' && path === '/activity-log')
      return { status: 200, json: { events: [] } };
    if (method === 'GET' && path === '/assigned-tasks')
      return {
        status: 200,
        json: {
          tasks: all()
            .filter(
              (task) =>
                open(task) &&
                task.assignee?.workspaceMembershipId ===
                  tasksMe.workspaceMembershipId,
            )
            .map(withProject),
        },
      };
    const offset = Number(url.searchParams.get('offset') ?? '0');
    if (method === 'GET' && path === '/unassigned-tasks')
      return {
        status: 200,
        json: page(
          all().filter((task) => open(task) && task.assignee === null),
          offset,
        ),
      };
    if (method === 'GET' && path === '/blocked-tasks')
      return {
        status: 200,
        json: page(
          all().filter((task) => task.status === 'blocked'),
          offset,
        ),
      };
    if (method === 'GET' && path === '/team-tasks') {
      const filters = {
        state: url.searchParams.get('state') ?? 'open',
        responsibility: url.searchParams.get('responsibility') ?? 'all',
        assigneeName: url.searchParams.get('assigneeName'),
        dueFrom: url.searchParams.get('dueFrom'),
        dueThrough: url.searchParams.get('dueThrough'),
      };
      const rows = all().filter(
        (task) =>
          (filters.state === 'all' ||
            (filters.state === 'open'
              ? open(task)
              : task.status === filters.state)) &&
          (filters.responsibility !== 'unassigned' || task.assignee === null) &&
          (filters.responsibility !== 'name' ||
            (task.assignee?.displayLabel ?? '')
              .toLowerCase()
              .includes((filters.assigneeName ?? '').toLowerCase())) &&
          (filters.dueFrom === null ||
            (task.dueDate !== null && task.dueDate >= filters.dueFrom)) &&
          (filters.dueThrough === null ||
            (task.dueDate !== null && task.dueDate <= filters.dueThrough)),
      );
      return {
        status: 200,
        json: { ...page(rows, offset), appliedFilters: filters },
      };
    }
    // One Project's Tasks, eligible members, creation and grouped planning.
    if (segments[0] === 'projects' && segments[1]) {
      const project = projectOf(segments[1]);
      if (!project) return notFound();
      const rest = segments.slice(2).join('/');
      if (method === 'GET' && rest === 'tasks')
        return {
          status: 200,
          json: {
            mutable: true,
            tasks: all().filter((task) => task.projectId === project.id),
          },
        };
      if (method === 'GET' && rest === 'eligible-task-assignees')
        return {
          status: 200,
          json: { members: [meAssignee, colleagueAssignee] },
        };
      if (method === 'POST' && rest === 'tasks') {
        const input = record(body);
        const at = tick();
        const id = uuid(15800 + tasks.size);
        const task: TaskView = {
          id,
          companyId: tasksCompany.id,
          projectId: project.id,
          clientAccountId: project.client.id,
          title: String(input.title),
          description:
            typeof input.description === 'string' ? input.description : null,
          assignee:
            input.assigneeMembershipId === tasksMe.workspaceMembershipId
              ? meAssignee
              : input.assigneeMembershipId ===
                  tasksColleague.workspaceMembershipId
                ? colleagueAssignee
                : null,
          dueDate: typeof input.dueDate === 'string' ? input.dueDate : null,
          priority:
            input.priority === 'important' || input.priority === 'critical'
              ? input.priority
              : 'normal',
          version: 1,
          createdAt: at,
          updatedAt: at,
          createdBy: attribution(tasksMe),
          status: 'todo',
          completion: null,
        };
        tasks.set(id, {
          task,
          events: [
            event(task, 'task.created', 1, at, {
              initial: {
                title: task.title,
                description: task.description,
                assignee: task.assignee,
                dueDate: task.dueDate,
                priority: task.priority,
              },
            }),
          ],
        });
        return { status: 201, json: task };
      }
      if (method === 'POST' && rest === 'tasks/planning') {
        const rows = record(body).tasks;
        if (!Array.isArray(rows)) return { status: 400, json: {} };
        const planned: TaskView[] = [];
        for (const value of rows) {
          const row = record(value);
          const stored = tasks.get(String(row.taskId));
          if (!stored || stored.task.version !== row.expectedVersion)
            return { status: 409, json: { code: 'version_conflict' } };
          const at = tick();
          const nextAssignee =
            row.assigneeMembershipId === tasksMe.workspaceMembershipId
              ? meAssignee
              : row.assigneeMembershipId ===
                  tasksColleague.workspaceMembershipId
                ? colleagueAssignee
                : null;
          const nextDue = typeof row.dueDate === 'string' ? row.dueDate : null;
          const changed =
            nextDue !== stored.task.dueDate ||
            nextAssignee?.workspaceMembershipId !==
              stored.task.assignee?.workspaceMembershipId;
          if (changed) {
            const version = stored.task.version + 1;
            const changes: Record<string, unknown> = {};
            if (nextDue !== stored.task.dueDate)
              changes.dueDate = { before: stored.task.dueDate, after: nextDue };
            if (
              nextAssignee?.workspaceMembershipId !==
              stored.task.assignee?.workspaceMembershipId
            )
              changes.assignee = {
                before: stored.task.assignee,
                after: nextAssignee,
              };
            stored.task = {
              ...stored.task,
              assignee: nextAssignee,
              dueDate: nextDue,
              version,
              updatedAt: at,
            };
            stored.events = [
              event(stored.task, 'task.updated', version, at, { changes }),
              ...stored.events,
            ];
          }
          planned.push(stored.task);
        }
        return {
          status: 200,
          json: {
            schema: 'task-planning/v1',
            projectId: project.id,
            tasks: planned,
          },
        };
      }
      return notFound();
    }
    // One Task: detail, history, edit, state moves and its result.
    if (segments[0] === 'tasks' && segments[1]) {
      const stored = tasks.get(segments[1]);
      if (!stored) return notFound();
      const rest = segments.slice(2).join('/');
      if (method === 'GET' && rest === '')
        return { status: 200, json: { mutable: true, task: stored.task } };
      if (method === 'GET' && rest === 'history')
        return { status: 200, json: { events: stored.events } };
      if (method === 'PATCH' && rest === '') {
        const input = record(body);
        if (input.expectedVersion !== stored.task.version)
          return { status: 409, json: { code: 'version_conflict' } };
        const at = tick();
        const version = stored.task.version + 1;
        const changes: Record<string, unknown> = {};
        const next = { ...stored.task, version, updatedAt: at };
        if (typeof input.title === 'string') {
          changes.title = { before: stored.task.title, after: input.title };
          next.title = input.title;
        }
        if ('dueDate' in input) {
          const due = typeof input.dueDate === 'string' ? input.dueDate : null;
          changes.dueDate = { before: stored.task.dueDate, after: due };
          next.dueDate = due;
        }
        if ('assigneeMembershipId' in input) {
          const nextAssignee =
            input.assigneeMembershipId === tasksMe.workspaceMembershipId
              ? meAssignee
              : input.assigneeMembershipId ===
                  tasksColleague.workspaceMembershipId
                ? colleagueAssignee
                : null;
          changes.assignee = {
            before: stored.task.assignee,
            after: nextAssignee,
          };
          next.assignee = nextAssignee;
        }
        if ('description' in input) {
          const description =
            typeof input.description === 'string' ? input.description : null;
          changes.description = {
            before: stored.task.description,
            after: description,
          };
          next.description = description;
        }
        if (
          input.priority === 'normal' ||
          input.priority === 'important' ||
          input.priority === 'critical'
        ) {
          changes.priority = {
            before: stored.task.priority,
            after: input.priority,
          };
          next.priority = input.priority;
        }
        stored.task = next;
        stored.events = [
          event(next, 'task.updated', version, at, { changes }),
          ...stored.events,
        ];
        return { status: 200, json: next };
      }
      if (
        method === 'POST' &&
        (rest === 'status' ||
          rest === 'complete' ||
          rest === 'cancel' ||
          rest === 'reopen')
      )
        return move(stored, record(body), rest);
      if (rest.startsWith('results'))
        return results(stored, method, rest, body);
      return notFound();
    }
    if (
      method === 'GET' &&
      path ===
        `/documents/${tasksResultReference.documentId}/versions/${tasksResultReference.versionId}/content/${tasksResultReference.representationId}`
    )
      return { status: 200, pdf: '%PDF-1.4 fictional stage 1 report' };
    // The Company's internal Tasks.
    if (path === '/company-internal-tasks/eligible-assignees')
      return {
        status: 200,
        json: {
          format: 'company-internal-task-assignees-v1',
          members: [
            {
              membershipId: tasksMe.workspaceMembershipId,
              displayLabel: tasksMe.displayName,
            },
          ],
          nextAfterMembershipId: null,
        },
      };
    if (path === '/company-internal-tasks' && method === 'GET') {
      const status = url.searchParams.get('status') ?? 'open';
      return {
        status: 200,
        json: {
          format: 'company-internal-task-page-v1',
          tasks: internal.filter(
            (task) =>
              status === 'all' ||
              (status === 'open'
                ? ['todo', 'in_progress', 'blocked'].includes(
                    String(task.status),
                  )
                : task.status === status),
          ),
          nextBeforeTaskId: null,
        },
      };
    }
    if (path === '/company-internal-tasks' && method === 'POST') {
      const input = record(body);
      const at = tick();
      const task = {
        ...internalTask(
          uuid(15710 + internal.length),
          String(input.title),
          'todo',
        ),
        description:
          typeof input.description === 'string' && input.description
            ? input.description
            : null,
        dueDate: typeof input.dueDate === 'string' ? input.dueDate : null,
        priority:
          input.priority === 'important' || input.priority === 'critical'
            ? input.priority
            : 'normal',
        createdAt: at,
        updatedAt: at,
      };
      internal.unshift(task);
      internalHistory.set(task.id, [internalFact(task, null, 'CREATE')]);
      return {
        status: 201,
        json: {
          format: 'company-internal-task-command-v1',
          task,
          changed: true,
          history: internalFact(task, null, 'CREATE'),
        },
      };
    }
    if (segments[0] === 'company-internal-tasks' && segments[1]) {
      const task = internal.find((item) => item.id === segments[1]);
      if (!task) return notFound();
      if (method === 'GET' && segments.length === 2)
        return {
          status: 200,
          json: {
            format: 'company-internal-task-detail-v1',
            task,
            history: internalHistory.get(String(task.id)) ?? [],
            nextBeforeVersion: null,
          },
        };
    }
    return notFound();

    function notFound(): TasksReply {
      unhandled.add(`${method} ${path}`);
      return { status: 404, json: { code: 'not_found' } };
    }
  }

  function internalFact(
    task: Record<string, unknown>,
    before: Record<string, unknown> | null,
    kind: 'CREATE' | 'EDIT' | 'MOVE',
  ) {
    return {
      format: 'company-internal-task-history-v1',
      workspaceId,
      companyId: tasksCompany.id,
      taskId: task.id,
      version: task.version,
      kind,
      actorMembershipId: tasksMe.workspaceMembershipId,
      recordedAt: task.updatedAt,
      before,
      after: task,
    };
  }

  function results(
    stored: StoredTask,
    method: string,
    rest: string,
    body: unknown,
  ): TasksReply {
    const taskId = stored.task.id;
    const mutable = taskId === resultTask;
    if (method === 'GET' && rest === 'results')
      return {
        status: 200,
        json: {
          taskId,
          projectId: stored.task.projectId,
          taskTitle: stored.task.title,
          taskVersion: stored.task.version,
          revision: mutable ? result.revision : 0,
          mutable,
          current: mutable ? result.current : null,
        },
      };
    if (method === 'GET' && rest === 'results/eligible-versions')
      return {
        status: 200,
        json: {
          taskId,
          mutable,
          versions: mutable ? [tasksResultReference] : [],
        },
      };
    if (method === 'GET' && rest === 'results/history')
      return {
        status: 200,
        json: {
          taskId,
          declarations: mutable ? result.history : [],
          hasMore: false,
          nextBeforeRevision: null,
        },
      };
    if (method === 'POST' && mutable) {
      const input = record(body);
      if (input.expectedResultRevision !== result.revision)
        return { status: 409, json: { code: 'result_conflict' } };
      const revision = result.revision + 1;
      const declaration = {
        id: uuid(15900 + revision),
        revision,
        declaration: String(input.declaration),
        actor: attribution(tasksMe),
        occurredAt: tick(),
        reference: tasksResultReference,
        ...(rest === 'results/corrections' && result.current
          ? {
              kind: 'corrected',
              predecessorId: result.current.id,
              reason: String(input.reason),
            }
          : { kind: 'recorded' }),
      };
      result = {
        revision,
        current: declaration,
        history: [declaration, ...result.history],
      };
      return {
        status: 201,
        json: {
          action: revision === 1 ? 'recorded' : 'corrected',
          taskId,
          resultId: declaration.id,
          resultRevision: revision,
        },
      };
    }
    return { status: 404, json: { code: 'not_found' } };
  }

  return {
    reply,
    unhandled,
    commands,
    task: (key: string) => tasks.get(tasksId(key))?.task,
  };
}
export type ClarteTasksApi = ReturnType<typeof createClarteTasksApi>;
