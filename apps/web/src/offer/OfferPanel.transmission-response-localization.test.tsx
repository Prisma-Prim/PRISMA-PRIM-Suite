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
import {
  pendingOffer,
  qualityRun,
  withRecordedDecision,
} from '../test/offer-quality-decision-fixture';
import { OfferPanel } from './OfferPanel';
import type { OfferClientResponseView, OfferView } from './offer-response';
import {
  approvedTransmissionOffer,
  clientResponseRecord,
  literalClientReason,
  literalReceivedAt,
  literalSimulationNote,
  offerTransmissionLocales,
  transmissionRecord,
  withClientResponse,
  withTransmission,
} from '../test/offer-transmission-response-fixture';

const identity = deterministicBrowserIdentity({
  'x-test-external-subject': 'localized-offer-transmitter',
});
const actor: ActorContext = {
  internalUserId: 'user-one',
  workspaceMembershipId: 'membership-one',
  workspaceId: 'workspace-one',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Synthetic transmitter',
  email: 'transmitter@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-one',
    displayName: 'Synthetic Company',
    commercialIntakePermissions: ['commercial.opportunity.read'],
    offerPermissions: [
      'commercial.offer.read',
      'commercial.offer.transmission.record',
    ],
    offerPermissionAssignmentId: 'preparer-assignment-one',
  },
};

function LanguageControls() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {offerTransmissionLocales.map((locale) => (
        <button
          key={locale.code}
          type="button"
          onClick={() => changeLocale(locale.code)}
        >
          {locale.name}
        </button>
      ))}
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

it('translates the approved exact Offer transmission while retaining its literal note, new warning, focus and HTTP identity', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const approved = withRecordedDecision({
    offer: pendingOffer(),
    kind: 'approve',
    warning: false,
  });
  const offer: OfferView = {
    ...approved,
    version: {
      ...approved.version,
      latestQualityRun: {
        ...qualityRun({ id: 'new-unacknowledged-warning-run' }),
        evaluatedAt: '2026-10-03T12:20:00.000Z',
      },
    },
  };
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      const path = input.toString();
      if (path.endsWith('/offers/opportunities/opportunity-one'))
        return response({ offer });
      if (path.endsWith('/offers/opportunities/opportunity-one/versions'))
        return response({ versions: [], nextCursor: null });
      throw new Error(`Unexpected HTTP boundary request: ${path}`);
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
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
    </InterfaceLocaleProvider>,
  );
  const transmission = await screen.findByRole('region', {
    name: 'Simulated transmission',
  });
  expect(await screen.findByText('No versions recorded.')).toBeVisible();
  const note = within(transmission).getByRole('textbox', {
    name: 'Simulation note',
  });
  const warning = within(transmission).getByRole('checkbox', {
    name: 'Recipient tax ID recorded',
  });
  const literalNote = '  Notă {exactă} / Révision / Причина  ';
  fireEvent.change(note, { target: { value: literalNote } });
  fireEvent.click(warning);
  note.focus();
  if (!(note instanceof HTMLTextAreaElement))
    throw new Error('Expected the public simulation-note textarea.');
  note.setSelectionRange(2, 9);
  expect(note).toHaveValue(literalNote);
  expect(note).toHaveFocus();
  expect(warning).toBeChecked();
  const representation = screen.getByTitle('Illustrative Offer representation');
  expect(representation).toHaveAttribute(
    'srcdoc',
    offer.version.representation.html,
  );
  const readsBeforeSwitch = fetch.mock.calls.length;
  expect(readsBeforeSwitch).toBe(2);

  fireEvent.click(screen.getByRole('button', { name: 'Română' }));

  expect(document.documentElement).toHaveAttribute('lang', 'ro');
  expect(transmission).toBeInTheDocument();
  expect(within(transmission).getByRole('textbox')).toBe(note);
  expect(within(transmission).getByRole('checkbox')).toBe(warning);
  expect(note).toHaveValue(literalNote);
  expect(note).toHaveFocus();
  expect([note.selectionStart, note.selectionEnd]).toEqual([2, 9]);
  expect(warning).toBeChecked();
  expect(fetch.mock.calls).toHaveLength(readsBeforeSwitch);
  expect(onCompanyContextRejected).not.toHaveBeenCalled();
  expect(onActorRevalidated).not.toHaveBeenCalled();
  expect(onWorkspaceAccessRejected).not.toHaveBeenCalled();
  expect(screen.getByTitle('Reprezentarea Ofertei ilustrative')).toBe(
    representation,
  );
  expect(representation).toHaveAttribute(
    'srcdoc',
    offer.version.representation.html,
  );
  expect(
    screen.getAllByText(offer.version.representation.sha256).length,
  ).toBeGreaterThan(0);
  expect(screen.getByText('Entité littérale / Юрлицо')).toBeVisible();
  expect(
    screen.getByText('Versiune', { selector: 'dt' }).nextElementSibling,
  ).toHaveTextContent('1');

  expect
    .soft(
      within(transmission).queryByRole('heading', {
        name: 'Transmitere simulată',
      }),
    )
    .toBeVisible();
  expect
    .soft(
      within(transmission).queryByRole('textbox', {
        name: 'Nota simulării',
      }),
    )
    .toBe(note);
  expect
    .soft(
      within(transmission).queryByRole('checkbox', {
        name: 'Codul fiscal al destinatarului este înregistrat',
      }),
    )
    .toBe(warning);
});

