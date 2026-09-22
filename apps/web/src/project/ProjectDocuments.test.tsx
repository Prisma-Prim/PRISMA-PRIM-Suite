import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { ProjectDocuments } from './ProjectDocuments';
const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: 'company',
    displayName: 'PRISMA-PRIM',
    projectPermissions: ['project.read'],
    documentPermissions: [
      'document.read',
      'document.reference.read',
      'document.project.manage',
    ],
  },
};
const document = {
  id: 'document',
  companyId: 'company',
  clientId: 'client',
  clientDisplayName: 'Synthetic Client',
  title: 'Preparation questionnaire',
  purpose: 'Prepare the Client interview',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: '2026-09-19T00:00:00.000Z',
  workingRevision: 1,
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
function eligible(id: string, title: string, purpose: string) {
  return { ...document, id, title, purpose };
}
const siteVisit = eligible(
  'document-site-visit',
  'Preparation questionnaire site visit',
  'Prepare the on-site interview',
);
const remoteReview = eligible(
  'document-remote-review',
  'Preparation questionnaire remote review',
  'Prepare the remote Client interview',
);
const archive = eligible(
  'document-archive',
  'Preparation questionnaire archive',
  'Collect archived answers',
);
const eligibleRows = [
  { document: siteVisit, revision: 2 },
  { document: remoteReview, revision: 3 },
  { document: archive, revision: 4 },
];
const linkedDocument = {
  ...document,
  id: 'document-linked',
  title: 'Signed intake summary',
  purpose: 'Record the intake call',
};
const linkedRows = [{ document: linkedDocument, revision: 1 }];
const searchLabel = 'Search eligible working Documents';
const noMatch = 'No eligible working Documents match this search.';
const noEligible = 'No eligible working Documents for this original Client.';
type Command = { url: string; key: string | null; body: unknown };
function selectorFixture(
  rows: Array<{ document: typeof document; revision: number }>,
  // A filtering journey must never reach this default; an unexpected command conflicts.
  respond: (command: Command) => Response = () =>
    new Response(null, { status: 409 }),
) {
  const commands: Command[] = [];
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const command = {
        url,
        key: new Headers(options.headers).get('idempotency-key'),
        body: options.body,
      };
      commands.push(command);
      return respond(command);
    }
    return Response.json({
      mutable: true,
      documents: url.endsWith('/eligible-documents') ? rows : linkedRows,
    });
  });
  vi.stubGlobal('fetch', fetcher);
  return { commands, fetcher };
}
function renderSession(session = deterministicBrowserIdentity()) {
  return render(
    <ProjectDocuments actor={actor} identity={session} projectId="project" />,
  );
}
async function openSelector() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Attach working Document' }),
  );
  return screen.findByRole('button', { name: 'Close Document selector' });
}
function search(query: string) {
  fireEvent.change(screen.getByLabelText(searchLabel), {
    target: { value: query },
  });
}
function headings() {
  return screen
    .getAllByRole('heading', { level: 5 })
    .map((heading) => heading.textContent);
}
afterEach(() => vi.unstubAllGlobals());
it('presents real Project Documents in Prisme while preserving the Classic public markup', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        mutable: true,
        documents: [{ document, revision: 1 }],
      }),
    ),
  );
  const props = {
    actor,
    identity: deterministicBrowserIdentity(),
    projectId: 'project',
  };
  const classic = render(<ProjectDocuments {...props} />);
  const classicSection = await screen.findByRole('region', {
    name: 'Working Documents',
  });
  expect(classicSection).toHaveClass('project-documents');
  expect(classicSection).not.toHaveClass('project-documents--prisme');
  expect(classicSection.firstElementChild).toBe(
    within(classicSection).getByRole('heading', { name: 'Working Documents' }),
  );
  classic.unmount();

  render(
    <ApplicationPresentation value="prisme">
      <ProjectDocuments {...props} />
    </ApplicationPresentation>,
  );
  const section = await screen.findByRole('region', {
    name: 'Working Documents',
  });
  expect(section).toHaveClass('project-documents--prisme');
  expect(section.querySelector('ul')).toHaveClass('project-document-list');
  expect(
    within(section).getByRole('link', { name: 'Open external reference' }),
  ).toHaveAttribute('rel', 'noopener noreferrer');
});
it('attaches an existing reference, retries the unchanged uncertain command, reloads, opens and removes it', async () => {
  let linked = false;
  let revision = 0;
  const requests: Array<{ key: string | null; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        requests.push({
          key: new Headers(options.headers).get('idempotency-key'),
          body: options.body,
        });
        if (requests.length === 1) return new Response(null, { status: 500 });
        linked = requests.length === 2;
        revision += 1;
        return Response.json({
          documentId: 'document',
          projectId: 'project',
          action: linked ? 'link' : 'unlink',
          revision,
        });
      }
      return Response.json({
        mutable: true,
        documents: url.endsWith('/eligible-documents')
          ? linked
            ? []
            : [{ document, revision }]
          : linked
            ? [{ document, revision }]
            : [],
      });
    }),
  );
  const props = {
    actor,
    identity: deterministicBrowserIdentity(),
    projectId: 'project',
  };
  const view = render(<ProjectDocuments {...props} />);
  await screen.findByText('No working Documents attached.');
  fireEvent.click(
    screen.getByRole('button', { name: 'Attach working Document' }),
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Attach Preparation questionnaire',
    }),
  );
  await screen.findByText(
    'The result is uncertain. Retry this same command or reload before choosing another action.',
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry unchanged command' }),
  );
  expect(
    await screen.findByRole('link', { name: 'Open external reference' }),
  ).toHaveAttribute('rel', 'noopener noreferrer');
  expect(requests[0]).toEqual(requests[1]);
  view.unmount();
  render(<ProjectDocuments {...props} />);
  expect(
    await screen.findByRole('link', { name: 'Open external reference' }),
  ).toHaveAttribute('href', 'https://example.test/questionnaire');
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove Preparation questionnaire' }),
  );
  await screen.findByText('No working Documents attached.');
  expect(requests).toHaveLength(3);
});

