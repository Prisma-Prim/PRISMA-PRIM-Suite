import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
} from '../localization/interface-locale';
import { OfferPanel } from './OfferPanel';
import { OfferVersionHistory } from './OfferVersionHistory';
import type {
  OfferClientResponseView,
  OfferQualityRunView,
  OfferView,
} from './offer-response';

const identity = deterministicBrowserIdentity({
  'x-test-external-subject': 'localized-offer-preparer',
});
const actor: ActorContext = {
  internalUserId: 'user-one',
  workspaceMembershipId: 'membership-one',
  workspaceId: 'workspace-one',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Synthetic preparer',
  email: 'preparer@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-one',
    displayName: 'Synthetic Company',
    commercialIntakePermissions: ['commercial.opportunity.read'],
    clientPermissions: ['client.read'],
    offerPermissions: ['commercial.offer.read', 'commercial.offer.prepare'],
    offerPermissionAssignmentId: 'offer-preparer-assignment',
    offerPermissionSetVersion: 'v1',
  },
};

function LanguageControls() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      <button type="button" onClick={() => changeLocale('ro')}>
        Română
      </button>
      <button type="button" onClick={() => changeLocale('ru')}>
        Русский
      </button>
      <button type="button" onClick={() => changeLocale('fr')}>
        Français
      </button>
      <button type="button" onClick={() => changeLocale('en')}>
        English
      </button>
    </>
  );
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function chooseLast(label: string) {
  const control = screen.getByRole('combobox', { name: label });
  fireEvent.keyDown(control, { key: 'Enter' });
  fireEvent.keyDown(control, { key: 'End' });
  fireEvent.keyDown(control, { key: 'Enter' });
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(interfaceLocaleStorageKey);
  document.documentElement.lang = '';
});

it('translates a held initial preparation without changing its literal draft, I/O or exact uncertain retry', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const posts: RequestInit[] = [];
  let release: ((reply: Response) => void) | undefined;
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const path = input.toString();
      if (init?.method === 'POST') {
        posts.push(init);
        if (posts.length === 1)
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        return response({}, 500);
      }
      if (path.endsWith('/offers/opportunities/opportunity-one'))
        return response({ offer: null });
      if (path.includes('/snapshots'))
        return response({
          items: [
            {
              id: 'snapshot-one',
              currency: 'EUR',
              total: '345.00',
              committedAt: '2026-09-27T09:00:00.000Z',
            },
            {
              id: 'snapshot-two',
              currency: 'EUR',
              total: '346.72',
              committedAt: '2026-09-28T09:00:00.000Z',
            },
          ],
        });
      if (path.endsWith('/clients/client-one/legal-entities'))
        return response({
          clientVersion: 1,
          legalEntities: [
            {
              id: 'entity-one',
              legalName: 'Entité {originale} / Юрлицо',
              taxId: null,
              legalAddress: null,
              createdAt: '2026-09-27T08:00:00.000Z',
            },
          ],
        });
      throw new Error(`Unexpected public HTTP request: ${path}`);
    });
  const onCompanyContextRejected = vi.fn();
  const onActorRevalidated = vi.fn();
  const onWorkspaceAccessRejected = vi.fn();
  render(
    <InterfaceLocaleProvider>
      <LanguageControls />
      <OfferPanel
        actor={actor}
        identity={identity}
        opportunityId="opportunity-one"
        currentClientId="client-one"
        clientDisplayName="Primary {original} / Клиент"
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
    </InterfaceLocaleProvider>,
  );

  await screen.findByRole('button', { name: 'Prepare version 1' });
  chooseLast('Pricing Snapshot');
  chooseLast('Legal recipient');
  const scope = '  Périmètre {literal} / Область  ';
  const conditions = '  Conditions {exactes} / Условия\nDeuxième ligne  ';
  fireEvent.change(screen.getByLabelText('Validity in days'), {
    target: { value: '45' },
  });
  fireEvent.change(screen.getByLabelText('Scope note'), {
    target: { value: scope },
  });
  fireEvent.change(screen.getByLabelText('Commercial conditions'), {
    target: { value: conditions },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare version 1' }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]?.body).toBe(
    JSON.stringify({
      pricingSnapshotId: 'snapshot-two',
      recipient: { kind: 'ADDITIONAL', legalEntityId: 'entity-one' },
      validityDays: 45,
      scopeNote: scope,
      commercialConditions: conditions,
    }),
  );
  const requestCount = fetch.mock.calls.length;
  const language = screen.getByRole('button', { name: 'Français' });
  language.focus();
  fireEvent.click(language);

  expect(screen.getByLabelText('Note de périmètre')).toHaveValue(scope);
  expect(screen.getByLabelText('Conditions commerciales')).toHaveValue(
    conditions,
  );
  expect(screen.getByLabelText('Validité en jours')).toHaveValue(45);
  expect(
    screen.getByRole('combobox', { name: 'Instantané de tarification' }),
  ).toHaveAttribute('data-value', 'snapshot-two');
  expect(
    screen.getByRole('combobox', { name: 'Destinataire légal' }),
  ).toHaveAttribute('data-value', 'entity-one');
  expect(screen.getByRole('button', { name: 'Préparation…' })).toBeDisabled();
  expect(language).toHaveFocus();
  expect(fetch).toHaveBeenCalledTimes(requestCount);
  expect(onCompanyContextRejected).not.toHaveBeenCalled();
  expect(onActorRevalidated).not.toHaveBeenCalled();
  expect(onWorkspaceAccessRejected).not.toHaveBeenCalled();

  await act(async () => {
    if (!release) throw new Error('Expected the held initial preparation.');
    release(response({}, 500));
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Le résultat est incertain. Réessayer envoie exactement les mêmes valeurs et la même clé.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The outcome is uncertain. Retry sends the exact same values and key.',
  );
  expect(screen.getByLabelText('Scope note')).toHaveValue(scope);
  expect(screen.getByLabelText('Commercial conditions')).toHaveValue(
    conditions,
  );
  expect(screen.getByLabelText('Validity in days')).toHaveValue(45);
  expect(screen.getByLabelText('Scope note')).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(requestCount);

  fireEvent.click(
    screen.getByRole('button', { name: 'Retry the same preparation' }),
  );
  await waitFor(() => expect(posts).toHaveLength(2));
  expect(posts[1]?.body).toBe(posts[0]?.body);
  const firstHeaders = new Headers(posts[0]?.headers);
  expect(firstHeaders.get('idempotency-key')).toBeTruthy();
  expect(new Headers(posts[1]?.headers).get('idempotency-key')).toBe(
    firstHeaders.get('idempotency-key'),
  );
  expect(new Headers(posts[1]?.headers).get('x-company-context-id')).toBe(
    'company-one',
  );
  expect(onCompanyContextRejected).not.toHaveBeenCalled();
  expect(onActorRevalidated).not.toHaveBeenCalled();
  expect(onWorkspaceAccessRejected).not.toHaveBeenCalled();
});

