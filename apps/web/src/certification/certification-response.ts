import {
  parseCertificateRelease,
  parseCertificateDraft,
  parseClientOpinion,
  parseDraftApproval,
  type CertificateRelease,
  type CertificateDraftValue,
  type ClientOpinionValue,
  type CertificateDraftApprovalValue,
} from './certification-release';
import {
  ATTRIBUTION_LIMITS,
  type ActAttribution,
} from './certification-attribution';
import {
  parseConsistency,
  type Consistency,
} from './certification-consistency';
import { parseExchanges, type Exchanges } from './certification-exchanges';
import {
  DECISION_LIMITS,
  DOSSIER_ITEMS,
  RECOMMENDATIONS,
  dossierComplete,
  sameCertificateTexts,
  type Certificate,
  type CertificateData,
  type CertificateText,
  type CertificationDecision,
  type DossierAnswer,
  type DossierItem,
  type DossierReview,
  type Recommendation,
} from './certification-decision';
import {
  DURATION_REFUSALS,
  DURATION_RULE_VERSION,
  DURATION_WARNINGS,
  INCREASE_FACTORS,
  REDUCTION_FACTORS,
  confirmedCents,
  confirmedStagesAddUp,
  durationJustificationRequired,
  exactUnits,
  proposedStagesAddUp,
  type ConfirmedDuration,
  type ConfirmedDurationField,
  type DurationComputation,
  type DurationDetermination,
  type DurationFactorInputs,
  type DurationProposal,
  type DurationRefusal,
  type DurationResult,
  type DurationWarning,
} from './certification-duration';
import {
  FINDING_CLASSIFICATIONS,
  FINDING_LIMITS,
  FINDING_STATUSES,
  classificationRefusal,
  findingBlocks,
  isNonconformity,
  replayFinding,
  type Finding,
  type FindingClassification,
  type FindingClassificationRecord,
  type FindingRecord,
  type FindingStatement,
  type FindingStatus,
  type NonconformityResponse,
  type NonconformityVerification,
  type PlanJudgment,
} from './certification-findings';
import {
  STAGE_LIMITS,
  stageDayCents,
  type Stage1Report,
  type Stage2Report,
  type StagePlan,
} from './certification-stages';
import {
  IMPARTIALITY_DECLARATIONS,
  TEAM_LIMITS,
  TEAM_ROLES,
  teamCompositionRefusal,
  teamWithoutConflict,
  type AuditTeam,
  type DeclarationState,
  type ImpartialityAnalysis,
  type ImpartialityDeclaration,
  type TeamDecision,
  type TeamMember,
} from './certification-team';

/** ISO 22003-1 food chain subcategories used by ISO 22000 certification. */
export const FOOD_CHAIN_SUBCATEGORIES = [
  'AI',
  'AII',
  'BI',
  'BII',
  'BIII',
  'C0',
  'CI',
  'CII',
  'CIII',
  'CIV',
  'D',
  'E',
  'FI',
  'FII',
  'G',
  'H',
  'I',
  'J',
  'K',
] as const;
export type FoodChainSubcategory = (typeof FOOD_CHAIN_SUBCATEGORIES)[number];

export const REVIEW_CRITERIA = [
  'scopeCertifiable',
  'competentTeamAvailable',
  'competentDecisionMakerAvailable',
  'risksAcceptable',
] as const;
export type ReviewCriterion = (typeof REVIEW_CRITERIA)[number];

/** The role an attached signed original plays in the Case dossier. */
export const CERTIFICATION_DOCUMENT_ROLES = [
  'questionnaire',
  'iso22000_annex',
  'agreement',
  'plan',
  'participant_list',
  'report',
  'evidence',
  'certificate',
  'certificate_data',
  'certificate_draft',
  'client_opinion',
  'decision_form',
  'correspondence',
  'other',
] as const;
export type CertificationDocumentRole =
  (typeof CERTIFICATION_DOCUMENT_ROLES)[number];

/** The server's bounds for application facts and review text. */
export const CERTIFICATION_LIMITS = {
  orderReference: 64,
  declaredLegalName: 300,
  declaredAddress: 500,
  siteText: 500,
  sites: 20,
  requestedScope: 2000,
  optionalText: 1000,
  consultantName: 300,
  auditLanguage: 40,
  auditLanguages: 5,
  preferredAuditPeriod: 200,
  reason: 2000,
  note: 1000,
  haccpStudyCount: 999,
  totalHeadcount: 100000,
  effectiveFte: 100000,
  shiftCount: 10,
  justification: 4000,
  haccpStudiesPerSubcategory: 999,
  factorPercent: 100,
  attachmentNote: 1000,
  sourceTitle: 200,
  pdfBytes: 5 * 1024 * 1024,
  /** The server's bound on the generated dossier register PDF. */
  registerPdfBytes: 16 * 1024 * 1024,
} as const;

export interface CertificationSite {
  address: string;
  activity: string;
}

export interface ApplicationFacts {
  /** The business date of the signed application, when known. */
  submittedOn: string | null;
  declaredLegalName: string;
  declaredAddress: string;
  sites: CertificationSite[];
  requestedScope: string;
  foodChainSubcategories: FoodChainSubcategory[];
  haccpStudyCount: number;
  totalHeadcount: number;
  effectiveFte: number;
  shiftCount: number;
  seasonalActivity: string | null;
  otherCertifiedSystems: string | null;
  outsourcedProcesses: string | null;
  consultant: { used: false } | { used: true; name: string };
  auditLanguages: string[];
  preferredAuditPeriod: string | null;
}

export interface ReviewAnswer {
  answer: 'yes' | 'no';
  note: string;
}

export type ApplicationReview = {
  criteria: Record<ReviewCriterion, ReviewAnswer>;
  /** The certification body's reviewer, when recorded on their behalf. */
  onBehalf: ActAttribution | null;
} & (
  | { outcome: 'accepted'; rejectionReason: null }
  | { outcome: 'rejected'; rejectionReason: string }
);

/** The signature date of the agreement and its attached signed original. */
export interface CertificationAgreement {
  /** A calendar date, `YYYY-MM-DD`. */
  signedOn: string;
  attachmentId: string;
}

export interface CertificationActorReference {
  workspaceMembershipId: string;
  displayName: string;
}

interface StepVersionBase {
  id: string;
  version: number;
  caseRevision: number;
  reason: string | null;
  recordedBy: CertificationActorReference;
  recordedAt: string;
}

export type StepVersion =
  | (StepVersionBase & { step: 'application'; value: ApplicationFacts })
  | (StepVersionBase & {
      step: 'application_review';
      value: ApplicationReview;
    })
  | (StepVersionBase & { step: 'duration'; value: DurationDetermination })
  | (StepVersionBase & { step: 'agreement'; value: CertificationAgreement })
  | (StepVersionBase & { step: 'team'; value: AuditTeam })
  | (StepVersionBase & { step: 'team_decision'; value: TeamDecision })
  | (StepVersionBase & { step: 'stage_1_plan'; value: StagePlan })
  | (StepVersionBase & { step: 'stage_1_report'; value: Stage1Report })
  | (StepVersionBase & { step: 'stage_2_plan'; value: StagePlan })
  | (StepVersionBase & { step: 'stage_2_report'; value: Stage2Report })
  | (StepVersionBase & { step: 'recommendation'; value: Recommendation })
  | (StepVersionBase & { step: 'dossier_review'; value: DossierReview })
  | (StepVersionBase & { step: 'decision'; value: CertificationDecision })
  | (StepVersionBase & { step: 'certificate_data'; value: CertificateData })
  | (StepVersionBase & {
      step: 'certificate_draft';
      value: CertificateDraftValue;
    })
  | (StepVersionBase & { step: 'client_opinion'; value: ClientOpinionValue })
  | (StepVersionBase & {
      step: 'certificate_draft_approval';
      value: CertificateDraftApprovalValue;
    });
export type ApplicationVersion = Extract<StepVersion, { step: 'application' }>;
export type ApplicationReviewVersion = Extract<
  StepVersion,
  { step: 'application_review' }
>;
export type DurationVersion = Extract<StepVersion, { step: 'duration' }>;
export type AgreementVersion = Extract<StepVersion, { step: 'agreement' }>;
export type TeamVersion = Extract<StepVersion, { step: 'team' }>;
export type TeamDecisionVersion = Extract<
  StepVersion,
  { step: 'team_decision' }
>;
export type Stage1PlanVersion = Extract<StepVersion, { step: 'stage_1_plan' }>;
export type Stage1ReportVersion = Extract<
  StepVersion,
  { step: 'stage_1_report' }
>;
export type Stage2PlanVersion = Extract<StepVersion, { step: 'stage_2_plan' }>;
export type Stage2ReportVersion = Extract<
  StepVersion,
  { step: 'stage_2_report' }
>;
export type StageStepVersion =
  | Stage1PlanVersion
  | Stage1ReportVersion
  | Stage2PlanVersion
  | Stage2ReportVersion;
