import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { deterministicBrowserIdentity } from '../access-composition';
import { DocumentWorkspace, type RequestedDocument } from './DocumentWorkspace';

const actor: ActorContext = {
  internalUserId: 'user',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Registrar',
  email: 'member@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company',
    displayName: 'PRISMA-PRIM',
    clientPermissions: ['client.read'],
    documentPermissions: [
      'document.read',
      'document.reference.read',
      'document.correct',
      'document.version.manage',
      'document.content.read',
      'document.content.upload',
    ],
    documentContentReaderAssignmentId: 'reader',
    documentContentReaderPermissionSetVersion: 'v1',
    documentContentUploaderAssignmentId: 'uploader',
    documentContentUploaderPermissionSetVersion: 'v1',
  },
};
const identity = deterministicBrowserIdentity();
const createdAt = '2026-10-26T08:00:00.000Z';
const reference = {
  id: 'reference',
  kind: 'external-reference',
  verification: 'unverified',
  access: 'granted',
  url: 'https://example.test/reference',
};
const first = {
  id: 'document-a',
  companyId: 'company',
  clientId: 'client',
  clientDisplayName: 'Literal Client',
  title: 'Document A',
  purpose: 'Original purpose',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt,
  workingRevision: 2,
  correction: 'read-only',
  version: { id: 'version-a', status: 'official', representation: reference },
};
const second = {
  ...first,
  id: 'document-b',
  title: 'Document B',
  version: { ...first.version, id: 'version-b' },
};
function versions(document: typeof first) {
  return {
    workingRevision: 2,
    mutable: true,
    versions: [
      {
        id: document.version.id,
        number: 1,
        status: document.version.status,
        createdAt,
        createdBy: { displayName: 'Registrar' },
        designatedAt: createdAt,
        designatedBy: { displayName: 'Approver' },
        frozen: { title: document.title, purpose: document.purpose },
        pdfContent: { state: 'absent' },
        representations: [
          {
            ...reference,
            position: 1,
            form: 'other',
            primary: true,
            appendedAfterDesignation: false,
            addedAt: createdAt,
            addedBy: { displayName: 'Registrar' },
          },
        ],
      },
    ],
  };
}
type Call = {
  path: string;
  method: string;
  signal?: AbortSignal | null;
  body: BodyInit | null | undefined;
  key: string | null;
};
function server(options: { draft?: boolean } = {}) {
  const initial = options.draft
    ? {
        ...first,
        correction: 'allowed',
        version: { ...first.version, status: 'draft' },
      }
    : first;
  const held = new Set<string>();
  const calls: Call[] = [];
  const waiting = new Map<string, ((response: Response) => void)[]>();
  const replies = new Map<string, unknown>();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), 'http://example.test').pathname;
      const method = init?.method ?? 'GET';
      const route = `${method} ${path}`;
      calls.push({
        path,
        method,
        signal: init?.signal,
        body: init?.body,
        key: new Headers(init?.headers).get('idempotency-key'),
      });
      if (held.has(route))
        return new Promise<Response>((resolve) => {
          const list = waiting.get(route) ?? [];
          list.push(resolve);
          waiting.set(route, list);
        });
      if (replies.has(route)) return Response.json(replies.get(route));
      if (path === '/api/clients') return Response.json([]);
      if (path === '/api/documents') return Response.json([initial, second]);
      if (path === '/api/access/current-actor') return Response.json(actor);
      for (const document of [initial, second]) {
        if (path === `/api/documents/${document.id}`)
          return Response.json(document);
        if (path === `/api/documents/${document.id}/versions`)
          return Response.json(versions(document));
      }
      throw new Error(`Unexpected HTTP ${route}`);
    }),
  );
  return {
    calls,
    hold(route: string) {
      held.add(route);
    },
    reply(route: string, value: unknown) {
      replies.set(route, value);
    },
    async requested(route: string) {
      await waitFor(() =>
        expect(waiting.get(route)?.length).toBeGreaterThan(0),
      );
    },
    async release(route: string, value: unknown, status = 200) {
      const resolve = waiting.get(route)?.shift();
      if (!resolve) throw new Error(`No held HTTP ${route}`);
      await act(async () => resolve(Response.json(value, { status })));
    },
  };
}
function show() {
  let requestedDocument: RequestedDocument | undefined;
  let clientIdentityRevision = 0;
  const ui = () => (
    <DocumentWorkspace
      actor={actor}
      identity={identity}
      requestedDocument={requestedDocument}
      clientIdentityRevision={clientIdentityRevision}
    />
  );
  const view = render(ui());
  return {
    revalidateIdentity() {
      clientIdentityRevision += 1;
      view.rerender(ui());
    },
    request(sourceSignal: AbortSignal, requestId = 1) {
      requestedDocument = {
        documentId: second.id,
        requestId,
        focus: 'document',
        sourceSignal,
      };
      view.rerender(ui());
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
const secondRead = `GET /api/documents/${second.id}`;
const draftCommand = `POST /api/documents/${first.id}/versions`;

it.each(['Document', 'Company'])(
  'refuses a requested response with another %s identity',
  async (mismatch) => {
    const api = server();
    api.reply(
      secondRead,
      mismatch === 'Document' ? first : { ...second, companyId: 'foreign' },
    );
    const view = show();
    await screen.findByRole('button', { name: first.title });
    view.request(new AbortController().signal);
    await waitFor(() =>
      expect(
        api.calls.some((c) => `${c.method} ${c.path}` === secondRead),
      ).toBe(true),
    );
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('heading', { name: second.title }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: first.title }),
    ).not.toBeInTheDocument();
  },
);

it.each([200, 403])(
  'retires an unresolved inline opening before its abort-ignoring late%s',
  async (status) => {
    const api = server();
    api.hold(secondRead);
    const view = show();
    await screen.findByRole('button', { name: first.title });
    const source = new AbortController();
    view.request(source.signal);
    await api.requested(secondRead);
    await act(async () => source.abort());
    const read = api.calls.find((c) => `${c.method} ${c.path}` === secondRead);
    expect(read?.signal?.aborted).toBe(true);
    await api.release(secondRead, second, status);
    expect(
      screen.queryByRole('heading', { name: second.title }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: first.title })).toBeEnabled();
  },
);

