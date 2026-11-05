import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import { PaymentEvidenceVersionCommand } from './PaymentEvidenceVersionCommand';
import type { DocumentVersion } from '../documents/document-response';
import { paymentEvidenceIds as ids } from './payment-evidence.test-fixture';
afterEach(() => vi.unstubAllGlobals());
const target: DocumentVersion = {
  id: ids.version,
  number: 1,
  status: 'draft',
  createdAt: '2026-01-15T09:00:00.000Z',
  createdByDisplayName: 'Fictional Recorder',
  references: [],
  pdfContent: { state: 'stored', access: 'denied' },
};
const receipt = {
  documentId: ids.document,
  workingRevision: 2,
  versionId: ids.version,
  versionNumber: 1,
  action: 'designated_official',
  supersededVersionNumber: null,
};
it('designates preserved content without protected content metadata and retries the exact uncertain envelope even when fresh lifecycle eligibility changes', async () => {
  const writes: Array<{ body: unknown; key: string | null }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: string, init?: RequestInit) => {
      writes.push({
        body: init?.body,
        key: new Headers(init?.headers).get('idempotency-key'),
      });
      return Response.json(writes.length === 1 ? {} : receipt);
    }),
  );
  const props = {
    identity: deterministicBrowserIdentity(),
    companyId: ids.company,
    documentId: ids.document,
    authorityKey: 'independent-designation',
    action: 'designated_official' as const,
    expectedRevision: 1,
    sourceVersion: undefined,
    target,
    onConfirmed: vi.fn(),
    onProtectedWorkChange: vi.fn(),
    onRejected: vi.fn(),
  };
  const view = render(<PaymentEvidenceVersionCommand {...props} canStart />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Designate as official' }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Confirm official designation' }),
  );
  await screen.findByRole('button', { name: 'Retry the same Version change' });
  view.rerender(
    <PaymentEvidenceVersionCommand
      {...props}
      canStart={false}
      target={undefined}
      recoveryGeneration={2}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry the same Version change' }),
  );
  await screen.findByText('Version 1 is now official.');
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(props.onConfirmed).toHaveBeenCalledWith(receipt);
  view.rerender(
    <PaymentEvidenceVersionCommand
      {...props}
      canStart={false}
      recoveryGeneration={3}
    />,
  );
  expect(screen.getByText('Version 1 is now official.')).toBeInTheDocument();
  expect(writes).toHaveLength(2);
});
it('does not dispatch after an equal-permission designation capture replacement during token acquisition', async () => {
  let release: ((token: string) => void) | undefined;
  const token = new Promise<string>((resolve) => {
    release = resolve;
  });
  const identity = {
    ...deterministicBrowserIdentity(),
    requestHeaders: undefined,
    getToken: () => token,
  };
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const props = {
    identity,
    companyId: ids.company,
    documentId: ids.document,
    action: 'designated_official' as const,
    expectedRevision: 1,
    sourceVersion: undefined,
    target,
    canStart: true,
    onConfirmed: vi.fn(),
    onProtectedWorkChange: vi.fn(),
    onRejected: vi.fn(),
  };
  const view = render(
    <PaymentEvidenceVersionCommand
      key="capture-A"
      {...props}
      authorityKey="capture-A"
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Designate as official' }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Confirm official designation' }),
  );
  await screen.findByText('Saving the Version change…');
  view.rerender(
    <PaymentEvidenceVersionCommand
      key="capture-B"
      {...props}
      authorityKey="capture-B"
    />,
  );
  view.rerender(
    <PaymentEvidenceVersionCommand
      key="capture-A"
      {...props}
      authorityKey="capture-A"
    />,
  );
  await act(async () => {
    release?.('token');
  });
  expect(fetch).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Designate as official' }),
    ).not.toBeDisabled(),
  );
});
