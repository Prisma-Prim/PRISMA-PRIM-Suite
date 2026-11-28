import type { ActorContext } from '../../access-types';
import { companyGrants } from '../../access/company-grants.test-fixture';
import { pilotSourceFixture } from '../../project/project-pilot-plan.test-fixtures';
import { templateFixture } from '../../project/project-template.test-fixtures';

/**
 * A small stateful Projects API over fictional records, shared by the Clarté
 * Missions App tests and browser journey (#1540). It answers what the Project
 * list, creation, lifecycle, owner, next action and plan read and write; every
 * other request is reported as unhandled and answered 404.
 */

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const missionsCompany = {
  id: id(1540),
  displayName: 'PRISMA-PRIM',
};
export const missionsWorkspaceId = id(1541);
export const missionsClients = [
  { id: id(1601), displayName: 'Fictional Lumen Dairy SRL' },
  { id: id(1602), displayName: 'Fictional Valea Verde SA' },
] as const;
const [lumen, valea] = missionsClients;
export const missionsMembers = [
  { workspaceMembershipId: id(1701), displayLabel: 'Ana Rusu · Director' },
  { workspaceMembershipId: id(1702), displayLabel: 'Ion Ceban · Consultant' },
] as const;
const [ana, ion] = missionsMembers;
const me = {
  internalUserId: id(1801),
  workspaceMembershipId: ana.workspaceMembershipId,
  displayName: 'Ana Rusu',
};

/** The illustrative Project Template the application accepts, as published. */
export const missionsTemplate = templateFixture;
export const missionsPlan = {
  workspaceId: missionsWorkspaceId,
  companyId: missionsCompany.id,
  id: id(1901),
  planId: id(1900),
  versionNumber: 2,
  title: 'Fictional ISO 14001 implementation plan',
  activityCount: 2,
  publishedAt: '2026-11-02T09:00:00.000Z',
  actor: { membershipId: ana.workspaceMembershipId, displayName: 'Ana Rusu' },
  activities: [
    {
      key: id(1911),
      title: 'Environmental review',
      activity: 'Review the site’s environmental aspects with the Client.',
      intendedResult: 'Register of environmental aspects',
    },
    {
      key: id(1912),
      title: 'Legal requirements',
      activity: 'List the applicable legal requirements.',
      intendedResult: 'Compliance register',
    },
  ],
};

export const missionsSeededProjects = {
  certification: id(2001),
  diagnosis: id(2002),
  closed: id(2003),
} as const;
/** The id the fixture gives the n-th Project created through it, from 1. */
export function createdProjectId(sequence: number): string {
  return id(2100 + sequence);
}

/** The Request whose Contract the certification Project is linked to. */
export const missionsContractRequestId = id(2201);

export function missionsActor(
  options: Readonly<{
    approver?: boolean;
    nextAction?: boolean;
    /** Commercial intake and Contract read, to follow a Project's Contracts. */
    contracts?: boolean;
  }> = {},
): ActorContext {
  return {
    internalUserId: me.internalUserId,
    workspaceMembershipId: me.workspaceMembershipId,
    workspaceId: missionsWorkspaceId,
    workspaceName: 'Fictional workspace',
    displayName: me.displayName,
    email: 'ana.rusu@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...missionsCompany,
      grants: companyGrants(
        {
          bundle: 'company_director_client_access',
          version: 'v1',
          assignmentId: id(1501),
        },
        {
          bundle: 'company_project_access',
          version: 'v2',
          assignmentId: id(1502),
        },
        {
          bundle: 'company_task_manager',
          version: 'v1',
          assignmentId: id(1503),
        },
        {
          bundle: 'company_project_template_user',
          version: 'v1',
          assignmentId: id(1504),
        },
        {
          bundle: 'company_mission_plan_user',
          version: 'v1',
          assignmentId: id(1505),
        },
        ...(options.approver === false
          ? []
          : [
              {
                bundle: 'company_project_approver',
                version: 'v1',
                assignmentId: id(1506),
              } as const,
            ]),
        ...(options.nextAction === false
          ? []
          : [
              {
                bundle: 'company_project_next_action_coordinator',
                version: 'v1',
                assignmentId: id(1507),
              } as const,
            ]),
        ...(options.contracts
          ? [
              {
                bundle: 'company_commercial_intake',
                version: 'v1',
                assignmentId: id(1508),
              } as const,
              {
                bundle: 'company_contract_preparer',
                version: 'v1',
                assignmentId: id(1509),
              } as const,
            ]
          : []),
      ),
    },
  };
}

