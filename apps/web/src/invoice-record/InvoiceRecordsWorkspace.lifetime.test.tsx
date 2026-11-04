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
import type { ActorContext } from '../access-types';
import { InvoiceRecordsWorkspace } from './InvoiceRecordsWorkspace';
import { actor, current, identity, inventory } from './invoice-record.fixture';

const bytes = new TextEncoder().encode(
  '%PDF-1.4\nFictional exact source only\n%%EOF\n',
);
function view(currentActor: ActorContext, projection = 'native-1') {
  return (
    <SectionVisibility value={true}>
      <InvoiceRecordsWorkspace
        actor={currentActor}
        identity={identity}
        projectionAuthority={projection}
        onCompanyContextRejected={() => undefined}
        onActorRevalidated={() => undefined}
        onWorkspaceAccessRejected={() => undefined}
      />
    </SectionVisibility>
  );
}
async function installPdf(mime = 'application/pdf') {
  const digest = await webcrypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const source = current.liveSource;
  if (source.kind !== 'AVAILABLE' || source.content.kind !== 'AVAILABLE')
    throw new Error('Expected fictional exact source');
  const detail = {
    ...current,
    liveSource: {
      ...source,
      content: { ...source.content, byteLength: bytes.byteLength, sha256 },
    },
  };
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', async (url: string) =>
    url.endsWith('/source')
      ? new Response(bytes, { status: 200, headers: { 'content-type': mime } })
      : Response.json(url.endsWith('/invoice-records') ? inventory : detail),
  );
  const create = vi.fn(() => 'blob:fictional-exact');
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
  return { create, revoke, click };
}
async function open() {
  fireEvent.click(await screen.findByRole('button', { name: /SYN-INV-001/ }));
  return screen.findByRole('button', { name: 'Download exact source PDF' });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('retires held exact PDF hashing across equal-permission content A → B → A and still allows a fresh deliberate download', async () => {
  const { create, revoke, click } = await installPdf();
  const original = webcrypto.subtle.digest.bind(webcrypto.subtle);
  let release: (() => void) | undefined;
  let held = true;
  vi.spyOn(webcrypto.subtle, 'digest').mockImplementation(
    async (algorithm, data) => {
      if (held) {
        held = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return original(algorithm, data);
    },
  );
  const rendered = render(view(actor));
  fireEvent.click(await open());
  await waitFor(() => expect(release).toBeTypeOf('function'));
  const replacement: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: inventory.companyId,
      displayName: 'Fictional Company',
      documentContentReaderAssignmentId: '20000000-0000-4000-8000-000000000099',
    },
  };
  rendered.rerender(view(replacement, 'native-2'));
  rendered.rerender(view(actor, 'native-1'));
  await act(async () => {
    release?.();
  });
  expect(create).not.toHaveBeenCalled();
  expect(click).not.toHaveBeenCalled();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Download exact source PDF' }),
  );
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(create).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledWith('blob:fictional-exact');
});

it('rejects mismatched PDF MIME without creating a URL or clicking a download', async () => {
  const { create, click } = await installPdf('text/plain');
  render(view(actor));
  fireEvent.click(await open());
  await screen.findByText(
    'The exact PDF could not be safely opened. Retry deliberately.',
  );
  expect(create).not.toHaveBeenCalled();
  expect(click).not.toHaveBeenCalled();
});
