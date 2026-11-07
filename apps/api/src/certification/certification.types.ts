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
} & (
  | { outcome: 'accepted'; rejectionReason: null }
  | { outcome: 'rejected'; rejectionReason: string }
);

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
    });

export type ApplicationVersion = Extract<
  CertificationStepVersion,
  { step: 'application' }
>;
export type ApplicationReviewVersion = Extract<
  CertificationStepVersion,
  { step: 'application_review' }
>;

/** The next step a programme manager can record, or none once closed. */
export type CertificationNextStep =
  'application' | 'application_review' | 'duration' | null;

export interface CertificationCaseSummary {
  id: string;
  projectId: string;
  orderReference: string;
  clientLegalEntity: { id: string; legalName: string };
  standard: 'iso_22000_2018';
  auditType: 'initial_certification';
  status: 'open' | 'rejected';
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
}

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