export type FakeRequest = Readonly<{
  method: string;
  url: URL;
  /** The parsed JSON body, when the request sent one. */
  body: unknown;
}>;
export type FakeReply = Readonly<{ status: number; json?: unknown }>;

type Status = 'preparatory' | 'active' | 'on_hold' | 'completed' | 'cancelled';
type Member = { workspaceMembershipId: string; displayLabel: string };
type Transition = Record<string, unknown> & { lifecycleRevision: number };
type NextActionFact = {
  revision: number;
  predecessorRevision: number;
  before: string | null;
  after: string | null;
  attribution: Attribution;
};
type Attribution = {
  internalUserId: string;
  workspaceMembershipId: string;
  displayName: string;
  occurredAt: string;
};
type StoredProject = {
  row: {
    id: string;
    companyId: string;
    clientAccountId: string;
    clientDossierId: string;
    clientDisplayName: string;
    title: string;
    status: Status;
    createdAt: string;
  };
  lifecycleRevision: number;
  start: Record<string, unknown> | null;
  transitions: Transition[];
  responsible: Member | null;
  responsibleRevision: number;
  responsibleChange: { actorDisplayName: string; occurredAt: string } | null;
  nextAction: NextActionFact[];
  template: 'illustrative' | 'pilot' | null;
  missionPlan: boolean;
  tasks: Array<Record<string, unknown>>;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a JSON object body');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a text field');
  return value;
}
function count(value: unknown): number {
  if (typeof value !== 'number') throw new Error('Expected a revision');
  return value;
}

/** A fixed clock: each write happens one minute after the previous one. */
function clock() {
  let minute = 0;
  return () => {
    minute += 1;
    return new Date(Date.UTC(2026, 10, 28, 9, minute)).toISOString();
  };
}

