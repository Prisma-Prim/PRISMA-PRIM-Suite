import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { OfferPanel } from './OfferPanel';

const identity = deterministicBrowserIdentity({
  'x-test-external-subject': 'offer-preparer',
});

afterEach(() => vi.restoreAllMocks());

describe('OfferPanel', () => {
  it('shows loading and then the explicit empty Snapshot state', async () => {
    let release: ((value: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes('/offers/opportunities/'))
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      if (url.includes('/pricing/opportunities/'))
        return response({ items: [] });
      if (url.includes('/legal-entities'))
        return response({ clientVersion: 1, legalEntities: [] });
      throw new Error(`Unexpected request ${url}`);
    });
    renderPanel(actor('company-one'));
    expect(screen.getByText('Loading Offer…')).toBeVisible();
    await waitFor(() => expect(release).toBeTypeOf('function'));
    release?.(response({ offer: null }));
    expect(
      await screen.findByText(
        'Save an illustrative Pricing Snapshot before preparing an Offer.',
      ),
    ).toBeVisible();
  });

  it('loads the explicit empty state, creates PRIMARY with one stable command and shows version 1', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input.toString();
      requests.push({ url, init });
      if (url.includes('/offers/opportunities/') && init?.method === 'POST')
        return response(offerView());
      if (url.includes('/offers/opportunities/'))
        return response({ offer: null });
      if (url.includes('/pricing/opportunities/'))
        return response({ items: [snapshot()] });
      if (url.includes('/legal-entities'))
        return response({
          clientVersion: 1,
          legalEntities: [
            {
              id: 'entity-one',
              legalName: 'Additional Entity',
              taxId: null,
              legalAddress: null,
              createdAt: '2026-09-27T08:00:00.000Z',
            },
          ],
        });
      throw new Error(`Unexpected request ${url}`);
    });

    renderPanel(actor('company-one'));
    expect(
      await screen.findByRole('button', { name: 'Prepare version 1' }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare version 1' }));

    expect(
      await screen.findByText('Illustrative and provisional'),
    ).toBeVisible();
    expect(
      screen.getByText('Pending · not transmitted · no Client response'),
    ).toBeVisible();
    expect(screen.getByText('Primary Client')).toBeVisible();
    const post = requests.find((request) => request.init?.method === 'POST');
    expect(post?.init?.body).toBe(
      JSON.stringify({
        pricingSnapshotId: 'snapshot-one',
        recipient: { kind: 'PRIMARY' },
        validityDays: 30,
        scopeNote: null,
        commercialConditions: null,
      }),
    );
    expect(
      new Headers(post?.init?.headers).get('idempotency-key'),
    ).toBeTruthy();
  });

  it('shows the exact provisional representation outside the current Offer states', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({ offer: offerView() }),
    );

    renderPanel(actor('company-one'));

    expect(await screen.findByText('Draft — not approved')).toBeVisible();
    expect(screen.getByText('OFFER_ILLUSTRATIVE v1')).toBeVisible();
    expect(
      screen.getByText(
        '1161a98c95f65605a37e3c82383cd044335e9be41e00ce8a8559dd553db0c865',
      ),
    ).toBeVisible();
    expect(
      screen.getByText('Pending · not transmitted · no Client response'),
    ).toBeVisible();
    const representation = screen.getByTitle(
      'Illustrative Offer representation',
    );
    expect(representation).toHaveAttribute('sandbox', '');
    expect(representation).toHaveAttribute(
      'srcdoc',
      '<!doctype html><html lang="en"><body><h1>Illustrative Offer</h1></body></html>',
    );
  });

  it('shows unavailable when an Offer representation is malformed', async () => {
    const offer = offerView();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        offer: {
          ...offer,
          version: {
            ...offer.version,
            representation: {
              ...offer.version.representation,
              sha256: 'not-a-checksum',
            },
          },
        },
      }),
    );

    renderPanel(actor('company-one'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Offer could not be loaded. Try again.',
    );
    expect(
      screen.queryByTitle('Illustrative Offer representation'),
    ).not.toBeInTheDocument();
  });

  it('selects named Snapshots and legal recipients by keyboard after an adjusted Snapshot refusal', async () => {
    const posts: RequestInit[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input.toString();
      if (init?.method === 'POST') {
        posts.push(init);
        return posts.length === 1
          ? response({ code: 'PRICING_SNAPSHOT_ADJUSTMENT_UNSUPPORTED' }, 409)
          : response({
              ...offerView(),
              version: {
                ...offerView().version,
                pricingSnapshotId: 'ordinary',
                pricingSnapshot: {
                  ...snapshot(),
                  id: 'ordinary',
                  total: '346.72',
                },
                recipient: {
                  kind: 'ADDITIONAL',
                  legalEntityId: 'entity-one',
                  legalName: 'Additional Entity',
                  taxId: null,
                  legalAddress: null,
                },
              },
            });
      }
      if (url.includes('/pricing/opportunities/'))
        return response({
          items: [
            { ...snapshot(), id: 'adjusted', total: '337.03' },
            { ...snapshot(), id: 'ordinary', total: '346.72' },
          ],
        });
      if (url.includes('/legal-entities'))
        return response({
          clientVersion: 1,
          legalEntities: [
            {
              id: 'entity-one',
              legalName: 'Additional Entity',
              taxId: null,
              legalAddress: null,
              createdAt: '2026-09-27T08:00:00.000Z',
            },
          ],
        });
      return emptyOfferFetch(input);
    });
    renderPanel(actor('company-one'));
    await screen.findByRole('button', { name: 'Prepare version 1' });
    const snapshotSelect = screen.getByLabelText('Pricing Snapshot', {
      exact: true,
    });
    const recipient = screen.getByLabelText('Legal recipient', { exact: true });
    expect(snapshotSelect).toHaveRole('combobox');
    expect(snapshotSelect).toHaveAccessibleName('Pricing Snapshot');
    expect(recipient).toHaveRole('combobox');
    expect(recipient).toHaveAccessibleName('Legal recipient');
    fireEvent.keyDown(snapshotSelect, { key: 'Enter' });
    expect(
      screen.getByRole('listbox', { name: 'Pricing Snapshot' }),
    ).toBeVisible();
    fireEvent.keyDown(snapshotSelect, { key: 'Home' });
    fireEvent.keyDown(snapshotSelect, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare version 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The selected Pricing Snapshot contains an adjustment',
    );
    fireEvent.keyDown(snapshotSelect, { key: 'Enter' });
    fireEvent.keyDown(snapshotSelect, { key: 'End' });
    fireEvent.keyDown(snapshotSelect, { key: 'Enter' });
    expect(
      screen.getByLabelText('Pricing Snapshot', { exact: true }),
    ).toHaveAttribute('data-value', 'ordinary');
    expect(snapshotSelect).toHaveFocus();
    fireEvent.keyDown(recipient, { key: 'Enter' });
    expect(
      screen.getByRole('listbox', { name: 'Legal recipient' }),
    ).toBeVisible();
    fireEvent.keyDown(recipient, { key: 'End' });
    fireEvent.keyDown(recipient, { key: 'Enter' });
    expect(
      screen.getByLabelText('Legal recipient', { exact: true }),
    ).toHaveAttribute('data-value', 'entity-one');
    fireEvent.click(screen.getByRole('button', { name: 'Prepare version 1' }));
    await screen.findByText('Illustrative and provisional');
    expect(screen.getByText('Additional Entity')).toBeVisible();
    expect(posts).toHaveLength(2);
    expect(new Headers(posts[1]?.headers).get('idempotency-key')).not.toBe(
      new Headers(posts[0]?.headers).get('idempotency-key'),
    );
    expect(posts.map((post) => JSON.parse(String(post.body)))).toEqual([
      {
        pricingSnapshotId: 'adjusted',
        recipient: { kind: 'PRIMARY' },
        validityDays: 30,
        scopeNote: null,
        commercialConditions: null,
      },
      {
        pricingSnapshotId: 'ordinary',
        recipient: { kind: 'ADDITIONAL', legalEntityId: 'entity-one' },
        validityDays: 30,
        scopeNote: null,
        commercialConditions: null,
      },
    ]);
  });

  it('renders denied without issuing a request when Offer read is absent', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    renderPanel(actorWithOfferPermissions('company-one', []));
    expect(
      screen.getByText('Offer access is not available for this Opportunity.'),
    ).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an empty read-only state without exposing preparation', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response({ offer: null }));
    renderPanel(
      actorWithOfferPermissions('company-one', ['commercial.offer.read']),
    );
    expect(
      await screen.findByText('No Offer exists for this Opportunity.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Prepare version 1' }),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows unavailable and offers a reload after a failed read', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({}, 500));
    renderPanel(actor('company-one'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Offer could not be loaded. Try again.',
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('validates locally before sending a preparation', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(emptyOfferFetch);
    renderPanel(actor('company-one'));
    await screen.findByRole('button', { name: 'Prepare version 1' });
    fireEvent.change(screen.getByLabelText('Validity in days'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare version 1' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Check the selected Snapshot and the entered values.',
    );
    expect(fetch.mock.calls).toHaveLength(3);
  });

  it('shows a named conflict and does not offer an uncertain retry', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
      init?.method === 'POST'
        ? response({ code: 'OFFER_ALREADY_EXISTS' }, 409)
        : emptyOfferFetch(input),
    );
    renderPanel(actor('company-one'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Prepare version 1' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An Offer already exists or this retry no longer matches.',
    );
    expect(
      screen.queryByRole('button', { name: 'Retry the same preparation' }),
    ).not.toBeInTheDocument();
  });

  it('explains that an adjusted Snapshot cannot create Offer version 1', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
      init?.method === 'POST'
        ? response({ code: 'PRICING_SNAPSHOT_ADJUSTMENT_UNSUPPORTED' }, 409)
        : emptyOfferFetch(input),
    );
    renderPanel(actor('company-one'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Prepare version 1' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The selected Pricing Snapshot contains an adjustment and cannot be used for Offer version 1.',
    );
    expect(
      screen.queryByRole('button', { name: 'Retry the same preparation' }),
    ).not.toBeInTheDocument();
  });

  it('shows unavailable after a definite not-found without calling it an uncertain outcome', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
      init?.method === 'POST' ? response({}, 404) : emptyOfferFetch(input),
    );
    renderPanel(actor('company-one'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Prepare version 1' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Opportunity, Snapshot or recipient is no longer available.',
    );
    expect(
      screen.queryByRole('button', { name: 'Retry the same preparation' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Validity in days')).toBeEnabled();
  });

  it('preserves the exact payload and key for an uncertain retry', async () => {
    const posts: RequestInit[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST') {
        posts.push(init);
        return response({}, 500);
      }
      return emptyOfferFetch(input);
    });
    renderPanel(actor('company-one'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Prepare version 1' }),
    );
    const retry = await screen.findByRole('button', {
      name: 'Retry the same preparation',
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The outcome is uncertain.',
    );
    expect(screen.getByLabelText('Validity in days')).toBeDisabled();
    fireEvent.click(retry);
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]?.body).toBe(posts[0]?.body);
    expect(new Headers(posts[1]?.headers).get('idempotency-key')).toBe(
      new Headers(posts[0]?.headers).get('idempotency-key'),
    );
  });

  it('never renders a late Offer reply from the previous Company', async () => {
    let release: ((value: Response) => void) | undefined;
    const oldReply = new Promise<Response>((resolve) => {
      release = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes('old-opportunity')) return oldReply;
      if (url.includes('new-opportunity'))
        return response({ offer: offerView('New Company') });
      throw new Error(`Unexpected request ${url}`);
    });
    const rendered = renderPanel(actor('company-old'), 'old-opportunity');
    rendered.rerender(panel(actor('company-new'), 'new-opportunity'));
    expect(await screen.findByText('New Company')).toBeVisible();
    release?.(response({ offer: offerView('Old Company') }));
    await waitFor(() =>
      expect(screen.queryByText('Old Company')).not.toBeInTheDocument(),
    );
  });

  it('never renders a late Offer reply after read permission is removed', async () => {
    let release: ((value: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const current = actor('company-one');
    const rendered = renderPanel(current);
    await waitFor(() => expect(release).toBeTypeOf('function'));

    rendered.rerender(
      panel(actorWithOfferPermissions('company-one', []), 'opportunity-one'),
    );
    expect(
      await screen.findByText(
        'Offer access is not available for this Opportunity.',
      ),
    ).toBeVisible();
    release?.(response({ offer: offerView('Revoked reply') }));
    await waitFor(() =>
      expect(screen.queryByText('Revoked reply')).not.toBeInTheDocument(),
    );
  });

  it('never renders a late Offer reply from the previous identity', async () => {
    let release: ((value: Response) => void) | undefined;
    let requestNumber = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      requestNumber += 1;
      if (requestNumber === 1)
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return Promise.resolve(response({ offer: offerView('New identity') }));
    });
    const rendered = renderPanel(actor('company-one'));
    await waitFor(() => expect(release).toBeTypeOf('function'));
    const nextIdentity = deterministicBrowserIdentity({
      'x-test-external-subject': 'replacement-offer-reader',
    });

    rendered.rerender(
      panel(actor('company-one'), 'opportunity-one', nextIdentity),
    );
    expect(await screen.findByText('New identity')).toBeVisible();
    release?.(response({ offer: offerView('Old identity') }));
    await waitFor(() =>
      expect(screen.queryByText('Old identity')).not.toBeInTheDocument(),
    );
  });
});