export type RecommendationVersion = Extract<
  StepVersion,
  { step: 'recommendation' }
>;
export type DossierReviewVersion = Extract<
  StepVersion,
  { step: 'dossier_review' }
>;
export type DecisionVersion = Extract<StepVersion, { step: 'decision' }>;
export type CertificateDataVersion = Extract<
  StepVersion,
  { step: 'certificate_data' }
>;

/** The Stage steps in the order the server lists their latest versions. */
const STAGE_STEPS = [
  'stage_1_plan',
  'stage_1_report',
  'stage_2_plan',
  'stage_2_report',
] as const;

export type CertificationNextStep =
  | 'application'
  | 'application_review'
  | 'duration'
  | 'agreement'
  | 'team'
  | 'team_decision'
  | 'stage_1_plan'
  | 'stage_1_report'
  | 'stage_2_plan'
  | 'stage_2_report'
  | 'findings_follow_up'
  | 'recommendation'
  | 'dossier_review'
  | 'decision'
  | 'certificate_data'
  | 'certificate'
  | null;

/** Open, or closed by a rejection, a refusal or the recorded Certificate. */
export type CaseStatus = 'open' | 'rejected' | 'refused' | 'certified';

export interface CaseSummary {
  id: string;
  projectId: string;
  orderReference: string;
  clientLegalEntity: { id: string; legalName: string };
  standard: 'iso_22000_2018';
  auditType: 'initial_certification';
  status: CaseStatus;
  revision: number;
  nextStep: CertificationNextStep;
  openedBy: CertificationActorReference;
  openedAt: string;
}

export interface CaseDetail extends CaseSummary {
  companyId: string;
  clientAccountId: string;
  application: ApplicationVersion | null;
  applicationReview: ApplicationReviewVersion | null;
  duration: DurationVersion | null;
  agreement: AgreementVersion | null;
  /** The latest proposed audit team. */
  team: TeamVersion | null;
  /** The latest decision, which may concern an earlier team version. */
  teamDecision: TeamDecisionVersion | null;
  /** The latest version of each Stage plan and report, when recorded. */
  stage1Plan: Stage1PlanVersion | null;
  stage1Report: Stage1ReportVersion | null;
  stage2Plan: Stage2PlanVersion | null;
  stage2Report: Stage2ReportVersion | null;
  /** Every Finding of the Case in sequence order, with its records. */
  findings: Finding[];
  /** The latest version of each closing step, when recorded. */
  recommendation: RecommendationVersion | null;
  dossierReview: DossierReviewVersion | null;
  /** The latest version; a correction keeps the decided outcome. */
  decision: DecisionVersion | null;
  certificateData: CertificateDataVersion | null;
  /** The recorded Certificate, present exactly when the Case is certified. */
  certificate: Certificate | null;
  release: CertificateRelease;
  /** The Dossier Consistency Check over the Case's current records. */
  consistency: Consistency;
  /** The exchange register, its deadline states and the Re-verification Items. */
  exchanges: Exchanges;
}

/** One exact frozen PDF of the Case's Client, attached with its role. */
export interface CertificationAttachment {
  id: string;
  caseRevision: number;
  role: CertificationDocumentRole;
  documentId: string;
  versionId: string;
  representationId: string;
  versionNumber: number;
  sourceTitle: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  note: string | null;
  attachedBy: CertificationActorReference;
  attachedAt: string;
}

/** The Case's attachments in the order they were attached. */
export interface DocumentRegister {
  caseId: string;
  items: CertificationAttachment[];
}

/** A frozen received PDF of the Case's Client that may be attached. */
export interface EligibleDocument {
  documentId: string;
  versionId: string;
  versionNumber: number;
  representationId: string;
  sourceTitle: string;
}

export interface EligibleDocuments {
  caseId: string;
  items: EligibleDocument[];
  /** More PDFs exist than the server lists. */
  truncated: boolean;
}

export interface CaseList {
  projectId: string;
  cases: CaseSummary[];
  total: number;
}

export interface CaseTimeline {
  caseId: string;
  entries: StepVersion[];
}

export interface LegalEntityOption {
  id: string;
  legalName: string;
  taxId: string | null;
}

const MAX_LISTED = 100;
const MAX_TIMELINE = 500;
const MAX_ELIGIBLE = 25;

export function parseCaseList(value: unknown, projectId: string): CaseList {
  const body = object(value);
  if (
    body.projectId !== projectId ||
    !Array.isArray(body.cases) ||
    body.cases.length > MAX_LISTED
  )
    invalid();
  const cases = body.cases.map(parseCaseSummary);
  const total = count(body.total);
  if (
    total < cases.length ||
    cases.some((row) => row.projectId !== projectId) ||
    new Set(cases.map((row) => row.id)).size !== cases.length
  )
    invalid();
  return { projectId, cases, total };
}

/** A command reply is acknowledged before a fresh authoritative Case read. */
export function parseCaseCommandReceipt(
  value: unknown,
  scope: { companyId: string; projectId: string; caseId?: string },
): Pick<CaseDetail, 'id' | 'revision'> {
  // Receipts are immutable and can predate additions to the live read model.
  // Acknowledgement needs only the scoped identity and recorded revision;
  // the caller reloads the live Case instead of displaying the receipt.
  const body = object(value);
  const id = text(body.id);
  if (
    body.companyId !== scope.companyId ||
    body.projectId !== scope.projectId ||
    (scope.caseId !== undefined && id !== scope.caseId)
  )
    invalid();
  return { id, revision: positive(body.revision) };
}

export function parseCaseDetail(
  value: unknown,
  scope: { companyId: string; projectId: string; caseId?: string },
): CaseDetail {
  const body = object(value);
  const summary = parseCaseSummary(body);
  if (
    body.companyId !== scope.companyId ||
    summary.projectId !== scope.projectId ||
    (scope.caseId !== undefined && summary.id !== scope.caseId)
  )
    invalid();
  const detail: CaseDetail = {
    ...summary,
    companyId: scope.companyId,
    clientAccountId: text(body.clientAccountId),
    application:
      body.application === null ? null : applicationVersion(body.application),
    applicationReview:
      body.applicationReview === null
        ? null
        : reviewVersion(body.applicationReview),
    duration: body.duration === null ? null : durationVersion(body.duration),
    agreement:
      body.agreement === null ? null : agreementVersion(body.agreement),
    team: body.team === null ? null : teamVersion(body.team),
    teamDecision:
      body.teamDecision === null
        ? null
        : teamDecisionVersion(body.teamDecision),
    ...stageVersions(body.stages),
    findings: findingList(body.findings),
    recommendation:
      body.recommendation === null
        ? null
        : recommendationVersion(body.recommendation),
    dossierReview:
      body.dossierReview === null
        ? null
        : dossierReviewVersion(body.dossierReview),
    decision: body.decision === null ? null : decisionVersion(body.decision),
    certificateData:
      body.certificateData === null
        ? null
        : certificateDataVersion(body.certificateData),
    certificate:
      body.certificate === null ? null : certificateValue(body.certificate),
    release:
      body.release === undefined
        ? legacyRelease(body.certificate)
        : parseCertificateRelease(body.release),
    consistency: parseConsistency(body.consistency),
    exchanges: parseExchanges(body.exchanges),
  };
  if (!consistent(detail)) invalid();
  return detail;
}

/**
 * The latest version of each recorded Stage step, each step at most once
 * and in the server's order.
 */
function stageVersions(
  value: unknown,
): Pick<
  CaseDetail,
  'stage1Plan' | 'stage1Report' | 'stage2Plan' | 'stage2Report'
> {
  const versions = list(value, 0, STAGE_STEPS.length).map(parseStepVersion);
  const order = versions.map((version) =>
    STAGE_STEPS.findIndex((step) => step === version.step),
  );
  // Each Stage step at most once, in the server's order.
  if (
    order.some(
      (position, index) =>
        position <= (order[index - 1] ?? Number.NEGATIVE_INFINITY),
    )
  )
    invalid();
  const stages: Pick<
    CaseDetail,
    'stage1Plan' | 'stage1Report' | 'stage2Plan' | 'stage2Report'
  > = {
    stage1Plan: null,
    stage1Report: null,
    stage2Plan: null,
    stage2Report: null,
  };
  for (const version of versions)
    switch (version.step) {
      case 'stage_1_plan':
        stages.stage1Plan = version;
        break;
      case 'stage_1_report':
        stages.stage1Report = version;
        break;
      case 'stage_2_plan':
        stages.stage2Plan = version;
        break;
      case 'stage_2_report':
        stages.stage2Report = version;
        break;
      default:
        // Another step listed among the Stage records.
        invalid();
    }
  return stages;
}

/** The duration-proposal read: a proposal, a manual case or its refusals. */
export function parseDurationResult(value: unknown): DurationResult {
  const body = object(value);
  if (body.kind !== 'refused') return durationComputation(body);
  const refusals = list(body.refusals, 1, DURATION_REFUSALS.length).map(
    refusalCode,
  );
  if (new Set(refusals).size !== refusals.length) invalid();
  return { kind: 'refused', refusals };
}

