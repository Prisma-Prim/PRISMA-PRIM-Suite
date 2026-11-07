import { describe, expect, it } from 'vitest';
import {
  parseCaseDetail,
  parseCaseList,
  parseDocumentRegister,
  parseDurationResult,
  parseEligibleDocuments,
  parseTimeline,
} from './certification-response';
import {
  NO_CONFLICT,
  certificationIds,
  lactisFacts,
  reviewCriteria,
  stage1Report,
  stage2Report,
  stagePlan,
  teamMember,
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
    agreement: null,
    team: null,
    teamDecision: null,
    stages: [],
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

const attachmentId = '11310000-0000-4000-8000-600000000001';
const agreement = {
  id: 'step-4',
  step: 'agreement',
  version: 1,
  caseRevision: 6,
  reason: null,
  recordedBy: by,
  recordedAt: '2026-11-07T08:05:00.000Z',
  value: { signedOn: '2026-11-02', attachmentId },
};
/** Duration at revision 4, the signed original attached at 5, agreement at 6. */
function agreedDetail(overrides: Record<string, unknown> = {}) {
  return durationDetail(
    {},
    { revision: 6, nextStep: 'team', agreement, ...overrides },
  );
}
function attachmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: attachmentId,
    caseRevision: 5,
    role: 'agreement',
    documentId: 'document-1',
    versionId: 'version-1',
    representationId: 'representation-1',
    versionNumber: 1,
    sourceTitle: 'Signed certification agreement',
    fileName: 'signed-certification-agreement.pdf',
    sizeBytes: 2048,
    sha256: 'a'.repeat(64),
    note: null,
    attachedBy: by,
    attachedAt: '2026-11-07T08:04:00.000Z',
    ...overrides,
  };
}
const questionnaireRow = attachmentRow({
  id: 'attachment-2',
  caseRevision: 7,
  role: 'questionnaire',
  documentId: 'document-2',
  versionId: 'version-2',
  representationId: 'representation-2',
  versionNumber: 2,
  sourceTitle: 'Signed application questionnaire',
  fileName: 'questionnaire.PDF',
  note: 'Signed by the director.',
});
const eligibleRow = {
  documentId: 'document-1',
  versionId: 'version-1',
  versionNumber: 1,
  representationId: 'representation-1',
  sourceTitle: 'Signed certification agreement',
};

