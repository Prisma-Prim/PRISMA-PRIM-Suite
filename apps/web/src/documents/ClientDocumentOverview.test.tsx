import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { ActorContext } from '../access-types';
import { deterministicBrowserIdentity } from '../access-composition';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { selectOptionByLabel } from '../test/select-option';
import { ClientDocumentOverview } from './ClientDocumentOverview';

const company: NonNullable<ActorContext['activeCompany']> = {
  id: 'company',
  displayName: 'PRISMA-PRIM',
  clientPermissions: ['client.read'],
  clientPermissionAssignmentId: 'client-capture',
  clientPermissionSetVersion: 'v2',
  documentPermissions: [
    'document.read',
    'document.mission_deliverable.access',
    'document.received_contract.access',
  ],
  documentPermissionAssignmentId: 'documents-capture',
  documentPermissionSetVersion: 'v3',
  missionDeliverableAccessAssignmentId: 'mission-capture',
  missionDeliverableAccessPermissionSetVersion: 'v1',
  receivedContractAccessAssignmentId: 'received-capture',
  receivedContractAccessPermissionSetVersion: 'v1',
};
const actor: ActorContext = {
  internalUserId: 'reader',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Reader',
  email: 'reader@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: company,
};
const identity = deterministicBrowserIdentity();
function document(index = 0, fields: Record<string, unknown> = {}) {
  return {
    id: `document-${index}`,
    companyId: company.id,
    clientId: 'original',
    clientDossierId: 'client',
    clientDisplayName: 'Literal Client',
    title: `Piece ${index}`,
    purpose: 'Literal purpose',
    type: 'questionnaire',
    confidentiality: 'company-confidential',
    createdAt: '2026-10-26T08:00:00.000Z',
    workingRevision: 1,
    correction: 'allowed',
    version: {
      id: `version-${index}`,
      status: 'draft',
      representation: {
        id: `ref-${index}`,
        kind: 'external-reference',
        verification: 'unverified',
        access: 'granted',
        url: 'https://example.test/protected-reference',
      },
    },
    ...fields,
  };
}
function mission(index = 30) {
  return document(index, {
    type: 'mission-deliverable',
    version: { id: `v-${index}`, status: 'official', representation: null },
  });
}
function received() {
  return document(40, {
    type: 'received-contract',
    version: { id: 'v-40', status: 'draft', representation: null },
    receivedContractRelation: { access: 'denied' },
  });
}
function server(initial: unknown = [document()]) {
  let value = initial,
    held = false;
  const calls: {
    path: string;
    method: string;
    signal: AbortSignal | null | undefined;
  }[] = [];
  const waiting: ((response: Response) => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), 'http://example.test').pathname;
      calls.push({ path, method: init?.method ?? 'GET', signal: init?.signal });
      if (path === '/api/access/current-actor') return Response.json(actor);
      if (path !== '/api/documents')
        throw new Error(`Unexpected HTTP request ${path}`);
      if (held)
        return new Promise<Response>((resolve) => waiting.push(resolve));
      return Response.json(value);
    }),
  );
  return {
    calls,
    waiting,
    hold() {
      held = true;
    },
    set(next: unknown) {
      value = next;
    },
    async release(index: number, next: unknown, status = 200) {
      const resolve = waiting[index];
      if (!resolve) throw new Error('No held request');
      await act(async () => resolve(Response.json(next, { status })));
    },
  };
}
type Props = ComponentProps<typeof ClientDocumentOverview>;
function show(overrides: Partial<Props> = {}) {
  let props: Props = {
    actor,
    identity,
    clientDossierId: 'client',
    clientIdentityRevision: 0,
    onOpenDocument: vi.fn(),
    onCompanyContextRejected: vi.fn(),
    onActorRevalidated: vi.fn(),
    ...overrides,
  };
  const ui = () => (
    <>
      <InterfaceLocaleSelect />
      <ClientDocumentOverview {...props} />
    </>
  );
  const view = render(ui());
  return {
    get props() {
      return props;
    },
    update(next: Partial<Props>) {
      props = { ...props, ...next };
      view.rerender(ui());
    },
  };
}
function region() {
  return screen.getByRole('region', { name: 'Client Documents' });
}
function button(name: string) {
  return within(region()).getByRole('button', { name });
}
async function ready() {
  await within(region()).findAllByRole('listitem');
}
afterEach(() => vi.unstubAllGlobals());

