import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { deterministicBrowserIdentity } from '../access-composition';
import { completeActor } from '../access/current-actor.test-fixture';
import { DocumentWorkspace } from './DocumentWorkspace';

type Company = NonNullable<ActorContext['activeCompany']>;
type Operation = 'designation' | 'successor';
const DOCUMENT = '20000000-0000-4000-8000-000000000001';
const FIRST = '20000000-0000-4000-8000-000000000002';
const SECOND = '20000000-0000-4000-8000-000000000003';
const TITLE = 'Fictional received Addendum — not a legal document';
const PURPOSE = 'Preserve the declared source without changing the parent';
const AT = '2026-11-01T10:00:00.000Z';
const NEXT_AT = '2026-11-01T11:00:00.000Z';
const company = {
  ...completeActor.activeCompany,
  id: '10000000-0000-4000-8000-000000000001',
  displayName: 'Fictional Company',
  clientPermissions: ['client.read'],
  clientPermissionAssignmentId: '10000000-0000-4000-8000-000000000002',
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
  documentPermissionAssignmentId: '10000000-0000-4000-8000-000000000003',
  documentPermissionSetVersion: 'v3',
  documentApproverAssignmentId: '10000000-0000-4000-8000-000000000004',
  documentApproverPermissionSetVersion: 'v1',
  documentContentReaderAssignmentId: '10000000-0000-4000-8000-000000000005',
  documentContentReaderPermissionSetVersion: 'v1',
  documentContentUploaderAssignmentId: '10000000-0000-4000-8000-000000000006',
  documentContentUploaderPermissionSetVersion: 'v1',
  receivedAddendumAccessAssignmentId: '10000000-0000-4000-8000-000000000007',
  receivedAddendumAccessPermissionSetVersion: 'v1',
  receivedAddendumClientReadCapture:
    'received-addendum-client-read.v1.' + 'a'.repeat(64),
} satisfies Company;

function actorWith(activeCompany: Company): ActorContext {
  return {
    ...completeActor,
    internalUserId: '10000000-0000-4000-8000-000000000008',
    workspaceMembershipId: '10000000-0000-4000-8000-000000000009',
    workspaceId: '10000000-0000-4000-8000-000000000010',
    workspaceName: 'Fictional Workspace',
    displayName: 'Fictional Document Member',
    email: 'fictional-member@example.test',
    workspacePermissions: [],
    activeCompany,
  };
}

function withoutContentReader(current: Company): Company {
  return {
    ...current,
    documentPermissions: current.documentPermissions?.filter(
      (permission) => permission !== 'document.content.read',
    ),
    documentContentReaderAssignmentId: undefined,
    documentContentReaderPermissionSetVersion: undefined,
  };
}

function deferred<T>() {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!settle) throw new Error('Expected the deferred resolver.');
      settle(value);
    },
  };
}

interface RecordedCommand {
  path: string;
  body: BodyInit | null | undefined;
  key: string | null;
}

