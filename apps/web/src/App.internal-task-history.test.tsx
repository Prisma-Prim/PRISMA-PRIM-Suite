import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import {
  installInternalTaskApp,
  internalDetail,
  internalReceipt,
  internalSnapshot,
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

it.each([false, true])(
  'continues the exact immutable history after a legal older page; concurrent advancement=%s',
  async (advanced) => {
    const first = internalSnapshot(),
      snapshots = Array.from({ length: 27 }, (_, index) => ({
        ...first,
        version: index + 1,
        title: index === 0 ? first.title : `Recorded version ${index + 1}`,
        updatedAt: new Date(
          Date.parse(first.createdAt) + index * 1000,
        ).toISOString(),
      })),
      history = snapshots.map((after, index) => {
        const before = index === 0 ? null : snapshots[index - 1];
        if (before === undefined)
          throw new Error('Missing fixture predecessor.');
        return {
          ...internalReceipt().history,
          version: after.version,
          kind: index === 0 ? 'CREATE' : 'EDIT',
          recordedAt: after.updatedAt,
          before,
          after,
        };
      }),
      initial = snapshots[25],
      current = snapshots[advanced ? 26 : 25],
      creation = history[0],
      cursors: Array<string | null> = [];
    if (!initial || !current || !creation)
      throw new Error('Incomplete synthetic history.');
    installInternalTaskApp(async (path, init, url) => {
      if (
        path !== '/api/company-internal-tasks/' + internalTaskId ||
        init?.method === 'POST'
      )
        return undefined;
      const before = url.searchParams.get('beforeVersion');
      cursors.push(before);
      return Response.json({
        ...internalDetail(),
        task: before === null && cursors.length === 1 ? initial : current,
        history:
          before === null
            ? history
                .slice(
                  advanced && cursors.length > 1 ? 2 : 1,
                  advanced && cursors.length > 1 ? 27 : 26,
                )
                .reverse()
            : before === '3'
              ? history.slice(0, 2).reverse()
              : [creation],
        nextBeforeVersion:
          before === null ? (advanced && cursors.length > 1 ? 3 : 2) : null,
      });
    });
    const { panel } = await openInternalTaskApp();
    fireEvent.click(within(panel).getByRole('button', { name: first.title }));
    await within(panel).findByRole('heading', { name: initial.title });
    const timeline = panel.querySelector('.internal-task-history');
    if (!(timeline instanceof HTMLOListElement))
      throw new Error('Missing public Task history list.');
    const loaded = within(timeline).getAllByRole('listitem');
    expect(loaded).toHaveLength(25);
    expect(loaded.at(0)).toHaveTextContent('Version 26 · Save internal Task');
    expect(loaded.at(-1)).toHaveTextContent('Version 2 · Save internal Task');
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Older changes' }),
    );
    if (advanced) {
      await within(timeline).findByText('Version 27 · Save internal Task');
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Older changes' }),
      );
    }
    await within(timeline).findByText('Version 1 · Create internal Task');
    expect(cursors).toEqual(advanced ? [null, '2', null, '3'] : [null, '2']);
    expect(
      within(panel).queryByRole('button', { name: 'Older changes' }),
    ).not.toBeInTheDocument();
    const retained = within(timeline).getAllByRole('listitem');
    expect(retained).toHaveLength(advanced ? 27 : 26);
    expect(retained.at(0)).toHaveTextContent(
      advanced
        ? 'Version 27 · Save internal Task'
        : 'Version 26 · Save internal Task',
    );
    expect(retained.at(-1)).toHaveTextContent(
      'Version 1 · Create internal Task',
    );
  },
);

