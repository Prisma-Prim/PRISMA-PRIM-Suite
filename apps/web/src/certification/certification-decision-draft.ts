import {
  actingDraftFor,
  actingFromDraft,
  type ActingDraft,
} from './certification-attribution';
import {
  DECISION_LIMITS,
  DOSSIER_ITEMS,
  type Certificate,
  type CertificateData,
  type CertificateText,
  type CertificationDecision,
  type CertificationOutcome,
  type DossierAnswer,
  type DossierAnswerValue,
  type DossierItem,
  type DossierReview,
  type Recommendation,
  type RecommendationOutcome,
} from './certification-decision';
import {
  CERTIFICATION_LIMITS,
  isCalendarDate,
  type CaseTimeline,
  type CertificationAttachment,
  type CertificationDocumentRole,
} from './certification-response';
import { namedOnAnyTeamVersion } from './certification-team-draft';

/** A recommendation as typed: no outcome preselected; a reason to correct. */
export interface RecommendationDraft {
  recommendation: RecommendationOutcome | null;
  basis: string;
  /** Empty when the paper dossier gives no date. */
  recommendedOn: string;
  reason: string;
}

/** One dossier item as typed: no answer preselected. */
export interface DossierItemDraft {
  answer: DossierAnswerValue | null;
  note: string;
}

export interface DossierReviewDraft {
  items: Record<DossierItem, DossierItemDraft>;
  conclusion: string;
  /** The certification body's dossier reviewer and approver, each optional. */
  reviewedBy: ActingDraft;
  approvedBy: ActingDraft;
  /** Unchecked until the approver attests it. */
  independenceAttested: boolean;
  reason: string;
}

/** One Certificate language as typed. */
export interface CertificateTextDraft {
  language: string;
  holderName: string;
  address: string;
  scope: string;
}

/** The decision as typed: no outcome and no attestation preselected. */
export interface CertificationDecisionDraft {
  decision: CertificationOutcome | null;
  grantedTexts: CertificateTextDraft[];
  decidedOn: string;
  decidedBy: string;
  decidedByFunction: string;
  /** Empty when no signed decision form is cited. */
  decisionFormAttachmentId: string;
  rationale: string;
  additionalInformation: string;
  independenceAttested: boolean;
  /** Stated only by a correction, which keeps the decided outcome. */
  reason: string;
}

export interface CertificateDataDraft {
  texts: CertificateTextDraft[];
  agreedOn: string;
  agreementAttachmentId: string;
  reason: string;
}

/** The Certificate as typed: no attestation preselected. */
export interface CertificateDraft {
  number: string;
  attachmentId: string;
  signedBy: string;
  signedByFunction: string;
  independenceAttested: boolean;
}

/** A first record sends no reason; a correction always states one. */
export type VersionCheck<Value> =
  | { status: 'valid'; value: Value; reason: string | null }
  | { status: 'incomplete' | 'reasonRequired' };

export type AttestedCheck<Value> =
  { status: 'valid'; value: Value } | { status: 'incomplete' | 'attestation' };

/** A dossier review, or why it is refused before it is sent. */
export type DossierReviewCheck =
  | VersionCheck<DossierReview>
  | { status: 'acting' | 'actingOnTeam' | 'attestation' };

/** A decision or its correction, or why it is refused before it is sent. */
export type DecisionCheck =
  | { status: 'valid'; value: CertificationDecision; reason: string | null }
  | { status: 'incomplete' | 'attestation' | 'reasonRequired' };

/** The command the Certificate records; the server computes its validity. */
export type CertificateCommand = Pick<
  Certificate,
  'number' | 'attachmentId' | 'signedBy' | 'signedByFunction'
>;

/** A correction starts from the latest values; a first record starts empty. */
export function recommendationDraftFor(
  current: Recommendation | null,
): RecommendationDraft {
  return {
    recommendation: current?.recommendation ?? null,
    basis: current?.basis ?? '',
    recommendedOn: current?.recommendedOn ?? '',
    reason: '',
  };
}

