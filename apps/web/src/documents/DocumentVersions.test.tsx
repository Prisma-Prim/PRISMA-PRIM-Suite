import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { formatApplicationDateTime } from '../presentation/date-time';
import { DocumentWorkspace } from './DocumentWorkspace';

type DocumentPermission = NonNullable<
  NonNullable<ActorContext['activeCompany']>['documentPermissions']
>[number];
const READER: DocumentPermission[] = [
  'document.read',
  'document.register',
  'document.reference.read',
];
const REGISTRAR_V3: DocumentPermission[] = [
  ...READER,
  'document.correct',
  'document.version.manage',
];
const APPROVER: DocumentPermission[] = [
  ...READER,
  'document.version.designate_official',
];
function actorWith(
  documentPermissions: DocumentPermission[],
  company: { id?: string; approverAssignmentId?: string } = {},
): ActorContext {
  return {
    internalUserId: 'user',
    workspaceMembershipId: 'member',
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    displayName: 'Document Member',
    email: 'member@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      id: company.id ?? 'company',
      displayName: 'PRISMA-PRIM',
      clientPermissions: ['client.read'],
      documentPermissions,
      ...(company.approverAssignmentId
        ? {
            documentApproverAssignmentId: company.approverAssignmentId,
            documentApproverPermissionSetVersion: 'v1' as const,
          }
        : {}),
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
const TITLE = 'Chestionar de evaluare inițială — GRUP Demo SA';
const V1_URL = 'https://example.test/demo/chestionar-v1.docx';
const V2_URL = `https://example.test/demo/${'very-long-segment-'.repeat(12)}chestionar-v2.docx`;
const CREATED = '2026-09-20T08:00:00.000Z';
const DESIGNATED_1 = '2026-09-20T09:00:00.000Z';
const CREATED_2 = '2026-09-21T08:00:00.000Z';
const DESIGNATED_2 = '2026-09-21T09:00:00.000Z';
const reference = (id: string, url: string, granted = true) =>
  granted
    ? {
        id,
        kind: 'external-reference',
        verification: 'unverified',
        position: 1,
        form: 'other',
        primary: true,
        appendedAfterDesignation: false,
        addedAt: CREATED,
        addedBy: { displayName: 'Document Registrar' },
        access: 'granted',
        url,
      }
    : {
        id,
        kind: 'external-reference',
        verification: 'unverified',
        position: 1,
        form: 'other',
        primary: true,
        appendedAfterDesignation: false,
        addedAt: CREATED,
        addedBy: { displayName: 'Document Registrar' },
        access: 'denied',
      };
function documentAt(
  workingRevision: number,
  version: { id: string; status: 'draft' | 'official'; url: string },
  correction: 'allowed' | 'read-only',
  granted = true,
) {
  return {
    id: 'document',
    companyId: 'company',
    clientId: 'client',
    clientDisplayName: 'GRUP Demo SA',
    title: TITLE,
    purpose: 'Evaluate the initial situation',
    type: 'questionnaire',
    confidentiality: 'company-confidential',
    createdAt: CREATED,
    workingRevision,
    correction,
    version: {
      id: version.id,
      status: version.status,
      representation: reference(
        `reference-${version.id}`,
        version.url,
        granted,
      ),
    },
  };
}
const draft = (number: number, url: string, granted = true) => ({
  id: `version-${number}`,
  number,
  status: 'draft',
  createdAt: number === 1 ? CREATED : CREATED_2,
  createdBy: { displayName: 'Document Registrar' },
  representations: [reference(`reference-version-${number}`, url, granted)],
});
const official = (
  number: number,
  url: string,
  granted = true,
  title = TITLE,
  purpose = 'Evaluate the initial situation',
) => ({
  ...draft(number, url, granted),
  status: 'official',
  designatedAt: number === 1 ? DESIGNATED_1 : DESIGNATED_2,
  designatedBy: { displayName: 'Document Approver' },
  frozen: { title, purpose },
});
const superseded = (number: number, url: string, granted = true) => ({
  ...official(number, url, granted),
  status: 'superseded',
  supersededAt: DESIGNATED_2,
  supersededByVersionNumber: number + 1,
});
const versionsRead = (
  workingRevision: number,
  versions: unknown[],
  mutable = true,
) => ({ workingRevision, mutable, versions });

interface Recorded {
  method: string;
  path: string;
  key: string | null;
  body: unknown;
  signal: AbortSignal | undefined;
}
type Handler = (request: Recorded) => Response | Promise<Response>;
/**
 * A stateful Documents API. Every request is recorded; each route answers
 * from the current fixture unless a test replaces its handler.
 */
function serve(initial: {
  detail: unknown;
  versions: unknown;
  designate?: Handler;
  draftCommand?: Handler;
  correct?: Handler;
  versionsRead?: Handler;
  currentActor?: Handler;
}) {
  const state = { ...initial };
  const requests: Recorded[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = new URL(input, 'http://localhost').pathname;
      const request: Recorded = {
        method: init?.method ?? 'GET',
        path,
        key: new Headers(init?.headers).get('idempotency-key'),
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        signal: init?.signal ?? undefined,
      };
      requests.push(request);
      if (path === '/api/clients') return Response.json([]);
      if (path === '/api/documents') return Response.json([state.detail]);
      if (path === '/api/access/current-actor')
        return state.currentActor
          ? state.currentActor(request)
          : new Response(null, { status: 403 });
      if (
        path === '/api/documents/document/versions' &&
        request.method === 'GET'
      )
        return state.versionsRead
          ? state.versionsRead(request)
          : Response.json(state.versions);
      if (path === '/api/documents/document/versions' && state.draftCommand)
        return state.draftCommand(request);
      if (path.endsWith('/official-designation') && state.designate)
        return state.designate(request);
      if (path === '/api/documents/document' && request.method === 'PATCH')
        return state.correct
          ? state.correct(request)
          : new Response(null, { status: 500 });
      if (path === '/api/documents/document')
        return Response.json(state.detail);
      return new Response(null, { status: 404 });
    }),
  );
  return { state, requests };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
async function openDocument() {
  fireEvent.click(await screen.findByRole('button', { name: TITLE }));
  const heading = await screen.findByRole('heading', { name: TITLE });
  const detail = heading.closest('article');
  if (!detail) throw new Error('Expected the Document detail.');
  return detail;
}
function versionsSection() {
  return screen.getByRole('region', { name: 'Versions' });
}
async function versionRows() {
  const list = await within(versionsSection()).findByRole('list', {
    name: 'Document Versions, newest first',
  });
  return Array.from(list.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
}
const reads = (requests: Recorded[], path: string) =>
  requests.filter(
    (request) => request.method === 'GET' && request.path === path,
  ).length;

afterEach(() => vi.unstubAllGlobals());

describe('the Document Versions section', () => {
  it('lists every Version newest first with status, attribution, frozen title, supersession and reference', async () => {
    serve({
      detail: documentAt(
        5,
        { id: 'version-2', status: 'official', url: V2_URL },
        'read-only',
      ),
      versions: versionsRead(5, [
        official(
          2,
          V2_URL,
          true,
          'Chestionar corectat',
          'Assess the revised scope',
        ),
        superseded(1, V1_URL),
      ]),
    });
    render(<DocumentWorkspace actor={actorWith(READER)} identity={identity} />);
    const detail = await openDocument();

    // The detail names its working Version and adapts the draft warning.
    expect(
      within(detail).getByText('Official questionnaire · Company-confidential'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /An official Version freezes only its recorded reference/u,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/This draft reference is not an official/u),
    ).not.toBeInTheDocument();
    expect(
      within(detail).queryByRole('button', { name: 'Edit reference' }),
    ).not.toBeInTheDocument();

    const [second, first] = await versionRows();
    expect(
      within(second).getByRole('heading', { name: 'Version 2' }),
    ).toBeInTheDocument();
    expect(second).toHaveTextContent('Official');
    expect(second).toHaveTextContent(
      `Created by Document Registrar${formatApplicationDateTime(CREATED_2)}`,
    );
    expect(second).toHaveTextContent(
      `Designated official by Document Approver${formatApplicationDateTime(DESIGNATED_2)}`,
    );
    expect(second).toHaveTextContent('Frozen titleChestionar corectat');
    expect(second).toHaveTextContent('Frozen purposeAssess the revised scope');
    expect(second).toHaveTextContent(
      'The recorded references, their forms, and the title of this official Version are frozen. The linked external content is not stored or verified here and may change at its source.',
    );
    const secondLink = within(second).getByRole('link', {
      name: 'Open Version 2 reference',
    });
    expect(secondLink).toHaveAttribute('href', V2_URL);
    expect(secondLink).toHaveAttribute('target', '_blank');
    expect(secondLink).toHaveAttribute('rel', 'noopener noreferrer');

    expect(
      within(first).getByRole('heading', { name: 'Version 1' }),
    ).toBeInTheDocument();
    expect(first).toHaveTextContent('Superseded');
    expect(first).toHaveTextContent(`Frozen title${TITLE}`);
    expect(first).toHaveTextContent(
      'Frozen purposeEvaluate the initial situation',
    );
    expect(first).not.toHaveTextContent('Assess the revised scope');
    expect(first).toHaveTextContent(
      `Superseded by Version 2${formatApplicationDateTime(DESIGNATED_2)}`,
    );
    expect(first).not.toHaveTextContent('are frozen. The linked');
    expect(
      within(first).getByRole('link', { name: 'Open Version 1 reference' }),
    ).toHaveAttribute('href', V1_URL);
    // No command is offered without its permission.
    expect(within(versionsSection()).queryByRole('button')).toBeNull();
  });

  it('shows the delivered no-permission copy instead of a link without Representation read', async () => {
    serve({
      detail: documentAt(
        2,
        { id: 'version-1', status: 'official', url: V1_URL },
        'read-only',
        false,
      ),
      versions: versionsRead(2, [official(1, V1_URL, false)]),
    });
    render(
      <DocumentWorkspace
        actor={actorWith(['document.read'])}
        identity={identity}
      />,
    );
    await openDocument();
    const [row] = await versionRows();
    expect(within(row).queryByRole('link')).toBeNull();
    expect(row).toHaveTextContent(
      'You do not have permission to open this reference.',
    );
  });

  it('keeps the detail usable through loading, a retryable error and a safe unavailable state', async () => {
    const held = deferred<Response>();
    let answer: 'hold' | 'error' | 'ready' | 'denied' = 'hold';
    const { requests } = serve({
      detail: documentAt(
        1,
        { id: 'version-1', status: 'draft', url: V1_URL },
        'allowed',
      ),
      versions: versionsRead(1, [draft(1, V1_URL)]),
      versionsRead: () => {
        switch (answer) {
          case 'hold':
            return held.promise;
          case 'error':
            return new Response(null, { status: 500 });
          case 'denied':
            return new Response(null, { status: 403 });
          case 'ready':
            return Response.json(versionsRead(1, [draft(1, V1_URL)]));
        }
      },
    });
    const view = render(
      <DocumentWorkspace actor={actorWith(READER)} identity={identity} />,
    );
    const detail = await openDocument();
    expect(versionsSection()).toHaveAttribute('aria-busy', 'true');
    expect(versionsSection()).toHaveTextContent('Loading Versions…');

    answer = 'error';
    await act(async () => held.resolve(new Response(null, { status: 500 })));
    expect(
      await within(versionsSection()).findByRole('alert'),
    ).toHaveTextContent(
      'The Versions could not be loaded. The Document remains available.',
    );
    expect(within(detail).getByRole('heading', { name: TITLE })).toBeVisible();
    expect(
      within(detail).getByRole('link', { name: 'Open external reference' }),
    ).toBeInTheDocument();

    answer = 'ready';
    fireEvent.click(
      within(versionsSection()).getByRole('button', {
        name: 'Retry loading Versions',
      }),
    );
    expect(await versionRows()).toHaveLength(1);
    expect(versionsSection()).toHaveAttribute('aria-busy', 'false');
    expect(reads(requests, '/api/documents/document/versions')).toBe(2);
    view.unmount();

    answer = 'denied';
    render(<DocumentWorkspace actor={actorWith(READER)} identity={identity} />);
    await openDocument();
    expect(
      await within(versionsSection()).findByText(
        'Versions are not available with your current access.',
      ),
    ).toBeInTheDocument();
    expect(versionsSection()).not.toHaveTextContent(/Version \d/u);
    expect(within(versionsSection()).queryByRole('alert')).toBeNull();
  });

  it.each([
    {
      name: 'the Approver designates the draft',
      permissions: APPROVER,
      versions: [draft(2, V1_URL), official(1, V1_URL)],
      mutable: true,
      offered: ['Designate as official'],
    },
    {
      name: 'Registrar v3 starts a draft from the official Version',
      permissions: REGISTRAR_V3,
      versions: [official(1, V1_URL)],
      mutable: true,
      offered: ['Start new draft', 'Add reference to official Version'],
    },
    {
      name: 'Registrar v3 cannot start a second draft',
      permissions: REGISTRAR_V3,
      versions: [draft(2, V1_URL), official(1, V1_URL)],
      mutable: true,
      offered: ['Add reference', 'Add reference to official Version'],
    },
    {
      name: 'a Registrar v2 colleague sees no Version command',
      permissions: [
        ...READER,
        'document.correct',
      ] satisfies DocumentPermission[],
      versions: [draft(2, V1_URL), official(1, V1_URL)],
      mutable: true,
      offered: [],
    },
    {
      name: 'a superseded original Client leaves every Version read-only',
      permissions: [
        ...REGISTRAR_V3,
        'document.version.designate_official',
      ] satisfies DocumentPermission[],
      versions: [draft(2, V1_URL), official(1, V1_URL)],
      mutable: false,
      offered: [],
    },
  ])(
    'offers commands only with live permission while mutable: $name',
    async ({ permissions, versions, mutable, offered }) => {
      serve({
        detail: documentAt(
          3,
          { id: 'version-2', status: 'draft', url: V1_URL },
          'read-only',
        ),
        versions: versionsRead(3, versions, mutable),
      });
      render(
        <DocumentWorkspace
          actor={actorWith(permissions)}
          identity={identity}
        />,
      );
      await openDocument();
      await versionRows();
      expect(
        within(versionsSection())
          .queryAllByRole('button')
          .map((button) => button.textContent),
      ).toEqual(offered);
      if (!mutable)
        expect(versionsSection()).toHaveTextContent(
          'Read-only: the original Client has been superseded. Every Version remains visible.',
        );
    },
  );

  it('confirms a designation naming the superseded Version, then refreshes the detail and Versions together', async () => {
    const onActivityRecorded = vi.fn();
    const { state, requests } = serve({
      detail: documentAt(
        4,
        { id: 'version-2', status: 'draft', url: V2_URL },
        'allowed',
      ),
      versions: versionsRead(4, [draft(2, V2_URL), official(1, V1_URL)]),
      designate: () => {
        state.detail = documentAt(
          5,
          { id: 'version-2', status: 'official', url: V2_URL },
          'read-only',
        );
        state.versions = versionsRead(5, [
          official(2, V2_URL),
          superseded(1, V1_URL),
        ]);
        return Response.json({
          documentId: 'document',
          workingRevision: 5,
          action: 'designated_official',
          versionId: 'version-2',
          versionNumber: 2,
          supersededVersionNumber: 1,
        });
      },
    });
    render(
      <DocumentWorkspace
        actor={actorWith(APPROVER)}
        identity={identity}
        onActivityRecorded={onActivityRecorded}
      />,
    );
    const detail = await openDocument();
    await versionRows();
    const section = versionsSection();

    fireEvent.click(
      within(section).getByRole('button', { name: 'Designate as official' }),
    );
    const confirmation = within(section).getByRole('group', {
      name: 'Designate Version 2 as the official Version? Version 1 will become superseded.',
    });
    const confirm = within(confirmation).getByRole('button', {
      name: 'Confirm official designation',
    });
    expect(confirm).toHaveFocus();
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'Cancel designation' }),
    );
    expect(within(section).queryByRole('group')).toBeNull();
    expect(
      requests.filter((request) => request.method === 'POST'),
    ).toHaveLength(0);

    fireEvent.click(
      within(section).getByRole('button', { name: 'Designate as official' }),
    );
    const detailReads = reads(requests, '/api/documents/document');
    const versionReads = reads(requests, '/api/documents/document/versions');
    fireEvent.click(
      within(section).getByRole('button', {
        name: 'Confirm official designation',
      }),
    );
    expect(
      await within(section).findByText('Version 2 is now official.'),
    ).toHaveAttribute('role', 'status');
    const [command] = requests.filter((request) => request.method === 'POST');
    expect(command).toMatchObject({
      path: '/api/documents/document/versions/version-2/official-designation',
      body: { expectedRevision: 4 },
      key: expect.any(String),
    });
    await waitFor(() =>
      expect(
        within(detail).getByText(
          'Official questionnaire · Company-confidential',
        ),
      ).toBeInTheDocument(),
    );
    await waitFor(async () =>
      expect((await versionRows())[1]).toHaveTextContent('Superseded'),
    );
    expect(reads(requests, '/api/documents/document')).toBeGreaterThan(
      detailReads,
    );
    expect(reads(requests, '/api/documents/document/versions')).toBeGreaterThan(
      versionReads,
    );
    expect(onActivityRecorded).toHaveBeenCalled();
    expect(
      within(detail).queryByRole('button', { name: 'Edit reference' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the exact body and key for an explicit retry after an uncertain outcome', async () => {
    let attempts = 0;
    const { requests } = serve({
      detail: documentAt(
        2,
        { id: 'version-1', status: 'official', url: V1_URL },
        'read-only',
      ),
      versions: versionsRead(2, [official(1, V1_URL)]),
      draftCommand: () => {
        attempts += 1;
        return attempts === 1
          ? new Response(null, { status: 502 })
          : Response.json(
              {
                documentId: 'document',
                workingRevision: 3,
                action: 'drafted',
                versionId: 'version-2',
                versionNumber: 2,
                sourceVersionNumber: 1,
              },
              { status: 201 },
            );
      },
    });
    render(
      <DocumentWorkspace actor={actorWith(REGISTRAR_V3)} identity={identity} />,
    );
    await openDocument();
    await versionRows();
    const section = versionsSection();
    fireEvent.click(
      within(section).getByRole('button', { name: 'Start new draft' }),
    );
    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'The result of this Version change is uncertain. Retry the exact same change safely.',
    );
    expect(
      within(section).getByRole('button', { name: 'Start new draft' }),
    ).toBeDisabled();
    fireEvent.click(
      within(section).getByRole('button', {
        name: 'Retry the same Version change',
      }),
    );
    expect(
      await within(section).findByText('Version 2 was started as a draft.'),
    ).toBeInTheDocument();
    const commands = requests.filter((request) => request.method === 'POST');
    expect(commands).toHaveLength(2);
    expect(commands[1]?.key).toBe(commands[0]?.key);
    expect(commands[1]?.body).toEqual(commands[0]?.body);
    expect(commands[0]?.body).toEqual({ expectedRevision: 2 });
    expect(commands[0]?.signal).toBeUndefined();
  });

  it('offers an explicit reload after a stale conflict and has its own capacity message', async () => {
    let code = 'document_revision_conflict';
    const { requests } = serve({
      detail: documentAt(
        2,
        { id: 'version-1', status: 'official', url: V1_URL },
        'read-only',
      ),
      versions: versionsRead(2, [official(1, V1_URL)]),
      draftCommand: () =>
        Response.json({ code, message: 'Refused.' }, { status: 409 }),
    });
    render(
      <DocumentWorkspace actor={actorWith(REGISTRAR_V3)} identity={identity} />,
    );
    await openDocument();
    await versionRows();
    const section = versionsSection();
    fireEvent.click(
      within(section).getByRole('button', { name: 'Start new draft' }),
    );
    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'This Document changed. Reload the Document and its Versions before trying again.',
    );
    const detailReads = reads(requests, '/api/documents/document');
    const versionReads = reads(requests, '/api/documents/document/versions');
    fireEvent.click(
      within(section).getByRole('button', {
        name: 'Reload Document and Versions',
      }),
    );
    await waitFor(() =>
      expect(reads(requests, '/api/documents/document')).toBe(detailReads + 1),
    );
    await waitFor(() =>
      expect(reads(requests, '/api/documents/document/versions')).toBe(
        versionReads + 1,
      ),
    );
    expect(within(section).queryByRole('alert')).toBeNull();

    code = 'document_version_capacity_exceeded';
    fireEvent.click(
      await within(section).findByRole('button', { name: 'Start new draft' }),
    );
    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'This Document has reached its Version limit. No new draft can be started.',
    );
    expect(
      within(section).queryByRole('button', {
        name: 'Reload Document and Versions',
      }),
    ).toBeNull();
  });

  it('revalidates the actor after a refused command', async () => {
    const onActorRevalidated = vi.fn();
    const revalidated = actorWith(READER);
    serve({
      detail: documentAt(
        3,
        { id: 'version-2', status: 'draft', url: V1_URL },
        'allowed',
      ),
      versions: versionsRead(3, [draft(2, V1_URL), official(1, V1_URL)]),
      designate: () => new Response(null, { status: 403 }),
      currentActor: () => Response.json(revalidated),
    });
    render(
      <DocumentWorkspace
        actor={actorWith(APPROVER, { approverAssignmentId: 'approver' })}
        identity={identity}
        onActorRevalidated={onActorRevalidated}
      />,
    );
    await openDocument();
    await versionRows();
    const section = versionsSection();
    fireEvent.click(
      within(section).getByRole('button', { name: 'Designate as official' }),
    );
    fireEvent.click(
      within(section).getByRole('button', {
        name: 'Confirm official designation',
      }),
    );
    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'You no longer have permission for this Version change.',
    );
    await waitFor(() =>
      expect(onActorRevalidated).toHaveBeenCalledWith(revalidated),
    );
  });

  it('never rebases an open correction draft on a detail refreshed by a Version command', async () => {
    const { state, requests } = serve({
      detail: documentAt(
        3,
        { id: 'version-2', status: 'draft', url: V1_URL },
        'allowed',
      ),
      versions: versionsRead(3, [draft(2, V1_URL), official(1, V1_URL)]),
      designate: () => {
        state.detail = documentAt(
          4,
          { id: 'version-2', status: 'official', url: V1_URL },
          'read-only',
        );
        state.versions = versionsRead(4, [
          official(2, V1_URL),
          superseded(1, V1_URL),
        ]);
        return Response.json({
          documentId: 'document',
          workingRevision: 4,
          action: 'designated_official',
          versionId: 'version-2',
          versionNumber: 2,
          supersededVersionNumber: 1,
        });
      },
      correct: () =>
        Response.json(
          {
            message:
              'The working Document changed. Reload before correcting it.',
          },
          { status: 409 },
        ),
    });
    render(
      <DocumentWorkspace
        actor={actorWith([
          ...REGISTRAR_V3,
          'document.version.designate_official',
        ])}
        identity={identity}
      />,
    );
    const detail = await openDocument();
    await versionRows();
    fireEvent.click(
      within(detail).getByRole('button', { name: 'Edit reference' }),
    );
    fireEvent.change(within(detail).getByLabelText('Title'), {
      target: { value: 'Draft kept by its author' },
    });
    const section = versionsSection();
    fireEvent.click(
      within(section).getByRole('button', { name: 'Designate as official' }),
    );
    fireEvent.click(
      within(section).getByRole('button', {
        name: 'Confirm official designation',
      }),
    );
    await within(section).findByText('Version 2 is now official.');
    await waitFor(async () =>
      expect((await versionRows())[0]).toHaveTextContent('Official'),
    );
    // The open draft keeps its values and its observed revision.
    expect(within(detail).getByLabelText('Title')).toHaveValue(
      'Draft kept by its author',
    );
    fireEvent.click(
      within(detail).getByRole('button', { name: 'Save correction' }),
    );
    expect(
      await within(detail).findByText(
        'This reference changed. Reload it before correcting it again.',
      ),
    ).toBeInTheDocument();
    const patch = requests.find((request) => request.method === 'PATCH');
    expect(patch?.body).toMatchObject({
      expectedRevision: 3,
      title: 'Draft kept by its author',
    });
  });

  it('never renders a late Versions reply for a previous permission set or Company and never cancels a pending command', async () => {
    const heldRead = deferred<Response>();
    const heldCommand = deferred<Response>();
    let firstRead = true;
    const { requests } = serve({
      detail: documentAt(
        3,
        { id: 'version-2', status: 'draft', url: V1_URL },
        'read-only',
      ),
      versions: versionsRead(3, [draft(2, V1_URL), official(1, V1_URL)]),
      versionsRead: () => {
        if (!firstRead)
          return Response.json(
            versionsRead(3, [draft(2, V1_URL), official(1, V1_URL)]),
          );
        firstRead = false;
        return heldRead.promise;
      },
      designate: () => heldCommand.promise,
    });
    const approver = actorWith(APPROVER, { approverAssignmentId: 'approver' });
    const view = render(
      <DocumentWorkspace actor={approver} identity={identity} />,
    );
    await openDocument();
    await waitFor(() =>
      expect(reads(requests, '/api/documents/document/versions')).toBe(1),
    );
    // The Approver assignment is revoked while the first read is pending.
    view.rerender(
      <DocumentWorkspace actor={actorWith(READER)} identity={identity} />,
    );
    const rows = await versionRows();
    expect(rows).toHaveLength(2);
    await act(async () =>
      heldRead.resolve(
        Response.json(
          versionsRead(3, [
            { ...draft(2, V1_URL), createdBy: { displayName: 'Late reply' } },
          ]),
        ),
      ),
    );
    expect(versionsSection()).not.toHaveTextContent('Late reply');
    expect(
      within(versionsSection()).queryByRole('button', {
        name: 'Designate as official',
      }),
    ).toBeNull();

    // A command pending across a permission change is never cancelled.
    view.rerender(<DocumentWorkspace actor={approver} identity={identity} />);
    await versionRows();
    fireEvent.click(
      within(versionsSection()).getByRole('button', {
        name: 'Designate as official',
      }),
    );
    fireEvent.click(
      within(versionsSection()).getByRole('button', {
        name: 'Confirm official designation',
      }),
    );
    await waitFor(() =>
      expect(
        requests.filter((request) => request.method === 'POST'),
      ).toHaveLength(1),
    );
    view.rerender(
      <DocumentWorkspace actor={actorWith(READER)} identity={identity} />,
    );
    const [command] = requests.filter((request) => request.method === 'POST');
    expect(command?.signal).toBeUndefined();
    await act(async () =>
      heldCommand.resolve(
        Response.json({
          documentId: 'document',
          workingRevision: 4,
          action: 'designated_official',
          versionId: 'version-2',
          versionNumber: 2,
          supersededVersionNumber: 1,
        }),
      ),
    );
    expect(
      within(versionsSection()).queryByText('Version 2 is now official.'),
    ).toBeNull();

    // A Company change retires the open Document and its Versions.
    view.rerender(
      <DocumentWorkspace
        actor={actorWith(APPROVER, { id: 'company-other' })}
        identity={identity}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Versions' })).toBeNull(),
    );
  });
});