type Command = { path: string; init: RequestInit };
const keepContext = () => undefined;
function publicTree({
  currentActor = actor,
  currentIdentity = identity,
  opportunityId = 'opportunity-one',
  onActorRevalidated = keepContext,
}: {
  currentActor?: ActorContext;
  currentIdentity?: typeof identity;
  opportunityId?: string;
  onActorRevalidated?: (actor: ActorContext) => void;
} = {}) {
  return (
    <InterfaceLocaleProvider>
      <LanguageControls />
      <OfferPanel
        actor={currentActor}
        identity={currentIdentity}
        opportunityId={opportunityId}
        onCompanyContextRejected={keepContext}
        onActorRevalidated={onActorRevalidated}
      />
    </InterfaceLocaleProvider>
  );
}
function permissions(
  values: NonNullable<
    NonNullable<ActorContext['activeCompany']>['offerPermissions']
  >,
): ActorContext {
  if (!actor.activeCompany) throw new Error('Expected synthetic Company.');
  return {
    ...actor,
    activeCompany: { ...actor.activeCompany, offerPermissions: values },
  };
}
function installBoundary({
  offer,
  reply = () => response({}, 503),
}: {
  offer: OfferView;
  reply?: (command: Command) => Response | Promise<Response>;
}) {
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
      if (path.endsWith('/versions'))
        return response({ versions: [], nextCursor: null });
      if (path.includes('/offers/opportunities/')) return response({ offer });
      throw new Error(`Unexpected HTTP boundary request: ${path}`);
    });
  return { fetch, commands };
}
function deferredReply() {
  let resolve: ((reply: Response) => void) | undefined;
  const promise = new Promise<Response>((complete) => {
    resolve = complete;
  });
  return {
    promise,
    release(reply: Response) {
      if (!resolve) throw new Error('Expected pending HTTP reply.');
      resolve(reply);
    },
  };
}
function description(
  label: string,
  scope: HTMLElement = document.body,
): HTMLElement {
  const term = within(scope).getByText(label, { selector: 'dt', exact: true });
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement))
    throw new Error(`Missing description for ${label}`);
  return value;
}
function sameAttempt({
  first,
  second,
}: {
  first: Command | undefined;
  second: Command | undefined;
}) {
  if (!first || !second) throw new Error('Expected both HTTP attempts.');
  expect(second.path).toBe(first.path);
  expect(second.init.body).toBe(first.init.body);
  expect(second.init.headers).toEqual(first.init.headers);
  expect(new Headers(first.init.headers).get('idempotency-key')).toBeTruthy();
  expect(new Headers(first.init.headers).get('x-company-context-id')).toBe(
    'company-one',
  );
}

