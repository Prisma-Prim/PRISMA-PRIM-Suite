import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import { changeValue } from './test/select-option';
import {
  company,
  otherCompany,
  currentOverview,
  id,
} from './mission-plan/current-work.fixture';
import {
  deferred,
  installCurrentWorkApp as install,
  openCurrentWork as open,
  CurrentWorkLocaleProbe as LocaleProbe,
  resetCurrentWorkApp,
  restoreCurrentWorkApp,
} from './mission-plan/current-work-app.test-support';
describe('Configured current work through the actual App HTTP/native parents', () => {
  beforeEach(resetCurrentWorkApp);
  afterEach(restoreCurrentWorkApp);
  it('loads every local window, preserves all four locales/literals/focus with no I/O, opens the exact native Task and returns freshly at the retained window', async () => {
    const state = install();
    render(
      <>
        <LocaleProbe />
        <App identity={deterministicBrowserIdentity()} />
      </>,
    );
    const panel = await open();
    fireEvent.click(
      await within(panel).findByRole('button', { name: 'Next activities' }),
    );
    const literal = within(panel).getByText('Current declaration 26 Ж / é'),
      next = within(panel).getByRole('button', { name: 'Previous activities' });
    next.focus();
    const calls = vi.mocked(fetch).mock.calls.length;
    for (const locale of ['ro', 'ru', 'fr', 'en']) {
      fireEvent.click(
        screen.getByRole('button', { name: 'Change to ' + locale }),
      );
      expect(next).toHaveFocus();
      expect(literal).toBeInTheDocument();
      expect(panel.textContent).toContain('Preserved intended result 26');
      expect(vi.mocked(fetch).mock.calls).toHaveLength(calls);
    }
    fireEvent.click(
      within(panel).getByRole('button', {
        name: 'Open current Task: Current Task 26',
      }),
    );
    await screen.findByDisplayValue('Current Task 26');
    expect(within(panel).getByText('Activities 26–26 of 26')).toBeVisible();
    fireEvent.click(
      within(panel).getByRole('button', {
        name: 'Return to fresh current work',
      }),
    );
    const taskButton = await within(panel).findByRole('button', {
      name: 'Open current Task: Current Task 26',
    });
    await waitFor(() => expect(taskButton).toHaveFocus());
    expect(state.reads).toBe(2);
    expect(window.location.href).not.toContain(id(225));
  });
  it.each([
    'wrong count',
    'duplicate mapping',
    'wrong Task',
    'unknown result',
    'unavailable leak',
    'bad final row',
  ])('rejects %s before any trusted prefix or continuation', async (kind) => {
    const state = install(),
      value = currentOverview();
    if (kind === 'wrong count') value.overview.plan.version.activityCount = 25;
    if (kind === 'duplicate mapping') {
      const first = value.overview.plan.tasks[0],
        last = value.overview.plan.tasks[25];
      if (first && last) last.taskId = first.taskId;
    }
    if (kind === 'wrong Task') {
      const last = value.overview.activities[25];
      if (last) last.task.clientAccountId = id(999);
    }
    if (kind === 'unknown result')
      state.value = {
        overview: {
          ...value.overview,
          activities: [
            ...value.overview.activities.slice(0, 25),
            { ...value.overview.activities[25], result: { kind: 'future' } },
          ],
        },
      };
    else if (kind === 'unavailable leak')
      state.value = {
        overview: {
          ...value.overview,
          activities: [
            ...value.overview.activities.slice(0, 25),
            {
              ...value.overview.activities[25],
              result: {
                kind: 'unavailable',
                current: { declaration: 'SECRET' },
              },
            },
          ],
        },
      };
    else if (kind === 'bad final row')
      state.value = {
        overview: {
          ...value.overview,
          activities: [...value.overview.activities.slice(0, 25), null],
        },
      };
    else state.value = value;
    render(<App identity={deterministicBrowserIdentity()} />);
    const panel = await open();
    await within(panel).findByRole('alert');
    expect(
      within(panel).queryByRole('button', { name: /Open current Task/ }),
    ).toBeNull();
    expect(panel.textContent).not.toContain('Current declaration');
  });
  it.each([200, 403])(
    'retires held late%s across Company A→B→A before callbacks or content',
    async (status) => {
      const state = install(),
        identity = deterministicBrowserIdentity();
      render(<App identity={identity} />);
      let panel = await open();
      await within(panel).findByText('Current declaration 1 Ж / é');
      const held = deferred();
      state.held = held;
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Refresh current work' }),
      );
      await waitFor(() => expect(state.reads).toBe(2));
      state.held = undefined;
      const selector = screen.getByLabelText('Active Company', { exact: true });
      changeValue(selector, otherCompany.id);
      await waitFor(() =>
        expect(
          screen.queryByRole('region', { name: 'Current mission work' }),
        ).toBeNull(),
      );
      changeValue(selector, company.id);
      panel = await open();
      await within(panel).findByText('Current declaration 1 Ж / é');
      const before = state.actorReads;
      await act(async () =>
        held.resolve(Response.json({ overview: null }, { status })),
      );
      expect(state.actorReads).toBe(before);
      expect(
        within(panel).getByText('Current declaration 1 Ж / é'),
      ).toBeVisible();
    },
  );
  it.each(['pending', 'uncertain', 'confirmed'])(
    'preserves native Task %s payload and key through overview failure and locale changes',
    async (mode) => {
      const state = install();
      render(
        <>
          <LocaleProbe />
          <App identity={deterministicBrowserIdentity()} />
        </>,
      );
      const panel = await open();
      await within(panel).findByText('Current declaration 1 Ж / é');
      const title = await screen.findByLabelText('Task title');
      changeValue(title, 'Protected literal native Task Ж / é');
      if (mode === 'pending') state.taskHold = deferred();
      if (mode === 'confirmed') state.taskStatus = 201;
      fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
      await waitFor(() => expect(state.posts).toHaveLength(1));
      state.status = 500;
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Refresh current work' }),
      );
      await within(panel).findByRole('alert');
      fireEvent.click(screen.getByRole('button', { name: 'Change to fr' }));
      fireEvent.click(screen.getByRole('button', { name: 'Change to en' }));
      if (mode === 'confirmed') {
        expect(screen.getByText('Task change recorded.')).toBeVisible();
        expect(state.posts).toHaveLength(1);
        return;
      }
      expect(title).toBeInTheDocument();
      expect(title).toHaveValue('Protected literal native Task Ж / é');
      if (state.taskHold) {
        await act(async () =>
          state.taskHold?.resolve(Response.json({}, { status: 503 })),
        );
        state.taskHold = undefined;
      }
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Retry pending Task change',
        }),
      );
      await waitFor(() => expect(state.posts).toHaveLength(2));
      expect(state.posts[1]).toEqual(state.posts[0]);
    },
  );
  it('preserves focus and every held read through all four locales without extra I/O', async () => {
    const state = install();
    render(
      <>
        <LocaleProbe />
        <App identity={deterministicBrowserIdentity()} />
      </>,
    );
    const panel = await open();
    await within(panel).findByText('Current declaration 1 Ж / é');
    const held = deferred();
    state.held = held;
    const refresh = within(panel).getByRole('button', {
      name: 'Refresh current work',
    });
    refresh.focus();
    fireEvent.click(refresh);
    await waitFor(() => expect(state.reads).toBe(2));
    const calls = vi.mocked(fetch).mock.calls.length;
    for (const locale of ['ro', 'ru', 'fr', 'en']) {
      fireEvent.click(
        screen.getByRole('button', { name: 'Change to ' + locale }),
      );
      expect(refresh).toHaveFocus();
      expect(vi.mocked(fetch).mock.calls).toHaveLength(calls);
    }
    await act(async () => held.resolve(Response.json(currentOverview())));
    await within(panel).findByText('Current declaration 1 Ж / é');
    expect(state.reads).toBe(2);
  });
  it.each(['pending', 'uncertain', 'confirmed'] as const)(
    'preserves native result %s literal, observations and exact retry through independent overview result denial/failure',
    async (mode) => {
      const state = install();
      render(
        <>
          <LocaleProbe />
          <App identity={deterministicBrowserIdentity()} />
        </>,
      );
      const panel = await open();
      fireEvent.click(
        await within(panel).findByRole('button', { name: 'Next activities' }),
      );
      fireEvent.click(
        within(panel).getByRole('button', {
          name: 'Open current Task: Current Task 26',
        }),
      );
      const results = await screen.findByRole('region', {
        name: 'Declared Task result',
      });
      const declaration =
        await within(results).findByLabelText('Result declaration');
      changeValue(declaration, 'Protected result literal Ж / é');
      changeValue(
        within(results).getByRole('combobox', {
          name: 'Frozen mission Version',
        }),
        id(525),
      );
      if (mode === 'pending') state.resultHold = deferred();
      if (mode === 'confirmed') state.resultStatus = 201;
      fireEvent.click(
        within(results).getByRole('button', {
          name: 'Record result',
        }),
      );
      await waitFor(() => expect(state.resultPosts).toHaveLength(1));
      const value = currentOverview();
      state.value = {
        overview: {
          ...value.overview,
          activities: value.overview.activities.map((row) => ({
            ...row,
            result: { kind: 'unavailable' },
          })),
        },
      };
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Refresh current work' }),
      );
      await within(panel).findAllByText(
        'Result access unavailable. Ordinary Task work remains available.',
      );
      state.status = 500;
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Refresh current work' }),
      );
      await within(panel).findByRole('alert');
      fireEvent.click(screen.getByRole('button', { name: 'Change to fr' }));
      fireEvent.click(screen.getByRole('button', { name: 'Change to en' }));
      expect(declaration).toHaveValue(
        mode === 'confirmed' ? '' : 'Protected result literal Ж / é',
      );
      if (mode === 'confirmed') {
        expect(within(results).getByText('Result confirmed.')).toBeVisible();
        expect(state.resultPosts).toHaveLength(1);
        return;
      }
      if (state.resultHold) {
        await act(async () =>
          state.resultHold?.resolve(Response.json({}, { status: 503 })),
        );
        state.resultHold = undefined;
      }
      fireEvent.click(
        await within(results).findByRole('button', {
          name: 'Retry exact result command',
        }),
      );
      await waitFor(() => expect(state.resultPosts).toHaveLength(2));
      expect(state.resultPosts[1]).toEqual(state.resultPosts[0]);
    },
  );
  it.each([200, 403])(
    'keeps native Task draft and retires late%s result-only generations through actual access revalidation A→B→A',
    async (status) => {
      const state = install();
      render(<App identity={deterministicBrowserIdentity()} />);
      const panel = await open();
      await within(panel).findByText('Current declaration 1 Ж / é');
      const title = await screen.findByLabelText('Task title');
      changeValue(title, 'Independent native draft through optional grants');
      const held = deferred();
      state.held = held;
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Refresh current work' }),
      );
      await waitFor(() => expect(state.reads).toBe(2));
      state.held = undefined;
      const access = await screen.findByRole('region', {
        name: 'Company access',
      });
      changeValue(within(access).getByLabelText('Workspace member'), id(9));
      changeValue(
        within(access).getByLabelText('Company', { exact: true }),
        company.id,
      );
      changeValue(
        within(access).getByLabelText('Access bundle'),
        'document-content-reader',
      );
      for (const reader of [id(90), id(15)]) {
        state.readerId = reader;
        fireEvent.click(
          within(access).getByRole('button', { name: 'Grant access' }),
        );
        await waitFor(() =>
          expect(
            within(access).getByRole('button', { name: 'Grant access' }),
          ).toBeEnabled(),
        );
        await screen.findByText('Access granted. Server state refreshed.');
        await within(panel).findByText('Current declaration 1 Ж / é');
        expect(title).toBeInTheDocument();
        expect(title).toHaveValue(
          'Independent native draft through optional grants',
        );
      }
      const reads = state.actorReads;
      await act(async () =>
        held.resolve(Response.json({ overview: null }, { status })),
      );
      expect(state.actorReads).toBe(reads);
      expect(title).toHaveValue(
        'Independent native draft through optional grants',
      );
    },
  );
  it.each(['selection', 'session', 'source', 'task', 'project'] as const)(
    'retires held read across actual App %s A→B→A before any late403 revalidation',
    async (kind) => {
      const state = install(),
        identity = deterministicBrowserIdentity();
      const view = render(<App identity={identity} />);
      let panel = await open();
      await within(panel).findByText('Current declaration 1 Ж / é');
      const held = deferred();
      state.held = held;
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Refresh current work' }),
      );
      await waitFor(() => expect(state.reads).toBe(2));
      state.held = undefined;
      if (kind === 'selection') {
        fireEvent.click(
          screen.getByRole('button', {
            name: 'Other Project DEMO Client: Current Client DEMO',
          }),
        );
        await screen.findByRole('article', { name: 'Other Project DEMO' });
        panel = await open();
      } else if (kind === 'session') {
        view.rerender(<App identity={deterministicBrowserIdentity()} />);
        await open();
        view.rerender(<App identity={identity} />);
        panel = await open();
      } else {
        const access = await screen.findByRole('region', {
          name: 'Company access',
        });
        changeValue(within(access).getByLabelText('Workspace member'), id(9));
        changeValue(
          within(access).getByLabelText('Company', { exact: true }),
          company.id,
        );
        changeValue(
          within(access).getByLabelText('Access bundle'),
          kind === 'source'
            ? 'mission-plan-user'
            : kind === 'project'
              ? 'project'
              : 'task-manager',
        );
        for (const active of [false, true]) {
          if (kind === 'source') state.sourceGrants = active;
          else if (kind === 'project') state.projectRead = active;
          else state.taskRead = active;
          fireEvent.click(
            within(access).getByRole('button', { name: 'Grant access' }),
          );
          await waitFor(() =>
            expect(
              within(access).getByRole('button', { name: 'Grant access' }),
            ).toBeEnabled(),
          );
          await screen.findByText('Access granted. Server state refreshed.');
          if (!active)
            await waitFor(() =>
              expect(
                screen.queryByRole('region', { name: 'Current mission work' }),
              ).toBeNull(),
            );
        }
        panel = await open();
      }
      await within(panel).findByText('Current declaration 1 Ж / é');
      const reads = state.actorReads;
      await act(async () => held.resolve(Response.json({}, { status: 403 })));
      expect(state.actorReads).toBe(reads);
      expect(
        within(panel).getByText('Current declaration 1 Ж / é'),
      ).toBeVisible();
    },
  );
  it.each([
    'mission-plan-user',
    'document-registrar',
    'document-content-reader',
    'mission-deliverable-access',
    'task-result-recorder',
    'mission-result-reviewer',
  ] as const)(
    'preserves connected independent native Task drafts after actual App %s revalidation',
    async (bundle) => {
      const state = install();
      render(<App identity={deterministicBrowserIdentity()} />);
      const panel = await open();
      fireEvent.click(
        await within(panel).findByRole('button', { name: 'Next activities' }),
      );
      fireEvent.click(
        within(panel).getByRole('button', {
          name: 'Open current Task: Current Task 26',
        }),
      );
      const title = await screen.findByDisplayValue('Current Task 26');
      changeValue(title, 'Protected connected native Task');
      const result = await screen.findByLabelText('Result declaration');
      changeValue(result, 'Protected connected result under source grant');
      const access = await screen.findByRole('region', {
        name: 'Company access',
      });
      changeValue(within(access).getByLabelText('Workspace member'), id(9));
      changeValue(
        within(access).getByLabelText('Company', { exact: true }),
        company.id,
      );
      changeValue(within(access).getByLabelText('Access bundle'), bundle);
      if (bundle === 'mission-plan-user') state.planId = id(90);
      if (bundle === 'document-registrar') state.metadataId = id(90);
      if (bundle === 'document-content-reader') state.readerId = id(90);
      if (bundle === 'mission-deliverable-access') state.familyId = id(90);
      if (bundle === 'task-result-recorder') state.recorderId = id(90);
      if (bundle === 'mission-result-reviewer') state.reviewerId = id(90);
      fireEvent.click(
        within(access).getByRole('button', { name: 'Grant access' }),
      );
      await screen.findByText('Access granted. Server state refreshed.');
      expect(title).toBeInTheDocument();
      expect(title).toHaveValue('Protected connected native Task');
      if (bundle === 'mission-plan-user') {
        expect(result).toBeInTheDocument();
        expect(result).toHaveValue(
          'Protected connected result under source grant',
        );
      }
    },
  );
  it.each([200, 403])(
    'retires connected native work and a held late%s reply across actual Client-read revoke/regrant with equal captures',
    async (status) => {
      const state = install();
      render(<App identity={deterministicBrowserIdentity()} />);
      let panel = await open();
      await within(panel).findByText('Current declaration 1 Ж / é');
      const title = await screen.findByLabelText('Task title');
      changeValue(title, 'Must retire with Client authority');
      const held = deferred();
      state.held = held;
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Refresh current work' }),
      );
      await waitFor(() => expect(state.reads).toBe(2));
      state.held = undefined;
      const access = await screen.findByRole('region', {
        name: 'Company access',
      });
      changeValue(within(access).getByLabelText('Workspace member'), id(9));
      changeValue(
        within(access).getByLabelText('Company', { exact: true }),
        company.id,
      );
      changeValue(
        within(access).getByLabelText('Access bundle'),
        'director-client',
      );
      for (const active of [false, true]) {
        state.clientRead = active;
        fireEvent.click(
          within(access).getByRole('button', { name: 'Grant access' }),
        );
        await waitFor(() =>
          expect(
            within(access).getByRole('button', { name: 'Grant access' }),
          ).toBeEnabled(),
        );
        await screen.findByText('Access granted. Server state refreshed.');
      }
      expect(title).not.toBeInTheDocument();
      panel = await open();
      await within(panel).findByText('Current declaration 1 Ж / é');
      const reads = state.actorReads;
      await act(async () =>
        held.resolve(Response.json({ overview: null }, { status })),
      );
      expect(state.actorReads).toBe(reads);
      expect(
        within(panel).getByText('Current declaration 1 Ж / é'),
      ).toBeVisible();
    },
  );
});
