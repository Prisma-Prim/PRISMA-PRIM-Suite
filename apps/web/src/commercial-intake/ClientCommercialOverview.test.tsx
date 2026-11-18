import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import {
  startTransition,
  Suspense,
  useState,
  type ComponentProps,
} from 'react';
import type { ActorContext } from '../access-types';
import { deterministicBrowserIdentity } from '../access-composition';
import { buildRequestListItem } from '../test/commercial-intake-responses';
import { ClientCommercialOverview } from './ClientCommercialOverview';
import { readCurrentActor } from '../access/current-actor';
import {
  companyGrants,
  withCompanyGrants,
  withoutCompanyGrants,
} from '../access/company-grants.test-fixture';

const company: NonNullable<ActorContext['activeCompany']> = {
  id: 'company-1',
  displayName: 'Synthetic Company',
  grants: companyGrants(
    {
      bundle: 'company_director_client_access',
      version: 'v2',
      assignmentId: 'client-assignment',
    },
    {
      bundle: 'company_commercial_intake',
      version: 'v4',
      assignmentId: 'intake-assignment',
    },
  ),
};
const actor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'member-1',
  workspaceId: 'workspace-1',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Reader',
  email: 'reader@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: company,
};
const identity = deterministicBrowserIdentity();
function row(id = 'request-1', clientDossierId = 'client-1') {
  return buildRequestListItem({
    id,
    subject: `Affair ${id}`,
    clientDossierId,
    clientDisplayName: 'Synthetic Client',
    initialOpportunity: {
      nextAction: `Follow up ${id}`,
      responsibleActor: {
        workspaceMembershipId: 'member-1',
        displayName: 'Responsible colleague',
      },
    },
  });
}
type Props = ComponentProps<typeof ClientCommercialOverview>;
function props(overrides: Partial<Props> = {}): Props {
  return {
    actor,
    identity,
    clientDossierId: 'client-1',
    clientIdentityRevision: 0,
    onOpenRequest: vi.fn(),
    onCompanyContextRejected: vi.fn(),
    onActorRevalidated: vi.fn(),
    ...overrides,
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

it('shows recorded facts, pages through only this Client and opens its exact Request', async () => {
  const first = Array.from({ length: 25 }, (_, index) =>
    row(`request-${index}`),
  );
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    const url = new URL(path, 'http://localhost');
    expect(url.searchParams.get('clientDossierId')).toBe('client-1');
    expect(new Headers(init?.headers).get('x-company-context-id')).toBe(
      'company-1',
    );
    return Response.json(
      url.searchParams.has('cursor')
        ? { items: [row('older')] }
        : { items: first, nextCursor: 'opaque-page' },
    );
  });
  vi.stubGlobal('fetch', fetch);
  const input = props();
  render(<ClientCommercialOverview {...input} />);
  await screen.findByText('Follow up request-0');
  expect(screen.getAllByText('Responsible colleague')).toHaveLength(25);
  expect(screen.getAllByText('Open', { exact: true })).toHaveLength(25);
  fireEvent.click(screen.getByRole('button', { name: 'Older affairs' }));
  await screen.findByText('Follow up older');
  expect(screen.queryByText('Follow up request-0')).not.toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Commercial affairs' }),
  ).toHaveFocus();
  fireEvent.click(
    screen.getByRole('button', { name: 'Open Request: Affair older' }),
  );
  expect(input.onOpenRequest).toHaveBeenCalledWith(
    'older',
    expect.any(AbortSignal),
  );
  expect(screen.getByRole('button', { name: 'Older affairs' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous affairs' }));
  await screen.findByText('Follow up request-0');
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh affairs from beginning' }),
  );
  await screen.findByText('Follow up request-0');
  expect(fetch).toHaveBeenCalledTimes(4);
});

it('distinguishes failed reads, retries and genuinely empty results', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ items: [] })),
  );
  render(<ClientCommercialOverview {...props()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Commercial affairs could not be loaded.',
  );
  expect(
    screen.queryByText(
      'No commercial affairs for this client in this company.',
    ),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry this page' }));
  expect(
    await screen.findByText(
      'No commercial affairs for this client in this company.',
    ),
  ).toBeVisible();
});

it.each([
  { items: [row('wrong-client', 'client-hidden')] },
  { items: [row(), row()] },
  {
    items: [
      {
        ...row(),
        initialOpportunity: { ...row().initialOpportunity, status: 'FUTURE' },
      },
    ],
  },
  { items: [row()], nextCursor: 'invalid-short-page' },
])(
  'refuses a malformed or differently scoped page without showing its facts %#',
  async (page) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(page)),
    );
    render(<ClientCommercialOverview {...props()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Commercial affairs could not be loaded.',
    );
    expect(screen.queryByText('Responsible colleague')).not.toBeInTheDocument();
  },
);

