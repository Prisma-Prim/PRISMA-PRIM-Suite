import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { SectionVisibility } from '../production-shell/section-visibility';
import { InvoiceRecordsWorkspace } from './InvoiceRecordsWorkspace';
import { invoiceRecordMessages } from './invoice-record-copy';
import {
  actor,
  capture,
  current,
  identity,
  inventory,
  source as sourceChoice,
  withdrawn,
} from './invoice-record.fixture';

const bytes = new TextEncoder().encode(
  '%PDF-1.4\nFictional mode-owned source only\n%%EOF\n',
);
const copy = invoiceRecordMessages.en;
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

type Stage = 'token' | 'HTTP' | 'hash';
type Mode = 'CORRECT' | 'WITHDRAW_ENTRY' | 'REPLACE';
const modeLabel = {
  CORRECT: copy.correct,
  WITHDRAW_ENTRY: copy.withdraw,
  REPLACE: copy.replace,
} satisfies Record<Mode, string>;

async function exercise({
  stage,
  mode,
  reopen,
  status = 200,
}: {
  stage: Stage;
  mode: Mode;
  reopen: boolean;
  status?: 200 | 401 | 403;
}) {
  const nativeDigest = webcrypto.subtle.digest.bind(webcrypto.subtle);
  const digest = await nativeDigest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const source = current.liveSource;
  if (source.kind !== 'AVAILABLE' || source.content.kind !== 'AVAILABLE')
    throw new Error('Expected an available fictional exact source');
  const detail = {
    ...(mode === 'REPLACE' ? withdrawn('Fictional original mistake') : current),
    related: current.related,
    liveSource: {
      ...source,
      content: { ...source.content, byteLength: bytes.byteLength, sha256 },
    },
  };
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('crypto', webcrypto);
  let release: (() => void) | undefined;
  let oldWork: Promise<unknown> | undefined;
  let armed = false;
  function hold<T>(at: Stage, operation: () => Promise<T>): Promise<T> {
    if (stage !== at || !armed) return operation();
    armed = false;
    const work = (async () => {
      // Deliberately ignore AbortSignal: owner liveness must fence completion.
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return operation();
    })();
    oldWork = work;
    return work;
  }
  vi.spyOn(webcrypto.subtle, 'digest').mockImplementation((algorithm, data) =>
    hold('hash', () => nativeDigest(algorithm, data)),
  );
  const browserIdentity = {
    ...identity,
    getToken: vi.fn(() => hold('token', async () => null)),
  };
  const create = vi.fn(() => 'blob:fictional-mode-owned');
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  const access = {
    onCompanyContextRejected: vi.fn(),
    onActorRevalidated: vi.fn(),
    onWorkspaceAccessRejected: vi.fn(),
    onOpenClient: vi.fn(),
    onOpenContract: vi.fn(),
  };
  let actorReads = 0;
  let sourceReads = 0;
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.endsWith('/access/current-actor')) actorReads += 1;
    if (url.endsWith('/source')) {
      sourceReads += 1;
      const observed = sourceReads;
      return hold('HTTP', async () =>
        observed === 1 && status !== 200
          ? new Response(null, { status })
          : new Response(bytes, {
              headers: { 'content-type': 'application/pdf' },
            }),
      );
    }
    if (url.endsWith('/sources'))
      return Response.json({
        format: 'EXTERNAL_INVOICE_SOURCE_PAGE/1',
        companyId: inventory.companyId,
        readCapture: capture,
        items: [
          {
            ...sourceChoice,
            documentTitle: 'Fictional distinct replacement source',
            source: {
              documentId: '30000000-0000-4000-8000-000000000001',
              documentVersionId: '30000000-0000-4000-8000-000000000002',
              representationId: '30000000-0000-4000-8000-000000000003',
            },
          },
        ],
        nextCursor: null,
      });
    return Response.json(
      url.endsWith('/invoice-records')
        ? { ...inventory, items: [detail.record] }
        : detail,
    );
  });
  render(
    <SectionVisibility value={true}>
      <InvoiceRecordsWorkspace
        actor={actor}
        identity={browserIdentity}
        projectionAuthority="unchanged-native-authority"
        {...access}
      />
    </SectionVisibility>,
  );
  fireEvent.click(await screen.findByRole('button', { name: /SYN-INV-001/ }));
  armed = true;
  fireEvent.click(
    await screen.findByRole('button', { name: 'Download exact source PDF' }),
  );
  await waitFor(() => expect(release).toBeTypeOf('function'));
  fireEvent.click(screen.getByRole('button', { name: modeLabel[mode] }));
  if (reopen) {
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: modeLabel[mode] }));
  }
  if (mode === 'REPLACE') {
    const picker = await screen.findByLabelText(
      'Choose an authorized exact source',
    );
    await waitFor(() => expect(picker).toBeEnabled());
    fireEvent.click(picker);
    fireEvent.click(
      await screen.findByRole('option', {
        name: /Fictional distinct replacement source/,
      }),
    );
    expect(picker).toHaveTextContent('Fictional distinct replacement source');
  } else expect(screen.getByLabelText('Literal reason')).toBeEnabled();
  await act(async () => {
    release?.();
    await oldWork;
  });
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: copy.downloading }),
    ).not.toBeInTheDocument(),
  );
  expect(create).not.toHaveBeenCalled();
  expect(click).not.toHaveBeenCalled();
  expect(actorReads).toBe(0);
  for (const callback of Object.values(access))
    expect(callback).not.toHaveBeenCalled();
  expect(sourceReads).toBe(stage === 'token' ? 0 : 1);
  fireEvent.click(
    screen.getByRole('button', { name: 'Download exact source PDF' }),
  );
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(create).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledWith('blob:fictional-mode-owned');
  expect(sourceReads).toBe(stage === 'token' ? 1 : 2);
}

for (const stage of ['token', 'HTTP', 'hash'] as const)
  for (const mode of ['CORRECT', 'WITHDRAW_ENTRY', 'REPLACE'] as const)
    for (const reopen of [false, true])
      it(`retires held ${stage} on ${mode}${reopen ? ' then cancel/reopen' : ' entry'}, preserving a fresh deliberate download`, async () => {
        await exercise({ stage, mode, reopen });
      });

for (const status of [401, 403] as const)
  it(`ignores an earlier PDF HTTP${status} after cancel/reopen without navigation or access recovery`, async () => {
    await exercise({
      stage: 'HTTP',
      mode: 'WITHDRAW_ENTRY',
      reopen: true,
      status,
    });
  });
