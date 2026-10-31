import { openDistantHistory } from './test/mission-applicability-history-app';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  waitFor,
  render,
  screen,
  within,
} from './test/render-with-interface-locale';
import { App } from './App';
import { changeValue } from './test/select-option';
import { deterministicBrowserIdentity } from './access-composition';
import {
  actor,
  project,
  installParentServer,
  plan,
} from './test/mission-applicability-app-fixture';
import {
  distantApprovalFixture,
  distantDecisionFixture,
  historyDecision,
} from './test/mission-applicability-history-fixture';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
it('keeps the initial Project-wide history read when an activity is selected before that page settles', async () => {
  const fixture = distantDecisionFixture();
  let release: ((response: Response) => void) | undefined;
  let signal: AbortSignal | null | undefined;
  installParentServer(
    () => actor,
    async (path, init) => {
      if (path.endsWith('/mission-applicability/history')) {
        signal = init?.signal;
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
      if (path.endsWith('/mission-applicability'))
        return Response.json(fixture.current);
      return undefined;
    },
  );
  render(
    <StrictMode>
      <App identity={deterministicBrowserIdentity()} />
    </StrictMode>,
  );
  const projects = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: new RegExp(project.title),
    }),
  );
  const panel = await screen.findByRole('region', {
    name: 'Mission activity applicability',
  });
  await waitFor(() => expect(release).toBeTypeOf('function'));
  changeValue(
    within(panel).getByRole('combobox', { name: 'Source activity' }),
    plan.activities[6].taskId,
  );
  expect(signal?.aborted).toBe(false);
  const respond = release;
  if (!respond) throw new Error('Expected held initial history response');
  await act(async () => respond(Response.json(fixture.page())));
  const history = within(panel).getByRole('region', {
    name: 'Project-wide applicability history',
  });
  await within(history).findByRole('article', {
    name: 'Proposal corrected — Version 60',
  });
  expect(within(history).getAllByRole('article')).toHaveLength(25);
});
it('shows the exact approved proposal Version from the qualified current snapshot even when that proposal is outside the newest history page', async () => {
  const fixture = distantApprovalFixture();
  installParentServer(
    () => actor,
    async (path) => {
      if (path.endsWith('/mission-applicability/history'))
        return Response.json(fixture.page());
      if (path.endsWith('/mission-applicability'))
        return Response.json(fixture.current);
      return undefined;
    },
  );
  render(
    <StrictMode>
      <App identity={deterministicBrowserIdentity()} />
    </StrictMode>,
  );
  const projects = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: new RegExp(project.title),
    }),
  );
  const panel = await screen.findByRole('region', {
    name: 'Mission activity applicability',
  });
  const approval = await within(panel).findAllByRole('article', {
    name: 'Approved exclusion — Version 30',
  });
  for (const recorded of approval) {
    const label = within(recorded).getByText('Decision on proposal');
    expect(label.nextElementSibling).toHaveTextContent('Version 4');
  }
});

it('inspects the exact off-page proposal through one bounded history read per explicit action while retaining the originating decision', async () => {
  const fixture = distantDecisionFixture(),
    queries: string[] = [];
  installParentServer(
    () => actor,
    async (path, _init, url) => {
      if (path.endsWith('/mission-applicability/history')) {
        queries.push(url.search);
        const before = url.searchParams.get('beforeRevision');
        return Response.json(
          fixture.page(before === null ? undefined : Number(before)),
        );
      }
      if (path.endsWith('/mission-applicability'))
        return Response.json(fixture.current);
      return undefined;
    },
  );
  render(
    <StrictMode>
      <App identity={deterministicBrowserIdentity()} />
    </StrictMode>,
  );
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
  const before = queries.length;
  inspect.focus();
  fireEvent.click(inspect);
  const inspection = await within(panel).findByRole('region', {
    name: 'Referenced applicability fact',
  });
  await within(inspection).findByText(
    'The referenced fact is not in this page. Continue explicitly to older facts.',
  );
  expect(queries.slice(before)).toEqual(['?beforeRevision=30']);
  expect(inspection).toHaveTextContent('Approved exclusion — Version 30');
  expect(within(inspection).queryByText('Version 4')).not.toBeInTheDocument();
  const older = within(inspection).getByRole('button', {
    name: 'Older related facts',
  });
  older.focus();
  fireEvent.click(older);
  const exact = await within(inspection).findByRole('article', {
    name: 'Proposed — Version 4',
  });
  expect(exact).toHaveTextContent('Literal proposal 4 DEMO Ж / é / 🌍');
  expect(queries.slice(before)).toEqual([
    '?beforeRevision=30',
    '?beforeRevision=5',
  ]);
  expect(
    within(inspection).getByRole('heading', {
      name: 'Referenced applicability fact',
    }),
  ).toHaveFocus();
});

