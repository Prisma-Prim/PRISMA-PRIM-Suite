import { describe, expect, it } from 'vitest';
import {
  parseCaseDetail,
  parseCaseCommandReceipt,
  parseCaseList,
  parseDocumentRegister,
  parseDurationResult,
  parseEligibleDocuments,
  parseTimeline,
} from './certification-response';
import { parseDecisionFailures } from './certification-decision';
import {
  CERTIFICATE_TEXTS,
  NO_CONFLICT,
  actedFor,
  certificationDecision,
  certificationIds,
  dossierReview,
  findingStatement,
  lactisFacts,
  nonconformityResponse,
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
    findings: [],
    recommendation: null,
    dossierReview: null,
    decision: null,
    certificateData: null,
    certificate: null,
    release: noRelease,
    consistency: noDiscrepancy,
    exchanges: noExchange,
    ...overrides,
  };
}

/** The release section of a Case without any draft or Certificate. */
const noRelease = {
  revisions: [],
  currentRevisionIndex: null,
  revisionRequired: false,
  validity: null,
  drafts: [],
  opinions: [],
  approvals: [],
  currentDraftId: null,
  outdated: false,
  approvalBlockers: ['draft_missing'],
  issuanceBlockers: ['draft_missing', 'approval_missing'],
  transmission: null,
  daysSinceIssuance: null,
};

const noExchange = {
  nextCursor: null,
  sendings: [],
  records: [],
  total: 0,
  deadlines: { set: null, entries: [] },
  reverification: { items: [], firstSurveillanceBy: null },
};

it('acknowledges an immutable pre-pagination command receipt while requiring the Case scope', () => {
  const old = detail({
    exchanges: {
      records: [],
      total: 0,
      deadlines: { set: null, entries: [] },
      reverification: { items: [], firstSurveillanceBy: null },
    },
  });
  expect(parseCaseCommandReceipt(old, { ...scope, caseId })).toEqual({
    id: caseId,
    revision: 3,
  });
  for (const invalidScope of [
    { ...scope, companyId: 'other' },
    { ...scope, projectId: 'other' },
    { ...scope, caseId: 'other' },
  ])
    expect(() => parseCaseCommandReceipt(old, invalidScope)).toThrow();
  // Only acknowledgement accepts old receipts. A live read must have the new complete page contract.
  expect(() => parseCaseDetail(old, { ...scope, caseId })).toThrow();
});