it('keeps an exact reopened historical Version while translating its common summary and field-aware differences without losing decimal precision', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const historical = historicalRejectedOffer();
  const head = {
    ...historical,
    version: {
      ...historical.version,
      id: 'version-three',
      versionNumber: 3,
      predecessorVersionId: 'version-two',
      supersededByVersionId: null,
      supersededAt: null,
      decisionState: 'PENDING',
      decision: null,
    },
  } satisfies OfferView;
  const reads: string[] = [];
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const path = input.toString();
      if (init?.method === 'POST')
        throw new Error('A read-only historical journey must not write.');
      reads.push(path);
      if (path.endsWith('/offers/opportunities/opportunity-one'))
        return response({ offer: head });
      if (path.endsWith('/versions/version-two'))
        return response({ offer: historical });
      if (path.endsWith('/versions'))
        return response({
          versions: [
            {
              id: 'version-three',
              versionNumber: 3,
              createdAt: '2026-09-29T09:00:00.000Z',
              supersededByVersionId: null,
            },
            {
              id: 'version-two',
              versionNumber: 2,
              createdAt: '2026-09-27T09:00:00.000Z',
              supersededByVersionId: 'version-three',
            },
          ],
          nextCursor: null,
        });
      throw new Error(`Unexpected public HTTP request: ${path}`);
    });
  const onCompanyContextRejected = vi.fn();
  const onActorRevalidated = vi.fn();
  const onWorkspaceAccessRejected = vi.fn();
  render(
    <InterfaceLocaleProvider>
      <LanguageControls />
      <OfferPanel
        actor={actor}
        identity={identity}
        opportunityId="opportunity-one"
        currentClientId="client-one"
        clientDisplayName="Primary {original} / Клиент"
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
    </InterfaceLocaleProvider>,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open version 2' }),
  );
  expect(
    await screen.findByText('Historical version · read only'),
  ).toBeVisible();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Open version 3' }),
    ).toBeEnabled(),
  );
  expect(screen.getByRole('button', { name: 'Open version 2' })).toBeDisabled();
  expect(screen.getByText('Rejected internally')).toBeVisible();
  expect(reads).toEqual([
    '/api/offers/opportunities/opportunity-one',
    '/api/offers/opportunities/opportunity-one/versions',
    '/api/offers/opportunities/opportunity-one/versions/version-two',
    '/api/offers/opportunities/opportunity-one/versions',
  ]);
  const requestCount = fetch.mock.calls.length;
  const language = screen.getByRole('button', { name: 'Français' });
  language.focus();
  fireEvent.click(language);

  expect(
    screen.getByRole('heading', {
      name: 'Représentation exacte de la version',
    }),
  ).toBeVisible();
  expect(screen.getByText('Version historique · lecture seule')).toBeVisible();
  expect(screen.getByText('Rejetée en interne')).toBeVisible();
  expect(
    screen.getByText('Rejetée · non transmise · aucune réponse du Client'),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Ouvrir la version 2' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Ouvrir la version 3' }),
  ).toBeEnabled();
  expect(
    screen
      .getAllByRole('button', { name: /^Ouvrir la version /u })
      .map((button) => button.textContent),
  ).toEqual(['Ouvrir la version 3', 'Ouvrir la version 2']);
  expect(
    screen.queryByRole('button', { name: 'Préparer une nouvelle version' }),
  ).not.toBeInTheDocument();
  expect(
    screen
      .getAllByRole('definition')
      .find(
        (value) =>
          value.textContent ===
          '900\u202f719\u202f925\u202f474\u202f099\u202f312\u202f345,6700 EUR',
      ),
  ).toBeVisible();
  expect(
    screen
      .getAllByRole('definition')
      .find(
        (value) =>
          value.textContent ===
          'Valeur précédente: 900\u202f719\u202f925\u202f474\u202f099\u202f312\u202f344,1200',
      ),
  ).toBeVisible();
  expect(
    screen
      .getAllByRole('definition')
      .find(
        (value) =>
          value.textContent ===
          'Valeur actuelle: 900\u202f719\u202f925\u202f474\u202f099\u202f312\u202f345,6700',
      ),
  ).toBeVisible();
  expect(
    screen.getByText('Valeur actuelle: 27 oct. 2026, 09:00'),
  ).toBeVisible();
  expect(
    screen.getByText('Valeur actuelle: 2026-10-27T09:00:00.000Z'),
  ).toBeVisible();
  expect(
    screen.getByText('Valeur actuelle: 000900719925474099312345.6700'),
  ).toBeVisible();
  expect(screen.getByText('Valeur actuelle: PRIMARY')).toBeVisible();
  expect(screen.getByText('Valeur actuelle: EUR')).toBeVisible();
  expect(
    screen.getByText('Valeur actuelle: Texte {original} / Условия'),
  ).toBeVisible();
  expect(screen.getByText('Valeur précédente: Non renseigné')).toBeVisible();
  expect(screen.getByText('Valeur précédente: Texte vide')).toBeVisible();
  expect(screen.getByText('Total enregistré · Modifié')).toBeVisible();
  expect(screen.getByText('Legal {identity} / Получатель')).toBeVisible();
  expect(screen.getByText('Company {original} / Компания')).toBeVisible();
  expect(screen.getByText('Membre décisionnaire')).toBeVisible();
  expect(screen.getByText('Motif du rejet')).toBeVisible();
  expect(screen.getByText('Literal {reason} / Причина')).toBeVisible();
  expect(screen.getByText('OFFER_ILLUSTRATIVE v1')).toBeVisible();
  expect(screen.getByText('OFFER_QUALITY_ILLUSTRATIVE v1')).toBeVisible();
  expect(
    screen.getByText(historical.version.representation.sha256),
  ).toBeVisible();
  expect(
    screen.getByTitle('Représentation de l’Offre illustrative'),
  ).toHaveAttribute('srcdoc', historical.version.representation.html);
  expect(language).toHaveFocus();
  expect(fetch).toHaveBeenCalledTimes(requestCount);
  expect(onCompanyContextRejected).not.toHaveBeenCalled();
  expect(onActorRevalidated).not.toHaveBeenCalled();
  expect(onWorkspaceAccessRejected).not.toHaveBeenCalled();
});

function historicalRejectedOffer(): OfferView {
  return {
    id: 'offer-one',
    illustrativeReference: 7,
    revision: 5,
    version: {
      id: 'version-two',
      versionNumber: 2,
      predecessorVersionId: 'version-one',
      supersededByVersionId: 'version-three',
      supersededAt: '2026-09-29T09:00:00.000Z',
      qualityRuleSet: 'OFFER_QUALITY_ILLUSTRATIVE',
      qualityRuleSetVersion: 1,
      latestQualityRun: null,
      pricingSnapshotId: '000900719925474099312345.6700',
      pricingSnapshot: {
        id: '000900719925474099312345.6700',
        total: '900719925474099312345.6700',
        currency: 'EUR',
        committedAt: '2026-09-27T09:00:00.000Z',
      },
      recipient: {
        kind: 'PRIMARY',
        additionalLegalEntityId: null,
        legalName: 'Legal {identity} / Получатель',
        taxId: '000900719925474099312345',
        legalAddress: 'Legal {address} / Адрес',
      },
      issuingCompanyLabel: 'Company {original} / Компания',
      validityDays: 30,
      validUntil: '2026-10-27T09:00:00.000Z',
      validityElapsed: false,
      scopeNote: '2026-10-27T09:00:00.000Z',
      commercialConditions: 'Texte {original} / Условия',
      decisionState: 'REJECTED',
      decision: {
        id: 'decision-two',
        offerVersionId: 'version-two',
        offerRevision: 4,
        actorWorkspaceMembershipId: 'membership-one',
        decidedAt: '2026-09-28T09:00:00.000Z',
        state: 'REJECTED',
        reason: 'Literal {reason} / Причина',
      },
      transmissionState: 'NOT_TRANSMITTED',
      transmission: null,
      clientResponseState: 'NONE',
      clientResponse: null,
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      representation: {
        templateCode: 'OFFER_ILLUSTRATIVE',
        templateVersion: 1,
        html: '<!doctype html><html lang="en"><body>Frozen {Offer} / Документ</body></html>',
        sha256:
          '1161a98c95f65605a37e3c82383cd044335e9be41e00ce8a8559dd553db0c865',
      },
      differences: [
        {
          field: 'total',
          previous: '900719925474099312344.1200',
          current: '900719925474099312345.6700',
          changed: true,
        },
        {
          field: 'validUntil',
          previous: '2026-10-26T09:00:00.000Z',
          current: '2026-10-27T09:00:00.000Z',
          changed: true,
        },
        {
          field: 'scopeNote',
          previous: null,
          current: '2026-10-27T09:00:00.000Z',
          changed: true,
        },
        {
          field: 'pricingSnapshotId',
          previous: '000900719925474099312344.1200',
          current: '000900719925474099312345.6700',
          changed: true,
        },
        {
          field: 'recipientKind',
          previous: 'PRIMARY',
          current: 'PRIMARY',
          changed: false,
        },
        { field: 'currency', previous: 'EUR', current: 'EUR', changed: false },
        {
          field: 'commercialConditions',
          previous: '',
          current: 'Texte {original} / Условия',
          changed: true,
        },
      ],
    },
  };
}

