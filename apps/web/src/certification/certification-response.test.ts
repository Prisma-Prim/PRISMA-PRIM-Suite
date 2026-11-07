import { describe, expect, it } from 'vitest';
import {
  parseCaseDetail,
  parseCaseList,
  parseDurationResult,
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
    duration: null,
    ...overrides,
  };
}

/** The fictional dairy's vector: CI, three studies, 120 FTE, +15 % −5 %. */
const proposal = {
  ruleVersion: 'iso22000-basic-2026-11',
  basicTime: '2',
  haccpTime: '1',
  fteTime: '1.5',
  baseDays: '4.5',
  netAdjustmentPercent: 10,
  initialOnSite: '4.95',
  initialTotal: '5.94',
  stage1OnSite: '1.75',
  stage2OnSite: '3.2',
  surveillanceOnSite: '1.64835',
  surveillanceTotal: '1.97802',
  recertificationOnSite: '3.2967',
  recertificationTotal: '3.95604',
  warnings: [],
};
const determination = {
  ruleVersion: 'iso22000-basic-2026-11',
  inputs: {
    primary: 'CI',
    haccpStudies: { CI: 3 },
    increases: { interpreter: 10, onSiteLaboratory: 5 },
    reductions: { automation: 5 },
    subcategories: ['CI'],
    effectiveFte: 120,
  },
  computation: { kind: 'proposal', proposal },
  confirmed: {
    initialOnSite: '4.95',
    stage1OnSite: '1.75',
    stage2OnSite: '3.2',
    surveillanceOnSite: '1.65',
    recertificationOnSite: '3.3',
  },
  justification: 'Interpreter needed; in-house laboratory; automated lines.',
};
const duration = {
  id: 'step-3',
  step: 'duration',
  version: 1,
  caseRevision: 4,
  reason: null,
  recordedBy: by,
  recordedAt: '2026-11-07T08:03:00.000Z',
  value: determination,
};
function durationDetail(
  value: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
) {
  return detail({
    revision: 4,
    nextStep: 'agreement',
    application: {
      ...application,
      value: lactisFacts({
        haccpStudyCount: 3,
        totalHeadcount: 125,
        effectiveFte: 120,
      }),
    },
    duration: { ...duration, value: { ...determination, ...value } },
    ...overrides,
  });
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

  it('reads a confirmed duration with its exact amounts, and the agreement next', () => {
    const parsed = parseCaseDetail(durationDetail(), { ...scope, caseId });
    expect(parsed.nextStep).toBe('agreement');
    expect(parsed.duration?.value).toEqual(determination);
    expect(
      parseTimeline(
        { caseId, entries: [application, review, duration] },
        caseId,
      ).entries.map((entry) => entry.step),
    ).toEqual(['application', 'application_review', 'duration']);
  });

  it('reads an unadjusted proposal without justification, a manual case and a correction', () => {
    // Values equal to the proposal rounded half up need no justification.
    const asProposed = durationDetail({
      inputs: { ...determination.inputs, increases: {}, reductions: {} },
      computation: {
        kind: 'proposal',
        proposal: { ...proposal, netAdjustmentPercent: 0 },
      },
      justification: null,
    });
    expect(
      parseCaseDetail(asProposed, { ...scope, caseId }).duration?.value
        .justification,
    ).toBeNull();
    expect(
      parseCaseDetail(
        durationDetail({
          computation: { kind: 'manual', reason: 'FTE_BAND_AMBIGUOUS' },
        }),
        { ...scope, caseId },
      ).duration?.value.computation,
    ).toEqual({ kind: 'manual', reason: 'FTE_BAND_AMBIGUOUS' });
    expect(
      parseCaseDetail(
        durationDetail(
          {},
          {
            duration: {
              ...duration,
              version: 2,
              reason: 'Quarter-day planning.',
            },
          },
        ),
        { ...scope, caseId },
      ).duration?.reason,
    ).toBe('Quarter-day planning.');
  });

  it.each([
    [
      'the agreement next without a duration',
      detail({ nextStep: 'agreement' }),
    ],
    [
      'a duration while the next step is still the duration',
      durationDetail({}, { nextStep: 'duration' }),
    ],
    [
      'a duration before the review accepted the application',
      durationDetail({}, { applicationReview: null }),
    ],
    [
      'a duration recorded at the review revision',
      durationDetail({}, { duration: { ...duration, caseRevision: 3 } }),
    ],
    [
      'a first duration with a reason',
      durationDetail({}, { duration: { ...duration, reason: 'Not a fix' } }),
    ],
    [
      'Stage 1 and Stage 2 that do not add up to the initial audit',
      durationDetail({
        confirmed: { ...determination.confirmed, stage2OnSite: '3' },
      }),
    ],
    [
      'a confirmed amount with three decimals',
      durationDetail({
        confirmed: { ...determination.confirmed, surveillanceOnSite: '1.648' },
      }),
    ],
    [
      'an unknown adjustment factor',
      durationDetail({
        inputs: { ...determination.inputs, increases: { weather: 5 } },
      }),
    ],
    [
      'studies for a subcategory outside the application',
      durationDetail({
        inputs: { ...determination.inputs, haccpStudies: { CI: 2, K: 1 } },
      }),
    ],
    [
      'adjustment factors without a justification',
      durationDetail({ justification: null }),
    ],
    [
      'a value other than the rounded proposal without a justification',
      durationDetail({
        inputs: { ...determination.inputs, increases: {}, reductions: {} },
        confirmed: {
          ...determination.confirmed,
          recertificationOnSite: '3.29',
        },
        justification: null,
      }),
    ],
    [
      'a manual determination without a justification',
      durationDetail({
        computation: { kind: 'manual', reason: 'FTE_BAND_AMBIGUOUS' },
        justification: null,
      }),
    ],
    [
      'an unknown rule version',
      durationDetail({ ruleVersion: 'iso22000-basic-2099-01' }),
    ],
  ])('fails closed on %s', (_name, value) => {
    expect(() => parseCaseDetail(value, { ...scope, caseId })).toThrow();
  });

  it('reads the proposal, the manual case and the refusals of a proposal read', () => {
    expect(parseDurationResult({ kind: 'proposal', proposal })).toEqual({
      kind: 'proposal',
      proposal,
    });
    expect(
      parseDurationResult({ kind: 'manual', reason: 'FTE_BAND_AMBIGUOUS' }),
    ).toEqual({ kind: 'manual', reason: 'FTE_BAND_AMBIGUOUS' });
    expect(
      parseDurationResult({
        kind: 'refused',
        refusals: ['PRIMARY_NOT_HIGHEST_BASIC_TIME', 'REDUCTION_FACTOR_CAP'],
      }),
    ).toEqual({
      kind: 'refused',
      refusals: ['PRIMARY_NOT_HIGHEST_BASIC_TIME', 'REDUCTION_FACTOR_CAP'],
    });
  });

  it.each([
    ['an unknown refusal', { kind: 'refused', refusals: ['TOO_LONG'] }],
    ['a refusal without reasons', { kind: 'refused', refusals: [] }],
    ['an unknown kind', { kind: 'estimate', proposal }],
    [
      'an unknown warning',
      { kind: 'proposal', proposal: { ...proposal, warnings: ['LATE'] } },
    ],
    [
      'a proposal whose stages do not add up',
      { kind: 'proposal', proposal: { ...proposal, stage2OnSite: '3.25' } },
    ],
    [
      'an amount beyond eight decimals',
      {
        kind: 'proposal',
        proposal: { ...proposal, surveillanceTotal: '1.978020001' },
      },
    ],
    [
      'a fractional adjustment',
      {
        kind: 'proposal',
        proposal: { ...proposal, netAdjustmentPercent: 2.5 },
      },
    ],
  ])('fails closed on a proposal read with %s', (_name, value) => {
    expect(() => parseDurationResult(value)).toThrow();
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
