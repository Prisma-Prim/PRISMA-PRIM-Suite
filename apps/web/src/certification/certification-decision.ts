import type { ActAttribution } from './certification-attribution';
import {
  blockingDecision,
  type Consistency,
} from './certification-consistency';
import { findingBlocks, type Finding } from './certification-findings';
import type {
  CertificationActorReference,
  CaseStatus,
} from './certification-response';
import { approvedTeam } from './certification-stages';
import type { AuditTeam } from './certification-team';

/**
 * The server's contract for the end of the journey: the team leader's
 * recommendation, an approver's dossier review and Certification Decision
 * (whose outcome a correction keeps), the Certificate data agreed with the
 * client and the recorded
 * Certificate. The server stays authoritative; this module only mirrors its
 * rules and never recomputes the Certificate's validity.
 */
export const RECOMMENDATIONS = [
  'grant',
  'do_not_grant',
  'additional_audit',
] as const;
export type RecommendationOutcome = (typeof RECOMMENDATIONS)[number];

export interface Recommendation {
  recommendation: RecommendationOutcome;
  basis: string;
  /** The business date of the recommendation, when the paper dossier has it. */
  recommendedOn: string | null;
}

/** The dossier items an approver answers, in the server's display order. */
export const DOSSIER_ITEMS = [
  'application',
  'application_review',
  'duration',
  'agreement',
  'team_approval',
  'stage_1_plan',
  'stage_1_report',
  'stage_2_plan',
  'stage_2_report',
  'participant_lists',
  'findings_follow_up',
  'recommendation',
  'certificate_data',
] as const;
export type DossierItem = (typeof DOSSIER_ITEMS)[number];

export const DOSSIER_ANSWERS = [
  'present',
  'missing',
  'not_applicable',
] as const;
export type DossierAnswerValue = (typeof DOSSIER_ANSWERS)[number];

/** An explicit answer; a missing item always states its note. */
export type DossierAnswer =
  | { answer: 'present' | 'not_applicable'; note: string | null }
  | { answer: 'missing'; note: string };

export interface DossierReview {
  items: Record<DossierItem, DossierAnswer>;
  conclusion: string;
  /** The certification body's dossier reviewer and approver, when recorded on their behalf. */
  reviewedBy: ActAttribution | null;
  approvedBy: ActAttribution | null;
  /** False only in reviews recorded before the attestation existed. */
  independenceAttested: boolean;
}

/** What one Certificate language states: holder, address and scope. */
export interface CertificateText {
  language: string;
  holderName: string;
  address: string;
  scope: string;
}

export type CertificationOutcome = 'granted' | 'refused';

/**
 * The decision; only a grant fixes the Certificate texts. A later version
 * corrects its texts and references, never its outcome.
 */
export type CertificationDecision = {
  decidedOn: string;
  /** The certification body's decision maker. */
  decidedBy: string;
  decidedByFunction: string | null;
  decisionFormAttachmentId: string | null;
  /** The recording approver attested the decider is not on the audit team. */
  independenceAttested: true;
  rationale: string;
  additionalInformation: string | null;
} & (
  | { decision: 'granted'; grantedTexts: CertificateText[] }
  | { decision: 'refused'; grantedTexts: null }
);

export interface CertificateData {
  texts: CertificateText[];
  agreedOn: string;
  agreementAttachmentId: string;
}

/** The recorded Certificate with the validity the server computed. */
export type Certificate = {
  id: string;
  number: string;
  validFrom: string;
  validUntil: string;
  firstSurveillanceBy: string;
  texts: CertificateText[];
  signedBy: string | null;
  signedByFunction: string | null;
  /** The recording approver attested the signatory is not on the audit team. */
  independenceAttested: true;
  attachmentId: string;
  recordedBy: CertificationActorReference;
  recordedAt: string;
  issuedOn: string;
  approvedDraftVersionId: string;
};

/** The server's bounds for these records. */
export const DECISION_LIMITS = {
  basis: 4000,
  note: 1000,
  conclusion: 4000,
  person: 200,
  rationale: 4000,
  additionalInformation: 4000,
  language: 10,
  holderName: 300,
  address: 500,
  scope: 2000,
  texts: 4,
  number: 64,
} as const;

/** The server's failure codes of a Certification Decision, in its order. */
export const DECISION_PRECONDITIONS = [
  'APPLICATION_NOT_ACCEPTED',
  'DURATION_MISSING',
  'AGREEMENT_MISSING',
  'TEAM_NOT_APPROVED',
  'STAGE_1_NOT_READY',
  'STAGE_2_NOT_REPORTED',
  'FINDINGS_OPEN',
  'FINDINGS_OVERDUE',
  'RECOMMENDATION_MISSING',
  'GRANT_AGAINST_RECOMMENDATION',
  'DOSSIER_REVIEW_INCOMPLETE',
  'CERTIFICATE_DATA_MISSING',
  'DECISION_IN_FUTURE',
  'DISCREPANCIES_OPEN',
] as const;
export type DecisionPrecondition = (typeof DECISION_PRECONDITIONS)[number];

export function dossierComplete(review: DossierReview): boolean {
  return DOSSIER_ITEMS.every((item) => review.items[item].answer !== 'missing');
}