it.each(offerTransmissionLocales)(
  'preserves a pending and uncertain transmission and its exact retry in $code',
  async (locale) => {
    localStorage.setItem(interfaceLocaleStorageKey, locale.code);
    const offer = approvedTransmissionOffer();
    const gate = deferredReply();
    const observed = installBoundary({
      offer,
      reply: () =>
        observed.commands.length === 1
          ? gate.promise
          : response(transmissionRecord({ offer })),
    });
    render(publicTree());
    const panel = await screen.findByRole('region', {
      name: locale.transmission,
    });
    await screen.findByText(locale.historyEmpty);
    const note = within(panel).getByRole('textbox', { name: locale.note });
    const warning = within(panel).getByRole('checkbox', {
      name: locale.rules[5],
    });
    fireEvent.change(note, { target: { value: literalSimulationNote } });
    fireEvent.click(warning);
    fireEvent.click(within(panel).getByRole('button', { name: locale.record }));
    expect(await within(panel).findByRole('status')).toHaveTextContent(
      locale.runningTransmission,
    );
    await waitFor(() => expect(observed.commands).toHaveLength(1));
    const requests = observed.fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(note).toBe(
      within(panel).getByRole('textbox', { name: 'Note de simulation' }),
    );
    expect(note).toHaveValue(literalSimulationNote);
    expect(warning).toBeChecked();
    expect(note).toBeDisabled();
    expect(observed.fetch.mock.calls).toHaveLength(requests);
    await act(async () => gate.release(response({}, 503)));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'Le résultat est incertain. Réessayer envoie exactement la même transmission, les mêmes valeurs et la même clé.',
    );
    fireEvent.click(screen.getByRole('button', { name: locale.name }));
    expect(within(panel).getByRole('alert')).toHaveTextContent(
      locale.uncertainTransmission,
    );
    expect(observed.fetch.mock.calls).toHaveLength(requests);
    fireEvent.click(
      within(panel).getByRole('button', { name: locale.retryTransmission }),
    );
    expect(await screen.findByText(locale.transmissionActor)).toBeVisible();
    sameAttempt({ first: observed.commands[0], second: observed.commands[1] });
    expect(observed.commands[0]?.path).toBe(
      '/api/offers/opportunities/opportunity-one/versions/version-one/transmission',
    );
    expect(observed.commands[0]?.init.body).toBe(
      JSON.stringify({
        expectedOfferRevision: 2,
        acknowledgedWarningCodes: ['RECIPIENT_TAX_ID_RECORDED'],
        note: literalSimulationNote,
      }),
    );
    expect(description(locale.transmissionRun)).toHaveTextContent(
      'transmission-run-version-one',
    );
    expect(description(locale.transmissionWarnings)).toHaveTextContent(
      locale.rules[5],
    );
    expect(description(locale.transmissionChecksum)).toHaveTextContent(
      offer.version.representation.sha256,
    );
    expect(screen.getByTitle(locale.frame)).toHaveAttribute(
      'srcdoc',
      offer.version.representation.html,
    );
  },
);

