import {
  type FakeCertificationServer,
  stage1Report,
  stage2Report,
  stagePlan,
} from './certification-fake-server';

/** A fictional Case ready for Stage 2 Findings, with both Stage reports recorded. */
export function seedReportedCase(
  server: FakeCertificationServer,
  { reference, leader }: { reference: string; leader: string },
) {
  const caseId = server.seedApprovedTeam({ orderReference: reference, leader });
  const attach = (title: string, role: 'plan' | 'report' | 'evidence') =>
    server.attachAsColleague(caseId, server.addSource(title), role);
  server.recordStageAsColleague(
    caseId,
    'stage_1_plan',
    stagePlan(attach('First audit plan', 'plan')),
  );
  server.recordStageAsColleague(
    caseId,
    'stage_1_report',
    stage1Report(attach('First audit report', 'report')),
  );
  server.recordStageAsColleague(
    caseId,
    'stage_2_plan',
    stagePlan(attach('Second audit plan', 'plan'), {
      startDate: '2026-11-20',
      endDate: '2026-11-21',
      onSiteDays: '2',
    }),
  );
  server.recordStageAsColleague(
    caseId,
    'stage_2_report',
    stage2Report(attach('Second audit report', 'report')),
  );
  const evidence = attach('Receiving records', 'evidence');
  return { caseId, evidence };
}

export const dossierReviewItems = [
  'Application',
  'Application review',
  'Audit duration',
  'Certification agreement',
  'Audit team approval',
  'Stage 1 audit plan',
  'Stage 1 audit report',
  'Stage 2 audit plan',
  'Stage 2 audit report',
  'Participant lists',
  'Nonconformity follow-up',
  'Team recommendation',
  'Certificate data agreed with the client',
];

/** One nonblocking rule Discrepancy for the existing review panel. */
export function seedCapacityDiscrepancy(
  server: FakeCertificationServer,
  caseId: string,
) {
  server.seedDiscrepancy(caseId, {
    id: `R04:b${'0'.repeat(31)}`,
    origin: 'rule',
    rule: 'R04',
    subject: { kind: 'stage_capacity', stage: 'stage_2' },
    verdict: 'to_clarify',
    blocks: null,
    left: {
      value: { kind: 'days', days: '2' },
      detail: null,
      source: null,
    },
    right: {
      value: { kind: 'capacity', calendarDays: 1, auditors: 1 },
      detail: null,
      source: null,
    },
    openedRevision: 15,
    opened: {
      by: {
        workspaceMembershipId: 'review-colleague',
        displayName: 'Review Colleague Demo',
      },
      at: '2026-11-07T08:05:00.000Z',
    },
    endedRevision: null,
    status: 'open',
    resolution: null,
  });
}
