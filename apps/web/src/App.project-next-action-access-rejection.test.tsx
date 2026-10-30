import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from './access-composition';
import {
  act,
  fireEvent,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import {
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
it.each(['read', 'write'])(
  'retires denied %s content before a held selected-Actor recovery returns',
  async (kind) => {
    let reject = false,
      recovering = false,
      finish: ((response: Response) => void) | undefined;
    installNextActionPublication(nextActionActor, async (path, init) => {
      if (path === nextActionPath) {
        if (
          reject &&
          (kind === 'read' ? init?.method !== 'POST' : init?.method === 'POST')
        ) {
          reject = false;
          recovering = true;
          return new Response(null, { status: 403 });
        }
        return Response.json(firstNextAction('PROTECTED CURRENT ACTION'));
      }
      if (path === '/api/access/current-actor' && recovering) {
        recovering = false;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      return undefined;
    });
    const { panel, editor } = await openNextActionApp();
    fireEvent.change(editor, { target: { value: 'PRIVATE RETIRED DRAFT' } });
    reject = true;
    fireEvent.click(
      within(panel).getByRole('button', {
        name:
          kind === 'read'
            ? 'Reload current next action'
            : 'Replace next action',
      }),
    );
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    try {
      expect(
        within(panel).queryByDisplayValue('PRIVATE RETIRED DRAFT'),
      ).not.toBeInTheDocument();
      if (kind === 'read')
        expect(
          within(panel).queryAllByText('PROTECTED CURRENT ACTION'),
        ).toHaveLength(0);
      else
        expect(
          within(panel).queryAllByText('PROTECTED CURRENT ACTION').length,
        ).toBeGreaterThan(0);
    } finally {
      await act(async () => {
        finish?.(Response.json(nextActionActor));
      });
    }
  },
);
it.each(['read', 'write'])(
  'retires protected %s after401 even when the identity rejection callback fails',
  async (kind) => {
    let reject = false;
    const rejectSession = vi.fn(async () => {
      throw new Error('Synthetic identity callback failure');
    });
    installNextActionPublication(nextActionActor, async (path, init) => {
      if (path !== nextActionPath) return undefined;
      if (
        reject &&
        (kind === 'read' ? init?.method !== 'POST' : init?.method === 'POST')
      )
        return new Response(null, { status: 401 });
      return Response.json(firstNextAction('PROTECTED SESSION ACTION'));
    });
    const { panel, editor } = await openNextActionApp({
      ...deterministicBrowserIdentity(),
      rejectSession,
    });
    fireEvent.change(editor, { target: { value: 'PRIVATE SESSION DRAFT' } });
    reject = true;
    fireEvent.click(
      within(panel).getByRole('button', {
        name:
          kind === 'read'
            ? 'Reload current next action'
            : 'Replace next action',
      }),
    );
    await waitFor(() => expect(rejectSession).toHaveBeenCalled());
    expect(
      within(panel).queryAllByText('PROTECTED SESSION ACTION'),
    ).toHaveLength(0);
    expect(
      within(panel).queryByDisplayValue('PRIVATE SESSION DRAFT'),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole('button', { name: 'Retry the same action' }),
    ).not.toBeInTheDocument();
  },
);
