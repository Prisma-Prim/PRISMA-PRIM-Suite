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
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { ReceivedAddendumRegistration } from './ReceivedAddendumRegistration';

const companyId = '10000000-0000-4000-8000-000000000004';
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
};
function actor(): ActorContext {
  return {
    ...completeActor,
    internalUserId: '10000000-0000-4000-8000-000000000001',
    workspaceId: '10000000-0000-4000-8000-000000000002',
    workspaceMembershipId: '10000000-0000-4000-8000-000000000003',
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
        'document.register',
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
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
async function fill() {
  await waitFor(() =>
    expect(
      screen.getByLabelText('Exact executed parent Contract Version'),
    ).not.toBeDisabled(),
  );
  changeValue(
    screen.getByLabelText('Exact executed parent Contract Version'),
    source.parentContractVersionId,
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: '  Literal Титул 🧪  ' },
  });
  fireEvent.change(screen.getByLabelText('Purpose'), {
    target: { value: 'Preserve original' },
  });
  fireEvent.change(screen.getByLabelText('Declared source'), {
    target: { value: '  Fictional source\n  literal spacing  ' },
  });
}
it('locks an uncertain exact parent, literal body and registration key for identical retry', async () => {
  const writes: Array<{ body: string; key: string | null }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        writes.push({
          body: String(init.body),
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return Response.json({}, { status: 201 });
      }
      return Response.json({ sources: [source], nextCursor: null });
    }),
  );
  render(
    <ReceivedAddendumRegistration
      actor={actor()}
      identity={deterministicBrowserIdentity()}
      companyId={companyId}
      onBusyChange={vi.fn()}
      onRegistered={vi.fn()}
      onStarted={vi.fn()}
      onAccessRejected={vi.fn()}
    />,
  );
  await fill();
  expect(screen.getByText('Fictional recorded party')).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Register received Addendum PDF' }),
  );
  await screen.findByRole('button', { name: 'Retry identical registration' });
  expect(screen.getByLabelText('Title')).toBeDisabled();
  expect(
    screen.getByLabelText('Exact executed parent Contract Version'),
  ).toBeDisabled();
  expect(JSON.parse(writes[0]?.body ?? '{}')).toEqual({
    type: 'received-addendum',
    parentContractId: source.parentContractId,
    parentContractVersionId: source.parentContractVersionId,
    title: '  Literal Титул 🧪  ',
    purpose: 'Preserve original',
    sourceDescription: '  Fictional source\n  literal spacing  ',
    receivedOn: null,
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry identical registration' }),
  );
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toEqual(writes[0]);
});

function savedDocument(currentActor: ActorContext) {
  return {
    id: '10000000-0000-4000-8000-000000000009',
    companyId,
    clientId: source.clientId,
    clientDisplayName: source.clientDisplayName,
    title: 'Literal Титул 🧪',
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
    receivedAddendumRelation: {
      access: 'granted',
      opportunityId: '10000000-0000-4000-8000-000000000010',
      parentContractId: source.parentContractId,
      parentContractVersionId: source.parentContractVersionId,
      contractVersionNumber: 2,
      illustrativeReference: 17,
      recordedRecipient: source.recordedRecipient,
      sourceDescription: 'Fictional source\n  literal spacing',
      receivedOn: null,
      registeredAt: '2026-11-06T10:00:00.000Z',
      registeredBy: {
        internalUserId: currentActor.internalUserId,
        workspaceMembershipId: currentActor.workspaceMembershipId,
      },
    },
  };
}
it('keeps confirmed registration confirmed when its independent callback/read refresh fails', async () => {
  const currentActor = actor(),
    registered = vi.fn(async () => {
      throw new Error('Read refresh unavailable');
    }),
    busy = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Response.json(savedDocument(currentActor), { status: 201 })
        : Response.json({ sources: [source], nextCursor: null }),
    ),
  );
  render(
    <ReceivedAddendumRegistration
      actor={currentActor}
      identity={deterministicBrowserIdentity()}
      companyId={companyId}
      onBusyChange={busy}
      onRegistered={registered}
      onStarted={vi.fn()}
      onAccessRejected={vi.fn()}
    />,
  );
  await fill();
  fireEvent.click(
    screen.getByRole('button', { name: 'Register received Addendum PDF' }),
  );
  expect(
    await screen.findByText('The received Addendum Document was registered.'),
  ).toBeInTheDocument();
  expect(registered).toHaveBeenCalledTimes(1);
  expect(busy).toHaveBeenLastCalledWith(false);
  expect(
    screen.queryByRole('button', { name: 'Retry identical registration' }),
  ).not.toBeInTheDocument();
});