const validationLocales = [
  {
    language: 'Română',
    scope: 'Notă privind domeniul',
    conditions: 'Condiții comerciale',
    validity: 'Valabilitate în zile',
    invalid: 'Verificați instantaneul selectat și valorile introduse.',
  },
  {
    language: 'Русский',
    scope: 'Примечание об области работ',
    conditions: 'Коммерческие условия',
    validity: 'Срок действия в днях',
    invalid: 'Проверьте выбранный снимок и введённые значения.',
  },
  {
    language: 'Français',
    scope: 'Note de périmètre',
    conditions: 'Conditions commerciales',
    validity: 'Validité en jours',
    invalid: 'Vérifiez l’instantané sélectionné et les valeurs saisies.',
  },
  {
    language: 'English',
    scope: 'Scope note',
    conditions: 'Commercial conditions',
    validity: 'Validity in days',
    invalid: 'Check the selected Snapshot and the entered values.',
  },
];

function callbacks() {
  return {
    onCompanyContextRejected: vi.fn(),
    onActorRevalidated: vi.fn(),
    onWorkspaceAccessRejected: vi.fn(),
  };
}

function localizedTree({
  currentActor = actor,
  currentIdentity = identity,
  opportunityId = 'opportunity-one',
  clientId = 'client-one',
  requestedVersionId,
  access,
}: {
  currentActor?: ActorContext;
  currentIdentity?: typeof identity;
  opportunityId?: string;
  clientId?: string | null;
  requestedVersionId?: string;
  access: ReturnType<typeof callbacks>;
}) {
  return (
    <InterfaceLocaleProvider>
      <LanguageControls />
      <OfferPanel
        actor={currentActor}
        identity={currentIdentity}
        opportunityId={opportunityId}
        currentClientId={clientId ?? undefined}
        clientDisplayName="Primary {original} / Клиент"
        requestedVersionId={requestedVersionId}
        {...access}
      />
    </InterfaceLocaleProvider>
  );
}

function companyActor({
  companyId = 'company-one',
  mayRead = true,
  mayPrepare = true,
}: {
  companyId?: string;
  mayRead?: boolean;
  mayPrepare?: boolean;
}): ActorContext {
  if (!actor.activeCompany) throw new Error('Expected the synthetic Company.');
  const offerPermissions: NonNullable<
    ActorContext['activeCompany']
  >['offerPermissions'] = [];
  if (mayRead) offerPermissions.push('commercial.offer.read');
  if (mayPrepare) offerPermissions.push('commercial.offer.prepare');
  return {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: companyId,
      displayName: companyId,
      offerPermissionAssignmentId: `offer-assignment-${companyId}`,
      offerPermissions,
    },
  };
}

function ordinarySnapshot() {
  return {
    id: 'snapshot-one',
    currency: 'EUR',
    total: '345.00',
    committedAt: '2026-09-27T09:00:00.000Z',
  };
}

function pendingOffer({
  versionNumber = 1,
  versionId = 'version-one',
  companyName = 'Company {original} / Компания',
}: {
  versionNumber?: number;
  versionId?: string;
  companyName?: string;
} = {}): OfferView {
  const historical = historicalRejectedOffer();
  return {
    ...historical,
    revision: 7,
    version: {
      ...historical.version,
      id: versionId,
      versionNumber,
      predecessorVersionId: versionNumber === 1 ? null : 'version-one',
      supersededByVersionId: null,
      supersededAt: null,
      differences: [],
      pricingSnapshotId: 'snapshot-one',
      pricingSnapshot: ordinarySnapshot(),
      issuingCompanyLabel: companyName,
      validityDays: 30,
      scopeNote: null,
      commercialConditions: null,
      decisionState: 'PENDING',
      decision: null,
    },
  };
}

async function preparationRead(input: RequestInfo | URL): Promise<Response> {
  const path = input.toString();
  if (path.endsWith('/offers/opportunities/opportunity-one'))
    return response({ offer: null });
  if (path.includes('/snapshots'))
    return response({ items: [ordinarySnapshot()] });
  if (path.endsWith('/legal-entities'))
    return response({ clientVersion: 1, legalEntities: [] });
  throw new Error(`Unexpected preparation HTTP request: ${path}`);
}

it.each(['local', 'server'] as const)(
  'retranslates visible %s validation in all four locales and retains literal correctable values',
  async (source) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const posts: RequestInit[] = [];
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        if (init?.method !== 'POST') return preparationRead(input);
        posts.push(init);
        return response(
          {
            code: 'OFFER_VALIDATION_ERROR',
            message: 'RAW ENGLISH SERVER PROSE: do not render this string.',
            errors: [
              { field: 'validityDays', message: 'RAW ENGLISH FIELD PROSE' },
            ],
          },
          400,
        );
      });
    const access = callbacks();
    render(localizedTree({ access }));
    await screen.findByRole('button', { name: 'Prepare version 1' });
    const scope = '  Scope {literal} / Область  ';
    const conditions = '  Terms {literal} / Условия\nNext line  ';
    fireEvent.change(screen.getByLabelText('Scope note'), {
      target: { value: scope },
    });
    fireEvent.change(screen.getByLabelText('Commercial conditions'), {
      target: { value: conditions },
    });
    fireEvent.change(screen.getByLabelText('Validity in days'), {
      target: { value: source === 'local' ? '0' : '45' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare version 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check the selected Snapshot and the entered values.',
    );
    expect(posts).toHaveLength(source === 'local' ? 0 : 1);
    const requestCount = fetch.mock.calls.length;
    for (const locale of validationLocales) {
      const language = screen.getByRole('button', { name: locale.language });
      language.focus();
      fireEvent.click(language);
      expect(screen.getByRole('alert')).toHaveTextContent(locale.invalid);
      expect(screen.getByLabelText(locale.scope)).toHaveValue(scope);
      expect(screen.getByLabelText(locale.conditions)).toHaveValue(conditions);
      expect(screen.getByLabelText(locale.validity)).toHaveValue(
        source === 'local' ? 0 : 45,
      );
      expect(screen.getByLabelText(locale.scope)).toBeEnabled();
      expect(language).toHaveFocus();
      expect(fetch).toHaveBeenCalledTimes(requestCount);
      expect(screen.queryByText(/RAW ENGLISH/u)).not.toBeInTheDocument();
    }
    expect(access.onActorRevalidated).not.toHaveBeenCalled();
    expect(access.onCompanyContextRejected).not.toHaveBeenCalled();
    expect(access.onWorkspaceAccessRejected).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Validity in days'), {
      target: { value: '365' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare version 1' }));
    await waitFor(() => expect(posts).toHaveLength(source === 'local' ? 1 : 2));
    expect(posts.at(-1)?.body).toBe(
      JSON.stringify({
        pricingSnapshotId: 'snapshot-one',
        recipient: { kind: 'PRIMARY' },
        validityDays: 365,
        scopeNote: scope,
        commercialConditions: conditions,
      }),
    );
    if (source === 'server') {
      expect(new Headers(posts[1]?.headers).get('idempotency-key')).not.toBe(
        new Headers(posts[0]?.headers).get('idempotency-key'),
      );
    }
  },
);

it.each([
  {
    status: 404,
    code: '',
    en: 'The Opportunity, Snapshot or recipient is no longer available. Reload the Request.',
    fr: 'L’Opportunité, l’instantané ou le destinataire n’est plus disponible. Rechargez la Demande.',
  },
  {
    status: 409,
    code: 'OFFER_ALREADY_EXISTS',
    en: 'An Offer already exists or this retry no longer matches.',
    fr: 'Une Offre existe déjà ou cette nouvelle tentative ne correspond plus.',
  },
  {
    status: 409,
    code: 'IDEMPOTENCY_CONFLICT',
    en: 'An Offer already exists or this retry no longer matches.',
    fr: 'Une Offre existe déjà ou cette nouvelle tentative ne correspond plus.',
  },
  {
    status: 409,
    code: 'STALE_OFFER_REVISION',
    en: 'The Offer changed. Reload the Request before creating a version.',
    fr: 'L’Offre a changé. Rechargez la Demande avant de créer une version.',
  },
  {
    status: 409,
    code: 'OFFER_ACCEPTED',
    en: 'This Offer has been accepted and cannot receive another version.',
    fr: 'Cette Offre a été acceptée et ne peut pas recevoir d’autre version.',
  },
])(
  'retranslates definite preparation refusal $status/$code without offering an uncertain retry',
  async ({ status, code, en, fr }) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const posts: RequestInit[] = [];
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        if (init?.method !== 'POST') return preparationRead(input);
        posts.push(init);
        return response(
          { code, message: 'Untrusted English refusal prose' },
          status,
        );
      });
    const access = callbacks();
    render(localizedTree({ access }));
    await screen.findByRole('button', { name: 'Prepare version 1' });
    fireEvent.change(screen.getByLabelText('Commercial conditions'), {
      target: { value: '  Preserved {conditions} / Условия  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare version 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(en);
    const requestCount = fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(screen.getByRole('alert')).toHaveTextContent(fr);
    expect(screen.getByLabelText('Conditions commerciales')).toHaveValue(
      '  Preserved {conditions} / Условия  ',
    );
    expect(screen.getByLabelText('Conditions commerciales')).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Réessayer la même préparation' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Untrusted English refusal prose'),
    ).not.toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(requestCount);
    expect(access.onActorRevalidated).not.toHaveBeenCalled();
    expect(access.onCompanyContextRejected).not.toHaveBeenCalled();
    expect(access.onWorkspaceAccessRejected).not.toHaveBeenCalled();
  },
);

