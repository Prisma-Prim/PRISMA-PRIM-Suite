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
const events = [
  {
    ...recorded,
    id: 'working-evidence-working_evidence_case_reader-granted',
    action: 'company_working_evidence_case_reader_assignment.granted',
    target,
    metadata: { bundle: 'Company Working Evidence Case Reader' },
  },
  {
    ...recorded,
    id: 'working-evidence-working_evidence_case_reader-revoked',
    action: 'company_working_evidence_case_reader_assignment.revoked',
    target,
    metadata: { bundle: 'Company Working Evidence Case Reader' },
  },
  {
    ...recorded,
    id: 'working-evidence-working_evidence_case_recorder-granted',
    action: 'company_working_evidence_case_recorder_assignment.granted',
    target,
    metadata: { bundle: 'Company Working Evidence Case Recorder' },
  },
  {
    ...recorded,
    id: 'working-evidence-working_evidence_case_recorder-revoked',
    action: 'company_working_evidence_case_recorder_assignment.revoked',
    target,
    metadata: { bundle: 'Company Working Evidence Case Recorder' },
  },
  {
    ...recorded,
    id: 'working-evidence-received_audit_source_access-granted',
    action: 'company_received_audit_source_access_assignment.granted',
    target,
    metadata: { bundle: 'Company Received Audit Source Access' },
  },
  {
    ...recorded,
    id: 'working-evidence-received_audit_source_access-revoked',
    action: 'company_received_audit_source_access_assignment.revoked',
    target,
    metadata: { bundle: 'Company Received Audit Source Access' },
  },
];
const labels = {
  ro: [
    'a acordat citirea cazurilor de probe de lucru ale companiei',
    'a revocat citirea cazurilor de probe de lucru ale companiei',
    'a acordat înregistrarea cazurilor de probe de lucru ale companiei',
    'a revocat înregistrarea cazurilor de probe de lucru ale companiei',
    'a acordat accesul la sursele de audit primite ale companiei',
    'a revocat accesul la sursele de audit primite ale companiei',
  ],
  ru: [
    'предоставил чтение рабочих дел доказательств компании',
    'отозвал чтение рабочих дел доказательств компании',
    'предоставил регистрацию рабочих дел доказательств компании',
    'отозвал регистрацию рабочих дел доказательств компании',
    'предоставил доступ к полученным источникам аудита компании',
    'отозвал доступ к полученным источникам аудита компании',
  ],
  fr: [
    'a accordé la lecture des dossiers de preuves de travail de la société',
    'a révoqué la lecture des dossiers de preuves de travail de la société',
    'a accordé l’enregistrement des dossiers de preuves de travail de la société',
    'a révoqué l’enregistrement des dossiers de preuves de travail de la société',
    'a accordé l’accès aux sources d’audit reçues de la société',
    'a révoqué l’accès aux sources d’audit reçues de la société',
  ],
  en: [
    'granted Company Working Evidence Case Reader',
    'revoked Company Working Evidence Case Reader',
    'granted Company Working Evidence Case Recorder',
    'revoked Company Working Evidence Case Recorder',
    'granted Company Received Audit Source Access',
    'revoked Company Received Audit Source Access',
  ],
} satisfies Record<InterfaceLocale, string[]>;

afterEach(() => {
  cleanup();
  localStorage.removeItem(interfaceLocaleStorageKey);
});

it.each<InterfaceLocale>(['ro', 'ru', 'fr', 'en'])(
  'keeps a mixed old and Working Evidence administration page readable in %s',
  (locale) => {
    const page = activityLogPageResponse({ events: [oldEvent, ...events] });
    expect(page.events.map((event) => event.action)).toEqual([
      'company.registered',
      'company_working_evidence_case_reader_assignment.granted',
      'company_working_evidence_case_reader_assignment.revoked',
      'company_working_evidence_case_recorder_assignment.granted',
      'company_working_evidence_case_recorder_assignment.revoked',
      'company_received_audit_source_access_assignment.granted',
      'company_received_audit_source_access_assignment.revoked',
    ]);
    localStorage.setItem(interfaceLocaleStorageKey, locale);
    for (const surface of ['activity', 'home']) {
      const windows =
        surface === 'activity'
          ? [{ events: page.events, expectedLabels: labels[locale], count: 7 }]
          : [
              {
                events: page.events.slice(0, 4),
                expectedLabels: labels[locale].slice(0, 3),
                count: 4,
              },
              {
                events: page.events.slice(4),
                expectedLabels: labels[locale].slice(3),
                count: 3,
              },
            ];
      for (const window of windows) {
        const view = render(
          <InterfaceLocaleProvider>
            {surface === 'activity' ? (
              <ActivityLog
                state={{ status: 'ready', events: window.events }}
                activeCompanyId={companyId}
                onOpenRequest={vi.fn()}
              />
            ) : (
              <RecentChanges
                state={{ status: 'ready', events: window.events }}
                activeCompanyId={companyId}
                onRefresh={async () => {}}
                onOpenActivity={vi.fn()}
                onOpenRequest={vi.fn()}
              />
            )}
          </InterfaceLocaleProvider>,
        );
        const list = screen.getByRole('list');
        expect(within(list).getAllByRole('listitem')).toHaveLength(
          window.count,
        );
        for (const label of window.expectedLabels)
          expect(
            within(list).getByText(`${actor.displayName} ${label}`),
          ).toBeInTheDocument();
        expect(list.textContent).toContain(target.companyDisplayName);
        expect(list.textContent).not.toContain('company_working_evidence');
        expect(within(list).queryByRole('button')).not.toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        view.unmount();
      }
    }
  },
);

it.each([
  'received_audit_source.registered',
  'working_evidence_case.recorded',
  'working_evidence_case.corrected',
  'company_received_audit_source_unknown_assignment.granted',
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
