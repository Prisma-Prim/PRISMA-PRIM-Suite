import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { changeValue } from '../test/select-option';
import {
  deterministicBrowserIdentity,
  type BrowserIdentity,
} from '../access-composition';
import type { ActorContext } from '../access-types';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { ProjectWorkspace } from './ProjectWorkspace';
import { preparatoryLifecycle } from './project-lifecycle.test-fixtures';
import { templateFixture } from './project-template.test-fixtures';

const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: 'company',
    displayName: 'PRISMA-PRIM',
    projectPermissions: ['project.read', 'project.create'],
  },
};
const mine = {
  id: 'mine',
  companyId: 'company',
  clientAccountId: 'client',
  clientDossierId: 'client',
  clientDisplayName: 'Atelier Știință',
  title: 'Pregătire proprie',
  status: 'preparatory',
  createdAt: '2026-09-19T08:00:00.000Z',
};
const colleague = {
  ...mine,
  id: 'colleague',
  clientAccountId: 'client-other',
  clientDossierId: 'client-other',
  clientDisplayName: 'Other Client',
  title: 'Colleague preparation',
};
const completed = {
  ...mine,
  id: 'completed',
  title: 'Completed preparation',
  status: 'completed',
};
const registered = {
  ...mine,
  id: 'registered',
  title: 'Literal {draft} — Демо',
};
const outsideTask = {
  id: 'outside-task',
  companyId: 'company',
  projectId: colleague.id,
  clientAccountId: colleague.clientAccountId,
  title: 'Independent outside Task',
  assignee: { workspaceMembershipId: 'member', displayLabel: 'Owner' },
  dueDate: null,
  priority: 'normal',
  status: 'todo',
  completion: null,
  version: 1,
  createdAt: '2026-09-19T09:00:00.000Z',
  updatedAt: '2026-09-19T09:00:00.000Z',
  createdBy: {
    internalUserId: 'owner',
    workspaceMembershipId: 'member',
    displayName: 'Owner',
  },
};
const questionnaireDocument = {
  id: 'document',
  companyId: 'company',
  clientId: 'client',
  clientDisplayName: mine.clientDisplayName,
  title: 'Preparation questionnaire',
  purpose: 'Prepare the interview',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: '2026-09-19T00:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: {
    id: 'version',
    status: 'draft',
    representation: {
      id: 'representation',
      kind: 'external-reference',
      verification: 'unverified',
      access: 'granted',
      url: 'https://example.test/questionnaire',
    },
  },
};
const minePath = '/api/projects?view=mine_open';
type RequestRecord = {
  path: string;
  method: string;
  signal: AbortSignal | undefined;
  company: string | null;
  body: string | undefined;
  key: string | null;
  authorization: string | null;
};
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.lang = '';
});

/** HTTP is the only substitute; the directory and real mutable child owners run. */
function server() {
  const requests: RequestRecord[] = [];
  const holding = new Set<string>();
  const held: Array<{
    request: RequestRecord;
    answer: (value: Response) => void;
  }> = [];
  let all = [mine, colleague, completed];
  let own = [mine];
  let responsible = true;
  let cancelled = false;
  let rejectedCompany: string | undefined;
  let rejectedAuthorization: string | undefined;
  let write: (request: RequestRecord) => Response = () => {
    throw new Error('Unexpected write.');
  };
  function answer(request: RequestRecord) {
    if (request.method !== 'GET') return write(request);
    if (
      request.company === rejectedCompany ||
      request.authorization === rejectedAuthorization
    )
      return new Response(null, { status: 401 });
    if (request.company === 'other-company') return Response.json([]);
    if (request.path === '/api/projects') return Response.json(all);
    if (request.path === minePath) return Response.json(own);
    if (request.path === '/api/clients')
      return Response.json([
        { id: mine.clientAccountId, displayName: mine.clientDisplayName },
        {
          id: colleague.clientAccountId,
          displayName: colleague.clientDisplayName,
        },
      ]);
    if (request.path === '/api/project-templates')
      return Response.json({ templates: [templateFixture] });
    const project = [mine, colleague, completed, registered].find(
      (row) => request.path === `/api/projects/${row.id}`,
    );
    if (project)
      return Response.json(
        cancelled && project.id === mine.id
          ? { ...project, status: 'cancelled' }
          : project,
      );
    if (request.path.endsWith('/lifecycle'))
      return Response.json(
        cancelled
          ? {
              status: 'cancelled',
              lifecycleRevision: 1,
              mutable: false,
              start: null,
              transitions: [
                {
                  action: 'cancel',
                  lifecycleRevision: 1,
                  from: 'preparatory',
                  to: 'cancelled',
                  occurredAt: '2026-09-19T08:00:00.000Z',
                  actor: { displayName: 'Owner' },
                  reason: 'Explicit cancellation.',
                },
              ],
            }
          : preparatoryLifecycle,
      );
    if (request.path === `/api/projects/${registered.id}/responsible`)
      return Response.json({
        responsible: null,
        revision: 0,
        mutable: true,
        lastChange: null,
      });
    if (request.path.endsWith('/responsible'))
      return Response.json({
        responsible: responsible
          ? {
              workspaceMembershipId: request.path.includes('/colleague/')
                ? 'other-member'
                : 'member',
              displayLabel: request.path.includes('/colleague/')
                ? 'Colleague'
                : 'Owner',
            }
          : null,
        revision: responsible ? 1 : 2,
        mutable: true,
        lastChange: {
          actorDisplayName: 'Owner',
          occurredAt: '2026-09-19T08:00:00.000Z',
        },
      });
    if (request.path.endsWith('/eligible-responsible-members'))
      return Response.json({
        members: [{ workspaceMembershipId: 'member', displayLabel: 'Owner' }],
      });
    if (request.path.endsWith('/eligible-task-assignees'))
      return Response.json({ members: [] });
    if (request.path === `/api/tasks/${outsideTask.id}/history`)
      return Response.json({
        events: [
          {
            id: `${outsideTask.id}-created`,
            action: 'task.created',
            occurredAt: outsideTask.createdAt,
            actor: outsideTask.createdBy,
            target: {
              type: 'task',
              taskId: outsideTask.id,
              taskTitle: outsideTask.title,
              companyId: outsideTask.companyId,
            },
            metadata: {
              version: outsideTask.version,
              initial: {
                title: outsideTask.title,
                assignee: outsideTask.assignee,
                dueDate: outsideTask.dueDate,
                priority: outsideTask.priority,
              },
            },
          },
        ],
      });
    if (request.path === `/api/tasks/${outsideTask.id}`)
      return Response.json({ mutable: true, task: outsideTask });
    if (request.path.endsWith('/tasks'))
      return Response.json({
        mutable: true,
        tasks: request.path.includes('/colleague/') ? [outsideTask] : [],
      });
    if (request.path.endsWith('/eligible-documents'))
      return Response.json({
        mutable: true,
        documents: [{ document: questionnaireDocument, revision: 0 }],
      });
    if (request.path.endsWith('/documents'))
      return Response.json({ mutable: true, documents: [] });
    return new Response(null, { status: 404 });
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const request: RequestRecord = {
        path: input.toString(),
        method: init?.method ?? 'GET',
        signal: init?.signal ?? undefined,
        company: headers.get('x-company-context-id'),
        body: typeof init?.body === 'string' ? init.body : undefined,
        key: headers.get('idempotency-key'),
        authorization: headers.get('authorization'),
      };
      requests.push(request);
      if (
        holding.has(request.path) ||
        holding.has(`${request.method} ${request.path}`)
      )
        return new Promise<Response>((resolve) =>
          held.push({ request, answer: resolve }),
        );
      return answer(request);
    }),
  );
  return {
    requests,
    rejectCompany: (company: string) => {
      rejectedCompany = company;
    },
    rejectAuthorization: (authorization: string) => {
      rejectedAuthorization = authorization;
    },
    hold: (path: string) => holding.add(path),
    unhold: (path: string) => holding.delete(path),
    setAll: (rows: typeof all) => {
      all = rows;
    },
    setMine: (rows: typeof own) => {
      own = rows;
    },
    cancelProject: () => {
      cancelled = true;
      own = [];
    },
    clearResponsibility: () => {
      responsible = false;
      own = [];
    },
    onWrite: (handler: typeof write) => {
      write = handler;
    },
    async pending(path: string) {
      return waitFor(() => {
        const item = held.find((row) => row.request.path === path);
        if (!item) throw new Error('No held request.');
        return item.request;
      });
    },
    async release(path: string, response?: Response) {
      const request = await waitFor(() => {
        const item = held.find((row) => row.request.path === path);
        if (!item) throw new Error('No held request.');
        return item;
      });
      held.splice(held.indexOf(request), 1);
      await act(async () => {
        request.answer(response ?? answer(request.request));
      });
    },
    async releaseLatest(path: string, response?: Response) {
      const request = await waitFor(() => {
        const item = held
          .slice()
          .reverse()
          .find((row) => row.request.path === path);
        if (!item) throw new Error('No held latest request.');
        return item;
      });
      held.splice(held.indexOf(request), 1);
      await act(async () => {
        request.answer(response ?? answer(request.request));
      });
    },
  };
}
function control(id: string) {
  const found = screen
    .getAllByRole('combobox')
    .find((element) => element.id === id);
  if (!found) throw new Error('Missing public selection control: ' + id);
  return found;
}
function choose(view: 'all' | 'mine_open') {
  changeValue(control('project-directory-view'), view);
}
function rows() {
  return within(screen.getByRole('list', { name: 'Projects' }));
}
async function ready() {
  expect(
    await screen.findByRole('button', {
      name: `${mine.title} Client: ${mine.clientDisplayName}`,
    }),
  ).toBeInTheDocument();
}
function element(
  identity: BrowserIdentity,
  givenActor = actor,
  extra: Partial<Parameters<typeof ProjectWorkspace>[0]> = {},
) {
  return (
    <>
      <InterfaceLocaleSelect />
      <ProjectWorkspace actor={givenActor} identity={identity} {...extra} />
    </>
  );
}

