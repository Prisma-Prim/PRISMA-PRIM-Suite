import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import { PaymentEvidencePdf } from './PaymentEvidencePdf';
import { paymentEvidenceIds as ids } from './payment-evidence.test-fixture';
const at = '2026-01-15T09:00:00.000Z';
const representationId = '10000000-0000-4000-8000-000000000020';
const bytes = new TextEncoder().encode(
  '%PDF-1.4\nFictional payment notice only\n%%EOF\n',
);
const pdf = {
  state: 'stored',
  access: 'granted',
  representationId,
  revision: 2,
  fileName: 'fictional-notice.pdf',
  mediaType: 'application/pdf',
  size: bytes.length,
  sha256: '06f9dfa5b7e0fc647de9fdc2877abb6bd3de4ff4c866c6b352e96776dbdd7561',
  storedAt: at,
  storedBy: { displayName: 'Fictional uploader' },
  scan: { outcome: 'clean', engine: 'Fixture clean scanner', scannedAt: at },
};
function versions(stored = true) {
  return {
    workingRevision: stored ? 2 : 1,
    mutable: true,
    versions: [
      {
        id: ids.version,
        number: 1,
        status: 'draft',
        createdAt: at,
        createdBy: { displayName: 'Fictional recorder' },
        representations: [],
        pdfContent: stored ? pdf : { state: 'absent' },
      },
    ],
  };
}
beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function urls() {
  const created = vi.fn(() => 'blob:payment-evidence'),
    revoked = vi.fn(),
    clicked = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
  const NativeURL = URL;
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = created;
      static revokeObjectURL = revoked;
    },
  );
  return { created, revoked, clicked };
}
function props() {
  return {
    identity: deterministicBrowserIdentity(),
    companyId: ids.company,
    documentId: ids.document,
    versionId: ids.version,
    versionNumber: 1,
    workingRevision: 2,
    contentState: 'stored' as const,
    contentReadKey: 'reader-A',
    uploadKey: null,
    canUpload: false,
    uploadDisabled: false,
    onConfirmed: vi.fn(),
    onProtectedWorkChange: vi.fn(),
    onRejected: vi.fn(),
  };
}
function downloads() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const path = new URL(input, 'http://localhost').pathname;
      if (path.endsWith('/versions')) return Response.json(versions());
      if (path.endsWith('/content/' + representationId))
        return new Response(bytes, {
          headers: {
            'content-type': 'application/pdf',
            'content-length': String(bytes.length),
          },
        });
      return new Response(null, { status: 404 });
    }),
  );
}
it('downloads exact authenticated bytes only after size and hash verification and revokes the Blob URL', async () => {
  const effects = urls();
  downloads();
  render(<PaymentEvidencePdf {...props()} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Download Version 1 PDF' }),
  );
  await waitFor(() => expect(effects.clicked).toHaveBeenCalledTimes(1));
  expect(effects.created).toHaveBeenCalledTimes(1);
  expect(effects.revoked).toHaveBeenCalledWith('blob:payment-evidence');
});
it('retires an old hash continuation permanently across read-capture A to B to A', async () => {
  const effects = urls();
  downloads();
  const digest = await webcrypto.subtle.digest('SHA-256', bytes);
  let release: ((digest: ArrayBuffer) => void) | undefined;
  const held = new Promise<ArrayBuffer>((resolve) => {
    release = resolve;
  });
  const digestCall = vi
    .spyOn(webcrypto.subtle, 'digest')
    .mockImplementationOnce(() => held);
  const current = props(),
    view = render(<PaymentEvidencePdf {...current} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Download Version 1 PDF' }),
  );
  await waitFor(() => expect(digestCall).toHaveBeenCalledTimes(1));
  view.rerender(<PaymentEvidencePdf {...current} contentReadKey="reader-B" />);
  view.rerender(<PaymentEvidencePdf {...current} contentReadKey="reader-A" />);
  await act(async () => {
    release?.(digest);
  });
  expect(effects.created).not.toHaveBeenCalled();
  expect(effects.clicked).not.toHaveBeenCalled();
});
it('does not retire a Recorder upload envelope when only the independent reader capture changes', async () => {
  const writes: Array<{ body: unknown; key: string | null; path: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        writes.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
          path: input,
        });
        return Response.json(
          writes.length === 1
            ? {}
            : {
                documentId: ids.document,
                workingRevision: 2,
                versionId: ids.version,
                versionNumber: 1,
                action: 'representation_added',
                representationId,
                appendedAfterDesignation: false,
              },
        );
      }
      return Response.json(versions(false));
    }),
  );
  const current = {
    ...props(),
    workingRevision: 1,
    contentState: 'absent' as const,
    uploadKey: 'recorder-upload',
    canUpload: true,
  };
  const view = render(<PaymentEvidencePdf {...current} />);
  const file = new File(['%PDF-1.4 fictional source'], 'notice.pdf', {
    type: 'application/pdf',
  });
  fireEvent.change(screen.getByLabelText('Choose the PDF file'), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Preserve PDF' }));
  await screen.findByRole('button', { name: 'Retry the same PDF' });
  view.rerender(<PaymentEvidencePdf {...current} contentReadKey="reader-B" />);
  fireEvent.click(screen.getByRole('button', { name: 'Retry the same PDF' }));
  await screen.findByText('The PDF was preserved.');
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]?.body).toBe(file);
});