it('keeps metadata readable without management or reference permission', async () => {
  const readOnlyActor: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: 'company',
      displayName: 'PRISMA-PRIM',
      documentPermissions: ['document.read'],
    },
  };
  const metadata = {
    ...document,
    version: {
      ...document.version,
      representation: {
        ...document.version.representation,
        access: 'denied',
        url: undefined,
      },
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        mutable: true,
        documents: [{ document: metadata, revision: 3 }],
      }),
    ),
  );
  render(
    <ProjectDocuments
      actor={readOnlyActor}
      identity={deterministicBrowserIdentity()}
      projectId="project"
    />,
  );
  await screen.findByText('Preparation questionnaire');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Attach|Remove/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText('External reference access is not granted.'),
  ).toBeInTheDocument();
});

it('hides all linked metadata and counts when Document read is absent', async () => {
  const deniedActor: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: 'company',
      displayName: 'PRISMA-PRIM',
      documentPermissions: ['document.project.manage'],
    },
  };
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(
    <ProjectDocuments
      actor={deniedActor}
      identity={deterministicBrowserIdentity()}
      projectId="project"
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Project, Document and Client read access are required',
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    screen.queryByText('No working Documents attached.'),
  ).not.toBeInTheDocument();
});

it('requires reload after conflict before allowing a changed intention', async () => {
  let reads = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'POST')
        return new Response(null, { status: 409 });
      reads += 1;
      return Response.json({
        mutable: true,
        documents: [{ document, revision: reads === 1 ? 1 : 2 }],
      });
    }),
  );
  render(
    <ProjectDocuments
      actor={actor}
      identity={deterministicBrowserIdentity()}
      projectId="project"
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Remove Preparation questionnaire',
    }),
  );
  await screen.findByText(
    'The association changed or this command is no longer valid. Reload before choosing another action.',
  );
  expect(
    screen.getByRole('button', { name: 'Remove Preparation questionnaire' }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload working Documents' }),
  );
  expect(
    await screen.findByRole('button', {
      name: 'Remove Preparation questionnaire',
    }),
  ).toBeEnabled();
});