it('retains real Task, Document and registration drafts through a pending and unavailable Mine read', async () => {
  const transport = server();
  const rich: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: 'company',
      displayName: 'PRISMA-PRIM',
      taskPermissions: ['task.read', 'task.manage'],
      taskPermissionAssignmentId: 'task-grant',
      taskPermissionSetVersion: 'v1',
      documentPermissions: [
        'document.read',
        'document.reference.read',
        'document.project.manage',
      ],
    },
  };
  const identity = deterministicBrowserIdentity();
  render(element(identity, rich));
  await ready();
  fireEvent.click(
    rows().getByRole('button', {
      name: `${mine.title} Client: ${mine.clientDisplayName}`,
    }),
  );
  const detail = await screen.findByRole('article', { name: mine.title });
  const taskTitle = await within(
    await screen.findByRole('region', { name: 'Tasks' }),
  ).findByRole('textbox', { name: 'Task title' });
  changeValue(taskTitle, 'Keep Task {draft} — Демо');
  fireEvent.click(
    await screen.findByRole('button', { name: 'Attach working Document' }),
  );
  const documentSearch = await screen.findByRole('searchbox', {
    name: 'Search eligible working Documents',
  });
  changeValue(documentSearch, 'Keep Document {filter}');
  const projectTitle = screen.getByRole('textbox', { name: 'Project title' });
  changeValue(projectTitle, 'Keep registration draft');
  transport.hold(minePath);
  choose('mine_open');
  await transport.pending(minePath);
  expect(
    rows().queryByRole('button', {
      name: `${mine.title} Client: ${mine.clientDisplayName}`,
    }),
  ).toBeNull();
  expect(screen.getByRole('article', { name: mine.title })).toBe(detail);
  expect(taskTitle).toBeInTheDocument();
  expect(taskTitle).toHaveValue('Keep Task {draft} — Демо');
  expect(documentSearch).toBeInTheDocument();
  expect(documentSearch).toHaveValue('Keep Document {filter}');
  expect(projectTitle).toBeInTheDocument();
  expect(projectTitle).toHaveValue('Keep registration draft');
  await transport.release(minePath, new Response(null, { status: 503 }));
  expect(
    await screen.findByText('This view could not be loaded. Please try again.'),
  ).toBeInTheDocument();
  expect(taskTitle).toHaveValue('Keep Task {draft} — Демо');
  expect(documentSearch).toHaveValue('Keep Document {filter}');
  transport.unhold(minePath);
  fireEvent.click(screen.getByRole('button', { name: 'Reload this view' }));
  await waitFor(() =>
    expect(
      rows().getByRole('button', {
        name: `${mine.title} Client: ${mine.clientDisplayName}`,
      }),
    ).toBeInTheDocument(),
  );
  expect(taskTitle).toBeInTheDocument();
  expect(projectTitle).toHaveValue('Keep registration draft');
  expect(
    transport.requests.filter((request) => request.path.endsWith('/tasks')),
  ).toHaveLength(1);
  expect(
    transport.requests.filter((request) =>
      request.path.endsWith('/eligible-documents'),
    ),
  ).toHaveLength(1);
});

