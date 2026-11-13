import { describe, expect, it } from 'vitest';
import {
  CONSISTENCY_RULE_SET_VERSION,
  addressNumbers,
  checkConsistency,
  consistencySection,
  type ConsistencyInput,
  type ConsistencySnapshot,
  type ManualDiscrepancyRecord,
  type ResolutionRecord,
  type RuleDiscrepancy,
} from './certification-consistency.js';
import type {
  CertificateText,
  DossierItem,
  DossierReview,
} from './certification-decision.js';
import type {
  DeadlineDays,
  ExchangeRecordVersion,
} from './certification-exchanges.js';
import { blockingDiscrepancies } from './certification-consistency.js';
import type {
  ApplicationFacts,
  CertificationAttachment,
  CertificationStepVersion,
  DurationDetermination,
} from './certification.types.js';

/**
 * The fictional Lactis Demo SRL Case of the dossier control PRD §8: 40
 * employees, subcategory CI, 2 HACCP studies, one site, a confirmed duration
 * of 3 on-site auditor-days (1 for Stage 1, 2 for Stage 2), Ion Popa leading
 * with Expert Demo as technical expert. Every value is fictional.
 */
const MANAGER = {
  workspaceMembershipId: 'manager',
  displayName: 'Ada Ionescu',
};
const APPROVER = {
  workspaceMembershipId: 'approver',
  displayName: 'Workspace Owner',
};
const ADDRESS = 'Str. Exemplu 1, Demo City';
const TEXT: CertificateText = {
  language: 'ro',
  holderName: 'Lactis Demo SRL',
  address: ADDRESS,
  scope: 'Producerea laptelui pasteurizat (exemplu)',
};

function facts(overrides: Partial<ApplicationFacts> = {}): ApplicationFacts {
  return {
    submittedOn: null,
    declaredLegalName: 'Lactis Demo SRL',
    declaredAddress: ADDRESS,
    sites: [{ address: ADDRESS, activity: 'Dairy plant' }],
    requestedScope: 'Production of pasteurised milk and yoghurt',
    foodChainSubcategories: ['CI'],
    haccpStudyCount: 2,
    totalHeadcount: 40,
    effectiveFte: 40,
    shiftCount: 1,
    seasonalActivity: null,
    otherCertifiedSystems: null,
    outsourcedProcesses: null,
    consultant: { used: false },
    auditLanguages: ['ro'],
    preferredAuditPeriod: null,
    ...overrides,
  };
}

function duration(
  overrides: {
    effectiveFte?: number;
    reductions?: DurationDetermination['inputs']['reductions'];
    confirmed?: Partial<DurationDetermination['confirmed']>;
    initialOnSite?: string;
  } = {},
): DurationDetermination {
  const initial = overrides.initialOnSite ?? '3';
  return {
    ruleVersion: 'iso22000-basic-2026-11',
    inputs: {
      primary: 'CI',
      haccpStudies: { CI: 2 },
      increases: {},
      reductions: overrides.reductions ?? {},
      subcategories: ['CI'],
      effectiveFte: overrides.effectiveFte ?? 40,
    },
    computation: {
      kind: 'proposal',
      proposal: {
        ruleVersion: 'iso22000-basic-2026-11',
        basicTime: '2',
        haccpTime: '0.5',
        fteTime: '0.5',
        baseDays: initial,
        netAdjustmentPercent: 0,
        initialOnSite: initial,
        initialTotal: '3.6',
        stage1OnSite: '1',
        stage2OnSite: '2',
        surveillanceOnSite: '0.999',
        surveillanceTotal: '1.1988',
        recertificationOnSite: '1.998',
        recertificationTotal: '2.3976',
        warnings: [],
      },
    },
    confirmed: {
      initialOnSite: initial,
      stage1OnSite: '1',
      stage2OnSite: '2',
      surveillanceOnSite: '1',
      recertificationOnSite: '2',
      ...overrides.confirmed,
    },
    justification: null,
    onBehalf: null,
  };
}

function plan(
  attachmentId: string,
  start: string,
  end: string,
  onSiteDays: string,
  deviationNote: string | null = null,
) {
  return {
    startDate: start,
    endDate: end,
    onSiteDays,
    remoteDays: '0',
    objectives: 'Fictional objectives',
    scope: 'Fictional scope',
    planAttachmentId: attachmentId,
    sentToClientOn: null,
    deviationNote,
  };
}

const MEMBER = {
  holdsCategory: true,
  competenceNote: 'Fictional competence',
  declarations: {
    noConsultancy: 'confirmed',
    noEmployment: 'confirmed',
    noManagementInvolvement: 'confirmed',
    confidentiality: 'confirmed',
  },
  conflictNote: null,
} as const;

type StepInput = {
  [S in CertificationStepVersion['step']]: {
    step: S;
    value: Extract<CertificationStepVersion, { step: S }>['value'];
  };
}[CertificationStepVersion['step']];

/** Builds the recorded versions in Case order, from revision 2. */
class CaseBuilder {
  steps: CertificationStepVersion[] = [];
  attachments: CertificationAttachment[] = [];
  exchanges: ExchangeRecordVersion[] = [];
  deadlineDays: DeadlineDays | null = null;
  revision = 1;

  /** Records an Exchange Record, or corrects record `sequence`. */
  exchange(
    value: Partial<
      Pick<
        ExchangeRecordVersion,
        | 'direction'
        | 'itemKind'
        | 'counterpart'
        | 'businessDate'
        | 'channel'
        | 'reference'
        | 'attachmentIds'
      >
    >,
    sequence?: number,
  ) {
    this.revision += 1;
    const number =
      sequence ??
      Math.max(0, ...this.exchanges.map((entry) => entry.sequence)) + 1;
    const version =
      this.exchanges.filter((entry) => entry.sequence === number).length + 1;
    this.exchanges.push({
      id: `exchange-${String(number)}-${String(version)}`,
      sequence: number,
      version,
      caseRevision: this.revision,
      direction: 'sent',
      itemKind: 'stage_plan',
      counterpart: { kind: 'client', name: 'Lactis Demo SRL, quality manager' },
      businessDate: '2026-09-19',
      channel: 'email',
      reference: null,
      note: null,
      attachmentIds: [],
      reason: version > 1 ? 'Fictional correction' : null,
      recordedBy: MANAGER,
      recordedAt: `2026-10-03T00:00:${String(this.revision).padStart(2, '0')}.000Z`,
      ...value,
    });
    return this;
  }