it('keeps a held successor revision and literal payload through locale changes and the exact uncertain retry to success', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const posts: RequestInit[] = [];
  let release: ((reply: Response) => void) | undefined;
  const successor = pendingOffer({
    versionNumber: 2,
    versionId: 'version-two',
  });
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const path = input.toString();
      if (init?.method === 'POST') {
        posts.push(init);
        if (posts.length === 1)
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        return response(successor, 201);
      }
      if (path.endsWith('/offers/opportunities/opportunity-one'))
        return response({ offer: pendingOffer() });
      if (path.endsWith('/versions'))
        return response({ versions: [], nextCursor: null });
      return preparationRead(input);
    });
  const access = callbacks();
  render(localizedTree({ access }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Prepare a new version' }),
  );
  await screen.findByLabelText('Commercial conditions');
  const scope = '  New {scope} / Область  ';
  const conditions = '  New {terms} / Условия  ';
  fireEvent.change(screen.getByLabelText('Scope note'), {
    target: { value: scope },
  });
  fireEvent.change(screen.getByLabelText('Commercial conditions'), {
    target: { value: conditions },
  });
  fireEvent.change(screen.getByLabelText('Validity in days'), {
    target: { value: '1' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create new version' }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]?.body).toBe(
    JSON.stringify({
      expectedOfferRevision: 7,
      pricingSnapshotId: 'snapshot-one',
      recipient: { kind: 'PRIMARY' },
      validityDays: 1,
      scopeNote: scope,
      commercialConditions: conditions,
    }),
  );
  const requestCount = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Română' }));
  expect(screen.getByRole('button', { name: 'Se pregătește…' })).toBeDisabled();
  expect(screen.getByLabelText('Notă privind domeniul')).toHaveValue(scope);
  expect(screen.getByLabelText('Condiții comerciale')).toHaveValue(conditions);
  expect(screen.getByLabelText('Valabilitate în zile')).toHaveValue(1);
  expect(fetch).toHaveBeenCalledTimes(requestCount);
  await act(async () => {
    if (!release) throw new Error('Expected a held successor command.');
    release(response({}, 503));
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Rezultatul este incert. Reîncercarea trimite exact aceleași valori și aceeași cheie.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Русский' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Результат неизвестен. Повторная попытка отправит те же значения и тот же ключ.',
  );
  expect(screen.getByLabelText('Коммерческие условия')).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(requestCount);
  expect(access.onCompanyContextRejected).not.toHaveBeenCalled();
  expect(access.onActorRevalidated).not.toHaveBeenCalled();
  expect(access.onWorkspaceAccessRejected).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Повторить ту же подготовку' }),
  );
  expect(await screen.findByText('Создана новая версия Оферты.')).toBeVisible();
  await screen.findByText('Нет сохранённых версий.');
  expect(screen.getByRole('status')).toHaveTextContent(
    'Создана новая версия Оферты.',
  );
  expect(posts).toHaveLength(2);
  expect(posts[1]?.body).toBe(posts[0]?.body);
  expect(new Headers(posts[1]?.headers).get('idempotency-key')).toBe(
    new Headers(posts[0]?.headers).get('idempotency-key'),
  );
  expect(new Headers(posts[1]?.headers).get('x-company-context-id')).toBe(
    'company-one',
  );
  const savedRequestCount = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Français' }));
  expect(screen.getByRole('status')).toHaveTextContent(
    'Nouvelle version de l’Offre créée.',
  );
  expect(fetch).toHaveBeenCalledTimes(savedRequestCount);
});

it.each(['company', 'authority', 'identity'] as const)(
  'suppresses a held preparation reply after the %s boundary changes while locale remains chosen',
  async (boundary) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    let release: ((reply: Response) => void) | undefined;
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        if (init?.method === 'POST')
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        if (input.toString().endsWith('/versions'))
          return response({ versions: [], nextCursor: null });
        if (input.toString().includes('opportunity-two'))
          return response({
            offer: pendingOffer({ companyName: 'New authorized Company' }),
          });
        return preparationRead(input);
      });
    const access = callbacks();
    const rendered = render(localizedTree({ access }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Prepare version 1' }),
    );
    await waitFor(() => expect(release).toBeTypeOf('function'));
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(screen.getByRole('button', { name: 'Préparation…' })).toBeDisabled();
    const nextActor =
      boundary === 'company'
        ? companyActor({ companyId: 'company-two' })
        : boundary === 'authority'
          ? companyActor({ mayRead: false, mayPrepare: false })
          : actor;
    const nextIdentity =
      boundary === 'identity'
        ? deterministicBrowserIdentity({
            'x-test-external-subject': 'replacement-preparer',
          })
        : identity;
    rendered.rerender(
      localizedTree({
        access,
        currentActor: nextActor,
        currentIdentity: nextIdentity,
        opportunityId:
          boundary === 'authority' ? 'opportunity-one' : 'opportunity-two',
      }),
    );
    if (boundary === 'authority')
      expect(
        await screen.findByText(
          'L’accès à l’Offre n’est pas disponible pour cette Opportunité.',
        ),
      ).toBeVisible();
    else {
      expect(await screen.findByText('New authorized Company')).toBeVisible();
      await screen.findByText('Aucune version enregistrée.');
    }
    const requestCount = fetch.mock.calls.length;
    await act(async () => {
      if (!release) throw new Error('Expected the retired preparation.');
      release(
        response(
          pendingOffer({ companyName: 'Late confidential Company' }),
          201,
        ),
      );
    });
    expect(
      screen.queryByText('Late confidential Company'),
    ).not.toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
    expect(fetch).toHaveBeenCalledTimes(requestCount);
    expect(access.onCompanyContextRejected).not.toHaveBeenCalled();
    expect(access.onActorRevalidated).not.toHaveBeenCalled();
    expect(access.onWorkspaceAccessRejected).not.toHaveBeenCalled();
  },
);

