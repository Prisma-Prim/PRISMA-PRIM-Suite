import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
import { OfferPanel } from './OfferPanel';
import {
  MODEL_OFFER_COMPANY,
  MODEL_OFFER_OPPORTUNITY,
  modelOfferActor,
  modelOfferEconomicFixture,
  modelOfferFixture,
  selectedModelFixture,
} from './model-offer.fixture';
import { readOffer } from './offer-response';

const identity = deterministicBrowserIdentity({
  'x-test-external-subject': 'synthetic-model-preparer',
});
function panel(actor = modelOfferActor, browserIdentity = identity) {
  return (
    <InterfaceLocaleProvider>
      <OfferPanel
        actor={actor}
        identity={browserIdentity}
        opportunityId={MODEL_OFFER_OPPORTUNITY}
        currentClientId="client-1"
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

describe('Full approved-model Offer journey', () => {
  it.each(['identity', 'company', 'authority'] as const)(
    'retires a submitted model declaration and ignores its late success on %s replacement',
    async (change) => {
      let release: ((value: Response) => void) | undefined;
      const attempts: unknown[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const path = input.toString();
        if (init?.method === 'POST') {
          attempts.push(init.body);
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        }
        if (path.endsWith('/for-offer'))
          return response({ selection: selectedModelFixture });
        if (path.includes('/profitability-estimates'))
          return response({
            items: [modelOfferEconomicFixture()],
            latestVersionNumber: 1,
          });
        if (path.includes('/snapshots'))
          return response({ items: [], nextCursor: null });
        if (path.endsWith('/legal-entities'))
          return response({ clientVersion: 1, legalEntities: [] });
        if (path.endsWith('/versions'))
          return response({ versions: [], nextCursor: null });
        return response({ offer: null });
      });
      const mounted = render(panel());
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Prepare full Offer from approved model',
        }),
      );
      await screen.findByText('Etapă 18');
      fireEvent.change(screen.getByLabelText('Approved estimate version'), {
        target: {
          value: modelOfferFixture().version.priceSource.estimateVersionId,
        },
      });
      for (const [label, value] of [
        ['Declared tax amount (same currency)', '25.00'],
        ['Declared tax label', 'Literal tax'],
        ['Internal declaration basis', ' Literal basis\n🌍 '],
        ['Scope note', 'Literal scope'],
      ])
        fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fireEvent.click(
        screen.getByLabelText('Select this model version deliberately'),
      );
      fireEvent.click(
        screen.getByLabelText(
          'I confirm the approved amount is the net amount for this Offer version.',
        ),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Create non-official Offer' }),
      );
      await waitFor(() => expect(release).toBeDefined());
      mounted.rerender(
        panel(
          change === 'identity'
            ? modelOfferActor
            : {
                ...modelOfferActor,
                activeCompany: {
                  ...modelOfferActor.activeCompany,
                  displayName: 'Replacement Company',
                  id:
                    change === 'company'
                      ? 'replacement-company'
                      : MODEL_OFFER_COMPANY,
                  ...(change === 'authority'
                    ? {
                        offerPermissions: ['commercial.offer.read'],
                        offerPermissionSetVersion: undefined,
                        offerPermissionAssignmentId: undefined,
                      }
                    : {}),
                },
              },
          change === 'identity'
            ? deterministicBrowserIdentity({
                'x-test-external-subject': 'replacement-session',
              })
            : identity,
        ),
      );
      expect(
        screen.queryByLabelText('Declared tax amount (same currency)'),
      ).not.toBeInTheDocument();
      await act(async () => {
        release?.(response(modelOfferFixture(), 201));
      });
      expect(
        screen.queryByRole('button', { name: 'Download exact Romanian HTML' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Retry identical preparation' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Literal tax')).not.toBeInTheDocument();
      expect(attempts).toHaveLength(1);
    },
  );
  it('requires deliberate sources and fresh financial confirmation and retries the same literal body/key after malformed success', async () => {
    const attempts: {
      body: BodyInit | null | undefined;
      key: string | null;
    }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = input.toString();
      if (init?.method === 'POST') {
        attempts.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        const generated = modelOfferFixture();
        return response(
          attempts.length === 1
            ? {
                ...generated,
                version: { ...generated.version, modelSource: null },
              }
            : generated,
          201,
        );
      }
      if (path.endsWith('/for-offer'))
        return response({ selection: selectedModelFixture });
      if (path.includes('/profitability-estimates'))
        return response({
          items: [modelOfferEconomicFixture()],
          latestVersionNumber: 1,
        });
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
        name: 'Prepare full Offer from approved model',
      }),
    );
    const create = await screen.findByRole('button', {
      name: 'Create non-official Offer',
    });
    await screen.findByText('Etapă 18');
    fireEvent.change(screen.getByLabelText('Approved estimate version'), {
      target: {
        value: modelOfferFixture().version.priceSource.estimateVersionId,
      },
    });
    fireEvent.change(
      screen.getByLabelText('Declared tax amount (same currency)'),
      { target: { value: '25.00' } },
    );
    fireEvent.change(screen.getByLabelText('Declared tax label'), {
      target: { value: 'Literal tax' },
    });
    fireEvent.change(screen.getByLabelText('Internal declaration basis'), {
      target: { value: ' Literal basis\n🌍 ' },
    });
    fireEvent.change(screen.getByLabelText('Scope note'), {
      target: { value: 'Literal scope' },
    });
    fireEvent.click(create);
    expect(attempts).toHaveLength(0);
    fireEvent.click(
      screen.getByLabelText('Select this model version deliberately'),
    );
    fireEvent.click(
      screen.getByLabelText(
        'I confirm the approved amount is the net amount for this Offer version.',
      ),
    );
    fireEvent.click(create);
    const retry = await screen.findByRole('button', {
      name: 'Retry identical preparation',
    });
    expect(
      screen.getByLabelText('Declared tax amount (same currency)'),
    ).toBeDisabled();
    fireEvent.click(retry);
    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(attempts[0]).toEqual(attempts[1]);
    expect(
      screen.getByRole('button', { name: 'Download exact Romanian HTML' }),
    ).toBeVisible();
    expect(
      screen.getByTitle('Complete non-official consulting Offer'),
    ).toHaveAttribute(
      'srcdoc',
      modelOfferFixture().version.representation.html,
    );
  });

  it('keeps the frozen Offer readable without source/configuration authority and retires it when Offer access is lost', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        if (input.toString().endsWith('/versions'))
          return response({ versions: [], nextCursor: null });
        return response({ offer: modelOfferFixture() });
      });
    const actor = {
      ...modelOfferActor,
      activeCompany: {
        ...modelOfferActor.activeCompany,
        id: MODEL_OFFER_COMPANY,
        displayName: 'Reader Company',
        offerPermissions: ['commercial.offer.read'] as const,
      },
    };
    // Build mutable permission arrays exactly as ActorContext requires.
    const reader = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        offerPermissions: ['commercial.offer.read'] satisfies NonNullable<
          typeof modelOfferActor.activeCompany
        >['offerPermissions'],
        profitabilityContributorPermissions: [],
        profitabilityDirectorPermissions: [],
      },
    };
    const mounted = render(panel(reader));
    await screen.findByRole('button', { name: 'Download exact Romanian HTML' });
    expect(
      fetcher.mock.calls.some(([input]) =>
        /profitability-estimates|offer-models/u.test(input.toString()),
      ),
    ).toBe(false);
    await act(async () =>
      mounted.rerender(
        panel({
          ...reader,
          activeCompany: { ...reader.activeCompany, offerPermissions: [] },
        }),
      ),
    );
    expect(screen.queryByText('Literal tax')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Download exact Romanian HTML' }),
    ).not.toBeInTheDocument();
  });

  it('refuses mismatched declared totals and unknown model/check bindings in successful HTTP replies', () => {
    const offer = modelOfferFixture();
    expect(readOffer(offer).version.provenance).toBe('COMPANY_MODEL_ESTIMATE');
    for (const changed of [
      {
        ...offer.version,
        financialDeclaration: {
          ...offer.version.financialDeclaration,
          grossAmount: '150.01',
        },
      },
      {
        ...offer.version,
        modelSource: { ...offer.version.modelSource, language: 'fr' },
      },
      { ...offer.version, qualityRuleSetVersion: 2 },
      {
        ...offer.version,
        representation: { ...offer.version.representation, rendererVersion: 2 },
      },
    ])
      expect(() => readOffer({ ...offer, version: changed })).toThrow();
  });
});
