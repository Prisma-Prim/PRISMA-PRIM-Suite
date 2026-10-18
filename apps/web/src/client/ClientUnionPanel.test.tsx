import { changeValue } from '../test/select-option';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { ClientUnionPanel } from './ClientUnionPanel';

const first = {
  id: 'client-1',
  version: 1,
  displayName: 'Exemplu SRL',
  taxId: 'UNION-X',
  address: null,
  telephone: null,
  generalEmail: null,
  businessActivity: null,
  contacts: [{ name: 'Alex' }],
};
const second = {
  ...first,
  id: 'client-2',
  displayName: 'Exemplu S.R.L.',
  address: 'Chisinau',
  contacts: [{ name: 'Dana' }],
};
const companies = [
  { id: 'company-a', displayName: 'PRISMA-PRIM' },
  { id: 'company-b', displayName: 'BIC' },
];
const comparison = {
  outcome: 'comparison',
  reviewReference: 'review-1',
  clients: [first, second],
  companies,
};
const detail = {
  state: 'united',
  operationId: 'internal-operation',
  projectionReference: 'projection-a',
  canonicalClientId: first.id,
  reason: 'Verified original union reason.',
  occurredAt: '2026-09-12T12:00:00.000Z',
  actor: { internalUserId: 'resolver', displayName: 'Authorized Director' },
  canReverse: true,
  originals: [first, second],
  companies,
  reversal: null,
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const props = () => ({
  clientId: first.id,
  companyContextId: 'company-a',
  identity: deterministicBrowserIdentity(),
  canResolve: true,
  onChanged: vi.fn(async () => undefined),
  onOpenCanonical: vi.fn(),
  onCompanyContextRejected: vi.fn(),
  onActorRevalidated: vi.fn(),
  onWorkspaceAccessRejected: vi.fn(),
});

async function completeComparison() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Review existing duplicates' }),
  );
  const form = await screen.findByRole('form', { name: 'Confirm union' });
  for (const select of within(form).getAllByRole('combobox'))
    changeValue(select, first.id);
  changeValue(
    within(form).getByLabelText('Reason for this union'),
    'Same verified legal identity.',
  );
  for (const checkbox of within(form).getAllByRole('checkbox'))
    fireEvent.click(checkbox);
  return form;
}

