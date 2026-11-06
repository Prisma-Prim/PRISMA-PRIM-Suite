import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { EvidenceArtifacts } from './EvidenceArtifacts';
import { WorkingEvidenceResolver } from './WorkingEvidenceResolver';
import {
  actor,
  identity,
  revision,
  ids,
} from './working-evidence.test-fixture';
import { readEvidenceRevision } from './working-evidence-response';
function deferred<T>() {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve: (value: T) => {
      if (!settle) throw new Error('Missing deferred owner');
      settle(value);
    },
  };
}
function artifacts(
  selectedActor = actor,
  selectedIdentity = identity,
  signature = 'source-A',
) {
  return (
    <EvidenceArtifacts
      actor={selectedActor}
      identity={selectedIdentity}
      revision={readEvidenceRevision(revision)}
      sourceAuthority={signature}
    />
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});
it('suppresses a late token and late401 across source A to B to A without shared session rejection', async () => {
  const token = deferred<string | null>(),
    fetching = vi.fn(async () => new Response(null, { status: 401 })),
    reject = vi.fn(async () => undefined);
  const selectedIdentity: BrowserIdentity = {
    ...identity,
    getToken: () => token.promise,
    rejectSession: reject,
  };
  vi.stubGlobal('fetch', fetching);
  const view = render(artifacts(actor, selectedIdentity));
  fireEvent.click(
    screen.getByRole('button', { name: 'Download original-source annex' }),
  );
  view.rerender(artifacts(actor, selectedIdentity, 'source-B'));
  view.rerender(artifacts(actor, selectedIdentity));
  await act(async () => token.resolve('late-token'));
  expect(fetching).not.toHaveBeenCalled();
  expect(reject).not.toHaveBeenCalled();
  const response = deferred<Response>();
  vi.stubGlobal('fetch', () => response.promise);
  const readyIdentity = { ...identity, rejectSession: reject };
  view.rerender(artifacts(actor, readyIdentity));
  fireEvent.click(
    screen.getByRole('button', { name: 'Download original-source annex' }),
  );
  await act(async () => undefined);
  view.rerender(artifacts(actor, readyIdentity, 'source-B'));
  view.rerender(artifacts(actor, readyIdentity));
  await act(async () => response.resolve(new Response(null, { status: 401 })));
  expect(reject).not.toHaveBeenCalled();
});
it('settles each current artifact, HTML-preview and resolver401 while global rejection remains pending', async () => {
  const rejected = deferred<void>(),
    reject = vi.fn(() => rejected.promise),
    selectedIdentity = { ...identity, rejectSession: reject };
  vi.stubGlobal('fetch', async () => new Response(null, { status: 401 }));
  const view = render(artifacts(actor, selectedIdentity));
  for (const name of [
    'Download original-source annex',
    'Download frozen statement',
    'Open exact original PDF',
    'Open frozen statement',
  ]) {
    fireEvent.click(screen.getByRole('button', { name }));
    await screen.findByText(
      'Working evidence unavailable. Try an explicit refresh.',
    );
    expect(screen.getByRole('button', { name })).toBeEnabled();
  }
  expect(reject).toHaveBeenCalledTimes(4);
  view.unmount();
  window.history.replaceState(
    null,
    '',
    `/#working-evidence/${ids.case}/${ids.revision}/${ids.evidence}`,
  );
  render(<WorkingEvidenceResolver actor={actor} identity={selectedIdentity} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Open exact original PDF' }),
  );
  await screen.findByText('Supporting evidence unavailable.');
  expect(
    screen.getByRole('button', { name: 'Open exact original PDF' }),
  ).toBeEnabled();
  expect(reject).toHaveBeenCalledTimes(5);
  await act(async () => rejected.resolve());
});
it('retires late HTML body parsing and Blob effects and revokes every owned URL on equal-permission source replacement', async () => {
  const html = deferred<string>();
  vi.spyOn(Blob.prototype, 'text').mockImplementation(() => html.promise);
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response('<!doctype html><p>Fictional frozen</p>', {
        headers: { 'content-type': 'text/html' },
      }),
  );
  const view = render(artifacts());
  fireEvent.click(
    screen.getByRole('button', { name: 'Open frozen statement' }),
  );
  await act(async () => undefined);
  view.rerender(artifacts(actor, identity, 'replacement-same-permissions'));
  await act(async () => html.resolve('<p>Fictional late secret</p>'));
  expect(screen.queryByTitle('Open frozen statement')).not.toBeInTheDocument();
  const create = vi.fn(() => 'blob:fictional-owned'),
    revoke = vi.fn(),
    click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response('fictional annex', {
        headers: { 'content-type': 'application/zip' },
      }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Download original-source annex' }),
  );
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(create).toHaveBeenCalledTimes(1);
  view.rerender(artifacts(actor, identity, 'next-equal-permissions'));
  expect(revoke).toHaveBeenCalledWith('blob:fictional-owned');
});
it('suppresses late hashing and prevents a retired owner from replacing global Actor recovery', async () => {
  const digest = deferred<ArrayBuffer>(),
    hashing = vi.fn(() => digest.promise),
    create = vi.fn(),
    revoke = vi.fn();
  vi.stubGlobal('crypto', {
    randomUUID: crypto.randomUUID.bind(crypto),
    subtle: { digest: hashing },
  });
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response('123456789012', {
        headers: { 'content-type': 'application/pdf' },
      }),
  );
  const view = render(artifacts());
  fireEvent.click(
    screen.getByRole('button', { name: 'Open exact original PDF' }),
  );
  await waitFor(() => expect(hashing).toHaveBeenCalled());
  view.rerender(artifacts(actor, identity, 'replacement'));
  await act(async () => digest.resolve(new Uint8Array(32).buffer));
  expect(create).not.toHaveBeenCalled();
  const recovery = deferred<Response>(),
    revalidated = vi.fn();
  let reads = 0;
  vi.stubGlobal('fetch', async () => {
    reads++;
    return reads === 1 ? new Response(null, { status: 403 }) : recovery.promise;
  });
  view.rerender(
    <EvidenceArtifacts
      actor={actor}
      identity={identity}
      revision={readEvidenceRevision(revision)}
      sourceAuthority="replacement"
      onActorRevalidated={revalidated}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Download original-source annex' }),
  );
  await waitFor(() => expect(reads).toBe(2));
  const changed: ActorContext = {
    ...actor,
    displayName: 'Same authority, refreshed display',
  };
  view.rerender(
    <EvidenceArtifacts
      actor={changed}
      identity={identity}
      revision={readEvidenceRevision(revision)}
      sourceAuthority="replacement"
      onActorRevalidated={revalidated}
    />,
  );
  await act(async () => recovery.resolve(Response.json(changed)));
  expect(revalidated).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Download original-source annex' }),
  ).toBeEnabled();
});

