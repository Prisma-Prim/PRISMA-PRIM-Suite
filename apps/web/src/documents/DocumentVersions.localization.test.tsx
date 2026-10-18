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
import { DocumentVersions } from './DocumentVersions';

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
    displayName: 'Literal Company',
    clientPermissions: ['client.read'],
    documentPermissions: [
      'document.read',
      'document.reference.read',
      'document.version.manage',
      'document.version.designate_official',
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
const createdAt = '2026-09-20T08:00:00.000Z';
const draft = {
  id: 'version-1',
  number: 1,
  status: 'draft',
  createdAt,
  createdBy: { displayName: 'Actor {literal} Я é' },
  pdfContent: { state: 'absent' },
  representations: [
    {
      id: 'reference',
      kind: 'external-reference',
      verification: 'unverified',
      position: 1,
      form: 'other',
      primary: true,
      appendedAfterDesignation: false,
      addedAt: createdAt,
      addedBy: { displayName: 'Actor {literal} Я é' },
      access: 'granted',
      url: 'https://example.test/literal?language=en',
    },
  ],
};

function SwitchToFrenchWithoutMovingFocus() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <button onClick={() => changeLocale('fr')}>
      Switch to French without moving focus
    </button>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const otherReceiptCases = [
  {
    action: 'drafted',
    number: 2,
    path: '/api/documents/document/versions',
    payload: '{"expectedRevision":4}',
    ro: 'Versiunea 2 a fost începută ca Versiune de lucru.',
    ru: 'Версия 2 создана как черновик.',
    fr: 'La Version 2 a été créée comme brouillon.',
    en: 'Version 2 was started as a draft.',
  },
  {
    action: 'representation_added',
    number: 1,
    path: '/api/documents/document/versions/version-1/representations',
    payload:
      '{"expectedRevision":4,"form":"signed","url":"https://example.test/new?lang=fr"}',
    ro: 'A fost adăugată o referință la Versiunea 1.',
    ru: 'К Версии 1 добавлена ссылка.',
    fr: 'Une référence a été ajoutée à la Version 1.',
    en: 'A reference was added to Version 1.',
  },
  {
    action: 'representation_removed',
    number: 1,
    path: '/api/documents/document/versions/version-1/representations/reference/removal',
    payload: '{"expectedRevision":4}',
    ro: 'A fost eliminată o referință de lucru din Versiunea 1.',
    ru: 'Из Версии 1 убрана черновая ссылка.',
    fr: 'Une référence de brouillon a été retirée de la Version 1.',
    en: 'A draft reference was removed from Version 1.',
  },
] as const;

it.each(otherReceiptCases)(
  'translates a late $action receipt in all four locales without repeating its command',
  async (scenario) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    let finishCommand: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      finishCommand = resolve;
    });
    let versionReads = 0;
    const readVersion =
      scenario.action === 'drafted'
        ? {
            ...draft,
            status: 'official',
            designatedAt: createdAt,
            designatedBy: { displayName: 'Approver {literal}' },
            frozen: { title: 'Titre {literal}', purpose: 'Scop {literal}' },
          }
        : scenario.action === 'representation_removed'
          ? {
              ...draft,
              representations: [
                ...draft.representations,
                ...draft.representations.map((reference) => ({
                  ...reference,
                  id: 'second-reference',
                  position: 2,
                  primary: false,
                })),
              ],
            }
          : draft;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return pending;
      if (url.endsWith('/versions')) {
        versionReads += 1;
        return Response.json({
          workingRevision: 4,
          mutable: true,
          versions: [
            {
              ...readVersion,
              createdBy: {
                displayName:
                  versionReads === 1 ? 'First Actor' : 'Refreshed Actor',
              },
            },
          ],
        });
      }
      throw new Error(`Unexpected HTTP request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const onRefresh = vi.fn();
    render(
      <InterfaceLocaleProvider>
        <InterfaceLocaleSelect />
        <DocumentVersions
          actor={actor}
          identity={identity}
          documentId="document"
          workingRevision={4}
          onRefresh={onRefresh}
        />
      </InterfaceLocaleProvider>,
    );
    await screen.findByText('Created by First Actor');
    if (scenario.action === 'drafted')
      fireEvent.click(screen.getByRole('button', { name: 'Start new draft' }));
    else if (scenario.action === 'representation_added') {
      selectOption(
        screen.getByRole('combobox', { name: 'Reference form' }),
        'signed',
      );
      fireEvent.change(screen.getByRole('textbox', { name: 'HTTPS URL' }), {
        target: { value: 'https://example.test/new?lang=fr' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add reference' }));
    } else {
      const remove = screen.getAllByRole('button', { name: 'Remove' })[0];
      if (!remove) throw new Error('Expected a removable draft reference');
      fireEvent.click(remove);
    }
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const localeControl = screen.getByRole('combobox', {
      name: 'Interface language',
    });
    selectOption(localeControl, 'ro');
    expect(
      screen.getByText('Se salvează modificarea Versiunii…'),
    ).toBeVisible();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onRefresh).not.toHaveBeenCalled();
    if (!finishCommand) throw new Error('Command response was not initialized');
    const completeCommand = finishCommand;
    await act(async () =>
      completeCommand(
        Response.json({
          documentId: 'document',
          workingRevision: 5,
          versionId: `version-${scenario.number}`,
          versionNumber: scenario.number,
          action: scenario.action,
          sourceVersionNumber: 1,
          representationId: 'reference',
          appendedAfterDesignation: false,
        }),
      ),
    );
    expect(await screen.findByText(scenario.ro)).toHaveAttribute(
      'role',
      'status',
    );
    await screen.findByText('Creată de Refreshed Actor');
    const baseline = fetcher.mock.calls.length;
    for (const locale of [
      { code: 'ru', success: scenario.ru },
      { code: 'fr', success: scenario.fr },
      { code: 'en', success: scenario.en },
    ]) {
      selectOption(localeControl, locale.code);
      expect(screen.getByText(locale.success)).toHaveAttribute(
        'role',
        'status',
      );
      expect(fetcher).toHaveBeenCalledTimes(baseline);
      expect(onRefresh).toHaveBeenCalledOnce();
    }
    const commands = fetcher.mock.calls.filter(
      ([, init]) => init?.method === 'POST',
    );
    expect(commands).toHaveLength(1);
    expect(commands[0]?.[0]).toBe(scenario.path);
    expect(commands[0]?.[1]?.body).toBe(scenario.payload);
    expect(
      new Headers(commands[0]?.[1]?.headers).get('x-company-context-id'),
    ).toBe('company');
  },
);

it('preserves the reference form, validation, focused append confirmation and exact uncertain retry across locales', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  let finishCommand: ((response: Response) => void) | undefined;
  const pending = new Promise<Response>((resolve) => {
    finishCommand = resolve;
  });
  let commandsSent = 0;
  let versionReads = 0;
  const official = {
    ...draft,
    status: 'official',
    designatedAt: createdAt,
    designatedBy: { displayName: 'Approver {literal}' },
    frozen: { title: 'Titre {literal}', purpose: 'Scop {literal}' },
  };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      commandsSent += 1;
      if (commandsSent === 1) return pending;
      return Response.json({
        documentId: 'document',
        workingRevision: 5,
        versionId: 'version-1',
        versionNumber: 1,
        action: 'representation_added',
        representationId: 'new-reference',
        appendedAfterDesignation: true,
      });
    }
    if (url.endsWith('/versions')) {
      versionReads += 1;
      return Response.json({
        workingRevision: 4,
        mutable: true,
        versions: [
          {
            ...official,
            createdBy: {
              displayName:
                versionReads === 1 ? 'First Actor' : 'Refreshed Actor',
            },
          },
        ],
      });
    }
    throw new Error(`Unexpected HTTP request: ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  const onRefresh = vi.fn();
  render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <SwitchToFrenchWithoutMovingFocus />
      <DocumentVersions
        actor={actor}
        identity={identity}
        documentId="document"
        workingRevision={4}
        onRefresh={onRefresh}
      />
    </InterfaceLocaleProvider>,
  );
  await screen.findByText('Created by First Actor');
  const form = screen.getByRole('combobox', { name: 'Reference form' });
  const url = screen.getByRole('textbox', { name: 'HTTPS URL' });
  selectOption(form, 'signed');
  fireEvent.change(url, {
    target: { value: 'https://name:password@example.test/reference' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Add reference to official Version' }),
  );
  expect(
    screen.getByText('Enter an HTTPS URL without credentials.'),
  ).toBeVisible();
  const localeControl = screen.getByRole('combobox', {
    name: 'Interface language',
  });
  selectOption(localeControl, 'ro');
  expect(
    screen.getByText('Introdu un URL HTTPS fără date de autentificare.'),
  ).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Forma referinței' })).toBe(form);
  expect(form).toHaveAttribute('data-value', 'signed');
  expect(screen.getByRole('textbox', { name: 'URL HTTPS' })).toBe(url);
  expect(url).toHaveValue('https://name:password@example.test/reference');
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.change(url, {
    target: { value: 'https://example.test/append?language=en' },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Adaugă referință la Versiunea oficială',
    }),
  );
  const confirm = screen.getByRole('button', {
    name: 'Adaugă referința ireversibilă',
  });
  expect(confirm).toHaveFocus();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Switch to French without moving focus',
    }),
  );
  expect(
    screen.getByRole('button', { name: 'Ajouter la référence irréversible' }),
  ).toBe(confirm);
  expect(confirm).toHaveFocus();
  expect(screen.getByRole('group')).toHaveTextContent(
    'Elle appartiendra à cette Version exacte et ne pourra jamais être retirée.',
  );
  expect(url).toHaveValue('https://example.test/append?language=en');
  expect(form).toHaveAttribute('data-value', 'signed');
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(confirm);
  await waitFor(() => expect(commandsSent).toBe(1));
  const baseline = fetcher.mock.calls.length;
  selectOption(localeControl, 'ru');
  expect(screen.getByText('Сохранение изменения Версии…')).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(baseline);
  expect(onRefresh).not.toHaveBeenCalled();
  if (!finishCommand) throw new Error('Command response was not initialized');
  const completeCommand = finishCommand;
  await act(async () => completeCommand(new Response(null, { status: 502 })));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Результат этого изменения Версии неизвестен.',
  );
  selectOption(localeControl, 'en');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The result of this Version change is uncertain.',
  );
  expect(fetcher).toHaveBeenCalledTimes(baseline);
  expect(url).toHaveValue('https://example.test/append?language=en');
  expect(form).toHaveAttribute('data-value', 'signed');
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry the same Version change' }),
  );
  await screen.findByText('A reference was added to Version 1.');
  await screen.findByText('Created by Refreshed Actor');
  const commands = fetcher.mock.calls.filter(
    ([, init]) => init?.method === 'POST',
  );
  expect(commands).toHaveLength(2);
  expect(commands[0]?.[0]).toBe(
    '/api/documents/document/versions/version-1/representations',
  );
  expect(commands[1]?.[0]).toBe(commands[0]?.[0]);
  expect(commands[0]?.[1]?.body).toBe(
    '{"expectedRevision":4,"form":"signed","url":"https://example.test/append?language=en"}',
  );
  expect(commands[1]?.[1]?.body).toBe(commands[0]?.[1]?.body);
  const originalHeaders = new Headers(commands[0]?.[1]?.headers);
  const retryHeaders = new Headers(commands[1]?.[1]?.headers);
  expect(originalHeaders.get('idempotency-key')).toBeTruthy();
  expect(retryHeaders.get('idempotency-key')).toBe(
    originalHeaders.get('idempotency-key'),
  );
  expect(originalHeaders.get('x-company-context-id')).toBe('company');
  expect(retryHeaders.get('x-company-context-id')).toBe('company');
  expect(onRefresh).toHaveBeenCalledOnce();
});

