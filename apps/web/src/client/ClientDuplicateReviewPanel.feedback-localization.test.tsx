import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { interfaceLocaleStorageKey } from '../localization/interface-locale';
import {
  chooseLocale,
  comparisonFixture,
  cursor,
  deferredResponse,
  nextCursor,
  nextReference,
  reference,
  renderReview,
  resolver,
} from './client-duplicate-review-localization.fixture';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const locales = [
  {
    code: 'ro',
    title: 'Examinări ale posibilelor duplicate',
    open: 'Examinează posibilul duplicat 1',
    comparison: 'Compară Clientul propus cu cel existent',
    proposal: 'Valoare propusă',
    candidate: 'Client existent',
    version: 'Versiunea 1.234',
    contacts: 'Contacte',
    telephone: 'Telefonul Contactului',
    preferences: 'Preferințele de comunicare ale Contactului',
    attach: 'Folosește acest Client existent în Compania activă',
    pending: 'Se adaugă Clientul existent…',
    confirmed: 'Clientul existent a fost asociat Companiei active.',
    uncertain:
      'Relația cu Compania nu a putut fi confirmată. Redeschide examinarea înainte de a încerca din nou.',
    noAttach:
      'Asocierea acestui Client nu este disponibilă cu accesul tău curent.',
    guidance:
      'Revino la dosarul relevant și trimite o corectare obișnuită, dacă este cazul.',
  },
  {
    code: 'ru',
    title: 'Проверки возможных дубликатов',
    open: 'Проверить возможный дубликат 1',
    comparison: 'Сравнить предложенного и существующего Клиента',
    proposal: 'Предложенное значение',
    candidate: 'Существующий Клиент',
    version: 'Версия 1\u00a0234',
    contacts: 'Контакты',
    telephone: 'Телефон Контакта',
    preferences: 'Предпочтения Контакта по общению',
    attach: 'Использовать этого существующего Клиента в активной Компании',
    pending: 'Добавление существующего Клиента…',
    confirmed: 'Существующий Клиент связан с активной Компанией.',
    uncertain:
      'Не удалось подтвердить связь с Компанией. Снова откройте проверку перед следующей попыткой.',
    noAttach: 'Текущий доступ не позволяет связать этого Клиента.',
    guidance:
      'Вернитесь к соответствующему досье и при необходимости отправьте обычное исправление.',
  },
  {
    code: 'fr',
    title: 'Examens des doublons possibles',
    open: 'Examiner le doublon possible 1',
    comparison: 'Comparer le Client proposé et le Client existant',
    proposal: 'Valeur proposée',
    candidate: 'Client existant',
    version: 'Version 1\u202f234',
    contacts: 'Contacts',
    telephone: 'Téléphone du Contact',
    preferences: 'Préférences de communication du Contact',
    attach: 'Utiliser ce Client existant dans l’Entreprise active',
    pending: 'Ajout du Client existant…',
    confirmed: 'Client existant rattaché à l’Entreprise active.',
    uncertain:
      'Le rattachement à l’Entreprise n’a pas pu être confirmé. Rouvrez l’examen avant de réessayer.',
    noAttach: 'Votre accès actuel ne permet pas de rattacher ce Client.',
    guidance:
      'Revenez au dossier concerné et soumettez une correction ordinaire si nécessaire.',
  },
  {
    code: 'en',
    title: 'Possible duplicate reviews',
    open: 'Review possible duplicate 1',
    comparison: 'Compare the proposed and existing Client',
    proposal: 'Proposed value',
    candidate: 'Existing Client',
    version: 'Version 1,234',
    contacts: 'Contacts',
    telephone: 'Contact telephone',
    preferences: 'Contact communication preferences',
    attach: 'Use this existing Client in the active Company',
    pending: 'Adding existing Client…',
    confirmed: 'Existing Client linked to the active Company.',
    uncertain:
      'The Company attachment could not be confirmed. Reopen the review before trying again.',
    noAttach: 'Linking this Client is not available with your current access.',
    guidance:
      'Return to the relevant dossier and submit an ordinary correction if appropriate.',
  },
] as const;