describe('Certification signed originals and agreement parsers', () => {
  it('reads a recorded agreement with the audit team next, and its timeline entry', () => {
    const parsed = parseCaseDetail(agreedDetail(), { ...scope, caseId });
    expect(parsed.nextStep).toBe('team');
    expect(parsed.agreement?.value).toEqual({
      signedOn: '2026-11-02',
      attachmentId,
    });
    expect(
      parseTimeline(
        { caseId, entries: [application, review, duration, agreement] },
        caseId,
      ).entries.at(-1),
    ).toMatchObject({ step: 'agreement', version: 1 });
  });

  it('reads an agreement whose duration was corrected afterwards, and a corrected agreement', () => {
    const corrected = parseCaseDetail(
      agreedDetail({
        revision: 7,
        duration: {
          ...duration,
          version: 2,
          caseRevision: 7,
          reason: 'Interpreter added.',
        },
      }),
      { ...scope, caseId },
    );
    expect(corrected.duration?.caseRevision).toBe(7);
    expect(
      parseCaseDetail(
        agreedDetail({
          revision: 7,
          agreement: {
            ...agreement,
            version: 2,
            caseRevision: 7,
            reason: 'The client signed a day later.',
          },
        }),
        { ...scope, caseId },
      ).agreement?.reason,
    ).toBe('The client signed a day later.');
  });

  it.each([
    [
      'an agreement without a confirmed duration',
      detail({ revision: 6, nextStep: 'team', agreement }),
    ],
    [
      'the audit team next without an agreement',
      durationDetail({}, { nextStep: 'team' }),
    ],
    [
      'an agreement while the agreement is still next',
      agreedDetail({ nextStep: 'agreement' }),
    ],
    ['an agreement beyond the Case revision', agreedDetail({ revision: 5 })],
    [
      'an agreement at the duration revision',
      agreedDetail({ agreement: { ...agreement, caseRevision: 4 } }),
    ],
    [
      'a first duration recorded after the agreement',
      agreedDetail({
        duration: { ...duration, caseRevision: 6 },
        agreement: { ...agreement, caseRevision: 5 },
      }),
    ],
    [
      'a first agreement with a reason',
      agreedDetail({ agreement: { ...agreement, reason: 'Not a fix' } }),
    ],
    [
      'a corrected agreement without a reason',
      agreedDetail({ agreement: { ...agreement, version: 2 } }),
    ],
    [
      'an impossible signature date',
      agreedDetail({
        agreement: {
          ...agreement,
          value: { signedOn: '2026-02-30', attachmentId },
        },
      }),
    ],
    [
      'a signature date with a time',
      agreedDetail({
        agreement: {
          ...agreement,
          value: { signedOn: '2026-11-02T00:00:00.000Z', attachmentId },
        },
      }),
    ],
    [
      'a duration in the agreement field',
      agreedDetail({ agreement: { ...duration, caseRevision: 6 } }),
    ],
  ])('fails closed on %s', (_name, value) => {
    expect(() => parseCaseDetail(value, { ...scope, caseId })).toThrow();
  });

  it('reads the register in attachment order with its exact facts', () => {
    const register = parseDocumentRegister(
      { caseId, items: [attachmentRow(), questionnaireRow] },
      caseId,
    );
    expect(register.items.map((item) => item.role)).toEqual([
      'agreement',
      'questionnaire',
    ]);
    expect(register.items[1]).toMatchObject({
      fileName: 'questionnaire.PDF',
      note: 'Signed by the director.',
      sha256: 'a'.repeat(64),
      attachedBy: by,
    });
    expect(parseDocumentRegister({ caseId, items: [] }, caseId).items).toEqual(
      [],
    );
  });

  it.each([
    ['another Case', { caseId: 'other-case', items: [attachmentRow()] }],
    [
      'an unknown role',
      { caseId, items: [attachmentRow({ role: 'invoice' })] },
    ],
    [
      'an uppercase fingerprint',
      { caseId, items: [attachmentRow({ sha256: 'A'.repeat(64) })] },
    ],
    [
      'a short fingerprint',
      { caseId, items: [attachmentRow({ sha256: 'a'.repeat(63) })] },
    ],
    [
      'attachments out of revision order',
      { caseId, items: [questionnaireRow, attachmentRow()] },
    ],
    [
      'two attachments at one revision',
      {
        caseId,
        items: [attachmentRow(), { ...questionnaireRow, caseRevision: 5 }],
      },
    ],
    [
      'the same exact PDF twice',
      {
        caseId,
        items: [
          attachmentRow(),
          attachmentRow({ id: 'attachment-2', caseRevision: 7 }),
        ],
      },
    ],
    [
      'a file name with a path',
      { caseId, items: [attachmentRow({ fileName: '../agreement.pdf' })] },
    ],
    [
      'a file name that is not a PDF',
      { caseId, items: [attachmentRow({ fileName: 'agreement.exe' })] },
    ],
    [
      'a size above five mebibytes',
      { caseId, items: [attachmentRow({ sizeBytes: 5 * 1024 * 1024 + 1 })] },
    ],
    [
      'an attachment at the opening revision',
      { caseId, items: [attachmentRow({ caseRevision: 1 })] },
    ],
    ['a blank note', { caseId, items: [attachmentRow({ note: '  ' })] }],
  ])('fails closed on a register with %s', (_name, value) => {
    expect(() => parseDocumentRegister(value, caseId)).toThrow();
  });

  it('reads the eligible received PDFs and their truncation', () => {
    expect(
      parseEligibleDocuments(
        { caseId, items: [eligibleRow], truncated: false },
        caseId,
      ),
    ).toEqual({ caseId, items: [eligibleRow], truncated: false });
    const page = Array.from({ length: 25 }, (_, index) => ({
      ...eligibleRow,
      representationId: `representation-${index}`,
    }));
    expect(
      parseEligibleDocuments({ caseId, items: page, truncated: true }, caseId)
        .truncated,
    ).toBe(true);
  });

  it.each([
    ['another Case', { caseId: 'other-case', items: [], truncated: false }],
    ['no truncation flag', { caseId, items: [eligibleRow] }],
    [
      'a truncated short page',
      { caseId, items: [eligibleRow], truncated: true },
    ],
    [
      'the same exact PDF twice',
      { caseId, items: [eligibleRow, eligibleRow], truncated: false },
    ],
    [
      'a version zero',
      {
        caseId,
        items: [{ ...eligibleRow, versionNumber: 0 }],
        truncated: false,
      },
    ],
    [
      'a title beyond 200 characters',
      {
        caseId,
        items: [{ ...eligibleRow, sourceTitle: 'T'.repeat(201) }],
        truncated: false,
      },
    ],
  ])('fails closed on eligible PDFs with %s', (_name, value) => {
    expect(() => parseEligibleDocuments(value, caseId)).toThrow();
  });
});