it('finds every exact dossier match behind unrelated same-name records with local25 windows and no content reads', async () => {
  const api = server([
    ...Array.from({ length: 52 }, (_, i) =>
      document(100 + i, { clientDossierId: 'same-name-other' }),
    ),
    ...Array.from({ length: 26 }, (_, i) => document(i)),
  ]);
  const view = show();
  await ready();
  expect(within(region()).getAllByRole('listitem')).toHaveLength(25);
  expect(within(region()).queryByText('Piece 100')).not.toBeInTheDocument();
  expect(
    within(region())
      .getAllByRole('heading', { level: 5 })
      .map((h) => h.textContent),
  ).toEqual(Array.from({ length: 25 }, (_, i) => `Piece ${i}`));
  expect(within(region()).queryByRole('link')).not.toBeInTheDocument();
  fireEvent.click(button('Next Documents'));
  expect(within(region()).getAllByRole('listitem')).toHaveLength(1);
  expect(region()).toHaveTextContent('Piece 25');
  expect(button('Next Documents')).toBeDisabled();
  expect(api.calls.map((c) => [c.method, c.path])).toEqual([
    ['GET', '/api/documents'],
  ]);
  fireEvent.click(button('Open Document'));
  expect(view.props.onOpenDocument).toHaveBeenCalledWith(
    expect.objectContaining({ documentId: 'document-25', focus: 'document' }),
  );
  fireEvent.click(button('Previous Documents'));
  expect(region()).not.toHaveTextContent('Piece 25');
  expect(api.calls).toHaveLength(1);
});

it.each(['missing-version', 'foreign', 'duplicate', 'unknown-status'])(
  'keeps %s metadata unavailable instead of showing an empty or unsafe directory',
  async (kind) => {
    const bad =
      kind === 'foreign'
        ? [document(0, { companyId: 'foreign-company' })]
        : kind === 'duplicate'
          ? [document(), document()]
          : [
              document(0, {
                version: {
                  id: kind === 'missing-version' ? '' : 'v',
                  status: kind === 'unknown-status' ? 'accepted' : 'draft',
                  representation: {
                    id: 'r',
                    kind: 'external-reference',
                    verification: 'unverified',
                    access: 'denied',
                  },
                },
              }),
            ];
    server(bad);
    show();
    expect(await within(region()).findByRole('alert')).toHaveTextContent(
      'Client Documents could not be loaded',
    );
    expect(within(region()).queryByRole('listitem')).not.toBeInTheDocument();
    expect(region()).not.toHaveTextContent('No Documents for');
  },
);

it('distinguishes empty matching data and refreshes it without writes', async () => {
  const api = server([document(0, { clientDossierId: undefined })]);
  show();
  await within(region()).findByText(
    'No Documents for this Client in this Company.',
  );
  api.set([document()]);
  fireEvent.click(button('Refresh Documents from beginning'));
  await ready();
  expect(region()).toHaveTextContent('Piece 0');
  expect(api.calls.every((c) => c.method === 'GET')).toBe(true);
});

it.each(['no-read', 'missing-capture', 'no-client', 'signed-out'])(
  'issues no discovery under %s authority',
  async (condition) => {
    const api = server();
    const companyOverride: Partial<NonNullable<ActorContext['activeCompany']>> =
      condition === 'no-read'
        ? { documentPermissions: [] }
        : condition === 'missing-capture'
          ? { documentPermissionSetVersion: undefined }
          : condition === 'no-client'
            ? { clientPermissions: [] }
            : {};
    show({
      actor: { ...actor, activeCompany: { ...company, ...companyOverride } },
      identity:
        condition === 'signed-out'
          ? { ...identity, signedIn: false }
          : identity,
    });
    await act(async () => undefined);
    expect(api.calls).toHaveLength(0);
    expect(
      screen.queryByRole('region', { name: 'Client Documents' }),
    ).not.toBeInTheDocument();
  },
);

