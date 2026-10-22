// Proposed public App HTTP-boundary contracts. Never executed; no PostgreSQL proof.
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import {
  clearWorkspaceSelection,
  selectWorkspace,
} from './access/workspace-selection';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from './localization/interface-locale';
import { InterfaceLocaleSelect } from './localization/InterfaceLocaleSelect';
import { preferenceKey } from './production-shell/company-context-preference';
import { changeValue } from './test/select-option';

const ids = {
  workspace: '00000000-0000-4000-8000-000000000737',
  membership: '00000000-0000-4000-8000-000000000739',
  client: '00000000-0000-4000-8000-000000000740',
  complaint: '00000000-0000-4000-8000-000000000741',
};
const companyA = {
  id: '00000000-0000-4000-8000-000000000738',
  displayName: 'Synthetic Company A',
};
const companyB = {
  id: '00000000-0000-4000-8000-000000000742',
  displayName: 'Synthetic Company B',
};
interface Intake {
  complaintDate: string | null;
  complainant: string;
  subject: string;
  severityDescription: string | null;
  responseDueDate: string | null;
}
const originalIntake: Intake = {
  complaintDate: null,
  complainant: 'Synthetic original complainant',
  subject: 'Private original factual intake737',
  severityDescription: null,
  responseDueDate: null,
};
const actorLabel = {
  workspaceMembershipId: ids.membership,
  displayLabel: 'Synthetic recorder',
};
const complaintPath = `/api/complaints/${ids.complaint}`;

