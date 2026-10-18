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
  useInterfaceLocale,
} from '../localization/interface-locale';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { ClientDossierPanel } from './ClientDossierPanel';

const savedDossier = {
  id: 'client-localized-dossier',
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
  ],
  version: 7,
  involvedCompanyDisplayNames: ['Companie {company}'],
};

function LocaleSwitch() {
  const { changeLocale } = useInterfaceLocale();
  return <button onClick={() => changeLocale('ro')}>Choose Romanian</button>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderDossier() {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const onActivityRecorded = vi.fn(async () => undefined);
  const onClientsChanged = vi.fn(async () => undefined);
  const onCompanyContextRejected = vi.fn();
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(input.toString(), 'http://localhost').pathname;
    if (path === '/api/clients/client-localized-dossier')
      return Response.json(savedDossier);
    if (path.endsWith('/legal-entities'))
      return Response.json({ clientVersion: 7, legalEntities: [] });
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal('fetch', fetcher);
  render(
    <InterfaceLocaleProvider>
      <LocaleSwitch />
      <ApplicationPresentation value="prisme">
        <ClientDossierPanel
          clientAccountId={savedDossier.id}
          companyContextId="company-localized-dossier"
          canUpdate
          identity={deterministicBrowserIdentity()}
          onActivityRecorded={onActivityRecorded}
          onClientsChanged={onClientsChanged}
          onCompanyContextRejected={onCompanyContextRejected}
        />
      </ApplicationPresentation>
    </InterfaceLocaleProvider>,
  );
  return {
    fetcher,
    onActivityRecorded,
    onClientsChanged,
    onCompanyContextRejected,
  };
}

it('translates the public English dossier correction to Romanian without replacing its input, draft, focus, selection or issuing HTTP', async () => {
  const {
    fetcher,
    onActivityRecorded,
    onClientsChanged,
    onCompanyContextRejected,
  } = renderDossier();
  await screen.findByRole('heading', { name: savedDossier.displayName });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  fireEvent.click(
    screen.getByRole('button', { name: 'Correct Client dossier' }),
  );
  const form = screen.getByRole('form', { name: 'Correct Client dossier' });
  const input = within(form).getByLabelText('Client display name');
  if (!(input instanceof HTMLInputElement))
    throw new Error('Expected the name input.');
  fireEvent.change(input, { target: { value: '  Literal Ș {draft} Я  ' } });
  input.focus();
  input.setSelectionRange(3, 11);
  const textboxes = within(form).getAllByRole('textbox');
  const before = fetcher.mock.calls.length;

  fireEvent.click(screen.getByRole('button', { name: 'Choose Romanian' }));

  expect(
    screen.getByRole('form', { name: 'Corectează dosarul Clientului' }),
  ).toBe(form);
  expect(within(form).getByLabelText('Numele afișat al Clientului')).toBe(
    input,
  );
  expect(
    within(form).getByRole('button', { name: 'Salvează corectarea' }),
  ).toBeVisible();
  expect(within(form).getAllByRole('textbox')).toEqual(textboxes);
  expect(input).toHaveValue('  Literal Ș {draft} Я  ');
  expect(input).toHaveFocus();
  expect([input.selectionStart, input.selectionEnd]).toEqual([3, 11]);
  expect(fetcher).toHaveBeenCalledTimes(before);
  expect(onActivityRecorded).not.toHaveBeenCalled();
  expect(onClientsChanged).not.toHaveBeenCalled();
  expect(onCompanyContextRejected).not.toHaveBeenCalled();
});

it('translates shared Contact read descriptions after a locale switch without changing literal values or performing HTTP', async () => {
  const {
    fetcher,
    onActivityRecorded,
    onClientsChanged,
    onCompanyContextRejected,
  } = renderDossier();
  await screen.findByRole('heading', { name: savedDossier.displayName });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  const contacts = screen.getByRole('region', { name: 'Contacts' });
  expect(contacts).toHaveTextContent('Decision roles: Technical, Financial');
  expect(contacts).toHaveTextContent(
    'Communication preferences: Română; русский email {dimineața}',
  );
  const name = within(contacts).getByText('Ana {контакт}');
  const preferences = within(contacts).getByText(/Communication preferences:/u);
  const before = fetcher.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Choose Romanian' }));
  expect(screen.getByRole('region', { name: 'Contacte' })).toBe(contacts);
  expect(contacts).toHaveTextContent(
    'Roluri în luarea deciziilor: Tehnic, Financiar',
  );
  expect(contacts).toHaveTextContent(
    'Preferințe de comunicare: Română; русский email {dimineața}',
  );
  expect(within(contacts).getByText('Ana {контакт}')).toBe(name);
  expect(within(contacts).getByText(/Preferințe de comunicare:/u)).toBe(
    preferences,
  );
  expect(within(contacts).getByText('Directrice {роль}')).toBeVisible();
  expect(within(contacts).getByText('+33 {număr}')).toBeVisible();
  expect(within(contacts).getByText('ana@example.test')).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(before);
  expect(onActivityRecorded).not.toHaveBeenCalled();
  expect(onClientsChanged).not.toHaveBeenCalled();
  expect(onCompanyContextRejected).not.toHaveBeenCalled();
});
