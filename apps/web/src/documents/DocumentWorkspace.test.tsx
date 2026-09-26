import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
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
/** A listed reference's text ends with its one formatted registration time. */
const listedRegistrationTime = `Registration time${new Intl.DateTimeFormat(
  globalThis.document.documentElement.lang || navigator.language,
  { dateStyle: 'medium', timeStyle: 'short' },
).format(new Date(document.createdAt))}`;
afterEach(() => vi.unstubAllGlobals());
it('presents real Working Documents in Prisme while preserving the Classic public markup', async () => {
  stubFetch(
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
it('filters only loaded visible fields in server order and resets for a new Company', async () => {
  const firstCompanyDocuments = [
    document,
    {
      ...document,
      id: 'document-second',
      clientId: 'client-second',
      clientDisplayName: 'Alpha Advisory',
      title: 'Supplier evidence checklist',
    },
    {
      ...document,
      id: 'opaque-match',
      clientId: 'client-third',
      clientDisplayName: 'Beta Industries',
      title: 'Annual review notes',
    },
  ];
  const secondCompanyDocument = {
    ...document,
    id: 'document-other-company',
    companyId: 'company-other',
    clientDisplayName: 'Other Company Client',
    title: 'Other Company questionnaire',
  };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const companyContextId = new Headers(init?.headers).get(
      'x-company-context-id',
    );
    if (url.endsWith('/clients')) return Response.json([]);
    if (url.endsWith('/documents/document')) return Response.json(document);
    return Response.json(
      companyContextId === 'company-other'
        ? [secondCompanyDocument]
        : firstCompanyDocuments,
    );
  });
  stubFetch(fetcher);
  const view = render(<DocumentWorkspace actor={actor} identity={identity} />);
  const workspace = await screen.findByRole('region', {
    name: 'Working Documents',
  });
  const filter = await within(workspace).findByRole('searchbox', {
    name: 'Filter working Documents',
  });
  const list = within(workspace).getByRole('list');
  expect(
    within(list)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual([
    'Initial assessment questionnaire',
    'Supplier evidence checklist',
    'Annual review notes',
  ]);
  const initialRequestCount = fetcher.mock.calls.length;

  fireEvent.change(filter, { target: { value: 'ALPHA advisory' } });
  expect(
    within(list).getByRole('button', { name: 'Supplier evidence checklist' }),
  ).toBeInTheDocument();
  expect(
    within(list).queryByRole('button', {
      name: 'Initial assessment questionnaire',
    }),
  ).not.toBeInTheDocument();

  fireEvent.change(filter, { target: { value: 'opaque-match' } });
  expect(within(list).queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    'No loaded working Documents match this filter.',
  );
  expect(
    screen.queryByText('No working references registered yet.'),
  ).not.toBeInTheDocument();

  fireEvent.change(filter, { target: { value: '' } });
  expect(
    within(list)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual([
    'Initial assessment questionnaire',
    'Supplier evidence checklist',
    'Annual review notes',
  ]);
  expect(fetcher).toHaveBeenCalledTimes(initialRequestCount);

  fireEvent.click(
    within(list).getByRole('button', {
      name: 'Initial assessment questionnaire',
    }),
  );
  expect(await screen.findByText(document.purpose)).toBeInTheDocument();
  fireEvent.change(filter, { target: { value: 'does not match' } });
  expect(screen.getByText(document.purpose)).toBeInTheDocument();

  view.rerender(
    <DocumentWorkspace
      actor={{
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          id: 'company-other',
          displayName: 'Other Company',
        },
      }}
      identity={identity}
    />,
  );
  expect(
    await screen.findByRole('button', {
      name: secondCompanyDocument.title,
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('searchbox', { name: 'Filter working Documents' }),
  ).toHaveValue('');
  expect(screen.queryByText(document.purpose)).not.toBeInTheDocument();
});
const dossierDocuments = [
  {
    ...document,
    id: 'document-historical',
    clientId: 'historical-client',
    clientDossierId: 'canonical-client',
    clientDisplayName: 'Shared display name',
    title: 'Historical questionnaire',
  },
  {
    ...document,
    id: 'document-homonym',
    clientId: 'other-client',
    clientDossierId: 'other-client',
    clientDisplayName: 'Shared display name',
    title: 'Homonym questionnaire',
  },
  {
    ...document,
    id: 'document-unprojected',
    clientId: 'unprojected-client',
    clientDisplayName: 'Shared display name',
    title: 'Unprojected questionnaire',
  },
];
function dossierFetcher(documents = dossierDocuments) {
  return vi.fn(async (url: string) => {
    if (url.endsWith('/clients')) return Response.json([]);
    const opened = documents.find((candidate) =>
      url.endsWith(`/documents/${candidate.id}`),
    );
    return Response.json(opened ?? documents);
  });
}
it('restricts loaded working Documents to one dossier identity and returns to that dossier', async () => {
  const openClientDossier = vi.fn();
  const fetcher = dossierFetcher();
  stubFetch(fetcher);
  const view = render(
    <DocumentWorkspace
      actor={actor}
      identity={identity}
      clientFilter={{
        clientDossierId: 'canonical-client',
        displayName: 'Shared display name',
      }}
      onOpenClientDossier={openClientDossier}
    />,
  );
  const workspace = await screen.findByRole('region', {
    name: 'Working Documents',
  });
  const filter = await within(workspace).findByRole('searchbox', {
    name: 'Filter working Documents',
  });
  const list = within(workspace).getByRole('list');
  expect(
    within(list)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Historical questionnaire']);
  expect(filter).toHaveValue('Shared display name');
  const requestsAfterRestriction = fetcher.mock.calls.length;

  fireEvent.click(
    within(list).getByRole('button', { name: 'Historical questionnaire' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Historical questionnaire' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open Client dossier' }));
  expect(openClientDossier).toHaveBeenCalledWith('canonical-client');
  expect(openClientDossier).toHaveBeenCalledTimes(1);

  // A renewed restriction shows the restricted references again.
  view.rerender(
    <DocumentWorkspace
      actor={actor}
      identity={identity}
      clientFilter={{
        clientDossierId: 'canonical-client',
        displayName: 'Shared display name',
      }}
      onOpenClientDossier={openClientDossier}
    />,
  );
  expect(
    within(screen.getByRole('list'))
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Historical questionnaire']);

  fireEvent.change(filter, { target: { value: 'Shared display' } });
  expect(
    within(screen.getByRole('list'))
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual([
    'Historical questionnaire',
    'Homonym questionnaire',
    'Unprojected questionnaire',
  ]);
  fireEvent.change(filter, { target: { value: '' } });
  expect(
    within(screen.getByRole('list'))
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual([
    'Historical questionnaire',
    'Homonym questionnaire',
    'Unprojected questionnaire',
  ]);
  expect(fetcher.mock.calls.length).toBe(requestsAfterRestriction + 1);

  view.rerender(
    <DocumentWorkspace
      actor={{
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          id: 'company-other',
          displayName: 'Other Company',
        },
      }}
      identity={identity}
      onOpenClientDossier={openClientDossier}
    />,
  );
  expect(
    await screen.findByRole('searchbox', { name: 'Filter working Documents' }),
  ).toHaveValue('');
  expect(
    within(screen.getByRole('list'))
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual([
    'Historical questionnaire',
    'Homonym questionnaire',
    'Unprojected questionnaire',
  ]);
});
it('keeps an open correction draft when a dossier restriction arrives', async () => {
  stubFetch(dossierFetcher());
  const view = render(<DocumentWorkspace actor={actor} identity={identity} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Homonym questionnaire' }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit reference' }),
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Unsaved correction draft' },
  });

  view.rerender(
    <DocumentWorkspace
      actor={actor}
      identity={identity}
      clientFilter={{
        clientDossierId: 'canonical-client',
        displayName: 'Shared display name',
      }}
    />,
  );
  expect(screen.getByLabelText('Title')).toHaveValue(
    'Unsaved correction draft',
  );
  expect(
    screen.getByRole('searchbox', { name: 'Filter working Documents' }),
  ).toHaveValue('Shared display name');

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(
    screen.queryByRole('heading', { name: 'Homonym questionnaire' }),
  ).not.toBeInTheDocument();
  expect(
    within(screen.getByRole('list'))
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Historical questionnaire']);
});
it.each([
  ['save', false],
  ['retry', true],
])(
  'reconciles an arrived dossier restriction after correction %s resolves',
  async (_completion, failFirstAttempt) => {
    let patchAttempts = 0;
    stubFetch(
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/clients')) return Response.json([]);
        if (init?.method === 'PATCH') {
          patchAttempts += 1;
          if (failFirstAttempt && patchAttempts === 1)
            return new Response(null, { status: 500 });
          return Response.json({
            documentId: 'document-homonym',
            revision: 2,
            outcome: 'corrected',
          });
        }
        const opened = dossierDocuments.find((candidate) =>
          url.endsWith(`/documents/${candidate.id}`),
        );
        return Response.json(opened ?? dossierDocuments);
      }),
    );
    const restrictedWorkspace = (clientFilter?: {
      clientDossierId: string;
      displayName: string;
    }) => (
      <DocumentWorkspace
        actor={actor}
        identity={identity}
        clientFilter={clientFilter}
      />
    );
    const view = render(restrictedWorkspace());
    fireEvent.click(
      await screen.findByRole('button', { name: 'Homonym questionnaire' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit reference' }),
    );
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Protected correction draft' },
    });

    if (failFirstAttempt) {
      fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'result is uncertain',
      );
    }
    view.rerender(
      restrictedWorkspace({
        clientDossierId: 'canonical-client',
        displayName: 'Shared display name',
      }),
    );
    expect(screen.getByLabelText('Title')).toHaveValue(
      'Protected correction draft',
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: failFirstAttempt ? 'Retry same correction' : 'Save correction',
      }),
    );

    const list = await screen.findByRole('list');
    expect(
      within(list)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Historical questionnaire']);
    expect(patchAttempts).toBe(failFirstAttempt ? 2 : 1);
  },
);
it.each([
  ['cancel', 'Cancel'],
  ['save', 'Save correction'],
])(
  'keeps the open Document when a correction %s ends under an unchanged dossier restriction',
  async (completion, action) => {
    let patchAttempts = 0;
    stubFetch(
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/clients')) return Response.json([]);
        if (init?.method === 'PATCH') {
          patchAttempts += 1;
          return Response.json({
            documentId: 'document-historical',
            revision: 2,
            outcome: 'corrected',
          });
        }
        const opened = dossierDocuments.find((candidate) =>
          url.endsWith(`/documents/${candidate.id}`),
        );
        return Response.json(opened ?? dossierDocuments);
      }),
    );
    render(
      <DocumentWorkspace
        actor={actor}
        identity={identity}
        clientFilter={{
          clientDossierId: 'canonical-client',
          displayName: 'Shared display name',
        }}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Historical questionnaire' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit reference' }),
    );
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Protected correction draft' },
    });

    fireEvent.click(screen.getByRole('button', { name: action }));
    if (completion === 'save')
      expect(await screen.findByText('Correction saved.')).toBeInTheDocument();
    await settle();
    expect(
      screen.getByRole('heading', { name: 'Historical questionnaire' }),
    ).toBeInTheDocument();
    if (completion === 'save')
      expect(screen.getByText('Correction saved.')).toBeInTheDocument();
    expect(patchAttempts).toBe(completion === 'save' ? 1 : 0);

    fireEvent.click(screen.getByRole('button', { name: 'Back to references' }));
    expect(
      screen.getByRole('searchbox', { name: 'Filter working Documents' }),
    ).toHaveValue('Shared display name');
    expect(
      within(screen.getByRole('list'))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Historical questionnaire']);
  },
);
const supersededDossierDocument = {
  ...document,
  id: 'document-historical',
  clientId: 'historical-client',
  clientDossierId: 'superseded-client',
  clientDisplayName: 'Superseded display name',
  title: 'Historical questionnaire',
};
const canonicalDossierDocument = {
  ...supersededDossierDocument,
  clientDossierId: 'canonical-client',
  clientDisplayName: 'Canonical display name',
};
function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
/** Lets every released response settle before proving what it changed. */
const settle = () =>
  act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
