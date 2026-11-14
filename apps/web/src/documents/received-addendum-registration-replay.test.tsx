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
import { withCompanyGrants } from '../access/company-grants.test-fixture';
import { changeValue } from '../test/select-option';
import type { WorkingDocumentDetail } from './document-response';
import { ReceivedAddendumRegistration } from './ReceivedAddendumRegistration';
import type { ReceivedAddendumSourcePage } from './received-addendum-response';

const companyId = '10000000-0000-4000-8000-000000000004';
const internalUserId = '10000000-0000-4000-8000-000000000001';
const workspaceMembershipId = '10000000-0000-4000-8000-000000000003';
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
  title: '  Fictional Титул 🧪  ',
  purpose: '  Preserve the fictional original  ',
  sourceDescription: '  Fictional sender\n  literal spacing  ',
  receivedOn: null,
};
const confirmed = 'The received Addendum Document was registered.';
const uncertain =
  'The result is uncertain. Keep this intent and retry the identical registration.';

function actorFixture() {
  return {
    ...completeActor,
    internalUserId,
    workspaceId: '10000000-0000-4000-8000-000000000002',
    workspaceMembershipId,
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
        'document.received_addendum.access',
      ],
      documentPermissionAssignmentId: '10000000-0000-4000-8000-000000000014',
      documentPermissionSetVersion: 'v3',
      contractPermissions: ['commercial.contract.read'],
      contractPermissionAssignmentId: '10000000-0000-4000-8000-000000000016',
      contractPermissionSetVersion: 'v2',
      commercialIntakePermissions: ['commercial.opportunity.read'],
      commercialIntakePermissionAssignmentId:
        '10000000-0000-4000-8000-000000000019',
      commercialIntakePermissionSetVersion: 'v4',
      grants: withCompanyGrants(
        completeActor.activeCompany.grants,
        {
          bundle: 'company_received_addendum_access',
          version: 'v1',
          assignmentId: '10000000-0000-4000-8000-000000000005',
        },
        {
          bundle: 'company_document_registrar',
          version: 'v1',
          assignmentId: '10000000-0000-4000-8000-000000000014',
        },
        {
          bundle: 'company_contract_preparer',
          version: 'v2',
          assignmentId: '10000000-0000-4000-8000-000000000016',
        },
        {
          bundle: 'company_commercial_intake',
          version: 'v4',
          assignmentId: '10000000-0000-4000-8000-000000000019',
        },
      ),
    },
  } satisfies ActorContext;
}

function currentDocument() {
  return {
    id: '10000000-0000-4000-8000-000000000009',
    companyId,
    clientId: source.clientId,
    clientDisplayName: source.clientDisplayName,
    title: literalFields.title.trim(),
    purpose: literalFields.purpose.trim(),
    type: 'received-addendum',
    confidentiality: 'company-confidential',
    workingRevision: 2,
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
      registeredBy: { internalUserId, workspaceMembershipId },
    },
  } satisfies WorkingDocumentDetail;
}

const metadataCorrections = [
  {
    name: 'title only',
    title: 'Corrected fictional title',
    purpose: literalFields.purpose.trim(),
  },
  {
    name: 'purpose only',
    title: literalFields.title.trim(),
    purpose: 'Corrected fictional purpose',
  },
  {
    name: 'title and purpose',
    title: 'Corrected fictional title',
    purpose: 'Corrected fictional purpose',
  },
];

function immutableMismatches() {
  const document = currentDocument();
  const relation = document.receivedAddendumRelation;
  return [
    {
      name: 'an altered exact parent Version',
      document: {
        ...document,
        receivedAddendumRelation: {
          ...relation,
          parentContractVersionId: '10000000-0000-4000-8000-000000000099',
        },
      },
    },
    {
      name: 'an altered declared source',
      document: {
        ...document,
        receivedAddendumRelation: {
          ...relation,
          sourceDescription: 'A different fictional sender',
        },
      },
    },
    {
      name: 'a different registering identity',
      document: {
        ...document,
        receivedAddendumRelation: {
          ...relation,
          registeredBy: {
            internalUserId: '10000000-0000-4000-8000-000000000098',
            workspaceMembershipId: '10000000-0000-4000-8000-000000000097',
          },
        },
      },
    },
  ];
}

function deferred<T>() {
  let release: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!release) throw new Error('Deferred response was not initialized');
      release(value);
    },
  };
}