  attach(
    role: CertificationAttachment['role'],
    documentId: string,
    number = 1,
  ) {
    this.revision += 1;
    const id = `${documentId}-v${String(number)}`;
    this.attachments.push({
      id,
      caseRevision: this.revision,
      role,
      documentId,
      versionId: `${id}-version`,
      representationId: `${id}-pdf`,
      versionNumber: number,
      sourceTitle: `Fictional ${documentId}`,
      fileName: `${documentId}.pdf`,
      sizeBytes: 10,
      sha256: 'a'.repeat(64),
      note: null,
      attachedBy: MANAGER,
      attachedAt: `2026-10-01T00:00:${String(this.revision).padStart(2, '0')}.000Z`,
    });
    return id;
  }

  record(input: StepInput & { reason?: string }) {
    this.revision += 1;
    const version =
      this.steps.filter((entry) => entry.step === input.step).length + 1;
    const { reason, ...entry } = input;
    this.steps.push({
      ...entry,
      id: `${input.step}-${String(version)}`,
      version,
      caseRevision: this.revision,
      reason: version > 1 ? (reason ?? 'Fictional correction') : null,
      recordedBy: MANAGER,
      recordedAt: `2026-10-02T00:00:${String(this.revision).padStart(2, '0')}.000Z`,
    });
    return this;
  }

  snapshot(): ConsistencySnapshot {
    return {
      steps: this.steps,
      attachments: this.attachments,
      findings: [],
      certificate: null,
      exchanges: this.exchanges,
      deadlineDays: this.deadlineDays,
    };
  }
}

const S1 = '2026-10-01';
const S2_START = '2026-10-20';

/** Application, review, duration, agreement, approved team and both plans. */
function plannedCase(
  options: { stage2End?: string; stage2Days?: string } = {},
) {
  const builder = new CaseBuilder();
  builder.record({ step: 'application', value: facts() });
  builder.record({
    step: 'application_review',
    value: {
      criteria: {
        scopeCertifiable: { answer: 'yes', note: 'ok' },
        competentTeamAvailable: { answer: 'yes', note: 'ok' },
        competentDecisionMakerAvailable: { answer: 'yes', note: 'ok' },
        risksAcceptable: { answer: 'yes', note: 'ok' },
      },
      onBehalf: null,
      outcome: 'accepted',
      rejectionReason: null,
    },
  });
  builder.record({ step: 'duration', value: duration() });
  const agreement = builder.attach('agreement', 'agreement');
  builder.record({
    step: 'agreement',
    value: { signedOn: '2026-09-15', attachmentId: agreement },
  });
  builder.record({
    step: 'team',
    value: {
      members: [
        {
          ...MEMBER,
          name: 'Ion Popa',
          role: 'team_leader',
          workspaceMembershipId: 'auditor',
        },
        {
          ...MEMBER,
          name: 'Expert Demo',
          role: 'technical_expert',
          workspaceMembershipId: null,
        },
      ],
      impartialityAnalysis: null,
    },
  });
  builder.record({
    step: 'team_decision',
    value: {
      teamVersion: 1,
      onBehalf: null,
      independenceAttested: true,
      decision: 'approved',
      reason: null,
    },
  });
  const plan1 = builder.attach('plan', 'plan-1');
  builder.record({ step: 'stage_1_plan', value: plan(plan1, S1, S1, '1') });
  const plan2 = builder.attach('plan', 'plan-2');
  builder.record({
    step: 'stage_2_plan',
    value: plan(
      plan2,
      S2_START,
      options.stage2End ?? '2026-10-21',
      options.stage2Days ?? '2',
    ),
  });
  return builder;
}

function reportedCase(options: { reportDate?: string } = {}) {
  const builder = plannedCase();
  const report1 = builder.attach('report', 'report-1');
  builder.record({
    step: 'stage_1_report',
    value: {
      reportDate: S1,
      documentReviewCompleted: true,
      conclusion: 'ready',
      conclusionNote: 'Ready',
      reportAttachmentId: report1,
      participantListAttachmentId: null,
      certificationBodyApproval: null,
    },
  });
  const report2 = builder.attach('report', 'report-2');
  builder.record({
    step: 'stage_2_report',
    value: {
      reportDate: options.reportDate ?? '2026-10-21',
      summary: 'Done',
      reportAttachmentId: report2,
      participantListAttachmentId: null,
      annexAttachmentId: null,
      certificationBodyApproval: null,
    },
  });
  builder.record({
    step: 'recommendation',
    value: { recommendation: 'grant', basis: 'Fine', recommendedOn: null },
  });
  return builder;
}

function review(
  answers: Partial<
    Record<DossierItem, 'present' | 'missing' | 'not_applicable'>
  > = {},
  approvedOn: string | null = null,
): DossierReview {
  const of = (item: DossierItem) => {
    const answer =
      answers[item] ??
      (item === 'participant_lists' ||
      item === 'findings_follow_up' ||
      item === 'certificate_data'
        ? 'not_applicable'
        : 'present');
    return { answer, note: answer === 'missing' ? 'Fictional note' : null };
  };
  return {
    items: {
      application: of('application'),
      application_review: of('application_review'),
      duration: of('duration'),
      agreement: of('agreement'),
      team_approval: of('team_approval'),
      stage_1_plan: of('stage_1_plan'),
      stage_1_report: of('stage_1_report'),
      stage_2_plan: of('stage_2_plan'),
      stage_2_report: of('stage_2_report'),
      participant_lists: of('participant_lists'),
      findings_follow_up: of('findings_follow_up'),
      recommendation: of('recommendation'),
      certificate_data: of('certificate_data'),
    },
    conclusion: 'Fictional review',
    reviewedBy: null,
    approvedBy:
      approvedOn === null
        ? null
        : {
            actedBy: 'Head of Body Demo',
            actedByFunction: 'Head of the fictional body',
            actedOn: approvedOn,
            formAttachmentId: null,
          },
    independenceAttested: true,
  };
}