it.each(['client-only', 'intake-only'] as const)(
  'does not prefetch or display protected facts for %s',
  (caseName) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const activeCompany = {
      ...company,
      grants: withoutCompanyGrants(
        company.grants,
        caseName === 'client-only'
          ? 'company_commercial_intake'
          : 'company_director_client_access',
      ),
    };
    render(
      <ClientCommercialOverview
        {...props({ actor: { ...actor, activeCompany } })}
      />,
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  },
);

it.each([
  ['unknown-client-capture', 'company_director_client_access'],
  ['unknown-intake-capture', 'company_commercial_intake'],
] as const)(
  'refuses the whole current Actor for %s, so no protected fact is offered',
  async (_caseName, bundle) => {
    // An unknown captured version refuses the whole current Actor (#1332), so
    // the overview never receives authority from it.
    const read = (value: unknown) =>
      readCurrentActor({
        api: { request: async () => ({ status: 'ok', value }) },
      });
    expect((await read(actor)).status).toBe('ok');
    expect(
      await read({
        ...actor,
        activeCompany: {
          ...company,
          grants: company.grants?.map((grant) =>
            grant.bundle === bundle
              ? { ...grant, permissionSetVersion: 'future' }
              : grant,
          ),
        },
      }),
    ).toEqual({ status: 'error' });
  },
);

it.each([
  'company',
  'client',
  'actor',
  'identity',
  'capture',
  'client-identity',
] as const)(
  'retires abort-ignoring success and refusal replies after %s changes',
  async (change) => {
    for (const status of [200, 403]) {
      let release: ((response: Response) => void) | undefined;
      const held = new Promise<Response>((resolve) => {
        release = resolve;
      });
      const signals: (AbortSignal | undefined | null)[] = [];
      const input = props();
      const next: Props = { ...input };
      if (change === 'company')
        next.actor = {
          ...actor,
          activeCompany: { ...company, id: 'company-2' },
        };
      if (change === 'client') next.clientDossierId = 'client-2';
      if (change === 'actor')
        next.actor = {
          ...actor,
          internalUserId: 'user-2',
          workspaceMembershipId: 'member-2',
        };
      if (change === 'identity') next.identity = deterministicBrowserIdentity();
      if (change === 'capture')
        next.actor = {
          ...actor,
          activeCompany: {
            ...company,
            grants: withCompanyGrants(company.grants, {
              bundle: 'company_commercial_intake',
              version: 'v4',
              assignmentId: 'replacement-intake',
            }),
          },
        };
      if (change === 'client-identity') next.clientIdentityRevision = 1;
      const fetch = vi.fn(async (_path: string, init?: RequestInit) => {
        signals.push(init?.signal);
        return signals.length === 1
          ? held
          : Response.json({
              items: [row('new-context', next.clientDossierId)],
            });
      });
      vi.stubGlobal('fetch', fetch);
      const rendered = render(<ClientCommercialOverview {...input} />);
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      rendered.rerender(<ClientCommercialOverview {...next} />);
      expect(await screen.findByText('Follow up new-context')).toBeVisible();
      expect(signals[0]?.aborted).toBe(true);
      await act(async () => {
        release?.(
          Response.json({ items: [row('retired-context')] }, { status }),
        );
        await held;
      });
      expect(
        screen.queryByText('Follow up retired-context'),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(input.onCompanyContextRejected).not.toHaveBeenCalled();
      expect(input.onActorRevalidated).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(2);
      rendered.unmount();
    }
  },
);

it('retires navigation from an unavailable Client scope and renews it only after a validated retry', async () => {
  const opened = vi.fn<Props['onOpenRequest']>();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [row()] }))
      .mockResolvedValueOnce(Response.json({}, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ items: [row()] })),
  );
  render(<ClientCommercialOverview {...props({ onOpenRequest: opened })} />);
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Open Request: Affair request-1',
    }),
  );
  const firstSource = opened.mock.calls[0]?.[1];
  expect(firstSource?.aborted).toBe(false);
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh affairs from beginning' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Commercial affairs are unavailable',
  );
  expect(firstSource?.aborted).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry this page' }));
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Open Request: Affair request-1',
    }),
  );
  const secondSource = opened.mock.calls[1]?.[1];
  expect(secondSource?.aborted).toBe(false);
  expect(secondSource).not.toBe(firstSource);
});

