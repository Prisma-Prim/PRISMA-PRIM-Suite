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
import { changeValue } from '../test/select-option';
import type { WorkingDocumentDetail } from './document-response';
import { ReceivedAddendumRegistration } from './ReceivedAddendumRegistration';
import { ReceivedAddendumRelation } from './ReceivedAddendumRelation';
import type { ReceivedAddendumSourcePage } from './received-addendum-response';

const companyId = '10000000-0000-4000-8000-000000000004';
const documentId = '10000000-0000-4000-8000-000000000009';
const source = {
  parentContractId: '10000000-0000-4000-8000-000000000006',
  parentContractVersionId: '10000000-0000-4000-8000-000000000007',
  contractVersionNumber: 2,
  illustrativeReference: 17,
  clientId: '10000000-0000-4000-8000-000000000008',
  clientDisplayName: 'Fictional original Client',
  opportunityTitle: 'Fictional Opportunity',
  recordedRecipient: {
    kind: 'PRIMARY',
    legalName: 'Fictional recorded party',
    taxId: null,
    legalAddress: null,
  },
} satisfies ReceivedAddendumSourcePage['sources'][number];
const literalFields = {
  title: '  Fictional literal Титул 🧪  ',
  purpose: 'Preserve the fictional original',
  sourceDescription: '  Fictional sender\n  literal spacing  ',
  receivedOn: null,
};
const sourceDenied =
  'Source selection is unavailable under your current access.';
const confirmed = 'The received Addendum Document was registered.';
const actorCases = [
  { name: 'unchanged Actor', replaceApprover: false, expectedRejections: 1 },
  {
    name: 'only the Document Approver assignment replaced',
    replaceApprover: true,
    expectedRejections: 0,
  },
];

function sourceActor() {
  return {
    ...completeActor,
    internalUserId: '10000000-0000-4000-8000-000000000001',
    workspaceId: '10000000-0000-4000-8000-000000000002',
    workspaceMembershipId: '10000000-0000-4000-8000-000000000003',
    workspacePermissions: ['client.manage'],
    activeCompany: {
      ...completeActor.activeCompany,
      id: companyId,
      displayName: 'Fictional Company',
      receivedAddendumAccessAssignmentId:
        '10000000-0000-4000-8000-000000000005',
      receivedAddendumAccessPermissionSetVersion: 'v1',
      receivedAddendumClientReadCapture:
        'received-addendum-client-read.v1.' + 'a'.repeat(64),
      documentPermissions: [
        'document.read',
        'document.register',
        'document.reference.read',
        'document.version.designate_official',
        'document.received_addendum.access',
      ],
      documentPermissionAssignmentId: '10000000-0000-4000-8000-000000000014',
      documentPermissionSetVersion: 'v3',
      documentApproverAssignmentId: '10000000-0000-4000-8000-000000000015',
      documentApproverPermissionSetVersion: 'v1',
      contractPermissions: ['commercial.contract.read'],
      contractPermissionAssignmentId: '10000000-0000-4000-8000-000000000016',
      contractPermissionSetVersion: 'v2',
      contractApproverAssignmentId: '10000000-0000-4000-8000-000000000017',
      contractApproverPermissionSetVersion: 'v2',
      contractEarlyPreparationAssignmentId:
        '10000000-0000-4000-8000-000000000018',
      contractEarlyPreparationPermissionSetVersion: 'v1',
      commercialIntakePermissions: ['commercial.opportunity.read'],
      commercialIntakePermissionAssignmentId:
        '10000000-0000-4000-8000-000000000019',
      commercialIntakePermissionSetVersion: 'v4',
    },
  } satisfies ActorContext;
}

function continuationActor(
  actor: ReturnType<typeof sourceActor>,
  replaceApprover: boolean,
) {
  return replaceApprover
    ? {
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          documentApproverAssignmentId: '10000000-0000-4000-8000-000000000099',
        },
      }
    : actor;
}

function savedDocument(actor: ReturnType<typeof sourceActor>) {
  return {
    id: documentId,
    companyId,
    clientId: source.clientId,
    clientDisplayName: source.clientDisplayName,
    title: literalFields.title.trim(),
    purpose: literalFields.purpose,
    type: 'received-addendum',
    confidentiality: 'company-confidential',
    workingRevision: 1,
    correction: 'allowed',
    version: {
      id: '10000000-0000-4000-8000-000000000013',
      status: 'draft',
      representation: null,
    },
    receivedAddendumRelation: {
      access: 'granted',
      opportunityId: '10000000-0000-4000-8000-000000000010',
      parentContractId: source.parentContractId,
      parentContractVersionId: source.parentContractVersionId,
      contractVersionNumber: source.contractVersionNumber,
      illustrativeReference: source.illustrativeReference,
      recordedRecipient: source.recordedRecipient,
      sourceDescription: literalFields.sourceDescription.trim(),
      receivedOn: null,
      registeredAt: '2026-11-06T10:00:00.000Z',
      registeredBy: {
        internalUserId: actor.internalUserId,
        workspaceMembershipId: actor.workspaceMembershipId,
      },
    },
  } satisfies WorkingDocumentDetail;
}

