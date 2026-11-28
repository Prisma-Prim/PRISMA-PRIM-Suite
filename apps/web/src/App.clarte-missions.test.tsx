import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import {
  createClarteMissionsApi,
  createdProjectId,
  missionsClients,
  missionsMembers,
  missionsPlan,
  missionsSeededProjects,
  missionsActor,
  missionsContractRequestId,
  missionsTemplate,
} from './clarte/missions/clarte-missions.test-fixture';
import { pilotSourceFixture } from './project/project-pilot-plan.test-fixtures';
import { renderInInterface } from './test/app-interface';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { selectOptionByLabel } from './test/select-option';

type Api = ReturnType<typeof createClarteMissionsApi>;
const [lumen, valea] = missionsClients;
const [ana, ion] = missionsMembers;
const titles = {
  certification: 'Fictional ISO 9001 certification support',
  diagnosis: 'Fictional HACCP preparatory diagnosis',
  closed: 'Fictional ISO 45001 follow-up',
};

function serve(options: Parameters<typeof createClarteMissionsApi>[0] = {}) {
  const api = createClarteMissionsApi(options);
  const bodies: Array<{ route: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      const method = init?.method ?? 'GET';
      const body =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      if (body !== undefined)
        bodies.push({ route: `${method} ${url.pathname}`, body });
      const reply = api.reply({ method, url, body });
      return reply.json === undefined
        ? new Response(null, { status: reply.status })
        : Response.json(reply.json, { status: reply.status });
    }),
  );
  return { api, bodies };
}

function openMissions() {
  window.history.replaceState(null, '', '/#projects');
  renderInInterface(
    'clarte',
    <App identity={deterministicBrowserIdentity()} />,
  );
}

function missions() {
  return screen.getByRole('region', { name: 'Projects' });
}

/** The Project list once its first rows are shown. */
async function projectList() {
  const region = await screen.findByRole('region', { name: 'Projects' });
  await within(region).findByRole('table', { name: 'Projects' });
  return region;
}

/** The visible title of each listed Project, in list order. */
function rowTitles() {
  return within(within(missions()).getByRole('table', { name: 'Projects' }))
    .getAllByRole('rowheader')
    .map((cell) => cell.querySelector('.clarte-missions-title')?.textContent);
}

/** Opens a listed Project by its row, named by its title and Client. */
async function openProject(title: string) {
  const list = await projectList();
  fireEvent.click(
    within(list).getByRole('button', {
      name: new RegExp(`^${title} Client: `),
    }),
  );
  return screen.findByRole('article', { name: title });
}

function headerOf(space: HTMLElement) {
  const header = space.querySelector('header');
  if (!header) throw new Error('Expected the mission space header.');
  return header;
}

function openPanel(space: HTMLElement, button: string, dialog: string) {
  fireEvent.click(within(space).getByRole('button', { name: button }));
  return screen.getByRole('dialog', { name: dialog });
}

function closePanel(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
}