it.each(locales)(
  'keeps the authorized comparison and literal ordered Contacts while changing to $code',
  async (locale) => {
    const { fetcher, onActivityRecorded } = renderReview();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Review possible duplicate 1',
      }),
    );
    const region = await screen.findByRole('region', {
      name: 'Compare the proposed and existing Client',
    });
    const table = within(region).getByRole('table');
    const rows = within(table).getAllByRole('row');
    const contacts = within(region).getAllByRole('listitem');
    expect(
      contacts.map(
        (node) => within(node).getByText(/\{(?:propus|salvat)\}/u).textContent,
      ),
    ).toEqual([
      'Ana {propus}',
      'Ion {propus}',
      'Maria {salvat}',
      'Petru {salvat}',
    ]);
    const before = fetcher.mock.calls.length;
    await chooseLocale(locale.code);
    expect(screen.getByRole('region', { name: locale.comparison })).toBe(
      region,
    );
    expect(screen.getByRole('heading', { name: locale.title })).toBeVisible();
    expect(
      within(region).getByRole('columnheader', { name: locale.proposal }),
    ).toBeVisible();
    expect(
      within(region).getByRole('columnheader', { name: locale.candidate }),
    ).toBeVisible();
    expect(
      within(region).getByText(locale.version, {
        normalizer: (value) => value,
      }),
    ).toBeVisible();
    expect(
      within(region).getByRole('rowheader', { name: locale.contacts }),
    ).toBeVisible();
    expect(within(region).getAllByText(locale.telephone)).toHaveLength(4);
    expect(within(region).getAllByText(locale.preferences)).toHaveLength(4);
    expect(
      within(region).getByText('Română; русский email {dimineața}'),
    ).toBeVisible();
    expect(
      within(region).getByText('Français; English {après-midi}'),
    ).toBeVisible();
    expect(
      within(region).getByRole('button', { name: locale.attach }),
    ).toBeEnabled();
    expect(within(region).getAllByRole('listitem')).toEqual(contacts);
    expect(within(table).getAllByRole('row')).toEqual(rows);
    expect(fetcher).toHaveBeenCalledTimes(before);
    expect(onActivityRecorded).not.toHaveBeenCalled();
  },
);

it('uses the current language for late list/detail responses without a new opening or focus jump', async () => {
  const list = deferredResponse();
  const detail = deferredResponse();
  const { fetcher } = renderReview({
    list: () => list.promise,
    detail: () => detail.promise,
  });
  await screen.findByText('Loading possible duplicate reviews…');
  await chooseLocale('ro');
  expect(
    screen.getByText('Se încarcă examinările posibilelor duplicate…'),
  ).toBeVisible();
  const listReads = fetcher.mock.calls.length;
  await act(async () =>
    list.resolve(
      Response.json({
        items: [{ duplicate_review_reference: reference }],
        next_cursor: null,
      }),
    ),
  );
  const open = await screen.findByRole('button', {
    name: 'Examinează posibilul duplicat 1',
  });
  expect(fetcher).toHaveBeenCalledTimes(listReads);
  open.focus();
  fireEvent.click(open);
  await screen.findByText('Se încarcă comparația duplicatului…');
  await chooseLocale('fr');
  expect(
    screen.getByText('Chargement de la comparaison du doublon…'),
  ).toBeVisible();
  const control = screen.getByRole('button', { name: 'Choose fr' });
  control.focus();
  const detailReads = fetcher.mock.calls.length;
  await act(async () => detail.resolve(Response.json(comparisonFixture())));
  await screen.findByRole('heading', {
    name: 'Comparer le Client proposé et le Client existant',
  });
  expect(control).toHaveFocus();
  expect(fetcher).toHaveBeenCalledTimes(detailReads);
});