function deferred<T>() {
  let release: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!release) throw new Error('Deferred request was not initialized');
      release(value);
    },
  };
}

function identityFixture() {
  const rejectSession = vi.fn(async () => undefined);
  return {
    identity: { ...deterministicBrowserIdentity(), rejectSession },
    rejectSession,
  };
}

function registrationCallbacks() {
  return {
    onBusyChange: vi.fn(),
    onRegistered: vi.fn(),
    onStarted: vi.fn(),
    onAccessRejected: vi.fn(),
  };
}

async function selectAndFill() {
  const parent = screen.getByLabelText(
    'Exact executed parent Contract Version',
  );
  await waitFor(() => expect(parent).not.toBeDisabled());
  changeValue(parent, source.parentContractVersionId);
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: literalFields.title },
  });
  fireEvent.change(screen.getByLabelText('Purpose'), {
    target: { value: literalFields.purpose },
  });
  fireEvent.change(screen.getByLabelText('Declared source'), {
    target: { value: literalFields.sourceDescription },
  });
  expect(
    screen.getByText(source.recordedRecipient.legalName),
  ).toBeInTheDocument();
}

afterEach(() => vi.unstubAllGlobals());

it.each(actorCases)(
  'settles a held source picker 401 with $name',
  async ({ replaceApprover, expectedRejections }) => {
    const actor = sourceActor();
    const { identity, rejectSession } = identityFixture();
    const callbacks = registrationCallbacks();
    const held = deferred<Response>();
    const reached = deferred<Parameters<typeof fetch>>();
    const transport = vi.fn((...args: Parameters<typeof fetch>) => {
      reached.resolve(args);
      return held.promise;
    });
    vi.stubGlobal('fetch', transport);
    const view = render(
      <ReceivedAddendumRegistration
        {...callbacks}
        actor={actor}
        identity={identity}
        companyId={companyId}
      />,
    );
    const [input, init] = await reached.promise;
    expect(String(input)).toMatch(/\/documents\/received-addendum-sources$/u);
    expect(init?.method ?? 'GET').toBe('GET');
    expect(new Headers(init?.headers).get('x-company-context-id')).toBe(
      companyId,
    );
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    expect(rejectSession).not.toHaveBeenCalled();

    view.rerender(
      <ReceivedAddendumRegistration
        {...callbacks}
        actor={continuationActor(actor, replaceApprover)}
        identity={identity}
        companyId={companyId}
      />,
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(init?.signal?.aborted).toBe(false);
    await act(async () => {
      held.resolve(new Response(null, { status: 401 }));
    });

    expect((await screen.findByRole('alert')).textContent).toBe(sourceDenied);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(confirmed)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry identical registration' }),
    ).not.toBeInTheDocument();
    expect(callbacks.onBusyChange).not.toHaveBeenCalledWith(true);
    expect(callbacks.onStarted).not.toHaveBeenCalled();
    expect(callbacks.onRegistered).not.toHaveBeenCalled();
    expect(callbacks.onAccessRejected).not.toHaveBeenCalled();
    expect(rejectSession).toHaveBeenCalledTimes(expectedRejections);
    expect(transport).toHaveBeenCalledTimes(1);
  },
);

