import {
  CERTIFICATION_LIMITS,
  isCalendarDate,
  type CertificationAttachment,
} from './certification-response';
import {
  FINDING_LIMITS,
  classificationRefusal,
  stageClassifications,
  type ClassificationRefusal,
  type Finding,
  type FindingClassification,
  type FindingStatement,
  type NonconformityResponse,
  type NonconformityVerification,
  type PlanJudgment,
  type PlanOutcome,
  type VerificationMethod,
  type VerificationOutcome,
} from './certification-findings';
import type { AuditStage } from './certification-stages';

/** The statement fields as typed; the evidence as chosen attachment ids. */
export interface FindingStatementDraft {
  clause: string;
  area: string;
  statement: string;
  evidenceAttachmentIds: string[];
}

/** A new Finding as typed: no classification is preselected. */
export interface FindingDraft extends FindingStatementDraft {
  classification: FindingClassification | null;
}

/** A corrected statement, starting from the current one, with its reason. */
export interface FindingCorrectionDraft extends FindingStatementDraft {
  reason: string;
}

/** A new classification, chosen explicitly, with its reason. */
export interface ClassificationDraft {
  classification: FindingClassification | null;
  reason: string;
}

export interface ResponseDraft {
  correction: string;
  cause: string;
  correctiveAction: string;
  receivedOn: string;
  /** Empty when the client stated no completion date. */
  plannedCompletionOn: string;
  evidenceAttachmentIds: string[];
}

export interface PlanJudgmentDraft {
  outcome: PlanOutcome | null;
  note: string;
}

export interface VerificationDraft {
  verifiedOn: string;
  method: VerificationMethod | null;
  outcome: VerificationOutcome | null;
  note: string;
  evidenceAttachmentIds: string[];
}

export type FindingCheck =
  | {
      status: 'valid';
      classification: FindingClassification;
      statement: FindingStatement;
    }
  | { status: 'incomplete' | ClassificationRefusal };

export type CorrectionCheck =
  | { status: 'valid'; statement: FindingStatement; reason: string }
  | { status: 'incomplete' | 'reasonRequired' | ClassificationRefusal };

export type ClassificationCheck =
  | {
      status: 'valid';
      classification: FindingClassification;
      reason: string;
    }
  | {
      status: 'incomplete' | 'unchanged' | ClassificationRefusal;
    };

export type FollowUpCheck<Value> =
  { status: 'valid'; value: Value } | { status: 'incomplete' };

export function emptyFindingDraft(): FindingDraft {
  return {
    classification: null,
    clause: '',
    area: '',
    statement: '',
    evidenceAttachmentIds: [],
  };
}

/** A correction starts from the current statement's exact values. */
export function correctionDraftFor(
  statement: FindingStatement,
): FindingCorrectionDraft {
  return {
    clause: statement.clause ?? '',
    area: statement.area ?? '',
    statement: statement.statement,
    evidenceAttachmentIds: [...statement.evidenceAttachmentIds],
    reason: '',
  };
}

export function emptyClassificationDraft(): ClassificationDraft {
  return { classification: null, reason: '' };
}

export function emptyResponseDraft(): ResponseDraft {
  return {
    correction: '',
    cause: '',
    correctiveAction: '',
    receivedOn: '',
    plannedCompletionOn: '',
    evidenceAttachmentIds: [],
  };
}

export function emptyPlanJudgmentDraft(): PlanJudgmentDraft {
  return { outcome: null, note: '' };
}

export function emptyVerificationDraft(): VerificationDraft {
  return {
    verifiedOn: '',
    method: null,
    outcome: null,
    note: '',
    evidenceAttachmentIds: [],
  };
}

/**
 * The attachments offered as evidence: the Case's PDFs attached as
 * evidence, and any other attachment the draft already cites, so that a
 * correction keeps what the server recorded.
 */
export function evidenceOptions(
  register: readonly CertificationAttachment[],
  chosen: readonly string[],
): CertificationAttachment[] {
  return register.filter(
    (item) => item.role === 'evidence' || chosen.includes(item.id),
  );
}

/** Toggles one attachment in a draft's evidence, keeping register order. */
export function toggleEvidence(
  register: readonly CertificationAttachment[],
  chosen: readonly string[],
  attachmentId: string,
): string[] {
  const next = chosen.includes(attachmentId)
    ? chosen.filter((id) => id !== attachmentId)
    : [...chosen, attachmentId];
  return register.flatMap((item) => (next.includes(item.id) ? [item.id] : []));
}

/**
 * Mirrors the server: an explicit classification allowed in the Stage, the
 * statement within its limit, an optional clause and area within theirs,
 * at most ten attachments of the Case; then its classification rules.
 */
export function findingFromDraft(
  draft: FindingDraft,
  context: { stage: AuditStage; register: readonly CertificationAttachment[] },
): FindingCheck {
  const statement = statementFromDraft(draft, context.register);
  const classification = draft.classification;
  if (!statement || classification === null) return { status: 'incomplete' };
  const refusal = classificationRefusal(
    classification,
    context.stage,
    statement,
  );
  return refusal === null
    ? { status: 'valid', classification, statement }
    : { status: refusal };
}

/**
 * Mirrors the server: a valid statement held to the rules of the current
 * classification, and the reason of the correction.
 */
