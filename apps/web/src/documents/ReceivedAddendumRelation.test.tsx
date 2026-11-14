import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { completeActor } from '../access/current-actor.test-fixture';
import {
  companyGrants,
  withoutCompanyGrants,
} from '../access/company-grants.test-fixture';
import { ReceivedAddendumRelation } from './ReceivedAddendumRelation';

const documentId = '10000000-0000-4000-8000-000000000009';
const companyId = '10000000-0000-4000-8000-000000000004';
const relation = {
  access: 'granted',
  opportunityId: '10000000-0000-4000-8000-000000000010',
  parentContractId: '10000000-0000-4000-8000-000000000006',
  parentContractVersionId: '10000000-0000-4000-8000-000000000007',
  contractVersionNumber: 2,
  illustrativeReference: 17,
  recordedRecipient: {
    kind: 'PRIMARY',
    legalName: 'Fictional recorded party',
    taxId: 'Fictional tax id',
    legalAddress: null,
  },
  sourceDescription: 'Fictional immutable source',
  receivedOn: null,
  registeredAt: '2026-11-06T10:00:00.000Z',
  registeredBy: {
    internalUserId: '10000000-0000-4000-8000-000000000011',
    workspaceMembershipId: '10000000-0000-4000-8000-000000000012',
  },
};
function actor(): ActorContext {
  return {
    ...completeActor,
    workspacePermissions: ['client.manage'],
    activeCompany: {
      id: companyId,
      displayName: 'Fictional Company',
      receivedAddendumAccessAssignmentId:
        '10000000-0000-4000-8000-000000000005',
      receivedAddendumAccessPermissionSetVersion: 'v1',
      receivedAddendumClientReadCapture:
        'received-addendum-client-read.v1.' + 'a'.repeat(64),
      documentPermissions: [
        'document.read',
        'document.received_addendum.access',
      ],
      documentPermissionAssignmentId: 'native-document',
      documentPermissionSetVersion: 'v3',
      contractPermissions: ['commercial.contract.read'],
      contractPermissionAssignmentId: 'native-contract',
      contractPermissionSetVersion: 'v2',
      commercialIntakePermissions: ['commercial.opportunity.read'],
      commercialIntakePermissionAssignmentId: 'native-intake',
      commercialIntakePermissionSetVersion: 'v4',
      grants: companyGrants(
        {
          bundle: 'company_received_addendum_access',
          version: 'v1',
          assignmentId: '10000000-0000-4000-8000-000000000005',
        },
        {
          bundle: 'company_document_registrar',
          version: 'v1',
          assignmentId: 'native-document',
        },
        {
          bundle: 'company_contract_preparer',
          version: 'v2',
          assignmentId: 'native-contract',
        },
        {
          bundle: 'company_commercial_intake',
          version: 'v4',
          assignmentId: 'native-intake',
        },
      ),
    },
  };
}
function document(receivedAddendumRelation: unknown = relation) {
  return {
    id: documentId,
    companyId,
    clientId: '10000000-0000-4000-8000-000000000008',
    clientDisplayName: 'Fictional original Client',
    title: 'Fictional Addendum',
    purpose: 'Preserve original',
    type: 'received-addendum',
    confidentiality: 'company-confidential',
    workingRevision: 1,
    correction: 'allowed',
    version: {
      id: '10000000-0000-4000-8000-000000000013',
      status: 'draft',
      representation: null,
    },
    receivedAddendumRelation,
  };
}
afterEach(() => vi.unstubAllGlobals());
it('shows the exact parent, declared source, unknown date and attributable recorded party only under both endpoint reads', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(document())),
  );
  render(
    <ReceivedAddendumRelation
      actor={actor()}
      identity={deterministicBrowserIdentity()}
      documentId={documentId}
    />,
  );
  expect(
    await screen.findByText('Contract 17 · Version 2'),
  ).toBeInTheDocument();
  expect(screen.getByText('Fictional immutable source')).toBeInTheDocument();
  expect(screen.getByText('Receipt date unknown')).toBeInTheDocument();
  expect(screen.getByText('Fictional recorded party')).toBeInTheDocument();
  expect(
    screen.getByText(relation.registeredBy.internalUserId),
  ).toBeInTheDocument();
});