it('retires an older Mine reply before it can reject the session or replace a newer All directory', async () => {
  const transport = server();
  const rejectSession = vi.fn(async () => undefined);
  const identity: BrowserIdentity = {
    ...deterministicBrowserIdentity(),
    rejectSession,
  };
  const view = render(element(identity));
  await ready();
  transport.hold(minePath);
  choose('mine_open');
  const pending = await transport.pending(minePath);
  choose('all');
  await waitFor(() =>
    expect(
      rows().getByRole('button', {
        name: `${colleague.title} Client: ${colleague.clientDisplayName}`,
      }),
    ).toBeInTheDocument(),
  );
  expect(pending.signal?.aborted).toBe(true);
  await transport.release(minePath, new Response(null, { status: 401 }));
  expect(rejectSession).not.toHaveBeenCalled();
  expect(control('project-directory-view')).toHaveTextContent('All Projects');
  expect(
    rows().getByRole('button', {
      name: `${mine.title} Client: ${mine.clientDisplayName}`,
    }),
  ).toBeInTheDocument();
  choose('mine_open');
  view.rerender(
    element(identity, actor, {
      navigation: { kind: 'directory', requestId: 2 },
    }),
  );
  await waitFor(() =>
    expect(
      rows().getByRole('button', {
        name: `${colleague.title} Client: ${colleague.clientDisplayName}`,
      }),
    ).toBeInTheDocument(),
  );
  expect(control('project-directory-view')).toHaveTextContent('All Projects');
  expect(screen.getByLabelText('Include closed Projects')).not.toBeChecked();
});