function decision(decidedOn: string, texts: CertificateText[] = [TEXT]) {
  return {
    decidedOn,
    decidedBy: 'Decision Maker Demo',
    decidedByFunction: null,
    decisionFormAttachmentId: null,
    independenceAttested: true as const,
    rationale: 'Fictional rationale',
    additionalInformation: null,
    decision: 'granted' as const,
    grantedTexts: texts,
  };
}

function only(found: RuleDiscrepancy[], rule: RuleDiscrepancy['rule']) {
  return found.filter((entry) => entry.rule === rule);
}

describe('Dossier Consistency Check rules (PRD §8.1 vectors)', () => {
  it('R01 raises the duration proposal when the headcount moves to the next band', () => {
    const builder = plannedCase();
    builder.record({
      step: 'application',
      value: facts({ totalHeadcount: 60, effectiveFte: 60 }),
      reason: 'Headcount corrected to 60',
    });
    expect(only(checkConsistency(builder.snapshot()), 'R01')).toEqual([
      expect.objectContaining({
        rule: 'R01',
        verdict: 'error',
        subject: { kind: 'duration_proposal' },
        left: expect.objectContaining({
          value: { kind: 'days', days: '3.5' },
          source: expect.objectContaining({
            kind: 'step',
            step: 'application',
            version: 2,
          }),
        }),
        right: expect.objectContaining({
          value: { kind: 'days', days: '3' },
          source: expect.objectContaining({
            kind: 'step',
            step: 'duration',
            version: 1,
          }),
        }),
      }),
    ]);
  });

  it('R01 is not raised when a correction to 45 stays in the same band', () => {
    const builder = plannedCase();
    builder.record({
      step: 'application',
      value: facts({ totalHeadcount: 45, effectiveFte: 45 }),
    });
    expect(only(checkConsistency(builder.snapshot()), 'R01')).toEqual([]);
  });

  it('R01 is closed by a new duration confirmed on the corrected application', () => {
    const builder = plannedCase();
    builder.record({
      step: 'application',
      value: facts({ totalHeadcount: 60, effectiveFte: 60 }),
    });
    builder.record({
      step: 'duration',
      value: duration({
        effectiveFte: 60,
        initialOnSite: '3.5',
        confirmed: { initialOnSite: '3' },
      }),
    });
    expect(only(checkConsistency(builder.snapshot()), 'R01')).toEqual([]);
  });

  it('R02 raises a prior-certification reduction without a declared certification', () => {
    const builder = plannedCase();
    builder.record({
      step: 'duration',
      value: duration({ reductions: { priorCertification: 10 } }),
    });
    expect(only(checkConsistency(builder.snapshot()), 'R02')).toEqual([
      expect.objectContaining({
        verdict: 'error',
        left: expect.objectContaining({
          value: { kind: 'percent', percent: 10 },
        }),
        right: expect.objectContaining({
          value: { kind: 'state', state: 'not_declared' },
        }),
      }),
    ]);
  });

  it('R02 is not raised for a declared certification with or without a capped reduction', () => {
    const builder = plannedCase();
    builder.record({
      step: 'application',
      value: facts({ otherCertifiedSystems: 'ISO 9001:2015 (fictional)' }),
    });
    expect(only(checkConsistency(builder.snapshot()), 'R02')).toEqual([]);
    builder.record({
      step: 'duration',
      value: duration({
        reductions: { priorCertification: 10, systemMaturity: 10 },
      }),
    });
    expect(only(checkConsistency(builder.snapshot()), 'R02')).toEqual([]);
  });

  it('R03 raises a Stage plan whose days differ from the share of a later duration', () => {
    const builder = plannedCase();
    builder.record({
      step: 'duration',
      value: duration({
        effectiveFte: 60,
        initialOnSite: '3.5',
        confirmed: {
          initialOnSite: '3.5',
          stage1OnSite: '1',
          stage2OnSite: '2.5',
        },
      }),
    });
    expect(only(checkConsistency(builder.snapshot()), 'R03')).toEqual([
      expect.objectContaining({
        verdict: 'error',
        subject: { kind: 'stage_share', stage: 'stage_2' },
        left: expect.objectContaining({ value: { kind: 'days', days: '2' } }),
        right: expect.objectContaining({
          value: { kind: 'days', days: '2.5' },
        }),
        justification: null,
      }),
    ]);
  });

  it('R03 shows a deviation justified against the same duration version as accepted', () => {
    const builder = plannedCase();
    const plan2 = builder.attach('plan', 'plan-2', 2);
    builder.record({
      step: 'stage_2_plan',
      value: plan(
        plan2,
        S2_START,
        '2026-10-21',
        '1.5',
        'Fictional shorter Stage 2',
      ),
    });
    const [justified] = only(checkConsistency(builder.snapshot()), 'R03');
    expect(justified).toMatchObject({
      subject: { kind: 'stage_share', stage: 'stage_2' },
      justification: {
        reason: 'Fictional shorter Stage 2',
        source: { kind: 'step', step: 'stage_2_plan', version: 2 },
      },
    });
    const section = consistencySection(input(builder));
    expect(section.open.filter((entry) => entry.rule === 'R03')).toEqual([]);
    // The unused plan Version 2 (R14) was corrected when the plan relied on it.
    expect(section.resolved.filter((entry) => entry.rule === 'R03')).toEqual([
      expect.objectContaining({
        rule: 'R03',
        resolution: expect.objectContaining({
          kind: 'accepted',
          via: 'justification',
          reason: 'Fictional shorter Stage 2',
        }),
      }),
    ]);
  });

  it('R04 raises auditor-days beyond calendar days times the leader and auditors on site', () => {
    const raised = plannedCase({ stage2End: S2_START });
    expect(only(checkConsistency(raised.snapshot()), 'R04')).toEqual([
      expect.objectContaining({
        verdict: 'to_clarify',
        subject: { kind: 'stage_capacity', stage: 'stage_2' },
        left: expect.objectContaining({ value: { kind: 'days', days: '2' } }),
        right: expect.objectContaining({
          value: { kind: 'capacity', calendarDays: 1, auditors: 1 },
        }),
      }),
    ]);
    // Two calendar days with one auditor; the technical expert never counts.
    expect(only(checkConsistency(plannedCase().snapshot()), 'R04')).toEqual([]);
  });

  it('R05 raises a decision dated before the dossier review approval, never equal or unrecorded dates', () => {
    const builder = reportedCase();
    builder.record({ step: 'dossier_review', value: review({}, '2026-11-03') });
    const snapshot = builder.snapshot();
    const raised = checkConsistency({
      ...snapshot,
      steps: [
        ...snapshot.steps,
        {
          id: 'decision-1',
          version: 1,
          caseRevision: builder.revision + 1,
          reason: null,
          recordedBy: APPROVER,
          recordedAt: '2026-11-04T00:00:00.000Z',
          step: 'decision',
          value: decision('2026-11-02'),
        },
      ],
    });
    expect(only(raised, 'R05')).toEqual([
      expect.objectContaining({
        verdict: 'error',
        subject: {
          kind: 'date_order',
          earlier: 'dossier_approved',
          later: 'decision',
        },
        left: expect.objectContaining({
          value: { kind: 'date', date: '2026-11-03' },
        }),
        right: expect.objectContaining({
          value: { kind: 'date', date: '2026-11-02' },
        }),
      }),
    ]);
    builder.record({ step: 'decision', value: decision('2026-11-03') });
    expect(only(checkConsistency(builder.snapshot()), 'R05')).toEqual([]);
  });

  it('R05 asks to clarify a Stage report dated before its Stage’s last day', () => {
    const builder = reportedCase({ reportDate: S2_START });
    expect(only(checkConsistency(builder.snapshot()), 'R05')).toEqual([
      expect.objectContaining({
        verdict: 'to_clarify',
        subject: {
          kind: 'date_order',
          earlier: 'stage_2_end',
          later: 'stage_2_report',
        },
      }),
    ]);
  });

  it('R08 raises an item answered present without its record, critical', () => {
    const builder = reportedCase();
    builder.record({
      step: 'dossier_review',
      value: review({ certificate_data: 'present' }),
    });
    expect(only(checkConsistency(builder.snapshot()), 'R08')).toEqual([
      expect.objectContaining({
        verdict: 'critical',
        subject: { kind: 'dossier_item', item: 'certificate_data' },
        left: expect.objectContaining({
          value: { kind: 'state', state: 'present' },
        }),
        right: expect.objectContaining({
          value: { kind: 'state', state: 'not_recorded' },
        }),
      }),
    ]);
  });

  it('R08 is not raised when the record exists at the review', () => {
    const builder = reportedCase();
    const form = builder.attach('certificate_data', 'data-form');
    builder.record({
      step: 'certificate_data',
      value: {
        texts: [TEXT],
        agreedOn: '2026-10-25',
        agreementAttachmentId: form,
      },
    });
    builder.record({
      step: 'dossier_review',
      value: review({ certificate_data: 'present' }),
    });
    expect(checkConsistency(builder.snapshot())).toEqual([]);
  });

  it('R09 asks to clarify an item answered missing while its record and PDF exist', () => {
    const builder = reportedCase();
    builder.record({
      step: 'dossier_review',
      value: review({ stage_1_plan: 'missing' }),
    });
    expect(only(checkConsistency(builder.snapshot()), 'R09')).toEqual([
      expect.objectContaining({
        verdict: 'to_clarify',
        subject: { kind: 'dossier_item', item: 'stage_1_plan' },
        left: expect.objectContaining({
          value: { kind: 'state', state: 'missing' },
        }),
        right: expect.objectContaining({
          value: { kind: 'state', state: 'recorded' },
          source: expect.objectContaining({
            step: 'stage_1_plan',
            attachment: expect.objectContaining({ documentId: 'plan-1' }),
          }),
        }),
      }),
    ]);
    // Not raised while the record does not exist.
    expect(only(checkConsistency(reportedCase().snapshot()), 'R09')).toEqual(
      [],
    );
  });

  it('R13 compares only the draft number with issued Company numbers without exposing another Case', () => {
    const builder = reportedCase();
    builder.record({ step: 'decision', value: decision('2026-10-21') });
    builder.record({
      step: 'certificate_data',
      value: {
        texts: [TEXT],
        agreedOn: '2026-10-21',
        agreementAttachmentId: 'data-v1',
      },
    });
    builder.record({
      step: 'certificate_draft',
      value: {
        number: 'DEMO-0001',
        attachmentId: 'draft-v1',
        decisionVersionId: 'decision-1',
        certificateDataVersionId: 'certificate_data-1',
        draftedOn: '2026-10-21',
      },
    });
    const snapshot = builder.snapshot();
    expect(
      checkConsistency({ ...snapshot, issuedNumbers: [] }).filter(
        (entry) => entry.rule === 'R13',
      ),
    ).toEqual([]);
    const found = checkConsistency({
      ...snapshot,
      issuedNumbers: [
        { number: 'DEMO-0001', recordedAt: '2026-10-01T00:00:00Z' },
      ],
    }).filter((entry) => entry.rule === 'R13');
    expect(found).toMatchObject([
      {
        verdict: 'critical',
        subject: { kind: 'certificate_number' },
        left: { value: { kind: 'text', text: 'DEMO-0001' } },
        right: {
          source: {
            kind: 'company_certificate_number',
            number: 'DEMO-0001',
            attachment: null,
          },
        },
      },
    ]);
    expect(
      checkConsistency({
        ...snapshot,
        issuedNumbers: [
          { number: 'OTHER-0001', recordedAt: '2026-10-01T00:00:00Z' },
        ],
      }).filter((entry) => entry.rule === 'R13'),
    ).toEqual([]);
    const history = consistencySection({
      ...snapshot,
      revision: builder.revision,
      status: 'open',
      manual: [],
      resolutions: [],
      issuedNumbers: [
        { number: 'DEMO-0001', recordedAt: '2026-11-01T00:00:00Z' },
      ],
    });
    expect(history.open.filter((entry) => entry.rule === 'R13')).toMatchObject([
      { openedRevision: builder.revision },
    ]);
    expect(history.resolved.filter((entry) => entry.rule === 'R13')).toEqual(
      [],
    );
  });

  it('R10 raises a record corrected after the dossier review until a new review covers it', () => {
    const builder = reportedCase();
    builder.record({ step: 'dossier_review', value: review() });
    const report = builder.attach('report', 'report-2', 2);
    builder.record({
      step: 'stage_2_report',
      value: {
        reportDate: '2026-10-21',
        summary: 'Done, corrected',
        reportAttachmentId: report,
        participantListAttachmentId: null,
        annexAttachmentId: null,
        certificationBodyApproval: null,
      },
    });
    expect(only(checkConsistency(builder.snapshot()), 'R10')).toEqual([
      expect.objectContaining({
        verdict: 'error',
        subject: { kind: 'dossier_item', item: 'stage_2_report' },
        left: expect.objectContaining({
          value: { kind: 'version', version: 1 },
        }),
        right: expect.objectContaining({
          value: { kind: 'version', version: 2 },
        }),
      }),
    ]);
    builder.record({ step: 'dossier_review', value: review() });
    expect(only(checkConsistency(builder.snapshot()), 'R10')).toEqual([]);
  });

  it('R11 raises a granted address that differs from the agreed one, critical', () => {
    const builder = reportedCase();
    builder.record({ step: 'dossier_review', value: review() });
    builder.record({ step: 'decision', value: decision('2026-11-04') });
    const form = builder.attach('certificate_data', 'data-form');
    builder.record({
      step: 'certificate_data',
      value: {
        texts: [{ ...TEXT, address: 'Str. Exemplu 1A, Demo City' }],
        agreedOn: '2026-11-05',
        agreementAttachmentId: form,
      },
    });
    expect(only(checkConsistency(builder.snapshot()), 'R11')).toEqual([
      expect.objectContaining({
        verdict: 'critical',
        subject: { kind: 'certificate_text', language: 'ro', field: 'address' },
        left: expect.objectContaining({
          value: { kind: 'text', text: ADDRESS },
        }),
        right: expect.objectContaining({
          value: { kind: 'text', text: 'Str. Exemplu 1A, Demo City' },
        }),
      }),
    ]);
    builder.record({
      step: 'certificate_data',
      value: {
        texts: [{ ...TEXT, address: `  ${ADDRESS} ` }],
        agreedOn: '2026-11-05',
        agreementAttachmentId: form,
      },
    });
    expect(only(checkConsistency(builder.snapshot()), 'R11')).toEqual([]);
  });

  it('R12 compares house numbers and postal codes, not the wording across languages', () => {
    expect(addressNumbers('Str. Exemplu 1A, Demo City, MD-2001')).toEqual([
      '1a',
      '2001',
    ]);
    // Cyrillic look-alike letters fold to Latin before reading the suffix.
    expect(addressNumbers('ул. Пример 1А')).toEqual(['1a']);
    expect(addressNumbers('1st Example Street 12')).toEqual(['1', '12']);
    const builder = reportedCase();
    builder.record({
      step: 'application',
      value: facts({ declaredAddress: 'Str. Exemplu 1A, Demo City' }),
    });
    const form = builder.attach('certificate_data', 'data-form');
    builder.record({
      step: 'certificate_data',
      value: {
        texts: [
          TEXT,
          {
            language: 'en',
            holderName: 'Lactis Demo SRL',
            address: '1A Example Street, Demo City',
            scope: 'Production of pasteurised milk (example)',
          },
        ],
        agreedOn: '2026-10-25',
        agreementAttachmentId: form,
      },
    });
    expect(only(checkConsistency(builder.snapshot()), 'R12')).toEqual([
      expect.objectContaining({
        verdict: 'to_clarify',
        subject: { kind: 'address_numbers', language: 'ro' },
        left: expect.objectContaining({
          value: { kind: 'numbers', numbers: ['1a'] },
          detail: 'Str. Exemplu 1A, Demo City',
        }),
        right: expect.objectContaining({
          value: { kind: 'numbers', numbers: ['1'] },
          detail: ADDRESS,
        }),
      }),
    ]);
  });

  it('R14 asks to clarify a record relying on a Version older than an unused attached one', () => {
    const builder = plannedCase();
    builder.attach('plan', 'plan-1', 2);
    expect(only(checkConsistency(builder.snapshot()), 'R14')).toEqual([
      expect.objectContaining({
        verdict: 'to_clarify',
        subject: { kind: 'document_version', documentId: 'plan-1' },
        left: expect.objectContaining({
          value: { kind: 'version', version: 1 },
          source: expect.objectContaining({ step: 'stage_1_plan' }),
        }),
        right: expect.objectContaining({
          value: { kind: 'version', version: 2 },
          source: expect.objectContaining({ kind: 'attachment' }),
        }),
      }),
    ]);
    builder.record({
      step: 'stage_1_plan',
      value: plan('plan-1-v2', S1, S1, '1'),
    });
    expect(only(checkConsistency(builder.snapshot()), 'R14')).toEqual([]);
  });
});