describe('Client union UI public journey', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('discovers superseded history without an active selection and opens the canonical dossier', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response([{ id: second.id, displayName: second.displayName }]),
        )
        .mockResolvedValueOnce(
          response({
            events: [
              {
                action: 'client.union_confirmed',
                projectionReference: 'projection-a',
                companyId: 'company-a',
              },
            ],
            detailReferences: ['projection-a'],
          }),
        )
        .mockResolvedValueOnce(response(detail)),
    );
    const callbacks = props();
    render(<ClientUnionPanel {...callbacks} clientId={undefined} />);
    expect(
      screen.queryByRole('button', { name: 'Review existing duplicates' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Superseded Client history' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: second.displayName }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View authorized union details',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open canonical Client dossier',
      }),
    );
    expect(callbacks.onOpenCanonical).toHaveBeenCalledWith(first.id);
    expect(callbacks.onChanged).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/clients/client-2/union-history',
      expect.any(Object),
    );
  });

  it('requires deliberate choices, confirms a union, reads attributable history and reverses it', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(comparison, 201))
      .mockResolvedValueOnce(
        response(
          {
            outcome: 'united',
            projectionReference: 'projection-a',
            canonicalClientId: first.id,
          },
          201,
        ),
      )
      .mockResolvedValueOnce(response(detail))
      .mockResolvedValueOnce(
        response(
          { outcome: 'reversed', clientIds: [first.id, second.id] },
          201,
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    const callbacks = props();
    render(<ClientUnionPanel {...callbacks} />);
    const form = await completeComparison();
    expect(screen.getByText('Alex')).toBeVisible();
    expect(screen.getByText('Dana')).toBeVisible();
    fireEvent.submit(form);
    expect(await screen.findByText(/Union confirmed\./)).toBeVisible();
    expect(callbacks.onChanged).toHaveBeenCalledWith(first.id);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      '/api/client-union-reviews/review-1/confirm',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-company-context-id': 'company-a',
          'idempotency-key': expect.any(String),
        }),
        body: JSON.stringify({
          canonicalClientId: first.id,
          fields: {
            displayName: first.id,
            taxId: first.id,
            address: first.id,
            telephone: first.id,
            generalEmail: first.id,
            businessActivity: first.id,
          },
          reason: 'Same verified legal identity.',
          reviewedDifferences: true,
          companyIds: ['company-a', 'company-b'],
        }),
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'View authorized union details' }),
    );
    expect(await screen.findByText(detail.reason)).toBeVisible();
    expect(screen.getByText('United')).toBeVisible();
    expect(screen.getByText(/Authorized Director/)).toBeVisible();
    expect(document.querySelector('time')).toHaveAttribute(
      'datetime',
      detail.occurredAt,
    );
    expect(
      screen.getByRole('heading', { name: 'Source 1 · Exemplu SRL' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Source 2 · Exemplu S.R.L.' }),
    ).toBeVisible();
    expect(screen.getByText('Source 1 · Contact 1')).toBeVisible();
    expect(screen.getByText('Source 2 · Contact 1')).toBeVisible();
    const capturedCompanies = screen.getByRole('region', {
      name: 'Complete captured Company set',
    });
    expect(within(capturedCompanies).getByText('PRISMA-PRIM')).toBeVisible();
    expect(within(capturedCompanies).getByText('BIC')).toBeVisible();
    expect(screen.queryByText('internal-operation')).not.toBeInTheDocument();
    const reversal = screen.getByRole('form', { name: 'Reverse union' });
    changeValue(
      within(reversal).getByLabelText('Reason for reversal'),
      'Restore the separate dossiers.',
    );
    fireEvent.click(within(reversal).getByRole('checkbox'));
    fireEvent.submit(reversal);
    expect(await screen.findByText(/Union reversed\./)).toBeVisible();
    expect(callbacks.onChanged).toHaveBeenCalledTimes(2);
  });

  it('keeps an uncertain reversal for an explicit unchanged retry across presentation changes', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response([{ id: second.id, displayName: second.displayName }]),
      )
      .mockResolvedValueOnce(
        response({
          events: [
            {
              action: 'client.union_confirmed',
              projectionReference: 'projection-a',
              companyId: 'company-a',
            },
          ],
          detailReferences: ['projection-a'],
        }),
      )
      .mockResolvedValueOnce(response(detail))
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(
        response(
          { outcome: 'reversed', clientIds: [first.id, second.id] },
          201,
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    const callbacks = props();
    const panel = (presentation: 'classic' | 'prisme') => (
      <ApplicationPresentation value={presentation}>
        <ClientUnionPanel {...callbacks} clientId={undefined} />
      </ApplicationPresentation>
    );
    const rendered = render(panel('prisme'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Superseded Client history' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: second.displayName }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View authorized union details',
      }),
    );
    const reversal = await screen.findByRole('form', {
      name: 'Reverse union',
    });
    changeValue(
      within(reversal).getByLabelText('Reason for reversal'),
      'Restore the separate dossiers deliberately.',
    );
    fireEvent.click(within(reversal).getByRole('checkbox'));
    fireEvent.submit(reversal);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No confirmation has been received for this reversal.',
    );
    expect(fetcher).toHaveBeenCalledTimes(4);
    rendered.rerender(panel('classic'));
    rendered.rerender(panel('prisme'));
    expect(screen.getByRole('form', { name: 'Reverse union' })).toBe(reversal);
    expect(within(reversal).getByLabelText('Reason for reversal')).toHaveValue(
      'Restore the separate dossiers deliberately.',
    );
    expect(within(reversal).getByRole('checkbox')).toBeChecked();
    fireEvent.click(
      within(reversal).getByRole('button', { name: 'Retry reversal' }),
    );
    expect(await screen.findByText(/Union reversed\./)).toBeVisible();
    expect(fetcher.mock.calls[4]?.[1]).toEqual(
      expect.objectContaining({
        headers: fetcher.mock.calls[3]?.[1].headers,
        body: fetcher.mock.calls[3]?.[1].body,
      }),
    );
    expect(callbacks.onChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps a confirmed reversal separate from a rejected refresh callback', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response([{ id: second.id, displayName: second.displayName }]),
        )
        .mockResolvedValueOnce(
          response({
            events: [
              {
                action: 'client.union_confirmed',
                projectionReference: 'projection-a',
                companyId: 'company-a',
              },
            ],
            detailReferences: ['projection-a'],
          }),
        )
        .mockResolvedValueOnce(response(detail))
        .mockResolvedValueOnce(
          response(
            { outcome: 'reversed', clientIds: [first.id, second.id] },
            201,
          ),
        ),
    );
    render(
      <ClientUnionPanel
        {...props()}
        clientId={undefined}
        onChanged={async () => {
          throw new Error('Refresh unavailable');
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Superseded Client history' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: second.displayName }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View authorized union details',
      }),
    );
    const reversal = await screen.findByRole('form', {
      name: 'Reverse union',
    });
    changeValue(
      within(reversal).getByLabelText('Reason for reversal'),
      'Restore the separate dossiers.',
    );
    fireEvent.click(within(reversal).getByRole('checkbox'));
    fireEvent.submit(reversal);
    expect(await screen.findByText(/Union reversed\./)).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The command was confirmed, but a subsequent refresh failed.',
    );
    expect(
      screen.queryByText(
        'No confirmation has been received for this reversal.',
      ),
    ).not.toBeInTheDocument();
  });

  it('does not revive a reversal refresh warning after Close', async () => {
    let rejectRefresh: ((reason: Error) => void) | undefined;
    const refresh = new Promise<void>((_, reject) => {
      rejectRefresh = reject;
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response([{ id: second.id, displayName: second.displayName }]),
        )
        .mockResolvedValueOnce(
          response({
            events: [
              {
                action: 'client.union_confirmed',
                projectionReference: 'projection-a',
                companyId: 'company-a',
              },
            ],
            detailReferences: ['projection-a'],
          }),
        )
        .mockResolvedValueOnce(response(detail))
        .mockResolvedValueOnce(
          response(
            { outcome: 'reversed', clientIds: [first.id, second.id] },
            201,
          ),
        ),
    );
    render(
      <ClientUnionPanel
        {...props()}
        clientId={undefined}
        onChanged={() => refresh}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Superseded Client history' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: second.displayName }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View authorized union details',
      }),
    );
    const reversal = await screen.findByRole('form', {
      name: 'Reverse union',
    });
    changeValue(
      within(reversal).getByLabelText('Reason for reversal'),
      'Restore the separate dossiers.',
    );
    fireEvent.click(within(reversal).getByRole('checkbox'));
    fireEvent.submit(reversal);
    await screen.findByText(/Union reversed\./);
    fireEvent.click(screen.getByRole('button', { name: 'Close review' }));
    await act(async () => {
      if (!rejectRefresh) throw new Error('Expected pending reversal refresh');
      rejectRefresh(new Error('Late refresh error'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Union reversed\./)).not.toBeInTheDocument();
  });

  it.each([
    'new Project',
    'new Document',
    'new Document–Project link',
    'new Document–Project unlink',
  ])(
    'clears a stale reversal form after a %s fence and requires an explicit fresh lookup',
    async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          response([{ id: second.id, displayName: second.displayName }]),
        )
        .mockResolvedValueOnce(
          response({
            events: [
              {
                action: 'client.union_confirmed',
                projectionReference: 'projection-a',
                companyId: 'company-a',
              },
            ],
            detailReferences: ['projection-a'],
          }),
        )
        .mockResolvedValueOnce(response(detail))
        .mockResolvedValueOnce(response({}, 409));
      vi.stubGlobal('fetch', fetcher);
      render(<ClientUnionPanel {...props()} clientId={undefined} />);
      fireEvent.click(
        screen.getByRole('button', { name: 'Superseded Client history' }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: second.displayName }),
      );
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'View authorized union details',
        }),
      );
      const reversal = await screen.findByRole('form', {
        name: 'Reverse union',
      });
      changeValue(
        within(reversal).getByLabelText('Reason for reversal'),
        'Restore the separate dossiers.',
      );
      fireEvent.click(within(reversal).getByRole('checkbox'));
      fireEvent.submit(reversal);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The reversal is no longer current. Load the authorized operation detail again before deciding.',
      );
      expect(
        screen.queryByRole('form', { name: 'Reverse union' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(detail.reason)).not.toBeInTheDocument();
      expect(screen.queryByText(/Union reversed\./)).not.toBeInTheDocument();
      expect(fetcher).toHaveBeenCalledTimes(4);
    },
  );

  it('requires a reversal reason and the complete captured Company acknowledgement', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response([{ id: second.id, displayName: second.displayName }]),
      )
      .mockResolvedValueOnce(
        response({
          events: [
            {
              action: 'client.union_confirmed',
              projectionReference: 'projection-a',
              companyId: 'company-a',
            },
          ],
          detailReferences: ['projection-a'],
        }),
      )
      .mockResolvedValueOnce(response(detail));
    vi.stubGlobal('fetch', fetcher);
    render(<ClientUnionPanel {...props()} clientId={undefined} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Superseded Client history' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: second.displayName }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View authorized union details',
      }),
    );
    const reversal = await screen.findByRole('form', {
      name: 'Reverse union',
    });
    const reason = within(reversal).getByLabelText('Reason for reversal');
    const acknowledgement = within(reversal).getByRole('checkbox');
    fireEvent.click(
      within(reversal).getByRole('button', { name: 'Reverse union' }),
    );
    expect(await within(reversal).findByRole('alert')).toHaveTextContent(
      'Give a reason and confirm the complete captured Company set before reversing.',
    );
    expect(reason).toHaveAttribute('aria-invalid', 'true');
    expect(acknowledgement).toHaveAttribute('aria-invalid', 'true');
    expect(reason).toHaveAttribute('maxlength', '2000');
    expect(fetcher).toHaveBeenCalledTimes(3);
    changeValue(reason, '  ');
    fireEvent.click(acknowledgement);
    fireEvent.submit(reversal);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('creates a new reversal command when the retained uncertain intention changes', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response([{ id: second.id, displayName: second.displayName }]),
      )
      .mockResolvedValueOnce(
        response({
          events: [
            {
              action: 'client.union_confirmed',
              projectionReference: 'projection-a',
              companyId: 'company-a',
            },
          ],
          detailReferences: ['projection-a'],
        }),
      )
      .mockResolvedValueOnce(response(detail))
      .mockResolvedValue(response({}, 503));
    vi.stubGlobal('fetch', fetcher);
    render(<ClientUnionPanel {...props()} clientId={undefined} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Superseded Client history' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: second.displayName }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View authorized union details',
      }),
    );
    const reversal = await screen.findByRole('form', {
      name: 'Reverse union',
    });
    const reason = within(reversal).getByLabelText('Reason for reversal');
    changeValue(reason, 'Restore the separate dossiers.');
    fireEvent.click(within(reversal).getByRole('checkbox'));
    fireEvent.submit(reversal);
    await screen.findByRole('alert');
    changeValue(reason, 'Restore them after a fresh review.');
    fireEvent.submit(reversal);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5));
    expect(fetcher.mock.calls[4]?.[1].headers['idempotency-key']).not.toBe(
      fetcher.mock.calls[3]?.[1].headers['idempotency-key'],
    );
    expect(fetcher.mock.calls[4]?.[1].body).not.toBe(
      fetcher.mock.calls[3]?.[1].body,
    );
  });

  it('shows honest loading, empty, error and unavailable source states', async () => {
    let release: ((value: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(pending));
    const loading = render(
      <ClientUnionPanel {...props()} clientId={undefined} />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Superseded Client history' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading the authorized union view…',
    );
    await act(async () => {
      if (!release) throw new Error('Expected pending sources response');
      release(response([]));
    });
    expect(
      await screen.findByText(
        'No superseded Client dossiers are related to the active Company.',
      ),
    ).toBeVisible();
    loading.unmount();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({}, 503)));
    const failed = render(
      <ClientUnionPanel {...props()} clientId={undefined} />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Superseded Client history' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The request could not be completed. You can retry safely.',
    );
    failed.unmount();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({}, 404)));
    render(<ClientUnionPanel {...props()} clientId={undefined} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Superseded Client history' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This operation is unavailable.',
    );
  });

  it('abandons a pending reversal on Close without claiming to cancel the server command', async () => {
    let release: ((value: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response([{ id: second.id, displayName: second.displayName }]),
      )
      .mockResolvedValueOnce(
        response({
          events: [
            {
              action: 'client.union_confirmed',
              projectionReference: 'projection-a',
              companyId: 'company-a',
            },
          ],
          detailReferences: ['projection-a'],
        }),
      )
      .mockResolvedValueOnce(response(detail))
      .mockReturnValueOnce(pending);
    vi.stubGlobal('fetch', fetcher);
    const callbacks = props();
    render(<ClientUnionPanel {...callbacks} clientId={undefined} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Superseded Client history' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: second.displayName }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View authorized union details',
      }),
    );
    const reversal = await screen.findByRole('form', {
      name: 'Reverse union',
    });
    changeValue(
      within(reversal).getByLabelText('Reason for reversal'),
      'Restore the separate dossiers.',
    );
    fireEvent.click(within(reversal).getByRole('checkbox'));
    fireEvent.submit(reversal);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    fireEvent.click(screen.getByRole('button', { name: 'Close review' }));
    expect(fetcher.mock.calls[3]?.[1].signal.aborted).toBe(true);
    await act(async () => {
      if (!release) throw new Error('Expected pending reversal');
      release(
        response(
          { outcome: 'reversed', clientIds: [first.id, second.id] },
          201,
        ),
      );
    });
    expect(callbacks.onChanged).not.toHaveBeenCalled();
    expect(screen.queryByText(/Union reversed\./)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('form', { name: 'Reverse union' }),
    ).not.toBeInTheDocument();
  });

  it.each(['Company', 'authority'])(
    'discards a late reversal after the %s boundary changes',
    async (boundary) => {
      let release: ((value: Response) => void) | undefined;
      const pending = new Promise<Response>((resolve) => {
        release = resolve;
      });
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          response([{ id: second.id, displayName: second.displayName }]),
        )
        .mockResolvedValueOnce(
          response({
            events: [
              {
                action: 'client.union_confirmed',
                projectionReference: 'projection-a',
                companyId: 'company-a',
              },
            ],
            detailReferences: ['projection-a'],
          }),
        )
        .mockResolvedValueOnce(response(detail))
        .mockReturnValueOnce(pending);
      vi.stubGlobal('fetch', fetcher);
      const callbacks = props();
      const rendered = render(
        <ClientUnionPanel {...callbacks} clientId={undefined} />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Superseded Client history' }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: second.displayName }),
      );
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'View authorized union details',
        }),
      );
      const reversal = await screen.findByRole('form', {
        name: 'Reverse union',
      });
      changeValue(
        within(reversal).getByLabelText('Reason for reversal'),
        'Restore the separate dossiers.',
      );
      fireEvent.click(within(reversal).getByRole('checkbox'));
      fireEvent.submit(reversal);
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
      rendered.rerender(
        <ClientUnionPanel
          {...callbacks}
          clientId={undefined}
          companyContextId={
            boundary === 'Company' ? 'company-b' : callbacks.companyContextId
          }
          canResolve={boundary !== 'authority'}
        />,
      );
      expect(fetcher.mock.calls[3]?.[1].signal.aborted).toBe(true);
      await act(async () => {
        if (!release) throw new Error('Expected pending reversal');
        release(
          response(
            { outcome: 'reversed', clientIds: [first.id, second.id] },
            201,
          ),
        );
        await pending;
      });
      expect(callbacks.onChanged).not.toHaveBeenCalled();
      expect(screen.queryByText(/Union reversed\./)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('form', { name: 'Reverse union' }),
      ).not.toBeInTheDocument();
    },
  );

  it.each([
    'new Project',
    'new Document',
    'new Document–Project link',
    'new Document–Project unlink',
  ])(
    'keeps a server-blocked reversal after a %s fence generic and does not expose reference causes',
    async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            response([{ id: second.id, displayName: second.displayName }]),
          )
          .mockResolvedValueOnce(
            response({
              events: [
                {
                  action: 'client.union_confirmed',
                  projectionReference: 'projection-a',
                  companyId: 'company-a',
                },
              ],
              detailReferences: ['projection-a'],
            }),
          )
          .mockResolvedValueOnce(
            response({
              ...detail,
              canReverse: false,
              fresh: false,
              blockingReferences: [
                { kind: 'project', name: 'Confidential Apollo' },
                { kind: 'document_project_link', account: 'Secret Account' },
              ],
            }),
          ),
      );
      render(<ClientUnionPanel {...props()} clientId={undefined} />);
      fireEvent.click(
        screen.getByRole('button', { name: 'Superseded Client history' }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: second.displayName }),
      );
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'View authorized union details',
        }),
      );
      expect(
        await screen.findByText(
          'This union cannot be reversed from the current authorized detail. Its state or governing conditions may have changed.',
        ),
      ).toHaveAttribute('role', 'status');
      expect(
        screen.queryByRole('form', { name: 'Reverse union' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Apollo|Secret Account|Project|Document/),
      ).toBeNull();
    },
  );

  it('presents a reversed operation with separate authorized reversal attribution', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response([{ id: second.id, displayName: second.displayName }]),
        )
        .mockResolvedValueOnce(
          response({
            events: [
              {
                action: 'client.union_reversed',
                projectionReference: 'projection-a',
                companyId: 'company-a',
              },
            ],
            detailReferences: ['projection-a'],
          }),
        )
        .mockResolvedValueOnce(
          response({
            ...detail,
            state: 'reversed',
            canReverse: false,
            reversal: {
              reason: 'Authorized correction.',
              occurredAt: '2026-09-13T13:00:00.000Z',
              actor: {
                internalUserId: 'other-internal-user',
                displayName: 'Authorized Reversal Director',
              },
            },
          }),
        ),
    );
    render(<ClientUnionPanel {...props()} clientId={undefined} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Superseded Client history' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: second.displayName }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View authorized union details',
      }),
    );
    expect(await screen.findByText('Reversed')).toBeVisible();
    expect(screen.getByText(detail.reason)).toBeVisible();
    expect(screen.getByText('Authorized correction.')).toBeVisible();
    expect(screen.getByText(/Authorized Reversal Director/)).toBeVisible();
    expect(document.querySelectorAll('time')).toHaveLength(2);
    expect(
      screen.queryByRole('form', { name: 'Reverse union' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open canonical Client dossier' }),
    ).not.toBeInTheDocument();
  });

  it.each(['context', 'authority'])(
    'discards a late confirmation after %s changes',
    async (change) => {
      let finish: ((response: Response) => void) | undefined;
      const late = new Promise<Response>((resolve) => {
        finish = resolve;
      });
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(response(comparison, 201))
          .mockReturnValueOnce(late),
      );
      const callbacks = props();
      const rendered = render(<ClientUnionPanel {...callbacks} />);
      fireEvent.submit(await completeComparison());
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      rendered.rerender(
        <ClientUnionPanel
          {...callbacks}
          companyContextId={
            change === 'context' ? 'company-b' : callbacks.companyContextId
          }
          identity={
            change === 'context'
              ? deterministicBrowserIdentity()
              : callbacks.identity
          }
          canResolve={change !== 'authority'}
        />,
      );
      await act(async () => {
        finish?.(
          response(
            {
              outcome: 'united',
              projectionReference: 'projection-a',
              canonicalClientId: first.id,
            },
            201,
          ),
        );
        await late;
      });
      expect(callbacks.onChanged).not.toHaveBeenCalled();
      expect(screen.queryByText(/Union confirmed\./)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', {
          name: 'Compare the two existing Clients',
        }),
      ).not.toBeInTheDocument();
    },
  );

  it.each(['Client', 'Company', 'identity', 'authority'])(
    'discards a late authorized history detail after the %s boundary changes',
    async (boundary) => {
      let release: ((value: Response) => void) | undefined;
      const late = new Promise<Response>((resolve) => {
        release = resolve;
      });
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          response([{ id: second.id, displayName: second.displayName }]),
        )
        .mockResolvedValueOnce(
          response({
            events: [
              {
                action: 'client.union_confirmed',
                projectionReference: 'projection-a',
                companyId: 'company-a',
              },
            ],
            detailReferences: ['projection-a'],
          }),
        )
        .mockReturnValueOnce(late);
      vi.stubGlobal('fetch', fetcher);
      const callbacks = props();
      const rendered = render(
        <ClientUnionPanel {...callbacks} clientId={undefined} />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Superseded Client history' }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: second.displayName }),
      );
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'View authorized union details',
        }),
      );
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
      rendered.rerender(
        <ClientUnionPanel
          {...callbacks}
          clientId={boundary === 'Client' ? first.id : undefined}
          companyContextId={
            boundary === 'Company' ? 'company-b' : callbacks.companyContextId
          }
          identity={
            boundary === 'identity'
              ? deterministicBrowserIdentity()
              : callbacks.identity
          }
          canResolve={boundary !== 'authority'}
        />,
      );
      expect(fetcher.mock.calls[2]?.[1].signal.aborted).toBe(true);
      await act(async () => {
        if (!release) throw new Error('Expected pending history detail');
        release(response(detail));
        await late;
      });
      expect(screen.queryByText(detail.reason)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('form', { name: 'Reverse union' }),
      ).not.toBeInTheDocument();
    },
  );

  describe.each([
    {
      action: 'Review existing duplicates',
      path: '/api/clients/client-1/union-reviews',
    },
    { action: 'Union history', path: '/api/clients/client-1/union-history' },
    { action: 'Superseded Client history', path: '/api/client-union-sources' },
  ])('$action load failures with an open comparison', ({ action, path }) => {
    it.each(['response', 'network'])(
      'keeps a %s failure separate from union confirmation',
      async (failure) => {
        const fetcher = vi
          .fn()
          .mockResolvedValueOnce(response(comparison, 201));
        if (failure === 'response')
          fetcher.mockResolvedValueOnce(response({}, 503));
        else
          fetcher.mockRejectedValueOnce(new TypeError('Network unavailable'));
        vi.stubGlobal('fetch', fetcher);
        render(<ClientUnionPanel {...props()} />);
        const form = await completeComparison();
        fireEvent.click(screen.getByRole('button', { name: action }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
          /^The request could not be completed\. You can retry safely\.$/,
        );
        expect(
          screen.queryByText(/No confirmation has been received/),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('form', { name: 'Confirm union' })).toBe(form);
        expect(
          within(form).getByLabelText('Reason for this union'),
        ).toHaveValue('Same verified legal identity.');
        for (const select of within(form).getAllByRole('combobox'))
          expect(select).toHaveValue(first.id);
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(fetcher).toHaveBeenNthCalledWith(2, path, expect.any(Object));
      },
    );
  });

  it('retries only on an explicit action and preserves the same command key', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(comparison, 201))
      .mockResolvedValueOnce(response({}, 500))
      .mockResolvedValueOnce(
        response(
          {
            outcome: 'united',
            projectionReference: 'projection-a',
            canonicalClientId: first.id,
          },
          201,
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    render(<ClientUnionPanel {...props()} />);
    const form = await completeComparison();
    fireEvent.submit(form);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can retry safely.',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    fireEvent.submit(form);
    expect(await screen.findByText(/Union confirmed\./)).toBeVisible();
    expect(fetcher.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        headers: fetcher.mock.calls[1]?.[1].headers,
        body: fetcher.mock.calls[1]?.[1].body,
      }),
    );
  });

  it('offers no restricted detail link for a redacted Company projection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          events: [
            {
              action: 'client.union_reversed',
              projectionReference: 'projection-a',
              companyId: 'company-a',
              actor: { displayName: 'Restricted Person' },
              occurredAt: '2026-09-12T12:00:00.000Z',
              operationId: 'restricted-operation',
            },
            {
              action: 'client.union_confirmed',
              projectionReference: 'projection-a',
              companyId: 'company-a',
            },
          ],
          detailReferences: [],
        }),
      ),
    );
    render(<ClientUnionPanel {...props()} canResolve={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Union history' }));
    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(
      'Authorized resolver reversed a Client union',
    );
    expect(rows[1]).toHaveTextContent(
      'Authorized resolver confirmed a Client union',
    );
    expect(
      screen.queryByRole('button', { name: 'View authorized union details' }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('time')).toBeNull();
    expect(screen.queryByText('Restricted Person')).not.toBeInTheDocument();
    expect(screen.queryByText('projection-a')).not.toBeInTheDocument();
    expect(screen.queryByText('company-a')).not.toBeInTheDocument();
    expect(screen.queryByText('restricted-operation')).not.toBeInTheDocument();
  });
  it('identifies equal names and Contacts by source, validates every choice and keeps all source entries', async () => {
    const sameName = {
      ...second,
      displayName: first.displayName,
      contacts: [{ name: 'Alex' }],
    };
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response({ ...comparison, clients: [first, sameName] }, 201),
      );
    vi.stubGlobal('fetch', fetcher);
    render(<ClientUnionPanel {...props()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Review existing duplicates' }),
    );
    const form = await screen.findByRole('form', { name: 'Confirm union' });
    for (const select of within(form).getAllByRole('combobox'))
      expect(select).toHaveValue('');
    expect(
      screen.getByRole('heading', { name: 'Source 1 · Exemplu SRL' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Source 2 · Exemplu SRL' }),
    ).toBeVisible();
    expect(screen.getByText('Source 1 · Contact 1')).toBeVisible();
    expect(screen.getByText('Source 2 · Contact 1')).toBeVisible();
    fireEvent.submit(form);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a canonical Client and a source for every field, give a reason and confirm both acknowledgements.',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('shows differing Contact positions, decision roles and communication preferences by source before confirmation and in the authorized detail', async () => {
    const described = {
      ...first,
      contacts: [
        {
          name: 'Ion Demo',
          position: 'Director general',
          decisionRoles: ['final_decision_maker', 'financial'],
          communicationPreferences:
            'Romanian; email preferred\nweekday mornings',
        },
      ],
    };
    const differing = {
      ...second,
      contacts: [
        {
          name: 'Ion Demo',
          position: 'Director financiar',
          decisionRoles: ['financial'],
          communicationPreferences: 'Telefon după ora 14:00',
        },
        { name: 'Dana' },
      ],
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ ...comparison, clients: [described, differing] }, 201),
      )
      .mockResolvedValueOnce(
        response(
          {
            outcome: 'united',
            projectionReference: 'projection-a',
            canonicalClientId: first.id,
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        response({ ...detail, originals: [described, differing] }),
      );
    vi.stubGlobal('fetch', fetcher);
    render(<ClientUnionPanel {...props()} />);
    const form = await completeComparison();
    const contactValues = (source: string, contact: number) => {
      const entry = within(
        screen.getByRole('article', { name: source }),
      ).getAllByRole('listitem')[contact];
      if (!entry) throw new Error('Expected a source Contact entry');
      const terms = within(entry).getAllByRole('term');
      const values = within(entry).getAllByRole('definition');
      return Object.fromEntries(
        terms.map((term, index) => [
          term.textContent,
          values[index]?.textContent,
        ]),
      );
    };
    expect(contactValues('Source 1 · Exemplu SRL', 0)).toEqual({
      'Contact telephone': 'Not provided',
      'Contact email': 'Not provided',
      'Contact position': 'Director general',
      'Decision roles': 'Final decision-maker, Financial',
      'Contact communication preferences':
        'Romanian; email preferred\nweekday mornings',
    });
    expect(contactValues('Source 2 · Exemplu S.R.L.', 0)).toEqual({
      'Contact telephone': 'Not provided',
      'Contact email': 'Not provided',
      'Contact position': 'Director financiar',
      'Decision roles': 'Financial',
      'Contact communication preferences': 'Telefon după ora 14:00',
    });
    expect(contactValues('Source 2 · Exemplu S.R.L.', 1)).toEqual({
      'Contact telephone': 'Not provided',
      'Contact email': 'Not provided',
      'Contact position': 'Not provided',
      'Decision roles': 'Not provided',
      'Contact communication preferences': 'Not provided',
    });
    fireEvent.submit(form);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View authorized union details',
      }),
    );
    await screen.findByText(detail.reason);
    const [originalOne, originalTwo] = screen.getAllByRole('article');
    if (!originalOne || !originalTwo)
      throw new Error('Expected both preserved originals');
    expect(within(originalOne).getByText('Director general')).toBeVisible();
    expect(
      within(originalOne).getByText(
        'Decision roles: Final decision-maker, Financial',
      ),
    ).toBeVisible();
    expect(within(originalTwo).getByText('Director financiar')).toBeVisible();
    expect(
      within(originalTwo).getByText('Decision roles: Financial'),
    ).toBeVisible();
    expect(within(originalTwo).getAllByText(/^Decision roles:/u)).toHaveLength(
      1,
    );
    expect(
      within(originalOne).getByText(
        /^Communication preferences: Romanian; email preferred\s+weekday mornings$/u,
      ),
    ).toBeVisible();
    expect(
      within(originalTwo).getByText(
        'Communication preferences: Telefon după ora 14:00',
      ),
    ).toBeVisible();
    expect(
      within(originalTwo).getAllByText(/^Communication preferences:/u),
    ).toHaveLength(1);
  });

  it('refuses a union comparison whose Contact decision role is outside the closed list', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      response(
        {
          ...comparison,
          clients: [
            {
              ...first,
              contacts: [{ name: 'Alex', decisionRoles: ['sponsor'] }],
            },
            second,
          ],
        },
        201,
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    render(<ClientUnionPanel {...props()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Review existing duplicates' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The request could not be completed. You can retry safely.',
    );
    expect(
      screen.queryByRole('form', { name: 'Confirm union' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Alex')).not.toBeInTheDocument();
  });

  it('refuses a union comparison whose Contact communication preferences are not text', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      response(
        {
          ...comparison,
          clients: [
            {
              ...first,
              contacts: [{ name: 'Alex', communicationPreferences: 7 }],
            },
            second,
          ],
        },
        201,
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    render(<ClientUnionPanel {...props()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Review existing duplicates' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The request could not be completed. You can retry safely.',
    );
    expect(
      screen.queryByRole('form', { name: 'Confirm union' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Alex')).not.toBeInTheDocument();
  });

  it('previews the chosen saved value and missing value without changing the command contract', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(comparison, 201));
    vi.stubGlobal('fetch', fetcher);
    render(<ClientUnionPanel {...props()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Review existing duplicates' }),
    );
    const form = await screen.findByRole('form', { name: 'Confirm union' });
    const address = within(form).getByRole('combobox', { name: 'Address' });
    expect(address).not.toHaveAccessibleDescription();
    changeValue(address, second.id);
    expect(address).toHaveAccessibleDescription(
      'Value to retain from Source 2 Chisinau',
    );
    changeValue(address, first.id);
    expect(address).toHaveAccessibleDescription(
      'Value to retain from Source 1 Not provided',
    );
    expect(within(form).queryByText('Chisinau')).not.toBeInTheDocument();
    changeValue(address, '');
    expect(address).not.toHaveAccessibleDescription();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('blocks missing choices, reason and acknowledgements without submitting', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(comparison, 201));
    vi.stubGlobal('fetch', fetcher);
    render(<ClientUnionPanel {...props()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Review existing duplicates' }),
    );
    const form = await screen.findByRole('form', { name: 'Confirm union' });
    fireEvent.submit(form);
    for (const select of within(form).getAllByRole('combobox')) {
      expect(select).toHaveAttribute('aria-invalid', 'true');
      changeValue(select, first.id);
    }
    fireEvent.submit(form);
    expect(fetcher).toHaveBeenCalledTimes(1);
    changeValue(
      within(form).getByLabelText('Reason for this union'),
      ' '.repeat(20),
    );
    fireEvent.submit(form);
    expect(fetcher).toHaveBeenCalledTimes(1);
    changeValue(
      within(form).getByLabelText('Reason for this union'),
      'Verified reason.',
    );
    fireEvent.submit(form);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [firstAck] = within(form).getAllByRole('checkbox');
    if (!firstAck) throw new Error('Expected the differences acknowledgement');
    fireEvent.click(firstAck);
    fireEvent.submit(form);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      within(form).getByLabelText('Reason for this union'),
    ).toHaveAttribute('maxlength', '2000');
  });

  it('blocks confirmation above 50 Contacts and preserves every source entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          {
            ...comparison,
            clients: [
              {
                ...first,
                contacts: Array.from({ length: 26 }, () => ({
                  name: 'Repeated Contact',
                })),
              },
              {
                ...second,
                contacts: Array.from({ length: 25 }, () => ({
                  name: 'Repeated Contact',
                })),
              },
            ],
          },
          201,
        ),
      ),
    );
    render(<ClientUnionPanel {...props()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Review existing duplicates' }),
    );
    const form = await screen.findByRole('form', { name: 'Confirm union' });
    expect(screen.getAllByText('Repeated Contact')).toHaveLength(51);
    expect(
      screen.getByText('Contact entries from both sources: 51. Maximum: 50.'),
    ).toBeVisible();
    expect(
      within(form).getByRole('button', { name: 'Confirm union' }),
    ).toBeDisabled();
    fireEvent.submit(form);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('creates a new command when the intention changes after an uncertain result', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(comparison, 201))
      .mockResolvedValue(response({}, 503));
    vi.stubGlobal('fetch', fetcher);
    render(<ClientUnionPanel {...props()} />);
    const form = await completeComparison();
    fireEvent.submit(form);
    await screen.findByRole('alert');
    changeValue(
      within(form).getByLabelText('Reason for this union'),
      'A changed verified reason.',
    );
    fireEvent.submit(form);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(fetcher.mock.calls[2]?.[1].headers['idempotency-key']).not.toBe(
      fetcher.mock.calls[1]?.[1].headers['idempotency-key'],
    );
    expect(fetcher.mock.calls[2]?.[1].body).not.toBe(
      fetcher.mock.calls[1]?.[1].body,
    );
  });

  it('abandons a pending confirmation on Close and reopens with fresh choices and retry identity', async () => {
    let release: ((response: Response) => void) | undefined;
    const late = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(comparison, 201))
      .mockReturnValueOnce(late)
      .mockResolvedValueOnce(
        response({ ...comparison, reviewReference: 'review-fresh' }, 201),
      )
      .mockResolvedValueOnce(response({}, 503));
    vi.stubGlobal('fetch', fetcher);
    const callbacks = props();
    render(<ClientUnionPanel {...callbacks} />);
    fireEvent.submit(await completeComparison());
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Close review' }));
    expect(fetcher.mock.calls[1]?.[1].signal.aborted).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Review existing duplicates' }),
    );
    const fresh = await screen.findByRole('form', { name: 'Confirm union' });
    for (const select of within(fresh).getAllByRole('combobox'))
      expect(select).toHaveValue('');
    expect(within(fresh).getByLabelText('Reason for this union')).toHaveValue(
      '',
    );
    for (const checkbox of within(fresh).getAllByRole('checkbox'))
      expect(checkbox).not.toBeChecked();
    await act(async () => {
      if (!release) throw new Error('Expected pending confirmation');
      release(
        response(
          {
            outcome: 'united',
            canonicalClientId: second.id,
            projectionReference: 'abandoned',
          },
          201,
        ),
      );
    });
    expect(callbacks.onChanged).not.toHaveBeenCalled();
    expect(screen.queryByText(/Union confirmed\./)).not.toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Confirm union' })).toBe(fresh);
  });

  it.each([403, 404, 409])(
    'clears comparison after safe refusal %s and requires a fresh review',
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(response(comparison, 201))
        .mockResolvedValueOnce(response({}, status))
        .mockResolvedValue(response({ activeCompany: { id: 'company-a' } }));
      vi.stubGlobal('fetch', fetcher);
      render(<ClientUnionPanel {...props()} />);
      fireEvent.submit(await completeComparison());
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This operation is unavailable.',
      );
      expect(
        screen.queryByRole('form', { name: 'Confirm union' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Dana')).not.toBeInTheDocument();
      const calls = fetcher.mock.calls.length;
      expect(
        screen.getByRole('button', { name: 'Review existing duplicates' }),
      ).toBeEnabled();
      expect(fetcher).toHaveBeenCalledTimes(calls);
    },
  );

  it('keeps a confirmed union separate from a rejected refresh callback', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response(comparison, 201))
        .mockResolvedValueOnce(
          response(
            {
              outcome: 'united',
              canonicalClientId: first.id,
              projectionReference: 'projection-a',
            },
            201,
          ),
        ),
    );
    render(
      <ClientUnionPanel
        {...props()}
        onChanged={async () => {
          throw new Error('Refresh unavailable');
        }}
      />,
    );
    fireEvent.submit(await completeComparison());
    expect(await screen.findByText(/Union confirmed\./)).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The command was confirmed, but a subsequent refresh failed.',
    );
    expect(
      screen.queryByText(
        'The request could not be completed. You can retry safely.',
      ),
    ).not.toBeInTheDocument();
  });

  it('does not revive feedback when a refresh fails after Close review', async () => {
    let rejectRefresh: ((reason: Error) => void) | undefined;
    const refresh = new Promise<void>((_, reject) => {
      rejectRefresh = reject;
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response(comparison, 201))
        .mockResolvedValueOnce(
          response(
            {
              outcome: 'united',
              canonicalClientId: first.id,
              projectionReference: 'projection-a',
            },
            201,
          ),
        ),
    );
    render(<ClientUnionPanel {...props()} onChanged={() => refresh} />);
    fireEvent.submit(await completeComparison());
    await screen.findByText(/Union confirmed\./);
    fireEvent.click(screen.getByRole('button', { name: 'Close review' }));
    await act(async () => {
      if (!rejectRefresh) throw new Error('Expected pending refresh');
      rejectRefresh(new Error('Late refresh error'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Union confirmed\./)).not.toBeInTheDocument();
  });
});