/** Only the HTTP boundary is replaced; production Actor, UI and decoders run. */
function serve(operation: Operation, heldRetry?: Promise<Response>) {
  const writes: RecordedCommand[] = [];
  const state = { confirmed: false, contentReadable: true };
  const beforeRevision = operation === 'designation' ? 2 : 3;
  const pdf = () =>
    state.contentReadable
      ? {
          state: 'stored',
          access: 'granted',
          representationId: '20000000-0000-4000-8000-000000000004',
          revision: 2,
          fileName: 'fictional-received-addendum.pdf',
          mediaType: 'application/pdf',
          size: 36,
          sha256: 'b'.repeat(64),
          storedAt: AT,
          storedBy: { displayName: 'Fictional Uploader' },
          scan: { outcome: 'clean', engine: 'ClamAV fixture', scannedAt: AT },
        }
      : { state: 'stored', access: 'denied' };
  // Native Addendum Version 1 delegates creation attribution to registration.
  const official = () => ({
    id: FIRST,
    number: 1,
    status: 'official',
    representations: [],
    pdfContent: pdf(),
    designatedAt: NEXT_AT,
    designatedBy: { displayName: 'Fictional Approver' },
    frozen: { title: TITLE, purpose: PURPOSE },
  });
  function detail() {
    const draft = operation === 'designation' && !state.confirmed;
    const successor = operation === 'successor' && state.confirmed;
    return {
      id: DOCUMENT,
      companyId: company.id,
      clientId: '10000000-0000-4000-8000-000000000011',
      clientDisplayName: 'Fictional original Client',
      title: TITLE,
      purpose: PURPOSE,
      type: 'received-addendum',
      confidentiality: 'company-confidential',
      workingRevision: beforeRevision + Number(state.confirmed),
      correction: draft || successor ? 'allowed' : 'read-only',
      version: {
        id: successor ? SECOND : FIRST,
        status: draft || successor ? 'draft' : 'official',
        representation: null,
      },
      receivedAddendumRelation: { access: 'denied' },
    };
  }
  function versions() {
    const first =
      operation === 'designation' && !state.confirmed
        ? {
            id: FIRST,
            number: 1,
            status: 'draft',
            representations: [],
            pdfContent: pdf(),
          }
        : official();
    return {
      workingRevision: beforeRevision + Number(state.confirmed),
      mutable: true,
      versions:
        operation === 'successor' && state.confirmed
          ? [
              {
                id: SECOND,
                number: 2,
                status: 'draft',
                createdAt: NEXT_AT,
                createdBy: { displayName: 'Fictional Registrar' },
                representations: [],
                pdfContent: { state: 'absent' },
              },
              first,
            ]
          : [first],
    };
  }
  function receipt() {
    return Response.json(
      {
        documentId: DOCUMENT,
        workingRevision: beforeRevision + 1,
        ...(operation === 'designation'
          ? {
              action: 'designated_official',
              versionId: FIRST,
              versionNumber: 1,
              supersededVersionNumber: null,
            }
          : {
              action: 'drafted',
              versionId: SECOND,
              versionNumber: 2,
              sourceVersionNumber: 1,
            }),
      },
      { status: operation === 'designation' ? 200 : 201 },
    );
  }
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      if (init?.method === 'POST') {
        writes.push({
          path,
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        if (writes.length === 1) return new Response(null, { status: 503 });
        if (heldRetry) return heldRetry;
        state.confirmed = true;
        return receipt();
      }
      if (path === '/api/clients') return Response.json([]);
      if (path === '/api/documents') return Response.json([detail()]);
      if (path === `/api/documents/${DOCUMENT}`) return Response.json(detail());
      if (path === `/api/documents/${DOCUMENT}/versions`)
        return Response.json(versions());
      throw new Error(`Unexpected request: ${path}`);
    },
  );
  return { writes, state, receipt, beforeRevision };
}

async function openDocument() {
  if (!screen.queryByRole('heading', { name: TITLE }))
    fireEvent.click(await screen.findByRole('button', { name: TITLE }));
  await screen.findByRole('heading', { name: TITLE });
  await screen.findByRole('heading', { name: 'Version 1' });
}

async function beginUncertain(operation: Operation) {
  await openDocument();
  fireEvent.click(
    await screen.findByRole('button', {
      name:
        operation === 'designation'
          ? 'Designate as official'
          : 'Start new draft',
    }),
  );
  if (operation === 'designation')
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm official designation' }),
    );
  await screen.findByRole('button', { name: 'Retry the same Version change' });
}