const noDiscrepancy = {
  ruleSetVersion: 'dossier-consistency-2026-11',
  counts: { critical: 0, error: 0, toClarify: 0 },
  open: [],
  resolved: [],
  resolvedTotal: 0,
};

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

  it('reads an application corrected after its review and its duration, and refuses a first application after the review', () => {
    const corrected = durationDetail(
      {},
      {
        revision: 5,
        application: {
          ...application,
          id: 'step-4',
          version: 2,
          caseRevision: 5,
          reason: 'The client corrected its headcount to 60.',
          value: lactisFacts({
            haccpStudyCount: 3,
            totalHeadcount: 60,
            effectiveFte: 60,
          }),
        },
      },
    );
    expect(
      parseCaseDetail(corrected, { ...scope, caseId }).application?.version,
    ).toBe(2);
    expect(() =>
      parseCaseDetail(
        detail({ application: { ...application, caseRevision: 3 } }),
        { ...scope, caseId },
      ),
    ).toThrow();
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
    // A record made before acts on behalf existed reads without one.
    expect(parsed.duration?.value).toEqual({
      ...determination,
      onBehalf: null,
    });
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
      // Recorded before the attestation and acts on behalf existed.
      onBehalf: null,
      independenceAttested: false,
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
      onBehalf: null,
      independenceAttested: false,
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
      certificationBodyApproval: null,
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

function findingRecord(
  kind: string,
  caseRevision: number,
  value: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `record-${kind}-${String(caseRevision)}`,
    kind,
    version: 1,
    caseRevision,
    reason: null,
    recordedBy: by,
    recordedAt: `2026-11-07T10:${String(caseRevision).padStart(2, '0')}:00.000Z`,
    value,
    ...overrides,
  };
}
const classified = (classification: string, by = 'team_leader') => ({
  classification,
  by,
});
const judged = (outcome: string) => ({ outcome, note: 'Plan judged.' });
const verified = (outcome: string, evidenceAttachmentIds: string[] = []) => ({
  verifiedOn: '2026-11-14',
  method: 'document_review',
  outcome,
  note: 'Revised analysis and training record reviewed.',
  evidenceAttachmentIds,
});
/** Stage 1 planned at 10 and reported ready at 12; Stage 2 at 16 and 18. */
const findingStages = [
  stage1Planned,
  stageVersion('stage_1_report', 12, stage1Report('report-1')),
  stageVersion(
    'stage_2_plan',
    16,
    stagePlan('plan-2', {
      startDate: '2026-11-20',
      endDate: '2026-11-21',
      onSiteDays: '2',
    }),
  ),
  stageVersion('stage_2_report', 18, stage2Report('report-2')),
];
const minorStatement = findingStatement({
  evidenceAttachmentIds: ['evidence-1'],
});
/** A Stage 1 minor nonconformity at 11, followed up at 13, 14 and 15. */
const minorRecords = [
  findingRecord('statement', 11, minorStatement),
  findingRecord('classification', 11, classified('minor_nonconformity')),
  findingRecord('response', 13, nonconformityResponse()),
  findingRecord('plan_judgment', 14, judged('adequate')),
  findingRecord('verification', 15, verified('effective')),
];
const minor = {
  id: 'finding-1',
  stage: 'stage_1',
  sequence: 1,
  statement: minorStatement,
  classification: 'minor_nonconformity',
  status: 'verified_effective',
  responseDueOn: '2026-11-24',
  limitOn: '2027-05-10',
  overdue: false,
  records: minorRecords,
};
const majorStatement = findingStatement({
  clause: '8.5.4.3',
  area: 'Pasteurisation CCP',
  statement:
    'Critical limit deviations were not followed by corrective actions.',
  evidenceAttachmentIds: ['evidence-2', 'evidence-3'],
});
/** A Stage 2 major nonconformity recorded at 17, before the report at 18. */
const majorRecords = [
  findingRecord('classification', 17, classified('major_nonconformity')),
  findingRecord('statement', 17, majorStatement),
];
const major = {
  id: 'finding-2',
  stage: 'stage_2',
  sequence: 2,
  statement: majorStatement,
  classification: 'major_nonconformity',
  status: 'awaiting_response',
  responseDueOn: '2026-12-05',
  limitOn: '2027-05-21',
  overdue: false,
  records: majorRecords,
};
const majorVerified = {
  ...major,
  status: 'verified_effective',
  records: [
    ...majorRecords,
    findingRecord('response', 19, nonconformityResponse()),
    findingRecord('plan_judgment', 20, judged('adequate')),
    findingRecord('verification', 21, verified('effective', ['evidence-2'])),
  ],
};
function foundDetail(
  findings: unknown,
  overrides: Record<string, unknown> = {},
) {
  return stagedDetail(findingStages, {
    revision: 18,
    nextStep: 'findings_follow_up',
    findings,
    ...overrides,
  });
}
/** Only Stage 1 planned, at 10: Findings of Stage 1 follow from 11. */
function stage1Findings(
  findings: unknown,
  overrides: Record<string, unknown> = {},
) {
  return stagedDetail([stage1Planned], {
    revision: 12,
    nextStep: 'stage_1_report',
    findings,
    ...overrides,
  });
}
const opportunityStatement = findingStatement({
  clause: null,
  area: null,
  statement: 'Consider digital temperature records.',
});
const opportunity = {
  id: 'finding-1',
  stage: 'stage_1',
  sequence: 1,
  statement: opportunityStatement,
  classification: 'opportunity_for_improvement',
  status: 'no_action_required',
  responseDueOn: null,
  limitOn: null,
  overdue: false,
  records: [
    findingRecord('statement', 11, opportunityStatement),
    findingRecord(
      'classification',
      11,
      classified('opportunity_for_improvement'),
    ),
  ],
};
const concernStatement = findingStatement({
  clause: '7.5',
  area: 'Document control',
  statement: 'Obsolete forms still available at the line.',
});
/** An opportunity at 11 that the approver reclassifies at 12. */
const reclassified = {
  ...opportunity,
  statement: concernStatement,
  classification: 'area_of_concern',
  records: [
    findingRecord('statement', 11, concernStatement),
    findingRecord(
      'classification',
      11,
      classified('opportunity_for_improvement'),
    ),
    findingRecord(
      'classification',
      12,
      classified('area_of_concern', 'approver'),
      {
        version: 2,
        reason: 'A problem area rather than an improvement point.',
      },
    ),
  ],
};

describe('Certification Finding parsers', () => {
  it('reads every Finding with its exact statement, evidence, dates and records', () => {
    const parsed = parseCaseDetail(foundDetail([minor, major]), {
      ...scope,
      caseId,
    });
    expect(parsed.nextStep).toBe('findings_follow_up');
    expect(parsed.findings).toHaveLength(2);
    const [first, second] = parsed.findings;
    expect(first).toMatchObject({
      id: 'finding-1',
      stage: 'stage_1',
      sequence: 1,
      statement: {
        clause: '8.5.1',
        area: 'Receiving of raw milk',
        statement: 'Hazard analysis does not cover allergens at receiving.',
        evidenceAttachmentIds: ['evidence-1'],
      },
      classification: 'minor_nonconformity',
      status: 'verified_effective',
      responseDueOn: '2026-11-24',
      limitOn: '2027-05-10',
      overdue: false,
    });
    expect(first?.records.map((record) => record.kind)).toEqual([
      'statement',
      'classification',
      'response',
      'plan_judgment',
      'verification',
    ]);
    expect(first?.records[2]).toMatchObject({
      kind: 'response',
      version: 1,
      caseRevision: 13,
      reason: null,
      recordedBy: by,
      value: {
        correction: 'Allergen added to the receiving hazard analysis.',
        cause: 'The template omitted allergens.',
        correctiveAction: 'Template revised and staff trained.',
        receivedOn: '2026-11-12',
        plannedCompletionOn: null,
        evidenceAttachmentIds: [],
      },
    });
    expect(first?.records[4]).toMatchObject({
      kind: 'verification',
      value: { method: 'document_review', outcome: 'effective' },
    });
    // The creation records may come in either order at one revision.
    expect(second).toMatchObject({
      stage: 'stage_2',
      classification: 'major_nonconformity',
      status: 'awaiting_response',
      responseDueOn: '2026-12-05',
      limitOn: '2027-05-21',
      statement: { evidenceAttachmentIds: ['evidence-2', 'evidence-3'] },
    });
    expect(
      parseCaseList(
        {
          projectId: certificationIds.project,
          cases: [foundDetail([minor, major])],
          total: 1,
        },
        certificationIds.project,
      ).cases[0]?.nextStep,
    ).toBe('findings_follow_up');
  });

  it('reads the recommendation next once the major nonconformity is verified effective', () => {
    const parsed = parseCaseDetail(
      foundDetail([minor, majorVerified], {
        revision: 21,
        nextStep: 'recommendation',
      }),
      { ...scope, caseId },
    );
    expect(parsed.nextStep).toBe('recommendation');
    expect(parsed.findings[1]?.status).toBe('verified_effective');
  });

  it('reads a minor Stage 2 nonconformity with an adequate plan as no longer holding the recommendation', () => {
    const minorStage2 = {
      ...major,
      statement: minorStatement,
      classification: 'minor_nonconformity',
      status: 'plan_adequate',
      limitOn: null,
      records: [
        findingRecord('statement', 17, minorStatement),
        findingRecord('classification', 17, classified('minor_nonconformity')),
        findingRecord('response', 19, nonconformityResponse()),
        findingRecord('plan_judgment', 20, judged('inadequate')),
        findingRecord(
          'response',
          21,
          nonconformityResponse({
            correctiveAction: 'Template revised; training recorded.',
          }),
          { version: 2 },
        ),
        findingRecord('plan_judgment', 22, judged('adequate'), {
          version: 2,
        }),
      ],
    };
    const parsed = parseCaseDetail(
      foundDetail([minor, minorStage2], {
        revision: 22,
        nextStep: 'recommendation',
      }),
      { ...scope, caseId },
    );
    expect(parsed.findings[1]).toMatchObject({
      status: 'plan_adequate',
      limitOn: null,
    });
    expect(
      parsed.findings[1]?.records.map((record) => [
        record.kind,
        record.version,
      ]),
    ).toEqual([
      ['statement', 1],
      ['classification', 1],
      ['response', 1],
      ['plan_judgment', 1],
      ['response', 2],
      ['plan_judgment', 2],
    ]);
  });

  it('reads a major nonconformity with an adequate plan as holding the recommendation until verified', () => {
    const adequate = {
      ...major,
      status: 'plan_adequate',
      records: [
        ...majorRecords,
        findingRecord('response', 19, nonconformityResponse()),
        findingRecord('plan_judgment', 20, judged('adequate')),
      ],
    };
    const parsed = parseCaseDetail(
      foundDetail([minor, adequate], { revision: 20 }),
      { ...scope, caseId },
    );
    expect(parsed.nextStep).toBe('findings_follow_up');
    expect(() =>
      parseCaseDetail(
        foundDetail([minor, adequate], {
          revision: 20,
          nextStep: 'recommendation',
        }),
        { ...scope, caseId },
      ),
    ).toThrow();
  });

  it('reads an opportunity for improvement without clause or area, and a reclassification by the approver', () => {
    expect(
      parseCaseDetail(stage1Findings([opportunity], { revision: 11 }), {
        ...scope,
        caseId,
      }).findings[0],
    ).toMatchObject({
      statement: { clause: null, area: null },
      status: 'no_action_required',
      responseDueOn: null,
      limitOn: null,
    });
    const parsed = parseCaseDetail(stage1Findings([reclassified]), {
      ...scope,
      caseId,
    });
    expect(parsed.findings[0]).toMatchObject({
      classification: 'area_of_concern',
      status: 'no_action_required',
    });
    expect(parsed.findings[0]?.records.at(-1)).toMatchObject({
      kind: 'classification',
      version: 2,
      reason: 'A problem area rather than an improvement point.',
      value: { classification: 'area_of_concern', by: 'approver' },
    });
  });

  it('reads the server statement that a six-month limit has passed', () => {
    const open = {
      ...minor,
      status: 'awaiting_response',
      overdue: true,
      records: minorRecords.slice(0, 2),
    };
    expect(
      parseCaseDetail(stage1Findings([open], { revision: 11 }), {
        ...scope,
        caseId,
      }).findings[0]?.overdue,
    ).toBe(true);
  });

  const withMinor = (overrides: Record<string, unknown>) =>
    foundDetail([{ ...minor, ...overrides }, major]);
  /** The major nonconformity with this statement, current and recorded. */
  const withMajorStatement = (statement: Record<string, unknown>) =>
    foundDetail([
      minor,
      {
        ...major,
        statement,
        records: [majorRecords[0], findingRecord('statement', 17, statement)],
      },
    ]);
  const withMinorRecords = (
    records: unknown[],
    overrides: Record<string, unknown> = {},
  ) => withMinor({ records, ...overrides });
  const [minorStatementRecord, minorClassificationRecord, response] =
    minorRecords;
  const withoutKey = (value: Record<string, unknown>, key: string) =>
    Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));

  it.each([
    [
      'a Case read without its Findings',
      withoutKey(foundDetail([minor, major]), 'findings'),
    ],
    ['Findings that are not a list', foundDetail({ minor })],
    ['an unknown classification', withMinor({ classification: 'critical' })],
    [
      'an unknown classification record',
      withMinorRecords([
        minorStatementRecord,
        findingRecord('classification', 11, classified('critical')),
      ]),
    ],
    ['an unknown status', withMinor({ status: 'closed' })],
    [
      'a nonconformity without evidence',
      foundDetail([
        minor,
        {
          ...major,
          statement: { ...majorStatement, evidenceAttachmentIds: [] },
          records: [
            majorRecords[0],
            findingRecord('statement', 17, {
              ...majorStatement,
              evidenceAttachmentIds: [],
            }),
          ],
        },
      ]),
    ],
    [
      'a minor nonconformity without a clause',
      withMinorRecords(
        [
          findingRecord('statement', 11, { ...minorStatement, clause: null }),
          ...minorRecords.slice(1),
        ],
        { statement: { ...minorStatement, clause: null } },
      ),
    ],
    [
      'an area of concern at Stage 2',
      // Nothing else holds the recommendation: only the Stage rule refuses it.
      foundDetail(
        [
          minor,
          {
            ...major,
            classification: 'area_of_concern',
            status: 'no_action_required',
            responseDueOn: null,
            limitOn: null,
            records: [
              findingRecord(
                'classification',
                17,
                classified('area_of_concern'),
              ),
              majorRecords[1],
            ],
          },
        ],
        { nextStep: 'recommendation' },
      ),
    ],
    [
      'a status other than the replayed one',
      withMinor({ status: 'plan_adequate' }),
    ],
    [
      'a classification other than the latest record',
      withMinor({ classification: 'major_nonconformity' }),
    ],
    [
      'a statement other than the latest record',
      withMinor({ statement: { ...minorStatement, statement: 'Other.' } }),
    ],
    [
      'a plan judgment without a response',
      withMinorRecords(
        [
          minorStatementRecord,
          minorClassificationRecord,
          findingRecord('plan_judgment', 13, judged('adequate')),
        ],
        { status: 'plan_adequate' },
      ),
    ],
    [
      'a verification of a plan not judged adequate',
      withMinorRecords(
        [
          minorStatementRecord,
          minorClassificationRecord,
          response,
          findingRecord('plan_judgment', 14, judged('inadequate')),
          findingRecord('verification', 15, verified('effective')),
        ],
        { status: 'verified_effective' },
      ),
    ],
    [
      'a response to an opportunity for improvement',
      stage1Findings([
        {
          ...opportunity,
          status: 'awaiting_plan_judgment',
          records: [
            ...opportunity.records,
            findingRecord('response', 12, nonconformityResponse()),
          ],
        },
      ]),
    ],
    [
      'a new response once verified effective',
      foundDetail(
        [
          {
            ...minor,
            status: 'awaiting_plan_judgment',
            records: [
              ...minorRecords,
              findingRecord('response', 19, nonconformityResponse(), {
                version: 2,
              }),
            ],
          },
          major,
        ],
        { revision: 19 },
      ),
    ],
    [
      'a response due date on an opportunity for improvement',
      stage1Findings([{ ...opportunity, responseDueOn: '2026-11-24' }], {
        revision: 11,
      }),
    ],
    [
      'a nonconformity without its response due date',
      withMinor({ responseDueOn: null }),
    ],
    [
      'an invalid response due date',
      withMinor({ responseDueOn: '24.11.2026' }),
    ],
    [
      'a six-month limit on a minor Stage 2 nonconformity',
      foundDetail([
        minor,
        {
          ...major,
          classification: 'minor_nonconformity',
          records: [
            findingRecord(
              'classification',
              17,
              classified('minor_nonconformity'),
            ),
            majorRecords[1],
          ],
        },
      ]),
    ],
    [
      'a Stage 1 nonconformity without its six-month limit',
      withMinor({ limitOn: null }),
    ],
    ['an overdue Finding verified effective', withMinor({ overdue: true })],
    [
      'an overdue opportunity for improvement',
      stage1Findings([{ ...opportunity, overdue: true }], { revision: 11 }),
    ],
    ['an overdue flag that is not a boolean', withMinor({ overdue: 'no' })],
    [
      'a Finding of a Stage not planned',
      stage1Findings([{ ...major, sequence: 1 }], { revision: 17 }),
    ],
    [
      'a Finding before the first plan of its Stage',
      stage1Findings(
        [
          {
            ...opportunity,
            records: opportunity.records.map((record) => ({
              ...record,
              caseRevision: 9,
            })),
          },
        ],
        { revision: 10 },
      ),
    ],
    [
      'a Stage 1 Finding after the first Stage 2 plan',
      foundDetail(
        [
          minor,
          major,
          {
            ...opportunity,
            id: 'finding-3',
            sequence: 3,
            records: opportunity.records.map((record) => ({
              ...record,
              caseRevision: 19,
            })),
          },
        ],
        { revision: 19 },
      ),
    ],
    ['Findings out of sequence', foundDetail([major, minor])],
    [
      'Findings numbered out of their creation order',
      foundDetail([
        { ...major, sequence: 1 },
        { ...minor, sequence: 2 },
      ]),
    ],
    ['a sequence gap', foundDetail([minor, { ...major, sequence: 3 }])],
    [
      'two Findings with one identifier',
      foundDetail([minor, { ...major, id: 'finding-1' }]),
    ],
    [
      'a record beyond the Case revision',
      foundDetail([
        minor,
        {
          ...major,
          status: 'awaiting_plan_judgment',
          records: [
            ...majorRecords,
            findingRecord('response', 19, nonconformityResponse()),
          ],
        },
      ]),
    ],
    [
      'a record at the revision of a step version',
      withMinorRecords([
        minorStatementRecord,
        minorClassificationRecord,
        findingRecord('response', 12, nonconformityResponse()),
        findingRecord('plan_judgment', 14, judged('adequate')),
        findingRecord('verification', 15, verified('effective')),
      ]),
    ],
    [
      'two Findings recorded at one revision',
      withMinorRecords([
        ...minorRecords.slice(0, 4),
        findingRecord('verification', 17, verified('effective')),
      ]),
    ],
    [
      'creation records at two revisions',
      stage1Findings([
        {
          ...opportunity,
          records: [
            opportunity.records[0],
            { ...opportunity.records[1], caseRevision: 12 },
          ],
        },
      ]),
    ],
    [
      'a creation without its classification',
      withMinorRecords([
        minorStatementRecord,
        findingRecord('statement', 11, minorStatement, { version: 2 }),
      ]),
    ],
    [
      'a later record before the previous one',
      stage1Findings(
        [
          {
            ...reclassified,
            statement: { ...concernStatement, statement: 'Corrected.' },
            records: [
              reclassified.records[0],
              reclassified.records[1],
              findingRecord(
                'statement',
                13,
                { ...concernStatement, statement: 'Corrected.' },
                { version: 2, reason: 'Wording corrected.' },
              ),
              reclassified.records[2],
            ],
          },
        ],
        { revision: 13 },
      ),
    ],
    [
      'a version that skips',
      withMinorRecords([
        minorStatementRecord,
        minorClassificationRecord,
        { ...response, version: 2 },
        ...minorRecords.slice(3),
      ]),
    ],
    [
      'a first statement with a reason',
      withMinorRecords([
        { ...minorStatementRecord, reason: 'Not a correction' },
        ...minorRecords.slice(1),
      ]),
    ],
    [
      'a corrected statement without its reason',
      stage1Findings([
        {
          ...opportunity,
          statement: { ...opportunityStatement, statement: 'Corrected.' },
          records: [
            ...opportunity.records,
            findingRecord(
              'statement',
              12,
              { ...opportunityStatement, statement: 'Corrected.' },
              { version: 2 },
            ),
          ],
        },
      ]),
    ],
    [
      'a first classification by the approver',
      withMinorRecords([
        minorStatementRecord,
        findingRecord(
          'classification',
          11,
          classified('minor_nonconformity', 'approver'),
        ),
        ...minorRecords.slice(2),
      ]),
    ],
    [
      'a classification by an unknown author',
      withMinorRecords([
        minorStatementRecord,
        findingRecord(
          'classification',
          11,
          classified('minor_nonconformity', 'client'),
        ),
        ...minorRecords.slice(2),
      ]),
    ],
    [
      'a response with a correction reason',
      withMinorRecords([
        minorStatementRecord,
        minorClassificationRecord,
        { ...response, reason: 'Not a correction' },
        ...minorRecords.slice(3),
      ]),
    ],
    [
      'an unknown record kind',
      withMinorRecords([
        ...minorRecords,
        findingRecord('closure', 17, { closed: true }),
      ]),
    ],
    [
      'a response without its cause',
      withMinorRecords([
        minorStatementRecord,
        minorClassificationRecord,
        findingRecord('response', 13, nonconformityResponse({ cause: ' ' })),
        ...minorRecords.slice(3),
      ]),
    ],
    [
      'a response with an invalid received date',
      withMinorRecords([
        minorStatementRecord,
        minorClassificationRecord,
        findingRecord(
          'response',
          13,
          nonconformityResponse({ receivedOn: '2026-02-30' }),
        ),
        ...minorRecords.slice(3),
      ]),
    ],
    [
      'an unknown plan outcome',
      withMinorRecords([
        ...minorRecords.slice(0, 3),
        findingRecord('plan_judgment', 14, judged('partial')),
        minorRecords[4],
      ]),
    ],
    [
      'an unknown verification method',
      withMinorRecords([
        ...minorRecords.slice(0, 4),
        findingRecord('verification', 15, {
          ...verified('effective'),
          method: 'telephone',
        }),
      ]),
    ],
    [
      'the same evidence cited twice',
      withMajorStatement({
        ...majorStatement,
        evidenceAttachmentIds: ['evidence-2', 'evidence-2'],
      }),
    ],
    [
      'more than ten evidence references',
      withMajorStatement({
        ...majorStatement,
        evidenceAttachmentIds: Array.from(
          { length: 11 },
          (_, index) => `evidence-${String(index)}`,
        ),
      }),
    ],
    [
      'a clause beyond its limit',
      withMajorStatement({ ...majorStatement, clause: 'x'.repeat(41) }),
    ],
    [
      'a blank statement',
      withMajorStatement({ ...majorStatement, statement: '  ' }),
    ],
    [
      'the recommendation next while a major nonconformity is open',
      foundDetail([minor, major], { nextStep: 'recommendation' }),
    ],
    [
      'the follow-up next when nothing holds it',
      foundDetail([minor, majorVerified], { revision: 21 }),
    ],
  ])('fails closed on %s', (_name, value) => {
    expect(() => parseCaseDetail(value, { ...scope, caseId })).toThrow();
  });
});

