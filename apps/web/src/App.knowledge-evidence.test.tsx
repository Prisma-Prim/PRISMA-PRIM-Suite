import { webcrypto } from 'node:crypto';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from './test/render-with-interface-locale';
import { installParentServer } from './test/mission-applicability-app-fixture';
import {
  knowledgeActor,
  passage,
  source,
} from './knowledge-evidence/knowledge.test-fixture';
import type { ActorContext } from './access-types';
import { changeValue } from './test/select-option';
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: () => false,
        }) satisfies MediaQueryList,
    ),
  );
  window.history.replaceState(null, '', '/#knowledge-evidence');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

async function openAppCitation() {
  await screen.findByText(source.title);
  const query = screen.getByRole('textbox', { name: 'Literal search' });
  fireEvent.change(query, { target: { value: ' Four Ж' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search passages' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open passage' }));
  await screen.findByRole('article', { name: source.title });
  return query;
}

for (const mode of ['current', 'historical'] as const)
  it.each([
    {
      fault: 'malformed retrieval instant',
      reply: () => ({ ...passage(), retrievedAt: 'not-an-instant' }),
    },
    {
      fault: 'foreign exact Representation',
      reply: () => ({
        ...passage(),
        source: {
          ...source,
          representationId: '40000000-0000-4000-8000-000000001016',
        },
      }),
    },
    {
      fault: 'incompatible passage digest',
      reply: () => ({ ...passage(), passageSha256: '0'.repeat(64) }),
    },
  ])(
    `clears stale ${mode} citation after a PDF preflight with $fault through the actual App`,
    async ({ reply }) => {
      let broken = false;
      const evidenceRequests: string[] = [],
        nativeRequests: string[] = [],
        created = vi.fn(() => 'blob:withheld-preflight'),
        click = vi
          .spyOn(HTMLAnchorElement.prototype, 'click')
          .mockImplementation(() => undefined);
      vi.stubGlobal(
        'URL',
        class extends URL {
          static createObjectURL = created;
          static revokeObjectURL = vi.fn();
        },
      );
      installParentServer(
        () => knowledgeActor,
        async (path, _init, url) => {
          if (path.includes('/content/')) {
            nativeRequests.push(url.pathname);
            return new Response('%PDF-test exact source', {
              headers: { 'content-type': 'application/pdf' },
            });
          }
          if (!path.startsWith('/api/knowledge/evidence/')) return undefined;
          evidenceRequests.push(url.pathname + url.search);
          if (path.includes('/passages/')) {
            if (broken) return Response.json(reply());
            return Response.json(
              url.searchParams.get('mode') === 'historical'
                ? {
                    ...passage(),
                    source: { ...source, versionStatus: 'superseded' },
                    retrievedAt: '2026-11-02T12:00:00.000Z',
                  }
                : passage(),
            );
          }
          return Response.json({
            items: [path.endsWith('/search') ? passage() : source],
            nextCursor: null,
          });
        },
      );
      render(<App identity={deterministicBrowserIdentity()} />);
      const query = await openAppCitation();
      if (mode === 'historical') {
        fireEvent.click(
          screen.getByRole('button', {
            name: 'Reopen this cited version — ' + source.title,
          }),
        );
        await screen.findByText('Historical evidence');
      }
      broken = true;
      const before = evidenceRequests.length;
      fireEvent.click(
        screen.getByRole('button', { name: 'Download exact source PDF' }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('article', { name: source.title }),
        ).toBeNull(),
      );
      const panel = screen.getByRole('region', { name: 'Knowledge evidence' });
      expect(
        within(panel).getByText('The evidence response could not be verified.'),
      ).toBeVisible();
      expect(within(panel).queryByText(source.title)).toBeNull();
      expect(within(panel).queryByText(/Exact cited version ·/)).toBeNull();
      expect(
        within(panel).queryByRole('button', {
          name: 'Download exact source PDF',
        }),
      ).toBeNull();
      expect(
        within(panel).queryByRole('button', {
          name: 'Reopen this cited version — ' + source.title,
        }),
      ).toBeNull();
      expect(query).toHaveValue(' Four Ж');
      expect(evidenceRequests.slice(before)).toEqual([
        `/api/knowledge/evidence/sources/${source.sourceId}/passages/${encodeURIComponent(passage().locator)}` +
          (mode === 'historical'
            ? `?mode=historical&documentVersionId=${source.documentVersionId}`
            : ''),
      ]);
      expect(nativeRequests).toEqual([]);
      expect(created).not.toHaveBeenCalled();
      expect(click).not.toHaveBeenCalled();
      broken = false;
      fireEvent.click(within(panel).getByRole('button', { name: 'Retry' }));
      await within(panel).findByRole('button', { name: 'Open passage' });
      expect(query).toHaveValue(' Four Ж');
      expect(within(panel).queryByRole('article')).toBeNull();
      expect(nativeRequests).toEqual([]);
      expect(created).not.toHaveBeenCalled();
      expect(click).not.toHaveBeenCalled();
    },
  );

