import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  type InterfaceLocale,
} from '../localization/interface-locale';
import { ActivityLog } from './ActivityLog';
import { RecentChanges } from '../operational-home/RecentChanges';
import { activityLogPageResponse } from './activity-log-response';

const companyId = 'company-addendum-activity';
const actor = {
  internalUserId: 'actor-addendum',
  displayName: 'Actor Știință',
};
const target = {
  type: 'company_role_assignment',
  assignmentId: 'assignment-addendum',
  companyId,
  companyDisplayName: 'Société {literal} — Компания',
  workspaceMembershipId: 'membership-addendum',
  internalUserId: 'member-addendum',
  internalUserDisplayName: 'Member — Имя',
};
const recorded = { occurredAt: '2026-11-06T12:00:00.000Z', actor };
const oldEvent = {
  ...recorded,
  id: 'old-company-event',
  action: 'company.registered',
  target: {
    type: 'company',
    companyId,
    displayName: target.companyDisplayName,
  },
};
const events = ['granted', 'revoked'].map((operation) => ({
  ...recorded,
  id: `received-addendum-access-${operation}`,
  action: `company_received_addendum_access_assignment.${operation}`,
  target,
  metadata: { bundle: 'Company Received Addendum Access' },
}));
const labels = {
  ro: [
    'a acordat accesul la actele adiționale primite ale companiei',
    'a revocat accesul la actele adiționale primite ale companiei',
  ],
  ru: [
    'предоставил доступ к полученным дополнительным соглашениям компании',
    'отозвал доступ к полученным дополнительным соглашениям компании',
  ],
  fr: [
    'a accordé l’accès aux avenants reçus de la société',
    'a révoqué l’accès aux avenants reçus de la société',
  ],
  en: [
    'granted Company Received Addendum Access',
    'revoked Company Received Addendum Access',
  ],
} satisfies Record<InterfaceLocale, [string, string]>;

afterEach(() => {
  cleanup();
  localStorage.removeItem(interfaceLocaleStorageKey);
});

it.each<InterfaceLocale>(['ro', 'ru', 'fr', 'en'])(
  'keeps a mixed old and received Addendum administration page readable in %s',
  (locale) => {
    const page = activityLogPageResponse({ events: [oldEvent, ...events] });
    expect(page.events.map((event) => event.action)).toEqual([
      'company.registered',
      'company_received_addendum_access_assignment.granted',
      'company_received_addendum_access_assignment.revoked',
    ]);
    localStorage.setItem(interfaceLocaleStorageKey, locale);
    for (const surface of ['activity', 'home']) {
      const view = render(
        <InterfaceLocaleProvider>
          {surface === 'activity' ? (
            <ActivityLog
              state={{ status: 'ready', events: page.events }}
              activeCompanyId={companyId}
              onOpenRequest={vi.fn()}
            />
          ) : (
            <RecentChanges
              state={{ status: 'ready', events: page.events }}
              activeCompanyId={companyId}
              onRefresh={async () => {}}
              onOpenActivity={vi.fn()}
              onOpenRequest={vi.fn()}
            />
          )}
        </InterfaceLocaleProvider>,
      );
      const list = screen.getByRole('list');
      expect(within(list).getAllByRole('listitem')).toHaveLength(3);
      for (const label of labels[locale])
        expect(
          within(list).getByText(`${actor.displayName} ${label}`),
        ).toBeInTheDocument();
      expect(list.textContent).toContain(target.companyDisplayName);
      expect(list.textContent).not.toContain('company_received_addendum');
      expect(within(list).queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      view.unmount();
    }
  },
);

it.each([
  'received_addendum.registered',
  'company_received_addendum_unknown_assignment.granted',
])('continues to reject private or unknown Activity %s', (action) =>
  expect(() =>
    activityLogPageResponse({ events: [oldEvent, { ...events[0], action }] }),
  ).toThrow(),
);
it.each(events)('rejects a wrong target for $action', (event) => {
  expect(() =>
    activityLogPageResponse({
      events: [
        oldEvent,
        {
          ...event,
          target: {
            type: 'document',
            documentId: 'hidden-source',
            companyId,
            documentTitle: 'Hidden source',
          },
        },
      ],
    }),
  ).toThrow();
});
