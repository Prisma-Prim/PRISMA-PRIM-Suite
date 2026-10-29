import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { changeValue } from './test/select-option';
import {
  actor,
  companyId,
  project,
} from './test/mission-applicability-app-fixture';
import { openDistantHistory } from './test/mission-applicability-history-app';
import { preferenceKey } from './production-shell/company-context-preference';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
it('keeps exact known-reference inspection, literal draft and control nodes through all locale changes without HTTP or focus theft', async () => {
  const observe = vi.fn(async () => undefined);
  const { panel, history } = await openDistantHistory({ override: observe });
  const draft = within(panel).getByRole('textbox', {
    name: 'Proposal reason (1–1000 characters)',
  });
  fireEvent.change(draft, {
    target: { value: 'Literal draft DEMO Ж / é / 🌍' },
  });
  const restored = within(panel).getByRole('article', {
    name: 'Applicability restored — Version 31',
  });
  const inspect = within(restored).getByRole('button', {
    name: 'Inspect referenced fact: Restores applicability after approved exclusion — Version 31',
  });
  const beforeInspect = observe.mock.calls.length;
  await act(async () => {
    inspect.focus();
    fireEvent.click(inspect);
  });
  expect(observe.mock.calls).toHaveLength(beforeInspect);
  const inspection = within(history).getByRole('region', {
    name: 'Referenced applicability fact',
  });
  const heading = within(inspection).getByRole('heading', {
    name: 'Referenced applicability fact',
  });
  expect(
    within(inspection).getByRole('article', {
      name: 'Approved exclusion — Version 30',
    }),
  ).toBeVisible();
  const before = observe.mock.calls.length;
  for (const [locale, title, relation] of [
    [
      'ro',
      'Înregistrarea de aplicabilitate menționată',
      'Restabilește aplicabilitatea după excluderea aprobată',
    ],
    [
      'ru',
      'Указанная запись применимости',
      'Восстанавливает применимость после утверждённого исключения',
    ],
    [
      'fr',
      'Fait d’applicabilité référencé',
      'Rétablit l’applicabilité après l’exclusion approuvée',
    ],
    [
      'en',
      'Referenced applicability fact',
      'Restores applicability after approved exclusion',
    ],
  ]) {
    const language = document.getElementById('interface-locale');
    if (!language) throw new Error('Expected native locale control');
    changeValue(language, locale);
    expect(within(history).getByRole('region', { name: title })).toBe(
      inspection,
    );
    expect(within(inspection).getByRole('heading', { name: title })).toBe(
      heading,
    );
    expect(within(inspection).getByText(relation)).toBeVisible();
    expect(draft).toHaveValue('Literal draft DEMO Ж / é / 🌍');
  }
  await act(async () => {
    await Promise.resolve();
  });
  expect(observe.mock.calls).toHaveLength(before);
  expect(draft.isConnected).toBe(true);
  fireEvent.click(
    within(inspection).getByRole('button', { name: 'Close referenced fact' }),
  );
  expect(inspect).toHaveFocus();
});
it.each(
  ['selected', 'workspace'].flatMap((recovery) =>
    [200, 403].map((status) => ({ recovery, status })),
  ),
)(
  'does not publish or recover an already-started $recovery Actor HTTP $status after its inspection is closed and reopened',
  async ({ recovery, status }) => {
    let recovering = false,
      selectedReads = 0;
    let release: ((response: Response) => void) | undefined;
    let signal: AbortSignal | null | undefined;
    const { panel, inspect } = await openDistantHistory({
      override: async (path, init, url) => {
        if (
          !recovering &&
          path.endsWith('/mission-applicability/history') &&
          url.searchParams.get('beforeRevision') === '30'
        ) {
          recovering = true;
          return new Response(null, { status: 403 });
        }
        if (recovering && path === '/api/access/current-actor') {
          selectedReads++;
          if (
            recovery === 'workspace' &&
            new Headers(init?.headers).has('x-company-context-id')
          )
            return new Response(null, { status: 403 });
          if (!release) {
            signal = init?.signal;
            return new Promise<Response>((resolve) => {
              release = resolve;
            });
          }
        }
        return undefined;
      },
    });
    inspect.focus();
    fireEvent.click(inspect);
    let inspection = await within(panel).findByRole('region', {
      name: 'Referenced applicability fact',
    });
    await waitFor(() => expect(release).toBeTypeOf('function'));
    fireEvent.click(
      within(inspection).getByRole('button', { name: 'Close referenced fact' }),
    );
    expect(signal?.aborted).toBe(true);
    inspect.focus();
    fireEvent.click(inspect);
    inspection = await within(panel).findByRole('region', {
      name: 'Referenced applicability fact',
    });
    await within(inspection).findByText(
      'The referenced fact is not in this page. Continue explicitly to older facts.',
    );
    const before = selectedReads,
      respond = release;
    if (!respond) throw new Error('Expected started selected-Actor response');
    await act(async () => {
      respond(
        status === 200
          ? Response.json({
              ...actor,
              displayName: 'RETIRED INSPECTION ACTOR DEMO',
            })
          : new Response(null, { status: 403 }),
      );
    });
    expect(selectedReads).toBe(before);
    expect(document.body).not.toHaveTextContent(
      'RETIRED INSPECTION ACTOR DEMO',
    );
    expect(
      within(panel).getByRole('region', {
        name: 'Referenced applicability fact',
      }),
    ).toBe(inspection);
    expect(inspection).toHaveTextContent(
      'The referenced fact is not in this page. Continue explicitly to older facts.',
    );
  },
);
it.each([200, 403])(
  'permanently retires a held inspection HTTP %s through actual Company A→B→A and equal returned grants',
  async (status) => {
    const otherCompanyId = '10000000-0000-4000-8000-000000000002';
    const otherActor = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        id: otherCompanyId,
        displayName: 'Company B DEMO',
      },
    };
    localStorage.setItem(preferenceKey(actor), companyId);
    let held = false,
      actorReads = 0,
      activityReads = 0;
    let release: ((response: Response) => void) | undefined;
    let signal: AbortSignal | null | undefined;
    const initial = await openDistantHistory({
      override: async (path, init, url) => {
        const selected = new Headers(init?.headers).get('x-company-context-id');
        if (path === '/api/companies')
          return Response.json([
            { id: companyId, displayName: 'Company DEMO' },
            { id: otherCompanyId, displayName: 'Company B DEMO' },
          ]);
        if (path === '/api/access/current-actor') {
          actorReads++;
          return Response.json(
            selected === otherCompanyId ? otherActor : actor,
          );
        }
        if (path === '/api/activity-log') activityReads++;
        if (
          selected === otherCompanyId &&
          (path === '/api/projects' || path === '/api/clients')
        )
          return Response.json([]);
        if (
          !held &&
          path.endsWith('/mission-applicability/history') &&
          url.searchParams.get('beforeRevision') === '30'
        ) {
          held = true;
          signal = init?.signal;
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        }
        return undefined;
      },
    });
    initial.inspect.focus();
    fireEvent.click(initial.inspect);
    await waitFor(() => expect(release).toBeTypeOf('function'));
    for (const selected of [otherCompanyId, companyId]) {
      changeValue(
        screen.getByRole('combobox', { name: 'Active Company' }),
        selected,
      );
      await waitFor(() =>
        expect(
          screen.getByRole('combobox', { name: 'Active Company' }),
        ).toHaveAttribute('data-value', selected),
      );
    }
    const projects = await screen.findByRole('region', { name: 'Projects' });
    fireEvent.click(
      await within(projects).findByRole('button', {
        name: new RegExp(project.title),
      }),
    );
    const panel = await screen.findByRole('region', {
      name: 'Mission activity applicability',
    });
    const history = await within(panel).findByRole('region', {
      name: 'Project-wide applicability history',
    });
    await within(history).findByRole('article', {
      name: 'Proposal corrected — Version 60',
    });
    const approval = within(panel).getByRole('article', {
      name: 'Approved exclusion — Version 30',
    });
    const inspect = within(approval).getByRole('button', {
      name: 'Inspect referenced fact: Decision on proposal — Version 30',
    });
    inspect.focus();
    fireEvent.click(inspect);
    const inspection = await within(panel).findByRole('region', {
      name: 'Referenced applicability fact',
    });
    await within(inspection).findByText(
      'The referenced fact is not in this page. Continue explicitly to older facts.',
    );
    expect(signal?.aborted).toBe(true);
    const before = { actorReads, activityReads },
      respond = release;
    if (!respond) throw new Error('Expected held old-Company response');
    await act(async () => {
      respond(
        status === 200
          ? Response.json({ history: { kind: 'unavailable' } })
          : new Response(null, { status: 403 }),
      );
    });
    expect({ actorReads, activityReads }).toEqual(before);
    expect(
      within(panel).getByRole('region', {
        name: 'Referenced applicability fact',
      }),
    ).toBe(inspection);
    expect(inspection).toHaveTextContent(
      'The referenced fact is not in this page. Continue explicitly to older facts.',
    );
  },
);

