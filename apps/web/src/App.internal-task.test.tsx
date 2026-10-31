import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import { InterfaceLocaleSelect } from './localization/InterfaceLocaleSelect';
import {
  act,
  fireEvent,
  screen,
  render,
  within,
  waitFor,
} from './test/render-with-interface-locale';
import { changeValue } from './test/select-option';
import { companyId } from './test/mission-applicability-app-fixture';
import {
  installInternalTaskApp,
  internalTaskActor,
  internalReceipt,
  internalDetail,
  internalTaskId,
  openInternalTaskApp,
  publishInternalActor,
} from './test/internal-task-app';
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#internal-tasks');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
it('keeps literal work and exact uncertain command through locale/frame changes, then retains confirmation through separate refresh failure', async () => {
  const writes: Array<{
    body: BodyInit | null | undefined;
    key: string | null;
  }> = [];
  let confirmed = false;
  installInternalTaskApp(async (path, init) => {
    if (path === '/api/company-internal-tasks' && init?.method === 'POST') {
      writes.push({
        body: init.body,
        key: new Headers(init.headers).get('idempotency-key'),
      });
      if (writes.length === 1) throw new TypeError('Synthetic response lost');
      confirmed = true;
      return Response.json(internalReceipt('Literal Ж / 🌍 task'), {
        status: 201,
      });
    }
    if (
      confirmed &&
      (path === '/api/company-internal-tasks/' + internalTaskId ||
        path === '/api/company-internal-tasks')
    )
      return new Response(null, { status: 503 });
    return undefined;
  });
  const { title, create, panel } = await openInternalTaskApp();
  fireEvent.change(title, { target: { value: ' Literal Ж / 🌍 task ' } });
  fireEvent.change(
    within(create).getByRole('textbox', { name: 'Instructions' }),
    { target: { value: '  First\r\n second literal  ' } },
  );
  fireEvent.click(
    within(create).getByRole('button', { name: 'Create internal Task' }),
  );
  await within(panel).findByRole('button', { name: 'Retry the same command' });
  for (const locale of ['ro', 'fr', 'ru', 'en']) {
    const picker = document.getElementById('interface-locale');
    if (!picker) throw new Error('Missing locale control.');
    changeValue(picker, locale);
    expect(title.isConnected).toBe(true);
    expect(title).toHaveValue(' Literal Ж / 🌍 task ');
  }
  const retry = within(panel).getByRole('button', {
    name: 'Retry the same command',
  });
  retry.focus();
  for (const frame of ['classic', 'prisme']) {
    act(() => {
      const url = new URL(window.location.href);
      url.searchParams.set('frame', frame);
      window.history.pushState(window.history.state, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(retry).toHaveFocus();
    expect(title.isConnected).toBe(true);
  }
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Retry the same command' }),
  );
  await within(panel).findByText('Internal Task saved.');
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]?.key).toBeTruthy();
  expect(
    await within(panel).findAllByText(
      'The current view could not be refreshed.',
    ),
  ).not.toHaveLength(0);
  expect(within(panel).getByText('Internal Task saved.')).toBeInTheDocument();
});
it.each(
  ['identity', 'Company', 'regrant'].flatMap((retirement) =>
    ['read', 'write'].flatMap((kind) =>
      [200, 403].map((status) => ({ retirement, kind, status })),
    ),
  ),
)(
  'retires held $kind HTTP$status permanently through actual App $retirement A→B→A',
  async ({ retirement, kind, status }) => {
    const otherId = '10000000-0000-4000-8000-000000000002',
      otherActor = {
        ...internalTaskActor,
        activeCompany: {
          ...internalTaskActor.activeCompany,
          id: otherId,
          displayName: 'Company B DEMO',
        },
      };
    let hold = false,
      finish: ((value: Response) => void) | undefined;
    const server = installInternalTaskApp(async (path, init) => {
      const company = new Headers(init?.headers).get('x-company-context-id');
      if (path === '/api/companies')
        return Response.json([
          { id: companyId, displayName: 'Company DEMO' },
          { id: otherId, displayName: 'Company B DEMO' },
        ]);
      if (path === '/api/access/current-actor' && retirement === 'Company')
        return Response.json(
          company === otherId ? otherActor : internalTaskActor,
        );
      if (
        hold &&
        (kind === 'write'
          ? path === '/api/company-internal-tasks' && init?.method === 'POST'
          : path === '/api/company-internal-tasks/' + internalTaskId)
      ) {
        hold = false;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      return undefined;
    });
    const rejectSession = vi.fn(async () => undefined),
      identity = { ...deterministicBrowserIdentity(), rejectSession },
      original = await openInternalTaskApp(identity);
    hold = true;
    if (kind === 'write') {
      fireEvent.change(original.title, {
        target: { value: 'RETIRED INTERNAL SENTINEL' },
      });
      fireEvent.click(
        within(original.create).getByRole('button', {
          name: 'Create internal Task',
        }),
      );
    } else
      fireEvent.click(
        within(original.panel).getByRole('button', {
          name: 'Internal inventory DEMO',
        }),
      );
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    if (retirement === 'identity') {
      original.view.rerender(
        <StrictMode>
          <InterfaceLocaleSelect />
          <App identity={deterministicBrowserIdentity()} />
        </StrictMode>,
      );
      await screen.findByRole('region', { name: 'Internal Tasks' });
      original.view.rerender(
        <StrictMode>
          <InterfaceLocaleSelect />
          <App identity={identity} />
        </StrictMode>,
      );
    } else if (retirement === 'Company') {
      changeValue(
        screen.getByRole('combobox', { name: 'Active Company' }),
        otherId,
      );
      await waitFor(() =>
        expect(
          screen.getByRole('combobox', { name: 'Active Company' }),
        ).toHaveAttribute('data-value', otherId),
      );
      changeValue(
        screen.getByRole('combobox', { name: 'Active Company' }),
        companyId,
      );
      await waitFor(() =>
        expect(
          screen.getByRole('combobox', { name: 'Active Company' }),
        ).toHaveAttribute('data-value', companyId),
      );
    } else {
      await publishInternalActor('revoke');
      await publishInternalActor('grant');
    }
    const nav = await screen.findByRole('navigation', {
      name: 'Primary navigation',
    });
    fireEvent.click(within(nav).getByRole('link', { name: 'Internal Tasks' }));
    const panel = await screen.findByRole('region', { name: 'Internal Tasks' }),
      create = await within(panel).findByRole('form', {
        name: 'Create internal Task',
      }),
      editor = within(create).getByRole('textbox', { name: 'Task title' });
    editor.focus();
    const before = server.counts();
    await act(async () => {
      finish?.(
        status === 403
          ? new Response(null, { status })
          : Response.json(
              kind === 'read'
                ? internalDetail('RETIRED INTERNAL SENTINEL')
                : internalReceipt('RETIRED INTERNAL SENTINEL'),
              { status: kind === 'read' ? 200 : 201 },
            ),
      );
    });
    expect(
      screen.queryByText('RETIRED INTERNAL SENTINEL'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Internal Task saved.')).not.toBeInTheDocument();
    expect(server.counts()).toEqual(before);
    expect(rejectSession).not.toHaveBeenCalled();
    expect(editor).toHaveFocus();
    expect(editor).toHaveValue('');
  },
);
it.each([404, 'unsupported', 'malformed'])(
  'reports unavailable capability/format %s without claiming an empty Company list',
  async (kind) => {
    installInternalTaskApp(async (path, init) =>
      path === '/api/company-internal-tasks' && init?.method !== 'POST'
        ? kind === 404
          ? new Response(null, { status: 404 })
          : Response.json(
              kind === 'unsupported'
                ? { format: 'future-internal-page-v2' }
                : {
                    format: 'company-internal-task-page-v1',
                    tasks: 'bad',
                    nextBeforeTaskId: null,
                  },
            )
        : undefined,
    );
    const { panel } = await openInternalTaskApp();
    await within(panel).findByText(
      kind === 404
        ? 'Internal Tasks are unavailable.'
        : kind === 'unsupported'
          ? 'This Internal Task format is unsupported.'
          : 'The Internal Task response is invalid.',
    );
    expect(
      within(panel).queryByText('No internal Tasks in this view.'),
    ).not.toBeInTheDocument();
  },
);

it.each([
  ...[
    undefined,
    null,
    5,
    {},
    [],
    'internal_task.read',
    ['internal_task.read'],
    ['internal_task.read', 'future.permission'],
  ].map((value) => ({ field: 'internalTaskPermissions', value })),
  ...[undefined, null, 5, {}, [], '', '   ', 'not-a-uuid'].map((value) => ({
    field: 'internalTaskManagerAssignmentId',
    value,
  })),
  ...[undefined, null, 5, {}, [], 'v2'].map((value) => ({
    field: 'internalTaskManagerPermissionSetVersion',
    value,
  })),
])(
  'keeps unrelated App owners usable while a malformed/future $field capture denies only Internal Tasks',
  async ({ field, value }) => {
    window.history.replaceState(null, '', '/#projects');
    const server = installInternalTaskApp(async () => undefined, {
      ...internalTaskActor,
      activeCompany: { ...internalTaskActor.activeCompany, [field]: value },
    });
    render(
      <StrictMode>
        <App identity={deterministicBrowserIdentity()} />
      </StrictMode>,
    );
    const navigation = await screen.findByRole('navigation', {
      name: 'Primary navigation',
    });
    expect(
      within(navigation).queryByRole('link', { name: 'Internal Tasks' }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(navigation).getByRole('link', { name: 'Projects' }));
    const projects = await screen.findByRole('region', { name: 'Projects' }),
      editor = await within(projects).findByRole('textbox', {
        name: 'Project title',
      });
    fireEvent.change(editor, {
      target: { value: 'Valid independent Project intent' },
    });
    expect(editor).toHaveValue('Valid independent Project intent');
    expect(
      server.requests.filter((request) =>
        request.path.startsWith('/api/company-internal-tasks'),
      ),
    ).toEqual([]);
  },
);

it('keeps status-filter failure truthful while retaining the selected Task draft', async () => {
  installInternalTaskApp(async (path, init, url) =>
    path === '/api/company-internal-tasks' &&
    init?.method !== 'POST' &&
    url.searchParams.get('status') === 'done'
      ? new Response(null, { status: 503 })
      : undefined,
  );
  const { panel } = await openInternalTaskApp();
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Internal inventory DEMO' }),
  );
  const form = await within(panel).findByRole('form', {
      name: 'Save internal Task',
    }),
    editor = within(form).getByRole('textbox', { name: 'Task title' });
  fireEvent.change(editor, {
    target: { value: 'Independent dirty Task draft' },
  });
  changeValue(
    within(panel).getAllByRole('combobox', { name: 'Status' })[0] ?? panel,
    'done',
  );
  await within(panel).findByText('The current view could not be refreshed.');
  expect(
    within(panel).queryByRole('button', { name: 'Internal inventory DEMO' }),
  ).not.toBeInTheDocument();
  expect(editor).toHaveValue('Independent dirty Task draft');
  expect(editor.isConnected).toBe(true);
});
