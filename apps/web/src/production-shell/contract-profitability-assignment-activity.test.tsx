import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  type InterfaceLocale,
} from '../localization/interface-locale';
import { ActivityLog } from './ActivityLog';
import { activityLogPageResponse } from './activity-log-response';

// The API has recorded these ten assignment events since #525, #529, #533 and
// #824 (issue #1147). The labels below are written independently of the copy.
const transitions = [
  'company_contract_preparer_assignment.granted',
  'company_contract_preparer_assignment.revoked',
  'company_contract_early_preparation_assignment.granted',
  'company_contract_early_preparation_assignment.revoked',
  'company_contract_approver_assignment.granted',
  'company_contract_approver_assignment.revoked',
  'company_profitability_contributor_assignment.granted',
  'company_profitability_contributor_assignment.revoked',
  'company_profitability_director_assignment.granted',
  'company_profitability_director_assignment.revoked',
] as const;
type Transition = (typeof transitions)[number];

const bundles: Record<Transition, string> = {
  'company_contract_preparer_assignment.granted': 'Company Contract Preparer',
  'company_contract_preparer_assignment.revoked': 'Company Contract Preparer',
  'company_contract_early_preparation_assignment.granted':
    'Company Contract Early Preparation',
  'company_contract_early_preparation_assignment.revoked':
    'Company Contract Early Preparation',
  'company_contract_approver_assignment.granted': 'Company Contract Approver',
  'company_contract_approver_assignment.revoked': 'Company Contract Approver',
  'company_profitability_contributor_assignment.granted':
    'Company Profitability Contributor',
  'company_profitability_contributor_assignment.revoked':
    'Company Profitability Contributor',
  'company_profitability_director_assignment.granted':
    'Company Profitability Director',
  'company_profitability_director_assignment.revoked':
    'Company Profitability Director',
};

const words = {
  ro: {
    'company_contract_preparer_assignment.granted':
      'a acordat Responsabil cu pregătirea contractelor companiei',
    'company_contract_preparer_assignment.revoked':
      'a revocat Responsabil cu pregătirea contractelor companiei',
    'company_contract_early_preparation_assignment.granted':
      'a acordat Pregătire anticipată a contractelor companiei',
    'company_contract_early_preparation_assignment.revoked':
      'a revocat Pregătire anticipată a contractelor companiei',
    'company_contract_approver_assignment.granted':
      'a acordat Aprobator de contracte al companiei',
    'company_contract_approver_assignment.revoked':
      'a revocat Aprobator de contracte al companiei',
    'company_profitability_contributor_assignment.granted':
      'a acordat Contributor rentabilitate Companie',
    'company_profitability_contributor_assignment.revoked':
      'a revocat Contributor rentabilitate Companie',
    'company_profitability_director_assignment.granted':
      'a acordat Director rentabilitate Companie',
    'company_profitability_director_assignment.revoked':
      'a revocat Director rentabilitate Companie',
  },
  ru: {
    'company_contract_preparer_assignment.granted':
      '— предоставление права: Подготовка договоров компании',
    'company_contract_preparer_assignment.revoked':
      '— отзыв права: Подготовка договоров компании',
    'company_contract_early_preparation_assignment.granted':
      '— предоставление права: Ранняя подготовка договоров компании',
    'company_contract_early_preparation_assignment.revoked':
      '— отзыв права: Ранняя подготовка договоров компании',
    'company_contract_approver_assignment.granted':
      '— предоставление права: Согласующий договоры компании',
    'company_contract_approver_assignment.revoked':
      '— отзыв права: Согласующий договоры компании',
    'company_profitability_contributor_assignment.granted':
      '— предоставление права: Автор оценки рентабельности Компании',
    'company_profitability_contributor_assignment.revoked':
      '— отзыв права: Автор оценки рентабельности Компании',
    'company_profitability_director_assignment.granted':
      '— предоставление права: Директор оценки рентабельности Компании',
    'company_profitability_director_assignment.revoked':
      '— отзыв права: Директор оценки рентабельности Компании',
  },
  fr: {
    'company_contract_preparer_assignment.granted':
      'a accordé Préparateur de contrats de la société',
    'company_contract_preparer_assignment.revoked':
      'a révoqué Préparateur de contrats de la société',
    'company_contract_early_preparation_assignment.granted':
      'a accordé Préparation anticipée des contrats de la société',
    'company_contract_early_preparation_assignment.revoked':
      'a révoqué Préparation anticipée des contrats de la société',
    'company_contract_approver_assignment.granted':
      'a accordé Approbateur de contrats de la société',
    'company_contract_approver_assignment.revoked':
      'a révoqué Approbateur de contrats de la société',
    'company_profitability_contributor_assignment.granted':
      'a accordé Contributeur de rentabilité Société',
    'company_profitability_contributor_assignment.revoked':
      'a révoqué Contributeur de rentabilité Société',
    'company_profitability_director_assignment.granted':
      'a accordé Directeur de rentabilité Société',
    'company_profitability_director_assignment.revoked':
      'a révoqué Directeur de rentabilité Société',
  },
  en: {
    'company_contract_preparer_assignment.granted':
      'granted Company Contract Preparer',
    'company_contract_preparer_assignment.revoked':
      'revoked Company Contract Preparer',
    'company_contract_early_preparation_assignment.granted':
      'granted Company Contract Early Preparation',
    'company_contract_early_preparation_assignment.revoked':
      'revoked Company Contract Early Preparation',
    'company_contract_approver_assignment.granted':
      'granted Company Contract Approver',
    'company_contract_approver_assignment.revoked':
      'revoked Company Contract Approver',
    'company_profitability_contributor_assignment.granted':
      'granted Company Profitability Contributor',
    'company_profitability_contributor_assignment.revoked':
      'revoked Company Profitability Contributor',
    'company_profitability_director_assignment.granted':
      'granted Company Profitability Director',
    'company_profitability_director_assignment.revoked':
      'revoked Company Profitability Director',
  },
} satisfies Record<InterfaceLocale, Record<Transition, string>>;

