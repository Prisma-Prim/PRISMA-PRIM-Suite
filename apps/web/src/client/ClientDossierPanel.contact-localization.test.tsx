import {
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
  type InterfaceLocale,
} from '../localization/interface-locale';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { selectOption } from '../test/select-option';
import { ClientDossierPanel } from './ClientDossierPanel';

const locales = [
  {
    code: 'ro',
    group: 'Contact 1',
    name: 'Numele Contactului',
    position: 'Funcția Contactului',
    preferences: 'Preferințele de comunicare ale Contactului',
    errors: {
      name: 'Fiecare Contact trebuie să aibă un nume.',
      position: 'Funcția trebuie să aibă cel mult 500 de caractere.',
      preferences:
        'Preferințele de comunicare trebuie să aibă cel mult 1000 de caractere.',
    },
  },
  {
    code: 'ru',
    group: 'Контакт 1',
    name: 'Имя Контакта',
    position: 'Должность Контакта',
    preferences: 'Предпочтения Контакта по общению',
    errors: {
      name: 'У каждого Контакта должно быть имя.',
      position: 'Должность должна содержать не более 500 символов.',
      preferences:
        'Предпочтения по общению должны содержать не более 1000 символов.',
    },
  },
  {
    code: 'fr',
    group: 'Contact 1',
    name: 'Nom du Contact',
    position: 'Fonction du Contact',
    preferences: 'Préférences de communication du Contact',
    errors: {
      name: 'Chaque Contact doit avoir un nom.',
      position: 'La fonction doit contenir au maximum 500 caractères.',
      preferences:
        'Les préférences de communication doivent contenir au maximum 1000 caractères.',
    },
  },
  {
    code: 'en',
    group: 'Contact 1',
    name: 'Contact name',
    position: 'Contact position',
    preferences: 'Contact communication preferences',
    errors: {
      name: 'Each Contact must have a name.',
      position: 'Position must be 500 characters or fewer.',
      preferences:
        'Communication preferences must be 1000 characters or fewer.',
    },
  },
] satisfies ReadonlyArray<{
  code: InterfaceLocale;
  group: string;
  name: string;
  position: string;
  preferences: string;
  errors: Record<'name' | 'position' | 'preferences', string>;
}>;

const invalidDrafts = [
  { field: 'name', value: '   ' },
  { field: 'position', value: `  ${'P'.repeat(501)} {Функție}  ` },
  { field: 'preferences', value: `  ${'M'.repeat(1001)}\nș{рус}  ` },
] satisfies ReadonlyArray<{
  field: 'name' | 'position' | 'preferences';
  value: string;
}>;

const savedDossier = {
  id: 'client-contact-localization',
  displayName: 'Știință {клиент}',
  relatedToActiveCompany: true,
  taxId: 'IDNO {tax}',
  address: 'Rue {адрес}',
  telephone: '+373 {tel}',
  generalEmail: 'literal@example.test',
  businessActivity: 'Conseil {activitate}',
  contacts: [
    {
      name: 'Ana {контакт}',
      telephone: '+33 {număr}',
      email: 'ana@example.test',
      position: 'Directrice {роль}',
      decisionRoles: ['technical', 'financial'],
      communicationPreferences: 'Română; русский\nemail {dimineața}',
    },
    { name: 'Deuxième {Контакт}', email: 'second@example.test' },
  ],
  version: 7,
  involvedCompanyDisplayNames: ['Companie {company}'],
};

function renderDossier(
  locale: InterfaceLocale,
  correctionResponse?: Promise<Response>,
) {
  localStorage.setItem(interfaceLocaleStorageKey, locale);
  const onActivityRecorded = vi.fn(async () => undefined);
  const onClientsChanged = vi.fn(async () => undefined);
  const onCompanyContextRejected = vi.fn();
  const onActorRevalidated = vi.fn();
  const onWorkspaceAccessRejected = vi.fn();
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), 'http://localhost').pathname;
      if (init?.method === 'PATCH' && correctionResponse)
        return correctionResponse;
      if (init?.method && init.method !== 'GET')
        throw new Error('Invalid Contact draft must not send a command.');
      if (path === '/api/clients/client-contact-localization')
        return new Response(JSON.stringify(savedDossier));
      if (path.endsWith('/legal-entities'))
        return new Response(
          JSON.stringify({ clientVersion: 7, legalEntities: [] }),
        );
      throw new Error(`Unexpected dossier request: ${path}`);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <ApplicationPresentation value="prisme">
        <ClientDossierPanel
          clientAccountId={savedDossier.id}
          companyContextId="company-contact-localization"
          canUpdate
          identity={deterministicBrowserIdentity()}
          onActivityRecorded={onActivityRecorded}
          onClientsChanged={onClientsChanged}
          onCompanyContextRejected={onCompanyContextRejected}
          onActorRevalidated={onActorRevalidated}
          onWorkspaceAccessRejected={onWorkspaceAccessRejected}
        />
      </ApplicationPresentation>
    </InterfaceLocaleProvider>,
  );
  return {
    fetchMock,
    onActivityRecorded,
    onClientsChanged,
    onCompanyContextRejected,
    onActorRevalidated,
    onWorkspaceAccessRejected,
  };
}