const auditor = teamMember({
  name: 'Ion Demo',
  role: 'auditor',
  holdsCategory: false,
  competenceNote: 'ISO 22000 auditor',
  workspaceMembershipId: 'member-2',
});
const team = {
  id: 'step-5',
  step: 'team',
  version: 1,
  caseRevision: 7,
  reason: null,
  recordedBy: by,
  recordedAt: '2026-11-07T08:06:00.000Z',
  value: { members: [teamMember(), auditor] },
};
const returned = {
  id: 'step-6',
  step: 'team_decision',
  version: 1,
  caseRevision: 8,
  reason: null,
  recordedBy: by,
  recordedAt: '2026-11-07T08:07:00.000Z',
  value: {
    teamVersion: 1,
    decision: 'returned',
    reason: 'Add an auditor for the second shift.',
  },
};
const corrected = {
  ...team,
  id: 'step-7',
  version: 2,
  caseRevision: 9,
  reason: 'Auditor added as requested.',
  recordedAt: '2026-11-07T08:08:00.000Z',
};
const approved = {
  ...returned,
  id: 'step-8',
  version: 2,
  caseRevision: 10,
  recordedAt: '2026-11-07T08:09:00.000Z',
  value: { teamVersion: 2, decision: 'approved', reason: null },
};
/** Agreement at revision 6, the team proposed at 7 and awaiting its decision. */
function teamedDetail(overrides: Record<string, unknown> = {}) {
  return agreedDetail({
    revision: 7,
    nextStep: 'team_decision',
    team,
    teamDecision: null,
    ...overrides,
  });
}
function withMembers(members: unknown[]) {
  return teamedDetail({ team: { ...team, value: { members } } });
}
const conflicted = teamMember({
  declarations: { ...NO_CONFLICT, noConsultancy: false },
  conflictNote: 'Delivered a training to the client last year.',
});