it.each(['manual', 'template'] as const)(
  'preserves an exact uncertain %s creation through Mine and all four interface locales',
  async (mode) => {
    const transport = server();
    const identity = deterministicBrowserIdentity();
    const givenActor: ActorContext =
      mode === 'manual'
        ? actor
        : {
            ...actor,
            activeCompany: {
              ...actor.activeCompany,
              id: 'company',
              displayName: 'PRISMA-PRIM',
              projectTemplatePermissions: [
                'project.template.read',
                'project.template.instantiate',
              ],
              projectTemplatePermissionAssignmentId: 'template-grant',
              projectTemplatePermissionSetVersion: 'v1',
              taskPermissions: ['task.read', 'task.manage'],
              taskPermissionAssignmentId: 'task-grant',
              taskPermissionSetVersion: 'v1',
            },
          };
    const writes: RequestRecord[] = [];
    transport.onWrite((request) => {
      writes.push(request);
      return writes.length === 1
        ? new Response(null, { status: 503 })
        : Response.json(registered);
    });
    render(element(identity, givenActor));
    await ready();
    const draft = screen.getByRole('textbox', { name: 'Project title' });
    changeValue(draft, `  ${registered.title}  `);
    changeValue(
      screen.getByRole('combobox', { name: 'Client' }),
      mine.clientAccountId,
    );
    if (mode === 'template')
      changeValue(
        await screen.findByRole('combobox', { name: 'Project template' }),
        'CONSULTING_PREPARATION_ILLUSTRATIVE:1',
      );
    fireEvent.click(
      screen.getByRole('button', {
        name:
          mode === 'manual' ? 'Create Project' : 'Create Project from template',
      }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    const originalBody: unknown = JSON.parse(writes[0]?.body ?? '{}');
    expect(originalBody).toEqual({
      title: registered.title,
      clientAccountId: mine.clientAccountId,
      ...(mode === 'template'
        ? {
            templateKey: 'CONSULTING_PREPARATION_ILLUSTRATIVE',
            templateVersion: 1,
          }
        : {}),
    });
    expect(writes[0]?.path).toBe(
      mode === 'template' ? '/api/projects/from-template' : '/api/projects',
    );
    await screen.findByText(
      mode === 'manual'
        ? 'The Project could not be loaded or saved. Please try again.'
        : 'The Project creation could not be confirmed. Retry the same details safely.',
    );
    choose('mine_open');
    await waitFor(() =>
      expect(
        rows().getByRole('button', {
          name: `${mine.title} Client: ${mine.clientDisplayName}`,
        }),
      ).toBeInTheDocument(),
    );
    const before = transport.requests.length;
    const locales = [
      ['ro', 'Proiectele mele deschise'],
      ['ru', 'Мои открытые Проекты'],
      ['fr', 'Mes Projets ouverts'],
      ['en', 'My open Projects'],
    ] as const;
    for (const [locale, caption] of locales) {
      changeValue(control('interface-locale'), locale);
      expect(control('project-directory-view')).toHaveTextContent(caption);
      expect(draft).toBeInTheDocument();
      expect(draft).toHaveValue(`  ${registered.title}  `);
      expect(transport.requests).toHaveLength(before);
      expect(writes).toHaveLength(1);
    }
    fireEvent.click(
      screen.getByRole('button', {
        name:
          mode === 'manual' ? 'Create Project' : 'Create Project from template',
      }),
    );
    await screen.findByRole('heading', { name: registered.title });
    expect(writes).toHaveLength(2);
    expect(writes[1]?.body).toBe(writes[0]?.body);
    expect(writes[1]?.key).toBe(writes[0]?.key);
    expect(writes[0]?.key).toBeTruthy();
    await waitFor(() =>
      expect(
        transport.requests.filter((request) => request.path === minePath),
      ).toHaveLength(2),
    );
    await waitFor(() =>
      expect(
        rows().getByRole('button', {
          name: `${mine.title} Client: ${mine.clientDisplayName}`,
        }),
      ).toBeInTheDocument(),
    );
    expect(
      rows().queryByRole('button', {
        name: `${registered.title} Client: ${registered.clientDisplayName}`,
      }),
    ).toBeNull();
    expect(
      screen.getByRole('heading', { name: registered.title }),
    ).toBeInTheDocument();
  },
);

it('opens an independent readable Project outside Mine without expanding or replacing the selected view', async () => {
  server();
  const identity = deterministicBrowserIdentity();
  const view = render(element(identity));
  await ready();
  choose('mine_open');
  await waitFor(() =>
    expect(
      rows().queryByRole('button', {
        name: `${colleague.title} Client: ${colleague.clientDisplayName}`,
      }),
    ).toBeNull(),
  );
  view.rerender(
    element(identity, actor, {
      navigation: { kind: 'project', projectId: colleague.id, requestId: 1 },
    }),
  );
  expect(
    await screen.findByRole('heading', { name: colleague.title }),
  ).toBeInTheDocument();
  expect(control('project-directory-view')).toHaveTextContent(
    'My open Projects',
  );
  expect(
    rows().queryByRole('button', {
      name: `${colleague.title} Client: ${colleague.clientDisplayName}`,
    }),
  ).toBeNull();
});

it('retains All closed inclusion across local view changes and restores All open-only for explicit directory navigation', async () => {
  server();
  const identity = deterministicBrowserIdentity();
  const view = render(element(identity));
  await ready();
  fireEvent.click(screen.getByLabelText('Include closed Projects'));
  expect(
    rows().getByRole('button', {
      name: `${completed.title} Client: ${completed.clientDisplayName}`,
    }),
  ).toBeInTheDocument();
  choose('mine_open');
  await waitFor(() =>
    expect(screen.queryByLabelText('Include closed Projects')).toBeNull(),
  );
  choose('all');
  expect(await screen.findByLabelText('Include closed Projects')).toBeChecked();
  expect(
    rows().getByRole('button', {
      name: `${completed.title} Client: ${completed.clientDisplayName}`,
    }),
  ).toBeInTheDocument();
  choose('mine_open');
  await waitFor(() =>
    expect(control('project-directory-view')).toHaveTextContent(
      'My open Projects',
    ),
  );
  view.rerender(
    element(identity, actor, {
      navigation: {
        kind: 'directory',
        requestId: 1,
        client: {
          clientDossierId: mine.clientDossierId,
          displayName: mine.clientDisplayName,
        },
      },
    }),
  );
  expect(
    await screen.findByLabelText('Include closed Projects'),
  ).not.toBeChecked();
  expect(control('project-directory-view')).toHaveTextContent('All Projects');
  expect(
    rows().queryByRole('button', {
      name: `${colleague.title} Client: ${colleague.clientDisplayName}`,
    }),
  ).toBeNull();
  expect(
    rows().getByRole('button', {
      name: `${mine.title} Client: ${mine.clientDisplayName}`,
    }),
  ).toBeInTheDocument();
});

it.each([
  { name: 'malformed array', value: { projects: [mine] } },
  {
    name: 'foreign Company',
    value: [{ ...mine, companyId: 'foreign-company' }],
  },
  { name: 'closed Project', value: [{ ...mine, status: 'completed' }] },
  { name: 'invalid status', value: [{ ...mine, status: 'unknown' }] },
])(
  'refuses a $name Mine response without showing old rows or a false empty result',
  async ({ value }) => {
    const transport = server();
    render(element(deterministicBrowserIdentity()));
    await ready();
    transport.hold(minePath);
    choose('mine_open');
    await transport.pending(minePath);
    await transport.release(minePath, Response.json(value));
    expect(
      await screen.findByText(
        'This view could not be loaded. Please try again.',
      ),
    ).toBeInTheDocument();
    expect(rows().queryByRole('button')).toBeNull();
    expect(
      screen.queryByText('No open Projects currently list you as responsible.'),
    ).toBeNull();
    expect(control('project-directory-view')).not.toBeDisabled();
  },
);

it('preserves the literal Romanian filter in Mine and distinguishes genuine empty from a local no-match', async () => {
  const transport = server();
  render(element(deterministicBrowserIdentity()));
  await ready();
  changeValue(
    screen.getByRole('searchbox', { name: 'Find Projects' }),
    ' STIINTA ',
  );
  choose('mine_open');
  await waitFor(() =>
    expect(
      rows().getByRole('button', {
        name: `${mine.title} Client: ${mine.clientDisplayName}`,
      }),
    ).toBeInTheDocument(),
  );
  expect(screen.getByRole('searchbox', { name: 'Find Projects' })).toHaveValue(
    ' STIINTA ',
  );
  changeValue(
    screen.getByRole('searchbox', { name: 'Find Projects' }),
    'No literal match',
  );
  expect(
    screen.getByText('No Project matches this search.'),
  ).toBeInTheDocument();
  expect(
    screen.queryByText('No open Projects currently list you as responsible.'),
  ).toBeNull();
  transport.setMine([]);
  fireEvent.click(screen.getByRole('button', { name: 'Reload this view' }));
  expect(
    await screen.findByText(
      'No open Projects currently list you as responsible.',
    ),
  ).toBeInTheDocument();
});

it.each(['Company', 'Membership', 'Internal User', 'session'] as const)(
  'retires scoped work and an old Mine response when the %s changes',
  async (boundary) => {
    const transport = server();
    const identity = deterministicBrowserIdentity();
    const view = render(element(identity));
    await ready();
    changeValue(
      screen.getByRole('textbox', { name: 'Project title' }),
      'Old scoped draft',
    );
    transport.hold(minePath);
    choose('mine_open');
    const pending = await transport.pending(minePath);
    transport.setAll([]);
    const replacement: ActorContext =
      boundary === 'Company'
        ? {
            ...actor,
            activeCompany: {
              ...actor.activeCompany,
              id: 'other-company',
              displayName: 'Other Company',
            },
          }
        : boundary === 'Membership'
          ? { ...actor, workspaceMembershipId: 'replacement-member' }
          : boundary === 'Internal User'
            ? { ...actor, internalUserId: 'replacement-user' }
            : actor;
    view.rerender(
      element(
        boundary === 'session' ? deterministicBrowserIdentity() : identity,
        replacement,
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Project title' }),
      ).toHaveValue(''),
    );
    expect(control('project-directory-view')).toHaveTextContent('All Projects');
    expect(pending.signal?.aborted).toBe(true);
    await transport.release(minePath, new Response(null, { status: 403 }));
    expect(rows().queryByRole('button')).toBeNull();
    expect(
      screen.queryByText(
        'Project access and Client read access are required for this Company.',
      ),
    ).toBeNull();
  },
);

it('retires the old Mine rows and draft before late success after current Project read access is lost', async () => {
  const transport = server();
  const identity = deterministicBrowserIdentity();
  const view = render(element(identity));
  await ready();
  changeValue(
    screen.getByRole('textbox', { name: 'Project title' }),
    'Scoped work',
  );
  transport.hold(minePath);
  choose('mine_open');
  const pending = await transport.pending(minePath);
  view.rerender(
    element(identity, {
      ...actor,
      activeCompany: {
        id: 'company',
        displayName: 'PRISMA-PRIM',
        projectPermissions: [],
      },
    }),
  );
  await screen.findByText(
    'Project access and Client read access are required for this Company.',
  );
  expect(screen.queryByRole('textbox', { name: 'Project title' })).toBeNull();
  expect(pending.signal?.aborted).toBe(true);
  await transport.release(minePath);
  expect(screen.queryByRole('list', { name: 'Projects' })).toBeNull();
});

it('retires an obsolete dossier restriction while re-reading Mine under the new Client identity', async () => {
  const transport = server();
  const identity = deterministicBrowserIdentity();
  const oldFilter = {
    clientDossierId: mine.clientDossierId,
    displayName: mine.clientDisplayName,
  };
  const oldNavigation = {
    kind: 'directory',
    requestId: 1,
    client: oldFilter,
  } satisfies NonNullable<Parameters<typeof ProjectWorkspace>[0]['navigation']>;
  const view = render(element(identity, actor, { navigation: oldNavigation }));
  await ready();
  choose('mine_open');
  await waitFor(() =>
    expect(
      rows().getByRole('button', {
        name: `${mine.title} Client: ${mine.clientDisplayName}`,
      }),
    ).toBeInTheDocument(),
  );
  transport.hold(minePath);
  transport.setMine([{ ...mine, clientDossierId: 'canonical-client' }]);
  view.rerender(
    element(identity, actor, {
      navigation: oldNavigation,
      clientIdentityRevision: 1,
    }),
  );
  await transport.pending(minePath);
  expect(rows().queryByRole('button')).toBeNull();
  await transport.release(minePath);
  await ready();
  expect(control('project-directory-view')).toHaveTextContent(
    'My open Projects',
  );
  transport.setAll([{ ...mine, clientDossierId: 'canonical-client' }]);
  choose('all');
  await ready();
  const before = transport.requests.length;
  view.rerender(
    element(identity, actor, {
      navigation: {
        kind: 'directory',
        requestId: 2,
        client: {
          clientDossierId: 'canonical-client',
          displayName: mine.clientDisplayName,
        },
      },
      clientIdentityRevision: 1,
    }),
  );
  expect(
    await screen.findByRole('button', {
      name: `${mine.title} Client: ${mine.clientDisplayName}`,
    }),
  ).toBeInTheDocument();
  expect(transport.requests).toHaveLength(before);
});

it('keeps a pending registration intact while Mine changes and defers an independent exact open until it settles', async () => {
  const transport = server();
  const identity = deterministicBrowserIdentity();
  const view = render(element(identity));
  await ready();
  transport.onWrite(() => Response.json(registered));
  changeValue(
    screen.getByRole('textbox', { name: 'Project title' }),
    registered.title,
  );
  changeValue(
    screen.getByRole('combobox', { name: 'Client' }),
    mine.clientAccountId,
  );
  transport.hold('POST /api/projects');
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
  const pending = await transport.pending('/api/projects');
  choose('mine_open');
  await waitFor(() =>
    expect(control('project-directory-view')).toHaveTextContent(
      'My open Projects',
    ),
  );
  view.rerender(
    element(identity, actor, {
      navigation: { kind: 'project', projectId: colleague.id, requestId: 1 },
    }),
  );
  expect(pending.signal?.aborted).toBe(false);
  expect(
    transport.requests.filter(
      (request) => request.path === `/api/projects/${colleague.id}`,
    ),
  ).toHaveLength(0);
  await transport.release('/api/projects');
  expect(
    await screen.findByRole('heading', { name: colleague.title }),
  ).toBeInTheDocument();
  expect(control('project-directory-view')).toHaveTextContent(
    'My open Projects',
  );
  await waitFor(() =>
    expect(
      rows().getByRole('button', {
        name: `${mine.title} Client: ${mine.clientDisplayName}`,
      }),
    ).toBeInTheDocument(),
  );
  expect(
    rows().queryByRole('button', {
      name: `${registered.title} Client: ${registered.clientDisplayName}`,
    }),
  ).toBeNull();
  expect(
    transport.requests.filter((request) => request.method === 'POST'),
  ).toHaveLength(1);
});

it('refreshes current Mine membership after the real responsible editor clears the assignment while keeping detail and Task work', async () => {
  const transport = server();
  const identity = deterministicBrowserIdentity();
  const manager: ActorContext = {
    ...actor,
    activeCompany: {
      id: 'company',
      displayName: 'PRISMA-PRIM',
      projectPermissions: ['project.read', 'project.create', 'project.update'],
      taskPermissions: ['task.read', 'task.manage'],
      taskPermissionAssignmentId: 'task-grant',
      taskPermissionSetVersion: 'v1',
    },
  };
  transport.onWrite((request) => {
    expect(request.method).toBe('PUT');
    expect(request.path).toBe(`/api/projects/${mine.id}/responsible`);
    const command: unknown = JSON.parse(request.body ?? '{}');
    expect(command).toEqual({
      expectedRevision: 1,
      workspaceMembershipId: null,
    });
    transport.clearResponsibility();
    return Response.json({
      projectId: mine.id,
      outcome: 'changed',
      revision: 2,
      responsible: null,
    });
  });
  render(element(identity, manager));
  await ready();
  choose('mine_open');
  await waitFor(() =>
    expect(
      rows().getByRole('button', {
        name: `${mine.title} Client: ${mine.clientDisplayName}`,
      }),
    ).toBeInTheDocument(),
  );
  fireEvent.click(
    rows().getByRole('button', {
      name: `${mine.title} Client: ${mine.clientDisplayName}`,
    }),
  );
  const opened = await screen.findByRole('article', { name: mine.title });
  const taskDraft = await within(
    await screen.findByRole('region', { name: 'Tasks' }),
  ).findByRole('textbox', { name: 'Task title' });
  changeValue(taskDraft, 'Independent Task work');
  fireEvent.click(
    await within(
      screen.getByRole('region', { name: 'Responsible member' }),
    ).findByRole('button', { name: 'Change' }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Clear responsible member' }),
  );
  expect(
    await screen.findByText(
      'No open Projects currently list you as responsible.',
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole('article', { name: mine.title })).toBe(opened);
  expect(taskDraft).toBeInTheDocument();
  expect(taskDraft).toHaveValue('Independent Task work');
});

it.each(['clear', 'reassign'] as const)(
  'refreshes Mine after an ordinary confirmed responsible %s despite a failed responsible reread',
  async (change) => {
    const transport = server();
    const manager: ActorContext = {
      ...changingActor,
      activeCompany: {
        ...changingActor.activeCompany,
        id: 'company',
        displayName: 'PRISMA-PRIM',
        taskPermissions: ['task.read', 'task.manage'],
        taskPermissionAssignmentId: 'task-grant',
        taskPermissionSetVersion: 'v1',
        documentPermissions: [
          'document.read',
          'document.reference.read',
          'document.project.manage',
        ],
      },
    };
    render(element(deterministicBrowserIdentity(), manager));
    await openCurrentMine();
    const opened = screen.getByRole('article', { name: mine.title });
    const taskTitle = await within(
      screen.getByRole('region', { name: 'Tasks' }),
    ).findByRole('textbox', { name: 'Task title' });
    changeValue(taskTitle, 'Independent Task {draft}');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Attach working Document' }),
    );
    const documentSearch = await screen.findByRole('searchbox', {
      name: 'Search eligible working Documents',
    });
    changeValue(documentSearch, 'Independent Document {filter}');
    const responsiblePath = `/api/projects/${mine.id}/responsible`;
    transport.hold(`GET ${responsiblePath}`);
    transport.onWrite((request) => {
      expect(request.method).toBe('PUT');
      expect(request.path).toBe(responsiblePath);
      expect(JSON.parse(request.body ?? '{}')).toEqual({
        expectedRevision: 1,
        workspaceMembershipId: change === 'clear' ? null : 'other-member',
      });
      transport.setMine([]);
      return Response.json({
        projectId: mine.id,
        outcome: 'changed',
        revision: 2,
        responsible:
          change === 'clear'
            ? null
            : {
                workspaceMembershipId: 'other-member',
                displayLabel: 'Colleague',
              },
      });
    });
    const eligiblePath = `/api/projects/${mine.id}/eligible-responsible-members`;
    transport.hold(eligiblePath);
    fireEvent.click(
      within(
        screen.getByRole('region', { name: 'Responsible member' }),
      ).getByRole('button', { name: 'Change' }),
    );
    await transport.release(
      eligiblePath,
      Response.json({
        members: [
          { workspaceMembershipId: 'member', displayLabel: 'Owner' },
          { workspaceMembershipId: 'other-member', displayLabel: 'Colleague' },
        ],
      }),
    );
    if (change === 'reassign')
      changeValue(
        screen.getByLabelText('Choose the responsible member'),
        'other-member',
      );
    fireEvent.click(
      screen.getByRole('button', {
        name: change === 'clear' ? 'Clear responsible member' : 'Save',
      }),
    );
    await screen.findByText('Responsible member saved.');
    await transport.release(
      responsiblePath,
      new Response(null, { status: 503 }),
    );
    await screen.findByText('The responsible member could not be loaded.');
    expect(
      await screen.findByText(
        'No open Projects currently list you as responsible.',
      ),
    ).toBeInTheDocument();
    expect(rows().queryByRole('button')).toBeNull();
    expect(screen.getByRole('article', { name: mine.title })).toBe(opened);
    expect(taskTitle).toBeInTheDocument();
    expect(taskTitle).toHaveValue('Independent Task {draft}');
    expect(documentSearch).toBeInTheDocument();
    expect(documentSearch).toHaveValue('Independent Document {filter}');
    expect(screen.getByText('Responsible member saved.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry responsible member change' }),
    ).toBeNull();
  },
);

it('refreshes Mine after an existing real lifecycle confirmation without discarding the readable detail', async () => {
  const transport = server();
  const identity = deterministicBrowserIdentity();
  const approver: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: 'company',
      displayName: 'PRISMA-PRIM',
      projectApproverPermissions: [
        'project.lifecycle.transition',
        'project.close',
      ],
      projectApproverPermissionAssignmentId: 'approver-grant',
      projectApproverPermissionSetVersion: 'v1',
    },
  };
  transport.onWrite((request) => {
    expect(request.method).toBe('POST');
    expect(request.path).toBe(`/api/projects/${mine.id}/lifecycle-transitions`);
    const command: unknown = JSON.parse(request.body ?? '{}');
    expect(command).toEqual({
      action: 'cancel',
      expectedLifecycleRevision: 0,
      reason: 'Explicit cancellation.',
    });
    transport.cancelProject();
    return Response.json({
      projectId: mine.id,
      action: 'cancel',
      from: 'preparatory',
      to: 'cancelled',
      lifecycleRevision: 1,
    });
  });
  render(element(identity, approver));
  await ready();
  choose('mine_open');
  await waitFor(() =>
    expect(
      rows().getByRole('button', {
        name: `${mine.title} Client: ${mine.clientDisplayName}`,
      }),
    ).toBeInTheDocument(),
  );
  fireEvent.click(
    rows().getByRole('button', {
      name: `${mine.title} Client: ${mine.clientDisplayName}`,
    }),
  );
  const detail = await screen.findByRole('article', { name: mine.title });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Cancel Project' }),
  );
  changeValue(
    screen.getByRole('textbox', { name: 'Cancellation reason' }),
    'Explicit cancellation.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Project' }));
  expect(
    await screen.findByText(
      'No open Projects currently list you as responsible.',
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole('article', { name: mine.title })).toBe(detail);
  expect(within(detail).getAllByText('Cancelled').length).toBeGreaterThan(0);
});