function expectSameEnvelope(
  writes: RecordedCommand[],
  operation: Operation,
  revision: number,
) {
  expect(writes).toHaveLength(2);
  const [first, retry] = writes;
  if (!first || !retry)
    throw new Error('Expected both native Version attempts.');
  expect(first.path).toBe(
    operation === 'designation'
      ? `/api/documents/${DOCUMENT}/versions/${FIRST}/official-designation`
      : `/api/documents/${DOCUMENT}/versions`,
  );
  expect(first.body).toBe(JSON.stringify({ expectedRevision: revision }));
  expect(first.key).toMatch(/^[0-9a-f-]{36}$/iu);
  expect(retry).toEqual(first);
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it.each(['designation', 'successor'] satisfies Operation[])(
  'keeps an uncertain Addendum %s across unrelated native captures without requiring Content Reader',
  async (operation) => {
    const fixture = serve(operation);
    const identity = deterministicBrowserIdentity();
    const view = render(
      <DocumentWorkspace actor={actorWith(company)} identity={identity} />,
    );
    await beginUncertain(operation);
    // A fresh Actor object with unchanged captures must preserve the owner first.
    view.rerender(
      <DocumentWorkspace
        actor={actorWith({ ...company })}
        identity={identity}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Retry the same Version change' }),
    ).toBeEnabled();
    expect(fixture.writes).toHaveLength(1);

    const uploaderChanged: Company = {
      ...company,
      documentContentUploaderAssignmentId:
        '10000000-0000-4000-8000-000000000012',
    };
    const readerChanged: Company = {
      ...uploaderChanged,
      documentContentReaderAssignmentId: '10000000-0000-4000-8000-000000000013',
    };
    const unrelated =
      operation === 'successor'
        ? [
            {
              ...company,
              documentApproverAssignmentId:
                '10000000-0000-4000-8000-000000000014',
            } satisfies Company,
          ]
        : [];
    for (const next of [
      ...unrelated,
      uploaderChanged,
      readerChanged,
      withoutContentReader(readerChanged),
    ]) {
      fixture.state.contentReadable =
        next.documentPermissions?.includes('document.content.read') === true;
      view.rerender(
        <DocumentWorkspace actor={actorWith(next)} identity={identity} />,
      );
      expect(
        screen.getByRole('button', { name: 'Retry the same Version change' }),
      ).toBeEnabled();
      expect(fixture.writes).toHaveLength(1);
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry the same Version change' }),
    );
    await screen.findByText(
      operation === 'designation'
        ? 'Version 1 is now official.'
        : 'Version 2 was started as a draft.',
    );
    expectSameEnvelope(fixture.writes, operation, fixture.beforeRevision);
    if (operation === 'successor') {
      const second = await screen.findByRole('heading', { name: 'Version 2' });
      const row = second.closest('li');
      if (!row) throw new Error('Expected the native successor Version row.');
      expect(
        within(row).getByText('This Version has no preserved PDF yet.'),
      ).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('button', { name: 'Retry the same Version change' }),
    ).not.toBeInTheDocument();
  },
);

type ConsumedCapture = 'approver' | 'registrar' | 'reference-reader';
function replaceCapture(current: Company, capture: ConsumedCapture): Company {
  return capture === 'approver'
    ? {
        ...current,
        documentApproverAssignmentId: '10000000-0000-4000-8000-000000000015',
      }
    : {
        ...current,
        documentPermissionAssignmentId: '10000000-0000-4000-8000-000000000016',
      };
}
function loseCapture(current: Company, capture: ConsumedCapture): Company {
  const permission =
    capture === 'approver'
      ? 'document.version.designate_official'
      : capture === 'registrar'
        ? 'document.version.manage'
        : 'document.reference.read';
  return {
    ...current,
    documentPermissions: current.documentPermissions?.filter(
      (value) => value !== permission,
    ),
    ...(capture === 'approver'
      ? {
          documentApproverAssignmentId: undefined,
          documentApproverPermissionSetVersion: undefined,
        }
      : {}),
  };
}

it.each([
  { operation: 'designation', capture: 'approver' },
  { operation: 'designation', capture: 'reference-reader' },
  { operation: 'successor', capture: 'registrar' },
  { operation: 'successor', capture: 'reference-reader' },
] satisfies Array<{ operation: Operation; capture: ConsumedCapture }>)(
  'retires Addendum $operation on $capture replacement/loss/return and ignores its held HTTP receipt',
  async ({ operation, capture }) => {
    const held = deferred<Response>();
    const fixture = serve(operation, held.promise);
    const identity = deterministicBrowserIdentity();
    // Native designation/successor authority is independent of Content Reader.
    const original = withoutContentReader(company);
    fixture.state.contentReadable = false;
    const onActivityRecorded = vi.fn();
    const onActorRevalidated = vi.fn();
    const workspace = (next: Company) => (
      <DocumentWorkspace
        actor={actorWith(next)}
        identity={identity}
        onActivityRecorded={onActivityRecorded}
        onActorRevalidated={onActorRevalidated}
      />
    );
    const view = render(workspace(original));
    await beginUncertain(operation);
    view.rerender(workspace({ ...original }));
    expect(
      screen.getByRole('button', { name: 'Retry the same Version change' }),
    ).toBeEnabled();
    expect(fixture.writes).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry the same Version change' }),
    );
    await waitFor(() => expect(fixture.writes).toHaveLength(2));
    expectSameEnvelope(fixture.writes, operation, fixture.beforeRevision);

    const replacement = replaceCapture(original, capture);
    for (const next of [
      replacement,
      loseCapture(replacement, capture),
      original,
    ]) {
      view.rerender(workspace(next));
      await openDocument();
      expect(
        screen.queryByRole('button', { name: 'Retry the same Version change' }),
      ).not.toBeInTheDocument();
    }
    const freshAction = await screen.findByRole('button', {
      name:
        operation === 'designation'
          ? 'Designate as official'
          : 'Start new draft',
    });
    expect(freshAction).toBeEnabled();
    fixture.state.confirmed = true;
    await act(async () => {
      held.resolve(fixture.receipt());
      await held.promise;
    });
    expect(
      screen.queryByText(
        operation === 'designation'
          ? 'Version 1 is now official.'
          : 'Version 2 was started as a draft.',
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry the same Version change' }),
    ).not.toBeInTheDocument();
    expect(onActivityRecorded).not.toHaveBeenCalled();
    expect(onActorRevalidated).not.toHaveBeenCalled();
    expect(fixture.writes).toHaveLength(2);
    expect(freshAction).toBeInTheDocument();
    expect(freshAction).toBeEnabled();
  },
);

it.each(['designation', 'successor'] satisfies Operation[])(
  'retires uncertain Addendum %s on isolated Reference permission loss and return with the same Registrar',
  async (operation) => {
    const held = deferred<Response>();
    const fixture = serve(operation, held.promise),
      identity = deterministicBrowserIdentity();
    const original = withoutContentReader(company);
    fixture.state.contentReadable = false;
    const onActivityRecorded = vi.fn();
    const workspace = (current: Company) => (
      <DocumentWorkspace
        actor={actorWith(current)}
        identity={identity}
        onActivityRecorded={onActivityRecorded}
      />
    );
    const view = render(workspace(original));
    await beginUncertain(operation);
    view.rerender(workspace({ ...original }));
    expect(
      screen.getByRole('button', { name: 'Retry the same Version change' }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry the same Version change' }),
    );
    await waitFor(() => expect(fixture.writes).toHaveLength(2));
    expectSameEnvelope(fixture.writes, operation, fixture.beforeRevision);
    view.rerender(workspace(loseCapture(original, 'reference-reader')));
    expect(
      screen.queryByRole('button', { name: 'Retry the same Version change' }),
    ).not.toBeInTheDocument();
    view.rerender(workspace(original));
    expect(
      screen.queryByRole('button', { name: 'Retry the same Version change' }),
    ).not.toBeInTheDocument();
    await act(async () => {
      held.resolve(fixture.receipt());
      await held.promise;
    });
    expect(
      screen.queryByText(
        operation === 'designation'
          ? 'Version 1 is now official.'
          : 'Version 2 was started as a draft.',
      ),
    ).not.toBeInTheDocument();
    expect(onActivityRecorded).not.toHaveBeenCalled();
    expect(fixture.writes).toHaveLength(2);
  },
);

it.each(['designation', 'successor'] satisfies Operation[])(
  'terminates a held Addendum %s401 locally without stale global recovery',
  async (operation) => {
    const held = deferred<Response>();
    const fixture = serve(operation, held.promise),
      rejectSession = vi.fn();
    const identity = { ...deterministicBrowserIdentity(), rejectSession },
      protection = vi.fn();
    const workspace = (current: Company) => (
      <DocumentWorkspace
        actor={actorWith(current)}
        identity={identity}
        onProtectedWorkChange={protection}
      />
    );
    const view = render(workspace(company));
    await beginUncertain(operation);
    view.rerender(workspace({ ...company }));
    expect(
      screen.getByRole('button', { name: 'Retry the same Version change' }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry the same Version change' }),
    );
    await waitFor(() => expect(fixture.writes).toHaveLength(2));
    expectSameEnvelope(fixture.writes, operation, fixture.beforeRevision);
    view.rerender(
      workspace({
        ...company,
        ...(operation === 'designation'
          ? {
              documentContentUploaderAssignmentId:
                '10000000-0000-4000-8000-000000000012',
            }
          : {
              documentApproverAssignmentId:
                '10000000-0000-4000-8000-000000000014',
            }),
      }),
    );
    await act(async () => {
      held.resolve(new Response(null, { status: 401 }));
      await held.promise;
    });
    await screen.findByText(
      'You no longer have permission for this Version change.',
    );
    expect(protection).toHaveBeenLastCalledWith(false);
    expect(
      screen.queryByText('Saving the Version change…'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry the same Version change' }),
    ).not.toBeInTheDocument();
    expect(rejectSession).not.toHaveBeenCalled();
    expect(fixture.writes).toHaveLength(2);
  },
);
