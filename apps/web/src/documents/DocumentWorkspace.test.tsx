import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
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
