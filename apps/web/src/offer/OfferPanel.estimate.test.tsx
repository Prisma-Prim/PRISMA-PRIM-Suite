import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
import {
  profitabilityActor,
  syntheticVersion,
} from '../profitability-estimate/profitability.fixture';
import { OfferPanel } from './OfferPanel';
import { internalOfferFixture } from './offer-estimate.fixture';

const identity = deterministicBrowserIdentity({
  'x-test-external-subject': 'synthetic-preparer',
});
const actor: ActorContext = {
  ...profitabilityActor,
  activeCompany: {
    ...profitabilityActor.activeCompany,
    id: 'company-1',
    displayName: 'Synthetic Company',
    clientPermissions: ['client.read'],
    offerPermissionAssignmentId: 'preparer-2',
    offerPermissionSetVersion: 'v2',
    offerPermissions: [
      'commercial.offer.read',
      'commercial.offer.prepare',
      'commercial.offer.estimate.prepare',
    ],
  },
};
function panel(current = actor, currentIdentity = identity) {
  return (
    <InterfaceLocaleProvider>
      <OfferPanel
        actor={current}
        identity={currentIdentity}
        opportunityId="opportunity-1"
        currentClientId="client-1"
        clientDisplayName="Synthetic Client"
        onCompanyContextRejected={() => undefined}
      />
    </InterfaceLocaleProvider>
  );
}
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
beforeEach(() => window.localStorage.setItem(interfaceLocaleStorageKey, 'en'));
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('Approved-estimate Offer journey', () => {
  it('requires deliberate source selection and retains the identical literal command after lost confirmation', async () => {
    const source = internalOfferFixture().version.priceSource;
    const version = {
      ...syntheticVersion(),
      id: source.estimateVersionId,
      estimateId: source.estimateId,
      decision: {
        id: source.approvalDecisionId,
        code: 'APPROVE',
        decidedByWorkspaceMembershipId: 'director-1',
        decidedAt: source.approvedAt,
      },
    };
    const attempts: { body: unknown; key: string | null }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = input.toString();
      if (init?.method === 'POST') {
        attempts.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return attempts.length === 1
          ? response({}, 503)
          : response(
              {
                ...internalOfferFixture(),
                version: {
                  ...internalOfferFixture().version,
                  scopeNote: '  Literal scope  ',
                },
              },
              201,
            );
      }
      if (path.includes('/profitability-estimates'))
        return response({ items: [version], latestVersionNumber: 1 });
      if (path.includes('/snapshots'))
        return response({ items: [], nextCursor: null });
      if (path.endsWith('/legal-entities'))
        return response({ clientVersion: 1, legalEntities: [] });
      if (path.endsWith('/versions'))
        return response({ versions: [], nextCursor: null });
      return response({ offer: null });
    });
    render(panel());
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Prepare from an approved estimate',
      }),
    );
    const select = await screen.findByLabelText('Approved estimate version');
    expect(
      screen.getByRole('button', { name: 'Create internal draft' }),
    ).toBeDisabled();
    fireEvent.change(select, { target: { value: source.estimateVersionId } });
    fireEvent.change(screen.getByLabelText('Scope note'), {
      target: { value: '  Literal scope  ' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create internal draft' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Retry identical preparation',
      }),
    );
    await waitFor(() =>
      expect(document.querySelector('.offer-summary strong')).toHaveTextContent(
        'Internal draft · tax treatment unspecified',
      ),
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(JSON.parse(String(attempts[0]?.body))).toMatchObject({
      estimateVersionId: source.estimateVersionId,
      estimateVersionNumber: 1,
      scopeNote: '  Literal scope  ',
    });
    expect(
      screen.queryByRole('button', { name: 'Approve this version' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTitle(/representation/i)).not.toBeInTheDocument();
  });
});

