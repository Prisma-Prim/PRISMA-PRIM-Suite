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
import type { OfferView } from './offer-response';
import {
  pendingOffer,
  qualityRun,
  offerDecisionLocales,
  recordedDecision,
  withRecordedDecision,
  literalRejectionReason,
} from '../test/offer-quality-decision-fixture';

const identity = deterministicBrowserIdentity({
  'x-test-external-subject': 'localized-offer-approver',
});
const actor: ActorContext = {
  internalUserId: 'user-one',
  workspaceMembershipId: 'membership-one',
  workspaceId: 'workspace-one',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Synthetic approver',
  email: 'approver@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-one',
    displayName: 'Synthetic Company',
    commercialIntakePermissions: ['commercial.opportunity.read'],
    offerPermissions: ['commercial.offer.read', 'commercial.offer.approve'],
    offerApproverAssignmentId: 'approver-assignment-one',
  },
};

function LanguageControls() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      <button type="button" onClick={() => changeLocale('ro')}>
        Română
      </button>
      <button type="button" onClick={() => changeLocale('en')}>
        English
      </button>
      <button type="button" onClick={() => changeLocale('ru')}>
        Русский
      </button>
      <button type="button" onClick={() => changeLocale('fr')}>
        Français
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

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(interfaceLocaleStorageKey);
  document.documentElement.lang = '';
});

it('translates a pending exact Offer without replacing its literal reason, warning acknowledgement, focus or requests', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      const path = input.toString();
      if (path.endsWith('/offers/opportunities/opportunity-one'))
        return response({ offer: pendingOffer() });
      if (path.endsWith('/offers/opportunities/opportunity-one/versions'))
        return response({ versions: [], nextCursor: null });
      throw new Error(`Unexpected request: ${path}`);
    });
  render(
    <InterfaceLocaleProvider>
      <LanguageControls />
      <OfferPanel
        actor={actor}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />
    </InterfaceLocaleProvider>,
  );
  const decision = await screen.findByRole('region', {
    name: 'Internal decision',
  });
  expect(await screen.findByText('No versions recorded.')).toBeVisible();
  const reason = within(decision).getByRole('textbox', {
    name: 'Rejection reason',
  });
  const warning = within(decision).getByRole('checkbox', {
    name: 'Recipient tax ID recorded',
  });
  const literalReason = '  Clarificare {exactă} / Révision / Причина  ';
  fireEvent.change(reason, { target: { value: literalReason } });
  fireEvent.click(warning);
  reason.focus();
  if (!(reason instanceof HTMLTextAreaElement))
    throw new Error('Expected the public rejection textarea.');
  reason.setSelectionRange(2, 9);
  expect(reason).toHaveFocus();
  expect([reason.selectionStart, reason.selectionEnd]).toEqual([2, 9]);
  expect(warning).toBeChecked();
  const representation = screen.getByTitle('Illustrative Offer representation');
  const immutableHtml = representation.getAttribute('srcdoc');
  expect(immutableHtml).toBe(pendingOffer().version.representation.html);
  const before = fetch.mock.calls.length;

  fireEvent.click(screen.getByRole('button', { name: 'Română' }));

  expect(
    screen.getByRole('heading', {
      name: 'Verificări de calitate',
    }),
  ).toBeVisible();
  const localizedDecision = screen.getByRole('region', {
    name: 'Decizie internă',
  });
  expect(localizedDecision).toBe(decision);
  expect(
    within(localizedDecision).getByRole('textbox', {
      name: 'Motivul respingerii',
    }),
  ).toBe(reason);
  expect(reason).toHaveValue(literalReason);
  expect(reason).toHaveFocus();
  expect([reason.selectionStart, reason.selectionEnd]).toEqual([2, 9]);
  expect(
    within(localizedDecision).getByRole('checkbox', {
      name: 'Codul fiscal al destinatarului este înregistrat',
    }),
  ).toBe(warning);
  expect(warning).toBeChecked();
  expect(fetch.mock.calls).toHaveLength(before);
  expect(screen.getByTitle('Reprezentarea Ofertei ilustrative')).toBe(
    representation,
  );
  expect(representation).toHaveAttribute('srcdoc', immutableHtml);
  expect(
    screen.getByText(pendingOffer().version.representation.sha256),
  ).toBeVisible();
  expect(screen.getByText('Entité littérale / Юрлицо')).toBeVisible();
});