const detailPath = '/api/company-internal-tasks/' + internalTaskId;
const draftTitle = 'Literal unfinished internal intent Ж';
const draftDescription = 'Keep <b>literal</b> text.\n  Keep its second line.';
function syntheticHistory(count: number, savedIntent = false) {
  const first = internalSnapshot(),
    snapshots = Array.from({ length: count }, (_, index) => ({
      ...first,
      version: index + 1,
      title:
        savedIntent && index === count - 1
          ? draftTitle
          : index === 0
            ? first.title
            : 'Recorded version ' + (index + 1),
      description: savedIntent && index === count - 1 ? draftDescription : null,
      updatedAt: new Date(
        Date.parse(first.createdAt) + index * 1000,
      ).toISOString(),
    })),
    history = snapshots.map((after, index) => {
      const before = index === 0 ? null : snapshots[index - 1];
      if (before === undefined) throw new Error('Missing fixture predecessor.');
      return {
        ...internalReceipt().history,
        version: after.version,
        kind: index === 0 ? 'CREATE' : 'EDIT',
        recordedAt: after.updatedAt,
        before,
        after,
      };
    });
  function page(head: number, before?: number) {
    const task = snapshots[head - 1],
      end = before === undefined ? head : Math.min(head, before - 1);
    if (!task) throw new Error('Missing synthetic current version.');
    return {
      ...internalDetail(),
      task,
      history: history.slice(Math.max(0, end - 25), end).reverse(),
      nextBeforeVersion: end > 25 ? end - 24 : null,
    };
  }
  function receipt(head: number) {
    const task = snapshots[head - 1],
      fact = history[head - 1];
    if (!task || !fact) throw new Error('Missing synthetic saved version.');
    return { ...internalReceipt(), task, history: fact };
  }
  return { page, receipt };
}
async function openHistory() {
  const app = await openInternalTaskApp();
  fireEvent.click(
    within(app.panel).getByRole('button', { name: internalSnapshot().title }),
  );
  await within(app.panel).findByRole('heading', {
    name: 'Recorded version 26',
  });
  const editor = within(app.panel).getByRole('form', {
      name: 'Save internal Task',
    }),
    title = within(editor).getByRole('textbox', { name: 'Task title' }),
    description = within(editor).getByRole('textbox', { name: 'Instructions' }),
    timeline = app.panel.querySelector('.internal-task-history'),
    owner = editor.parentElement;
  if (!(timeline instanceof HTMLOListElement))
    throw new Error('Missing public Task history.');
  if (!(owner instanceof HTMLDivElement))
    throw new Error('Missing native Task editor owner.');
  return { ...app, editor, title, description, timeline, owner };
}
async function older(panel: HTMLElement) {
  const button = within(panel).getByRole('button', { name: 'Older changes' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}
it.each([false, true])(
  'continues all facts after two loaded pages; advancement=%s',
  async (advanced) => {
    const fixture = syntheticHistory(52),
      cursors: Array<number | null> = [];
    let head = 51;
    installInternalTaskApp(async (path, _init, url) => {
      if (path !== detailPath) return undefined;
      const cursor = url.searchParams.get('beforeVersion'),
        before = cursor === null ? undefined : Number(cursor);
      cursors.push(before ?? null);
      if (advanced && before === 2) head = 52;
      return Response.json(fixture.page(head, before));
    });
    const { panel } = await openInternalTaskApp();
    fireEvent.click(
      within(panel).getByRole('button', { name: internalSnapshot().title }),
    );
    await within(panel).findByRole('heading', { name: 'Recorded version 51' });
    const timeline = panel.querySelector('.internal-task-history');
    if (!(timeline instanceof HTMLOListElement))
      throw new Error('Missing public Task history.');
    await older(panel);
    await within(timeline).findByText('Version 2 · Save internal Task');
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(50);
    await older(panel);
    if (advanced) {
      await within(timeline).findByText('Version 52 · Save internal Task');
      expect(within(timeline).getAllByRole('listitem')).toHaveLength(25);
      await older(panel);
      await within(timeline).findByText('Version 3 · Save internal Task');
      await older(panel);
    }
    await within(timeline).findByText('Version 1 · Create internal Task');
    const rows = within(timeline).getAllByRole('listitem'),
      expectedHead = advanced ? 52 : 51;
    expect(rows).toHaveLength(expectedHead);
    for (const [index, row] of rows.entries())
      expect(row).toHaveTextContent(
        'Version ' +
          (expectedHead - index) +
          ' · ' +
          (expectedHead - index === 1 ? 'Create' : 'Save') +
          ' internal Task',
      );
    expect(
      within(panel).queryByRole('button', { name: 'Older changes' }),
    ).not.toBeInTheDocument();
    expect(cursors).toEqual(
      advanced ? [null, 27, 2, null, 28, 3] : [null, 27, 2],
    );
  },
);
it.each(['draft', 'uncertain'])(
  'preserves the literal %s and observed command through newer history',
  async (phase) => {
    const fixture = syntheticHistory(27, phase === 'uncertain'),
      writes: Array<{ body: BodyInit | null | undefined; key: string | null }> =
        [];
    let head = 26;
    installInternalTaskApp(async (path, init, url) => {
      if (path === detailPath + '/changes' && init?.method === 'POST') {
        writes.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        if (writes.length === 1) throw new TypeError('Synthetic lost response');
        return Response.json(fixture.receipt(27));
      }
      if (path !== detailPath) return undefined;
      const cursor = url.searchParams.get('beforeVersion'),
        before = cursor === null ? undefined : Number(cursor);
      if (before === 2) head = 27;
      return Response.json(fixture.page(head, before));
    });
    const original = await openHistory();
    fireEvent.change(original.title, { target: { value: draftTitle } });
    fireEvent.change(original.description, {
      target: { value: draftDescription },
    });
    if (phase === 'uncertain') {
      fireEvent.click(
        within(original.editor).getByRole('button', {
          name: 'Save internal Task',
        }),
      );
      await within(original.panel).findByRole('button', {
        name: 'Retry the same command',
      });
    }
    await older(original.panel);
    await within(original.timeline).findByText(
      'Version 27 · Save internal Task',
    );
    expect(original.title.isConnected).toBe(true);
    expect(original.title).toHaveValue(draftTitle);
    expect(original.description).toHaveValue(draftDescription);
    expect(
      within(original.editor).getByRole('button', {
        name: 'Save internal Task',
      }),
    ).toBeDisabled();
    await older(original.panel);
    await within(original.timeline).findByText(
      'Version 1 · Create internal Task',
    );
    expect(within(original.timeline).getAllByRole('listitem')).toHaveLength(27);
    if (phase === 'uncertain') {
      expect(writes).toHaveLength(1);
      expect(writes[0]?.key).toBeTruthy();
      expect(JSON.parse(String(writes[0]?.body))).toEqual({
        kind: 'EDIT',
        expectedVersion: 26,
        title: draftTitle,
        description: draftDescription,
        assigneeMembershipId: null,
        dueDate: null,
        priority: 'normal',
      });
      expect(
        within(original.owner).getByRole('button', {
          name: 'Reload and review',
        }),
      ).toBeDisabled();
      fireEvent.click(
        within(original.panel).getByRole('button', {
          name: 'Retry the same command',
        }),
      );
      await within(original.panel).findByText('Internal Task saved.');
      expect(writes).toHaveLength(2);
      expect(writes[1]).toEqual(writes[0]);
    } else {
      expect(writes).toHaveLength(0);
      expect(within(original.panel).getByRole('alert')).toHaveTextContent(
        'The Task changed. Reload and review before a fresh change.',
      );
      fireEvent.click(
        within(original.owner).getByRole('button', {
          name: 'Reload and review',
        }),
      );
      await waitFor(() =>
        expect(original.title).toHaveValue('Recorded version 27'),
      );
      expect(original.description).toHaveValue('');
      expect(
        within(original.editor).getByRole('button', {
          name: 'Save internal Task',
        }),
      ).toBeEnabled();
    }
  },
);
it.each([
  { failure: 'transport', message: 'The current view could not be refreshed.' },
  { failure: '503', message: 'The current view could not be refreshed.' },
  { failure: 'malformed', message: 'The Internal Task response is invalid.' },
  {
    failure: 'unsupported',
    message: 'This Internal Task format is unsupported.',
  },
])(
  'retains the accepted page and draft through a truthful $failure restart failure',
  async ({ failure, message }) => {
    const fixture = syntheticHistory(27);
    let head = 26,
      failed = false;
    installInternalTaskApp(async (path, _init, url) => {
      if (path !== detailPath) return undefined;
      const cursor = url.searchParams.get('beforeVersion'),
        before = cursor === null ? undefined : Number(cursor);
      if (before === 2) head = 27;
      if (head === 27 && before === undefined && !failed) {
        failed = true;
        if (failure === 'transport') throw new TypeError('Synthetic read loss');
        if (failure === '503') return new Response(null, { status: 503 });
        return Response.json({
          ...fixture.page(27),
          ...(failure === 'malformed'
            ? { history: [] }
            : { format: 'future-internal-detail' }),
        });
      }
      return Response.json(fixture.page(head, before));
    });
    const original = await openHistory();
    fireEvent.change(original.title, { target: { value: draftTitle } });
    await older(original.panel);
    await within(original.panel).findByText(message);
    expect(original.title).toHaveValue(draftTitle);
    expect(
      within(original.panel).getByRole('heading', {
        name: 'Recorded version 26',
      }),
    ).toBeInTheDocument();
    expect(within(original.timeline).getAllByRole('listitem')).toHaveLength(25);
    expect(
      within(original.timeline).queryByText('Version 27 · Save internal Task'),
    ).not.toBeInTheDocument();
    await older(original.panel);
    await within(original.timeline).findByText(
      'Version 27 · Save internal Task',
    );
    await older(original.panel);
    await within(original.timeline).findByText(
      'Version 1 · Create internal Task',
    );
    expect(within(original.timeline).getAllByRole('listitem')).toHaveLength(27);
    expect(original.title).toHaveValue(draftTitle);
  },
);
it.each(
  ['older', 'restart'].flatMap((stage) =>
    [200, 403].map((status) => ({ stage, status })),
  ),
)(
  'retires held $stage HTTP$status before equal-permission revoke/regrant without late effects',
  async ({ stage, status }) => {
    const fixture = syntheticHistory(27);
    let head = 26,
      held = false,
      finish: ((value: Response) => void) | undefined;
    const server = installInternalTaskApp(async (path, _init, url) => {
      if (path !== detailPath) return undefined;
      const cursor = url.searchParams.get('beforeVersion'),
        before = cursor === null ? undefined : Number(cursor);
      if (before === 2) head = 27;
      if (
        !held &&
        ((stage === 'older' && before === 2) ||
          (stage === 'restart' && head === 27 && before === undefined))
      ) {
        held = true;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      return Response.json(fixture.page(head, before));
    });
    const original = await openHistory();
    fireEvent.change(original.title, { target: { value: draftTitle } });
    await older(original.panel);
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).getByRole('link', { name: 'Projects' }),
    );
    const projects = await screen.findByRole('region', { name: 'Projects' }),
      projectTitle = await within(projects).findByRole('textbox', {
        name: 'Project title',
      });
    fireEvent.change(projectTitle, {
      target: { value: 'Independent Project intent during history read' },
    });
    await publishInternalActor('revoke');
    await publishInternalActor('grant');
    await screen.findByText('Fresh internal Actor DEMO');
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).getByRole('link', { name: 'Projects' }),
    );
    projectTitle.focus();
    const counts = server.counts(),
      privateReads = server.requests.filter(
        (r) => r.path === detailPath,
      ).length,
      resolveHeld = finish;
    if (!resolveHeld) throw new Error('Missing held public response.');
    await act(async () => {
      resolveHeld(
        status === 403
          ? new Response(null, { status })
          : Response.json(fixture.page(27, stage === 'older' ? 2 : undefined)),
      );
    });
    expect(server.counts()).toEqual(counts);
    expect(server.requests.filter((r) => r.path === detailPath)).toHaveLength(
      privateReads,
    );
    expect(original.title.isConnected).toBe(false);
    expect(projectTitle.isConnected).toBe(true);
    expect(projectTitle).toHaveValue(
      'Independent Project intent during history read',
    );
    expect(projectTitle).toHaveFocus();
    expect(window.location.hash).toBe('#projects');
    expect(screen.getByText('Fresh internal Actor DEMO')).toBeInTheDocument();
  },
);