function approvedHistory() {
  const source = internalOfferFixture().version.priceSource;
  return {
    items: [
      {
        ...syntheticVersion(),
        id: source.estimateVersionId,
        estimateId: source.estimateId,
        decision: {
          id: source.approvalDecisionId,
          code: 'APPROVE',
          decidedByWorkspaceMembershipId: 'director-1',
          decidedAt: source.approvedAt,
        },
      },
    ],
    latestVersionNumber: 1,
  };
}
function installPreparationApi(
  post: () => Response | Promise<Response>,
  source: () => Response | Promise<Response> = () =>
    response(approvedHistory()),
) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const path = input.toString();
      if (init?.method === 'POST') return post();
      if (path.includes('/profitability-estimates')) return source();
      if (path.includes('/snapshots'))
        return response({ items: [], nextCursor: null });
      if (path.endsWith('/legal-entities'))
        return response({ clientVersion: 1, legalEntities: [] });
      if (path.endsWith('/versions'))
        return response({ versions: [], nextCursor: null });
      return response({ offer: null });
    });
}
async function fillInternalDraft() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Prepare from an approved estimate',
    }),
  );
  const source = await screen.findByLabelText('Approved estimate version');
  await waitFor(() =>
    expect(
      screen.getByRole('option', { name: /125.00 EUR/u }),
    ).toBeInTheDocument(),
  );
  fireEvent.change(source, {
    target: {
      value: internalOfferFixture().version.priceSource.estimateVersionId,
    },
  });
  fireEvent.change(screen.getByLabelText('Scope note'), {
    target: { value: '  Retained literal draft  ' },
  });
}

it.each([400, 404, 409])(
  'retains literal input after a correctable %s command refusal',
  async (status) => {
    installPreparationApi(() =>
      response(
        { code: status === 409 ? 'STALE_OFFER_REVISION' : 'UNAVAILABLE' },
        status,
      ),
    );
    render(panel());
    await fillInternalDraft();
    fireEvent.click(
      screen.getByRole('button', { name: 'Create internal draft' }),
    );
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Scope note')).toHaveValue(
      '  Retained literal draft  ',
    );
    expect(
      screen.getByRole('button', { name: 'Create internal draft' }),
    ).toBeEnabled();
    expect(document.querySelector('.offer-summary')).toBeNull();
  },
);

it.each(['amount', 'scope', 'foreign', 'binding'])(
  'keeps an uncertain command after a malformed %s success instead of claiming creation',
  async (defect) => {
    const saved = internalOfferFixture();
    installPreparationApi(() =>
      response(
        {
          ...saved,
          companyId: defect === 'foreign' ? 'other-company' : saved.companyId,
          version: {
            ...saved.version,
            scopeNote:
              defect === 'scope'
                ? 'Changed by malformed response'
                : '  Retained literal draft  ',
            priceSource: {
              ...saved.version.priceSource,
              amount: defect === 'amount' ? '150.00' : '125.00',
            },
            ...(defect === 'binding' ? { representation: {} } : {}),
          },
        },
        201,
      ),
    );
    render(panel());
    await fillInternalDraft();
    fireEvent.click(
      screen.getByRole('button', { name: 'Create internal draft' }),
    );
    await screen.findByRole('button', { name: 'Retry identical preparation' });
    expect(screen.getByLabelText('Scope note')).toHaveValue(
      '  Retained literal draft  ',
    );
    expect(screen.getByLabelText('Scope note')).toBeDisabled();
    expect(document.querySelector('.offer-summary')).toBeNull();
  },
);