const keepCompanyContext = () => undefined;
function panel({
  currentActor = actor,
  currentIdentity = identity,
  onActorRevalidated,
}: {
  currentActor?: ActorContext;
  currentIdentity?: typeof identity;
  onActorRevalidated?: (value: ActorContext) => void;
} = {}) {
  return (
    <InterfaceLocaleProvider>
      <LanguageControls />
      <OfferPanel
        actor={currentActor}
        identity={currentIdentity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={keepCompanyContext}
        onActorRevalidated={onActorRevalidated}
      />
    </InterfaceLocaleProvider>
  );
}

function actorWithPermissions(
  permissions: NonNullable<
    NonNullable<ActorContext['activeCompany']>['offerPermissions']
  >,
): ActorContext {
  if (!actor.activeCompany)
    throw new Error('Expected synthetic active Company.');
  return {
    ...actor,
    activeCompany: { ...actor.activeCompany, offerPermissions: permissions },
  };
}

type Command = { path: string; init: RequestInit };
function installOffer({
  offer = pendingOffer(),
  reply = () => response({}, 503),
}: {
  offer?: OfferView;
  reply?: (command: Command) => Response | Promise<Response>;
} = {}) {
  const commands: Command[] = [];
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const path = input.toString();
      if (init?.method === 'POST') {
        const command = { path, init };
        commands.push(command);
        return reply(command);
      }
      if (path.endsWith('/access/current-actor')) return response(actor);
      if (path.endsWith('/offers/opportunities/opportunity-one/versions'))
        return response({ versions: [], nextCursor: null });
      if (path.endsWith('/offers/opportunities/opportunity-one'))
        return response({ offer });
      throw new Error(`Unexpected boundary request: ${path}`);
    });
  return { fetch, commands };
}

function deferredReply() {
  let resolve: ((value: Response) => void) | undefined;
  const promise = new Promise<Response>((complete) => {
    resolve = complete;
  });
  return {
    promise,
    complete(value: Response) {
      if (!resolve) throw new Error('Expected a deferred HTTP response.');
      resolve(value);
    },
  };
}

function description(label: string): HTMLElement {
  const value = screen
    .getByText(label, { selector: 'dt' })
    .parentElement?.querySelector('dd');
  if (!(value instanceof HTMLElement))
    throw new Error(`Missing description: ${label}`);
  return value;
}

it.each(offerDecisionLocales)(
  'shows all eight rule labels and three result labels in $code without changing their canonical Version',
  async (locale) => {
    localStorage.setItem(interfaceLocaleStorageKey, locale.code);
    const original = pendingOffer();
    original.version.latestQualityRun = qualityRun({ error: true });
    original.version.validUntil = '2026-10-03T12:00:00.000Z';
    original.version.validityElapsed = true;
    const observed = installOffer({ offer: original });
    render(panel());
    const quality = await screen.findByRole('region', { name: locale.quality });
    expect(await screen.findByText(locale.historyEmpty)).toBeVisible();
    for (const label of locale.rules)
      expect(within(quality).getByText(label)).toBeVisible();
    expect(within(quality).getByText(locale.errors)).toBeVisible();
    expect(within(quality).getAllByText(locale.pass)).toHaveLength(6);
    expect(within(quality).getByText(locale.warning)).toBeVisible();
    expect(within(quality).getByText(locale.error)).toBeVisible();
    expect(description(locale.qualityActor)).toHaveTextContent(
      'membership-one',
    );
    expect(description(locale.ruleSet)).toHaveTextContent(
      'OFFER_QUALITY_ILLUSTRATIVE v1',
    );
    expect(screen.getByTitle(locale.frame)).toHaveAttribute(
      'srcdoc',
      original.version.representation.html,
    );
    expect(
      screen.getByText(original.version.representation.sha256),
    ).toBeVisible();
    expect(observed.commands).toHaveLength(0);
  },
);

