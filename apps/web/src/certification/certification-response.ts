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
  | (StepVersionBase & { step: 'agreement'; value: CertificationAgreement });
export type ApplicationVersion = Extract<StepVersion, { step: 'application' }>;
export type ApplicationReviewVersion = Extract<
  StepVersion,
  { step: 'application_review' }
>;
export type DurationVersion = Extract<StepVersion, { step: 'duration' }>;
export type AgreementVersion = Extract<StepVersion, { step: 'agreement' }>;

export type CertificationNextStep =
  | 'application'
  | 'application_review'
  | 'duration'
  | 'agreement'
  | 'team'
  | null;

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
  duration: DurationVersion | null;
  agreement: AgreementVersion | null;
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
  };
  if (!consistent(detail)) invalid();
  return detail;
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
    case 'agreement':
    case 'team':
      return value;
    default:
      return invalid();
  }
}

/** The server derives status and next step from the recorded steps. */
function consistent(detail: CaseDetail): boolean {
  const {
    application,
    applicationReview: review,
    duration,
    agreement,
  } = detail;
  if (review && !application) return false;
  // A duration is determined only once the review accepted the application.
  if (duration && review?.value.outcome !== 'accepted') return false;
  // Steps are recorded in order, each at a revision the Case has reached.
  const revisions = [application, review, duration].flatMap((version) =>
    version ? [version.caseRevision] : [],
  );
  if (
    revisions.some(
      (revision, index) =>
        revision > detail.revision ||
        revision <= (revisions[index - 1] ?? Number.NEGATIVE_INFINITY),
    )
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
  if (detail.status === 'rejected')
    return review?.value.outcome === 'rejected' && detail.nextStep === null;
  if (review?.value.outcome === 'rejected') return false;
  const expected: CertificationNextStep = !application
    ? 'application'
    : !review
      ? 'application_review'
      : !duration
        ? 'duration'
        : !agreement
          ? 'agreement'
          : 'team';
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
  return invalid();
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
