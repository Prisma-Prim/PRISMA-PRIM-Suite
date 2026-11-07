import {
  CERTIFICATION_LIMITS,
  REVIEW_CRITERIA,
  type ApplicationFacts,
  type ApplicationReview,
  type FoodChainSubcategory,
  type ReviewCriterion,
} from './certification-response';

/** The editable application, kept as typed text until it is submitted. */
export interface ApplicationDraft {
  declaredLegalName: string;
  declaredAddress: string;
  sites: { address: string; activity: string }[];
  requestedScope: string;
  foodChainSubcategories: FoodChainSubcategory[];
  haccpStudyCount: string;
  totalHeadcount: string;
  effectiveFte: string;
  shiftCount: string;
  seasonalActivity: string;
  otherCertifiedSystems: string;
  outsourcedProcesses: string;
  /** No default: the client's declaration is chosen explicitly. */
  consultantUsed: 'yes' | 'no' | null;
  consultantName: string;
  auditLanguages: string[];
  preferredAuditPeriod: string;
  reason: string;
}

export interface ReviewDraft {
  /** No answer and no outcome is preselected (PRD: explicit answers only). */
  criteria: Record<
    ReviewCriterion,
    { answer: 'yes' | 'no' | null; note: string }
  >;
  outcome: 'accepted' | 'rejected' | null;
  rejectionReason: string;
}

export function emptyApplicationDraft(): ApplicationDraft {
  return {
    declaredLegalName: '',
    declaredAddress: '',
    sites: [{ address: '', activity: '' }],
    requestedScope: '',
    foodChainSubcategories: [],
    haccpStudyCount: '',
    totalHeadcount: '',
    effectiveFte: '',
    shiftCount: '',
    seasonalActivity: '',
    otherCertifiedSystems: '',
    outsourcedProcesses: '',
    consultantUsed: null,
    consultantName: '',
    auditLanguages: [''],
    preferredAuditPeriod: '',
    reason: '',
  };
}

/** A correction starts from the current version's exact values. */
export function draftFromFacts(facts: ApplicationFacts): ApplicationDraft {
  return {
    declaredLegalName: facts.declaredLegalName,
    declaredAddress: facts.declaredAddress,
    sites: facts.sites.map((site) => ({ ...site })),
    requestedScope: facts.requestedScope,
    foodChainSubcategories: [...facts.foodChainSubcategories],
    haccpStudyCount: String(facts.haccpStudyCount),
    totalHeadcount: String(facts.totalHeadcount),
    effectiveFte: String(facts.effectiveFte),
    shiftCount: String(facts.shiftCount),
    seasonalActivity: facts.seasonalActivity ?? '',
    otherCertifiedSystems: facts.otherCertifiedSystems ?? '',
    outsourcedProcesses: facts.outsourcedProcesses ?? '',
    consultantUsed: facts.consultant.used ? 'yes' : 'no',
    consultantName: facts.consultant.used ? facts.consultant.name : '',
    auditLanguages: [...facts.auditLanguages],
    preferredAuditPeriod: facts.preferredAuditPeriod ?? '',
    reason: '',
  };
}

export function emptyReviewDraft(): ReviewDraft {
  return {
    criteria: {
      scopeCertifiable: { answer: null, note: '' },
      competentTeamAvailable: { answer: null, note: '' },
      competentDecisionMakerAvailable: { answer: null, note: '' },
      risksAcceptable: { answer: null, note: '' },
    },
    outcome: null,
    rejectionReason: '',
  };
}