it('retires loaded affairs on a current refusal and revalidates without clearing unrelated content', async () => {
  const input = props();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ items: [row()] }))
    .mockResolvedValueOnce(Response.json({}, { status: 403 }))
    .mockResolvedValueOnce(
      Response.json({
        ...actor,
        activeCompany: {
          ...company,
          grants: withoutCompanyGrants(
            company.grants,
            'company_commercial_intake',
          ),
        },
      }),
    );
  vi.stubGlobal('fetch', fetch);
  render(
    <>
      <p>Shared identity stays readable</p>
      <ClientCommercialOverview {...input} />
    </>,
  );
  await screen.findByText('Follow up request-1');
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh affairs from beginning' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Commercial affairs are unavailable',
  );
  expect(screen.queryByText('Follow up request-1')).not.toBeInTheDocument();
  await waitFor(() => expect(input.onActorRevalidated).toHaveBeenCalledOnce());
  expect(screen.getByText('Shared identity stays readable')).toBeVisible();
  expect(input.onCompanyContextRejected).not.toHaveBeenCalled();
});

it('retires an older Actor recovery while preserving the current commercial read owner', async () => {
  const olderActor: ActorContext = {
    ...actor,
    activeCompany: {
      ...company,
      grants: withCompanyGrants(company.grants, {
        bundle: 'company_document_content_reader',
        version: 'v1',
        assignmentId: 'unrelated-content-reader',
      }),
    },
  };
  const input = props({
    actor: olderActor,
    onWorkspaceAccessRejected: vi.fn(),
  });
  const recoveries: ((value: Response) => void)[] = [];
  let reads = 0;
  vi.stubGlobal('fetch', async (path: string) => {
    const url = new URL(path, 'http://localhost');
    if (url.pathname === '/api/access/current-actor')
      return new Promise<Response>((resolve) => recoveries.push(resolve));
    if (url.pathname === '/api/commercial-intake/requests') {
      reads += 1;
      return Response.json({}, { status: 403 });
    }
    throw new Error(`Unexpected native HTTP path: ${url.pathname}`);
  });
  const view = render(<ClientCommercialOverview {...input} />);
  await waitFor(() => expect(recoveries).toHaveLength(1));
  view.rerender(<ClientCommercialOverview {...input} actor={actor} />);
  await act(async () => recoveries[0]?.(Response.json(olderActor)));
  expect(reads).toBe(1);
  expect(input.onActorRevalidated).not.toHaveBeenCalled();
  expect(input.onCompanyContextRejected).not.toHaveBeenCalled();
  expect(input.onWorkspaceAccessRejected).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Retry this page' }));
  await waitFor(() => expect(recoveries).toHaveLength(2));
  await act(async () => recoveries[1]?.(Response.json(actor)));
  await waitFor(() =>
    expect(input.onActorRevalidated).toHaveBeenCalledExactlyOnceWith(actor),
  );
});

it('retains the displayed affairs page after an uncommitted session replacement is abandoned', async () => {
  const replacement = deterministicBrowserIdentity({
    'x-test-external-subject': 'abandoned-commercial-session',
  });
  const pending = new Promise<never>(() => undefined);
  let attemptedReplacement = false;
  function PendingReplacement(): never {
    attemptedReplacement = true;
    throw pending;
  }
  const first = Array.from({ length: 25 }, (_, index) => row(`first-${index}`));
  const fetch = vi.fn(async (path: string) => {
    const url = new URL(path, 'http://localhost');
    return Response.json(
      url.searchParams.has('cursor')
        ? { items: [row('older')] }
        : { items: first, nextCursor: 'older-affairs-cursor' },
    );
  });
  vi.stubGlobal('fetch', fetch);
  const input = props();
  function Frame() {
    const [selection, setSelection] = useState({ identity, suspended: false });
    return (
      <>
        <button
          onClick={() =>
            startTransition(() =>
              setSelection({ identity: replacement, suspended: true }),
            )
          }
        >
          Consider another session
        </button>
        <button onClick={() => setSelection({ identity, suspended: false })}>
          Keep the displayed session
        </button>
        <Suspense fallback={<p>Pending session</p>}>
          <ClientCommercialOverview {...input} identity={selection.identity} />
          {selection.suspended && <PendingReplacement />}
        </Suspense>
      </>
    );
  }
  render(<Frame />);
  await screen.findByText('Follow up first-0');
  fireEvent.click(screen.getByRole('button', { name: 'Older affairs' }));
  await screen.findByText('Follow up older');
  const previousCalls = fetch.mock.calls.length;
  fireEvent.click(
    screen.getByRole('button', { name: 'Consider another session' }),
  );
  await waitFor(() => expect(attemptedReplacement).toBe(true));
  expect(screen.getByText('Follow up older')).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Keep the displayed session' }),
  );
  expect(screen.getByRole('status')).toHaveTextContent('Page 2');
  expect(screen.getByText('Follow up older')).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(previousCalls);
});
