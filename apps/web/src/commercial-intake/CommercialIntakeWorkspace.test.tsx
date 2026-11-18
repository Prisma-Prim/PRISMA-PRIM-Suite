import { changeValue } from '../test/select-option';
import { startTransition, Suspense, useState } from 'react';
import {
  act,
  fireEvent,
  getDefaultNormalizer,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  buildClientRequest,
  buildRequestListItem,
  requestListItemFor,
} from '../test/commercial-intake-responses';
import { formatApplicationDateTime } from '../presentation/date-time';
import { CommercialIntakeWorkspace } from './CommercialIntakeWorkspace';
import {
  companyGrants,
  withCompanyGrants,
  withoutCompanyGrants,
} from '../access/company-grants.test-fixture';
import { commercialIntakeCopy } from './commercial-intake.copy';

const actor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Iurie',
  email: 'iurie@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-1',
    displayName: 'PRISMA-PRIM',
    grants: companyGrants(
      {
        bundle: 'company_director_client_access',
        version: 'v1',
        assignmentId: 'client-assignment',
      },
      {
        bundle: 'company_commercial_intake',
        version: 'v1',
        assignmentId: 'intake-assignment',
      },
    ),
  },
};

// The reported time stays a string so assertions can format it.
const createdRequest = {
  ...buildClientRequest({
    id: 'request-1',
    companyId: 'company-1',
    sourceLabel: 'Manual entry from a phone request',
    subject: 'Quality process preparation',
    originalText:
      'Please help us prepare our internal quality processes before our planned review.',
    capturedByWorkspaceMembershipId: 'membership-1',
    capturedAt: '2026-09-20T10:00:00.000Z',
    initialOpportunity: {
      id: 'opportunity-1',
      title: 'Prepare quality process review',
      scope: 'Initial discussion to identify the requested work',
      nextAction: 'Arrange a qualification call',
      responsibleActor: {
        workspaceMembershipId: 'membership-1',
        displayName: 'Iurie',
      },
    },
  }),
  reportedReceivedAt: '2026-09-20T09:30:00.000Z',
};

type WorkspaceProps = {
  onActivityRecorded?: () => Promise<void> | void;
  onCompanyContextRejected?: (companyContextId: string) => void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onOpenClientDossier?: (clientDossierId: string) => void;
  clientIdentityRevision?: number;
};

function workspaceElement(
  current: ActorContext,
  props: WorkspaceProps,
  identity = deterministicBrowserIdentity(),
) {
  return (
    <CommercialIntakeWorkspace
      actor={current}
      identity={identity}
      onActivityRecorded={props.onActivityRecorded}
      onCompanyContextRejected={props.onCompanyContextRejected ?? vi.fn()}
      onWorkspaceAccessRejected={props.onWorkspaceAccessRejected}
      onActorRevalidated={props.onActorRevalidated}
      onOpenClientDossier={props.onOpenClientDossier}
      clientIdentityRevision={props.clientIdentityRevision}
    />
  );
}

function renderWorkspace(props: WorkspaceProps = {}) {
  const view = render(workspaceElement(actor, props));
  return {
    selectCompany: (nextActor: ActorContext) =>
      view.rerender(workspaceElement(nextActor, props)),
  };
}

function actorForCompany(id: string, displayName: string): ActorContext {
  return {
    ...actor,
    activeCompany: {
      id,
      displayName,
      grants: companyGrants(
        {
          bundle: 'company_director_client_access',
          version: 'v1',
          assignmentId: 'client-assignment',
        },
        {
          bundle: 'company_commercial_intake',
          version: 'v1',
          assignmentId: 'intake-assignment',
        },
      ),
    },
  };
}

function listItem(index: number) {
  return buildRequestListItem({
    id: `request-${index}`,
    subject: `Client Request ${index}`,
    capturedAt: `2026-09-20T10:00:00.000Z`,
    initialOpportunity: {
      title: `Opportunity ${index}`,
      nextAction: `Follow up Request ${index}`,
      responsibleActor: {
        workspaceMembershipId: 'membership-1',
        displayName: 'Iurie',
      },
    },
  });
}

const newestPage = Array.from({ length: 25 }, (_, index) => listItem(index));
const olderPage = [listItem(25), listItem(26), listItem(27)];

function requestButton(index: number) {
  return new RegExp(`^Client Request ${index}(?!\\d)`, 'u');
}

function visibleRequests(): number {
  return within(
    screen.getByRole('list', { name: 'Client Requests' }),
  ).queryAllByRole('listitem').length;
}

function listedRequestButton(name: RegExp): HTMLElement {
  return within(
    screen.getByRole('list', { name: 'Client Requests' }),
  ).getByRole('button', { name });
}

// Text-matching options that neither trim nor collapse whitespace.
const unnormalized = {
  normalizer: getDefaultNormalizer({ trim: false, collapseWhitespace: false }),
};

const filterableItems = [
  buildRequestListItem({
    id: 'request-quality',
    subject: 'Quality process preparation',
    capturedAt: '2026-09-20T10:00:00.000Z',
    initialOpportunity: {
      title: 'Prepare quality process review',
      nextAction: 'Arrange a qualification call',
      responsibleActor: {
        workspaceMembershipId: 'membership-1',
        displayName: 'Iurie',
      },
    },
  }),
  buildRequestListItem({
    id: 'request-audit',
    subject: 'Annual audit support',
    capturedAt: '2026-09-19T10:00:00.000Z',
    initialOpportunity: {
      title: 'Plan the annual audit',
      nextAction: 'Confirm the audit window',
      responsibleActor: {
        workspaceMembershipId: 'membership-2',
        displayName: 'Ada Ionescu',
      },
    },
  }),
  buildRequestListItem({
    id: 'request-training',
    subject: null,
    capturedAt: '2026-09-18T10:00:00.000Z',
    initialOpportunity: {
      title: 'Operator training programme',
      nextAction: 'Propose training dates',
      responsibleActor: {
        workspaceMembershipId: 'membership-3',
        displayName: 'Mihai Rusu',
      },
    },
  }),
];

function filterInput(): HTMLElement {
  return screen.getByLabelText(commercialIntakeCopy.filterLabel);
}

function applyFilter(value: string) {
  fireEvent.change(filterInput(), { target: { value } });
}

function idempotencyKeyOf(init: RequestInit | undefined): string | undefined {
  const headers = init?.headers;
  if (
    !headers ||
    headers instanceof Headers ||
    Array.isArray(headers) ||
    typeof headers !== 'object'
  )
    return undefined;
  const key = headers['idempotency-key'];
  return typeof key === 'string' ? key : undefined;
}

function commandBodyOf(init: RequestInit | undefined): string | undefined {
  return typeof init?.body === 'string' ? init.body : undefined;
}