function applicationVersion(value: unknown): ApplicationVersion {
  const version = parseStepVersion(value);
  return version.step === 'application' ? version : invalid();
}

function reviewVersion(value: unknown): ApplicationReviewVersion {
  const version = parseStepVersion(value);
  return version.step === 'application_review' ? version : invalid();
}

function durationVersion(value: unknown): DurationVersion {
  const version = parseStepVersion(value);
  return version.step === 'duration' ? version : invalid();
}

function agreementVersion(value: unknown): AgreementVersion {
  const version = parseStepVersion(value);
  return version.step === 'agreement' ? version : invalid();
}

function teamVersion(value: unknown): TeamVersion {
  const version = parseStepVersion(value);
  return version.step === 'team' ? version : invalid();
}

function teamDecisionVersion(value: unknown): TeamDecisionVersion {
  const version = parseStepVersion(value);
  return version.step === 'team_decision' ? version : invalid();
}

function recommendationVersion(value: unknown): RecommendationVersion {
  const version = parseStepVersion(value);
  return version.step === 'recommendation' ? version : invalid();
}

function dossierReviewVersion(value: unknown): DossierReviewVersion {
  const version = parseStepVersion(value);
  return version.step === 'dossier_review' ? version : invalid();
}

function decisionVersion(value: unknown): DecisionVersion {
  const version = parseStepVersion(value);
  return version.step === 'decision' ? version : invalid();
}

function certificateDataVersion(value: unknown): CertificateDataVersion {
  const version = parseStepVersion(value);
  return version.step === 'certificate_data' ? version : invalid();
}

/** The Case's attachments, each at its own revision, in attachment order. */
export function parseDocumentRegister(
  value: unknown,
  caseId: string,
): DocumentRegister {
  const body = object(value);
  if (
    body.caseId !== caseId ||
    !Array.isArray(body.items) ||
    body.items.length > MAX_TIMELINE
  )
    invalid();
  const items = body.items.map(attachment);
  for (let index = 1; index < items.length; index++) {
    const previous = items[index - 1],
      current = items[index];
    if (!previous || !current || previous.caseRevision >= current.caseRevision)
      invalid();
  }
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    new Set(items.map(sourceKey)).size !== items.length
  )
    invalid();
  return { caseId, items };
}

/** The frozen received PDFs of the Case's Client, at most one page. */
export function parseEligibleDocuments(
  value: unknown,
  caseId: string,
): EligibleDocuments {
  const body = object(value);
  if (
    body.caseId !== caseId ||
    !Array.isArray(body.items) ||
    body.items.length > MAX_ELIGIBLE ||
    typeof body.truncated !== 'boolean'
  )
    invalid();
  const items = body.items.map((item): EligibleDocument => {
    const row = object(item);
    return {
      documentId: text(row.documentId),
      versionId: text(row.versionId),
      versionNumber: positive(row.versionNumber),
      representationId: text(row.representationId),
      sourceTitle: text(row.sourceTitle, CERTIFICATION_LIMITS.sourceTitle),
    };
  });
  // The server reads one item beyond the page only to report truncation.
  if (
    (body.truncated && items.length !== MAX_ELIGIBLE) ||
    new Set(items.map(sourceKey)).size !== items.length
  )
    invalid();
  return { caseId, items, truncated: body.truncated };
}

/** The exact source of a PDF: its Document, Version and Representation. */
export function sourceKey(source: {
  documentId: string;
  versionId: string;
  representationId: string;
}): string {
  return JSON.stringify([
    source.documentId,
    source.versionId,
    source.representationId,
  ]);
}

/** A real calendar date written `YYYY-MM-DD`, as the server accepts it. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith('0000-'))
    return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function parseTimeline(value: unknown, caseId: string): CaseTimeline {
  const body = object(value);
  if (
    body.caseId !== caseId ||
    !Array.isArray(body.entries) ||
    body.entries.length > MAX_TIMELINE
  )
    invalid();
  const entries = body.entries.map(parseStepVersion);
  for (let index = 1; index < entries.length; index++) {
    const previous = entries[index - 1],
      current = entries[index];
    if (!previous || !current || previous.caseRevision >= current.caseRevision)
      invalid();
  }
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
    invalid();
  // A correction of the Certification Decision keeps its outcome.
  const outcomes = new Set(
    entries.flatMap((entry) =>
      entry.step === 'decision' ? [entry.value.decision] : [],
    ),
  );
  if (outcomes.size > 1) invalid();
  return { caseId, entries };
}

export function parseLegalEntityOptions(
  value: unknown,
  projectId: string,
): LegalEntityOption[] {
  const body = object(value);
  if (
    body.projectId !== projectId ||
    !Array.isArray(body.items) ||
    body.items.length > MAX_LISTED
  )
    invalid();
  const items = body.items.map((item) => {
    const row = object(item);
    return {
      id: text(row.id),
      legalName: text(row.legalName),
      taxId: row.taxId === null ? null : text(row.taxId),
    };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length) invalid();
  return items;
}

function parseCaseSummary(value: unknown): CaseSummary {
  const row = object(value);
  const entity = object(row.clientLegalEntity);
  if (
    row.standard !== 'iso_22000_2018' ||
    row.auditType !== 'initial_certification'
  )
    invalid();
  const status = caseStatus(row.status);
  const nextStep = parseNextStep(row.nextStep);
  // Only a closed Case has no next step.
  if ((status !== 'open') !== (nextStep === null)) invalid();
  return {
    id: text(row.id),
    projectId: text(row.projectId),
    orderReference: text(
      row.orderReference,
      CERTIFICATION_LIMITS.orderReference,
    ),
    clientLegalEntity: {
      id: text(entity.id),
      legalName: text(entity.legalName),
    },
    standard: 'iso_22000_2018',
    auditType: 'initial_certification',
    status,
    revision: positive(row.revision),
    nextStep,
    openedBy: actorReference(row.openedBy),
    openedAt: instant(row.openedAt),
  };
}

function parseNextStep(value: unknown): CertificationNextStep {
  switch (value) {
    case null:
    case 'application':
    case 'application_review':
    case 'duration':
    case 'agreement':
    case 'team':
    case 'team_decision':
    case 'stage_1_plan':
    case 'stage_1_report':
    case 'stage_2_plan':
    case 'stage_2_report':
    case 'findings_follow_up':
    case 'recommendation':
    case 'dossier_review':
    case 'decision':
    case 'certificate_data':
    case 'certificate':
      return value;
    default:
      return invalid();
  }
}

function caseStatus(value: unknown): CaseStatus {
  switch (value) {
    case 'open':
    case 'rejected':
    case 'refused':
    case 'certified':
      return value;
    default:
      return invalid();
  }
}

/** The server derives status and next step from the recorded steps. */
function consistent(detail: CaseDetail): boolean {
  if (!releaseConsistent(detail)) return false;
  const {
    application,
    applicationReview: review,
    duration,
    agreement,
    team,
    teamDecision: decision,
  } = detail;
  if (review && !application) return false;
  // A duration is determined only once the review accepted the application.
  if (duration && review?.value.outcome !== 'accepted') return false;
  // Steps are recorded in order, each at a revision the Case has reached:
  // the first application precedes the review, which precedes every
  // duration. A later application version may correct the facts after the
  // review, until the decision; the consistency check compares them (R01).
  if (
    [application, review, duration].some(
      (version) => version !== null && version.caseRevision > detail.revision,
    ) ||
    (application !== null &&
      review !== null &&
      application.version === 1 &&
      application.caseRevision >= review.caseRevision) ||
    (review !== null &&
      duration !== null &&
      duration.caseRevision <= review.caseRevision)
  )
    return false;
  if (agreement) {
    // An agreement needs a confirmed duration. A later correction may replace
    // that duration, but the first determination precedes the agreement.
    if (
      !review ||
      !duration ||
      agreement.caseRevision > detail.revision ||
      agreement.caseRevision <= review.caseRevision ||
      agreement.caseRevision === duration.caseRevision ||
      (duration.version === 1 && duration.caseRevision > agreement.caseRevision)
    )
      return false;
  }
  if (team) {
    // A team is proposed once the agreement is recorded. A later correction
    // may replace that agreement, but the first record precedes every team.
    if (
      !agreement ||
      !review ||
      team.caseRevision > detail.revision ||
      team.caseRevision <= review.caseRevision ||
      team.caseRevision === agreement.caseRevision ||
      (agreement.version === 1 && agreement.caseRevision > team.caseRevision)
    )
      return false;
  }
  if (decision) {
    // A decision concerns the team version then latest, each version at most
    // once and in order: it follows its own team version and precedes any
    // later one. An approval needs a team without a declared conflict.
    const decided = decision.value;
    if (
      !team ||
      decision.caseRevision > detail.revision ||
      decision.caseRevision === team.caseRevision ||
      decided.teamVersion > team.version ||
      decision.version > decided.teamVersion ||
      (decided.teamVersion === team.version) !==
        decision.caseRevision > team.caseRevision ||
      (decided.teamVersion === team.version &&
        decided.decision === 'approved' &&
        !teamWithoutConflict(team.value))
    )
      return false;
  }
  if (
    !stagesConsistent(detail) ||
    !findingsConsistent(detail) ||
    !closingConsistent(detail)
  )
    return false;
  const outcome = detail.decision?.value.decision;
  switch (detail.status) {
    case 'rejected':
      return review?.value.outcome === 'rejected' && detail.nextStep === null;
    // A closed Case has no next step (read with its summary), and a
    // Certificate only follows a grant (checked with the closing steps).
    case 'refused':
      return outcome === 'refused';
    case 'certified':
      return detail.certificate !== null;
    case 'open':
      return (
        review?.value.outcome !== 'rejected' &&
        outcome !== 'refused' &&
        detail.certificate === null &&
        detail.nextStep === expectedNextStep(detail)
      );
  }
  return unexpectedValue(detail.status);
}

