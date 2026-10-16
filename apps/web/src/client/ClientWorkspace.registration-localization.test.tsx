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
} from '../localization/interface-locale';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { ClientWorkspace } from './ClientWorkspace';
import { selectOption } from '../test/select-option';

const actor: ActorContext = {
  internalUserId: 'user-registration',
  workspaceMembershipId: 'membership-registration',
  workspaceId: 'workspace-registration',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Ana',
  email: 'ana@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: 'company-registration',
    displayName: 'Companie {company}',
  },
};

function renderWorkspace(workspaceActor: ActorContext = actor) {
  const identity = deterministicBrowserIdentity();
  const onActivityRecorded = vi.fn(async () => undefined);
  const onCompanyContextRejected = vi.fn();
  const onActorRevalidated = vi.fn();
  const content = (nextActor: ActorContext) => (
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <ApplicationPresentation value="prisme">
        <ClientWorkspace
          actor={nextActor}
          identity={identity}
          onCompanyContextRejected={onCompanyContextRejected}
          onActorRevalidated={onActorRevalidated}
          onActivityRecorded={onActivityRecorded}
        />
      </ApplicationPresentation>
    </InterfaceLocaleProvider>
  );
  const view = render(content(workspaceActor));
  return {
    ...view,
    onActivityRecorded,
    onCompanyContextRejected,
    onActorRevalidated,
    rerenderActor: (nextActor: ActorContext) =>
      view.rerender(content(nextActor)),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('starts registration with Romanian field and submit copy through the real provider', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify([])));
  vi.stubGlobal('fetch', fetchMock);
  renderWorkspace();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Client nou' }));
  expect(
    screen.getByRole('textbox', { name: 'Numele afișat al Clientului' }),
  ).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Creează Client' })).toBeEnabled();
});

