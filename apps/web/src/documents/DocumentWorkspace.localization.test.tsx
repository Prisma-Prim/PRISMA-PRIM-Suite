import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
} from '../localization/interface-locale';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { selectOption } from '../test/select-option';
import { DocumentWorkspace, type RequestedDocument } from './DocumentWorkspace';

const actor: ActorContext = {
  internalUserId: 'registrar',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Literal Workspace',
  displayName: 'Literal Actor',
  email: 'registrar@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company',
    displayName: 'Companie {company}',
    clientPermissions: ['client.read'],
    documentPermissions: [
      'document.read',
      'document.register',
      'document.reference.read',
      'document.correct',
    ],
  },
};
const identity: BrowserIdentity = {
  loaded: true,
  signedIn: true,
  getToken: async () => 'token',
  rejectSession: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
  signedOutView: null,
};
const document = {
  id: 'document',
  companyId: 'company',
  clientId: 'client',
  clientDisplayName: 'Client {client} Ș Я é',
  title: 'Literal questionnaire',
  purpose: 'Literal saved purpose',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: '2026-09-19T12:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: {
    id: 'version',
    status: 'draft',
    representation: {
      id: 'representation',
      kind: 'external-reference',
      verification: 'unverified',
      access: 'granted',
      url: 'https://example.test/questionnaire',
    },
  },
};

