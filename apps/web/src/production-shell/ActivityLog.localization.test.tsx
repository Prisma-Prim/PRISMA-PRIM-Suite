import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
  type InterfaceLocale,
} from '../localization/interface-locale';
import {
  assertMessageCoverage,
  resolveMessage,
} from '../localization/messages';
import {
  allActivityEvents,
  activityEventsByAction,
  activityInstant,
  activityLiteral,
  activityLocaleIds,
} from '../test/activity-localization-fixture';
import type {
  ActivityLogEvent,
  ActivityLogState,
  ProjectLifecycleChangedActivityLogEvent,
} from './company-context-transitions';
import { ActivityLog } from './ActivityLog';
import { activityLogMessages } from './activity-log.copy';

// Independently stated visible outcomes, never imported from the catalog.
const words = {
  en: {
    title: 'Activity Log',
    loading: 'Loading activity…',
    error: 'We could not load the Activity Log. Please try again.',
    empty: 'No activity has been recorded in this workspace yet.',
    created: 'captured a Client Request',
    task: 'created a Task',
    project: 'created a preparatory Project',
    resolver: 'Authorized resolver',
    union: 'Governed Client union',
    request: 'Open Request',
    offer: 'Open Offer Version',
    contract: 'Open agreement version',
    target: 'Target: Client Request:',
    template: 'Source Version 1,234',
    lifecycle: 'activated a Project with a start exception',
    response: '(Accepted)',
    loss: '(On hold → Lost: Competitor)',
  },
  ro: {
    title: 'Jurnal de activitate',
    loading: 'Se încarcă activitatea…',
    error: 'Jurnalul de activitate nu a putut fi încărcat. Încercați din nou.',
    empty:
      'În acest spațiu de lucru nu este încă înregistrată nicio activitate.',
    created: 'a înregistrat o cerere a clientului',
    task: 'a creat o Sarcină',
    project: 'a creat un Proiect pregătitor',
    resolver: 'Responsabil autorizat pentru unificare',
    union: 'Unificare controlată a Clienților',
    request: 'Deschideți cererea',
    offer: 'Deschideți versiunea ofertei',
    contract: 'Deschideți versiunea acordului',
    target: 'Țintă: Cerere a clientului:',
    template: 'Versiunea sursă 1.234',
    lifecycle: 'a activat un Proiect cu o excepție de începere',
    response: '(Acceptată)',
    loss: '(În așteptare → Pierdută: Concurent)',
  },
  ru: {
    title: 'Журнал действий',
    loading: 'Загрузка действий…',
    error: 'Не удалось загрузить журнал действий. Повторите попытку.',
    empty: 'В этом рабочем пространстве пока нет записанных действий.',
    created: '— регистрация запроса Клиента',
    task: '— создание Задачи',
    project: '— создание подготовительного Проекта',
    resolver: 'Уполномоченная сторона объединения',
    union: 'Управляемое объединение Клиентов',
    request: 'Открыть запрос',
    offer: 'Открыть версию Оферты',
    contract: 'Открыть версию соглашения',
    target: 'Объект: Запрос Клиента:',
    template: 'Исходная версия 1 234',
    lifecycle: '— активация Проекта с исключением при запуске',
    response: '(Принято)',
    loss: '(Приостановлена → Проиграна: Конкурент)',
  },
  fr: {
    title: 'Journal d’activité',
    loading: 'Chargement de l’activité…',
    error: 'Le journal d’activité n’a pas pu être chargé. Veuillez réessayer.',
    empty:
      'Aucune activité n’est encore enregistrée dans cet espace de travail.',
    created: 'a enregistré une Demande Client',
    task: 'a créé une Tâche',
    project: 'a créé un Projet préparatoire',
    resolver: 'Responsable autorisé de la fusion',
    union: 'Fusion encadrée de Clients',
    request: 'Ouvrir la demande',
    offer: 'Ouvrir la Version de l’Offre',
    contract: 'Ouvrir la version de l’accord',
    target: 'Cible : Demande Client:',
    template: 'Version source 1 234',
    lifecycle: 'a activé un Projet avec une exception de démarrage',
    response: '(Acceptée)',
    loss: '(En attente → Perdue : Concurrent)',
  },
} satisfies Record<InterfaceLocale, Record<string, string>>;
const locales: InterfaceLocale[] = ['ro', 'ru', 'fr', 'en'];