for (const outcome of ['ACCEPTED', 'REJECTED', 'EXPIRED'] satisfies Array<
  OfferClientResponseView['outcome']
>) {
  it.each(offerTransmissionLocales)(
    `preserves the literal UTC draft and exact uncertain ${outcome} retry in $code with minimal response authority`,
    async (locale) => {
      localStorage.setItem(interfaceLocaleStorageKey, locale.code);
      const base = withTransmission({
        offer: approvedTransmissionOffer({
          offerId: `offer-${outcome}`,
          versionId: `version-${outcome}`,
          bindingVersion: outcome === 'REJECTED' ? 2 : 1,
        }),
      });
      const offer: OfferView = {
        ...base,
        version: { ...base.version, validityElapsed: outcome === 'EXPIRED' },
      };
      const gate = deferredReply();
      const observed = installBoundary({
        offer,
        reply: () =>
          observed.commands.length === 1
            ? gate.promise
            : response(clientResponseRecord({ offer, outcome })),
      });
      const currentActor = permissions([
        'commercial.offer.read',
        'commercial.offer.response.record',
      ]);
      render(publicTree({ currentActor }));
      const panel = await screen.findByRole('region', {
        name: locale.response,
      });
      await screen.findByText(locale.historyEmpty);
      const time = within(panel).getByRole('textbox', {
        name: locale.received,
      });
      const reason = within(panel).getByRole('textbox', {
        name: locale.clientReason,
      });
      expect(time).toHaveAttribute('type', 'text');
      expect(time).toHaveAttribute('placeholder', '2026-10-03T14:30:00.000Z');
      fireEvent.change(time, { target: { value: literalReceivedAt } });
      fireEvent.change(reason, { target: { value: literalClientReason } });
      time.focus();
      fireEvent.click(screen.getByRole('button', { name: 'Français' }));
      expect(
        within(panel).getByRole('textbox', {
          name: 'Date et heure de réception déclarées (UTC)',
        }),
      ).toBe(time);
      expect(time).toHaveFocus();
      expect(time).toHaveValue(literalReceivedAt);
      expect(reason).toHaveValue(literalClientReason);
      expect(observed.commands).toHaveLength(0);
      fireEvent.click(screen.getByRole('button', { name: locale.name }));
      fireEvent.click(
        within(panel).getByRole('button', {
          name:
            outcome === 'ACCEPTED'
              ? locale.acceptClient
              : outcome === 'REJECTED'
                ? locale.rejectClient
                : locale.expireClient,
        }),
      );
      expect(await within(panel).findByRole('status')).toHaveTextContent(
        locale.runningResponse,
      );
      await waitFor(() => expect(observed.commands).toHaveLength(1));
      const requests = observed.fetch.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Français' }));
      expect(observed.fetch.mock.calls).toHaveLength(requests);
      await act(async () => gate.release(response({}, 503)));
      expect(await within(panel).findByRole('alert')).toHaveTextContent(
        'Le résultat est incertain. Réessayer envoie exactement le même résultat, les mêmes valeurs, la même révision et la même clé.',
      );
      fireEvent.click(screen.getByRole('button', { name: locale.name }));
      expect(within(panel).getByRole('alert')).toHaveTextContent(
        locale.uncertainResponse,
      );
      expect(time).toHaveValue(literalReceivedAt);
      expect(reason).toHaveValue(literalClientReason);
      expect(observed.fetch.mock.calls).toHaveLength(requests);
      fireEvent.click(
        within(panel).getByRole('button', { name: locale.retryResponse }),
      );
      expect(await screen.findByText(locale.responseActor)).toBeVisible();
      sameAttempt({
        first: observed.commands[0],
        second: observed.commands[1],
      });
      expect(observed.commands[0]?.path).toBe(
        `/api/offers/opportunities/opportunity-one/versions/version-${outcome}/client-response`,
      );
      expect(observed.commands[0]?.init.body).toBe(
        JSON.stringify({
          expectedOfferRevision: 3,
          outcome,
          ...(outcome === 'EXPIRED' ? {} : { receivedAt: literalReceivedAt }),
          ...(outcome === 'REJECTED' ? { reason: literalClientReason } : {}),
        }),
      );
      expect(description(locale.responseActor)).toHaveTextContent(
        'membership-one',
      );
      if (outcome === 'EXPIRED')
        expect(
          screen.queryByText(locale.recordedReceived, { selector: 'dt' }),
        ).not.toBeInTheDocument();
      if (outcome === 'REJECTED')
        expect(description(locale.clientReason).textContent).toBe(
          literalClientReason,
        );
      expect(
        screen.queryByRole('textbox', { name: locale.received }),
      ).not.toBeInTheDocument();
      expect(screen.getByTitle(locale.frame)).toHaveAttribute(
        'srcdoc',
        offer.version.representation.html,
      );
      expect(
        observed.fetch.mock.calls.filter(([input]) =>
          /clients|snapshots|quality-checks/u.test(String(input)),
        ),
      ).toHaveLength(0);
    },
  );
}