/** A first version of `earlier` precedes `later`; a correction may come after. */
function follows(
  later: { caseRevision: number } | null,
  earlier: { version: number; caseRevision: number } | null,
): boolean {
  return (
    later === null ||
    (earlier !== null &&
      !(earlier.version === 1 && earlier.caseRevision > later.caseRevision))
  );
}

/**
 * The closing steps follow their predecessors: the recommendation and the
 * Certificate data follow the Stage 2 report and the dossier review the
 * recommendation. The decision follows every version of both, which it
 * freezes, on a review without a missing item, and grants only on a
 * recommendation to grant; a correction keeps its outcome. A Certificate is valid from the
 * decision date, ends after its first surveillance and states exactly the
 * agreed texts, which state what the decision grants.
 */
function closingConsistent(detail: CaseDetail): boolean {
  const {
    stage2Report,
    recommendation,
    dossierReview: review,
    decision,
    certificateData: data,
    certificate,
  } = detail;
  if (
    !follows(recommendation, stage2Report) ||
    !follows(data, stage2Report) ||
    !follows(review, recommendation)
  )
    return false;
  if (decision) {
    const decided = decision.value;
    if (
      !recommendation ||
      !review ||
      recommendation.caseRevision > decision.caseRevision ||
      review.caseRevision > decision.caseRevision ||
      !dossierComplete(review.value) ||
      (decided.decision === 'granted' &&
        recommendation.value.recommendation !== 'grant')
    )
      return false;
  }
  if (!certificate) return true;
  const granted = decision?.value;
  return (
    granted?.decision === 'granted' &&
    data !== null &&
    certificate.validFrom === granted.decidedOn &&
    certificate.validFrom < certificate.firstSurveillanceBy &&
    certificate.firstSurveillanceBy < certificate.validUntil &&
    JSON.stringify(certificate.texts) === JSON.stringify(data.value.texts) &&
    sameCertificateTexts(certificate.texts, granted.grantedTexts)
  );
}

/**
 * Stage records follow an approved team: the first decision approves the
 * first team and precedes the first plan, since a later team version may
 * await its own decision while the plans stay. Each report follows its plan
 * and Stage 2 follows a Stage 1 report; a correction may come later, but a
 * first version precedes what depends on it. Every step version is recorded
 * at its own revision, which the Case has reached.
 */
function stagesConsistent(detail: CaseDetail): boolean {
  const {
    teamDecision: decision,
    stage1Plan,
    stage1Report,
    stage2Plan,
    stage2Report,
  } = detail;
  const versions = stepRevisions(detail);
  if (
    new Set(versions).size !== versions.length ||
    versions.some((revision) => revision > detail.revision)
  )
    return false;
  if (!stage1Plan) return !stage1Report && !stage2Plan && !stage2Report;
  if (
    !decision ||
    (decision.version === 1 &&
      (decision.value.decision !== 'approved' ||
        decision.caseRevision > stage1Plan.caseRevision))
  )
    return false;
  return (
    follows(stage1Report, stage1Plan) &&
    follows(stage2Plan, stage1Report) &&
    follows(stage2Report, stage2Plan)
  );
}

/** The revisions of the latest step versions the Case read lists. */
function stepRevisions(detail: CaseDetail): number[] {
  return [
    detail.application,
    detail.applicationReview,
    detail.duration,
    detail.agreement,
    detail.team,
    detail.teamDecision,
    detail.stage1Plan,
    detail.stage1Report,
    detail.stage2Plan,
    detail.stage2Report,
    detail.recommendation,
    detail.dossierReview,
    detail.decision,
    detail.certificateData,
  ].flatMap((version) => (version ? [version.caseRevision] : []));
}

/**
 * Findings follow their Stage: each is created, in sequence order, once the
 * first plan of its Stage is recorded, and a Stage 1 Finding before the first
 * Stage 2 plan. Each command records at its own revision, which the Case has
 * reached: a Finding's records share no revision with a step version or with
 * another Finding.
 */
function findingsConsistent(detail: CaseDetail): boolean {
  const steps = new Set(stepRevisions(detail));
  const used = new Set<number>();
  let previousCreation = 0;
  for (const finding of detail.findings) {
    const plan =
      finding.stage === 'stage_1' ? detail.stage1Plan : detail.stage2Plan;
    const created = finding.records[0]?.caseRevision;
    if (!plan || created === undefined || created <= previousCreation)
      return false;
    previousCreation = created;
    if (plan.version === 1 && plan.caseRevision > created) return false;
    const stage2Plan = detail.stage2Plan;
    if (
      finding.stage === 'stage_1' &&
      stage2Plan?.version === 1 &&
      stage2Plan.caseRevision < created
    )
      return false;
    for (const revision of new Set(
      finding.records.map((record) => record.caseRevision),
    )) {
      if (
        revision > detail.revision ||
        steps.has(revision) ||
        used.has(revision)
      )
        return false;
      used.add(revision);
    }
  }
  return true;
}

/** The server's derivation of the next step of an open Case. */
function expectedNextStep(detail: CaseDetail): CertificationNextStep {
  if (!detail.application) return 'application';
  if (!detail.applicationReview) return 'application_review';
  if (!detail.duration) return 'duration';
  if (!detail.agreement) return 'agreement';
  const { team, teamDecision: decision } = detail;
  if (!team) return 'team';
  if (!decision || decision.value.teamVersion !== team.version)
    return 'team_decision';
  if (decision.value.decision === 'returned') return 'team';
  if (!detail.stage1Plan) return 'stage_1_plan';
  if (detail.stage1Report?.value.conclusion !== 'ready')
    return 'stage_1_report';
  if (!detail.stage2Plan) return 'stage_2_plan';
  if (!detail.stage2Report) return 'stage_2_report';
  if (detail.findings.some(findingBlocks)) return 'findings_follow_up';
  if (!detail.recommendation) return 'recommendation';
  if (!detail.certificateData) return 'certificate_data';
  if (!detail.dossierReview) return 'dossier_review';
  if (!detail.decision) return 'decision';
  return 'certificate';
}

function parseStepVersion(value: unknown): StepVersion {
  const row = object(value);
  const base = {
    id: text(row.id),
    version: positive(row.version),
    caseRevision: positive(row.caseRevision),
    reason:
      row.reason === null
        ? null
        : text(row.reason, CERTIFICATION_LIMITS.reason),
    recordedBy: actorReference(row.recordedBy),
    recordedAt: instant(row.recordedAt),
  };
  if (row.step === 'application') {
    // Only a correction states a reason; the first version never does.
    if ((base.version === 1) !== (base.reason === null)) invalid();
    return { ...base, step: 'application', value: applicationFacts(row.value) };
  }
  if (row.step === 'application_review') {
    if (base.version !== 1 || base.reason !== null) invalid();
    return {
      ...base,
      step: 'application_review',
      value: applicationReview(row.value),
    };
  }
  if (row.step === 'duration') {
    // A correction of a confirmed determination states its reason.
    if ((base.version === 1) !== (base.reason === null)) invalid();
    return {
      ...base,
      step: 'duration',
      value: durationDetermination(row.value),
    };
  }
  if (row.step === 'agreement') {
    // A correction of a recorded agreement states its reason.
    if ((base.version === 1) !== (base.reason === null)) invalid();
    return { ...base, step: 'agreement', value: agreementValue(row.value) };
  }
  if (row.step === 'team') {
    // A new team version states why it replaces the earlier one.
    if ((base.version === 1) !== (base.reason === null)) invalid();
    return { ...base, step: 'team', value: auditTeam(row.value) };
  }
  if (row.step === 'team_decision') {
    // A decision is not a correction: its own reason lives in its value.
    if (base.reason !== null) invalid();
    return {
      ...base,
      step: 'team_decision',
      value: teamDecisionValue(row.value),
    };
  }
  // A new version of a Stage record, a recommendation, a dossier review,
  // the Certification Decision or the Certificate data states why it
  // replaces the latest.
  const stage = { ...base, reason: correctionReasonOf(base) };
  switch (row.step) {
    case 'stage_1_plan':
      return {
        ...stage,
        step: 'stage_1_plan',
        value: stagePlanValue(row.value),
      };
    case 'stage_2_plan':
      return {
        ...stage,
        step: 'stage_2_plan',
        value: stagePlanValue(row.value),
      };
    case 'stage_1_report':
      return {
        ...stage,
        step: 'stage_1_report',
        value: stage1ReportValue(row.value),
      };
    case 'stage_2_report':
      return {
        ...stage,
        step: 'stage_2_report',
        value: stage2ReportValue(row.value),
      };
    case 'recommendation':
      return {
        ...stage,
        step: 'recommendation',
        value: recommendationValue(row.value),
      };
    case 'dossier_review':
      return {
        ...stage,
        step: 'dossier_review',
        value: dossierReviewValue(row.value),
      };
    case 'decision':
      return { ...stage, step: 'decision', value: decisionValue(row.value) };
    case 'certificate_draft':
      return {
        ...stage,
        step: 'certificate_draft',
        value: parseCertificateDraft(row.value),
      };
    case 'client_opinion':
      return {
        ...stage,
        step: 'client_opinion',
        value: parseClientOpinion(row.value),
      };
    case 'certificate_draft_approval':
      return {
        ...stage,
        step: 'certificate_draft_approval',
        value: parseDraftApproval(row.value),
      };
    case 'certificate_data':
      return {
        ...stage,
        step: 'certificate_data',
        value: certificateDataValue(row.value),
      };
    default:
      return invalid();
  }
}