it('retains an empty continuation, loaded rows, deduplication and the exact failed cursor through language switches', async () => {
  const older = deferredResponse();
  const requests: (string | null)[] = [];
  let olderAttempts = 0;
  const { fetcher } = renderReview({
    list: ({ url }) => {
      expect(url.searchParams.get('page_size')).toBe('20');
      const requestedCursor = url.searchParams.get('cursor');
      requests.push(requestedCursor);
      if (!requestedCursor)
        return Response.json({ items: [], next_cursor: cursor });
      if (requestedCursor === cursor) return older.promise;
      olderAttempts++;
      return olderAttempts === 1
        ? Response.json({}, { status: 503 })
        : Response.json({
            items: [
              { duplicate_review_reference: reference },
              { duplicate_review_reference: nextReference },
            ],
            next_cursor: null,
          });
    },
  });
  await screen.findByText(
    'No review on this page. More reviews may be available.',
  );
  await chooseLocale('ro');
  expect(
    screen.getByText(
      'Nicio examinare pe această pagină. Pot fi disponibile și altele.',
    ),
  ).toBeVisible();
  expect(requests).toEqual([null]);
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Încarcă mai multe examinări de posibile duplicate',
    }),
  );
  await chooseLocale('ru');
  expect(
    screen.getByRole('button', {
      name: 'Загрузка других проверок возможных дубликатов…',
    }),
  ).toBeDisabled();
  await act(async () =>
    older.resolve(
      Response.json({
        items: [{ duplicate_review_reference: reference }],
        next_cursor: nextCursor,
      }),
    ),
  );
  const row = await screen.findByRole('button', {
    name: 'Проверить возможный дубликат 1',
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Загрузить другие проверки возможных дубликатов',
    }),
  );
  await screen.findByText(
    'Не удалось безопасно загрузить другие проверки дубликатов. Повторите попытку.',
  );
  const before = fetcher.mock.calls.length;
  await chooseLocale('fr');
  expect(
    screen.getByText(
      'D’autres examens de doublons n’ont pas pu être chargés en toute sécurité. Réessayez.',
    ),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Examiner le doublon possible 1' }),
  ).toBe(row);
  expect(fetcher).toHaveBeenCalledTimes(before);
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Charger d’autres examens de doublons possibles',
    }),
  );
  await screen.findByRole('button', { name: 'Examiner le doublon possible 2' });
  expect(requests).toEqual([null, cursor, nextCursor, nextCursor]);
  expect(screen.queryByText(cursor)).not.toBeInTheDocument();
  expect(screen.queryByText(nextCursor)).not.toBeInTheDocument();
});

it.each(locales)(
  'keeps a pending and uncertain attachment unconfirmed in $code until an explicit reopening',
  async (locale) => {
    const put = deferredResponse();
    const { state, fetcher, onActivityRecorded } = renderReview({
      attach: () => put.promise,
    });
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Review possible duplicate 1',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Use this existing Client in the active Company',
      }),
    );
    await screen.findByRole('button', { name: 'Adding existing Client…' });
    const before = fetcher.mock.calls.length;
    await chooseLocale(locale.code);
    expect(screen.getByRole('button', { name: locale.pending })).toBeDisabled();
    expect(screen.getByRole('button', { name: locale.open })).toBeDisabled();
    expect(fetcher).toHaveBeenCalledTimes(before);
    expect(screen.queryByText(locale.confirmed)).not.toBeInTheDocument();
    await act(async () => put.resolve(Response.json({}, { status: 503 })));
    await screen.findByText(locale.uncertain);
    expect(
      screen.queryByRole('button', { name: locale.attach }),
    ).not.toBeInTheDocument();
    await chooseLocale('en');
    expect(fetcher).toHaveBeenCalledTimes(before);
    expect(onActivityRecorded).not.toHaveBeenCalled();
    const command = fetcher.mock.calls.filter(
      ([, init]) => init?.method === 'PUT',
    );
    expect(command).toHaveLength(1);
    expect(command[0]).toEqual([
      '/api/clients/candidate-709/active-company-relationship',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'x-company-context-id': 'company-709',
        }),
      }),
    ]);
    expect(command[0]?.[1]?.body).toBeUndefined();
    expect(new Headers(command[0]?.[1]?.headers).has('idempotency-key')).toBe(
      false,
    );
    state.attach = undefined;
    fireEvent.click(
      screen.getByRole('button', { name: 'Review possible duplicate 1' }),
    );
    await screen.findByRole('button', {
      name: 'Use this existing Client in the active Company',
    });
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT'),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Use this existing Client in the active Company',
      }),
    );
    await screen.findByText('Existing Client linked to the active Company.');
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT'),
    ).toHaveLength(2);
  },
);

