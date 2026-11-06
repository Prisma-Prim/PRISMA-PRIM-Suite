import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { completeActor } from '../access/current-actor.test-fixture';
import { deterministicBrowserIdentity } from '../access-composition';
import { DocumentWorkspace } from './DocumentWorkspace';

type Company = NonNullable<ActorContext['activeCompany']>;
const AT = '2026-11-06T12:00:00.000Z';
const bytes = new TextEncoder().encode('%PDF-1.4\nFictional Addendum\n%%EOF\n');
const company: Company = {
  ...completeActor.activeCompany,
  id: 'company',
  displayName: 'Fictional Company',
  clientPermissions: ['client.read'],
  clientPermissionAssignmentId: 'client-reader',
  clientPermissionSetVersion: 'v1',
  documentPermissions: [
    'document.read',
    'document.register',
    'document.reference.read',
    'document.correct',
    'document.version.manage',
    'document.version.designate_official',
    'document.content.read',
    'document.content.upload',
    'document.received_addendum.access',
  ],
  documentPermissionAssignmentId: 'registrar',
  documentPermissionSetVersion: 'v3',
  documentApproverAssignmentId: 'approver',
  documentApproverPermissionSetVersion: 'v1',
  documentContentReaderAssignmentId: 'reader',
  documentContentReaderPermissionSetVersion: 'v1',
  documentContentUploaderAssignmentId: 'uploader',
  documentContentUploaderPermissionSetVersion: 'v1',
  receivedAddendumAccessAssignmentId: '10000000-0000-4000-8000-000000000005',
  receivedAddendumAccessPermissionSetVersion: 'v1',
  receivedAddendumClientReadCapture:
    'received-addendum-client-read.v1.' + 'a'.repeat(64),
};
function actor(patch: Partial<Company> = {}): ActorContext {
  return {
    ...completeActor,
    internalUserId: 'user',
    workspaceId: 'workspace',
    workspaceMembershipId: 'member',
    displayName: 'Fictional member',
    email: 'fictional@example.test',
    workspacePermissions: ['client.manage'],
    activeCompany: { ...company, ...patch },
  };
}
function deferred<T>() {
  let finish: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    finish = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!finish) throw new Error('Missing held resolver');
      finish(value);
    },
  };
}
function serve(
  options: {
    stored?: boolean;
    upload?: (attempt: number) => Response | Promise<Response>;
    actorReply?: Promise<Response>;
    failConfirmedRead?: boolean;
  } = {},
) {
  const writes: Array<{
    body: BodyInit | null | undefined;
    key: string | null;
    path: string;
  }> = [];
  const state = {
    stored: options.stored ?? false,
    revision: options.stored ? 2 : 1,
    failRead: false,
    actorReads: 0,
  };
  const preserved = {
    representationId: 'pdf',
    revision: 2,
    fileName: 'kept.pdf',
    mediaType: 'application/pdf',
    size: bytes.length,
    sha256: '0'.repeat(64),
    storedAt: AT,
    storedBy: { displayName: 'Fictional uploader' },
    scan: { outcome: 'clean', engine: 'Fixture', scannedAt: AT },
  };
  const document = () => ({
    id: 'document',
    companyId: 'company',
    clientId: 'client',
    clientDisplayName: 'Fictional Client',
    title: 'Fictional Addendum',
    purpose: 'Preserve the source',
    type: 'received-addendum',
    confidentiality: 'company-confidential',
    workingRevision: state.revision,
    correction: 'allowed',
    version: { id: 'version', status: 'draft', representation: null },
    receivedAddendumRelation: { access: 'denied' },
  });
  const receipt = () =>
    Response.json(
      {
        documentId: 'document',
        versionId: 'version',
        versionNumber: 1,
        workingRevision: state.revision,
        action: 'representation_added',
        representationId: 'pdf',
        appendedAfterDesignation: false,
      },
      { status: 201 },
    );
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      if (init?.method === 'POST' && path.endsWith('/content')) {
        writes.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
          path: String(input),
        });
        if (options.upload) return options.upload(writes.length);
        if (writes.length === 1) return new Response(null, { status: 503 });
        state.stored = true;
        state.revision = 2;
        state.failRead = options.failConfirmedRead ?? false;
        return receipt();
      }
      if (path === '/api/access/current-actor') {
        state.actorReads += 1;
        return options.actorReply ?? Response.json(actor());
      }
      if (path.endsWith('/content/pdf'))
        return new Response(bytes, {
          headers: {
            'content-type': 'application/pdf',
            'content-length': String(bytes.length),
          },
        });
      if (path.endsWith('/content/history'))
        return Response.json({
          uploads: [{ ...preserved, current: true }],
          nextBeforeRevision: null,
        });
      if (path === '/api/documents/document/versions')
        return state.failRead
          ? new Response(null, { status: 503 })
          : Response.json({
              workingRevision: state.revision,
              mutable: true,
              versions: [
                {
                  id: 'version',
                  number: 1,
                  status: 'draft',
                  representations: [],
                  pdfContent: state.stored
                    ? { ...preserved, state: 'stored', access: 'granted' }
                    : { state: 'absent' },
                },
              ],
            });
      if (path === '/api/documents/document') return Response.json(document());
      if (path === '/api/documents') return Response.json([document()]);
      if (path === '/api/clients') return Response.json([]);
      throw new Error(`Unexpected public request ${path}`);
    },
  );
  return { writes, state, receipt };
}
async function open() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Fictional Addendum' }),
  );
  await screen.findByRole('heading', { name: 'Version 1' });
}
async function chooseFile() {
  const file = new File([bytes], 'kept.pdf', { type: 'application/pdf' });
  fireEvent.change(await screen.findByLabelText('Choose the PDF file'), {
    target: { files: [file] },
  });
  expect(screen.getByRole('button', { name: 'Preserve PDF' })).toBeEnabled();
  return file;
}
async function uncertain() {
  await open();
  const file = await chooseFile();
  fireEvent.click(screen.getByRole('button', { name: 'Preserve PDF' }));
  await screen.findByRole('button', { name: 'Retry the same PDF' });
  return file;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it.each([
  ['Uploader', { documentContentUploaderAssignmentId: 'replacement-uploader' }],
  ['Reader', { documentContentReaderAssignmentId: 'replacement-reader' }],
  [
    'Client',
    {
      receivedAddendumClientReadCapture:
        'received-addendum-client-read.v1.' + 'b'.repeat(64),
    },
  ],
] satisfies Array<[string, Partial<Company>]>)(
  'permanently retires an uncertain upload after consumed %s replacement and A→B→A',
  async (_name, replacement) => {
    const fixture = serve(),
      identity = deterministicBrowserIdentity();
    const view = render(
      <DocumentWorkspace actor={actor()} identity={identity} />,
    );
    await uncertain();
    view.rerender(<DocumentWorkspace actor={actor()} identity={identity} />);
    expect(
      screen.getByRole('button', { name: 'Retry the same PDF' }),
    ).toBeEnabled();
    view.rerender(
      <DocumentWorkspace actor={actor(replacement)} identity={identity} />,
    );
    expect(
      screen.queryByRole('button', { name: 'Retry the same PDF' }),
    ).not.toBeInTheDocument();
    view.rerender(<DocumentWorkspace actor={actor()} identity={identity} />);
    if (!screen.queryByRole('heading', { name: 'Fictional Addendum' }))
      await open();
    await screen.findByLabelText('Choose the PDF file');
    expect(
      screen.queryByRole('button', { name: 'Retry the same PDF' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preserve PDF' })).toBeDisabled();
    expect(fixture.writes).toHaveLength(1);
  },
);

it.each([false, true])(
  'fences an upload held before its token when consumed authority replacement=%s',
  async (relevant) => {
    const fixture = serve(),
      token = deferred<string>();
    let hold = false,
      held = false;
    const identity = {
      ...deterministicBrowserIdentity(),
      getToken: async () => {
        if (hold) {
          hold = false;
          held = true;
          return token.promise;
        }
        return 'synthetic-token';
      },
    };
    const view = render(
      <DocumentWorkspace actor={actor()} identity={identity} />,
    );
    await open();
    const file = await chooseFile();
    hold = true;
    fireEvent.click(screen.getByRole('button', { name: 'Preserve PDF' }));
    await waitFor(() => expect(held).toBe(true));
    expect(fixture.writes).toHaveLength(0);
    view.rerender(
      <DocumentWorkspace
        actor={actor(
          relevant
            ? { documentContentUploaderAssignmentId: 'replacement' }
            : { documentApproverAssignmentId: 'replacement' },
        )}
        identity={identity}
      />,
    );
    await act(async () => {
      token.resolve('synthetic-late-token');
      await token.promise;
    });
    if (relevant) {
      expect(fixture.writes).toHaveLength(0);
      expect(
        screen.queryByRole('button', { name: 'Retry the same PDF' }),
      ).not.toBeInTheDocument();
    } else {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Retry the same PDF' }),
      );
      await screen.findByText('The PDF was preserved.');
      expect(fixture.writes).toHaveLength(2);
      expect(fixture.writes[0]?.body).toBe(file);
      expect(fixture.writes[1]).toEqual(fixture.writes[0]);
    }
  },
);

it('keeps confirmation and offers only a read retry after a confirmed upload refresh fails', async () => {
  const fixture = serve({ failConfirmedRead: true }),
    identity = deterministicBrowserIdentity();
  render(<DocumentWorkspace actor={actor()} identity={identity} />);
  await uncertain();
  fireEvent.click(screen.getByRole('button', { name: 'Retry the same PDF' }));
  await screen.findByText('The PDF was preserved.');
  expect(
    screen.queryByRole('button', { name: 'Retry the same PDF' }),
  ).not.toBeInTheDocument();
  const retry = await screen.findByRole('button', {
    name: 'Retry loading Versions',
  });
  expect(fixture.writes).toHaveLength(2);
  fixture.state.failRead = false;
  fireEvent.click(retry);
  await screen.findByText('kept.pdf', { exact: true });
  expect(fixture.writes).toHaveLength(2);
});

it('does not install a held full Actor recovery after an unrelated Approver update', async () => {
  const reply = deferred<Response>(),
    fixture = serve({
      upload: () => new Response(null, { status: 403 }),
      actorReply: reply.promise,
    });
  const identity = deterministicBrowserIdentity(),
    onActorRevalidated = vi.fn();
  const view = render(
    <DocumentWorkspace
      actor={actor()}
      identity={identity}
      onActorRevalidated={onActorRevalidated}
    />,
  );
  await open();
  await chooseFile();
  fireEvent.click(screen.getByRole('button', { name: 'Preserve PDF' }));
  await waitFor(() => expect(fixture.writes).toHaveLength(1));
  // Let the real rejection handler reach its held Current Actor HTTP boundary.
  await waitFor(() => expect(fixture.state.actorReads).toBe(1));
  view.rerender(
    <DocumentWorkspace
      actor={actor({ documentApproverAssignmentId: 'replacement' })}
      identity={identity}
      onActorRevalidated={onActorRevalidated}
    />,
  );
  await act(async () => {
    reply.resolve(Response.json(actor()));
    await reply.promise;
  });
  expect(onActorRevalidated).not.toHaveBeenCalled();
});

it.each([false, true])(
  'keeps or retires held PDF hash/Blob work only for its Reader authority, relevant=%s',
  async (relevant) => {
    serve({ stored: true });
    const held = deferred<ArrayBuffer>(),
      digest = vi.fn(() => held.promise);
    const originalCrypto = crypto;
    vi.stubGlobal('crypto', {
      randomUUID: originalCrypto.randomUUID.bind(originalCrypto),
      getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
      subtle: { digest },
    });
    const originalURL = URL;
    const createObjectURL = vi.fn(() => 'blob:fictional'),
      revokeObjectURL = vi.fn();
    class BrowserURL extends originalURL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    }
    vi.stubGlobal('URL', BrowserURL);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const identity = deterministicBrowserIdentity(),
      view = render(<DocumentWorkspace actor={actor()} identity={identity} />);
    await open();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Download Version 1 PDF' }),
    );
    await waitFor(() => expect(digest).toHaveBeenCalledTimes(1));
    view.rerender(
      <DocumentWorkspace
        actor={actor(
          relevant
            ? { documentContentReaderAssignmentId: 'replacement' }
            : { documentContentUploaderAssignmentId: 'replacement' },
        )}
        identity={identity}
      />,
    );
    await act(async () => {
      held.resolve(new Uint8Array(32).buffer);
      await held.promise;
    });
    if (relevant) {
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(click).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    }
  },
);

it('preserves protected PDF history across an unrelated Uploader replacement', async () => {
  serve({ stored: true });
  const identity = deterministicBrowserIdentity();
  const view = render(
    <DocumentWorkspace actor={actor()} identity={identity} />,
  );
  await open();
  fireEvent.click(await screen.findByRole('button', { name: 'PDF history' }));
  await screen.findByRole('list', { name: 'PDF history' });
  view.rerender(
    <DocumentWorkspace
      actor={actor({ documentContentUploaderAssignmentId: 'replacement' })}
      identity={identity}
    />,
  );
  expect(screen.getByRole('list', { name: 'PDF history' })).toBeInTheDocument();
});

it('keeps Version designation disabled while an unrelated Approver update preserves uncertain upload work', async () => {
  const fixture = serve({ stored: true });
  const identity = deterministicBrowserIdentity();
  const view = render(
    <DocumentWorkspace actor={actor()} identity={identity} />,
  );
  await uncertain();
  expect(
    screen.getByRole('button', { name: 'Designate as official' }),
  ).toBeDisabled();
  view.rerender(
    <DocumentWorkspace
      actor={actor({ documentApproverAssignmentId: 'replacement' })}
      identity={identity}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Designate as official' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry the same PDF' }));
  await screen.findByText('The PDF was preserved.');
  expect(fixture.writes).toHaveLength(2);
  expect(fixture.writes[1]).toEqual(fixture.writes[0]);
  expect(
    screen.getByRole('button', { name: 'Designate as official' }),
  ).toBeEnabled();
});