function ChangeLocaleWithoutMovingFocus() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <button onClick={() => changeLocale('en')}>
      Change interface locale programmatically
    </button>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('retains a held Document and the exact uncertain correction across locale changes and a late acknowledgement', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  let finishPatch: ((response: Response) => void) | undefined;
  const pendingPatch = new Promise<Response>((resolve) => {
    finishPatch = resolve;
  });
  const otherDocument = {
    ...document,
    id: 'other',
    title: 'Other literal Document',
  };
  let saved = false;
  let patches = 0;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      patches += 1;
      if (patches === 1) return pendingPatch;
      saved = true;
      return Response.json({
        documentId: 'document',
        revision: 2,
        outcome: 'corrected',
      });
    }
    if (url.endsWith('/clients')) return Response.json([]);
    if (url.endsWith('/versions')) return new Response(null, { status: 404 });
    if (url.endsWith('/documents/other')) return Response.json(otherDocument);
    const current = saved
      ? { ...document, workingRevision: 2, title: 'Correction {literal} Ș Я é' }
      : document;
    if (url.endsWith('/documents/document')) return Response.json(current);
    if (url.endsWith('/documents'))
      return Response.json([current, otherDocument]);
    throw new Error(`Unexpected HTTP request: ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  const onActivityRecorded = vi.fn();
  const content = (requestedDocument?: RequestedDocument) => (
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <DocumentWorkspace
        actor={actor}
        identity={identity}
        requestedDocument={requestedDocument}
        onActivityRecorded={onActivityRecorded}
      />
    </InterfaceLocaleProvider>
  );
  const view = render(content());
  fireEvent.click(await screen.findByRole('button', { name: document.title }));
  await screen.findByText(
    'Versions are not available with your current access.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit reference' }));
  const title = screen.getByRole('textbox', { name: 'Title' });
  const purpose = screen.getByRole('textbox', { name: 'Purpose' });
  const url = screen.getByRole('textbox', { name: 'External HTTPS link' });
  fireEvent.change(title, { target: { value: 'Correction {literal} Ș Я é' } });
  fireEvent.change(purpose, { target: { value: 'Purpose {literal} fr' } });
  fireEvent.change(url, {
    target: { value: 'https://example.test/correction?lang=en' },
  });
  view.rerender(content({ documentId: 'other', requestId: 1 }));
  expect(
    screen.getByText(
      'The requested Document opens after this correction is saved or cancelled.',
    ),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  await waitFor(() => expect(patches).toBe(1));
  const baseline = fetcher.mock.calls.length;
  const locale = screen.getByRole('combobox', { name: 'Interface language' });
  selectOption(locale, 'ro');
  expect(screen.getByText('Se salvează corectarea…')).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Titlu' })).toBe(title);
  expect(title).toBeDisabled();
  expect(
    screen.getByText(
      'Documentul solicitat se deschide după salvarea sau anularea acestei corectări.',
    ),
  ).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(baseline);
  expect(onActivityRecorded).not.toHaveBeenCalled();
  if (!finishPatch) throw new Error('Correction response was not initialized');
  const completePatch = finishPatch;
  await act(async () => completePatch(new Response(null, { status: 502 })));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Rezultatul corectării este incert.',
  );
  selectOption(locale, 'ru');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Результат исправления неизвестен.',
  );
  expect(screen.getByRole('textbox', { name: 'Название' })).toBe(title);
  expect(screen.getByRole('textbox', { name: 'Назначение' })).toBe(purpose);
  expect(screen.getByRole('textbox', { name: 'Внешняя HTTPS-ссылка' })).toBe(
    url,
  );
  expect(title).toHaveValue('Correction {literal} Ș Я é');
  expect(purpose).toHaveValue('Purpose {literal} fr');
  expect(url).toHaveValue('https://example.test/correction?lang=en');
  expect(
    screen.queryByRole('heading', { name: otherDocument.title }),
  ).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(baseline);
  expect(onActivityRecorded).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Повторить то же исправление' }),
  );
  await screen.findByRole('heading', { name: otherDocument.title });
  const commands = fetcher.mock.calls.filter(
    ([, init]) => init?.method === 'PATCH',
  );
  expect(commands).toHaveLength(2);
  expect(commands[1]?.[0]).toBe(commands[0]?.[0]);
  expect(commands[1]?.[1]?.body).toBe(commands[0]?.[1]?.body);
  expect(commands[0]?.[1]?.body).toBe(
    '{"expectedRevision":1,"title":"Correction {literal} Ș Я é","purpose":"Purpose {literal} fr","url":"https://example.test/correction?lang=en"}',
  );
  const originalHeaders = new Headers(commands[0]?.[1]?.headers);
  const retriedHeaders = new Headers(commands[1]?.[1]?.headers);
  expect(retriedHeaders.get('idempotency-key')).toBe(
    originalHeaders.get('idempotency-key'),
  );
  expect(originalHeaders.get('idempotency-key')).toBeTruthy();
  expect(originalHeaders.get('x-company-context-id')).toBe('company');
  expect(retriedHeaders.get('x-company-context-id')).toBe('company');
  expect(onActivityRecorded).toHaveBeenCalledOnce();
});

it('translates the ready registry without replacing literal drafts, Client selection or filter or issuing I/O', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith('/clients'))
      return Response.json([
        { id: 'client', displayName: document.clientDisplayName },
      ]);
    if (url.endsWith('/documents')) return Response.json([document]);
    throw new Error(`Unexpected HTTP request: ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  const onActivityRecorded = vi.fn();
  const onOpenClientDossier = vi.fn();
  const onOpenProject = vi.fn();
  render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <ChangeLocaleWithoutMovingFocus />
      <DocumentWorkspace
        actor={actor}
        identity={identity}
        onActivityRecorded={onActivityRecorded}
        onOpenClientDossier={onOpenClientDossier}
        onOpenProject={onOpenProject}
      />
    </InterfaceLocaleProvider>,
  );

  // Ready fields, rows and options publish only after both initial HTTP reads
  // have completed. Establish the no-I/O baseline after that public state.
  const title = await screen.findByRole('textbox', { name: 'Title' });
  expect(
    screen.getByRole('button', { name: document.title }),
  ).toBeInTheDocument();
  const client = screen.getByRole('combobox', { name: 'Client' });
  selectOption(client, 'client');
  const purpose = screen.getByRole('textbox', { name: 'Purpose' });
  const url = screen.getByRole('textbox', { name: 'External HTTPS link' });
  const filter = screen.getByRole('searchbox', {
    name: 'Filter working Documents',
  });
  fireEvent.change(title, { target: { value: 'Titlu {literal} Я é' } });
  fireEvent.change(purpose, { target: { value: 'Scop {purpose} Ș Я é' } });
  fireEvent.change(url, {
    target: { value: 'https://example.test/literal?language=en' },
  });
  fireEvent.change(filter, { target: { value: 'Client {client} S Я é' } });
  await act(async () => undefined);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const baseline = fetcher.mock.calls.length;

  const localeControl = screen.getByRole('combobox', {
    name: 'Interface language',
  });
  const registrationTime = globalThis.document.querySelector('time');
  for (const locale of [
    {
      code: 'ro',
      region: 'Documente de lucru',
      title: 'Titlu',
      purpose: 'Scop',
      url: 'Link HTTPS extern',
      client: 'Client',
      register: 'Înregistrează referința de lucru',
    },
    {
      code: 'ru',
      region: 'Рабочие Документы',
      title: 'Название',
      purpose: 'Назначение',
      url: 'Внешняя HTTPS-ссылка',
      client: 'Клиент',
      register: 'Зарегистрировать рабочую ссылку',
    },
    {
      code: 'fr',
      region: 'Documents de travail',
      title: 'Titre',
      purpose: 'Objet',
      url: 'Lien HTTPS externe',
      client: 'Client',
      register: 'Enregistrer la référence de travail',
    },
  ]) {
    selectOption(localeControl, locale.code);
    expect(
      screen.getByRole('region', { name: locale.region }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: locale.title })).toBe(title);
    expect(screen.getByRole('textbox', { name: locale.purpose })).toBe(purpose);
    expect(screen.getByRole('textbox', { name: locale.url })).toBe(url);
    expect(screen.getByRole('combobox', { name: locale.client })).toBe(client);
    expect(screen.getByRole('button', { name: locale.register })).toBeEnabled();
    expect(client).toHaveTextContent(document.clientDisplayName);
    expect(title).toHaveValue('Titlu {literal} Я é');
    expect(purpose).toHaveValue('Scop {purpose} Ș Я é');
    expect(url).toHaveValue('https://example.test/literal?language=en');
    expect(filter).toHaveValue('Client {client} S Я é');
    expect(
      screen.getByRole('button', { name: document.title }),
    ).toBeInTheDocument();
    expect(globalThis.document.querySelector('time')).toBe(registrationTime);
    expect(registrationTime).toHaveAttribute('datetime', document.createdAt);
    expect(fetcher).toHaveBeenCalledTimes(baseline);
    expect(onActivityRecorded).not.toHaveBeenCalled();
    expect(onOpenClientDossier).not.toHaveBeenCalled();
    expect(onOpenProject).not.toHaveBeenCalled();
  }

  title.focus();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Change interface locale programmatically',
    }),
  );
  expect(screen.getByRole('textbox', { name: 'Title' })).toBe(title);
  expect(title).toHaveFocus();
  expect(fetcher).toHaveBeenCalledTimes(baseline);
});