export function dossierReviewDraftFor(
  current: DossierReview | null,
): DossierReviewDraft {
  const item = (name: DossierItem): DossierItemDraft => {
    const answer = current?.items[name];
    return answer
      ? { answer: answer.answer, note: answer.note ?? '' }
      : { answer: null, note: '' };
  };
  return {
    items: {
      application: item('application'),
      application_review: item('application_review'),
      duration: item('duration'),
      agreement: item('agreement'),
      team_approval: item('team_approval'),
      stage_1_plan: item('stage_1_plan'),
      stage_1_report: item('stage_1_report'),
      stage_2_plan: item('stage_2_plan'),
      stage_2_report: item('stage_2_report'),
      participant_lists: item('participant_lists'),
      findings_follow_up: item('findings_follow_up'),
      recommendation: item('recommendation'),
      certificate_data: item('certificate_data'),
    },
    conclusion: current?.conclusion ?? '',
    reviewedBy: actingDraftFor(current?.reviewedBy ?? null),
    approvedBy: actingDraftFor(current?.approvedBy ?? null),
    independenceAttested: false,
    reason: '',
  };
}

export function emptyCertificateText(): CertificateTextDraft {
  return { language: '', holderName: '', address: '', scope: '' };
}

export function emptyCertificationDecisionDraft(): CertificationDecisionDraft {
  return {
    decision: null,
    grantedTexts: [emptyCertificateText()],
    decidedOn: '',
    decidedBy: '',
    decidedByFunction: '',
    decisionFormAttachmentId: '',
    rationale: '',
    additionalInformation: '',
    independenceAttested: false,
    reason: '',
  };
}

/**
 * A correction starts from the latest decision's values, the attestation
 * unchecked and its reason empty; its outcome stays the recorded one.
 */
export function certificationDecisionDraftFor(
  current: CertificationDecision,
): CertificationDecisionDraft {
  return {
    decision: current.decision,
    grantedTexts:
      current.decision === 'granted'
        ? current.grantedTexts.map((text) => ({ ...text }))
        : [emptyCertificateText()],
    decidedOn: current.decidedOn,
    decidedBy: current.decidedBy,
    decidedByFunction: current.decidedByFunction ?? '',
    decisionFormAttachmentId: current.decisionFormAttachmentId ?? '',
    rationale: current.rationale,
    additionalInformation: current.additionalInformation ?? '',
    independenceAttested: false,
    reason: '',
  };
}

export function certificateDataDraftFor(
  current: CertificateData | null,
): CertificateDataDraft {
  return current
    ? {
        texts: current.texts.map((text) => ({ ...text })),
        agreedOn: current.agreedOn,
        agreementAttachmentId: current.agreementAttachmentId,
        reason: '',
      }
    : {
        texts: [emptyCertificateText()],
        agreedOn: '',
        agreementAttachmentId: '',
        reason: '',
      };
}

export function emptyCertificateDraft(): CertificateDraft {
  return {
    number: '',
    attachmentId: '',
    signedBy: '',
    signedByFunction: '',
    independenceAttested: false,
  };
}

/** The register's attachments with one role, in attachment order. */
export function attachmentsWithRole(
  register: readonly CertificationAttachment[],
  role: CertificationDocumentRole,
): CertificationAttachment[] {
  return register.filter((item) => item.role === role);
}

/**
 * Mirrors the server: an explicit outcome, its basis, an optional real
 * business date and a correction's reason.
 */
export function recommendationFromDraft(
  draft: RecommendationDraft,
  correcting: boolean,
): VersionCheck<Recommendation> {
  const basis = required(draft.basis, DECISION_LIMITS.basis);
  const recommendedOn = draft.recommendedOn.trim();
  if (
    draft.recommendation === null ||
    basis === undefined ||
    (recommendedOn !== '' && !isCalendarDate(recommendedOn))
  )
    return { status: 'incomplete' };
  return withReason(
    {
      recommendation: draft.recommendation,
      basis,
      recommendedOn: recommendedOn || null,
    },
    draft.reason,
    correcting,
  );
}