it('treats a well-formed response for a different immutable party as uncertain', async () => {
  const currentActor = actor(),
    registered = vi.fn(),
    saved = savedDocument(currentActor);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Response.json(
            {
              ...saved,
              receivedAddendumRelation: {
                ...saved.receivedAddendumRelation,
                recordedRecipient: {
                  ...source.recordedRecipient,
                  legalName: 'A different party',
                },
              },
            },
            { status: 201 },
          )
        : Response.json({ sources: [source], nextCursor: null }),
    ),
  );
  render(
    <ReceivedAddendumRegistration
      actor={currentActor}
      identity={deterministicBrowserIdentity()}
      companyId={companyId}
      onBusyChange={vi.fn()}
      onRegistered={registered}
      onStarted={vi.fn()}
      onAccessRejected={vi.fn()}
    />,
  );
  await fill();
  fireEvent.click(
    screen.getByRole('button', { name: 'Register received Addendum PDF' }),
  );
  await screen.findByRole('button', { name: 'Retry identical registration' });
  expect(registered).not.toHaveBeenCalled();
});

it('preserves literal fields through all locales without duplicate source reads', async () => {
  const identity = deterministicBrowserIdentity(),
    currentActor = actor();
  const transport = vi.fn(async () =>
    Response.json({ sources: [source], nextCursor: null }),
  );
  vi.stubGlobal('fetch', transport);
  const props = {
    actor: currentActor,
    identity,
    companyId,
    onBusyChange: vi.fn(),
    onRegistered: vi.fn(),
    onStarted: vi.fn(),
    onAccessRejected: vi.fn(),
  };
  render(
    <ApplicationPresentation value="prisme">
      <InterfaceLocaleSelect />
      <ReceivedAddendumRegistration {...props} />
    </ApplicationPresentation>,
  );
  await fill();
  fireEvent.change(screen.getByLabelText('Received on (optional)'), {
    target: { value: '2026-02-30' },
  });
  for (const [locale, titleLabel, dateLabel, family] of [
    [
      'fr',
      'Titre',
      'Reçu le (facultatif)',
      'Enregistrer le PDF d’avenant reçu',
    ],
    [
      'ro',
      'Titlu',
      'Primit la (opțional)',
      'Înregistrați PDF-ul actului adițional primit',
    ],
    [
      'ru',
      'Название',
      'Дата получения (необязательно)',
      'Зарегистрировать PDF полученного дополнительного соглашения',
    ],
    ['en', 'Title', 'Received on (optional)', 'Register received Addendum PDF'],
  ]) {
    if (!locale || !titleLabel || !dateLabel || !family)
      throw new Error('Incomplete locale example');
    changeValue(
      screen.getByRole('combobox', {
        name: /Interface language|Langue de l’interface|Limba interfeței|Язык интерфейса/u,
      }),
      locale,
    );
    expect(screen.getByLabelText(titleLabel)).toHaveValue(
      '  Literal Титул 🧪  ',
    );
    expect(screen.getByLabelText(dateLabel)).toHaveValue('2026-02-30');
    expect(screen.getByRole('button', { name: family })).toBeInTheDocument();
  }
  expect(screen.getByLabelText('Title')).toHaveValue('  Literal Титул 🧪  ');
  expect(transport).toHaveBeenCalledTimes(1);
});

it('permanently cancels a held POST parser after exact authority A → B → A replacement', async () => {
  const currentActor = actor(),
    identity = deterministicBrowserIdentity(),
    registered = vi.fn();
  let release: ((value: unknown) => void) | undefined;
  const parsed = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  let postSignal: AbortSignal | null | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        postSignal = init.signal;
        return { ok: true, status: 201, json: () => parsed };
      }
      return Response.json({ sources: [source], nextCursor: null });
    }),
  );
  const props = {
    identity,
    companyId,
    onBusyChange: vi.fn(),
    onRegistered: registered,
    onStarted: vi.fn(),
    onAccessRejected: vi.fn(),
  };
  const view = render(
    <ReceivedAddendumRegistration {...props} actor={currentActor} />,
  );
  await fill();
  fireEvent.click(
    screen.getByRole('button', { name: 'Register received Addendum PDF' }),
  );
  await waitFor(() => expect(postSignal).toBeDefined());
  view.rerender(
    <ReceivedAddendumRegistration
      {...props}
      actor={{
        ...currentActor,
        activeCompany: {
          ...currentActor.activeCompany,
          id: companyId,
          displayName: 'Fictional Company',
          contractPermissionAssignmentId: 'replacement-contract',
        },
      }}
    />,
  );
  view.rerender(
    <ReceivedAddendumRegistration {...props} actor={currentActor} />,
  );
  await act(async () => {
    release?.(savedDocument(currentActor));
  });
  expect(postSignal?.aborted).toBe(true);
  expect(registered).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Title')).toHaveValue('');
});