it('keeps a confirmed command distinct from a failed refresh', async () => {
  let committed = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        committed = true;
        return Response.json({
          documentId: 'document',
          projectId: 'project',
          action: 'unlink',
          revision: 2,
        });
      }
      if (committed) return new Response(null, { status: 500 });
      return Response.json({
        mutable: true,
        documents: [{ document, revision: 1 }],
      });
    }),
  );
  render(
    <ProjectDocuments
      actor={actor}
      identity={deterministicBrowserIdentity()}
      projectId="project"
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Remove Preparation questionnaire',
    }),
  );
  await screen.findByText(
    'Command confirmed. The list below is refreshed separately.',
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be loaded',
  );
  expect(
    screen.queryByRole('button', { name: 'Retry unchanged command' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText('Preparation questionnaire'),
  ).not.toBeInTheDocument();
});

it('discards late results when Company or actor authority changes', async () => {
  let finish: ((value: Response) => void) | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const identity = deterministicBrowserIdentity();
  const view = render(
    <ProjectDocuments actor={actor} identity={identity} projectId="project" />,
  );
  await screen.findByText('Loading working Documents…');
  const deniedActor: ActorContext = {
    ...actor,
    activeCompany: { id: 'other-company', displayName: 'BIC' },
  };
  view.rerender(
    <ProjectDocuments
      actor={deniedActor}
      identity={identity}
      projectId="other-project"
    />,
  );
  finish?.(
    Response.json({ mutable: true, documents: [{ document, revision: 1 }] }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'read access are required',
  );
  expect(
    screen.queryByText('Preparation questionnaire'),
  ).not.toBeInTheDocument();
});

it('finds one eligible Document among similar rows and attaches exactly that row', async () => {
  const { commands, fetcher } = selectorFixture(eligibleRows, () =>
    Response.json({
      documentId: remoteReview.id,
      projectId: 'project',
      action: 'link',
      revision: 4,
    }),
  );
  renderSession();
  await screen.findByText(linkedDocument.title);
  await openSelector();
  await screen.findByText(siteVisit.title);
  const reads = fetcher.mock.calls.length;

  search('  REMOTE  ');
  expect(screen.queryByText(siteVisit.title)).not.toBeInTheDocument();
  expect(screen.queryByText(archive.title)).not.toBeInTheDocument();
  expect(screen.getByText(remoteReview.title)).toBeInTheDocument();
  expect(screen.getByText(linkedDocument.title)).toBeInTheDocument();
  expect(fetcher.mock.calls).toHaveLength(reads);

  search('archived');
  expect(headings()).toEqual([linkedDocument.title, archive.title]);

  search('remote');
  fireEvent.click(
    screen.getByRole('button', { name: `Attach ${remoteReview.title}` }),
  );
  await screen.findByText(
    'Command confirmed. The list below is refreshed separately.',
  );
  expect(commands).toHaveLength(1);
  expect(commands[0]?.url).toContain(
    `/documents/${remoteReview.id}/project-association`,
  );
  expect(JSON.parse(String(commands[0]?.body))).toEqual({
    projectId: 'project',
    action: 'link',
    expectedRevision: 3,
  });
});

it('reports a search without matches and restores the server order when cleared', async () => {
  const { fetcher } = selectorFixture(eligibleRows);
  renderSession();
  await openSelector();
  await screen.findByText(siteVisit.title);

  search('zzz');
  expect(screen.getByText(noMatch)).toBeInTheDocument();
  expect(screen.queryByText(noEligible)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /^Attach Preparation/ }),
  ).not.toBeInTheDocument();

  // The external reference URL of an eligible row is never searchable material.
  search('example.test');
  expect(screen.getByText(noMatch)).toBeInTheDocument();

  search('');
  expect(headings()).toEqual([
    linkedDocument.title,
    siteVisit.title,
    remoteReview.title,
    archive.title,
  ]);
  expect(fetcher.mock.calls).toHaveLength(2);
});

