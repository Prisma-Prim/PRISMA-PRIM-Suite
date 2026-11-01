import { StrictMode } from 'react';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import { InterfaceLocaleSelect } from './localization/InterfaceLocaleSelect';
import { changeValue } from './test/select-option';
import { companyId } from './test/mission-applicability-app-fixture';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  screen,
  within,
  waitFor,
} from './test/render-with-interface-locale';
import {
  installInternalTaskApp,
  internalTaskActor,
  internalReceipt,
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
it.each(['draft', 'pending', 'uncertain', 'confirmed'])(
  'preserves independent Internal Task %s and parent Project work through actual unrelated grant administration',
  async (phase) => {
    let finish: ((value: Response) => void) | undefined;
    const writes: Array<{
      body: BodyInit | null | undefined;
      key: string | null;
    }> = [];
    const server = installInternalTaskApp(async (path, init) => {
      if (path !== '/api/company-internal-tasks' || init?.method !== 'POST')
        return undefined;
      writes.push({
        body: init.body,
        key: new Headers(init.headers).get('idempotency-key'),
      });
      if (phase === 'pending' && writes.length === 1)
        return new Promise((resolve) => {
          finish = resolve;
        });
      if (phase === 'uncertain' && writes.length === 1)
        throw new TypeError('Synthetic lost response');
      return Response.json(internalReceipt('Independent internal intent'), {
        status: 201,
      });
    });
    const fresh = {
      ...internalTaskActor,
      displayName: 'Fresh independent Actor DEMO',
      activeCompany: {
        ...internalTaskActor.activeCompany,
        missionResultReviewPermissions: ['project.mission_result.review'],
        missionResultReviewerAssignmentId: 'independent-reviewer',
        missionResultReviewerPermissionSetVersion: 'v1',
      },
    };
    server.setNextActor(fresh);
    const original = await openInternalTaskApp(),
      nav = screen.getByRole('navigation', { name: 'Primary navigation' });
    fireEvent.click(within(nav).getByRole('link', { name: 'Projects' }));
    const projects = await screen.findByRole('region', { name: 'Projects' }),
      projectTitle = await within(projects).findByRole('textbox', {
        name: 'Project title',
      });
    fireEvent.change(projectTitle, {
      target: { value: 'Independent Project intent' },
    });
    fireEvent.click(within(nav).getByRole('link', { name: 'Internal Tasks' }));
    fireEvent.change(original.title, {
      target: { value: 'Independent internal intent' },
    });
    if (phase !== 'draft')
      fireEvent.click(
        within(original.create).getByRole('button', {
          name: 'Create internal Task',
        }),
      );
    if (phase === 'pending')
      await waitFor(() => expect(finish).toBeTypeOf('function'));
    if (phase === 'uncertain')
      await within(original.panel).findByRole('button', {
        name: 'Retry the same command',
      });
    if (phase === 'confirmed')
      await within(original.panel).findByText('Internal Task saved.');
    await publishInternalActor('grant', 'mission-result-reviewer');
    await screen.findByText('Fresh independent Actor DEMO');
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).getByRole('link', { name: 'Internal Tasks' }),
    );
    expect(original.title.isConnected).toBe(true);
    expect(original.title).toHaveValue('Independent internal intent');
    expect(projectTitle.isConnected).toBe(true);
    expect(projectTitle).toHaveValue('Independent Project intent');
    if (phase === 'pending') {
      await act(async () => {
        finish?.(
          Response.json(internalReceipt('Independent internal intent'), {
            status: 201,
          }),
        );
      });
      await within(original.panel).findByText('Internal Task saved.');
    }
    if (phase === 'uncertain') {
      fireEvent.click(
        within(original.panel).getByRole('button', {
          name: 'Retry the same command',
        }),
      );
      await within(original.panel).findByText('Internal Task saved.');
      expect(writes[1]).toEqual(writes[0]);
    }
    if (phase === 'confirmed')
      expect(
        within(original.panel).getByText('Internal Task saved.'),
      ).toBeInTheDocument();
    if (phase === 'draft') expect(writes).toHaveLength(0);
    expect(
      screen.getByText('Fresh independent Actor DEMO'),
    ).toBeInTheDocument();
  },
);
it.each(
  ['selected', 'Workspace', 'full-Actor'].flatMap((stage) =>
    [200, 403].map((status) => ({ stage, status })),
  ),
)(
  'retires already-started $stage recovery HTTP$status on a recovery-only Actor replacement without discarding valid Project intent',
  async ({ stage, status }) => {
    let trigger = false,
      held = false,
      finish: ((value: Response) => void) | undefined;
    const fresh = {
      ...internalTaskActor,
      displayName: 'Fresh recovery Actor DEMO',
      activeCompany: {
        ...internalTaskActor.activeCompany,
        missionResultReviewPermissions: ['project.mission_result.review'],
        missionResultReviewerAssignmentId: 'fresh-recovery-reviewer',
        missionResultReviewerPermissionSetVersion: 'v1',
      },
    };
    const server = installInternalTaskApp(async (path, init) => {
      if (path === '/api/company-internal-tasks' && init?.method === 'POST') {
        trigger = true;
        return new Response(null, { status: 403 });
      }
      const company = new Headers(init?.headers).get('x-company-context-id');
      if (trigger && !held && path === '/api/access/current-actor') {
        if (stage === 'Workspace' && company)
          return new Response(null, { status: 403 });
        if (stage === 'full-Actor') {
          held = true;
          return Response.json(internalTaskActor);
        }
        held = true;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      if (
        trigger &&
        stage === 'full-Actor' &&
        held &&
        !finish &&
        path === '/api/activity-log'
      )
        return new Promise((resolve) => {
          finish = resolve;
        });
      return undefined;
    });
    server.setNextActor(fresh);
    const original = await openInternalTaskApp(),
      navigation = screen.getByRole('navigation', {
        name: 'Primary navigation',
      });
    fireEvent.click(within(navigation).getByRole('link', { name: 'Projects' }));
    const projects = await screen.findByRole('region', { name: 'Projects' }),
      projectTitle = await within(projects).findByRole('textbox', {
        name: 'Project title',
      });
    fireEvent.change(projectTitle, {
      target: { value: 'Preserved native Project draft' },
    });
    fireEvent.click(
      within(navigation).getByRole('link', { name: 'Internal Tasks' }),
    );
    fireEvent.change(original.title, {
      target: { value: 'Denied internal intent' },
    });
    fireEvent.click(
      within(original.create).getByRole('button', {
        name: 'Create internal Task',
      }),
    );
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    await publishInternalActor('grant', 'mission-result-reviewer');
    await screen.findByText('Fresh recovery Actor DEMO');
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).getByRole('link', { name: 'Projects' }),
    );
    projectTitle.focus();
    const before = server.counts();
    await act(async () => {
      finish?.(
        status === 403
          ? new Response(null, { status })
          : Response.json(
              stage === 'full-Actor'
                ? { events: [] }
                : stage === 'Workspace'
                  ? { ...internalTaskActor, activeCompany: undefined }
                  : internalTaskActor,
            ),
      );
    });
    expect(screen.getByText('Fresh recovery Actor DEMO')).toBeInTheDocument();
    expect(server.counts()).toEqual(before);
    expect(projectTitle).toHaveValue('Preserved native Project draft');
    expect(projectTitle).toHaveFocus();
  },
);