it.each([
  {
    status: 403,
    code: null,
    ro: 'Nu mai ai permisiunea pentru această modificare a Versiunii.',
    ru: 'У вас больше нет права на это изменение Версии.',
    fr: 'Vous n’avez plus l’autorisation d’effectuer cette modification de Version.',
    en: 'You no longer have permission for this Version change.',
  },
  {
    status: 404,
    code: null,
    ro: 'Acest Document nu mai poate fi modificat aici.',
    ru: 'Этот Документ больше нельзя изменить здесь.',
    fr: 'Ce Document ne peut plus être modifié ici.',
    en: 'This Document can no longer be changed here.',
  },
  {
    status: 409,
    code: null,
    ro: 'Acest Document s-a schimbat.',
    ru: 'Этот Документ изменился.',
    fr: 'Ce Document a changé.',
    en: 'This Document changed.',
  },
  {
    status: 400,
    code: null,
    ro: 'Acest Document s-a schimbat.',
    ru: 'Этот Документ изменился.',
    fr: 'Ce Document a changé.',
    en: 'This Document changed.',
  },
  {
    status: 409,
    code: 'document_version_capacity_exceeded',
    ro: 'Acest Document a atins limita de Versiuni.',
    ru: 'Достигнут предел Версий этого Документа.',
    fr: 'Ce Document a atteint sa limite de Versions.',
    en: 'This Document has reached its Version limit.',
  },
])(
  'keeps a late known refusal $status/$code distinct from uncertainty in all four locales',
  async (scenario) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    let finishCommand: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      finishCommand = resolve;
    });
    const official = {
      ...draft,
      status: 'official',
      designatedAt: createdAt,
      designatedBy: { displayName: 'Approver {literal}' },
      frozen: { title: 'Titre {literal}', purpose: 'Scop {literal}' },
    };
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return pending;
      if (url.endsWith('/access/current-actor')) return Response.json(actor);
      if (url.endsWith('/versions'))
        return Response.json({
          workingRevision: 4,
          mutable: true,
          versions: [official],
        });
      throw new Error(`Unexpected HTTP request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const onRefresh = vi.fn();
    const onActorRevalidated = vi.fn();
    render(
      <InterfaceLocaleProvider>
        <InterfaceLocaleSelect />
        <DocumentVersions
          actor={actor}
          identity={identity}
          documentId="document"
          workingRevision={4}
          onRefresh={onRefresh}
          onActorRevalidated={onActorRevalidated}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Start new draft' }),
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const localeControl = screen.getByRole('combobox', {
      name: 'Interface language',
    });
    selectOption(localeControl, 'ro');
    expect(fetcher).toHaveBeenCalledTimes(2);
    if (!finishCommand) throw new Error('Command response was not initialized');
    const completeCommand = finishCommand;
    await act(async () =>
      completeCommand(
        Response.json(scenario.code ? { code: scenario.code } : {}, {
          status: scenario.status,
        }),
      ),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(scenario.ro);
    if (scenario.status === 403)
      await waitFor(() => expect(onActorRevalidated).toHaveBeenCalledOnce());
    const baseline = fetcher.mock.calls.length;
    for (const locale of [
      { code: 'ru', refused: scenario.ru },
      { code: 'fr', refused: scenario.fr },
      { code: 'en', refused: scenario.en },
    ]) {
      selectOption(localeControl, locale.code);
      expect(screen.getByRole('alert')).toHaveTextContent(locale.refused);
      expect(fetcher).toHaveBeenCalledTimes(baseline);
    }
    expect(
      screen.queryByRole('button', { name: 'Retry the same Version change' }),
    ).not.toBeInTheDocument();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
  },
);

it('rerenders an already confirmed Version receipt in the current locale while a failed parent refresh stays confirmed', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  let versionReads = 0;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST')
      return Response.json({
        documentId: 'document',
        workingRevision: 5,
        action: 'designated_official',
        versionId: 'version-1',
        versionNumber: 1,
        supersededVersionNumber: null,
      });
    if (url.endsWith('/versions')) {
      versionReads += 1;
      return Response.json({
        workingRevision: 4,
        mutable: true,
        versions: [
          versionReads === 1
            ? draft
            : {
                ...draft,
                createdBy: { displayName: 'Refreshed Actor {literal}' },
              },
        ],
      });
    }
    throw new Error(`Unexpected HTTP request: ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  const onRefresh = vi.fn(async () => {
    throw new Error('Synthetic parent refresh failure');
  });
  render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <DocumentVersions
        actor={actor}
        identity={identity}
        documentId="document"
        workingRevision={4}
        onRefresh={onRefresh}
      />
    </InterfaceLocaleProvider>,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Designate as official' }),
  );
  const confirm = screen.getByRole('button', {
    name: 'Confirm official designation',
  });
  expect(confirm).toHaveFocus();
  fireEvent.click(confirm);
  expect(await screen.findByText('Version 1 is now official.')).toHaveAttribute(
    'role',
    'status',
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
  // This attribution is only in the command-triggered GET response: observing
  // it proves that read settled before the no-I/O baseline.
  expect(
    await screen.findByText('Created by Refreshed Actor {literal}'),
  ).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Version 1' })).toBeVisible();
  const baseline = fetcher.mock.calls.length;
  const localeControl = screen.getByRole('combobox', {
    name: 'Interface language',
  });
  for (const locale of [
    { code: 'ro', success: 'Versiunea 1 este acum oficială.' },
    { code: 'ru', success: 'Версия 1 теперь официальная.' },
    { code: 'fr', success: 'La Version 1 est désormais officielle.' },
    { code: 'en', success: 'Version 1 is now official.' },
  ]) {
    selectOption(localeControl, locale.code);
    expect(screen.getByText(locale.success)).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(baseline);
    expect(onRefresh).toHaveBeenCalledOnce();
  }
  const commands = fetcher.mock.calls.filter(
    ([, init]) => init?.method === 'POST',
  );
  expect(commands).toHaveLength(1);
  expect(commands[0]?.[0]).toBe(
    '/api/documents/document/versions/version-1/official-designation',
  );
  expect(commands[0]?.[1]?.body).toBe('{"expectedRevision":4}');
  expect(
    new Headers(commands[0]?.[1]?.headers).get('x-company-context-id'),
  ).toBe('company');
});
