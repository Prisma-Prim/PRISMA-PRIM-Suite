import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import { InterfaceLocaleSelect } from './localization/InterfaceLocaleSelect';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { changeValue } from './test/select-option';
import { companyId, project } from './test/mission-applicability-app-fixture';
import {
  emptyNextAction,
  firstNextAction,
  installNextActionPublication,
  nextActionActor,
  nextActionPath,
  openNextActionApp,
} from './test/project-next-action-app';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
it.each(
  ['identity', 'company'].flatMap((retirement) =>
    ['read', 'write'].flatMap((kind) =>
      [200, 403].map((status) => ({ retirement, kind, status })),
    ),
  ),
)(
  'permanently retires held $kind HTTP $status after actual App $retirement A→B→A',
  async ({ retirement, kind, status }) => {
    const otherCompanyId = '10000000-0000-4000-8000-000000000002',
      otherActor = {
        ...nextActionActor,
        activeCompany: {
          ...nextActionActor.activeCompany,
          id: otherCompanyId,
          displayName: 'Company B DEMO',
        },
      };
    let hold = false,
      finish: ((response: Response) => void) | undefined;
    const server = installNextActionPublication(
      nextActionActor,
      async (path, init) => {
        const company = new Headers(init?.headers).get('x-company-context-id');
        if (path === '/api/companies')
          return Response.json([
            { id: companyId, displayName: 'Company DEMO' },
            { id: otherCompanyId, displayName: 'Company B DEMO' },
          ]);
        if (path === '/api/access/current-actor')
          return Response.json(
            company === otherCompanyId ? otherActor : nextActionActor,
          );
        if (
          company === otherCompanyId &&
          (path === '/api/projects' || path === '/api/clients')
        )
          return Response.json([]);
        if (
          path === nextActionPath &&
          hold &&
          (kind === 'write' ? init?.method === 'POST' : init?.method !== 'POST')
        ) {
          hold = false;
          return new Promise((resolve) => {
            finish = resolve;
          });
        }
        return undefined;
      },
    );
    const original = await openNextActionApp();
    hold = true;
    if (kind === 'read')
      fireEvent.click(
        within(original.panel).getByRole('button', {
          name: 'Reload current next action',
        }),
      );
    else {
      fireEvent.change(original.editor, {
        target: { value: 'RETIRED PARENT ACTION SENTINEL' },
      });
      fireEvent.click(
        within(original.panel).getByRole('button', {
          name: 'Save next action',
        }),
      );
    }
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    if (retirement === 'identity') {
      original.view.rerender(
        <StrictMode>
          <InterfaceLocaleSelect />
          <App identity={deterministicBrowserIdentity()} />
        </StrictMode>,
      );
      await screen.findByRole('region', { name: 'Projects' });
      original.view.rerender(
        <StrictMode>
          <InterfaceLocaleSelect />
          <App identity={original.identity} />
        </StrictMode>,
      );
    } else {
      changeValue(
        screen.getByRole('combobox', { name: 'Active Company' }),
        otherCompanyId,
      );
      await waitFor(() =>
        expect(
          screen.getByRole('combobox', { name: 'Active Company' }),
        ).toHaveAttribute('data-value', otherCompanyId),
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
    }
    const projects = await screen.findByRole('region', { name: 'Projects' });
    fireEvent.click(
      await within(projects).findByRole('button', {
        name: new RegExp(project.title),
      }),
    );
    const panel = await screen.findByRole('region', {
      name: 'Project next action',
    });
    await within(panel).findByText('No next action recorded.');
    const editor = await within(panel).findByRole('textbox', {
      name: 'Next action',
    });
    await waitFor(() => expect(editor).toBeEnabled());
    editor.focus();
    const before = server.counts(),
      stale = firstNextAction('RETIRED PARENT ACTION SENTINEL');
    await act(async () => {
      finish?.(
        status === 403
          ? new Response(null, { status })
          : Response.json(
              kind === 'read'
                ? stale
                : {
                    format: 'project-next-action-command-v1',
                    outcome: 'changed',
                    record: stale.current,
                  },
            ),
      );
    });
    expect(
      screen.queryByText('RETIRED PARENT ACTION SENTINEL'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Next action saved.')).not.toBeInTheDocument();
    expect(server.counts()).toEqual(before);
    expect(editor).toHaveFocus();
  },
);
it('preserves literal dirty text, control identity, focus and pending-free reads through all four locales and frame changes', async () => {
  const server = installNextActionPublication(nextActionActor, async (path) =>
    path === nextActionPath ? Response.json(emptyNextAction()) : undefined,
  );
  const { editor } = await openNextActionApp();
  fireEvent.change(editor, {
    target: { value: 'Literal Ж / 🌍\nunchanged draft' },
  });
  editor.focus();
  const before = server.counts();
  for (const locale of ['ro', 'fr', 'ru', 'en']) {
    const picker = document.getElementById('interface-locale');
    if (!picker) throw new Error('Missing native locale control.');
    changeValue(picker, locale);
    expect(editor.isConnected).toBe(true);
    expect(editor).toHaveValue('Literal Ж / 🌍\nunchanged draft');
    // Locale selection is a deliberate focus move; the business control remains the same node.
    editor.focus();
    expect(editor).toHaveFocus();
  }
  for (const frame of ['classic', 'prisme']) {
    act(() => {
      const url = new URL(window.location.href);
      url.searchParams.set('frame', frame);
      window.history.pushState(window.history.state, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(editor.isConnected).toBe(true);
    expect(editor).toHaveFocus();
    expect(editor).toHaveValue('Literal Ж / 🌍\nunchanged draft');
  }
  expect(server.counts()).toEqual(before);
});
