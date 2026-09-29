import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  RequestClientAssociation,
  type CommercialIntakeAccessHandler,
  type CommercialIntakeRequest,
} from './RequestClientAssociation';
import { commercialIntakeCopy as copy } from './commercial-intake.copy';

const client = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Accessible Client',
  relatedToActiveCompany: true,
};

const okAccess: CommercialIntakeAccessHandler = async () => 'ok';

afterEach(() => vi.restoreAllMocks());

describe('RequestClientAssociation', () => {
  it('searches an accessible Client and publishes a successful association', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '22222222-2222-4222-8222-222222222222',
    );
    const request = vi.fn<CommercialIntakeRequest>(async ({ method }) =>
      method === 'POST'
        ? {
            status: 200,
            body: {
              receipt: {
                requestId: 'request-1',
                version: 2,
                outcome: 'associated',
              },
              request: { id: 'request-1', companyId: 'company-1', version: 2 },
            },
          }
        : { status: 200, body: [client] },
    );
    const onAssociated = vi.fn(async () => true);

    renderAssociation({
      request,
      onAssociated,
      clientIdentityRevision: 7,
    });
    await searchAndChooseClient();
    fireEvent.click(
      screen.getByRole('button', { name: copy.confirmClientAssociation }),
    );

    await waitFor(() =>
      expect(onAssociated).toHaveBeenCalledWith(
        { id: 'request-1', companyId: 'company-1', version: 2 },
        7,
      ),
    );
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          clientAccountId: client.id,
        }),
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
      }),
    );
    expect(screen.getByText(copy.clientAssociationSuccess)).toBeVisible();
  });

  it.each([
    ['receipt Request', { receiptRequestId: 'request-2' }],
    ['returned Request', { requestId: 'request-2' }],
    ['active Company', { companyId: 'company-2' }],
  ])('rejects a 200 response for the wrong %s', async (_case, mismatch) => {
    const onAssociated = vi.fn(async () => true);
    const request = vi.fn<CommercialIntakeRequest>(async ({ method }) =>
      method === 'POST'
        ? {
            status: 200,
            body: {
              receipt: {
                requestId:
                  'receiptRequestId' in mismatch
                    ? mismatch.receiptRequestId
                    : 'request-1',
                version: 2,
                outcome: 'associated',
              },
              request: {
                id: 'requestId' in mismatch ? mismatch.requestId : 'request-1',
                companyId:
                  'companyId' in mismatch ? mismatch.companyId : 'company-1',
                version: 2,
              },
            },
          }
        : { status: 200, body: [client] },
    );
    renderAssociation({ request, onAssociated });
    await searchAndChooseClient();
    fireEvent.click(
      screen.getByRole('button', { name: copy.confirmClientAssociation }),
    );

    expect(await screen.findByText(copy.clientAssociationError)).toBeVisible();
    expect(onAssociated).not.toHaveBeenCalled();
  });

  it('clears the selection and ignores a deferred association after Client identity changes', async () => {
    let resolveAssociation:
      | ((value: Awaited<ReturnType<CommercialIntakeRequest>>) => void)
      | undefined;
    const request = vi.fn<CommercialIntakeRequest>(({ method }) =>
      method === 'POST'
        ? new Promise((resolve) => {
            resolveAssociation = resolve;
          })
        : Promise.resolve({ status: 200, body: [client] }),
    );
    const onAssociated = vi.fn(async () => true);
    const identity = deterministicBrowserIdentity();
    const view = renderAssociation({
      request,
      onAssociated,
      clientIdentityRevision: 4,
      identity,
    });
    await searchAndChooseClient();
    fireEvent.click(
      screen.getByRole('button', { name: copy.confirmClientAssociation }),
    );
    view.rerender(
      associationElement({
        request,
        onAssociated,
        clientIdentityRevision: 5,
        identity,
      }),
    );
    await act(async () => {
      resolveAssociation?.({
        status: 200,
        body: {
          receipt: {
            requestId: 'request-1',
            version: 2,
            outcome: 'associated',
          },
          request: { id: 'request-1', companyId: 'company-1', version: 2 },
        },
      });
    });

    expect(onAssociated).not.toHaveBeenCalled();
    expect(screen.getByLabelText(copy.clientSearch)).toHaveValue('');
    expect(screen.getByLabelText(copy.clientSearch)).toBeEnabled();
    expect(
      screen.queryByRole('combobox', { name: copy.existingClient }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(copy.clientAssociationSuccess),
    ).not.toBeInTheDocument();
    expect(
      request.mock.calls.find(([input]) => input.method === 'POST')?.[0].signal
        .aborted,
    ).toBe(true);
  });

  it('retries an uncertain result with the exact same payload and key', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '33333333-3333-4333-8333-333333333333',
    );
    let attempts = 0;
    const request = vi.fn<CommercialIntakeRequest>(async ({ method }) => {
      if (method !== 'POST') return { status: 200, body: [client] };
      attempts += 1;
      return attempts === 1
        ? { status: 'network' }
        : {
            status: 200,
            body: {
              receipt: {
                requestId: 'request-1',
                version: 2,
                outcome: 'associated',
              },
              request: { id: 'request-1', companyId: 'company-1', version: 2 },
            },
          };
    });

    renderAssociation({ request });
    await searchAndChooseClient();
    fireEvent.click(
      screen.getByRole('button', { name: copy.confirmClientAssociation }),
    );
    const retryButton = await screen.findByRole('button', {
      name: copy.retryClientAssociation,
    });
    expect(screen.getByText(copy.clientAssociationUncertain)).toBeVisible();
    fireEvent.click(retryButton);
    await screen.findByText(copy.clientAssociationSuccess);

    const commands = request.mock.calls
      .map(([input]) => input)
      .filter((input) => input.method === 'POST');
    expect(commands).toHaveLength(2);
    expect(commands[1]?.body).toBe(commands[0]?.body);
    expect(commands[1]?.idempotencyKey).toBe(commands[0]?.idempotencyKey);
  });

  it('ignores a pending search after Client identity changes and requires a fresh selection', async () => {
    let resolveSearch:
      | ((value: Awaited<ReturnType<CommercialIntakeRequest>>) => void)
      | undefined;
    const request = vi.fn<CommercialIntakeRequest>(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );
    const identity = deterministicBrowserIdentity();
    const view = renderAssociation({
      request,
      identity,
      clientIdentityRevision: 4,
    });
    fireEvent.change(screen.getByLabelText(copy.clientSearch), {
      target: { value: 'Accessible' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.searchClients }));

    view.rerender(
      associationElement({ request, identity, clientIdentityRevision: 5 }),
    );
    await act(async () => {
      resolveSearch?.({ status: 200, body: [client] });
    });

    expect(request.mock.calls[0]?.[0].signal.aborted).toBe(true);
    expect(screen.getByLabelText(copy.clientSearch)).toHaveValue('');
    expect(
      screen.queryByRole('combobox', { name: copy.existingClient }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: copy.confirmClientAssociation }),
    );
    expect(
      await screen.findByText(copy.clientAssociationValidation),
    ).toBeVisible();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(['selected', 'uncertain'])(
    'retires the %s Client command when Client identity changes',
    async (state) => {
      const request = vi.fn<CommercialIntakeRequest>(async ({ method }) =>
        method === 'POST'
          ? { status: 'network' }
          : { status: 200, body: [client] },
      );
      const identity = deterministicBrowserIdentity();
      const view = renderAssociation({
        request,
        identity,
        clientIdentityRevision: 4,
      });
      await searchAndChooseClient();
      if (state === 'uncertain') {
        fireEvent.click(
          screen.getByRole('button', { name: copy.confirmClientAssociation }),
        );
        await screen.findByText(copy.clientAssociationUncertain);
      }

      view.rerender(
        associationElement({ request, identity, clientIdentityRevision: 5 }),
      );

      expect(
        screen.queryByRole('button', { name: copy.retryClientAssociation }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText(copy.clientSearch)).toHaveValue('');
      expect(screen.getByLabelText(copy.clientSearch)).toBeEnabled();
      expect(
        screen.queryByRole('combobox', { name: copy.existingClient }),
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: copy.confirmClientAssociation }),
      );
      expect(
        await screen.findByText(copy.clientAssociationValidation),
      ).toBeVisible();
      const previousCommand = request.mock.calls.find(
        ([input]) => input.method === 'POST',
      )?.[0];
      expect(
        request.mock.calls.filter(([input]) => input.method === 'POST'),
      ).toHaveLength(state === 'uncertain' ? 1 : 0);

      await searchAndChooseClient();
      fireEvent.click(
        screen.getByRole('button', { name: copy.confirmClientAssociation }),
      );
      await screen.findByText(copy.clientAssociationUncertain);
      expect(request.mock.lastCall?.[0].idempotencyKey).toBeDefined();
      expect(request.mock.lastCall?.[0].idempotencyKey).not.toBe(
        previousCommand?.idempotencyKey,
      );
    },
  );

  it.each([
    [404, 'CLIENT_REFERENCE_UNAVAILABLE', copy.unavailableClient],
    [409, 'STALE_VERSION', copy.clientAssociationStale],
    [409, 'CLIENT_ALREADY_ASSOCIATED', copy.clientAlreadyAssociated],
  ])(
    'shows the settled %s response without offering an exact retry',
    async (status, code, message) => {
      const request = vi.fn<CommercialIntakeRequest>(async ({ method }) =>
        method === 'POST'
          ? { status, body: { code } }
          : { status: 200, body: [client] },
      );
      renderAssociation({ request });
      await searchAndChooseClient();
      fireEvent.click(
        screen.getByRole('button', { name: copy.confirmClientAssociation }),
      );

      expect(await screen.findByText(message)).toBeVisible();
      expect(
        screen.queryByRole('button', { name: copy.retryClientAssociation }),
      ).not.toBeInTheDocument();
    },
  );

  it('keeps the readable Request while association authority is denied', async () => {
    const request = vi.fn<CommercialIntakeRequest>(async ({ method }) =>
      method === 'POST'
        ? { status: 403, body: { code: 'FORBIDDEN' } }
        : { status: 200, body: [client] },
    );
    const handleAccess = vi.fn<CommercialIntakeAccessHandler>(
      async (_result, _companyId, _signal, resource) =>
        resource === 'client-association' ? 'retained' : 'ok',
    );
    renderAssociation({ request, handleAccess });
    await searchAndChooseClient();
    fireEvent.click(
      screen.getByRole('button', { name: copy.confirmClientAssociation }),
    );

    expect(await screen.findByText(copy.clientAssociationDenied)).toBeVisible();
    expect(screen.getByText(copy.associateClient)).toBeVisible();
  });

  it('ignores a search response after the Request changes', async () => {
    let resolveSearch:
      ((value: { status: number; body: unknown }) => void) | undefined;
    const request = vi.fn<CommercialIntakeRequest>(
      ({ signal }) =>
        new Promise((resolve) => {
          resolveSearch = resolve;
          signal.addEventListener('abort', () => undefined);
        }),
    );
    const view = renderAssociation({ request });
    fireEvent.change(screen.getByLabelText(copy.clientSearch), {
      target: { value: 'Accessible' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.searchClients }));
    view.rerender(associationElement({ request, requestId: 'request-2' }));
    resolveSearch?.({ status: 200, body: [client] });

    await waitFor(() =>
      expect(
        screen.queryByRole('combobox', { name: copy.existingClient }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText(copy.clientSearch)).toHaveValue('');
  });
});

