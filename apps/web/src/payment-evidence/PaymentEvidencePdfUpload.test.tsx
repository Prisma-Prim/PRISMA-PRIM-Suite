import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import { PaymentEvidencePdfUpload } from './PaymentEvidencePdfUpload';
import { paymentEvidenceIds as ids } from './payment-evidence.test-fixture';
afterEach(() => vi.unstubAllGlobals());
it('preserves the same immutable File/path/key for an uncertain upload independently of read changes and keeps confirmed save after refresh failure', async () => {
  const writes: Array<{ path: string; file: unknown; key: string | null }> = [];
  const receipt = {
    documentId: ids.document,
    workingRevision: 2,
    versionId: ids.version,
    versionNumber: 1,
    action: 'representation_added',
    representationId: '10000000-0000-4000-8000-000000000020',
    appendedAfterDesignation: false,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      writes.push({
        path: input,
        file: init?.body,
        key: new Headers(init?.headers).get('idempotency-key'),
      });
      return Response.json(writes.length === 1 ? {} : receipt);
    }),
  );
  const props = {
    identity: deterministicBrowserIdentity(),
    companyId: ids.company,
    documentId: ids.document,
    versionId: ids.version,
    versionNumber: 1,
    workingRevision: 1,
    uploadKey: 'independent-recorder-upload',
    onConfirmed: vi.fn(async () => {
      throw new Error('Read refresh unavailable');
    }),
    onProtectedWorkChange: vi.fn(),
    onRejected: vi.fn(),
  };
  const view = render(<PaymentEvidencePdfUpload {...props} canUpload />);
  const file = new File(['%PDF-1.4 synthetic notice'], 'fictional-notice.pdf', {
    type: 'application/pdf',
  });
  fireEvent.change(screen.getByLabelText('Choose the PDF file'), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Preserve PDF' }));
  await screen.findByRole('button', { name: 'Retry the same PDF' });
  view.rerender(
    <PaymentEvidencePdfUpload
      {...props}
      canUpload={false}
      recoveryGeneration={2}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry the same PDF' }));
  await waitFor(() => expect(props.onConfirmed).toHaveBeenCalledTimes(1));
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]?.file).toBe(file);
  expect(
    screen.queryByRole('button', { name: 'Retry the same PDF' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('The PDF was preserved.')).toBeInTheDocument();
  view.rerender(
    <PaymentEvidencePdfUpload
      {...props}
      canUpload={false}
      recoveryGeneration={3}
    />,
  );
  expect(screen.getByText('The PDF was preserved.')).toBeInTheDocument();
  expect(writes).toHaveLength(2);
});