const locales = [
  {
    code: 'ro',
    launch: 'Client nou',
    title: 'Înregistrează un Client',
    name: 'Numele afișat al Clientului',
    tax: 'IDNO / cod fiscal',
    address: 'Adresă',
    telephone: 'Telefon',
    email: 'Email general',
    activity: 'Activitate economică',
    submit: 'Creează Client',
    pending: 'Se creează…',
    close: 'Închide înregistrarea',
    required: 'Numele afișat al Clientului este obligatoriu.',
    add: 'Adaugă Contact',
    remove: 'Elimină Contact',
    contact: 'Contact 1',
    contacts: 'Contacte editabile',
    contactName: 'Numele Contactului',
    contactTelephone: 'Telefonul Contactului',
    contactEmail: 'Emailul Contactului',
    position: 'Funcția Contactului',
    roles: 'Roluri în luarea deciziilor',
    roleLabels: [
      'Decident final',
      'Persoană de influență',
      'Utilizator',
      'Financiar',
      'Tehnic',
      'Opozant',
    ],
    preferences: 'Preferințele de comunicare ale Contactului',
    help: 'Doar preferințe practice, precum limba, canalul preferat sau orele potrivite. Salvarea nu trimite mesaje și nu înregistrează consimțământ sau aprobare.',
    contactRequired: 'Fiecare Contact trebuie să aibă un nume.',
    positionLimit: 'Funcția trebuie să aibă cel mult 500 de caractere.',
    preferencesLimit:
      'Preferințele de comunicare trebuie să aibă cel mult 1000 de caractere.',
    retry:
      'Crearea Clientului nu a putut fi confirmată. Reîncercați în siguranță cu aceleași date.',
    success: 'Client creat și asociat cu Compania activă.',
    denied: 'Nu aveți permisiunea de a gestiona Clienți.',
    duplicate:
      'Acest Client poate exista deja. Niciun Client nu a fost creat sau modificat. Un responsabil autorizat poate compara în siguranță înregistrările.',
  },
  {
    code: 'ru',
    launch: 'Новый Клиент',
    title: 'Зарегистрировать Клиента',
    name: 'Отображаемое название Клиента',
    tax: 'IDNO / налоговый код',
    address: 'Адрес',
    telephone: 'Телефон',
    email: 'Общий email',
    activity: 'Хозяйственная деятельность',
    submit: 'Создать Клиента',
    pending: 'Создание…',
    close: 'Закрыть регистрацию',
    required: 'Укажите отображаемое название Клиента.',
    add: 'Добавить Контакт',
    remove: 'Удалить Контакт',
    contact: 'Контакт 1',
    contacts: 'Редактируемые Контакты',
    contactName: 'Имя Контакта',
    contactTelephone: 'Телефон Контакта',
    contactEmail: 'Email Контакта',
    position: 'Должность Контакта',
    roles: 'Роли в принятии решений',
    roleLabels: [
      'Окончательный ЛПР',
      'Влиятельное лицо',
      'Пользователь',
      'Финансовая роль',
      'Техническая роль',
      'Противник',
    ],
    preferences: 'Предпочтения Контакта по общению',
    help: 'Только практические предпочтения: язык, предпочтительный канал или удобное время. Сохранение не отправляет сообщений и не фиксирует согласие или одобрение.',
    contactRequired: 'У каждого Контакта должно быть имя.',
    positionLimit: 'Должность должна содержать не более 500 символов.',
    preferencesLimit:
      'Предпочтения по общению должны содержать не более 1000 символов.',
    retry:
      'Не удалось подтвердить создание Клиента. Безопасно повторите попытку с теми же данными.',
    success: 'Клиент создан и связан с активной Компанией.',
    denied: 'У вас нет разрешения на управление Клиентами.',
    duplicate:
      'Этот Клиент, возможно, уже существует. Ни один Клиент не был создан или изменён. Уполномоченный проверяющий может безопасно сравнить записи.',
  },
  {
    code: 'fr',
    launch: 'Nouveau Client',
    title: 'Inscrire un Client',
    name: 'Nom affiché du Client',
    tax: 'IDNO / code fiscal',
    address: 'Adresse',
    telephone: 'Téléphone',
    email: 'Email général',
    activity: 'Activité économique',
    submit: 'Créer le Client',
    pending: 'Création…',
    close: 'Fermer l’inscription',
    required: 'Le nom affiché du Client est obligatoire.',
    add: 'Ajouter un Contact',
    remove: 'Retirer le Contact',
    contact: 'Contact 1',
    contacts: 'Contacts modifiables',
    contactName: 'Nom du Contact',
    contactTelephone: 'Téléphone du Contact',
    contactEmail: 'Email du Contact',
    position: 'Fonction du Contact',
    roles: 'Rôles dans la décision',
    roleLabels: [
      'Décideur final',
      'Personne influente',
      'Utilisateur',
      'Financier',
      'Technique',
      'Opposant',
    ],
    preferences: 'Préférences de communication du Contact',
    help: 'Préférences pratiques uniquement : langue, canal préféré ou horaires adaptés. Leur enregistrement n’envoie aucun message et ne consigne ni consentement ni approbation.',
    contactRequired: 'Chaque Contact doit avoir un nom.',
    positionLimit: 'La fonction doit contenir au maximum 500 caractères.',
    preferencesLimit:
      'Les préférences de communication doivent contenir au maximum 1000 caractères.',
    retry:
      'La création du Client n’a pas pu être confirmée. Réessayez en toute sécurité avec les mêmes informations.',
    success: 'Client créé et lié à l’Entreprise active.',
    denied: 'Vous n’avez pas l’autorisation de gérer les Clients.',
    duplicate:
      'Ce Client existe peut-être déjà. Aucun Client n’a été créé ou modifié. Une personne autorisée peut comparer les dossiers en toute sécurité.',
  },
  {
    code: 'en',
    launch: 'New Client',
    title: 'Register a Client',
    name: 'Client display name',
    tax: 'IDNO / tax code',
    address: 'Address',
    telephone: 'Telephone',
    email: 'General email',
    activity: 'Business activity',
    submit: 'Create Client',
    pending: 'Creating…',
    close: 'Close registration',
    required: 'Client display name is required.',
    add: 'Add Contact',
    remove: 'Remove Contact',
    contact: 'Contact 1',
    contacts: 'Editable Contacts',
    contactName: 'Contact name',
    contactTelephone: 'Contact telephone',
    contactEmail: 'Contact email',
    position: 'Contact position',
    roles: 'Decision roles',
    roleLabels: [
      'Final decision-maker',
      'Influencer',
      'User',
      'Financial',
      'Technical',
      'Blocker',
    ],
    preferences: 'Contact communication preferences',
    help: 'Practical preferences only, such as language, preferred channel or suitable times. Saving them sends no message and records no consent or approval.',
    contactRequired: 'Each Contact must have a name.',
    positionLimit: 'Position must be 500 characters or fewer.',
    preferencesLimit:
      'Communication preferences must be 1000 characters or fewer.',
    retry:
      'The Client creation could not be confirmed. Retry the same details safely.',
    success: 'Client created and linked to the active Company.',
    denied: 'You do not have permission to manage Clients.',
    duplicate:
      'This Client may already exist. No Client was created or changed. An authorized reviewer can compare the records safely.',
  },
] as const;

const enrichedActor: ActorContext = {
  ...actor,
  workspacePermissions: [],
  activeCompany: {
    ...actor.activeCompany,
    id: 'company-registration',
    displayName: 'Companie {company}',
    clientPermissions: ['client.read', 'client.create', 'client.update'],
    clientPermissionAssignmentId: 'registration-assignment',
    clientPermissionSetVersion: 'v1',
  },
};

function change(label: string, value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: label }), {
    target: { value },
  });
}