function actor({
  company = companyA,
  projects = false,
}: { company?: typeof companyA; projects?: boolean } = {}): ActorContext {
  return {
    internalUserId: 'synthetic-recorder737',
    workspaceMembershipId: ids.membership,
    workspaceId: ids.workspace,
    workspaceName: 'Synthetic Workspace',
    displayName: actorLabel.displayLabel,
    email: 'synthetic@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...company,
      clientPermissions: ['client.read'],
      clientPermissionAssignmentId: `client-reader:${company.id}`,
      clientPermissionSetVersion: 'v1',
      complaintReaderAssignmentId: `complaint-reader:${company.id}`,
      complaintReaderPermissionSetVersion: 'v1',
      complaintRecorderAssignmentId: `complaint-recorder:${company.id}`,
      complaintRecorderPermissionSetVersion: 'v1',
      projectPermissions: projects ? ['project.read'] : [],
    },
  };
}
function complaint({
  revision = 1,
  intake = originalIntake,
}: {
  revision?: number;
  intake?: Intake;
} = {}) {
  return {
    id: ids.complaint,
    workspaceId: ids.workspace,
    companyId: companyA.id,
    clientAccountId: ids.client,
    clientDisplayName: 'Synthetic original Client',
    projectId: null,
    project: null,
    revision,
    createdAt: '2026-10-20T09:30:00.000Z',
    responsible: actorLabel,
    originalIntake: intake,
    currentIntake: intake,
  };
}
const originalEntry = {
  id: 'original-action737',
  kind: 'action',
  revision: 2,
  text: 'Private original action retained verbatim737',
  declaredDate: null,
  actor: actorLabel,
  recordedAt: '2026-10-20T09:31:00.000Z',
};
function intakeEntry() {
  return {
    id: 'original-intake737',
    kind: 'intake',
    revision: 1,
    intake: originalIntake,
    reason: null,
    actor: actorLabel,
    recordedAt: '2026-10-20T09:30:00.000Z',
  };
}
function history({
  revision = 1,
  entries = [intakeEntry()],
  offset = 0,
}: {
  revision?: number;
  entries?: unknown[];
  offset?: number;
} = {}) {
  return {
    complaintId: ids.complaint,
    companyId: companyA.id,
    revision,
    entries: entries.slice(offset, offset + 25),
    total: entries.length,
    offset,
    pageSize: 25,
  };
}
type Route = { url: URL; method: string; init: RequestInit | undefined };
type Command = {
  path: string;
  body: BodyInit | null | undefined;
  key: string | null;
  contentType: string | null;
};
function serve({
  reply,
  currentComplaint = () => complaint(),
  currentHistory = (offset) => history({ offset }),
  currentActor = (companyId) =>
    actor({ company: companyId === companyB.id ? companyB : companyA }),
}: {
  reply?: (
    route: Route,
  ) => Response | undefined | Promise<Response | undefined>;
  currentComplaint?: () => ReturnType<typeof complaint>;
  currentHistory?: (offset: number) => ReturnType<typeof history>;
  currentActor?: (companyId: string | null) => ActorContext;
} = {}) {
  const commands: Command[] = [];
  const reads: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin);
      const method = init?.method ?? 'GET';
      if (method !== 'GET')
        commands.push({
          path: url.pathname,
          body: init?.body,
          key: new Headers(init?.headers).get('idempotency-key'),
          contentType: new Headers(init?.headers).get('content-type'),
        });
      else reads.push(`${url.pathname}${url.search}`);
      const custom = await reply?.({ url, method, init });
      if (custom) return custom;
      const selectedCompany = new Headers(init?.headers).get(
        'x-company-context-id',
      );
      if (url.pathname === '/api/access/current-actor')
        return Response.json(currentActor(selectedCompany));
      if (url.pathname === '/api/companies')
        return Response.json([companyA, companyB]);
      if (url.pathname === '/api/activity-log')
        return Response.json({ events: [] });
      if (url.pathname === '/api/operational-home')
        return Response.json({
          companyId: selectedCompany ?? companyA.id,
          today: '2026-10-20',
          summaries: [{ kind: 'active_clients', count: 1 }],
        });
      if (url.pathname === '/api/clients' || url.pathname === '/api/projects')
        return Response.json([]);
      if (url.pathname === '/api/clients/search')
        return Response.json([
          {
            id: ids.client,
            displayName: 'Synthetic original Client',
            relatedToActiveCompany: true,
          },
        ]);
      if (url.pathname === '/api/complaints' && method === 'GET')
        return Response.json({
          companyId: selectedCompany ?? companyA.id,
          complaints:
            selectedCompany === companyB.id ? [] : [currentComplaint()],
          total: selectedCompany === companyB.id ? 0 : 1,
          offset: Number(url.searchParams.get('offset') ?? 0),
          pageSize: 25,
        });
      if (url.pathname === complaintPath && method === 'GET')
        return Response.json(currentComplaint());
      if (url.pathname === `${complaintPath}/history`)
        return Response.json(
          currentHistory(Number(url.searchParams.get('offset') ?? 0)),
        );
      return Response.json(
        { message: 'Unprovided synthetic endpoint' },
        { status: 404 },
      );
    }),
  );
  return { commands, reads };
}
function mount(identity = deterministicBrowserIdentity()) {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  localStorage.setItem(preferenceKey(actor()), companyA.id);
  return render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <App identity={identity} />
    </InterfaceLocaleProvider>,
  );
}
async function openComplaint() {
  const region = await screen.findByRole('region', {
    name: 'Complaints',
  });
  fireEvent.click(
    await within(region).findByRole('button', {
      name: 'Open complaint',
    }),
  );
  await within(region).findByRole('heading', {
    name: originalIntake.subject,
  });
  return region;
}
async function openRegistration() {
  const region = await screen.findByRole('region', {
    name: 'Complaints',
  });
  fireEvent.click(
    await within(region).findByRole('button', {
      name: 'Record a complaint',
    }),
  );
  changeValue(within(region).getByLabelText('Client name'), 'Synthetic');
  fireEvent.click(within(region).getByRole('button', { name: 'Find Client' }));
  await waitFor(() =>
    expect(within(region).getByLabelText('Original Client')).not.toBeDisabled(),
  );
  changeValue(within(region).getByLabelText('Original Client'), ids.client);
  changeValue(
    within(region).getByLabelText('Complainant'),
    originalIntake.complainant,
  );
  changeValue(
    within(region).getByLabelText('Complaint content'),
    originalIntake.subject,
  );
  fireEvent.click(
    within(region).getByRole('button', {
      name: 'I take responsibility for this complaint',
    }),
  );
  return region;
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected a public JSON object.');
  return Object.fromEntries(Object.entries(value));
}
function commandBody(command: Command | undefined): Record<string, unknown> {
  if (!command || typeof command.body !== 'string')
    throw new Error('Expected a serialized public command.');
  const value: unknown = JSON.parse(command.body);
  return object(value);
}
function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve: (value: T) => {
      if (!complete) throw new Error('Missing deferred boundary.');
      complete(value);
    },
  };
}
const originalScroll = Element.prototype.scrollIntoView;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  selectWorkspace(ids.workspace);
  window.history.replaceState({}, '', '/?frame=prisme#complaints');
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }) satisfies MediaQueryList,
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Element.prototype.scrollIntoView = originalScroll;
  clearWorkspaceSelection();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