it.each([200, 403])(
  'closes the inspector without a stranded loading state and suppresses its held HTTP %s page and Actor recovery',
  async (status) => {
    let release: ((response: Response) => void) | undefined;
    let signal: AbortSignal | null | undefined;
    const readActor = vi.fn(() => actor);
    const { panel, history, inspect, fixture } = await openDistantHistory({
      readActor,
      override: async (path, init, url) => {
        if (
          path.endsWith('/mission-applicability/history') &&
          url.searchParams.get('beforeRevision') === '30'
        ) {
          signal = init?.signal;
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        }
        return undefined;
      },
    });
    inspect.focus();
    fireEvent.click(inspect);
    const inspection = await within(panel).findByRole('region', {
      name: 'Referenced applicability fact',
    });
    await waitFor(() => expect(release).toBeTypeOf('function'));
    const before = readActor.mock.calls.length;
    fireEvent.click(
      within(inspection).getByRole('button', { name: 'Close referenced fact' }),
    );
    expect(signal?.aborted).toBe(true);
    await waitFor(() =>
      expect(
        within(history).queryByText('Loading applicability history…'),
      ).not.toBeInTheDocument(),
    );
    const respond = release;
    if (!respond) throw new Error('Expected held public history response');
    await act(async () => {
      respond(
        status === 200
          ? Response.json(fixture.page(30))
          : new Response(null, { status: 403 }),
      );
    });
    expect(readActor.mock.calls).toHaveLength(before);
    expect(
      within(panel).queryByRole('region', {
        name: 'Referenced applicability fact',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(history).getByRole('article', {
        name: 'Proposal corrected — Version 60',
      }),
    ).toBeVisible();
    expect(
      within(history).queryByRole('article', {
        name: 'Proposal corrected — Version 29',
      }),
    ).not.toBeInTheDocument();
    expect(inspect).toHaveFocus();
  },
);

it('names correction supersession, exact restored approval and prior activity after restoration without guessing a neighbouring stream Version', async () => {
  const { panel, history } = await openDistantHistory();
  function relation(article: HTMLElement, label: string, version: number) {
    const name = within(article).getByText(label);
    expect(name.nextElementSibling).toHaveTextContent(`Version ${version}`);
  }
  relation(
    within(panel).getByRole('article', {
      name: 'Applicability restored — Version 31',
    }),
    'Restores applicability after approved exclusion',
    30,
  );
  relation(
    within(panel).getByRole('article', { name: 'Proposed — Version 32' }),
    'Previous fact for this activity',
    31,
  );
  fireEvent.click(
    within(history).getByRole('button', {
      name: 'Earlier applicability facts',
    }),
  );
  const corrected = await within(history).findByRole('article', {
    name: 'Proposal corrected — Version 33',
  });
  relation(corrected, 'Corrects and supersedes proposal', 29);
  const old = within(history).getByRole('article', {
    name: 'Proposal corrected — Version 29',
  });
  expect(old).toHaveTextContent('Superseded by correction — Version 33');
});
it('retains a qualified originating reference and independent draft through a transient history failure and retries the exact page', async () => {
  const queries: string[] = [];
  let reject = true;
  const { panel, history, inspect } = await openDistantHistory({
    override: async (path, _init, url) => {
      if (path.endsWith('/mission-applicability/history') && url.search) {
        queries.push(url.search);
        if (reject) {
          reject = false;
          return new Response(null, { status: 503 });
        }
      }
      return undefined;
    },
  });
  const draft = within(panel).getByRole('textbox', {
    name: 'Proposal reason (1–1000 characters)',
  });
  fireEvent.change(draft, {
    target: { value: 'Independent preserved draft DEMO 🌍' },
  });
  inspect.focus();
  fireEvent.click(inspect);
  const inspection = await within(panel).findByRole('region', {
    name: 'Referenced applicability fact',
  });
  await within(inspection).findByText(
    'The referenced fact could not be loaded. Retry the same history page.',
  );
  expect(inspection).toHaveTextContent('Approved exclusion — Version 30');
  expect(
    within(inspection).queryByRole('article', { name: 'Proposed — Version 4' }),
  ).not.toBeInTheDocument();
  expect(draft).toHaveValue('Independent preserved draft DEMO 🌍');
  expect(
    within(history).getByRole('article', {
      name: 'Proposal corrected — Version 60',
    }),
  ).toBeVisible();
  fireEvent.click(
    within(inspection).getByRole('button', { name: 'Retry identical command' }),
  );
  await within(inspection).findByText(
    'The referenced fact is not in this page. Continue explicitly to older facts.',
  );
  expect(queries).toEqual(['?beforeRevision=30', '?beforeRevision=30']);
  expect(draft).toHaveValue('Independent preserved draft DEMO 🌍');
});
it('clears protected reference context and the old page when a live bounded read becomes unavailable', async () => {
  const { panel, history, inspect } = await openDistantHistory({
    override: async (path, _init, url) =>
      path.endsWith('/mission-applicability/history') && url.search
        ? Response.json({ history: { kind: 'unavailable' } })
        : undefined,
  });
  const draft = within(panel).getByRole('textbox', {
    name: 'Proposal reason (1–1000 characters)',
  });
  fireEvent.change(draft, {
    target: {
      value: 'Independent current draft survives historical refusal DEMO',
    },
  });
  inspect.focus();
  fireEvent.click(inspect);
  await within(history).findByText(
    'Protected applicability evidence is unavailable under current access.',
  );
  expect(
    within(panel).queryByRole('region', {
      name: 'Referenced applicability fact',
    }),
  ).not.toBeInTheDocument();
  expect(within(history).queryByRole('article')).not.toBeInTheDocument();
  expect(draft).toHaveValue(
    'Independent current draft survives historical refusal DEMO',
  );
});
it.each(
  ['newest', 'selection', 'reopen'].flatMap((action) =>
    [200, 403].map((status) => ({ action, status })),
  ),
)(
  'permanently retires a held HTTP $status inspection after explicit $action, including equal reference reopen',
  async ({ action, status }) => {
    let release: ((response: Response) => void) | undefined;
    let signal: AbortSignal | null | undefined;
    let held = false;
    const readActor = vi.fn(() => actor);
    const { panel, history, inspect, fixture } = await openDistantHistory({
      readActor,
      override: async (path, init, url) => {
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
    inspect.focus();
    fireEvent.click(inspect);
    const inspection = await within(panel).findByRole('region', {
      name: 'Referenced applicability fact',
    });
    await waitFor(() => expect(release).toBeTypeOf('function'));
    if (action === 'newest') {
      fireEvent.click(
        within(history).getByRole('button', {
          name: 'Newest applicability facts',
        }),
      );
      await within(history).findByRole('article', {
        name: 'Proposal corrected — Version 60',
      });
    } else if (action === 'selection') {
      const other = plan.activities[1];
      if (!other) throw new Error('Expected second preserved activity');
      changeValue(
        within(panel).getByRole('combobox', { name: 'Source activity' }),
        other.taskId,
      );
    } else {
      fireEvent.click(
        within(inspection).getByRole('button', {
          name: 'Close referenced fact',
        }),
      );
      inspect.focus();
      fireEvent.click(inspect);
      const current = await within(panel).findByRole('region', {
        name: 'Referenced applicability fact',
      });
      await within(current).findByText(
        'The referenced fact is not in this page. Continue explicitly to older facts.',
      );
    }
    expect(signal?.aborted).toBe(true);
    const before = readActor.mock.calls.length,
      respond = release;
    if (!respond) throw new Error('Expected held public history response');
    await act(async () => {
      respond(
        status === 200
          ? Response.json(
              action === 'reopen'
                ? { history: { kind: 'unavailable' } }
                : fixture.page(30),
            )
          : new Response(null, { status: 403 }),
      );
    });
    expect(readActor.mock.calls).toHaveLength(before);
    if (action === 'reopen') {
      const current = within(panel).getByRole('region', {
        name: 'Referenced applicability fact',
      });
      expect(current).toHaveTextContent(
        'The referenced fact is not in this page. Continue explicitly to older facts.',
      );
    } else
      expect(
        within(panel).queryByRole('region', {
          name: 'Referenced applicability fact',
        }),
      ).not.toBeInTheDocument();
    expect(
      within(panel).queryByText(
        'Protected applicability evidence is unavailable under current access.',
      ),
    ).not.toBeInTheDocument();
  },
);
it.each(['fact-31', 'fact-60', 'missing-reference'])(
  'never invents a target Version for invalid or unknown reference %s',
  async (targetId) => {
    const fixture = distantDecisionFixture(),
      broken = historyDecision({
        revision: 30,
        index: 0,
        proposalId: targetId,
      });
    const current = {
      applicability: {
        ...fixture.current.applicability,
        activities: fixture.current.applicability.activities.map(
          (row, index) =>
            index === 0 ? { ...row, lastDecision: broken } : row,
        ),
      },
    };
    let reads = 0;
    const { panel, inspect } = await openDistantHistory({
      override: async (path, _init, url) => {
        if (path.endsWith('/mission-applicability/history') && url.search)
          reads++;
        if (path.endsWith('/mission-applicability'))
          return Response.json(current);
        return undefined;
      },
    });
    inspect.focus();
    fireEvent.click(inspect);
    const inspection = await within(panel).findByRole('region', {
      name: 'Referenced applicability fact',
    });
    if (targetId === 'missing-reference') {
      await within(inspection).findByText(
        'The referenced fact is not in this page. Continue explicitly to older facts.',
      );
      fireEvent.click(
        within(inspection).getByRole('button', { name: 'Older related facts' }),
      );
      expect(await within(inspection).findByRole('alert')).toHaveTextContent(
        'The referenced fact could not be verified.',
      );
      expect(reads).toBe(2);
    } else {
      expect(await within(inspection).findByRole('alert')).toHaveTextContent(
        'The referenced fact could not be verified.',
      );
      expect(reads).toBe(0);
    }
    expect(
      within(inspection).queryByRole('button', { name: 'Older related facts' }),
    ).not.toBeInTheDocument();
    expect(within(inspection).getAllByRole('article')).toHaveLength(1);
  },
);

it('retires live protected history on403 after current Actor recovery while conserving independent Project work', async () => {
  const { panel, projects, inspect } = await openDistantHistory({
    override: async (path, _init, url) =>
      path.endsWith('/mission-applicability/history') && url.search
        ? new Response(null, { status: 403 })
        : undefined,
  });
  const draft = within(projects).getByRole('textbox', {
    name: 'Project title',
  });
  fireEvent.change(draft, {
    target: { value: 'Independent permitted Project draft DEMO' },
  });
  inspect.focus();
  fireEvent.click(inspect);
  await within(panel).findByText(
    'Applicability authority is unavailable or was revoked.',
  );
  expect(
    within(panel).queryByRole('region', {
      name: 'Referenced applicability fact',
    }),
  ).not.toBeInTheDocument();
  expect(within(panel).queryByRole('article')).not.toBeInTheDocument();
  expect(draft).toHaveValue('Independent permitted Project draft DEMO');
});