it('reactively translates required and Contact guidance without changing drafts, field associations or sending a command', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify([])));
  vi.stubGlobal('fetch', fetchMock);
  renderWorkspace(enrichedActor);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: locales[0].launch }));
  fireEvent.click(screen.getByRole('button', { name: locales[0].submit }));
  for (const locale of locales) {
    selectOption(screen.getByRole('combobox'), locale.code);
    expect(screen.getByRole('alert')).toHaveTextContent(locale.required);
    expect(screen.getByLabelText(locale.name)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText(locale.name)).toHaveAccessibleDescription(
      locale.required,
    );
  }
  change(locales[3].name, '  Știință {клиент}  ');
  fireEvent.click(screen.getByRole('button', { name: locales[3].add }));
  fireEvent.click(screen.getByRole('button', { name: locales[3].submit }));
  for (const locale of locales) {
    selectOption(screen.getByRole('combobox'), locale.code);
    expect(screen.getByRole('heading', { name: locale.title })).toBeVisible();
    expect(screen.getByText(locale.contacts)).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(locale.contactRequired);
    expect(
      screen.getByLabelText(locale.contactName),
    ).toHaveAccessibleDescription(locale.contactRequired);
    expect(screen.getByLabelText(locale.name)).toHaveValue(
      '  Știință {клиент}  ',
    );
    expect(screen.getByRole('group', { name: locale.contact })).toBeVisible();
    expect(screen.getByRole('group', { name: locale.roles })).toBeVisible();
    expect(
      screen
        .getAllByRole('checkbox')
        .map((box) => box.parentElement?.textContent),
    ).toEqual(locale.roleLabels);
    expect(
      screen.getByLabelText(locale.preferences),
    ).toHaveAccessibleDescription(locale.help);
    expect(screen.getByRole('button', { name: locale.remove })).toBeEnabled();
  }
  change(locales[3].contactName, '  Ion {контакт}  ');
  change(locales[3].position, 'x'.repeat(501));
  fireEvent.click(screen.getByRole('button', { name: locales[3].submit }));
  for (const locale of locales) {
    selectOption(screen.getByRole('combobox'), locale.code);
    expect(screen.getByRole('alert')).toHaveTextContent(locale.positionLimit);
    expect(screen.getByLabelText(locale.position)).toHaveAccessibleDescription(
      locale.positionLimit,
    );
    expect(screen.getByLabelText(locale.position)).toHaveValue('x'.repeat(501));
  }
  change(locales[3].position, 'Director {funcție}');
  change(locales[3].preferences, '😀'.repeat(1001));
  fireEvent.click(screen.getByRole('button', { name: locales[3].submit }));
  for (const locale of locales) {
    selectOption(screen.getByRole('combobox'), locale.code);
    expect(screen.getByRole('alert')).toHaveTextContent(
      locale.preferencesLimit,
    );
    expect(
      screen.getByLabelText(locale.preferences),
    ).toHaveAccessibleDescription(`${locale.help} ${locale.preferencesLimit}`);
    expect(screen.getByLabelText(locale.preferences)).toHaveValue(
      '😀'.repeat(1001),
    );
    expect(screen.getByLabelText(locale.contactName)).toHaveValue(
      '  Ion {контакт}  ',
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  }
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function deferredResponse() {
  let resolve: (response: Response) => void = () => {
    throw new Error('Uninitialized deferred response');
  };
  const promise = new Promise<Response>((fulfil) => {
    resolve = fulfil;
  });
  return { promise, resolve };
}

const raw = {
  displayName: '  Știință {клиент} & Co  ',
  taxId: '  MD-{644}  ',
  address: '  Strada Științei {адрес}  ',
  telephone: '  +373 60 000 644  ',
  generalEmail: 'client@example.test',
  businessActivity: '  Cercetare {наука}  ',
  name: '  Ion {контакт}  ',
  telephoneContact: '  +373 60 001 644  ',
  email: '  ion@example.test  ',
  position: '  Director {funcție}  ',
  preferences: '  Română {limbă}\nРусский; email dimineața  ',
};
const expectedEnrichedBody = JSON.stringify({
  displayName: 'Știință {клиент} & Co',
  taxId: 'MD-{644}',
  address: 'Strada Științei {адрес}',
  telephone: '+373 60 000 644',
  generalEmail: 'client@example.test',
  contacts: [
    {
      name: 'Ion {контакт}',
      telephone: '+373 60 001 644',
      email: 'ion@example.test',
      position: 'Director {funcție}',
      decisionRoles: [
        'final_decision_maker',
        'influencer',
        'user',
        'financial',
        'technical',
        'blocker',
      ],
      communicationPreferences: 'Română {limbă}\nРусский; email dimineața',
    },
    { name: 'Ana {a doua}' },
  ],
  businessActivity: 'Cercetare {наука}',
});

type LocaleFixture = (typeof locales)[number];
function expectDraft(locale: LocaleFixture) {
  for (const [label, value] of [
    [locale.name, raw.displayName],
    [locale.tax, raw.taxId],
    [locale.address, raw.address],
    [locale.telephone, raw.telephone],
    [locale.email, raw.generalEmail],
    [locale.activity, raw.businessActivity],
  ]) {
    expect(screen.getByLabelText(label)).toHaveValue(value);
  }
  const first = within(screen.getByRole('group', { name: locale.contact }));
  for (const [label, value] of [
    [locale.contactName, raw.name],
    [locale.contactTelephone, raw.telephoneContact],
    [locale.contactEmail, raw.email],
    [locale.position, raw.position],
    [locale.preferences, raw.preferences],
  ]) {
    expect(first.getByLabelText(label)).toHaveValue(value);
  }
  for (const label of locale.roleLabels)
    expect(first.getByRole('checkbox', { name: label })).toBeChecked();
  expect(screen.getAllByLabelText(locale.contactName)[1]).toHaveValue(
    '  Ana {a doua}  ',
  );
}

function enterEnrichedDraft(locale: LocaleFixture) {
  change(locale.name, raw.displayName);
  change(locale.tax, raw.taxId);
  change(locale.address, raw.address);
  change(locale.telephone, raw.telephone);
  change(locale.email, raw.generalEmail);
  change(locale.activity, raw.businessActivity);
  fireEvent.click(screen.getByRole('button', { name: locale.add }));
  change(locale.contactName, raw.name);
  change(locale.contactTelephone, raw.telephoneContact);
  change(locale.contactEmail, raw.email);
  change(locale.position, raw.position);
  change(locale.preferences, raw.preferences);
  for (const label of [...locale.roleLabels].reverse())
    fireEvent.click(screen.getByRole('checkbox', { name: label }));
  fireEvent.click(screen.getByRole('button', { name: locale.add }));
  fireEvent.change(screen.getAllByLabelText(locale.contactName)[1], {
    target: { value: '  Ana {a doua}  ' },
  });
  fireEvent.change(screen.getAllByLabelText(locale.preferences)[1], {
    target: { value: '   ' },
  });
  fireEvent.click(screen.getByRole('button', { name: locale.add }));
  fireEvent.click(screen.getAllByRole('button', { name: locale.remove })[2]);
}

it.each(locales)(
  'preserves the complete enriched command through draft, pending, Close and exact uncertain retry from $code',
  async (initialLocale) => {
    localStorage.setItem(interfaceLocaleStorageKey, initialLocale.code);
    const first = deferredResponse();
    const retry = deferredResponse();
    let posts = 0;
    let saved = false;
    const client = {
      id: 'client-created-644',
      displayName: 'Știință {клиент} & Co',
      relatedToActiveCompany: true,
    };
    const commands: {
      body: BodyInit | null | undefined;
      key: string | null;
      company: string | null;
      signal: AbortSignal | null | undefined;
    }[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== '/api/clients')
        throw new Error(`Unexpected HTTP: ${String(input)}`);
      if (init?.method === 'POST') {
        posts += 1;
        const headers = new Headers(init.headers);
        commands.push({
          body: init.body,
          key: headers.get('idempotency-key'),
          company: headers.get('x-company-context-id'),
          signal: init.signal,
        });
        return posts === 1 ? first.promise : retry.promise;
      }
      return Promise.resolve(json(saved ? [client] : []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const view = renderWorkspace(enrichedActor);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: initialLocale.launch }));
    enterEnrichedDraft(initialLocale);
    for (const locale of locales) {
      selectOption(screen.getByRole('combobox'), locale.code);
      expectDraft(locale);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(view.onActivityRecorded).not.toHaveBeenCalled();
    }
    fireEvent.click(screen.getByRole('button', { name: locales[3].submit }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]?.body).toBe(expectedEnrichedBody);
    expect(commands[0]?.key).toEqual(expect.any(String));
    expect(commands[0]?.key).not.toBe('');
    expect(commands[0]?.company).toBe('company-registration');
    view.rerenderActor({
      ...enrichedActor,
      activeCompany: {
        ...enrichedActor.activeCompany,
        id: 'company-registration',
        displayName: 'Companie {company}',
      },
    });
    for (const locale of locales) {
      selectOption(screen.getByRole('combobox'), locale.code);
      expectDraft(locale);
      expect(
        screen.getByRole('button', { name: locale.pending }),
      ).toBeDisabled();
      expect(screen.getByRole('status')).toHaveTextContent(locale.pending);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(commands[0]?.signal?.aborted).toBe(false);
    }
    fireEvent.click(screen.getByRole('button', { name: locales[3].close }));
    expect(
      screen.getByRole('button', { name: locales[3].launch }),
    ).toHaveFocus();
    await act(async () => first.resolve(json({}, 503)));
    for (const locale of locales) {
      selectOption(screen.getByRole('combobox'), locale.code);
      expect(screen.getByRole('alert')).toHaveTextContent(locale.retry);
      expect(
        screen.getByRole('button', { name: locale.launch }),
      ).toHaveAttribute('aria-expanded', 'false');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
    fireEvent.click(screen.getByRole('button', { name: locales[3].launch }));
    expectDraft(locales[3]);
    fireEvent.click(screen.getByRole('button', { name: locales[3].submit }));
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands[1]?.body).toBe(commands[0]?.body);
    expect(commands[1]?.key).toBe(commands[0]?.key);
    expect(commands[1]?.company).toBe(commands[0]?.company);
    fireEvent.click(screen.getByRole('button', { name: locales[3].close }));
    selectOption(screen.getByRole('combobox'), 'fr');
    saved = true;
    await act(async () => retry.resolve(json(client, 201)));
    expect(
      await screen.findByRole('heading', { name: client.displayName }),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(locales[2].success);
    expect(
      screen.getByRole('button', { name: locales[2].launch }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(view.onActivityRecorded).toHaveBeenCalledOnce();
    for (const locale of locales) {
      selectOption(screen.getByRole('combobox'), locale.code);
      expect(screen.getByRole('status')).toHaveTextContent(locale.success);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(view.onActivityRecorded).toHaveBeenCalledOnce();
    }
  },
);

it.each(locales)(
  'keeps Workspace-only registration minimal and retains only its canonical name in $code',
  async (locale) => {
    localStorage.setItem(interfaceLocaleStorageKey, locale.code);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({}, 503));
    vi.stubGlobal('fetch', fetchMock);
    renderWorkspace();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: locale.launch }));
    expect(screen.queryByLabelText(locale.tax)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(locale.preferences)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: locale.add }),
    ).not.toBeInTheDocument();
    change(locale.name, raw.displayName);
    fireEvent.click(screen.getByRole('button', { name: locale.submit }));
    await screen.findByRole('alert');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/clients',
      expect.objectContaining({
        method: 'POST',
        body: '{"displayName":"Știință {клиент} & Co"}',
        headers: expect.objectContaining({
          'x-company-context-id': 'company-registration',
          'idempotency-key': expect.any(String),
        }),
      }),
    );
  },
);