it('keeps confirmed attachment distinct from failed refresh and translates both without rerunning callbacks', async () => {
  const put = deferredResponse();
  const { fetcher, onActivityRecorded, onClientsChanged } = renderReview({
    subject: 'panel',
    attach: () => put.promise,
  });
  onActivityRecorded.mockRejectedValueOnce(
    new Error('Activity refresh failed'),
  );
  onClientsChanged.mockRejectedValueOnce(new Error('Client refresh failed'));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review possible duplicate 1' }),
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Use this existing Client in the active Company',
    }),
  );
  await chooseLocale('ru');
  await act(async () => put.resolve(Response.json({})));
  await screen.findByText('Существующий Клиент связан с активной Компанией.');
  await screen.findByText(
    'Клиент связан, но часть сведений не удалось обновить.',
  );
  const before = fetcher.mock.calls.length;
  await chooseLocale('ro');
  expect(
    screen.getByText('Clientul existent a fost asociat Companiei active.'),
  ).toBeVisible();
  expect(
    screen.getByText(
      'Clientul a fost asociat, dar unele informații nu au putut fi reîmprospătate.',
    ),
  ).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(before);
  expect(onActivityRecorded).toHaveBeenCalledOnce();
  expect(onClientsChanged).toHaveBeenCalledOnce();
});

it.each(locales)(
  'keeps correction guidance read-only and preserves compare-without-attach authority in $code',
  async (locale) => {
    const director = { ...resolver, workspacePermissions: [] };
    const fixture = renderReview({ actor: director });
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Review possible duplicate 1',
      }),
    );
    await screen.findByText(
      'Linking this Client is not available with your current access.',
    );
    await chooseLocale(locale.code);
    expect(screen.getByText(locale.noAttach)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: locale.attach }),
    ).not.toBeInTheDocument();
    fixture.state.comparison = comparisonFixture('correction');
    fireEvent.click(screen.getByRole('button', { name: locale.open }));
    await screen.findByText(locale.guidance);
    const region = screen.getByRole('region', { name: locale.comparison });
    expect(within(region).queryByRole('link')).not.toBeInTheDocument();
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
    expect(within(region).queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      fixture.fetcher.mock.calls.every(
        ([, init]) => !init?.method || init.method === 'GET',
      ),
    ).toBe(true);
  },
);