describe('Certification audit team and decision parsers', () => {
  it('reads a proposed team awaiting its decision with every exact member value', () => {
    const parsed = parseCaseDetail(teamedDetail(), { ...scope, caseId });
    expect(parsed.nextStep).toBe('team_decision');
    expect(parsed.team?.value.members).toEqual([teamMember(), auditor]);
    expect(parsed.teamDecision).toBeNull();
    expect(
      parseCaseDetail(
        teamedDetail({ team: { ...team, value: { members: [conflicted] } } }),
        {
          ...scope,
          caseId,
        },
      ).team?.value.members[0]?.conflictNote,
    ).toBe('Delivered a training to the client last year.');
  });

  it('reads a return, a new version with its reason, then the approval', () => {
    expect(
      parseCaseDetail(
        teamedDetail({ revision: 8, nextStep: 'team', teamDecision: returned }),
        { ...scope, caseId },
      ).teamDecision?.value,
    ).toEqual({
      teamVersion: 1,
      decision: 'returned',
      reason: 'Add an auditor for the second shift.',
    });
    const pending = parseCaseDetail(
      teamedDetail({ revision: 9, team: corrected, teamDecision: returned }),
      { ...scope, caseId },
    );
    expect(pending).toMatchObject({
      nextStep: 'team_decision',
      team: { version: 2, reason: 'Auditor added as requested.' },
      teamDecision: { value: { teamVersion: 1 } },
    });
    const plan = parseCaseDetail(
      teamedDetail({
        revision: 10,
        nextStep: 'stage_1_plan',
        team: corrected,
        teamDecision: approved,
      }),
      { ...scope, caseId },
    );
    expect(plan.nextStep).toBe('stage_1_plan');
    expect(plan.teamDecision?.value).toEqual({
      teamVersion: 2,
      decision: 'approved',
      reason: null,
    });
    expect(
      parseTimeline(
        {
          caseId,
          entries: [
            application,
            review,
            duration,
            agreement,
            team,
            returned,
            corrected,
            approved,
          ],
        },
        caseId,
      ).entries.map((entry) => entry.step),
    ).toEqual([
      'application',
      'application_review',
      'duration',
      'agreement',
      'team',
      'team_decision',
      'team',
      'team_decision',
    ]);
  });

  it.each([
    [
      'a Case read without the team fields',
      Object.fromEntries(
        Object.entries(teamedDetail()).filter(
          ([key]) => key !== 'team' && key !== 'teamDecision',
        ),
      ),
    ],
    [
      'a team without an agreement',
      durationDetail({}, { revision: 7, nextStep: 'team_decision', team }),
    ],
    [
      'a team at the agreement revision',
      teamedDetail({ team: { ...team, caseRevision: 6 } }),
    ],
    [
      'a team before the first agreement',
      teamedDetail({
        agreement: { ...agreement, caseRevision: 7 },
        team: { ...team, caseRevision: 6 },
      }),
    ],
    ['a team beyond the Case revision', teamedDetail({ revision: 6 })],
    ['the team still next once proposed', teamedDetail({ nextStep: 'team' })],
    [
      'the decision still next after a decision on the latest version',
      teamedDetail({ revision: 8, teamDecision: returned }),
    ],
    [
      'the Stage 1 plan next without an approval',
      teamedDetail({ nextStep: 'stage_1_plan' }),
    ],
    [
      'the Stage 1 plan next after a return',
      teamedDetail({
        revision: 8,
        nextStep: 'stage_1_plan',
        teamDecision: returned,
      }),
    ],
    [
      'a decision on a team version that does not exist',
      teamedDetail({
        revision: 8,
        teamDecision: {
          ...returned,
          value: { ...returned.value, teamVersion: 2 },
        },
      }),
    ],
    [
      'a decision recorded before its team version',
      teamedDetail({
        revision: 8,
        nextStep: 'team',
        team: { ...team, caseRevision: 8 },
        teamDecision: { ...returned, caseRevision: 7 },
      }),
    ],
    [
      'an earlier version decision at the revision of the latest team',
      teamedDetail({
        revision: 9,
        nextStep: 'team_decision',
        team: corrected,
        teamDecision: { ...returned, caseRevision: 9 },
      }),
    ],
    [
      'a second decision on the first team version',
      teamedDetail({
        revision: 9,
        nextStep: 'team_decision',
        team: corrected,
        teamDecision: { ...returned, version: 2 },
      }),
    ],
    [
      'an approval of a team with a declared conflict',
      teamedDetail({
        revision: 8,
        nextStep: 'stage_1_plan',
        team: { ...team, value: { members: [conflicted] } },
        teamDecision: {
          ...returned,
          value: { teamVersion: 1, decision: 'approved', reason: null },
        },
      }),
    ],
    [
      'a first team with a reason',
      teamedDetail({ team: { ...team, reason: 'Not a correction' } }),
    ],
    [
      'a new team version without a reason',
      teamedDetail({ team: { ...team, version: 2 } }),
    ],
    [
      'a decision with a correction reason',
      teamedDetail({
        revision: 8,
        nextStep: 'team',
        teamDecision: { ...returned, reason: 'Not a correction' },
      }),
    ],
    [
      'a return without its reason',
      teamedDetail({
        revision: 8,
        nextStep: 'team',
        teamDecision: {
          ...returned,
          value: { ...returned.value, reason: null },
        },
      }),
    ],
    [
      'an approval with a reason',
      teamedDetail({
        revision: 8,
        nextStep: 'stage_1_plan',
        teamDecision: {
          ...returned,
          value: { teamVersion: 1, decision: 'approved', reason: 'Fine.' },
        },
      }),
    ],
    [
      'two team leaders',
      withMembers([teamMember(), teamMember({ name: 'Second leader' })]),
    ],
    ['a team without a leader', withMembers([auditor])],
    [
      'a category held only by an auditor',
      withMembers([
        teamMember({ holdsCategory: false }),
        { ...auditor, holdsCategory: true },
      ]),
    ],
    [
      'a category held only by an observer',
      withMembers([
        teamMember({ holdsCategory: false }),
        { ...auditor, role: 'observer', holdsCategory: true },
      ]),
    ],
    [
      'a declared conflict without its description',
      withMembers([{ ...conflicted, conflictNote: null }]),
    ],
    [
      'a conflict description without a declared conflict',
      withMembers([teamMember({ conflictNote: 'Nothing to declare.' })]),
    ],
    [
      'an unanswered declaration',
      withMembers([
        teamMember({
          declarations: {
            noConsultancy: true,
            noEmployment: true,
            noManagementInvolvement: true,
          },
        }),
      ]),
    ],
    [
      'an unknown declaration',
      withMembers([
        teamMember({ declarations: { ...NO_CONFLICT, noFamilyTies: true } }),
      ]),
    ],
    [
      'one membership linked to two members',
      withMembers([teamMember({ workspaceMembershipId: 'member-2' }), auditor]),
    ],
    [
      'eleven members',
      withMembers([
        teamMember(),
        ...Array.from({ length: 10 }, (_, index) => ({
          ...auditor,
          name: `Auditor ${index}`,
          workspaceMembershipId: null,
        })),
      ]),
    ],
    [
      'an unknown role',
      withMembers([teamMember(), { ...auditor, role: 'trainee' }]),
    ],
    [
      'a category flag that is not a boolean',
      withMembers([teamMember({ holdsCategory: 'yes' })]),
    ],
    [
      'a team in the decision field',
      teamedDetail({
        revision: 8,
        nextStep: 'team',
        teamDecision: { ...team, caseRevision: 8 },
      }),
    ],
  ])('fails closed on %s', (_name, value) => {
    expect(() => parseCaseDetail(value, { ...scope, caseId })).toThrow();
  });
});