it.each([
  {
    kind: 'no-read',
    en: 'Offer access is not available for this Opportunity.',
    fr: 'L’accès à l’Offre n’est pas disponible pour cette Opportunité.',
  },
  {
    kind: 'no-client',
    en: 'A readable Client is required before preparing an Offer.',
    fr: 'Un Client accessible est nécessaire avant de préparer une Offre.',
  },
  {
    kind: 'no-offer',
    en: 'No Offer exists for this Opportunity.',
    fr: 'Aucune Offre n’existe pour cette Opportunité.',
  },
  {
    kind: 'no-snapshot',
    en: 'Save an illustrative Pricing Snapshot before preparing an Offer.',
    fr: 'Enregistrez un instantané de tarification illustratif avant de préparer une Offre.',
  },
  {
    kind: 'read-unavailable',
    en: 'The Offer could not be loaded. Try again.',
    fr: 'L’Offre n’a pas pu être chargée. Réessayez.',
  },
  {
    kind: 'malformed-offer',
    en: 'The Offer could not be loaded. Try again.',
    fr: 'L’Offre n’a pas pu être chargée. Réessayez.',
  },
  {
    kind: 'malformed-snapshots',
    en: 'The Offer could not be loaded. Try again.',
    fr: 'L’Offre n’a pas pu être chargée. Réessayez.',
  },
  {
    kind: 'malformed-entities',
    en: 'The Offer could not be loaded. Try again.',
    fr: 'L’Offre n’a pas pu être chargée. Réessayez.',
  },
])(
  'localizes the $kind read state without inventing preparation authority or locale reads',
  async ({ kind, en, fr }) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const path = input.toString();
        if (path.endsWith('/offers/opportunities/opportunity-one')) {
          if (kind === 'read-unavailable') return response({}, 503);
          if (kind === 'malformed-offer')
            return response({
              offer: {
                ...pendingOffer(),
                version: { ...pendingOffer().version, provisional: false },
              },
            });
          return response({ offer: null });
        }
        if (path.includes('/snapshots')) {
          if (kind === 'no-snapshot') return response({ items: [] });
          if (kind === 'malformed-snapshots')
            return response({ items: [{ ...ordinarySnapshot(), total: 345 }] });
        }
        if (path.endsWith('/legal-entities') && kind === 'malformed-entities')
          return response({ clientVersion: 0, legalEntities: [] });
        return preparationRead(input);
      });
    const access = callbacks();
    render(
      localizedTree({
        access,
        currentActor: companyActor({
          mayRead: kind !== 'no-read',
          mayPrepare: kind !== 'no-offer',
        }),
        clientId: kind === 'no-client' ? null : 'client-one',
      }),
    );
    expect(await screen.findByText(en)).toBeVisible();
    const requestCount = fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(screen.getByText(fr)).toBeVisible();
    expect(
      screen.queryByLabelText('Conditions commerciales'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTitle('Représentation de l’Offre illustrative'),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(requestCount);
    if (kind === 'no-read') expect(fetch).not.toHaveBeenCalled();
    expect(access.onCompanyContextRejected).not.toHaveBeenCalled();
    expect(access.onActorRevalidated).not.toHaveBeenCalled();
    expect(access.onWorkspaceAccessRejected).not.toHaveBeenCalled();
  },
);

it('translates initial delayed loading and retry without reading again on a locale choice', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  let release: ((reply: Response) => void) | undefined;
  let reads = 0;
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      if (input.toString().endsWith('/offers/opportunities/opportunity-one')) {
        reads += 1;
        if (reads === 1)
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
      }
      return preparationRead(input);
    });
  const access = callbacks();
  render(localizedTree({ access }));
  expect(screen.getByRole('status')).toHaveTextContent('Loading Offer…');
  await waitFor(() => expect(release).toBeTypeOf('function'));
  fireEvent.click(screen.getByRole('button', { name: 'Français' }));
  expect(screen.getByRole('status')).toHaveTextContent(
    'Chargement de l’Offre…',
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => {
    if (!release) throw new Error('Expected the held initial read.');
    release(response({}, 503));
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'L’Offre n’a pas pu être chargée. Réessayez.',
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  expect(
    await screen.findByRole('button', { name: 'Préparer la version 1' }),
  ).toBeEnabled();
  expect(reads).toBe(2);
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(access.onActorRevalidated).not.toHaveBeenCalled();
  expect(access.onCompanyContextRejected).not.toHaveBeenCalled();
  expect(access.onWorkspaceAccessRejected).not.toHaveBeenCalled();
});

it('retranslates an API denial after its explicit actor revalidation without repeating the callback or read', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const revalidated = companyActor({ mayRead: false, mayPrepare: false });
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      if (input.toString().endsWith('/access/current-actor'))
        return response(revalidated);
      if (init?.method === 'POST') return response({}, 403);
      return preparationRead(input);
    });
  const access = callbacks();
  render(localizedTree({ access }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Prepare version 1' }),
  );
  expect(
    await screen.findByText(
      'Offer access is not available for this Opportunity.',
    ),
  ).toBeVisible();
  expect(access.onActorRevalidated).toHaveBeenCalledExactlyOnceWith(
    revalidated,
  );
  const requestCount = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Français' }));
  expect(
    screen.getByText(
      'L’accès à l’Offre n’est pas disponible pour cette Opportunité.',
    ),
  ).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(requestCount);
  expect(access.onActorRevalidated).toHaveBeenCalledExactlyOnceWith(
    revalidated,
  );
  expect(access.onCompanyContextRejected).not.toHaveBeenCalled();
  expect(access.onWorkspaceAccessRejected).not.toHaveBeenCalled();
});

