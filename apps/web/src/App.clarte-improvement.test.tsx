import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import {
  clarteImprovementActor,
  createClarteImprovementApi,
  seededIdeas,
  seededJournal,
  seededRisks,
  type ClarteImprovementApiOptions,
} from './clarte/improvement/clarte-improvement.test-fixture';
import { renderInInterface } from './test/app-interface';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';

type Api = ReturnType<typeof createClarteImprovementApi>;

/** Serves the fictional API; a held path never answers, to show loading. */
function serve(
  options: ClarteImprovementApiOptions = {},
  held: (path: string) => boolean = () => false,
) {
  const api = createClarteImprovementApi(options);
  const bodies: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      if (held(url.pathname)) return new Promise<Response>(() => undefined);
      const body: unknown =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      if (body !== undefined) bodies.push(body);
      const reply = api.reply({ method: init?.method ?? 'GET', url, body });
      return Response.json(reply.json, { status: reply.status });
    }),
  );
  return { api, bodies };
}

function openImprovement(hash: '#ideas' | '#operational-risks') {
  window.history.replaceState(null, '', `/${hash}`);
  renderInInterface(
    'clarte',
    <App identity={deterministicBrowserIdentity()} />,
  );
}

function writesTo(api: Api, suffix: string) {
  return api.writes.filter((write) => write.endsWith(suffix));
}