function routes(api: Api, suffix: string) {
  return api.writes.filter((write) => write.endsWith(suffix));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Clarté Missions and audits', () => {
  it('creates a Project from a template and opens its mission space on the copied plan', async () => {
    const { api, bodies } = serve();
    openMissions();
    const list = await projectList();

    fireEvent.click(
      within(list).getByRole('button', { name: 'From a template' }),
    );
    const panel = screen.getByRole('dialog', {
      name: 'Create a Project from a template',
    });
    expect(
      within(panel).getByRole('button', {
        name: 'Create Project from template',
      }),
    ).toBeDisabled();
    selectOptionByLabel(
      await within(panel).findByRole('combobox', { name: 'Project template' }),
      `${missionsTemplate.title} — Version 1`,
    );
    fireEvent.change(within(panel).getByLabelText('Project title'), {
      target: { value: 'Fictional ISO 22000 preparation' },
    });
    selectOptionByLabel(
      within(panel).getByRole('combobox', { name: 'Client' }),
      lumen.displayName,
    );
    fireEvent.click(
      within(panel).getByRole('button', {
        name: 'Create Project from template',
      }),
    );

    const space = await screen.findByRole('article', {
      name: 'Fictional ISO 22000 preparation',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(headerOf(space)).getByText('Preparatory')).toBeVisible();
    expect(within(space).getByRole('tab', { name: 'Plan' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const plan = within(space).getByRole('tabpanel', { name: 'Plan' });
    expect(
      await within(plan).findByText(
        missionsTemplate.stages[0]?.tasks[0]?.title ?? '',
      ),
    ).toBeInTheDocument();
    expect(
      within(plan).getByText(`${missionsTemplate.title} — version 1`),
    ).toBeInTheDocument();
    expect(routes(api, '/projects/from-template')).toHaveLength(1);
    expect(
      bodies.find((entry) => entry.route === 'POST /api/projects/from-template')
        ?.body,
    ).toEqual({
      title: 'Fictional ISO 22000 preparation',
      clientAccountId: lumen.id,
      templateKey: missionsTemplate.templateKey,
      templateVersion: 1,
    });
    expect(api.unhandled).toEqual(new Set());
  });

  it('lists, searches and filters the Projects and creates a preparatory Project', async () => {
    const { api } = serve();
    openMissions();
    const list = await projectList();
    expect(rowTitles()).toEqual([titles.certification, titles.diagnosis]);

    fireEvent.change(
      within(list).getByRole('searchbox', { name: 'Find Projects' }),
      {
        target: { value: 'valea' },
      },
    );
    expect(rowTitles()).toEqual([titles.diagnosis]);
    fireEvent.change(
      within(list).getByRole('searchbox', { name: 'Find Projects' }),
      {
        target: { value: 'nothing like this' },
      },
    );
    expect(
      within(list).getByText('No Project matches this search.'),
    ).toBeInTheDocument();
    fireEvent.change(
      within(list).getByRole('searchbox', { name: 'Find Projects' }),
      {
        target: { value: '' },
      },
    );
    fireEvent.click(
      within(list).getByRole('checkbox', { name: 'Include closed Projects' }),
    );
    expect(rowTitles()).toEqual([
      titles.certification,
      titles.diagnosis,
      titles.closed,
    ]);
    fireEvent.click(
      within(list).getByRole('button', { name: 'My open Projects' }),
    );
    await waitFor(() => expect(rowTitles()).toEqual([titles.certification]));
    expect(
      within(list).getByRole('button', { name: 'My open Projects' }),
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(list).getByRole('button', { name: 'All Projects' }));
    // The closed Projects stay included until the choice is undone.
    await waitFor(() =>
      expect(rowTitles()).toEqual([
        titles.certification,
        titles.diagnosis,
        titles.closed,
      ]),
    );
    fireEvent.click(
      within(list).getByRole('checkbox', { name: 'Include closed Projects' }),
    );
    expect(rowTitles()).toEqual([titles.certification, titles.diagnosis]);

    fireEvent.click(
      within(list).getByRole('button', { name: 'Preparatory Project' }),
    );
    const panel = screen.getByRole('dialog', {
      name: 'New preparatory Project',
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Create preparatory Project' }),
    );
    expect(
      await within(panel).findByText(/Enter a title of 1–200 characters/),
    ).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText('Project title'), {
      target: { value: 'Fictional supplier audit preparation' },
    });
    selectOptionByLabel(
      within(panel).getByRole('combobox', { name: 'Client' }),
      valea.displayName,
    );
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Create preparatory Project' }),
    );
    const space = await screen.findByRole('article', {
      name: 'Fictional supplier audit preparation',
    });
    expect(within(headerOf(space)).getByText('Preparatory')).toBeVisible();
    expect(
      within(space).getByText(
        'Preparation only. This record does not authorize work to start.',
      ),
    ).toBeVisible();
    expect(routes(api, 'POST /projects')).toHaveLength(1);

    fireEvent.click(
      within(space).getByRole('button', { name: 'Back to Projects' }),
    );
    await waitFor(() =>
      expect([...rowTitles()].sort()).toEqual(
        [
          'Fictional supplier audit preparation',
          titles.certification,
          titles.diagnosis,
        ].sort(),
      ),
    );
  });

  it('shows the empty, refused and failed Project list states', async () => {
    serve({ projects: 'none' });
    openMissions();
    const region = await screen.findByRole('region', { name: 'Projects' });
    expect(
      await within(region).findByText('No Projects for this Company yet.'),
    ).toBeInTheDocument();
    expect(missions()).toBe(region);
  });

  it.each([
    [
      403,
      'Project access and Client read access are required for this Company.',
    ],
    [500, 'The Project could not be loaded or saved. Please try again.'],
  ])('announces a list refused or failed with %s', async (status, message) => {
    serve({ listStatus: status });
    openMissions();
    const region = await screen.findByRole('region', { name: 'Projects' });
    expect(await within(region).findByRole('alert')).toHaveTextContent(message);
    expect(
      within(region).getByRole('button', { name: 'Reload Projects' }),
    ).toBeEnabled();
  });

  it('creates a Project from a Mission Plan version', async () => {
    const { api } = serve();
    openMissions();
    const list = await projectList();
    fireEvent.click(
      within(list).getByRole('button', { name: 'From a Mission Plan' }),
    );
    const panel = screen.getByRole('dialog', {
      name: 'Create a Project from a Mission Plan',
    });
    fireEvent.click(
      await within(panel).findByRole('button', {
        name: `Open Version: ${missionsPlan.title}`,
      }),
    );
    fireEvent.click(
      await within(panel).findByRole('button', {
        name: `Open Version: ${missionsPlan.title} · Version 2`,
      }),
    );
    fireEvent.change(within(panel).getByLabelText('New Project title'), {
      target: { value: 'Fictional ISO 14001 implementation' },
    });
    selectOptionByLabel(
      within(panel).getByRole('combobox', { name: 'New Project Client' }),
      valea.displayName,
    );
    fireEvent.click(
      within(panel).getByRole('button', {
        name: 'Create Project with selected activities',
      }),
    );

    const space = await screen.findByRole('article', {
      name: 'Fictional ISO 14001 implementation',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const plan = within(space).getByRole('tabpanel', { name: 'Plan' });
    const open = await within(plan).findByRole('button', {
      name: /Environmental review/,
    });
    fireEvent.click(open);
    expect(within(space).getByRole('tab', { name: 'Tasks' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(routes(api, '/projects/from-mission-plan')).toHaveLength(1);
    expect(
      api.projects.some((entry) => entry.row.id === createdProjectId(1)),
    ).toBe(true);
  });

  it('opens a copied plan line’s Task, switches views and returns to the list', async () => {
    serve();
    openMissions();
    const space = await openProject(titles.certification);
    expect(within(headerOf(space)).getByText('Active')).toBeVisible();
    const plan = within(space).getByRole('tabpanel', { name: 'Plan' });
    const [first] = pilotSourceFixture.activities;
    fireEvent.click(
      await within(plan).findByRole('button', {
        name: `Open linked Task — ${first.key}`,
      }),
    );

    expect(within(space).getByRole('tab', { name: 'Tasks' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const tasks = screen.getByRole('tabpanel', { name: 'Tasks' });
    expect(
      await within(tasks).findByRole('heading', { name: first.title }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(space).getByRole('tab', { name: 'Working Documents' }),
    );
    expect(
      within(space).getByRole('tabpanel', { name: 'Working Documents' }),
    ).toBeVisible();
    expect(tasks).not.toBeVisible();
    fireEvent.keyDown(
      within(space).getByRole('tab', { name: 'Working Documents' }),
      { key: 'Home' },
    );
    expect(within(space).getByRole('tab', { name: 'Plan' })).toHaveFocus();

    fireEvent.click(
      within(space).getByRole('button', { name: 'Back to Projects' }),
    );
    expect(
      await screen.findByRole('table', { name: 'Projects' }),
    ).toBeVisible();
  });

  it('activates with the start declaration, suspends, resumes and completes with confirmation', async () => {
    const { bodies } = serve();
    openMissions();
    const space = await openProject(titles.diagnosis);

    // A preparatory Project needs an owner before it can be activated.
    let lifecycle = openPanel(space, 'Lifecycle', 'Project lifecycle');
    expect(
      await within(lifecycle).findByRole('button', {
        name: 'Activate Project',
      }),
    ).toBeDisabled();
    expect(
      within(lifecycle).getByText(
        'Name a responsible member before activating this Project.',
      ),
    ).toBeVisible();
    closePanel(lifecycle);
    const owner = openPanel(space, 'Owner', 'Project owner');
    fireEvent.click(
      await within(owner).findByRole('button', { name: 'Change' }),
    );
    selectOptionByLabel(
      await within(owner).findByRole('combobox', {
        name: 'Choose the responsible member',
      }),
      ana.displayLabel,
    );
    fireEvent.click(within(owner).getByRole('button', { name: 'Save' }));
    await within(owner).findByText('Responsible member saved.');
    closePanel(owner);
    await waitFor(() =>
      expect(headerOf(space)).toHaveTextContent(`Owner: ${ana.displayLabel}`),
    );

    lifecycle = openPanel(space, 'Lifecycle', 'Project lifecycle');
    fireEvent.click(
      within(lifecycle).getByRole('button', { name: 'Activate Project' }),
    );
    const items = within(lifecycle).getAllByRole('group');
    const declaration = items.filter((group) =>
      within(group).queryByRole('radio', { name: 'Present' }),
    );
    expect(declaration).toHaveLength(7);
    declaration.forEach((group, index) =>
      fireEvent.click(
        within(group).getByRole('radio', {
          name: index === 3 ? 'Missing' : 'Present',
        }),
      ),
    );
    fireEvent.change(
      within(lifecycle).getByLabelText('Start exception reason'),
      { target: { value: 'Initial documents arrive next week.' } },
    );
    selectOptionByLabel(
      await within(lifecycle).findByRole('combobox', {
        name: 'To be completed by',
      }),
      ion.displayLabel,
    );
    fireEvent.change(within(lifecycle).getByLabelText('Completion deadline'), {
      target: { value: '2026-12-05' },
    });
    fireEvent.click(
      within(lifecycle).getByRole('button', { name: 'Activate' }),
    );
    await within(lifecycle).findByText('Project lifecycle updated.');
    await waitFor(() =>
      expect(within(headerOf(space)).getByText('Active')).toBeVisible(),
    );
    expect(within(lifecycle).getByText('Start exception')).toBeVisible();

    fireEvent.click(
      within(lifecycle).getByRole('button', { name: 'Put on hold' }),
    );
    fireEvent.change(within(lifecycle).getByLabelText('Hold reason'), {
      target: { value: 'The Client postpones the visits.' },
    });
    fireEvent.click(
      within(lifecycle).getByRole('button', { name: 'Put Project on hold' }),
    );
    await waitFor(() =>
      expect(within(headerOf(space)).getByText('On hold')).toBeVisible(),
    );
    fireEvent.click(
      await within(lifecycle).findByRole('button', { name: 'Resume Project' }),
    );
    fireEvent.click(
      within(lifecycle).getByRole('button', { name: 'Confirm resumption' }),
    );
    await waitFor(() =>
      expect(within(headerOf(space)).getByText('Active')).toBeVisible(),
    );

    fireEvent.click(
      await within(lifecycle).findByRole('button', {
        name: 'Complete Project',
      }),
    );
    expect(
      within(lifecycle).getByText(
        "Completing makes this Project's Tasks, Documents and responsible member read-only. It cannot be undone in this version.",
      ),
    ).toBeVisible();
    fireEvent.change(within(lifecycle).getByLabelText('Completion note'), {
      target: { value: 'Fictional diagnosis delivered.' },
    });
    fireEvent.click(
      within(lifecycle).getByRole('button', { name: 'Complete Project' }),
    );
    await waitFor(() =>
      expect(within(headerOf(space)).getByText('Completed')).toBeVisible(),
    );
    const history = within(lifecycle).getByRole('heading', {
      name: 'Transition history',
    }).parentElement;
    if (!history) throw new Error('Expected the transition history.');
    expect(within(history).getAllByRole('listitem')).toHaveLength(4);
    expect(
      bodies
        .filter((entry) => entry.route.endsWith('/lifecycle-transitions'))
        .map((entry) =>
          typeof entry.body === 'object' &&
          entry.body !== null &&
          'action' in entry.body
            ? entry.body.action
            : undefined,
        ),
    ).toEqual(['activate', 'hold', 'resume', 'complete']);
    closePanel(lifecycle);
    expect(
      within(space).getByText(/This Project is completed\./),
    ).toBeVisible();
  });

  it('designates, changes and removes the owner and keeps the next action with its history', async () => {
    serve();
    openMissions();
    const space = await openProject(titles.diagnosis);
    expect(
      await within(space).findByText('No next action recorded yet.'),
    ).toBeVisible();
    await waitFor(() =>
      expect(headerOf(space)).toHaveTextContent('Owner: No owner designated'),
    );

    const owner = openPanel(space, 'Owner', 'Project owner');
    for (const member of [ion, ana]) {
      fireEvent.click(
        await within(owner).findByRole('button', { name: 'Change' }),
      );
      selectOptionByLabel(
        await within(owner).findByRole('combobox', {
          name: 'Choose the responsible member',
        }),
        member.displayLabel,
      );
      fireEvent.click(within(owner).getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(headerOf(space)).toHaveTextContent(
          `Owner: ${member.displayLabel}`,
        ),
      );
    }
    fireEvent.click(
      await within(owner).findByRole('button', { name: 'Change' }),
    );
    fireEvent.click(
      await within(owner).findByRole('button', {
        name: 'Clear responsible member',
      }),
    );
    await waitFor(() =>
      expect(headerOf(space)).toHaveTextContent('Owner: No owner designated'),
    );
    closePanel(owner);

    const next = openPanel(space, 'Change', 'Project next action');
    const editor = await within(next).findByRole('textbox', {
      name: 'Next action',
    });
    await waitFor(() => expect(editor).toBeEnabled());
    fireEvent.change(editor, {
      target: { value: 'Send the questionnaire to the Client' },
    });
    fireEvent.click(
      within(next).getByRole('button', { name: 'Save next action' }),
    );
    await within(next).findByText('Next action saved.');
    const summary = within(space).getByRole('group', {
      name: 'Project next action',
    });
    await waitFor(() =>
      expect(summary).toHaveTextContent('Send the questionnaire to the Client'),
    );
    await waitFor(() => expect(editor).toBeEnabled());
    fireEvent.change(editor, {
      target: { value: 'Call the Client about the questionnaire' },
    });
    fireEvent.click(
      within(next).getByRole('button', { name: 'Replace next action' }),
    );
    await waitFor(() =>
      expect(summary).toHaveTextContent(
        'Call the Client about the questionnaire',
      ),
    );
    await waitFor(() => expect(editor).toBeEnabled());
    fireEvent.click(
      within(next).getByRole('button', { name: 'Clear next action' }),
    );
    await waitFor(() =>
      expect(summary).toHaveTextContent('The next action was cleared.'),
    );
    const history = within(next).getByRole('region', {
      name: 'Next action history',
    });
    await waitFor(() =>
      expect(within(history).getAllByRole('article')).toHaveLength(3),
    );
  });

  it('opens the Client dossier from the mission space', async () => {
    serve();
    openMissions();
    const space = await openProject(titles.certification);
    fireEvent.click(
      within(space).getByRole('button', { name: 'Open Client dossier' }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#clients'));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Clients' }),
    ).toBeVisible();
    expect(window.location.href).not.toContain(
      missionsSeededProjects.certification,
    );
  });

  it('opens a linked Contract’s Request from the mission space', async () => {
    serve({ actor: missionsActor({ contracts: true }) });
    openMissions();
    const space = await openProject(titles.certification);
    fireEvent.click(within(space).getByRole('tab', { name: 'Contracts' }));
    const contracts = within(space).getByRole('tabpanel', {
      name: 'Contracts',
    });
    fireEvent.click(
      await within(contracts).findByRole('button', { name: 'Open Contract' }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#requests'));
    expect(window.location.href).not.toContain(missionsContractRequestId);
  });

  it('shows the empty Contracts view of a Project without a linked Contract', async () => {
    serve({ actor: missionsActor({ contracts: true }) });
    openMissions();
    const space = await openProject(titles.diagnosis);
    fireEvent.click(within(space).getByRole('tab', { name: 'Contracts' }));
    expect(
      await within(space).findByText(
        'No Contract is linked to this Project yet.',
      ),
    ).toBeInTheDocument();
  });
});