function renderPanel(
  currentActor: ActorContext,
  opportunityId = 'opportunity-one',
) {
  return render(panel(currentActor, opportunityId));
}

function panel(
  currentActor: ActorContext,
  opportunityId: string,
  currentIdentity = identity,
) {
  return (
    <OfferPanel
      actor={currentActor}
      identity={currentIdentity}
      opportunityId={opportunityId}
      currentClientId="client-one"
      clientDisplayName="Primary Client"
      onCompanyContextRejected={() => undefined}
    />
  );
}

function actor(companyId: string): ActorContext {
  return {
    internalUserId: 'user-one',
    workspaceMembershipId: 'member-one',
    workspaceId: 'workspace-one',
    workspaceName: 'Workspace',
    displayName: 'Preparer',
    email: 'preparer@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      id: companyId,
      displayName: companyId,
      offerPermissions: [
        'commercial.offer.read',
        'commercial.offer.prepare',
        'commercial.offer.transmission.record',
        'commercial.pricing.snapshot.read',
      ],
      offerPermissionAssignmentId: `assignment-${companyId}`,
      offerPermissionSetVersion: 'v1',
    },
  };
}

function actorWithOfferPermissions(
  companyId: string,
  offerPermissions: NonNullable<
    NonNullable<ActorContext['activeCompany']>['offerPermissions']
  >,
): ActorContext {
  const current = actor(companyId);
  if (!current.activeCompany) throw new Error('Expected an active Company.');
  return {
    ...current,
    activeCompany: { ...current.activeCompany, offerPermissions },
  };
}