const fixedServerValidationCases = [
  {
    message: 'Client display name is required.',
    translations: {
      ro: 'Numele afișat al Clientului este obligatoriu.',
      ru: 'Укажите отображаемое название Клиента.',
      fr: 'Le nom affiché du Client est obligatoire.',
      en: 'Client display name is required.',
    },
  },
  {
    message: 'Client display name is too long.',
    translations: {
      ro: 'Numele afișat al Clientului este prea lung.',
      ru: 'Отображаемое название Клиента слишком длинное.',
      fr: 'Le nom affiché du Client est trop long.',
      en: 'Client display name is too long.',
    },
  },
  {
    message: 'Unknown Client field.',
    translations: {
      ro: 'Câmp necunoscut al Clientului.',
      ru: 'Неизвестное поле Клиента.',
      fr: 'Champ du Client inconnu.',
      en: 'Unknown Client field.',
    },
  },
  {
    message: 'Client tax ID must be text or null.',
    translations: {
      ro: 'IDNO / codul fiscal al Clientului trebuie să fie text sau nul.',
      ru: 'IDNO / налоговый код Клиента должен быть текстом или null.',
      fr: 'L’IDNO / code fiscal du Client doit être du texte ou null.',
      en: 'Client tax ID must be text or null.',
    },
  },
  {
    message: 'Client tax ID is too long.',
    translations: {
      ro: 'IDNO / codul fiscal al Clientului este prea lung.',
      ru: 'IDNO / налоговый код Клиента слишком длинный.',
      fr: 'L’IDNO / code fiscal du Client est trop long.',
      en: 'Client tax ID is too long.',
    },
  },
  {
    message: 'Client address must be text or null.',
    translations: {
      ro: 'Adresa Clientului trebuie să fie text sau nul.',
      ru: 'Адрес Клиента должен быть текстом или null.',
      fr: 'L’adresse du Client doit être du texte ou null.',
      en: 'Client address must be text or null.',
    },
  },
  {
    message: 'Client address is too long.',
    translations: {
      ro: 'Adresa Clientului este prea lungă.',
      ru: 'Адрес Клиента слишком длинный.',
      fr: 'L’adresse du Client est trop longue.',
      en: 'Client address is too long.',
    },
  },
  {
    message: 'Client telephone must be text or null.',
    translations: {
      ro: 'Telefonul Clientului trebuie să fie text sau nul.',
      ru: 'Телефон Клиента должен быть текстом или null.',
      fr: 'Le téléphone du Client doit être du texte ou null.',
      en: 'Client telephone must be text or null.',
    },
  },
  {
    message: 'Client telephone is too long.',
    translations: {
      ro: 'Telefonul Clientului este prea lung.',
      ru: 'Телефон Клиента слишком длинный.',
      fr: 'Le téléphone du Client est trop long.',
      en: 'Client telephone is too long.',
    },
  },
  {
    message: 'Client general email must be text or null.',
    translations: {
      ro: 'Emailul general al Clientului trebuie să fie text sau nul.',
      ru: 'Общий email Клиента должен быть текстом или null.',
      fr: 'L’email général du Client doit être du texte ou null.',
      en: 'Client general email must be text or null.',
    },
  },
  {
    message: 'Client general email is too long.',
    translations: {
      ro: 'Emailul general al Clientului este prea lung.',
      ru: 'Общий email Клиента слишком длинный.',
      fr: 'L’email général du Client est trop long.',
      en: 'Client general email is too long.',
    },
  },
  {
    message: 'Client business activity must be text or null.',
    translations: {
      ro: 'Activitatea economică a Clientului trebuie să fie text sau nul.',
      ru: 'Хозяйственная деятельность Клиента должна быть текстом или null.',
      fr: 'L’activité économique du Client doit être du texte ou null.',
      en: 'Client business activity must be text or null.',
    },
  },
  {
    message: 'Client business activity is too long.',
    translations: {
      ro: 'Activitatea economică a Clientului este prea lungă.',
      ru: 'Хозяйственная деятельность Клиента слишком длинная.',
      fr: 'L’activité économique du Client est trop longue.',
      en: 'Client business activity is too long.',
    },
  },
  {
    message: 'Client contacts must be a bounded list.',
    translations: {
      ro: 'Contactele Clientului trebuie să formeze o listă limitată.',
      ru: 'Контакты Клиента должны быть списком ограниченного размера.',
      fr: 'Les Contacts du Client doivent former une liste de taille limitée.',
      en: 'Client contacts must be a bounded list.',
    },
  },
  {
    message: 'Each Client contact must be an object.',
    translations: {
      ro: 'Fiecare Contact al Clientului trebuie să fie un obiect.',
      ru: 'Каждый Контакт Клиента должен быть объектом.',
      fr: 'Chaque Contact du Client doit être un objet.',
      en: 'Each Client contact must be an object.',
    },
  },
  {
    message: 'Unknown Client contact field.',
    translations: {
      ro: 'Câmp necunoscut al Contactului Clientului.',
      ru: 'Неизвестное поле Контакта Клиента.',
      fr: 'Champ du Contact du Client inconnu.',
      en: 'Unknown Client contact field.',
    },
  },
  {
    message: 'Client contact name is required.',
    translations: {
      ro: 'Numele Contactului Clientului este obligatoriu.',
      ru: 'Укажите имя Контакта Клиента.',
      fr: 'Le nom du Contact du Client est obligatoire.',
      en: 'Client contact name is required.',
    },
  },
  {
    message: 'Client contact name is too long.',
    translations: {
      ro: 'Numele Contactului Clientului este prea lung.',
      ru: 'Имя Контакта Клиента слишком длинное.',
      fr: 'Le nom du Contact du Client est trop long.',
      en: 'Client contact name is too long.',
    },
  },
  {
    message: 'Client contact telephone must be text or null.',
    translations: {
      ro: 'Telefonul Contactului Clientului trebuie să fie text sau nul.',
      ru: 'Телефон Контакта Клиента должен быть текстом или null.',
      fr: 'Le téléphone du Contact du Client doit être du texte ou null.',
      en: 'Client contact telephone must be text or null.',
    },
  },
  {
    message: 'Client contact telephone is too long.',
    translations: {
      ro: 'Telefonul Contactului Clientului este prea lung.',
      ru: 'Телефон Контакта Клиента слишком длинный.',
      fr: 'Le téléphone du Contact du Client est trop long.',
      en: 'Client contact telephone is too long.',
    },
  },
  {
    message: 'Client contact email must be text or null.',
    translations: {
      ro: 'Emailul Contactului Clientului trebuie să fie text sau nul.',
      ru: 'Email Контакта Клиента должен быть текстом или null.',
      fr: 'L’email du Contact du Client doit être du texte ou null.',
      en: 'Client contact email must be text or null.',
    },
  },
  {
    message: 'Client contact email is too long.',
    translations: {
      ro: 'Emailul Contactului Clientului este prea lung.',
      ru: 'Email Контакта Клиента слишком длинный.',
      fr: 'L’email du Contact du Client est trop long.',
      en: 'Client contact email is too long.',
    },
  },
  {
    message: 'Client contact email is invalid.',
    translations: {
      ro: 'Emailul Contactului Clientului nu este valid.',
      ru: 'Email Контакта Клиента недействителен.',
      fr: 'L’email du Contact du Client n’est pas valide.',
      en: 'Client contact email is invalid.',
    },
  },
  {
    message: 'Client contact position must be text.',
    translations: {
      ro: 'Funcția Contactului Clientului trebuie să fie text.',
      ru: 'Должность Контакта Клиента должна быть текстом.',
      fr: 'La fonction du Contact du Client doit être du texte.',
      en: 'Client contact position must be text.',
    },
  },
  {
    message: 'Client contact position is too long.',
    translations: {
      ro: 'Funcția Contactului Clientului este prea lungă.',
      ru: 'Должность Контакта Клиента слишком длинная.',
      fr: 'La fonction du Contact du Client est trop longue.',
      en: 'Client contact position is too long.',
    },
  },
  {
    message: 'Client contact decision roles must be a list.',
    translations: {
      ro: 'Rolurile Contactului Clientului în luarea deciziilor trebuie să formeze o listă.',
      ru: 'Роли Контакта Клиента в принятии решений должны быть списком.',
      fr: 'Les rôles du Contact du Client dans la décision doivent former une liste.',
      en: 'Client contact decision roles must be a list.',
    },
  },
  {
    message: 'Unknown Client contact decision role.',
    translations: {
      ro: 'Rol necunoscut al Contactului Clientului în luarea deciziilor.',
      ru: 'Неизвестная роль Контакта Клиента в принятии решений.',
      fr: 'Rôle du Contact du Client dans la décision inconnu.',
      en: 'Unknown Client contact decision role.',
    },
  },
  {
    message: 'Client contact communication preferences must be text.',
    translations: {
      ro: 'Preferințele de comunicare ale Contactului Clientului trebuie să fie text.',
      ru: 'Предпочтения Контакта Клиента по общению должны быть текстом.',
      fr: 'Les préférences de communication du Contact du Client doivent être du texte.',
      en: 'Client contact communication preferences must be text.',
    },
  },
  {
    message: 'Client contact communication preferences are too long.',
    translations: {
      ro: 'Preferințele de comunicare ale Contactului Clientului sunt prea lungi.',
      ru: 'Предпочтения Контакта Клиента по общению слишком длинные.',
      fr: 'Les préférences de communication du Contact du Client sont trop longues.',
      en: 'Client contact communication preferences are too long.',
    },
  },
  {
    message: 'Idempotency-Key header is required.',
    translations: {
      ro: 'Antetul Idempotency-Key este obligatoriu.',
      ru: 'Требуется заголовок Idempotency-Key.',
      fr: 'L’en-tête Idempotency-Key est obligatoire.',
      en: 'Idempotency-Key header is required.',
    },
  },
  {
    message: 'Idempotency-Key was already used for another Client command.',
    translations: {
      ro: 'Idempotency-Key a fost deja folosit pentru o altă comandă a Clientului.',
      ru: 'Idempotency-Key уже использован для другой команды Клиента.',
      fr: 'Idempotency-Key a déjà été utilisé pour une autre commande du Client.',
      en: 'Idempotency-Key was already used for another Client command.',
    },
  },
] as const;