function associationElement({
  request,
  requestId = 'request-1',
  clientIdentityRevision,
  identity = deterministicBrowserIdentity(),
  handleAccess = okAccess,
  onAssociated = async () => true,
}: {
  request: CommercialIntakeRequest;
  requestId?: string;
  clientIdentityRevision?: number;
  identity?: ReturnType<typeof deterministicBrowserIdentity>;
  handleAccess?: CommercialIntakeAccessHandler;
  onAssociated?: (
    value: unknown,
    identityRevision: number,
  ) => Promise<boolean> | boolean;
}) {
  return (
    <RequestClientAssociation
      identity={identity}
      companyId="company-1"
      requestId={requestId}
      expectedVersion={1}
      clientIdentityRevision={clientIdentityRevision}
      request={request}
      handleAccess={handleAccess}
      onAssociated={onAssociated}
    />
  );
}

function renderAssociation(props: Parameters<typeof associationElement>[0]) {
  return render(associationElement(props));
}

async function searchAndChooseClient(): Promise<void> {
  fireEvent.change(screen.getByLabelText(copy.clientSearch), {
    target: { value: 'Accessible' },
  });
  fireEvent.click(screen.getByRole('button', { name: copy.searchClients }));
  const select = await screen.findByRole('combobox', {
    name: copy.existingClient,
  });
  fireEvent.click(select);
  fireEvent.click(screen.getByRole('option', { name: client.displayName }));
}