it('keeps history selection and rows while retranslating delayed loading, continuation and reopening failures', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const current = pendingOffer({ versionNumber: 2, versionId: 'version-two' });
  const versions = [
    {
      id: 'version-two',
      versionNumber: 2,
      createdAt: '2026-09-28T09:00:00.000Z',
      supersededByVersionId: null,
    },
    {
      id: 'version-one',
      versionNumber: 1,
      createdAt: '2026-09-27T09:00:00.000Z',
      supersededByVersionId: 'version-two',
    },
  ];
  let historyReads = 0;
  let continuationReads = 0;
  let release: ((reply: Response) => void) | undefined;
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      const path = input.toString();
      if (path.endsWith('/offers/opportunities/opportunity-one'))
        return response({ offer: current });
      if (path.endsWith('/versions')) {
        historyReads += 1;
        if (historyReads === 1)
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        return response({ versions, nextCursor: 'older-page' });
      }
      if (path.endsWith('/versions?cursor=older-page')) {
        continuationReads += 1;
        return response({ versions: 'malformed-page', nextCursor: null });
      }
      if (path.endsWith('/versions/version-one'))
        return response({ offer: current });
      throw new Error(`Unexpected history HTTP request: ${path}`);
    });
  const access = callbacks();
  render(localizedTree({ access }));
  expect(await screen.findByText('Loading versions…')).toBeVisible();
  await waitFor(() => expect(release).toBeTypeOf('function'));
  const loadingCount = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Français' }));
  expect(screen.getByText('Chargement des versions…')).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(loadingCount);
  await act(async () => {
    if (!release) throw new Error('Expected the held initial history read.');
    release(response({}, 503));
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'L’historique des versions est indisponible. Réessayez.',
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Historique des versions' }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Ouvrir la version 1' }),
    ).toBeEnabled(),
  );
  expect(
    screen.getByRole('button', { name: 'Ouvrir la version 2' }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Afficher les versions plus anciennes',
    }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'L’historique des versions est indisponible. Réessayez.',
  );
  expect(continuationReads).toBe(1);
  const failedCount = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Version history is unavailable. Try again.',
  );
  expect(
    screen
      .getAllByRole('button', { name: /^Open version /u })
      .map((button) => button.textContent),
  ).toEqual(['Open version 2', 'Open version 1']);
  expect(screen.getByRole('button', { name: 'Open version 2' })).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(failedCount);
  fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Open version 1' }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open version 1' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Version history is unavailable. Try again.',
  );
  const reopeningCount = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Français' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'L’historique des versions est indisponible. Réessayez.',
  );
  expect(screen.getByText('Version actuelle')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Ouvrir la version 2' }),
  ).toBeDisabled();
  expect(
    screen.queryByText('Version historique · lecture seule'),
  ).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(reopeningCount);
  expect(access.onActorRevalidated).not.toHaveBeenCalled();
  expect(access.onCompanyContextRejected).not.toHaveBeenCalled();
  expect(access.onWorkspaceAccessRejected).not.toHaveBeenCalled();
});

it('preserves an explicitly requested historical Version through locale switches without head or preparation reads', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const historical = historicalRejectedOffer();
  const reads: string[] = [];
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      const path = input.toString();
      reads.push(path);
      if (path.endsWith('/versions/version-two'))
        return response({ offer: historical });
      if (path.endsWith('/versions'))
        return response({ versions: [], nextCursor: null });
      throw new Error(`Unexpected requested-Version HTTP request: ${path}`);
    });
  const access = callbacks();
  render(localizedTree({ access, requestedVersionId: 'version-two' }));
  expect(
    await screen.findByText('Historical version · read only'),
  ).toBeVisible();
  await screen.findByText('No versions recorded.');
  const requestCount = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Français' }));
  expect(screen.getByText('Version historique · lecture seule')).toBeVisible();
  expect(screen.getByText('Rejetée en interne')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Préparer une nouvelle version' }),
  ).not.toBeInTheDocument();
  expect(reads).toEqual([
    '/api/offers/opportunities/opportunity-one/versions/version-two',
    '/api/offers/opportunities/opportunity-one/versions',
  ]);
  expect(fetch).toHaveBeenCalledTimes(requestCount);
  expect(access.onActorRevalidated).not.toHaveBeenCalled();
  expect(access.onCompanyContextRejected).not.toHaveBeenCalled();
  expect(access.onWorkspaceAccessRejected).not.toHaveBeenCalled();
});

type SavedSummaryState =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'transmitted'
  | 'accepted'
  | 'client-rejected'
  | 'expired';

it.each([
  {
    state: 'pending',
    label: 'En attente · non transmise · aucune réponse du Client',
    badge: 'Brouillon — non approuvé',
  },
  {
    state: 'approved',
    label: 'Approuvée · non transmise · aucune réponse du Client',
    badge: 'Approuvée en interne',
  },
  {
    state: 'rejected',
    label: 'Rejetée · non transmise · aucune réponse du Client',
    badge: 'Rejetée en interne',
  },
  {
    state: 'transmitted',
    label: 'Transmission simulée enregistrée · réponse du Client en attente',
    badge: 'Approuvée en interne',
  },
  {
    state: 'accepted',
    label: 'Acceptation simulée du Client enregistrée',
    badge: 'Approuvée en interne',
  },
  {
    state: 'client-rejected',
    label: 'Refus simulé du Client enregistré',
    badge: 'Approuvée en interne',
  },
  {
    state: 'expired',
    label: 'Expiration simulée enregistrée',
    badge: 'Approuvée en interne',
  },
] satisfies Array<{ state: SavedSummaryState; label: string; badge: string }>)(
  'localizes the common $state historical summary while preserving detailed action facts and frozen representation',
  async ({ state, label, badge }) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const saved = savedOfferForState(state);
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        if (input.toString().endsWith('/versions'))
          return response({ versions: [], nextCursor: null });
        return response({ offer: saved });
      });
    const access = callbacks();
    render(
      localizedTree({
        access,
        currentActor: companyActor({ mayPrepare: false }),
      }),
    );
    await screen.findByText('No versions recorded.');
    const originalFrame = screen.getByTitle(
      'Illustrative Offer representation',
    );
    expect(originalFrame).toHaveAttribute(
      'srcdoc',
      saved.version.representation.html,
    );
    const requestCount = fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(
      screen.getByRole('region', { name: 'Offre illustrative' }),
    ).toBeVisible();
    expect(screen.getByText('Illustrative et provisoire')).toBeVisible();
    expect(screen.getByText('Référence illustrative')).toBeVisible();
    expect(screen.getByText('Société émettrice')).toBeVisible();
    expect(screen.getByText('Valable jusqu’au')).toBeVisible();
    expect(screen.getByText('État')).toBeVisible();
    expect(screen.getByText('Total illustratif référencé')).toBeVisible();
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText(badge)).toBeVisible();
    expect(
      screen.getByText('Version historique · lecture seule'),
    ).toBeVisible();
    expect(
      screen.getByText('La version 1 n’a pas de version précédente.'),
    ).toBeVisible();
    expect(screen.getByTitle('Représentation de l’Offre illustrative')).toBe(
      originalFrame,
    );
    expect(originalFrame).toHaveAttribute(
      'srcdoc',
      saved.version.representation.html,
    );
    expect(
      within(
        screen.getByRole('region', {
          name: 'Représentation exacte de la version',
        }),
      ).getByText(saved.version.representation.sha256),
    ).toBeVisible();
    expect(screen.getByText('OFFER_ILLUSTRATIVE v1')).toBeVisible();
    expect(screen.getByText('OFFER_QUALITY_ILLUSTRATIVE v1')).toBeVisible();
    if (saved.version.decision)
      expect(screen.getByText('Membre décisionnaire')).toBeVisible();
    if (saved.version.transmission) {
      expect(
        screen.getByRole('heading', { name: 'Simulated transmission' }),
      ).toBeVisible();
      expect(screen.getByText('Simulation {note} / Примечание')).toBeVisible();
    }
    if (saved.version.clientResponse)
      expect(
        screen.getByRole('heading', { name: 'Simulated Client response' }),
      ).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(requestCount);
    expect(access.onActorRevalidated).not.toHaveBeenCalled();
    expect(access.onCompanyContextRejected).not.toHaveBeenCalled();
    expect(access.onWorkspaceAccessRejected).not.toHaveBeenCalled();
  },
);