function draftValues(form: HTMLElement) {
  return within(form)
    .getAllByRole('textbox')
    .map((field) => {
      if (!(
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement
      ))
        throw new Error('Expected a public text input.');
      return field.value;
    });
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

for (const initialLocale of locales) {
  for (const invalid of invalidDrafts) {
    it(`keeps ${invalid.field} Contact correction feedback reactive from ${initialLocale.code} without changing the literal draft or sending commands`, async () => {
      const view = renderDossier(initialLocale.code);
      await screen.findByRole('heading', { name: savedDossier.displayName });
      await waitFor(() => expect(view.fetchMock).toHaveBeenCalledTimes(2));
      fireEvent.click(
        screen.getByRole('button', { name: 'Correct Client dossier' }),
      );
      const form = screen.getByRole('form', { name: 'Correct Client dossier' });
      const contact = within(form).getByRole('group', {
        name: initialLocale.group,
      });
      const field = within(contact).getByLabelText(
        initialLocale[invalid.field],
      );
      fireEvent.change(field, { target: { value: invalid.value } });
      const values = draftValues(form);
      const textNodes = within(form).getAllByRole('textbox');
      const checkboxNodes = within(form).getAllByRole('checkbox');
      const checked = checkboxNodes.map((node) => {
        if (!(node instanceof HTMLInputElement))
          throw new Error('Expected a checkbox.');
        return node.checked;
      });
      fireEvent.click(
        within(form).getByRole('button', { name: 'Save correction' }),
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        initialLocale.errors[invalid.field],
      );
      expect(field).toHaveAttribute('aria-invalid', 'true');
      const association = field.getAttribute('aria-describedby');
      const localeControl = screen.getByRole('combobox');
      localeControl.focus();
      for (const locale of locales) {
        selectOption(localeControl, locale.code);
        expect(screen.getByRole('alert')).toHaveTextContent(
          locale.errors[invalid.field],
        );
        expect(
          screen.getByRole('form', { name: 'Correct Client dossier' }),
        ).toBe(form);
        expect(within(form).getAllByRole('textbox')).toEqual(textNodes);
        expect(draftValues(form)).toEqual(values);
        expect(within(form).getAllByRole('checkbox')).toEqual(checkboxNodes);
        checkboxNodes.forEach((node, index) => {
          if (!(node instanceof HTMLInputElement))
            throw new Error('Expected a checkbox.');
          expect(node.checked).toBe(checked[index]);
        });
        const currentContact = within(form).getByRole('group', {
          name: locale.group,
        });
        expect(
          within(currentContact).getByLabelText(locale[invalid.field]),
        ).toBe(field);
        expect(field).toHaveValue(invalid.value);
        expect(field).toHaveAttribute('aria-invalid', 'true');
        expect(field.getAttribute('aria-describedby')).toBe(association);
        expect(localeControl).toHaveFocus();
        expect(view.fetchMock).toHaveBeenCalledTimes(2);
        expect(view.onActivityRecorded).not.toHaveBeenCalled();
        expect(view.onClientsChanged).not.toHaveBeenCalled();
        expect(view.onCompanyContextRejected).not.toHaveBeenCalled();
        expect(view.onActorRevalidated).not.toHaveBeenCalled();
        expect(view.onWorkspaceAccessRejected).not.toHaveBeenCalled();
      }
    });
  }
}

const fixedContactServerCases = [
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
];

const expectedCorrectionBody =
  '{"expectedVersion":7,"displayName":"Știință {клиент}","taxId":"IDNO {tax}","address":"Rue {адрес}","telephone":"+373 {tel}","generalEmail":"literal@example.test","contacts":[{"name":"Ana {контакт}","telephone":"+33 {număr}","email":"ana@example.test","position":"Directrice {роль}","decisionRoles":["technical","financial"],"communicationPreferences":"Română; русский\\nemail {dimineața}"},{"name":"Deuxième {Контакт}","email":"second@example.test"}],"businessActivity":"Conseil {activitate}"}';

function heldResponse() {
  let release: ((value: Response) => void) | undefined;
  const promise = new Promise<Response>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    release: (value: unknown) => {
      if (!release) throw new Error('Expected the response resolver.');
      release(new Response(JSON.stringify(value), { status: 400 }));
    },
  };
}

function expectNoCallbacks(view: ReturnType<typeof renderDossier>) {
  expect(view.onActivityRecorded).not.toHaveBeenCalled();
  expect(view.onClientsChanged).not.toHaveBeenCalled();
  expect(view.onCompanyContextRejected).not.toHaveBeenCalled();
  expect(view.onActorRevalidated).not.toHaveBeenCalled();
  expect(view.onWorkspaceAccessRejected).not.toHaveBeenCalled();
}

