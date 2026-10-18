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
} from '../localization/interface-locale';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { selectOption } from '../test/select-option';
import { DocumentCorrectionHistory } from './DocumentCorrectionHistory';

const actor: ActorContext = {
  internalUserId: 'reader',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Literal Workspace',
  displayName: 'Literal Actor',
  email: 'reader@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company',
    displayName: 'Literal Company',
    clientPermissions: ['client.read'],
    documentPermissions: ['document.read', 'document.reference.read'],
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
const first = {
  revision: 3,
  occurredAt: '2026-09-23T08:00:00.000Z',
  actor: { displayName: 'Actor {literal} Я é' },
  changes: {
    title: { before: 'Titre {literal} Я', after: 'Titlu {literal} Ș' },
    url: {
      before: 'https://example.test/previous?language=en',
      after: 'https://example.test/current?language=fr',
    },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('keeps expanded history and pending continuation while translating late pages and inert literal values', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  let finishOlder: ((response: Response) => void) | undefined;
  const older = new Promise<Response>((resolve) => {
    finishOlder = resolve;
  });
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith('/correction-history'))
      return Response.json({ corrections: [first], nextBeforeRevision: 3 });
    if (url.endsWith('/correction-history?beforeRevision=3')) return older;
    throw new Error(`Unexpected HTTP request: ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <DocumentCorrectionHistory
        actor={actor}
        identity={identity}
        documentId="document"
        workingRevision={3}
      />
    </InterfaceLocaleProvider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Show reference correction history' }),
  );
  const firstValue = await screen.findByText(first.changes.title.before);
  expect(screen.getByText(first.changes.url.before)).toBeVisible();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Load older corrections' }),
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  const baseline = fetcher.mock.calls.length;
  const continuation = screen.getByRole('button', {
    name: 'Loading older corrections…',
  });
  selectOption(
    screen.getByRole('combobox', { name: 'Interface language' }),
    'ro',
  );
  expect(
    screen.getByRole('button', { name: 'Se încarcă corectările mai vechi…' }),
  ).toBe(continuation);
  expect(
    screen.getByRole('button', {
      name: 'Ascunde istoricul corectărilor referinței',
    }),
  ).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText(first.changes.title.before)).toBe(firstValue);
  expect(fetcher).toHaveBeenCalledTimes(baseline);
  if (!finishOlder) throw new Error('The continuation was not initialized');
  const completeOlder = finishOlder;
  await act(async () => {
    completeOlder(
      Response.json({
        corrections: [
          {
            revision: 2,
            occurredAt: '2026-09-22T07:00:00.000Z',
            actor: { displayName: 'Second {literal} Actor' },
            changes: {},
          },
        ],
        nextBeforeRevision: null,
      }),
    );
  });
  expect(await screen.findByText('Revizia de lucru 2')).toBeVisible();
  expect(
    screen.getByText(
      'Detaliile modificate nu sunt afișate cu accesul tău actual.',
    ),
  ).toBeVisible();
  expect(screen.getByText(first.changes.title.before)).toBe(firstValue);
  expect(screen.getByText(first.changes.url.before).closest('a')).toBeNull();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(baseline);
  const historyList = screen.getByRole('list', {
    name: 'Corectările referinței, cele mai noi primele',
  });
  for (const locale of [
    {
      code: 'ru',
      language: 'Limba interfeței',
      list: 'Исправления ссылки, сначала новые',
      revision: 'Рабочая редакция 2',
    },
    {
      code: 'fr',
      language: 'Язык интерфейса',
      list: 'Corrections de référence, les plus récentes d’abord',
      revision: 'Révision de travail 2',
    },
    {
      code: 'en',
      language: 'Langue de l’interface',
      list: 'Reference corrections, newest first',
      revision: 'Working revision 2',
    },
  ]) {
    selectOption(
      screen.getByRole('combobox', { name: locale.language }),
      locale.code,
    );
    expect(screen.getByRole('list', { name: locale.list })).toBe(historyList);
    expect(screen.getByText(locale.revision)).toBeVisible();
    expect(screen.getByText(first.changes.title.before)).toBe(firstValue);
    expect(screen.getByText(first.changes.url.before).closest('a')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(baseline);
  }
});

it('retires prior URLs on genuine reference-permission loss and never reveals them while switching locales', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const fetcher = vi.fn(async () =>
    Response.json({
      corrections: [{ ...first, changes: { url: first.changes.url } }],
      nextBeforeRevision: null,
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  const content = (nextActor: ActorContext) => (
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <DocumentCorrectionHistory
        actor={nextActor}
        identity={identity}
        documentId="document"
        workingRevision={3}
      />
    </InterfaceLocaleProvider>
  );
  const view = render(content(actor));
  fireEvent.click(
    screen.getByRole('button', { name: 'Show reference correction history' }),
  );
  expect(await screen.findByText(first.changes.url.before)).toBeVisible();
  const metadataOnly: ActorContext = {
    ...actor,
    activeCompany: {
      id: 'company',
      displayName: 'Literal Company',
      clientPermissions: ['client.read'],
      documentPermissions: ['document.read'],
    },
  };
  view.rerender(content(metadataOnly));
  expect(screen.queryByText(first.changes.url.before)).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Show reference correction history' }),
  ).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(
    screen.getByRole('button', { name: 'Show reference correction history' }),
  );
  await screen.findByText(
    'The changed details are not shown with your current access.',
  );
  const baseline = fetcher.mock.calls.length;
  const localeControl = screen.getByRole('combobox', {
    name: 'Interface language',
  });
  for (const locale of [
    {
      code: 'ro',
      withheld: 'Detaliile modificate nu sunt afișate cu accesul tău actual.',
    },
    {
      code: 'ru',
      withheld: 'Изменённые сведения не отображаются при ваших текущих правах.',
    },
    {
      code: 'fr',
      withheld:
        'Les détails modifiés ne sont pas affichés avec vos droits actuels.',
    },
    {
      code: 'en',
      withheld: 'The changed details are not shown with your current access.',
    },
  ]) {
    selectOption(localeControl, locale.code);
    expect(screen.getByText(locale.withheld)).toBeVisible();
    expect(
      screen.queryByText(first.changes.url.before),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(first.changes.url.after)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(baseline);
  }
});
