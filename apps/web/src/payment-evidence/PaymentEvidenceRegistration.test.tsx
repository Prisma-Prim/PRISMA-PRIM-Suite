import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { changeValue } from '../test/select-option';
import { PaymentEvidenceRegistration } from './PaymentEvidenceRegistration';
import {
  paymentEvidenceDocument,
  paymentEvidenceIds as ids,
} from './payment-evidence.test-fixture';
import {
  paymentEvidenceMetadata,
  readPaymentEvidenceDocument,
} from './payment-evidence-response';
const identity = deterministicBrowserIdentity();
afterEach(() => vi.unstubAllGlobals());
function transport(post: (body: string, key: string | null) => Response) {
  const writes: Array<{ body: string; key: string | null }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = new URL(input, 'http://localhost').pathname;
      if (init?.method === 'POST') {
        const write = {
          body: String(init.body),
          key: new Headers(init.headers).get('idempotency-key'),
        };
        writes.push(write);
        return post(write.body, write.key);
      }
      if (path.endsWith('/legal-entities'))
        return Response.json({
          clientVersion: 1,
          legalEntities: [
            {
              id: ids.entity,
              legalName: 'Fictional additional payer',
              taxId: null,
              legalAddress: null,
              createdAt: '2026-01-15T09:00:00.000Z',
            },
          ],
        });
      if (path.endsWith('/clients/' + ids.client))
        return Response.json({
          id: ids.client,
          displayName: 'Fictional original Client',
          taxId: null,
          address: null,
        });
      if (path.endsWith('/clients'))
        return Response.json([
          { id: ids.client, displayName: 'Fictional original Client' },
        ]);
      return new Response(null, { status: 404 });
    }),
  );
  return writes;
}
async function fill() {
  await waitFor(() =>
    expect(screen.getByLabelText('Original Client')).not.toBeDisabled(),
  );
  changeValue(screen.getByLabelText('Original Client'), ids.client);
  await waitFor(() =>
    expect(screen.getByLabelText('Exact payer')).not.toBeDisabled(),
  );
  changeValue(screen.getByLabelText('Exact payer'), 'PRIMARY');
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Fictional notice' },
  });
  fireEvent.change(screen.getByLabelText('Purpose'), {
    target: { value: 'Preserve original source' },
  });
  fireEvent.change(screen.getByLabelText('Declared source'), {
    target: { value: 'Fictional manual notice' },
  });
}
it('retains the exact dispatched registration envelope after payer-only loss and accepts a currently unavailable frozen payer on replay', async () => {
  let attempts = 0;
  const document = paymentEvidenceDocument();
  const writes = transport(() =>
    Response.json(
      ++attempts === 1
        ? {}
        : {
            ...document,
            paymentEvidenceSource: {
              ...document.paymentEvidenceSource,
              payer: { kind: 'UNAVAILABLE' },
            },
          },
      { status: 201 },
    ),
  );
  const onRegistered = vi.fn(),
    onProtected = vi.fn(),
    onRejected = vi.fn();
  const props = {
    identity,
    companyId: ids.company,
    registerKey: 'stable-recorder-envelope',
    onRegistered,
    onProtectedWorkChange: onProtected,
    onRejected,
  };
  const view = render(
    <PaymentEvidenceRegistration
      {...props}
      freshPayerKey="initial-identity-copy"
    />,
  );
  await fill();
  fireEvent.click(
    screen.getByRole('button', { name: 'Preserve evidence source' }),
  );
  await screen.findByRole('button', {
    name: 'Retry identical evidence registration',
  });
  view.rerender(
    <PaymentEvidenceRegistration {...props} freshPayerKey={null} />,
  );
  expect(
    screen.queryByText('Fictional original Client'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', {
      name: 'Retry identical evidence registration',
    }),
  ).not.toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Retry identical evidence registration',
    }),
  );
  await waitFor(() => expect(onRegistered).toHaveBeenCalledTimes(1));
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(onRegistered).toHaveBeenCalledWith(
    paymentEvidenceMetadata(
      readPaymentEvidenceDocument({
        ...document,
        paymentEvidenceSource: {
          ...document.paymentEvidenceSource,
          payer: { kind: 'UNAVAILABLE' },
        },
      }),
    ),
  );
});
it('blocks a genuinely new first send without Company identity-read', () => {
  const writes = transport(() =>
    Response.json(paymentEvidenceDocument(), { status: 201 }),
  );
  render(
    <PaymentEvidenceRegistration
      identity={identity}
      companyId={ids.company}
      registerKey="recorder"
      freshPayerKey={null}
      onRegistered={vi.fn()}
      onProtectedWorkChange={vi.fn()}
      onRejected={vi.fn()}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Preserve evidence source' }),
  ).toBeDisabled();
  expect(writes).toHaveLength(0);
});