/**
 * Mirrors the server: every item answered explicitly, a note within its
 * limit and stated for each missing item, the conclusion; a complete act
 * of the dossier reviewer and of the approver when recorded on behalf of
 * the certification body, each by a person named on no team version; the
 * explicit attestation of independence; and a correction's reason.
 */
export function dossierReviewFromDraft(
  draft: DossierReviewDraft,
  {
    correcting,
    register,
    timeline,
  }: {
    correcting: boolean;
    register: readonly CertificationAttachment[];
    timeline: CaseTimeline;
  },
): DossierReviewCheck {
  const conclusion = required(draft.conclusion, DECISION_LIMITS.conclusion);
  const answers = DOSSIER_ITEMS.map((item) => answerFrom(draft.items[item]));
  if (
    conclusion === undefined ||
    answers.some((answer) => answer === undefined)
  )
    return { status: 'incomplete' };
  const reviewedBy = actingFromDraft(draft.reviewedBy, register);
  const approvedBy = actingFromDraft(draft.approvedBy, register);
  if (reviewedBy === undefined || approvedBy === undefined)
    return { status: 'acting' };
  if (
    [reviewedBy, approvedBy].some(
      (act) => act !== null && namedOnAnyTeamVersion(timeline, act.actedBy),
    )
  )
    return { status: 'actingOnTeam' };
  if (!draft.independenceAttested) return { status: 'attestation' };
  const answer = (item: DossierItem): DossierAnswer =>
    answerFrom(draft.items[item]) ?? unexpectedIncomplete();
  return withReason(
    {
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
      conclusion,
      reviewedBy,
      approvedBy,
      independenceAttested: true,
    },
    draft.reason,
    correcting,
  );
}

/** Mirrors the server: one to four texts, one per language, within limits. */
export function certificateTextsFromDraft(
  drafts: readonly CertificateTextDraft[],
): CertificateText[] | undefined {
  if (drafts.length < 1 || drafts.length > DECISION_LIMITS.texts)
    return undefined;
  const texts: CertificateText[] = [];
  for (const draft of drafts) {
    const language = required(draft.language, DECISION_LIMITS.language);
    const holderName = required(draft.holderName, DECISION_LIMITS.holderName);
    const address = required(draft.address, DECISION_LIMITS.address);
    const scope = required(draft.scope, DECISION_LIMITS.scope);
    if (
      language === undefined ||
      holderName === undefined ||
      address === undefined ||
      scope === undefined ||
      texts.some((text) => text.language === language)
    )
      return undefined;
    texts.push({ language, holderName, address, scope });
  }
  return texts;
}

/**
 * Mirrors the server: an explicit outcome, the texts a grant fixes, the
 * decision date and maker, an optional function and signed form of this
 * Case with the decision-form role, the rationale and optional additional
 * information; then the explicit attestation of independence. A correction
 * keeps the recorded outcome, whatever the draft holds, and states its
 * reason.
 */
export function certificationDecisionFromDraft(
  draft: CertificationDecisionDraft,
  {
    register,
    correcting,
  }: {
    register: readonly CertificationAttachment[];
    /** The recorded decision's outcome when this draft corrects it. */
    correcting: CertificationOutcome | null;
  },
): DecisionCheck {
  const outcome = correcting ?? draft.decision;
  const decidedOn = draft.decidedOn.trim();
  const decidedBy = required(draft.decidedBy, DECISION_LIMITS.person);
  const decidedByFunction = optional(
    draft.decidedByFunction,
    DECISION_LIMITS.person,
  );
  const rationale = required(draft.rationale, DECISION_LIMITS.rationale);
  const additionalInformation = optional(
    draft.additionalInformation,
    DECISION_LIMITS.additionalInformation,
  );
  const form = draft.decisionFormAttachmentId;
  const formKnown =
    form === '' ||
    attachmentsWithRole(register, 'decision_form').some(
      (item) => item.id === form,
    );
  if (
    outcome === null ||
    !isCalendarDate(decidedOn) ||
    decidedBy === undefined ||
    decidedByFunction === undefined ||
    rationale === undefined ||
    additionalInformation === undefined ||
    !formKnown
  )
    return { status: 'incomplete' };
  const facts = {
    decidedOn,
    decidedBy,
    decidedByFunction,
    decisionFormAttachmentId: form || null,
    independenceAttested: true,
    rationale,
    additionalInformation,
  } satisfies Omit<CertificationDecision, 'decision' | 'grantedTexts'>;
  let decision: CertificationDecision;
  if (outcome === 'granted') {
    const grantedTexts = certificateTextsFromDraft(draft.grantedTexts);
    if (!grantedTexts) return { status: 'incomplete' };
    decision = { ...facts, decision: 'granted', grantedTexts };
  } else decision = { ...facts, decision: 'refused', grantedTexts: null };
  if (!draft.independenceAttested) return { status: 'attestation' };
  const reason = withReason(decision, draft.reason, correcting !== null);
  return reason.status === 'valid'
    ? { status: 'valid', value: decision, reason: reason.reason }
    : { status: 'reasonRequired' };
}

