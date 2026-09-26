import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { formatApplicationDateTime } from '../presentation/date-time';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { DocumentWorkspace } from './DocumentWorkspace';
/**
 * Every opened detail mounts its Versions section. These tests prove other
 * behaviour, so that read is answered as safely unavailable before the test's
 * own transport sees it.
 */
function stubFetch(
  fetcher: (input: string, init?: RequestInit) => unknown,
): void {
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) =>
    /^\/api\/documents\/[^/]+\/versions$/u.test(
      new URL(input, 'http://localhost').pathname,
    )
      ? Promise.resolve(new Response(null, { status: 404 }))
      : fetcher(input, init),
  );
}

const correctingActor: ActorContext = {
  internalUserId: 'user',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Registrar',
  email: 'registrar@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company',
    displayName: 'PRISMA-PRIM',
    clientPermissions: ['client.read'],
    documentPermissions: [
      'document.read',
      'document.register',
      'document.reference.read',
      'document.correct',
    ],
  },
};
type DocumentPermission = NonNullable<
  NonNullable<ActorContext['activeCompany']>['documentPermissions']
>[number];
function readerWith(documentPermissions: DocumentPermission[]): ActorContext {
  return {
    ...correctingActor,
    activeCompany: {
      id: 'company',
      displayName: 'PRISMA-PRIM',
      clientPermissions: ['client.read'],
      documentPermissions,
    },
  };
}
const identity: BrowserIdentity = {
  loaded: true,
  signedIn: true,
  getToken: async () => 'token',
  rejectSession: async () => undefined,
  signOut: async () => undefined,
  signedOutView: null,
};
const document = {
  id: 'document',
  companyId: 'company',
  clientId: 'client',
  clientDisplayName: 'Synthetic Client',
  title: 'Initial assessment questionnaire',
  purpose: 'Prepare the corrected assessment',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: '2026-09-19T12:00:00.000Z',
  workingRevision: 4,
  correction: 'allowed',
  version: {
    id: 'version',
    status: 'draft',
    representation: {
      id: 'representation',
      kind: 'external-reference',
      verification: 'unverified',
      access: 'granted',
      url: 'https://example.test/questionnaire',
    },
  },
};
const otherDocument = {
  ...document,
  id: 'other-document',
  title: 'Supplier evidence checklist',
  purpose: 'Collect supplier evidence',
};
const purposeCorrection = {
  revision: 4,
  occurredAt: '2026-09-24T09:15:00.000Z',
  actor: { displayName: 'Document Registrar' },
  changes: {
    purpose: {
      before: 'Prepare assessment',
      after: 'Prepare the corrected assessment',
    },
  },
};
const titleAndUrlCorrection = {
  revision: 3,
  occurredAt: '2026-09-23T08:00:00.000Z',
  actor: { displayName: 'Second Registrar' },
  changes: {
    title: {
      before: 'Draft questionnaire',
      after: 'Initial assessment questionnaire',
    },
    url: {
      before: 'https://example.test/previous',
      after: 'https://example.test/questionnaire',
    },
  },
};
const urlOnlyCorrection = {
  revision: 2,
  occurredAt: '2026-09-22T07:00:00.000Z',
  actor: { displayName: 'Document Registrar' },
  changes: {
    url: {
      before: 'https://example.test/first',
      after: 'https://example.test/previous',
    },
  },
};
const historyPage = (
  corrections: unknown[],
  nextBeforeRevision: number | null = null,
) => Response.json({ corrections, nextBeforeRevision });

interface HistoryRequest {
  documentId: string;
  beforeRevision: string | null;
  signal: AbortSignal | undefined;
}
/**
 * Serves the Documents API. Every history read is recorded and answered by
 * `history`; detail and PATCH answers can be replaced per test.
 */