it.each(['query change', 'section departure'] as const)(
  'keeps a retired malformed PDF preflight inert after %s through the actual App',
  async (retirement) => {
    let release: (response: Response) => void = () => {
      throw new Error('PDF preflight not started.');
    };
    const delayed = new Promise<Response>((resolve) => {
      release = resolve;
    });
    let hold = false,
      held = false;
    const nativeRequests: string[] = [],
      created = vi.fn(() => 'blob:withheld-retired-preflight'),
      rejected = vi.fn(async () => undefined),
      click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = created;
        static revokeObjectURL = vi.fn();
      },
    );
    installParentServer(
      () => knowledgeActor,
      async (path) => {
        if (path.includes('/content/')) {
          nativeRequests.push(path);
          return new Response('%PDF-test exact source', {
            headers: { 'content-type': 'application/pdf' },
          });
        }
        if (!path.startsWith('/api/knowledge/evidence/')) return undefined;
        if (path.includes('/passages/')) {
          if (hold) {
            held = true;
            return delayed;
          }
          return Response.json(passage());
        }
        return Response.json({
          items: [path.endsWith('/search') ? passage() : source],
          nextCursor: null,
        });
      },
    );
    render(
      <App
        identity={{
          ...deterministicBrowserIdentity(),
          rejectSession: rejected,
        }}
      />,
    );
    const query = await openAppCitation();
    hold = true;
    fireEvent.click(
      screen.getByRole('button', { name: 'Download exact source PDF' }),
    );
    await waitFor(() => expect(held).toBe(true));
    if (retirement === 'query change') {
      query.focus();
      fireEvent.change(query, { target: { value: 'new exact query' } });
    } else {
      fireEvent.click(
        within(
          screen.getByRole('navigation', { name: 'Primary navigation' }),
        ).getByRole('link', { name: 'Overview' }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('region', { name: 'Knowledge evidence' }),
        ).toBeNull(),
      );
    }
    const focused = document.activeElement;
    await act(async () =>
      release(Response.json({ ...passage(), retrievedAt: 'not-an-instant' })),
    );
    expect(screen.queryByRole('article', { name: source.title })).toBeNull();
    expect(
      screen.queryByText('The evidence response could not be verified.'),
    ).toBeNull();
    if (retirement === 'query change')
      expect(query).toHaveValue('new exact query');
    else
      expect(
        screen.queryByRole('region', { name: 'Knowledge evidence' }),
      ).toBeNull();
    expect(document.activeElement).toBe(focused);
    expect(nativeRequests).toEqual([]);
    expect(created).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(rejected).not.toHaveBeenCalled();
  },
);
it.each([
  undefined,
  {},
  [],
  [
    {
      ...knowledgeActor.activeCompany.knowledgeGrants[0],
      permissionSetVersion: 'v2',
    },
  ],
  [
    ...knowledgeActor.activeCompany.knowledgeGrants,
    ...knowledgeActor.activeCompany.knowledgeGrants,
  ],
])(
  'offers no navigation or evidence I/O for opaque %j through the actual App',
  async (knowledgeGrants) => {
    const requests: string[] = [];
    installParentServer(
      () => ({
        ...knowledgeActor,
        activeCompany: { ...knowledgeActor.activeCompany, knowledgeGrants },
      }),
      async (path) => {
        requests.push(path);
        return undefined;
      },
    );
    const getToken = vi.fn(async () => 'synthetic');
    const identity = {
      ...deterministicBrowserIdentity(),
      requestHeaders: undefined,
      getToken,
    };
    render(<App identity={identity} />);
    await screen.findByRole('navigation', { name: 'Primary navigation' });
    await waitFor(() =>
      expect(screen.queryByText('Loading workspace access…')).toBeNull(),
    );
    expect(
      screen.queryByRole('link', { name: 'Knowledge evidence' }),
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Working Documents' }),
    ).toBeVisible();
    const baseline = getToken.mock.calls.length;
    act(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
    await act(async () => undefined);
    expect(getToken).toHaveBeenCalledTimes(baseline);
    expect(
      requests.some(
        (path) => path.includes('/knowledge/') || path.includes('/content/'),
      ),
    ).toBe(false);
  },
);
it('mounts only on selection, preserves frame-only continuity and reads fresh after departure', async () => {
  window.history.replaceState(null, '', '/#overview');
  const reads: string[] = [];
  installParentServer(
    () => knowledgeActor,
    async (path) => {
      if (path.startsWith('/api/knowledge/')) {
        reads.push(path);
        return Response.json({ items: [source], nextCursor: null });
      }
      return undefined;
    },
  );
  render(
    <StrictMode>
      <App identity={deterministicBrowserIdentity()} />
    </StrictMode>,
  );
  const navigation = await screen.findByRole('navigation', {
    name: 'Primary navigation',
  });
  expect(reads).toHaveLength(0);
  fireEvent.click(
    within(navigation).getByRole('link', { name: 'Knowledge evidence' }),
  );
  await screen.findByText(source.title);
  expect(reads).toHaveLength(1);
  act(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('frame', 'classic');
    window.history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(screen.getByText(source.title)).toBeVisible();
  expect(reads).toHaveLength(1);
  act(() => {
    window.history.replaceState(null, '', '/?frame=classic#overview');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect(screen.queryByText(source.title)).toBeNull();
  fireEvent.click(
    screen
      .getByRole('navigation', { name: 'Primary navigation' })
      .querySelector('a[href="#knowledge-evidence"]') ??
      screen.getByRole('link', { name: 'Knowledge evidence' }),
  );
  await screen.findByText(source.title);
  expect(reads).toHaveLength(2);
});
it('does not publish an older whole Actor after actual Company A→B→A and Reader regrant', async () => {
  let release: (response: Response) => void = () => {
    throw new Error('Recovery not started.');
  };
  const delayed = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const companyB = '10000000-0000-4000-8000-000000000002';
  let holdRecovery = false,
    held = false,
    knowledgeReads = 0;
  const freshA: ActorContext = {
    ...knowledgeActor,
    displayName: 'Fresh final A Reader',
    activeCompany: {
      ...knowledgeActor.activeCompany,
      knowledgeGrants: [
        {
          ...knowledgeActor.activeCompany.knowledgeGrants[0],
          assignmentId: '80000000-0000-4000-8000-000000001016',
        },
      ],
    },
  };
  installParentServer(
    () => knowledgeActor,
    async (path, init) => {
      if (path === '/api/companies')
        return Response.json([
          { id: knowledgeActor.activeCompany.id, displayName: 'Company DEMO' },
          { id: companyB, displayName: 'Company B DEMO' },
        ]);
      if (path === '/api/knowledge/evidence/sources') {
        knowledgeReads++;
        if (knowledgeReads === 1) {
          holdRecovery = true;
          return new Response(null, { status: 403 });
        }
        return Response.json({ items: [], nextCursor: null });
      }
      if (path === '/api/access/current-actor' && holdRecovery) {
        if (!held) {
          held = true;
          return delayed;
        }
        return Response.json(
          new Headers(init?.headers).get('x-company-context-id') === companyB
            ? {
                ...freshA,
                activeCompany: {
                  ...freshA.activeCompany,
                  id: companyB,
                  displayName: 'Company B DEMO',
                },
              }
            : freshA,
        );
      }
      return undefined;
    },
  );
  const rejected = vi.fn(async () => undefined),
    identity = { ...deterministicBrowserIdentity(), rejectSession: rejected };
  render(<App identity={identity} />);
  await waitFor(() => expect(held).toBe(true));
  const picker = screen.getByRole('combobox', { name: 'Active Company' });
  changeValue(picker, companyB);
  await waitFor(() => expect(picker).toHaveTextContent('Company B DEMO'));
  changeValue(picker, knowledgeActor.activeCompany.id);
  await waitFor(() => expect(picker).toHaveTextContent('Company DEMO'));
  await screen.findByText('No eligible evidence.');
  fireEvent.change(screen.getByLabelText('Literal search'), {
    target: { value: 'fresh final query' },
  });
  const count = knowledgeReads;
  await act(async () => release(Response.json(knowledgeActor)));
  expect(screen.getByLabelText('Literal search')).toHaveValue(
    'fresh final query',
  );
  expect(knowledgeReads).toBe(count);
  expect(rejected).not.toHaveBeenCalled();
  expect(screen.getAllByText('Fresh final A Reader').length).toBeGreaterThan(0);
});
it.each([
  'documentPermissionAssignmentId',
  'documentContentReaderAssignmentId',
  'clientPermissionAssignmentId',
])(
  'requires native UUID prerequisite %s before offering the section',
  async (field) => {
    const native: ActorContext = {
      ...knowledgeActor,
      activeCompany: {
        ...knowledgeActor.activeCompany,
        [field]: 'not-a-native-uuid',
      },
    };
    const reads: string[] = [];
    installParentServer(
      () => native,
      async (path) => {
        reads.push(path);
        return undefined;
      },
    );
    render(<App identity={deterministicBrowserIdentity()} />);
    await screen.findByRole('navigation', { name: 'Primary navigation' });
    expect(
      screen.queryByRole('link', { name: 'Knowledge evidence' }),
    ).toBeNull();
    expect(reads.some((path) => path.includes('/knowledge/'))).toBe(false);
  },
);