function input(
  builder: CaseBuilder,
  extra: {
    manual?: ManualDiscrepancyRecord[];
    resolutions?: ResolutionRecord[];
  } = {},
): ConsistencyInput {
  return {
    ...builder.snapshot(),
    revision: builder.revision,
    status: 'open',
    manual: extra.manual ?? [],
    resolutions: extra.resolutions ?? [],
  };
}

describe('Discrepancy history, acceptance and persistence (PRD §9.1)', () => {
  it('opens a Discrepancy at the revision that produces it and closes it as corrected by the version that makes the values agree', () => {
    const builder = plannedCase();
    builder.record({
      step: 'application',
      value: facts({ totalHeadcount: 60, effectiveFte: 60 }),
    });
    const raisedAt = builder.revision;
    const open = consistencySection(input(builder));
    expect(open.ruleSetVersion).toBe(CONSISTENCY_RULE_SET_VERSION);
    expect(open.counts).toEqual({ critical: 0, error: 1, toClarify: 0 });
    expect(open.open).toEqual([
      expect.objectContaining({
        origin: 'rule',
        rule: 'R01',
        verdict: 'error',
        blocks: 'decision',
        openedRevision: raisedAt,
      }),
    ]);
    const id = open.open[0]?.id;
    builder.record({
      step: 'duration',
      value: duration({
        effectiveFte: 60,
        initialOnSite: '3.5',
        confirmed: { initialOnSite: '3' },
      }),
      reason: 'Headcount corrected',
    });
    const closed = consistencySection(input(builder));
    expect(closed.open).toEqual([]);
    expect(closed.resolved).toEqual([
      expect.objectContaining({
        id,
        rule: 'R01',
        openedRevision: raisedAt,
        resolution: expect.objectContaining({
          kind: 'corrected',
          via: 'record',
          caseRevision: builder.revision,
          reason: 'Headcount corrected',
          source: expect.objectContaining({ step: 'duration', version: 2 }),
        }),
      }),
    ]);
  });

  it('keeps an acceptance across versions with the same values, opens a new Discrepancy for new values and accepts returning values again', () => {
    const builder = plannedCase({ stage2End: S2_START });
    const [r04] = consistencySection(input(builder)).open;
    if (!r04) throw new Error('Expected R04.');
    const acceptance: ResolutionRecord = {
      id: 'resolution-1',
      discrepancyId: r04.id,
      manualDiscrepancyId: null,
      kind: 'accepted',
      verdict: 'to_clarify',
      reason: 'Fictional long audit day agreed with the client',
      correctedBy: null,
      ruleSetVersion: CONSISTENCY_RULE_SET_VERSION,
      caseRevision: builder.revision + 1,
      recordedBy: MANAGER,
      recordedAt: '2026-10-10T00:00:00.000Z',
    };
    builder.revision += 1;
    const accepted = consistencySection(
      input(builder, { resolutions: [acceptance] }),
    );
    expect(accepted.open).toEqual([]);
    expect(accepted.resolved).toEqual([
      expect.objectContaining({
        id: r04.id,
        resolution: expect.objectContaining({
          kind: 'accepted',
          via: 'acceptance',
        }),
      }),
    ]);
    // A new plan version with the same values keeps the acceptance.
    const same = builder.attach('plan', 'plan-2', 2);
    builder.record({
      step: 'stage_2_plan',
      value: plan(same, S2_START, S2_START, '2'),
    });
    expect(
      consistencySection(input(builder, { resolutions: [acceptance] })).open,
    ).toEqual([]);
    // New values form a new Discrepancy; the acceptance stays in history.
    // (The deviation from the Stage 2 share is justified, so R03 is resolved.)
    builder.record({
      step: 'stage_2_plan',
      value: plan(same, S2_START, S2_START, '2.5', 'Fictional longer day'),
    });
    const changed = consistencySection(
      input(builder, { resolutions: [acceptance] }),
    );
    expect(changed.open).toEqual([
      expect.objectContaining({ rule: 'R04', blocks: null }),
    ]);
    expect(changed.open[0]?.id).not.toBe(r04.id);
    expect(changed.resolved.filter((entry) => entry.rule === 'R04')).toEqual([
      expect.objectContaining({
        id: r04.id,
        resolution: expect.objectContaining({ kind: 'accepted' }),
        endedRevision: builder.revision,
      }),
    ]);
    // Values returning to the accepted pair are accepted again.
    builder.record({
      step: 'stage_2_plan',
      value: plan(same, S2_START, S2_START, '2'),
    });
    const back = consistencySection(
      input(builder, { resolutions: [acceptance] }),
    );
    expect(back.open).toEqual([]);
    expect(back.resolved.filter((entry) => entry.id === r04.id)).toHaveLength(
      2,
    );
  });

  it('lists a manual Discrepancy until its resolution, and blocks with an error or critical verdict', () => {
    const builder = reportedCase();
    const signed = builder.attach('report', 'signed-report');
    const draft = builder.attach('other', 'editable-draft');
    builder.revision += 1;
    const manual: ManualDiscrepancyRecord = {
      id: 'manual-1',
      sequence: 1,
      caseRevision: builder.revision,
      verdict: 'to_clarify',
      subject: 'Stage type',
      left: { value: 'Stage 1', attachmentId: draft, location: 'page 1' },
      right: { value: 'Stage 2', attachmentId: signed, location: 'page 1' },
      note: null,
      recordedBy: MANAGER,
      recordedAt: '2026-10-22T00:00:00.000Z',
    };
    const listed = consistencySection(input(builder, { manual: [manual] }));
    expect(listed.open).toEqual([
      expect.objectContaining({
        origin: 'manual',
        id: 'manual:manual-1',
        verdict: 'to_clarify',
        blocks: null,
        left: expect.objectContaining({
          value: { kind: 'text', text: 'Stage 1' },
          source: expect.objectContaining({
            kind: 'attachment',
            attachment: expect.objectContaining({
              documentId: 'editable-draft',
            }),
          }),
        }),
      }),
    ]);
    expect(listed.counts.toClarify).toBe(1);
    const blocking = consistencySection(
      input(builder, { manual: [{ ...manual, verdict: 'error' }] }),
    );
    expect(blocking.open[0]?.blocks).toBe('decision');
    builder.revision += 1;
    const resolved = consistencySection(
      input(builder, {
        manual: [manual],
        resolutions: [
          {
            id: 'resolution-2',
            discrepancyId: 'manual:manual-1',
            manualDiscrepancyId: 'manual-1',
            kind: 'accepted',
            verdict: 'to_clarify',
            reason: 'The signed PDF prevails',
            correctedBy: null,
            ruleSetVersion: CONSISTENCY_RULE_SET_VERSION,
            caseRevision: builder.revision,
            recordedBy: APPROVER,
            recordedAt: '2026-10-23T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(resolved.open).toEqual([]);
    expect(resolved.resolved).toEqual([
      expect.objectContaining({
        origin: 'manual',
        resolution: expect.objectContaining({
          kind: 'accepted',
          reason: 'The signed PDF prevails',
          by: APPROVER,
        }),
      }),
    ]);
  });

  it('blocks draft approval after a granting decision and nothing once issued', () => {
    const builder = reportedCase();
    builder.record({ step: 'dossier_review', value: review() });
    builder.record({ step: 'decision', value: decision('2026-11-04') });
    const form = builder.attach('certificate_data', 'data-form');
    builder.record({
      step: 'certificate_data',
      value: {
        texts: [{ ...TEXT, scope: 'Another scope' }],
        agreedOn: '2026-11-05',
        agreementAttachmentId: form,
      },
    });
    expect(consistencySection(input(builder)).open).toEqual([
      expect.objectContaining({
        rule: 'R11',
        blocks: 'certificate_draft_approval',
      }),
    ]);
    expect(
      consistencySection({ ...input(builder), status: 'certified' }).open,
    ).toEqual([expect.objectContaining({ rule: 'R11', blocks: null })]);
  });

  it('gives a Discrepancy the same identity for the same rule, subject and values', () => {
    const first = consistencySection(
      input(plannedCase({ stage2End: S2_START })),
    ).open[0];
    const second = consistencySection(
      input(plannedCase({ stage2End: S2_START })),
    ).open[0];
    expect(first?.id).toMatch(/^R04:[0-9a-f]{32}$/u);
    expect(first?.id).toBe(second?.id);
  });
});

describe('Exchange register rules (PRD §8.1 vectors R06, R07, R15, R16)', () => {
  const FICTIONAL: DeadlineDays = {
    stage_plan_sent: 10,
    audit_dossier_transmitted: 20,
    stage_2_report_released: 0,
  };
  function sentPlan(builder: CaseBuilder, sentToClientOn: string | null) {
    const latest = [...builder.steps]
      .reverse()
      .find((entry) => entry.step === 'stage_1_plan');
    if (latest?.step !== 'stage_1_plan') throw new Error('No Stage 1 plan.');
    builder.record({
      step: 'stage_1_plan',
      value: { ...latest.value, sentToClientOn },
    });
    return latest.value.planAttachmentId;
  }

  it('R06 asks to clarify a Stage plan sent on S1 + 1, never on S1 or before', () => {
    const raised = plannedCase();
    sentPlan(raised, '2026-10-02');
    expect(only(checkConsistency(raised.snapshot()), 'R06')).toEqual([
      expect.objectContaining({
        verdict: 'to_clarify',
        subject: { kind: 'plan_sending', stage: 'stage_1' },
        left: expect.objectContaining({
          value: { kind: 'date', date: '2026-10-02' },
        }),
        right: expect.objectContaining({ value: { kind: 'date', date: S1 } }),
      }),
    ]);
    for (const sentOn of [S1, '2026-09-19']) {
      const kept = plannedCase();
      sentPlan(kept, sentOn);
      expect(only(checkConsistency(kept.snapshot()), 'R06')).toEqual([]);
    }
  });

  it('R07 raises a plan sending date no register record has, as an error', () => {
    const builder = plannedCase();
    const plan = sentPlan(builder, '2026-09-17');
    builder.exchange({ businessDate: '2026-09-19', attachmentIds: [plan] });
    expect(only(checkConsistency(builder.snapshot()), 'R07')).toEqual([
      expect.objectContaining({
        verdict: 'error',
        subject: { kind: 'plan_sending', stage: 'stage_1' },
        left: expect.objectContaining({
          value: { kind: 'date', date: '2026-09-17' },
        }),
        right: expect.objectContaining({
          value: { kind: 'date', date: '2026-09-19' },
          source: expect.objectContaining({ kind: 'exchange', sequence: 1 }),
        }),
      }),
    ]);
  });

  it('R07 is not raised before any sending, nor for a matching date and Version', () => {
    const none = plannedCase();
    sentPlan(none, '2026-09-17');
    expect(only(checkConsistency(none.snapshot()), 'R07')).toEqual([]);
    const matching = plannedCase();
    const plan = sentPlan(matching, '2026-09-19');
    matching.exchange({ businessDate: '2026-09-19', attachmentIds: [plan] });
    expect(only(checkConsistency(matching.snapshot()), 'R07')).toEqual([]);
  });

  it('R07 asks to clarify when the client received only another Version of the plan', () => {
    const builder = plannedCase();
    builder.attach('plan', 'plan-1', 2);
    sentPlan(builder, '2026-09-19');
    builder.exchange({
      businessDate: '2026-09-19',
      attachmentIds: ['plan-1-v2'],
    });
    const found = only(checkConsistency(builder.snapshot()), 'R07');
    expect(found).toEqual([
      expect.objectContaining({
        verdict: 'to_clarify',
        left: expect.objectContaining({
          value: { kind: 'version', version: 1 },
        }),
        right: expect.objectContaining({
          value: { kind: 'version', version: 2 },
        }),
      }),
    ]);
    // The Version the client received is used: R14 leaves it to R07.
    expect(only(checkConsistency(builder.snapshot()), 'R14')).toEqual([]);
  });

  it('R15 asks to clarify one outgoing reference on two sendings of different dates, not one record sending several Versions', () => {
    const builder = plannedCase();
    builder.exchange({ businessDate: '2026-09-19', reference: 'OUT-7' });
    builder.exchange({ businessDate: '2026-10-13', reference: 'out-7 ' });
    expect(only(checkConsistency(builder.snapshot()), 'R15')).toEqual([
      expect.objectContaining({
        verdict: 'to_clarify',
        subject: {
          kind: 'exchange_reference',
          reference: 'OUT-7',
          first: 1,
          second: 2,
        },
        left: expect.objectContaining({
          value: { kind: 'date', date: '2026-09-19' },
        }),
        right: expect.objectContaining({
          value: { kind: 'date', date: '2026-10-13' },
        }),
      }),
    ]);
    const single = plannedCase();
    single.exchange({
      reference: 'OUT-7',
      attachmentIds: ['plan-1-v1', 'plan-2-v1'],
    });
    // A received record carrying the same reference is not a sending.
    single.exchange({
      reference: 'OUT-7',
      direction: 'received',
      businessDate: '2026-10-13',
    });
    expect(only(checkConsistency(single.snapshot()), 'R15')).toEqual([]);
  });

  it('R16 raises the Stage 2 report sent before the decision, as an error that blocks it until accepted', () => {
    const builder = reportedCase();
    builder.deadlineDays = FICTIONAL;
    builder.exchange({
      itemKind: 'stage_report',
      businessDate: '2026-10-25',
      attachmentIds: ['report-2-v1'],
    });
    const [r16] = only(checkConsistency(builder.snapshot()), 'R16');
    expect(r16).toMatchObject({
      verdict: 'error',
      subject: {
        kind: 'exchange_deadline',
        deadline: 'stage_2_report_released',
        sequence: 1,
      },
      left: { value: { kind: 'date', date: '2026-10-25' } },
      right: { value: { kind: 'state', state: 'not_recorded' } },
    });
    const section = consistencySection(input(builder));
    const open = section.open.find((view) => view.rule === 'R16');
    expect(open).toMatchObject({ blocks: 'decision' });
    if (!open) throw new Error('Expected R16.');
    // Accepted, it no longer blocks, and the decision recorded later keeps
    // the same values: the sending was recorded while no decision existed.
    const acceptance: ResolutionRecord = {
      id: 'resolution-16',
      discrepancyId: open.id,
      manualDiscrepancyId: null,
      kind: 'accepted',
      verdict: 'error',
      reason: 'Fictional report released early by mistake.',
      correctedBy: null,
      ruleSetVersion: CONSISTENCY_RULE_SET_VERSION,
      caseRevision: builder.revision + 1,
      recordedBy: APPROVER,
      recordedAt: '2026-10-26T00:00:00.000Z',
    };
    expect(blockingDiscrepancies(builder.snapshot(), [], [acceptance])).toEqual(
      [],
    );
    builder.revision += 1;
    builder.record({ step: 'dossier_review', value: review() });
    builder.record({ step: 'decision', value: decision('2026-11-04') });
    expect(
      consistencySection(
        input(builder, { resolutions: [acceptance] }),
      ).open.filter((view) => view.rule === 'R16'),
    ).toEqual([]);
  });

  it('R16 compares a sending recorded after the decision with the decision date', () => {
    const builder = reportedCase();
    builder.deadlineDays = FICTIONAL;
    builder.record({ step: 'dossier_review', value: review() });
    builder.record({ step: 'decision', value: decision('2026-11-04') });
    builder.exchange({
      itemKind: 'stage_report',
      businessDate: '2026-11-03',
      attachmentIds: ['report-2-v1'],
    });
    expect(only(checkConsistency(builder.snapshot()), 'R16')).toEqual([
      expect.objectContaining({
        right: expect.objectContaining({
          value: { kind: 'date', date: '2026-11-04' },
          source: expect.objectContaining({ step: 'decision' }),
        }),
      }),
    ]);
    builder.exchange(
      {
        itemKind: 'stage_report',
        businessDate: '2026-11-04',
        attachmentIds: ['report-2-v1'],
      },
      1,
    );
    expect(only(checkConsistency(builder.snapshot()), 'R16')).toEqual([]);
  });

  it('R16 keeps a sending recorded before the decision early when a later correction changes only its note or reference', () => {
    const builder = reportedCase();
    builder.deadlineDays = FICTIONAL;
    const sending: Pick<
      ExchangeRecordVersion,
      'itemKind' | 'businessDate' | 'attachmentIds'
    > = {
      itemKind: 'stage_report',
      businessDate: '2026-11-04',
      attachmentIds: ['report-2-v1'],
    };
    builder.exchange(sending);
    const [before] = only(checkConsistency(builder.snapshot()), 'R16');
    builder.record({ step: 'dossier_review', value: review() });
    builder.record({ step: 'decision', value: decision('2026-11-04') });
    builder.exchange({ ...sending, reference: 'OUT-9' }, 1);
    const latest = builder.exchanges.at(-1);
    if (latest) latest.note = 'Fictional: the cover letter is OUT-9.';
    // The transmission facts are unchanged: still sent while no decision
    // existed, on the same compared values.
    expect(only(checkConsistency(builder.snapshot()), 'R16')).toEqual([
      expect.objectContaining({
        subject: before?.subject,
        left: expect.objectContaining({ value: before?.left.value }),
        right: expect.objectContaining({
          value: { kind: 'state', state: 'not_recorded' },
        }),
      }),
    ]);
    // A correction of the date is a new sending fact, compared with D.
    builder.exchange({ ...sending, businessDate: '2026-11-05' }, 1);
    expect(only(checkConsistency(builder.snapshot()), 'R16')).toEqual([]);
  });

  it('R16 is not raised while the deadline is not configured', () => {
    const builder = reportedCase();
    builder.deadlineDays = { ...FICTIONAL, stage_2_report_released: null };
    builder.exchange({
      itemKind: 'stage_report',
      businessDate: '2026-10-25',
      attachmentIds: ['report-2-v1'],
    });
    expect(only(checkConsistency(builder.snapshot()), 'R16')).toEqual([]);
  });

  it('closes an exchange Discrepancy as corrected by the Exchange Record version that resolves it', () => {
    const builder = plannedCase();
    builder.exchange({ businessDate: '2026-09-19', reference: 'OUT-7' });
    builder.exchange({ businessDate: '2026-10-13', reference: 'OUT-7' });
    builder.exchange({ businessDate: '2026-10-13', reference: 'OUT-8' }, 2);
    const section = consistencySection(input(builder));
    expect(section.open.filter((view) => view.rule === 'R15')).toEqual([]);
    expect(section.resolved).toEqual([
      expect.objectContaining({
        rule: 'R15',
        resolution: expect.objectContaining({
          kind: 'corrected',
          via: 'record',
          source: expect.objectContaining({
            kind: 'exchange',
            sequence: 2,
            version: 2,
          }),
        }),
      }),
    ]);
  });
});