function recommendationValue(value: unknown): Recommendation {
  const body = object(value);
  return {
    recommendation:
      RECOMMENDATIONS.find((entry) => entry === body.recommendation) ??
      invalid(),
    basis: text(body.basis, DECISION_LIMITS.basis),
    recommendedOn: optionalDate(body.recommendedOn),
  };
}

/** Every dossier item answered explicitly; a missing one states its note. */
function dossierReviewValue(value: unknown): DossierReview {
  const body = object(value);
  const itemsBody = object(body.items);
  if (
    Object.keys(itemsBody).some(
      (key) => !DOSSIER_ITEMS.some((item) => item === key),
    )
  )
    invalid();
  const answer = (item: DossierItem): DossierAnswer => {
    const entry = object(itemsBody[item]);
    const note = optionalText(entry.note, DECISION_LIMITS.note);
    const given = entry.answer;
    if (given === 'present' || given === 'not_applicable')
      return { answer: given, note };
    if (given === 'missing' && note !== null) return { answer: given, note };
    return invalid();
  };
  return {
    items: {
      application: answer('application'),
      application_review: answer('application_review'),
      duration: answer('duration'),
      agreement: answer('agreement'),
      team_approval: answer('team_approval'),
      stage_1_plan: answer('stage_1_plan'),
      stage_1_report: answer('stage_1_report'),
      stage_2_plan: answer('stage_2_plan'),
      stage_2_report: answer('stage_2_report'),
      participant_lists: answer('participant_lists'),
      findings_follow_up: answer('findings_follow_up'),
      recommendation: answer('recommendation'),
      certificate_data: answer('certificate_data'),
    },
    conclusion: text(body.conclusion, DECISION_LIMITS.conclusion),
    reviewedBy: actAttribution(body.reviewedBy),
    approvedBy: actAttribution(body.approvedBy),
    independenceAttested: attestation(body.independenceAttested),
  };
}

/** The attested decision; a grant fixes its texts, a refusal states none. */
function decisionValue(value: unknown): CertificationDecision {
  const body = object(value);
  if (body.independenceAttested !== true) invalid();
  const facts = {
    decidedOn: calendarDate(body.decidedOn),
    decidedBy: text(body.decidedBy, DECISION_LIMITS.person),
    decidedByFunction: optionalText(
      body.decidedByFunction,
      DECISION_LIMITS.person,
    ),
    decisionFormAttachmentId: optionalText(
      body.decisionFormAttachmentId,
      Number.MAX_SAFE_INTEGER,
    ),
    independenceAttested: true,
    rationale: text(body.rationale, DECISION_LIMITS.rationale),
    additionalInformation: optionalText(
      body.additionalInformation,
      DECISION_LIMITS.additionalInformation,
    ),
  } satisfies Omit<CertificationDecision, 'decision' | 'grantedTexts'>;
  if (body.decision === 'granted')
    return {
      ...facts,
      decision: 'granted',
      grantedTexts: certificateTexts(body.grantedTexts),
    };
  if (body.decision === 'refused' && body.grantedTexts === null)
    return { ...facts, decision: 'refused', grantedTexts: null };
  return invalid();
}

function certificateDataValue(value: unknown): CertificateData {
  const body = object(value);
  return {
    texts: certificateTexts(body.texts),
    agreedOn: calendarDate(body.agreedOn),
    agreementAttachmentId: text(body.agreementAttachmentId),
  };
}

/** One to four Certificate texts, at most one per language. */
function certificateTexts(value: unknown): CertificateText[] {
  const texts = list(value, 1, DECISION_LIMITS.texts).map((entry) => {
    const body = object(entry);
    return {
      language: text(body.language, DECISION_LIMITS.language),
      holderName: text(body.holderName, DECISION_LIMITS.holderName),
      address: text(body.address, DECISION_LIMITS.address),
      scope: text(body.scope, DECISION_LIMITS.scope),
    };
  });
  if (new Set(texts.map((entry) => entry.language)).size !== texts.length)
    invalid();
  return texts;
}

/** The recorded Certificate with the validity the server computed. */
function certificateValue(value: unknown): Certificate {
  const row = object(value);
  const issuedOn = optionalDate(row.issuedOn);
  const approvedDraftVersionId =
    row.approvedDraftVersionId === undefined ||
    row.approvedDraftVersionId === null
      ? null
      : text(row.approvedDraftVersionId);
  const base = {
    id: text(row.id),
    number: text(row.number, DECISION_LIMITS.number),
    validFrom: calendarDate(row.validFrom),
    validUntil: calendarDate(row.validUntil),
    firstSurveillanceBy: calendarDate(row.firstSurveillanceBy),
    texts: certificateTexts(row.texts),
    signedBy: optionalText(row.signedBy, DECISION_LIMITS.person),
    signedByFunction: optionalText(
      row.signedByFunction,
      DECISION_LIMITS.person,
    ),
    // The server stores and returns it with every Certificate.
    independenceAttested: flag(row.independenceAttested),
    attachmentId: text(row.attachmentId),
    recordedBy: actorReference(row.recordedBy),
    recordedAt: instant(row.recordedAt),
  };
  if (issuedOn === null) {
    if (approvedDraftVersionId !== null) return invalid();
    return { ...base, issuedOn: null, approvedDraftVersionId: null };
  }
  if (approvedDraftVersionId === null) return invalid();
  return { ...base, issuedOn, approvedDraftVersionId };
}

/** Only a correction states a reason; the first version never does. */
function correctionReasonOf(base: {
  version: number;
  reason: string | null;
}): string | null {
  if ((base.version === 1) !== (base.reason === null)) invalid();
  return base.reason;
}

function stagePlanValue(value: unknown): StagePlan {
  const body = object(value);
  const plan: StagePlan = {
    startDate: calendarDate(body.startDate),
    endDate: calendarDate(body.endDate),
    onSiteDays: dayAmount(body.onSiteDays, false),
    remoteDays: dayAmount(body.remoteDays, true),
    objectives: text(body.objectives, STAGE_LIMITS.objectives),
    scope: text(body.scope, STAGE_LIMITS.scope),
    planAttachmentId: text(body.planAttachmentId),
    sentToClientOn:
      body.sentToClientOn === null ? null : calendarDate(body.sentToClientOn),
    deviationNote: optionalText(body.deviationNote, STAGE_LIMITS.deviationNote),
  };
  // ISO calendar dates compare in calendar order.
  if (plan.startDate > plan.endDate) invalid();
  return plan;
}

function stage1ReportValue(value: unknown): Stage1Report {
  const body = object(value);
  if (body.documentReviewCompleted !== true) invalid();
  const conclusion =
    body.conclusion === 'ready' || body.conclusion === 'not_ready'
      ? body.conclusion
      : invalid();
  return {
    reportDate: calendarDate(body.reportDate),
    documentReviewCompleted: true,
    conclusion,
    conclusionNote: text(body.conclusionNote, STAGE_LIMITS.conclusionNote),
    reportAttachmentId: text(body.reportAttachmentId),
    participantListAttachmentId: optionalText(
      body.participantListAttachmentId,
      Number.MAX_SAFE_INTEGER,
    ),
    certificationBodyApproval: actAttribution(body.certificationBodyApproval),
  };
}

