import { afterEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { TaskResults } from './TaskResults';
import { selectOption } from '../test/select-option';

const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'DEMO',
  displayName: 'Owner DEMO',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company',
    displayName: 'Company DEMO',
    projectPermissions: ['project.read'],
    projectPermissionAssignmentId: 'projects',
    projectPermissionSetVersion: 'v2',
    taskPermissions: ['task.read', 'task.manage'],
    taskPermissionAssignmentId: 'tasks',
    taskPermissionSetVersion: 'v1',
    taskResultPermissions: ['task.result.record'],
    taskResultRecorderAssignmentId: 'recorder',
    taskResultRecorderPermissionSetVersion: 'v1',
    clientPermissions: ['client.read'],
    clientPermissionAssignmentId: 'clients',
    clientPermissionSetVersion: 'v2',
    documentPermissions: [
      'document.read',
      'document.content.read',
      'document.mission_deliverable.access',
    ],
    documentPermissionSetVersion: 'v3',
    documentPermissionAssignmentId: 'documents',
    documentContentReaderAssignmentId: 'reader',
    documentContentReaderPermissionSetVersion: 'v1',
    missionDeliverableAccessAssignmentId: 'mission',
    missionDeliverableAccessPermissionSetVersion: 'v1',
  },
};
const reference = {
  documentId: 'document',
  versionId: 'version',
  versionNumber: 1,
  title: 'Mission output DEMO',
  status: 'official',
  representationId: 'pdf',
};
const attribution = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  displayName: 'Owner DEMO',
};
const declaration = {
  id: 'result',
  revision: 1,
  kind: 'recorded',
  declaration: 'Prepared mission output DEMO',
  actor: attribution,
  occurredAt: '2026-10-24T00:00:00.000Z',
  reference,
};
const snapshot = {
  taskId: 'task',
  projectId: 'project',
  taskTitle: 'Prepare output DEMO',
  taskVersion: 1,
  revision: 0,
  mutable: true,
  current: null,
};
const identity = deterministicBrowserIdentity();
afterEach(() => vi.unstubAllGlobals());

it('records against a named frozen Version, refreshes the confirmed current declaration and leaves ordinary Task commands alone', async () => {
  const commands: { body: unknown; key: string | null; url: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        commands.push({
          body: JSON.parse(String(options.body)),
          key: new Headers(options.headers).get('idempotency-key'),
          url,
        });
        return Response.json(
          {
            action: 'recorded',
            taskId: 'task',
            resultId: 'result',
            resultRevision: 1,
          },
          { status: 201 },
        );
      }
      if (url.endsWith('/eligible-versions'))
        return Response.json({
          taskId: 'task',
          mutable: true,
          versions: [reference],
        });
      if (url.endsWith('/history'))
        return Response.json({
          taskId: 'task',
          declarations: commands.length ? [declaration] : [],
          hasMore: false,
          nextBeforeRevision: null,
        });
      return Response.json(
        commands.length
          ? { ...snapshot, revision: 1, current: declaration }
          : snapshot,
      );
    }),
  );
  render(
    <TaskResults
      actor={actor}
      identity={identity}
      taskId="task"
      projectId="project"
      observedTaskVersion={1}
    />,
  );
  expect(await screen.findByText('No declared result.')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Result declaration'), {
    target: { value: '  Prepared mission output DEMO  ' },
  });
  selectOption(screen.getByLabelText('Frozen mission Version'), 'version');
  fireEvent.click(screen.getByRole('button', { name: 'Record result' }));
  expect(await screen.findByText('Result confirmed.')).toBeVisible();
  expect(await screen.findByText('Prepared mission output DEMO')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Download exact PDF · Version 1' }),
  ).toBeEnabled();
  await waitFor(() => expect(commands).toHaveLength(1));
  expect(commands[0]).toEqual({
    url: '/api/tasks/task/results',
    key: expect.any(String),
    body: {
      declaration: 'Prepared mission output DEMO',
      documentId: 'document',
      versionId: 'version',
      expectedTaskVersion: 1,
      expectedResultRevision: 0,
    },
  });
});