const feedbackCases = [
  {
    panel: 'transmission',
    code: 'STALE_OFFER_REVISION',
    text: 'L’Offre a changé. Rechargez la Demande avant la transmission.',
  },
  {
    panel: 'transmission',
    code: 'OFFER_VERSION_SUPERSEDED',
    text: 'Cette version a été remplacée. Rechargez la Demande.',
  },
  {
    panel: 'transmission',
    code: 'OFFER_VERSION_ALREADY_TRANSMITTED',
    text: 'Cette version possède déjà une transmission simulée. Rechargez la Demande.',
  },
  {
    panel: 'transmission',
    code: 'OFFER_VERSION_NOT_APPROVED',
    text: 'Cette version n’est plus approuvée. Rechargez la Demande.',
  },
  {
    panel: 'transmission',
    code: 'REPRESENTATION_MISMATCH',
    text: 'La représentation ne correspond pas à la version approuvée. Rechargez la Demande.',
  },
  {
    panel: 'transmission',
    code: 'QUALITY_CHECK_ERRORS',
    text: 'Les erreurs actuelles des contrôles qualité empêchent la transmission. Exécutez les contrôles qualité pour les consulter.',
  },
  {
    panel: 'transmission',
    code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
    text: 'Reconnaissez exactement les nouveaux avertissements. Exécutez les contrôles qualité pour les actualiser.',
  },
  {
    panel: 'transmission',
    code: 'IDEMPOTENCY_CONFLICT',
    text: 'Cette nouvelle tentative ne correspond plus. Rechargez la Demande.',
  },
  {
    panel: 'response',
    code: 'STALE_OFFER_REVISION',
    text: 'L’Offre a changé. Rechargez la Demande avant d’enregistrer une réponse du Client.',
  },
  {
    panel: 'response',
    code: 'OFFER_VERSION_SUPERSEDED',
    text: 'Cette version a été remplacée. Rechargez la Demande.',
  },
  {
    panel: 'response',
    code: 'CLIENT_RESPONSE_ALREADY_RECORDED',
    text: 'Cette version possède déjà une réponse du Client. Rechargez la Demande.',
  },
  {
    panel: 'response',
    code: 'OFFER_VERSION_NOT_TRANSMITTED',
    text: 'Cette version n’est pas transmise. Rechargez la Demande.',
  },
  {
    panel: 'response',
    code: 'OFFER_VALIDITY_ELAPSED',
    text: 'La réponse déclarée a été reçue après la fin de validité. Corrigez la date et heure de réception ou enregistrez l’expiration.',
  },
  {
    panel: 'response',
    code: 'OFFER_VALIDITY_NOT_ELAPSED',
    text: 'La validité n’est pas terminée. L’expiration ne peut pas encore être enregistrée.',
  },
  {
    panel: 'response',
    code: 'IDEMPOTENCY_CONFLICT',
    text: 'Cette nouvelle tentative ne correspond plus. Rechargez la Demande.',
  },
] as const;
it.each(feedbackCases)(
  'renders late $panel $code feedback in the current locale without retrying or resetting drafts',
  async ({ panel: kind, code, text }) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const gate = deferredReply();
    const offer =
      kind === 'transmission'
        ? approvedTransmissionOffer()
        : withTransmission();
    const observed = installBoundary({ offer, reply: () => gate.promise });
    render(
      publicTree({
        currentActor: permissions([
          'commercial.offer.read',
          'commercial.offer.transmission.record',
          'commercial.offer.response.record',
        ]),
      }),
    );
    await screen.findByText('No versions recorded.');
    const panel = screen.getByRole('region', {
      name:
        kind === 'transmission'
          ? 'Simulated transmission'
          : 'Simulated Client response',
    });
    const field = within(panel).getByRole('textbox', {
      name:
        kind === 'transmission'
          ? 'Simulation note'
          : 'Reported received time (UTC)',
    });
    const value =
      kind === 'transmission' ? literalSimulationNote : literalReceivedAt;
    fireEvent.change(field, { target: { value } });
    fireEvent.click(
      within(panel).getByRole('button', {
        name:
          kind === 'transmission'
            ? 'Record simulated transmission'
            : 'Record simulated acceptance',
      }),
    );
    await waitFor(() => expect(observed.commands).toHaveLength(1));
    const requests = observed.fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(observed.fetch.mock.calls).toHaveLength(requests);
    await act(async () => gate.release(response({ code }, 409)));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(text);
    expect(observed.commands).toHaveLength(1);
    expect(
      within(panel).queryByRole('button', { name: /^Réessayer/u }),
    ).not.toBeInTheDocument();
    if (field.isConnected) expect(field).toHaveValue(value);
  },
);