function stage2ReportValue(value: unknown): Stage2Report {
  const body = object(value);
  return {
    reportDate: calendarDate(body.reportDate),
    summary: text(body.summary, STAGE_LIMITS.summary),
    reportAttachmentId: text(body.reportAttachmentId),
    participantListAttachmentId: optionalText(
      body.participantListAttachmentId,
      Number.MAX_SAFE_INTEGER,
    ),
    annexAttachmentId: optionalText(
      body.annexAttachmentId,
      Number.MAX_SAFE_INTEGER,
    ),
    certificationBodyApproval: actAttribution(body.certificationBodyApproval),
  };
}

/** Every Finding in sequence order: 1, 2, 3… as the server numbers them. */
function findingList(value: unknown): Finding[] {
  const findings = list(value, 0, MAX_TIMELINE).map(findingValue);
  if (
    findings.some((finding, index) => finding.sequence !== index + 1) ||
    new Set(findings.map((finding) => finding.id)).size !== findings.length
  )
    invalid();
  return findings;
}

/**
 * One Finding: its records in Case order, and the statement, classification
 * and status the server derives from them, which must equal their replay.
 * The current classification holds the server's rules for the current
 * statement. The server's dates are read as given: present exactly for the
 * nonconformities it dates, and overdue only before a verified effect.
 */
function findingValue(value: unknown): Finding {
  const row = object(value);
  const stage =
    row.stage === 'stage_1' || row.stage === 'stage_2' ? row.stage : invalid();
  const records = list(row.records, 2, MAX_TIMELINE).map(findingRecord);
  if (!recordsInOrder(records)) invalid();
  const replay = replayFinding(records) ?? invalid();
  const statement = findingStatement(row.statement);
  const classification = findingClassification(row.classification);
  const status = findingStatus(row.status);
  if (
    JSON.stringify(statement) !== JSON.stringify(replay.statement) ||
    classification !== replay.classification ||
    status !== replay.status ||
    classificationRefusal(classification, stage, statement) !== null
  )
    invalid();
  const responseDueOn =
    row.responseDueOn === null ? null : calendarDate(row.responseDueOn);
  const limitOn = row.limitOn === null ? null : calendarDate(row.limitOn);
  const nonconformity = isNonconformity(classification);
  const limited =
    nonconformity &&
    (stage === 'stage_1' || classification === 'major_nonconformity');
  if (
    (responseDueOn !== null) !== nonconformity ||
    (limitOn !== null) !== limited ||
    typeof row.overdue !== 'boolean' ||
    (row.overdue && (limitOn === null || status === 'verified_effective'))
  )
    invalid();
  return {
    id: text(row.id),
    stage,
    sequence: positive(row.sequence),
    statement,
    classification,
    status,
    responseDueOn,
    limitOn,
    overdue: row.overdue,
    records,
  };
}

/**
 * A Finding is created with its first statement and classification at one
 * revision, in either order; every later record follows at its own later
 * revision; each kind's versions count 1, 2, 3… in order.
 */
function recordsInOrder(records: readonly FindingRecord[]): boolean {
  const [first, second, ...later] = records;
  if (
    !first ||
    !second ||
    first.caseRevision !== second.caseRevision ||
    first.kind === second.kind ||
    (first.kind !== 'statement' && first.kind !== 'classification') ||
    (second.kind !== 'statement' && second.kind !== 'classification')
  )
    return false;
  let previous = first.caseRevision;
  for (const record of later) {
    if (record.caseRevision <= previous) return false;
    previous = record.caseRevision;
  }
  const versions = new Map<FindingRecord['kind'], number>();
  for (const record of records) {
    const expected = (versions.get(record.kind) ?? 0) + 1;
    if (record.version !== expected) return false;
    versions.set(record.kind, expected);
  }
  return true;
}

/**
 * A later statement or classification version states its reason; a first
 * one never does, and only the team leader classifies first. A response,
 * judgment or verification carries no correction reason.
 */
function findingRecord(value: unknown): FindingRecord {
  const row = object(value);
  const base = {
    id: text(row.id),
    version: positive(row.version),
    caseRevision: positive(row.caseRevision),
    reason:
      row.reason === null
        ? null
        : text(row.reason, CERTIFICATION_LIMITS.reason),
    recordedBy: actorReference(row.recordedBy),
    recordedAt: instant(row.recordedAt),
  };
  switch (row.kind) {
    case 'statement':
      return {
        ...base,
        reason: correctionReasonOf(base),
        kind: 'statement',
        value: findingStatement(row.value),
      };
    case 'classification': {
      const classified = classificationRecord(row.value);
      if (base.version === 1 && classified.by !== 'team_leader') invalid();
      return {
        ...base,
        reason: correctionReasonOf(base),
        kind: 'classification',
        value: classified,
      };
    }
    case 'response':
      return {
        ...base,
        reason: withoutReason(base),
        kind: 'response',
        value: nonconformityResponse(row.value),
      };
    case 'plan_judgment':
      return {
        ...base,
        reason: withoutReason(base),
        kind: 'plan_judgment',
        value: planJudgment(row.value),
      };
    case 'verification':
      return {
        ...base,
        reason: withoutReason(base),
        kind: 'verification',
        value: nonconformityVerification(row.value),
      };
    default:
      return invalid();
  }
}

function withoutReason(base: { reason: string | null }): null {
  return base.reason === null ? null : invalid();
}

function findingStatement(value: unknown): FindingStatement {
  const body = object(value);
  return {
    clause: optionalText(body.clause, FINDING_LIMITS.clause),
    area: optionalText(body.area, FINDING_LIMITS.area),
    statement: text(body.statement, FINDING_LIMITS.statement),
    evidenceAttachmentIds: evidence(body.evidenceAttachmentIds),
  };
}

function classificationRecord(value: unknown): FindingClassificationRecord {
  const body = object(value);
  const by =
    body.by === 'team_leader' || body.by === 'approver' ? body.by : invalid();
  return { classification: findingClassification(body.classification), by };
}

function nonconformityResponse(value: unknown): NonconformityResponse {
  const body = object(value);
  return {
    correction: text(body.correction, FINDING_LIMITS.responseText),
    cause: text(body.cause, FINDING_LIMITS.responseText),
    correctiveAction: text(body.correctiveAction, FINDING_LIMITS.responseText),
    receivedOn: calendarDate(body.receivedOn),
    plannedCompletionOn:
      body.plannedCompletionOn === null
        ? null
        : calendarDate(body.plannedCompletionOn),
    evidenceAttachmentIds: evidence(body.evidenceAttachmentIds),
  };
}

function planJudgment(value: unknown): PlanJudgment {
  const body = object(value);
  const outcome =
    body.outcome === 'adequate' || body.outcome === 'inadequate'
      ? body.outcome
      : invalid();
  return { outcome, note: text(body.note, FINDING_LIMITS.note) };
}

function nonconformityVerification(value: unknown): NonconformityVerification {
  const body = object(value);
  const method =
    body.method === 'document_review' || body.method === 'on_site'
      ? body.method
      : invalid();
  const outcome =
    body.outcome === 'effective' || body.outcome === 'not_effective'
      ? body.outcome
      : invalid();
  return {
    verifiedOn: calendarDate(body.verifiedOn),
    method,
    outcome,
    note: text(body.note, FINDING_LIMITS.note),
    evidenceAttachmentIds: evidence(body.evidenceAttachmentIds),
  };
}

/** At most ten attachments of the Case, each cited once. */
function evidence(value: unknown): string[] {
  const ids = list(value, 0, FINDING_LIMITS.evidence).map((id) => text(id));
  if (new Set(ids).size !== ids.length) invalid();
  return ids;
}

function findingClassification(value: unknown): FindingClassification {
  return FINDING_CLASSIFICATIONS.find((entry) => entry === value) ?? invalid();
}

function findingStatus(value: unknown): FindingStatus {
  return FINDING_STATUSES.find((entry) => entry === value) ?? invalid();
}

function calendarDate(value: unknown): string {
  return typeof value === 'string' && isCalendarDate(value) ? value : invalid();
}

/** Auditor-days as the server accepts them; zero only where allowed. */
function dayAmount(value: unknown, zeroAllowed: boolean): string {
  return typeof value === 'string' &&
    stageDayCents(value, { zeroAllowed }) !== undefined
    ? value
    : invalid();
}

/** A proposed team, held to the server's composition rules. */
function auditTeam(value: unknown): AuditTeam {
  const body = object(value);
  const members = list(body.members, 1, TEAM_LIMITS.members).map(teamMember);
  if (teamCompositionRefusal(members) !== null) invalid();
  return {
    members,
    impartialityAnalysis: impartialityAnalysis(body.impartialityAnalysis),
  };
}

/** Absent in teams proposed before it existed; otherwise a note and its evidence. */
function impartialityAnalysis(value: unknown): ImpartialityAnalysis | null {
  if (value === undefined || value === null) return null;
  const body = object(value);
  const ids = list(
    body.evidenceAttachmentIds,
    0,
    TEAM_LIMITS.analysisEvidence,
  ).map((id) => text(id));
  if (new Set(ids).size !== ids.length) invalid();
  return {
    note: text(body.note, TEAM_LIMITS.analysisNote),
    evidenceAttachmentIds: ids,
  };
}