function installTransport(input: {
  current?: () => unknown | Response;
  post?: (request: RequestInit) => Promise<Response> | Response;
  history?: () => unknown;
  download?: () => Promise<Response> | Response;
  versions?: () => unknown;
}) {
  const fetcher = vi.fn(async (url: string, request?: RequestInit) => {
    if (request?.method === 'POST')
      return input.post?.(request) ?? new Response(null, { status: 503 });
    if (url.includes('/content/'))
      return (
        input.download?.() ??
        new Response('%PDF-DEMO', {
          headers: { 'content-type': 'application/pdf' },
        })
      );
    if (url.endsWith('/eligible-versions'))
      return Response.json(
        input.versions?.() ?? {
          taskId: 'task',
          mutable: true,
          versions: [reference],
        },
      );
    if (url.includes('/history'))
      return Response.json(
        input.history?.() ?? {
          taskId: 'task',
          declarations: [declaration],
          hasMore: false,
          nextBeforeRevision: null,
        },
      );
    const current = input.current?.() ?? snapshot;
    return current instanceof Response ? current : Response.json(current);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
function show(
  input: {
    actor?: ActorContext;
    taskId?: string;
    observedTaskVersion?: number;
    identity?: typeof identity;
  } = {},
) {
  return (
    <TaskResults
      actor={input.actor ?? actor}
      identity={input.identity ?? identity}
      taskId={input.taskId ?? 'task'}
      projectId="project"
      observedTaskVersion={input.observedTaskVersion ?? 1}
    />
  );
}
async function recordResult() {
  await screen.findByText('No declared result.');
  fireEvent.change(screen.getByLabelText('Result declaration'), {
    target: { value: 'A result DEMO' },
  });
  selectOption(screen.getByLabelText('Frozen mission Version'), 'version');
  fireEvent.click(screen.getByRole('button', { name: 'Record result' }));
}
function receipt() {
  return Response.json(
    {
      action: 'recorded',
      taskId: 'task',
      resultId: 'result',
      resultRevision: 1,
    },
    { status: 201 },
  );
}

it('preserves exact uncertain body/key/observations through an ordinary Task close and confirms the historical retry without making it current', async () => {
  const commands: RequestInit[] = [];
  let closed = false;
  const latest = {
    ...declaration,
    id: 'later',
    revision: 2,
    kind: 'corrected',
    predecessorId: 'result',
    reason: 'Later correction',
    declaration: 'Current corrected output DEMO',
  };
  installTransport({
    current: () =>
      closed
        ? {
            ...snapshot,
            mutable: false,
            taskVersion: 2,
            revision: 2,
            current: latest,
          }
        : snapshot,
    post: (request) => {
      commands.push(request);
      return commands.length === 1
        ? new Response(null, { status: 503 })
        : receipt();
    },
  });
  const view = render(show());
  await recordResult();
  await screen.findByRole('button', { name: 'Retry exact result command' });
  closed = true;
  view.rerender(show({ observedTaskVersion: 2 }));
  await screen.findByText('Current corrected output DEMO');
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry exact result command' }),
  );
  await screen.findByText('Result confirmed.');
  await screen.findByText('Current corrected output DEMO');
  expect(
    screen.queryByText('Prepared mission output DEMO'),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(commands).toHaveLength(2));
  expect(commands[1]?.body).toBe(commands[0]?.body);
  expect(new Headers(commands[1]?.headers).get('idempotency-key')).toBe(
    new Headers(commands[0]?.headers).get('idempotency-key'),
  );
  expect(JSON.parse(String(commands[1]?.body))).toMatchObject({
    expectedTaskVersion: 1,
    expectedResultRevision: 0,
  });
});

it('explains an empty eligible selector and leaves the ordinary Task independent', async () => {
  installTransport({
    versions: () => ({ taskId: 'task', mutable: true, versions: [] }),
  });
  render(show());
  await screen.findByText(
    'Associate a frozen mission deliverable PDF with this Project before recording a result.',
  );
  expect(screen.getByText('No declared result.')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Record result' }),
  ).not.toBeInTheDocument();
});

it('refuses invalid local text before dispatch and accepts a corrected deliberate intention', async () => {
  const fetcher = installTransport({});
  render(show());
  await screen.findByText('No declared result.');
  selectOption(screen.getByLabelText('Frozen mission Version'), 'version');
  fireEvent.change(screen.getByLabelText('Result declaration'), {
    target: { value: 'x'.repeat(2001) },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Record result' }));
  await screen.findByText(
    'Enter a declaration, a frozen Version and, for a correction, a reason within the displayed limits.',
  );
  expect(
    fetcher.mock.calls.filter(([, request]) => request?.method === 'POST'),
  ).toHaveLength(0);
});

it('ignores a late authenticated PDF response after the selected Task retires', async () => {
  let resolve: ((response: Response) => void) | undefined;
  const create = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() });
  installTransport({
    current: () => ({ ...snapshot, revision: 1, current: declaration }),
    download: () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  });
  const view = render(show());
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Download exact PDF · Version 1',
    }),
  );
  await screen.findByText('Downloading exact PDF…');
  view.rerender(show({ taskId: 'another' }));
  if (!resolve) throw new Error('Missing pending download');
  resolve(
    new Response('%PDF-DEMO', {
      headers: { 'content-type': 'application/pdf' },
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByText('Downloading exact PDF…'),
    ).not.toBeInTheDocument(),
  );
  expect(create).not.toHaveBeenCalled();
});