it('opens an exact readable Task in a Project outside Mine without requiring directory membership', async () => {
  const transport = server();
  const identity = deterministicBrowserIdentity();
  const taskReader: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: 'company',
      displayName: 'PRISMA-PRIM',
      taskPermissions: ['task.read'],
      taskPermissionAssignmentId: 'task-grant',
      taskPermissionSetVersion: 'v1',
    },
  };
  const view = render(element(identity, taskReader));
  await ready();
  choose('mine_open');
  await waitFor(() =>
    expect(
      rows().queryByRole('button', {
        name: `${colleague.title} Client: ${colleague.clientDisplayName}`,
      }),
    ).toBeNull(),
  );
  view.rerender(
    element(identity, taskReader, {
      navigation: {
        kind: 'project',
        projectId: colleague.id,
        taskId: outsideTask.id,
        requestId: 1,
      },
    }),
  );
  expect(
    await screen.findByRole('heading', { name: outsideTask.title }),
  ).toBeInTheDocument();
  expect(control('project-directory-view')).toHaveTextContent(
    'My open Projects',
  );
  expect(
    rows().queryByRole('button', {
      name: `${colleague.title} Client: ${colleague.clientDisplayName}`,
    }),
  ).toBeNull();
  expect(
    transport.requests.filter(
      (request) => request.path === `/api/tasks/${outsideTask.id}`,
    ),
  ).toHaveLength(1);
});