/** The facts the server would accept, or undefined when a field is invalid. */
export function factsFromDraft(
  draft: ApplicationDraft,
): ApplicationFacts | undefined {
  const declaredLegalName = required(
    draft.declaredLegalName,
    CERTIFICATION_LIMITS.declaredLegalName,
  );
  const declaredAddress = required(
    draft.declaredAddress,
    CERTIFICATION_LIMITS.declaredAddress,
  );
  const requestedScope = required(
    draft.requestedScope,
    CERTIFICATION_LIMITS.requestedScope,
  );
  const sites = draft.sites.map((site) => ({
    address: required(site.address, CERTIFICATION_LIMITS.siteText),
    activity: required(site.activity, CERTIFICATION_LIMITS.siteText),
  }));
  const auditLanguages = draft.auditLanguages.map((language) =>
    required(language, CERTIFICATION_LIMITS.auditLanguage),
  );
  const haccpStudyCount = wholeNumber(
    draft.haccpStudyCount,
    CERTIFICATION_LIMITS.haccpStudyCount,
  );
  const totalHeadcount = wholeNumber(
    draft.totalHeadcount,
    CERTIFICATION_LIMITS.totalHeadcount,
  );
  const shiftCount = wholeNumber(
    draft.shiftCount,
    CERTIFICATION_LIMITS.shiftCount,
  );
  const effectiveFte = fullTimeEquivalent(draft.effectiveFte);
  const seasonalActivity = optional(
    draft.seasonalActivity,
    CERTIFICATION_LIMITS.optionalText,
  );
  const otherCertifiedSystems = optional(
    draft.otherCertifiedSystems,
    CERTIFICATION_LIMITS.optionalText,
  );
  const outsourcedProcesses = optional(
    draft.outsourcedProcesses,
    CERTIFICATION_LIMITS.optionalText,
  );
  const preferredAuditPeriod = optional(
    draft.preferredAuditPeriod,
    CERTIFICATION_LIMITS.preferredAuditPeriod,
  );
  const consultantName = required(
    draft.consultantName,
    CERTIFICATION_LIMITS.consultantName,
  );
  const consultant: ApplicationFacts['consultant'] | undefined =
    draft.consultantUsed === 'no'
      ? { used: false }
      : draft.consultantUsed === 'yes' && consultantName !== undefined
        ? { used: true, name: consultantName }
        : undefined;
  const validSites = sites.flatMap((site) =>
    site.address !== undefined && site.activity !== undefined
      ? [{ address: site.address, activity: site.activity }]
      : [],
  );
  const validLanguages = auditLanguages.flatMap((language) =>
    language === undefined ? [] : [language],
  );
  if (
    declaredLegalName === undefined ||
    declaredAddress === undefined ||
    requestedScope === undefined ||
    validSites.length !== draft.sites.length ||
    validSites.length < 1 ||
    validSites.length > CERTIFICATION_LIMITS.sites ||
    validLanguages.length !== draft.auditLanguages.length ||
    validLanguages.length < 1 ||
    validLanguages.length > CERTIFICATION_LIMITS.auditLanguages ||
    draft.foodChainSubcategories.length < 1 ||
    new Set(draft.foodChainSubcategories).size !==
      draft.foodChainSubcategories.length ||
    haccpStudyCount === undefined ||
    totalHeadcount === undefined ||
    shiftCount === undefined ||
    effectiveFte === undefined ||
    seasonalActivity === undefined ||
    otherCertifiedSystems === undefined ||
    outsourcedProcesses === undefined ||
    preferredAuditPeriod === undefined ||
    consultant === undefined
  )
    return undefined;
  return {
    declaredLegalName,
    declaredAddress,
    sites: validSites,
    requestedScope,
    foodChainSubcategories: [...draft.foodChainSubcategories],
    haccpStudyCount,
    totalHeadcount,
    effectiveFte,
    shiftCount,
    seasonalActivity,
    otherCertifiedSystems,
    outsourcedProcesses,
    consultant,
    auditLanguages: validLanguages,
    preferredAuditPeriod,
  };
}

/** A correction reason, required from the second application version. */
export function correctionReason(draft: ApplicationDraft): string | undefined {
  return required(draft.reason, CERTIFICATION_LIMITS.reason);
}

export type ReviewCheck =
  | { status: 'valid'; review: ApplicationReview }
  | { status: 'incomplete' }
  | { status: 'criteriaNotMet' };

/** Mirrors the server: complete explicit answers; acceptance only with all yes. */
export function reviewFromDraft(draft: ReviewDraft): ReviewCheck {
  const answers = REVIEW_CRITERIA.map((criterion) => {
    const entry = draft.criteria[criterion];
    const note = required(entry.note, CERTIFICATION_LIMITS.note);
    return entry.answer === null || note === undefined
      ? undefined
      : { answer: entry.answer, note };
  });
  const [scope, team, decisionMaker, risks] = answers;
  if (!scope || !team || !decisionMaker || !risks || draft.outcome === null)
    return { status: 'incomplete' };
  const criteria = {
    scopeCertifiable: scope,
    competentTeamAvailable: team,
    competentDecisionMakerAvailable: decisionMaker,
    risksAcceptable: risks,
  };
  if (draft.outcome === 'accepted')
    return Object.values(criteria).every((entry) => entry.answer === 'yes')
      ? {
          status: 'valid',
          review: { criteria, outcome: 'accepted', rejectionReason: null },
        }
      : { status: 'criteriaNotMet' };
  const rejectionReason = required(
    draft.rejectionReason,
    CERTIFICATION_LIMITS.reason,
  );
  return rejectionReason === undefined
    ? { status: 'incomplete' }
    : {
        status: 'valid',
        review: { criteria, outcome: 'rejected', rejectionReason },
      };
}

function required(value: string, limit: number): string | undefined {
  const trimmed = value.trim();
  return trimmed && trimmed.length <= limit ? trimmed : undefined;
}

/** Blank optional text is not declared; present text keeps its limit. */
function optional(value: string, limit: number): string | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= limit ? trimmed : undefined;
}

function wholeNumber(value: string, maximum: number): number | undefined {
  const trimmed = value.trim();
  if (!/^\d{1,9}$/u.test(trimmed)) return undefined;
  const number = Number(trimmed);
  return number >= 1 && number <= maximum ? number : undefined;
}

/** Accepts a decimal point or comma, as typed in every supported locale. */
function fullTimeEquivalent(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d{1,6}([.,]\d)?$/u.test(trimmed)) return undefined;
  const number = Number(trimmed.replace(',', '.'));
  return number > 0 && number <= CERTIFICATION_LIMITS.effectiveFte
    ? number
    : undefined;
}