function serve({
  history,
  documents = [document],
  patch,
  detail = (id: string) => documents.find((row) => row.id === id),
}: {
  history: (request: HistoryRequest) => Response | Promise<Response>;
  documents?: Array<typeof document>;
  patch?: (init: RequestInit) => Response | Promise<Response>;
  detail?: (id: string) => unknown;
}) {
  const historyRequests: HistoryRequest[] = [];
  const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    const historyPath = /^\/api\/documents\/([^/]+)\/correction-history$/u.exec(
      url.pathname,
    );
    if (historyPath?.[1]) {
      const request = {
        documentId: decodeURIComponent(historyPath[1]),
        beforeRevision: url.searchParams.get('beforeRevision'),
        signal: init?.signal ?? undefined,
      };
      historyRequests.push(request);
      return history(request);
    }
    if (url.pathname === '/api/clients') return Response.json([]);
    if (url.pathname === '/api/documents') return Response.json(documents);
    if (init?.method === 'PATCH' && patch) return patch(init);
    const id = decodeURIComponent(url.pathname.replace('/api/documents/', ''));
    const row = detail(id);
    return row ? Response.json(row) : new Response(null, { status: 404 });
  });
  stubFetch(fetcher);
  return { fetcher, historyRequests };
}
async function openDocument(title = document.title) {
  fireEvent.click(await screen.findByRole('button', { name: title }));
  const heading = await screen.findByRole('heading', { name: title });
  const detail = heading.closest('article');
  if (!detail) throw new Error('Expected the Document detail.');
  return detail;
}
function historySection() {
  return screen.getByRole('region', { name: 'Correction history' });
}
function historyToggle() {
  return within(historySection()).getByRole('button', {
    name: /reference correction history$/u,
  });
}
async function historyEntries() {
  const list = await within(historySection()).findByRole('list', {
    name: 'Reference corrections, newest first',
  });
  return within(list).getAllByRole('listitem');
}
/** Lets every released response settle before proving what it changed. */
const settle = () =>
  act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));

afterEach(() => vi.unstubAllGlobals());

it('opens a collapsed history on demand and loads older corrections by revision cursor as plain text', async () => {
  const { historyRequests } = serve({
    history: ({ beforeRevision }) =>
      beforeRevision === '3'
        ? historyPage([urlOnlyCorrection])
        : historyPage([purposeCorrection, titleAndUrlCorrection], 3),
  });
  render(<DocumentWorkspace actor={correctingActor} identity={identity} />);
  await openDocument();

  expect(historyToggle()).toHaveAccessibleName(
    'Show reference correction history',
  );
  expect(historyToggle()).toHaveAttribute('aria-expanded', 'false');
  expect(historyRequests).toHaveLength(0);

  fireEvent.click(historyToggle());
  expect(historyToggle()).toHaveAttribute('aria-expanded', 'true');
  expect(within(historySection()).getByRole('status')).toHaveTextContent(
    'Loading correction history…',
  );
  const [newest, older] = await historyEntries();
  expect(historyRequests).toEqual([
    expect.objectContaining({ documentId: 'document', beforeRevision: null }),
  ]);
  if (!newest || !older) throw new Error('Expected two corrections.');
  expect(within(newest).getByText('Working revision 4')).toBeInTheDocument();
  expect(within(older).getByText('Working revision 3')).toBeInTheDocument();
  expect(
    within(newest).getByText('Corrected by Document Registrar'),
  ).toBeInTheDocument();
  expect(newest.querySelector('time')).toHaveAttribute(
    'datetime',
    purposeCorrection.occurredAt,
  );
  expect(newest.querySelector('time')).toHaveTextContent(
    formatApplicationDateTime(purposeCorrection.occurredAt),
  );
  expect(within(newest).getByRole('term')).toHaveTextContent('Purpose');
  expect(within(newest).getByRole('definition')).toHaveTextContent(
    'Prepare assessment → changed to Prepare the corrected assessment',
  );
  expect(
    within(older)
      .getAllByRole('term')
      .map((term) => term.textContent),
  ).toEqual(['Title', 'External HTTPS link']);
  expect(within(older).getAllByRole('definition')[1]).toHaveTextContent(
    'https://example.test/previous → changed to https://example.test/questionnaire',
  );
  // Historical references stay inert text: nothing links, opens or fetches them.
  expect(within(historySection()).queryByRole('link')).not.toBeInTheDocument();

  fireEvent.click(
    within(historySection()).getByRole('button', {
      name: 'Load older corrections',
    }),
  );
  await waitFor(async () => expect(await historyEntries()).toHaveLength(3));
  expect(historyRequests.map((request) => request.beforeRevision)).toEqual([
    null,
    '3',
  ]);
  expect(
    (await historyEntries()).map(
      (entry) => within(entry).getByText(/^Working revision \d+$/u).textContent,
    ),
  ).toEqual(['Working revision 4', 'Working revision 3', 'Working revision 2']);
  expect(
    within(historySection()).queryByRole('button', {
      name: 'Load older corrections',
    }),
  ).not.toBeInTheDocument();

  fireEvent.click(historyToggle());
  expect(historyToggle()).toHaveAccessibleName(
    'Show reference correction history',
  );
  expect(within(historySection()).queryByRole('list')).not.toBeInTheDocument();
  fireEvent.click(historyToggle());
  await waitFor(async () => expect(await historyEntries()).toHaveLength(2));
  expect(historyRequests.map((request) => request.beforeRevision)).toEqual([
    null,
    '3',
    null,
  ]);
});