function Choices() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <div role="group" aria-label="Test language choices">
      {locales.map((locale) => (
        <button key={locale} onClick={() => changeLocale(locale)}>
          Use {locale}
        </button>
      ))}
    </div>
  );
}
function present({
  state,
  locale = 'en',
  onOpenRequest = vi.fn(),
  activeCompanyId = activityLocaleIds.company,
}: {
  state: ActivityLogState;
  locale?: InterfaceLocale;
  onOpenRequest?: ((request: string, version?: unknown) => void) | undefined;
  activeCompanyId?: string | undefined;
}) {
  localStorage.setItem(interfaceLocaleStorageKey, locale);
  return render(
    <InterfaceLocaleProvider>
      <Choices />
      <ActivityLog
        state={state}
        activeCompanyId={activeCompanyId}
        onOpenRequest={onOpenRequest}
      />
    </InterfaceLocaleProvider>,
  );
}
function rowFor(event: ActivityLogEvent, rows: HTMLElement[]): HTMLElement {
  const index = allActivityEvents.indexOf(event);
  const row = rows[index];
  if (!row)
    throw new Error('The declared event must retain its list position.');
  return row;
}
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it.each(locales)(
  'renders all 118 admitted actions and 18 target types in %s without exposing canonical codes',
  (locale) => {
    present({ state: { status: 'ready', events: allActivityEvents }, locale });
    const region = screen.getByRole('region', { name: words[locale].title });
    const rows = within(region).getAllByRole('listitem');
    expect(rows).toHaveLength(118);
    expect(
      new Set(allActivityEvents.map((event) => event.target.type)).size,
    ).toBe(18);
    for (const [index, event] of allActivityEvents.entries()) {
      const row = rows[index];
      if (!row) throw new Error('Missing canonical Activity row.');
      expect(row.querySelector('strong')?.textContent).toBeTruthy();
      expect(row).not.toHaveTextContent(event.action);
      expect(row).not.toHaveTextContent('undefined');
      if ('occurredAt' in event) {
        expect(row).toHaveTextContent('Alex {literal} — Știință / Имя');
        expect(within(row).getByRole('time')).toHaveAttribute(
          'datetime',
          activityInstant,
        );
      } else {
        expect(row).toHaveTextContent(words[locale].resolver);
        expect(row).toHaveTextContent(words[locale].union);
        expect(row.querySelector('time')).toBeNull();
        expect(within(row).queryByRole('button')).toBeNull();
        expect(row).not.toHaveTextContent('Alex');
        expect(row).not.toHaveTextContent('2026');
        expect(row).not.toHaveTextContent(event.projectionReference);
        expect(row).not.toHaveTextContent(activityLocaleIds.company);
      }
    }
    expect(
      rowFor(activityEventsByAction['client_request.created'], rows),
    ).toHaveTextContent(words[locale].created);
    expect(
      rowFor(activityEventsByAction['client_request.created'], rows),
    ).toHaveTextContent(`${words[locale].target} ${activityLocaleIds.request}`);
    expect(
      rowFor(activityEventsByAction['task.created'], rows),
    ).toHaveTextContent(words[locale].task);
    expect(
      rowFor(activityEventsByAction['project.created'], rows),
    ).toHaveTextContent(words[locale].project);
    expect(
      rowFor(activityEventsByAction['task.created'], rows),
    ).toHaveTextContent(activityLiteral);
    expect(
      rowFor(activityEventsByAction['project.lifecycle.changed'], rows),
    ).toHaveTextContent(words[locale].lifecycle);
    expect(
      rowFor(activityEventsByAction['project.template.version.created'], rows)
        .textContent,
    ).toContain(words[locale].template);
    expect(
      rowFor(activityEventsByAction['project.template.version.created'], rows),
    ).not.toHaveTextContent('1233');
    expect(
      within(
        rowFor(
          activityEventsByAction['project.template.version.created'],
          rows,
        ),
      ).queryByRole('button'),
    ).toBeNull();
    expect(
      rowFor(
        activityEventsByAction['offer_version.client_response_recorded'],
        rows,
      ),
    ).toHaveTextContent(words[locale].response);
    expect(
      rowFor(activityEventsByAction['opportunity.outcome.changed'], rows),
    ).toHaveTextContent(words[locale].loss);
    expect(
      rowFor(activityEventsByAction['opportunity.responsible.changed'], rows),
    ).toHaveTextContent('(Nom {before} — Имя → Nom {after} — Имя)');
    expect(
      rowFor(activityEventsByAction['opportunity.stage.changed'], rows),
    ).toHaveTextContent('Cadrage {literal} — Этап');
    expect(
      rowFor(activityEventsByAction['sales_stage.configured'], rows),
    ).toHaveTextContent('Étape {literal} — Этап');
  },
);

