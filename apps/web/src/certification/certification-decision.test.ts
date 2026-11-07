import { describe, expect, it } from 'vitest';
import {
  certificateTextDifferences,
  decisionPreconditions,
  sameCertificateTexts,
  type DecisionContext,
  type DossierReview,
} from './certification-decision';
import type { Finding } from './certification-findings';
import {
  CERTIFICATE_TEXTS,
  dossierReview,
  findingStatement,
  teamMember,
} from './certification.test-fixture';

const team = {
  members: [
    {
      name: 'Elena Demo',
      role: 'team_leader' as const,
      workspaceMembershipId: null,
      holdsCategory: true,
      competenceNote: 'ISO 22000 lead auditor, category C',
      declarations: teamMember().declarations,
      conflictNote: null,
    },
  ],
  impartialityAnalysis: null,
};

/** A complete review, as the parser reads the fixture's answers. */
const complete: DossierReview = {
  items: {
    application: { answer: 'present', note: null },
    application_review: { answer: 'present', note: null },
    duration: { answer: 'present', note: null },
    agreement: { answer: 'present', note: null },
    team_approval: { answer: 'present', note: null },
    stage_1_plan: { answer: 'present', note: null },
    stage_1_report: { answer: 'present', note: null },
    stage_2_plan: { answer: 'present', note: null },
    stage_2_report: { answer: 'present', note: null },
    participant_lists: { answer: 'present', note: null },
    findings_follow_up: { answer: 'not_applicable', note: null },
    recommendation: { answer: 'present', note: null },
    certificate_data: { answer: 'present', note: null },
  },
  conclusion: dossierReview().conclusion,
  reviewedBy: null,
  approvedBy: null,
  independenceAttested: true,
};

/** Every precondition of a decision holds in this read. */
function ready(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    applicationReview: { value: { outcome: 'accepted' } },
    duration: {},
    agreement: {},
    team: { version: 1, value: team },
    teamDecision: { value: { teamVersion: 1, decision: 'approved' } },
    stage1Report: { value: { conclusion: 'ready' } },
    stage2Report: {},
    findings: [],
    recommendation: {
      value: {
        recommendation: 'grant',
        basis: 'No nonconformity.',
        recommendedOn: null,
      },
    },
    dossierReview: { value: complete },
    ...overrides,
  };
}

function nonconformity(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'finding-1',
    stage: 'stage_2',
    sequence: 1,
    statement: { ...findingStatement(), evidenceAttachmentIds: ['evidence'] },
    classification: 'minor_nonconformity',
    status: 'plan_adequate',
    responseDueOn: '2026-12-05',
    limitOn: null,
    overdue: false,
    records: [],
    ...overrides,
  };
}

describe('Certification Decision preconditions', () => {
  it('finds none when the read Case meets every precondition', () => {
    expect(decisionPreconditions(ready(), 'granted')).toEqual([]);
    expect(decisionPreconditions(ready(), 'refused')).toEqual([]);
    expect(decisionPreconditions(ready(), null)).toEqual([]);
  });

  it.each([
    [
      'APPLICATION_NOT_ACCEPTED',
      ready({ applicationReview: { value: { outcome: 'rejected' } } }),
    ],
    ['DURATION_MISSING', ready({ duration: null })],
    ['AGREEMENT_MISSING', ready({ agreement: null })],
    ['TEAM_NOT_APPROVED', ready({ team: { version: 2, value: team } })],
    [
      'STAGE_1_NOT_READY',
      ready({ stage1Report: { value: { conclusion: 'not_ready' } } }),
    ],
    ['STAGE_2_NOT_REPORTED', ready({ stage2Report: null })],
    [
      'FINDINGS_OPEN',
      ready({ findings: [nonconformity({ status: 'awaiting_response' })] }),
    ],
    ['RECOMMENDATION_MISSING', ready({ recommendation: null })],
    ['DOSSIER_REVIEW_INCOMPLETE', ready({ dossierReview: null })],
    [
      'DOSSIER_REVIEW_INCOMPLETE',
      ready({
        dossierReview: {
          value: {
            ...complete,
            items: {
              ...complete.items,
              participant_lists: { answer: 'missing', note: 'Not received.' },
            },
          },
        },
      }),
    ],
  ])('lists %s when the read Case shows it unmet', (code, context) => {
    expect(decisionPreconditions(context, 'refused')).toEqual([code]);
  });

  it('lists an overdue nonconformity, which also still holds the Case', () => {
    expect(
      decisionPreconditions(
        ready({
          findings: [
            nonconformity({
              classification: 'major_nonconformity',
              status: 'awaiting_response',
              limitOn: '2026-05-21',
              overdue: true,
            }),
          ],
        }),
        'refused',
      ),
    ).toEqual(['FINDINGS_OPEN', 'FINDINGS_OVERDUE']);
  });

  it('refuses a grant, and only a grant, against a recommendation not to grant', () => {
    for (const recommendation of [
      'do_not_grant',
      'additional_audit',
    ] as const) {
      const context = ready({
        recommendation: {
          value: { recommendation, basis: 'Basis.', recommendedOn: null },
        },
      });
      expect(decisionPreconditions(context, 'granted')).toEqual([
        'GRANT_AGAINST_RECOMMENDATION',
      ]);
      expect(decisionPreconditions(context, 'refused')).toEqual([]);
      expect(decisionPreconditions(context, null)).toEqual([]);
    }
  });
});

describe('Certificate texts compared with the decision', () => {
  const [romanian, english] = CERTIFICATE_TEXTS;
  if (!romanian || !english) throw new Error('Expected two fictional texts.');

  it('compares language by language, whatever the order and spacing', () => {
    expect(
      sameCertificateTexts(
        [romanian, english],
        [
          { ...english, scope: `  ${english.scope.replace(' ', '   ')} ` },
          romanian,
        ],
      ),
    ).toBe(true);
    expect(certificateTextDifferences([romanian], [romanian])).toEqual([]);
  });

  it('lists each language and field that differs, granted languages first', () => {
    expect(
      certificateTextDifferences(
        [romanian, english],
        [
          { ...english, holderName: 'Lactis Demo Ltd', scope: 'Milk' },
          { ...english, language: 'fr' },
        ],
      ),
    ).toEqual([
      { kind: 'notAgreed', language: 'ro' },
      {
        kind: 'field',
        language: 'en',
        field: 'holderName',
        granted: english.holderName,
        agreed: 'Lactis Demo Ltd',
      },
      {
        kind: 'field',
        language: 'en',
        field: 'scope',
        granted: english.scope,
        agreed: 'Milk',
      },
      { kind: 'notGranted', language: 'fr' },
    ]);
    expect(sameCertificateTexts([romanian, english], [english])).toBe(false);
  });
});