it.each(fixedServerValidationCases)(
  'retranslates fixed registration/initial-Contact server validation: $message',
  async (example) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ message: example.message }, 400));
    vi.stubGlobal('fetch', fetchMock);
    const view = renderWorkspace(enrichedActor);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: locales[0].launch }));
    change(locales[0].name, raw.displayName);
    fireEvent.click(screen.getByRole('button', { name: locales[0].add }));
    change(locales[0].contactName, raw.name);
    change(locales[0].preferences, raw.preferences);
    fireEvent.click(screen.getByRole('button', { name: locales[0].submit }));
    await screen.findByRole('alert');
    const command = fetchMock.mock.calls[1]?.[1];
    expect(new Headers(command?.headers).get('idempotency-key')).toBeTruthy();
    expect(command).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: '{"displayName":"Știință {клиент} & Co","contacts":[{"name":"Ion {контакт}","communicationPreferences":"Română {limbă}\\nРусский; email dimineața"}]}',
        headers: expect.objectContaining({
          'x-company-context-id': 'company-registration',
          'idempotency-key': expect.any(String),
        }),
      }),
    );
    for (const locale of locales) {
      selectOption(screen.getByRole('combobox'), locale.code);
      expect(screen.getByRole('alert').textContent).toBe(
        example.translations[locale.code],
      );
      expect(screen.getByLabelText(locale.name)).toHaveValue(raw.displayName);
      expect(screen.getByLabelText(locale.contactName)).toHaveValue(raw.name);
      expect(screen.getByLabelText(locale.preferences)).toHaveValue(
        raw.preferences,
      );
      expect(
        screen.getByLabelText(locale.preferences),
      ).toHaveAccessibleDescription(locale.help);
      expect(screen.getByLabelText(locale.name)).toHaveAttribute(
        'aria-invalid',
        'false',
      );
      expect(screen.getByLabelText(locale.contactName)).not.toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1]?.[1]).toBe(command);
    }
    expect(view.onActivityRecorded).not.toHaveBeenCalled();
    expect(view.onActorRevalidated).not.toHaveBeenCalled();
    expect(view.onCompanyContextRejected).not.toHaveBeenCalled();
  },
);

