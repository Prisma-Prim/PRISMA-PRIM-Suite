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
} as const;

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

export type StepVersion =
  | (StepVersionBase & { step: 'application'; value: ApplicationFacts })
  | (StepVersionBase & {
      step: 'application_review';
      value: ApplicationReview;
    });
export type ApplicationVersion = Extract<StepVersion, { step: 'application' }>;
export type ApplicationReviewVersion = Extract<
  StepVersion,
  { step: 'application_review' }
>;

export type CertificationNextStep =
  'application' | 'application_review' | 'duration' | null;

export interface CaseSummary {
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

export interface CaseDetail extends CaseSummary {
  companyId: string;
  clientAccountId: string;
  application: ApplicationVersion | null;
  applicationReview: ApplicationReviewVersion | null;
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
  };
  if (!consistent(detail)) invalid();
  return detail;
}

function applicationVersion(value: unknown): ApplicationVersion {
  const version = parseStepVersion(value);
  return version.step === 'application' ? version : invalid();
}

function reviewVersion(value: unknown): ApplicationReviewVersion {
  const version = parseStepVersion(value);
  return version.step === 'application_review' ? version : invalid();
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
  const status =
    row.status === 'open' || row.status === 'rejected' ? row.status : invalid();
  const nextStep = parseNextStep(row.nextStep);
  if ((status === 'rejected') !== (nextStep === null)) invalid();
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
      return value;
    default:
      return invalid();
  }
}

/** The server derives status and next step from the recorded steps. */
function consistent(detail: CaseDetail): boolean {
  const { application, applicationReview: review } = detail;
  if (review && !application) return false;
  if (
    (application && application.caseRevision > detail.revision) ||
    (review && review.caseRevision > detail.revision) ||
    (application && review && application.caseRevision >= review.caseRevision)
  )
    return false;
  if (detail.status === 'rejected')
    return review?.value.outcome === 'rejected' && detail.nextStep === null;
  if (review?.value.outcome === 'rejected') return false;
  const expected: CertificationNextStep = !application
    ? 'application'
    : !review
      ? 'application_review'
      : 'duration';
  return detail.nextStep === expected;
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
  return invalid();
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
  if (body.outcome === 'accepted') {
    if (
      body.rejectionReason !== null ||
      REVIEW_CRITERIA.some((criterion) => criteria[criterion].answer !== 'yes')
    )
      invalid();
    return { criteria, outcome: 'accepted', rejectionReason: null };
  }
  if (body.outcome === 'rejected')
    return {
      criteria,
      outcome: 'rejected',
      rejectionReason: text(body.rejectionReason, CERTIFICATION_LIMITS.reason),
    };
  return invalid();
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