async function beginIdenticalRetry() {
  const writes: Array<{ body: string; key: string | null }> = [];
  const reply = deferred<Response>();
  const retryReached = deferred<Parameters<typeof fetch>>();
  const transport = vi.fn(async (...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    if (String(input).endsWith('/documents') && init?.method === 'POST') {
      writes.push({
        body: String(init.body),
        key: new Headers(init.headers).get('idempotency-key'),
      });
      if (writes.length === 1)
        throw new TypeError('Fictional registration response was lost');
      if (writes.length === 2) {
        retryReached.resolve(args);
        return reply.promise;
      }
      throw new Error('Unexpected additional registration');
    }
    if (
      String(input).endsWith('/documents/received-addendum-sources') &&
      (init?.method ?? 'GET') === 'GET'
    )
      return Response.json({ sources: [source], nextCursor: null });
    throw new Error('Unexpected HTTP route');
  });
  vi.stubGlobal('fetch', transport);
  const props = {
    actor: actorFixture(),
    identity: deterministicBrowserIdentity(),
    companyId,
    onBusyChange: vi.fn(),
    onRegistered: vi.fn(),
    onStarted: vi.fn(),
    onAccessRejected: vi.fn(),
  };
  const view = render(<ReceivedAddendumRegistration {...props} />);
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
  fireEvent.click(
    screen.getByRole('button', { name: 'Register received Addendum PDF' }),
  );
  const retry = await screen.findByRole('button', {
    name: 'Retry identical registration',
  });
  expect(screen.getByRole('alert').textContent).toBe(uncertain);
  expect(writes).toHaveLength(1);
  const first = writes[0];
  if (!first) throw new Error('The first registration was not dispatched');
  const posted: unknown = JSON.parse(first.body);
  expect(posted).toEqual({
    type: 'received-addendum',
    parentContractId: source.parentContractId,
    parentContractVersionId: source.parentContractVersionId,
    ...literalFields,
  });
  expect(first.key).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
  );
  expect(props.onRegistered).not.toHaveBeenCalled();
  expect(props.onBusyChange).toHaveBeenLastCalledWith(true);
  expect(props.onBusyChange).not.toHaveBeenCalledWith(false);
  expect(screen.getByLabelText('Title')).toBeDisabled();
  expect(screen.getByLabelText('Purpose')).toBeDisabled();
  expect(parent).toBeDisabled();

  fireEvent.click(retry);
  const [input, init] = await retryReached.promise;
  expect(String(input)).toMatch(/\/documents$/u);
  expect(init?.method).toBe('POST');
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(first);
  expect(props.onStarted).toHaveBeenCalledTimes(1);
  expect(transport).toHaveBeenCalledTimes(3);
  expect(
    screen.getByRole('button', { name: 'Registering received Addendum…' }),
  ).toBeDisabled();
  return { writes, transport, reply, props, view };
}

afterEach(() => vi.unstubAllGlobals());

it.each(metadataCorrections)(
  'confirms an identical registration replay after a current draft correction to $name',
  async ({ title, purpose }) => {
    const attempt = await beginIdenticalRetry();
    const current = { ...currentDocument(), title, purpose };
    await act(async () => {
      attempt.reply.resolve(Response.json(current, { status: 201 }));
    });

    expect((await screen.findByRole('status')).textContent).toBe(confirmed);
    expect(attempt.props.onRegistered).toHaveBeenCalledTimes(1);
    expect(attempt.props.onRegistered).toHaveBeenCalledWith(current);
    expect(attempt.props.onBusyChange).toHaveBeenLastCalledWith(false);
    expect(attempt.props.onAccessRejected).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry identical registration' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Register received Addendum PDF' }),
    ).not.toBeInTheDocument();
    await act(async () => {
      attempt.view.rerender(
        <ReceivedAddendumRegistration {...attempt.props} />,
      );
    });
    expect(screen.getByRole('status').textContent).toBe(confirmed);
    expect(attempt.props.onRegistered).toHaveBeenCalledTimes(1);
    expect(attempt.props.onStarted).toHaveBeenCalledTimes(1);
    expect(attempt.writes).toHaveLength(2);
    expect(attempt.transport).toHaveBeenCalledTimes(3);
  },
);

it.each(immutableMismatches())(
  'keeps an identical registration replay uncertain for $name',
  async ({ document }) => {
    const attempt = await beginIdenticalRetry();
    await act(async () => {
      attempt.reply.resolve(Response.json(document, { status: 201 }));
    });

    expect(
      await screen.findByRole('button', {
        name: 'Retry identical registration',
      }),
    ).not.toBeDisabled();
    expect(screen.getByRole('alert').textContent).toBe(uncertain);
    expect(screen.queryByText(confirmed)).not.toBeInTheDocument();
    expect(attempt.props.onRegistered).not.toHaveBeenCalled();
    expect(attempt.props.onBusyChange).toHaveBeenLastCalledWith(true);
    expect(attempt.props.onBusyChange).not.toHaveBeenCalledWith(false);
    expect(attempt.props.onAccessRejected).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Title')).toHaveValue(literalFields.title);
    expect(screen.getByLabelText('Purpose')).toHaveValue(literalFields.purpose);
    expect(screen.getByLabelText('Title')).toBeDisabled();
    expect(screen.getByLabelText('Purpose')).toBeDisabled();
    expect(
      screen.getByLabelText('Exact executed parent Contract Version'),
    ).toBeDisabled();
    expect(attempt.props.onStarted).toHaveBeenCalledTimes(1);
    expect(attempt.writes).toHaveLength(2);
    expect(attempt.transport).toHaveBeenCalledTimes(3);
  },
);