function teamMember(value: unknown): TeamMember {
  const row = object(value);
  const declarationsBody = object(row.declarations);
  if (
    Object.keys(declarationsBody).some(
      (key) => !IMPARTIALITY_DECLARATIONS.some((known) => known === key),
    )
  )
    invalid();
  const declarations: Record<ImpartialityDeclaration, DeclarationState> = {
    noConsultancy: declarationState(declarationsBody.noConsultancy),
    noEmployment: declarationState(declarationsBody.noEmployment),
    noManagementInvolvement: declarationState(
      declarationsBody.noManagementInvolvement,
    ),
    confidentiality: declarationState(declarationsBody.confidentiality),
  };
  return {
    name: text(row.name, TEAM_LIMITS.name),
    role: TEAM_ROLES.find((role) => role === row.role) ?? invalid(),
    workspaceMembershipId:
      row.workspaceMembershipId === null
        ? null
        : text(row.workspaceMembershipId),
    holdsCategory: flag(row.holdsCategory),
    competenceNote: text(row.competenceNote, TEAM_LIMITS.competenceNote),
    declarations,
    conflictNote: optionalText(row.conflictNote, TEAM_LIMITS.conflictNote),
  };
}

function teamDecisionValue(value: unknown): TeamDecision {
  const body = object(value);
  const common = {
    teamVersion: positive(body.teamVersion),
    onBehalf: actAttribution(body.onBehalf),
    independenceAttested: attestation(body.independenceAttested),
  };
  if (body.decision === 'approved') {
    if (body.reason !== null) invalid();
    return { ...common, decision: 'approved', reason: null };
  }
  if (body.decision === 'returned')
    return {
      ...common,
      decision: 'returned',
      reason: text(body.reason, CERTIFICATION_LIMITS.reason),
    };
  return invalid();
}

/** An explicit boolean. */
function flag(value: unknown): boolean {
  return typeof value === 'boolean' ? value : invalid();
}

/**
 * An explicit declaration state; it never defaults. The first format
 * recorded booleans, which the server still reads as confirmed or conflict.
 */
function declarationState(value: unknown): DeclarationState {
  if (value === true || value === 'confirmed') return 'confirmed';
  if (value === false || value === 'conflict') return 'conflict';
  if (value === 'to_verify') return 'to_verify';
  return invalid();
}

/**
 * An act on behalf of the certification body, absent in records made
 * before it existed: who acted, in which function, on which real date, and
 * the signed form when one is cited.
 */
function actAttribution(value: unknown): ActAttribution | null {
  if (value === undefined || value === null) return null;
  const body = object(value);
  return {
    actedBy: text(body.actedBy, ATTRIBUTION_LIMITS.person),
    actedByFunction: text(body.actedByFunction, ATTRIBUTION_LIMITS.person),
    actedOn: calendarDate(body.actedOn),
    formAttachmentId:
      body.formAttachmentId === undefined || body.formAttachmentId === null
        ? null
        : text(body.formAttachmentId),
  };
}

/** An explicit attestation; false only in records made before it existed. */
function attestation(value: unknown): boolean {
  if (value === undefined || value === false) return false;
  return value === true ? true : invalid();
}

/** An optional business date, absent in records made before it existed. */
function optionalDate(value: unknown): string | null {
  return value === undefined || value === null ? null : calendarDate(value);
}

function agreementValue(value: unknown): CertificationAgreement {
  const body = object(value);
  return {
    signedOn:
      typeof body.signedOn === 'string' && isCalendarDate(body.signedOn)
        ? body.signedOn
        : invalid(),
    attachmentId: text(body.attachmentId),
  };
}

function attachment(value: unknown): CertificationAttachment {
  const row = object(value);
  const sha256 = text(row.sha256);
  if (!/^[a-f0-9]{64}$/u.test(sha256)) invalid();
  const caseRevision = positive(row.caseRevision);
  // A Case opens at revision 1; every attachment advances it.
  if (caseRevision < 2) invalid();
  return {
    id: text(row.id),
    caseRevision,
    role: documentRole(row.role),
    documentId: text(row.documentId),
    versionId: text(row.versionId),
    representationId: text(row.representationId),
    versionNumber: positive(row.versionNumber),
    sourceTitle: text(row.sourceTitle, CERTIFICATION_LIMITS.sourceTitle),
    fileName: pdfFileName(row.fileName),
    sizeBytes: whole(row.sizeBytes, 1, CERTIFICATION_LIMITS.pdfBytes),
    sha256,
    note: optionalText(row.note, CERTIFICATION_LIMITS.attachmentNote),
    attachedBy: actorReference(row.attachedBy),
    attachedAt: instant(row.attachedAt),
  };
}

function documentRole(value: unknown): CertificationDocumentRole {
  return (
    CERTIFICATION_DOCUMENT_ROLES.find((role) => role === value) ?? invalid()
  );
}

/** A file name safe to offer for saving, as Documents preserves it. */
function pdfFileName(value: unknown): string {
  const name = text(value, 120);
  if (
    name.length < 5 ||
    name !== name.trim() ||
    !/\.pdf$/iu.test(name) ||
    /[\p{Cc}\p{Cf}/\\]/u.test(name)
  )
    invalid();
  return name;
}

function applicationFacts(value: unknown): ApplicationFacts {
  const body = object(value);
  const sites = list(body.sites, 1, CERTIFICATION_LIMITS.sites).map((site) => {
    const entry = object(site);
    return {
      address: text(entry.address, CERTIFICATION_LIMITS.siteText),
      activity: text(entry.activity, CERTIFICATION_LIMITS.siteText),
    };
  });
  const subcategories = list(
    body.foodChainSubcategories,
    1,
    FOOD_CHAIN_SUBCATEGORIES.length,
  ).map(subcategory);
  if (new Set(subcategories).size !== subcategories.length) invalid();
  const consultantBody = object(body.consultant);
  const consultant: ApplicationFacts['consultant'] =
    consultantBody.used === true
      ? {
          used: true,
          name: text(consultantBody.name, CERTIFICATION_LIMITS.consultantName),
        }
      : consultantBody.used === false &&
          (consultantBody.name === undefined || consultantBody.name === null)
        ? { used: false }
        : invalid();
  return {
    submittedOn: optionalDate(body.submittedOn),
    declaredLegalName: text(
      body.declaredLegalName,
      CERTIFICATION_LIMITS.declaredLegalName,
    ),
    declaredAddress: text(
      body.declaredAddress,
      CERTIFICATION_LIMITS.declaredAddress,
    ),
    sites,
    requestedScope: text(
      body.requestedScope,
      CERTIFICATION_LIMITS.requestedScope,
    ),
    foodChainSubcategories: subcategories,
    haccpStudyCount: integer(
      body.haccpStudyCount,
      CERTIFICATION_LIMITS.haccpStudyCount,
    ),
    totalHeadcount: integer(
      body.totalHeadcount,
      CERTIFICATION_LIMITS.totalHeadcount,
    ),
    effectiveFte: fte(body.effectiveFte),
    shiftCount: integer(body.shiftCount, CERTIFICATION_LIMITS.shiftCount),
    seasonalActivity: optionalText(
      body.seasonalActivity,
      CERTIFICATION_LIMITS.optionalText,
    ),
    otherCertifiedSystems: optionalText(
      body.otherCertifiedSystems,
      CERTIFICATION_LIMITS.optionalText,
    ),
    outsourcedProcesses: optionalText(
      body.outsourcedProcesses,
      CERTIFICATION_LIMITS.optionalText,
    ),
    consultant,
    auditLanguages: list(
      body.auditLanguages,
      1,
      CERTIFICATION_LIMITS.auditLanguages,
    ).map((language) => text(language, CERTIFICATION_LIMITS.auditLanguage)),
    preferredAuditPeriod: optionalText(
      body.preferredAuditPeriod,
      CERTIFICATION_LIMITS.preferredAuditPeriod,
    ),
  };
}

function applicationReview(value: unknown): ApplicationReview {
  const body = object(value);
  const criteriaBody = object(body.criteria);
  const criteria: Record<ReviewCriterion, ReviewAnswer> = {
    scopeCertifiable: answer(criteriaBody.scopeCertifiable),
    competentTeamAvailable: answer(criteriaBody.competentTeamAvailable),
    competentDecisionMakerAvailable: answer(
      criteriaBody.competentDecisionMakerAvailable,
    ),
    risksAcceptable: answer(criteriaBody.risksAcceptable),
  };
  const onBehalf = actAttribution(body.onBehalf);
  if (body.outcome === 'accepted') {
    if (
      body.rejectionReason !== null ||
      REVIEW_CRITERIA.some((criterion) => criteria[criterion].answer !== 'yes')
    )
      invalid();
    return { criteria, onBehalf, outcome: 'accepted', rejectionReason: null };
  }
  if (body.outcome === 'rejected')
    return {
      criteria,
      onBehalf,
      outcome: 'rejected',
      rejectionReason: text(body.rejectionReason, CERTIFICATION_LIMITS.reason),
    };
  return invalid();
}