function snapshot() {
  return {
    id: 'snapshot-one',
    currency: 'EUR',
    total: '345.00',
    committedAt: '2026-09-27T09:00:00.000Z',
  };
}

function offerView(company = 'Illustrative Company') {
  return {
    id: 'offer-one',
    illustrativeReference: 1,
    revision: 1,
    version: {
      versionNumber: 1,
      pricingSnapshotId: 'snapshot-one',
      pricingSnapshot: snapshot(),
      recipient: {
        kind: 'PRIMARY',
        legalName: 'Primary Client',
        taxId: null,
        legalAddress: null,
      },
      issuingCompanyLabel: company,
      validityDays: 30,
      validUntil: '2026-10-27T09:00:00.000Z',
      scopeNote: null,
      commercialConditions: null,
      decisionState: 'PENDING',
      transmissionState: 'NOT_TRANSMITTED',
      clientResponseState: 'NONE',
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      representation: {
        templateCode: 'OFFER_ILLUSTRATIVE',
        templateVersion: 1,
        html: '<!doctype html><html lang="en"><body><h1>Illustrative Offer</h1></body></html>',
        sha256:
          '1161a98c95f65605a37e3c82383cd044335e9be41e00ce8a8559dd553db0c865',
      },
    },
  };
}

async function emptyOfferFetch(input: RequestInfo | URL): Promise<Response> {
  const url = input.toString();
  if (url.includes('/offers/opportunities/')) return response({ offer: null });
  if (url.includes('/pricing/opportunities/'))
    return response({ items: [snapshot()] });
  if (url.includes('/legal-entities'))
    return response({ clientVersion: 1, legalEntities: [] });
  throw new Error(`Unexpected request ${url}`);
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
