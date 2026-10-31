import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
import { preparatoryLifecycle } from './project/project-lifecycle.test-fixtures';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
it('never transiently enables a refreshed editor before its matching lifecycle observation arrives', async () => {
  const first = firstNextAction('Initial action'),
    saved = { ...first.current, revision: 2, text: 'Replacement action' };
  let recorded = false,
    holdLifecycle = false,
    releaseRead: ((response: Response) => void) | undefined,
    releaseLifecycle: ((response: Response) => void) | undefined;
  installNextActionPublication(nextActionActor, async (path, init) => {
    if (path === nextActionPath) {
      if (init?.method === 'POST') {
        recorded = true;
        return Response.json({
          format: 'project-next-action-command-v1',
          outcome: 'changed',
          record: saved,
        });
      }
      if (recorded)
        return new Promise((resolve) => {
          releaseRead = resolve;
        });
      return Response.json(first);
    }
    if (path.endsWith('/lifecycle') && holdLifecycle)
      return new Promise((resolve) => {
        releaseLifecycle = resolve;
      });
    return undefined;
  });
  const { panel, editor } = await openNextActionApp();
  fireEvent.change(editor, { target: { value: 'Replacement action' } });
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Replace next action' }),
  );
  await waitFor(() => expect(releaseRead).toBeTypeOf('function'));
  expect(editor).toBeDisabled();
  const enabledBeforeLifecycle: MutationRecord[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records)
      if (record.oldValue === null) enabledBeforeLifecycle.push(record);
  });
  observer.observe(editor, {
    attributes: true,
    attributeFilter: ['disabled'],
    attributeOldValue: true,
  });
  try {
    holdLifecycle = true;
    await act(async () => {
      releaseRead?.(
        Response.json({
          current: saved,
          history: {
            entries: [
              {
                revision: 2,
                predecessorRevision: 1,
                before: 'Initial action',
                after: 'Replacement action',
                attribution: saved.lastChange,
              },
              ...first.history.entries,
            ],
            hasMore: false,
            nextBeforeRevision: null,
          },
        }),
      );
    });
    await waitFor(() => expect(releaseLifecycle).toBeTypeOf('function'));
    // A disabled-attribute addition whose old value was absent proves that the
    // public control became enabled in between, even within one browser turn.
    expect(enabledBeforeLifecycle).toHaveLength(0);
    expect(editor).toBeDisabled();
    await act(async () => {
      releaseLifecycle?.(Response.json(preparatoryLifecycle));
    });
    await waitFor(() => expect(editor).toBeEnabled());
  } finally {
    observer.disconnect();
    releaseRead?.(new Response(null, { status: 503 }));
    releaseLifecycle?.(new Response(null, { status: 503 }));
  }
});
