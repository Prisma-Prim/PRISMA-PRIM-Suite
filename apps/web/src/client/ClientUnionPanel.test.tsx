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
});