it.each(['identity', 'company', 'authority'])(
  'retires choices and ignores a late protected reply on %s replacement',
  async (change) => {
    let release: ((value: Response) => void) | undefined;
    installPreparationApi(
      () => response({}, 503),
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const rendered = render(panel());
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Prepare from an approved estimate',
      }),
    );
    await waitFor(() => expect(release).toBeDefined());
    const replacement: ActorContext =
      change === 'identity'
        ? actor
        : {
            ...actor,
            activeCompany: {
              ...actor.activeCompany,
              id: change === 'company' ? 'company-2' : 'company-1',
              displayName: 'Replacement Company',
              ...(change === 'authority'
                ? {
                    offerPermissions: ['commercial.offer.read'],
                    offerPermissionAssignmentId: undefined,
                    offerPermissionSetVersion: undefined,
                  }
                : {}),
            },
          };
    rendered.rerender(
      panel(
        replacement,
        change === 'identity'
          ? deterministicBrowserIdentity({
              'x-test-external-subject': 'new-session',
            })
          : identity,
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Approved estimate version'),
      ).not.toBeInTheDocument(),
    );
    release?.(response(approvedHistory()));
    await waitFor(() =>
      expect(
        screen.queryByRole('option', { name: /125.00 EUR/u }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByText('Synthetic internal travel'),
    ).not.toBeInTheDocument();
  },
);

it('reopens price-only content without requesting economic history or source details', async () => {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = input.toString();
    calls.push(path);
    return path.endsWith('/versions')
      ? response({ versions: [], nextCursor: null })
      : response({ offer: internalOfferFixture() });
  });
  const reader: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: 'company-1',
      displayName: 'Synthetic Company',
      offerPermissions: ['commercial.offer.read'],
      offerPermissionAssignmentId: undefined,
      offerPermissionSetVersion: undefined,
      profitabilityContributorPermissions: undefined,
      profitabilityContributorPermissionAssignmentId: undefined,
      profitabilityContributorPermissionSetVersion: undefined,
    },
  };
  render(panel(reader));
  await screen.findByText('Approved proposed amount');
  expect(
    screen.queryByRole('button', { name: 'Open the exact source estimate' }),
  ).not.toBeInTheDocument();
  expect(calls.some((path) => path.includes('profitability-estimates'))).toBe(
    false,
  );
});

it.each(['Prepare a new version', 'Open version 1'])(
  'keeps the exact uncertain successor when the sibling %s action is attempted',
  async (sibling) => {
    const initial = internalOfferFixture();
    const head = {
      ...initial,
      revision: 2,
      version: {
        ...initial.version,
        id: '00000000-0000-4000-8000-000000000105',
        versionNumber: 2,
        predecessorVersionId: initial.version.id,
      },
    };
    const source = initial.version.priceSource;
    const approved = {
      ...syntheticVersion(),
      id: source.estimateVersionId,
      estimateId: source.estimateId,
      decision: {
        id: source.approvalDecisionId,
        code: 'APPROVE',
        decidedByWorkspaceMembershipId: 'director-1',
        decidedAt: source.approvedAt,
      },
    };
    const attempts: { body: unknown; key: string | null }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = input.toString();
      if (init?.method === 'POST') {
        attempts.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return attempts.length === 1
          ? response({}, 503)
          : response(
              {
                ...head,
                revision: 3,
                version: {
                  ...head.version,
                  id: '00000000-0000-4000-8000-000000000106',
                  versionNumber: 3,
                  predecessorVersionId: head.version.id,
                  scopeNote: '  Exact successor  ',
                },
              },
              201,
            );
      }
      if (path.includes('/profitability-estimates'))
        return response({ items: [approved], latestVersionNumber: 1 });
      if (path.endsWith('/legal-entities'))
        return response({ clientVersion: 1, legalEntities: [] });
      if (path.endsWith('/snapshots?limit=25'))
        return response({ items: [], nextCursor: null });
      if (path.endsWith('/versions'))
        return response({
          versions: [
            head.version,
            {
              ...initial.version,
              createdAt: '2026-10-24T09:00:00.000Z',
              supersededByVersionId: head.version.id,
            },
          ].map((v) => ({ ...v, createdAt: '2026-10-24T09:00:00.000Z' })),
          nextCursor: null,
        });
      return response({ offer: head });
    });
    render(panel());
    await screen.findByRole('button', { name: 'Open version 1' });
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Prepare from an approved estimate',
      }),
    );
    fireEvent.change(
      await screen.findByLabelText('Approved estimate version'),
      { target: { value: source.estimateVersionId } },
    );
    fireEvent.change(screen.getByLabelText('Scope note'), {
      target: { value: '  Exact successor  ' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create internal draft' }),
    );
    await screen.findByRole('button', { name: 'Retry identical preparation' });
    const action = screen.getByRole('button', { name: sibling });
    expect(action).toBeDisabled();
    fireEvent.click(action);
    expect(screen.getByLabelText('Scope note')).toHaveValue(
      '  Exact successor  ',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry identical preparation' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Retry identical preparation' }),
      ).not.toBeInTheDocument(),
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Prepare a new version' }),
      ).toBeEnabled(),
    );
  },
);