function savedOfferForState(state: SavedSummaryState): OfferView {
  const pending = pendingOffer();
  const base = {
    ...pending,
    version: {
      ...pending.version,
      supersededByVersionId: 'version-two',
      supersededAt: '2026-10-28T09:00:00.000Z',
    },
  } satisfies OfferView;
  if (state === 'pending') return base;
  if (state === 'rejected')
    return {
      ...base,
      version: {
        ...base.version,
        decisionState: 'REJECTED',
        decision: {
          id: 'decision-one',
          offerVersionId: 'version-one',
          offerRevision: 2,
          state: 'REJECTED',
          reason: 'Literal rejection / Причина',
          actorWorkspaceMembershipId: 'membership-one',
          decidedAt: '2026-09-28T09:00:00.000Z',
        },
      },
    };
  const run = {
    id: 'approval-run',
    offerVersionId: 'version-one',
    ruleSet: 'OFFER_QUALITY_ILLUSTRATIVE',
    ruleSetVersion: 1,
    actorWorkspaceMembershipId: 'membership-one',
    evaluatedAt: '2026-09-28T09:00:00.000Z',
    results: [
      { code: 'PRICING_SNAPSHOT_COHERENT', status: 'PASS' },
      { code: 'CURRENCY_UNCHANGED', status: 'PASS' },
      { code: 'VALIDITY_OPEN', status: 'PASS' },
      { code: 'RECIPIENT_AVAILABLE', status: 'PASS' },
      { code: 'RECIPIENT_IDENTITY_CURRENT', status: 'PASS' },
      { code: 'RECIPIENT_TAX_ID_RECORDED', status: 'PASS' },
      { code: 'PRICING_CLIENT_CONTEXT_COHERENT', status: 'PASS' },
      { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
    ],
  } satisfies OfferQualityRunView;
  const approved = {
    ...base,
    version: {
      ...base.version,
      decisionState: 'APPROVED',
      decision: {
        id: 'decision-one',
        offerVersionId: 'version-one',
        offerRevision: 2,
        state: 'APPROVED',
        actorWorkspaceMembershipId: 'membership-one',
        decidedAt: '2026-09-28T09:00:00.000Z',
        acknowledgedWarningCodes: [],
        qualityRun: run,
        representationSha256: base.version.representation.sha256,
      },
    },
  } satisfies OfferView;
  if (state === 'approved') return approved;
  const transmitted = {
    ...approved,
    version: {
      ...approved.version,
      transmissionState: 'TRANSMITTED',
      clientResponseState: 'PENDING',
      clientResponse: null,
      transmission: {
        id: 'transmission-one',
        offerVersionId: 'version-one',
        offerRevision: 3,
        actorWorkspaceMembershipId: 'membership-one',
        transmittedAt: '2026-09-29T09:00:00.000Z',
        channel: 'SIMULATED',
        note: 'Simulation {note} / Примечание',
        qualityRun: {
          ...run,
          id: 'transmission-run',
          evaluatedAt: '2026-09-29T09:00:00.000Z',
        },
        acknowledgedWarningCodes: [],
        representationSha256: base.version.representation.sha256,
      },
    },
  } satisfies OfferView;
  if (state === 'transmitted') return transmitted;
  const responseBase = {
    id: 'response-one',
    offerVersionId: 'version-one',
    offerRevision: 4,
    actorWorkspaceMembershipId: 'membership-one',
    decidedAt:
      state === 'expired'
        ? '2026-10-27T09:00:00.000Z'
        : '2026-09-30T09:00:00.000Z',
    evidenceKind: 'SIMULATED',
  } satisfies Pick<
    OfferClientResponseView,
    | 'id'
    | 'offerVersionId'
    | 'offerRevision'
    | 'actorWorkspaceMembershipId'
    | 'decidedAt'
    | 'evidenceKind'
  >;
  if (state === 'accepted')
    return {
      ...transmitted,
      version: {
        ...transmitted.version,
        clientResponseState: 'ACCEPTED',
        clientResponse: {
          ...responseBase,
          outcome: 'ACCEPTED',
          receivedAt: '2026-09-30T09:00:00.000Z',
        },
      },
    };
  if (state === 'client-rejected')
    return {
      ...transmitted,
      version: {
        ...transmitted.version,
        clientResponseState: 'REJECTED',
        clientResponse: {
          ...responseBase,
          outcome: 'REJECTED',
          receivedAt: '2026-09-30T09:00:00.000Z',
          reason: 'Client {reason} / Причина',
        },
      },
    };
  return {
    ...transmitted,
    version: {
      ...transmitted.version,
      clientResponseState: 'EXPIRED',
      clientResponse: { ...responseBase, outcome: 'EXPIRED' },
    },
  };
}

it('formats a selected Snapshot amount and instant without rewriting its ID, currency or fractional digits', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      if (input.toString().includes('/snapshots'))
        return response({
          items: [
            {
              id: '000900719925474099312345.6700',
              currency: 'EUR',
              total: '900719925474099312345.6700',
              committedAt: '2026-09-27T09:00:00.000Z',
            },
          ],
        });
      return preparationRead(input);
    });
  const access = callbacks();
  render(localizedTree({ access }));
  await screen.findByRole('button', { name: 'Prepare version 1' });
  const requestCount = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Français' }));
  const selected = screen.getByRole('combobox', {
    name: 'Instantané de tarification',
  });
  expect(selected).toHaveAttribute(
    'data-value',
    '000900719925474099312345.6700',
  );
  expect(selected.textContent).toBe(
    '900\u202f719\u202f925\u202f474\u202f099\u202f312\u202f345,6700 EUR — 27 sept. 2026, 09:00',
  );
  expect(fetch).toHaveBeenCalledTimes(requestCount);
  expect(access.onActorRevalidated).not.toHaveBeenCalled();
  expect(access.onCompanyContextRejected).not.toHaveBeenCalled();
  expect(access.onWorkspaceAccessRejected).not.toHaveBeenCalled();
});

it('preserves the precision of accepted numeric total differences', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const historical = historicalRejectedOffer();
  const saved = {
    ...historical,
    version: {
      ...historical.version,
      differences: [
        {
          field: 'total',
          previous: 1.234567,
          current: 1.234568,
          changed: true,
        },
      ],
    },
  } satisfies OfferView;
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) =>
      input.toString().endsWith('/versions')
        ? response({ versions: [], nextCursor: null })
        : response({ offer: saved }),
    );
  const access = callbacks();
  render(localizedTree({ access }));
  await screen.findByText('No versions recorded.');
  const requestCount = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Français' }));
  expect(screen.getByText('Valeur précédente: 1,234567')).toBeVisible();
  expect(screen.getByText('Valeur actuelle: 1,234568')).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(requestCount);
  expect(access.onActorRevalidated).not.toHaveBeenCalled();
  expect(access.onCompanyContextRejected).not.toHaveBeenCalled();
  expect(access.onWorkspaceAccessRejected).not.toHaveBeenCalled();
});

it.each(['initial', 'successor'] as const)(
  'preserves the exact %s command and key after a malformed success becomes uncertain',
  async (mode) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const posts: RequestInit[] = [];
    const saved = pendingOffer({
      versionId: mode === 'successor' ? 'version-two' : 'version-one',
      versionNumber: mode === 'successor' ? 2 : 1,
    });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const path = input.toString();
        if (init?.method === 'POST') {
          posts.push(init);
          return posts.length === 1
            ? response(
                {
                  ...saved,
                  version: {
                    ...saved.version,
                    representation: {
                      ...saved.version.representation,
                      sha256: 'malformed-checksum',
                    },
                  },
                },
                201,
              )
            : response(saved, 201);
        }
        if (path.endsWith('/versions'))
          return response({ versions: [], nextCursor: null });
        if (
          mode === 'successor' &&
          path.endsWith('/offers/opportunities/opportunity-one')
        )
          return response({ offer: pendingOffer() });
        return preparationRead(input);
      });
    const access = callbacks();
    render(localizedTree({ access }));
    if (mode === 'successor') {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Prepare a new version' }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Create new version' }),
      );
    } else
      fireEvent.click(
        await screen.findByRole('button', { name: 'Prepare version 1' }),
      );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The outcome is uncertain. Retry sends the exact same values and key.',
    );
    const requestCount = fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Le résultat est incertain. Réessayer envoie exactement les mêmes valeurs et la même clé.',
    );
    expect(fetch).toHaveBeenCalledTimes(requestCount);
    fireEvent.click(
      screen.getByRole('button', { name: 'Réessayer la même préparation' }),
    );
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]?.body).toBe(posts[0]?.body);
    expect(new Headers(posts[1]?.headers).get('idempotency-key')).toBe(
      new Headers(posts[0]?.headers).get('idempotency-key'),
    );
    expect(posts[0]?.body).toBe(
      JSON.stringify({
        ...(mode === 'successor' ? { expectedOfferRevision: 7 } : {}),
        pricingSnapshotId: 'snapshot-one',
        recipient: { kind: 'PRIMARY' },
        validityDays: 30,
        scopeNote: null,
        commercialConditions: null,
      }),
    );
    await screen.findByText('Aucune version enregistrée.');
    expect(access.onActorRevalidated).not.toHaveBeenCalled();
    expect(access.onCompanyContextRejected).not.toHaveBeenCalled();
    expect(access.onWorkspaceAccessRejected).not.toHaveBeenCalled();
  },
);