it.each(['success', 'warnings', 'errors'] as const)(
  'retranslates an already visible %s result without re-evaluating the exact Version',
  async (outcome) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const offer = pendingOffer();
    offer.version.latestQualityRun = qualityRun({
      warning: outcome === 'warnings',
      error: outcome === 'errors',
    });
    if (outcome !== 'warnings')
      offer.version.recipient.taxId = 'SYNTHETIC-RECORDED-ID';
    if (outcome === 'errors') {
      offer.version.validUntil = '2026-10-03T12:00:00.000Z';
      offer.version.validityElapsed = true;
    }
    const observed = installOffer({ offer });
    render(panel());
    await screen.findByText('No versions recorded.');
    const before = observed.fetch.mock.calls.length;
    for (const locale of offerDecisionLocales) {
      fireEvent.click(screen.getByRole('button', { name: locale.name }));
      expect(
        within(screen.getByRole('region', { name: locale.quality })).getByRole(
          'status',
        ),
      ).toHaveTextContent(locale[outcome]);
      expect(observed.fetch).toHaveBeenCalledTimes(before);
      expect(observed.commands).toHaveLength(0);
    }
  },
);

it('keeps the empty Quality state read-only in every locale without automatically starting a run', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const observed = installOffer({ offer: pendingOffer({ latestRun: false }) });
  render(
    panel({ currentActor: actorWithPermissions(['commercial.offer.read']) }),
  );
  await screen.findByText('No versions recorded.');
  const before = observed.fetch.mock.calls.length;
  for (const { language, message } of [
    {
      language: 'Română',
      message: 'Nu există încă nicio rulare a verificărilor de calitate.',
    },
    { language: 'Русский', message: 'Проверки качества ещё не выполнялись.' },
    {
      language: 'Français',
      message: 'Aucun contrôle qualité n’a encore été exécuté.',
    },
    { language: 'English', message: 'No Quality Check run yet.' },
  ]) {
    fireEvent.click(screen.getByRole('button', { name: language }));
    expect(screen.getByText(message)).toBeVisible();
    expect(observed.fetch).toHaveBeenCalledTimes(before);
    expect(observed.commands).toHaveLength(0);
  }
});