it('translates fixed server registration validation reactively without changing its draft or command', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(json([]))
    .mockResolvedValueOnce(
      json({ message: 'Client general email is invalid.' }, 400),
    );
  vi.stubGlobal('fetch', fetchMock);
  const view = renderWorkspace(enrichedActor);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: locales[0].launch }));
  change(locales[0].name, raw.displayName);
  change(locales[0].email, 'Invalid {email} Кириллица');
  fireEvent.click(screen.getByRole('button', { name: locales[0].submit }));
  await screen.findByRole('alert');
  const messages = [
    'Emailul general al Clientului nu este valid.',
    'Общий email Клиента недействителен.',
    'L’email général du Client n’est pas valide.',
    'Client general email is invalid.',
  ];
  for (const [index, locale] of locales.entries()) {
    selectOption(screen.getByRole('combobox'), locale.code);
    expect(screen.getByRole('alert').textContent).toBe(messages[index]);
    expect(screen.getByLabelText(locale.name)).toHaveValue(raw.displayName);
    expect(screen.getByLabelText(locale.email)).toHaveValue(
      'Invalid {email} Кириллица',
    );
    expect(screen.getByLabelText(locale.name)).toHaveAttribute(
      'aria-invalid',
      'false',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }
  const command = fetchMock.mock.calls[1]?.[1];
  expect(command).toEqual(
    expect.objectContaining({
      method: 'POST',
      body: '{"displayName":"Știință {клиент} & Co","generalEmail":"Invalid {email} Кириллица"}',
      headers: expect.objectContaining({
        'x-company-context-id': 'company-registration',
        'idempotency-key': expect.any(String),
      }),
    }),
  );
  expect(new Headers(command?.headers).get('idempotency-key')).toBeTruthy();
  expect(view.onActivityRecorded).not.toHaveBeenCalled();
});