it('distinguishes empty, retryable error and safe unavailable history without affecting the detail', async () => {
  const answers = [
    () => new Response(null, { status: 500 }),
    () => historyPage([]),
    () => new Response(null, { status: 403 }),
  ];
  serve({
    history: () => (answers.shift() ?? (() => historyPage([])))(),
  });
  render(<DocumentWorkspace actor={correctingActor} identity={identity} />);
  const detail = await openDocument();
  fireEvent.click(historyToggle());

  expect(await within(historySection()).findByRole('alert')).toHaveTextContent(
    'The correction history could not be loaded. The reference remains available.',
  );
  expect(
    within(detail).getByRole('heading', { name: document.title }),
  ).toBeInTheDocument();
  fireEvent.click(
    within(historySection()).getByRole('button', {
      name: 'Retry reference correction history',
    }),
  );
  expect(
    await within(historySection()).findByText(
      'No corrections have been saved for this working reference.',
    ),
  ).toBeInTheDocument();
  expect(within(historySection()).queryByRole('alert')).not.toBeInTheDocument();

  fireEvent.click(historyToggle());
  fireEvent.click(historyToggle());
  expect(
    await within(historySection()).findByText(
      'Correction history is not available with your current access.',
    ),
  ).toHaveAttribute('role', 'status');
  expect(within(historySection()).queryByRole('alert')).not.toBeInTheDocument();
  expect(
    within(detail).getByRole('heading', { name: document.title }),
  ).toBeInTheDocument();
});

it('clears loaded corrections when authority is lost before an older page', async () => {
  serve({
    history: ({ beforeRevision }) =>
      beforeRevision === null
        ? historyPage([purposeCorrection, titleAndUrlCorrection], 3)
        : new Response(null, { status: 403 }),
  });
  render(<DocumentWorkspace actor={correctingActor} identity={identity} />);
  await openDocument();
  fireEvent.click(historyToggle());
  expect(await historyEntries()).toHaveLength(2);

  fireEvent.click(
    within(historySection()).getByRole('button', {
      name: 'Load older corrections',
    }),
  );
  expect(
    await within(historySection()).findByText(
      'Correction history is not available with your current access.',
    ),
  ).toBeInTheDocument();
  expect(
    within(historySection()).queryByRole('listitem'),
  ).not.toBeInTheDocument();
  expect(
    within(historySection()).queryByText('Corrected by Document Registrar'),
  ).not.toBeInTheDocument();
});