it('translates unavailable, malformed, remediation, exhausted-empty and initial-list retry states without exposing metadata', async () => {
  const { state, fetcher } = renderReview({
    detail: () => Response.json({}, { status: 404 }),
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review possible duplicate 1' }),
  );
  await screen.findByText(
    'This review is no longer available. Its data or authority may have changed.',
  );
  await chooseLocale('ro');
  expect(
    screen.getByText(
      'Această examinare nu mai este disponibilă. Este posibil ca datele sau autoritatea să se fi modificat.',
    ),
  ).toBeVisible();
  expect(
    fetcher.mock.calls.filter(([input]) =>
      input.toString().includes('page_size=20'),
    ),
  ).toHaveLength(2);
  state.detail = () =>
    Response.json({ outcome: 'unknown', privateName: 'Hidden candidate' });
  fireEvent.click(
    screen.getByRole('button', { name: 'Examinează posibilul duplicat 1' }),
  );
  await screen.findByText(
    'Examinarea duplicatului nu a putut fi încărcată în siguranță.',
  );
  state.detail = () =>
    Response.json({
      outcome: 'multiple_duplicate_candidates_require_data_remediation',
      duplicate_review_reference: reference,
      candidates: ['Hidden candidate'],
    });
  fireEvent.click(
    screen.getByRole('button', { name: 'Examinează posibilul duplicat 1' }),
  );
  await screen.findByText(
    'Mai mulți Clienți existenți folosesc acest identificator. Datele trebuie remediate înainte de a continua comparația.',
  );
  await chooseLocale('fr');
  expect(
    screen.getByText(
      'Plusieurs Clients existants utilisent cet identifiant. Les données doivent être corrigées avant de poursuivre la comparaison.',
    ),
  ).toBeVisible();
  expect(screen.queryByText('Hidden candidate')).not.toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  state.list = () => Response.json({ items: [], next_cursor: null });
  state.detail = () => Response.json({}, { status: 404 });
  fireEvent.click(
    screen.getByRole('button', { name: 'Examiner le doublon possible 1' }),
  );
  await screen.findByText(
    'Aucun examen de doublon possible n’est actuellement disponible.',
  );
});

it('localizes an initial-list failure and explicit retry, then a safe denial', async () => {
  const { state, fetcher } = renderReview({
    list: () =>
      Response.json({
        items: [{ duplicate_review_reference: 'malformed' }],
        next_cursor: null,
      }),
  });
  await screen.findByText('The duplicate review could not be loaded safely.');
  await chooseLocale('ro');
  const retry = screen.getByRole('button', {
    name: 'Reîncearcă lista de examinări',
  });
  state.list = () => Response.json({}, { status: 403 });
  fireEvent.click(retry);
  await screen.findByText(
    'Accesul la examinări nu este disponibil cu autoritatea ta curentă.',
  );
  const before = fetcher.mock.calls.length;
  await chooseLocale('ru');
  expect(
    screen.getByText('Текущие полномочия не позволяют просматривать проверки.'),
  ).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(before);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('uses the Romanian fallback for an invalid saved locale through the real provider', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'unsupported');
  renderReview({ locale: null });
  await screen.findByRole('heading', {
    name: 'Examinări ale posibilelor duplicate',
  });
  const open = await screen.findByRole('button', {
    name: 'Examinează posibilul duplicat 1',
  });
  fireEvent.click(open);
  await screen.findByRole('heading', {
    name: 'Compară Clientul propus cu cel existent',
  });
  expect(document.documentElement).toHaveAttribute('lang', 'ro');
});

it('keeps an already-related candidate, absent values and empty Contacts literal and read-only after translation', async () => {
  const detail = comparisonFixture();
  detail.candidate.relatedToActiveCompany = true;
  detail.proposal.fields.contacts = [];
  detail.candidate.contacts = [];
  const { fetcher } = renderReview({ detail: () => Response.json(detail) });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review possible duplicate 1' }),
  );
  await screen.findByText(
    'The existing Client is already linked to the active Company.',
  );
  await chooseLocale('ro');
  expect(
    screen.getByText('Clientul existent este deja asociat Companiei active.'),
  ).toBeVisible();
  expect(screen.getByText('Niciun Contact propus.')).toBeVisible();
  expect(
    screen.getByText('Nu sunt înregistrate Contacte comune.'),
  ).toBeVisible();
  expect(screen.getAllByText('Nefurnizat')).toHaveLength(2);
  expect(screen.getByText('Nu se aplică')).toBeVisible();
  expect(
    screen.queryByRole('button', {
      name: 'Folosește acest Client existent în Compania activă',
    }),
  ).not.toBeInTheDocument();
  expect(
    fetcher.mock.calls.every(
      ([, init]) => !init?.method || init.method === 'GET',
    ),
  ).toBe(true);
});