it.each(['client', 'opportunity'] as const)(
  'does not expose initial preparation without independent %s read authority in any selected locale',
  async (prerequisite) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    if (!actor.activeCompany)
      throw new Error('Expected the synthetic Company.');
    const currentActor = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        clientPermissions: prerequisite === 'client' ? [] : ['client.read'],
        commercialIntakePermissions:
          prerequisite === 'opportunity' ? [] : ['commercial.opportunity.read'],
      },
    } satisfies ActorContext;
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) => preparationRead(input));
    const access = callbacks();
    render(localizedTree({ access, currentActor }));
    expect(
      await screen.findByText('No Offer exists for this Opportunity.'),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(
      screen.getByText('Aucune Offre n’existe pour cette Opportunité.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Préparer la version 1' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Destinataire légal' }),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(access.onActorRevalidated).not.toHaveBeenCalled();
    expect(access.onCompanyContextRejected).not.toHaveBeenCalled();
    expect(access.onWorkspaceAccessRejected).not.toHaveBeenCalled();
  },
);

const groupedVersionLocales = [
  {
    locale: 'ro',
    language: 'Română',
    open1000: 'Deschide versiunea 1.000',
    open1001: 'Deschide versiunea 1.001',
    predecessor1000: 'Versiunea precedentă: 1.000',
    predecessor1001: 'Versiunea precedentă: 1.001',
  },
  {
    locale: 'ru',
    language: 'Русский',
    open1000: 'Открыть версию 1\u00a0000',
    open1001: 'Открыть версию 1\u00a0001',
    predecessor1000: 'Предыдущая версия: 1\u00a0000',
    predecessor1001: 'Предыдущая версия: 1\u00a0001',
  },
  {
    locale: 'fr',
    language: 'Français',
    open1000: 'Ouvrir la version 1\u202f000',
    open1001: 'Ouvrir la version 1\u202f001',
    predecessor1000: 'Version précédente : 1\u202f000',
    predecessor1001: 'Version précédente : 1\u202f001',
  },
  {
    locale: 'en',
    language: 'English',
    open1000: 'Open version 1,000',
    open1001: 'Open version 1,001',
    predecessor1000: 'Previous version: 1,000',
    predecessor1001: 'Previous version: 1,001',
  },
];

it.each(groupedVersionLocales)(
  'groups history ordinals in $locale accessible names without localizing exact request IDs or selection callbacks',
  async ({ language, open1000, open1001 }) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const historical = pendingOffer({
      versionNumber: 1000,
      versionId: '1000',
    });
    historical.version.supersededByVersionId = '1001';
    historical.version.supersededAt = '2026-09-29T09:00:00.000Z';
    const head = pendingOffer({ versionNumber: 1001, versionId: '1001' });
    head.version.predecessorVersionId = '1000';
    const requests: string[] = [];
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const path = input.toString();
        expect(init?.method ?? 'GET').toBe('GET');
        expect(new Headers(init?.headers).get('x-company-context-id')).toBe(
          '3000',
        );
        requests.push(path);
        if (path === '/api/offers/opportunities/4000/versions')
          return response({
            versions: [
              {
                id: '1001',
                versionNumber: 1001,
                createdAt: '2026-09-29T09:00:00.000Z',
                supersededByVersionId: null,
              },
              {
                id: '1000',
                versionNumber: 1000,
                createdAt: '2026-09-27T09:00:00.000Z',
                supersededByVersionId: '1001',
              },
            ],
            nextCursor: null,
          });
        if (path === '/api/offers/opportunities/4000/versions/1000')
          return response({ offer: historical });
        throw new Error(`Unexpected grouped-history request: ${path}`);
      });
    const onSelect = vi.fn<(offer: OfferView) => void>();
    const reject = vi.fn(async () => undefined);
    render(
      <InterfaceLocaleProvider>
        <LanguageControls />
        <OfferVersionHistory
          identity={identity}
          companyId="3000"
          opportunityId="4000"
          offer={head}
          reject={reject}
          onSelect={onSelect}
        />
      </InterfaceLocaleProvider>,
    );
    expect(
      await screen.findAllByRole('button', { name: /^Open version /u }),
    ).toHaveLength(2);
    expect(requests).toEqual(['/api/offers/opportunities/4000/versions']);
    const requestCount = fetch.mock.calls.length;
    const languageControl = screen.getByRole('button', { name: language });
    languageControl.focus();
    fireEvent.click(languageControl);
    expect(languageControl).toHaveFocus();
    expect(fetch).toHaveBeenCalledTimes(requestCount);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: open1001 })).toBeDisabled();
    const historicalControl = screen.getByRole('button', {
      name: open1000,
    });
    expect(historicalControl).toBeEnabled();
    fireEvent.click(historicalControl);
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledExactlyOnceWith(historical),
    );
    expect(requests).toEqual([
      '/api/offers/opportunities/4000/versions',
      '/api/offers/opportunities/4000/versions/1000',
    ]);
    expect(onSelect.mock.calls[0]?.[0].version.versionNumber).toBe(1000);
    expect(onSelect.mock.calls[0]?.[0].version.id).toBe('1000');
    expect(head.version.versionNumber).toBe(1001);
    expect(head.version.id).toBe('1001');
  },
);

it.each(
  groupedVersionLocales.flatMap((locale) => [
    {
      ...locale,
      versionNumber: 1000,
      predecessor: locale.predecessor1000,
    },
    {
      ...locale,
      versionNumber: 1001,
      predecessor: locale.predecessor1001,
    },
  ]),
)(
  'groups predecessor ordinal $versionNumber in $locale while retaining the exact successor preparation context',
  async ({ language, versionNumber, predecessor }) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const saved = pendingOffer({
      versionNumber,
      versionId: String(versionNumber),
    });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        expect(init?.method ?? 'GET').toBe('GET');
        const path = input.toString();
        if (path === '/api/offers/opportunities/opportunity-one')
          return response({ offer: saved });
        if (path.endsWith('/versions'))
          return response({ versions: [], nextCursor: null });
        return preparationRead(input);
      });
    const access = callbacks();
    render(localizedTree({ access }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Prepare a new version' }),
    );
    await screen.findByRole('button', { name: 'Create new version' });
    const requestCount = fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: language }));
    expect(fetch).toHaveBeenCalledTimes(requestCount);
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === 'P' && element.textContent === predecessor,
      ),
    ).toBeVisible();
    expect(saved.version.versionNumber).toBe(versionNumber);
    expect(saved.version.id).toBe(String(versionNumber));
    expect(access.onActorRevalidated).not.toHaveBeenCalled();
    expect(access.onCompanyContextRejected).not.toHaveBeenCalled();
    expect(access.onWorkspaceAccessRejected).not.toHaveBeenCalled();
  },
);
