import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { CompanyRegistration } from './CompanyRegistration';

const actor: ActorContext = {
  internalUserId: 'user',
  workspaceMembershipId: 'membership',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Ada',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: ['company.manage'],
};
const company = {
  id: 'created-company',
  workspaceId: actor.workspaceId,
  displayName: 'New Provider',
  status: 'active',
  createdAt: '2026-11-01T10:00:00.000Z',
  createdByInternalUserId: actor.internalUserId,
};

afterEach(() => vi.unstubAllGlobals());

function mount() {
  const props = {
    actor,
    identity: deterministicBrowserIdentity(),
    onCompanyContextRejected: vi.fn(),
    onCompanyRegistered: vi.fn(),
  };
  const view = render(<CompanyRegistration {...props} />);
  fireEvent.change(screen.getByLabelText('Company display name'), {
    target: { value: 'New Provider' },
  });
  return { ...view, props };
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Register Company' }));
}

it.each([{}, null, [], { id: '' }, { id: 42 }])(
  'rejects an unreadable creation reference %j before trying to read or publish a Company',
  async (created) => {
    const fetcher = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (_input, init) =>
      Response.json(init?.method === 'POST' ? created : company),
    );
    vi.stubGlobal('fetch', fetcher);
    const { props } = mount();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not register the Company.',
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(props.onCompanyRegistered).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Company display name')).toHaveValue(
      'New Provider',
    );
  },
);

it.each([
  null,
  {},
  { ...company, status: 'inactive' },
  { ...company, createdAt: 'unreadable' },
  { ...company, id: 'another-company' },
  { ...company, workspaceId: 'another-workspace' },
  { ...company, displayName: 42 },
  { ...company, createdByInternalUserId: null },
])(
  'does not publish an unproved Company %j from the confirming read after an id-only creation response',
  async (confirmed) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        Response.json(init?.method === 'POST' ? { id: company.id } : confirmed),
      ),
    );
    const { props } = mount();
    submit();
    await screen.findByRole('alert');
    expect(props.onCompanyRegistered).not.toHaveBeenCalled();
  },
);

it.each(['create', 'read'])(
  'retries the exact command after malformed %s success and publishes only the confirmed additive Company',
  async (phase) => {
    const commands: RequestInit[] = [];
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          commands.push(init);
          return Response.json(
            phase === 'create' && commands.length === 1
              ? {}
              : { id: company.id, future: true },
          );
        }
        return Response.json(
          phase === 'read' && commands.length === 1
            ? { ...company, createdAt: null }
            : { ...company, future: true },
        );
      },
    );
    vi.stubGlobal('fetch', fetcher);
    const { props } = mount();
    submit();
    await screen.findByRole('alert');
    expect(props.onCompanyRegistered).not.toHaveBeenCalled();
    submit();
    await screen.findByRole('heading', { name: company.displayName });
    expect(props.onCompanyRegistered).toHaveBeenCalledExactlyOnceWith(company);
    const key = new Headers(commands[0]?.headers).get('idempotency-key');
    expect(key).toBeTruthy();
    expect(new Headers(commands[1]?.headers).get('idempotency-key')).toBe(key);
    expect(commands[0]?.body).toBe(
      JSON.stringify({ displayName: 'New Provider' }),
    );
    expect(commands[1]?.body).toBe(commands[0]?.body);
  },
);

it.each(['create', 'read'])(
  'rejects lost authentication during %s without publishing a Company',
  async (phase) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST' && phase === 'read'
          ? Response.json({ id: company.id })
          : Response.json({}, { status: 401 }),
      ),
    );
    const { props } = mount();
    const rejectSession = vi.spyOn(props.identity, 'rejectSession');
    submit();
    await waitFor(() => expect(rejectSession).toHaveBeenCalledOnce());
    expect(props.onCompanyRegistered).not.toHaveBeenCalled();
  },
);

it.each(['create', 'read'])(
  'ignores a retired %s operation and does not publish or make a follow-on read',
  async (phase) => {
    let resolve: (value: Response) => void = () => {
      throw new Error('Uninitialized response');
    };
    const response = new Promise<Response>((settle) => {
      resolve = settle;
    });
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST' && phase === 'read'
          ? Response.json({ id: company.id })
          : response,
    );
    vi.stubGlobal('fetch', fetcher);
    const { props, unmount } = mount();
    submit();
    const count = phase === 'create' ? 1 : 2;
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(count));
    const signal = fetcher.mock.calls[count - 1]?.[1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolve(Response.json(company));
      await response;
    });
    expect(props.onCompanyRegistered).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(count);
  },
);