it('honors the existing Workspace Client-read alternative and keeps content grants independent of metadata', async () => {
  const api = server();
  const workspaceCompany = {
    ...company,
    clientPermissions: [],
    clientPermissionAssignmentId: undefined,
  };
  const view = show({
    actor: {
      ...actor,
      workspacePermissions: ['client.manage'],
      activeCompany: workspaceCompany,
    },
  });
  await ready();
  view.update({
    actor: {
      ...view.props.actor,
      activeCompany: {
        ...workspaceCompany,
        documentPermissions: [
          ...(company.documentPermissions ?? []),
          'document.content.read',
        ],
      },
    },
  });
  expect(region()).toHaveTextContent('Piece 0');
  await act(async () => undefined);
  // Content authority does not retire otherwise authorized Document metadata.
  const before = api.calls.length;
  view.update({
    actor: {
      ...view.props.actor,
      activeCompany: {
        ...workspaceCompany,
        documentPermissions: company.documentPermissions,
      },
    },
  });
  await act(async () => undefined);
  expect(api.calls).toHaveLength(before);
  view.update({
    actor: {
      ...view.props.actor,
      activeCompany: {
        ...workspaceCompany,
        clientPermissions: ['client.read'],
        clientPermissionAssignmentId: 'unconsumed-client-grant',
      },
    },
  });
  expect(region()).toHaveTextContent('Piece 0');
  await act(async () => undefined);
  expect(api.calls).toHaveLength(before);
});

it('retires only a lost family and its opening while keeping sibling facts reachable through regrant', async () => {
  const api = server([document(), mission(), received()]);
  const view = show();
  await ready();
  const missionRow = within(region())
    .getByRole('heading', { name: 'Piece 30' })
    .closest('li');
  if (!missionRow) throw new Error('No mission row');
  fireEvent.click(
    within(missionRow).getByRole('button', { name: 'Open Document' }),
  );
  const call = vi.mocked(view.props.onOpenDocument).mock.calls[0]?.[0];
  if (!call || typeof call === 'string' || !call.sourceSignal)
    throw new Error('Expected scoped opening');
  api.hold();
  view.update({
    actor: {
      ...actor,
      activeCompany: {
        ...company,
        missionDeliverableAccessPermissionSetVersion: undefined,
      },
    },
  });
  expect(region()).not.toHaveTextContent('Piece 30');
  expect(region()).toHaveTextContent('Piece 0');
  expect(region()).toHaveTextContent('Piece 40');
  expect(call.sourceSignal.aborted).toBe(true);
  await waitFor(() => expect(api.waiting).toHaveLength(1));
  await api.release(0, [document(), mission(), received()]);
  expect(region()).not.toHaveTextContent('Piece 30');
  view.update({
    actor: {
      ...actor,
      activeCompany: {
        ...company,
        missionDeliverableAccessAssignmentId: 'fresh-mission',
      },
    },
  });
  expect(region()).not.toHaveTextContent('Piece 30');
  expect(region()).toHaveTextContent('Piece 0');
  await waitFor(() => expect(api.waiting).toHaveLength(2));
  await api.release(1, [document(), mission(), received()]);
  await within(region()).findByRole('heading', { name: 'Piece 30' });
  expect(call.sourceSignal.aborted).toBe(true);
});

it.each([200, 403])(
  'ignores retired discovery late%s before any fact or access rejection',
  async (status) => {
    const api = server();
    api.hold();
    const view = show();
    await waitFor(() => expect(api.waiting).toHaveLength(1));
    view.update({ clientIdentityRevision: 1 });
    await waitFor(() => expect(api.waiting).toHaveLength(2));
    await api.release(1, [document(1)]);
    await ready();
    await api.release(0, [document(99)], status);
    expect(region()).toHaveTextContent('Piece 1');
    expect(region()).not.toHaveTextContent('Piece 99');
    expect(view.props.onCompanyContextRejected).not.toHaveBeenCalled();
    expect(view.props.onActorRevalidated).not.toHaveBeenCalled();
  },
);