it('changes the complete loaded ledger in place without a callback, lost focus or reordered node', () => {
  const open = vi.fn();
  present({
    state: { status: 'ready', events: allActivityEvents },
    onOpenRequest: open,
  });
  const languageChoices = screen.getByRole('group', {
    name: 'Test language choices',
  });
  const ledger = screen.getByRole('region', { name: 'Activity Log' });
  const rows = within(ledger).getAllByRole('listitem');
  const descendants = rows.map((row) => ({
    description: row.querySelector('strong'),
    target: row.querySelector('span'),
    time: row.querySelector('time'),
    button: row.querySelector('button'),
  }));
  const focused = within(
    rowFor(activityEventsByAction['client_request.created'], rows),
  ).getByRole('button', { name: 'Open Request' });
  focused.focus();
  for (const locale of locales) {
    fireEvent.click(
      within(languageChoices).getByRole('button', { name: `Use ${locale}` }),
    );
    expect(screen.getByRole('region', { name: words[locale].title })).toBe(
      ledger,
    );
    const current = within(ledger).getAllByRole('listitem');
    current.forEach((row, index) => {
      expect(row).toBe(rows[index]);
      expect(row.querySelector('strong')).toBe(descendants[index]?.description);
      expect(row.querySelector('span')).toBe(descendants[index]?.target);
      expect(row.querySelector('time')).toBe(descendants[index]?.time);
      expect(row.querySelector('button')).toBe(descendants[index]?.button);
    });
    expect(focused).toHaveFocus();
    expect(open).not.toHaveBeenCalled();
  }
});

it.each(locales)(
  'uses current-language loading/error/empty feedback after the same mounted state changes (%s)',
  (locale) => {
    const view = present({ state: { status: 'loading' } });
    fireEvent.click(screen.getByRole('button', { name: `Use ${locale}` }));
    const region = screen.getByRole('region', { name: words[locale].title });
    expect(within(region).getByRole('status')).toHaveTextContent(
      words[locale].loading,
    );
    const ui = (state: ActivityLogState) => (
      <InterfaceLocaleProvider>
        <Choices />
        <ActivityLog
          state={state}
          activeCompanyId={activityLocaleIds.company}
          onOpenRequest={undefined}
        />
      </InterfaceLocaleProvider>
    );
    view.rerender(ui({ status: 'error' }));
    expect(screen.getByRole('region', { name: words[locale].title })).toBe(
      region,
    );
    expect(within(region).getByRole('alert')).toHaveTextContent(
      words[locale].error,
    );
    expect(within(region).queryByRole('button')).toBeNull();
    view.rerender(ui({ status: 'ready', events: [] }));
    expect(within(region).getByText(words[locale].empty)).toBeVisible();
    view.rerender(
      ui({
        status: 'ready',
        events: [activityEventsByAction['client_request.created']],
      }),
    );
    expect(
      within(region).getByText(
        `Alex {literal} — Știință / Имя ${words[locale].created}`,
      ),
    ).toBeVisible();
  },
);

