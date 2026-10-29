import type { ActorContext } from '../access-types';
import { baseActor } from '../production-shell/production-shell-context.test-fixtures';
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
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
} from '../localization/interface-locale';
import { ClientCorrectionHistory } from './ClientCorrectionHistory';
import { formatApplicationDateTime } from '../presentation/date-time';

const firstCorrection = {
  id: 'private-history-row',
  occurredAt: '2026-09-24T09:15:00.000Z',
  actor: { displayName: 'Actor {literal} Я' },
  changes: {
    displayName: { before: 'Ș anterior {literal}', after: 'Я после {literal}' },
    contacts: {
      before: [],
      after: [
        {
          name: 'Ana {literal}',
          telephone: '+373 123',
          email: 'ana@example.test',
          position: 'Directrice {literal}',
          decisionRoles: ['technical'],
          communicationPreferences: 'Română; русский\nemail {dimineața}',
        },
      ],
    },
  },
};
const cursor = 'opaque+cursor?Company=hidden';

const locales = [
  {
    code: 'ro',
    choose: 'Choose Romanian',
    title: 'Istoricul corectărilor',
    hide: 'Ascunde istoricul corectărilor',
    list: 'Corectări, cele mai noi primele',
    empty:
      'Nu au fost înregistrate corectări pentru acest Client în această Companie.',
    error:
      'Nu am putut încărca istoricul corectărilor. Dosarul rămâne disponibil.',
    unavailable:
      'Istoricul corectărilor nu este disponibil cu accesul tău actual.',
    retry: 'Reîncearcă încărcarea istoricului corectărilor',
    older: 'Arată corectări mai vechi',
    olderError:
      'Corectările mai vechi nu au putut fi încărcate. Încearcă din nou.',
  },
  {
    code: 'ru',
    choose: 'Choose Russian',
    title: 'История исправлений',
    hide: 'Скрыть историю исправлений',
    list: 'Исправления, сначала новые',
    empty: 'Для этого Клиента в этой Компании исправления не зарегистрированы.',
    error:
      'Не удалось загрузить историю исправлений. Досье остаётся доступным.',
    unavailable: 'История исправлений недоступна при ваших текущих правах.',
    retry: 'Повторить загрузку истории исправлений',
    older: 'Показать предыдущие исправления',
    olderError:
      'Не удалось загрузить предыдущие исправления. Повторите попытку.',
  },
  {
    code: 'fr',
    choose: 'Choose French',
    title: 'Historique des corrections',
    hide: 'Masquer l’historique des corrections',
    list: 'Corrections, les plus récentes d’abord',
    empty:
      'Aucune correction n’a été enregistrée pour ce Client dans cette Entreprise.',
    error:
      'Impossible de charger l’historique des corrections. Le dossier reste disponible.',
    unavailable:
      'L’historique des corrections n’est pas disponible avec vos droits actuels.',
    retry: 'Réessayer de charger l’historique des corrections',
    older: 'Afficher les corrections plus anciennes',
    olderError:
      'Les corrections plus anciennes n’ont pas pu être chargées. Réessayez.',
  },
  {
    code: 'en',
    choose: 'Choose English',
    title: 'Correction history',
    hide: 'Hide correction history',
    list: 'Corrections, newest first',
    empty: 'No corrections have been recorded for this Client in this Company.',
    error:
      'We could not load the correction history. The dossier remains available.',
    unavailable:
      'Correction history is not available with your current access.',
    retry: 'Retry correction history',
    older: 'Show older corrections',
    olderError: 'Older corrections could not be loaded. Try again.',
  },
] as const;

