import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import { ClientUnionPanel } from './ClientUnionPanel';

const clients = [
  { id: 'client-a', displayName: 'Exemplu SRL' },
  { id: 'client-b', displayName: 'EXEMPLU S.R.L.' },
];

const comparison = {
  outcome: 'comparison',
  comparison_reference: 'comparison-1',
  normalizedIdentifier: '1010101010101',
  clients: [
    {
      id: 'client-a',
      displayName: 'Exemplu SRL',
      taxId: '1010101010101',
      address: 'Chisinau',
      telephone: null,
      generalEmail: null,
      businessActivity: null,
      contacts: [{ name: 'Ana Pop' }],
      version: 1,
      relatedToActiveCompany: true,
      involvedCompanyDisplayNames: ['PRISMA-PRIM'],
      unitedWithClientAccountId: null,
      contactSources: [{ clientAccountId: 'client-a', index: 0 }],
    },
    {
      id: 'client-b',
      displayName: 'EXEMPLU S.R.L.',
      taxId: '1010101010101',
      address: 'Chisinau',
      telephone: null,
      generalEmail: null,
      businessActivity: null,
      contacts: [{ name: 'Ion Rusu' }],
      version: 1,
      relatedToActiveCompany: true,
      involvedCompanyDisplayNames: ['PRISMA-PRIM'],
      unitedWithClientAccountId: null,
      contactSources: [{ clientAccountId: 'client-b', index: 0 }],
    },
  ],
  affectedCompanies: [{ id: 'company-a', displayName: 'PRISMA-PRIM' }],
  differingFields: ['displayName'],
};

const confirmedOperation = {
  unionOperationId: 'operation-1',
  status: 'confirmed',
  canonicalClientAccountId: 'client-a',
  supersededClientAccountId: 'client-b',
  normalizedIdentifier: '1010101010101',
  affectedCompanyIds: ['company-a'],
  unionReason: 'Same registered tax identifier.',
  reversalReason: null,
  confirmedAt: '2026-09-12T10:00:00.000Z',
  confirmedByInternalUserId: 'resolver-1',
  reversedAt: null,
  reversedByInternalUserId: null,
  snapshots: [
    {
      role: 'canonical',
      clientAccountId: 'client-a',
      contacts: [{ name: 'Ana Pop' }],
    },
    {
      role: 'superseded',
      clientAccountId: 'client-b',
      contacts: [{ name: 'Ion Rusu' }],
    },
  ],
};

function renderPanel() {
  render(
    <ClientUnionPanel
      companyContextId="company-a"
      identity={deterministicBrowserIdentity()}
      clients={clients}
      onCompanyContextRejected={vi.fn()}
      onActivityRecorded={vi.fn(async () => undefined)}
      onClientsChanged={vi.fn(async () => undefined)}
    />,
  );
}

function selectBothClients() {
  fireEvent.change(screen.getByLabelText('Client 1 to compare'), {
    target: { value: 'client-a' },
  });
  fireEvent.change(screen.getByLabelText('Client 2 to compare'), {
    target: { value: 'client-b' },
  });
}

async function compareAndConfirmDifference() {
  selectBothClients();
  fireEvent.click(screen.getByRole('button', { name: 'Compare dossiers' }));
  await screen.findByText('Review both dossiers before uniting');
  fireEvent.click(
    screen.getByLabelText('Keep the Client display name of Exemplu SRL'),
  );
  fireEvent.click(screen.getByLabelText('PRISMA-PRIM'));
  fireEvent.change(screen.getByLabelText('Written reason for the union'), {
    target: { value: 'Same registered tax identifier.' },
  });
}

describe('ClientUnionPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('compares two dossiers, unites them and reverses the union', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(comparison), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(confirmedOperation), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...confirmedOperation, status: 'reversed' }),
          { status: 201 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    await compareAndConfirmDifference();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm union' }));
    await screen.findByText(
      'The dossiers are united. Both originals remain preserved and the union is reversible.',
    );
    expect(
      screen.getByText('2 Contacts are preserved on the canonical dossier.'),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Written reason for the reversal'), {
      target: { value: 'The dossiers are distinct branches.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reverse union' }));
    await screen.findByText(
      'The union is reversed. Both original dossiers are readable again.',
    );

    const unionRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(unionRequest.body))).toMatchObject({
      comparisonReference: 'comparison-1',
      canonicalClientAccountId: 'client-a',
      fieldSelections: { displayName: 'client-a' },
      confirmedCompanyIds: ['company-a'],
    });
  });

  it('requires every differing field to be reviewed before uniting', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(comparison), { status: 201 }),
        ),
    );
    renderPanel();

    selectBothClients();
    fireEvent.click(screen.getByRole('button', { name: 'Compare dossiers' }));
    await screen.findByText('Review both dossiers before uniting');
    fireEvent.click(screen.getByLabelText('PRISMA-PRIM'));
    fireEvent.change(screen.getByLabelText('Written reason for the union'), {
      target: { value: 'Same registered tax identifier.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm union' }));

    expect(
      await screen.findByText(
        'Review every differing field before confirming the union.',
      ),
    ).toBeTruthy();
  });

  it('reports the remediation outcome without comparison data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            outcome: 'multiple_duplicate_candidates_require_data_remediation',
          }),
          { status: 201 },
        ),
      ),
    );
    renderPanel();

    selectBothClients();
    fireEvent.click(screen.getByRole('button', { name: 'Compare dossiers' }));

    expect(
      await screen.findByText(
        'Three or more Clients share this identifier. Data remediation is required before any union.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText('Review both dossiers before uniting'),
    ).toBeNull();
  });

  it('keeps the comparison open and states why a blocked union changed nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(comparison), { status: 201 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              statusCode: 409,
              error: 'Conflict',
              code: 'client_union_contact_capacity_exceeded',
            }),
            { status: 409 },
          ),
        ),
    );
    renderPanel();

    await compareAndConfirmDifference();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm union' }));

    expect(
      await screen.findByText(
        'The united dossier would exceed the Contact limit. No dossier was changed.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Review both dossiers before uniting'),
    ).toBeTruthy();
  });

  it('reports a stale comparison without uniting', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(comparison), { status: 201 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              statusCode: 409,
              error: 'Conflict',
              code: 'client_union_comparison_stale',
            }),
            { status: 409 },
          ),
        ),
    );
    renderPanel();

    await compareAndConfirmDifference();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm union' }));

    expect(
      await screen.findByText(
        'The dossiers changed since this comparison. Compare them again before uniting.',
      ),
    ).toBeTruthy();
  });

  it('states that unavailable dossiers cannot be compared', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );
    renderPanel();

    selectBothClients();
    fireEvent.click(screen.getByRole('button', { name: 'Compare dossiers' }));

    expect(
      await screen.findByText(
        'These dossiers cannot be compared. They may not share one exact identifier, may already be united, or may be outside your complete current authority.',
      ),
    ).toBeTruthy();
  });

  it('refuses to compare one Client with itself without calling the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    fireEvent.change(screen.getByLabelText('Client 1 to compare'), {
      target: { value: 'client-a' },
    });
    fireEvent.change(screen.getByLabelText('Client 2 to compare'), {
      target: { value: 'client-a' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Compare dossiers' }));

    await waitFor(() =>
      expect(
        screen.getByText('Select two different Clients to compare.'),
      ).toBeTruthy(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