const approvedFirst = {
  ...returned,
  value: { teamVersion: 1, decision: 'approved', reason: null },
};
function stageVersion(
  step: string,
  caseRevision: number,
  value: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `step-${step}-${String(caseRevision)}`,
    step,
    version: 1,
    caseRevision,
    reason: null,
    recordedBy: by,
    recordedAt: `2026-11-07T09:${String(caseRevision).padStart(2, '0')}:00.000Z`,
    value,
    ...overrides,
  };
}
/** The team approved at 8; each Stage record follows its attachments. */
const stage1Planned = stageVersion('stage_1_plan', 10, stagePlan('plan-1'));
const stage1NotReady = stageVersion(
  'stage_1_report',
  12,
  stage1Report('report-1', {
    conclusion: 'not_ready',
    conclusionNote: 'Hazard analysis incomplete.',
    participantListAttachmentId: 'participants-1',
  }),
);
const stage1Ready = stageVersion(
  'stage_1_report',
  13,
  stage1Report('report-1', { reportDate: '2026-11-14' }),
  { version: 2, reason: 'Hazard analysis completed and verified.' },
);
const stage2Planned = stageVersion(
  'stage_2_plan',
  15,
  stagePlan('plan-2', {
    startDate: '2026-11-20',
    endDate: '2026-11-21',
    onSiteDays: '2.5',
    remoteDays: '0.25',
    sentToClientOn: null,
    deviationNote: 'One production line idle during the audit.',
  }),
);
const stage2Reported = stageVersion(
  'stage_2_report',
  17,
  stage2Report('report-2', {
    participantListAttachmentId: 'participants-2',
    annexAttachmentId: 'annex-2',
  }),
);
/** The approved team with the given Stage records, the Case at their revision. */
function stagedDetail(
  stages: unknown,
  overrides: Record<string, unknown> = {},
) {
  return teamedDetail({
    revision: 17,
    nextStep: 'recommendation',
    teamDecision: approvedFirst,
    stages,
    ...overrides,
  });
}
const allStages = [stage1Planned, stage1Ready, stage2Planned, stage2Reported];