it('reopens the recorded internal rejection reason, deciding membership and instant', async () => {
  const initial = internalOfferFixture();
  const rejection = {
    id: '00000000-0000-4000-8000-000000000108',
    offerVersionId: initial.version.id,
    offerRevision: 2,
    state: 'REJECTED',
    reason: 'Correct the contractual scope',
    actorWorkspaceMembershipId: '00000000-0000-4000-8000-000000000109',
    decidedAt: '2026-10-24T09:00:00.000Z',
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
    input.toString().endsWith('/versions')
      ? response({ versions: [], nextCursor: null })
      : response({
          offer: {
            ...initial,
            revision: 2,
            version: {
              ...initial.version,
              decisionState: 'REJECTED',
              decision: rejection,
            },
          },
        }),
  );
  render(panel());
  await screen.findByText('Correct the contractual scope');
  expect(
    screen.getByText(rejection.actorWorkspaceMembershipId),
  ).toBeInTheDocument();
  const instant = screen.getByText('Decided at').nextElementSibling;
  expect(instant?.textContent).toContain('Oct 24, 2026');
  expect(
    screen.queryByRole('button', { name: 'Approve this version' }),
  ).not.toBeInTheDocument();
});

it.each(['pending', 'uncertain'])(
  'keeps the literal Snapshot command instead of switching sources while %s',
  async (state) => {
    let releaseFirst: ((value: Response) => void) | undefined;
    const attempts: { body: unknown; key: string | null }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST') {
        attempts.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        if (attempts.length === 1)
          return new Promise<Response>((resolve) => {
            releaseFirst = resolve;
          });
        return response({}, 503);
      }
      const path = input.toString();
      if (path.includes('/snapshots'))
        return response({
          items: [
            {
              id: 'snapshot-1',
              currency: 'EUR',
              total: '125.00',
              committedAt: '2026-10-24T09:00:00.000Z',
            },
          ],
          nextCursor: null,
        });
      if (path.endsWith('/legal-entities'))
        return response({ clientVersion: 1, legalEntities: [] });
      return response({ offer: null });
    });
    render(panel());
    const submit = await screen.findByRole('button', {
      name: 'Prepare version 1',
    });
    expect(
      screen.getByRole('button', { name: 'Prepare from an approved estimate' }),
    ).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Scope note'), {
      target: { value: '  Literal Snapshot command  ' },
    });
    fireEvent.click(submit);
    await waitFor(() => expect(releaseFirst).toBeDefined());
    if (state === 'uncertain')
      await act(async () => {
        releaseFirst?.(response({}, 503));
      });
    expect(
      screen.queryByRole('button', {
        name: 'Prepare from an approved estimate',
      }),
    ).not.toBeInTheDocument();
    if (state === 'pending')
      await act(async () => {
        releaseFirst?.(response({}, 503));
      });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry the same preparation' }),
    );
    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(attempts[1]).toEqual(attempts[0]);
    expect(screen.getByLabelText('Scope note')).toHaveValue(
      '  Literal Snapshot command  ',
    );
    expect(screen.getByLabelText('Scope note')).toBeDisabled();
  },
);
