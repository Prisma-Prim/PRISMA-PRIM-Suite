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
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
it('describes the first predecessor as never recorded, without inventing an earlier clear', async () => {
  installNextActionPublication(nextActionActor, async (path) =>
    path === nextActionPath ? Response.json(firstNextAction()) : undefined,
  );
  const { panel } = await openNextActionApp();
  const history = within(panel).getByRole('region', {
    name: 'Next action history',
  });
  expect(
    within(history).getByText('No next action recorded.'),
  ).toBeInTheDocument();
  expect(
    within(history).queryByText('The next action was cleared.'),
  ).not.toBeInTheDocument();
});
it('retires previously protected text and the write draft when a once-readable target becomes unavailable', async () => {
  let hidden = false;
  installNextActionPublication(nextActionActor, async (path) =>
    path === nextActionPath
      ? hidden
        ? new Response(null, { status: 404 })
        : Response.json(firstNextAction('CONFIDENTIAL OLD TARGET'))
      : undefined,
  );
  const { panel, editor } = await openNextActionApp();
  fireEvent.change(editor, { target: { value: 'CONFIDENTIAL OLD DRAFT' } });
  hidden = true;
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Reload current next action' }),
  );
  await within(panel).findByText('The next action is unavailable.');
  expect(within(panel).queryAllByText('CONFIDENTIAL OLD TARGET')).toHaveLength(
    0,
  );
  expect(
    within(panel).queryByRole('textbox', { name: 'Next action' }),
  ).not.toBeInTheDocument();
});
it('keeps a stale intent blocked through older-page reads until an explicit current reload is reviewed', async () => {
  const first = firstNextAction();
  let changed = false;
  installNextActionPublication(nextActionActor, async (path, init, url) => {
    if (path !== nextActionPath) return undefined;
    if (init?.method === 'POST') {
      changed = true;
      return new Response(null, { status: 409 });
    }
    const revision = changed ? 27 : 26,
      before = url.searchParams.get('beforeRevision');
    const facts = Array.from({ length: revision }, (_, index) => ({
      revision: index + 1,
      predecessorRevision: index,
      before: index === 0 ? null : `Action ${index}`,
      after: `Action ${index + 1}`,
      attribution: first.current.lastChange,
    }))
      .reverse()
      .filter((fact) => before === null || fact.revision < Number(before));
    const entries = facts.slice(0, 25),
      hasMore = facts.length > 25;
    return Response.json({
      current: { ...first.current, revision, text: `Action ${revision}` },
      history: {
        entries,
        hasMore,
        nextBeforeRevision: hasMore ? entries.at(-1)?.revision : null,
      },
    });
  });
  const { panel, editor } = await openNextActionApp();
  fireEvent.change(editor, {
    target: { value: 'Stale draft retained for review' },
  });
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Replace next action' }),
  );
  const conflict =
    'The Project or next action changed. Reload and review before submitting again.';
  await within(panel).findByText(conflict);
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Older next action changes' }),
  );
  const history = within(panel).getByRole('region', {
    name: 'Next action history',
  });
  await within(history).findByRole('article', { name: 'Revision 1' });
  await act(async () => {
    await Promise.resolve();
  });
  expect(within(panel).getByText(conflict)).toBeInTheDocument();
  expect(editor).toBeDisabled();
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Reload current next action' }),
  );
  await waitFor(() => expect(editor).toBeEnabled());
  expect(editor).toHaveValue('Stale draft retained for review');
});
it('opens exact older history, retains the current record and moves keyboard focus to the loaded history', async () => {
  const first = firstNextAction('Action 1'),
    attribution = first.current.lastChange,
    current = { ...first.current, revision: 26, text: 'Action 26' };
  const entries = Array.from({ length: 25 }, (_, index) => ({
    revision: 26 - index,
    predecessorRevision: 25 - index,
    before: `Action ${25 - index}`,
    after: `Action ${26 - index}`,
    attribution,
  }));
  installNextActionPublication(nextActionActor, async (path, _init, url) => {
    if (path !== nextActionPath) return undefined;
    return Response.json({
      current,
      history:
        url.searchParams.get('beforeRevision') === '2'
          ? first.history
          : { entries, hasMore: true, nextBeforeRevision: 2 },
    });
  });
  const { panel } = await openNextActionApp(),
    history = within(panel).getByRole('region', {
      name: 'Next action history',
    });
  const older = within(history).getByRole('button', {
    name: 'Older next action changes',
  });
  older.focus();
  fireEvent.click(older);
  expect(
    await within(history).findByRole('article', { name: 'Revision 1' }),
  ).toBeInTheDocument();
  expect(
    within(panel).getByText('Action 26', { exact: true, selector: 'p' }),
  ).toBeInTheDocument();
  expect(
    within(history).getByRole('heading', { name: 'Next action history' }),
  ).toHaveFocus();
});