it.each([
  'denial',
  'duplicate',
  'missing server validation',
  'unrecognized server validation',
] as const)(
  'keeps %s feedback reactive and opaque across all locales',
  async (outcome) => {
    const response =
      outcome === 'denial'
        ? json({}, 403)
        : outcome === 'duplicate'
          ? json(
              {
                code: 'possible_duplicate_review_required',
                duplicate_review_reference: 'hidden-review-644',
                hiddenName: 'Hidden Client 644',
                hiddenCompany: 'Hidden Company 644',
              },
              409,
            )
          : outcome === 'missing server validation'
            ? json({}, 400)
            : json({ message: 'Original {server} Știință Кириллица' }, 400);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(response);
    if (outcome === 'denial')
      fetchMock.mockResolvedValueOnce(json(enrichedActor));
    vi.stubGlobal('fetch', fetchMock);
    const view = renderWorkspace(enrichedActor);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: locales[0].launch }));
    change(locales[0].name, raw.displayName);
    fireEvent.click(screen.getByRole('button', { name: locales[0].submit }));
    await screen.findAllByRole('alert');
    for (const locale of locales) {
      selectOption(screen.getByRole('combobox'), locale.code);
      const expected =
        outcome === 'denial'
          ? locale.denied
          : outcome === 'duplicate'
            ? locale.duplicate
            : outcome === 'missing server validation'
              ? locale.required
              : {
                  ro: 'Verificați datele Clientului și încercați din nou.',
                  ru: 'Проверьте данные Клиента и повторите попытку.',
                  fr: 'Vérifiez les informations du Client et réessayez.',
                  en: 'Check the Client details and try again.',
                }[locale.code];
      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(outcome === 'denial' ? 2 : 1);
      for (const alert of alerts) expect(alert.textContent).toBe(expected);
      expect(screen.getByLabelText(locale.name)).toHaveValue(raw.displayName);
      expect(
        screen.queryByText(
          /hidden-review-644|Hidden Client 644|Hidden Company 644/u,
        ),
      ).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(outcome === 'denial' ? 3 : 2);
    }
    expect(view.onActivityRecorded).not.toHaveBeenCalled();
    expect(view.onCompanyContextRejected).not.toHaveBeenCalled();
    expect(view.onActorRevalidated).toHaveBeenCalledTimes(
      outcome === 'denial' ? 1 : 0,
    );
  },
);