function durationDetermination(value: unknown): DurationDetermination {
  const body = object(value);
  if (body.ruleVersion !== DURATION_RULE_VERSION) invalid();
  const inputsBody = object(body.inputs);
  const subcategories = list(
    inputsBody.subcategories,
    1,
    FOOD_CHAIN_SUBCATEGORIES.length,
  ).map(subcategory);
  if (new Set(subcategories).size !== subcategories.length) invalid();
  const factors = durationFactorInputs(inputsBody, subcategories);
  const computation = durationComputation(object(body.computation));
  const confirmed = confirmedDuration(body.confirmed);
  const justification =
    body.justification === null
      ? null
      : text(body.justification, CERTIFICATION_LIMITS.justification);
  if (
    justification === null &&
    durationJustificationRequired({ ...factors, computation, confirmed })
  )
    invalid();
  return {
    ruleVersion: DURATION_RULE_VERSION,
    inputs: {
      ...factors,
      subcategories,
      effectiveFte: fte(inputsBody.effectiveFte),
    },
    computation,
    confirmed,
    justification,
    onBehalf: actAttribution(body.onBehalf),
  };
}

/** The stated factors, with studies only for the application's subcategories. */
function durationFactorInputs(
  body: Record<string, unknown>,
  subcategories: readonly FoodChainSubcategory[],
): DurationFactorInputs {
  const primary = subcategory(body.primary);
  if (!subcategories.includes(primary)) invalid();
  return {
    primary,
    haccpStudies: wholesByKey(
      body.haccpStudies,
      subcategories,
      CERTIFICATION_LIMITS.haccpStudiesPerSubcategory,
    ),
    increases: wholesByKey(
      body.increases,
      INCREASE_FACTORS,
      CERTIFICATION_LIMITS.factorPercent,
    ),
    reductions: wholesByKey(
      body.reductions,
      REDUCTION_FACTORS,
      CERTIFICATION_LIMITS.factorPercent,
    ),
  };
}

function durationComputation(
  body: Record<string, unknown>,
): DurationComputation {
  if (body.kind === 'manual') {
    if (body.reason !== 'FTE_BAND_AMBIGUOUS') invalid();
    return { kind: 'manual', reason: 'FTE_BAND_AMBIGUOUS' };
  }
  if (body.kind === 'proposal')
    return { kind: 'proposal', proposal: durationProposal(body.proposal) };
  return invalid();
}

function durationProposal(value: unknown): DurationProposal {
  const body = object(value);
  if (body.ruleVersion !== DURATION_RULE_VERSION) invalid();
  const warnings = list(body.warnings, 0, DURATION_WARNINGS.length).map(
    warningCode,
  );
  if (new Set(warnings).size !== warnings.length) invalid();
  const proposal: DurationProposal = {
    ruleVersion: DURATION_RULE_VERSION,
    basicTime: exactAmount(body.basicTime),
    haccpTime: exactAmount(body.haccpTime),
    fteTime: exactAmount(body.fteTime),
    baseDays: exactAmount(body.baseDays),
    netAdjustmentPercent: whole(body.netAdjustmentPercent, -100, 1000),
    initialOnSite: exactAmount(body.initialOnSite),
    initialTotal: exactAmount(body.initialTotal),
    stage1OnSite: exactAmount(body.stage1OnSite),
    stage2OnSite: exactAmount(body.stage2OnSite),
    surveillanceOnSite: exactAmount(body.surveillanceOnSite),
    surveillanceTotal: exactAmount(body.surveillanceTotal),
    recertificationOnSite: exactAmount(body.recertificationOnSite),
    recertificationTotal: exactAmount(body.recertificationTotal),
    warnings,
  };
  if (!proposedStagesAddUp(proposal)) invalid();
  return proposal;
}

/** Confirmed amounts: positive hundredths, Stage 1 + Stage 2 = initial. */
function confirmedDuration(value: unknown): ConfirmedDuration {
  const body = object(value);
  const amount = (field: ConfirmedDurationField): string => {
    const entry = body[field];
    return typeof entry === 'string' && confirmedCents(entry) !== undefined
      ? entry
      : invalid();
  };
  const confirmed: ConfirmedDuration = {
    initialOnSite: amount('initialOnSite'),
    stage1OnSite: amount('stage1OnSite'),
    stage2OnSite: amount('stage2OnSite'),
    surveillanceOnSite: amount('surveillanceOnSite'),
    recertificationOnSite: amount('recertificationOnSite'),
  };
  if (!confirmedStagesAddUp(confirmed)) invalid();
  return confirmed;
}

/** Whole numbers by key; every key is known and an absent one is zero. */
function wholesByKey<Key extends string>(
  value: unknown,
  keys: readonly Key[],
  maximum: number,
): Partial<Record<Key, number>> {
  const body = object(value);
  if (Object.keys(body).some((key) => !keys.some((known) => known === key)))
    invalid();
  const result: Partial<Record<Key, number>> = {};
  for (const key of keys)
    if (body[key] !== undefined) result[key] = whole(body[key], 0, maximum);
  return result;
}

function exactAmount(value: unknown): string {
  return typeof value === 'string' && exactUnits(value) !== undefined
    ? value
    : invalid();
}

function warningCode(value: unknown): DurationWarning {
  return DURATION_WARNINGS.find((code) => code === value) ?? invalid();
}

function refusalCode(value: unknown): DurationRefusal {
  return DURATION_REFUSALS.find((code) => code === value) ?? invalid();
}

function answer(value: unknown): ReviewAnswer {
  const body = object(value);
  if (body.answer !== 'yes' && body.answer !== 'no') invalid();
  return {
    answer: body.answer,
    note: text(body.note, CERTIFICATION_LIMITS.note),
  };
}

function subcategory(value: unknown): FoodChainSubcategory {
  return FOOD_CHAIN_SUBCATEGORIES.find((code) => code === value) ?? invalid();
}

function actorReference(value: unknown): CertificationActorReference {
  const row = object(value);
  return {
    workspaceMembershipId: text(row.workspaceMembershipId),
    displayName: text(row.displayName),
  };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return Object.fromEntries(Object.entries(value));
}

function list(value: unknown, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
    invalid();
  return value;
}

function text(value: unknown, max = Number.MAX_SAFE_INTEGER): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    invalid();
  return value;
}

function optionalText(value: unknown, max: number): string | null {
  return value === null ? null : text(value, max);
}

function integer(value: unknown, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximum
  )
    invalid();
  return value;
}

/** Effective FTE above zero with at most one decimal, as the server accepts. */
function fte(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > CERTIFICATION_LIMITS.effectiveFte ||
    Math.abs(Math.round(value * 10) - value * 10) > 1e-9
  )
    invalid();
  return value;
}

function whole(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    invalid();
  return value;
}

function positive(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    invalid();
  return value;
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    invalid();
  return value;
}

function instant(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid();
  return value;
}

function invalid(): never {
  throw new Error('Invalid Certification response.');
}

function unexpectedValue(value: never): never {
  throw new Error(`Unexpected Certification value: ${String(value)}`);
}

/** Older live payloads predate release; immutable command receipts have their own reader. */
function legacyRelease(certificate: unknown): CertificateRelease {
  return {
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
    legacyIssuance: certificate !== null,
  };
}

/** Immutable release references stay readable while a later draft is outdated. */
function releaseConsistent(detail: CaseDetail): boolean {
  const release = detail.release;
  const drafts = release.drafts;
  const current = drafts.at(-1);
  const versions = [...drafts, ...release.opinions, ...release.approvals];
  if (versions.some((version) => version.caseRevision > detail.revision))
    return false;
  if (
    new Set(versions.map((version) => version.caseRevision)).size !==
    versions.length
  )
    return false;
  for (const version of [...release.opinions, ...release.approvals]) {
    const draft = drafts.find(
      (entry) => entry.id === version.value.draftVersionId,
    );
    if (!draft || draft.caseRevision >= version.caseRevision) return false;
  }
  if (
    current &&
    release.outdated !==
      (current.value.decisionVersionId !== detail.decision?.id ||
        current.value.certificateDataVersionId !== detail.certificateData?.id)
  )
    return false;
  const certificate = detail.certificate;
  if (!certificate)
    return (
      release.transmission === null &&
      release.daysSinceIssuance === null &&
      !release.legacyIssuance
    );
  if (certificate.issuedOn === null)
    return release.legacyIssuance && release.daysSinceIssuance === null;
  if (certificate.issuedOn < certificate.validFrom || release.legacyIssuance)
    return false;
  return (
    drafts.some(
      (draft) =>
        draft.id === certificate.approvedDraftVersionId &&
        draft.value.number === certificate.number,
    ) &&
    release.approvals.some(
      (approval) =>
        approval.value.draftVersionId === certificate.approvedDraftVersionId,
    )
  );
}