it.each(['transmission', 'response'] as const)(
  'uses current-language late %s validation, preserves literals and assigns a fresh key to corrected input',
  async (kind) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const offer =
      kind === 'transmission'
        ? approvedTransmissionOffer()
        : withTransmission();
    const gate = deferredReply();
    const observed = installBoundary({
      offer,
      reply: () =>
        observed.commands.length === 1 ? gate.promise : response({}, 503),
    });
    render(
      publicTree({
        currentActor: permissions([
          'commercial.offer.read',
          'commercial.offer.transmission.record',
          'commercial.offer.response.record',
        ]),
      }),
    );
    await screen.findByText('No versions recorded.');
    const panel = screen.getByRole('region', {
      name:
        kind === 'transmission'
          ? 'Simulated transmission'
          : 'Simulated Client response',
    });
    const field = within(panel).getByRole('textbox', {
      name:
        kind === 'transmission'
          ? 'Simulation note'
          : 'Reported received time (UTC)',
    });
    fireEvent.change(field, {
      target: { value: kind === 'transmission' ? '' : literalReceivedAt },
    });
    fireEvent.click(
      within(panel).getByRole('button', {
        name:
          kind === 'transmission'
            ? 'Record simulated transmission'
            : 'Record simulated acceptance',
      }),
    );
    await waitFor(() => expect(observed.commands).toHaveLength(1));
    if (kind === 'transmission')
      expect(observed.commands[0]?.init.body).toBe(
        '{"expectedOfferRevision":2,"acknowledgedWarningCodes":[],"note":""}',
      );
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    await act(async () => gate.release(response({}, 400)));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      kind === 'transmission'
        ? 'Utilisez une note de 500 caractères au maximum et vérifiez la reconnaissance des avertissements.'
        : 'Vérifiez la date et heure de réception. Un refus nécessite un motif de 1 à 500 caractères.',
    );
    fireEvent.change(field, {
      target: {
        value:
          kind === 'transmission'
            ? literalSimulationNote
            : '2026-10-03T12:36:00.000Z',
      },
    });
    fireEvent.click(
      within(panel).getByRole('button', {
        name:
          kind === 'transmission'
            ? 'Enregistrer la transmission simulée'
            : 'Enregistrer l’acceptation simulée',
      }),
    );
    await waitFor(() => expect(observed.commands).toHaveLength(2));
    expect(
      new Headers(observed.commands[1]?.init.headers).get('idempotency-key'),
    ).not.toBe(
      new Headers(observed.commands[0]?.init.headers).get('idempotency-key'),
    );
  },
);

it.each(['transmission', 'response'] as const)(
  'keeps late %s unavailable and denied feedback current-language without leaking refusal metadata',
  async (kind) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const gate = deferredReply();
    const observed = installBoundary({
      offer:
        kind === 'transmission'
          ? approvedTransmissionOffer()
          : withTransmission(),
      reply: () => gate.promise,
    });
    render(
      publicTree({
        currentActor: permissions([
          'commercial.offer.read',
          'commercial.offer.transmission.record',
          'commercial.offer.response.record',
        ]),
      }),
    );
    await screen.findByText('No versions recorded.');
    const panel = screen.getByRole('region', {
      name:
        kind === 'transmission'
          ? 'Simulated transmission'
          : 'Simulated Client response',
    });
    if (kind === 'response')
      fireEvent.change(
        within(panel).getByRole('textbox', {
          name: 'Reported received time (UTC)',
        }),
        { target: { value: literalReceivedAt } },
      );
    fireEvent.click(
      within(panel).getByRole('button', {
        name:
          kind === 'transmission'
            ? 'Record simulated transmission'
            : 'Record simulated acceptance',
      }),
    );
    await waitFor(() => expect(observed.commands).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    await act(async () =>
      gate.release(response({ hidden: 'PRIVATE-REFUSAL-DETAIL' }, 404)),
    );
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'La version de l’Offre n’est plus disponible. Rechargez la Demande.',
    );
    expect(
      screen.queryByText('PRIVATE-REFUSAL-DETAIL'),
    ).not.toBeInTheDocument();
  },
);

it.each(['transmission', 'response'] as const)(
  'revalidates a denied %s in the current locale without adding Client or Pricing authority',
  async (kind) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const gate = deferredReply();
    const observed = installBoundary({
      offer:
        kind === 'transmission'
          ? approvedTransmissionOffer()
          : withTransmission(),
      reply: () => gate.promise,
    });
    const onActorRevalidated = vi.fn();
    render(
      publicTree({
        currentActor: permissions([
          'commercial.offer.read',
          'commercial.offer.transmission.record',
          'commercial.offer.response.record',
        ]),
        onActorRevalidated,
      }),
    );
    await screen.findByText('No versions recorded.');
    const panel = screen.getByRole('region', {
      name:
        kind === 'transmission'
          ? 'Simulated transmission'
          : 'Simulated Client response',
    });
    if (kind === 'response')
      fireEvent.change(
        within(panel).getByRole('textbox', {
          name: 'Reported received time (UTC)',
        }),
        { target: { value: literalReceivedAt } },
      );
    fireEvent.click(
      within(panel).getByRole('button', {
        name:
          kind === 'transmission'
            ? 'Record simulated transmission'
            : 'Record simulated acceptance',
      }),
    );
    await waitFor(() => expect(observed.commands).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    await act(async () =>
      gate.release(response({ hidden: 'PRIVATE-REFUSAL-DETAIL' }, 403)),
    );
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      kind === 'transmission'
        ? 'L’accès à la transmission n’est plus disponible.'
        : 'L’accès à la réponse du Client n’est plus disponible.',
    );
    expect(onActorRevalidated).toHaveBeenCalledTimes(1);
    expect(observed.commands).toHaveLength(1);
    expect(
      screen.queryByText('PRIVATE-REFUSAL-DETAIL'),
    ).not.toBeInTheDocument();
  },
);