it('rechecks fresh copying after held token acquisition before the first dispatch', async () => {
  let release: ((token: string) => void) | undefined;
  const token = new Promise<string>((resolve) => {
    release = resolve;
  });
  const getToken = vi.fn(async () => 'test-token');
  const currentIdentity = { ...identity, requestHeaders: undefined, getToken };
  const writes = transport(() =>
    Response.json(paymentEvidenceDocument(), { status: 201 }),
  );
  const props = {
    identity: currentIdentity,
    companyId: ids.company,
    registerKey: 'recorder',
    onRegistered: vi.fn(),
    onProtectedWorkChange: vi.fn(),
    onRejected: vi.fn(),
  };
  const view = render(
    <PaymentEvidenceRegistration {...props} freshPayerKey="identity-copy" />,
  );
  await fill();
  getToken.mockImplementationOnce(() => token);
  fireEvent.click(
    screen.getByRole('button', { name: 'Preserve evidence source' }),
  );
  await screen.findByRole('button', { name: 'Preserving evidence…' });
  view.rerender(
    <PaymentEvidenceRegistration {...props} freshPayerKey={null} />,
  );
  await act(async () => {
    release?.('test-token');
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Preserve evidence source' }),
    ).toBeDisabled(),
  );
  expect(writes).toHaveLength(0);
});
it('preserves literal drafts through locale and frame changes without repeated source reads', async () => {
  const writes = transport(() =>
    Response.json(paymentEvidenceDocument(), { status: 201 }),
  );
  const props = {
    identity,
    companyId: ids.company,
    registerKey: 'recorder',
    freshPayerKey: 'identity-copy',
    onRegistered: vi.fn(),
    onProtectedWorkChange: vi.fn(),
    onRejected: vi.fn(),
  };
  const view = render(
    <ApplicationPresentation value="prisme">
      <InterfaceLocaleSelect />
      <PaymentEvidenceRegistration {...props} />
    </ApplicationPresentation>,
  );
  await fill();
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Literal  Титул é  ' },
  });
  fireEvent.change(screen.getByLabelText('Received on'), {
    target: { value: '2026-02-30' },
  });
  const readCount = vi.mocked(fetch).mock.calls.length;
  changeValue(screen.getByLabelText('Interface language'), 'fr');
  expect(screen.getByLabelText('Titre')).toHaveValue('Literal  Титул é  ');
  expect(screen.getByLabelText('Reçu le')).toHaveValue('2026-02-30');
  view.rerender(
    <ApplicationPresentation value="classic">
      <InterfaceLocaleSelect />
      <PaymentEvidenceRegistration {...props} />
    </ApplicationPresentation>,
  );
  expect(screen.getByLabelText('Titre')).toHaveValue('Literal  Титул é  ');
  expect(vi.mocked(fetch).mock.calls).toHaveLength(readCount);
  expect(writes).toHaveLength(0);
});

it('does not turn a failed token lookup into permission to first-dispatch an unsubmitted payer copy after identity-read loss', async () => {
  const getToken = vi.fn(async () => 'test-token');
  const currentIdentity = { ...identity, requestHeaders: undefined, getToken };
  const writes = transport(() =>
    Response.json(paymentEvidenceDocument(), { status: 201 }),
  );
  const props = {
    identity: currentIdentity,
    companyId: ids.company,
    registerKey: 'recorder',
    onRegistered: vi.fn(),
    onProtectedWorkChange: vi.fn(),
    onRejected: vi.fn(),
  };
  const view = render(
    <PaymentEvidenceRegistration {...props} freshPayerKey="identity-copy" />,
  );
  await fill();
  getToken.mockRejectedValueOnce(new Error('Token unavailable'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Preserve evidence source' }),
  );
  await screen.findByText(
    'Select the Client and payer and complete valid source metadata.',
  );
  view.rerender(
    <PaymentEvidenceRegistration {...props} freshPayerKey={null} />,
  );
  expect(
    screen.queryByRole('button', {
      name: 'Retry identical evidence registration',
    }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Preserve evidence source' }),
  ).toBeDisabled();
  expect(writes).toHaveLength(0);
});
