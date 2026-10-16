import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
} from '../localization/interface-locale';
import { CommercialIntakeWorkspace } from './CommercialIntakeWorkspace';
import { selectOption } from '../test/select-option';

const actor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'Workspace',
  displayName: 'Ana',
  email: 'ana@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-1',
    displayName: 'PRISMA-PRIM',
    clientPermissions: ['client.read'],
    commercialIntakePermissions: [
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
      'commercial.request.client.associate',
    ],
  },
};

function LocaleChoices() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      <button onClick={() => changeLocale('ro')}>Română</button>
      <button onClick={() => changeLocale('ru')}>Русский</button>
      <button onClick={() => changeLocale('fr')}>Français</button>
      <button onClick={() => changeLocale('en')}>English</button>
    </>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('localized Request capture', () => {
  it('preserves every entered capture field and the editable Client selection across all four locales', async () => {
    vi.stubEnv('TZ', 'UTC');
    localStorage.setItem(interfaceLocaleStorageKey, 'ro');
    const client = {
      id: 'client-1',
      displayName: 'Client {original}',
      relatedToActiveCompany: true,
    };
    const commands: Array<{
      body: BodyInit | null | undefined;
      key: string | null;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (init?.method === 'POST') {
          commands.push({
            body: init.body,
            key: new Headers(init.headers).get('idempotency-key'),
          });
          return new Response(null, { status: 503 });
        }
        return Response.json(
          String(input).includes('/clients/search') ? [client] : { items: [] },
        );
      }),
    );
    render(
      <InterfaceLocaleProvider>
        <LocaleChoices />
        <CommercialIntakeWorkspace
          actor={actor}
          identity={deterministicBrowserIdentity()}
          onCompanyContextRejected={vi.fn()}
        />
      </InterfaceLocaleProvider>,
    );
    await screen.findByText(
      'Nu există încă Solicitări ale Clienților pentru PRISMA-PRIM.',
    );
    const values = {
      originalText: 'Source text {original} — întrebări / вопросы.',
      sourceLabel: 'Phone {original}',
      reportedReceivedAt: '2026-10-16T11:15',
      subject: 'Subject {original}',
      opportunityTitle: 'Opportunity {original}',
      opportunityScope: 'Scope {original}',
      nextAction: 'Call {original}',
    };
    for (const [label, value] of [
      ['Textul original al solicitării', values.originalText],
      ['Denumirea sursei', values.sourceLabel],
      ['Data și ora declarată a primirii', values.reportedReceivedAt],
      ['Subiect', values.subject],
      ['Titlul Oportunității', values.opportunityTitle],
      ['Domeniul Oportunității', values.opportunityScope],
      ['Acțiunea următoare', values.nextAction],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.change(screen.getByLabelText('Caută Clienți după nume'), {
      target: { value: 'Client {original}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Caută Clienți' }));
    selectOption(
      await screen.findByRole('combobox', { name: 'Client existent' }),
      client.id,
    );
    for (const choice of [
      {
        name: 'Русский',
        labels: [
          'Исходный текст запроса',
          'Название источника',
          'Заявленные дата и время получения',
          'Тема',
          'Название Возможности',
          'Область Возможности',
          'Следующее действие',
        ],
        search: 'Поиск Клиентов по имени',
        client: 'Существующий Клиент',
      },
      {
        name: 'Français',
        labels: [
          'Texte original de la demande',
          'Libellé de la source',
          'Réception déclarée le',
          'Objet',
          'Titre de l’Opportunité',
          'Périmètre de l’Opportunité',
          'Prochaine action',
        ],
        search: 'Rechercher des Clients par nom',
        client: 'Client existant',
      },
      {
        name: 'English',
        labels: [
          'Original request text',
          'Source label',
          'Reported received at',
          'Subject',
          'Opportunity title',
          'Opportunity scope',
          'Next action',
        ],
        search: 'Search Clients by name',
        client: 'Existing Client',
      },
      {
        name: 'Română',
        labels: [
          'Textul original al solicitării',
          'Denumirea sursei',
          'Data și ora declarată a primirii',
          'Subiect',
          'Titlul Oportunității',
          'Domeniul Oportunității',
          'Acțiunea următoare',
        ],
        search: 'Caută Clienți după nume',
        client: 'Client existent',
      },
    ]) {
      fireEvent.click(screen.getByRole('button', { name: choice.name }));
      choice.labels.forEach((label, index) =>
        expect(screen.getByLabelText(label)).toHaveValue(
          Object.values(values)[index],
        ),
      );
      expect(screen.getByLabelText(choice.search)).toHaveValue(
        'Client {original}',
      );
      expect(
        screen.getByRole('combobox', { name: choice.client }),
      ).toHaveAttribute('data-value', client.id);
      expect(
        screen.getByRole('combobox', { name: choice.client }),
      ).toHaveTextContent(client.displayName);
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Înregistrează Solicitarea' }),
    );
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]?.key).toBeTruthy();
    expect(commands[0]?.body).toBe(
      JSON.stringify({
        originalText: values.originalText,
        sourceLabel: values.sourceLabel,
        reportedReceivedAt: '2026-10-16T11:15:00.000Z',
        subject: values.subject,
        clientAccountId: client.id,
        opportunity: {
          title: values.opportunityTitle,
          scope: values.opportunityScope,
          nextAction: values.nextAction,
        },
      }),
    );
    await screen.findByRole('alert');
  });
  it('switches form and validation language without losing original text', async () => {
    localStorage.setItem(interfaceLocaleStorageKey, 'ro');
    const fetcher = vi.fn(async () => Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetcher);
    render(
      <InterfaceLocaleProvider>
        <LocaleChoices />
        <CommercialIntakeWorkspace
          actor={actor}
          identity={deterministicBrowserIdentity()}
          onCompanyContextRejected={vi.fn()}
        />
      </InterfaceLocaleProvider>,
    );
    await screen.findByText(
      'Nu există încă Solicitări ale Clienților pentru PRISMA-PRIM.',
    );
    fireEvent.change(screen.getByLabelText('Textul original al solicitării'), {
      target: { value: 'Keep this original business text {unchanged}.' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Înregistrează Solicitarea' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Completați câmpurile obligatorii ale solicitării și Oportunității.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(screen.getByLabelText('Texte original de la demande')).toHaveValue(
      'Keep this original business text {unchanged}.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Renseignez les champs obligatoires de la demande et de l’Opportunité.',
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  });
});