function LocaleSwitch() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {locales.map((locale) => (
        <button key={locale.code} onClick={() => changeLocale(locale.code)}>
          {locale.choose}
        </button>
      ))}
    </>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('keeps expanded history, literal snapshots and pending opaque continuation while translating a late older page into the current language', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  let finishOlder: ((response: Response) => void) | undefined;
  const older = new Promise<Response>((resolve) => {
    finishOlder = resolve;
  });
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), 'http://localhost');
      expect(new Headers(init?.headers).get('x-company-context-id')).toBe(
        'company-history',
      );
      if (url.pathname !== '/api/clients/client-history/correction-history')
        throw new Error('Unexpected history target.');
      if (url.searchParams.has('cursor')) {
        expect(url.search).toBe(`?cursor=${encodeURIComponent(cursor)}`);
        return older;
      }
      return Response.json({
        corrections: [firstCorrection],
        nextCursor: cursor,
      });
    },
  );
  vi.stubGlobal('fetch', fetcher);
  const onCompanyContextRejected = vi.fn();
  const onActorRevalidated = vi.fn();
  const onWorkspaceAccessRejected = vi.fn();
  render(
    <InterfaceLocaleProvider>
      <LocaleSwitch />
      <ClientCorrectionHistory
        clientAccountId="client-history"
        dossierVersion={7}
        companyContextId="company-history"
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
    </InterfaceLocaleProvider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Show correction history' }),
  );
  const section = screen.getByRole('region', { name: 'Correction history' });
  const before = await screen.findByText('Ș anterior {literal}');
  const list = within(section).getByRole('list', {
    name: 'Corrections, newest first',
  });
  const first = within(list).getAllByRole('listitem')[0];
  if (!first) throw new Error('Expected the first correction.');
  const time = first.querySelector('time');
  expect(time).toHaveAttribute('datetime', firstCorrection.occurredAt);
  expect(first).toHaveTextContent('Corrected by Actor {literal} Я');
  fireEvent.click(
    screen.getByRole('button', { name: 'Show older corrections' }),
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  const continuation = screen.getByRole('button', {
    name: 'Loading older corrections…',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Choose Romanian' }));

  expect(screen.getByRole('region', { name: 'Istoricul corectărilor' })).toBe(
    section,
  );
  expect(
    screen.getByRole('button', { name: 'Se încarcă corectările mai vechi…' }),
  ).toBe(continuation);
  expect(continuation).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Ascunde istoricul corectărilor' }),
  ).toHaveAttribute('aria-expanded', 'true');
  expect(
    within(section).getByRole('list', {
      name: 'Corectări, cele mai noi primele',
    }),
  ).toBe(list);
  expect(screen.getByText('Ș anterior {literal}')).toBe(before);
  expect(time).toHaveAttribute('datetime', firstCorrection.occurredAt);
  // The delivered formatter is the independent browser-local time contract.
  // Locale changes must keep its date/time convention and canonical instant.
  expect(time).toHaveTextContent(
    formatApplicationDateTime(firstCorrection.occurredAt),
  );
  expect(first).toHaveTextContent('Corectat de Actor {literal} Я');
  expect(within(first).getByText('Directrice {literal}')).toBeVisible();
  expect(first).toHaveTextContent('Roluri în luarea deciziilor: Tehnic');
  expect(first).toHaveTextContent(
    'Preferințe de comunicare: Română; русский email {dimineața}',
  );
  expect(first).toHaveTextContent('Română; русский email {dimineața}');
  expect(
    within(first).getByRole('group', { name: 'Înainte' }),
  ).toHaveTextContent('Nu sunt înregistrate Contacte comune.');
  expect(fetcher).toHaveBeenCalledTimes(2);
  if (!finishOlder) throw new Error('Expected a pending older page.');
  const completeOlder = finishOlder;
  await act(async () =>
    completeOlder(
      Response.json({
        corrections: [
          {
            id: 'older-private-id',
            occurredAt: '2026-09-23T08:00:00.000Z',
            actor: { displayName: 'Actor anterior' },
            changes: { address: { before: null, after: 'Rue {literal} Я' } },
          },
        ],
        nextCursor: null,
      }),
    ),
  );
  expect(await screen.findByText('Corectat de Actor anterior')).toBeVisible();
  expect(screen.getByText('Rue {literal} Я')).toBeVisible();
  expect(screen.getByText('Ș anterior {literal}')).toBe(before);
  expect(
    within(list)
      .getAllByRole('listitem')
      .filter((item) => item.parentElement === list),
  ).toHaveLength(2);
  expect(
    screen.queryByRole('button', { name: 'Arată corectări mai vechi' }),
  ).not.toBeInTheDocument();
  for (const hidden of [
    cursor,
    'private-history-row',
    'older-private-id',
    'company-history',
  ])
    expect(section).not.toHaveTextContent(hidden);
  expect(within(section).queryByRole('link')).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const locale of locales) {
    fireEvent.click(screen.getByRole('button', { name: locale.choose }));
    expect(screen.getByRole('region', { name: locale.title })).toBe(section);
    expect(within(section).getByRole('list', { name: locale.list })).toBe(list);
    expect(screen.getByRole('button', { name: locale.hide })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Ș anterior {literal}')).toBe(before);
    expect(screen.getByText('Rue {literal} Я')).toBeVisible();
    expect(time).toHaveAttribute('datetime', firstCorrection.occurredAt);
    expect(fetcher).toHaveBeenCalledTimes(2);
  }
  expect(onCompanyContextRejected).not.toHaveBeenCalled();
  expect(onActorRevalidated).not.toHaveBeenCalled();
  expect(onWorkspaceAccessRejected).not.toHaveBeenCalled();
});