it.each(['Owner only', 'legacy v1', 'partial scope'] as const)(
  'does not expose comparison data under %s authority after locale changes',
  async (authority) => {
    const activeCompany: NonNullable<ActorContext['activeCompany']> = {
      ...resolver.activeCompany,
    };
    if (authority === 'Owner only') {
      activeCompany.clientPermissions = [];
      activeCompany.clientPermissionAssignmentId = undefined;
      activeCompany.clientPermissionSetVersion = undefined;
    }
    if (authority === 'legacy v1') {
      activeCompany.clientPermissions = [
        'client.read',
        'client.create',
        'client.update',
      ];
      activeCompany.clientPermissionSetVersion = 'v1';
    }
    const { fetcher } = renderReview({
      actor: { ...resolver, activeCompany },
      list: () => Response.json({ items: [], next_cursor: null }),
    });
    await screen.findByRole('heading', { name: 'Clients' });
    if (authority === 'partial scope')
      await screen.findByText(
        'No possible duplicate review is currently available.',
      );
    const before = fetcher.mock.calls.length;
    await chooseLocale('ro');
    expect(
      screen.queryByRole('button', { name: 'Examinează posibilul duplicat 1' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Client existent {Я Ș}')).not.toBeInTheDocument();
    expect(screen.queryByText(reference)).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(before);
  },
);

it.each(['canAttach', 'refresh', 'Company'] as const)(
  'retires late panel detail after the real %s boundary changes',
  async (boundary) => {
    const pending = deferredResponse();
    let signal: AbortSignal | null | undefined;
    const { state, rerender, fetcher } = renderReview({
      subject: 'panel',
      detail: ({ init }) => {
        signal = init?.signal;
        return pending.promise;
      },
    });
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Review possible duplicate 1',
      }),
    );
    await waitFor(() => expect(signal).toBeDefined());
    const before = fetcher.mock.calls.length;
    await chooseLocale('ro');
    expect(signal?.aborted).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(before);
    if (boundary === 'canAttach') state.canAttach = false;
    if (boundary === 'refresh') state.refreshKey++;
    if (boundary === 'Company')
      state.actor = {
        ...resolver,
        activeCompany: { ...resolver.activeCompany, id: 'replacement-company' },
      };
    rerender();
    await waitFor(() => expect(signal?.aborted).toBe(true));
    await act(async () => pending.resolve(Response.json(comparisonFixture())));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Client existent {Я Ș}')).not.toBeInTheDocument();
  },
);

it.each(['detail', 'attachment', 'continuation'] as const)(
  'retires a pending %s response only after a real assignment change',
  async (work) => {
    const pending = deferredResponse();
    const { state, fetcher, rerender, onActivityRecorded } = renderReview();
    await screen.findByRole('button', { name: 'Review possible duplicate 1' });
    let signal: AbortSignal | null | undefined;
    if (work === 'detail')
      state.detail = ({ init }) => {
        signal = init?.signal;
        return pending.promise;
      };
    if (work === 'attachment')
      state.attach = ({ init }) => {
        signal = init?.signal;
        return pending.promise;
      };
    if (work === 'continuation') {
      state.list = ({ url, init }) => {
        if (url.searchParams.has('cursor')) {
          signal = init?.signal;
          return pending.promise;
        }
        return Response.json({
          items: [{ duplicate_review_reference: reference }],
          next_cursor: cursor,
        });
      };
      // A real public authority refresh obtains the bounded continuation page.
      state.actor = {
        ...resolver,
        activeCompany: {
          ...resolver.activeCompany,
          clientPermissionAssignmentId: 'assignment-with-cursor',
        },
      };
      rerender();
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Load more possible duplicate reviews',
        }),
      );
    } else {
      fireEvent.click(
        screen.getByRole('button', { name: 'Review possible duplicate 1' }),
      );
      if (work === 'attachment')
        fireEvent.click(
          await screen.findByRole('button', {
            name: 'Use this existing Client in the active Company',
          }),
        );
    }
    await waitFor(() => expect(signal).toBeDefined());
    const before = fetcher.mock.calls.length;
    await chooseLocale('ro');
    expect(signal?.aborted).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(before);
    state.list = () => Response.json({ items: [], next_cursor: null });
    state.actor = {
      ...resolver,
      activeCompany: {
        ...resolver.activeCompany,
        clientPermissionAssignmentId: 'replacement-assignment',
      },
    };
    rerender();
    await screen.findByText(
      'Nicio examinare de posibil duplicat nu este disponibilă în prezent.',
    );
    expect(signal?.aborted).toBe(true);
    await act(async () =>
      pending.resolve(
        Response.json(
          work === 'detail'
            ? comparisonFixture()
            : work === 'continuation'
              ? {
                  items: [{ duplicate_review_reference: nextReference }],
                  next_cursor: null,
                }
              : {},
        ),
      ),
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Clientul existent a fost asociat Companiei active.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Examinează posibilul duplicat 1' }),
    ).not.toBeInTheDocument();
    expect(onActivityRecorded).not.toHaveBeenCalled();
  },
);
