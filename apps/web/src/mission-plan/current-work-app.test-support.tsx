import { vi } from 'vitest';
import {
  fireEvent,
  screen,
  within,
} from '../test/render-with-interface-locale';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  isLifecycleRead,
  preparatoryLifecycle,
} from '../project/project-lifecycle.test-fixtures';
import { object } from './mission-plan-response';
import { configGrant, userGrant } from './mission-plan.fixture';
import {
  currentActor,
  currentOverview,
  company,
  otherCompany,
  id,
  project,
} from './current-work.fixture';
export function deferred() {
  let resolve: (r: Response) => void = () => {
    throw new Error('Missing deferred');
  };
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}
export function installCurrentWorkApp() {
  const initialValue: unknown = currentOverview();
  const state: {
    reads: number;
    actorReads: number;
    activityReads: number;
    actorHoldCompany: ReturnType<typeof deferred> | undefined;
    actorHoldWorkspace: ReturnType<typeof deferred> | undefined;
    heldActorReads: ('company' | 'workspace')[];
    value: unknown;
    status: number;
    held: ReturnType<typeof deferred> | undefined;
    taskHold: ReturnType<typeof deferred> | undefined;
    posts: { body: string; key: string | null }[];
    taskStatus: number;
    readerId: string;
    sourceGrants: boolean;
    taskRead: boolean;
    planId: string;
    metadataId: string;
    familyId: string;
    recorderId: string;
    reviewerId: string;
    clientRead: boolean;
    projectRead: boolean;
    resultHold: ReturnType<typeof deferred> | undefined;
    resultStatus: number;
    resultPosts: { body: string; key: string | null }[];
  } = {
    reads: 0,
    actorReads: 0,
    activityReads: 0,
    actorHoldCompany: undefined,
    actorHoldWorkspace: undefined,
    heldActorReads: [],
    value: initialValue,
    status: 200,
    held: undefined,
    taskHold: undefined,
    posts: [],
    taskStatus: 503,
    readerId: id(15),
    sourceGrants: true,
    taskRead: true,
    planId: userGrant.assignmentId,
    metadataId: id(14),
    familyId: id(16),
    recorderId: id(17),
    reviewerId: id(18),
    clientRead: true,
    projectRead: true,
    resultHold: undefined,
    resultStatus: 503,
    resultPosts: [],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = new URL(String(input), window.location.origin).pathname,
        selected =
          new Headers(init.headers).get('x-company-context-id') ?? company.id;
      const actor = currentActor(selected);
      if (actor.activeCompany) {
        actor.activeCompany.missionPlanGrants = [
          configGrant,
          { ...userGrant, assignmentId: state.planId },
        ];
        actor.activeCompany.documentPermissionAssignmentId = state.metadataId;
        actor.activeCompany.missionDeliverableAccessAssignmentId =
          state.familyId;
        actor.activeCompany.taskResultRecorderAssignmentId = state.recorderId;
        actor.activeCompany.missionResultReviewerAssignmentId =
          state.reviewerId;
        if (!state.clientRead) {
          actor.workspacePermissions = ['company.assignment.manage'];
          actor.activeCompany.clientPermissions = [];
        }
        if (!state.projectRead) actor.activeCompany.projectPermissions = [];
        actor.activeCompany.documentContentReaderAssignmentId = state.readerId;
        if (!state.taskRead) actor.activeCompany.taskPermissions = [];
        if (!state.sourceGrants) actor.activeCompany.missionPlanGrants = [];
      }
      if (path.endsWith('/access/current-actor')) {
        state.actorReads++;
        const hasCompany = new Headers(init.headers).has(
          'x-company-context-id',
        );
        if (hasCompany && state.actorHoldCompany) {
          const held = state.actorHoldCompany;
          state.actorHoldCompany = undefined;
          state.heldActorReads.push('company');
          return held.promise;
        }
        if (!hasCompany && state.actorHoldWorkspace) {
          const held = state.actorHoldWorkspace;
          state.actorHoldWorkspace = undefined;
          state.heldActorReads.push('workspace');
          return held.promise;
        }
        return Response.json(actor);
      }
      if (path.endsWith('/companies'))
        return Response.json([company, otherCompany]);
      if (path.endsWith('/company-context-assignments/administration'))
        return Response.json({
          members: [
            {
              workspaceMembershipId: id(9),
              displayName: 'Ada DEMO',
              email: 'ada@example.test',
            },
          ],
          companies: [company, otherCompany],
          assignments: [],
        });
      if (path.endsWith('/company-document-content-reader-assignments'))
        return Response.json({ id: state.readerId }, { status: 201 });
      if (init.method === 'POST' && /\/company-[a-z-]+-assignments$/.test(path))
        return Response.json({ id: id(90) }, { status: 201 });
      if (path.endsWith('/mission-plan/current-work')) {
        state.reads++;
        return state.held
          ? state.held.promise
          : Response.json(state.value, { status: state.status });
      }
      if (path.endsWith('/mission-plan'))
        return Response.json({ plan: currentOverview().overview.plan });
      if (path.endsWith('/mission-plans')) return Response.json({ items: [] });
      if (path.endsWith('/activity-log')) {
        state.activityReads++;
        return Response.json({ events: [] });
      }
      if (path.endsWith('/clients'))
        return Response.json([
          {
            id: project.clientAccountId,
            displayName: project.clientDisplayName,
            relatedToActiveCompany: true,
          },
        ]);
      if (path.endsWith('/projects'))
        return Response.json([
          project,
          { ...project, id: id(30), title: 'Other Project DEMO' },
        ]);
      if (path.endsWith('/projects/' + project.id))
        return Response.json(project);
      if (path.endsWith('/projects/' + id(30)))
        return Response.json({
          ...project,
          id: id(30),
          title: 'Other Project DEMO',
        });
      if (isLifecycleRead(path)) return Response.json(preparatoryLifecycle);
      if (path.endsWith('/tasks') && init.method === 'POST') {
        state.posts.push({
          body: String(init.body),
          key: new Headers(init.headers).get('idempotency-key'),
        });
        if (state.taskHold) return state.taskHold.promise;
        const body = object(JSON.parse(String(init.body)));
        return Response.json(
          state.taskStatus === 201
            ? {
                id: id(999),
                companyId: company.id,
                projectId: project.id,
                clientAccountId: project.clientAccountId,
                title: body.title,
                priority: body.priority,
                assignee: null,
                dueDate: null,
                version: 1,
                status: 'todo',
                completion: null,
                createdAt: project.createdAt,
                updatedAt: project.createdAt,
                createdBy: {
                  internalUserId: id(8),
                  workspaceMembershipId: id(9),
                  displayName: 'Ada DEMO',
                },
              }
            : {},
          { status: state.taskStatus },
        );
      }
      if (path.endsWith('/tasks'))
        return Response.json({
          mutable: true,
          tasks: currentOverview().overview.activities.map((r) => r.task),
        });
      const task = currentOverview().overview.activities.find((r) =>
        path.endsWith('/tasks/' + r.task.id),
      );
      if (task) return Response.json({ mutable: true, task: task.task });
      if (path.endsWith('/eligible-task-assignees'))
        return Response.json({ members: [] });
      if (path.endsWith('/results') && init.method === 'POST') {
        state.resultPosts.push({
          body: String(init.body),
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return state.resultHold
          ? state.resultHold.promise
          : Response.json(
              state.resultStatus === 201
                ? {
                    action: 'recorded',
                    taskId: id(225),
                    resultId: id(999),
                    resultRevision: 1,
                  }
                : {},
              { status: state.resultStatus },
            );
      }
      if (path.endsWith('/results/history'))
        return Response.json({
          declarations: [],
          hasMore: false,
          nextBeforeRevision: null,
        });
      if (path.endsWith('/history')) return Response.json({ events: [] });
      if (path.endsWith('/results/eligible-versions'))
        return Response.json({
          taskId: id(225),
          mutable: true,
          versions: [
            currentOverview().overview.activities[25]?.result.current.reference,
          ],
        });
      if (path.endsWith('/results'))
        return Response.json({
          taskId: id(225),
          projectId: project.id,
          taskTitle: 'Current Task 26',
          taskVersion: 2,
          revision: 0,
          mutable: true,
          current: null,
        });
      if (path.endsWith('/documents'))
        return Response.json({ mutable: true, documents: [] });
      return Response.json({}, { status: 404 });
    }),
  );
  return state;
}
export function CurrentWorkLocaleProbe() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {(['ro', 'ru', 'fr', 'en'] as const).map((locale) => (
        <button key={locale} onClick={() => changeLocale(locale)}>
          Change to {locale}
        </button>
      ))}
    </>
  );
}
export async function openCurrentWork() {
  const nav = await screen.findByRole('navigation', {
    name: 'Primary navigation',
  });
  fireEvent.click(within(nav).getByRole('link', { name: 'Projects' }));
  const region = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.click(
    await within(region).findByRole('button', {
      name: 'Current Project DEMO Client: Current Client DEMO',
    }),
  );
  return screen.findByRole('region', { name: 'Current mission work' });
}

export function resetCurrentWorkApp() {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/?frame=classic#projects');
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }) satisfies MediaQueryList,
    ),
  );
}
export function restoreCurrentWorkApp() {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}