it.each(locales)(
  'opens only the exact Request and historical Offer/Contract Version intent in %s',
  (locale) => {
    const open = vi.fn();
    const events = [
      activityEventsByAction['client_request.created'],
      activityEventsByAction['offer_version.transmission_recorded'],
      activityEventsByAction['contract_version.signature_recorded'],
    ];
    present({
      state: { status: 'ready', events },
      locale,
      onOpenRequest: open,
    });
    fireEvent.click(
      screen.getByRole('button', { name: words[locale].request }),
    );
    fireEvent.click(screen.getByRole('button', { name: words[locale].offer }));
    fireEvent.click(
      screen.getByRole('button', { name: words[locale].contract }),
    );
    expect(open.mock.calls).toEqual([
      [activityLocaleIds.request, undefined],
      [
        activityLocaleIds.request,
        {
          type: 'offer_version',
          offerVersionId: activityLocaleIds.offerVersion,
        },
      ],
      [
        activityLocaleIds.request,
        {
          type: 'contract_version',
          contractId: activityLocaleIds.contract,
          contractVersionId: activityLocaleIds.contractVersion,
          kind: 'CONTRACT',
        },
      ],
    ]);
  },
);

it.each([
  { company: activityLocaleIds.otherCompany, callback: vi.fn() },
  { company: undefined, callback: vi.fn() },
  { company: activityLocaleIds.company, callback: undefined },
])(
  'offers no target action without the unchanged Company/callback eligibility',
  ({ company, callback }) => {
    render(
      <InterfaceLocaleProvider>
        <ActivityLog
          state={{ status: 'ready', events: allActivityEvents }}
          activeCompanyId={company}
          onOpenRequest={callback}
        />
      </InterfaceLocaleProvider>,
    );
    expect(within(screen.getByRole('region')).queryAllByRole('button')).toEqual(
      [],
    );
  },
);

const lifecycleCases = [
  {
    metadata: {
      lifecycleRevision: 1,
      from: 'preparatory',
      to: 'active',
      withStartException: false,
    },
    expected: 'activated a Project',
  },
  {
    metadata: { lifecycleRevision: 2, from: 'active', to: 'on_hold' },
    expected: 'put a Project on hold',
  },
  {
    metadata: { lifecycleRevision: 3, from: 'on_hold', to: 'active' },
    expected: 'resumed a Project',
  },
  {
    metadata: { lifecycleRevision: 4, from: 'active', to: 'completed' },
    expected: 'completed a Project',
  },
  {
    metadata: { lifecycleRevision: 1, from: 'preparatory', to: 'cancelled' },
    expected: 'cancelled a Project',
  },
] satisfies Array<{
  metadata: ProjectLifecycleChangedActivityLogEvent['metadata'];
  expected: string;
}>;
it.each(lifecycleCases)(
  'keeps the lifecycle transition meaning: $expected',
  ({ metadata, expected }) => {
    present({
      state: {
        status: 'ready',
        events: [
          { ...activityEventsByAction['project.lifecycle.changed'], metadata },
        ],
      },
    });
    expect(
      screen.getByText(`Alex {literal} — Știință / Имя ${expected}`),
    ).toBeVisible();
  },
);

it('uses Romanian default/fallback and makes a missing required translation fail release coverage', () => {
  render(
    <InterfaceLocaleProvider>
      <ActivityLog
        state={{ status: 'ready', events: [] }}
        activeCompanyId={activityLocaleIds.company}
        onOpenRequest={undefined}
      />
    </InterfaceLocaleProvider>,
  );
  expect(
    screen.getByRole('heading', { name: 'Jurnal de activitate' }),
  ).toBeVisible();
  expect(() =>
    assertMessageCoverage('activityLog', activityLogMessages),
  ).not.toThrow();
  const missing = { ...activityLogMessages.translations.fr };
  delete missing.title;
  const incomplete = {
    ...activityLogMessages,
    translations: { ...activityLogMessages.translations, fr: missing },
  };
  expect(resolveMessage(incomplete, 'fr', 'title')).toBe(
    'Jurnal de activitate',
  );
  expect(() => assertMessageCoverage('activityLog', incomplete)).toThrow(
    'Missing translation: activityLog.fr.title',
  );
});
