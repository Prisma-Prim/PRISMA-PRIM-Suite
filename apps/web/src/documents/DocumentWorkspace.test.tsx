import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { DocumentWorkspace } from './DocumentWorkspace';
const actor: ActorContext = {
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
  purpose: 'Prepare assessment',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: '2026-09-19T12:00:00.000Z',
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
afterEach(() => vi.unstubAllGlobals());
it('presents real Working Documents in Prisme while preserving the Classic public markup', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith('/clients')
          ? [{ id: 'client', displayName: 'Synthetic Client' }]
          : [document],
      ),
    ),
  );
  const classic = render(
    <DocumentWorkspace actor={actor} identity={identity} />,
  );
  const classicWorkspace = await screen.findByRole('region', {
    name: 'Working Documents',
  });
  expect(classicWorkspace).toHaveClass('working-documents');
  expect(classicWorkspace).not.toHaveClass('working-documents--prisme');
  expect(classicWorkspace.firstElementChild).toBe(
    within(classicWorkspace).getByRole('heading', {
      name: 'Working Documents',
    }),
  );
  classic.unmount();

  render(
    <ApplicationPresentation value="prisme">
      <DocumentWorkspace actor={actor} identity={identity} />
    </ApplicationPresentation>,
  );
  const workspace = await screen.findByRole('region', {
    name: 'Working Documents',
  });
  expect(workspace).toHaveClass('working-documents--prisme');
  expect(
    within(workspace)
      .getByRole('heading', { name: 'Working Documents' })
      .closest('header'),
  ).toHaveClass('working-documents-heading');
  expect(workspace.querySelector('ul')).toHaveClass('working-document-list');
  expect(
    within(workspace)
      .getByRole('button', { name: 'Register working reference' })
      .closest('form'),
  ).toHaveClass('working-document-registration');
});
it('registers and reopens an unverified Company-confidential questionnaire reference', async () => {
  let saved = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/clients'))
        return Response.json([
          { id: 'client', displayName: 'Synthetic Client' },
        ]);
      if (init?.method === 'POST') {
        saved = true;
        return Response.json(document, { status: 201 });
      }
      if (url.endsWith('/documents/document')) return Response.json(document);
      return Response.json(saved ? [document] : []);
    }),
  );
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  expect(
    await screen.findByText('No working references registered yet.'),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Client'), {
    target: { value: 'client' },
  });
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: document.title },
  });
  fireEvent.change(screen.getByLabelText('Purpose'), {
    target: { value: document.purpose },
  });
  fireEvent.change(screen.getByLabelText('External HTTPS link'), {
    target: { value: document.version.representation.url },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Register working reference' }),
  );
  expect(
    await screen.findByRole('link', { name: 'Open external reference' }),
  ).toHaveAttribute('href', document.version.representation.url);
  expect(
    screen.getByText(/The external content is unverified/),
  ).toBeInTheDocument();
});
it('corrects an existing working reference and reloads its authoritative values', async () => {
  const requests: Array<{ body: string | null; key: string | null }> = [];
  let corrected = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/clients')) return Response.json([]);
      if (init?.method === 'PATCH') {
        requests.push({
          body: typeof init.body === 'string' ? init.body : null,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        corrected = true;
        return Response.json({
          documentId: document.id,
          revision: 2,
          outcome: 'corrected',
        });
      }
      if (url.endsWith('/documents/document'))
        return Response.json(
          corrected
            ? {
                ...document,
                title: 'Corrected questionnaire',
                purpose: 'Corrected purpose',
                workingRevision: 2,
                version: {
                  ...document.version,
                  representation: {
                    ...document.version.representation,
                    url: 'https://example.test/corrected',
                  },
                },
              }
            : document,
        );
      return Response.json([document]);
    }),
  );
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  fireEvent.click(await screen.findByRole('button', { name: document.title }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit reference' }),
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Corrected questionnaire' },
  });
  fireEvent.change(screen.getByLabelText('Purpose'), {
    target: { value: 'Corrected purpose' },
  });
  fireEvent.change(screen.getByLabelText('External HTTPS link'), {
    target: { value: 'https://example.test/corrected' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  expect(
    await screen.findByText('Corrected questionnaire'),
  ).toBeInTheDocument();
  expect(requests).toHaveLength(1);
  expect(JSON.parse(requests[0]?.body ?? '')).toEqual({
    expectedRevision: 1,
    title: 'Corrected questionnaire',
    purpose: 'Corrected purpose',
    url: 'https://example.test/corrected',
  });
  expect(requests[0]?.key).toBeTruthy();
});
it('retries an uncertain correction with the exact same command', async () => {
  const patches: Array<{ body: string | null; key: string | null }> = [];
  let corrected = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/clients')) return Response.json([]);
      if (init?.method === 'PATCH') {
        patches.push({
          body: typeof init.body === 'string' ? init.body : null,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        corrected = true;
        return patches.length === 1
          ? new Response(null, { status: 500 })
          : Response.json({
              documentId: document.id,
              revision: 2,
              outcome: 'corrected',
            });
      }
      const current = corrected
        ? { ...document, title: 'Retried correction', workingRevision: 2 }
        : document;
      return Response.json(
        url.endsWith('/documents/document') ? current : [current],
      );
    }),
  );
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  fireEvent.click(await screen.findByRole('button', { name: document.title }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit reference' }),
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Retried correction' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'result is uncertain',
  );
  const lockedTitle = screen.getByLabelText('Title');
  expect(lockedTitle).toBeDisabled();
  fireEvent.change(lockedTitle, {
    target: { value: 'Changed after uncertainty' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry same correction' }),
  );
  expect(await screen.findByText('Retried correction')).toBeInTheDocument();
  expect(patches).toHaveLength(2);
  expect(patches[0]).toEqual(patches[1]);
});
it('keeps a superseded original Client reference readable but correction read-only', async () => {
  const readOnly = { ...document, correction: 'read-only' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith('/clients')
          ? []
          : url.endsWith('/documents/document')
            ? readOnly
            : [readOnly],
      ),
    ),
  );
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  fireEvent.click(await screen.findByRole('button', { name: document.title }));
  expect(await screen.findByText(document.purpose)).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Edit reference' }),
  ).not.toBeInTheDocument();
});
it('requires reload after a correction revision conflict', async () => {
  let reloaded = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/clients')) return Response.json([]);
      if (init?.method === 'PATCH') return new Response(null, { status: 409 });
      if (url.endsWith('/documents/document')) {
        if (reloaded)
          return Response.json({
            ...document,
            title: 'Concurrent correction',
            workingRevision: 2,
          });
        return Response.json(document);
      }
      return Response.json([document]);
    }),
  );
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  fireEvent.click(await screen.findByRole('button', { name: document.title }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit reference' }),
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Competing correction' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'changed. Reload it',
  );
  expect(
    screen.queryByRole('button', { name: 'Edit reference' }),
  ).not.toBeInTheDocument();
  reloaded = true;
  fireEvent.click(screen.getByRole('button', { name: 'Reload reference' }));
  expect(await screen.findByText('Concurrent correction')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit reference' })).toBeEnabled();
});
it('denies Client-only users without requesting Document records', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(
    <DocumentWorkspace
      actor={{
        ...actor,
        activeCompany: {
          id: 'company',
          displayName: 'PRISMA-PRIM',
          clientPermissions: ['client.read'],
        },
      }}
      identity={identity}
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'You do not have access',
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it('shows a recoverable load error and retries the public query', async () => {
  let error = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      error ? new Response('', { status: 500 }) : Response.json([]),
    ),
  );
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be loaded',
  );
  error = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(
    await screen.findByText('No working references registered yet.'),
  ).toBeInTheDocument();
});
it('does not render a denied external reference', async () => {
  const reference = {
    ...document,
    version: {
      ...document.version,
      representation: {
        id: 'representation',
        kind: 'external-reference',
        verification: 'unverified',
        access: 'denied',
      },
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith('/clients')
          ? []
          : url.endsWith('/document')
            ? reference
            : [reference],
      ),
    ),
  );
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  fireEvent.click(await screen.findByRole('button', { name: document.title }));
  expect(
    await screen.findByText(
      'You do not have permission to open this reference.',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
it('fails closed instead of rendering an unsafe external reference returned by the API', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith('/clients')
          ? []
          : [
              {
                ...document,
                version: {
                  ...document.version,
                  representation: {
                    ...document.version.representation,
                    url: 'javascript:alert(1)',
                  },
                },
              },
            ],
      ),
    ),
  );
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be loaded',
  );
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