it('keeps the exact pending and uncertain Version command when its queued opening source retires', async () => {
  const api = server();
  api.hold(draftCommand);
  const view = show();
  fireEvent.click(await screen.findByRole('button', { name: first.title }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Start new draft' }),
  );
  await api.requested(draftCommand);
  const source = new AbortController();
  view.request(source.signal);
  expect(screen.getByRole('heading', { name: first.title })).toBeVisible();
  expect(
    api.calls.filter((c) => `${c.method} ${c.path}` === secondRead),
  ).toHaveLength(0);
  await api.release(draftCommand, {}, 502);
  const retry = await screen.findByRole('button', {
    name: 'Retry the same Version change',
  });
  await act(async () => source.abort());
  fireEvent.click(retry);
  await waitFor(() =>
    expect(
      api.calls.filter((c) => `${c.method} ${c.path}` === draftCommand),
    ).toHaveLength(2),
  );
  const commands = api.calls.filter(
    (c) => `${c.method} ${c.path}` === draftCommand,
  );
  expect(commands[1]?.body).toBe(commands[0]?.body);
  expect(commands[1]?.key).toBe(commands[0]?.key);
  expect(commands[0]?.body).toBe(JSON.stringify({ expectedRevision: 2 }));
  await api.release(
    draftCommand,
    {
      documentId: first.id,
      workingRevision: 3,
      action: 'drafted',
      versionId: 'version-a-2',
      versionNumber: 2,
      sourceVersionNumber: 1,
    },
    201,
  );
  await screen.findByText('Version 2 was started as a draft.');
  expect(screen.getByRole('heading', { name: first.title })).toBeVisible();
  expect(
    api.calls.filter((c) => `${c.method} ${c.path}` === secondRead),
  ).toHaveLength(0);
});

it('keeps a ready exact detail independent of its source while the existing Versions read is still held', async () => {
  const api = server();
  const versionRead = `GET /api/documents/${second.id}/versions`;
  api.hold(versionRead);
  const view = show();
  await screen.findByRole('button', { name: first.title });
  const source = new AbortController();
  view.request(source.signal);
  const heading = await screen.findByRole('heading', { name: second.title });
  await waitFor(() => expect(heading).toHaveFocus());
  await api.requested(versionRead);
  await act(async () => source.abort());
  expect(heading).toBeVisible();
  expect(heading).toHaveFocus();
  expect(
    api.calls.find((c) => `${c.method} ${c.path}` === versionRead)?.signal
      ?.aborted,
  ).toBe(false);
  await api.release(versionRead, versions(second));
  expect(heading).toBeVisible();
});

it('rejects a foreign Company during selected-Document identity revalidation', async () => {
  const api = server();
  const view = show();
  fireEvent.click(await screen.findByRole('button', { name: first.title }));
  await screen.findByRole('heading', { name: first.title });
  api.reply(`GET /api/documents/${first.id}`, {
    ...first,
    companyId: 'foreign',
    clientDisplayName: 'Foreign confidential Client',
  });
  view.revalidateIdentity();
  await screen.findByRole('alert');
  expect(
    screen.queryByText('Foreign confidential Client'),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: first.title })).toBeVisible();
});