it.each(['transmission', 'response'] as const)(
  'retires a pending %s on real authority loss and never revives it on locale changes',
  async (kind) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const offer =
      kind === 'transmission'
        ? approvedTransmissionOffer()
        : withTransmission();
    const gate = deferredReply();
    const observed = installBoundary({ offer, reply: () => gate.promise });
    const full = permissions([
      'commercial.offer.read',
      'commercial.offer.transmission.record',
      'commercial.offer.response.record',
    ]);
    const view = render(publicTree({ currentActor: full }));
    await screen.findByText('No versions recorded.');
    const panel = screen.getByRole('region', {
      name:
        kind === 'transmission'
          ? 'Simulated transmission'
          : 'Simulated Client response',
    });
    if (kind === 'response')
      fireEvent.change(
        within(panel).getByRole('textbox', {
          name: 'Reported received time (UTC)',
        }),
        { target: { value: literalReceivedAt } },
      );
    fireEvent.click(
      within(panel).getByRole('button', {
        name:
          kind === 'transmission'
            ? 'Record simulated transmission'
            : 'Record simulated acceptance',
      }),
    );
    await waitFor(() => expect(observed.commands).toHaveLength(1));
    view.rerender(
      publicTree({ currentActor: permissions(['commercial.offer.read']) }),
    );
    expect(observed.commands[0]?.init.signal?.aborted).toBe(true);
    await screen.findByText('No versions recorded.');
    await act(async () =>
      gate.release(
        response(
          kind === 'transmission'
            ? transmissionRecord({ offer })
            : clientResponseRecord({ offer, outcome: 'ACCEPTED' }),
        ),
      ),
    );
    for (const locale of offerTransmissionLocales) {
      const requests = observed.fetch.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: locale.name }));
      expect(
        screen.queryByRole('button', { name: locale.record }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: locale.acceptClient }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(locale.responseActor)).not.toBeInTheDocument();
      expect(observed.fetch.mock.calls).toHaveLength(requests);
    }
    expect(observed.commands).toHaveLength(1);
  },
);

it.each(offerTransmissionLocales)(
  'reopens immutable evidence read-only in $code with no note and no acknowledged warnings',
  async (locale) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const offer = withClientResponse({
      offer: withTransmission({ note: null, warning: false }),
      outcome: 'REJECTED',
    });
    const observed = installBoundary({ offer });
    render(
      publicTree({ currentActor: permissions(['commercial.offer.read']) }),
    );
    await screen.findByText('No versions recorded.');
    const requests = observed.fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: locale.name }));
    expect(description(locale.note)).toHaveTextContent(locale.noNote);
    expect(description(locale.transmissionWarnings)).toHaveTextContent(
      locale.noWarnings,
    );
    expect(description(locale.clientReason).textContent).toBe(
      literalClientReason,
    );
    expect(description(locale.transmissionRun)).toHaveTextContent(
      'transmission-run-version-one',
    );
    expect(description(locale.transmissionChecksum)).toHaveTextContent(
      offer.version.representation.sha256,
    );
    expect(screen.getByTitle(locale.frame)).toHaveAttribute(
      'srcdoc',
      offer.version.representation.html,
    );
    expect(
      screen.queryByRole('button', { name: locale.record }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: locale.acceptClient }),
    ).not.toBeInTheDocument();
    expect(observed.commands).toHaveLength(0);
    expect(observed.fetch.mock.calls).toHaveLength(requests);
  },
);