it.each(['action', 'response'])(
  'records an attributed factual %s without a sending or closure action',
  async (kind) => {
    const text = `  Literal ${kind} declaration <script>not executable</script>\nȘtefan / Иван  `;
    const entry = {
      ...originalEntry,
      id: `entry-${kind}`,
      kind,
      text,
      declaredDate: '2024-02-29',
      corrected: false,
    };
    let committed = false;
    const api = serve({
      currentComplaint: () => complaint({ revision: committed ? 2 : 1 }),
      currentHistory: (offset) =>
        history({
          revision: committed ? 2 : 1,
          entries: committed ? [intakeEntry(), entry] : [intakeEntry()],
          offset,
        }),
      reply: ({ url, method }) => {
        if (url.pathname !== `${complaintPath}/journal` || method !== 'POST')
          return undefined;
        committed = true;
        return Response.json(complaint({ revision: 2 }), { status: 201 });
      },
    });
    mount();
    const region = await openComplaint();
    fireEvent.click(
      within(region).getByRole('button', {
        name: kind === 'action' ? 'Action' : 'Response',
      }),
    );
    changeValue(within(region).getByLabelText('Factual text'), text);
    changeValue(
      within(region).getByLabelText('Declared action or response date', {
        exact: false,
      }),
      '2024-02-29',
    );
    fireEvent.click(
      within(region).getByRole('button', { name: 'Record factual entry' }),
    );
    await within(region).findByText('Record saved.');
    const journal = within(region).getByRole('region', {
      name: 'Factual history',
    });
    expect(
      await within(journal).findByText(text, {
        exact: true,
        normalizer: (value) => value,
      }),
    ).toBeVisible();
    expect(
      within(journal).getAllByText(/Synthetic recorder/u).length,
    ).toBeGreaterThan(0);
    expect(
      within(region).getByText(
        'Recording a response does not send it or close the complaint.',
      ),
    ).toBeVisible();
    expect(region.querySelector('script')).toBeNull();
    expect(api.commands).toHaveLength(1);
    expect(commandBody(api.commands[0])).toEqual({
      kind,
      text,
      declaredDate: '2024-02-29',
      expectedRevision: 1,
    });
    expect(api.commands[0]?.contentType).toBe('application/json');
    expect(api.commands[0]?.key).toBeTruthy();
    expect(api.commands[0]?.path).toBe(`${complaintPath}/journal`);
  },
);

