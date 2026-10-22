import { describe, expect, it } from 'vitest';
import { activityLogPageResponse } from '../production-shell/activity-log-response';

const envelope = {
  id: 'event-1',
  occurredAt: '2026-10-20T05:00:00.000Z',
  actor: {
    internalUserId: 'administrator',
    displayName: 'Synthetic Administrator',
  },
  target: {
    type: 'company_role_assignment',
    assignmentId: 'assignment-1',
    companyId: 'company-1',
    companyDisplayName: 'Synthetic Company',
    workspaceMembershipId: 'member-1',
    internalUserId: 'person-1',
    internalUserDisplayName: 'Synthetic Member',
  },
};
describe('Ideas confidentiality at the ordinary Activity response boundary', () => {
  it.each(['reader', 'recorder', 'reviewer'])(
    'admits only the existing-visible %s administration transitions',
    (role) => {
      for (const transition of ['granted', 'revoked']) {
        const action = `company_ideas_${role}_assignment.${transition}`;
        expect(
          activityLogPageResponse({ events: [{ ...envelope, action }] }).events,
        ).toMatchObject([{ action, target: envelope.target }]);
      }
    },
  );
  it.each(['idea.recorded', 'idea.disposition.recorded'])(
    'refuses restricted %s instead of creating a generic projection',
    (action) => {
      expect(() =>
        activityLogPageResponse({
          events: [
            {
              ...envelope,
              action,
              target: {
                type: 'idea',
                ideaId: 'hidden-idea',
                companyId: 'company-1',
              },
            },
          ],
        }),
      ).toThrow();
    },
  );
});