it('retires an unfinished initial All read before a newer Mine result becomes authoritative', async () => {
  const transport = server();
  transport.hold('/api/projects');
  render(element(deterministicBrowserIdentity()));
  const pending = await transport.pending('/api/projects');
  choose('mine_open');
  await waitFor(() =>
    expect(
      rows().getByRole('button', {
        name: `${mine.title} Client: ${mine.clientDisplayName}`,
      }),
    ).toBeInTheDocument(),
  );
  expect(pending.signal?.aborted).toBe(true);
  await transport.release('/api/projects', Response.json([colleague]));
  expect(control('project-directory-view')).toHaveTextContent(
    'My open Projects',
  );
  expect(
    rows().queryByRole('button', {
      name: `${colleague.title} Client: ${colleague.clientDisplayName}`,
    }),
  ).toBeNull();
});

it('withholds an older same-view Mine refresh while a newer refresh remains pending', async () => {
  const transport = server();
  render(element(deterministicBrowserIdentity()));
  await ready();
  choose('mine_open');
  await waitFor(() =>
    expect(
      rows().getByRole('button', {
        name: `${mine.title} Client: ${mine.clientDisplayName}`,
      }),
    ).toBeInTheDocument(),
  );
  transport.hold(minePath);
  fireEvent.click(screen.getByRole('button', { name: 'Reload this view' }));
  const pending = await transport.pending(minePath);
  fireEvent.click(screen.getByRole('button', { name: 'Reload this view' }));
  await waitFor(() =>
    expect(
      transport.requests.filter((request) => request.path === minePath),
    ).toHaveLength(3),
  );
  expect(pending.signal?.aborted).toBe(true);
  await transport.release(minePath, Response.json([colleague]));
  expect(rows().queryByRole('button')).toBeNull();
  await transport.release(minePath);
  expect(
    await screen.findByRole('button', {
      name: `${mine.title} Client: ${mine.clientDisplayName}`,
    }),
  ).toBeInTheDocument();
  expect(
    rows().queryByRole('button', {
      name: `${colleague.title} Client: ${colleague.clientDisplayName}`,
    }),
  ).toBeNull();
});

const changingActor: ActorContext = {
  ...actor,
  activeCompany: {
    ...actor.activeCompany,
    id: 'company',
    displayName: 'PRISMA-PRIM',
    projectPermissions: ['project.read', 'project.create', 'project.update'],
    projectApproverPermissions: [
      'project.lifecycle.transition',
      'project.close',
    ],
    projectApproverPermissionAssignmentId: 'approver-grant',
    projectApproverPermissionSetVersion: 'v1',
  },
};
type ConfirmedChange = 'Lifecycle' | 'Responsible';

