import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import { PaymentEvidenceVersions } from './PaymentEvidenceVersions';
import { paymentEvidenceAuthority } from './payment-evidence-authority';
import {
  paymentEvidenceActor,
  paymentEvidenceIds as ids,
} from './payment-evidence.test-fixture';
afterEach(() => vi.unstubAllGlobals());
it('offers native designation without Content Reader or Uploader and retains confirmation when its subsequent read fails', async () => {
  const actor = paymentEvidenceActor();
  actor.activeCompany.documentPermissions =
    actor.activeCompany.documentPermissions.filter(
      (permission) =>
        permission !== 'document.content.read' &&
        permission !== 'document.content.upload',
    );
  const keys = paymentEvidenceAuthority(actor);
  if (!keys) throw new Error('Expected independent native evidence authority');
  const writes: Array<RequestInit | undefined> = [];
  let saved = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        writes.push(init);
        saved = true;
        return Response.json({
          documentId: ids.document,
          workingRevision: 2,
          versionId: ids.version,
          versionNumber: 1,
          action: 'designated_official',
          supersededVersionNumber: null,
        });
      }
      if (saved) return new Response(null, { status: 500 });
      return Response.json({
        workingRevision: 1,
        mutable: true,
        versions: [
          {
            id: ids.version,
            number: 1,
            status: 'draft',
            createdAt: '2026-01-15T09:00:00.000Z',
            createdBy: { displayName: 'Fictional recorder' },
            representations: [],
            pdfContent: { state: 'stored', access: 'denied' },
          },
        ],
      });
    }),
  );
  render(
    <PaymentEvidenceVersions
      actor={actor}
      identity={deterministicBrowserIdentity()}
      documentId={ids.document}
      workingRevision={1}
      operationKeys={keys}
      onRefresh={vi.fn()}
    />,
  );
  const designate = await screen.findByRole('button', {
    name: 'Designate as official',
  });
  await waitFor(() => expect(designate).not.toBeDisabled());
  expect(
    screen.queryByLabelText('Choose the PDF file'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Download Version 1 PDF' }),
  ).not.toBeInTheDocument();
  fireEvent.click(designate);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Confirm official designation' }),
  );
  await screen.findByText('Version 1 is now official.');
  await screen.findByText(
    'The save was confirmed, but the evidence could not be refreshed. Retry only the read.',
  );
  expect(
    screen.queryByRole('button', { name: 'Retry the same Version change' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Designate as official' }),
  ).toBeDisabled();
  expect(writes).toHaveLength(1);
});