it.each(
  ['selected', 'Workspace', 'full-Actor'].flatMap((stage) =>
    ['identity', 'Company', 'regrant'].flatMap((retirement) =>
      [200, 403].map((status) => ({ stage, retirement, status })),
    ),
  ),
)(
  'retires held $stage recovery HTTP$status permanently through actual App $retirement A→B→A',
  async ({ stage, retirement, status }) => {
    const otherId = '10000000-0000-4000-8000-000000000002',
      otherActor = {
        ...internalTaskActor,
        activeCompany: {
          ...internalTaskActor.activeCompany,
          id: otherId,
          displayName: 'Company B DEMO',
        },
      };
    let trigger = false,
      held = false,
      finish: ((value: Response) => void) | undefined;
    const server = installInternalTaskApp(async (path, init) => {
      const company = new Headers(init?.headers).get('x-company-context-id');
      if (path === '/api/companies')
        return Response.json([
          { id: companyId, displayName: 'Company DEMO' },
          { id: otherId, displayName: 'Company B DEMO' },
        ]);
      if (path === '/api/company-internal-tasks' && init?.method === 'POST') {
        trigger = true;
        return new Response(null, { status: 403 });
      }
      if (trigger && !held && path === '/api/access/current-actor') {
        if (stage === 'Workspace' && company)
          return new Response(null, { status: 403 });
        if (stage === 'full-Actor') {
          held = true;
          return Response.json(internalTaskActor);
        }
        held = true;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      if (
        trigger &&
        stage === 'full-Actor' &&
        held &&
        !finish &&
        path === '/api/activity-log'
      )
        return new Promise((resolve) => {
          finish = resolve;
        });
      if (path === '/api/access/current-actor' && retirement === 'Company')
        return Response.json(
          company === otherId ? otherActor : internalTaskActor,
        );
      return undefined;
    });
    const rejectSession = vi.fn(async () => undefined),
      identity = { ...deterministicBrowserIdentity(), rejectSession },
      original = await openInternalTaskApp(identity);
    fireEvent.change(original.title, {
      target: { value: 'Retired recovery intent' },
    });
    fireEvent.click(
      within(original.create).getByRole('button', {
        name: 'Create internal Task',
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
    const navigation = await screen.findByRole('navigation', {
      name: 'Primary navigation',
    });
    fireEvent.click(within(navigation).getByRole('link', { name: 'Projects' }));
    const projects = await screen.findByRole('region', { name: 'Projects' }),
      editor = await within(projects).findByRole('textbox', {
        name: 'Project title',
      });
    fireEvent.change(editor, {
      target: { value: 'Fresh valid Project intent' },
    });
    editor.focus();
    const before = server.counts();
    await act(async () => {
      finish?.(
        status === 403
          ? new Response(null, { status })
          : Response.json(
              stage === 'full-Actor'
                ? { events: [] }
                : stage === 'Workspace'
                  ? { ...internalTaskActor, activeCompany: undefined }
                  : {
                      ...internalTaskActor,
                      displayName: 'RETIRED RECOVERY SENTINEL',
                    },
            ),
      );
    });
    expect(server.counts()).toEqual(before);
    expect(
      screen.queryByText('RETIRED RECOVERY SENTINEL'),
    ).not.toBeInTheDocument();
    expect(editor).toHaveValue('Fresh valid Project intent');
    expect(editor).toHaveFocus();
    expect(rejectSession).not.toHaveBeenCalled();
  },
);
