import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  type InterfaceLocale,
} from '../localization/interface-locale';
import { ActivityLog } from './ActivityLog';
import { activityLogPageResponse } from './activity-log-response';

const companyId = 'company-certification-auditor-activity';
const actor = {
  internalUserId: 'actor-certification',
  displayName: 'Ana Demo',
};
const target = {
  type: 'company_role_assignment',
  assignmentId: 'assignment-certification-auditor',
  companyId,
  companyDisplayName: 'Synthetic Certification Body',
  workspaceMembershipId: 'membership-certification-auditor',
  internalUserId: 'member-certification-auditor',
  internalUserDisplayName: 'Elena Demo',
};
const recorded = { occurredAt: '2026-11-07T12:00:00.000Z', actor };
const events = (['granted', 'revoked'] as const).map((change) => ({
  ...recorded,
  id: `certification-auditor-${change}`,
  action: `company_certification_auditor_assignment.${change}`,
  target,
  metadata: { bundle: 'Company Certification Auditor' },
}));
const labels = {
  ro: [
    'a acordat dreptul de auditor de certificare',
    'a revocat dreptul de auditor de certificare',
  ],
  ru: [
    '— предоставление права аудитора по сертификации',
    '— отзыв права аудитора по сертификации',
  ],
  fr: [
    'a accordé le droit d’auditeur de certification',
    'a révoqué le droit d’auditeur de certification',
  ],
  en: ['granted Certification Auditor', 'revoked Certification Auditor'],
} satisfies Record<InterfaceLocale, string[]>;

afterEach(() => {
  cleanup();
  localStorage.removeItem(interfaceLocaleStorageKey);
});

it.each<InterfaceLocale>(['ro', 'ru', 'fr', 'en'])(
  'reads and narrates the Certification Auditor grant and revocation in %s',
  (locale) => {
    const page = activityLogPageResponse({ events });
    expect(page.events.map((event) => event.action)).toEqual([
      'company_certification_auditor_assignment.granted',
      'company_certification_auditor_assignment.revoked',
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
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    for (const label of labels[locale])
      expect(
        within(list).getByText(`${actor.displayName} ${label}`),
      ).toBeInTheDocument();
    expect(list.textContent).not.toContain('company_certification_auditor');
  },
);

it.each(events)('rejects a wrong target for $action', (event) => {
  expect(() =>
    activityLogPageResponse({
      events: [{ ...event, target: { ...target, type: 'company' } }],
    }),
  ).toThrow();
});