it.each(fixedContactServerCases)(
  'keeps fixed Contact server feedback reactive without changing its correction command: $message',
  async (example) => {
    const response = heldResponse();
    const view = renderDossier('ro', response.promise);
    await screen.findByRole('heading', { name: savedDossier.displayName });
    await waitFor(() => expect(view.fetchMock).toHaveBeenCalledTimes(2));
    fireEvent.click(
      screen.getByRole('button', { name: 'Correct Client dossier' }),
    );
    const form = screen.getByRole('form', { name: 'Correct Client dossier' });
    const name = within(form).getByLabelText('Client display name');
    fireEvent.change(name, { target: { value: '  Știință {клиент}  ' } });
    const values = draftValues(form);
    const nodes = within(form).getAllByRole('textbox');
    const contact = within(form).getByRole('group', { name: locales[0].group });
    const contactName = within(contact).getByLabelText(locales[0].name);
    const preferences = within(contact).getByLabelText(locales[0].preferences);
    const preferenceAssociation = preferences.getAttribute('aria-describedby');
    fireEvent.click(
      within(form).getByRole('button', { name: 'Save correction' }),
    );
    await waitFor(() => expect(view.fetchMock).toHaveBeenCalledTimes(3));
    const command = view.fetchMock.mock.calls[2]?.[1];
    const key = new Headers(command?.headers).get('idempotency-key');
    expect(key).toBeTruthy();
    expect(command).toEqual(
      expect.objectContaining({
        method: 'PATCH',
        body: expectedCorrectionBody,
        headers: expect.objectContaining({
          'x-company-context-id': 'company-contact-localization',
          'idempotency-key': key,
        }),
      }),
    );
    for (const locale of locales) {
      selectOption(screen.getByRole('combobox'), locale.code);
      expect(
        within(form).getByRole('button', { name: 'Saving…' }),
      ).toBeDisabled();
      expect(draftValues(form)).toEqual(values);
      expect(view.fetchMock).toHaveBeenCalledTimes(3);
      expectNoCallbacks(view);
    }
    response.release({ message: example.message });
    await screen.findByRole('alert');
    for (const locale of locales) {
      const control = screen.getByRole('combobox');
      control.focus();
      selectOption(control, locale.code);
      expect(screen.getByRole('alert').textContent).toBe(
        example.translations[locale.code],
      );
      expect(within(form).getAllByRole('textbox')).toEqual(nodes);
      expect(draftValues(form)).toEqual(values);
      expect(name).toHaveAttribute('aria-invalid', 'false');
      expect(contactName).toHaveAttribute('aria-invalid', 'false');
      expect(contactName).not.toHaveAttribute('aria-describedby');
      expect(preferences.getAttribute('aria-describedby')).toBe(
        preferenceAssociation,
      );
      expect(control).toHaveFocus();
      expect(view.fetchMock).toHaveBeenCalledTimes(3);
      expect(view.fetchMock.mock.calls[2]?.[1]).toBe(command);
      expectNoCallbacks(view);
    }
    fireEvent.click(
      within(form).getByRole('button', { name: 'Save correction' }),
    );
    await waitFor(() => expect(view.fetchMock).toHaveBeenCalledTimes(4));
    const retry = view.fetchMock.mock.calls[3]?.[1];
    expect(retry?.body).toBe(expectedCorrectionBody);
    expect(new Headers(retry?.headers).get('idempotency-key')).toBe(key);
    expect(new Headers(retry?.headers).get('x-company-context-id')).toBe(
      'company-contact-localization',
    );
    expectNoCallbacks(view);
  },
);

it.each([
  {
    outcome: 'general',
    message: 'Client display name is too long.',
    expected: 'Client display name is too long.',
  },
  {
    outcome: 'unknown',
    message: 'Unrecognized dossier validation {literal}',
    expected: 'Unrecognized dossier validation {literal}',
  },
  {
    outcome: 'missing',
    message: undefined,
    expected: 'The Client correction is invalid.',
  },
])(
  'preserves excluded $outcome dossier validation behavior across locales',
  async (example) => {
    const response = heldResponse();
    const view = renderDossier('ro', response.promise);
    await screen.findByRole('heading', { name: savedDossier.displayName });
    await waitFor(() => expect(view.fetchMock).toHaveBeenCalledTimes(2));
    fireEvent.click(
      screen.getByRole('button', { name: 'Correct Client dossier' }),
    );
    const form = screen.getByRole('form', { name: 'Correct Client dossier' });
    const values = draftValues(form);
    fireEvent.click(
      within(form).getByRole('button', { name: 'Save correction' }),
    );
    await waitFor(() => expect(view.fetchMock).toHaveBeenCalledTimes(3));
    response.release(
      example.message === undefined ? {} : { message: example.message },
    );
    await screen.findByRole('alert');
    for (const locale of locales) {
      selectOption(screen.getByRole('combobox'), locale.code);
      expect(screen.getByRole('alert').textContent).toBe(example.expected);
      expect(draftValues(form)).toEqual(values);
      expect(view.fetchMock).toHaveBeenCalledTimes(3);
      expectNoCallbacks(view);
    }
  },
);
