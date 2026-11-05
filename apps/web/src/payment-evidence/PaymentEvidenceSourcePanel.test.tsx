import {
  act,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import { PaymentEvidenceSourcePanel } from './PaymentEvidenceSourcePanel';
import {
  paymentEvidenceActor,
  paymentEvidenceDocument,
  paymentEvidenceIds as ids,
} from './payment-evidence.test-fixture';
import { assertMessageCoverage } from '../localization/messages';
import { paymentEvidenceMessages } from './payment-evidence.copy';
afterEach(() => vi.unstubAllGlobals());
it('provides every source message in the four supported interface locales', () =>
  assertMessageCoverage('payment-evidence', paymentEvidenceMessages));
it('withholds an old payer reply after identity-only loss while retaining native source metadata and the selected Document', async () => {
  let release: ((response: Response) => void) | undefined;
  const held = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const document = paymentEvidenceDocument();
  let detailReads = 0;
  vi.stubGlobal('fetch', async (input: string) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (path.endsWith('/documents/' + ids.document))
      return ++detailReads === 2 ? held : Response.json(document);
    if (path.endsWith('/documents'))
      return Response.json([
        document,
        { type: 'external-invoice', opaqueOtherFeature: true },
      ]);
    if (path.endsWith('/versions')) return Response.json({ versions: [] });
    return new Response(null, { status: 404 });
  });
  const identity = deterministicBrowserIdentity(),
    actor = paymentEvidenceActor();
  const props = {
    identity,
    selection: {
      kind: 'document' as const,
      documentId: ids.document,
      generation: 1,
    },
    onSelect: vi.fn(),
    onProtectedWorkChange: vi.fn(),
  };
  const view = render(<PaymentEvidenceSourcePanel {...props} actor={actor} />);
  await screen.findByRole('heading', { name: 'Fictional notice' });
  await waitFor(() => expect(detailReads).toBe(2));
  view.rerender(
    <PaymentEvidenceSourcePanel
      {...props}
      actor={{
        ...actor,
        activeCompany: { ...actor.activeCompany, clientPermissions: [] },
      }}
    />,
  );
  await screen.findByText(
    'The frozen payer is unavailable with your current access.',
  );
  await act(async () =>
    release?.(
      Response.json({
        ...document,
        paymentEvidenceSource: {
          ...document.paymentEvidenceSource,
          payer: {
            kind: 'AVAILABLE',
            party: {
              kind: 'PRIMARY',
              legalName: 'Stale hidden payer',
              taxId: null,
              legalAddress: null,
            },
          },
        },
      }),
    ),
  );
  expect(screen.queryByText('Stale hidden payer')).not.toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Fictional notice' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Fictional manual notice')).toBeInTheDocument();
  expect(props.onSelect).not.toHaveBeenCalled();
});