const dossierWorkspace = (
  clientIdentityRevision: number,
  onOpenClientDossier: (clientDossierId: string) => void = vi.fn(),
  clientFilter?: { clientDossierId: string; displayName: string },
) => (
  <DocumentWorkspace
    actor={actor}
    identity={identity}
    clientIdentityRevision={clientIdentityRevision}
    clientFilter={clientFilter}
    onOpenClientDossier={onOpenClientDossier}
  />
);
it('keeps the derived-refresh debt when a union completes during a correction reload', async () => {
  let united = false;
  const detailReads: Array<() => void> = [];
  stubFetch(
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/clients')) return Response.json([]);
      const current = united
        ? canonicalDossierDocument
        : supersededDossierDocument;
      if (init?.method === 'PATCH')
        return Response.json({
          documentId: current.id,
          revision: 2,
          outcome: 'corrected',
        });
      if (url.endsWith(`/documents/${current.id}`)) {
        const read = deferredResponse();
        detailReads.push(() => read.resolve(Response.json(current)));
        return read.promise;
      }
      return Response.json([current]);
    }),
  );
  const openClientDossier = vi.fn();
  const view = render(dossierWorkspace(0, openClientDossier));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Historical questionnaire' }),
  );
  await waitFor(() => expect(detailReads).toHaveLength(1));
  detailReads[0]?.();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit reference' }),
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Corrected title' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  // The correction is accepted; its detail reload is still pending when the
  // union completes, so that reload carries the pre-union dossier target.
  await waitFor(() => expect(detailReads).toHaveLength(2));
  united = true;
  view.rerender(dossierWorkspace(1, openClientDossier));
  detailReads[1]?.();

  await waitFor(() => expect(detailReads).toHaveLength(3));
  // The saved correction stays visible, but not its pre-union dossier target.
  expect(screen.getByText('Correction saved.')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Open Client dossier' }),
  ).not.toBeInTheDocument();
  detailReads[2]?.();
  expect(await screen.findByText('Canonical display name')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open Client dossier' }));
  expect(openClientDossier).toHaveBeenCalledWith('canonical-client');
  expect(openClientDossier).toHaveBeenCalledTimes(1);
});
it.each([
  ['identity refresh first', true, true, 'Canonical Registered Client'],
  ['registration first', false, false, 'Registered Client'],
])(
  'keeps the confirmed registration and canonical existing rows with %s',
  async (
    _completionOrder,
    refreshFirst,
    refreshContainsRegistration,
    expectedRegisteredClient,
  ) => {
    const registration = deferredResponse();
    const identityRefresh = deferredResponse();
    const registeredDocument = {
      ...document,
      id: 'registered-document',
      clientDossierId: 'registered-client',
      clientDisplayName: 'Registered Client',
      title: 'Newly registered questionnaire',
    };
    const canonicalRegisteredDocument = {
      ...registeredDocument,
      clientDossierId: 'canonical-registered-client',
      clientDisplayName: 'Canonical Registered Client',
    };
    let listReads = 0;
    stubFetch(
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/clients'))
          return Response.json([
            { id: 'client', displayName: 'Synthetic Client' },
          ]);
        if (init?.method === 'POST') return registration.promise;
        if (url.endsWith('/documents/registered-document'))
          return Response.json(registeredDocument);
        listReads += 1;
        return listReads === 1
          ? Response.json([supersededDossierDocument])
          : identityRefresh.promise;
      }),
    );
    const view = render(dossierWorkspace(0));
    expect(
      await screen.findByRole('button', { name: 'Historical questionnaire' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Client'), {
      target: { value: 'client' },
    });
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: registeredDocument.title },
    });
    fireEvent.change(screen.getByLabelText('Purpose'), {
      target: { value: registeredDocument.purpose },
    });
    fireEvent.change(screen.getByLabelText('External HTTPS link'), {
      target: { value: registeredDocument.version.representation.url },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Register working reference' }),
    );

    view.rerender(dossierWorkspace(1));
    await waitFor(() => expect(listReads).toBe(2));
    if (refreshFirst) {
      identityRefresh.resolve(
        Response.json(
          refreshContainsRegistration
            ? [canonicalRegisteredDocument, canonicalDossierDocument]
            : [canonicalDossierDocument],
        ),
      );
      await settle();
      registration.resolve(Response.json(registeredDocument, { status: 201 }));
    } else {
      registration.resolve(Response.json(registeredDocument, { status: 201 }));
      await screen.findByRole('link', { name: 'Open external reference' });
      identityRefresh.resolve(
        Response.json(
          refreshContainsRegistration
            ? [canonicalRegisteredDocument, canonicalDossierDocument]
            : [canonicalDossierDocument],
        ),
      );
    }

    await screen.findByRole('link', { name: 'Open external reference' });
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Back to references' }));
    const list = screen.getByRole('list');
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      `Newly registered questionnaire — ${expectedRegisteredClient}${listedRegistrationTime}`,
      `Historical questionnaire — Canonical display name${listedRegistrationTime}`,
    ]);
  },
);
const lateRegistration = {
  ...document,
  id: 'late-registration',
  title: 'Late registered questionnaire',
};
const originalProjection = {
  clientDossierId: 'original-client',
  clientDisplayName: 'Original display name',
};
const unitedProjection = {
  clientDossierId: 'canonical-client',
  clientDisplayName: 'Canonical display name',
};
/** Holds every Document request until the test releases it. */
function lateRegistrationFetcher() {
  const posts: Array<{
    key: string | null;
    response: ReturnType<typeof deferredResponse>;
  }> = [];
  const detailReads: Array<ReturnType<typeof deferredResponse>> = [];
  const listReads: Array<ReturnType<typeof deferredResponse>> = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/clients'))
      return Response.json([{ id: 'client', displayName: 'Synthetic Client' }]);
    const response = deferredResponse();
    if (init?.method === 'POST')
      posts.push({
        key: new Headers(init.headers).get('idempotency-key'),
        response,
      });
    else if (url.endsWith(`/documents/${lateRegistration.id}`))
      detailReads.push(response);
    else listReads.push(response);
    return response.promise;
  });
  return { fetcher, posts, detailReads, listReads };
}
const lateRegistrationWorkspace = ({
  clientIdentityRevision,
  onOpenClientDossier,
  clientFilter,
}: {
  clientIdentityRevision: number;
  onOpenClientDossier: (clientDossierId: string) => void;
  clientFilter?: { clientDossierId: string; displayName: string };
}) => (
  <DocumentWorkspace
    actor={actor}
    identity={identity}
    clientIdentityRevision={clientIdentityRevision}
    clientFilter={clientFilter}
    onOpenClientDossier={onOpenClientDossier}
  />
);
function submitLateRegistration() {
  fireEvent.change(screen.getByLabelText('Client'), {
    target: { value: 'client' },
  });
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: lateRegistration.title },
  });
  fireEvent.change(screen.getByLabelText('Purpose'), {
    target: { value: lateRegistration.purpose },
  });
  fireEvent.change(screen.getByLabelText('External HTTPS link'), {
    target: { value: lateRegistration.version.representation.url },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Register working reference' }),
  );
}
/**
 * Registers while a Client identity change completes with no Document open.
 * The identity refresh started before the registration committed, so it omits
 * the new row, and the registration response carries its pre-change target.
 */