export function missingItems(review: DossierReview): number {
  return DOSSIER_ITEMS.filter((item) => review.items[item].answer === 'missing')
    .length;
}

/** The facts of the read Case the decision preconditions depend on. */
export type DecisionContext = {
  status?: CaseStatus;
  applicationReview: { value: { outcome: 'accepted' | 'rejected' } } | null;
  duration: object | null;
  agreement: object | null;
  team: { version: number; value: AuditTeam } | null;
  teamDecision: {
    value: { teamVersion: number; decision: 'approved' | 'returned' };
  } | null;
  stage1Report: { value: { conclusion: 'ready' | 'not_ready' } } | null;
  stage2Report: object | null;
  findings: readonly Finding[];
  recommendation: { value: Recommendation } | null;
  dossierReview: { value: DossierReview } | null;
  consistency: Consistency;
  certificateData: { value: CertificateData } | null;
};

/**
 * Mirrors the server: every precondition of a decision that the read Case
 * shows unmet, in the server's order, the grant against the recommendation
 * once a grant is chosen. The server's clock alone decides whether the
 * decision date is in the future, so that one is left to the server.
 */
export function decisionPreconditions(
  current: DecisionContext,
  outcome: CertificationOutcome | null,
): DecisionPrecondition[] {
  const failures: DecisionPrecondition[] = [];
  if (current.applicationReview?.value.outcome !== 'accepted')
    failures.push('APPLICATION_NOT_ACCEPTED');
  if (!current.duration) failures.push('DURATION_MISSING');
  if (!current.agreement) failures.push('AGREEMENT_MISSING');
  if (!approvedTeam(current)) failures.push('TEAM_NOT_APPROVED');
  if (current.stage1Report?.value.conclusion !== 'ready')
    failures.push('STAGE_1_NOT_READY');
  if (!current.stage2Report) failures.push('STAGE_2_NOT_REPORTED');
  if (current.findings.some(findingBlocks)) failures.push('FINDINGS_OPEN');
  if (current.findings.some((finding) => finding.overdue))
    failures.push('FINDINGS_OVERDUE');
  const recommended = current.recommendation?.value.recommendation;
  if (recommended === undefined) failures.push('RECOMMENDATION_MISSING');
  else if (outcome === 'granted' && recommended !== 'grant')
    failures.push('GRANT_AGAINST_RECOMMENDATION');
  if (!current.dossierReview || !dossierComplete(current.dossierReview.value))
    failures.push('DOSSIER_REVIEW_INCOMPLETE');
  if (outcome === 'granted' && !current.certificateData)
    failures.push('CERTIFICATE_DATA_MISSING');
  // The decision itself may raise more (its date, its texts): the server says.
  if (
    current.status !== 'certified' &&
    blockingDecision(current.consistency).length
  )
    failures.push('DISCREPANCIES_OPEN');
  return failures;
}

/**
 * The failure codes of a refused decision as the server lists them: known
 * codes, each once. An unknown or malformed list is refused, so the web
 * never presents a partial reading as the server's reasons.
 */
export function parseDecisionFailures(
  value: unknown,
): DecisionPrecondition[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const codes: DecisionPrecondition[] = [];
  for (const entry of value) {
    const code = DECISION_PRECONDITIONS.find((known) => known === entry);
    if (code === undefined || codes.includes(code)) return undefined;
    codes.push(code);
  }
  return codes;
}

/** Texts compared as the server compares them: spaces collapsed and trimmed. */
function normal(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

/** Whether two sets of Certificate texts state the same, language by language. */
export function sameCertificateTexts(
  left: readonly CertificateText[],
  right: readonly CertificateText[],
): boolean {
  return certificateTextDifferences(left, right).length === 0;
}

export type CertificateTextField = 'holderName' | 'address' | 'scope';

/** How the agreed data differ from the granted texts, for one language. */
export type CertificateTextDifference =
  | { kind: 'notAgreed' | 'notGranted'; language: string }
  | {
      kind: 'field';
      language: string;
      field: CertificateTextField;
      granted: string;
      agreed: string;
    };

const TEXT_FIELDS: readonly CertificateTextField[] = [
  'holderName',
  'address',
  'scope',
];

/**
 * Every difference between the granted texts and the agreed data, in the
 * order of the granted languages, then the agreed languages not granted.
 */
export function certificateTextDifferences(
  granted: readonly CertificateText[],
  agreed: readonly CertificateText[],
): CertificateTextDifference[] {
  const differences: CertificateTextDifference[] = [];
  for (const text of granted) {
    const other = agreed.find((entry) => entry.language === text.language);
    if (!other) {
      differences.push({ kind: 'notAgreed', language: text.language });
      continue;
    }
    for (const field of TEXT_FIELDS)
      if (normal(text[field]) !== normal(other[field]))
        differences.push({
          kind: 'field',
          language: text.language,
          field,
          granted: text[field],
          agreed: other[field],
        });
  }
  for (const text of agreed)
    if (!granted.some((entry) => entry.language === text.language))
      differences.push({ kind: 'notGranted', language: text.language });
  return differences;
}