it('preserves its held read and native drafts after an unrelated Reviewer grant is published through actual administration', async () => {
  const administrator = {
    ...actor,
    workspacePermissions: ['client.manage', 'company.assignment.manage'],
  };
  const fresh = {
    ...administrator,
    displayName: 'Fresh parent Actor DEMO',
    activeCompany: {
      ...actor.activeCompany,
      missionResultReviewPermissions: ['project.mission_result.review'],
      missionResultReviewerAssignmentId: 'unrelated-reviewer-demo',
      missionResultReviewerPermissionSetVersion: 'v1',
    },
  };
  let current: unknown = administrator,
    granted = false;
  let release: ((response: Response) => void) | undefined;
  const { panel, projects, inspect, fixture } = await openDistantHistory({
    readActor: () => current,
    override: async (path, init, url) => {
      if (path === '/api/company-context-assignments/administration')
        return Response.json({
          members: [
            {
              workspaceMembershipId: actor.workspaceMembershipId,
              displayName: actor.displayName,
              email: actor.email,
            },
          ],
          companies: [{ id: companyId, displayName: 'Company DEMO' }],
          assignments: granted
            ? [
                {
                  id: 'admin-reviewer-demo',
                  workspaceMembershipId: actor.workspaceMembershipId,
                  companyId,
                  bundle: 'Company Mission Result Reviewer',
                  permissionSetVersion: 'v1',
                  active: true,
                },
              ]
            : [],
        });
      if (
        path === '/api/company-mission-result-reviewer-assignments' &&
        init?.method === 'POST'
      ) {
        current = fresh;
        granted = true;
        return Response.json(
          {
            id: 'admin-reviewer-demo',
            workspaceMembershipId: actor.workspaceMembershipId,
            companyId,
            bundle: 'Company Mission Result Reviewer',
            permissionSetVersion: 'v1',
            active: true,
          },
          { status: 201 },
        );
      }
      if (
        !release &&
        path.endsWith('/mission-applicability/history') &&
        url.searchParams.get('beforeRevision') === '30'
      )
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return undefined;
    },
  });
  const projectDraft = within(projects).getByRole('textbox', {
    name: 'Project title',
  });
  const proposalDraft = within(panel).getByRole('textbox', {
    name: 'Proposal reason (1–1000 characters)',
  });
  fireEvent.change(projectDraft, {
    target: { value: 'Independent Project draft DEMO' },
  });
  fireEvent.change(proposalDraft, {
    target: { value: 'Independent proposal literal DEMO' },
  });
  inspect.focus();
  fireEvent.click(inspect);
  await waitFor(() => expect(release).toBeTypeOf('function'));
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: /Access/i }),
  );
  const access = await screen.findByRole('region', { name: 'Company access' });
  changeValue(
    await within(access).findByRole('combobox', { name: 'Workspace member' }),
    actor.workspaceMembershipId,
  );
  changeValue(
    within(access).getByRole('combobox', { name: 'Company' }),
    companyId,
  );
  changeValue(
    within(access).getByRole('combobox', { name: 'Access bundle' }),
    'mission-result-reviewer',
  );
  fireEvent.click(within(access).getByRole('button', { name: 'Grant access' }));
  await screen.findByText('Fresh parent Actor DEMO');
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: 'Projects' }),
  );
  expect(
    screen.getByRole('region', { name: 'Mission activity applicability' }),
  ).toBe(panel);
  const respond = release;
  if (!respond)
    throw new Error('Expected live independently qualified history read');
  await act(async () => {
    respond(Response.json(fixture.page(30)));
  });
  const inspection = within(panel).getByRole('region', {
    name: 'Referenced applicability fact',
  });
  await within(inspection).findByText(
    'The referenced fact is not in this page. Continue explicitly to older facts.',
  );
  expect(proposalDraft).toHaveValue('Independent proposal literal DEMO');
  expect(projectDraft).toHaveValue('Independent Project draft DEMO');
  expect(
    within(panel).getByRole('textbox', {
      name: 'Proposal reason (1–1000 characters)',
    }),
  ).toBe(proposalDraft);
});