it('opens the exact queued target once the original Version command resolves', async () => {
  const api = server();
  api.hold(draftCommand);
  const view = show();
  fireEvent.click(await screen.findByRole('button', { name: first.title }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Start new draft' }),
  );
  await api.requested(draftCommand);
  view.request(new AbortController().signal);
  expect(screen.getByRole('heading', { name: first.title })).toBeVisible();
  await api.release(
    draftCommand,
    {
      documentId: first.id,
      workingRevision: 3,
      action: 'drafted',
      versionId: 'version-a-2',
      versionNumber: 2,
      sourceVersionNumber: 1,
    },
    201,
  );
  const heading = await screen.findByRole('heading', { name: second.title });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(
    api.calls.filter((c) => `${c.method} ${c.path}` === draftCommand),
  ).toHaveLength(1);
});

it('keeps the correction draft and exact submitted payload after its held opening is retired', async () => {
  const api = server({ draft: true });
  const view = show();
  fireEvent.click(await screen.findByRole('button', { name: first.title }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit reference' }),
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Deliberate corrected title' },
  });
  const source = new AbortController();
  view.request(source.signal);
  await screen.findByText(
    'The requested Document opens after this correction is saved or cancelled.',
  );
  await act(async () => source.abort());
  expect(screen.getByLabelText('Title')).toHaveValue(
    'Deliberate corrected title',
  );
  const correction = `PATCH /api/documents/${first.id}`;
  api.hold(correction);
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  await api.requested(correction);
  const command = api.calls.find((c) => `${c.method} ${c.path}` === correction);
  if (typeof command?.body !== 'string')
    throw new Error('Expected serialized correction');
  expect(JSON.parse(command.body)).toMatchObject({
    title: 'Deliberate corrected title',
    expectedRevision: 2,
  });
  const saved = {
    ...first,
    title: 'Deliberate corrected title',
    workingRevision: 3,
    correction: 'allowed',
    version: { ...first.version, status: 'draft' },
  };
  api.reply(`GET /api/documents/${first.id}`, saved);
  api.reply('GET /api/documents', [saved, second]);
  await api.release(correction, {
    documentId: first.id,
    revision: 3,
    outcome: 'corrected',
  });
  await screen.findByText('Correction saved.');
  expect(screen.getByRole('heading', { name: saved.title })).toBeVisible();
  expect(
    api.calls.filter((c) => `${c.method} ${c.path}` === secondRead),
  ).toHaveLength(0);
});

it('keeps exact pending/uncertain PDF bytes and key while a retired source stops its queued opening', async () => {
  const api = server({ draft: true });
  const uploadRoute = `POST /api/documents/${first.id}/versions/${first.version.id}/content`;
  api.hold(uploadRoute);
  const view = show();
  fireEvent.click(await screen.findByRole('button', { name: first.title }));
  const file = new File(
    ['%PDF-1.7\nSynthetic exact bytes\n%%EOF'],
    'synthetic.pdf',
    { type: 'application/pdf' },
  );
  fireEvent.change(await screen.findByLabelText('Choose the PDF file'), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Preserve PDF' }));
  await api.requested(uploadRoute);
  const source = new AbortController();
  view.request(source.signal);
  expect(screen.getByRole('heading', { name: first.title })).toBeVisible();
  expect(
    api.calls.filter((c) => `${c.method} ${c.path}` === secondRead),
  ).toHaveLength(0);
  await api.release(uploadRoute, {}, 502);
  const retry = await screen.findByRole('button', {
    name: 'Retry the same PDF',
  });
  await act(async () => source.abort());
  fireEvent.click(retry);
  await waitFor(() =>
    expect(
      api.calls.filter((c) => `${c.method} ${c.path}` === uploadRoute),
    ).toHaveLength(2),
  );
  const uploads = api.calls.filter(
    (c) => `${c.method} ${c.path}` === uploadRoute,
  );
  expect(uploads[0]?.body).toBe(file);
  expect(uploads[1]?.body).toBe(file);
  expect(uploads[1]?.key).toBe(uploads[0]?.key);
  await api.release(
    uploadRoute,
    {
      documentId: first.id,
      versionId: first.version.id,
      versionNumber: 1,
      workingRevision: 3,
      action: 'representation_added',
      representationId: 'stored-pdf',
      appendedAfterDesignation: false,
    },
    201,
  );
  await screen.findByLabelText('Choose the PDF file');
  expect(screen.getByRole('heading', { name: first.title })).toBeVisible();
  expect(
    api.calls.filter((c) => `${c.method} ${c.path}` === secondRead),
  ).toHaveLength(0);
});