const recommended = stageVersion('recommendation', 18, {
  recommendation: 'grant',
  basis: 'No nonconformity; system effectively implemented.',
});
const reviewItems = dossierReview().items;
const reviewed = stageVersion('dossier_review', 19, dossierReview());
const decided = stageVersion(
  'decision',
  20,
  certificationDecision({ decisionFormAttachmentId: 'decision-form' }),
);
const agreedData = stageVersion('certificate_data', 21, {
  texts: CERTIFICATE_TEXTS,
  agreedOn: '2026-10-21',
  agreementAttachmentId: 'data-form',
});
const certificate = {
  id: 'certificate-1',
  number: 'DEMO-0001',
  issuedOn: '2026-11-06',
  approvedDraftVersionId: 'draft-1',
  validFrom: '2026-11-06',
  validUntil: '2029-11-05',
  firstSurveillanceBy: '2027-11-06',
  texts: CERTIFICATE_TEXTS,
  signedBy: 'Decision Maker Demo',
  signedByFunction: 'Head of the certification body',
  independenceAttested: true,
  attachmentId: 'certificate-pdf',
  recordedBy: by,
  recordedAt: '2026-11-07T10:00:00.000Z',
};
const refusedDecision = stageVersion(
  'decision',
  20,
  certificationDecision({
    decision: 'refused',
    grantedTexts: null,
    rationale: 'Recommendation not to grant accepted.',
  }),
);
const negative = {
  ...recommended,
  value: { recommendation: 'do_not_grant', basis: 'Major nonconformity.' },
};
/** Stage 2 reported (17), recommended (18), reviewed (19), decided (20), agreed (21). */
function decidedDetail(overrides: Record<string, unknown> = {}) {
  return stagedDetail(allStages, {
    revision: 21,
    nextStep: 'certificate',
    recommendation: recommended,
    dossierReview: reviewed,
    decision: decided,
    certificateData: agreedData,
    ...overrides,
  });
}
/** Drafted (22), opinion skipped (23), draft approved (24). */
const releaseVersion = (
  id: string,
  caseRevision: number,
  value: Record<string, unknown>,
) => ({
  id,
  version: 1,
  caseRevision,
  reason: null,
  recordedBy: by,
  recordedAt: `2026-11-07T09:${String(caseRevision)}:00.000Z`,
  value,
});
const issuedRelease = {
  ...noRelease,
  currentRevisionIndex: 0,
  validity: {
    validFrom: '2026-11-06',
    validUntil: '2029-11-05',
    firstSurveillanceBy: '2027-11-06',
  },
  drafts: [
    releaseVersion('draft-1', 22, {
      attachmentId: 'certificate-draft-pdf',
      number: 'DEMO-0001',
      decisionVersionId: decided.id,
      certificateDataVersionId: agreedData.id,
      draftedOn: '2026-11-06',
    }),
  ],
  opinions: [
    releaseVersion('opinion-1', 23, {
      draftVersionId: 'draft-1',
      businessDate: '2026-11-06',
      outcome: 'skipped',
      skipReason: 'texts_already_agreed',
      note: null,
    }),
  ],
  approvals: [
    releaseVersion('approval-1', 24, {
      draftVersionId: 'draft-1',
      approvedOn: '2026-11-06',
      textsConfirmed: true,
      numberConfirmed: true,
      validityConfirmed: true,
      independenceAttested: true,
      onBehalf: null,
    }),
  ],
  currentDraftId: 'draft-1',
  approvalBlockers: [],
  issuanceBlockers: [],
  daysSinceIssuance: 1,
};
/** The approved draft issued at 25. */
function certifiedDetail(
  certified: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
) {
  return decidedDetail({
    status: 'certified',
    revision: 25,
    nextStep: null,
    certificate: { ...certificate, ...certified },
    release: issuedRelease,
    ...overrides,
  });
}
function refusedDetail(overrides: Record<string, unknown> = {}) {
  return stagedDetail(allStages, {
    status: 'refused',
    revision: 20,
    nextStep: null,
    recommendation: negative,
    dossierReview: reviewed,
    decision: refusedDecision,
    ...overrides,
  });
}
/** Recommended (18) and reviewed (19) with these items, the decision next. */
function reviewedDetail(items: Record<string, unknown> = reviewItems) {
  return stagedDetail(allStages, {
    revision: 19,
    nextStep: 'decision',
    recommendation: recommended,
    dossierReview: { ...reviewed, value: { ...reviewed.value, items } },
  });
}
/** An undecided Case whose read omits the decision field instead of null. */
function withoutDecisionField() {
  return Object.fromEntries(
    Object.entries(reviewedDetail()).filter(([key]) => key !== 'decision'),
  );
}