it('keeps a confirmed command confirmed when refresh fails, offering GET reload without resending', async () => {
  let committed = false;
  let unavailable = true;
  const fetcher = installTransport({
    post: () => {
      committed = true;
      return receipt();
    },
    current: () =>
      !committed
        ? snapshot
        : unavailable
          ? new Response(null, { status: 503 })
          : { ...snapshot, revision: 1, current: declaration },
  });
  render(show());
  await recordResult();
  await screen.findByText('Result confirmed.');
  await screen.findByText('The Task result could not be loaded.');
  expect(
    screen.queryByRole('button', { name: 'Retry exact result command' }),
  ).not.toBeInTheDocument();
  unavailable = false;
  fireEvent.click(screen.getByRole('button', { name: 'Reload result' }));
  await screen.findByText('Prepared mission output DEMO');
  expect(
    fetcher.mock.calls.filter(([, request]) => request?.method === 'POST'),
  ).toHaveLength(1);
});

it.each(['wrong Task', 'wrong revision', 'missing identity'])(
  'treats a successful but %s receipt as uncertain and retries the exact command',
  async (kind) => {
    const commands: RequestInit[] = [];
    installTransport({
      post: (request) => {
        commands.push(request);
        return commands.length > 1
          ? receipt()
          : Response.json({
              action: 'recorded',
              taskId: kind === 'wrong Task' ? 'other' : 'task',
              resultRevision: kind === 'wrong revision' ? 3 : 1,
              ...(kind === 'missing identity' ? {} : { resultId: 'result' }),
            });
      },
    });
    render(show());
    await recordResult();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry exact result command' }),
    );
    await screen.findByText('Result confirmed.');
    expect(commands[1]?.body).toBe(commands[0]?.body);
    expect(new Headers(commands[1]?.headers).get('idempotency-key')).toBe(
      new Headers(commands[0]?.headers).get('idempotency-key'),
    );
  },
);