export function createClarteMissionsApi(
  options: Readonly<{
    actor?: ActorContext;
    /** A status that replaces the Project list read, such as 403 or 500. */
    listStatus?: number;
    projects?: 'seeded' | 'none';
  }> = {},
) {
  const actor = options.actor ?? missionsActor();
  const now = clock();
  const writes: string[] = [];
  const unhandled = new Set<string>();
  let created = 0;
  let tasks = 0;
  const attribution = (): Attribution => ({
    internalUserId: me.internalUserId,
    workspaceMembershipId: me.workspaceMembershipId,
    displayName: me.displayName,
    occurredAt: now(),
  });
  function task(project: StoredProject['row'], title: string) {
    tasks += 1;
    return {
      id: id(3000 + tasks),
      companyId: project.companyId,
      projectId: project.id,
      clientAccountId: project.clientAccountId,
      title,
      description: null,
      assignee: null,
      dueDate: null,
      priority: 'normal',
      status: 'todo',
      completion: null,
      version: 1,
      createdAt: project.createdAt,
      updatedAt: project.createdAt,
      createdBy: {
        internalUserId: me.internalUserId,
        workspaceMembershipId: me.workspaceMembershipId,
        displayName: me.displayName,
      },
    };
  }
  function store(
    row: Omit<StoredProject['row'], 'companyId' | 'clientDossierId'>,
    extra: Partial<StoredProject> = {},
  ): StoredProject {
    const full = {
      ...row,
      companyId: missionsCompany.id,
      clientDossierId: row.clientAccountId,
    };
    const stored: StoredProject = {
      row: full,
      lifecycleRevision: 0,
      start: null,
      transitions: [],
      responsible: null,
      responsibleRevision: 0,
      responsibleChange: null,
      nextAction: [],
      template: null,
      missionPlan: false,
      tasks: [],
      ...extra,
    };
    if (stored.template === 'illustrative')
      stored.tasks = missionsTemplate.stages.flatMap((stage) =>
        stage.tasks.map((entry) => task(full, entry.title)),
      );
    if (stored.template === 'pilot')
      stored.tasks = pilotSourceFixture.activities.map((activity) =>
        task(full, activity.title),
      );
    if (stored.missionPlan)
      stored.tasks = missionsPlan.activities.map((activity) =>
        task(full, activity.title),
      );
    return stored;
  }
  const declaration = {
    approvedOffer: 'present',
    contractOrPrecontract: 'present',
    projectPlan: 'present',
    initialDocuments: 'present',
    deadlines: 'present',
    financialConditions: 'present',
    risks: 'present',
  };
  const projects: StoredProject[] =
    options.projects === 'none'
      ? []
      : [
          store(
            {
              id: missionsSeededProjects.certification,
              clientAccountId: lumen.id,
              clientDisplayName: lumen.displayName,
              title: 'Fictional ISO 9001 certification support',
              status: 'active',
              createdAt: '2026-11-10T08:00:00.000Z',
            },
            {
              lifecycleRevision: 1,
              start: {
                declaredAt: '2026-11-12T08:00:00.000Z',
                declaredBy: { displayName: 'Ana Rusu' },
                declaration,
                exception: null,
              },
              transitions: [
                {
                  action: 'activate',
                  lifecycleRevision: 1,
                  from: 'preparatory',
                  to: 'active',
                  occurredAt: '2026-11-12T08:00:00.000Z',
                  actor: { displayName: 'Ana Rusu' },
                  withStartException: false,
                },
              ],
              responsible: ana,
              responsibleRevision: 1,
              responsibleChange: {
                actorDisplayName: 'Ana Rusu',
                occurredAt: '2026-11-11T08:00:00.000Z',
              },
              nextAction: [
                {
                  revision: 1,
                  predecessorRevision: 0,
                  before: null,
                  after: 'Confirm the stage 1 audit dates with the Client',
                  attribution: {
                    internalUserId: me.internalUserId,
                    workspaceMembershipId: me.workspaceMembershipId,
                    displayName: me.displayName,
                    occurredAt: '2026-11-20T08:00:00.000Z',
                  },
                },
              ],
              template: 'pilot',
            },
          ),
          store({
            id: missionsSeededProjects.diagnosis,
            clientAccountId: valea.id,
            clientDisplayName: valea.displayName,
            title: 'Fictional HACCP preparatory diagnosis',
            status: 'preparatory',
            createdAt: '2026-11-18T08:00:00.000Z',
          }),
          store(
            {
              id: missionsSeededProjects.closed,
              clientAccountId: lumen.id,
              clientDisplayName: lumen.displayName,
              title: 'Fictional ISO 45001 follow-up',
              status: 'completed',
              createdAt: '2026-09-01T08:00:00.000Z',
            },
            {
              lifecycleRevision: 2,
              start: {
                declaredAt: '2026-09-02T08:00:00.000Z',
                declaredBy: { displayName: 'Ana Rusu' },
                declaration,
                exception: null,
              },
              transitions: [
                {
                  action: 'complete',
                  lifecycleRevision: 2,
                  from: 'active',
                  to: 'completed',
                  occurredAt: '2026-10-30T08:00:00.000Z',
                  actor: { displayName: 'Ana Rusu' },
                  note: 'Fictional follow-up delivered.',
                },
                {
                  action: 'activate',
                  lifecycleRevision: 1,
                  from: 'preparatory',
                  to: 'active',
                  occurredAt: '2026-09-02T08:00:00.000Z',
                  actor: { displayName: 'Ana Rusu' },
                  withStartException: false,
                },
              ],
              responsible: ana,
              responsibleRevision: 1,
              responsibleChange: {
                actorDisplayName: 'Ana Rusu',
                occurredAt: '2026-09-01T09:00:00.000Z',
              },
            },
          ),
        ];
  const find = (projectId: string) =>
    projects.find((entry) => entry.row.id === projectId);
  const closed = (status: Status) =>
    status === 'completed' || status === 'cancelled';
  const ok = (json: unknown, status = 200): FakeReply => ({ status, json });
  const conflict = (code: string): FakeReply => ({
    status: 409,
    json: { code, message: code },
  });
  const clientRow = (client: (typeof missionsClients)[number]) => ({
    id: client.id,
    version: 1,
    displayName: client.displayName,
    taxId: null,
    address: null,
    telephone: null,
    generalEmail: null,
    businessActivity: null,
    contacts: [],
    relatedToActiveCompany: true,
  });
  const lifecycle = (entry: StoredProject) => ({
    status: entry.row.status,
    lifecycleRevision: entry.lifecycleRevision,
    mutable: !closed(entry.row.status),
    start: entry.start,
    transitions: entry.transitions,
  });
  const nextActionScope = (entry: StoredProject) => ({
    workspaceId: missionsWorkspaceId,
    companyId: missionsCompany.id,
    projectId: entry.row.id,
    originalClientAccountId: entry.row.clientAccountId,
  });
  const nextActionRecord = (entry: StoredProject) => {
    const [last] = entry.nextAction;
    return {
      format: 'project-next-action-v1',
      ...nextActionScope(entry),
      revision: last?.revision ?? 0,
      text: last?.after ?? null,
      lastChange: last?.attribution ?? null,
    };
  };
  function createProject(
    body: Record<string, unknown>,
    source: 'manual' | 'template' | 'mission-plan',
  ): FakeReply {
    const client = missionsClients.find(
      (candidate) => candidate.id === body.clientAccountId,
    );
    if (!client) return { status: 422, json: { message: 'Unknown Client' } };
    created += 1;
    const entry = store(
      {
        id: createdProjectId(created),
        clientAccountId: client.id,
        clientDisplayName: client.displayName,
        title: text(body.title),
        status: 'preparatory',
        createdAt: now(),
      },
      {
        template: source === 'template' ? 'illustrative' : null,
        missionPlan: source === 'mission-plan',
      },
    );
    projects.unshift(entry);
    return ok(entry.row, 201);
  }
  function transition(entry: StoredProject, body: Record<string, unknown>) {
    if (count(body.expectedLifecycleRevision) !== entry.lifecycleRevision)
      return conflict('project_lifecycle_revision_conflict');
    const action = text(body.action);
    const from = entry.row.status;
    const to: Record<string, Status> = {
      activate: 'active',
      hold: 'on_hold',
      resume: 'active',
      complete: 'completed',
      cancel: 'cancelled',
    };
    const target = to[action];
    const allowed: Record<string, readonly Status[]> = {
      activate: ['preparatory'],
      hold: ['active'],
      resume: ['on_hold'],
      complete: ['active'],
      cancel: ['preparatory', 'active', 'on_hold'],
    };
    if (!target || !allowed[action]?.includes(from))
      return conflict('project_lifecycle_transition_invalid');
    if (action === 'activate' && !entry.responsible)
      return conflict('project_responsible_required');
    const occurredAt = now();
    entry.lifecycleRevision += 1;
    if (action === 'activate') {
      const exception =
        body.startException === undefined ? null : object(body.startException);
      const completion = missionsMembers.find(
        (member) =>
          member.workspaceMembershipId === exception?.completionMembershipId,
      );
      entry.start = {
        declaredAt: occurredAt,
        declaredBy: { displayName: me.displayName },
        declaration: object(body.declaration),
        exception: exception
          ? {
              reason: text(exception.reason),
              completionResponsible: completion ?? ion,
              completionDueDate: text(exception.completionDueDate),
            }
          : null,
      };
    }
    entry.transitions.unshift({
      action,
      lifecycleRevision: entry.lifecycleRevision,
      from,
      to: target,
      occurredAt,
      actor: { displayName: me.displayName },
      ...(action === 'activate'
        ? { withStartException: body.startException !== undefined }
        : {}),
      ...(action === 'hold' || action === 'cancel'
        ? { reason: text(body.reason) }
        : {}),
      ...(action === 'complete' ? { note: text(body.note) } : {}),
    });
    entry.row = { ...entry.row, status: target };
    return ok({
      projectId: entry.row.id,
      action,
      from,
      to: target,
      lifecycleRevision: entry.lifecycleRevision,
    });
  }
  function setResponsible(entry: StoredProject, body: Record<string, unknown>) {
    if (count(body.expectedRevision) !== entry.responsibleRevision)
      return conflict('project_responsible_revision_conflict');
    if (closed(entry.row.status)) return conflict('project_closed');
    const chosen =
      body.workspaceMembershipId === null
        ? null
        : (missionsMembers.find(
            (member) =>
              member.workspaceMembershipId === body.workspaceMembershipId,
          ) ?? null);
    if (body.workspaceMembershipId !== null && !chosen)
      return { status: 422, json: { message: 'Unknown member' } };
    if (chosen === null && entry.row.status !== 'preparatory')
      return conflict('project_responsible_required');
    const unchanged =
      chosen?.workspaceMembershipId ===
      entry.responsible?.workspaceMembershipId;
    if (!unchanged) {
      entry.responsible = chosen;
      entry.responsibleRevision += 1;
      entry.responsibleChange = {
        actorDisplayName: me.displayName,
        occurredAt: now(),
      };
    }
    return ok({
      projectId: entry.row.id,
      outcome: unchanged ? 'unchanged' : 'changed',
      revision: entry.responsibleRevision,
      responsible: entry.responsible,
    });
  }
  function setNextAction(entry: StoredProject, body: Record<string, unknown>) {
    const current = nextActionRecord(entry);
    if (
      count(body.expectedRevision) !== current.revision ||
      count(body.expectedLifecycleRevision) !== entry.lifecycleRevision
    )
      return conflict('project_next_action_conflict');
    if (closed(entry.row.status)) return conflict('project_closed');
    const after = body.text === null ? null : text(body.text);
    if (after === current.text)
      return ok({
        format: 'project-next-action-command-v1',
        outcome: 'unchanged',
        record: current,
      });
    entry.nextAction.unshift({
      revision: current.revision + 1,
      predecessorRevision: current.revision,
      before: current.text,
      after,
      attribution: attribution(),
    });
    return ok({
      format: 'project-next-action-command-v1',
      outcome: 'changed',
      record: nextActionRecord(entry),
    });
  }
  function templatePlan(entry: StoredProject) {
    if (entry.template === null) return { template: null };
    if (entry.template === 'pilot')
      return {
        template: {
          ...pilotSourceFixture,
          activities: pilotSourceFixture.activities.map(
            (activity, position) => ({
              ...activity,
              taskId: entry.tasks[position]?.id,
            }),
          ),
        },
      };
    let position = 0;
    return {
      template: {
        ...missionsTemplate,
        stages: missionsTemplate.stages.map((stage) => ({
          ...stage,
          tasks: stage.tasks.map((templateTask) => {
            const copied = entry.tasks[position];
            position += 1;
            return { ...templateTask, taskId: copied?.id };
          }),
        })),
      },
    };
  }
  function missionPlanCopy(entry: StoredProject) {
    if (!entry.missionPlan) return { plan: null };
    return {
      plan: {
        projectId: entry.row.id,
        version: missionsPlan,
        tasks: missionsPlan.activities.map((activity, position) => ({
          activityKey: activity.key,
          position,
          taskId: entry.tasks[position]?.id,
        })),
      },
    };
  }

  function reply(request: FakeRequest): FakeReply {
    const method = request.method.toUpperCase();
    const path = request.url.pathname.replace(/^\/api/u, '');
    const route = `${method} ${path}`;
    if (method !== 'GET') writes.push(route);
    if (route === 'GET /access/current-actor') return ok(actor);
    if (route === 'GET /companies') return ok([missionsCompany]);
    if (route === 'GET /activity-log') return ok({ events: [] });
    if (route === 'GET /clients') return ok(missionsClients.map(clientRow));
    if (route === 'GET /client-duplicate-reviews')
      return ok({ items: [], next_cursor: null });
    if (route === 'GET /assigned-tasks') return ok({ tasks: [] });
    if (route === 'GET /projects') {
      if (options.listStatus) return { status: options.listStatus };
      const mine = request.url.searchParams.get('view') === 'mine_open';
      return ok(
        projects
          .filter(
            (entry) =>
              !mine ||
              (!closed(entry.row.status) &&
                entry.responsible?.workspaceMembershipId ===
                  me.workspaceMembershipId),
          )
          .map((entry) => entry.row),
      );
    }
    if (route === 'POST /projects')
      return createProject(object(request.body), 'manual');
    if (route === 'POST /projects/from-template')
      return createProject(object(request.body), 'template');
    if (route === 'POST /projects/from-mission-plan')
      return createProject(object(request.body), 'mission-plan');
    const contractRoute = /^GET \/contracts\/projects\/([^/]+)$/u.exec(route);
    if (contractRoute)
      return ok({
        items:
          contractRoute[1] === missionsSeededProjects.certification
            ? [
                {
                  id: id(2202),
                  opportunityId: id(2203),
                  clientRequestId: missionsContractRequestId,
                  illustrativeReference: 19,
                  kind: 'CONTRACT',
                  provisional: true,
                  linkedAt: '2026-11-11T08:00:00.000Z',
                },
              ]
            : [],
      });
    if (route === 'GET /project-templates')
      return ok({
        templates: [missionsTemplate],
        headVersion: 1,
        nextBeforeVersion: null,
      });
    if (route === 'GET /mission-plans')
      return ok({
        items: [
          {
            workspaceId: missionsWorkspaceId,
            companyId: missionsCompany.id,
            planId: missionsPlan.planId,
            createdAt: '2026-11-01T09:00:00.000000Z',
            head: missionsPlan,
          },
        ],
      });
    if (
      route ===
      `GET /mission-plans/${missionsPlan.planId}/versions/${missionsPlan.id}`
    )
      return ok({ version: missionsPlan });
    const taskRoute = /^GET \/tasks\/([^/]+)(\/history)?$/u.exec(route);
    if (taskRoute) {
      const found = projects
        .flatMap((entry) => entry.tasks)
        .find((candidate) => candidate.id === taskRoute[1]);
      if (!found) return { status: 404 };
      return taskRoute[2]
        ? ok({ events: [] })
        : ok({ mutable: true, task: found });
    }
    const projectRoute = /^(GET|POST|PUT) \/projects\/([^/]+)(\/.*)?$/u.exec(
      route,
    );
    const entry = projectRoute ? find(projectRoute[2] ?? '') : undefined;
    if (projectRoute && entry) {
      const rest = `${projectRoute[1]} ${projectRoute[3] ?? ''}`;
      switch (rest) {
        case 'GET ':
          return ok(entry.row);
        case 'GET /lifecycle':
          return ok(lifecycle(entry));
        case 'GET /eligible-start-exception-members':
        case 'GET /eligible-responsible-members':
          return ok({ members: missionsMembers });
        case 'POST /lifecycle-transitions':
          return transition(entry, object(request.body));
        case 'GET /responsible':
          return ok({
            responsible: entry.responsible,
            revision: entry.responsibleRevision,
            lastChange: entry.responsibleChange,
            mutable: !closed(entry.row.status),
          });
        case 'PUT /responsible':
          return setResponsible(entry, object(request.body));
        case 'GET /next-action':
          return ok({
            current: nextActionRecord(entry),
            history: {
              entries: entry.nextAction,
              hasMore: false,
              nextBeforeRevision: null,
            },
          });
        case 'POST /next-action':
          return setNextAction(entry, object(request.body));
        case 'GET /template':
          return ok(templatePlan(entry));
        case 'GET /mission-plan':
          return ok(missionPlanCopy(entry));
        case 'GET /mission-plan/current-work':
          return ok({ overview: null });
        case 'GET /stage-progress':
          return ok({ progress: null });
        case 'GET /tasks':
          return ok({ mutable: !closed(entry.row.status), tasks: entry.tasks });
        case 'GET /eligible-task-assignees':
          return ok({ members: missionsMembers });
        case 'GET /documents':
          return ok({ mutable: !closed(entry.row.status), documents: [] });
        default:
          break;
      }
    }
    unhandled.add(route);
    return { status: 404 };
  }
  return { reply, writes, unhandled, projects };
}
