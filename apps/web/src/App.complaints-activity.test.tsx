import { render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from './localization/interface-locale';

const companyId = '00000000-0000-4000-8000-000000000737';
const actor = {
  internalUserId: 'user-737',
  workspaceMembershipId: 'member-737',
  workspaceId: 'workspace-737',
  workspaceName: 'Synthetic workspace',
  displayName: 'Administrator DEMO',
  email: 'admin@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: companyId,
    displayName: 'Company DEMO',
    clientPermissions: [],
  },
};
const actions = [
  'company_complaints_reader_assignment.granted',
  'company_complaints_reader_assignment.revoked',
  'company_complaints_recorder_assignment.granted',
  'company_complaints_recorder_assignment.revoked',
];
const locales = [
  {
    locale: 'en',
    title: 'Activity Log',
    created: 'registered a Company',
    words: [
      'granted Company Complaints Reader',
      'revoked Company Complaints Reader',
      'granted Company Complaints Recorder',
      'revoked Company Complaints Recorder',
    ],
  },
  {
    locale: 'fr',
    title: 'Journal d’activité',
    created: 'a enregistré une Entreprise',
    words: [
      'a accordé la lecture des réclamations de la Compagnie',
      'a révoqué la lecture des réclamations de la Compagnie',
      'a accordé l’enregistrement des réclamations de la Compagnie',
      'a révoqué l’enregistrement des réclamations de la Compagnie',
    ],
  },
  {
    locale: 'ro',
    title: 'Jurnal de activitate',
    created: 'a înregistrat o Companie',
    words: [
      'a acordat citirea reclamațiilor Companiei',
      'a revocat citirea reclamațiilor Companiei',
      'a acordat înregistrarea reclamațiilor Companiei',
      'a revocat înregistrarea reclamațiilor Companiei',
    ],
  },
  {
    locale: 'ru',
    title: 'Журнал действий',
    created: '— регистрация Компании',
    words: [
      '— предоставление права: Чтение жалоб Компании',
      '— отзыв права: Чтение жалоб Компании',
      '— предоставление права: Регистрация жалоб Компании',
      '— отзыв права: Регистрация жалоб Компании',
    ],
  },
];
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
it.each(locales)(
  'renders a mixed HTTP Activity page including all four safe Complaint grant events in $locale',
  async ({ locale, title, created, words }) => {
    localStorage.setItem(interfaceLocaleStorageKey, locale);
    window.history.replaceState(null, '', '/?frame=classic#activity');
    const recorded = {
      occurredAt: '2026-10-20T12:00:00.000Z',
      actor: { internalUserId: 'user-737', displayName: 'Administrator DEMO' },
    };
    const page = {
      events: [
        {
          ...recorded,
          id: 'company-event',
          action: 'company.registered',
          target: { type: 'company', companyId, displayName: 'Company DEMO' },
        },
        ...actions.map((action, index) => ({
          ...recorded,
          id: `grant-event-${index}`,
          action,
          target: {
            type: 'company_role_assignment',
            assignmentId: `assignment-${index}`,
            companyId,
            companyDisplayName: 'Company DEMO',
            workspaceMembershipId: 'member-737',
            internalUserId: 'user-737',
            internalUserDisplayName: 'Member DEMO',
          },
          metadata: {
            bundle:
              index < 2
                ? 'Company Complaints Reader'
                : 'Company Complaints Recorder',
          },
        })),
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith('/access/current-actor')) return Response.json(actor);
        if (path.endsWith('/activity-log')) return Response.json(page);
        if (path.endsWith('/companies'))
          return Response.json([
            { id: companyId, displayName: 'Company DEMO' },
          ]);
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    render(
      <InterfaceLocaleProvider>
        <App identity={deterministicBrowserIdentity()} />
      </InterfaceLocaleProvider>,
    );
    const ledger = await screen.findByRole('region', { name: title });
    await within(ledger).findByText(`Administrator DEMO ${words[0]}`);
    const rows = within(ledger).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent(`Administrator DEMO ${created}`);
    for (const [index, word] of words.entries()) {
      const row = rows[index + 1];
      if (!row)
        throw new Error('Expected every authorized administration event.');
      expect(row).toHaveTextContent(`Administrator DEMO ${word}`);
      expect(row).toHaveTextContent('Member DEMO — Company DEMO');
      expect(within(row).getByRole('time')).toHaveAttribute(
        'datetime',
        recorded.occurredAt,
      );
      expect(within(row).queryByRole('button')).toBeNull();
    }
    for (const action of actions) expect(ledger).not.toHaveTextContent(action);
    expect(ledger).not.toHaveTextContent('complaint.recorded');
    expect(ledger).not.toHaveTextContent('complaint.journal.recorded');
    expect(ledger).not.toHaveTextContent('complaint.intake.corrected');
  },
);