const companyId = 'company-contract-activity';
const actor = {
  internalUserId: 'actor-contract',
  displayName: 'Actor Contract',
};
const recorded = { occurredAt: '2026-11-07T12:00:00.000Z', actor };
const target = {
  type: 'company_role_assignment',
  assignmentId: 'assignment-contract',
  companyId,
  companyDisplayName: 'Contract Company DEMO',
  workspaceMembershipId: 'membership-contract',
  internalUserId: 'member-contract',
  internalUserDisplayName: 'Member Contract',
};
const oldEvent = {
  ...recorded,
  id: 'old-company-event',
  action: 'company.registered',
  target: {
    type: 'company',
    companyId,
    displayName: 'Contract Company DEMO',
  },
};
const newEvents = transitions.map((action, index) => ({
  ...recorded,
  id: `contract-assignment-event-${index}`,
  action,
  target,
  metadata: { bundle: bundles[action] },
}));

afterEach(() => {
  cleanup();
  localStorage.removeItem(interfaceLocaleStorageKey);
});

describe('Contract and Profitability assignment Activity', () => {
  it.each<InterfaceLocale>(['ro', 'ru', 'fr', 'en'])(
    'keeps the Activity page readable and localized in %s after role changes',
    (locale) => {
      const page = activityLogPageResponse({
        events: [oldEvent, ...newEvents],
      });
      expect(page.events.map((event) => event.action)).toEqual([
        'company.registered',
        ...transitions,
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
      expect(within(list).getAllByRole('listitem')).toHaveLength(
        transitions.length + 1,
      );
      for (const action of transitions) {
        expect(
          within(list).getByText(
            `${actor.displayName} ${words[locale][action]}`,
          ),
        ).toBeInTheDocument();
        expect(list.textContent).not.toContain(action);
      }
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it.each(transitions)('rejects a mismatched target for %s', (action) => {
    expect(() =>
      activityLogPageResponse({
        events: [
          {
            ...recorded,
            id: 'wrong-target',
            action,
            target: {
              type: 'document',
              documentId: 'hidden-document',
              companyId,
              documentTitle: 'Hidden document',
            },
          },
        ],
      }),
    ).toThrow();
  });
});
