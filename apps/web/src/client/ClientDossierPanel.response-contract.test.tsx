import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { ClientDossierPanel } from './ClientDossierPanel';

const dossier = {
  id: 'client-dossier',
  displayName: 'Atlas Client',
  relatedToActiveCompany: true,
  taxId: null,
  address: null,
  telephone: null,
  generalEmail: null,
  businessActivity: null,
  contacts: [],
  version: 1,
  involvedCompanyDisplayNames: [],
};

afterEach(() => vi.unstubAllGlobals());

function mount({
  read = dossier,
  patch,
}: { read?: unknown; patch?: () => Response | Promise<Response> } = {}) {
  const props = {
    clientAccountId: dossier.id,
    companyContextId: 'company',
    canUpdate: true,
    identity: deterministicBrowserIdentity(),
    onCompanyContextRejected: vi.fn(),
    onActivityRecorded: vi.fn(async () => undefined),
    onClientsChanged: vi.fn(async () => undefined),
  };
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), 'http://localhost').pathname;
      if (path.endsWith('/legal-entities'))
        return Response.json({ clientVersion: 1, legalEntities: [] });
      if (path.endsWith('/corrections'))
        return Response.json({ corrections: [], nextCursor: null });
      if (init?.method === 'PATCH' && patch) return patch();
      return Response.json(read);
    },
  );
  vi.stubGlobal('fetch', fetcher);
  return { ...render(<ClientDossierPanel {...props} />), props, fetcher };
}

it('rejects a dossier with an unproved version instead of opening a correction against it', async () => {
  mount({ read: { ...dossier, version: 1.5 } });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We could not load this Client dossier.',
  );
  expect(
    screen.queryByRole('heading', { name: dossier.displayName }),
  ).toBeNull();
});

it('keeps an uncertain correction draft and old dossier when the successful correction response is malformed', async () => {
  const { props } = mount({
    patch: () => Response.json({ ...dossier, version: 1.5 }),
  });
  await screen.findByRole('heading', { name: dossier.displayName });
  fireEvent.change(screen.getByLabelText('Client display name'), {
    target: { value: 'Corrected Client' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The correction could not be saved.',
  );
  expect(
    screen.getByRole('heading', { name: dossier.displayName }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Client display name')).toHaveValue(
    'Corrected Client',
  );
  expect(props.onActivityRecorded).not.toHaveBeenCalled();
  expect(props.onClientsChanged).not.toHaveBeenCalled();
});

it.each([
  null,
  [],
  {},
  { ...dossier, id: 'another-client' },
  { ...dossier, version: 0 },
  { ...dossier, version: Number.MAX_SAFE_INTEGER + 1 },
  { ...dossier, taxId: undefined },
  { ...dossier, address: 42 },
  { ...dossier, relatedToActiveCompany: null },
  { ...dossier, contacts: [{ name: 'Ana', position: 42 }] },
  { ...dossier, contacts: [{ name: 'Ana', decisionRoles: ['unknown'] }] },
  { ...dossier, contacts: [{ name: 'Ana', communicationPreferences: null }] },
  { ...dossier, involvedCompanyDisplayNames: [42] },
])(
  'does not render a partial dossier for malformed success %j',
  async (read) => {
    mount({ read });
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('heading', { name: dossier.displayName }),
    ).toBeNull();
  },
);

it('preserves nullable details, omitted and populated Contact fields and the exact command through an uncertain retry', async () => {
  const contacts = [
    { name: 'Ana' },
    {
      name: 'Bogdan',
      telephone: '+373 123',
      email: 'bogdan@example.test',
      position: 'Director',
      decisionRoles: ['financial', 'technical'],
      communicationPreferences: 'Email first',
    },
  ];
  const read = { ...dossier, contacts, future: true };
  const replies = [
    Response.json({
      ...read,
      contacts: [{ name: 'Unproved', decisionRoles: ['unknown'] }],
    }),
    Response.json({ ...read, displayName: 'Corrected Client', version: 2 }),
  ];
  const { props, fetcher } = mount({
    read,
    patch: () => {
      const reply = replies.shift();
      if (!reply) throw new Error('Unexpected correction request');
      return reply;
    },
  });
  await screen.findByRole('heading', { name: dossier.displayName });
  expect(screen.getAllByLabelText('Contact position')[1]).toHaveValue(
    'Director',
  );
  expect(
    screen.getAllByLabelText('Contact communication preferences')[1],
  ).toHaveValue('Email first');
  fireEvent.change(screen.getByLabelText('Client display name'), {
    target: { value: 'Corrected Client' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  await screen.findByRole('alert');
  expect(props.onActivityRecorded).not.toHaveBeenCalled();
  expect(props.onClientsChanged).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  await screen.findByText('Client correction saved with attributable history.');
  const commands = fetcher.mock.calls
    .filter(([, init]) => init?.method === 'PATCH')
    .map(([, init]) => init);
  const key = new Headers(commands[0]?.headers).get('idempotency-key');
  expect(key).toBeTruthy();
  expect(new Headers(commands[1]?.headers).get('idempotency-key')).toBe(key);
  expect(commands[0]?.body).toBe(
    JSON.stringify({
      expectedVersion: 1,
      displayName: 'Corrected Client',
      taxId: null,
      address: null,
      telephone: null,
      generalEmail: null,
      contacts,
      businessActivity: null,
    }),
  );
  expect(commands[1]?.body).toBe(commands[0]?.body);
  expect(props.onActivityRecorded).toHaveBeenCalledOnce();
  expect(props.onClientsChanged).toHaveBeenCalledOnce();
});

it('rejects authentication loss during correction before decoding a successful dossier', async () => {
  const { props } = mount({ patch: () => Response.json({}, { status: 401 }) });
  const rejectSession = vi.spyOn(props.identity, 'rejectSession');
  await screen.findByRole('heading', { name: dossier.displayName });
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  await waitFor(() => expect(rejectSession).toHaveBeenCalledOnce());
  expect(props.onActivityRecorded).not.toHaveBeenCalled();
  expect(props.onClientsChanged).not.toHaveBeenCalled();
});

it('does not reject the session or publish an acknowledgement after the correction owner unmounts', async () => {
  let resolve: (value: Response) => void = () => {
    throw new Error('Uninitialized response');
  };
  const response = new Promise<Response>((settle) => {
    resolve = settle;
  });
  const { props, fetcher, unmount } = mount({ patch: () => response });
  const rejectSession = vi.spyOn(props.identity, 'rejectSession');
  await screen.findByRole('heading', { name: dossier.displayName });
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH'),
    ).toBe(true),
  );
  const command = fetcher.mock.calls.find(
    ([, init]) => init?.method === 'PATCH',
  )?.[1];
  unmount();
  expect(command?.signal?.aborted).toBe(true);
  await act(async () => {
    resolve(Response.json({}, { status: 401 }));
    await response;
  });
  expect(rejectSession).not.toHaveBeenCalled();
  expect(props.onActivityRecorded).not.toHaveBeenCalled();
  expect(props.onClientsChanged).not.toHaveBeenCalled();
});