/** Use the real child command; only its HTTP response is synthetic. */
function prepareConfirmedChange(input: {
  change: ConfirmedChange;
  transport: ReturnType<typeof server>;
  afterCommand?: () => void;
}) {
  const { change, transport, afterCommand } = input;
  transport.onWrite((request) => {
    if (change === 'Lifecycle') {
      expect(request.method).toBe('POST');
      expect(request.path).toBe(
        `/api/projects/${mine.id}/lifecycle-transitions`,
      );
      expect(JSON.parse(request.body ?? '{}')).toEqual({
        action: 'cancel',
        expectedLifecycleRevision: 0,
        reason: 'Explicit cancellation.',
      });
      transport.cancelProject();
      afterCommand?.();
      return Response.json({
        projectId: mine.id,
        action: 'cancel',
        from: 'preparatory',
        to: 'cancelled',
        lifecycleRevision: 1,
      });
    }
    expect(request.method).toBe('PUT');
    expect(request.path).toBe(`/api/projects/${mine.id}/responsible`);
    expect(JSON.parse(request.body ?? '{}')).toEqual({
      expectedRevision: 1,
      workspaceMembershipId: null,
    });
    transport.clearResponsibility();
    afterCommand?.();
    return Response.json({
      projectId: mine.id,
      outcome: 'changed',
      revision: 2,
      responsible: null,
    });
  });
}
async function submitConfirmedChange(change: ConfirmedChange) {
  if (change === 'Lifecycle') {
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel Project' }),
    );
    changeValue(
      screen.getByRole('textbox', { name: 'Cancellation reason' }),
      'Explicit cancellation.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Project' }));
    return;
  }
  fireEvent.click(
    await within(
      screen.getByRole('region', { name: 'Responsible member' }),
    ).findByRole('button', { name: 'Change' }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Clear responsible member' }),
  );
}
async function openCurrentMine() {
  await ready();
  choose('mine_open');
  const row = await waitFor(() =>
    rows().getByRole('button', {
      name: `${mine.title} Client: ${mine.clientDisplayName}`,
    }),
  );
  fireEvent.click(row);
  await screen.findByRole('article', { name: mine.title });
  await within(
    screen.getByRole('region', { name: 'Responsible member' }),
  ).findByRole('button', { name: 'Change' });
  await screen.findByRole('button', { name: 'Cancel Project' });
}

it.each(
  (['Lifecycle', 'Responsible'] as const).flatMap((change) =>
    (['detail', 'token'] as const).flatMap((held) =>
      (['Company', 'session', 'unmount'] as const).map((retirement) => ({
        change,
        held,
        retirement,
      })),
    ),
  ),
)(
  'does not resume retired $change Mine refresh after held $held and $retirement retirement',
  async ({ change, held, retirement }) => {
    const transport = server();
    const rejectSession = vi.fn(async () => undefined);
    let holdTokens = false;
    const heldTokens: Array<() => void> = [];
    const identity: BrowserIdentity = {
      ...deterministicBrowserIdentity(),
      rejectSession,
      getToken: vi.fn(async () => {
        if (holdTokens)
          await new Promise<void>((resolve) => heldTokens.push(resolve));
        return 'old-scope-token';
      }),
    };
    const view = render(element(identity, changingActor));
    await openCurrentMine();
    const detailPath = `/api/projects/${mine.id}`;
    if (held === 'detail') transport.hold(detailPath);
    prepareConfirmedChange({
      change,
      transport,
      afterCommand: () => {
        holdTokens = held === 'token';
      },
    });
    await submitConfirmedChange(change);
    const pendingDetail =
      held === 'detail' ? await transport.pending(detailPath) : undefined;
    if (held === 'token')
      await waitFor(() => expect(heldTokens.length).toBeGreaterThanOrEqual(2));
    if (retirement === 'unmount') view.unmount();
    else {
      view.rerender(
        element(
          {
            ...deterministicBrowserIdentity({
              Authorization: 'Bearer current-scope-token',
            }),
            rejectSession,
          },
          {
            ...changingActor,
            activeCompany:
              retirement === 'Company'
                ? {
                    ...changingActor.activeCompany,
                    id: 'other-company',
                    displayName: 'Other Company',
                  }
                : changingActor.activeCompany,
          },
        ),
      );
      await screen.findByRole('textbox', { name: 'Project title' });
      choose('mine_open');
      await screen.findByText(
        'No open Projects currently list you as responsible.',
      );
      expect(control('project-directory-view')).toHaveTextContent(
        'My open Projects',
      );
    }
    if (held === 'detail') expect(pendingDetail?.signal?.aborted).toBe(true);
    const beforeLateContinuation = transport.requests.length;
    if (retirement === 'Company') transport.rejectCompany('company');
    transport.rejectAuthorization('Bearer old-scope-token');
    if (held === 'detail')
      await transport.release(detailPath, new Response(null, { status: 401 }));
    else
      await act(async () => {
        holdTokens = false;
        for (const release of heldTokens.splice(0)) release();
      });
    const lateRequests = transport.requests.slice(beforeLateContinuation);
    expect(
      lateRequests.filter(
        (request) => request.authorization === 'Bearer old-scope-token',
      ),
    ).toEqual([]);
    if (retirement === 'Company')
      expect(
        lateRequests.filter((request) => request.company === 'company'),
      ).toEqual([]);
    expect(rejectSession).not.toHaveBeenCalled();
    if (retirement !== 'unmount') {
      expect(control('project-directory-view')).toHaveTextContent(
        'My open Projects',
      );
      expect(rows().queryByRole('button')).toBeNull();
    } else expect(screen.queryByRole('list', { name: 'Projects' })).toBeNull();
  },
);