it.each(['artifact', 'resolver'] as const)(
  'retains the consumed Recorder read alternative when a Reader is added during pending %s work',
  async (kind) => {
    const fallbackActor: ActorContext = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        id: ids.project,
        displayName: 'Fictional Company',
        workingEvidenceCaseReaderAssignmentId: undefined,
        workingEvidenceCaseReaderPermissionSetVersion: undefined,
      },
    };
    const response = deferred<Response>(),
      create = vi.fn(() => 'blob:fictional-consumed-recorder'),
      click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = create;
        static revokeObjectURL = vi.fn();
      },
    );
    const fetching = vi.fn(() => response.promise);
    vi.stubGlobal('fetch', fetching);
    if (kind === 'resolver')
      window.history.replaceState(
        null,
        '',
        `/#working-evidence/${ids.case}/${ids.revision}/${ids.evidence}`,
      );
    const view = render(
      kind === 'artifact' ? (
        artifacts(fallbackActor)
      ) : (
        <WorkingEvidenceResolver actor={fallbackActor} identity={identity} />
      ),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name:
          kind === 'artifact'
            ? 'Download original-source annex'
            : 'Open exact original PDF',
      }),
    );
    await waitFor(() => expect(fetching).toHaveBeenCalledOnce());
    view.rerender(
      kind === 'artifact' ? (
        artifacts(actor)
      ) : (
        <WorkingEvidenceResolver actor={actor} identity={identity} />
      ),
    );
    await act(async () =>
      response.resolve(
        new Response('fictional preserved bytes', {
          headers: {
            'content-type':
              kind === 'artifact' ? 'application/zip' : 'application/pdf',
          },
        }),
      ),
    );
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledOnce();
  },
);