it('discards an upload HTTP receipt after Uploader replacement and return without installing confirmation', async () => {
  const held = deferred<Response>();
  const fixture = serve({ upload: () => held.promise });
  const identity = deterministicBrowserIdentity(),
    onActivityRecorded = vi.fn();
  const workspace = (current: ActorContext) => (
    <DocumentWorkspace
      actor={current}
      identity={identity}
      onActivityRecorded={onActivityRecorded}
    />
  );
  const view = render(workspace(actor()));
  await open();
  await chooseFile();
  fireEvent.click(screen.getByRole('button', { name: 'Preserve PDF' }));
  await waitFor(() => expect(fixture.writes).toHaveLength(1));
  for (const current of [
    actor({ documentContentUploaderAssignmentId: 'replacement' }),
    actor(),
  ]) {
    view.rerender(workspace(current));
    expect(screen.getByLabelText('Choose the PDF file')).toHaveValue('');
  }
  await act(async () => {
    held.resolve(fixture.receipt());
    await held.promise;
  });
  expect(screen.queryByText('The PDF was preserved.')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Retry the same PDF' }),
  ).not.toBeInTheDocument();
  expect(onActivityRecorded).not.toHaveBeenCalled();
  expect(fixture.writes).toHaveLength(1);
});

it.each([false, true])(
  'terminates a held upload401 locally when unrelated Actor replacement=%s',
  async (changed) => {
    const held = deferred<Response>();
    const fixture = serve({ upload: () => held.promise });
    const rejectSession = vi.fn(),
      protection = vi.fn();
    const identity = { ...deterministicBrowserIdentity(), rejectSession };
    const workspace = (current: ActorContext) => (
      <DocumentWorkspace
        actor={current}
        identity={identity}
        onProtectedWorkChange={protection}
      />
    );
    const view = render(workspace(actor()));
    await open();
    await chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Preserve PDF' }));
    await waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(protection).toHaveBeenLastCalledWith(true);
    view.rerender(
      workspace(
        actor(changed ? { documentApproverAssignmentId: 'replacement' } : {}),
      ),
    );
    await act(async () => {
      held.resolve(new Response(null, { status: 401 }));
      await held.promise;
    });
    await screen.findByText(
      'You no longer have permission to preserve this PDF.',
    );
    expect(protection).toHaveBeenLastCalledWith(false);
    expect(rejectSession).toHaveBeenCalledTimes(changed ? 0 : 1);
    expect(fixture.writes).toHaveLength(1);
  },
);