it.each([undefined, 'unsupported-language'])(
  'uses Romanian for the Quality and decision owners with saved choice %s',
  async (saved) => {
    if (saved !== undefined)
      localStorage.setItem(interfaceLocaleStorageKey, saved);
    installOffer();
    render(panel());
    expect(
      await screen.findByRole('region', { name: 'Decizie internă' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Verificări de calitate' }),
    ).toBeVisible();
  },
);

it.each([1, 2] as const)(
  'preserves an exact uncertain v%i Quality command and resets acknowledgements only for its genuinely new recorded run',
  async (bindingVersion) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const held = deferredReply();
    const saved = pendingOffer({ bindingVersion });
    const run = qualityRun({ bindingVersion, id: 'new-recorded-run' });
    const observed = installOffer({
      offer: saved,
      reply: () =>
        observed.commands.length === 1 ? held.promise : response(run),
    });
    render(panel());
    const decision = await screen.findByRole('region', {
      name: 'Internal decision',
    });
    await screen.findByText('No versions recorded.');
    const warning = within(decision).getByRole('checkbox', {
      name: 'Recipient tax ID recorded',
    });
    const reason = within(decision).getByRole('textbox', {
      name: 'Rejection reason',
    });
    fireEvent.click(warning);
    fireEvent.change(reason, { target: { value: literalRejectionReason } });
    fireEvent.click(screen.getByRole('button', { name: 'Run Quality Checks' }));
    await waitFor(() => expect(observed.commands).toHaveLength(1));
    const before = observed.fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(
      screen.getByRole('button', { name: 'Exécution des contrôles qualité…' }),
    ).toBeDisabled();
    expect(warning).toBeChecked();
    expect(reason).toHaveValue(literalRejectionReason);
    expect(observed.fetch).toHaveBeenCalledTimes(before);
    await act(async () => held.complete(response({}, 503)));
    expect(
      await screen.findByText(
        'Le résultat est incertain. Réessayer envoie exactement la même commande et la même clé.',
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Русский' }));
    expect(warning).toBeChecked();
    expect(reason).toHaveValue(literalRejectionReason);
    expect(observed.fetch).toHaveBeenCalledTimes(before);
    fireEvent.click(
      screen.getByRole('button', { name: 'Повторить те же проверки качества' }),
    );
    expect(
      await screen.findByText('Проверки завершены с предупреждениями.'),
    ).toBeVisible();
    await waitFor(() => expect(warning).not.toBeChecked());
    expect(reason).toHaveValue(literalRejectionReason);
    expect(observed.commands).toHaveLength(2);
    const [first, retry] = observed.commands;
    if (!first || !retry) throw new Error('Expected both Quality attempts.');
    expect(first.path).toBe(
      '/api/offers/opportunities/opportunity-one/versions/version-one/quality-checks',
    );
    expect(first.init.body).toBe('{}');
    expect(new Headers(first.init.headers).get('x-company-context-id')).toBe(
      'company-one',
    );
    expect(new Headers(first.init.headers).get('idempotency-key')).toBeTruthy();
    expect(retry.path).toBe(first.path);
    expect(retry.init.body).toBe(first.init.body);
    expect(new Headers(retry.init.headers).get('idempotency-key')).toBe(
      new Headers(first.init.headers).get('idempotency-key'),
    );
    expect(description('Набор правил')).toHaveTextContent(
      `OFFER_QUALITY_ILLUSTRATIVE v${bindingVersion}`,
    );
  },
);

it.each(
  ([1, 2] as const).flatMap((bindingVersion) =>
    (['approve', 'reject'] as const).map((kind) => ({ bindingVersion, kind })),
  ),
)(
  'keeps the exact v$bindingVersion $kind intent through delayed feedback and an explicit unchanged retry',
  async ({ bindingVersion, kind }) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const held = deferredReply();
    const saved = pendingOffer({ bindingVersion });
    const decision = recordedDecision({ offer: saved, kind });
    const observed = installOffer({
      offer: saved,
      reply: () =>
        observed.commands.length === 1 ? held.promise : response(decision),
    });
    render(panel());
    const region = await screen.findByRole('region', {
      name: 'Internal decision',
    });
    await screen.findByText('No versions recorded.');
    const reason = within(region).getByRole('textbox', {
      name: 'Rejection reason',
    });
    const warning = within(region).getByRole('checkbox', {
      name: 'Recipient tax ID recorded',
    });
    fireEvent.change(reason, { target: { value: literalRejectionReason } });
    fireEvent.click(warning);
    fireEvent.click(
      within(region).getByRole('button', {
        name:
          kind === 'approve' ? 'Approve this version' : 'Reject this version',
      }),
    );
    await waitFor(() => expect(observed.commands).toHaveLength(1));
    const before = observed.fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(screen.getByText('Enregistrement de la décision…')).toBeVisible();
    expect(reason).toHaveValue(literalRejectionReason);
    expect(reason).toBeDisabled();
    expect(warning).toBeChecked();
    expect(observed.fetch).toHaveBeenCalledTimes(before);
    await act(async () => held.complete(response({}, 503)));
    expect(
      await screen.findByText(
        'Le résultat est incertain. Réessayer envoie exactement la même décision, les mêmes valeurs et la même clé.',
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Русский' }));
    expect(observed.fetch).toHaveBeenCalledTimes(before);
    fireEvent.click(
      screen.getByRole('button', { name: 'Повторить то же решение' }),
    );
    expect(
      await screen.findByText(
        kind === 'approve' ? 'Версия одобрена.' : 'Версия отклонена.',
      ),
    ).toBeVisible();
    expect(observed.commands).toHaveLength(2);
    const [first, retry] = observed.commands;
    if (!first || !retry) throw new Error('Expected two decision attempts.');
    expect(first.path).toBe(
      `/api/offers/opportunities/opportunity-one/versions/version-one/${kind}`,
    );
    expect(first.init.body).toBe(
      JSON.stringify(
        kind === 'approve'
          ? {
              expectedOfferRevision: 1,
              acknowledgedWarningCodes: ['RECIPIENT_TAX_ID_RECORDED'],
            }
          : { expectedOfferRevision: 1, reason: literalRejectionReason },
      ),
    );
    expect(new Headers(first.init.headers).get('x-company-context-id')).toBe(
      'company-one',
    );
    expect(retry.path).toBe(first.path);
    expect(retry.init.body).toBe(first.init.body);
    expect(new Headers(first.init.headers).get('idempotency-key')).toBeTruthy();
    expect(new Headers(retry.init.headers).get('idempotency-key')).toBe(
      new Headers(first.init.headers).get('idempotency-key'),
    );
    expect(
      screen.queryByRole('textbox', { name: 'Причина отклонения' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTitle('Представление иллюстративной Оферты'),
    ).toHaveAttribute('srcdoc', saved.version.representation.html);
    if (kind === 'reject')
      expect(description('Причина отклонения').textContent).toBe(
        literalRejectionReason,
      );
    else {
      expect(
        description('Запуск проверок качества при одобрении'),
      ).toHaveTextContent(
        `approval-run-version-one · OFFER_QUALITY_ILLUSTRATIVE v${bindingVersion}`,
      );
      expect(
        description('Контрольная сумма одобренного представления'),
      ).toHaveTextContent(saved.version.representation.sha256);
    }
  },
);

it('retranslates correctable rejection validation without discarding the literal draft', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const observed = installOffer({
    reply: () => response({ code: 'OFFER_VALIDATION_ERROR' }, 400),
  });
  render(panel());
  const region = await screen.findByRole('region', {
    name: 'Internal decision',
  });
  const reason = within(region).getByRole('textbox', {
    name: 'Rejection reason',
  });
  fireEvent.click(
    within(region).getByRole('button', { name: 'Reject this version' }),
  );
  expect(observed.commands).toHaveLength(0);
  expect(
    screen.getByText(
      'Enter a rejection reason of 1–500 characters, or check the warning acknowledgements.',
    ),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Română' }));
  expect(screen.getByText(offerDecisionLocales[0].invalid)).toBeVisible();
  fireEvent.change(reason, { target: { value: literalRejectionReason } });
  fireEvent.click(
    screen.getByRole('button', { name: 'Respinge această versiune' }),
  );
  await waitFor(() => expect(observed.commands).toHaveLength(1));
  expect(
    await screen.findByText(offerDecisionLocales[0].invalid),
  ).toBeVisible();
  expect(reason).toHaveValue(literalRejectionReason);
  expect(reason).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Français' }));
  expect(screen.getByText(offerDecisionLocales[2].invalid)).toBeVisible();
  expect(reason).toHaveValue(literalRejectionReason);
  expect(observed.commands).toHaveLength(1);
});

const decisionRefusals = [
  {
    status: 409,
    code: 'STALE_OFFER_REVISION',
    message: 'L’Offre a changé. Rechargez la Demande avant de décider.',
  },
  {
    status: 409,
    code: 'OFFER_VERSION_SUPERSEDED',
    message: 'Cette version a été remplacée. Rechargez la Demande.',
  },
  {
    status: 409,
    code: 'OFFER_VERSION_ALREADY_DECIDED',
    message: 'Cette version a déjà une décision. Rechargez la Demande.',
  },
  {
    status: 409,
    code: 'IDEMPOTENCY_CONFLICT',
    message:
      'Cette nouvelle tentative ne correspond plus. Rechargez la Demande.',
  },
  {
    status: 409,
    code: 'QUALITY_CHECK_ERRORS',
    message:
      'Les erreurs actuelles des contrôles qualité empêchent l’approbation. Exécutez les contrôles qualité pour les consulter.',
  },
  {
    status: 409,
    code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
    message:
      'Reconnaissez exactement les avertissements actuels. Exécutez les contrôles qualité pour les actualiser.',
  },
  {
    status: 404,
    code: '',
    message:
      'La version de l’Offre n’est plus disponible. Rechargez la Demande.',
  },
  {
    status: 400,
    code: 'OFFER_VALIDATION_ERROR',
    message: offerDecisionLocales[2].invalid,
  },
  {
    status: 403,
    code: '',
    message: 'L’accès à la décision n’est plus disponible.',
  },
] as const;
it.each(decisionRefusals)(
  'keeps known decision refusal $code ($status) distinct from uncertainty in the current locale',
  async ({ status, code, message }) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const held = deferredReply();
    const observed = installOffer({ reply: () => held.promise });
    const revalidated = vi.fn();
    render(panel({ onActorRevalidated: revalidated }));
    const region = await screen.findByRole('region', {
      name: 'Internal decision',
    });
    await screen.findByText('No versions recorded.');
    const reason = within(region).getByRole('textbox', {
      name: 'Rejection reason',
    });
    fireEvent.change(reason, { target: { value: literalRejectionReason } });
    fireEvent.click(
      within(region).getByRole('button', { name: 'Approve this version' }),
    );
    await waitFor(() => expect(observed.commands).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    await act(async () =>
      held.complete(
        response({ code, privateDetail: 'HIDDEN-INTERNAL-METADATA' }, status),
      ),
    );
    expect(await screen.findByText(message)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Réessayer la même décision' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('HIDDEN-INTERNAL-METADATA'),
    ).not.toBeInTheDocument();
    expect(observed.commands).toHaveLength(1);
    if (status === 403) expect(revalidated).toHaveBeenCalledTimes(1);
    if (status === 400 || code.startsWith('QUALITY_CHECK_'))
      expect(reason).toHaveValue(literalRejectionReason);
  },
);

it.each([
  {
    status: 400,
    code: 'OFFER_VALIDATION_ERROR',
    message:
      'La commande de contrôle qualité a été refusée. Rechargez la Demande.',
  },
  {
    status: 404,
    code: '',
    message:
      'La version de l’Offre n’est plus disponible. Rechargez la Demande.',
  },
  {
    status: 409,
    code: 'OFFER_VERSION_SUPERSEDED',
    message: 'Cette version de l’Offre a été remplacée. Rechargez la Demande.',
  },
  {
    status: 409,
    code: 'IDEMPOTENCY_CONFLICT',
    message:
      'Cette nouvelle tentative ne correspond plus à sa commande enregistrée. Rechargez la Demande.',
  },
  {
    status: 403,
    code: '',
    message: 'L’accès aux contrôles qualité n’est plus disponible.',
  },
])(
  'keeps known Quality refusal $code ($status) distinct from uncertainty after a locale change',
  async ({ status, code, message }) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const held = deferredReply();
    const observed = installOffer({ reply: () => held.promise });
    render(panel());
    fireEvent.click(
      await screen.findByRole('button', { name: 'Run Quality Checks' }),
    );
    await waitFor(() => expect(observed.commands).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    await act(async () => held.complete(response({ code }, status)));
    expect(await screen.findByText(message)).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: 'Réessayer les mêmes contrôles qualité',
      }),
    ).not.toBeInTheDocument();
    expect(observed.commands).toHaveLength(1);
  },
);

it.each([
  {
    mode: 'preparer',
    permissions: ['commercial.offer.read', 'commercial.offer.prepare'],
    run: true,
    decide: false,
  },
  {
    mode: 'approver',
    permissions: ['commercial.offer.read', 'commercial.offer.approve'],
    run: true,
    decide: true,
  },
  {
    mode: 'reader',
    permissions: ['commercial.offer.read'],
    run: false,
    decide: false,
  },
] satisfies Array<{
  mode: string;
  permissions: NonNullable<
    NonNullable<ActorContext['activeCompany']>['offerPermissions']
  >;
  run: boolean;
  decide: boolean;
}>)(
  'preserves independent $mode authority across all four locales',
  async ({ permissions, run, decide }) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const observed = installOffer();
    render(panel({ currentActor: actorWithPermissions(permissions) }));
    await screen.findByText('No versions recorded.');
    const reads = observed.fetch.mock.calls.length;
    for (const locale of offerDecisionLocales) {
      fireEvent.click(screen.getByRole('button', { name: locale.name }));
      expect(screen.queryByRole('button', { name: locale.run }) !== null).toBe(
        run,
      );
      expect(
        screen.queryByRole('button', { name: locale.approve }) !== null,
      ).toBe(decide);
      expect(
        screen.queryByRole('button', { name: locale.reject }) !== null,
      ).toBe(decide);
      expect(
        screen.getByRole('region', { name: locale.quality }),
      ).toBeVisible();
      expect(observed.fetch).toHaveBeenCalledTimes(reads);
    }
    expect(observed.commands).toHaveLength(0);
  },
);

it.each(['company', 'authority', 'identity'] as const)(
  'suppresses a late decision after genuine %s retirement, while locale alone keeps the attempt live',
  async (retirement) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const held = deferredReply();
    const saved = pendingOffer();
    const observed = installOffer({ reply: () => held.promise });
    const rendered = render(panel());
    fireEvent.click(
      await screen.findByRole('button', { name: 'Approve this version' }),
    );
    await waitFor(() => expect(observed.commands).toHaveLength(1));
    const first = observed.commands[0];
    if (!first) throw new Error('Expected pending decision.');
    expect(first.init.signal?.aborted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Română' }));
    expect(first.init.signal?.aborted).toBe(false);
    if (retirement === 'identity')
      rendered.rerender(
        panel({
          currentIdentity: deterministicBrowserIdentity({
            'x-test-external-subject': 'new-session-user',
          }),
        }),
      );
    else if (retirement === 'authority')
      rendered.rerender(
        panel({
          currentActor: actorWithPermissions(['commercial.offer.read']),
        }),
      );
    else {
      if (!actor.activeCompany) throw new Error('Expected Company.');
      rendered.rerender(
        panel({
          currentActor: {
            ...actor,
            activeCompany: { ...actor.activeCompany, id: 'company-two' },
          },
        }),
      );
    }
    await waitFor(() => expect(first.init.signal?.aborted).toBe(true));
    await act(async () =>
      held.complete(
        response(recordedDecision({ offer: saved, kind: 'approve' })),
      ),
    );
    expect(screen.queryByText('Versiune aprobată.')).not.toBeInTheDocument();
    expect(
      screen.queryByText('approval-run-version-one'),
    ).not.toBeInTheDocument();
    expect(observed.commands).toHaveLength(1);
  },
);

it.each(offerDecisionLocales)(
  'reopens immutable attributed approval and rejection summaries in $code with bound v1/v2 runs and literal reasons',
  async (locale) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const first = withRecordedDecision({
      offer: pendingOffer({ versionId: 'historical-rejected' }),
      kind: 'reject',
    });
    const noWarningVersion = pendingOffer({
      versionId: 'historical-no-warnings',
      bindingVersion: 2,
    });
    noWarningVersion.version.recipient.taxId = 'SYNTHETIC-RECORDED-ID';
    const second = withRecordedDecision({
      offer: noWarningVersion,
      kind: 'approve',
      warning: false,
    });
    const third = withRecordedDecision({
      offer: pendingOffer({ versionId: 'current-approved', bindingVersion: 2 }),
      kind: 'approve',
    });
    const versionsBefore = [first, second, third];
    const versions: OfferView[] = versionsBefore.map((offer, index) => ({
      ...offer,
      revision: 6,
      version: {
        ...offer.version,
        versionNumber: index + 1,
        predecessorVersionId:
          index === 0 ? null : (versionsBefore[index - 1]?.version.id ?? null),
        supersededByVersionId: index === 2 ? null : third.version.id,
        supersededAt: index === 2 ? null : '2026-10-04T09:00:00.000Z',
      },
    }));
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        expect(init?.method ?? 'GET').toBe('GET');
        const path = input.toString();
        if (path.endsWith('/versions'))
          return response({
            versions: [...versions].reverse().map((offer) => ({
              id: offer.version.id,
              versionNumber: offer.version.versionNumber,
              createdAt: '2026-09-27T09:00:00.000Z',
              supersededByVersionId: offer.version.supersededByVersionId,
            })),
            nextCursor: null,
          });
        const found = versions.find((offer) =>
          path.endsWith(`/versions/${offer.version.id}`),
        );
        return response({ offer: found ?? versions[2] });
      });
    render(
      panel({ currentActor: actorWithPermissions(['commercial.offer.read']) }),
    );
    await screen.findByRole('button', { name: 'Open version 1' });
    fireEvent.click(screen.getByRole('button', { name: locale.name }));
    const reads = fetch.mock.calls.length;
    expect(description(locale.actor)).toHaveTextContent('membership-one');
    expect(description(locale.decisionRun)).toHaveTextContent(
      'approval-run-current-approved · OFFER_QUALITY_ILLUSTRATIVE v2',
    );
    expect(description(locale.acknowledgedWarnings)).toHaveTextContent(
      locale.rules[5],
    );
    expect(description(locale.checksum)).toHaveTextContent(
      third.version.representation.sha256,
    );
    expect(screen.getByTitle(locale.frame)).toHaveAttribute(
      'srcdoc',
      third.version.representation.html,
    );
    expect(fetch).toHaveBeenCalledTimes(reads);
    fireEvent.click(screen.getByRole('button', { name: locale.openTwo }));
    await waitFor(() =>
      expect(description(locale.acknowledgedWarnings)).toHaveTextContent(
        locale.noWarnings,
      ),
    );
    expect(description(locale.decisionRun)).toHaveTextContent(
      'approval-run-historical-no-warnings · OFFER_QUALITY_ILLUSTRATIVE v2',
    );
    fireEvent.click(
      await screen.findByRole('button', { name: locale.openOne }),
    );
    await waitFor(() =>
      expect(description(locale.reason).textContent).toBe(
        literalRejectionReason,
      ),
    );
    expect(description(locale.actor)).toHaveTextContent('membership-one');
    expect(screen.getByTitle(locale.frame)).toHaveAttribute(
      'srcdoc',
      first.version.representation.html,
    );
    expect(
      screen.queryByRole('button', { name: locale.run }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: locale.approve }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: locale.reason }),
    ).not.toBeInTheDocument();
  },
);