it('abandons a pending registration on authority loss after a locale switch and ignores its late confirmation', async () => {
  const pending = deferredResponse();
  let signal: AbortSignal | null | undefined;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== '/api/clients')
      throw new Error(`Unexpected HTTP: ${String(input)}`);
    if (init?.method === 'POST') {
      signal = init.signal;
      return pending.promise;
    }
    return Promise.resolve(json([]));
  });
  vi.stubGlobal('fetch', fetchMock);
  const view = renderWorkspace(enrichedActor);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: locales[0].launch }));
  change(locales[0].name, raw.displayName);
  fireEvent.click(screen.getByRole('button', { name: locales[0].submit }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  selectOption(screen.getByRole('combobox'), 'ru');
  expect(signal?.aborted).toBe(false);
  view.rerenderActor({
    ...enrichedActor,
    activeCompany: {
      id: 'company-registration',
      displayName: 'Companie {company}',
      clientPermissions: ['client.read'],
    },
  });
  expect(signal?.aborted).toBe(true);
  await act(async () =>
    pending.resolve(
      json(
        {
          id: 'late-hidden',
          displayName: 'Late hidden Client',
          relatedToActiveCompany: true,
        },
        201,
      ),
    ),
  );
  expect(screen.queryByText('Late hidden Client')).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: locales[1].launch }),
  ).not.toBeInTheDocument();
  expect(view.onActivityRecorded).not.toHaveBeenCalled();
});