async function ideasList() {
  return screen.findByRole('region', { name: 'Recorded Ideas' });
}
async function openIdea(name: RegExp) {
  fireEvent.click(
    await within(await ideasList()).findByRole('button', { name }),
  );
  return screen.findByRole('dialog', { name });
}
async function riskRegister() {
  return screen.findByRole('region', { name: 'Recorded risks' });
}
async function openRisk(process: string) {
  fireEvent.click(
    await within(await riskRegister()).findByRole('button', { name: process }),
  );
  const panel = await screen.findByRole('dialog', { name: process });
  await within(panel).findByRole('heading', { name: 'Immutable history' });
  return panel;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Clarté Improvement › Ideas', () => {
  it('EX-248 EX-249: lists the Company Ideas, records an Idea from its side panel and opens it', async () => {
    const { api, bodies } = serve();
    openImprovement('#ideas');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Improvement' }),
    ).toBeVisible();
    const views = screen.getByRole('navigation', {
      name: 'Improvement views',
    });
    expect(
      within(views)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Ideas', 'Operational risks']);

    const list = await ideasList();
    const rows = await within(list).findAllByRole('row');
    // A header row and one row per Idea, newest first.
    expect(rows.map((row) => row.textContent)).toEqual([
      'IdeaOriginDisposition',
      `Shared glossary for audit reports${seededIdeas.glossary.origin}New`,
      `${seededIdeas.checklist.description}${seededIdeas.checklist.origin}Deferred`,
      `${seededIdeas.summary.description}${seededIdeas.summary.origin}Rejected`,
    ]);
    expect(within(list).getByText('Ideas: 3')).toBeVisible();

    fireEvent.click(
      within(list).getByRole('button', { name: 'Propose an Idea' }),
    );
    const form = await screen.findByRole('dialog', {
      name: 'Propose an Idea',
    });
    fireEvent.change(within(form).getByLabelText('Description'), {
      target: {
        value: '  Fictional calendar of surveillance audits\nWith dates ',
      },
    });
    fireEvent.change(within(form).getByLabelText('Origin'), {
      target: { value: 'Fictional quality meeting' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Record Idea' }));

    const panel = await screen.findByRole('dialog', {
      name: 'Fictional calendar of surveillance audits',
    });
    expect(
      within(panel).getByText(/Saved. The confirmed result/u),
    ).toBeVisible();
    const original = await within(panel).findByRole('article', {
      name: 'Original submission',
    });
    expect(original).toHaveTextContent(
      'Fictional calendar of surveillance audits With dates',
    );
    expect(
      within(original).getByText('Fictional quality meeting'),
    ).toBeVisible();
    expect(
      within(original).getByText('Submitted by: Ada Ionescu'),
    ).toBeVisible();
    expect(
      within(original).getByText('No dispositions recorded.'),
    ).toBeVisible();
    expect(bodies).toEqual([
      {
        description: '  Fictional calendar of surveillance audits\nWith dates ',
        origin: 'Fictional quality meeting',
      },
    ]);
    expect(writesTo(api, '/api/ideas')).toHaveLength(1);

    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      await within(list).findByRole('button', {
        name: 'Fictional calendar of surveillance audits',
      }),
    ).toBeVisible();
    expect(within(list).getByText('Ideas: 4')).toBeVisible();
    expect(api.unhandled).toEqual(new Set());
  });

  it('EX-250: postpones an Idea with a declared review date and reads the decision history', async () => {
    const { bodies } = serve();
    openImprovement('#ideas');
    const panel = await openIdea(/^Shared glossary for audit reports$/u);
    const original = await within(panel).findByRole('article', {
      name: 'Original submission',
    });
    expect(original).toHaveTextContent(
      'One list of terms per standard, kept beside the report template.',
    );
    const decide = within(panel).getByRole('group', { name: 'Disposition' });
    expect(
      within(decide).getByRole('radio', { name: 'Postpone' }),
    ).toBeChecked();
    fireEvent.change(within(panel).getByLabelText('Reason'), {
      target: { value: 'Wait for the 2027 report template' },
    });
    fireEvent.change(
      within(panel).getByLabelText('Reconsideration date (optional)'),
      { target: { value: '2027-04-01' } },
    );
    expect(
      within(panel).getByText(
        'A declared calendar date; it creates no reminder or automatic action.',
      ),
    ).toBeVisible();
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Record disposition' }),
    );

    expect(
      await within(panel).findByText(/Saved. The confirmed result/u),
    ).toBeVisible();
    const history = await within(panel).findByRole('region', {
      name: 'Disposition history',
    });
    expect(
      await within(history).findByText('Wait for the 2027 report template'),
    ).toBeVisible();
    expect(within(history).getByText('Deferred')).toBeVisible();
    expect(
      within(history).getByText('Declared review date: Apr 1, 2027'),
    ).toBeVisible();
    expect(within(panel).getByText(/Revision 2/u)).toBeVisible();
    expect(bodies).toEqual([
      {
        kind: 'deferred',
        reason: 'Wait for the 2027 report template',
        expectedRevision: 1,
        reconsiderationDate: '2027-04-01',
      },
    ]);
  });

  it('EX-250: rejects an Idea with a reason and keeps the earlier decisions in its history', async () => {
    const { bodies } = serve();
    openImprovement('#ideas');
    const panel = await openIdea(/^Bilingual checklist for opening meetings$/u);
    const history = await within(panel).findByRole('region', {
      name: 'Disposition history',
    });
    expect(
      within(history).getByText('Revisit after the January audits'),
    ).toBeVisible();
    fireEvent.click(within(panel).getByRole('radio', { name: 'Reject' }));
    expect(
      within(panel).queryByLabelText('Reconsideration date (optional)'),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Record disposition' }),
    );
    expect(
      await within(panel).findByText(/Enter nonblank text within the limits/u),
    ).toBeVisible();
    fireEvent.change(within(panel).getByLabelText('Reason'), {
      target: { value: 'Opening meetings already follow one bilingual plan' },
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Record disposition' }),
    );
    expect(
      await within(history).findByText(
        'Opening meetings already follow one bilingual plan',
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(within(history).getAllByRole('listitem')).toHaveLength(2),
    );
    expect(bodies).toEqual([
      {
        kind: 'rejected',
        reason: 'Opening meetings already follow one bilingual plan',
        expectedRevision: 2,
      },
    ]);
  });

  it.each([
    {
      state: 'empty',
      options: { empty: true },
      text: 'No Ideas recorded in this Company.',
    },
    {
      state: 'error',
      options: { ideasListStatus: 500 },
      text: 'This read failed. Refresh before treating this page as current.',
    },
    {
      state: 'no-permission',
      options: { ideasListStatus: 403 },
      text: 'Ideas access is unavailable. Your current authority is being checked.',
    },
  ] as const)(
    'shows the $state state of the Ideas list',
    async ({ options, text }) => {
      serve(options);
      openImprovement('#ideas');
      const list = await ideasList();
      expect(await within(list).findByText(text)).toBeVisible();
    },
  );

  it('shows the loading state of the Ideas list', async () => {
    serve({}, (path) => path === '/api/ideas');
    openImprovement('#ideas');
    const list = await ideasList();
    expect(within(list).getByRole('status')).toHaveTextContent(
      'Loading Ideas…',
    );
  });

  it('offers a Reader neither recording nor decision', async () => {
    serve({
      actor: clarteImprovementActor([
        'company_ideas_recorder',
        'company_ideas_reviewer',
      ]),
    });
    openImprovement('#ideas');
    const list = await ideasList();
    expect(
      within(list).queryByRole('button', { name: 'Propose an Idea' }),
    ).not.toBeInTheDocument();
    const panel = await openIdea(/^Shared glossary for audit reports$/u);
    await within(panel).findByRole('article', { name: 'Original submission' });
    expect(
      within(panel).queryByRole('group', { name: 'Disposition' }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole('button', { name: 'Record disposition' }),
    ).not.toBeInTheDocument();
  });
});

describe('Clarté Improvement › Operational risks', () => {
  it('EX-251 EX-252: records a risk with every fact and returns from its panel to the register', async () => {
    const { api, bodies } = serve();
    openImprovement('#operational-risks');
    const register = await riskRegister();
    const rows = await within(register).findAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(
      within(register).getByRole('button', {
        name: seededRisks.archiving.facts.process,
      }),
    ).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(
      within(register).getByRole('button', { name: 'Record a risk' }),
    );
    const form = await screen.findByRole('dialog', { name: 'Record a risk' });
    const values = {
      'Process / activity': 'Fictional supplier audits',
      'Possible cause': 'One supplier audit per year only',
      'Possible effect': 'A supplier change goes unnoticed',
      'Existing measures (optional)': 'Supplier list reviewed in January',
      'Planned measure': 'Add a mid-year supplier check',
      'Planned date (optional)': '2027-07-01',
      'Source description (optional)': 'Fictional management review',
    };
    for (const [label, value] of Object.entries(values))
      fireEvent.change(within(form).getByLabelText(label, { exact: false }), {
        target: { value },
      });
    fireEvent.click(within(form).getByRole('button', { name: 'Record' }));

    const panel = await screen.findByRole('dialog', {
      name: 'Fictional supplier audits',
    });
    expect(await within(panel).findByText('Recorded.')).toBeVisible();
    const facts = within(panel).getByRole('region', {
      name: 'Current intake facts',
    });
    expect(
      within(facts).getByText('One supplier audit per year only'),
    ).toBeVisible();
    expect(within(facts).getByText('Jul 1, 2027')).toBeVisible();
    expect(
      within(facts).getByText('Fictional management review'),
    ).toBeVisible();
    expect(bodies).toEqual([
      {
        process: 'Fictional supplier audits',
        cause: 'One supplier audit per year only',
        effect: 'A supplier change goes unnoticed',
        plannedMeasure: 'Add a mid-year supplier check',
        existingMeasures: 'Supplier list reviewed in January',
        sourceDescription: 'Fictional management review',
        plannedDate: '2027-07-01',
      },
    ]);
    expect(writesTo(api, '/api/operational-risks')).toHaveLength(1);

    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(await within(register).findAllByRole('row')).toHaveLength(4);
    expect(
      within(register).getByRole('button', {
        name: 'Fictional supplier audits',
      }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the line breaks of every fact when recording and correcting a risk', async () => {
    const { bodies } = serve();
    openImprovement('#operational-risks');
    fireEvent.click(
      within(await riskRegister()).getByRole('button', {
        name: 'Record a risk',
      }),
    );
    const form = await screen.findByRole('dialog', { name: 'Record a risk' });
    const values = {
      'Process / activity': 'Fictional supplier audits\nNorth site',
      'Possible cause': 'One audit per year\nonly',
      'Possible effect': 'A change goes unnoticed',
      'Planned measure': 'Add a mid-year check',
      'Source description (optional)': 'Fictional review\nitem 4',
    };
    for (const [label, value] of Object.entries(values))
      fireEvent.change(within(form).getByLabelText(label, { exact: false }), {
        target: { value },
      });
    fireEvent.click(within(form).getByRole('button', { name: 'Record' }));
    const panel = await screen.findByRole('dialog', {
      name: /^Fictional supplier audits\sNorth site$/u,
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Correct intake facts' }),
    );
    const editor = within(panel).getByRole('form', {
      name: 'Correct intake facts',
    });
    expect(
      within(editor).getByLabelText('Process / activity', { exact: false }),
    ).toHaveValue('Fictional supplier audits\nNorth site');
    expect(
      within(editor).getByLabelText('Source description (optional)'),
    ).toHaveValue('Fictional review\nitem 4');
    expect(bodies).toEqual([
      expect.objectContaining({
        process: 'Fictional supplier audits\nNorth site',
        sourceDescription: 'Fictional review\nitem 4',
      }),
    ]);
  });

  it('EX-253: corrects the initial facts with a reason and keeps the original facts', async () => {
    const { bodies } = serve();
    openImprovement('#operational-risks');
    const panel = await openRisk(seededRisks.archiving.facts.process);
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Correct intake facts' }),
    );
    const editor = within(panel).getByRole('form', {
      name: 'Correct intake facts',
    });
    fireEvent.change(
      within(editor).getByLabelText('Planned measure', { exact: false }),
      { target: { value: 'Scan every signed contract within one day' } },
    );
    fireEvent.click(within(editor).getByRole('button', { name: 'Record' }));
    expect(
      await within(panel).findByText(/Check required fields and text lengths/u),
    ).toBeVisible();
    fireEvent.change(within(editor).getByLabelText('Correction reason'), {
      target: { value: 'The archive agreed on one day' },
    });
    fireEvent.click(within(editor).getByRole('button', { name: 'Record' }));

    expect(await within(panel).findByText('Recorded.')).toBeVisible();
    const facts = within(panel).getByRole('region', {
      name: 'Current intake facts',
    });
    expect(
      within(facts).getByText('Scan every signed contract within one day'),
    ).toBeVisible();
    expect(
      within(facts).getByText('The archive agreed on one day'),
    ).toBeVisible();
    const originalFacts = within(panel)
      .getByText('Original intake facts')
      .closest('details');
    if (!originalFacts) throw new Error('Missing the original intake facts.');
    fireEvent.click(within(originalFacts).getByText('Original intake facts'));
    expect(
      within(originalFacts).getByText(
        seededRisks.archiving.facts.plannedMeasure,
      ),
    ).toBeVisible();
    const history = within(panel).getByRole('region', {
      name: 'Immutable history',
    });
    expect(within(history).getByText('Motivated correction')).toBeVisible();
    expect(bodies).toEqual([
      expect.objectContaining({
        plannedMeasure: 'Scan every signed contract within one day',
        expectedRevision: 1,
        reason: 'The archive agreed on one day',
      }),
    ]);
  });

  it('EX-254 EX-255 EX-256: adds a log note, corrects its statement and reads the immutable history', async () => {
    const { bodies } = serve();
    openImprovement('#operational-risks');
    const panel = await openRisk(seededRisks.calibration.facts.process);

    // EX-256: every revision with its author, date and previous record.
    const history = within(panel).getByRole('region', {
      name: 'Immutable history',
    });
    const entries = within(history).getAllByRole('listitem');
    expect(entries).toHaveLength(3);
    expect(entries[0]).toHaveTextContent('Motivated journal correction');
    expect(entries[0]).toHaveTextContent('Revision 3');
    expect(entries[0]).toHaveTextContent('Author: Ada Ionescu');
    expect(entries[0]).toHaveTextContent(
      `Previous statement: ${seededJournal.original.id}`,
    );
    expect(entries[2]).toHaveTextContent('Initial intake');

    // EX-254: a reassessment note with its fact date.
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Add a log note' }),
    );
    const note = within(panel).getByRole('form', { name: 'Add a log note' });
    fireEvent.click(
      within(note).getByRole('radio', { name: 'Narrative reassessment' }),
    );
    fireEvent.change(within(note).getByLabelText('Note', { exact: true }), {
      target: { value: 'Supplier confirmed every slot for next year' },
    });
    fireEvent.change(
      within(note).getByLabelText('Occurrence date (optional)'),
      {
        target: { value: '2026-11-25' },
      },
    );
    fireEvent.click(within(note).getByRole('button', { name: 'Record' }));
    expect(await within(panel).findByText('Recorded.')).toBeVisible();
    await waitFor(() =>
      expect(within(history).getAllByRole('listitem')).toHaveLength(4),
    );

    // EX-255: the statement shows the original, the current text and its author.
    const original = within(history)
      .getAllByRole('listitem')
      .find((item) =>
        within(item).queryByText(seededJournal.original.narrative),
      );
    if (!original) throw new Error('Missing the original log note.');
    fireEvent.click(
      within(original).getByRole('button', { name: 'View current statement' }),
    );
    await within(panel).findByRole('heading', {
      level: 3,
      name: 'Current journal statement',
    });
    const statement = within(panel).getByRole('region', {
      name: 'Current journal statement',
    });
    expect(
      within(statement).getByText(seededJournal.original.narrative),
    ).toBeVisible();
    expect(
      within(statement).getByText(seededJournal.correction.narrative),
    ).toBeVisible();
    expect(within(statement).getByText('Correction author')).toBeVisible();
    fireEvent.click(
      within(statement).getByRole('button', {
        name: 'Correct journal statement',
      }),
    );
    const correction = await within(panel).findByRole('form', {
      name: 'Correct journal statement',
    });
    expect(
      within(correction).getByLabelText('Note', { exact: true }),
    ).toHaveValue(seededJournal.correction.narrative);
    fireEvent.change(
      within(correction).getByLabelText('Note', { exact: true }),
      {
        target: { value: 'Calibration slots requested for April' },
      },
    );
    fireEvent.change(within(correction).getByLabelText('Correction reason'), {
      target: { value: 'The supplier moved the slots once more' },
    });
    fireEvent.click(within(correction).getByRole('button', { name: 'Record' }));
    expect(await within(panel).findByText('Recorded.')).toBeVisible();
    const corrected = await within(panel).findByRole('region', {
      name: 'Current journal statement',
    });
    await waitFor(() =>
      expect(
        within(corrected).getByText('Calibration slots requested for April'),
      ).toBeVisible(),
    );
    expect(
      within(corrected).getByText(seededJournal.original.narrative),
    ).toBeVisible();
    expect(bodies).toEqual([
      {
        expectedRevision: 3,
        kind: 'reassessment',
        narrative: 'Supplier confirmed every slot for next year',
        occurredOn: '2026-11-25',
      },
      {
        expectedRevision: 4,
        predecessorId: seededJournal.correction.id,
        narrative: 'Calibration slots requested for April',
        occurredOn: '2026-11-18',
        reason: 'The supplier moved the slots once more',
      },
    ]);
  });

  it.each([
    { state: 'empty', options: { empty: true }, text: 'No risks recorded.' },
    {
      state: 'error',
      options: { risksListStatus: 500 },
      text: 'Reading failed. Please retry.',
    },
    {
      state: 'no-permission',
      options: { risksListStatus: 403 },
      text: 'Access to this register is no longer available. Other functions retain their independent access.',
    },
  ] as const)(
    'shows the $state state of the register',
    async ({ options, text }) => {
      serve(options);
      openImprovement('#operational-risks');
      expect(await screen.findByText(text)).toBeVisible();
    },
  );

  it('shows the loading state of the register', async () => {
    serve({}, (path) => path === '/api/operational-risks');
    openImprovement('#operational-risks');
    const register = await riskRegister();
    expect(within(register).getByRole('status')).toHaveTextContent('Loading…');
  });

  it('lets a Reader read the register and a Risk without recording', async () => {
    serve({
      actor: clarteImprovementActor(['company_operational_risk_recorder']),
    });
    openImprovement('#operational-risks');
    const register = await riskRegister();
    expect(
      screen.getByText(
        'You can read this register. Recording requires a separate permission.',
      ),
    ).toBeVisible();
    expect(
      within(register).queryByRole('button', { name: 'Record a risk' }),
    ).not.toBeInTheDocument();
    const panel = await openRisk(seededRisks.calibration.facts.process);
    expect(
      within(panel).queryByRole('button', { name: 'Correct intake facts' }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole('button', { name: 'Add a log note' }),
    ).not.toBeInTheDocument();
  });
});

describe('Clarté Improvement pages', () => {
  it('EX-248 EX-251: pages through the Ideas and the risk register', async () => {
    serve({ olderIdeas: 24, riskPageSize: 1 });
    openImprovement('#ideas');
    const list = await ideasList();
    expect(await within(list).findByText('Ideas: 27')).toBeVisible();
    // A header row and the first 25 Ideas.
    expect(within(list).getAllByRole('row')).toHaveLength(26);
    fireEvent.click(
      within(list).getByRole('button', { name: 'Next Ideas page' }),
    );
    expect(
      await within(list).findByRole('button', {
        name: 'Older fictional Idea 24',
      }),
    ).toBeVisible();
    expect(within(list).getAllByRole('row')).toHaveLength(3);
    expect(
      within(list).queryByRole('button', { name: 'Next Ideas page' }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Improvement views' }),
      ).getByRole('link', { name: 'Operational risks' }),
    );
    const register = await riskRegister();
    expect(await within(register).findAllByRole('row')).toHaveLength(2);
    fireEvent.click(
      within(register).getByRole('button', { name: 'Load more' }),
    );
    expect(
      await within(register).findByRole('button', {
        name: seededRisks.calibration.facts.process,
      }),
    ).toBeVisible();
    expect(within(register).getAllByRole('row')).toHaveLength(3);
    expect(
      within(register).queryByRole('button', { name: 'Load more' }),
    ).not.toBeInTheDocument();
  });
});

describe('Clarté Improvement in every interface language', () => {
  it.each([
    ['Română', 'Îmbunătățire', 'Propuneți o idee', 'Idei înregistrate'],
    ['Русский', 'Улучшение', 'Предложить идею', 'Зарегистрированные идеи'],
    ['Français', 'Amélioration', 'Proposer une idée', 'Idées enregistrées'],
    ['English', 'Improvement', 'Propose an Idea', 'Recorded Ideas'],
  ])('shows Ideas in %s', async (language, title, propose, list) => {
    serve();
    openImprovement('#ideas');
    await ideasList();
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    fireEvent.click(screen.getByRole('radio', { name: language }));
    expect(
      await screen.findByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
    const region = await screen.findByRole('region', { name: list });
    expect(within(region).getByRole('button', { name: propose })).toBeVisible();
  });
});