it.each(actorCases)(
  'settles a held registration POST 401 and releases its busy owner with $name',
  async ({ replaceApprover, expectedRejections }) => {
    const actor = sourceActor();
    const { identity, rejectSession } = identityFixture();
    const callbacks = registrationCallbacks();
    const held = deferred<Response>();
    const reached = deferred<Parameters<typeof fetch>>();
    const transport = vi.fn(async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args;
      if (String(input).endsWith('/documents') && init?.method === 'POST') {
        reached.resolve(args);
        return held.promise;
      }
      if (
        String(input).endsWith('/documents/received-addendum-sources') &&
        (init?.method ?? 'GET') === 'GET'
      )
        return Response.json({ sources: [source], nextCursor: null });
      throw new Error('Unexpected HTTP route');
    });
    vi.stubGlobal('fetch', transport);
    const view = render(
      <ReceivedAddendumRegistration
        {...callbacks}
        actor={actor}
        identity={identity}
        companyId={companyId}
      />,
    );
    await selectAndFill();
    fireEvent.click(
      screen.getByRole('button', { name: 'Register received Addendum PDF' }),
    );
    const [input, init] = await reached.promise;
    expect(String(input)).toMatch(/\/documents$/u);
    expect(init?.method).toBe('POST');
    const posted: unknown = JSON.parse(String(init?.body));
    expect(posted).toEqual({
      type: 'received-addendum',
      parentContractId: source.parentContractId,
      parentContractVersionId: source.parentContractVersionId,
      ...literalFields,
    });
    expect(new Headers(init?.headers).get('idempotency-key')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
    );
    expect(callbacks.onBusyChange).toHaveBeenLastCalledWith(true);
    expect(callbacks.onStarted).toHaveBeenCalledTimes(1);
    expect(rejectSession).not.toHaveBeenCalled();

    view.rerender(
      <ReceivedAddendumRegistration
        {...callbacks}
        actor={continuationActor(actor, replaceApprover)}
        identity={identity}
        companyId={companyId}
      />,
    );
    expect(init?.signal?.aborted).toBe(false);
    expect(screen.getByLabelText('Title')).toHaveValue(literalFields.title);
    expect(screen.getByLabelText('Declared source')).toHaveValue(
      literalFields.sourceDescription,
    );
    expect(
      screen.getByRole('button', { name: 'Registering received Addendum…' }),
    ).toBeDisabled();
    expect(transport).toHaveBeenCalledTimes(2);
    await act(async () => {
      held.resolve(new Response(null, { status: 401 }));
    });

    expect((await screen.findByRole('alert')).textContent).toBe(sourceDenied);
    expect(callbacks.onBusyChange).toHaveBeenLastCalledWith(false);
    expect(callbacks.onRegistered).not.toHaveBeenCalled();
    expect(callbacks.onAccessRejected).not.toHaveBeenCalled();
    expect(callbacks.onStarted).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(confirmed)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Registering received Addendum…' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry identical registration' }),
    ).not.toBeInTheDocument();
    expect(rejectSession).toHaveBeenCalledTimes(expectedRejections);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(
      transport.mock.calls.filter(([, request]) => request?.method === 'POST'),
    ).toHaveLength(1);
  },
);

it.each(actorCases)(
  'settles a held relation GET 401 and permits only a deliberate read retry with $name',
  async ({ replaceApprover, expectedRejections }) => {
    const actor = sourceActor();
    const { identity, rejectSession } = identityFixture();
    const callbacks = {
      onActorRevalidated: vi.fn(),
      onCompanyContextRejected: vi.fn(),
      onWorkspaceAccessRejected: vi.fn(),
    };
    const held = deferred<Response>();
    const reached = deferred<Parameters<typeof fetch>>();
    let reads = 0;
    const transport = vi.fn(async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args;
      if (
        !String(input).endsWith(`/documents/${documentId}`) ||
        (init?.method ?? 'GET') !== 'GET'
      )
        throw new Error('Unexpected HTTP route');
      reads += 1;
      if (reads === 1) {
        reached.resolve(args);
        return held.promise;
      }
      return Response.json(savedDocument(actor));
    });
    vi.stubGlobal('fetch', transport);
    const view = render(
      <ReceivedAddendumRelation
        {...callbacks}
        actor={actor}
        identity={identity}
        documentId={documentId}
      />,
    );
    const [input, init] = await reached.promise;
    expect(String(input).endsWith(`/documents/${documentId}`)).toBe(true);
    expect(init?.method ?? 'GET').toBe('GET');
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    expect(rejectSession).not.toHaveBeenCalled();

    view.rerender(
      <ReceivedAddendumRelation
        {...callbacks}
        actor={continuationActor(actor, replaceApprover)}
        identity={identity}
        documentId={documentId}
      />,
    );
    expect(init?.signal?.aborted).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
    await act(async () => {
      held.resolve(new Response(null, { status: 401 }));
    });

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The declared parent and source could not be loaded.',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Contract 17 · Version 2'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(source.recordedRecipient.legalName),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Fictional sender literal spacing'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(confirmed)).not.toBeInTheDocument();
    expect(rejectSession).toHaveBeenCalledTimes(expectedRejections);
    expect(transport).toHaveBeenCalledTimes(1);
    const retry = screen.getByRole('button', { name: 'Retry loading' });
    expect(retry).not.toBeDisabled();
    fireEvent.click(retry);

    expect(
      await screen.findByText('Contract 17 · Version 2'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Fictional sender literal spacing').textContent,
    ).toBe(literalFields.sourceDescription.trim());
    expect(
      screen.getByText(source.recordedRecipient.legalName),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(callbacks.onActorRevalidated).not.toHaveBeenCalled();
    expect(callbacks.onCompanyContextRejected).not.toHaveBeenCalled();
    expect(callbacks.onWorkspaceAccessRejected).not.toHaveBeenCalled();
    expect(rejectSession).toHaveBeenCalledTimes(expectedRejections);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(
      transport.mock.calls.every(
        ([, request]) => (request?.method ?? 'GET') === 'GET',
      ),
    ).toBe(true);
  },
);
