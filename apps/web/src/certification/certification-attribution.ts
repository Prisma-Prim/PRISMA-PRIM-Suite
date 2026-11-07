import {
  isCalendarDate,
  type CertificationAttachment,
} from './certification-response';

/**
 * An act performed by the certification body's own staff and recorded by a
 * member of the representative Company: who acted, in which function, on
 * which business date, and the signed form when it is attached to the Case.
 * The recording member stays attributed on the version itself.
 */
export interface ActAttribution {
  actedBy: string;
  actedByFunction: string;
  /** A calendar date, `YYYY-MM-DD`. */
  actedOn: string;
  formAttachmentId: string | null;
}

/** The server's bounds for the person acting and their function. */
export const ATTRIBUTION_LIMITS = { person: 200 } as const;

/**
 * The act as typed: recorded on behalf of the certification body only once
 * the member says so; the signed form is optional.
 */
export interface ActingDraft {
  onBehalf: boolean;
  actedBy: string;
  actedByFunction: string;
  actedOn: string;
  /** Empty when no signed form is cited. */
  formAttachmentId: string;
}

/** A first record starts as the member's own act. */
export function emptyActingDraft(): ActingDraft {
  return {
    onBehalf: false,
    actedBy: '',
    actedByFunction: '',
    actedOn: '',
    formAttachmentId: '',
  };
}

/** A correction starts from the act the latest version records. */
export function actingDraftFor(current: ActAttribution | null): ActingDraft {
  return current
    ? {
        onBehalf: true,
        actedBy: current.actedBy,
        actedByFunction: current.actedByFunction,
        actedOn: current.actedOn,
        formAttachmentId: current.formAttachmentId ?? '',
      }
    : emptyActingDraft();
}

/**
 * Mirrors the server: no attribution, or a name and function within their
 * limits, a real business date and, optionally, a signed form attached to
 * this Case under any role. Undefined when the draft is incomplete.
 */
export function actingFromDraft(
  draft: ActingDraft,
  documents: readonly CertificationAttachment[],
): ActAttribution | null | undefined {
  if (!draft.onBehalf) return null;
  const actedBy = required(draft.actedBy);
  const actedByFunction = required(draft.actedByFunction);
  const actedOn = draft.actedOn.trim();
  const form = draft.formAttachmentId;
  if (
    actedBy === undefined ||
    actedByFunction === undefined ||
    !isCalendarDate(actedOn) ||
    (form !== '' && !documents.some((item) => item.id === form))
  )
    return undefined;
  return {
    actedBy,
    actedByFunction,
    actedOn,
    formAttachmentId: form || null,
  };
}

/**
 * The latest calendar date that is already today somewhere (UTC+14), as the
 * server bounds business dates: a date entered in the user's time zone is
 * never refused as future, and the server stays authoritative.
 */
export function latestBusinessDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 14 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** Names compared as the server compares them: without case, accents or repeated spaces. */
export function sameName(left: string, right: string): boolean {
  return normalName(left) === normalName(right);
}

function normalName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en');
}

function required(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed && trimmed.length <= ATTRIBUTION_LIMITS.person
    ? trimmed
    : undefined;
}
