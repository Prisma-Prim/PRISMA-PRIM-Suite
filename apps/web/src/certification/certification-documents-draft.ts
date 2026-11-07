import {
  CERTIFICATION_LIMITS,
  isCalendarDate,
  sourceKey,
  type AgreementVersion,
  type CertificationAgreement,
  type CertificationAttachment,
  type CertificationDocumentRole,
  type EligibleDocument,
} from './certification-response';

/** The attach form as typed: a chosen eligible source, its role and a note. */
export interface AttachDraft {
  /** The `sourceKey` of the chosen eligible PDF, or empty. */
  source: string;
  /** No default: the role is chosen explicitly. */
  role: CertificationDocumentRole | null;
  note: string;
}

export interface AttachInput {
  role: CertificationDocumentRole;
  documentId: string;
  versionId: string;
  representationId: string;
  note: string | null;
}

/** The agreement form as typed. */
export interface AgreementDraft {
  signedOn: string;
  attachmentId: string;
  reason: string;
}

export type AgreementCheck =
  | {
      status: 'valid';
      agreement: CertificationAgreement;
      /** Null for a first agreement; a correction states its reason. */
      reason: string | null;
    }
  | { status: 'incomplete' | 'future' | 'reasonRequired' };

export function emptyAttachDraft(): AttachDraft {
  return { source: '', role: null, note: '' };
}

/** A correction starts from the recorded agreement's exact values. */
export function agreementDraftFor(
  current: AgreementVersion | null,
): AgreementDraft {
  return current
    ? {
        signedOn: current.value.signedOn,
        attachmentId: current.value.attachmentId,
        reason: '',
      }
    : { signedOn: '', attachmentId: '', reason: '' };
}

/** Whether this exact PDF is already in the Case's register. */
export function alreadyAttached(
  source: EligibleDocument,
  register: readonly CertificationAttachment[],
): boolean {
  const key = sourceKey(source);
  return register.some((item) => sourceKey(item) === key);
}

/**
 * Mirrors the server: one listed PDF not attached yet, a role and an
 * optional note within its limit. Undefined when the draft is incomplete.
 */
export function attachFromDraft(
  draft: AttachDraft,
  {
    eligible,
    register,
  }: {
    eligible: readonly EligibleDocument[];
    register: readonly CertificationAttachment[];
  },
): AttachInput | undefined {
  const source = eligible.find((item) => sourceKey(item) === draft.source);
  const note = draft.note.trim();
  if (
    !source ||
    alreadyAttached(source, register) ||
    draft.role === null ||
    note.length > CERTIFICATION_LIMITS.attachmentNote
  )
    return undefined;
  return {
    role: draft.role,
    documentId: source.documentId,
    versionId: source.versionId,
    representationId: source.representationId,
    note: note || null,
  };
}

/** The attachments an agreement may refer to: those with the agreement role. */
export function agreementAttachments(
  register: readonly CertificationAttachment[],
): CertificationAttachment[] {
  return register.filter((item) => item.role === 'agreement');
}

/**
 * Mirrors the server: a real date not after today (the server's UTC day),
 * an attachment with the agreement role and, for a correction, a reason.
 */
export function agreementFromDraft(
  draft: AgreementDraft,
  {
    register,
    correcting,
    today,
  }: {
    register: readonly CertificationAttachment[];
    correcting: boolean;
    today: string;
  },
): AgreementCheck {
  const signedOn = draft.signedOn.trim();
  if (
    !isCalendarDate(signedOn) ||
    !agreementAttachments(register).some(
      (item) => item.id === draft.attachmentId,
    )
  )
    return { status: 'incomplete' };
  // ISO calendar dates compare in calendar order.
  if (signedOn > today) return { status: 'future' };
  const agreement = { signedOn, attachmentId: draft.attachmentId };
  if (!correcting) return { status: 'valid', agreement, reason: null };
  const reason = draft.reason.trim();
  return reason && reason.length <= CERTIFICATION_LIMITS.reason
    ? { status: 'valid', agreement, reason }
    : { status: 'reasonRequired' };
}

/** Today in UTC, the calendar the server checks signature dates against. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