it('withholds tuple, source, date, party and attribution without guessing a denied relation cause', async () => {
  const currentActor = actor();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) =>
      input.includes('/access/current-actor')
        ? Response.json(currentActor)
        : Response.json(document({ ...relation, access: 'denied' })),
    ),
  );
  render(
    <ReceivedAddendumRelation
      actor={currentActor}
      identity={deterministicBrowserIdentity()}
      documentId={documentId}
    />,
  );
  expect(
    await screen.findByText(
      'The declared parent and source are unavailable under your current access.',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText('Contract 17 · Version 2')).not.toBeInTheDocument();
  expect(
    screen.queryByText('Fictional immutable source'),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Receipt date unknown')).not.toBeInTheDocument();
  expect(
    screen.queryByText('Fictional recorded party'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(relation.registeredBy.internalUserId),
  ).not.toBeInTheDocument();
});

it('performs no relation request without a captured independently readable parent', () => {
  const currentActor = actor(),
    transport = vi.fn();
  if (!currentActor.activeCompany) throw new Error('Missing fixture Company');
  currentActor.activeCompany.grants = withoutCompanyGrants(
    currentActor.activeCompany.grants,
    'company_contract_preparer',
  );
  vi.stubGlobal('fetch', transport);
  render(
    <ReceivedAddendumRelation
      actor={currentActor}
      identity={deterministicBrowserIdentity()}
      documentId={documentId}
    />,
  );
  expect(
    screen.getByText(
      'The declared parent and source are unavailable under your current access.',
    ),
  ).toBeInTheDocument();
  expect(transport).not.toHaveBeenCalled();
});

it('keeps a held full-Actor recovery from overwriting a newer unrelated Actor without restarting the relation read', async () => {
  const currentActor = actor(),
    identity = deterministicBrowserIdentity(),
    onActorRevalidated = vi.fn();
  let release: ((value: unknown) => void) | undefined;
  const parsed = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  const transport = vi.fn(async (input: string) =>
    input.includes('/access/current-actor')
      ? { ok: true, status: 200, json: () => parsed }
      : Response.json(document({ access: 'denied' })),
  );
  vi.stubGlobal('fetch', transport);
  const view = render(
    <ReceivedAddendumRelation
      actor={currentActor}
      identity={identity}
      documentId={documentId}
      onActorRevalidated={onActorRevalidated}
    />,
  );
  await screen.findByText(
    'The declared parent and source are unavailable under your current access.',
  );
  await waitFor(() =>
    expect(
      transport.mock.calls.some(([path]) =>
        path.includes('/access/current-actor'),
      ),
    ).toBe(true),
  );
  view.rerender(
    <ReceivedAddendumRelation
      actor={{
        ...currentActor,
        activeCompany: {
          ...currentActor.activeCompany,
          id: companyId,
          displayName: 'Fictional Company',
          contractModelGrants: { unrelatedReplacement: true },
        },
      }}
      identity={identity}
      documentId={documentId}
      onActorRevalidated={onActorRevalidated}
    />,
  );
  await act(async () => {
    release?.(currentActor);
  });
  expect(onActorRevalidated).not.toHaveBeenCalled();
  expect(
    transport.mock.calls.filter(([path]) => path.includes('/documents/')),
  ).toHaveLength(1);
});

it('permanently retires a held relation parser through A → B → A and displays only the new owner', async () => {
  const currentActor = actor(),
    identity = deterministicBrowserIdentity();
  let release: ((value: unknown) => void) | undefined;
  const parsed = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  let first = true,
    firstSignal: AbortSignal | null | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: string, init?: RequestInit) => {
      if (first) {
        first = false;
        firstSignal = init?.signal;
        return { ok: true, status: 200, json: () => parsed };
      }
      return Response.json(
        document({ ...relation, sourceDescription: 'Current owner source' }),
      );
    }),
  );
  const view = render(
    <ReceivedAddendumRelation
      actor={currentActor}
      identity={identity}
      documentId={documentId}
    />,
  );
  await waitFor(() => expect(firstSignal).toBeDefined());
  view.rerender(
    <ReceivedAddendumRelation
      actor={{ ...currentActor, internalUserId: 'another-internal-user' }}
      identity={identity}
      documentId={documentId}
    />,
  );
  view.rerender(
    <ReceivedAddendumRelation
      actor={currentActor}
      identity={identity}
      documentId={documentId}
    />,
  );
  await screen.findByText('Current owner source');
  await act(async () => {
    release?.(document());
  });
  expect(firstSignal?.aborted).toBe(true);
  expect(
    screen.queryByText('Fictional immutable source'),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Current owner source')).toBeInTheDocument();
});

it('offers a safe deliberate read retry for malformed success, without exposing stale details', async () => {
  const transport = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(document({ ...relation, receivedOn: '1900-02-29' })),
    )
    .mockResolvedValueOnce(Response.json(document()));
  vi.stubGlobal('fetch', transport);
  render(
    <ReceivedAddendumRelation
      actor={actor()}
      identity={deterministicBrowserIdentity()}
      documentId={documentId}
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The declared parent and source could not be loaded.',
  );
  expect(
    screen.queryByText('Fictional immutable source'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  expect(
    await screen.findByText('Fictional immutable source'),
  ).toBeInTheDocument();
  expect(transport).toHaveBeenCalledTimes(2);
});