it.each(['Lifecycle', 'Responsible'] as const)(
  'refreshes current Mine after confirmed %s even when the independent detail read fails',
  async (change) => {
    const transport = server();
    render(element(deterministicBrowserIdentity(), changingActor));
    await openCurrentMine();
    const opened = screen.getByRole('article', { name: mine.title });
    const detailPath = `/api/projects/${mine.id}`;
    transport.hold(detailPath);
    if (change === 'Responsible')
      transport.hold(`GET /api/projects/${mine.id}/responsible`);
    prepareConfirmedChange({ change, transport });
    await submitConfirmedChange(change);
    if (change === 'Responsible') {
      await screen.findByText('Responsible member saved.');
      // The ordinary command notifies its parent while its own read is held.
      await transport.pending(`/api/projects/${mine.id}/responsible`);
    }
    await transport.pending(detailPath);
    await transport.release(detailPath, new Response(null, { status: 503 }));
    expect(
      await screen.findByText(
        'No open Projects currently list you as responsible.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('article', { name: mine.title })).toBe(opened);
    expect(control('project-directory-view')).toHaveTextContent(
      'My open Projects',
    );
    if (change === 'Responsible')
      await transport.release(
        `/api/projects/${mine.id}/responsible`,
        new Response(null, { status: 503 }),
      );
  },
);

it('still refreshes current Mine when a newer same-scope Task detail reload supersedes a confirmed lifecycle detail read', async () => {
  const transport = server();
  const taskReader: ActorContext = {
    ...changingActor,
    activeCompany: {
      ...changingActor.activeCompany,
      id: 'company',
      displayName: 'PRISMA-PRIM',
      taskPermissions: ['task.read'],
      taskPermissionAssignmentId: 'task-grant',
      taskPermissionSetVersion: 'v1',
    },
  };
  render(element(deterministicBrowserIdentity(), taskReader));
  await openCurrentMine();
  const reloadTasks = await within(
    await screen.findByRole('region', { name: 'Tasks' }),
  ).findByRole('button', { name: 'Reload Tasks' });
  const detailPath = `/api/projects/${mine.id}`;
  transport.hold(detailPath);
  prepareConfirmedChange({ change: 'Lifecycle', transport });
  await submitConfirmedChange('Lifecycle');
  const original = await transport.pending(detailPath);
  fireEvent.click(reloadTasks);
  await waitFor(() =>
    expect(
      transport.requests.filter((request) => request.path === detailPath),
    ).toHaveLength(3),
  );
  expect(original.signal?.aborted).toBe(true);
  // The newer independent read settles first; the old confirmed-change
  // continuation still owes a current cohort read when it finally unwinds.
  await transport.releaseLatest(
    detailPath,
    new Response(null, { status: 503 }),
  );
  await transport.release(detailPath, new Response(null, { status: 503 }));
  expect(
    await screen.findByText(
      'No open Projects currently list you as responsible.',
    ),
  ).toBeInTheDocument();
  expect(control('project-directory-view')).toHaveTextContent(
    'My open Projects',
  );
});

it.each(['success', 'unavailable'] as const)(
  'refreshes recovered Mine after confirmed cancellation with a %s detail read',
  async (detailOutcome) => {
    const transport = server();
    render(element(deterministicBrowserIdentity(), changingActor));
    await ready();
    transport.hold(minePath);
    choose('mine_open');
    await transport.release(minePath, new Response(null, { status: 403 }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Project access and Client read access are required for this Company.',
    );
    transport.unhold(minePath);
    fireEvent.click(screen.getByRole('button', { name: 'Reload this view' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: `${mine.title} Client: ${mine.clientDisplayName}`,
      }),
    );
    const opened = await screen.findByRole('article', { name: mine.title });
    const detailPath = `/api/projects/${mine.id}`;
    transport.hold(detailPath);
    prepareConfirmedChange({ change: 'Lifecycle', transport });
    await submitConfirmedChange('Lifecycle');
    await transport.pending(detailPath);
    await transport.release(
      detailPath,
      detailOutcome === 'unavailable'
        ? new Response(null, { status: 503 })
        : undefined,
    );
    expect(
      await screen.findByText(
        'No open Projects currently list you as responsible.',
      ),
    ).toBeInTheDocument();
    expect(rows().queryByRole('button')).toBeNull();
    expect(screen.getByRole('article', { name: mine.title })).toBe(opened);
    expect(control('project-directory-view')).toHaveTextContent(
      'My open Projects',
    );
    expect(
      transport.requests.filter((request) => request.path === minePath),
    ).toHaveLength(3);
  },
);

it('does not revive a retired confirmed-change reply after same-view Mine recovery', async () => {
  const transport = server();
  render(element(deterministicBrowserIdentity(), changingActor));
  await openCurrentMine();
  const detailPath = `/api/projects/${mine.id}`;
  transport.hold(detailPath);
  prepareConfirmedChange({ change: 'Lifecycle', transport });
  await submitConfirmedChange('Lifecycle');
  const retiredDetail = await transport.pending(detailPath);
  transport.hold(minePath);
  fireEvent.click(screen.getByRole('button', { name: 'Reload this view' }));
  await transport.release(minePath, new Response(null, { status: 403 }));
  await screen.findByRole('alert');
  expect(retiredDetail.signal?.aborted).toBe(true);
  transport.setMine([colleague]);
  transport.unhold(minePath);
  fireEvent.click(screen.getByRole('button', { name: 'Reload this view' }));
  fireEvent.click(
    await screen.findByRole('button', {
      name: `${colleague.title} Client: ${colleague.clientDisplayName}`,
    }),
  );
  const opened = await screen.findByRole('article', { name: colleague.title });
  transport.hold(minePath);
  await transport.release(detailPath, new Response(null, { status: 503 }));
  expect(
    rows().getByRole('button', {
      name: `${colleague.title} Client: ${colleague.clientDisplayName}`,
    }),
  ).toBeInTheDocument();
  expect(screen.getByRole('article', { name: colleague.title })).toBe(opened);
  expect(
    transport.requests.filter((request) => request.path === minePath),
  ).toHaveLength(3);
});

it.each(['Company', 'session', 'unmount'] as const)(
  'retires a recovered Mine lifetime on %s change',
  async (retirement) => {
    const transport = server();
    const identity = deterministicBrowserIdentity();
    const view = render(element(identity, changingActor));
    await ready();
    transport.hold(minePath);
    choose('mine_open');
    await transport.release(minePath, new Response(null, { status: 403 }));
    await screen.findByRole('alert');
    transport.unhold(minePath);
    fireEvent.click(screen.getByRole('button', { name: 'Reload this view' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: `${mine.title} Client: ${mine.clientDisplayName}`,
      }),
    );
    await screen.findByRole('article', { name: mine.title });
    const detailPath = `/api/projects/${mine.id}`;
    transport.hold(detailPath);
    prepareConfirmedChange({ change: 'Lifecycle', transport });
    await submitConfirmedChange('Lifecycle');
    const retiredDetail = await transport.pending(detailPath);
    if (retirement === 'unmount') view.unmount();
    else {
      view.rerender(
        element(
          retirement === 'session' ? deterministicBrowserIdentity() : identity,
          retirement === 'Company'
            ? {
                ...changingActor,
                activeCompany: {
                  ...changingActor.activeCompany,
                  id: 'other-company',
                  displayName: 'Other Company',
                },
              }
            : changingActor,
        ),
      );
      await screen.findByRole('textbox', { name: 'Project title' });
      choose('mine_open');
      await screen.findByText(
        'No open Projects currently list you as responsible.',
      );
    }
    expect(retiredDetail.signal?.aborted).toBe(true);
    const requestsBeforeLateReply = transport.requests.length;
    await transport.release(detailPath, new Response(null, { status: 503 }));
    expect(transport.requests).toHaveLength(requestsBeforeLateReply);
    if (retirement === 'unmount')
      expect(screen.queryByRole('list', { name: 'Projects' })).toBeNull();
    else
      expect(
        screen.getByText('No open Projects currently list you as responsible.'),
      ).toBeInTheDocument();
  },
);