it.each(['transmission', 'response'] as const)(
  'renders a late successful %s directly in the current language without a retry',
  async (kind) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const offer =
      kind === 'transmission'
        ? approvedTransmissionOffer()
        : withTransmission();
    const gate = deferredReply();
    const observed = installBoundary({ offer, reply: () => gate.promise });
    render(
      publicTree({
        currentActor: permissions([
          'commercial.offer.read',
          'commercial.offer.transmission.record',
          'commercial.offer.response.record',
        ]),
      }),
    );
    await screen.findByText('No versions recorded.');
    const panel = screen.getByRole('region', {
      name:
        kind === 'transmission'
          ? 'Simulated transmission'
          : 'Simulated Client response',
    });
    if (kind === 'transmission') {
      fireEvent.change(
        within(panel).getByRole('textbox', { name: 'Simulation note' }),
        { target: { value: literalSimulationNote } },
      );
      fireEvent.click(
        within(panel).getByRole('checkbox', {
          name: 'Recipient tax ID recorded',
        }),
      );
    } else
      fireEvent.change(
        within(panel).getByRole('textbox', {
          name: 'Reported received time (UTC)',
        }),
        { target: { value: literalReceivedAt } },
      );
    fireEvent.click(
      within(panel).getByRole('button', {
        name:
          kind === 'transmission'
            ? 'Record simulated transmission'
            : 'Record simulated acceptance',
      }),
    );
    await waitFor(() => expect(observed.commands).toHaveLength(1));
    const requests = observed.fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(observed.fetch.mock.calls).toHaveLength(requests);
    await act(async () =>
      gate.release(
        response(
          kind === 'transmission'
            ? transmissionRecord({ offer })
            : clientResponseRecord({ offer, outcome: 'ACCEPTED' }),
        ),
      ),
    );
    expect(
      await screen.findByRole('heading', {
        name:
          kind === 'transmission'
            ? 'Transmission simulée'
            : 'Réponse simulée du Client',
      }),
    ).toBeVisible();
    expect(
      description(
        kind === 'transmission'
          ? 'Membre ayant transmis'
          : 'Membre ayant enregistré la réponse',
      ),
    ).toHaveTextContent('membership-one');
    expect(observed.commands).toHaveLength(1);
    expect(
      screen.getByTitle('Représentation de l’Offre illustrative'),
    ).toHaveAttribute('srcdoc', offer.version.representation.html);
  },
);

it('retains warning acknowledgements across locale changes and resets them only for a real new displayed Quality run', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const offer = approvedTransmissionOffer();
  const observed = installBoundary({
    offer,
    reply: () =>
      response({
        ...qualityRun({ id: 'second-real-run' }),
        evaluatedAt: '2026-10-03T12:25:00.000Z',
      }),
  });
  render(
    publicTree({
      currentActor: permissions([
        'commercial.offer.read',
        'commercial.offer.prepare',
        'commercial.offer.transmission.record',
      ]),
    }),
  );
  await screen.findByText('No versions recorded.');
  const panel = screen.getByRole('region', { name: 'Simulated transmission' });
  const warning = within(panel).getByRole('checkbox', {
    name: 'Recipient tax ID recorded',
  });
  const note = within(panel).getByRole('textbox', { name: 'Simulation note' });
  fireEvent.change(note, { target: { value: literalSimulationNote } });
  fireEvent.click(warning);
  fireEvent.click(screen.getByRole('button', { name: 'Français' }));
  expect(warning).toBeChecked();
  expect(observed.commands).toHaveLength(0);
  fireEvent.click(
    screen.getByRole('button', { name: 'Exécuter les contrôles qualité' }),
  );
  await waitFor(() => expect(warning).not.toBeChecked());
  expect(note).toHaveValue(literalSimulationNote);
  expect(observed.commands).toHaveLength(1);
  expect(observed.commands[0]?.path).toBe(
    '/api/offers/opportunities/opportunity-one/versions/version-one/quality-checks',
  );
  const requests = observed.fetch.mock.calls.length;
  fireEvent.click(warning);
  fireEvent.click(screen.getByRole('button', { name: 'Română' }));
  expect(warning).toBeChecked();
  expect(note).toHaveValue(literalSimulationNote);
  expect(observed.fetch.mock.calls).toHaveLength(requests);
});