export function correctionFromDraft(
  draft: FindingCorrectionDraft,
  context: { finding: Finding; register: readonly CertificationAttachment[] },
): CorrectionCheck {
  const statement = statementFromDraft(draft, context.register);
  if (!statement) return { status: 'incomplete' };
  const refusal = classificationRefusal(
    context.finding.classification,
    context.finding.stage,
    statement,
  );
  if (refusal !== null) return { status: refusal };
  const reason = required(draft.reason, CERTIFICATION_LIMITS.reason);
  return reason === undefined
    ? { status: 'reasonRequired' }
    : { status: 'valid', statement, reason };
}

/**
 * Mirrors the server: another classification allowed in the Stage, held to
 * the rules for the current statement, with its reason.
 */
export function classificationFromDraft(
  draft: ClassificationDraft,
  finding: Finding,
): ClassificationCheck {
  const reason = required(draft.reason, CERTIFICATION_LIMITS.reason);
  const classification = draft.classification;
  if (
    classification === null ||
    !stageClassifications(finding.stage).includes(classification) ||
    reason === undefined
  )
    return { status: 'incomplete' };
  if (classification === finding.classification) return { status: 'unchanged' };
  const refusal = classificationRefusal(
    classification,
    finding.stage,
    finding.statement,
  );
  return refusal === null
    ? { status: 'valid', classification, reason }
    : { status: refusal };
}

/**
 * Mirrors the server: the correction, cause and corrective action within
 * their limits, the date received, an optional planned completion date and
 * at most ten attachments of the Case.
 */
export function responseFromDraft(
  draft: ResponseDraft,
  register: readonly CertificationAttachment[],
): FollowUpCheck<NonconformityResponse> {
  const correction = required(draft.correction, FINDING_LIMITS.responseText);
  const cause = required(draft.cause, FINDING_LIMITS.responseText);
  const correctiveAction = required(
    draft.correctiveAction,
    FINDING_LIMITS.responseText,
  );
  const receivedOn = draft.receivedOn.trim();
  const plannedCompletionOn = draft.plannedCompletionOn.trim();
  const evidence = evidenceFrom(draft.evidenceAttachmentIds, register);
  if (
    correction === undefined ||
    cause === undefined ||
    correctiveAction === undefined ||
    !isCalendarDate(receivedOn) ||
    (plannedCompletionOn !== '' && !isCalendarDate(plannedCompletionOn)) ||
    !evidence
  )
    return { status: 'incomplete' };
  return {
    status: 'valid',
    value: {
      correction,
      cause,
      correctiveAction,
      receivedOn,
      plannedCompletionOn: plannedCompletionOn || null,
      evidenceAttachmentIds: evidence,
    },
  };
}

/** Mirrors the server: an explicit outcome and the note that explains it. */
export function judgmentFromDraft(
  draft: PlanJudgmentDraft,
): FollowUpCheck<PlanJudgment> {
  const note = required(draft.note, FINDING_LIMITS.note);
  return draft.outcome === null || note === undefined
    ? { status: 'incomplete' }
    : { status: 'valid', value: { outcome: draft.outcome, note } };
}

/**
 * Mirrors the server: the verification date, an explicit method and
 * outcome, the note and at most ten attachments of the Case.
 */
export function verificationFromDraft(
  draft: VerificationDraft,
  register: readonly CertificationAttachment[],
): FollowUpCheck<NonconformityVerification> {
  const verifiedOn = draft.verifiedOn.trim();
  const note = required(draft.note, FINDING_LIMITS.note);
  const evidence = evidenceFrom(draft.evidenceAttachmentIds, register);
  const { method, outcome } = draft;
  if (
    !isCalendarDate(verifiedOn) ||
    method === null ||
    outcome === null ||
    note === undefined ||
    !evidence
  )
    return { status: 'incomplete' };
  return {
    status: 'valid',
    value: {
      verifiedOn,
      method,
      outcome,
      note,
      evidenceAttachmentIds: evidence,
    },
  };
}

/** The typed statement, an empty clause or area sent as absent. */
function statementFromDraft(
  draft: FindingStatementDraft,
  register: readonly CertificationAttachment[],
): FindingStatement | undefined {
  const clause = draft.clause.trim();
  const area = draft.area.trim();
  const statement = required(draft.statement, FINDING_LIMITS.statement);
  const evidence = evidenceFrom(draft.evidenceAttachmentIds, register);
  if (
    clause.length > FINDING_LIMITS.clause ||
    area.length > FINDING_LIMITS.area ||
    statement === undefined ||
    !evidence
  )
    return undefined;
  return {
    clause: clause || null,
    area: area || null,
    statement,
    evidenceAttachmentIds: evidence,
  };
}

/** At most ten distinct attachments of this Case, in register order. */
function evidenceFrom(
  chosen: readonly string[],
  register: readonly CertificationAttachment[],
): string[] | undefined {
  if (
    chosen.length > FINDING_LIMITS.evidence ||
    new Set(chosen).size !== chosen.length ||
    !chosen.every((id) => register.some((item) => item.id === id))
  )
    return undefined;
  return register.flatMap((item) =>
    chosen.includes(item.id) ? [item.id] : [],
  );
}

function required(value: string, limit: number): string | undefined {
  const trimmed = value.trim();
  return trimmed && trimmed.length <= limit ? trimmed : undefined;
}
