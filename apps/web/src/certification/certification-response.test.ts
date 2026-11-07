import { describe, expect, it } from 'vitest';
import {
  parseCaseDetail,
  parseCaseList,
  parseTimeline,
} from './certification-response';
import {
  certificationIds,
  lactisFacts,
  reviewCriteria,
} from './certification.test-fixture';

const scope = {
  companyId: certificationIds.company,
  projectId: certificationIds.project,
};
const caseId = '11310000-0000-4000-8000-100000000001';
const by = { workspaceMembershipId: 'member', displayName: 'Ana Demo' };
const application = {
  id: 'step-1',
  step: 'application',
  version: 1,
  caseRevision: 2,
  reason: null,
  recordedBy: by,
  recordedAt: '2026-11-07T08:01:00.000Z',
  value: lactisFacts(),
};
const review = {
  id: 'step-2',
  step: 'application_review',
  version: 1,
  caseRevision: 3,
  reason: null,
  recordedBy: by,
  recordedAt: '2026-11-07T08:02:00.000Z',
  value: {
    criteria: reviewCriteria('yes'),
    outcome: 'accepted',
    rejectionReason: null,
  },
};
function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: caseId,
    companyId: certificationIds.company,
    projectId: certificationIds.project,
    clientAccountId: certificationIds.client,
    orderReference: 'CERT-0001/01',
    clientLegalEntity: { id: certificationIds.entity, legalName: 'Lactis' },
    standard: 'iso_22000_2018',
    auditType: 'initial_certification',
    status: 'open',
    revision: 3,
    nextStep: 'duration',
    openedBy: by,
    openedAt: '2026-11-07T08:00:00.000Z',
    application,
    applicationReview: review,
    ...overrides,
  };
}

describe('Certification response parsers', () => {
  it('reads a reviewed Case with its exact facts and answers', () => {
    const parsed = parseCaseDetail(detail(), { ...scope, caseId });
    expect(parsed.application?.value).toEqual(lactisFacts());
    expect(parsed.applicationReview?.value.outcome).toBe('accepted');
  });

  it.each([
    ['another Company', detail({ companyId: 'other-company' })],
    [
      'a next step the steps do not support',
      detail({ nextStep: 'application' }),
    ],
    [
      'a closed Case without a rejection',
      detail({ status: 'rejected', nextStep: null }),
    ],
    [
      'an acceptance with a "no" answer',
      detail({
        applicationReview: {
          ...review,
          value: {
            ...review.value,
            criteria: {
              ...reviewCriteria('yes'),
              risksAcceptable: { answer: 'no', note: 'Risk' },
            },
          },
        },
      }),
    ],
    [
      'an unknown food chain subcategory',
      detail({
        application: {
          ...application,
          value: lactisFacts({ foodChainSubcategories: ['Z'] }),
        },
      }),
    ],
    [
      'a first application with a reason',
      detail({ application: { ...application, reason: 'Not a correction' } }),
    ],
    [
      'an FTE with two decimals',
      detail({
        application: {
          ...application,
          value: lactisFacts({ effectiveFte: 3.25 }),
        },
      }),
    ],
    ['an unknown standard', detail({ standard: 'iso_9001_2015' })],
  ])('fails closed on %s', (_name, value) => {
    expect(() => parseCaseDetail(value, { ...scope, caseId })).toThrow();
  });

  it('refuses a list of another Project and a timeline out of order', () => {
    expect(() =>
      parseCaseList(
        { projectId: 'other-project', cases: [], total: 0 },
        certificationIds.project,
      ),
    ).toThrow();
    expect(() =>
      parseTimeline({ caseId, entries: [review, application] }, caseId),
    ).toThrow();
    expect(
      parseTimeline({ caseId, entries: [application, review] }, caseId).entries,
    ).toHaveLength(2);
  });
});