it.each(['download', 'history', 'versions'] satisfies Array<
  'download' | 'history' | 'versions'
>)(
  'terminates held %s401 locally after unrelated Approver replacement',
  async (operation) => {
    serve({ stored: true });
    const nativeFetch = fetch,
      held = deferred<Response>();
    let reached = false;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      if (
        (operation === 'download' && path.endsWith('/content/pdf')) ||
        (operation === 'history' && path.endsWith('/content/history')) ||
        (operation === 'versions' && path.endsWith('/versions'))
      ) {
        reached = true;
        return held.promise;
      }
      return nativeFetch(input, init);
    });
    const rejectSession = vi.fn(),
      identity = { ...deterministicBrowserIdentity(), rejectSession };
    const view = render(
      <DocumentWorkspace actor={actor()} identity={identity} />,
    );
    if (operation === 'versions')
      fireEvent.click(
        await screen.findByRole('button', { name: 'Fictional Addendum' }),
      );
    else {
      await open();
      fireEvent.click(
        screen.getByRole('button', {
          name:
            operation === 'download' ? 'Download Version 1 PDF' : 'PDF history',
        }),
      );
    }
    await waitFor(() => expect(reached).toBe(true));
    view.rerender(
      <DocumentWorkspace
        actor={actor({ documentApproverAssignmentId: 'replacement' })}
        identity={identity}
      />,
    );
    await act(async () => {
      held.resolve(new Response(null, { status: 401 }));
      await held.promise;
    });
    const error =
      operation === 'download'
        ? 'The PDF could not be downloaded. You can retry.'
        : operation === 'history'
          ? 'The PDF history could not be loaded.'
          : 'The Versions could not be loaded. The Document remains available.';
    await screen.findByText(error);
    for (const retry of screen.getAllByRole('button', {
      name:
        operation === 'download'
          ? 'Download Version 1 PDF'
          : operation === 'history'
            ? 'PDF history'
            : 'Retry loading Versions',
    }))
      expect(retry).toBeEnabled();
    expect(rejectSession).not.toHaveBeenCalled();
  },
);