function mountHistory(
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  vi.stubGlobal('fetch', fetcher);
  render(
    <InterfaceLocaleProvider>
      <LocaleSwitch />
      <ClientCorrectionHistory
        clientAccountId="client-history"
        dossierVersion={7}
        companyContextId="company-history"
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={() => undefined}
        onActorRevalidated={() => undefined}
        onWorkspaceAccessRejected={() => undefined}
      />
    </InterfaceLocaleProvider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Show correction history' }),
  );
  return screen.getByRole('region', { name: 'Correction history' });
}

it.each(['empty', 'error', 'unavailable'] as const)(
  'keeps the %s history state localized and retries only on explicit request',
  async (state) => {
    let retry = false;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input.toString(), 'http://localhost').pathname;
      if (path === '/api/access/current-actor')
        return Response.json({
          ...baseActor,
          workspacePermissions: [],
          activeCompany: {
            id: 'company-history',
            displayName: 'Synthetic Company',
          },
        } satisfies ActorContext);
      if (path !== '/api/clients/client-history/correction-history')
        throw new Error('Unexpected history request.');
      if (retry)
        return Response.json({
          corrections: [firstCorrection],
          nextCursor: null,
        });
      return Response.json(
        state === 'empty'
          ? { corrections: [], nextCursor: null }
          : { message: 'Private history metadata' },
        {
          status: state === 'error' ? 503 : state === 'unavailable' ? 403 : 200,
        },
      );
    });
    const section = mountHistory(fetcher);
    await within(section).findByText(locales[3][state]);
    const baseline = fetcher.mock.calls.length;
    for (const locale of locales) {
      fireEvent.click(screen.getByRole('button', { name: locale.choose }));
      expect(screen.getByRole('region', { name: locale.title })).toBe(section);
      expect(within(section).getByText(locale[state])).toBeVisible();
      expect(section).not.toHaveTextContent('Private history metadata');
      expect(fetcher).toHaveBeenCalledTimes(baseline);
      if (state === 'error')
        expect(
          within(section).getByRole('button', { name: locale.retry }),
        ).toBeVisible();
      else
        expect(
          within(section).queryByRole('button', { name: locale.retry }),
        ).not.toBeInTheDocument();
    }
    if (state === 'error') {
      retry = true;
      fireEvent.click(
        within(section).getByRole('button', {
          name: 'Retry correction history',
        }),
      );
      expect(
        await within(section).findByText('Ș anterior {literal}'),
      ).toBeVisible();
      expect(fetcher).toHaveBeenCalledTimes(baseline + 1);
    }
  },
);

it('retains the first page through translated older-page failure and repeats only its opaque continuation explicitly', async () => {
  let olderSucceeded = false;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), 'http://localhost');
      expect(new Headers(init?.headers).get('x-company-context-id')).toBe(
        'company-history',
      );
      if (!url.search)
        return Response.json({
          corrections: [firstCorrection],
          nextCursor: cursor,
        });
      expect(url.search).toBe(`?cursor=${encodeURIComponent(cursor)}`);
      return olderSucceeded
        ? Response.json({ corrections: [], nextCursor: null })
        : Response.json({}, { status: 503 });
    },
  );
  const section = mountHistory(fetcher);
  const firstValue = await within(section).findByText('Ș anterior {literal}');
  fireEvent.click(
    within(section).getByRole('button', { name: 'Show older corrections' }),
  );
  await within(section).findByText(
    'Older corrections could not be loaded. Try again.',
  );
  for (const locale of locales) {
    fireEvent.click(screen.getByRole('button', { name: locale.choose }));
    expect(within(section).getByText(locale.olderError)).toBeVisible();
    expect(
      within(section).getByRole('button', { name: locale.older }),
    ).toBeEnabled();
    expect(within(section).getByText('Ș anterior {literal}')).toBe(firstValue);
    expect(fetcher).toHaveBeenCalledTimes(2);
  }
  olderSucceeded = true;
  fireEvent.click(
    within(section).getByRole('button', { name: 'Show older corrections' }),
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  await waitFor(() =>
    expect(
      within(section).queryByRole('button', { name: 'Show older corrections' }),
    ).not.toBeInTheDocument(),
  );
  expect(within(section).getByText('Ș anterior {literal}')).toBe(firstValue);
});