async function confirmLateRegistration({
  completionOrder,
  confirmedProjection,
  onOpenClientDossier,
}: {
  completionOrder: 'identity refresh first' | 'registration first';
  confirmedProjection: typeof originalProjection;
  onOpenClientDossier: (clientDossierId: string) => void;
}) {
  const requests = lateRegistrationFetcher();
  stubFetch(requests.fetcher);
  const view = render(
    lateRegistrationWorkspace({
      clientIdentityRevision: 0,
      onOpenClientDossier,
    }),
  );
  await waitFor(() => expect(requests.listReads).toHaveLength(1));
  requests.listReads[0]?.resolve(Response.json([]));
  expect(
    await screen.findByText('No working references registered yet.'),
  ).toBeInTheDocument();
  submitLateRegistration();
  await waitFor(() => expect(requests.posts).toHaveLength(1));

  view.rerender(
    lateRegistrationWorkspace({
      clientIdentityRevision: 1,
      onOpenClientDossier,
    }),
  );
  await waitFor(() => expect(requests.listReads).toHaveLength(2));
  const confirm = () =>
    requests.posts[0]?.response.resolve(
      Response.json(
        { ...lateRegistration, ...confirmedProjection },
        { status: 201 },
      ),
    );
  const refresh = () => requests.listReads[1]?.resolve(Response.json([]));
  if (completionOrder === 'identity refresh first') {
    refresh();
    await settle();
    confirm();
  } else {
    confirm();
    await screen.findByRole('heading', { name: lateRegistration.title });
    refresh();
  }
  expect(
    await screen.findByRole('heading', { name: lateRegistration.title }),
  ).toBeInTheDocument();
  await settle();
  return { ...requests, view };
}
it.each([
  ['union', 'identity refresh first', originalProjection, unitedProjection],
  ['union', 'registration first', originalProjection, unitedProjection],
  ['reversal', 'identity refresh first', unitedProjection, originalProjection],
  ['reversal', 'registration first', unitedProjection, originalProjection],
] as const)(
  'withholds the dossier target a registration confirmed after a Client %s superseded, with %s',
  async (
    _transition,
    completionOrder,
    confirmedProjection,
    currentProjection,
  ) => {
    const openClientDossier = vi.fn();
    const { posts, detailReads, view } = await confirmLateRegistration({
      completionOrder,
      confirmedProjection,
      onOpenClientDossier: openClientDossier,
    });
    // The confirmed registration stays visible, but its response cannot vouch
    // for the dossier target while the current read is pending.
    expect(
      screen.queryByRole('button', { name: 'Open Client dossier' }),
    ).not.toBeInTheDocument();

    await waitFor(() => expect(detailReads).toHaveLength(1));
    detailReads[0]?.resolve(
      Response.json({ ...lateRegistration, ...currentProjection }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Client dossier' }),
    );
    expect(openClientDossier).toHaveBeenCalledWith(
      currentProjection.clientDossierId,
    );
    expect(openClientDossier).toHaveBeenCalledTimes(1);

    // Back to the same confirmed row: it carries the current projection too.
    fireEvent.click(screen.getByRole('button', { name: 'Back to references' }));
    expect(
      within(screen.getByRole('list'))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      `${lateRegistration.title} — ${currentProjection.clientDisplayName}${listedRegistrationTime}`,
    ]);
    view.rerender(
      lateRegistrationWorkspace({
        clientIdentityRevision: 1,
        onOpenClientDossier: openClientDossier,
        clientFilter: {
          clientDossierId: confirmedProjection.clientDossierId,
          displayName: 'Shared display name',
        },
      }),
    );
    expect(
      screen.getByText('No loaded working Documents match this filter.'),
    ).toBeInTheDocument();
    view.rerender(
      lateRegistrationWorkspace({
        clientIdentityRevision: 1,
        onOpenClientDossier: openClientDossier,
        clientFilter: {
          clientDossierId: currentProjection.clientDossierId,
          displayName: 'Shared display name',
        },
      }),
    );
    expect(
      within(screen.getByRole('list'))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([lateRegistration.title]);
    expect(posts).toHaveLength(1);
  },
);
it('never offers the superseded dossier target when the refresh of a late registration fails', async () => {
  const openClientDossier = vi.fn();
  const { posts, detailReads, view } = await confirmLateRegistration({
    completionOrder: 'identity refresh first',
    confirmedProjection: originalProjection,
    onOpenClientDossier: openClientDossier,
  });
  await waitFor(() => expect(detailReads).toHaveLength(1));
  detailReads[0]?.resolve(new Response(null, { status: 500 }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be loaded or saved',
  );
  expect(
    screen.getByRole('heading', { name: lateRegistration.title }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Open Client dossier' }),
  ).not.toBeInTheDocument();

  // Back to the confirmed row: without a current read it matches no dossier
  // restriction, including the one its registration response named.
  fireEvent.click(screen.getByRole('button', { name: 'Back to references' }));
  view.rerender(
    lateRegistrationWorkspace({
      clientIdentityRevision: 1,
      onOpenClientDossier: openClientDossier,
      clientFilter: {
        clientDossierId: originalProjection.clientDossierId,
        displayName: 'Shared display name',
      },
    }),
  );
  expect(
    screen.getByText('No loaded working Documents match this filter.'),
  ).toBeInTheDocument();
  view.rerender(
    lateRegistrationWorkspace({
      clientIdentityRevision: 1,
      onOpenClientDossier: openClientDossier,
    }),
  );

  // Reopening the same Document reads its current projection.
  fireEvent.click(
    within(screen.getByRole('list')).getByRole('button', {
      name: lateRegistration.title,
    }),
  );
  await waitFor(() => expect(detailReads).toHaveLength(2));
  detailReads[1]?.resolve(
    Response.json({ ...lateRegistration, ...unitedProjection }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open Client dossier' }),
  );
  expect(openClientDossier).toHaveBeenCalledWith(
    unitedProjection.clientDossierId,
  );
  expect(openClientDossier).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Back to references' }));
  expect(
    within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual([
    `${lateRegistration.title} — ${unitedProjection.clientDisplayName}${listedRegistrationTime}`,
  ]);
  expect(posts).toHaveLength(1);
});
it('never offers the superseded dossier target when a late registration is no longer readable', async () => {
  const { posts, detailReads } = await confirmLateRegistration({
    completionOrder: 'registration first',
    confirmedProjection: originalProjection,
    onOpenClientDossier: vi.fn(),
  });
  await waitFor(() => expect(detailReads).toHaveLength(1));
  detailReads[0]?.resolve(new Response(null, { status: 404 }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'You do not have access',
  );
  expect(
    screen.queryByRole('button', { name: 'Open Client dossier' }),
  ).not.toBeInTheDocument();
  expect(posts).toHaveLength(1);
});
it('retries a registration with the exact same command and withholds a target superseded meanwhile', async () => {
  const { fetcher, posts, detailReads, listReads } = lateRegistrationFetcher();
  stubFetch(fetcher);
  const openClientDossier = vi.fn();
  const view = render(
    lateRegistrationWorkspace({
      clientIdentityRevision: 0,
      onOpenClientDossier: openClientDossier,
    }),
  );
  await waitFor(() => expect(listReads).toHaveLength(1));
  listReads[0]?.resolve(Response.json([]));
  expect(
    await screen.findByText('No working references registered yet.'),
  ).toBeInTheDocument();
  submitLateRegistration();
  await waitFor(() => expect(posts).toHaveLength(1));
  posts[0]?.response.resolve(new Response(null, { status: 500 }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be loaded or saved',
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Register working reference' }),
  );
  await waitFor(() => expect(posts).toHaveLength(2));

  view.rerender(
    lateRegistrationWorkspace({
      clientIdentityRevision: 1,
      onOpenClientDossier: openClientDossier,
    }),
  );
  await waitFor(() => expect(listReads).toHaveLength(2));
  listReads[1]?.resolve(Response.json([]));
  await settle();
  posts[1]?.response.resolve(
    Response.json(
      { ...lateRegistration, ...originalProjection },
      { status: 201 },
    ),
  );
  expect(
    await screen.findByRole('heading', { name: lateRegistration.title }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Open Client dossier' }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(detailReads).toHaveLength(1));
  detailReads[0]?.resolve(
    Response.json({ ...lateRegistration, ...unitedProjection }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open Client dossier' }),
  );
  expect(openClientDossier).toHaveBeenCalledWith(
    unitedProjection.clientDossierId,
  );
  expect(posts[0]?.key).toBeTruthy();
  expect(posts.map((post) => post.key)).toEqual([posts[0]?.key, posts[0]?.key]);
});
const dossierA = {
  clientDossierId: 'client-a',
  displayName: 'Shared display name',
};
const dossierB = {
  clientDossierId: 'client-b',
  displayName: 'Shared display name',
};
const documentInB = {
  ...document,
  id: 'document-b',
  clientId: 'client-b',
  clientDossierId: 'client-b',
  clientDisplayName: 'Shared display name',
  title: 'Dossier B questionnaire',
};
const registeredInA = {
  ...documentInB,
  id: 'registered-a',
  clientId: 'client-a',
  clientDossierId: 'client-a',
  title: 'Registered A questionnaire',
};
const registeredInB = {
  ...documentInB,
  id: 'registered-b',
  title: 'Registered B questionnaire',
};
/** Holds every registration until the test releases it. */
function scopedRegistrationFetcher() {
  const posts: Array<{
    key: string | null;
    body: unknown;
    response: ReturnType<typeof deferredResponse>;
  }> = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/clients'))
      return Response.json([
        { id: 'client-a', displayName: 'Shared display name' },
        { id: 'client-b', displayName: 'Shared display name' },
      ]);
    if (init?.method === 'POST') {
      const response = deferredResponse();
      posts.push({
        key: new Headers(init.headers).get('idempotency-key'),
        body: init.body,
        response,
      });
      return response.promise;
    }
    return Response.json([documentInB]);
  });
  return { fetcher, posts };
}
function registerFor(clientId: string, title: string) {
  fireEvent.change(screen.getByLabelText('Client'), {
    target: { value: clientId },
  });
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: title },
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
}
/** The titles the loaded list offers; none while no list is shown. */
const listedTitles = () => {
  const list = screen.queryByRole('list');
  return list
    ? within(list)
        .queryAllByRole('button')
        .map((button) => button.textContent)
    : [];
};
it.each([
  ['opens dossier B', undefined, [dossierB], ['Dossier B questionnaire']],
  [
    'clears the dossier A restriction',
    dossierA,
    [undefined],
    ['Registered A questionnaire', 'Dossier B questionnaire'],
  ],
  [
    'opens dossier B and then dossier A again',
    dossierA,
    [dossierB, dossierA],
    ['Registered A questionnaire'],
  ],
])(
  'keeps the latest view when the member %s before a registration confirms',
  async (_navigation, startFilter, navigations, expectedTitles) => {
    const { fetcher, posts } = scopedRegistrationFetcher();
    stubFetch(fetcher);
    const onActivityRecorded = vi.fn();
    const workspace = (clientFilter?: typeof dossierA) => (
      <DocumentWorkspace
        actor={actor}
        identity={identity}
        clientFilter={clientFilter}
        onActivityRecorded={onActivityRecorded}
        onOpenClientDossier={vi.fn()}
      />
    );
    const view = render(workspace(startFilter));
    await screen.findByRole('button', { name: 'Register working reference' });
    registerFor('client-a', registeredInA.title);
    await waitFor(() => expect(posts).toHaveLength(1));

    for (const next of navigations) view.rerender(workspace(next));
    posts[0]?.response.resolve(Response.json(registeredInA, { status: 201 }));

    // The confirmed registration is reported without replacing the view.
    await waitFor(() => expect(onActivityRecorded).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole('heading', { name: registeredInA.title }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open Client dossier' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Working reference registered.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(listedTitles()).toEqual(expectedTitles);

    // Leaving the restriction lists the confirmed row with the loaded rows.
    view.rerender(workspace());
    expect(listedTitles()).toEqual([
      'Registered A questionnaire',
      'Dossier B questionnaire',
    ]);
    expect(posts).toHaveLength(1);
  },
);
it.each([
  ['another Client', 'client-a', registeredInA, false],
  ['the restricted Client', 'client-b', registeredInB, true],
])(
  'retries a registration for %s exactly under an unchanged dossier restriction',
  async (_client, clientId, registered, opensRegistered) => {
    const { fetcher, posts } = scopedRegistrationFetcher();
    stubFetch(fetcher);
    const onActivityRecorded = vi.fn();
    const openClientDossier = vi.fn();
    render(
      <DocumentWorkspace
        actor={actor}
        identity={identity}
        clientFilter={dossierB}
        onActivityRecorded={onActivityRecorded}
        onOpenClientDossier={openClientDossier}
      />,
    );
    await screen.findByRole('button', { name: 'Register working reference' });
    registerFor(clientId, registered.title);
    await waitFor(() => expect(posts).toHaveLength(1));
    posts[0]?.response.resolve(new Response(null, { status: 500 }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not be loaded or saved',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Register working reference' }),
    );
    await waitFor(() => expect(posts).toHaveLength(2));
    posts[1]?.response.resolve(Response.json(registered, { status: 201 }));

    if (opensRegistered) {
      expect(
        await screen.findByRole('heading', { name: registered.title }),
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Open Client dossier' }),
      );
      expect(openClientDossier).toHaveBeenCalledWith('client-b');
    } else {
      // A Document outside the active restriction is never opened under it.
      await waitFor(() => expect(onActivityRecorded).toHaveBeenCalledTimes(1));
      expect(
        screen.queryByRole('heading', { name: registered.title }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Open Client dossier' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText('Working reference registered.'),
      ).toBeInTheDocument();
      expect(listedTitles()).toEqual(['Dossier B questionnaire']);
      expect(
        screen.getByRole('searchbox', { name: 'Filter working Documents' }),
      ).toHaveValue('Shared display name');
    }
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(onActivityRecorded).toHaveBeenCalledTimes(1));
    expect(posts[0]?.key).toBeTruthy();
    expect(posts.map((post) => post.key)).toEqual([
      posts[0]?.key,
      posts[0]?.key,
    ]);
  },
);
const submittedDraft = {
  clientId: 'client-a',
  title: registeredInA.title,
  purpose: document.purpose,
  url: document.version.representation.url,
};
function expectRegistrationDraft(draft: typeof submittedDraft) {
  expect(screen.getByLabelText('Client')).toHaveValue(draft.clientId);
  expect(screen.getByLabelText('Title')).toHaveValue(draft.title);
  expect(screen.getByLabelText('Purpose')).toHaveValue(draft.purpose);
  expect(screen.getByLabelText('External HTTPS link')).toHaveValue(draft.url);
}
/** Renders the workspace a scoped registration is submitted from. */
function renderScopedRegistration(startFilter?: typeof dossierA) {
  const requests = scopedRegistrationFetcher();
  stubFetch(requests.fetcher);
  const onActivityRecorded = vi.fn();
  const workspace = (clientFilter?: typeof dossierA) => (
    <DocumentWorkspace
      actor={actor}
      identity={identity}
      clientFilter={clientFilter}
      onActivityRecorded={onActivityRecorded}
      onOpenClientDossier={vi.fn()}
    />
  );
  const view = render(workspace(startFilter));
  return {
    ...requests,
    onActivityRecorded,
    showDossier: (clientFilter?: typeof dossierA) =>
      view.rerender(workspace(clientFilter)),
  };
}
const typeDocumentFilter = (query: string) =>
  fireEvent.change(
    screen.getByRole('searchbox', { name: 'Filter working Documents' }),
    { target: { value: query } },
  );
it.each([
  ['types a text filter', undefined, 'text', ['Registered A questionnaire']],
  ['opens another dossier', undefined, 'dossier', ['Dossier B questionnaire']],
  [
    'stays in a dossier the registration is outside of',
    dossierB,
    'none',
    ['Dossier B questionnaire'],
  ],
  [
    'stays in the submitted view',
    undefined,
    'none',
    ['Registered A questionnaire', 'Dossier B questionnaire'],
  ],
] as const)(
  'retires the confirmed registration draft when the member %s while it is pending',
  async (_view, startFilter, change, expectedTitles) => {
    const { posts, onActivityRecorded, showDossier } =
      renderScopedRegistration(startFilter);
    await screen.findByRole('button', { name: 'Register working reference' });
    registerFor('client-a', registeredInA.title);
    await waitFor(() => expect(posts).toHaveLength(1));
    if (change === 'text') typeDocumentFilter('Registered');
    if (change === 'dossier') showDossier(dossierB);
    posts[0]?.response.resolve(Response.json(registeredInA, { status: 201 }));
    await waitFor(() => expect(onActivityRecorded).toHaveBeenCalledTimes(1));
    if (startFilter === undefined && change === 'none')
      fireEvent.click(
        screen.getByRole('button', { name: 'Back to references' }),
      );
    else
      expect(
        screen.getByText('Working reference registered.'),
      ).toBeInTheDocument();
    expect(listedTitles()).toEqual(expectedTitles);

    // The confirmed command cannot be submitted again under a new key.
    fireEvent.click(
      screen.getByRole('button', { name: 'Register working reference' }),
    );
    await settle();
    expect(posts).toHaveLength(1);
    expectRegistrationDraft({ clientId: '', title: '', purpose: '', url: '' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  },
);
it('keeps a registration draft changed while pending as a new registration', async () => {
  const { posts, onActivityRecorded } = renderScopedRegistration();
  await screen.findByRole('button', { name: 'Register working reference' });
  registerFor('client-a', registeredInA.title);
  await waitFor(() => expect(posts).toHaveLength(1));
  typeDocumentFilter('Registered');
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Follow-up questionnaire' },
  });
  posts[0]?.response.resolve(Response.json(registeredInA, { status: 201 }));
  await waitFor(() => expect(onActivityRecorded).toHaveBeenCalledTimes(1));

  // The newer draft is the member's own work and becomes its own command.
  const followUp = { ...submittedDraft, title: 'Follow-up questionnaire' };
  expectRegistrationDraft(followUp);
  fireEvent.click(
    screen.getByRole('button', { name: 'Register working reference' }),
  );
  await waitFor(() => expect(posts).toHaveLength(2));
  expect(posts[1]?.key).toBeTruthy();
  expect(posts[1]?.key).not.toBe(posts[0]?.key);
  expect(posts.map((post) => post.body)).toEqual([
    JSON.stringify(submittedDraft),
    JSON.stringify(followUp),
  ]);
});
it('retries a registration whose response was lost after the view changed with the exact same command', async () => {
  const { posts, onActivityRecorded } = renderScopedRegistration();
  await screen.findByRole('button', { name: 'Register working reference' });
  registerFor('client-a', registeredInA.title);
  await waitFor(() => expect(posts).toHaveLength(1));
  typeDocumentFilter('Registered');
  posts[0]?.response.resolve(new Response(null, { status: 500 }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be loaded or saved',
  );
  expectRegistrationDraft(submittedDraft);

  fireEvent.click(
    screen.getByRole('button', { name: 'Register working reference' }),
  );
  await waitFor(() => expect(posts).toHaveLength(2));
  posts[1]?.response.resolve(Response.json(registeredInA, { status: 201 }));
  // The retry was submitted from the changed view, which it therefore opens.
  expect(
    await screen.findByRole('heading', { name: registeredInA.title }),
  ).toBeInTheDocument();
  expect(onActivityRecorded).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Back to references' }));
  expect(listedTitles()).toEqual(['Registered A questionnaire']);
  expectRegistrationDraft({ clientId: '', title: '', purpose: '', url: '' });
  expect(posts[0]?.key).toBeTruthy();
  expect(posts.map((post) => [post.key, post.body])).toEqual([
    [posts[0]?.key, JSON.stringify(submittedDraft)],
    [posts[0]?.key, JSON.stringify(submittedDraft)],
  ]);
});
it('retires a pending detail read when a dossier restriction arrives', async () => {
  const detailReads: Array<() => void> = [];
  stubFetch(
    vi.fn(async (url: string) => {
      if (url.endsWith('/clients')) return Response.json([]);
      const opened = dossierDocuments.find((candidate) =>
        url.endsWith(`/documents/${candidate.id}`),
      );
      if (!opened) return Response.json(dossierDocuments);
      const read = deferredResponse();
      detailReads.push(() => read.resolve(Response.json(opened)));
      return read.promise;
    }),
  );
  const view = render(<DocumentWorkspace actor={actor} identity={identity} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Historical questionnaire' }),
  );
  await waitFor(() => expect(detailReads).toHaveLength(1));

  // The member opens another dossier's Documents before that read answers.
  view.rerender(
    <DocumentWorkspace
      actor={actor}
      identity={identity}
      clientFilter={{
        clientDossierId: 'other-client',
        displayName: 'Shared display name',
      }}
    />,
  );
  detailReads[0]?.();
  await settle();
  expect(
    screen.queryByRole('heading', { name: 'Historical questionnaire' }),
  ).not.toBeInTheDocument();
  const homonym = within(screen.getByRole('list')).getByRole('button', {
    name: 'Homonym questionnaire',
  });
  expect(within(screen.getByRole('list')).getAllByRole('button')).toEqual([
    homonym,
  ]);
  expect(homonym).toBeEnabled();
});
it('refreshes the dossier target of a preserved correction once that correction ends', async () => {
  let united = false;
  stubFetch(
    vi.fn(async (url: string) => {
      if (url.endsWith('/clients')) return Response.json([]);
      const current = united
        ? canonicalDossierDocument
        : supersededDossierDocument;
      return Response.json(
        url.endsWith(`/documents/${current.id}`) ? current : [current],
      );
    }),
  );
  const openClientDossier = vi.fn();
  const workspace = (clientIdentityRevision: number) => (
    <DocumentWorkspace
      actor={actor}
      identity={identity}
      clientIdentityRevision={clientIdentityRevision}
      onOpenClientDossier={openClientDossier}
    />
  );
  const view = render(workspace(0));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Historical questionnaire' }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit reference' }),
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Unsaved correction draft' },
  });

  // The Client union happens while the correction is open.
  united = true;
  view.rerender(workspace(1));
  expect(screen.getByLabelText('Title')).toHaveValue(
    'Unsaved correction draft',
  );

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(await screen.findByText('Canonical display name')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open Client dossier' }));
  expect(openClientDossier).toHaveBeenCalledWith('canonical-client');
  expect(openClientDossier).toHaveBeenCalledTimes(1);
});
it.each([
  ['with no correction open', false],
  ['after a protected correction is cancelled', true],
])(
  'withholds the superseded dossier target of an open Document until its identity refresh lands, %s',
  async (_lifecycle, correctionOpen) => {
    let united = false;
    const refreshes: Array<ReturnType<typeof deferredResponse>> = [];
    stubFetch(
      vi.fn(async (url: string) => {
        if (url.endsWith('/clients')) return Response.json([]);
        if (!url.endsWith(`/documents/${supersededDossierDocument.id}`))
          return Response.json([
            united ? canonicalDossierDocument : supersededDossierDocument,
          ]);
        if (!united) return Response.json(supersededDossierDocument);
        const refresh = deferredResponse();
        refreshes.push(refresh);
        return refresh.promise;
      }),
    );
    const openClientDossier = vi.fn();
    const view = render(dossierWorkspace(0, openClientDossier));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Historical questionnaire' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Open Client dossier' }),
    ).toBeInTheDocument();
    if (correctionOpen) {
      fireEvent.click(screen.getByRole('button', { name: 'Edit reference' }));
      fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: 'Unsaved correction draft' },
      });
    }

    united = true;
    view.rerender(dossierWorkspace(1, openClientDossier));
    if (correctionOpen) {
      expect(screen.getByLabelText('Title')).toHaveValue(
        'Unsaved correction draft',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    }
    await waitFor(() => expect(refreshes).toHaveLength(1));
    expect(
      screen.getByRole('heading', { name: 'Historical questionnaire' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open Client dossier' }),
    ).not.toBeInTheDocument();

    refreshes[0]?.resolve(Response.json(canonicalDossierDocument));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Client dossier' }),
    );
    expect(openClientDossier).toHaveBeenCalledWith('canonical-client');
    expect(openClientDossier).toHaveBeenCalledTimes(1);
  },
);
it('withholds the superseded dossier target of an open Document after its identity refresh fails', async () => {
  let united = false;
  let readsAfterUnion = 0;
  stubFetch(
    vi.fn(async (url: string) => {
      if (url.endsWith('/clients')) return Response.json([]);
      if (!url.endsWith(`/documents/${supersededDossierDocument.id}`))
        return Response.json([
          united ? canonicalDossierDocument : supersededDossierDocument,
        ]);
      if (!united) return Response.json(supersededDossierDocument);
      readsAfterUnion += 1;
      return readsAfterUnion === 1
        ? new Response(null, { status: 500 })
        : Response.json(canonicalDossierDocument);
    }),
  );
  const openClientDossier = vi.fn();
  const view = render(dossierWorkspace(0, openClientDossier));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Historical questionnaire' }),
  );
  expect(
    await screen.findByRole('button', { name: 'Open Client dossier' }),
  ).toBeInTheDocument();

  united = true;
  view.rerender(dossierWorkspace(1, openClientDossier));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be loaded or saved',
  );
  expect(
    screen.getByRole('heading', { name: 'Historical questionnaire' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Open Client dossier' }),
  ).not.toBeInTheDocument();

  // Reopening the same Document is a current read that restores its target.
  fireEvent.click(screen.getByRole('button', { name: 'Back to references' }));
  fireEvent.click(
    within(screen.getByRole('list')).getByRole('button', {
      name: 'Historical questionnaire',
    }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open Client dossier' }),
  );
  expect(openClientDossier).toHaveBeenCalledWith('canonical-client');
  expect(openClientDossier).toHaveBeenCalledTimes(1);
  expect(readsAfterUnion).toBe(2);
});
/**
 * Delivers each Client identity revision as the shell does and records what
 * the public DOM offers in the commit that delivers it. Layout effects run once
 * that commit's DOM is in place and before any of its passive effects, so this
 * is what the member could activate at that moment.
 */
function IdentityRevisionHost<Observation>({
  clientIdentityRevision,
  clientFilter,
  onOpenClientDossier,
  observe,
  deliveries,
}: {
  clientIdentityRevision: number;
  clientFilter?: { clientDossierId: string; displayName: string };
  onOpenClientDossier: (clientDossierId: string) => void;
  observe: () => Observation;
  deliveries: Map<number, Observation>;
}) {
  useLayoutEffect(() => {
    deliveries.set(clientIdentityRevision, observe());
  }, [clientIdentityRevision, deliveries, observe]);
  return dossierWorkspace(
    clientIdentityRevision,
    onOpenClientDossier,
    clientFilter,
  );
}
const offersDossierAction = () =>
  screen.queryByRole('button', { name: 'Open Client dossier' }) !== null;
/** Serves every Document with the dossier projection current at that moment. */
function currentProjectionFetcher() {
  let projection = originalProjection;
  const current = (source: typeof document) => ({ ...source, ...projection });
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/clients'))
      return Response.json([{ id: 'client', displayName: 'Synthetic Client' }]);
    if (init?.method === 'POST')
      return Response.json(current(lateRegistration), { status: 201 });
    if (init?.method === 'PATCH')
      return Response.json({
        documentId: document.id,
        revision: 2,
        outcome: 'corrected',
      });
    if (url.endsWith(`/documents/${lateRegistration.id}`))
      return Response.json(current(lateRegistration));
    if (url.endsWith(`/documents/${document.id}`))
      return Response.json(current(document));
    return Response.json([current(document)]);
  });
  return {
    fetcher,
    moveTo: (next: typeof originalProjection) => {
      projection = next;
    },
  };
}
async function openListedDocument() {
  fireEvent.click(await screen.findByRole('button', { name: document.title }));
}
async function confirmRegistration() {
  await screen.findByRole('button', { name: 'Register working reference' });
  submitLateRegistration();
}
async function saveCorrection() {
  await openListedDocument();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit reference' }),
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Corrected title' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  expect(await screen.findByText('Correction saved.')).toBeInTheDocument();
}
it.each([
  ['opened from the list', openListedDocument],
  ['confirmed by its registration', confirmRegistration],
  ['reloaded after its saved correction', saveCorrection],
])(
  'withholds a superseded dossier action from the first commit of a Client union and of its reversal, for a Document %s',
  async (_publication, publish) => {
    const projections = currentProjectionFetcher();
    stubFetch(projections.fetcher);
    const openClientDossier = vi.fn();
    const dossierActionOnDelivery = new Map<number, boolean>();
    const host = (clientIdentityRevision: number) => (
      <IdentityRevisionHost
        clientIdentityRevision={clientIdentityRevision}
        onOpenClientDossier={openClientDossier}
        observe={offersDossierAction}
        deliveries={dossierActionOnDelivery}
      />
    );
    const view = render(host(0));
    await publish();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Client dossier' }),
    );
    expect(openClientDossier).toHaveBeenLastCalledWith(
      originalProjection.clientDossierId,
    );

    for (const [revision, current] of [
      [1, unitedProjection],
      [2, originalProjection],
    ] as const) {
      projections.moveTo(current);
      view.rerender(host(revision));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Open Client dossier' }),
      );
      expect(openClientDossier).toHaveBeenLastCalledWith(
        current.clientDossierId,
      );
    }
    // Not even the commit that delivered the union or the reversal offered the
    // dossier target it superseded; only a current read restored the action.
    expect([...dossierActionOnDelivery]).toEqual([
      [0, false],
      [1, false],
      [2, false],
    ]);
    expect(openClientDossier).toHaveBeenCalledTimes(3);
  },
);
/** Holds every Document request, by kind, until the test answers it. */
function heldDocumentRequests() {
  const lists: Array<ReturnType<typeof deferredResponse>> = [];
  const details: Array<ReturnType<typeof deferredResponse>> = [];
  const commands: Array<ReturnType<typeof deferredResponse>> = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/clients'))
      return Response.json([{ id: 'client', displayName: 'Synthetic Client' }]);
    const response = deferredResponse();
    if (init?.method === 'POST' || init?.method === 'PATCH')
      commands.push(response);
    else if (url.endsWith('/documents')) lists.push(response);
    else details.push(response);
    return response.promise;
  });
  return { fetcher, lists, details, commands };
}
const restrictionTo = (projection: typeof originalProjection) => ({
  clientDossierId: projection.clientDossierId,
  displayName: projection.clientDisplayName,
});
const noMatches = 'No loaded working Documents match this filter.';
it.each([
  ['union', 'the active', originalProjection, unitedProjection],
  ['union', 'a reopened', originalProjection, unitedProjection],
  ['reversal', 'the active', unitedProjection, originalProjection],
  ['reversal', 'a reopened', unitedProjection, originalProjection],
] as const)(
  'matches no row a Client %s left stale to %s dossier restriction until a current list read lands',
  async (_transition, restriction, previousProjection, currentProjection) => {
    const requests = heldDocumentRequests();
    stubFetch(requests.fetcher);
    const superseded = restrictionTo(previousProjection);
    const initialRestriction =
      restriction === 'the active' ? superseded : undefined;
    const listedOnDelivery = new Map<number, Array<string | null>>();
    const host = (
      clientIdentityRevision: number,
      clientFilter?: typeof superseded,
    ) => (
      <IdentityRevisionHost
        clientIdentityRevision={clientIdentityRevision}
        clientFilter={clientFilter}
        onOpenClientDossier={vi.fn()}
        observe={listedTitles}
        deliveries={listedOnDelivery}
      />
    );
    const view = render(host(0, initialRestriction));
    await waitFor(() => expect(requests.lists).toHaveLength(1));
    requests.lists[0]?.resolve(
      Response.json([{ ...document, ...previousProjection }]),
    );
    expect(
      await screen.findByRole('button', { name: document.title }),
    ).toBeInTheDocument();

    view.rerender(host(1, initialRestriction));
    await waitFor(() => expect(requests.lists).toHaveLength(2));
    if (restriction === 'the active') {
      // Not even the commit that delivers the identity change, nor the
      // pending refresh, lets the superseded projection match.
      expect(listedOnDelivery.get(1)).toEqual([]);
      expect(listedTitles()).toEqual([]);
      expect(screen.getByRole('status')).toHaveTextContent(
        'Loading working references…',
      );
    }
    requests.lists[1]?.resolve(new Response(null, { status: 500 }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not be loaded or saved',
    );
    if (restriction === 'a reopened') {
      // The retained rows stay listed without a restriction.
      expect(listedTitles()).toEqual([document.title]);
      view.rerender(host(1, superseded));
    }
    expect(listedTitles()).toEqual([]);
    expect(screen.queryByText(noMatches)).not.toBeInTheDocument();

    // Retrying is a current read; only then are dossier identities compared.
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading working references…',
    );
    await waitFor(() => expect(requests.lists).toHaveLength(3));
    requests.lists[2]?.resolve(
      Response.json([{ ...document, ...currentProjection }]),
    );
    expect(await screen.findByText(noMatches)).toBeInTheDocument();
    view.rerender(host(1, restrictionTo(currentProjection)));
    expect(listedTitles()).toEqual([document.title]);
  },
);
it.each([
  ['after the failed identity refresh', true],
  ['before the failed identity refresh', false],
])(
  'never matches rows from a correction reload that began before a Client union and landed %s',
  async (_order, refreshFailsFirst) => {
    const requests = heldDocumentRequests();
    stubFetch(requests.fetcher);
    const original = { ...document, ...originalProjection };
    const corrected = {
      ...original,
      title: 'Corrected title',
      workingRevision: 2,
    };
    const view = render(dossierWorkspace(0));
    await waitFor(() => expect(requests.lists).toHaveLength(1));
    requests.lists[0]?.resolve(Response.json([original]));
    fireEvent.click(
      await screen.findByRole('button', { name: document.title }),
    );
    await waitFor(() => expect(requests.details).toHaveLength(1));
    requests.details[0]?.resolve(Response.json(original));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit reference' }),
    );
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: corrected.title },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    await waitFor(() => expect(requests.commands).toHaveLength(1));
    requests.commands[0]?.resolve(
      Response.json({
        documentId: document.id,
        revision: 2,
        outcome: 'corrected',
      }),
    );
    // The accepted correction's reload began before the union and is held.
    await waitFor(() => expect(requests.lists).toHaveLength(2));
    view.rerender(dossierWorkspace(1));
    await waitFor(() => expect(requests.lists).toHaveLength(3));
    const failRefresh = () =>
      requests.lists[2]?.resolve(new Response(null, { status: 500 }));
    const answerReload = () => {
      requests.details[1]?.resolve(Response.json(corrected));
      requests.lists[1]?.resolve(Response.json([corrected]));
    };
    if (refreshFailsFirst) {
      failRefresh();
      await settle();
      answerReload();
    } else {
      answerReload();
      await settle();
      failRefresh();
    }
    expect(await screen.findByText('Correction saved.')).toBeInTheDocument();
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'Back to references' }));
    expect(listedTitles()).toEqual([corrected.title]);
    view.rerender(
      dossierWorkspace(1, vi.fn(), restrictionTo(originalProjection)),
    );
    expect(listedTitles()).toEqual([]);
    expect(screen.queryByText(noMatches)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(requests.lists).toHaveLength(4));
    requests.lists[3]?.resolve(
      Response.json([{ ...corrected, ...unitedProjection }]),
    );
    expect(await screen.findByText(noMatches)).toBeInTheDocument();
    view.rerender(
      dossierWorkspace(1, vi.fn(), restrictionTo(unitedProjection)),
    );
    expect(listedTitles()).toEqual([corrected.title]);
    expect(requests.commands).toHaveLength(1);
  },
);
it.each([
  ['succeeds', () => Response.json([{ ...document, ...unitedProjection }])],
  ['is denied', () => new Response(null, { status: 403 })],
  ['fails', () => new Response(null, { status: 500 })],
] as const)(
  'keeps the current rows and outcome when an identity refresh superseded by a newer correction reload %s late',
  async (_outcome, lateRefreshOutcome) => {
    const requests = heldDocumentRequests();
    stubFetch(requests.fetcher);
    const original = { ...document, ...originalProjection };
    const corrected = {
      ...document,
      ...unitedProjection,
      title: 'Corrected title',
      workingRevision: 2,
    };
    const openClientDossier = vi.fn();
    const view = render(dossierWorkspace(0, openClientDossier));
    await waitFor(() => expect(requests.lists).toHaveLength(1));
    requests.lists[0]?.resolve(Response.json([original]));
    fireEvent.click(
      await screen.findByRole('button', { name: document.title }),
    );
    await waitFor(() => expect(requests.details).toHaveLength(1));
    requests.details[0]?.resolve(Response.json(original));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit reference' }),
    );
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: corrected.title },
    });
    // The union's identity refresh is held while the correction is saved, so
    // the accepted correction's reload is the newer read of the same rows.
    view.rerender(dossierWorkspace(1, openClientDossier));
    await waitFor(() => expect(requests.lists).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    await waitFor(() => expect(requests.commands).toHaveLength(1));
    requests.commands[0]?.resolve(
      Response.json({
        documentId: document.id,
        revision: 2,
        outcome: 'corrected',
      }),
    );
    await waitFor(() => expect(requests.lists).toHaveLength(3));
    requests.details[1]?.resolve(Response.json(corrected));
    requests.lists[2]?.resolve(Response.json([corrected]));
    expect(await screen.findByText('Correction saved.')).toBeInTheDocument();

    requests.lists[1]?.resolve(lateRefreshOutcome());
    await settle();

    // The older refresh answers for rows a newer read already published.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Correction saved.')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: corrected.title }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Open Client dossier' }),
    );
    expect(openClientDossier).toHaveBeenCalledWith(
      unitedProjection.clientDossierId,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to references' }));
    expect(listedTitles()).toEqual([corrected.title]);
    view.rerender(
      dossierWorkspace(1, openClientDossier, restrictionTo(unitedProjection)),
    );
    expect(listedTitles()).toEqual([corrected.title]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // A refresh that fails after every newer read is still reported.
    view.rerender(
      dossierWorkspace(2, openClientDossier, restrictionTo(unitedProjection)),
    );
    await waitFor(() => expect(requests.lists).toHaveLength(4));
    requests.lists[3]?.resolve(new Response(null, { status: 500 }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not be loaded or saved',
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(requests.commands).toHaveLength(1);
  },
);
it('keeps a registration confirmed before a Client union listed but out of its superseded restriction when the refresh fails', async () => {
  const requests = heldDocumentRequests();
  stubFetch(requests.fetcher);
  const view = render(dossierWorkspace(0));
  await waitFor(() => expect(requests.lists).toHaveLength(1));
  requests.lists[0]?.resolve(Response.json([]));
  expect(
    await screen.findByText('No working references registered yet.'),
  ).toBeInTheDocument();
  submitLateRegistration();
  await waitFor(() => expect(requests.commands).toHaveLength(1));
  requests.commands[0]?.resolve(
    Response.json(
      { ...lateRegistration, ...originalProjection },
      { status: 201 },
    ),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Back to references' }),
  );
  expect(listedTitles()).toEqual([lateRegistration.title]);

  view.rerender(dossierWorkspace(1));
  await waitFor(() => expect(requests.lists).toHaveLength(2));
  requests.lists[1]?.resolve(new Response(null, { status: 500 }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be loaded or saved',
  );
  // The confirmed row is kept, but its pre-union projection matches nothing.
  expect(listedTitles()).toEqual([lateRegistration.title]);
  view.rerender(
    dossierWorkspace(1, vi.fn(), restrictionTo(originalProjection)),
  );
  expect(listedTitles()).toEqual([]);
  expect(screen.queryByText(noMatches)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(requests.lists).toHaveLength(3));
  requests.lists[2]?.resolve(
    Response.json([{ ...lateRegistration, ...unitedProjection }]),
  );
  expect(await screen.findByText(noMatches)).toBeInTheDocument();
  view.rerender(dossierWorkspace(1, vi.fn(), restrictionTo(unitedProjection)));
  expect(listedTitles()).toEqual([lateRegistration.title]);
  expect(requests.commands).toHaveLength(1);
});
it('discards a delayed Document load that would republish a superseded projection', async () => {
  let united = false;
  const listReads: Array<() => void> = [];
  stubFetch(
    vi.fn(async (url: string) => {
      if (url.endsWith('/clients')) return Response.json([]);
      const rows = [
        united ? canonicalDossierDocument : supersededDossierDocument,
      ];
      const read = deferredResponse();
      listReads.push(() => read.resolve(Response.json(rows)));
      return read.promise;
    }),
  );
  const workspace = (clientIdentityRevision: number) => (
    <DocumentWorkspace
      actor={actor}
      identity={identity}
      clientIdentityRevision={clientIdentityRevision}
    />
  );
  const view = render(workspace(0));
  await waitFor(() => expect(listReads).toHaveLength(1));

  // The initial load captured the pre-union projection and is still pending
  // when the union moves the derived dossier targets.
  united = true;
  view.rerender(workspace(1));
  await waitFor(() => expect(listReads).toHaveLength(2));

  listReads[1]?.();
  expect(await screen.findByText(/Canonical display name/)).toBeInTheDocument();
  listReads[0]?.();
  // Settle the delayed response before proving that it changed nothing.
  await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
  expect(screen.getByRole('list')).toHaveTextContent('Canonical display name');
  expect(screen.queryByText(/Superseded display name/)).not.toBeInTheDocument();
});
it('does not offer dossier navigation for a Document without a derived dossier identity', async () => {
  stubFetch(dossierFetcher());
  render(
    <DocumentWorkspace
      actor={actor}
      identity={identity}
      onOpenClientDossier={vi.fn()}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Unprojected questionnaire' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Unprojected questionnaire' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Open Client dossier' }),
  ).not.toBeInTheDocument();
});
it('hides no readable Document from the unfiltered view without a dossier projection', async () => {
  stubFetch(dossierFetcher());
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  const list = await screen.findByRole('list');
  expect(
    within(list)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual([
    'Historical questionnaire',
    'Homonym questionnaire',
    'Unprojected questionnaire',
  ]);
  expect(
    screen.queryByRole('button', { name: 'Open Client dossier' }),
  ).not.toBeInTheDocument();
});
it('registers and reopens an unverified Company-confidential questionnaire reference', async () => {
  let saved = false;
  stubFetch(
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
  stubFetch(
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
  stubFetch(
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
  fireEvent.change(screen.getByLabelText('Filter working Documents'), {
    target: { value: 'unrelated filter' },
  });
  fireEvent.change(screen.getByLabelText('Filter working Documents'), {
    target: { value: '' },
  });
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
  stubFetch(
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
  stubFetch(
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
  stubFetch(fetcher);
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
  stubFetch(
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
it('shows the persisted registration time of listed and opened working references', async () => {
  const later = {
    ...document,
    id: 'document-later',
    title: 'Supplier evidence checklist',
    createdAt: '2026-09-21T06:30:00.000Z',
  };
  const applicationDateTime = (value: string) =>
    new Intl.DateTimeFormat(
      globalThis.document.documentElement.lang || navigator.language,
      { dateStyle: 'medium', timeStyle: 'short' },
    ).format(new Date(value));
  stubFetch(
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith('/clients')
          ? []
          : url.endsWith(`/documents/${document.id}`)
            ? document
            : [document, later],
      ),
    ),
  );
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  const rows = await screen.findAllByRole('listitem');
  expect(within(rows[0]).getByRole('term')).toHaveTextContent(
    'Registration time',
  );
  expect(within(rows[0]).getByRole('definition')).toHaveTextContent(
    applicationDateTime(document.createdAt),
  );
  expect(within(rows[1]).getByRole('definition')).toHaveTextContent(
    applicationDateTime(later.createdAt),
  );
  expect(
    within(rows[0]).getByText(applicationDateTime(document.createdAt)),
  ).toHaveAttribute('datetime', document.createdAt);

  fireEvent.click(screen.getByRole('button', { name: document.title }));
  const detail = await screen.findByRole('article');
  expect(
    within(detail).getByRole('heading', { name: document.title }),
  ).toBeInTheDocument();
  expect(within(detail).getByRole('term')).toHaveTextContent(
    'Registration time',
  );
  expect(within(detail).getByRole('definition')).toHaveTextContent(
    applicationDateTime(document.createdAt),
  );
  expect(
    within(detail).getByText(applicationDateTime(document.createdAt)),
  ).toHaveAttribute('datetime', document.createdAt);
});
it('keeps the registration time of the opened reference through correction editing, saving, uncertainty, retry and cancel', async () => {
  const applicationDateTime = new Intl.DateTimeFormat(
    globalThis.document.documentElement.lang || navigator.language,
    { dateStyle: 'medium', timeStyle: 'short' },
  ).format(new Date(document.createdAt));
  const expectOneRegistrationTime = () => {
    const detail = screen.getByRole('article');
    expect(within(detail).getByRole('term')).toHaveTextContent(
      'Registration time',
    );
    expect(within(detail).getByRole('definition')).toHaveTextContent(
      applicationDateTime,
    );
    expect(within(detail).getByText(applicationDateTime)).toHaveAttribute(
      'datetime',
      document.createdAt,
    );
  };
  let answerFirstPatch: (response: Response) => void = () => undefined;
  let patches = 0;
  let corrected = false;
  stubFetch(
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/clients')) return Response.json([]);
      if (init?.method === 'PATCH') {
        patches += 1;
        if (patches === 1)
          return new Promise<Response>((resolve) => {
            answerFirstPatch = resolve;
          });
        corrected = true;
        return Response.json({
          documentId: document.id,
          revision: 2,
          outcome: 'corrected',
        });
      }
      const current = corrected
        ? { ...document, title: 'Corrected questionnaire', workingRevision: 2 }
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
  expect(screen.getByLabelText('Title')).toBeEnabled();
  expectOneRegistrationTime();

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(
    screen.getByRole('heading', { name: document.title }),
  ).toBeInTheDocument();
  expectOneRegistrationTime();

  fireEvent.click(screen.getByRole('button', { name: 'Edit reference' }));
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Corrected questionnaire' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  expect(await screen.findByText('Saving correction…')).toBeInTheDocument();
  expect(screen.getByLabelText('Title')).toBeDisabled();
  expectOneRegistrationTime();

  answerFirstPatch(new Response(null, { status: 500 }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'result is uncertain',
  );
  expectOneRegistrationTime();

  fireEvent.click(
    screen.getByRole('button', { name: 'Retry same correction' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Corrected questionnaire' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Correction saved.')).toBeInTheDocument();
  expectOneRegistrationTime();
  expect(patches).toBe(2);
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
  stubFetch(
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
  stubFetch(
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
it('fails closed instead of rendering a non-instant registration time in the loaded list', async () => {
  const nonInstant = { ...document, createdAt: '0' };
  stubFetch(
    vi.fn(async (url: string) =>
      Response.json(url.endsWith('/clients') ? [] : [nonInstant]),
    ),
  );
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be loaded',
  );
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: document.title }),
  ).not.toBeInTheDocument();
});
it('keeps the loaded list usable when an opened reference carries an impossible registration time', async () => {
  const impossibleInstant = {
    ...document,
    createdAt: '2026-02-30T08:00:00.000Z',
  };
  stubFetch(
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith('/clients')
          ? []
          : url.endsWith('/documents/document')
            ? impossibleInstant
            : [document],
      ),
    ),
  );
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  fireEvent.click(await screen.findByRole('button', { name: document.title }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be loaded',
  );
  expect(
    screen.getByRole('button', { name: document.title }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
});
it('reports a failure instead of presenting a registered reference with a non-instant registration time', async () => {
  const nonInstant = { ...document, createdAt: '2026' };
  stubFetch(
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/clients'))
        return Response.json([{ id: 'client', displayName: 'Client' }]);
      if (init?.method === 'POST')
        return Response.json(nonInstant, { status: 201 });
      return Response.json([]);
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
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be loaded or saved',
  );
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
});
function withProjectPermissions(
  projectPermissions: Array<'project.read' | 'project.create'>,
): ActorContext {
  if (!actor.activeCompany) throw new Error('Expected an active Company.');
  return {
    ...actor,
    activeCompany: { ...actor.activeCompany, projectPermissions },
  };
}
const projectReader = withProjectPermissions(['project.read']);
const linkedToProject = {
  ...document,
  projectAssociation: {
    state: 'linked',
    project: { id: 'project', title: 'ISO 9001 preparation' },
  },
};
const notLinkedToProject = {
  ...document,
  projectAssociation: { state: 'unlinked' },
};
/** The opened detail's Project row text, or null while no row is shown. */
function projectRow(): string | null {
  const term = within(screen.getByRole('article')).queryByText('Project', {
    selector: 'dt',
  });
  return term?.closest('dl')?.textContent ?? null;
}
it('shows a current Project reader the linked Project or an explicit unlinked state on each fresh open', async () => {
  const details = [linkedToProject, notLinkedToProject];
  stubFetch(
    vi.fn(async (url: string) => {
      if (url.endsWith('/clients')) return Response.json([]);
      if (url.endsWith('/documents/document'))
        return Response.json(details.shift());
      return Response.json([document]);
    }),
  );
  render(<DocumentWorkspace actor={projectReader} identity={identity} />);
  fireEvent.click(await screen.findByRole('button', { name: document.title }));
  await screen.findByRole('article');
  expect(projectRow()).toBe('ProjectISO 9001 preparation');

  // A removal in Project detail is shown by the next open, with no invalidation.
  fireEvent.click(screen.getByRole('button', { name: 'Back to references' }));
  fireEvent.click(screen.getByRole('button', { name: document.title }));
  await waitFor(() =>
    expect(projectRow()).toBe('ProjectNot linked to a Project'),
  );
  expect(details).toHaveLength(0);
});
it.each([
  ['the response omits the association', projectReader, document],
  ['the actor cannot read Projects', actor, linkedToProject],
  [
    'the actor may only create Projects',
    withProjectPermissions(['project.create']),
    notLinkedToProject,
  ],
])('shows no Project row when %s', async (_case, reader, opened) => {
  stubFetch(
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith('/clients')
          ? []
          : url.endsWith('/documents/document')
            ? opened
            : [document],
      ),
    ),
  );
  render(<DocumentWorkspace actor={reader} identity={identity} />);
  fireEvent.click(await screen.findByRole('button', { name: document.title }));
  expect(await screen.findByText(document.purpose)).toBeInTheDocument();
  expect(projectRow()).toBeNull();
  expect(screen.queryByText('Not linked to a Project')).not.toBeInTheDocument();
  expect(screen.queryByText('ISO 9001 preparation')).not.toBeInTheDocument();
});
it('hides a previously read Project as soon as the revalidated actor loses project.read', async () => {
  const fetcher = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith('/clients')
        ? []
        : url.endsWith('/documents/document')
          ? linkedToProject
          : [document],
    ),
  );
  stubFetch(fetcher);
  const view = render(
    <DocumentWorkspace actor={projectReader} identity={identity} />,
  );
  fireEvent.click(await screen.findByRole('button', { name: document.title }));
  await waitFor(() => expect(projectRow()).toBe('ProjectISO 9001 preparation'));
  const requests = fetcher.mock.calls.length;

  view.rerender(<DocumentWorkspace actor={actor} identity={identity} />);
  expect(projectRow()).toBeNull();
  expect(screen.queryByText('ISO 9001 preparation')).not.toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: document.title }),
  ).toBeInTheDocument();
  await settle();
  expect(fetcher).toHaveBeenCalledTimes(requests);
});
it.each([
  ['a missing Project', { state: 'linked' }],
  ['a Project without a title', { state: 'linked', project: { id: 'p' } }],
  [
    'a non-text Project title',
    { state: 'linked', project: { id: 'p', title: 7 } },
  ],
  ['an unknown state', { state: 'archived' }],
  [
    'an unlinked state naming a Project',
    { state: 'unlinked', project: { id: 'p', title: 'Hidden Project' } },
  ],
  ['a null association', null],
  ['a text association', 'unlinked'],
])(
  'rejects a detail response carrying %s as invalid',
  async (_case, projectAssociation) => {
    stubFetch(
      vi.fn(async (url: string) =>
        Response.json(
          url.endsWith('/clients')
            ? []
            : url.endsWith('/documents/document')
              ? { ...document, projectAssociation }
              : [document],
        ),
      ),
    );
    render(<DocumentWorkspace actor={projectReader} identity={identity} />);
    fireEvent.click(
      await screen.findByRole('button', { name: document.title }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not be loaded or saved',
    );
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: document.title }),
    ).toBeInTheDocument();
  },
);
it('reports a registration whose Project association is malformed instead of opening it', async () => {
  const posts: string[] = [];
  stubFetch(
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/clients'))
        return Response.json([{ id: 'client', displayName: 'Client' }]);
      if (init?.method === 'POST') {
        posts.push(new Headers(init.headers).get('idempotency-key') ?? '');
        return Response.json(
          { ...document, projectAssociation: { state: 'linked' } },
          { status: 201 },
        );
      }
      return Response.json([]);
    }),
  );
  render(<DocumentWorkspace actor={projectReader} identity={identity} />);
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
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be loaded or saved',
  );
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(posts).toHaveLength(1);
});
it('opens a confirmed registration with the association it was answered with', async () => {
  stubFetch(
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/clients'))
        return Response.json([{ id: 'client', displayName: 'Client' }]);
      if (init?.method === 'POST')
        return Response.json(notLinkedToProject, { status: 201 });
      return Response.json([]);
    }),
  );
  render(<DocumentWorkspace actor={projectReader} identity={identity} />);
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
    await screen.findByRole('heading', { name: document.title }),
  ).toBeInTheDocument();
  expect(projectRow()).toBe('ProjectNot linked to a Project');
});
it.each(['corrected', 'unchanged'] satisfies Array<'corrected' | 'unchanged'>)(
  'keeps the Project row through editing and a %s correction save',
  async (outcome) => {
    let saved = false;
    stubFetch(
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/clients')) return Response.json([]);
        if (init?.method === 'PATCH') {
          saved = true;
          return Response.json({
            documentId: document.id,
            revision: outcome === 'corrected' ? 2 : 1,
            outcome,
          });
        }
        const current =
          saved && outcome === 'corrected'
            ? {
                ...linkedToProject,
                title: 'Corrected questionnaire',
                workingRevision: 2,
              }
            : linkedToProject;
        return Response.json(
          url.endsWith('/documents/document') ? current : [current],
        );
      }),
    );
    render(<DocumentWorkspace actor={projectReader} identity={identity} />);
    fireEvent.click(
      await screen.findByRole('button', { name: document.title }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit reference' }),
    );
    expect(projectRow()).toBe('ProjectISO 9001 preparation');
    if (outcome === 'corrected')
      fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: 'Corrected questionnaire' },
      });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(
      await screen.findByText(
        outcome === 'corrected'
          ? 'Correction saved.'
          : 'No changes were needed.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name:
          outcome === 'corrected' ? 'Corrected questionnaire' : document.title,
      }),
    ).toBeInTheDocument();
    expect(projectRow()).toBe('ProjectISO 9001 preparation');
  },
);
it('never shows the Project of a detail read the member has already left', async () => {
  const [historical, homonym] = dossierDocuments;
  if (!historical || !homonym) throw new Error('Expected dossier Documents.');
  const heldHistoricalRead = deferredResponse();
  stubFetch(
    vi.fn(async (url: string) => {
      if (url.endsWith('/clients')) return Response.json([]);
      if (url.endsWith(`/documents/${historical.id}`))
        return heldHistoricalRead.promise;
      if (url.endsWith(`/documents/${homonym.id}`))
        return Response.json({
          ...homonym,
          projectAssociation: { state: 'unlinked' },
        });
      return Response.json(dossierDocuments);
    }),
  );
  const view = render(
    <DocumentWorkspace actor={projectReader} identity={identity} />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: historical.title }),
  );
  // The member opens another dossier's Documents before that read answers.
  view.rerender(
    <DocumentWorkspace
      actor={projectReader}
      identity={identity}
      clientFilter={{
        clientDossierId: 'other-client',
        displayName: 'Shared display name',
      }}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: homonym.title }));
  await waitFor(() =>
    expect(projectRow()).toBe('ProjectNot linked to a Project'),
  );

  // The retired read answers late with another Project.
  heldHistoricalRead.resolve(
    Response.json({
      ...historical,
      projectAssociation: {
        state: 'linked',
        project: { id: 'project', title: 'Late historical Project' },
      },
    }),
  );
  await settle();
  expect(screen.getByRole('heading', { name: homonym.title })).toBeVisible();
  expect(projectRow()).toBe('ProjectNot linked to a Project');
  expect(screen.queryByText('Late historical Project')).not.toBeInTheDocument();
});
describe('a requested Document', () => {
  const requested = {
    ...document,
    id: 'document-requested',
    title: 'Requested questionnaire',
    purpose: 'Prepare the requested interview',
  };
  const newer = {
    ...document,
    id: 'document-newer',
    title: 'Newer requested questionnaire',
    purpose: 'Prepare the newer interview',
  };
  const heldNotice =
    'The requested Document opens after this correction is saved or cancelled.';
  const protectedDraft = 'Protected correction draft';
  type Recorded = {
    url: string;
    init?: RequestInit;
    response: ReturnType<typeof deferredResponse>;
  };
  /** Holds every Document request with what it sent until the test answers. */
  function recordedRequests() {
    const requests: Recorded[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/clients'))
        return Response.json([
          { id: 'client', displayName: 'Synthetic Client' },
        ]);
      const response = deferredResponse();
      requests.push({ url, init, response });
      return response.promise;
    });
    const detailReads = (id: string) =>
      requests.filter(
        (request) =>
          request.url.endsWith(`/documents/${id}`) && !request.init?.method,
      );
    const commands = () => requests.filter((request) => request.init?.method);
    const lists = () =>
      requests.filter(
        (request) =>
          request.url.endsWith('/documents') && !request.init?.method,
      );
    return { fetcher, detailReads, commands, lists };
  }
  /** Answers Document requests at once, counting the detail reads by id. */
  function answeredRequests({
    correction = [],
  }: { correction?: Array<'uncertain' | 'corrected'> } = {}) {
    const reads = new Map<string, number>();
    const patches: Array<{ body: unknown; key: string | null }> = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/clients')) return Response.json([]);
      if (init?.method === 'PATCH') {
        patches.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return correction[patches.length - 1] === 'uncertain'
          ? new Response(null, { status: 500 })
          : Response.json({
              documentId: document.id,
              revision: 2,
              outcome: 'corrected',
            });
      }
      const opened = [document, requested, newer].find((candidate) =>
        url.endsWith(`/documents/${candidate.id}`),
      );
      if (opened) {
        reads.set(opened.id, (reads.get(opened.id) ?? 0) + 1);
        return Response.json(opened);
      }
      return Response.json([document, requested, newer]);
    });
    return { fetcher, reads, patches };
  }
  const workspace = ({
    requestedDocument,
    clientFilter,
    clientIdentityRevision,
    onOpenClientDossier,
    documentIdentity = identity,
  }: {
    requestedDocument?: { documentId: string; requestId: number };
    clientFilter?: { clientDossierId: string; displayName: string };
    clientIdentityRevision?: number;
    onOpenClientDossier?: (clientDossierId: string) => void;
    documentIdentity?: BrowserIdentity;
  } = {}) => (
    <DocumentWorkspace
      actor={actor}
      identity={documentIdentity}
      requestedDocument={requestedDocument}
      clientFilter={clientFilter}
      clientIdentityRevision={clientIdentityRevision}
      onOpenClientDossier={onOpenClientDossier}
    />
  );
  async function beginCorrection() {
    fireEvent.click(
      await screen.findByRole('button', { name: document.title }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit reference' }),
    );
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: protectedDraft },
    });
  }
  function fillRegistration() {
    fireEvent.change(screen.getByLabelText('Client'), {
      target: { value: 'client' },
    });
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: lateRegistration.title },
    });
    fireEvent.change(screen.getByLabelText('Purpose'), {
      target: { value: lateRegistration.purpose },
    });
    fireEvent.change(screen.getByLabelText('External HTTPS link'), {
      target: { value: lateRegistration.version.representation.url },
    });
  }
  function expectFilledRegistration() {
    expect(screen.getByLabelText('Client')).toHaveValue('client');
    expect(screen.getByLabelText('Title')).toHaveValue(lateRegistration.title);
    expect(screen.getByLabelText('Purpose')).toHaveValue(
      lateRegistration.purpose,
    );
    expect(screen.getByLabelText('External HTTPS link')).toHaveValue(
      lateRegistration.version.representation.url,
    );
  }
  /** Answers one recorded request. */
  const answer = (request: Recorded | undefined, response: Response) =>
    request?.response.resolve(response);
  const commandSent = (request: Recorded | undefined) => ({
    body: request?.init?.body,
    key: new Headers(request?.init?.headers).get('idempotency-key'),
  });

  it('waits for a pending registration and leaves its command and draft unchanged', async () => {
    const requests = recordedRequests();
    stubFetch(requests.fetcher);
    const view = render(workspace());
    await waitFor(() => expect(requests.lists()).toHaveLength(1));
    answer(requests.lists()[0], Response.json([document, requested]));
    await screen.findByRole('button', { name: requested.title });
    fillRegistration();
    fireEvent.click(
      screen.getByRole('button', { name: 'Register working reference' }),
    );
    await waitFor(() => expect(requests.commands()).toHaveLength(1));

    view.rerender(
      workspace({
        requestedDocument: { documentId: requested.id, requestId: 1 },
      }),
    );
    await settle();
    expect(requests.detailReads(requested.id)).toHaveLength(0);
    expect(requests.commands()[0]?.init?.signal?.aborted).toBe(false);
    expectFilledRegistration();

    answer(requests.commands()[0], new Response(null, { status: 500 }));
    await waitFor(() =>
      expect(requests.detailReads(requested.id)).toHaveLength(1),
    );
    answer(requests.detailReads(requested.id)[0], Response.json(requested));
    expect(
      await screen.findByRole('heading', { name: requested.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(requested.purpose)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to references' }));
    expectFilledRegistration();
    fireEvent.click(
      screen.getByRole('button', { name: 'Register working reference' }),
    );
    await waitFor(() => expect(requests.commands()).toHaveLength(2));
    expect(commandSent(requests.commands()[1])).toEqual(
      commandSent(requests.commands()[0]),
    );
  });

  it('opens after a confirmed registration settles', async () => {
    const requests = recordedRequests();
    stubFetch(requests.fetcher);
    const view = render(workspace());
    await waitFor(() => expect(requests.lists()).toHaveLength(1));
    answer(requests.lists()[0], Response.json([document, requested]));
    await screen.findByRole('button', { name: requested.title });
    fillRegistration();
    fireEvent.click(
      screen.getByRole('button', { name: 'Register working reference' }),
    );
    await waitFor(() => expect(requests.commands()).toHaveLength(1));
    view.rerender(
      workspace({
        requestedDocument: { documentId: requested.id, requestId: 1 },
      }),
    );
    await settle();
    expect(requests.detailReads(requested.id)).toHaveLength(0);

    answer(
      requests.commands()[0],
      Response.json(lateRegistration, { status: 201 }),
    );
    await waitFor(() =>
      expect(requests.detailReads(requested.id)).toHaveLength(1),
    );
    answer(requests.detailReads(requested.id)[0], Response.json(requested));
    expect(
      await screen.findByRole('heading', { name: requested.title }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to references' }));
    expect(
      screen.getByRole('button', { name: lateRegistration.title }),
    ).toBeInTheDocument();
    expect(requests.commands()).toHaveLength(1);
  });

  it.each([
    ['edited', 'Cancel'],
    ['edited', 'Save correction'],
    ['uncertain', 'Cancel'],
    ['uncertain', 'Retry same correction'],
  ] as const)(
    'holds the request behind an %s correction and opens it once after %s',
    async (correctionState, release) => {
      const requests = answeredRequests({
        correction:
          correctionState === 'uncertain'
            ? ['uncertain', 'corrected']
            : ['corrected'],
      });
      stubFetch(requests.fetcher);
      const view = render(workspace());
      await beginCorrection();
      if (correctionState === 'uncertain') {
        fireEvent.click(
          screen.getByRole('button', { name: 'Save correction' }),
        );
        expect(await screen.findByRole('alert')).toHaveTextContent(
          'result is uncertain',
        );
      }
      const patchesBefore = requests.patches.length;

      view.rerender(
        workspace({
          requestedDocument: { documentId: requested.id, requestId: 1 },
        }),
      );
      expect(await screen.findByText(heldNotice)).toHaveAttribute(
        'role',
        'status',
      );
      await settle();
      expect(screen.getByLabelText('Title')).toHaveValue(protectedDraft);
      expect(requests.reads.get(requested.id)).toBeUndefined();
      expect(requests.patches).toHaveLength(patchesBefore);

      fireEvent.click(screen.getByRole('button', { name: release }));
      expect(
        await screen.findByRole('heading', { name: requested.title }),
      ).toBeInTheDocument();
      expect(screen.getByText(requested.purpose)).toBeInTheDocument();
      expect(screen.queryByText(heldNotice)).not.toBeInTheDocument();
      await settle();
      expect(requests.reads.get(requested.id)).toBe(1);
      expect(requests.patches).toHaveLength(
        patchesBefore + (release === 'Cancel' ? 0 : 1),
      );
      // A retry sends the exact body and key the uncertain attempt sent.
      if (release === 'Retry same correction')
        expect(requests.patches[1]).toEqual(requests.patches[0]);
    },
  );

  it('holds the request while a correction command is pending, without aborting it', async () => {
    const requests = recordedRequests();
    stubFetch(requests.fetcher);
    const view = render(workspace());
    await waitFor(() => expect(requests.lists()).toHaveLength(1));
    answer(requests.lists()[0], Response.json([document, requested]));
    fireEvent.click(
      await screen.findByRole('button', { name: document.title }),
    );
    await waitFor(() =>
      expect(requests.detailReads(document.id)).toHaveLength(1),
    );
    answer(requests.detailReads(document.id)[0], Response.json(document));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit reference' }),
    );
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: protectedDraft },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    await waitFor(() => expect(requests.commands()).toHaveLength(1));

    view.rerender(
      workspace({
        requestedDocument: { documentId: requested.id, requestId: 1 },
      }),
    );
    expect(await screen.findByText(heldNotice)).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue(protectedDraft);
    expect(requests.commands()[0]?.init?.signal?.aborted).toBe(false);
    expect(requests.detailReads(requested.id)).toHaveLength(0);

    answer(
      requests.commands()[0],
      Response.json({
        documentId: document.id,
        revision: 2,
        outcome: 'corrected',
      }),
    );
    // The accepted correction reloads its Document and rows first.
    await waitFor(() =>
      expect(requests.detailReads(document.id)).toHaveLength(2),
    );
    const corrected = {
      ...document,
      title: protectedDraft,
      workingRevision: 2,
    };
    answer(requests.detailReads(document.id)[1], Response.json(corrected));
    answer(requests.lists()[1], Response.json([corrected, requested]));
    await waitFor(() =>
      expect(requests.detailReads(requested.id)).toHaveLength(1),
    );
    answer(requests.detailReads(requested.id)[0], Response.json(requested));
    expect(
      await screen.findByRole('heading', { name: requested.title }),
    ).toBeInTheDocument();
    expect(requests.commands()).toHaveLength(1);
  });

  it('opens only the newest of the requests held behind a correction', async () => {
    const requests = answeredRequests();
    stubFetch(requests.fetcher);
    const view = render(workspace());
    await beginCorrection();
    view.rerender(
      workspace({
        requestedDocument: { documentId: requested.id, requestId: 1 },
      }),
    );
    await screen.findByText(heldNotice);
    view.rerender(
      workspace({ requestedDocument: { documentId: newer.id, requestId: 2 } }),
    );
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      await screen.findByRole('heading', { name: newer.title }),
    ).toBeInTheDocument();
    await settle();
    expect(requests.reads.get(newer.id)).toBe(1);
    expect(requests.reads.has(requested.id)).toBe(false);
  });

  it('never renders a late reply to a superseded request and re-reads a repeated one', async () => {
    const requests = recordedRequests();
    stubFetch(requests.fetcher);
    const view = render(workspace());
    await waitFor(() => expect(requests.lists()).toHaveLength(1));
    answer(requests.lists()[0], Response.json([document, requested, newer]));
    await screen.findByRole('button', { name: requested.title });

    view.rerender(
      workspace({
        requestedDocument: { documentId: requested.id, requestId: 1 },
      }),
    );
    await waitFor(() =>
      expect(requests.detailReads(requested.id)).toHaveLength(1),
    );
    view.rerender(
      workspace({ requestedDocument: { documentId: newer.id, requestId: 2 } }),
    );
    await waitFor(() => expect(requests.detailReads(newer.id)).toHaveLength(1));
    answer(requests.detailReads(newer.id)[0], Response.json(newer));
    expect(
      await screen.findByRole('heading', { name: newer.title }),
    ).toBeInTheDocument();
    answer(requests.detailReads(requested.id)[0], Response.json(requested));
    await settle();
    expect(screen.getByRole('heading', { name: newer.title })).toBeVisible();
    expect(screen.queryByText(requested.purpose)).not.toBeInTheDocument();

    view.rerender(
      workspace({ requestedDocument: { documentId: newer.id, requestId: 3 } }),
    );
    await waitFor(() => expect(requests.detailReads(newer.id)).toHaveLength(2));
  });

  it.each([
    ['forbidden', 403, 'You do not have access to working Documents'],
    ['missing', 404, 'You do not have access to working Documents'],
    ['failing', 500, 'could not be loaded or saved'],
  ])(
    'shows the existing state for a %s Document',
    async (_case, status, message) => {
      stubFetch(
        vi.fn(async (url: string) =>
          url.endsWith('/clients')
            ? Response.json([])
            : url.endsWith(`/documents/${requested.id}`)
              ? new Response(null, { status })
              : Response.json([document, requested]),
        ),
      );
      const view = render(workspace());
      await screen.findByRole('button', { name: requested.title });
      view.rerender(
        workspace({
          requestedDocument: { documentId: requested.id, requestId: 1 },
        }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
      expect(screen.queryByText(requested.purpose)).not.toBeInTheDocument();
    },
  );

  it('rejects the session for an unauthorized Document read', async () => {
    const rejectSession = vi.fn(async () => undefined);
    stubFetch(
      vi.fn(async (url: string) =>
        url.endsWith('/clients')
          ? Response.json([])
          : url.endsWith(`/documents/${requested.id}`)
            ? new Response(null, { status: 401 })
            : Response.json([document, requested]),
      ),
    );
    const sessionIdentity = { ...identity, rejectSession };
    const view = render(workspace({ documentIdentity: sessionIdentity }));
    await screen.findByRole('button', { name: requested.title });
    view.rerender(
      workspace({
        documentIdentity: sessionIdentity,
        requestedDocument: { documentId: requested.id, requestId: 1 },
      }),
    );
    await waitFor(() => expect(rejectSession).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('keeps a superseded original Client reference readable but correction read-only', async () => {
    const readOnly = { ...requested, correction: 'read-only' };
    stubFetch(
      vi.fn(async (url: string) =>
        url.endsWith('/clients')
          ? Response.json([])
          : url.endsWith(`/documents/${requested.id}`)
            ? Response.json(readOnly)
            : Response.json([document, readOnly]),
      ),
    );
    const view = render(workspace());
    await screen.findByRole('button', { name: requested.title });
    view.rerender(
      workspace({
        requestedDocument: { documentId: requested.id, requestId: 1 },
      }),
    );
    expect(await screen.findByText(requested.purpose)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit reference' }),
    ).not.toBeInTheDocument();
  });

  it('never replays a request it was mounted with or one the shell retired', async () => {
    const requests = answeredRequests();
    stubFetch(requests.fetcher);
    const mounted = { documentId: requested.id, requestId: 4 };
    const view = render(workspace({ requestedDocument: mounted }));
    await beginCorrection();
    await settle();
    expect(requests.reads.has(requested.id)).toBe(false);

    view.rerender(
      workspace({ requestedDocument: { documentId: newer.id, requestId: 5 } }),
    );
    await screen.findByText(heldNotice);
    view.rerender(workspace());
    expect(screen.queryByText(heldNotice)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await settle();
    expect(
      screen.getByRole('heading', { name: document.title }),
    ).toBeInTheDocument();
    expect(requests.reads.has(newer.id)).toBe(false);
    expect(requests.reads.has(requested.id)).toBe(false);
  });

  it('lets a newer dossier restriction supersede a held request', async () => {
    const requests = answeredRequests();
    stubFetch(requests.fetcher);
    const view = render(workspace());
    await beginCorrection();
    const request = { documentId: requested.id, requestId: 1 };
    view.rerender(workspace({ requestedDocument: request }));
    await screen.findByText(heldNotice);
    view.rerender(
      workspace({
        requestedDocument: request,
        clientFilter: {
          clientDossierId: 'client',
          displayName: 'Synthetic Client',
        },
      }),
    );
    expect(screen.getByLabelText('Title')).toHaveValue(protectedDraft);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await settle();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: 'Filter working Documents' }),
    ).toHaveValue('Synthetic Client');
    expect(requests.reads.has(requested.id)).toBe(false);
  });

  it('keeps the search text and dossier restriction it opens under', async () => {
    const requests = answeredRequests();
    stubFetch(requests.fetcher);
    const view = render(workspace());
    const filter = await screen.findByRole('searchbox', {
      name: 'Filter working Documents',
    });
    fireEvent.change(filter, { target: { value: 'Initial' } });
    view.rerender(
      workspace({
        requestedDocument: { documentId: requested.id, requestId: 1 },
      }),
    );
    expect(
      await screen.findByRole('heading', { name: requested.title }),
    ).toBeInTheDocument();
    expect(filter).toHaveValue('Initial');
    fireEvent.click(screen.getByRole('button', { name: 'Back to references' }));
    expect(
      within(screen.getByRole('list'))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([document.title]);
  });

  it('reads the Document under the current Client identity after a union', async () => {
    const projections = currentProjectionFetcher();
    stubFetch(projections.fetcher);
    const openClientDossier = vi.fn();
    const view = render(
      workspace({
        clientIdentityRevision: 0,
        onOpenClientDossier: openClientDossier,
      }),
    );
    await screen.findByRole('button', { name: document.title });
    projections.moveTo(unitedProjection);
    view.rerender(
      workspace({
        clientIdentityRevision: 1,
        onOpenClientDossier: openClientDossier,
        requestedDocument: { documentId: document.id, requestId: 1 },
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Client dossier' }),
    );
    expect(openClientDossier).toHaveBeenCalledWith(
      unitedProjection.clientDossierId,
    );
  });
});