describe('Certification recommendation, decision and Certificate parsers', () => {
  it('reads the recommendation, the review, a granting decision and the agreed data with every exact value', () => {
    const parsed = parseCaseDetail(decidedDetail(), { ...scope, caseId });
    expect(parsed.status).toBe('open');
    expect(parsed.nextStep).toBe('certificate');
    expect(parsed.recommendation?.value).toEqual({
      recommendation: 'grant',
      basis: 'No nonconformity; system effectively implemented.',
      recommendedOn: null,
    });
    expect(parsed.dossierReview?.value).toEqual(dossierReview());
    expect(parsed.decision?.value).toEqual(
      certificationDecision({ decisionFormAttachmentId: 'decision-form' }),
    );
    expect(parsed.certificateData?.value).toEqual({
      texts: CERTIFICATE_TEXTS,
      agreedOn: '2026-10-21',
      agreementAttachmentId: 'data-form',
    });
    expect(parsed.certificate).toBeNull();
  });

  it('reads each next step of the closing steps as the server derives it', () => {
    const next = (overrides: Record<string, unknown>) =>
      parseCaseDetail(stagedDetail(allStages, overrides), { ...scope, caseId })
        .nextStep;
    expect(
      next({
        revision: 18,
        nextStep: 'certificate_data',
        recommendation: recommended,
      }),
    ).toBe('certificate_data');
    expect(
      next({
        revision: 19,
        nextStep: 'certificate_data',
        recommendation: recommended,
        dossierReview: reviewed,
      }),
    ).toBe('certificate_data');
    expect(
      next({
        revision: 20,
        nextStep: 'certificate_data',
        recommendation: recommended,
        dossierReview: reviewed,
        decision: decided,
      }),
    ).toBe('certificate_data');
    // The data may be agreed once Stage 2 is reported, before the decision.
    expect(
      next({
        revision: 21,
        nextStep: 'decision',
        recommendation: recommended,
        dossierReview: reviewed,
        certificateData: agreedData,
      }),
    ).toBe('decision');
  });

  it('reads a certified Case with its Certificate and the validity the server computed', () => {
    const parsed = parseCaseDetail(certifiedDetail(), { ...scope, caseId });
    expect(parsed.status).toBe('certified');
    expect(parsed.nextStep).toBeNull();
    expect(parsed.certificate).toEqual(certificate);
    expect(
      parseCaseDetail(
        certifiedDetail({ signedBy: null, signedByFunction: null }),
        { ...scope, caseId },
      ).certificate,
    ).toMatchObject({ signedBy: null, signedByFunction: null });
    for (const independenceAttested of [false, undefined, 'yes'])
      expect(() =>
        parseCaseDetail(certifiedDetail({ independenceAttested }), {
          ...scope,
          caseId,
        }),
      ).toThrow();
  });

  it('rejects a Certificate without its issue date or approved draft', () => {
    for (const missing of [
      { issuedOn: null },
      { issuedOn: undefined },
      { approvedDraftVersionId: null },
      { approvedDraftVersionId: undefined },
      { issuedOn: null, approvedDraftVersionId: null },
    ])
      expect(() =>
        parseCaseDetail(certifiedDetail(missing), { ...scope, caseId }),
      ).toThrow();
  });

  it('rejects a Case read without its release or the release revision fields', () => {
    for (const value of [decidedDetail(), certifiedDetail()]) {
      expect(parseCaseDetail(value, { ...scope, caseId }).release).toEqual(
        value.release,
      );
      const { release, ...withoutRelease } = value;
      expect(() =>
        parseCaseDetail(withoutRelease, { ...scope, caseId }),
      ).toThrow();
      for (const field of [
        'revisions',
        'currentRevisionIndex',
        'revisionRequired',
      ])
        expect(() =>
          parseCaseDetail(
            {
              ...value,
              release: Object.fromEntries(
                Object.entries(release).filter(([key]) => key !== field),
              ),
            },
            { ...scope, caseId },
          ),
        ).toThrow();
    }
  });

  it('reads a refusal that closes the Case', () => {
    const parsed = parseCaseDetail(refusedDetail(), { ...scope, caseId });
    expect(parsed.status).toBe('refused');
    expect(parsed.nextStep).toBeNull();
    expect(parsed.decision?.value).toMatchObject({
      decision: 'refused',
      grantedTexts: null,
    });
  });

  it('reads the closing step versions of the timeline and the new attachment roles', () => {
    const corrected = stageVersion(
      'recommendation',
      22,
      { recommendation: 'grant', basis: 'Basis completed.' },
      { version: 2, reason: 'Basis completed after the closing meeting.' },
    );
    const entries = parseTimeline(
      {
        caseId,
        entries: [
          stage2Reported,
          recommended,
          reviewed,
          decided,
          agreedData,
          corrected,
        ],
      },
      caseId,
    ).entries;
    expect(entries.map((entry) => [entry.step, entry.version])).toEqual([
      ['stage_2_report', 1],
      ['recommendation', 1],
      ['dossier_review', 1],
      ['decision', 1],
      ['certificate_data', 1],
      ['recommendation', 2],
    ]);
    expect(entries.at(-1)?.reason).toBe(
      'Basis completed after the closing meeting.',
    );
    expect(
      parseDocumentRegister(
        {
          caseId,
          items: [
            attachmentRow({ role: 'decision_form' }),
            { ...questionnaireRow, role: 'certificate_data' },
          ],
        },
        caseId,
      ).items.map((item) => item.role),
    ).toEqual(['decision_form', 'certificate_data']);
  });

  it.each([
    ['an open Case without the closing step fields', withoutDecisionField()],
    ['an unknown status', decidedDetail({ status: 'issued' })],
    ['an unknown next step', decidedDetail({ nextStep: 'issue' })],
    ['the decision next once decided', decidedDetail({ nextStep: 'decision' })],
    [
      'an unknown recommendation',
      decidedDetail({
        recommendation: {
          ...recommended,
          value: { ...recommended.value, recommendation: 'maybe' },
        },
      }),
    ],
    [
      'a first recommendation with a reason',
      decidedDetail({ recommendation: { ...recommended, reason: 'Why.' } }),
    ],
    [
      'a recommendation before the Stage 2 report',
      decidedDetail({ recommendation: { ...recommended, caseRevision: 16 } }),
    ],
    [
      'a dossier review missing an item',
      reviewedDetail(
        Object.fromEntries(
          Object.entries(reviewItems).filter(
            ([item]) => item !== 'certificate_data',
          ),
        ),
      ),
    ],
    [
      'a dossier review with an unknown item',
      reviewedDetail({
        ...reviewItems,
        laboratory: { answer: 'present', note: null },
      }),
    ],
    [
      'a missing dossier item without its note',
      reviewedDetail({
        ...reviewItems,
        participant_lists: { answer: 'missing', note: null },
      }),
    ],
    [
      'an unknown dossier answer',
      reviewedDetail({
        ...reviewItems,
        agreement: { answer: 'partly', note: null },
      }),
    ],
    [
      'a dossier review before the recommendation',
      decidedDetail({
        recommendation: { ...recommended, caseRevision: 19 },
        dossierReview: { ...reviewed, caseRevision: 18 },
      }),
    ],
    [
      'a decision before its dossier review',
      decidedDetail({
        dossierReview: { ...reviewed, caseRevision: 20 },
        decision: { ...decided, caseRevision: 19 },
      }),
    ],
    [
      'a decision on an incomplete dossier review',
      decidedDetail({
        dossierReview: {
          ...reviewed,
          value: dossierReview('participant_lists'),
        },
      }),
    ],
    [
      'a granting decision against a recommendation not to grant',
      decidedDetail({ recommendation: negative }),
    ],
    [
      'a second decision version',
      decidedDetail({ decision: { ...decided, version: 2 } }),
    ],
    [
      'a decision with a correction reason',
      decidedDetail({ decision: { ...decided, reason: 'Changed.' } }),
    ],
    [
      'a decision without the independence attestation',
      decidedDetail({
        decision: {
          ...decided,
          value: { ...decided.value, independenceAttested: false },
        },
      }),
    ],
    [
      'a granting decision without texts',
      decidedDetail({
        decision: {
          ...decided,
          value: { ...decided.value, grantedTexts: null },
        },
      }),
    ],
    [
      'a refusing decision with texts',
      refusedDetail({
        decision: {
          ...refusedDecision,
          value: { ...refusedDecision.value, grantedTexts: CERTIFICATE_TEXTS },
        },
      }),
    ],
    [
      'Certificate texts with the same language twice',
      decidedDetail({
        certificateData: {
          ...agreedData,
          value: {
            ...agreedData.value,
            texts: [CERTIFICATE_TEXTS[0], CERTIFICATE_TEXTS[0]],
          },
        },
      }),
    ],
    [
      'more than four Certificate texts',
      decidedDetail({
        certificateData: {
          ...agreedData,
          value: {
            ...agreedData.value,
            texts: ['ro', 'en', 'fr', 'ru', 'de'].map((language) => ({
              ...CERTIFICATE_TEXTS[1],
              language,
            })),
          },
        },
      }),
    ],
    [
      'Certificate data before the Stage 2 report',
      decidedDetail({ certificateData: { ...agreedData, caseRevision: 16 } }),
    ],
    [
      'a closing step at the revision of another step',
      decidedDetail({ certificateData: { ...agreedData, caseRevision: 20 } }),
    ],
    [
      'a Certificate on an open Case',
      certifiedDetail({}, { status: 'open', nextStep: 'certificate' }),
    ],
    [
      'a certified Case without its Certificate',
      decidedDetail({ status: 'certified', revision: 22, nextStep: null }),
    ],
    [
      'a Certificate valid from another date than the decision',
      certifiedDetail({ validFrom: '2026-11-07' }),
    ],
    [
      'a Certificate valid until before its first surveillance',
      certifiedDetail({ validUntil: '2027-11-05' }),
    ],
    [
      'a first surveillance before the validity starts',
      certifiedDetail({ firstSurveillanceBy: '2026-11-01' }),
    ],
    [
      'a recommendation version after the decision',
      decidedDetail({
        revision: 22,
        recommendation: {
          ...recommended,
          version: 2,
          reason: 'Changed after the decision.',
          caseRevision: 22,
        },
      }),
    ],
    [
      'a Certificate stating other texts than the agreed data without a required revision',
      certifiedDetail({ texts: [CERTIFICATE_TEXTS[0]] }),
    ],
    [
      'a Certificate stating texts the decision did not grant without a required revision',
      certifiedDetail(
        { texts: [CERTIFICATE_TEXTS[1]] },
        {
          certificateData: {
            ...agreedData,
            value: { ...agreedData.value, texts: [CERTIFICATE_TEXTS[1]] },
          },
        },
      ),
    ],
    [
      'a Certificate issued before its validity starts',
      certifiedDetail({ issuedOn: '2026-11-05' }),
    ],
    [
      'a Certificate issued from a draft the release does not hold',
      certifiedDetail({ approvedDraftVersionId: 'draft-2' }),
    ],
    [
      'a Certificate without a recorded release',
      certifiedDetail({}, { release: noRelease }),
    ],
    ['a Certificate without its number', certifiedDetail({ number: ' ' })],
    [
      'a refused Case with a Certificate',
      certifiedDetail(
        {},
        {
          status: 'refused',
          recommendation: negative,
          decision: refusedDecision,
        },
      ),
    ],
    [
      'a refused Case whose decision grants',
      refusedDetail({ recommendation: recommended, decision: decided }),
    ],
    [
      'an open Case with a refusing decision',
      refusedDetail({ status: 'open', nextStep: 'certificate_data' }),
    ],
  ])('fails closed on %s', (_name, value) => {
    expect(() => parseCaseDetail(value, { ...scope, caseId })).toThrow();
  });

  it('reads the server’s unmet decision preconditions and fails closed on an unknown one', () => {
    expect(
      parseDecisionFailures([
        'DOSSIER_REVIEW_INCOMPLETE',
        'DECISION_IN_FUTURE',
      ]),
    ).toEqual(['DOSSIER_REVIEW_INCOMPLETE', 'DECISION_IN_FUTURE']);
    expect(
      parseDecisionFailures(['DECISION_IN_FUTURE', 'MOON_PHASE']),
    ).toBeUndefined();
    expect(parseDecisionFailures([])).toBeUndefined();
    expect(
      parseDecisionFailures(['FINDINGS_OPEN', 'FINDINGS_OPEN']),
    ).toBeUndefined();
    expect(parseDecisionFailures(undefined)).toBeUndefined();
  });
});

