import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  type InterfaceLocale,
} from '../localization/interface-locale';
import { ActivityLog } from './ActivityLog';
import { activityLogPageResponse } from './activity-log-response';
import { assertMessageCoverage } from '../localization/messages';
import { knowledgeAssignmentActivityMessages } from './knowledge-assignment-activity.copy';

type EventKey =
  | 'administratorGranted'
  | 'administratorRevoked'
  | 'readerGranted'
  | 'readerRevoked';
const transitions: { action: string; key: EventKey; bundle: string }[] = [
  {
    action: 'company_knowledge_source_administrator_assignment.granted',
    key: 'administratorGranted',
    bundle: 'Company Knowledge Source Administrator',
  },
  {
    action: 'company_knowledge_source_administrator_assignment.revoked',
    key: 'administratorRevoked',
    bundle: 'Company Knowledge Source Administrator',
  },
  {
    action: 'company_knowledge_evidence_reader_assignment.granted',
    key: 'readerGranted',
    bundle: 'Company Knowledge Evidence Reader',
  },
  {
    action: 'company_knowledge_evidence_reader_assignment.revoked',
    key: 'readerRevoked',
    bundle: 'Company Knowledge Evidence Reader',
  },
];
const words = {
  ro: {
    administratorGranted:
      'a acordat acces de administrare a surselor de cunoștințe ale companiei',
    administratorRevoked:
      'a revocat accesul de administrare a surselor de cunoștințe ale companiei',
    readerGranted: 'a acordat acces la dovezile citate ale companiei',
    readerRevoked: 'a revocat accesul la dovezile citate ale companiei',
  },
  ru: {
    administratorGranted:
      '— предоставление доступа к администрированию источников знаний Компании',
    administratorRevoked:
      '— отзыв доступа к администрированию источников знаний Компании',
    readerGranted: '— предоставление доступа к цитируемым материалам Компании',
    readerRevoked: '— отзыв доступа к цитируемым материалам Компании',
  },
  fr: {
    administratorGranted:
      'a accordé l’administration des sources de connaissances de la société',
    administratorRevoked:
      'a révoqué l’administration des sources de connaissances de la société',
    readerGranted: 'a accordé l’accès aux éléments cités de la société',
    readerRevoked: 'a révoqué l’accès aux éléments cités de la société',
  },
  en: {
    administratorGranted:
      'granted Company Knowledge Source Administrator access',
    administratorRevoked:
      'revoked Company Knowledge Source Administrator access',
    readerGranted: 'granted Company Knowledge Evidence Reader access',
    readerRevoked: 'revoked Company Knowledge Evidence Reader access',
  },
} satisfies Record<InterfaceLocale, Record<EventKey, string>>;
const companyId = 'company-knowledge-activity';
const literal = 'Société {literal} — Știință / Компания';
const actor = {
  internalUserId: 'actor-knowledge',
  displayName: 'Actor Știință',
};
const recorded = { occurredAt: '2026-10-30T12:00:00.000Z', actor };
const target = {
  type: 'company_role_assignment',
  assignmentId: 'assignment-knowledge',
  companyId,
  companyDisplayName: literal,
  workspaceMembershipId: 'membership-knowledge',
  internalUserId: 'member-knowledge',
  internalUserDisplayName: 'Member — Имя',
};
const oldEvent = {
  ...recorded,
  id: 'old-company-event',
  action: 'company.registered',
  target: { type: 'company', companyId, displayName: literal },
};
const newEvents = transitions.map(({ action, bundle }, index) => ({
  ...recorded,
  id: `knowledge-assignment-event-${index}`,
  action,
  target,
  metadata: { bundle },
}));

afterEach(() => {
  cleanup();
  localStorage.removeItem(interfaceLocaleStorageKey);
});

describe('generic Knowledge assignment Activity compatibility', () => {
  it('defines all four grant/revoke labels in all four interface locales', () => {
    expect(() =>
      assertMessageCoverage(
        'knowledgeAssignmentActivity',
        knowledgeAssignmentActivityMessages,
      ),
    ).not.toThrow();
  });
  it.each<InterfaceLocale>(['ro', 'ru', 'fr', 'en'])(
    'keeps a mixed old/new Activity page readable and localized in %s',
    (locale) => {
      const page = activityLogPageResponse({
        events: [oldEvent, ...newEvents],
      });
      expect(page.events.map((event) => event.action)).toEqual([
        'company.registered',
        ...transitions.map(({ action }) => action),
      ]);
      localStorage.setItem(interfaceLocaleStorageKey, locale);
      render(
        <InterfaceLocaleProvider>
          <ActivityLog
            state={{ status: 'ready', events: page.events }}
            activeCompanyId={companyId}
            onOpenRequest={vi.fn()}
          />
        </InterfaceLocaleProvider>,
      );
      const list = screen.getByRole('list');
      expect(within(list).getAllByRole('listitem')).toHaveLength(5);
      for (const { action, key } of transitions) {
        expect(
          within(list).getByText(`${actor.displayName} ${words[locale][key]}`),
        ).toBeInTheDocument();
        expect(list.textContent).not.toContain(action);
      }
      expect(list.textContent).toContain(literal);
      expect(within(list).queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it.each([
    'knowledge_source.drafted',
    'knowledge_source.admitted',
    'knowledge_source.revoked',
    'company_knowledge_unknown_assignment.granted',
  ])(
    'does not turn private or unknown action %s into generic Activity',
    (action) => {
      expect(() =>
        activityLogPageResponse({
          events: [
            oldEvent,
            { ...recorded, id: 'private-event', action, target },
          ],
        }),
      ).toThrow();
    },
  );

  it.each(transitions)(
    'rejects a mismatched target for $action',
    ({ action }) => {
      expect(() =>
        activityLogPageResponse({
          events: [
            {
              ...recorded,
              id: 'wrong-target',
              action,
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
    },
  );
});