it.each([false, true])(
  'keeps exact uncertain correction intent across navigation and connects every paged correction to its immutable original (later revision before replay: %s)',
  async (advanceBeforeReplay) => {
    const prior = {
      id: 'prior-correction737',
      kind: 'correction',
      revision: 28,
      text: 'Prior corrected factual action737',
      declaredDate: null,
      reason: 'Prior explicit reason737',
      originalEntryId: originalEntry.id,
      originalKind: 'action',
      original: originalEntry,
      actor: actorLabel,
      recordedAt: '2026-10-20T10:00:00.000Z',
    };
    const correctedText =
      '  Additional factual correction <script>literal only</script>737  ';
    const latest = {
      ...prior,
      id: 'latest-correction737',
      revision: 29,
      text: correctedText,
      reason: 'Additional explicit reason737',
      recordedAt: '2026-10-20T10:01:00.000Z',
    };
    const intervening = Array.from({ length: 25 }, (_, index) => ({
      ...originalEntry,
      id: `intermediate-action-${index}`,
      revision: index + 3,
      text: `Intermediate factual action ${index}`,
      corrected: false,
      recordedAt: `2026-10-20T09:${String(index + 32).padStart(2, '0')}:00.000Z`,
    }));
    const initialEntries = [
      intakeEntry(),
      { ...originalEntry, corrected: true },
      ...intervening,
      prior,
    ];
    let committed = false;
    let advanced = false;
    const laterAction = {
      ...originalEntry,
      id: 'another-recorder-action737',
      revision: 30,
      text: 'Independent action recorded after the correction737',
      corrected: false,
      actor: {
        workspaceMembershipId: 'other-recorder737',
        displayLabel: 'Another recorder',
      },
      recordedAt: '2026-10-20T10:02:00.000Z',
    };
    const api = serve({
      currentComplaint: () =>
        complaint({ revision: advanced ? 30 : committed ? 29 : 28 }),
      currentHistory: (offset) =>
        history({
          revision: advanced ? 30 : committed ? 29 : 28,
          entries: advanced
            ? [...initialEntries, latest, laterAction]
            : committed
              ? [...initialEntries, latest]
              : initialEntries,
          offset,
        }),
      reply: ({ url, method }) => {
        if (
          url.pathname !==
            `${complaintPath}/journal/${originalEntry.id}/corrections` ||
          method !== 'POST'
        )
          return undefined;
        if (!committed) {
          committed = true;
          return Response.json(
            { message: 'Synthetic lost acknowledgement' },
            { status: 503 },
          );
        }
        return Response.json(complaint({ revision: 29 }), { status: 201 });
      },
    });
    mount();
    let region = await openComplaint();
    let journal = within(region).getByRole('region', {
      name: 'Factual history',
    });
    const originalText = await within(journal).findByText(originalEntry.text, {
      exact: true,
    });
    const originalRow = originalText.closest('li');
    if (!originalRow)
      throw new Error('The public original history row is unavailable.');
    expect(
      within(originalRow).getByText('Corrected; original retained'),
    ).toBeVisible();
    fireEvent.click(
      within(originalRow).getByRole('button', { name: 'Record correction' }),
    );
    changeValue(within(region).getByLabelText('Factual text'), correctedText);
    changeValue(
      within(region).getByLabelText('Correction reason'),
      latest.reason,
    );
    const correctionForm = within(region)
      .getByLabelText('Correction reason')
      .closest('form');
    if (!correctionForm)
      throw new Error('The public correction form is unavailable.');
    fireEvent.click(
      within(correctionForm).getByRole('button', { name: 'Record correction' }),
    );
    await within(region).findByText(
      'The save outcome is uncertain. Retry the same save before changing the facts.',
    );
    expect(api.commands).toHaveLength(1);
    expect(api.commands[0]?.key).toBeTruthy();
    expect(api.commands[0]?.contentType).toBe('application/json');
    const localeControl = screen.getByLabelText('Interface language');
    changeValue(localeControl, 'fr');
    await screen.findByRole('region', { name: 'Réclamations' });
    for (const hash of ['#overview', '#complaints'])
      act(() => {
        window.history.pushState({}, '', `/?frame=prisme${hash}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
    changeValue(localeControl, 'en');
    region = await screen.findByRole('region', {
      name: 'Complaints',
    });
    expect(within(region).getByLabelText('Factual text')).toHaveValue(
      correctedText,
    );
    advanced = advanceBeforeReplay;
    fireEvent.click(
      within(region).getByRole('button', { name: 'Retry the same save' }),
    );
    await within(region).findByText('Record saved.');
    expect(api.commands).toHaveLength(2);
    expect(api.commands[1]).toEqual(api.commands[0]);
    expect(commandBody(api.commands[0])).toEqual({
      text: correctedText,
      declaredDate: null,
      expectedRevision: 28,
      reason: latest.reason,
    });
    journal = within(region).getByRole('region', { name: 'Factual history' });
    await within(journal).findByText(originalEntry.text, { exact: true });
    fireEvent.click(within(journal).getByRole('button', { name: 'Next page' }));
    await within(journal).findByText(latest.reason, { exact: false });
    expect(
      within(journal).getByText(prior.reason, { exact: false }),
    ).toBeVisible();
    expect(
      within(journal).getAllByText(originalEntry.text, { exact: true }),
    ).toHaveLength(2);
    const latestText = within(journal).getByText(correctedText, {
      exact: true,
      normalizer: (value) => value,
    });
    const latestRow = latestText.closest('li');
    if (!latestRow)
      throw new Error('The public latest correction row is unavailable.');
    expect(
      within(latestRow).queryByRole('button', { name: 'Record correction' }),
    ).toBeNull();
    expect(api.reads).toContain(`${complaintPath}/history?offset=25`);
    if (advanceBeforeReplay) {
      const laterRow = within(journal)
        .getByText(laterAction.text)
        .closest('li');
      if (!laterRow)
        throw new Error('The later factual action is unavailable.');
      expect(
        within(laterRow).getByText(/^Recorded by: Another recorder ·/u),
      ).toBeVisible();
    }
    expect(journal.querySelector('script')).toBeNull();
  },
);

it.each([401, 403])(
  'retires private facts and drafts after HTTP%s before403 revalidation resolves, then rejects a late history reply',
  async (status) => {
    const late = deferred<Response>();
    const actorRevalidation = deferred<Response>();
    let historyStarted = false;
    let refused = false;
    let revalidationStarted = false;
    const identity = {
      ...deterministicBrowserIdentity(),
      rejectSession: vi.fn(async () => undefined),
    };
    const api = serve({
      reply: ({ url, method }) => {
        if (
          url.pathname === '/api/access/current-actor' &&
          refused &&
          status === 403
        ) {
          revalidationStarted = true;
          return actorRevalidation.promise;
        }
        if (url.pathname === `${complaintPath}/history`) {
          historyStarted = true;
          return late.promise;
        }
        if (url.pathname === `${complaintPath}/journal` && method === 'POST') {
          refused = true;
          return Response.json({}, { status });
        }
        return undefined;
      },
    });
    mount(identity);
    const region = await openComplaint();
    await waitFor(() => expect(historyStarted).toBe(true));
    fireEvent.click(within(region).getByRole('button', { name: 'Action' }));
    changeValue(
      within(region).getByLabelText('Factual text'),
      'Private draft before access refusal737',
    );
    fireEvent.click(
      within(region).getByRole('button', { name: 'Record factual entry' }),
    );
    try {
      if (status === 403)
        await waitFor(() => expect(revalidationStarted).toBe(true));
      // The actor response remains unresolved here: retirement cannot wait for it.
      await waitFor(() =>
        expect(
          screen.queryAllByText(originalIntake.subject, { exact: true }),
        ).toHaveLength(0),
      );
      expect(
        screen.queryByDisplayValue('Private draft before access refusal737'),
      ).not.toBeInTheDocument();
      await act(async () => actorRevalidation.resolve(Response.json(actor())));
      await act(async () => late.resolve(Response.json(history())));
      expect(
        screen.queryAllByText(originalIntake.complainant, { exact: true }),
      ).toHaveLength(0);
      expect(
        screen.queryAllByText(originalIntake.subject, { exact: true }),
      ).toHaveLength(0);
      expect(api.commands).toHaveLength(1);
      if (status === 401) expect(identity.rejectSession).toHaveBeenCalledOnce();
    } finally {
      actorRevalidation.resolve(Response.json(actor()));
      late.resolve(Response.json(history()));
    }
  },
);

it('discards a late committed journal reply and private draft after an actual Company selection change', async () => {
  const late = deferred<Response>();
  let started = false;
  serve({
    reply: ({ url, method }) => {
      if (url.pathname === `${complaintPath}/journal` && method === 'POST') {
        started = true;
        return late.promise;
      }
      return undefined;
    },
  });
  mount();
  const region = await openComplaint();
  fireEvent.click(within(region).getByRole('button', { name: 'Action' }));
  changeValue(
    within(region).getByLabelText('Factual text'),
    'Private Company A draft737',
  );
  fireEvent.click(
    within(region).getByRole('button', { name: 'Record factual entry' }),
  );
  await waitFor(() => expect(started).toBe(true));
  try {
    changeValue(
      screen.getByLabelText('Active Company', { exact: true }),
      companyB.id,
    );
    await screen.findByText('No complaints are available in this Company.');
    const next = screen.getByRole('region', {
      name: 'Complaints',
    });
    await act(async () =>
      late.resolve(Response.json(complaint({ revision: 2 }), { status: 201 })),
    );
    expect(
      screen.queryByText(originalIntake.subject, { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByDisplayValue('Private Company A draft737'),
    ).not.toBeInTheDocument();
    expect(within(next).queryByText('Record saved.')).not.toBeInTheDocument();
  } finally {
    late.resolve(Response.json(complaint({ revision: 2 }), { status: 201 }));
  }
});

it.each([false, true])(
  'reopens current intake and history after a historical creation receipt replay (first detail read fails: %s)',
  async (firstReadFails) => {
    const currentIntake = {
      ...originalIntake,
      subject: 'Current intake corrected by another recorder737',
    };
    const latest = {
      ...complaint({ revision: 2 }),
      currentIntake,
    };
    const correction = {
      id: 'other-intake-correction737',
      kind: 'intake_correction',
      revision: 2,
      intake: currentIntake,
      reason: 'Another recorder corrected the intake before the retry737',
      actor: {
        workspaceMembershipId: 'other-recorder737',
        displayLabel: 'Another recorder',
      },
      recordedAt: '2026-10-20T09:32:00.000Z',
    };
    const detail = deferred<Response>();
    let committed = false;
    let laterRevision = false;
    let detailReads = 0;
    const api = serve({
      currentComplaint: () => (laterRevision ? latest : complaint()),
      currentHistory: (offset) =>
        history({
          revision: laterRevision ? 2 : 1,
          entries: laterRevision
            ? [intakeEntry(), correction]
            : [intakeEntry()],
          offset,
        }),
      reply: ({ url, method }) => {
        if (url.pathname === '/api/complaints' && method === 'POST') {
          if (!committed) {
            committed = true;
            return Response.json({}, { status: 503 });
          }
          // Exact replay confirms the original write, not today's aggregate.
          return Response.json(complaint(), { status: 201 });
        }
        if (url.pathname === '/api/complaints' && method === 'GET')
          return Response.json({
            companyId: companyA.id,
            complaints: committed ? [laterRevision ? latest : complaint()] : [],
            total: committed ? 1 : 0,
            offset: 0,
            pageSize: 25,
          });
        if (url.pathname === complaintPath && method === 'GET') {
          detailReads += 1;
          return detailReads === 1 ? detail.promise : Response.json(latest);
        }
        return undefined;
      },
    });
    mount();
    const region = await openRegistration();
    fireEvent.click(
      within(region).getByRole('button', { name: 'Save complaint' }),
    );
    await within(region).findByText(
      'The save outcome is uncertain. Retry the same save before changing the facts.',
    );
    laterRevision = true;
    fireEvent.click(
      within(region).getByRole('button', { name: 'Retry the same save' }),
    );
    await within(region).findByText('Record saved.');
    expect(within(region).queryByRole('article')).not.toBeInTheDocument();
    await act(async () =>
      detail.resolve(
        firstReadFails
          ? Response.json({}, { status: 500 })
          : Response.json(latest),
      ),
    );
    if (firstReadFails) {
      await within(region).findByText(
        'The save is confirmed. Updated history could not be loaded.',
      );
      expect(
        within(region).getByText('Records could not be loaded. Try again.'),
      ).toBeVisible();
      expect(within(region).queryByRole('article')).not.toBeInTheDocument();
      const retry = within(region).getByRole('button', {
        name: 'Reload records',
      });
      expect(retry).toHaveClass('complaint-button');
      fireEvent.click(retry);
    }
    await within(region).findByRole('heading', { name: currentIntake.subject });
    const journal = within(region).getByRole('region', {
      name: 'Factual history',
    });
    expect(
      await within(journal).findByText(
        `Correction reason: ${correction.reason}`,
      ),
    ).toBeVisible();
    expect(
      within(journal).getByText(/^Recorded by: Another recorder ·/u),
    ).toBeVisible();
    expect(
      within(journal).getByText(originalIntake.subject, { exact: true }),
    ).toBeVisible();
    expect(within(region).getByText('Record saved.')).toBeVisible();
    expect(detailReads).toBe(firstReadFails ? 2 : 1);
    expect(api.commands).toHaveLength(2);
    expect(api.commands[1]).toEqual(api.commands[0]);
    expect(api.commands[0]?.key).toBeTruthy();
    expect(commandBody(api.commands[0])).toEqual({
      clientAccountId: ids.client,
      projectId: null,
      responsibleMembershipId: ids.membership,
      ...originalIntake,
    });
  },
);

it('keeps a confirmed journal write confirmed after failed reads and recovers history without repeating the write', async () => {
  const entry = { ...originalEntry, corrected: false };
  let committed = false;
  let failReads = false;
  const api = serve({
    currentComplaint: () => complaint({ revision: committed ? 2 : 1 }),
    currentHistory: (offset) =>
      history({
        revision: committed ? 2 : 1,
        entries: committed ? [intakeEntry(), entry] : [intakeEntry()],
        offset,
      }),
    reply: ({ url, method }) => {
      if (url.pathname === `${complaintPath}/journal` && method === 'POST') {
        committed = true;
        failReads = true;
        return Response.json(complaint({ revision: 2 }), { status: 201 });
      }
      if (
        failReads &&
        (url.pathname === '/api/complaints' ||
          url.pathname === `${complaintPath}/history`)
      )
        return Response.json({}, { status: 500 });
      return undefined;
    },
  });
  mount();
  const region = await openComplaint();
  fireEvent.click(within(region).getByRole('button', { name: 'Action' }));
  changeValue(
    within(region).getByLabelText('Factual text'),
    originalEntry.text,
  );
  fireEvent.click(
    within(region).getByRole('button', { name: 'Record factual entry' }),
  );
  await within(region).findByText(
    'The save is confirmed. Updated history could not be loaded.',
  );
  expect(
    within(region).queryByRole('button', { name: 'Retry the same save' }),
  ).toBeNull();
  expect(
    within(region).getByRole('heading', {
      name: originalIntake.subject,
    }),
  ).toBeVisible();
  failReads = false;
  const journal = within(region).getByRole('region', {
    name: 'Factual history',
  });
  fireEvent.click(
    within(journal).getByRole('button', {
      name: 'Reload records',
    }),
  );
  await waitFor(() => expect(journal).not.toBeInTheDocument());
  const refreshedJournal = await within(region).findByRole('region', {
    name: 'Factual history',
  });
  expect(
    await within(refreshedJournal).findByText(originalEntry.text, {
      exact: true,
    }),
  ).toBeVisible();
  expect(api.commands).toHaveLength(1);
});

it.each([false, true])(
  'handles optional Project403 independently and retires the draft only when a replacement Reader assignment is actually revalidated (Reader replaced: %s)',
  async (readerReplaced) => {
    let denyOneProjectRead = false;
    let projectReads = 0;
    let revalidated = false;
    let committed = false;
    const api = serve({
      currentActor: () => {
        const current = actor({ projects: true });
        const company = current.activeCompany;
        if (!company)
          throw new Error('The synthetic active Company is required.');
        return readerReplaced && revalidated
          ? {
              ...current,
              activeCompany: {
                ...company,
                complaintReaderAssignmentId: 'replacement-reader737',
              },
            }
          : current;
      },
      reply: ({ url, method }) => {
        if (url.pathname === '/api/projects') {
          projectReads += 1;
          if (denyOneProjectRead) {
            denyOneProjectRead = false;
            return Response.json({}, { status: 403 });
          }
        }
        if (url.pathname === '/api/access/current-actor' && projectReads > 1)
          revalidated = true;
        if (url.pathname === '/api/complaints' && method === 'GET')
          return Response.json({
            companyId: companyA.id,
            complaints: committed ? [complaint()] : [],
            total: committed ? 1 : 0,
            offset: 0,
            pageSize: 25,
          });
        if (url.pathname === '/api/complaints' && method === 'POST') {
          committed = true;
          return Response.json(complaint(), { status: 201 });
        }
        return undefined;
      },
    });
    mount();
    await waitFor(() => expect(projectReads).toBeGreaterThan(0));
    const region = await screen.findByRole('region', {
      name: 'Complaints',
    });
    fireEvent.click(
      await within(region).findByRole('button', {
        name: 'Record a complaint',
      }),
    );
    changeValue(
      within(region).getByLabelText('Complainant'),
      originalIntake.complainant,
    );
    changeValue(
      within(region).getByLabelText('Complaint content'),
      originalIntake.subject,
    );
    fireEvent.click(
      within(region).getByRole('button', {
        name: 'I take responsibility for this complaint',
      }),
    );
    changeValue(within(region).getByLabelText('Client name'), 'Synthetic');
    fireEvent.click(
      within(region).getByRole('button', { name: 'Find Client' }),
    );
    await waitFor(() =>
      expect(
        within(region).getByLabelText('Original Client'),
      ).not.toBeDisabled(),
    );
    denyOneProjectRead = true;
    changeValue(within(region).getByLabelText('Original Client'), ids.client);
    await waitFor(() => expect(revalidated).toBe(true));
    if (readerReplaced) {
      await waitFor(() =>
        expect(
          screen.queryByDisplayValue(originalIntake.subject),
        ).not.toBeInTheDocument(),
      );
      const next = await screen.findByRole('region', {
        name: 'Complaints',
      });
      expect(
        within(next).queryByRole('button', {
          name: 'Save complaint',
        }),
      ).toBeNull();
      expect(api.commands).toHaveLength(0);
      return;
    }
    expect(within(region).getByLabelText('Complaint content')).toHaveValue(
      originalIntake.subject,
    );
    expect(
      within(region).getByRole('button', {
        name: 'I take responsibility for this complaint',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(region).getByRole('button', {
        name: 'Save complaint',
      }),
    ).toBeEnabled();
    fireEvent.click(
      within(region).getByRole('button', {
        name: 'Save complaint',
      }),
    );
    await within(region).findByText('Record saved.');
    expect(commandBody(api.commands[0])).toEqual({
      clientAccountId: ids.client,
      projectId: null,
      responsibleMembershipId: ids.membership,
      ...originalIntake,
    });
  },
);

it.each([
  { field: 'Declared complaint date', value: '0000-01-01', valid: false },
  {
    field: 'Declared response due date (optional)',
    value: '0000-01-01',
    valid: false,
  },
  { field: 'Declared complaint date', value: '2023-02-29', valid: false },
  { field: 'Declared complaint date', value: '0001-01-01', valid: true },
  {
    field: 'Declared response due date (optional)',
    value: '9999-12-31',
    valid: true,
  },
  { field: 'Declared complaint date', value: '2024-02-29', valid: true },
])(
  'validates declared intake calendar $field=$value without guessing a deadline',
  async ({ field, value, valid }) => {
    const intake: Intake = {
      ...originalIntake,
      complaintDate: field === 'Declared complaint date' ? value : null,
      responseDueDate:
        field === 'Declared response due date (optional)' ? value : null,
    };
    let committed = false;
    const api = serve({
      currentComplaint: () =>
        complaint({ intake: committed ? intake : originalIntake }),
      currentHistory: (offset) =>
        history({
          entries: [
            { ...intakeEntry(), intake: committed ? intake : originalIntake },
          ],
          offset,
        }),
      reply: ({ url, method }) => {
        if (url.pathname === '/api/complaints' && method === 'GET')
          return Response.json({
            companyId: companyA.id,
            complaints: committed ? [complaint({ intake })] : [],
            total: committed ? 1 : 0,
            offset: 0,
            pageSize: 25,
          });
        if (url.pathname === '/api/complaints' && method === 'POST') {
          committed = true;
          return Response.json(complaint({ intake }), { status: 201 });
        }
        return undefined;
      },
    });
    mount();
    const region = await openRegistration();
    changeValue(within(region).getByLabelText(field, { exact: false }), value);
    const save = within(region).getByRole('button', {
      name: 'Save complaint',
    });
    if (!valid) {
      expect(save).toBeDisabled();
      expect(api.commands).toHaveLength(0);
      return;
    }
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await within(region).findByText('Record saved.');
    expect(commandBody(api.commands[0])).toEqual({
      clientAccountId: ids.client,
      projectId: null,
      responsibleMembershipId: ids.membership,
      ...intake,
    });
  },
);

it('keeps currently authorized saved facts and history after the server refuses a new correction for a historical original Client', async () => {
  // The existing server's lockActiveReferenceClient refuses a new write with404,
  // while the current authorized Complaint detail/history can still return200.
  // This fixture proves App recovery only; a real union/supersession REST case is still required.
  const api = serve({
    reply: ({ url, method }) =>
      url.pathname === `${complaintPath}/intake-corrections` &&
      method === 'POST'
        ? Response.json(
            { statusCode: 404, message: 'Not Found', error: 'Not Found' },
            { status: 404 },
          )
        : undefined,
  });
  mount();
  let region = await openComplaint();
  let journal = within(region).getByRole('region', { name: 'Factual history' });
  await within(journal).findByText(originalIntake.complainant, { exact: true });
  fireEvent.click(
    within(region).getByRole('button', {
      name: 'Correct complaint facts',
    }),
  );
  changeValue(
    within(region).getByLabelText('Complaint content'),
    'A new correction the server refuses737',
  );
  changeValue(
    within(region).getByLabelText('Correction reason'),
    'Explicit factual correction reason737',
  );
  const form = within(region)
    .getByLabelText('Correction reason')
    .closest('form');
  if (!form)
    throw new Error('The public intake-correction form is unavailable.');
  fireEvent.click(
    within(form).getByRole('button', {
      name: 'Record correction',
    }),
  );
  await screen.findByText(
    'The change was refused. Review the saved facts before trying again.',
  );
  region = screen.getByRole('region', { name: 'Complaints' });
  journal = within(region).getByRole('region', { name: 'Factual history' });
  expect(
    await within(journal).findByText(originalIntake.complainant, {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    within(region).getByRole('heading', {
      name: originalIntake.subject,
    }),
  ).toBeVisible();
  expect(
    within(region).queryByText('A new correction the server refuses737', {
      exact: true,
    }),
  ).toBeNull();
  expect(api.commands).toHaveLength(1);
  expect(api.commands[0]?.path).toBe(`${complaintPath}/intake-corrections`);
  expect(commandBody(api.commands[0])).toEqual({
    ...originalIntake,
    subject: 'A new correction the server refuses737',
    expectedRevision: 1,
    reason: 'Explicit factual correction reason737',
  });
  expect(
    api.reads.filter((path) => path === complaintPath).length,
  ).toBeGreaterThanOrEqual(2);
  expect(
    api.reads.filter((path) => path === `${complaintPath}/history`).length,
  ).toBeGreaterThanOrEqual(2);
});