/**
 * Mirrors the server: the texts, the date agreed, the signed form of this
 * Case with the Certificate-data role and a correction's reason.
 */
export function certificateDataFromDraft(
  draft: CertificateDataDraft,
  {
    register,
    correcting,
  }: { register: readonly CertificationAttachment[]; correcting: boolean },
): VersionCheck<CertificateData> {
  const texts = certificateTextsFromDraft(draft.texts);
  const agreedOn = draft.agreedOn.trim();
  if (
    !texts ||
    !isCalendarDate(agreedOn) ||
    !attachmentsWithRole(register, 'certificate_data').some(
      (item) => item.id === draft.agreementAttachmentId,
    )
  )
    return { status: 'incomplete' };
  return withReason(
    { texts, agreedOn, agreementAttachmentId: draft.agreementAttachmentId },
    draft.reason,
    correcting,
  );
}

/**
 * Mirrors the server: the number, the Certificate PDF of this Case, an
 * optional signatory and function; then the explicit attestation.
 */
export function certificateFromDraft(
  draft: CertificateDraft,
  register: readonly CertificationAttachment[],
): AttestedCheck<CertificateCommand> {
  const number = required(draft.number, DECISION_LIMITS.number);
  const signedBy = optional(draft.signedBy, DECISION_LIMITS.person);
  const signedByFunction = optional(
    draft.signedByFunction,
    DECISION_LIMITS.person,
  );
  if (
    number === undefined ||
    signedBy === undefined ||
    signedByFunction === undefined ||
    !attachmentsWithRole(register, 'certificate').some(
      (item) => item.id === draft.attachmentId,
    )
  )
    return { status: 'incomplete' };
  if (!draft.independenceAttested) return { status: 'attestation' };
  return {
    status: 'valid',
    value: {
      number,
      attachmentId: draft.attachmentId,
      signedBy,
      signedByFunction,
    },
  };
}

/** One explicit answer; a missing item needs its note. */
function answerFrom(draft: DossierItemDraft): DossierAnswer | undefined {
  const note = optional(draft.note, DECISION_LIMITS.note);
  if (draft.answer === null || note === undefined) return undefined;
  if (draft.answer === 'missing')
    return note === null ? undefined : { answer: 'missing', note };
  return { answer: draft.answer, note };
}

function withReason<Value>(
  value: Value,
  typed: string,
  correcting: boolean,
): VersionCheck<Value> {
  if (!correcting) return { status: 'valid', value, reason: null };
  const reason = required(typed, CERTIFICATION_LIMITS.reason);
  return reason === undefined
    ? { status: 'reasonRequired' }
    : { status: 'valid', value, reason };
}

/** A trimmed text within its limit, or undefined when blank or too long. */
function required(value: string, limit: number): string | undefined {
  const trimmed = value.trim();
  return trimmed && trimmed.length <= limit ? trimmed : undefined;
}

/** Null when blank, a trimmed text within its limit, or undefined. */
function optional(value: string, limit: number): string | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= limit ? trimmed : undefined;
}

function unexpectedIncomplete(): never {
  throw new Error('A dossier answer was checked complete above.');
}