describe('Certification Stage plan and report parsers', () => {
  it('reads the latest plan and report of both Stages with every exact value', () => {
    const parsed = parseCaseDetail(stagedDetail(allStages), {
      ...scope,
      caseId,
    });
    expect(parsed.nextStep).toBe('recommendation');
    expect(parsed.stage1Plan?.value).toEqual({
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      onSiteDays: '1',
      remoteDays: '0',
      objectives: 'Evaluate readiness of the food safety management system',
      scope: 'Production of pasteurised milk and yoghurt',
      planAttachmentId: 'plan-1',
      sentToClientOn: '2026-11-03',
      deviationNote: null,
    });
    expect(parsed.stage1Report).toMatchObject({
      version: 2,
      reason: 'Hazard analysis completed and verified.',
      value: {
        reportDate: '2026-11-14',
        documentReviewCompleted: true,
        conclusion: 'ready',
        participantListAttachmentId: null,
      },
    });
    expect(parsed.stage2Plan?.value).toMatchObject({
      onSiteDays: '2.5',
      remoteDays: '0.25',
      sentToClientOn: null,
      deviationNote: 'One production line idle during the audit.',
    });
    expect(parsed.stage2Report?.value).toEqual({
      reportDate: '2026-11-21',
      summary: 'Stage 2 completed as planned.',
      reportAttachmentId: 'report-2',
      participantListAttachmentId: 'participants-2',
      annexAttachmentId: 'annex-2',
    });
  });

  it.each([
    ['the Stage 1 plan', [], 'stage_1_plan', 8],
    ['the Stage 1 report', [stage1Planned], 'stage_1_report', 10],
    [
      'the Stage 1 report again after a not-ready conclusion',
      [stage1Planned, stage1NotReady],
      'stage_1_report',
      12,
    ],
    ['the Stage 2 plan', [stage1Planned, stage1Ready], 'stage_2_plan', 13],
    [
      'the Stage 2 report',
      [stage1Planned, stage1Ready, stage2Planned],
      'stage_2_report',
      15,
    ],
  ])('reads %s as the next step', (_name, stages, nextStep, revision) => {
    const parsed = parseCaseDetail(
      stagedDetail(stages, { revision, nextStep }),
      { ...scope, caseId },
    );
    expect(parsed.nextStep).toBe(nextStep);
    expect(
      parseCaseList(
        {
          projectId: certificationIds.project,
          cases: [stagedDetail(stages, { revision, nextStep })],
          total: 1,
        },
        certificationIds.project,
      ).cases[0]?.nextStep,
    ).toBe(nextStep);
  });

  it('reads Stage records kept while a new team version awaits its decision', () => {
    const parsed = parseCaseDetail(
      stagedDetail([stage1Planned], {
        revision: 11,
        nextStep: 'team_decision',
        team: { ...corrected, caseRevision: 11, reason: 'Auditor replaced.' },
      }),
      { ...scope, caseId },
    );
    expect(parsed.nextStep).toBe('team_decision');
    expect(parsed.stage1Plan?.version).toBe(1);
  });

  it('reads every Stage version of the timeline in order', () => {
    expect(
      parseTimeline(
        {
          caseId,
          entries: [
            application,
            review,
            duration,
            agreement,
            team,
            approvedFirst,
            stage1Planned,
            stage1NotReady,
            stage1Ready,
            stage2Planned,
            stage2Reported,
          ],
        },
        caseId,
      ).entries.slice(-5),
    ).toMatchObject([
      { step: 'stage_1_plan', version: 1 },
      { step: 'stage_1_report', value: { conclusion: 'not_ready' } },
      { step: 'stage_1_report', version: 2 },
      { step: 'stage_2_plan', version: 1 },
      { step: 'stage_2_report', version: 1 },
    ]);
  });

  const withPlan = (value: Record<string, unknown>) =>
    stagedDetail(
      [{ ...stage1Planned, value: { ...stage1Planned.value, ...value } }],
      {
        revision: 10,
        nextStep: 'stage_1_report',
      },
    );
  const withReport = (value: Record<string, unknown>) =>
    stagedDetail(
      [
        stage1Planned,
        { ...stage1Ready, value: { ...stage1Ready.value, ...value } },
      ],
      { revision: 13, nextStep: 'stage_2_plan' },
    );
  const withoutKey = (value: Record<string, unknown>, key: string) =>
    Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));

  it.each([
    [
      'a Case read without the Stage records',
      withoutKey(
        stagedDetail([], { revision: 8, nextStep: 'stage_1_plan' }),
        'stages',
      ),
    ],
    [
      'Stage records that are not a list',
      stagedDetail({}, { revision: 8, nextStep: 'stage_1_plan' }),
    ],
    [
      'a Stage step listed twice',
      stagedDetail([stage1Planned, { ...stage1Planned, id: 'other' }], {
        revision: 10,
        nextStep: 'stage_1_report',
      }),
    ],
    [
      'Stage records out of order',
      stagedDetail([stage1Ready, stage1Planned], {
        revision: 13,
        nextStep: 'stage_2_plan',
      }),
    ],
    [
      'another step among the Stage records',
      stagedDetail([team], { revision: 8, nextStep: 'stage_1_plan' }),
    ],
    [
      'an unknown Stage step',
      stagedDetail([{ ...stage1Planned, step: 'stage_3_plan' }], {
        revision: 10,
        nextStep: 'stage_1_report',
      }),
    ],
    [
      'a plan without any team decision',
      stagedDetail([stage1Planned], {
        revision: 10,
        nextStep: 'team_decision',
        teamDecision: null,
      }),
    ],
    [
      'a plan when the only decision returned the team',
      stagedDetail([stage1Planned], {
        revision: 10,
        nextStep: 'team',
        teamDecision: returned,
      }),
    ],
    [
      'a plan before the first approval',
      stagedDetail([stage1Planned], {
        revision: 11,
        nextStep: 'stage_1_report',
        teamDecision: { ...approvedFirst, caseRevision: 11 },
      }),
    ],
    [
      'a report without its plan',
      stagedDetail([stage1Ready], { revision: 13, nextStep: 'stage_1_plan' }),
    ],
    [
      'a first report before its first plan',
      stagedDetail([{ ...stage1Planned, caseRevision: 14 }, stage1NotReady], {
        revision: 14,
        nextStep: 'stage_1_report',
      }),
    ],
    [
      'a Stage 2 plan without a Stage 1 report',
      stagedDetail([stage1Planned, stage2Planned], {
        revision: 15,
        nextStep: 'stage_1_report',
      }),
    ],
    [
      'a Stage 2 report without its plan',
      stagedDetail([stage1Planned, stage1Ready, stage2Reported], {
        revision: 17,
        nextStep: 'stage_2_plan',
      }),
    ],
    [
      'a Stage record beyond the Case revision',
      stagedDetail([stage1Planned], {
        revision: 9,
        nextStep: 'stage_1_report',
      }),
    ],
    [
      'a Stage record at the revision of another step',
      stagedDetail([{ ...stage1Planned, caseRevision: 8 }], {
        revision: 10,
        nextStep: 'stage_1_report',
      }),
    ],
    [
      'the Stage 1 plan still next once planned',
      stagedDetail([stage1Planned], { revision: 10, nextStep: 'stage_1_plan' }),
    ],
    [
      'the Stage 2 plan next after a not-ready conclusion',
      stagedDetail([stage1Planned, stage1NotReady], {
        revision: 12,
        nextStep: 'stage_2_plan',
      }),
    ],
    [
      'the recommendation next before the Stage 2 report',
      stagedDetail([stage1Planned, stage1Ready, stage2Planned], {
        revision: 15,
      }),
    ],
    [
      'an unknown next step',
      stagedDetail(allStages, { nextStep: 'stage_3_plan' }),
    ],
    [
      'a first plan with a reason',
      stagedDetail([{ ...stage1Planned, reason: 'Not a correction' }], {
        revision: 10,
        nextStep: 'stage_1_report',
      }),
    ],
    [
      'a corrected report without its reason',
      stagedDetail([stage1Planned, { ...stage1Ready, reason: null }], {
        revision: 13,
        nextStep: 'stage_2_plan',
      }),
    ],
    ['a plan ending before it starts', withPlan({ endDate: '2026-11-09' })],
    ['a plan date that does not exist', withPlan({ startDate: '2026-02-30' })],
    ['no on-site days', withPlan({ onSiteDays: '0' })],
    ['on-site days with three decimals', withPlan({ onSiteDays: '1.255' })],
    ['on-site days as a number', withPlan({ onSiteDays: 1 })],
    ['negative remote days', withPlan({ remoteDays: '-1' })],
    ['missing remote days', withPlan({ remoteDays: undefined })],
    ['blank objectives', withPlan({ objectives: '  ' })],
    ['a scope beyond its limit', withPlan({ scope: 'x'.repeat(2001) })],
    ['a plan without its attachment', withPlan({ planAttachmentId: null })],
    ['an invalid sending date', withPlan({ sentToClientOn: '03/11/2026' })],
    ['a blank deviation note', withPlan({ deviationNote: '' })],
    [
      'an incomplete document review',
      withReport({ documentReviewCompleted: false }),
    ],
    [
      'an unknown conclusion',
      // Not ready by its next step: only the closed conclusion refuses it.
      stagedDetail(
        [
          stage1Planned,
          {
            ...stage1NotReady,
            value: { ...stage1NotReady.value, conclusion: 'maybe' },
          },
        ],
        { revision: 12, nextStep: 'stage_1_report' },
      ),
    ],
    ['a missing conclusion basis', withReport({ conclusionNote: null })],
    [
      'a conclusion basis beyond its limit',
      withReport({ conclusionNote: 'x'.repeat(4001) }),
    ],
    ['an invalid report date', withReport({ reportDate: '2026-13-01' })],
    ['a report without its attachment', withReport({ reportAttachmentId: '' })],
    [
      'a participant list that is not an attachment',
      withReport({ participantListAttachmentId: 7 }),
    ],
    [
      'a Stage 2 report without its summary',
      stagedDetail([
        stage1Planned,
        stage1Ready,
        stage2Planned,
        { ...stage2Reported, value: { ...stage2Reported.value, summary: ' ' } },
      ]),
    ],
    [
      'a Stage 2 report with an invalid annex',
      stagedDetail([
        stage1Planned,
        stage1Ready,
        stage2Planned,
        {
          ...stage2Reported,
          value: { ...stage2Reported.value, annexAttachmentId: false },
        },
      ]),
    ],
    [
      'a Stage 1 report in the Stage 2 report place',
      stagedDetail([
        stage1Planned,
        stage1Ready,
        stage2Planned,
        { ...stage2Reported, value: stage1Ready.value },
      ]),
    ],
  ])('fails closed on %s', (_name, value) => {
    expect(() => parseCaseDetail(value, { ...scope, caseId })).toThrow();
  });

  it('fails closed on a timeline with an unknown or malformed Stage version', () => {
    const entries = [
      application,
      review,
      duration,
      agreement,
      team,
      approvedFirst,
    ];
    expect(() =>
      parseTimeline(
        {
          caseId,
          entries: [...entries, { ...stage1Planned, step: 'stage_plan' }],
        },
        caseId,
      ),
    ).toThrow();
    expect(() =>
      parseTimeline(
        {
          caseId,
          entries: [
            ...entries,
            {
              ...stage1Planned,
              value: { ...stage1Planned.value, onSiteDays: '' },
            },
          ],
        },
        caseId,
      ),
    ).toThrow();
  });
});
