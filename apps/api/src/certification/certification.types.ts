import type {
  CertificateDraftValue,
  ClientOpinionValue,
  CertificateDraftApprovalValue,
  CertificateRelease,
} from './certification-release.js';
import type { AuditTeam, TeamDecision } from './certification-team.js';
import type { FindingView } from './certification-findings.js';
import type {
  CertificateData,
  CertificationDecision,
  DossierReview,
  Recommendation,
} from './certification-decision.js';
import type {
  Stage1Report,
  Stage2Report,
  StagePlan,
} from './certification-stages.js';
import type {
  DURATION_RULE_VERSION,
  DurationProposal,
  IncreaseFactor,
  ReductionFactor,
} from './certification-duration.js';

import type { ActAttribution } from './certification-attribution.js';
import type { ConsistencySection } from './certification-consistency.js';
import type { ExchangeRegister } from './certification-exchanges.js';
import type { ReverificationSection } from './certification-reverification.js';

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

export interface CertificationSite {
  address: string;
  activity: string;
}

export interface ApplicationFacts {
  /** Business date of the signed application, when known. */
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
  onBehalf: ActAttribution | null;
} & (
  | { outcome: 'accepted'; rejectionReason: null }
  | { outcome: 'rejected'; rejectionReason: string }
);

/** Confirmed auditor-days, as decimal strings with at most two decimals. */
export interface ConfirmedDuration {
  initialOnSite: string;
  stage1OnSite: string;
  stage2OnSite: string;
  surveillanceOnSite: string;
  recertificationOnSite: string;
}

export interface DurationFactorInputs {
  primary: FoodChainSubcategory;
  haccpStudies: Partial<Record<FoodChainSubcategory, number>>;
  increases: Partial<Record<IncreaseFactor, number>>;
  reductions: Partial<Record<ReductionFactor, number>>;
}

export interface DurationDetermination {
  ruleVersion: typeof DURATION_RULE_VERSION;
  inputs: DurationFactorInputs & {
    subcategories: FoodChainSubcategory[];
    effectiveFte: number;
  };
  computation:
    | { kind: 'proposal'; proposal: DurationProposal }
    | { kind: 'manual'; reason: 'FTE_BAND_AMBIGUOUS' };
  confirmed: ConfirmedDuration;
  justification: string | null;
  onBehalf: ActAttribution | null;
}

export type CertificationDocumentRole =
  | 'questionnaire'
  | 'iso22000_annex'
  | 'agreement'
  | 'plan'
  | 'participant_list'
  | 'report'
  | 'evidence'
  | 'certificate'
  | 'certificate_data'
  | 'certificate_draft'
  | 'client_opinion'
  | 'decision_form'
  | 'correspondence'
  | 'other';

export interface CertificationAgreement {
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

export type CertificationStepVersion =
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

export type ApplicationVersion = Extract<
  CertificationStepVersion,
  { step: 'application' }
>;
export type ApplicationReviewVersion = Extract<
  CertificationStepVersion,
  { step: 'application_review' }
>;
export type DurationVersion = Extract<
  CertificationStepVersion,
  { step: 'duration' }
>;
export type AgreementVersion = Extract<
  CertificationStepVersion,
  { step: 'agreement' }
>;
export type TeamVersion = Extract<CertificationStepVersion, { step: 'team' }>;
export type TeamDecisionVersion = Extract<
  CertificationStepVersion,
  { step: 'team_decision' }
>;
export type StageStepVersion = Extract<
  CertificationStepVersion,
  {
    step: 'stage_1_plan' | 'stage_1_report' | 'stage_2_plan' | 'stage_2_report';
  }
>;

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

export interface CertificationDocumentRegister {
  caseId: string;
  items: CertificationAttachment[];
}

export interface CertificationEligibleDocuments {
  caseId: string;
  items: {
    documentId: string;
    versionId: string;
    versionNumber: number;
    representationId: string;
    sourceTitle: string;
  }[];
  truncated: boolean;
}

/** The next step a programme manager can record, or none once closed. */
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

export interface CertificationCaseSummary {
  id: string;
  projectId: string;
  orderReference: string;
  clientLegalEntity: { id: string; legalName: string };
  standard: 'iso_22000_2018';
  auditType: 'initial_certification';
  status: 'open' | 'rejected' | 'refused' | 'certified';
  revision: number;
  nextStep: CertificationNextStep;
  openedBy: CertificationActorReference;
  openedAt: string;
}

export interface CertificationCaseDetail extends CertificationCaseSummary {
  companyId: string;
  clientAccountId: string;
  application: ApplicationVersion | null;
  applicationReview: ApplicationReviewVersion | null;
  duration: DurationVersion | null;
  agreement: AgreementVersion | null;
  team: TeamVersion | null;
  teamDecision: TeamDecisionVersion | null;
  stages: StageStepVersion[];
  findings: FindingView[];
  recommendation: Extract<
    CertificationStepVersion,
    { step: 'recommendation' }
  > | null;
  dossierReview: Extract<
    CertificationStepVersion,
    { step: 'dossier_review' }
  > | null;
  decision: Extract<CertificationStepVersion, { step: 'decision' }> | null;
  certificateData: Extract<
    CertificationStepVersion,
    { step: 'certificate_data' }
  > | null;
  certificate: CertificateRecord | null;
  release: CertificateRelease;
  /** The Dossier Consistency Check over the Case's current records. */
  consistency: ConsistencySection;
  /** The exchange register, its deadline states and the Re-verification Items. */
  exchanges: ExchangeRegister & { reverification: ReverificationSection };
}

export type CertificateRecord = {
  id: string;
  number: string;
  validFrom: string;
  validUntil: string;
  firstSurveillanceBy: string;
  texts: {
    language: string;
    holderName: string;
    address: string;
    scope: string;
  }[];
  signedBy: string | null;
  signedByFunction: string | null;
  /** False only in Certificates recorded before the attestation was stored. */
  independenceAttested: boolean;
  attachmentId: string;
  recordedBy: CertificationActorReference;
  recordedAt: string;
} & (
  | { issuedOn: null; approvedDraftVersionId: null }
  | { issuedOn: string; approvedDraftVersionId: string }
);

export interface CertificationCaseList {
  projectId: string;
  cases: CertificationCaseSummary[];
  total: number;
}

export interface CertificationTimeline {
  caseId: string;
  entries: CertificationStepVersion[];
}

export interface CertificationLegalEntityOptions {
  projectId: string;
  items: { id: string; legalName: string; taxId: string | null }[];
}