it('cancels held token acquisition before dispatch after family replacement', async () => {
  const currentActor = actor(),
    baseIdentity = deterministicBrowserIdentity();
  const getToken = vi.fn(async () => 'test-token'),
    identity = { ...baseIdentity, requestHeaders: undefined, getToken };
  const transport = vi.fn(async (_input: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? Response.json({}, { status: 201 })
      : Response.json({ sources: [source], nextCursor: null }),
  );
  vi.stubGlobal('fetch', transport);
  const props = {
    identity,
    companyId,
    onBusyChange: vi.fn(),
    onRegistered: vi.fn(),
    onStarted: vi.fn(),
    onAccessRejected: vi.fn(),
  };
  const view = render(
    <ReceivedAddendumRegistration {...props} actor={currentActor} />,
  );
  await fill();
  let release: ((token: string) => void) | undefined;
  getToken.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Register received Addendum PDF' }),
  );
  await screen.findByRole('button', { name: 'Registering received Addendum…' });
  view.rerender(
    <ReceivedAddendumRegistration
      {...props}
      actor={{
        ...currentActor,
        activeCompany: {
          ...currentActor.activeCompany,
          id: companyId,
          displayName: 'Fictional Company',
          receivedAddendumAccessAssignmentId:
            '10000000-0000-4000-8000-000000000099',
        },
      }}
    />,
  );
  await act(async () => {
    release?.('test-token');
  });
  expect(
    transport.mock.calls.every(([, init]) => init?.method !== 'POST'),
  ).toBe(true);
  expect(screen.getByLabelText('Title')).toHaveValue('');
});

it('supports keyboard parent selection and associates a real Gregorian date error with preserved literal fields', async () => {
  const transport = vi.fn(async () =>
    Response.json({ sources: [source], nextCursor: null }),
  );
  vi.stubGlobal('fetch', transport);
  render(
    <ReceivedAddendumRegistration
      actor={actor()}
      identity={deterministicBrowserIdentity()}
      companyId={companyId}
      onBusyChange={vi.fn()}
      onRegistered={vi.fn()}
      onStarted={vi.fn()}
      onAccessRejected={vi.fn()}
    />,
  );
  const parent = screen.getByLabelText(
    'Exact executed parent Contract Version',
  );
  await waitFor(() => expect(parent).not.toBeDisabled());
  parent.focus();
  fireEvent.keyDown(parent, { key: 'ArrowDown' });
  fireEvent.keyDown(parent, { key: 'ArrowDown' });
  fireEvent.keyDown(parent, { key: 'Enter' });
  expect(parent).toHaveFocus();
  expect(screen.getByText('Fictional recorded party')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Fictional source' },
  });
  fireEvent.change(screen.getByLabelText('Purpose'), {
    target: { value: 'Preserve original' },
  });
  fireEvent.change(screen.getByLabelText('Declared source'), {
    target: { value: 'Fictional sender' },
  });
  const received = screen.getByLabelText('Received on (optional)');
  fireEvent.change(received, { target: { value: '1900-02-29' } });
  fireEvent.click(
    screen.getByRole('button', { name: 'Register received Addendum PDF' }),
  );
  const error = screen.getByRole('alert');
  expect(error).toHaveFocus();
  expect(received).toHaveAttribute('aria-invalid', 'true');
  expect(received.getAttribute('aria-describedby')).toContain(error.id);
  expect(received).toHaveValue('1900-02-29');
  expect(transport).toHaveBeenCalledTimes(1);
});

it('passes a retiring full-Actor guard to access recovery and preserves explicit denial when recovery fails', async () => {
  const currentActor = actor(),
    identity = deterministicBrowserIdentity(),
    publish = vi.fn();
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const rejected = vi.fn(
    async (_signal: AbortSignal, isCurrent?: () => boolean) => {
      await held;
      if (isCurrent?.()) publish();
      throw new Error('Actor recovery unavailable');
    },
  );
  const transport = vi.fn(async () => new Response(null, { status: 403 }));
  vi.stubGlobal('fetch', transport);
  const props = {
    identity,
    companyId,
    onBusyChange: vi.fn(),
    onRegistered: vi.fn(),
    onStarted: vi.fn(),
    onAccessRejected: rejected,
  };
  const view = render(
    <ReceivedAddendumRegistration {...props} actor={currentActor} />,
  );
  await screen.findByText(
    'Source selection is unavailable under your current access.',
  );
  await waitFor(() => expect(rejected).toHaveBeenCalledTimes(1));
  view.rerender(
    <ReceivedAddendumRegistration
      {...props}
      actor={{
        ...currentActor,
        activeCompany: {
          ...currentActor.activeCompany,
          id: companyId,
          displayName: 'Fictional Company',
          contractModelGrants: { unrelatedReplacement: true },
        },
      }}
    />,
  );
  await act(async () => {
    release?.();
  });
  expect(publish).not.toHaveBeenCalled();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(
    screen.getByText(
      'Source selection is unavailable under your current access.',
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Retry identical registration' }),
  ).not.toBeInTheDocument();
});

it('exposes safe loading retry and empty state without inventing an alternate family', async () => {
  const transport = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ sources: [], nextCursor: null }));
  vi.stubGlobal('fetch', transport);
  render(
    <ReceivedAddendumRegistration
      actor={actor()}
      identity={deterministicBrowserIdentity()}
      companyId={companyId}
      onBusyChange={vi.fn()}
      onRegistered={vi.fn()}
      onStarted={vi.fn()}
      onAccessRejected={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Retry loading' }));
  expect(
    await screen.findByText(
      'No eligible executed parent Contract Version is available.',
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByLabelText('Exact executed parent Contract Version'),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Register received Addendum PDF' }),
  ).toBeDisabled();
});