it('offers no search when the Client has no eligible working Document', async () => {
  selectorFixture([]);
  renderSession();
  await openSelector();
  expect(await screen.findByText(noEligible)).toBeInTheDocument();
  expect(screen.queryByLabelText(searchLabel)).not.toBeInTheDocument();
  expect(screen.queryByText(noMatch)).not.toBeInTheDocument();
});

it('filters without issuing, changing or discarding an uncertain command', async () => {
  const { commands, fetcher } = selectorFixture(eligibleRows, () =>
    commands.length === 1
      ? new Response(null, { status: 500 })
      : Response.json({
          documentId: siteVisit.id,
          projectId: 'project',
          action: 'link',
          revision: 3,
        }),
  );
  renderSession();
  await openSelector();
  await screen.findByText(siteVisit.title);
  fireEvent.click(
    screen.getByRole('button', { name: `Attach ${siteVisit.title}` }),
  );
  await screen.findByText(
    'The result is uncertain. Retry this same command or reload before choosing another action.',
  );
  const reads = fetcher.mock.calls.length;

  search('archive');
  expect(screen.queryByText(siteVisit.title)).not.toBeInTheDocument();
  expect(fetcher.mock.calls).toHaveLength(reads);
  expect(
    screen.getByRole('button', { name: `Attach ${archive.title}` }),
  ).toBeDisabled();

  fireEvent.click(
    screen.getByRole('button', { name: 'Retry unchanged command' }),
  );
  await screen.findByText(
    'Command confirmed. The list below is refreshed separately.',
  );
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
});

it('clears the query when the selector is reopened or the Company changes', async () => {
  selectorFixture(eligibleRows);
  const identity = deterministicBrowserIdentity();
  const view = renderSession(identity);
  await openSelector();
  await screen.findByText(siteVisit.title);

  search('remote');
  fireEvent.click(
    screen.getByRole('button', { name: 'Close Document selector' }),
  );
  await openSelector();
  expect(await screen.findByLabelText(searchLabel)).toHaveValue('');
  expect(headings()).toEqual([
    linkedDocument.title,
    siteVisit.title,
    remoteReview.title,
    archive.title,
  ]);

  search('remote');
  view.rerender(
    <ProjectDocuments
      actor={{ ...actor, activeCompany: { id: 'other', displayName: 'BIC' } }}
      identity={identity}
      projectId="project"
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'read access are required',
  );
  expect(screen.queryByLabelText(searchLabel)).not.toBeInTheDocument();
  expect(screen.queryByText(remoteReview.title)).not.toBeInTheDocument();
});

it('cannot restore a stale selector search from a delayed eligible reply', async () => {
  let finish: ((value: Response) => void) | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/eligible-documents')
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Response.json({ mutable: true, documents: linkedRows }),
    ),
  );
  const identity = deterministicBrowserIdentity();
  const view = renderSession(identity);
  await screen.findByText(linkedDocument.title);
  fireEvent.click(
    screen.getByRole('button', { name: 'Attach working Document' }),
  );
  view.rerender(
    <ProjectDocuments
      actor={{ ...actor, activeCompany: { id: 'other', displayName: 'BIC' } }}
      identity={identity}
      projectId="project"
    />,
  );
  finish?.(Response.json({ mutable: true, documents: eligibleRows }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'read access are required',
  );
  expect(screen.queryByLabelText(searchLabel)).not.toBeInTheDocument();
  expect(screen.queryByText(siteVisit.title)).not.toBeInTheDocument();
});

it('clears previously loaded links when the selector discovers revoked read access', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/eligible-documents')
        ? new Response(null, { status: 403 })
        : Response.json({
            mutable: true,
            documents: [{ document, revision: 1 }],
          }),
    ),
  );
  render(
    <ProjectDocuments
      actor={actor}
      identity={deterministicBrowserIdentity()}
      projectId="project"
    />,
  );
  await screen.findByText('Preparation questionnaire');
  fireEvent.click(
    screen.getByRole('button', { name: 'Attach working Document' }),
  );
  await screen.findByRole('alert');
  expect(
    screen.queryByText('Preparation questionnaire'),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