it.each(['older', 'restart'])(
  'applies a held live %s response before retirement without moving independent focus',
  async (stage) => {
    const fixture = syntheticHistory(27);
    let head = 26,
      held = false,
      finish: ((value: Response) => void) | undefined;
    installInternalTaskApp(async (path, _init, url) => {
      if (path !== detailPath) return undefined;
      const cursor = url.searchParams.get('beforeVersion'),
        before = cursor === null ? undefined : Number(cursor);
      if (before === 2) head = 27;
      if (
        !held &&
        ((stage === 'older' && before === 2) ||
          (stage === 'restart' && head === 27 && before === undefined))
      ) {
        held = true;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      return Response.json(fixture.page(head, before));
    });
    const original = await openHistory();
    fireEvent.change(original.title, { target: { value: draftTitle } });
    await older(original.panel);
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).getByRole('link', { name: 'Projects' }),
    );
    const projects = await screen.findByRole('region', { name: 'Projects' }),
      projectTitle = await within(projects).findByRole('textbox', {
        name: 'Project title',
      });
    fireEvent.change(projectTitle, {
      target: { value: 'Live independent Project intent' },
    });
    projectTitle.focus();
    const resolveHeld = finish;
    if (!resolveHeld) throw new Error('Missing held live response.');
    await act(async () => {
      resolveHeld(
        Response.json(fixture.page(27, stage === 'older' ? 2 : undefined)),
      );
    });
    await waitFor(() =>
      expect(original.timeline).toHaveTextContent(
        'Version 27 · Save internal Task',
      ),
    );
    expect(projectTitle).toHaveFocus();
    expect(projectTitle).toHaveValue('Live independent Project intent');
    expect(window.location.hash).toBe('#projects');
    expect(original.title).toHaveValue(draftTitle);
    expect(original.title.isConnected).toBe(true);
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).getByRole('link', { name: 'Internal Tasks' }),
    );
    await within(original.panel).findByRole('heading', {
      name: 'Recorded version 27',
    });
    await older(original.panel);
    await within(original.timeline).findByText(
      'Version 1 · Create internal Task',
    );
    expect(within(original.timeline).getAllByRole('listitem')).toHaveLength(27);
    await publishInternalActor('revoke');
    await publishInternalActor('grant');
    expect(original.title.isConnected).toBe(false);
    expect(projectTitle.isConnected).toBe(true);
    expect(projectTitle).toHaveValue('Live independent Project intent');
  },
);