it('ends opening sources on local-window/refresh retirement and changes locale without extra I/O', async () => {
  const api = server(Array.from({ length: 26 }, (_, i) => document(i)));
  const view = show();
  await ready();
  fireEvent.click(
    within(region()).getAllByRole('button', { name: 'Open Document' })[0],
  );
  const target = vi.mocked(view.props.onOpenDocument).mock.calls[0]?.[0];
  if (!target || typeof target === 'string' || !target.sourceSignal)
    throw new Error('Expected scoped opening');
  fireEvent.click(button('Next Documents'));
  expect(target.sourceSignal.aborted).toBe(true);
  selectOptionByLabel(
    screen.getByRole('combobox', { name: 'Interface language' }),
    'Français',
  );
  await screen.findByRole('region', { name: 'Documents du client' });
  expect(api.calls).toHaveLength(1);
});

it.each(
  ['Company', 'actor', 'dossier', 'Registrar capture', 'session'].flatMap(
    (context) => [200, 403].map((status) => ({ context, status })),
  ),
)(
  'retires $context before an old abort-ignoring$status response',
  async ({ context, status }) => {
    const api = server();
    api.hold();
    const view = show();
    await waitFor(() => expect(api.waiting).toHaveLength(1));
    switch (context) {
      case 'Company':
        view.update({
          actor: {
            ...actor,
            activeCompany: {
              ...company,
              id: 'company-b',
              displayName: 'Company B',
              documentPermissionAssignmentId: 'b-documents',
              clientPermissionAssignmentId: 'b-client',
            },
          },
        });
        break;
      case 'actor':
        view.update({
          actor: {
            ...actor,
            internalUserId: 'new-reader',
            workspaceMembershipId: 'new-member',
          },
        });
        break;
      case 'dossier':
        view.update({ clientDossierId: 'other-dossier' });
        break;
      case 'Registrar capture':
        view.update({
          actor: {
            ...actor,
            activeCompany: {
              ...company,
              documentPermissionAssignmentId: 'replacement',
            },
          },
        });
        break;
      case 'session':
        view.update({ identity: { ...identity } });
        break;
      default:
        throw new Error('Unknown test context');
    }
    await waitFor(() => expect(api.waiting).toHaveLength(2));
    await api.release(1, [
      document(1, {
        companyId: view.props.actor.activeCompany?.id,
        clientDossierId: view.props.clientDossierId,
      }),
    ]);
    await ready();
    await api.release(0, [document(99)], status);
    expect(region()).toHaveTextContent('Piece 1');
    expect(region()).not.toHaveTextContent('Piece 99');
    expect(view.props.onActorRevalidated).not.toHaveBeenCalled();
    expect(view.props.onCompanyContextRejected).not.toHaveBeenCalled();
  },
);

it.each([403, 500])(
  'keeps a live%s refusal distinct from zero matches and permits an explicit fresh read',
  async (status) => {
    const api = server();
    api.hold();
    show();
    await waitFor(() => expect(api.waiting).toHaveLength(1));
    await api.release(0, {}, status);
    expect(await within(region()).findByRole('alert')).toHaveTextContent(
      status === 403
        ? 'unavailable with your current access'
        : 'could not be loaded',
    );
    expect(region()).not.toHaveTextContent('No Documents for');
    fireEvent.click(
      button(
        status === 403
          ? 'Refresh Documents from beginning'
          : 'Retry Document discovery',
      ),
    );
    await waitFor(() => expect(api.waiting).toHaveLength(2));
    await api.release(1, []);
    await within(region()).findByText(
      'No Documents for this Client in this Company.',
    );
    expect(api.calls.every((c) => c.method === 'GET')).toBe(true);
  },
);

it('keeps authorized siblings reachable from an empty local window after family loss', async () => {
  const api = server([
    document(),
    ...Array.from({ length: 26 }, (_, i) => mission(i + 100)),
  ]);
  const view = show();
  await ready();
  fireEvent.click(button('Next Documents'));
  api.hold();
  view.update({
    actor: {
      ...actor,
      activeCompany: {
        ...company,
        missionDeliverableAccessPermissionSetVersion: undefined,
      },
    },
  });
  expect(region()).toHaveTextContent(
    'No Documents in this window. Go back or refresh.',
  );
  expect(button('Previous Documents')).toBeEnabled();
  fireEvent.click(button('Previous Documents'));
  expect(region()).toHaveTextContent('Piece 0');
  expect(within(region()).getAllByRole('listitem')).toHaveLength(1);
});
