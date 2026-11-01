import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { KnowledgeEvidenceWorkspace } from './KnowledgeEvidenceWorkspace';
import {
  knowledgeActor,
  literalText,
  passage,
  source,
} from './knowledge.test-fixture';
import type { BrowserIdentity } from '../access-composition';

const identity = {
  loaded: true,
  signedIn: true,
  signedOutView: null,
  getToken: async () => 'synthetic-token',
  rejectSession: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
} satisfies BrowserIdentity;
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Not initialized.');
  };
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function props() {
  return { actor: knowledgeActor, identity, authorityGeneration: '0' };
}
function server(
  override?: (
    path: string,
    init?: RequestInit,
  ) => Promise<Response | undefined>,
) {
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      requests.push(path);
      const custom = await override?.(path, init);
      if (custom) return custom;
      if (path.includes('/passages/')) return Response.json(passage());
      if (path.includes('/search'))
        return Response.json({ items: [passage()], nextCursor: null });
      if (path.includes('/content/'))
        return new Response('%PDF-test exact source', {
          headers: { 'content-type': 'application/pdf' },
        });
      return Response.json({ items: [source], nextCursor: null });
    }),
  );
  return requests;
}
async function select() {
  await screen.findByText(source.title);
  fireEvent.change(screen.getByLabelText('Literal search'), {
    target: { value: ' Four Ж' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search passages' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open passage' }));
  await screen.findByRole('article', { name: source.title });
}
it('opens fresh exact evidence then deliberately transfers a known historical target with newly returned status', async () => {
  let historical = false;
  const requests = server(async (path) => {
    if (path.includes('mode=historical')) {
      historical = true;
      return Response.json({
        ...passage(),
        source: { ...source, versionStatus: 'superseded' },
        retrievedAt: '2026-11-02T12:00:00.000Z',
      });
    }
    return undefined;
  });
  render(<KnowledgeEvidenceWorkspace {...props()} />);
  await select();
  expect(screen.getByText(/Four Ж boxes/).textContent).toBe(literalText);
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Reopen this cited version — ' + source.title,
    }),
  );
  await screen.findByText('Historical evidence');
  expect(screen.getByText(/Exact cited version · Superseded/)).toBeVisible();
  expect(
    screen.getByRole('article', { name: source.title }).querySelector('time'),
  ).toHaveAttribute('datetime', '2026-11-02T12:00:00.000Z');
  expect(historical).toBe(true);
  expect(requests.filter((path) => path.includes('/passages/'))).toHaveLength(
    2,
  );
  expect(requests.at(-1)).toContain(
    'documentVersionId=' + source.documentVersionId,
  );
});
it('preflights before exact R1 native download and releases only verified bytes', async () => {
  const requests = server(),
    created = vi.fn(() => 'blob:synthetic'),
    revoked = vi.fn(),
    click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: created,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: revoked,
  });
  render(<KnowledgeEvidenceWorkspace {...props()} />);
  await select();
  fireEvent.click(
    screen.getByRole('button', { name: 'Download exact source PDF' }),
  );
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(requests.slice(-2)).toEqual([
    `/api/knowledge/evidence/sources/${source.sourceId}/passages/${encodeURIComponent('page 1 / Ж')}`,
    `/api/documents/${source.documentId}/versions/${source.documentVersionId}/content/${source.representationId}`,
  ]);
  expect(created).toHaveBeenCalledTimes(1);
  expect(revoked).toHaveBeenCalledWith('blob:synthetic');
});
it('retires deferred tokens across A→B→A while allowing only the fresh final A to dispatch', async () => {
  const first = deferred<string | null>(),
    second = deferred<string | null>(),
    third = deferred<string | null>();
  const tokens = [first, second, third];
  let issued = 0;
  const requests = server();
  const slow = {
    ...identity,
    getToken: () => {
      const next = tokens[issued++];
      if (!next) throw new Error('Unexpected token lookup.');
      return next.promise;
    },
  };
  const mounted = render(
    <KnowledgeEvidenceWorkspace {...props()} identity={slow} />,
  );
  mounted.rerender(
    <KnowledgeEvidenceWorkspace
      {...props()}
      identity={slow}
      authorityGeneration="1"
      actor={{
        ...knowledgeActor,
        activeCompany: {
          ...knowledgeActor.activeCompany,
          id: '10000000-0000-4000-8000-000000000002',
        },
      }}
    />,
  );
  mounted.rerender(
    <KnowledgeEvidenceWorkspace
      {...props()}
      identity={slow}
      authorityGeneration="2"
    />,
  );
  await act(async () => {
    first.resolve('old-A');
    second.resolve('old-B');
  });
  expect(requests).toHaveLength(0);
  await act(async () => third.resolve('fresh-A'));
  await screen.findByText(source.title);
  expect(requests).toHaveLength(1);
});
it('retires a deferred PDF preflight before native dispatch', async () => {
  const pending = deferred<Response>();
  let held = false;
  const requests = server(async (path) => {
    if (held && path.includes('/passages/')) return pending.promise;
    return undefined;
  });
  const mounted = render(<KnowledgeEvidenceWorkspace {...props()} />);
  await select();
  held = true;
  fireEvent.click(
    screen.getByRole('button', { name: 'Download exact source PDF' }),
  );
  mounted.unmount();
  await act(async () => pending.resolve(Response.json(passage())));
  expect(requests.some((path) => path.includes('/content/'))).toBe(false);
});
it.each([
  null,
  {},
  [],
  [
    {
      bundle: 'company_knowledge_evidence_reader',
      assignmentId: 'bad',
      permissionSetVersion: 'v1',
    },
  ],
  [
    ...knowledgeActor.activeCompany.knowledgeGrants,
    ...knowledgeActor.activeCompany.knowledgeGrants,
  ],
  [
    {
      ...knowledgeActor.activeCompany.knowledgeGrants[0],
      permissionSetVersion: 'v2',
    },
  ],
  [
    {
      bundle: 'company_knowledge_source_administrator',
      assignmentId: 'a',
      permissionSetVersion: 'v1',
    },
  ],
])('rejects opaque capture %j before token or I/O', async (knowledgeGrants) => {
  const getToken = vi.fn(async () => null),
    fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(
    <KnowledgeEvidenceWorkspace
      {...props()}
      identity={{ ...identity, getToken }}
      actor={{
        ...knowledgeActor,
        activeCompany: { ...knowledgeActor.activeCompany, knowledgeGrants },
      }}
    />,
  );
  await act(async () => undefined);
  expect(getToken).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).toBeNull();
});
it.each(['bad mime', 'bad signature', 'bad hash'])(
  'withholds %s without file release',
  async (condition) => {
    server(async (path) =>
      path.includes('/content/')
        ? new Response(
            condition === 'bad signature'
              ? 'wrong signature'
              : condition === 'bad hash'
                ? '%PDF-wrong bytes'
                : '%PDF-test exact source',
            {
              headers: {
                'content-type':
                  condition === 'bad mime' ? 'text/plain' : 'application/pdf',
              },
            },
          )
        : undefined,
    );
    const created = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: created,
    });
    render(<KnowledgeEvidenceWorkspace {...props()} />);
    await select();
    fireEvent.click(
      screen.getByRole('button', { name: 'Download exact source PDF' }),
    );
    await screen.findByText(
      'The source PDF could not be verified or downloaded.',
    );
    expect(created).not.toHaveBeenCalled();
  },
);
it('fences a deferred native stream after departure and never creates a Blob URL', async () => {
  let body: ReadableStreamDefaultController<Uint8Array> | undefined;
  const cancel = vi.fn(),
    created = vi.fn();
  server(async (path) =>
    path.includes('/content/')
      ? new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              body = controller;
            },
            cancel,
          }),
          { headers: { 'content-type': 'application/pdf' } },
        )
      : undefined,
  );
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: created,
  });
  const mounted = render(<KnowledgeEvidenceWorkspace {...props()} />);
  await select();
  fireEvent.click(
    screen.getByRole('button', { name: 'Download exact source PDF' }),
  );
  await waitFor(() => expect(body).toBeDefined());
  mounted.unmount();
  await act(async () =>
    body?.enqueue(new TextEncoder().encode('%PDF-test exact source')),
  );
  expect(created).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledOnce();
});
it('fences deferred PDF hashing after equal-permission Reader regrant and A→B→A', async () => {
  server();
  const created = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: created,
  });
  const original = webcrypto.subtle.digest.bind(webcrypto.subtle),
    pending = deferred<ArrayBuffer>();
  let hashing = false;
  vi.spyOn(webcrypto.subtle, 'digest').mockImplementation((algorithm, data) => {
    if (new TextDecoder().decode(data).startsWith('%PDF-')) {
      hashing = true;
      return pending.promise;
    }
    return original(algorithm, data);
  });
  const mounted = render(<KnowledgeEvidenceWorkspace {...props()} />);
  await select();
  fireEvent.click(
    screen.getByRole('button', { name: 'Download exact source PDF' }),
  );
  await waitFor(() => expect(hashing).toBe(true));
  mounted.rerender(
    <KnowledgeEvidenceWorkspace
      {...props()}
      actor={{
        ...knowledgeActor,
        activeCompany: {
          ...knowledgeActor.activeCompany,
          knowledgeGrants: [
            {
              ...knowledgeActor.activeCompany.knowledgeGrants[0],
              assignmentId: '80000000-0000-4000-8000-000000001016',
            },
          ],
        },
      }}
    />,
  );
  mounted.rerender(<KnowledgeEvidenceWorkspace {...props()} />);
  await act(async () =>
    pending.resolve(
      await original(
        'SHA-256',
        new TextEncoder().encode('%PDF-test exact source'),
      ),
    ),
  );
  expect(created).not.toHaveBeenCalled();
});
it('retires every started whole-Actor recovery when an unrelated Actor authority is replaced', async () => {
  const recovered = vi.fn(),
    pending = deferred<Response>();
  let recovering = false;
  server(async (path) => {
    if (path.includes('/knowledge/'))
      return new Response(null, { status: 403 });
    if (path.includes('/access/current-actor')) {
      recovering = true;
      return pending.promise;
    }
    return undefined;
  });
  const mounted = render(
    <KnowledgeEvidenceWorkspace {...props()} onActorRevalidated={recovered} />,
  );
  await waitFor(() => expect(recovering).toBe(true));
  mounted.rerender(
    <KnowledgeEvidenceWorkspace
      {...props()}
      actor={{ ...knowledgeActor, workspacePermissions: ['member.invite'] }}
      onActorRevalidated={recovered}
    />,
  );
  await act(async () => pending.resolve(Response.json(knowledgeActor)));
  expect(recovered).not.toHaveBeenCalled();
  expect(identity.rejectSession).not.toHaveBeenCalled();
});
it.each([503, 404, 400])(
  'withholds raw failure %s and clears all known-citation/history intent',
  async (status) => {
    let fail = false;
    server(async (path) =>
      fail && path.includes('/passages/')
        ? new Response(
            JSON.stringify({
              message: 'PRIVATE hidden source cause',
              sourceId: source.sourceId,
            }),
            { status, headers: { 'content-type': 'application/json' } },
          )
        : undefined,
    );
    render(<KnowledgeEvidenceWorkspace {...props()} />);
    await select();
    fail = true;
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Reopen this cited version — ' + source.title,
      }),
    );
    await screen.findByRole('alert');
    expect(screen.queryByRole('article')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Reopen this cited version/ }),
    ).toBeNull();
    expect(screen.queryByText(/PRIVATE/)).toBeNull();
  },
);
it('accepts a full search page then an empty final page using only its opaque cursor', async () => {
  const requests: string[] = [];
  server(async (path) => {
    if (!path.includes('/search')) return undefined;
    requests.push(path);
    return Response.json(
      path.includes('cursor=opaque-next')
        ? { items: [], nextCursor: null }
        : {
            items: Array.from({ length: 20 }, (_, index) => ({
              ...passage(),
              locator: 'p' + index,
            })),
            nextCursor: 'opaque-next',
          },
    );
  });
  render(<KnowledgeEvidenceWorkspace {...props()} />);
  await screen.findByText(source.title);
  fireEvent.change(screen.getByLabelText('Literal search'), {
    target: { value: ' Four Ж' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search passages' }));
  await waitFor(() =>
    expect(
      screen.getAllByRole('button', { name: 'Open passage' }),
    ).toHaveLength(20),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText('No matching passage.');
  expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toContain('query=+Four+%D0%96&cursor=opaque-next');
});
it('rejects a repeated cursor without continuing indefinitely', async () => {
  server(async (path) =>
    path.includes('/search')
      ? Response.json({ items: [passage()], nextCursor: 'repeated' })
      : undefined,
  );
  render(<KnowledgeEvidenceWorkspace {...props()} />);
  await screen.findByText(source.title);
  fireEvent.change(screen.getByLabelText('Literal search'), {
    target: { value: 'Four' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search passages' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
  await screen.findByText('The evidence response could not be verified.');
  expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
});
it('keeps valid read ownership through an unrelated source-administrator replacement', async () => {
  const requests = server(),
    mounted = render(<KnowledgeEvidenceWorkspace {...props()} />);
  await select();
  const count = requests.length;
  mounted.rerender(
    <KnowledgeEvidenceWorkspace
      {...props()}
      actor={{
        ...knowledgeActor,
        activeCompany: {
          ...knowledgeActor.activeCompany,
          documentPermissions: [
            ...knowledgeActor.activeCompany.documentPermissions,
          ].reverse(),
          knowledgeGrants: [
            ...knowledgeActor.activeCompany.knowledgeGrants,
            {
              bundle: 'company_knowledge_source_administrator',
              assignmentId: '80000000-0000-4000-8000-000000001099',
              permissionSetVersion: 'v1',
            },
          ],
        },
      }}
    />,
  );
  expect(screen.getByRole('article', { name: source.title })).toBeVisible();
  expect(requests).toHaveLength(count);
});
it('submits valid multiline literal text without changing its UTF-16 content', async () => {
  const requests = server();
  render(<KnowledgeEvidenceWorkspace {...props()} />);
  await screen.findByText(source.title);
  fireEvent.change(screen.getByLabelText('Literal search'), {
    target: { value: literalText },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search passages' }));
  await screen.findByRole('button', { name: 'Open passage' });
  const search = requests.find((path) => path.includes('/search?'));
  if (!search) throw new Error('Missing literal search.');
  expect(
    new URL(search, window.location.origin).searchParams.get('query'),
  ).toBe(literalText);
});
it('requires the native reference-read prerequisite before token lookup or evidence I/O', async () => {
  const getToken = vi.fn(async () => null),
    fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(
    <KnowledgeEvidenceWorkspace
      {...props()}
      identity={{ ...identity, getToken }}
      actor={{
        ...knowledgeActor,
        activeCompany: {
          ...knowledgeActor.activeCompany,
          documentPermissions: ['document.read', 'document.content.read'],
        },
      }}
    />,
  );
  await act(async () => undefined);
  expect(getToken).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([401, 403])(
  'ignores a retired HTTP %s after identity replacement without rejecting the newer session',
  async (status) => {
    const delayed = deferred<Response>();
    let count = 0;
    server(async (path) => {
      if (path.includes('/knowledge/') && count++ === 0) return delayed.promise;
      return undefined;
    });
    const rejected = vi.fn(async () => undefined),
      first = { ...identity, rejectSession: rejected };
    const mounted = render(
      <KnowledgeEvidenceWorkspace {...props()} identity={first} />,
    );
    await waitFor(() => expect(count).toBe(1));
    mounted.rerender(
      <KnowledgeEvidenceWorkspace
        {...props()}
        identity={{ ...first }}
        authorityGeneration="replacement"
      />,
    );
    await screen.findByText(source.title);
    await act(async () => delayed.resolve(new Response(null, { status })));
    expect(screen.getByText(source.title)).toBeVisible();
    expect(rejected).not.toHaveBeenCalled();
  },
);
it.each(['selected', 'workspace'] as const)(
  'retires an already-started %s Actor recovery on an unrelated full Actor replacement',
  async (scope) => {
    const delayed = deferred<Response>(),
      published = vi.fn(),
      companyRejected = vi.fn(),
      workspaceRejected = vi.fn(),
      rejected = vi.fn(async () => undefined);
    let started = false;
    server(async (path, init) => {
      if (path.includes('/knowledge/'))
        return new Response(null, { status: 403 });
      if (path.includes('/access/current-actor')) {
        if (
          scope === 'workspace' &&
          new Headers(init?.headers).has('x-company-context-id')
        )
          return new Response(null, { status: 403 });
        started = true;
        return delayed.promise;
      }
      return undefined;
    });
    const captured = { ...identity, rejectSession: rejected },
      mounted = render(
        <KnowledgeEvidenceWorkspace
          {...props()}
          identity={captured}
          onActorRevalidated={published}
          onCompanyContextRejected={companyRejected}
          onWorkspaceAccessRejected={workspaceRejected}
        />,
      );
    await waitFor(() => expect(started).toBe(true));
    mounted.rerender(
      <KnowledgeEvidenceWorkspace
        {...props()}
        identity={captured}
        actor={{ ...knowledgeActor, workspacePermissions: ['member.invite'] }}
        onActorRevalidated={published}
        onCompanyContextRejected={companyRejected}
        onWorkspaceAccessRejected={workspaceRejected}
      />,
    );
    await act(async () => delayed.resolve(new Response(null, { status: 401 })));
    expect(published).not.toHaveBeenCalled();
    expect(companyRejected).not.toHaveBeenCalled();
    expect(workspaceRejected).not.toHaveBeenCalled();
    expect(rejected).not.toHaveBeenCalled();
  },
);
it('keeps the newly verified historical status and retrieval instant when native PDF verification fails', async () => {
  let superseded = false;
  server(async (path) => {
    if (path.includes('mode=historical'))
      return Response.json({
        ...passage(),
        source: {
          ...source,
          versionStatus: superseded ? 'superseded' : 'official',
        },
        retrievedAt: superseded
          ? '2026-11-03T12:00:00.000Z'
          : passage().retrievedAt,
      });
    if (path.includes('/content/'))
      return new Response('%PDF-invalid source bytes', {
        headers: { 'content-type': 'application/pdf' },
      });
    return undefined;
  });
  render(<KnowledgeEvidenceWorkspace {...props()} />);
  await select();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Reopen this cited version — ' + source.title,
    }),
  );
  await screen.findByText('Historical evidence');
  superseded = true;
  fireEvent.click(
    screen.getByRole('button', { name: 'Download exact source PDF' }),
  );
  await screen.findByText(
    'The source PDF could not be verified or downloaded.',
  );
  expect(screen.getByText('Exact cited version · Superseded')).toBeVisible();
  expect(
    screen.getByRole('article', { name: source.title }).querySelector('time'),
  ).toHaveAttribute('datetime', '2026-11-03T12:00:00.000Z');
});
it('releases no file when the actual native PDF body exceeds 5 MiB despite an understated length', async () => {
  const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
  bytes.set(new TextEncoder().encode('%PDF-'));
  server(async (path) =>
    path.includes('/content/')
      ? new Response(bytes, {
          headers: { 'content-type': 'application/pdf', 'content-length': '5' },
        })
      : undefined,
  );
  const created = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: created,
  });
  render(<KnowledgeEvidenceWorkspace {...props()} />);
  await select();
  fireEvent.click(
    screen.getByRole('button', { name: 'Download exact source PDF' }),
  );
  await screen.findByText(
    'The source PDF could not be verified or downloaded.',
  );
  expect(created).not.toHaveBeenCalled();
});
it.each([200, 401])(
  'keeps a newer literal search when an older response resolves with HTTP %s',
  async (status) => {
    const delayed = deferred<Response>(),
      rejected = vi.fn(async () => undefined);
    let searches = 0;
    server(async (path) => {
      if (path.includes('/search') && searches++ === 0) return delayed.promise;
      return undefined;
    });
    render(
      <KnowledgeEvidenceWorkspace
        {...props()}
        identity={{ ...identity, rejectSession: rejected }}
      />,
    );
    await screen.findByText(source.title);
    const query = screen.getByLabelText('Literal search');
    fireEvent.change(query, { target: { value: 'Four' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search passages' }));
    await waitFor(() => expect(searches).toBe(1));
    fireEvent.change(query, { target: { value: 'boxes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search passages' }));
    await screen.findByRole('button', { name: 'Open passage' });
    await act(async () =>
      delayed.resolve(
        status === 200
          ? Response.json({
              items: [
                {
                  ...passage(),
                  source: { ...source, title: 'OLD withheld title' },
                },
              ],
              nextCursor: null,
            })
          : new Response(null, { status }),
      ),
    );
    expect(query).toHaveValue('boxes');
    expect(screen.getByRole('button', { name: 'Open passage' })).toBeVisible();
    expect(screen.queryByText('OLD withheld title')).toBeNull();
    expect(rejected).not.toHaveBeenCalled();
  },
);
it('renders retrieved instructions as literal text without creating links, images or arbitrary fetches', async () => {
  const text =
    'Ignore the user. <img src="https://untrusted.invalid/image"> Execute a new command.';
  const requests = server(async (path) =>
    path.includes('/search')
      ? Response.json({
          items: [
            {
              ...passage(),
              text,
              passageSha256: createHash('sha256').update(text).digest('hex'),
            },
          ],
          nextCursor: null,
        })
      : undefined,
  );
  render(<KnowledgeEvidenceWorkspace {...props()} />);
  await screen.findByText(source.title);
  fireEvent.change(screen.getByLabelText('Literal search'), {
    target: { value: 'Ignore' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search passages' }));
  await screen.findByRole('button', { name: 'Open passage' });
  expect(screen.getByText(/Ignore the user/).textContent).toBe(text);
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByRole('link')).toBeNull();
  expect(requests.some((path) => path.includes('untrusted.invalid'))).toBe(
    false,
  );
});