it.each([
  ['an unreadable time', { ...purposeCorrection, occurredAt: 'not-a-date' }],
  [
    'a non-canonical time',
    { ...purposeCorrection, occurredAt: '2026-09-24T09:15:00Z' },
  ],
  [
    'an impossible date',
    { ...purposeCorrection, occurredAt: '2026-02-30T09:15:00.000Z' },
  ],
  [
    'an unknown field',
    {
      ...purposeCorrection,
      changes: { clientId: { before: 'client', after: 'other-client' } },
    },
  ],
  [
    'a non-text value',
    {
      ...purposeCorrection,
      changes: { title: { before: 'Draft questionnaire', after: 42 } },
    },
  ],
  ['a missing actor', { ...purposeCorrection, actor: undefined }],
])(
  'turns a correction with %s into a retryable error instead of throwing',
  async (_case, malformed) => {
    let reads = 0;
    serve({
      history: () =>
        (reads += 1) === 1
          ? historyPage([malformed])
          : historyPage([purposeCorrection]),
    });
    render(<DocumentWorkspace actor={correctingActor} identity={identity} />);
    const detail = await openDocument();
    fireEvent.click(historyToggle());

    expect(
      await within(historySection()).findByRole('alert'),
    ).toHaveTextContent('The correction history could not be loaded.');
    expect(
      within(detail).getByRole('heading', { name: document.title }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(historySection()).getByRole('button', {
        name: 'Retry reference correction history',
      }),
    );
    expect(await historyEntries()).toHaveLength(1);
  },
);

it('keeps loaded corrections and offers the cursor again when an older page is malformed or inconsistent', async () => {
  const olderAnswers = [
    () =>
      historyPage([
        { ...urlOnlyCorrection, occurredAt: '2026-09-22 07:00:00+00' },
      ]),
    // A page that does not continue strictly below its cursor is not history.
    () => historyPage([{ ...titleAndUrlCorrection, revision: 3 }]),
    () => historyPage([urlOnlyCorrection]),
  ];
  const { historyRequests } = serve({
    history: ({ beforeRevision }) =>
      beforeRevision === null
        ? historyPage([purposeCorrection, titleAndUrlCorrection], 3)
        : (olderAnswers.shift()?.() ?? historyPage([])),
  });
  render(<DocumentWorkspace actor={correctingActor} identity={identity} />);
  await openDocument();
  fireEvent.click(historyToggle());
  expect(await historyEntries()).toHaveLength(2);
  const loadOlder = () =>
    fireEvent.click(
      within(historySection()).getByRole('button', {
        name: 'Load older corrections',
      }),
    );

  for (let attempt = 0; attempt < 2; attempt += 1) {
    loadOlder();
    expect(
      await within(historySection()).findByRole('alert'),
    ).toHaveTextContent('Older corrections could not be loaded. Try again.');
    expect(await historyEntries()).toHaveLength(2);
  }
  loadOlder();
  await waitFor(async () => expect(await historyEntries()).toHaveLength(3));
  expect(within(historySection()).queryByRole('alert')).not.toBeInTheDocument();
  expect(historyRequests.map((request) => request.beforeRevision)).toEqual([
    null,
    '3',
    '3',
    '3',
  ]);
});

it('rejects a first page whose continuation is not its last revision', async () => {
  serve({
    history: () => historyPage([purposeCorrection, titleAndUrlCorrection], 4),
  });
  render(<DocumentWorkspace actor={correctingActor} identity={identity} />);
  await openDocument();
  fireEvent.click(historyToggle());
  expect(await within(historySection()).findByRole('alert')).toHaveTextContent(
    'The correction history could not be loaded.',
  );
});

it('refreshes an open history from the ledger after a successful correction and never disturbs a pending or uncertain correction', async () => {
  let current = document;
  let recorded: unknown[] = [purposeCorrection];
  const patchBodies: Array<{ body: unknown; key: string | null }> = [];
  const patchSignals: AbortSignal[] = [];
  let answerSecondPatch: (response: Response) => void = () => undefined;
  const { historyRequests } = serve({
    history: () => historyPage(recorded),
    detail: () => current,
    patch: (init) => {
      patchBodies.push({
        body: JSON.parse(String(init.body)),
        key: new Headers(init.headers).get('idempotency-key'),
      });
      if (init.signal) patchSignals.push(init.signal);
      if (patchBodies.length === 1) return new Response(null, { status: 500 });
      return new Promise<Response>((resolve) => {
        answerSecondPatch = resolve;
      });
    },
  });
  render(<DocumentWorkspace actor={correctingActor} identity={identity} />);
  const detail = await openDocument();
  fireEvent.click(historyToggle());
  expect(await historyEntries()).toHaveLength(1);

  fireEvent.click(
    within(detail).getByRole('button', { name: 'Edit reference' }),
  );
  fireEvent.change(within(detail).getByLabelText('Title'), {
    target: { value: 'Corrected questionnaire' },
  });
  fireEvent.click(
    within(detail).getByRole('button', { name: 'Save correction' }),
  );
  expect(await within(detail).findByRole('alert')).toHaveTextContent(
    'The correction result is uncertain.',
  );

  // Reading history while the result is uncertain keeps the exact command.
  fireEvent.click(historyToggle());
  fireEvent.click(historyToggle());
  expect(await historyEntries()).toHaveLength(1);
  expect(historyRequests).toHaveLength(2);
  expect(within(detail).getByLabelText('Title')).toHaveValue(
    'Corrected questionnaire',
  );
  fireEvent.click(
    within(detail).getByRole('button', { name: 'Retry same correction' }),
  );
  await waitFor(() => expect(patchBodies).toHaveLength(2));
  expect(patchBodies[1]).toEqual(patchBodies[0]);

  // A history read while the retried command is pending does not abort it.
  fireEvent.click(historyToggle());
  fireEvent.click(historyToggle());
  expect(await historyEntries()).toHaveLength(1);
  expect(historyRequests).toHaveLength(3);
  expect(within(detail).getByText('Saving correction…')).toHaveAttribute(
    'role',
    'status',
  );
  expect(patchSignals[1]?.aborted).toBe(false);

  current = {
    ...document,
    title: 'Corrected questionnaire',
    workingRevision: 5,
  };
  recorded = [
    {
      revision: 5,
      occurredAt: '2026-09-24T10:30:00.000Z',
      actor: { displayName: 'Document Registrar' },
      changes: {
        title: {
          before: 'Initial assessment questionnaire',
          after: 'Corrected questionnaire',
        },
      },
    },
    purposeCorrection,
  ];
  answerSecondPatch(
    Response.json({
      documentId: 'document',
      revision: 5,
      outcome: 'corrected',
    }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Corrected questionnaire' }),
  ).toBeInTheDocument();
  await waitFor(async () => expect(await historyEntries()).toHaveLength(2));
  expect(historyRequests.map((request) => request.beforeRevision)).toEqual([
    null,
    null,
    null,
    null,
  ]);
  const [newest] = await historyEntries();
  if (!newest) throw new Error('Expected the new correction.');
  expect(within(newest).getByText('Working revision 5')).toBeInTheDocument();
  expect(newest).toHaveTextContent(
    'Initial assessment questionnaire → changed to Corrected questionnaire',
  );
  expect(screen.getByText('Correction saved.')).toBeInTheDocument();
});

it('discards corrections and late replies of a Document that is no longer open', async () => {
  let answerFirstDocument: (response: Response) => void = () => undefined;
  const { historyRequests } = serve({
    documents: [document, otherDocument],
    history: ({ documentId }) =>
      documentId === 'document'
        ? new Promise<Response>((resolve) => {
            answerFirstDocument = resolve;
          })
        : historyPage([
            {
              ...purposeCorrection,
              changes: {
                purpose: {
                  before: 'Collect evidence',
                  after: 'Collect supplier evidence',
                },
              },
            },
          ]),
  });
  render(<DocumentWorkspace actor={correctingActor} identity={identity} />);
  const first = await openDocument();
  fireEvent.click(historyToggle());
  await waitFor(() => expect(historyRequests).toHaveLength(1));
  fireEvent.click(
    within(first).getByRole('button', { name: 'Back to references' }),
  );
  await openDocument(otherDocument.title);
  expect(historyRequests[0]?.signal?.aborted).toBe(true);

  answerFirstDocument(historyPage([purposeCorrection]));
  await settle();
  expect(historyToggle()).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('Prepare assessment')).not.toBeInTheDocument();

  fireEvent.click(historyToggle());
  const [entry] = await historyEntries();
  expect(entry).toHaveTextContent(
    'Collect evidence → changed to Collect supplier evidence',
  );
  expect(historyRequests.map((request) => request.documentId)).toEqual([
    'document',
    'other-document',
  ]);
});

it('discards the history of another Company', async () => {
  serve({ history: () => historyPage([purposeCorrection]) });
  const view = render(
    <DocumentWorkspace actor={correctingActor} identity={identity} />,
  );
  await openDocument();
  fireEvent.click(historyToggle());
  expect(await historyEntries()).toHaveLength(1);

  view.rerender(
    <DocumentWorkspace
      actor={{
        ...correctingActor,
        activeCompany: {
          ...correctingActor.activeCompany,
          id: 'company-other',
          displayName: 'Other Company',
        },
      }}
      identity={identity}
    />,
  );
  expect(
    screen.queryByRole('region', { name: 'Correction history' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText('Corrected by Document Registrar'),
  ).not.toBeInTheDocument();
});

it('removes prior URLs immediately when Representation read is lost and shows a URL-only correction as a generic entry', async () => {
  let answerLateRead: (response: Response) => void = () => undefined;
  let reads = 0;
  const { historyRequests } = serve({
    history: () => {
      reads += 1;
      if (reads === 1)
        return historyPage([titleAndUrlCorrection, urlOnlyCorrection]);
      if (reads === 2)
        return new Promise<Response>((resolve) => {
          answerLateRead = resolve;
        });
      return historyPage([
        {
          ...titleAndUrlCorrection,
          changes: { title: titleAndUrlCorrection.changes.title },
        },
        { ...urlOnlyCorrection, changes: {} },
      ]);
    },
  });
  const reader = readerWith(['document.read', 'document.reference.read']);
  const view = render(<DocumentWorkspace actor={reader} identity={identity} />);
  await openDocument();
  fireEvent.click(historyToggle());
  expect(await historyEntries()).toHaveLength(2);
  expect(
    within(historySection()).getByText('https://example.test/first'),
  ).toBeInTheDocument();
  // A reload started under Representation read is still in flight.
  fireEvent.click(historyToggle());
  fireEvent.click(historyToggle());
  await waitFor(() => expect(historyRequests).toHaveLength(2));

  view.rerender(
    <DocumentWorkspace
      actor={readerWith(['document.read'])}
      identity={identity}
    />,
  );
  expect(
    within(historySection()).queryByText(/https:\/\/example\.test/u),
  ).not.toBeInTheDocument();
  expect(historyToggle()).toHaveAttribute('aria-expanded', 'false');
  expect(historyRequests[1]?.signal?.aborted).toBe(true);
  answerLateRead(historyPage([titleAndUrlCorrection, urlOnlyCorrection]));
  await settle();
  expect(
    within(historySection()).queryByText(/https:\/\/example\.test/u),
  ).not.toBeInTheDocument();

  fireEvent.click(historyToggle());
  const [titled, generic] = await historyEntries();
  if (!titled || !generic) throw new Error('Expected two corrections.');
  expect(
    within(titled)
      .getAllByRole('term')
      .map((term) => term.textContent),
  ).toEqual(['Title']);
  // A URL-only correction stays attributed: revision, time and actor remain.
  expect(within(generic).getByText('Working revision 2')).toBeInTheDocument();
  expect(generic.querySelector('time')).toHaveAttribute(
    'datetime',
    urlOnlyCorrection.occurredAt,
  );
  expect(generic).toHaveTextContent('Corrected by Document Registrar');
  expect(generic).toHaveTextContent(
    'The changed details are not shown with your current access.',
  );
  expect(within(generic).queryByRole('term')).not.toBeInTheDocument();
  expect(
    within(historySection()).queryByText(/https:\/\/example\.test/u),
  ).not.toBeInTheDocument();
});

it('hides URL values a response carries for a reader without Representation read', async () => {
  serve({
    history: () => historyPage([titleAndUrlCorrection, urlOnlyCorrection]),
  });
  render(
    <DocumentWorkspace
      actor={readerWith(['document.read'])}
      identity={identity}
    />,
  );
  await openDocument();
  fireEvent.click(historyToggle());
  const [, generic] = await historyEntries();
  if (!generic) throw new Error('Expected the URL-only correction.');
  expect(within(generic).getByText('Working revision 2')).toBeInTheDocument();
  expect(generic).toHaveTextContent('Corrected by Document Registrar');
  expect(generic).toHaveTextContent(
    'The changed details are not shown with your current access.',
  );
  expect(
    within(historySection()).queryByText(/https:\/\/example\.test/u),
  ).not.toBeInTheDocument();
});

it('presents the history inside the Prisme detail while Classic keeps plain markup', async () => {
  serve({ history: () => historyPage([purposeCorrection]) });
  const classic = render(
    <DocumentWorkspace actor={correctingActor} identity={identity} />,
  );
  await openDocument();
  expect(historySection()).toHaveClass('working-document-correction-history');
  expect(
    historySection().closest('.working-document-detail'),
  ).not.toBeInTheDocument();
  classic.unmount();

  render(
    <ApplicationPresentation value="prisme">
      <DocumentWorkspace actor={correctingActor} identity={identity} />
    </ApplicationPresentation>,
  );
  await openDocument();
  expect(historySection().closest('.working-document-detail')).not.toBeNull();
  fireEvent.click(historyToggle());
  expect(await historyEntries()).toHaveLength(1);
  expect(
    within(historySection()).getByRole('heading', {
      name: 'Correction history',
      level: 4,
    }),
  ).toBeInTheDocument();
});