it('blocks a stale command until explicit reload, then captures fresh observations and a new key', async () => {
  let taskVersion = 1;
  const commands: RequestInit[] = [];
  installTransport({
    current: () => ({ ...snapshot, taskVersion }),
    post: (request) => {
      commands.push(request);
      taskVersion = 2;
      return new Response(null, { status: 409 });
    },
  });
  render(show());
  await recordResult();
  await screen.findByText(
    'The Task or result changed. Reload before preparing another command.',
  );
  expect(screen.getByRole('button', { name: 'Record result' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Reload result' }));
  await recordResult();
  await waitFor(() => expect(commands).toHaveLength(2));
  expect(JSON.parse(String(commands[1]?.body))).toMatchObject({
    expectedTaskVersion: 2,
  });
  expect(new Headers(commands[1]?.headers).get('idempotency-key')).not.toBe(
    new Headers(commands[0]?.headers).get('idempotency-key'),
  );
});

it('corrects an attributed result with a reason and shows ordered exact historical references', async () => {
  let corrected = false;
  const commands: RequestInit[] = [];
  const successor = {
    ...declaration,
    id: 'successor',
    revision: 2,
    kind: 'corrected',
    predecessorId: 'result',
    reason: 'Clarify output DEMO',
    declaration: 'Corrected output DEMO',
  };
  installTransport({
    current: () => ({
      ...snapshot,
      revision: corrected ? 2 : 1,
      current: corrected ? successor : declaration,
    }),
    post: (request) => {
      corrected = true;
      commands.push(request);
      return Response.json({
        action: 'corrected',
        taskId: 'task',
        resultId: 'successor',
        resultRevision: 2,
      });
    },
    history: () => ({
      taskId: 'task',
      declarations: [
        successor,
        { ...declaration, reference: { ...reference, status: 'superseded' } },
      ],
      hasMore: false,
      nextBeforeRevision: null,
    }),
  });
  render(show());
  fireEvent.click(
    await screen.findByRole('button', { name: 'Correct result' }),
  );
  fireEvent.change(screen.getByLabelText('Result declaration'), {
    target: { value: 'Corrected output DEMO' },
  });
  fireEvent.change(screen.getByLabelText('Correction reason'), {
    target: { value: '  Clarify output DEMO ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  await screen.findByText('Corrected output DEMO');
  fireEvent.click(screen.getByRole('button', { name: 'Result history' }));
  const history = await screen.findByRole('list');
  expect(within(history).getAllByRole('listitem')[0]).toHaveTextContent(
    'Corrected output DEMO',
  );
  expect(within(history).getAllByRole('listitem')[1]).toHaveTextContent(
    'Superseded · historical',
  );
  expect(JSON.parse(String(commands[0]?.body))).toEqual({
    declaration: 'Corrected output DEMO',
    documentId: 'document',
    versionId: 'version',
    expectedTaskVersion: 1,
    expectedResultRevision: 1,
    reason: 'Clarify output DEMO',
  });
});

it.each([
  { ...snapshot, taskId: 'other' },
  { ...snapshot, projectId: 'other' },
  { ...snapshot, revision: 1, current: null },
  {
    ...snapshot,
    revision: 1,
    current: { ...declaration, reference: { ...reference, status: 'draft' } },
  },
])(
  'rejects malformed or mismatched current state without exposing a declaration or write controls',
  async (current) => {
    installTransport({ current: () => current });
    render(show());
    await screen.findByText(
      'The Task result response could not be verified. Reload before continuing.',
    );
    expect(
      screen.queryByText('Prepared mission output DEMO'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Record result' }),
    ).not.toBeInTheDocument();
  },
);

it.each([
  'recorder',
  'reader',
  'mission',
  'Project capture',
  'Document capture',
  'Task',
  'Company',
  'Workspace',
  'identity',
])(
  'retires a pending command on %s replacement and ignores its late success',
  async (kind) => {
    let resolve: ((response: Response) => void) | undefined;
    const fetcher = installTransport({
      post: () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    });
    const view = render(show());
    await recordResult();
    await screen.findByText('Recording result…');
    if (!actor.activeCompany) throw new Error('Missing test Company');
    const nextActor: ActorContext = {
      ...actor,
      workspaceId: kind === 'Workspace' ? 'other' : actor.workspaceId,
      activeCompany: {
        ...actor.activeCompany,
        ...(kind === 'recorder'
          ? { taskResultRecorderAssignmentId: 'new-recorder' }
          : {}),
        ...(kind === 'reader'
          ? { documentContentReaderAssignmentId: 'new-reader' }
          : {}),
        ...(kind === 'mission'
          ? { missionDeliverableAccessAssignmentId: 'new-mission' }
          : {}),
        ...(kind === 'Project capture'
          ? { projectPermissionAssignmentId: 'new-project-grant' }
          : {}),
        ...(kind === 'Document capture'
          ? { documentPermissionAssignmentId: 'new-document-grant' }
          : {}),
        ...(kind === 'Company' ? { id: 'other' } : {}),
      },
    };
    view.rerender(
      show({
        actor: nextActor,
        taskId: kind === 'Task' ? 'other' : 'task',
        identity:
          kind === 'identity' ? deterministicBrowserIdentity() : identity,
      }),
    );
    if (!resolve) throw new Error('Missing captured command');
    resolve(receipt());
    await waitFor(() =>
      expect(screen.queryByText('Recording result…')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Result confirmed.')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry exact result command' }),
    ).not.toBeInTheDocument();
    expect(
      fetcher.mock.calls.filter(([, request]) => request?.method === 'POST'),
    ).toHaveLength(1);
  },
);

it('reads history without Recorder and shows an authorized empty state separately from access denial', async () => {
  if (!actor.activeCompany) throw new Error('Missing test Company');
  const reader: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      taskResultPermissions: [],
      taskResultRecorderAssignmentId: undefined,
    },
  };
  let denied = false;
  installTransport({
    current: () => (denied ? new Response(null, { status: 403 }) : snapshot),
  });
  render(show({ actor: reader }));
  await screen.findByText('No declared result.');
  expect(
    screen.queryByRole('button', { name: 'Record result' }),
  ).not.toBeInTheDocument();
  denied = true;
  fireEvent.click(screen.getByRole('button', { name: 'Reload result' }));
  await screen.findByText(
    'Task result access is unavailable. Ordinary Task work remains separate.',
  );
  expect(screen.queryByText('No declared result.')).not.toBeInTheDocument();
});