function deferredResponse() {
  let resolve: (response: Response) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<Response>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

type DeferredResponse = ReturnType<typeof deferredResponse>;

function editorActor(): ActorContext {
  return {
    ...actor,
    activeCompany: {
      id: 'company-1',
      displayName: 'PRISMA-PRIM',
      grants: companyGrants(
        {
          bundle: 'company_director_client_access',
          version: 'v1',
          assignmentId: 'client-assignment',
        },
        {
          bundle: 'company_commercial_intake',
          version: 'v2',
          assignmentId: 'intake-assignment',
        },
      ),
    },
  };
}

function requestListPage(
  nextAction = createdRequest.initialOpportunity.nextAction,
) {
  return Response.json({
    items: [
      requestListItemFor(createdRequest, {
        initialOpportunity: { nextAction },
      }),
    ],
  });
}

function updatedRequest(nextAction: string, version: number) {
  return {
    ...createdRequest,
    initialOpportunity: {
      ...createdRequest.initialOpportunity,
      nextAction,
      version,
    },
  };
}

function updateResult(
  nextAction: string,
  version: number,
  outcome: 'updated' | 'unchanged' = 'updated',
) {
  return Response.json({
    receipt: {
      opportunityId: createdRequest.initialOpportunity.id,
      nextAction,
      version,
      outcome,
    },
    request: updatedRequest(nextAction, version),
  });
}

async function openDetailForEditing(props: WorkspaceProps = {}) {
  // Actor revalidation keeps the same session identity.
  const identity = deterministicBrowserIdentity();
  const view = render(workspaceElement(editorActor(), props, identity));
  fireEvent.click(
    await screen.findByRole('button', {
      name: /Quality process preparation/u,
    }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit next action' }),
  );
  return {
    revalidateActor: (nextActor: ActorContext) =>
      view.rerender(workspaceElement(nextActor, props, identity)),
  };
}

function fillRequiredFields() {
  changeValue(
    screen.getByLabelText('Original request text'),
    createdRequest.originalText,
  );
  changeValue(
    screen.getByLabelText('Opportunity title'),
    createdRequest.initialOpportunity.title,
  );
  changeValue(
    screen.getByLabelText('Next action'),
    createdRequest.initialOpportunity.nextAction,
  );
}

describe('CommercialIntakeWorkspace', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refreshes the current Request list after a confirmed save survives independent Client revalidation', async () => {
    const initial = buildClientRequest({
      ...createdRequest,
      version: 2,
      clientAssociationStatus: 'visible',
      clientReference: {
        originalClientId: 'client-original',
        currentClientId: 'client-original',
        displayName: 'Original Client',
      },
    });
    const current = buildClientRequest({
      ...initial,
      clientReference: {
        originalClientId: 'client-original',
        currentClientId: 'client-current',
        displayName: 'Current Client',
      },
    });
    const held = deferredResponse();
    let confirmed = false;
    let posts = 0;
    let details = 0;
    vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts += 1;
        return held.promise;
      }
      if (path.includes('?limit=25'))
        return Response.json({
          items: [
            requestListItemFor(current, {
              clientDisplayName: 'Current Client',
              clientDossierId: 'client-current',
              initialOpportunity: {
                nextAction: confirmed
                  ? 'Confirmed after Client revalidation'
                  : initial.initialOpportunity.nextAction,
              },
            }),
          ],
        });
      details += 1;
      return Response.json(details === 1 ? initial : current);
    });
    const identity = deterministicBrowserIdentity();
    const editor = editorActor();
    const view = render(workspaceElement(editor, {}, identity));
    fireEvent.click(
      await screen.findByRole('button', {
        name: /^Quality process preparation/u,
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit next action' }),
    );
    changeValue(
      screen.getByLabelText('Next action'),
      'Confirmed after Client revalidation',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
    await waitFor(() => expect(posts).toBe(1));
    view.rerender(
      workspaceElement(editor, { clientIdentityRevision: 1 }, identity),
    );
    await screen.findByText('Current Client');
    confirmed = true;
    await act(async () =>
      held.resolve(
        Response.json({
          receipt: {
            opportunityId: 'opportunity-1',
            nextAction: 'Confirmed after Client revalidation',
            version: 2,
            outcome: 'updated',
          },
          request: buildClientRequest({
            ...initial,
            initialOpportunity: {
              ...initial.initialOpportunity,
              nextAction: 'Confirmed after Client revalidation',
              version: 2,
            },
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Back to Requests' }),
      ).toBeEnabled(),
    );
    expect(
      screen.getByText('Next action: Confirmed after Client revalidation'),
    ).toBeVisible();
    expect(screen.getByText('Current Client')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Requests' }));
    expect(
      listedRequestButton(/^Quality process preparation/u),
    ).toHaveTextContent('Confirmed after Client revalidation');
    expect(screen.getByRole('listitem')).toHaveTextContent('Current Client');
    expect(posts).toBe(1);
  });

  it('preserves a held Client projection when only the manager capture changes', async () => {
    if (!actor.activeCompany) throw new Error('Expected the active Company');
    const managerActor: ActorContext = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        grants: withCompanyGrants(actor.activeCompany.grants, {
          bundle: 'company_opportunity_manager',
          version: 'v2',
          assignmentId: 'initial-manager',
        }),
      },
    };
    const initial = buildClientRequest({
      ...createdRequest,
      version: 2,
      clientAssociationStatus: 'visible',
      clientReference: {
        originalClientId: 'client-1',
        currentClientId: 'client-1',
        displayName: 'Preserved Client',
      },
    });
    const held = deferredResponse();
    const details: RequestInit[] = [];
    vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
      if (path.includes('?limit=25'))
        return Response.json({ items: [requestListItemFor(initial)] });
      if (!init) throw new Error('Expected native request options');
      details.push(init);
      return details.length === 1 ? Response.json(initial) : held.promise;
    });
    const identity = deterministicBrowserIdentity();
    const view = render(workspaceElement(managerActor, {}, identity));
    fireEvent.click(
      await screen.findByRole('button', {
        name: /^Quality process preparation/u,
      }),
    );
    await screen.findByRole('article', { name: 'Quality process preparation' });
    view.rerender(
      workspaceElement(managerActor, { clientIdentityRevision: 1 }, identity),
    );
    await waitFor(() => expect(details).toHaveLength(2));
    if (!managerActor.activeCompany)
      throw new Error('Expected the manager Company');
    view.rerender(
      workspaceElement(
        {
          ...managerActor,
          activeCompany: {
            ...managerActor.activeCompany,
            grants: withCompanyGrants(managerActor.activeCompany.grants, {
              bundle: 'company_opportunity_manager',
              version: 'v2',
              assignmentId: 'replacement-manager',
            }),
          },
        },
        { clientIdentityRevision: 1 },
        identity,
      ),
    );
    expect(details[1]?.signal?.aborted).toBe(false);
    expect(details).toHaveLength(2);
    await act(async () =>
      held.resolve(
        Response.json(
          buildClientRequest({
            ...initial,
            clientReference: {
              originalClientId: 'client-1',
              currentClientId: 'client-1',
              displayName: 'Refreshed Client',
            },
          }),
        ),
      ),
    );
    expect(await screen.findByText('Refreshed Client')).toBeVisible();
    expect(details).toHaveLength(2);
  });

  it.each(['http', 'parser'])(
    'does not start Actor recovery from a retired observation after held %s completion',
    async (boundary) => {
      const olderActor: ActorContext = {
        ...actor,
        workspacePermissions: ['company.manage'],
      };
      const held = deferredResponse();
      let releaseBody: (body: unknown) => void = () => undefined;
      const heldBody = new Promise<unknown>((resolve) => {
        releaseBody = resolve;
      });
      const response = Response.json({}, { status: 403 });
      const parser = vi
        .spyOn(response, 'json')
        .mockImplementation(() => heldBody);
      let searches = 0;
      let recoveries = 0;
      let lists = 0;
      let recoveredActor = olderActor;
      vi.stubGlobal('fetch', async (path: string) => {
        const url = new URL(path, 'http://localhost');
        if (url.pathname === '/api/access/current-actor') {
          recoveries += 1;
          return Response.json(recoveredActor);
        }
        if (url.pathname === '/api/clients/search') {
          searches += 1;
          if (searches === 1)
            return boundary === 'http' ? held.promise : response;
          return Response.json({}, { status: 403 });
        }
        if (url.pathname === '/api/commercial-intake/requests') {
          lists += 1;
          return Response.json({ items: [] });
        }
        throw new Error(`Unexpected native path: ${url.pathname}`);
      });
      const callbacks = {
        onActorRevalidated: vi.fn(),
        onCompanyContextRejected: vi.fn(),
        onWorkspaceAccessRejected: vi.fn(),
      };
      const identity = deterministicBrowserIdentity();
      const view = render(workspaceElement(olderActor, callbacks, identity));
      await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
      changeValue(
        screen.getByLabelText('Original request text'),
        'Preserve the committed draft',
      );
      changeValue(screen.getByLabelText('Search Clients by name'), 'Client');
      fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      await waitFor(() => expect(searches).toBe(1));
      if (boundary === 'parser')
        await waitFor(() => expect(parser).toHaveBeenCalledOnce());
      view.rerender(workspaceElement(actor, callbacks, identity));
      await act(async () => {
        if (boundary === 'http')
          held.resolve(Response.json({}, { status: 403 }));
        else releaseBody({});
      });
      expect(callbacks.onActorRevalidated).not.toHaveBeenCalled();
      expect(recoveries).toBe(0);
      expect(lists).toBe(1);
      expect(screen.getByLabelText('Original request text')).toHaveValue(
        'Preserve the committed draft',
      );
      recoveredActor = actor;
      fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      await waitFor(() =>
        expect(callbacks.onActorRevalidated).toHaveBeenCalledExactlyOnceWith(
          actor,
        ),
      );
      expect(recoveries).toBe(1);
    },
  );

  it('restarts a held list under a replacement Intake capture without accepting the retired result', async () => {
    const held = deferredResponse();
    const reads: RequestInit[] = [];
    vi.stubGlobal('fetch', async (_path: string, init?: RequestInit) => {
      if (!init) throw new Error('Expected native request options');
      reads.push(init);
      return reads.length === 1
        ? held.promise
        : Response.json({ items: [listItem(77)] });
    });
    const identity = deterministicBrowserIdentity();
    const current = editorActor();
    const view = render(workspaceElement(current, {}, identity));
    await waitFor(() => expect(reads).toHaveLength(1));
    if (!current.activeCompany) throw new Error('Expected the editor Company');
    view.rerender(
      workspaceElement(
        {
          ...current,
          activeCompany: {
            ...current.activeCompany,
            grants: withCompanyGrants(current.activeCompany.grants, {
              bundle: 'company_commercial_intake',
              version: 'v2',
              assignmentId: 'replacement-intake',
            }),
          },
        },
        {},
        identity,
      ),
    );
    expect(
      await screen.findByRole('button', { name: requestButton(77) }),
    ).toBeVisible();
    expect(reads).toHaveLength(2);
    expect(reads[0]?.signal?.aborted).toBe(true);
    await act(async () =>
      held.resolve(Response.json({ items: [listItem(0)] })),
    );
    expect(visibleRequests()).toBe(1);
    expect(
      screen.queryByRole('button', { name: requestButton(0) }),
    ).not.toBeInTheDocument();
  });

  it.each([200, 403])(
    'ignores a held response parser after Company A-B-A retirement (status %i)',
    async (status) => {
      let releaseBody: (body: unknown) => void = () => undefined;
      const heldBody = new Promise<unknown>((resolve) => {
        releaseBody = resolve;
      });
      const response = Response.json({}, { status });
      const parser = vi
        .spyOn(response, 'json')
        .mockImplementation(() => heldBody);
      const transport = vi
        .fn()
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(Response.json({ items: [listItem(77)] }))
        .mockResolvedValueOnce(Response.json({ items: [listItem(78)] }));
      vi.stubGlobal('fetch', transport);
      const callbacks = {
        onActorRevalidated: vi.fn(),
        onCompanyContextRejected: vi.fn(),
        onWorkspaceAccessRejected: vi.fn(),
      };
      const identity = deterministicBrowserIdentity();
      const view = render(workspaceElement(actor, callbacks, identity));
      await waitFor(() => expect(parser).toHaveBeenCalledOnce());
      view.rerender(
        workspaceElement(
          actorForCompany('company-2', 'Second Company'),
          callbacks,
          identity,
        ),
      );
      await screen.findByRole('button', { name: requestButton(77) });
      view.rerender(workspaceElement(actor, callbacks, identity));
      await screen.findByRole('button', { name: requestButton(78) });
      await act(async () => releaseBody({ items: [listItem(0)] }));
      expect(
        screen.getByRole('button', { name: requestButton(78) }),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: requestButton(0) }),
      ).not.toBeInTheDocument();
      expect(transport).toHaveBeenCalledTimes(3);
      expect(callbacks.onActorRevalidated).not.toHaveBeenCalled();
      expect(callbacks.onCompanyContextRejected).not.toHaveBeenCalled();
      expect(callbacks.onWorkspaceAccessRejected).not.toHaveBeenCalled();
    },
  );

  it('retires a held next-action save on Intake capture replacement and admits a fresh authorized save', async () => {
    const held = deferredResponse();
    const posts: RequestInit[] = [];
    const activity = vi.fn();
    vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push(init);
        return posts.length === 1
          ? held.promise
          : updateResult('Fresh authorized next action', 2);
      }
      return path.includes('?limit=25')
        ? requestListPage()
        : Response.json(createdRequest);
    });
    const view = await openDetailForEditing({ onActivityRecorded: activity });
    changeValue(screen.getByLabelText('Next action'), 'Retired next action');
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    const replacement = editorActor();
    if (!replacement.activeCompany)
      throw new Error('Expected the editor Company');
    view.revalidateActor({
      ...replacement,
      activeCompany: {
        ...replacement.activeCompany,
        grants: withCompanyGrants(replacement.activeCompany.grants, {
          bundle: 'company_commercial_intake',
          version: 'v2',
          assignmentId: 'replacement-intake-assignment',
        }),
      },
    });
    expect(posts[0]?.signal?.aborted).toBe(true);
    expect(screen.queryByLabelText('Next action')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Back to Requests' }),
    ).toBeEnabled();
    await act(async () => held.resolve(Response.json({}, { status: 503 })));
    expect(activity).not.toHaveBeenCalled();
    expect(
      screen.getByText('Next action: Arrange a qualification call'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Edit next action' }));
    changeValue(
      screen.getByLabelText('Next action'),
      'Fresh authorized next action',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
    expect(
      await screen.findByText('Next action saved.', {
        selector: '[role="alert"]',
      }),
    ).toBeVisible();
    expect(posts).toHaveLength(2);
    expect(posts[1]?.signal?.aborted).toBe(false);
    expect(activity).toHaveBeenCalledOnce();
  });

  it('keeps the committed Client projection and draft when a speculative identity revision is abandoned', async () => {
    const identity = deterministicBrowserIdentity();
    const pending = new Promise<never>(() => undefined);
    let attemptedRevision = false;
    function PendingRevision(): never {
      attemptedRevision = true;
      throw pending;
    }
    const transport = vi.fn(async () =>
      Response.json({
        items: [
          requestListItemFor(createdRequest, {
            clientDisplayName: 'Preserved Client',
            clientDossierId: 'client-1',
          }),
        ],
      }),
    );
    vi.stubGlobal('fetch', transport);
    function Frame() {
      const [selection, setSelection] = useState({
        revision: 0,
        suspended: false,
      });
      return (
        <>
          <button
            onClick={() =>
              startTransition(() =>
                setSelection({ revision: 1, suspended: true }),
              )
            }
          >
            Consider another Client revision
          </button>
          <button
            onClick={() => setSelection({ revision: 0, suspended: false })}
          >
            Keep current Client revision
          </button>
          <Suspense fallback={<p>Pending revision</p>}>
            {workspaceElement(
              actor,
              { clientIdentityRevision: selection.revision },
              identity,
            )}
            {selection.suspended && <PendingRevision />}
          </Suspense>
        </>
      );
    }
    render(<Frame />);
    await screen.findByText('Client: Preserved Client');
    changeValue(
      screen.getByLabelText('Original request text'),
      'Literal committed draft',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Consider another Client revision' }),
    );
    await waitFor(() => expect(attemptedRevision).toBe(true));
    expect(screen.getByText('Client: Preserved Client')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Keep current Client revision' }),
    );
    expect(screen.getByText('Client: Preserved Client')).toBeVisible();
    expect(screen.getByLabelText('Original request text')).toHaveValue(
      'Literal committed draft',
    );
    expect(transport).toHaveBeenCalledOnce();
  });

  it('keeps the confirmed next action and refreshes its row when independent Activity refresh fails', async () => {
    const activity = vi
      .fn()
      .mockRejectedValue(new Error('Synthetic Activity refresh failure'));
    const transport = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockResolvedValueOnce(updateResult('Confirmed next action', 2))
      .mockResolvedValueOnce(requestListPage('Confirmed next action'));
    vi.stubGlobal('fetch', transport);
    await openDetailForEditing({ onActivityRecorded: activity });
    changeValue(screen.getByLabelText('Next action'), 'Confirmed next action');
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Back to Requests' }),
      ).toBeEnabled(),
    );
    expect(
      screen.getByText('Next action saved.', { selector: '[role="alert"]' }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Next action')).not.toBeInTheDocument();
    expect(
      screen.getByText('Next action: Confirmed next action'),
    ).toBeVisible();
    expect(screen.getByText('Version: 2')).toBeVisible();
    expect(activity).toHaveBeenCalledOnce();
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(4));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Requests' }));
    expect(
      listedRequestButton(/^Quality process preparation/u),
    ).toHaveTextContent('Confirmed next action');
  });

  it('does not restore an older Actor after held Client-search recovery, while preserving the independent intake draft', async () => {
    const olderActor: ActorContext = {
      ...actor,
      activeCompany: actor.activeCompany && {
        ...actor.activeCompany,
        grants: withCompanyGrants(actor.activeCompany.grants, {
          bundle: 'company_document_content_reader',
          version: 'v1',
          assignmentId: 'unrelated-content-reader',
        }),
      },
    };
    const recoveries: ReturnType<typeof deferredResponse>[] = [];
    let reads = 0;
    vi.stubGlobal('fetch', async (path: string) => {
      const url = new URL(path, 'http://localhost');
      if (url.pathname === '/api/access/current-actor') {
        const held = deferredResponse();
        recoveries.push(held);
        return held.promise;
      }
      if (url.pathname === '/api/clients/search')
        return Response.json({}, { status: 403 });
      if (url.pathname === '/api/commercial-intake/requests') {
        reads += 1;
        return Response.json({ items: [] });
      }
      throw new Error(`Unexpected native path: ${url.pathname}`);
    });
    const props = {
      onActorRevalidated: vi.fn(),
      onCompanyContextRejected: vi.fn(),
      onWorkspaceAccessRejected: vi.fn(),
    };
    const identity = deterministicBrowserIdentity();
    const view = render(workspaceElement(olderActor, props, identity));
    await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
    changeValue(
      screen.getByLabelText('Original request text'),
      'Preserve this independent draft',
    );
    changeValue(screen.getByLabelText('Search Clients by name'), 'Client');
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    await waitFor(() => expect(recoveries).toHaveLength(1));
    view.rerender(workspaceElement(actor, props, identity));
    await act(async () => recoveries[0]?.resolve(Response.json(olderActor)));
    expect(props.onActorRevalidated).not.toHaveBeenCalled();
    expect(props.onCompanyContextRejected).not.toHaveBeenCalled();
    expect(props.onWorkspaceAccessRejected).not.toHaveBeenCalled();
    expect(reads).toBe(1);
    expect(screen.getByLabelText('Original request text')).toHaveValue(
      'Preserve this independent draft',
    );
    expect(
      await screen.findByText(
        'Client search is not available. You can capture this Request without a Client.',
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    await waitFor(() => expect(recoveries).toHaveLength(2));
    await act(async () => recoveries[1]?.resolve(Response.json(actor)));
    await waitFor(() =>
      expect(props.onActorRevalidated).toHaveBeenCalledExactlyOnceWith(actor),
    );
    expect(screen.getByLabelText('Original request text')).toHaveValue(
      'Preserve this independent draft',
    );
  });

  it('admits one capture when its public form is submitted twice synchronously', async () => {
    const held = deferredResponse();
    const commands: RequestInit[] = [];
    const activity = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          commands.push(init);
          return held.promise;
        }
        return Response.json({ items: [] });
      }),
    );
    renderWorkspace({ onActivityRecorded: activity });
    await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
    fillRequiredFields();
    const form = screen
      .getByRole('button', { name: 'Capture Request' })
      .closest('form');
    if (!form) throw new Error('Expected the public capture form');
    await act(async () => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]?.signal?.aborted).toBe(false);
    const command = commands[0];
    expect(commandBodyOf(command)).toBe(
      JSON.stringify({
        originalText: createdRequest.originalText,
        opportunity: {
          title: createdRequest.initialOpportunity.title,
          nextAction: createdRequest.initialOpportunity.nextAction,
        },
      }),
    );
    expect(idempotencyKeyOf(command)).toEqual(expect.any(String));
    await act(async () =>
      held.resolve(Response.json(createdRequest, { status: 201 })),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Quality process preparation',
      }),
    ).toBeVisible();
    expect(activity).toHaveBeenCalledOnce();
  });

  it('does not dispatch a retired Company read after its held token arrives, and permits a fresh return', async () => {
    let releaseToken: (token: string) => void = () => undefined;
    const heldToken = new Promise<string>((resolve) => {
      releaseToken = resolve;
    });
    const getToken = vi
      .fn()
      .mockImplementationOnce(() => heldToken)
      .mockResolvedValue('current-token');
    const identity = { ...deterministicBrowserIdentity(), getToken };
    const reads: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        reads.push(
          new Headers(init?.headers).get('x-company-context-id') ?? '',
        );
        return Response.json({ items: [] });
      }),
    );
    const view = render(workspaceElement(actor, {}, identity));
    await waitFor(() => expect(getToken).toHaveBeenCalledOnce());
    view.rerender(
      workspaceElement(
        actorForCompany('company-2', 'Second Company'),
        {},
        identity,
      ),
    );
    await screen.findByText('No Client Requests for Second Company yet.');
    expect(reads).toEqual(['company-2']);
    await act(async () => {
      releaseToken('retired-token');
      await heldToken;
    });
    expect(reads).toEqual(['company-2']);
    view.rerender(workspaceElement(actor, {}, identity));
    await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
    expect(reads).toEqual(['company-2', 'company-1']);
  });

  it('shows an empty active-Company list and explains the immutable manual source', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items: [] })),
    );

    renderWorkspace();

    expect(
      await screen.findByText('No Client Requests for PRISMA-PRIM yet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Company: PRISMA-PRIM')).toBeInTheDocument();
    expect(
      screen.getByText('This intake stores the request as manual text.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'After capture, the original request text, subject, source label, and reported received time cannot be changed.',
      ),
    ).toBeVisible();
  });

  it('creates a Request, records activity, and reopens its persisted detail', async () => {
    const activityRecorded = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ items: [] }))
        .mockResolvedValueOnce(Response.json(createdRequest, { status: 201 }))
        .mockResolvedValueOnce(
          Response.json({
            items: [requestListItemFor(createdRequest)],
          }),
        )
        .mockResolvedValueOnce(Response.json(createdRequest)),
    );

    renderWorkspace({ onActivityRecorded: activityRecorded });
    await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Quality process preparation',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Prepare quality process review'),
    ).toBeInTheDocument();
    expect(activityRecorded).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/commercial-intake/requests',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'idempotency-key': expect.any(String),
          'x-company-context-id': 'company-1',
        }),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to Requests' }));
    const requestTitle = await screen.findByText('Quality process preparation');
    const requestButton = requestTitle.closest('button');
    if (!requestButton) throw new Error('Expected a Request button.');
    fireEvent.click(requestButton);
    expect(
      await screen.findByText(createdRequest.originalText),
    ).toBeInTheDocument();
    expect(screen.getByText('Manual entry from a phone request')).toBeVisible();
    const receivedTime = screen
      .getByText('Reported received at')
      .nextElementSibling?.querySelector('time');
    expect(receivedTime).toHaveAttribute(
      'datetime',
      '2026-09-20T09:30:00.000Z',
    );
    expect(receivedTime).toHaveTextContent('2026');
  });

  it('shows the responsible actor and server capture time in the list and the reopened detail', async () => {
    const listed = requestListItemFor(createdRequest);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ items: [listed] }))
        .mockResolvedValueOnce(Response.json(createdRequest)),
    );

    renderWorkspace();

    const row = await screen.findByRole('button', {
      name: new RegExp(createdRequest.initialOpportunity.title, 'u'),
    });
    const rowCapturedAt = row.querySelector('time');
    expect(rowCapturedAt).toHaveAttribute(
      'datetime',
      createdRequest.capturedAt,
    );
    expect(row).toHaveTextContent(
      `${commercialIntakeCopy.capturedAt}: ${formatApplicationDateTime(
        createdRequest.capturedAt,
      )}`,
    );
    expect(row).toHaveTextContent(`${commercialIntakeCopy.responsible}: Iurie`);

    fireEvent.click(row);
    expect(
      await screen.findByText(createdRequest.originalText),
    ).toBeInTheDocument();
    const capturedAt = screen
      .getByText(commercialIntakeCopy.capturedAt)
      .nextElementSibling?.querySelector('time');
    expect(capturedAt).toHaveAttribute('datetime', createdRequest.capturedAt);
    expect(capturedAt).toHaveTextContent(
      formatApplicationDateTime(createdRequest.capturedAt),
    );
    expect(screen.getByText(commercialIntakeCopy.capturedAtHelp)).toBeVisible();
    // The server capture time stays a separate labelled fact from the
    // optional time the sender reported.
    const reportedReceivedAt = screen
      .getByText(commercialIntakeCopy.reportedReceivedAt)
      .nextElementSibling?.querySelector('time');
    expect(reportedReceivedAt).toHaveAttribute(
      'datetime',
      createdRequest.reportedReceivedAt,
    );
    expect(reportedReceivedAt).toHaveTextContent(
      formatApplicationDateTime(createdRequest.reportedReceivedAt),
    );
    expect(
      screen.getByText(`${commercialIntakeCopy.responsible}: Iurie`),
    ).toBeVisible();
  });

  it.each([
    ['a legacy v1 reader', actor],
    ['a next-action editor', editorActor()],
  ])(
    'shows %s the current next action of each loaded Request exactly as stored',
    async (_reader, reader) => {
      const storedNextAction = '  Confirm  the audit window '.padEnd(
        500,
        'and prepare the evidence ',
      );
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          Response.json({
            items: filterableItems.map((item) =>
              item.id === 'request-audit'
                ? {
                    ...item,
                    initialOpportunity: {
                      ...item.initialOpportunity,
                      nextAction: storedNextAction,
                    },
                  }
                : item,
            ),
          }),
        ),
      );

      render(workspaceElement(reader, {}));

      await screen.findByRole('list', { name: 'Client Requests' });
      expect(
        within(listedRequestButton(/^Annual audit support/u)).getByText(
          `${commercialIntakeCopy.nextAction}: ${storedNextAction}`,
          unnormalized,
        ),
      ).toBeVisible();
      expect(
        within(listedRequestButton(/^Quality process preparation/u)).getByText(
          `${commercialIntakeCopy.nextAction}: Arrange a qualification call`,
          unnormalized,
        ),
      ).toBeVisible();
      expect(
        within(listedRequestButton(/Operator training programme/u)).getByText(
          `${commercialIntakeCopy.nextAction}: Propose training dates`,
          unnormalized,
        ),
      ).toBeVisible();
    },
  );

  it('reports a detail response without the responsible actor as a failure', async () => {
    const { responsibleActor, ...opportunityWithoutActor } =
      createdRequest.initialOpportunity;
    expect(responsibleActor).toBeDefined();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ items: [] }))
        .mockResolvedValueOnce(
          Response.json(
            { ...createdRequest, initialOpportunity: opportunityWithoutActor },
            { status: 201 },
          ),
        ),
    );

    renderWorkspace();
    await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      commercialIntakeCopy.error,
    );
  });

  it('reports a detail response with contradictory responsible identities as a failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ items: [] }))
        .mockResolvedValueOnce(
          Response.json(
            {
              ...createdRequest,
              initialOpportunity: {
                ...createdRequest.initialOpportunity,
                responsibleActor: {
                  ...createdRequest.initialOpportunity.responsibleActor,
                  workspaceMembershipId: 'membership-2',
                },
              },
            },
            { status: 201 },
          ),
        ),
    );

    renderWorkspace();
    await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      commercialIntakeCopy.error,
    );
  });

  it('reports a list page with a non-canonical capture time instead of rendering it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          items: [{ ...listItem(0), capturedAt: '0' }],
        }),
      ),
    );

    renderWorkspace();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      commercialIntakeCopy.error,
    );
    expect(
      screen.getByRole('button', { name: commercialIntakeCopy.retry }),
    ).toBeVisible();
    expect(screen.queryByText('Client Request 0')).not.toBeInTheDocument();
  });

  it.each([
    ['missing', undefined],
    ['non-text', 42],
  ])(
    'reports a list page with a %s next action instead of rendering it',
    async (_case, nextAction) => {
      const item = listItem(0);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          Response.json({
            items: [
              {
                ...item,
                initialOpportunity: { ...item.initialOpportunity, nextAction },
              },
            ],
          }),
        ),
      );

      renderWorkspace();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        commercialIntakeCopy.error,
      );
      expect(
        screen.getByRole('button', { name: commercialIntakeCopy.retry }),
      ).toBeVisible();
      expect(screen.queryByText('Client Request 0')).not.toBeInTheDocument();
    },
  );

  it.each([
    ['capturedAt', { capturedAt: '2026' }],
    ['capturedAt', { capturedAt: '2024-02-30T10:00:00.000Z' }],
    ['reportedReceivedAt', { reportedReceivedAt: '2024-02-30T10:00:00.000Z' }],
  ])(
    'reports a reopened detail with a non-canonical %s instead of rendering it',
    async (_field, malformed) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(Response.json({ items: [listItem(0)] }))
          .mockResolvedValueOnce(
            Response.json({ ...createdRequest, ...malformed }),
          ),
      );

      renderWorkspace();
      fireEvent.click(
        await screen.findByRole('button', { name: requestButton(0) }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        commercialIntakeCopy.error,
      );
      // The rejected detail never replaces the loaded list.
      expect(
        screen.queryByText('Client Request detail'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('list', { name: 'Client Requests' }),
      ).toBeVisible();
    },
  );

  it('keeps entered fields after correctable validation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items: [] })),
    );
    renderWorkspace();
    await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
    changeValue(
      screen.getByLabelText('Original request text'),
      'A real request',
    );
    changeValue(screen.getByLabelText('Source label'), 'Phone note');
    fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter the required request and Opportunity fields.',
    );
    expect(screen.getByLabelText('Original request text')).toHaveValue(
      'A real request',
    );
    expect(screen.getByLabelText('Source label')).toHaveValue('Phone note');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([404, 409])(
    'shows one safe Client-unavailable message for an identified %i response',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(Response.json({ items: [] }))
          .mockResolvedValueOnce(
            Response.json([
              {
                id: 'client-1',
                displayName: 'Synthetic Client',
                relatedToActiveCompany: true,
              },
            ]),
          )
          .mockResolvedValueOnce(
            Response.json({ code: 'CLIENT_REFERENCE_UNAVAILABLE' }, { status }),
          ),
      );
      renderWorkspace();
      await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
      fillRequiredFields();
      changeValue(screen.getByLabelText('Search Clients by name'), 'Synthetic');
      fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      const client = await screen.findByLabelText('Existing Client');
      changeValue(client, 'client-1');
      fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The selected Client is no longer available. Refresh the Client search before trying again.',
      );
      expect(screen.getByLabelText('Existing Client')).toHaveValue('client-1');
    },
  );

  it('clears a selected Client when the search query changes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(
        Response.json([
          {
            id: 'client-1',
            displayName: 'Synthetic Client',
            relatedToActiveCompany: true,
          },
        ]),
      )
      .mockImplementationOnce((_input: unknown, init?: RequestInit) => {
        if (typeof init?.body !== 'string')
          throw new Error('Expected a JSON command body.');
        const command: unknown = JSON.parse(init.body);
        expect(command).not.toHaveProperty('clientAccountId');
        return Promise.resolve(Response.json(createdRequest, { status: 201 }));
      })
      .mockResolvedValueOnce(Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    renderWorkspace();
    await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
    changeValue(screen.getByLabelText('Search Clients by name'), 'Synthetic');
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    const client = await screen.findByLabelText('Existing Client');
    changeValue(client, 'client-1');
    changeValue(screen.getByLabelText('Search Clients by name'), '');
    expect(screen.queryByLabelText('Existing Client')).not.toBeInTheDocument();

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Quality process preparation',
      }),
    ).toBeInTheDocument();
  });

  it('notifies the shell when revoked Workspace access is confirmed', async () => {
    const rejectedWorkspace = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(new Response(null, { status: 403 })),
    );
    renderWorkspace({ onWorkspaceAccessRejected: rejectedWorkspace });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to access Commercial Intake.',
    );
    await waitFor(() => expect(rejectedWorkspace).toHaveBeenCalledOnce());
  });
  it('offers only Clients with an active relationship to the selected Company', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ items: [] }))
        .mockResolvedValueOnce(
          Response.json([
            {
              id: 'related',
              displayName: 'Related Client',
              relatedToActiveCompany: true,
            },
            {
              id: 'unrelated',
              displayName: 'Other Company Client',
              relatedToActiveCompany: false,
            },
          ]),
        ),
    );
    renderWorkspace();
    await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
    changeValue(screen.getByLabelText('Search Clients by name'), 'Client');
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    fireEvent.click(await screen.findByLabelText('Existing Client'));
    expect(
      await screen.findByRole('option', { name: 'Related Client' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('option', { name: 'Other Company Client' }),
    ).not.toBeInTheDocument();
  });

  it.each([undefined, 'true', null])(
    'does not trust an unvalidated Client relationship flag %s',
    async (relationship) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(Response.json({ items: [] }))
          .mockResolvedValueOnce(
            Response.json([
              {
                id: 'unproven',
                displayName: 'Unproven Client',
                relatedToActiveCompany: relationship,
              },
            ]),
          ),
      );
      renderWorkspace();
      await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
      changeValue(screen.getByLabelText('Search Clients by name'), 'Client');
      fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      expect(
        await screen.findByText(
          'The Client search could not be loaded. Please try again.',
        ),
      ).toBeVisible();
      expect(
        screen.queryByRole('option', { name: 'Unproven Client' }),
      ).not.toBeInTheDocument();
    },
  );
  it.each(['Company', 'Workspace'])(
    'clears visible Request data after %s access is revoked during Client search',
    async (scope) => {
      const companyRejected = vi.fn();
      const workspaceRejected = vi.fn();
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            Response.json({
              items: [
                buildRequestListItem({
                  id: 'request-1',
                  subject: 'Private Company request',
                  capturedAt: createdRequest.capturedAt,
                  initialOpportunity: {
                    title: 'Private opportunity',
                    nextAction: 'Private next action',
                    responsibleActor: {
                      workspaceMembershipId: 'membership-1',
                      displayName: 'Iurie',
                    },
                  },
                }),
              ],
            }),
          )
          .mockResolvedValueOnce(new Response(null, { status: 403 }))
          .mockResolvedValueOnce(new Response(null, { status: 403 }))
          .mockResolvedValueOnce(
            scope === 'Workspace'
              ? new Response(null, { status: 403 })
              : Response.json({ ...actor, activeCompany: undefined }),
          ),
      );
      renderWorkspace({
        onCompanyContextRejected: companyRejected,
        onWorkspaceAccessRejected: workspaceRejected,
      });
      await screen.findByText('Private Company request');
      changeValue(
        screen.getByLabelText('Original request text'),
        'Unsaved Company source',
      );
      changeValue(screen.getByLabelText('Search Clients by name'), 'Client');
      fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'You do not have permission to access Commercial Intake.',
      );
      expect(
        screen.queryByText('Private Company request'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText('Original request text'),
      ).not.toBeInTheDocument();
      if (scope === 'Workspace')
        expect(workspaceRejected).toHaveBeenCalledOnce();
      else expect(companyRejected).toHaveBeenCalledWith('company-1');
    },
  );

  it('retains authorized intake when revalidation confirms only Client search authority was lost', async () => {
    const actorRevalidated = vi.fn();
    const companyRejected = vi.fn();
    const workspaceRejected = vi.fn();
    const clientOnlyRevokedActor = {
      ...actor,
      activeCompany: actor.activeCompany && {
        ...actor.activeCompany,
        grants: withoutCompanyGrants(
          actor.activeCompany.grants,
          'company_director_client_access',
        ),
      },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ items: [] }))
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(Response.json(clientOnlyRevokedActor)),
    );
    renderWorkspace({
      onActorRevalidated: actorRevalidated,
      onCompanyContextRejected: companyRejected,
      onWorkspaceAccessRejected: workspaceRejected,
    });
    await screen.findByText('No Client Requests for PRISMA-PRIM yet.');
    changeValue(
      screen.getByLabelText('Original request text'),
      'Preserve my request',
    );
    changeValue(screen.getByLabelText('Search Clients by name'), 'Client');
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    expect(
      await screen.findByText(
        'Client search is not available. You can capture this Request without a Client.',
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(actorRevalidated).toHaveBeenCalledWith(clientOnlyRevokedActor),
    );
    expect(screen.getByLabelText('Original request text')).toHaveValue(
      'Preserve my request',
    );
    expect(
      screen.getByRole('button', { name: 'Capture Request' }),
    ).toBeVisible();
    expect(companyRejected).not.toHaveBeenCalled();
    expect(workspaceRejected).not.toHaveBeenCalled();
  });
  it('shows the authorized original Client reference without inventing a current dossier', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            items: [requestListItemFor(createdRequest)],
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            ...createdRequest,
            clientAssociationStatus: 'visible',
            clientReference: {
              originalClientId: 'managed-client',
              displayName: 'Managed Client',
            },
          }),
        ),
    );
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Quality process preparation/u,
      }),
    );
    expect(await screen.findByText('Managed Client')).toBeVisible();
  });

  it('reads the reopened detail with readable source, status, and Client labels', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            items: [requestListItemFor(createdRequest)],
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            ...createdRequest,
            clientAssociationStatus: 'visible',
            clientReference: {
              originalClientId: 'managed-client',
              displayName: 'Managed Client',
            },
          }),
        ),
    );
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Quality process preparation/u,
      }),
    );
    const detail = await screen.findByRole('article', {
      name: 'Quality process preparation',
    });

    expect(within(detail).getByText('Manual text')).toBeVisible();
    expect(within(detail).getByText(/^Status: Open · Since/u)).toBeVisible();
    expect(
      within(detail).getByText(commercialIntakeCopy.outcomeHistoryEmpty),
    ).toBeVisible();
    expect(within(detail).getByText(commercialIntakeCopy.client)).toBeVisible();
    expect(within(detail).getByText('Managed Client')).toBeVisible();
    expect(within(detail).getByText(createdRequest.originalText)).toBeVisible();
    expect(
      within(detail).getByText('Manual entry from a phone request'),
    ).toBeVisible();
    expect(
      within(detail).queryByText(/MANUAL_TEXT|OPEN/u),
    ).not.toBeInTheDocument();
  });

  it('shows the Opportunity version without an edit when the captured bundle lacks the update', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(requestListPage())
        .mockResolvedValueOnce(Response.json(createdRequest)),
    );
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Quality process preparation/u,
      }),
    );
    const detail = await screen.findByRole('article', {
      name: 'Quality process preparation',
    });
    expect(
      within(detail).getByText('Next action: Arrange a qualification call'),
    ).toBeVisible();
    expect(within(detail).getByText('Version: 1')).toBeVisible();
    expect(
      within(detail).queryByRole('button', { name: 'Edit next action' }),
    ).not.toBeInTheDocument();
  });

  it('edits the next action at the observed version and shows the stored result', async () => {
    const activityRecorded = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockResolvedValueOnce(updateResult('Send the qualification summary', 2))
      .mockResolvedValueOnce(requestListPage('Send the qualification summary'));
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing({ onActivityRecorded: activityRecorded });
    const input = screen.getByLabelText('Next action');
    expect(input).toHaveValue('Arrange a qualification call');
    changeValue(input, 'Send the qualification summary');
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    expect(
      await screen.findByText('Next action saved.', {
        selector: '[role="alert"]',
      }),
    ).toBeVisible();
    expect(
      screen.getByText('Next action: Send the qualification summary'),
    ).toBeVisible();
    expect(screen.getByText('Version: 2')).toBeVisible();
    expect(screen.getByText(createdRequest.originalText)).toBeVisible();
    expect(screen.queryByLabelText('Next action')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit next action' }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/commercial-intake/opportunities/opportunity-1/next-action',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          nextAction: 'Send the qualification summary',
        }),
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'idempotency-key': expect.any(String),
          'x-company-context-id': 'company-1',
        }),
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(activityRecorded).toHaveBeenCalledOnce();
  });

  it('shows the saved next action on the Request row after going Back', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockResolvedValueOnce(updateResult('Send the qualification summary', 2))
      .mockResolvedValueOnce(requestListPage('Send the qualification summary'));
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing();
    changeValue(
      screen.getByLabelText('Next action'),
      'Send the qualification summary',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
    const back = await screen.findByRole('button', {
      name: 'Back to Requests',
    });
    await waitFor(() => expect(back).toBeEnabled());
    fireEvent.click(back);

    const row = listedRequestButton(/^Quality process preparation/u);
    expect(
      within(row).getByText(
        `${commercialIntakeCopy.nextAction}: Send the qualification summary`,
      ),
    ).toBeVisible();
    expect(row).not.toHaveTextContent('Arrange a qualification call');
  });

  it('keeps the Request row next action after an unchanged receipt and Back', async () => {
    const activityRecorded = vi.fn();
    const stored = createdRequest.initialOpportunity.nextAction;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockResolvedValueOnce(updateResult(stored, 1, 'unchanged'))
      .mockResolvedValueOnce(requestListPage());
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing({ onActivityRecorded: activityRecorded });
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
    expect(
      await screen.findByText(commercialIntakeCopy.nextActionUnchanged, {
        selector: '[role="alert"]',
      }),
    ).toBeVisible();
    const back = screen.getByRole('button', { name: 'Back to Requests' });
    await waitFor(() => expect(back).toBeEnabled());
    fireEvent.click(back);

    expect(
      within(listedRequestButton(/^Quality process preparation/u)).getByText(
        `${commercialIntakeCopy.nextAction}: ${stored}`,
      ),
    ).toBeVisible();
    expect(activityRecorded).not.toHaveBeenCalled();
  });

  it('keeps the entered next action after a correctable validation error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest));
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing();
    changeValue(screen.getByLabelText('Next action'), '   ');
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    expect(
      screen.getByText('Enter a next action between 1 and 500 characters.', {
        selector: '[role="alert"]',
      }),
    ).toBeVisible();
    expect(screen.getByLabelText('Next action')).toHaveValue('   ');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows the saving state and blocks a second submit while the update is pending', async () => {
    const deferred = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockReturnValueOnce(deferred.promise)
      .mockResolvedValueOnce(requestListPage('Call back on Monday'));
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing();
    changeValue(screen.getByLabelText('Next action'), 'Call back on Monday');
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    expect(
      await screen.findByText('Saving next action…', {
        selector: '[role="status"]',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Save next action' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Next action')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => {
      deferred.resolve(updateResult('Call back on Monday', 2));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(await screen.findByText('Version: 2')).toBeVisible();
  });

  it('requires an explicit reload after a stale-version conflict', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockResolvedValueOnce(
        Response.json({ code: 'STALE_VERSION' }, { status: 409 }),
      )
      .mockResolvedValueOnce(
        Response.json(updatedRequest('Someone else moved first', 2)),
      );
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing();
    changeValue(screen.getByLabelText('Next action'), 'My stale edit');
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    expect(
      await screen.findByText(
        'This Opportunity changed since you loaded it. Reload the Request before editing again.',
        { selector: '[role="alert"]' },
      ),
    ).toBeVisible();
    expect(screen.queryByLabelText('Next action')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit next action' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload Request' }));

    expect(await screen.findByText('Version: 2')).toBeVisible();
    expect(
      screen.getByText('Next action: Someone else moved first'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Edit next action' }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/commercial-intake/requests/request-1',
      expect.anything(),
    );
  });

  it('keeps editing blocked when a conflict reload fails, until a valid detail reloads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockResolvedValueOnce(
        Response.json({ code: 'STALE_VERSION' }, { status: 409 }),
      )
      .mockResolvedValueOnce(Response.json({}, { status: 500 }))
      .mockResolvedValueOnce(
        Response.json(updatedRequest('Someone else moved first', 2)),
      );
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing();
    changeValue(screen.getByLabelText('Next action'), 'My stale edit');
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
    await screen.findByRole('button', { name: 'Reload Request' });

    fireEvent.click(screen.getByRole('button', { name: 'Reload Request' }));

    expect(
      await screen.findByText(
        'The Client Request could not be loaded or saved. Please try again.',
        { selector: '[role="alert"]' },
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Reload Request' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Edit next action' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reload Request' }));

    expect(await screen.findByText('Version: 2')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Edit next action' }),
    ).toBeVisible();
  });

  it('preserves the payload, observed version and key for an explicit retry after an uncertain outcome', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(updateResult('Book the site visit', 2))
      .mockResolvedValueOnce(requestListPage('Book the site visit'));
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing();
    changeValue(screen.getByLabelText('Next action'), 'Book the site visit');
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    expect(
      await screen.findByText(
        'The next action update did not complete. Retry to confirm the result.',
        { selector: '[role="alert"]' },
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Next action')).toHaveValue(
      'Book the site visit',
    );
    const uncertainInput = screen.getByLabelText('Next action');
    expect(uncertainInput).toBeDisabled();
    changeValue(uncertainInput, 'Replace the preserved command');
    expect(uncertainInput).toHaveValue('Book the site visit');
    fireEvent.click(screen.getByRole('button', { name: 'Retry update' }));

    expect(
      await screen.findByText('Next action saved.', {
        selector: '[role="alert"]',
      }),
    ).toBeVisible();
    expect(screen.getByText('Version: 2')).toBeVisible();
    const firstAttempt = fetchMock.mock.calls[2];
    const retry = fetchMock.mock.calls[3];
    expect(retry?.[0]).toBe(firstAttempt?.[0]);
    expect(retry?.[1]).toMatchObject({
      body: JSON.stringify({
        expectedVersion: 1,
        nextAction: 'Book the site visit',
      }),
    });
    expect(idempotencyKeyOf(retry?.[1])).toBeDefined();
    expect(idempotencyKeyOf(retry?.[1])).toBe(
      idempotencyKeyOf(firstAttempt?.[1]),
    );
  });

  it('drops the draft but keeps the read-only detail when only update authority is lost', async () => {
    const actorRevalidated = vi.fn();
    const companyRejected = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(Response.json(actor));
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing({
      onActorRevalidated: actorRevalidated,
      onCompanyContextRejected: companyRejected,
    });
    changeValue(screen.getByLabelText('Next action'), 'Denied edit');
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    expect(
      await screen.findByText(
        'You no longer have permission to update the next action of this Opportunity.',
        { selector: '[role="alert"]' },
      ),
    ).toBeVisible();
    await waitFor(() => expect(actorRevalidated).toHaveBeenCalledWith(actor));
    expect(screen.queryByLabelText('Next action')).not.toBeInTheDocument();
    expect(screen.getByText(createdRequest.originalText)).toBeVisible();
    expect(screen.getByText('Version: 1')).toBeVisible();
    expect(companyRejected).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not restore an obsolete draft when update authority is regranted in the same scope', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest));
    vi.stubGlobal('fetch', fetchMock);

    const { revalidateActor } = await openDetailForEditing();
    changeValue(screen.getByLabelText('Next action'), 'Obsolete draft');
    revalidateActor(actor);

    expect(
      screen.getByText(
        'You no longer have permission to update the next action of this Opportunity.',
        { selector: '[role="alert"]' },
      ),
    ).toBeVisible();
    expect(screen.queryByLabelText('Next action')).not.toBeInTheDocument();
    expect(screen.getByText(createdRequest.originalText)).toBeVisible();

    revalidateActor(editorActor());

    expect(screen.queryByLabelText('Next action')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit next action' }));
    expect(screen.getByLabelText('Next action')).toHaveValue(
      'Arrange a qualification call',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not replay an uncertain command when update authority is regranted in the same scope', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(updateResult('Book the site visit', 2))
      .mockResolvedValueOnce(requestListPage('Book the site visit'));
    vi.stubGlobal('fetch', fetchMock);

    const { revalidateActor } = await openDetailForEditing();
    changeValue(screen.getByLabelText('Next action'), 'Book the site visit');
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
    await screen.findByRole('button', { name: 'Retry update' });

    revalidateActor(editorActor());
    expect(screen.getByRole('button', { name: 'Retry update' })).toBeVisible();

    revalidateActor(actor);

    expect(
      screen.getByText(
        'You no longer have permission to update the next action of this Opportunity.',
        { selector: '[role="alert"]' },
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Retry update' }),
    ).not.toBeInTheDocument();

    revalidateActor(editorActor());

    expect(
      screen.queryByRole('button', { name: 'Retry update' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit next action' }));
    const input = screen.getByLabelText('Next action');
    expect(input).toHaveValue('Arrange a qualification call');
    changeValue(input, 'Book the site visit');
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    expect(
      await screen.findByText('Next action saved.', {
        selector: '[role="alert"]',
      }),
    ).toBeVisible();
    const uncertainAttempt = fetchMock.mock.calls[2];
    const freshCommand = fetchMock.mock.calls[3];
    expect(freshCommand?.[1]).toMatchObject({
      body: JSON.stringify({
        expectedVersion: 1,
        nextAction: 'Book the site visit',
      }),
    });
    expect(idempotencyKeyOf(freshCommand?.[1])).toBeDefined();
    expect(idempotencyKeyOf(freshCommand?.[1])).not.toBe(
      idempotencyKeyOf(uncertainAttempt?.[1]),
    );
  });

  it.each([
    {
      outcome: 'server error',
      settle: (save: DeferredResponse) =>
        save.resolve(Response.json({}, { status: 500 })),
    },
    {
      outcome: 'network failure',
      settle: (save: DeferredResponse) =>
        save.reject(new TypeError('Failed to fetch')),
    },
    {
      outcome: 'validation error',
      settle: (save: DeferredResponse) =>
        save.resolve(Response.json({ code: 'VALIDATION' }, { status: 400 })),
    },
  ])(
    'retires an in-flight update whose delayed $outcome arrives after update authority is lost and regranted',
    async ({ settle }) => {
      const save = deferredResponse();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(requestListPage())
        .mockResolvedValueOnce(Response.json(createdRequest))
        .mockReturnValueOnce(save.promise);
      vi.stubGlobal('fetch', fetchMock);

      const { revalidateActor } = await openDetailForEditing();
      changeValue(
        screen.getByLabelText('Next action'),
        'Obsolete in-flight edit',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
      expect(
        await screen.findByText('Saving next action…', {
          selector: '[role="status"]',
        }),
      ).toBeVisible();

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
      revalidateActor(actor);
      revalidateActor(editorActor());

      expect(
        screen.getByRole('button', { name: 'Edit next action' }),
      ).toBeEnabled();
      await act(async () => {
        settle(save);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(
        screen.getByText(
          'You no longer have permission to update the next action of this Opportunity.',
          { selector: '[role="alert"]' },
        ),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Retry update' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Next action')).not.toBeInTheDocument();
      expect(screen.getByText('Version: 1')).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Back to Requests' }),
      ).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Edit next action' }));
      expect(screen.getByLabelText('Next action')).toHaveValue(
        'Arrange a qualification call',
      );
      expect(fetchMock).toHaveBeenCalledTimes(3);
    },
  );

  it('returns to the reloaded list when the Opportunity is no longer available', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await openDetailForEditing();
    changeValue(
      screen.getByLabelText('Next action'),
      'Edit of a vanished Opportunity',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    expect(
      await screen.findByText(
        'This Request is no longer available in the active Company. Reload the list.',
        { selector: '[role="alert"]' },
      ),
    ).toBeVisible();
    expect(
      await screen.findByText('No Client Requests for PRISMA-PRIM yet.'),
    ).toBeVisible();
    expect(
      screen.queryByText(createdRequest.originalText),
    ).not.toBeInTheDocument();
  });

  it('retires a late All Requests response after selecting My open cases even when transport ignores abort', async () => {
    const lateAll = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(lateAll.promise)
      .mockResolvedValueOnce(Response.json({ items: [listItem(77)] }));
    vi.stubGlobal('fetch', fetchMock);
    renderWorkspace();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    changeValue(
      screen.getByRole('combobox', { name: 'Request view' }),
      'mine_open',
    );
    expect(
      await screen.findByRole('button', { name: requestButton(77) }),
    ).toBeVisible();
    await act(async () => {
      lateAll.resolve(
        Response.json({ items: newestPage, nextCursor: 'retired-all' }),
      );
    });
    expect(visibleRequests()).toBe(1);
    expect(
      screen.queryByRole('button', { name: requestButton(0) }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show older Requests' }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/commercial-intake/requests?limit=25&view=mine_open',
      expect.anything(),
    );
  });

  it('retires an older page and resets cursors on each view switch while preserving the loaded text filter', async () => {
    const lateOlder = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: newestPage, nextCursor: 'all-older' }),
      )
      .mockReturnValueOnce(lateOlder.promise)
      .mockResolvedValueOnce(
        Response.json({ items: [listItem(77)], nextCursor: 'mine-older' }),
      )
      .mockResolvedValueOnce(Response.json({ items: [listItem(78)] }))
      .mockResolvedValueOnce(Response.json({ items: newestPage }));
    vi.stubGlobal('fetch', fetchMock);
    renderWorkspace();
    await screen.findByRole('button', { name: requestButton(0) });
    changeValue(
      screen.getByLabelText('Filter loaded Client Requests'),
      'Client Request 78',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    changeValue(
      screen.getByRole('combobox', { name: 'Request view' }),
      'mine_open',
    );
    expect(
      await screen.findByText(commercialIntakeCopy.filterNoMatch),
    ).toBeVisible();
    await act(async () => {
      lateOlder.resolve(
        Response.json({ items: olderPage, nextCursor: 'retired-older' }),
      );
    });
    expect(screen.getByLabelText('Filter loaded Client Requests')).toHaveValue(
      'Client Request 78',
    );
    expect(
      screen.queryByRole('button', { name: requestButton(26) }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );
    expect(
      await screen.findByRole('button', { name: requestButton(78) }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/commercial-intake/requests?limit=25&cursor=mine-older&view=mine_open',
      expect.anything(),
    );
    changeValue(screen.getByRole('combobox', { name: 'Request view' }), 'all');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      '/api/commercial-intake/requests?limit=25',
      expect.anything(),
    );
    expect(screen.getByLabelText('Filter loaded Client Requests')).toHaveValue(
      'Client Request 78',
    );
  });

  it('keeps a selected detail and exact uncertain next-action retry across a view switch and refreshes the current view after save', async () => {
    const literal = '  Call {Client} / Позвонить  ';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json(createdRequest))
      .mockRejectedValueOnce(new TypeError('Connection lost'))
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(updateResult(literal, 2))
      .mockResolvedValueOnce(Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await openDetailForEditing();
    changeValue(screen.getByLabelText('Next action'), literal);
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
    await screen.findByRole('button', { name: 'Retry update' });
    const originalBody = commandBodyOf(fetchMock.mock.calls[2]?.[1]);
    const originalKey = idempotencyKeyOf(fetchMock.mock.calls[2]?.[1]);
    changeValue(
      screen.getByRole('combobox', { name: 'Request view' }),
      'mine_open',
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(screen.getByText(createdRequest.originalText)).toBeVisible();
    expect(screen.getByLabelText('Next action')).toHaveValue(literal);
    expect(screen.getByLabelText('Next action')).toBeDisabled();
    expect(screen.getByText('Version: 1')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry update' }));
    expect(await screen.findByText('Version: 2')).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    expect(commandBodyOf(fetchMock.mock.calls[4]?.[1])).toBe(originalBody);
    expect(idempotencyKeyOf(fetchMock.mock.calls[4]?.[1])).toBe(originalKey);
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      '/api/commercial-intake/requests?limit=25&view=mine_open',
      expect.anything(),
    );
    expect(screen.getByText(createdRequest.originalText)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Requests' }));
    expect(
      await screen.findByText(
        'No open cases are assigned to you in PRISMA-PRIM.',
      ),
    ).toBeVisible();
  });

  it('keeps a capture draft and its uncertain command identity when the personal view is empty', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockRejectedValueOnce(new TypeError('Connection lost'))
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockRejectedValueOnce(new TypeError('Connection lost'));
    vi.stubGlobal('fetch', fetchMock);
    renderWorkspace();
    await screen.findByText('Quality process preparation');
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));
    await screen.findByRole('alert');
    changeValue(
      screen.getByRole('combobox', { name: 'Request view' }),
      'mine_open',
    );
    expect(
      await screen.findByText(
        'No open cases are assigned to you in PRISMA-PRIM.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Original request text')).toHaveValue(
      createdRequest.originalText,
    );
    expect(screen.getByLabelText('Next action')).toHaveValue(
      createdRequest.initialOpportunity.nextAction,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(commandBodyOf(fetchMock.mock.calls[3]?.[1])).toBe(
      commandBodyOf(fetchMock.mock.calls[1]?.[1]),
    );
    expect(idempotencyKeyOf(fetchMock.mock.calls[3]?.[1])).toBe(
      idempotencyKeyOf(fetchMock.mock.calls[1]?.[1]),
    );
  });

  it('separates an empty personal set, malformed replies and an older-page retry after no loaded text match', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(requestListPage())
      .mockResolvedValueOnce(Response.json({ items: 'malformed' }))
      .mockResolvedValueOnce(
        Response.json({ items: [listItem(77)], nextCursor: 'mine-retry' }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ items: [listItem(78)] }));
    vi.stubGlobal('fetch', fetchMock);
    renderWorkspace();
    await screen.findByText('Quality process preparation');
    const view = screen.getByRole('combobox', { name: 'Request view' });
    changeValue(view, 'mine_open');
    expect(
      await screen.findByText(
        'No open cases are assigned to you in PRISMA-PRIM.',
      ),
    ).toBeVisible();
    changeValue(view, 'all');
    await screen.findByText('Quality process preparation');
    changeValue(view, 'mine_open');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      commercialIntakeCopy.error,
    );
    expect(
      screen.queryByText('No open cases are assigned to you in PRISMA-PRIM.'),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: commercialIntakeCopy.retry }),
    );
    await screen.findByRole('button', { name: requestButton(77) });
    changeValue(
      screen.getByLabelText('Filter loaded Client Requests'),
      'Client Request 78',
    );
    expect(screen.getByText(commercialIntakeCopy.filterNoMatch)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );
    expect(
      await screen.findByText(commercialIntakeCopy.olderError),
    ).toBeVisible();
    expect(screen.getByText(commercialIntakeCopy.filterNoMatch)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );
    expect(
      await screen.findByRole('button', { name: requestButton(78) }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      '/api/commercial-intake/requests?limit=25&cursor=mine-retry&view=mine_open',
      expect.anything(),
    );
  });

  it('retires a delayed personal page and resets the view when Company context changes', async () => {
    const latePersonal = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [listItem(0)] }))
      .mockReturnValueOnce(latePersonal.promise)
      .mockResolvedValueOnce(
        Response.json({
          items: [{ ...listItem(99), subject: 'New Company Request' }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { selectCompany } = renderWorkspace();
    await screen.findByRole('button', { name: requestButton(0) });
    changeValue(
      screen.getByRole('combobox', { name: 'Request view' }),
      'mine_open',
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    selectCompany(actorForCompany('company-2', 'Second Company'));
    expect(await screen.findByText('New Company Request')).toBeVisible();
    await act(async () => {
      latePersonal.resolve(Response.json({ items: [listItem(77)] }));
    });
    expect(
      screen.queryByRole('button', { name: requestButton(77) }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Request view' }),
    ).toHaveAttribute('data-value', 'all');
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/commercial-intake/requests?limit=25',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-company-context-id': 'company-2',
        }),
      }),
    );
  });

  it('pages past the newest 25 Requests and reopens an older one', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ items: newestPage, nextCursor: 'cursor-page-2' }),
        )
        .mockResolvedValueOnce(Response.json({ items: olderPage }))
        .mockResolvedValueOnce(
          Response.json({
            ...createdRequest,
            id: 'request-26',
            subject: 'Client Request 26',
          }),
        ),
    );

    renderWorkspace();
    expect(
      await screen.findByRole('button', { name: requestButton(0) }),
    ).toBeVisible();
    expect(visibleRequests()).toBe(25);
    expect(
      screen.queryByRole('button', { name: requestButton(26) }),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/commercial-intake/requests?limit=25',
      expect.anything(),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );
    expect(
      await screen.findByRole('button', { name: requestButton(26) }),
    ).toBeVisible();
    expect(visibleRequests()).toBe(28);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/commercial-intake/requests?limit=25&cursor=cursor-page-2',
      expect.anything(),
    );
    expect(
      screen.queryByRole('button', { name: 'Show older Requests' }),
    ).not.toBeInTheDocument();
    // Appended rows carry their own next action; loaded rows keep theirs.
    expect(
      within(listedRequestButton(requestButton(26))).getByText(
        `${commercialIntakeCopy.nextAction}: Follow up Request 26`,
      ),
    ).toBeVisible();
    expect(
      within(listedRequestButton(requestButton(0))).getByText(
        `${commercialIntakeCopy.nextAction}: Follow up Request 0`,
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: requestButton(26) }));
    expect(
      await screen.findByText(createdRequest.originalText),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/commercial-intake/requests/request-26',
      expect.anything(),
    );
  });

  it('associates an older loaded Request without replacing either loaded page', async () => {
    const onOpenClientDossier = vi.fn();
    const detail = deferredResponse();
    const olderRequest = {
      ...createdRequest,
      id: 'request-26',
      subject: 'Client Request 26',
    };
    const associatedRequest = {
      ...olderRequest,
      version: 2,
      clientAssociationStatus: 'visible',
      clientReference: {
        originalClientId: 'client-1',
        currentClientId: 'client-1',
        displayName: 'Associated Client',
      },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ items: newestPage, nextCursor: 'cursor-page-2' }),
        )
        .mockResolvedValueOnce(Response.json({ items: olderPage }))
        .mockReturnValueOnce(detail.promise)
        .mockResolvedValueOnce(
          Response.json([
            {
              id: 'client-1',
              displayName: 'Associated Client',
              relatedToActiveCompany: true,
            },
          ]),
        )
        .mockResolvedValueOnce(
          Response.json({
            receipt: {
              requestId: 'request-26',
              version: 2,
              outcome: 'associated',
            },
            request: associatedRequest,
          }),
        ),
    );

    render(
      workspaceElement(
        {
          ...actor,
          activeCompany: actor.activeCompany
            ? {
                ...actor.activeCompany,
                // v3 is the first version with the Client association.
                grants: withCompanyGrants(actor.activeCompany.grants, {
                  bundle: 'company_commercial_intake',
                  version: 'v3',
                  assignmentId: 'intake-assignment',
                }),
              }
            : undefined,
        },
        { onOpenClientDossier },
      ),
    );
    await screen.findByRole('button', { name: requestButton(0) });
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: requestButton(26) }),
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        '/api/commercial-intake/requests/request-26',
        expect.anything(),
      ),
    );
    // Apply the opened detail and its form effects before entering the search.
    await act(async () => {
      detail.resolve(Response.json(olderRequest));
    });
    await screen.findByRole('heading', { name: 'Associate a Client' });
    changeValue(screen.getByLabelText('Search Clients by name'), 'Associated');
    expect(screen.getByLabelText('Search Clients by name')).toHaveValue(
      'Associated',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    changeValue(await screen.findByLabelText('Existing Client'), 'client-1');
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      '/api/clients/search?query=Associated',
      expect.anything(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm Client association' }),
    );
    await screen.findByText('Client associated.', {
      selector: '[role="alert"]',
    });
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      '/api/commercial-intake/requests/request-26/client-association',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          clientAccountId: 'client-1',
        }),
        headers: expect.objectContaining({
          'idempotency-key': expect.any(String),
          'x-company-context-id': 'company-1',
        }),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to Requests' }));

    expect(visibleRequests()).toBe(28);
    expect(screen.getByText('Client: Associated Client')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', {
        name: commercialIntakeCopy.openClientDossier,
      }),
    );
    expect(onOpenClientDossier).toHaveBeenCalledWith('client-1');
  });

  it('keeps dossier navigation on a reloaded associated list row', async () => {
    const onOpenClientDossier = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          items: [
            {
              ...listItem(0),
              clientDossierId: 'client-1',
              clientDisplayName: 'Associated Client',
            },
          ],
        }),
      ),
    );

    renderWorkspace({ onOpenClientDossier });
    expect(await screen.findByText('Client: Associated Client')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', {
        name: commercialIntakeCopy.openClientDossier,
      }),
    );

    expect(onOpenClientDossier).toHaveBeenCalledWith('client-1');
  });

  it('rejects a list dossier identifier without its Client-owned display name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          items: [{ ...listItem(0), clientDossierId: 'client-1' }],
        }),
      ),
    );

    renderWorkspace({ onOpenClientDossier: vi.fn() });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      commercialIntakeCopy.error,
    );
    expect(
      screen.queryByRole('button', {
        name: commercialIntakeCopy.openClientDossier,
      }),
    ).not.toBeInTheDocument();
  });

  it('keeps the first page visible when an older page cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ items: newestPage, nextCursor: 'cursor-page-2' }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 500 })),
    );

    renderWorkspace();
    expect(
      await screen.findByRole('button', { name: requestButton(0) }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Older Client Requests could not be loaded. Please try again.',
    );
    expect(visibleRequests()).toBe(25);
    expect(
      screen.getByRole('button', { name: 'Show older Requests' }),
    ).toBeVisible();
  });

  it('never appends an older page captured before the active Company changed', async () => {
    const stalePage = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: newestPage, nextCursor: 'cursor-page-2' }),
      )
      .mockReturnValueOnce(stalePage.promise)
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              ...listItem(99),
              subject: 'Second Company request',
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { selectCompany } = renderWorkspace();
    expect(
      await screen.findByRole('button', { name: requestButton(0) }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    selectCompany(actorForCompany('company-2', 'Second Company'));
    expect(await screen.findByText('Second Company request')).toBeVisible();

    await act(async () => {
      stalePage.resolve(Response.json({ items: olderPage }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(visibleRequests()).toBe(1);
    expect(
      screen.queryByRole('button', { name: requestButton(26) }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: requestButton(0) }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/commercial-intake/requests?limit=25',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-company-context-id': 'company-2',
        }),
      }),
    );
  });

  it('clears the loaded pages when access is revoked while loading older Requests', async () => {
    const rejectedWorkspace = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ items: newestPage, nextCursor: 'cursor-page-2' }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(new Response(null, { status: 403 })),
    );

    renderWorkspace({ onWorkspaceAccessRejected: rejectedWorkspace });
    expect(
      await screen.findByRole('button', { name: requestButton(0) }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to access Commercial Intake.',
    );
    expect(
      screen.queryByRole('button', { name: requestButton(0) }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show older Requests' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(rejectedWorkspace).toHaveBeenCalledOnce());
  });

  it('filters the loaded Requests by subject, Opportunity title or responsible actor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items: filterableItems })),
    );

    renderWorkspace();
    expect(await screen.findByText('Annual audit support')).toBeVisible();
    expect(visibleRequests()).toBe(3);

    applyFilter('  QUALITY ');
    expect(visibleRequests()).toBe(1);
    expect(screen.getByText('Quality process preparation')).toBeVisible();

    applyFilter('training');
    expect(visibleRequests()).toBe(1);
    expect(screen.getByText('Operator training programme')).toBeVisible();

    applyFilter('ada');
    expect(visibleRequests()).toBe(1);
    expect(screen.getByText('Annual audit support')).toBeVisible();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reports no matching loaded Requests without reading the unloaded original source', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items: filterableItems })),
    );

    renderWorkspace();
    expect(await screen.findByText('Annual audit support')).toBeVisible();

    applyFilter('internal quality processes');
    expect(visibleRequests()).toBe(0);
    expect(
      screen.getByText(commercialIntakeCopy.filterNoMatch),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No Client Requests for PRISMA-PRIM yet.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(commercialIntakeCopy.filterHelp)).toBeVisible();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('does not filter the loaded Requests by the next action shown in each row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items: filterableItems })),
    );

    renderWorkspace();
    expect(
      await screen.findByText(
        `${commercialIntakeCopy.nextAction}: Confirm the audit window`,
      ),
    ).toBeVisible();

    applyFilter('audit window');
    expect(visibleRequests()).toBe(0);
    expect(
      screen.getByText(commercialIntakeCopy.filterNoMatch),
    ).toBeInTheDocument();
  });

  it('offers no filter for a genuinely empty Company list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items: [] })),
    );

    renderWorkspace();
    expect(
      await screen.findByText('No Client Requests for PRISMA-PRIM yet.'),
    ).toBeVisible();
    expect(
      screen.queryByLabelText(commercialIntakeCopy.filterLabel),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(commercialIntakeCopy.filterNoMatch),
    ).not.toBeInTheDocument();
  });

  it('keeps older Requests reachable from a filter with no current match and filters the new rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ items: newestPage, nextCursor: 'cursor-page-2' }),
        )
        .mockResolvedValueOnce(Response.json({ items: olderPage })),
    );

    renderWorkspace();
    expect(
      await screen.findByRole('button', { name: requestButton(0) }),
    ).toBeVisible();

    applyFilter('Client Request 26');
    expect(visibleRequests()).toBe(0);
    expect(
      screen.getByText(commercialIntakeCopy.filterNoMatch),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );
    expect(
      await screen.findByRole('button', { name: requestButton(26) }),
    ).toBeVisible();
    expect(visibleRequests()).toBe(1);
    expect(
      screen.queryByText(commercialIntakeCopy.filterNoMatch),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/commercial-intake/requests?limit=25&cursor=cursor-page-2',
      expect.anything(),
    );
  });

  it('separates an older-page failure from a filter with no current match', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ items: newestPage, nextCursor: 'cursor-page-2' }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 500 })),
    );

    renderWorkspace();
    expect(
      await screen.findByRole('button', { name: requestButton(0) }),
    ).toBeVisible();
    applyFilter('Client Request 26');
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Older Client Requests could not be loaded. Please try again.',
    );
    expect(
      screen.getByText(commercialIntakeCopy.filterNoMatch),
    ).toBeInTheDocument();
    expect(visibleRequests()).toBe(0);
    expect(
      screen.getByRole('button', { name: 'Show older Requests' }),
    ).toBeVisible();
  });

  it('restores every loaded Request through the clear action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items: filterableItems })),
    );

    renderWorkspace();
    expect(await screen.findByText('Annual audit support')).toBeVisible();
    applyFilter('Annual');
    expect(visibleRequests()).toBe(1);

    fireEvent.click(
      screen.getByRole('button', { name: commercialIntakeCopy.filterClear }),
    );
    expect(visibleRequests()).toBe(3);
    expect(filterInput()).toHaveValue('');
    expect(filterInput()).toHaveFocus();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('preserves the filter while a Request detail is opened and closed', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ items: filterableItems }))
        .mockResolvedValueOnce(Response.json(createdRequest)),
    );

    renderWorkspace();
    expect(await screen.findByText('Annual audit support')).toBeVisible();
    applyFilter('Quality');
    fireEvent.click(
      screen.getByRole('button', { name: /Quality process preparation/u }),
    );
    expect(
      await screen.findByText(createdRequest.originalText),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Requests' }));
    expect(filterInput()).toHaveValue('Quality');
    expect(visibleRequests()).toBe(1);
  });

  it('keeps an unsaved form and the uncertain retry key when the filter changes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: filterableItems }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    renderWorkspace();
    expect(await screen.findByText('Annual audit support')).toBeVisible();
    fillRequiredFields();
    changeValue(screen.getByLabelText('Source label'), 'Phone note');
    fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Client Request could not be loaded or saved. Please try again.',
    );

    applyFilter('Annual');
    expect(visibleRequests()).toBe(1);
    expect(screen.getByLabelText('Original request text')).toHaveValue(
      createdRequest.originalText,
    );
    expect(screen.getByLabelText('Source label')).toHaveValue('Phone note');

    fireEvent.click(screen.getByRole('button', { name: 'Capture Request' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const firstAttempt = idempotencyKeyOf(fetchMock.mock.calls[1]?.[1]);
    const firstBody = commandBodyOf(fetchMock.mock.calls[1]?.[1]);
    expect(firstAttempt).toEqual(expect.any(String));
    expect(firstBody).toEqual(expect.any(String));
    expect(idempotencyKeyOf(fetchMock.mock.calls[2]?.[1])).toBe(firstAttempt);
    expect(commandBodyOf(fetchMock.mock.calls[2]?.[1])).toBe(firstBody);
  });

  it('clears an obsolete filter and ignores a late page when the active Company changes', async () => {
    const stalePage = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: newestPage, nextCursor: 'cursor-page-2' }),
      )
      .mockReturnValueOnce(stalePage.promise)
      .mockResolvedValueOnce(
        Response.json({
          items: [{ ...listItem(99), subject: 'Second Company request' }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { selectCompany } = renderWorkspace();
    expect(
      await screen.findByRole('button', { name: requestButton(0) }),
    ).toBeVisible();
    applyFilter('Client Request 0');
    expect(visibleRequests()).toBe(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Requests' }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    selectCompany(actorForCompany('company-2', 'Second Company'));

    expect(await screen.findByText('Second Company request')).toBeVisible();
    expect(filterInput()).toHaveValue('');

    await act(async () => {
      stalePage.resolve(Response.json({ items: olderPage }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(visibleRequests()).toBe(1);
    expect(
      screen.queryByRole('button', { name: requestButton(26) }),
    ).not.toBeInTheDocument();
  });
});