it('does not steal native draft focus when a requested target arrives after the user moved away', async () => {
  let release: ((response: Response) => void) | undefined;
  const { panel, projects, inspect, fixture } = await openDistantHistory({
    override: async (path, _init, url) => {
      if (
        path.endsWith('/mission-applicability/history') &&
        url.searchParams.get('beforeRevision') === '5'
      )
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return undefined;
    },
  });
  inspect.focus();
  fireEvent.click(inspect);
  const inspection = await within(panel).findByRole('region', {
    name: 'Referenced applicability fact',
  });
  const older = await within(inspection).findByRole('button', {
    name: 'Older related facts',
  });
  older.focus();
  fireEvent.click(older);
  await waitFor(() => expect(release).toBeTypeOf('function'));
  const draft = within(projects).getByRole('textbox', {
    name: 'Project title',
  });
  draft.focus();
  fireEvent.change(draft, {
    target: { value: 'Independently focused native draft DEMO' },
  });
  const respond = release;
  if (!respond) throw new Error('Expected held exact-target page');
  await act(async () => {
    respond(Response.json(fixture.page(5)));
  });
  await within(inspection).findByRole('article', {
    name: 'Proposed — Version 4',
  });
  expect(draft).toHaveFocus();
  expect(draft).toHaveValue('Independently focused native draft DEMO');
});
