import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import { PaymentEvidenceMetadataCorrection } from './PaymentEvidenceMetadataCorrection';
import {
  paymentEvidenceDocument,
  paymentEvidenceIds as ids,
} from './payment-evidence.test-fixture';
import { readPaymentEvidenceDocument } from './payment-evidence-response';
afterEach(() => vi.unstubAllGlobals());
it('replays the exact correction intent after a newer observed Document revision without rebasing its uncertain packet', async () => {
  const writes: Array<{ body: unknown; key: string | null }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: string, init?: RequestInit) => {
      writes.push({
        body: init?.body,
        key: new Headers(init?.headers).get('idempotency-key'),
      });
      return Response.json(
        writes.length === 1
          ? {}
          : { documentId: ids.document, revision: 2, outcome: 'corrected' },
      );
    }),
  );
  const document = readPaymentEvidenceDocument(paymentEvidenceDocument());
  const props = {
    identity: deterministicBrowserIdentity(),
    companyId: ids.company,
    documentId: ids.document,
    document,
    correctKey: 'stable-recorder-correction',
    onProtectedWorkChange: vi.fn(),
    onConfirmed: vi.fn(),
    onRejected: vi.fn(),
  };
  const view = render(<PaymentEvidenceMetadataCorrection {...props} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Correct draft metadata' }),
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Corrected literal notice' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Save metadata correction' }),
  );
  await screen.findByRole('button', { name: 'Retry identical correction' });
  view.rerender(
    <PaymentEvidenceMetadataCorrection
      {...props}
      document={{ ...document, workingRevision: 3 }}
      recoveryGeneration={2}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry identical correction' }),
  );
  await waitFor(() => expect(props.onConfirmed).toHaveBeenCalledTimes(1));
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(JSON.parse(String(writes[0]?.body))).toEqual({
    expectedRevision: 1,
    title: 'Corrected literal notice',
    purpose: 'Preserve original source',
  });
  view.rerender(
    <PaymentEvidenceMetadataCorrection {...props} recoveryGeneration={3} />,
  );
  expect(
    screen.getByText('Metadata correction confirmed.'),
  ).toBeInTheDocument();
  expect(writes).toHaveLength(2);
});
it('keeps a correction confirmed if its refresh callback fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        documentId: ids.document,
        revision: 2,
        outcome: 'corrected',
      }),
    ),
  );
  render(
    <PaymentEvidenceMetadataCorrection
      identity={deterministicBrowserIdentity()}
      companyId={ids.company}
      documentId={ids.document}
      document={readPaymentEvidenceDocument(paymentEvidenceDocument())}
      correctKey="recorder-correction"
      onProtectedWorkChange={vi.fn()}
      onConfirmed={() => {
        throw new Error('Read refresh failed');
      }}
      onRejected={vi.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Correct draft metadata' }),
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Corrected notice' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Save metadata correction' }),
  );
  await screen.findByText('Metadata correction confirmed.');
  expect(
    screen.queryByRole('button', { name: 'Retry identical correction' }),
  ).not.toBeInTheDocument();
});
