import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
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
    fireEvent.change(select, { target: { value: first.id } });
  fireEvent.change(within(form).getByLabelText('Reason for this union'), {
    target: { value: 'Same verified legal identity.' },
  });
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
    expect(callbacks.onChanged).toHaveBeenCalledWith(first.id);
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
    const reversal = screen.getByRole('form', { name: 'Reverse union' });
    fireEvent.change(within(reversal).getByLabelText('Reason for reversal'), {
      target: { value: 'Restore the separate dossiers.' },
    });
    fireEvent.click(within(reversal).getByRole('checkbox'));
    fireEvent.submit(reversal);
    expect(await screen.findByText(/Union reversed\./)).toBeVisible();
    expect(callbacks.onChanged).toHaveBeenCalledTimes(2);
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
    expect(
      await screen.findByText('Authorized resolver confirmed a Client union'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'View authorized union details' }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('time')).toBeNull();
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
    fireEvent.change(address, { target: { value: second.id } });
    expect(address).toHaveAccessibleDescription(
      'Value to retain from Source 2 Chisinau',
    );
    fireEvent.change(address, { target: { value: first.id } });
    expect(address).toHaveAccessibleDescription(
      'Value to retain from Source 1 Not provided',
    );
    expect(within(form).queryByText('Chisinau')).not.toBeInTheDocument();
    fireEvent.change(address, { target: { value: '' } });
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
      fireEvent.change(select, { target: { value: first.id } });
    }
    fireEvent.submit(form);
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.change(within(form).getByLabelText('Reason for this union'), {
      target: { value: ' '.repeat(20) },
    });
    fireEvent.submit(form);
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.change(within(form).getByLabelText('Reason for this union'), {
      target: { value: 'Verified reason.' },
    });
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
    fireEvent.change(within(form).getByLabelText('Reason for this union'), {
      target: { value: 'A changed verified reason.' },
    });
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