const act = actedFor({ formAttachmentId: 'signed-form' });
const toVerify = teamMember({
  declarations: { ...NO_CONFLICT, noConsultancy: 'to_verify' },
  conflictNote: 'Possible link with the named consultant.',
});
const analysis = {
  note: 'Links between Advisory Demo and the team were checked.',
  evidenceAttachmentIds: ['evidence-1'],
};
const approvedToVerify = teamedDetail({
  revision: 8,
  nextStep: 'stage_1_plan',
  team: { ...team, value: { members: [toVerify] } },
  teamDecision: approvedFirst,
});
const correctedDecision = stageVersion(
  'decision',
  22,
  certificationDecision({ grantedTexts: [CERTIFICATE_TEXTS[0]] }),
  { version: 2, reason: 'The English text is not part of the decision.' },
);
function withAct(value: unknown) {
  return durationDetail({ onBehalf: value });
}
function withAnalysis(value: unknown) {
  return teamedDetail({
    team: {
      ...team,
      value: { members: [toVerify], impartialityAnalysis: value },
    },
  });
}

describe('Certification acts on behalf and impartiality parsers', () => {
  it('reads acts on behalf, attestations, business dates and the impartiality analysis', () => {
    const facts = lactisFacts({
      haccpStudyCount: 3,
      totalHeadcount: 125,
      effectiveFte: 120,
      submittedOn: '2026-10-01',
    });
    const actedCase = parseCaseDetail(
      durationDetail(
        { onBehalf: act },
        {
          application: { ...application, value: facts },
          applicationReview: {
            ...review,
            value: { ...review.value, onBehalf: act },
          },
        },
      ),
      { ...scope, caseId },
    );
    expect(actedCase.application?.value.submittedOn).toBe('2026-10-01');
    expect(actedCase.applicationReview?.value.onBehalf).toEqual(act);
    expect(actedCase.duration?.value.onBehalf).toEqual(act);

    const decidedOnTeam = parseCaseDetail(
      teamedDetail({
        revision: 8,
        nextStep: 'team',
        team: {
          ...team,
          value: { members: [toVerify], impartialityAnalysis: analysis },
        },
        teamDecision: {
          ...returned,
          value: {
            ...returned.value,
            onBehalf: act,
            independenceAttested: true,
          },
        },
      }),
      { ...scope, caseId },
    );
    expect(decidedOnTeam.team?.value).toEqual({
      members: [toVerify],
      impartialityAnalysis: analysis,
    });
    expect(decidedOnTeam.teamDecision?.value).toEqual({
      ...returned.value,
      onBehalf: act,
      independenceAttested: true,
    });

    const approver = actedFor({ actedBy: 'Approver Demo' });
    const closing = parseCaseDetail(
      decidedDetail({
        stages: [
          stage1Planned,
          stage1Ready,
          stage2Planned,
          {
            ...stage2Reported,
            value: { ...stage2Reported.value, certificationBodyApproval: act },
          },
        ],
        recommendation: {
          ...recommended,
          value: { ...recommended.value, recommendedOn: '2026-11-22' },
        },
        dossierReview: {
          ...reviewed,
          value: { ...reviewed.value, reviewedBy: act, approvedBy: approver },
        },
      }),
      { ...scope, caseId },
    );
    expect(closing.stage2Report?.value.certificationBodyApproval).toEqual(act);
    expect(closing.recommendation?.value.recommendedOn).toBe('2026-11-22');
    expect(closing.dossierReview?.value).toMatchObject({
      reviewedBy: act,
      approvedBy: approver,
      independenceAttested: true,
    });
  });

  it('reads first-format boolean declarations and records made before the new fields', () => {
    const parsed = parseCaseDetail(
      withMembers([
        teamMember({
          declarations: {
            noConsultancy: false,
            noEmployment: true,
            noManagementInvolvement: true,
            confidentiality: true,
          },
          conflictNote: 'Delivered a training to the client last year.',
        }),
      ]),
      { ...scope, caseId },
    );
    expect(parsed.team?.value).toEqual({
      members: [
        teamMember({
          declarations: { ...NO_CONFLICT, noConsultancy: 'conflict' },
          conflictNote: 'Delivered a training to the client last year.',
        }),
      ],
      impartialityAnalysis: null,
    });
    const earlier = parseCaseDetail(
      decidedDetail({
        dossierReview: {
          ...reviewed,
          value: { items: reviewItems, conclusion: 'Complete.' },
        },
      }),
      { ...scope, caseId },
    );
    expect(earlier.dossierReview?.value).toMatchObject({
      reviewedBy: null,
      approvedBy: null,
      independenceAttested: false,
    });
    expect(earlier.application?.value.submittedOn).toBeNull();
    expect(earlier.applicationReview?.value.onBehalf).toBeNull();
  });

  it('reads a decision correction that keeps the outcome, with its reason and its versions', () => {
    const parsed = parseCaseDetail(
      decidedDetail({ revision: 22, decision: correctedDecision }),
      { ...scope, caseId },
    );
    expect(parsed.decision).toMatchObject({
      version: 2,
      reason: 'The English text is not part of the decision.',
      value: { decision: 'granted', grantedTexts: [CERTIFICATE_TEXTS[0]] },
    });
    expect(
      parseTimeline(
        { caseId, entries: [decided, agreedData, correctedDecision] },
        caseId,
      ).entries.map((entry) => [entry.step, entry.version]),
    ).toEqual([
      ['decision', 1],
      ['certificate_data', 1],
      ['decision', 2],
    ]);
  });

  it('fails closed on a timeline whose correction changes the decided outcome', () => {
    expect(() =>
      parseTimeline(
        {
          caseId,
          entries: [
            decided,
            {
              ...correctedDecision,
              value: certificationDecision({
                decision: 'refused',
                grantedTexts: null,
              }),
            },
          ],
        },
        caseId,
      ),
    ).toThrow();
  });

  it.each([
    [
      'an act with an impossible date',
      withAct(actedFor({ actedOn: '2026-02-30' })),
    ],
    [
      'an act without the function',
      withAct(actedFor({ actedByFunction: ' ' })),
    ],
    [
      'an act with a name beyond its limit',
      withAct(actedFor({ actedBy: 'x'.repeat(201) })),
    ],
    [
      'an act without its date',
      withAct({ actedBy: 'Head of Body Demo', actedByFunction: 'Head' }),
    ],
    ['an act that is a name only', withAct('Head of Body Demo')],
    [
      'an act citing a blank form',
      withAct(actedFor({ formAttachmentId: ' ' })),
    ],
    [
      'an attestation that is not a boolean',
      teamedDetail({
        revision: 8,
        nextStep: 'team',
        teamDecision: {
          ...returned,
          value: { ...returned.value, independenceAttested: 'yes' },
        },
      }),
    ],
    [
      'an unknown declaration state',
      withMembers([
        teamMember({
          declarations: { ...NO_CONFLICT, noConsultancy: 'maybe' },
        }),
      ]),
    ],
    [
      'a declaration to verify without its description',
      withMembers([{ ...toVerify, conflictNote: null }]),
    ],
    ['an approval of a team with a declaration to verify', approvedToVerify],
    [
      'an analysis without its note',
      withAnalysis({ note: ' ', evidenceAttachmentIds: [] }),
    ],
    [
      'an analysis citing one attachment twice',
      withAnalysis({
        ...analysis,
        evidenceAttachmentIds: ['evidence-1', 'evidence-1'],
      }),
    ],
    [
      'an analysis citing more than ten attachments',
      withAnalysis({
        ...analysis,
        evidenceAttachmentIds: Array.from(
          { length: 11 },
          (_, index) => 'evidence-' + String(index),
        ),
      }),
    ],
    [
      'an analysis without its evidence list',
      withAnalysis({ note: 'Checked.' }),
    ],
    [
      'an application date that is not a calendar date',
      detail({
        application: {
          ...application,
          value: lactisFacts({ submittedOn: '2026-13-01' }),
        },
      }),
    ],
    [
      'a recommendation date that is not a calendar date',
      decidedDetail({
        recommendation: {
          ...recommended,
          value: { ...recommended.value, recommendedOn: 'yesterday' },
        },
      }),
    ],
    [
      'a dossier review with a malformed approver',
      decidedDetail({
        dossierReview: {
          ...reviewed,
          value: {
            ...reviewed.value,
            approvedBy: { actedBy: 'Approver Demo' },
          },
        },
      }),
    ],
    [
      'a decision correction without its reason',
      decidedDetail({
        revision: 22,
        decision: { ...correctedDecision, reason: null },
      }),
    ],
    [
      'a first decision with a reason',
      decidedDetail({ decision: { ...decided, reason: 'Not a correction.' } }),
    ],
  ])('fails closed on %s', (_name, value) => {
    expect(() => parseCaseDetail(value, { ...scope, caseId })).toThrow();
  });
});
