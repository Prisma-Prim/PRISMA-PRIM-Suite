import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import type { ActorContext } from '../access-types';
import { withCompanyGrants } from '../access/company-grants.test-fixture';
import type { BrowserIdentity } from '../access-composition';
import { InvoiceRecordRelations } from './InvoiceRecordRelations';
import { actor, financeOnly, identity, ids } from './invoice-record.fixture';

const requestId = '30000000-0000-4000-8000-000000000001';
const native = {
  contract: {
    id: ids.contract,
    companyId: ids.company,
    opportunityId: ids.opportunity,
    kind: 'CONTRACT',
    clientRequestId: requestId,
    version: { id: ids.contractVersion },
  },
};
const callbacks = {
  onCompanyContextRejected: vi.fn(),
  onActorRevalidated: vi.fn(),
  onWorkspaceAccessRejected: vi.fn(),
  onDenied: vi.fn(),
};
function view(
  open: (input: unknown) => void,
  currentActor: ActorContext = actor,
  currentIdentity: BrowserIdentity = identity,
) {
  return (
    <InvoiceRecordRelations
      actor={currentActor}
      identity={currentIdentity}
      {...callbacks}
      companyId={ids.company}
      recordId={ids.record}
      downloadAuthority={null}
      source={undefined}
      related={{
        client: { kind: 'UNAVAILABLE' },
        contract: {
          kind: 'AVAILABLE',
          opportunityId: ids.opportunity,
          contractId: ids.contract,
          contractVersionId: ids.contractVersion,
        },
      }}
      editing={false}
      onOpenContract={open}
    />
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

it('opens only the exact native Contract Version after resolving its native Client Request, without financial navigation identifiers', async () => {
  const open = vi.fn();
  let release: (() => void) | undefined;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return Response.json(native);
  });
  vi.stubGlobal('fetch', fetcher);
  const originalUrl = location.href;
  render(view(open));
  fireEvent.click(
    screen.getByRole('button', { name: 'Open authorized Contract' }),
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(open).not.toHaveBeenCalled();
  await act(async () => {
    release?.();
  });
  await waitFor(() =>
    expect(open).toHaveBeenCalledWith({
      opportunityId: ids.opportunity,
      contractId: ids.contract,
      contractVersionId: ids.contractVersion,
      clientRequestId: requestId,
    }),
  );
  expect(requests[0]?.url).toBe(
    `/api/contracts/opportunities/${ids.opportunity}/versions/${ids.contractVersion}`,
  );
  expect(requests[0]?.init).toMatchObject({ cache: 'no-store' });
  expect(
    new Headers(requests[0]?.init?.headers).get('x-company-context-id'),
  ).toBe(ids.company);
  expect(location.href).toBe(originalUrl);
});

it.each([
  { companyId: ids.workspace },
  { id: ids.document },
  { opportunityId: ids.document },
  { version: { id: ids.document } },
  { kind: 'PRECONTRACT' },
  { clientRequestId: 'not-a-request-identity' },
])(
  'refuses a native Contract projection that does not establish the exact target: %o',
  async (change) => {
    const open = vi.fn();
    vi.stubGlobal('fetch', async () =>
      Response.json({ contract: { ...native.contract, ...change } }),
    );
    render(view(open));
    fireEvent.click(
      screen.getByRole('button', { name: 'Open authorized Contract' }),
    );
    await screen.findByText('The Contract could not be loaded. Try again.');
    expect(open).not.toHaveBeenCalled();
  },
);

it('performs no native Contract request using financial permissions alone', () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(view(vi.fn(), financeOnly));
  expect(
    screen.queryByRole('button', { name: 'Open authorized Contract' }),
  ).not.toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});

it('retires a held token through equal-permission native Contract A → B → A before dispatch and permits a fresh click', async () => {
  const open = vi.fn();
  let release: ((token: string | null) => void) | undefined;
  let lookups = 0;
  const held: BrowserIdentity = {
    ...identity,
    requestHeaders: undefined,
    getToken: () =>
      ++lookups === 1
        ? new Promise<string | null>((resolve) => {
            release = resolve;
          })
        : Promise.resolve('current-token'),
  };
  const fetcher = vi.fn(async () => Response.json(native));
  vi.stubGlobal('fetch', fetcher);
  const rendered = render(view(open, actor, held));
  fireEvent.click(
    screen.getByRole('button', { name: 'Open authorized Contract' }),
  );
  await waitFor(() => expect(lookups).toBe(1));
  const replacement: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: ids.company,
      displayName: 'Fictional Company',
      contractPermissionAssignmentId: '30000000-0000-4000-8000-000000000002',
      grants: withCompanyGrants(actor.activeCompany?.grants, {
        bundle: 'company_contract_preparer',
        version: 'v2',
        assignmentId: '30000000-0000-4000-8000-000000000002',
      }),
    },
  };
  rendered.rerender(view(open, replacement, held));
  rendered.rerender(view(open, actor, held));
  await act(async () => {
    release?.('retired-token');
  });
  expect(fetcher).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Open authorized Contract' }),
  );
  await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
});

it('retires a held native response on unmount before any navigation callback', async () => {
  const open = vi.fn();
  let release: (() => void) | undefined;
  vi.stubGlobal('fetch', async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return Response.json(native);
  });
  const rendered = render(view(open));
  fireEvent.click(
    screen.getByRole('button', { name: 'Open authorized Contract' }),
  );
  await waitFor(() => expect(release).toBeTypeOf('function'));
  rendered.unmount();
  await act(async () => {
    release?.();
  });
  expect(open).not.toHaveBeenCalled();
});

it.each([404, 503])(
  'keeps a native %s failure local and exposes no server payload',
  async (status) => {
    const open = vi.fn();
    vi.stubGlobal('fetch', async () =>
      Response.json({ message: 'SECRET NATIVE PAYLOAD' }, { status }),
    );
    render(view(open));
    fireEvent.click(
      screen.getByRole('button', { name: 'Open authorized Contract' }),
    );
    await screen.findByText(
      status === 404
        ? 'The Contract source is unavailable.'
        : 'The Contract could not be loaded. Try again.',
    );
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByText('SECRET NATIVE PAYLOAD')).not.toBeInTheDocument();
    expect(callbacks.onDenied).not.toHaveBeenCalled();
  },
);
